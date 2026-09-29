"use client";

import { useEffect, useState } from "react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { sendDocumentsEmail } from "@/app/(app)/orders/email-actions";

export type EmailDoc = {
  key: "PICKUP" | "DELIVERY" | "INVOICE";
  label: string;
  available: boolean; // z. B. Protokoll abgeschlossen / Rechnung festgeschrieben
  hint?: string; // Grund, falls nicht verfügbar
  checked: boolean;
  downloadUrl: string;
};

/** Button + Dialog: Protokolle/Rechnung als PDF-Anhang an den Kunden senden. */
export function EmailDocuments({
  label = "✉️ Per E-Mail senden",
  className = "btn-secondary",
  orderId,
  invoiceId,
  to,
  subject,
  message,
  docs,
  mailEnabled,
}: {
  label?: string;
  className?: string;
  orderId?: string | null;
  invoiceId?: string | null;
  to: string;
  subject: string;
  message: string;
  docs: EmailDoc[];
  mailEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const available = docs.filter((d) => d.available);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;

  return (
    <>
      <button type="button" className={className} disabled={available.length === 0} onClick={() => { setSent(false); setOpen(true); }}>
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Dokumente per E-Mail senden"
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Dokumente per E-Mail senden</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-2xl leading-none text-slate-400 hover:text-slate-700" aria-label="Schließen">
                ×
              </button>
            </div>

            {mailEnabled ? (
              <ActionForm action={sendDocumentsEmail} onSuccess={() => setSent(true)}>
                {orderId && <input type="hidden" name="orderId" value={orderId} />}
                {invoiceId && <input type="hidden" name="invoiceId" value={invoiceId} />}
                <div>
                  <label htmlFor="mail-to">An</label>
                  <input id="mail-to" name="to" type="text" inputMode="email" defaultValue={to} required className="input" placeholder="kunde@example.de" />
                  {!to && <p className="mt-1 text-xs text-amber-700">Beim Kunden ist keine E-Mail-Adresse hinterlegt.</p>}
                </div>
                <div>
                  <label htmlFor="mail-cc">CC (optional)</label>
                  <input id="mail-cc" name="cc" type="text" inputMode="email" className="input" placeholder="mehrere mit Komma trennen" />
                </div>
                <div>
                  <label htmlFor="mail-subject">Betreff</label>
                  <input id="mail-subject" name="subject" defaultValue={subject} required className="input" />
                </div>
                <div>
                  <label htmlFor="mail-message">Nachricht</label>
                  <textarea id="mail-message" name="message" rows={7} defaultValue={message} className="input" />
                </div>
                <fieldset>
                  <legend className="text-sm font-medium text-slate-700">Anhänge (PDF)</legend>
                  <div className="mt-1 space-y-1">
                    {docs.map((d) => (
                      <label key={d.key} className={`flex items-center gap-2 font-normal ${d.available ? "" : "text-slate-400"}`}>
                        <input type="checkbox" name="docs" value={d.key} defaultChecked={d.available && d.checked} disabled={!d.available} className="h-4 w-4 accent-brand-600" />
                        {d.label}
                        {!d.available && d.hint && <span className="text-xs">({d.hint})</span>}
                        {d.available && (
                          <a href={d.downloadUrl} target="_blank" rel="noreferrer" className="ml-auto text-xs text-brand-600">
                            Vorschau
                          </a>
                        )}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                    {sent ? "Schließen" : "Abbrechen"}
                  </button>
                  {!sent && <SubmitButton pendingText="Wird gesendet…">Senden</SubmitButton>}
                </div>
              </ActionForm>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                  Der direkte E-Mail-Versand ist noch nicht eingerichtet (SMTP in den Server-Einstellungen). So geht es trotzdem schnell:
                </p>
                <p className="font-medium">1. PDFs herunterladen</p>
                <div className="flex flex-wrap gap-2">
                  {available.map((d) => (
                    <a key={d.key} href={d.downloadUrl} download className="btn-secondary py-1.5 text-xs">
                      ⬇ {d.label}
                    </a>
                  ))}
                </div>
                <p className="font-medium">2. E-Mail vorbereiten und PDFs anhängen</p>
                <a href={mailto} className="btn-primary w-full">
                  E-Mail-Programm öffnen
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
