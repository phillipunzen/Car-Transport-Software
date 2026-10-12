import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { canManageAppAi } from "@/lib/chatgpt-admin";
import { chatgptHostId, chatgptSession, listChatgptModels } from "@/lib/chatgpt";
import { CHATGPT_USAGE_URL } from "@/lib/chatgpt-protocol";
import { Card, PageHeader } from "@/components/ui";
import { SettingsNav } from "@/components/settings-nav";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { disconnectConnection, importConnection, selectConnection, sharePersonalConnection } from "./actions";
import { codexConfigured, completeCodexLogin, type CodexStatus } from "@/lib/codex";
import { CodexDeviceLogin } from "@/components/codex-device-login";
import { disconnectCodexConnection, selectCodexModel } from "./codex-actions";

export const metadata = { title: "KI, Codex & ChatGPT" };

export default async function AiSettingsPage() {
  const ctx = await requireCtx();
  const editable = await canManageAppAi(ctx.user);
  if (editable) await chatgptHostId();
  let codex: CodexStatus | null = null;
  let codexError: string | undefined;
  if (editable && codexConfigured()) {
    try { codex = await completeCodexLogin(); }
    catch { codexError = "Codex-Dienst gerade nicht erreichbar. Bitte die Serververbindung prüfen."; }
  }
  const host = await db.chatgptHost.findUnique({ where: { id: "runtime" }, select: { aiProvider: true, codexModel: true, activeProfileId: true, activeProfile: { select: { credentials: true, model: true } } } });
  const active = host?.aiProvider !== "codex" && Boolean(host?.activeProfile?.credentials);
  const codexActive = host?.aiProvider === "codex";
  // Ordinary users receive status only; account identity, registrations and credentials stay private.
  const profiles = editable ? await db.chatgptAppProfile.findMany({ orderBy: { createdAt: "asc" } }) : [];
  const personal = editable ? await db.chatgptProfile.findMany({ where: { userId: ctx.user.id, credentials: { not: null } }, select: { id: true, email: true } }) : [];
  const entries = await Promise.all(profiles.map(async (profile) => {
    let models: { slug: string; display_name: string }[] = [];
    let error: string | undefined;
    if (profile.credentials) {
      try {
        const session = await chatgptSession(profile.id);
        models = await listChatgptModels(session.credentials.access_token);
      } catch { error = "Verbindung gerade nicht verfügbar. Bitte erneut laden oder erneut anmelden."; }
    }
    return { ...profile, credentials: undefined, connected: Boolean(profile.credentials), models, error };
  }));
  return (
    <>
      <PageHeader title="KI, Codex & ChatGPT" subtitle="Gemeinsame KI für Fahrzeugfotos, Kfz-Scheine und Belege in der ganzen App." />
      <SettingsNav active="ai" driver={ctx.role === "DRIVER"} fleet={ctx.org.moduleFleet} />
      <div className="space-y-6">
        <Card title="Codex per Device Code">
          <p className="text-sm text-slate-600">Ein Codex-Konto für Fahrzeugbilder, Kfz-Scheine und Belege in allen Mandanten. Alle Benutzer teilen das Kontingent des verbundenen Kontos. Die Anmeldung bestätigst du direkt bei OpenAI mit einem Einmalcode.</p>
          <p className="mt-3 text-sm font-medium">{codexActive ? `Codex ist für die ganze App ausgewählt. Modell: ${host.codexModel ?? "bitte auswählen"}` : "Codex ist derzeit nicht für die Erkennung ausgewählt."}</p>
          <p className="mt-3 text-sm text-slate-600">Bei einem Limit oder Verbindungsfehler bleibt die Eingabe manuell möglich. Es wird keine kostenpflichtige API als Ersatz aufgerufen.</p>
          {!editable && <p className="mt-3 text-sm text-slate-600">Die Anmeldung und Modellauswahl übernimmt der App-Administrator.</p>}
          {editable && <>
            {codexError && <p className="mt-3 text-sm text-amber-800">{codexError}</p>}
            {!codexConfigured() && <p className="mt-3 text-sm text-amber-800">Für die Anmeldung fehlt ein gültiger Server-Schlüssel. Bitte die App-Konfiguration prüfen.</p>}
              {codex?.connected && <>
                <p className="mt-3 text-sm">Verbunden: {codex.email ?? "ChatGPT-Konto"} · {codex.planType}</p>
                {!!codex.models.length && <ActionForm action={selectCodexModel} className="mt-4 flex flex-wrap items-end gap-3">
                  <label>Modell<select name="model" defaultValue={host?.codexModel ?? (codex.models.find((m) => m.isDefault) ?? codex.models[0]).model} className="input mt-1">{codex.models.map((m) => <option key={m.model} value={m.model}>{m.displayName}</option>)}</select></label>
                  <SubmitButton>Codex für alle verwenden</SubmitButton>
                </ActionForm>}
                <ActionForm action={disconnectCodexConnection} className="mt-4"><SubmitButton className="btn-secondary">Codex abmelden</SubmitButton></ActionForm>
              </>}
              <CodexDeviceLogin initialLogin={codex?.login} />
              <p className="mt-3 text-xs text-slate-500">Falls OpenAI die Anmeldung ablehnt: Device-Code-Anmeldung in den ChatGPT-Sicherheitseinstellungen oder Workspace-Berechtigungen aktivieren.</p>
          </>}
        </Card>
        <Card title="Zentrale ChatGPT-Verbindung">
          <p className="text-sm text-slate-600">Eine zentral eingerichtete Verbindung wird für alle Benutzer und alle Mandanten verwendet. Jeder kann seine berechtigten Fahrzeugfotos, Kfz-Scheine und Belege auslesen lassen; eine eigene ChatGPT-Anmeldung ist dafür nicht nötig. Alle Anfragen teilen die Limits und gegebenenfalls das freigegebene Guthaben des verbundenen Kontos.</p>
          <p className="mt-3 text-sm text-slate-600">Zum Auslesen werden nur die jeweils ausgewählten Fotos und PDFs an OpenAI übertragen. Aufträge und Dokumente bleiben durch die bestehenden Mandantenrechte geschützt.</p>
          <p className="mt-3 text-sm font-medium">{active ? `Zentrale ChatGPT-Erkennung ist aktiv.${host?.activeProfile?.model ? ` Modell: ${host.activeProfile.model}` : ""}` : codexActive ? "Für die Erkennung ist Codex ausgewählt." : "Keine zentrale ChatGPT-Verbindung aktiv. Es gilt die Erkennung über den Server (Claude oder lokale OCR)."}</p>
          {active && <p className="mt-3 text-sm text-slate-600">Bei einem Nutzungslimit wird keine kostenpflichtige API als Ersatz aufgerufen. Du kannst die Werte weiterhin manuell eintragen.</p>}
          {!editable && <p className="mt-3 text-sm text-slate-600">Die Einrichtung, Modellauswahl und Verwaltung übernimmt der App-Administrator.</p>}
          {editable && <>
            <p className="mt-3 text-sm text-slate-600">Du verwaltest diese Verbindung als App-Administrator. Änderungen wirken für die gesamte App und alle Mandanten.</p>
            <a href={CHATGPT_USAGE_URL} target="_blank" rel="noreferrer" className="btn-secondary mt-3">Nutzung verwalten</a>
            <details className="mt-5 rounded-lg border border-slate-200 p-4">
              <summary className="cursor-pointer font-medium">Continue with ChatGPT</summary>
              <p className="mt-3 text-sm text-slate-600">Für die Anmeldung am selbst gehosteten Server benötigst du einmalig einen Rechner mit Node.js 20 oder neuer. Danach erneuert der Server die Verbindung automatisch.</p>
              <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">
                <li><a href="/chatgpt-login.mjs" download className="text-brand-700 underline">Anmeldeprogramm herunterladen</a> und auf deinem Rechner speichern.</li>
                <li>Im Ordner der Datei ausführen: <code className="rounded bg-slate-100 px-1">node chatgpt-login.mjs</code>. Im geöffneten Browser mit ChatGPT anmelden und die Abo-Nutzung erlauben.</li>
                <li>Die erzeugte Datei <code>chatgpt-connection.json</code> unten importieren. Danach die Datei auf deinem Rechner löschen.</li>
              </ol>
              <p className="mt-3 text-xs text-slate-500">Für ein weiteres Konto: <code>node chatgpt-login.mjs --new-account</code>. Für eine gespeicherte Verbindung die unten angezeigte Anmeldung verwenden.</p>
              <ActionForm action={importConnection} resetOnSuccess className="mt-4 space-y-3">
                <label className="block">Verbindungsdatei<input name="connection" type="file" accept=".json,application/json" required className="input mt-1" /></label>
                <label className="flex items-start gap-2 text-sm font-normal"><input name="consent" type="checkbox" required className="mt-1 h-4 w-4" /><span>Ich möchte diese Verbindung für alle Benutzer und Mandanten freigeben. Die jeweils ausgewählten Fotos und Belege werden zum Auslesen an OpenAI übertragen und verbrauchen das Kontingent des verbundenen Kontos.</span></label>
                <SubmitButton>Für die ganze App verbinden</SubmitButton>
              </ActionForm>
            </details>
          </>}
        </Card>
        {personal.map((profile) => <Card key={profile.id} title={`Bisherige persönliche Verbindung · ${profile.email}`}>
          <p className="mb-3 text-sm text-slate-600">Diese Verbindung wird nach der Umstellung erst verwendet, wenn du sie ausdrücklich für die ganze App übernimmst.</p>
          <ActionForm action={sharePersonalConnection}>
            <input name="profileId" type="hidden" value={profile.id} />
            <label className="flex items-start gap-2 text-sm font-normal"><input name="consent" type="checkbox" required className="mt-1 h-4 w-4" /><span>Diese Verbindung und ihr Nutzungskontingent für alle Benutzer und Mandanten verwenden.</span></label>
            <SubmitButton>Für die ganze App übernehmen</SubmitButton>
          </ActionForm>
        </Card>)}
        {entries.map((profile, i) => (
          <Card key={profile.id} title={`App-Verbindung ${i + 1} · ${profile.email}`}>
            <p className="mb-3 text-sm">{active && host?.activeProfileId === profile.id && profile.connected ? "Aktiv für alle Benutzer und Mandanten." : profile.connected ? "Verbunden – derzeit nicht ausgewählt." : "Getrennt – erneut anmelden, um diese Verbindung zu verwenden."}</p>
            {profile.error && <p className="mb-3 text-sm text-amber-800">{profile.error}</p>}
            {!!profile.models.length && (
              <ActionForm action={selectConnection} className="mb-4 flex flex-wrap items-end gap-3">
                <input type="hidden" name="profileId" value={profile.id} />
                <label>Modell<select name="model" defaultValue={profile.model ?? profile.models[0].slug} className="input mt-1">{profile.models.map((model) => <option key={model.slug} value={model.slug}>{model.display_name}</option>)}</select></label>
                <SubmitButton>Für alle verwenden</SubmitButton>
              </ActionForm>
            )}
            <p className="text-xs text-slate-500">Erneut anmelden: <code className="break-all">node chatgpt-login.mjs --client-id {profile.clientId}</code>. Danach die neue Verbindungsdatei importieren.</p>
            {profile.connected && <ActionForm action={disconnectConnection} className="mt-3"><input type="hidden" name="profileId" value={profile.id} /><SubmitButton className="btn-secondary">Verbindung trennen</SubmitButton></ActionForm>}
          </Card>
        ))}
      </div>
    </>
  );
}
