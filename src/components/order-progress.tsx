"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SKIPPABLE, type Step, type StepKey } from "@/lib/order-steps";
import { SubmitButton } from "@/components/submit-button";
import { createInvoiceFromOrder } from "@/app/(app)/invoices/actions";
import { setStepSkipped } from "@/app/(app)/orders/actions";

/** Kleiner Formular-Button: Schritt überspringen bzw. wieder aufnehmen */
function SkipButton({ orderId, step, skip, label, confirm, className }: { orderId: string; step: StepKey; skip: boolean; label: string; confirm?: string; className: string }) {
  return (
    <form action={setStepSkipped} className="inline">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="step" value={step} />
      <input type="hidden" name="skip" value={skip ? "1" : "0"} />
      <SubmitButton className={className} pendingText="…" confirm={confirm}>
        {label}
      </SubmitButton>
    </form>
  );
}

type Props = {
  orderId: string;
  steps: Step[];
  invoiceId: string | null;
  invoiceNumber: string | null;
  expenses: number;
  missing: string[];
  cancelled: boolean;
};

function target(key: StepKey, orderId: string, invoiceId: string | null) {
  const base = `/orders/${orderId}`;
  switch (key) {
    case "prepare":
      return `${base}/edit`;
    case "pickupPhotos":
      return `${base}/condition?stage=pickup`;
    case "pickupProtocol":
      return `${base}/protocol/pickup`;
    case "deliveryPhotos":
      return `${base}/condition?stage=delivery`;
    case "deliveryProtocol":
      return `${base}/protocol/delivery`;
    case "invoice":
    case "payment":
      return invoiceId ? `/invoices/${invoiceId}` : `${base}/expenses`;
  }
}

const TEXT: Record<StepKey, { title: string; text: string; button: string }> = {
  prepare: {
    title: "Auftragsdaten vervollständigen",
    text: "Kann auch später vor Ort ergänzt werden.",
    button: "Daten ergänzen",
  },
  pickupPhotos: {
    title: "Fahrzeug bei der Abholung fotografieren",
    text: "Rundum-Fotos (Front, Heck, beide Seiten, Innenraum, Tacho) und vorhandene Schäden festhalten.",
    button: "Fotos & Schäden erfassen",
  },
  pickupProtocol: {
    title: "Abholprotokoll ausfüllen",
    text: "Kilometerstand, Tankstand und Zubehör prüfen, dann vom Kunden unterschreiben lassen.",
    button: "Abholprotokoll öffnen",
  },
  deliveryPhotos: {
    title: "Fahrzeug bei der Übergabe fotografieren",
    text: "Möglichst dieselben Perspektiven wie bei der Abholung – so lassen sich neue Schäden eindeutig nachweisen.",
    button: "Fotos & Schäden erfassen",
  },
  deliveryProtocol: {
    title: "Übergabeprotokoll ausfüllen",
    text: "Vom Empfänger unterschreiben lassen – damit ist die Überführung abgeschlossen.",
    button: "Übergabeprotokoll öffnen",
  },
  invoice: {
    title: "Abrechnen",
    text: "Belege (Bahn, Hotel, Spesen) erfassen und Rechnung erstellen – weiterberechnete Belege werden automatisch übernommen.",
    button: "Rechnung erstellen",
  },
  payment: {
    title: "Zahlungseingang abwarten",
    text: "Sobald das Geld eingegangen ist, die Rechnung als bezahlt markieren.",
    button: "Rechnung öffnen",
  },
};

function StepDot({ step, index }: { step: Step; index: number }) {
  const styles = {
    done: "bg-emerald-500 text-white border-emerald-500",
    current: "bg-brand-600 text-white border-brand-600 ring-4 ring-brand-100",
    missed: "bg-amber-100 text-amber-700 border-amber-300",
    waived: "bg-slate-100 text-slate-400 border-slate-300 border-dashed",
    open: "bg-white text-slate-400 border-slate-300",
  }[step.state];
  return (
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${styles}`}>
      {step.state === "done" ? "✓" : step.state === "missed" ? "!" : step.state === "waived" ? "–" : index + 1}
    </span>
  );
}

/** Schrittleiste + "Nächster Schritt" – oben in jedem Auftrag */
export function OrderProgress({ orderId, steps, invoiceId, invoiceNumber, expenses, missing, cancelled }: Props) {
  const path = usePathname();
  const search = useSearchParams();
  const current = steps.find((s) => s.state === "current");
  const doneCount = steps.filter((s) => s.state === "done" || s.state === "waived").length;
  const missed = steps.filter((s) => s.state === "missed");
  const waived = steps.filter((s) => s.state === "waived" && s.key !== "payment");

  if (cancelled) {
    return <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Dieser Auftrag wurde storniert.</div>;
  }

  const here = (key: StepKey) => {
    const url = new URL(target(key, orderId, invoiceId), "http://x");
    if (url.pathname !== path) return false;
    const stage = url.searchParams.get("stage");
    return !stage || (search.get("stage") ?? "pickup") === stage;
  };

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Schrittleiste */}
      <ol className="flex gap-1 border-b border-slate-100 px-3 py-3 sm:px-5">
        {steps.map((s, i) => (
          <li key={s.key} className="flex min-w-0 flex-1 items-center gap-1">
            <Link
              href={target(s.key, orderId, invoiceId)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-0.5 py-1 text-center hover:bg-slate-50 sm:min-w-[4.5rem] sm:px-1 ${
                here(s.key) ? "bg-slate-50" : ""
              }`}
              title={s.detail}
            >
              <StepDot step={s} index={i} />
              {/* Auf dem Smartphone nur Punkte – die Erklärung steht im Kasten darunter */}
              <span
                className={`sr-only text-[11px] leading-tight sm:not-sr-only ${
                  s.state === "current" ? "font-semibold text-brand-700" : s.state === "waived" ? "text-slate-400 line-through" : "text-slate-600"
                }`}
              >
                {s.label}
              </span>
            </Link>
            {i < steps.length - 1 && <span className={`mb-5 hidden h-0.5 w-4 shrink-0 sm:block ${s.state === "done" ? "bg-emerald-400" : "bg-slate-200"}`} />}
          </li>
        ))}
      </ol>

      {/* Nächster Schritt */}
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        {current ? (
          <>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                Nächster Schritt · {doneCount} von {steps.length} erledigt
                <span className="normal-case sm:hidden"> · Schritt {steps.indexOf(current) + 1}: {current.label}</span>
              </p>
              <p className="mt-0.5 font-semibold text-slate-900">{TEXT[current.key].title}</p>
              <p className="text-sm text-slate-600">
                {current.key === "prepare" && missing.length ? `Es fehlt noch: ${missing.join(", ")}. ` : ""}
                {current.key === "payment" && invoiceNumber ? `Rechnung ${invoiceNumber} ist offen. ` : ""}
                {current.key === "invoice" && invoiceId ? "Der Rechnungsentwurf muss noch geprüft und festgeschrieben werden." : TEXT[current.key].text}
              </p>
              <MissedList steps={missed} orderId={orderId} invoiceId={invoiceId} />
              <WaivedList steps={waived} orderId={orderId} />
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              {here(current.key) ? (
                <span className="text-sm font-medium text-brand-700">↓ Hier auf dieser Seite erledigen</span>
              ) : current.key === "invoice" && !invoiceId ? (
                <form action={createInvoiceFromOrder}>
                  <input type="hidden" name="orderId" value={orderId} />
                  <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Rechnung wird erstellt…">
                    {TEXT.invoice.button}
                  </SubmitButton>
                </form>
              ) : (
                <Link href={target(current.key, orderId, invoiceId)} className="btn-primary w-full sm:w-auto">
                  {current.key === "invoice" ? "Rechnung prüfen" : TEXT[current.key].button} →
                </Link>
              )}
              {SKIPPABLE[current.key] && !(current.key === "invoice" && invoiceId) && (
                <SkipButton
                  orderId={orderId}
                  step={current.key}
                  skip
                  label={`${SKIPPABLE[current.key]} →`}
                  confirm={current.key === "invoice" ? "Für diesen Auftrag keine Rechnung erstellen?" : `Schritt „${current.label}“ überspringen?`}
                  className="w-full text-center text-xs text-slate-500 hover:text-slate-800 sm:w-auto"
                />
              )}
              {current.key === "invoice" && !invoiceId && (
                <Link href={`/orders/${orderId}/expenses`} className="text-center text-xs text-slate-500 hover:text-slate-800">
                  Vorher Belege erfassen{expenses ? ` (${expenses} erfasst)` : ""}
                </Link>
              )}
            </div>
          </>
        ) : (
          <div>
            <p className="font-semibold text-emerald-700">✓ Auftrag abgeschlossen</p>
            <p className="text-sm text-slate-600">
              {steps.find((s) => s.key === "invoice")?.state === "waived"
                ? "Alle Schritte sind erledigt – für diesen Auftrag ist keine Rechnung erforderlich."
                : "Alle Schritte sind erledigt und die Rechnung ist bezahlt."}
            </p>
            <MissedList steps={missed} orderId={orderId} invoiceId={invoiceId} />
            <WaivedList steps={waived} orderId={orderId} />
          </div>
        )}
      </div>
    </section>
  );
}

/** Bewusst übersprungene Schritte mit Möglichkeit zum Rückgängigmachen */
function WaivedList({ steps, orderId }: { steps: Step[]; orderId: string }) {
  if (steps.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
      <span>Übersprungen:</span>
      {steps.map((s) => (
        <span key={s.key} className="flex items-center gap-1">
          {s.key === "invoice" ? "Rechnung (keine erforderlich)" : s.label}
          <SkipButton orderId={orderId} step={s.key} skip={false} label="(rückgängig)" className="text-brand-600 hover:underline" />
        </span>
      ))}
    </div>
  );
}

/** Offen gebliebene Schritte – verlinkt, überspringbare können ignoriert werden */
function MissedList({ steps, orderId, invoiceId }: { steps: Step[]; orderId: string; invoiceId: string | null }) {
  if (steps.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-amber-700">
      <span>! Noch offen aus früheren Schritten:</span>
      {steps.map((m) => (
        <span key={m.key} className="flex items-center gap-1">
          <Link href={target(m.key, orderId, invoiceId)} className="underline">
            {m.label}
          </Link>
          {SKIPPABLE[m.key] && <SkipButton orderId={orderId} step={m.key} skip label="(ignorieren)" className="text-slate-500 hover:text-slate-800" />}
        </span>
      ))}
    </div>
  );
}
