import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { formatMoney, toDateInput, toDateTimeLocal, toNumber } from "@/lib/format";
import { expenseLock } from "@/lib/expense-lock";
import { perDiem } from "@/lib/per-diem";
import { EXPENSE_CATEGORY } from "@/lib/labels";
import { recognitionMode } from "@/lib/recognition";
import { Card } from "@/components/ui";
import { ReceiptUpload } from "@/components/receipt-upload";
import { SubmitButton } from "@/components/submit-button";
import { addExpense, addPerDiem, deleteExpense, updateExpense } from "./actions";
import { orderWhere } from "@/lib/permissions";

export default async function ExpensesPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const order = await db.order.findFirst({
    where: orderWhere(ctx, { id }),
    include: {
      expenses: { orderBy: [{ date: "asc" }, { createdAt: "asc" }], include: { file: true } },
      protocols: { select: { type: true, performedAt: true } },
    },
  });
  if (!order) notFound();
  const lock = await expenseLock(order.id);

  // Vorschlag Verpflegungspauschale: Abholung bis Übergabe + Rückreise (Fahrzeit der Strecke)
  const pickupAt = order.protocols.find((p) => p.type === "PICKUP")?.performedAt ?? order.pickupDate;
  const deliveredAt = order.protocols.find((p) => p.type === "DELIVERY")?.performedAt ?? order.deliveryDate;
  const perDiemStart = pickupAt;
  const perDiemEnd = deliveredAt && order.durationMinutes ? new Date(deliveredAt.getTime() + order.durationMinutes * 60000) : deliveredAt;
  const hasHotel = order.expenses.some((e) => e.category === "HOTEL");
  const hasPerDiem = order.expenses.some((e) => e.category === "PER_DIEM");
  const perDiemSuggestion =
    ctx.org.perDiemEnabled && perDiemStart && perDiemEnd
      ? perDiem(perDiemStart, perDiemEnd, toNumber(ctx.org.perDiemPartial), toNumber(ctx.org.perDiemFull), hasHotel || undefined)
      : null;
  const total = order.expenses.reduce((s, e) => s + toNumber(e.amountGross), 0);
  const rebill = order.expenses.filter((e) => e.rebillable).reduce((s, e) => s + toNumber(e.amountGross), 0);

  return (
    <div className="space-y-6">
      {lock.locked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">🔒 Belege gesperrt</p>
          <p className="mt-1">
            Die Rechnung {lock.invoiceNumber} ist festgeschrieben. Damit die Buchhaltung nachvollziehbar bleibt (GoBD), können die Belege nicht mehr geändert oder
            gelöscht werden. Für Korrekturen die Rechnung stornieren – danach sind die Belege wieder bearbeitbar.
          </p>
        </div>
      )}
      {!lock.locked && ctx.org.perDiemEnabled && !hasPerDiem && (
        <Card title="Verpflegungspauschale">
          <form action={addPerDiem} className="space-y-3">
            <input type="hidden" name="orderId" value={order.id} />
            <p className="text-sm text-slate-600">
              {perDiemSuggestion && perDiemSuggestion.total > 0 ? (
                <>
                  Vorschlag: <strong>{formatMoney(perDiemSuggestion.total)}</strong> ({perDiemSuggestion.lines.map((l) => `${l.label} ${formatMoney(l.amount)}`).join(" · ")}).
                  Berechnet von der Abholung bis zur Übergabe plus Rückreise – bitte prüfen und bei Bedarf anpassen.
                </>
              ) : (
                <>Abwesenheitszeit eintragen – die Pauschale ({formatMoney(ctx.org.perDiemPartial)} ab 8 Std. bzw. An-/Abreisetag, {formatMoney(ctx.org.perDiemFull)} je voller Tag) wird berechnet.</>
              )}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label>Abwesend von</label>
                <input type="datetime-local" name="start" required defaultValue={toDateTimeLocal(perDiemStart)} className="input" />
              </div>
              <div>
                <label>bis (inkl. Rückreise)</label>
                <input type="datetime-local" name="end" required defaultValue={toDateTimeLocal(perDiemEnd)} className="input" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 font-normal">
                <input type="checkbox" name="overnight" defaultChecked={hasHotel} className="h-4 w-4 accent-brand-600" />
                mit Übernachtung
              </label>
              <label className="flex items-center gap-2 font-normal">
                <input type="checkbox" name="rebillable" className="h-4 w-4 accent-brand-600" />
                An Kunden weiterberechnen
              </label>
              <SubmitButton className="btn-secondary ml-auto">Pauschale übernehmen</SubmitButton>
            </div>
          </form>
        </Card>
      )}
      {!lock.locked && (
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
      )}

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
            <form action={updateExpense} className="flex-1">
              <fieldset disabled={lock.locked} className="grid gap-3 sm:grid-cols-6">
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
                {lock.locked && <span className="badge bg-slate-100 text-slate-600">🔒 festgeschrieben</span>}
                {!lock.locked && (
                  <div className="ml-auto flex gap-2">
                    <SubmitButton className="btn-secondary py-1.5">Speichern</SubmitButton>
                  </div>
                )}
              </div>
              </fieldset>
            </form>
          </div>
          {!lock.locked && !(lock.archived && e.fileId) && (
            <form action={deleteExpense} className="mt-2 text-right">
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="expenseId" value={e.id} />
              <SubmitButton className="text-sm text-red-500" pendingText="…" confirm="Beleg löschen?">
                Beleg löschen
              </SubmitButton>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
