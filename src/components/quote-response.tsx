"use client";

import { useActionState, useState } from "react";
import { acceptQuoteOnline, declineQuoteOnline } from "@/app/q/actions";

export function QuoteResponse({ token, total }: { token: string; total: string }) {
  const [acc, accept, accepting] = useActionState(acceptQuoteOnline, undefined);
  const [dec, decline, declining] = useActionState(declineQuoteOnline, undefined);
  const [mode, setMode] = useState<"accept" | "decline">("accept");
  const done = acc?.ok ?? dec?.ok;
  if (done) {
    return (
      <div className="card card-body text-center">
        <p className="text-4xl">{acc?.ok ? "✓" : "👋"}</p>
        <p className="mt-2 text-lg font-semibold">{done}</p>
      </div>
    );
  }
  return (
    <div className="card card-body space-y-4">
      {mode === "accept" ? (
        <form action={accept} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <h2 className="text-lg font-semibold">Angebot annehmen</h2>
          <div>
            <label htmlFor="name">Ihr Name</label>
            <input id="name" name="name" required autoComplete="name" className="input" />
          </div>
          <div>
            <label htmlFor="note">Hinweise (optional)</label>
            <textarea id="note" name="note" rows={2} className="input" placeholder="z. B. Wunschtermin, Ansprechpartner vor Ort" />
          </div>
          <label className="flex items-start gap-2 text-sm font-normal">
            <input type="checkbox" name="confirm" required className="mt-0.5 h-4 w-4 accent-brand-600" />
            <span>Ich beauftrage die Überführung zu den Bedingungen dieses Angebots ({total}).</span>
          </label>
          {acc?.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{acc.error}</p>}
          <button className="btn-primary w-full py-3 text-base" disabled={accepting}>
            {accepting ? "Wird gesendet…" : "Verbindlich beauftragen"}
          </button>
          <button type="button" className="w-full text-sm text-slate-500 underline" onClick={() => setMode("decline")}>
            Angebot ablehnen
          </button>
        </form>
      ) : (
        <form action={decline} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <h2 className="text-lg font-semibold">Angebot ablehnen</h2>
          <textarea name="reason" rows={3} className="input" placeholder="Möchten Sie uns einen Grund nennen? (optional)" />
          {dec?.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{dec.error}</p>}
          <button className="btn-secondary w-full" disabled={declining}>
            Ablehnen
          </button>
          <button type="button" className="w-full text-sm text-slate-500 underline" onClick={() => setMode("accept")}>
            Zurück
          </button>
        </form>
      )}
    </div>
  );
}
