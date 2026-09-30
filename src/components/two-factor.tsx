"use client";

import { useActionState, useState, useTransition } from "react";
import { confirmTwoFactor, disableTwoFactor, newCodes, startTwoFactor, type TwoFactorState } from "@/app/(app)/settings/security/actions";

function Codes({ codes }: { codes: string[] }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">Wiederherstellungscodes – jetzt sicher aufbewahren!</p>
      <p className="mt-1 text-xs text-amber-800">Jeder Code funktioniert einmal, falls das Handy verloren geht. Sie werden nur jetzt angezeigt.</p>
      <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <button type="button" className="btn-secondary mt-3" onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}>
        Kopieren
      </button>
    </div>
  );
}

export function TwoFactor({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<TwoFactorState>(undefined);
  const [pending, start] = useTransition();
  const [confirmState, confirm, confirming] = useActionState(confirmTwoFactor, undefined);
  const [disableState, disable, disabling] = useActionState(disableTwoFactor, undefined);
  const [codesState, regenerate, regenerating] = useActionState(newCodes, undefined);
  const qr = confirmState?.qr || setup?.qr;
  const secret = confirmState?.secret || setup?.secret;

  if (confirmState?.codes) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-emerald-700">✓ {confirmState.ok}</p>
        <Codes codes={confirmState.codes} />
      </div>
    );
  }

  if (enabled) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium text-emerald-700">✓ Aktiv – bei der Anmeldung wird zusätzlich ein Code aus der App abgefragt.</p>
        {codesState?.codes && <Codes codes={codesState.codes} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <form action={regenerate} className="space-y-2">
            <label htmlFor="code-new">Neue Wiederherstellungscodes</label>
            <input id="code-new" name="code" inputMode="numeric" placeholder="Code aus der App" className="input" />
            {codesState?.error && <p className="text-xs text-red-600">{codesState.error}</p>}
            <button className="btn-secondary" disabled={regenerating}>
              Erstellen
            </button>
          </form>
          <form action={disable} className="space-y-2">
            <label htmlFor="code-off">Abschalten</label>
            <input id="code-off" name="code" inputMode="numeric" placeholder="Code aus der App" className="input" />
            {disableState?.error && <p className="text-xs text-red-600">{disableState.error}</p>}
            {disableState?.ok && <p className="text-xs text-emerald-700">{disableState.ok}</p>}
            <button className="btn-secondary text-red-600" disabled={disabling}>
              Zwei-Faktor abschalten
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!qr) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Schützt das Konto zusätzlich zum Passwort: Bei der Anmeldung wird ein 6-stelliger Code aus einer Authenticator-App abgefragt (z. B. Google Authenticator, Microsoft Authenticator,
          1Password oder die iPhone-Passwörter-App).
        </p>
        {disableState?.ok && <p className="text-sm text-emerald-700">{disableState.ok}</p>}
        <button type="button" className="btn-primary" disabled={pending} onClick={() => start(async () => setSetup(await startTwoFactor()))}>
          {pending ? "…" : "Zwei-Faktor einrichten"}
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR-Code für die Authenticator-App" className="mx-auto h-48 w-48 rounded border border-slate-200" />
        <p className="mt-2 break-all font-mono text-xs text-slate-500">{secret?.replace(/(.{4})/g, "$1 ")}</p>
      </div>
      <form action={confirm} className="space-y-3">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Authenticator-App öffnen und „Konto hinzufügen“ / „QR-Code scannen“ wählen.</li>
          <li>QR-Code scannen – oder am Handy den Schlüssel darunter eingeben.</li>
          <li>Den angezeigten 6-stelligen Code hier eintragen.</li>
        </ol>
        <input type="hidden" name="qr" value={qr} />
        <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" required className="input max-w-[12rem] text-center font-mono text-lg tracking-widest" />
        {confirmState?.error && <p className="text-sm text-red-600">{confirmState.error}</p>}
        <button className="btn-primary" disabled={confirming}>
          Bestätigen & aktivieren
        </button>
      </form>
    </div>
  );
}
