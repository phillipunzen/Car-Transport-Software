import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { formatMoney, toDateInput, toNumber } from "@/lib/format";
import { EXPENSE_CATEGORY } from "@/lib/labels";
import { recognitionMode } from "@/lib/recognition";
import { Card } from "@/components/ui";
import { ReceiptUpload } from "@/components/receipt-upload";
import { SubmitButton } from "@/components/submit-button";
import { addExpense, deleteExpense, updateExpense } from "./actions";

export default async function ExpensesPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const order = await db.order.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: { expenses: { orderBy: [{ date: "asc" }, { createdAt: "asc" }], include: { file: true } } },
  });
  if (!order) notFound();
  const total = order.expenses.reduce((s, e) => s + toNumber(e.amountGross), 0);
  const rebill = order.expenses.filter((e) => e.rebillable).reduce((s, e) => s + toNumber(e.amountGross), 0);

  return (
    <div className="space-y-6">
      <Card title="Beleg erfassen">
        <ReceiptUpload orderId={order.id} recognition={recognitionMode()} />
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-600">Ausgabe ohne Beleg erfassen (z. B. Verpflegungspauschale)</summary>
          <form action={addExpense} className="mt-3 grid gap-3 sm:grid-cols-5">
            <input type="hidden" name="orderId" value={order.id} />
            <select name="category" defaultValue="PER_DIEM" className="input sm:col-span-1">
              {Object.entries(EXPENSE_CATEGORY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input name="description" placeholder="Beschreibung" className="input sm:col-span-2" />
            <input name="amountGross" placeholder="Betrag brutto" inputMode="decimal" required className="input" />
            <input name="vatRate" placeholder="USt %" defaultValue="0" inputMode="decimal" className="input" />
            <SubmitButton className="btn-secondary sm:col-span-5 sm:justify-self-start">Hinzufügen</SubmitButton>
          </form>
        </details>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card card-body">
          <p className="text-xs uppercase text-slate-500">Summe Belege (brutto)</p>
          <p className="text-2xl font-bold">{formatMoney(total)}</p>
        </div>
        <div className="card card-body">
          <p className="text-xs uppercase text-slate-500">Davon weiterberechnen</p>
          <p className="text-2xl font-bold">{formatMoney(rebill)}</p>
        </div>
      </div>

      {order.expenses.map((e) => (
        <div key={e.id} className="card card-body">
          <div className="flex flex-col gap-4 md:flex-row">
            {e.file && (
              <a href={`/api/files/${e.file.id}`} target="_blank" rel="noreferrer" className="shrink-0">
                {e.file.mimeType === "application/pdf" ? (
                  <div className="flex h-28 w-24 items-center justify-center rounded border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500">PDF</div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${e.file.id}`} alt="Beleg" className="h-28 w-24 rounded border border-slate-200 object-cover" />
                )}
              </a>
            )}
            <form action={updateExpense} className="grid flex-1 gap-3 sm:grid-cols-6">
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="expenseId" value={e.id} />
              <div className="sm:col-span-2">
                <label>Kategorie</label>
                <select name="category" defaultValue={e.category} className="input">
                  {Object.entries(EXPENSE_CATEGORY).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label>Aussteller</label>
                <input name="vendor" defaultValue={e.vendor ?? ""} className="input" />
              </div>
              <div className="sm:col-span-2">
                <label>Datum</label>
                <input name="date" type="date" defaultValue={toDateInput(e.date)} className="input" />
              </div>
              <div className="sm:col-span-3">
                <label>Beschreibung</label>
                <input name="description" defaultValue={e.description ?? ""} className="input" />
              </div>
              <div>
                <label>Brutto</label>
                <input name="amountGross" inputMode="decimal" defaultValue={toNumber(e.amountGross).toFixed(2)} className="input" />
              </div>
              <div>
                <label>USt %</label>
                <input name="vatRate" inputMode="decimal" defaultValue={toNumber(e.vatRate)} className="input" />
              </div>
              <div>
                <label>Währung</label>
                <input name="currency" defaultValue={e.currency} className="input" />
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
                <label className="flex items-center gap-2 font-normal">
                  <input type="checkbox" name="rebillable" defaultChecked={e.rebillable} className="h-4 w-4 accent-brand-600" />
                  An Kunden weiterberechnen
                </label>
                {e.aiExtracted && <span className="badge bg-brand-50 text-brand-700">automatisch erkannt</span>}
                <div className="ml-auto flex gap-2">
                  <SubmitButton className="btn-secondary py-1.5">Speichern</SubmitButton>
                </div>
              </div>
            </form>
          </div>
          <form action={deleteExpense} className="mt-2 text-right">
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="expenseId" value={e.id} />
            <SubmitButton className="text-sm text-red-500" pendingText="…" confirm="Beleg löschen?">
              Beleg löschen
            </SubmitButton>
          </form>
        </div>
      ))}
    </div>
  );
}
