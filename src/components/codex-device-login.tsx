"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cancelDeviceLogin, pollDeviceLogin, startDeviceLogin } from "@/app/(app)/settings/ai/codex-actions";
import type { CodexLogin } from "@/lib/codex";

export function CodexDeviceLogin({ initialLogin = null }: { initialLogin?: CodexLogin | null }) {
  const router = useRouter();
  const [login, setLogin] = useState(initialLogin?.status === "pending" ? initialLogin : null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!login) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await pollDeviceLogin();
        if (stopped) return;
        if (result.active) { setLogin(null); router.refresh(); return; }
        if (["failed", "expired", "missing", "superseded"].includes(result.status ?? "")) {
          setLogin(null); setError("Die Anmeldung wurde nicht abgeschlossen. Bitte einen neuen Code anfordern."); return;
        }
        setError(result.error);
      } catch { if (!stopped) setError("Status konnte nicht geladen werden. Die Anmeldung wird erneut geprüft."); }
      if (!stopped) timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 3000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [login, router]);

  async function start() {
    setBusy(true); setError(undefined);
    try {
      const result = await startDeviceLogin(consent);
      setError(result.error);
      if (result.login) setLogin(result.login);
    } catch { setError("Anmeldung konnte nicht gestartet werden. Bitte erneut versuchen."); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!login) return;
    setBusy(true);
    try {
      const result = await cancelDeviceLogin(login.loginId);
      setError(result.error);
      if (!result.error) setLogin(null);
    } catch { setError("Anmeldung konnte nicht abgebrochen werden."); }
    finally { setBusy(false); }
  }

  return <div className="mt-4 space-y-4">
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {login ? <>
      <p className="text-sm">Öffne die OpenAI-Anmeldeseite, melde dich mit deinem Codex-Konto an und gib diesen Einmalcode ein:</p>
      <p className="rounded-lg bg-slate-100 p-4 text-center font-mono text-2xl tracking-widest">{login.userCode}</p>
      <a className="btn-primary" href={login.verificationUrl} target="_blank" rel="noreferrer">Bei OpenAI bestätigen</a>
      <p role="status" className="text-sm text-slate-600">Warte auf die Bestätigung … Diese Seite erkennt die Anmeldung automatisch.</p>
      <button type="button" className="btn-secondary" disabled={busy} onClick={cancel}>Abbrechen</button>
    </> : <>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4" /><span>Dieses Codex-Konto und sein Kontingent für alle Benutzer und Mandanten verwenden.</span></label>
      <button type="button" className="btn-primary" disabled={busy || !consent} onClick={start}>{busy ? "Code wird angefordert …" : "Codex per Device Code verbinden"}</button>
    </>}
  </div>;
}
