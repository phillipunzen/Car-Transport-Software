"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { createTrackingLink, revokeTrackingLink } from "@/app/(app)/orders/tracking-actions";

/** Status-Link: erstellen, kopieren, teilen (Share-Sheet, WhatsApp, E-Mail) und wieder deaktivieren. */
export function TrackingLink({ orderId, url, email, text }: { orderId: string; url: string | null; email: string | null; text: string }) {
  const [copied, setCopied] = useState(false);
  if (!url) {
    return (
      <form action={createTrackingLink}>
        <input type="hidden" name="orderId" value={orderId} />
        <p className="mb-3 text-sm text-slate-600">Der Kunde sieht über einen Link jederzeit, ob sein Fahrzeug abgeholt oder zugestellt wurde – ohne Anmeldung.</p>
        <SubmitButton className="btn-secondary w-full">🔗 Status-Link erstellen</SubmitButton>
      </form>
    );
  }
  const message = `${text}\n${url}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Link kopieren:", url);
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Status Ihrer Fahrzeugüberführung", text, url });
      } catch {
        /* abgebrochen */
      }
    } else copy();
  };
  return (
    <div className="space-y-3">
      <input readOnly value={url} onFocus={(e) => e.target.select()} className="input font-mono text-xs" aria-label="Status-Link" />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={copy} className="btn-secondary">
          {copied ? "✓ Kopiert" : "Kopieren"}
        </button>
        <button type="button" onClick={share} className="btn-secondary">
          Teilen
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="btn-secondary">
          WhatsApp
        </a>
        <a href={`mailto:${encodeURIComponent(email ?? "")}?subject=${encodeURIComponent("Status Ihrer Fahrzeugüberführung")}&body=${encodeURIComponent(message)}`} className="btn-secondary">
          E-Mail
        </a>
      </div>
      <form action={revokeTrackingLink} className="text-right">
        <input type="hidden" name="orderId" value={orderId} />
        <SubmitButton className="text-xs text-slate-500 underline" confirm="Link deaktivieren? Der bisherige Link funktioniert dann nicht mehr.">
          Link deaktivieren
        </SubmitButton>
      </form>
    </div>
  );
}
