"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { computeTotals, lineTotal } from "@/lib/invoice";
import { saveInvoice } from "@/app/(app)/invoices/actions";

type Row = { description: string; quantity: string; unit: string; unitPrice: string; vatRate: string };

const parse = (s: string) => {
  const t = s.trim();
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
};
const money = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export function InvoiceEditor({
  invoice,
  items,
  defaultVat,
}: {
  invoice: { id: string; recipient: string; serviceDate: string; introText: string; footerText: string; smallBusiness: boolean };
  items: Row[];
  defaultVat: number;
}) {
  const [rows, setRows] = useState<Row[]>(items);
  const [small, setSmall] = useState(invoice.smallBusiness);
  const numeric = rows.map((r) => ({ description: r.description, unit: r.unit, quantity: parse(r.quantity), unitPrice: parse(r.unitPrice), vatRate: parse(r.vatRate) }));
  const totals = computeTotals(numeric, small);
  const update = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const move = (i: number, d: number) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const copy = [...rs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  return (
    <ActionForm action={saveInvoice} className="space-y-6">
      <input type="hidden" name="id" value={invoice.id} />
      <input type="hidden" name="items" value={JSON.stringify(numeric)} />

      <section className="card card-body grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="recipient">Rechnungsempfänger</label>
          <textarea id="recipient" name="recipient" rows={5} defaultValue={invoice.recipient} className="input font-mono text-sm" />
        </div>
        <div className="space-y-4">
          <div>
            <label htmlFor="serviceDate">Leistungsdatum</label>
            <input id="serviceDate" name="serviceDate" type="datetime-local" defaultValue={invoice.serviceDate} className="input" />
          </div>
          <label className="flex items-center gap-2 font-normal">
            <input type="checkbox" name="smallBusiness" checked={small} onChange={(e) => setSmall(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Kleinunternehmer (§ 19 UStG, keine Umsatzsteuer)
          </label>
          <p className="text-xs text-slate-500">Rechnungsnummer und Rechnungsdatum werden beim Festschreiben automatisch vergeben.</p>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="introText">Einleitungstext</label>
          <textarea id="introText" name="introText" rows={2} defaultValue={invoice.introText} className="input" />
        </div>
      </section>

      <section className="card card-body">
        <h2 className="section-title mb-3">Positionen</h2>
        <div className="space-y-4">
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-6 shrink-0 text-sm font-semibold text-slate-400">{i + 1}.</span>
                <textarea
                  value={r.description}
                  onChange={(e) => update(i, "description", e.target.value)}
                  rows={Math.min(5, r.description.split("\n").length)}
                  className="input mt-0 flex-1"
                  placeholder="Beschreibung"
                />
                <div className="flex flex-col">
                  <button type="button" onClick={() => move(i, -1)} className="px-2 text-slate-400 hover:text-slate-700" aria-label="Nach oben">
                    ▲
                  </button>
                  <button type="button" onClick={() => move(i, 1)} className="px-2 text-slate-400 hover:text-slate-700" aria-label="Nach unten">
                    ▼
                  </button>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 pl-8 sm:grid-cols-5">
                <div>
                  <label className="text-xs">Menge</label>
                  <input value={r.quantity} onChange={(e) => update(i, "quantity", e.target.value)} inputMode="decimal" className="input" />
                </div>
                <div>
                  <label className="text-xs">Einheit</label>
                  <input value={r.unit} onChange={(e) => update(i, "unit", e.target.value)} className="input" />
                </div>
                <div>
                  <label className="text-xs">Einzelpreis netto</label>
                  <input value={r.unitPrice} onChange={(e) => update(i, "unitPrice", e.target.value)} inputMode="decimal" className="input" />
                </div>
                <div>
                  <label className="text-xs">USt %</label>
                  <input value={small ? "0" : r.vatRate} disabled={small} onChange={(e) => update(i, "vatRate", e.target.value)} inputMode="decimal" className="input" />
                </div>
                <div className="flex items-end justify-between gap-2 sm:flex-col sm:items-end">
                  <span className="text-sm font-semibold">{money(lineTotal(numeric[i]))}</span>
                  <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="text-xs text-red-500">
                    Entfernen
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary mt-4"
          onClick={() => setRows((rs) => [...rs, { description: "", quantity: "1", unit: "Stk.", unitPrice: "0", vatRate: String(defaultVat) }])}
        >
          + Position hinzufügen
        </button>

        <dl className="ml-auto mt-6 max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt>Summe netto</dt>
            <dd>{money(totals.net)}</dd>
          </div>
          {totals.vat.map((v) => (
            <div key={v.rate} className="flex justify-between text-slate-600">
              <dt>zzgl. {v.rate.toLocaleString("de-DE")} % USt</dt>
              <dd>{money(v.amount)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold">
            <dt>Gesamt</dt>
            <dd>{money(totals.gross)}</dd>
          </div>
        </dl>
      </section>

      <section className="card card-body">
        <label htmlFor="footerText">Schlusstext</label>
        <textarea id="footerText" name="footerText" rows={3} defaultValue={invoice.footerText} className="input" placeholder="z. B. Zahlungsbedingungen, Dank, Hinweise" />
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SubmitButton name="intent" value="save" className="btn-secondary">
          Entwurf speichern
        </SubmitButton>
        <SubmitButton
          name="intent"
          value="issue"
          pendingText="Wird festgeschrieben…"
          confirm="Rechnung jetzt festschreiben? Danach erhält sie eine Rechnungsnummer und kann nicht mehr geändert werden."
        >
          Speichern & festschreiben
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
