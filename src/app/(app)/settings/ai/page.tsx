import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { chatgptHostId, chatgptSession, listChatgptModels } from "@/lib/chatgpt";
import { CHATGPT_USAGE_URL } from "@/lib/chatgpt-protocol";
import { Card, PageHeader } from "@/components/ui";
import { SettingsNav } from "@/components/settings-nav";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { disconnectConnection, importConnection, selectConnection } from "./actions";

export const metadata = { title: "KI & ChatGPT" };

export default async function AiSettingsPage() {
  const ctx = await requireCtx();
  await chatgptHostId(); // Stable VM identity, independent of imported laptop identities.
  const profiles = await db.chatgptProfile.findMany({ where: { userId: ctx.user.id }, orderBy: { createdAt: "asc" }, select: { id: true, email: true, clientId: true, active: true, model: true, credentials: true } });
  const entries = await Promise.all(profiles.map(async (profile) => {
    let models: { slug: string; display_name: string }[] = [];
    let error: string | undefined;
    if (profile.credentials) {
      try {
        const session = await chatgptSession(ctx.user.id, profile.id);
        models = await listChatgptModels(session.credentials.access_token);
      } catch { error = "Verbindung gerade nicht verfügbar. Bitte erneut laden oder erneut anmelden."; }
    }
    return { ...profile, credentials: undefined, connected: Boolean(profile.credentials), models, error };
  }));
  const active = entries.find((p) => p.active && p.connected);
  return (
    <>
      <PageHeader title="KI & ChatGPT" subtitle="Dein persönliches Abo für das Auslesen von Fahrzeugdaten und Belegen verwenden." />
      <SettingsNav active="ai" driver={ctx.role === "DRIVER"} fleet={ctx.org.moduleFleet} />
      <div className="space-y-6">
        <Card title="ChatGPT-Abo verwenden">
          <p className="text-sm text-slate-600">Berechtigte ChatGPT Plus-/Pro-Konten können die Erkennung über ihr Abo nutzen. Es gelten die Limits und gegebenenfalls das freigegebene Guthaben deines ChatGPT-Kontos. Die Verbindung gilt nur für dich; jedes Teammitglied verbindet sein eigenes Konto.</p>
          <p className="mt-3 text-sm text-slate-600">Zum Auslesen werden die ausgewählten Fotos und PDFs an OpenAI übertragen. Die Anmeldung gibt dieser Software keinen Zugriff auf deine ChatGPT-Unterhaltungen.</p>
          <p className="mt-3 text-sm font-medium">{active ? `ChatGPT-Abo wird verwendet: ${active.email}` : "Kein ChatGPT-Abo verbunden. Es gilt die bisherige Erkennung über den Server (KI oder lokale OCR)."}</p>
          <a href={CHATGPT_USAGE_URL} target="_blank" rel="noreferrer" className="btn-secondary mt-3">Nutzung verwalten</a>
          {active && <p className="mt-3 text-sm text-slate-600">Bei einem Abo-Limit wird keine kostenpflichtige API als Ersatz aufgerufen. Du kannst die Werte weiterhin manuell eintragen.</p>}
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
              <label className="flex items-start gap-2 text-sm font-normal"><input name="consent" type="checkbox" required className="mt-1 h-4 w-4" /><span>Ich möchte mein ChatGPT-Abo verwenden und die ausgewählten Fotos und Belege zum Auslesen an OpenAI übertragen.</span></label>
              <SubmitButton>Mit ChatGPT verbinden</SubmitButton>
            </ActionForm>
          </details>
        </Card>
        {entries.map((profile, i) => (
          <Card key={profile.id} title={`Verbindung ${i + 1} · ${profile.email}`}>
            <p className="mb-3 text-sm">{profile.active && profile.connected ? "Aktiv – dein ChatGPT-Abo wird verwendet." : profile.connected ? "Verbunden – derzeit nicht ausgewählt." : "Getrennt – erneut anmelden, um diese Verbindung zu verwenden."}</p>
            {profile.error && <p className="mb-3 text-sm text-amber-800">{profile.error}</p>}
            {!!profile.models.length && (
              <ActionForm action={selectConnection} className="mb-4 flex flex-wrap items-end gap-3">
                <input type="hidden" name="profileId" value={profile.id} />
                <label>Modell<select name="model" defaultValue={profile.model ?? profile.models[0].slug} className="input mt-1">{profile.models.map((model) => <option key={model.slug} value={model.slug}>{model.display_name}</option>)}</select></label>
                <SubmitButton>Konto & Modell verwenden</SubmitButton>
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
