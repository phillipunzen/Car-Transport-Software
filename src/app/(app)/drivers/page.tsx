import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOffice } from "@/lib/permissions";
import { formatDate, formatMoney, formatNumber, orderNo } from "@/lib/format";
import { dayBounds, nextDayKey } from "@/lib/calendar";
import { periodFrom } from "@/lib/reports";
import { PAY_TYPE } from "@/lib/driver-pay";
import { openItems } from "@/lib/settlements";
import { EXPENSE_CATEGORY } from "@/lib/labels";
import { Card, Empty, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createSettlement, deleteSettlement } from "./actions";

export const metadata = { title: "Fahrer-Abrechnung" };

export default async function DriversPage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  const ctx = await requireOffice();
  if (!ctx.org.moduleDriverPay) redirect("/settings/modules");
  const sp = await searchParams;
  const period = periodFrom(sp.p ?? "lastmonth", sp.from, sp.to);
  const until = dayBounds(nextDayKey(period.to)).start;
  const members = await db.membership.findMany({ where: { organizationId: ctx.orgId }, include: { user: true }, orderBy: { createdAt: "asc" } });
  const open = await Promise.all(members.map(async (m) => ({ m, items: await openItems(ctx.orgId, m.userId, until) })));
  const rows = open.filter(({ m, items }) => m.payType !== "NONE" || items.tours.length || items.expenses.length);
  const settlements = await db.driverSettlement.findMany({ where: { organizationId: ctx.orgId }, orderBy: { createdAt: "desc" }, take: 50 });
  const latestPerDriver = new Set(members.map((m) => settlements.find((s) => s.userId === m.userId)?.id).filter(Boolean));

  return (
    <>
      <PageHeader title="Fahrer-Abrechnung" subtitle={`Erledigte Touren bis ${formatDate(new Date(`${period.to}T12:00:00Z`))}`} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {[
          ["lastmonth", "Letzter Monat"],
          ["month", "Dieser Monat"],
        ].map(([k, l]) => (
          <Link key={k} href={`/drivers?p=${k}`} className={`rounded-full px-3 py-1.5 text-sm font-medium ${period.key === k ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {l}
          </Link>
        ))}
        <form className="flex items-center gap-2">
          <input type="hidden" name="p" value="custom" />
          <input type="date" name="from" defaultValue={period.from} aria-label="Von" className="input mt-0 w-auto" />
          <input type="date" name="to" defaultValue={period.to} aria-label="Bis" className="input mt-0 w-auto" />
          <button className="btn-secondary">Anzeigen</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <Empty title="Nichts abzurechnen" text="Vergütungsregeln je Fahrer legst du unter Einstellungen → Team fest. Abgerechnet werden Touren mit abgeschlossenem Übergabeprotokoll." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map(({ m, items }) => (
            <Card key={m.id} title={m.user.name ?? m.user.email}>
              <p className="text-xs text-slate-500">
                {PAY_TYPE[m.payType]}
                {m.payType !== "NONE" && m.payRate ? ` · ${formatMoney(m.payRate)}${m.payType === "PER_KM" ? "/km" : ""}` : ""}
                {m.payVat && " · zzgl. USt"}
              </p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-xs text-slate-500">Touren</dt>
                  <dd className="text-lg font-bold tabular-nums">{items.tours.length}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-xs text-slate-500">Vergütung</dt>
                  <dd className="text-lg font-bold tabular-nums">{formatMoney(items.payTotal)}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-xs text-slate-500">Auslagen</dt>
                  <dd className="text-lg font-bold tabular-nums">{formatMoney(items.expenseTotal)}</dd>
                </div>
              </dl>
              {(items.tours.length > 0 || items.expenses.length > 0) && (
                <>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium text-brand-600">Einzelheiten</summary>
                    <ul className="mt-2 divide-y divide-slate-100 text-sm">
                      {items.tours.map((t) => (
                        <li key={t.id} className="flex justify-between gap-2 py-1.5">
                          <Link href={`/orders/${t.id}`} className="hover:text-brand-600">
                            {formatDate(t.date)} · {orderNo(t.number)} · {t.route} · {formatNumber(t.km, 0)} km
                          </Link>
                          <span className="tabular-nums">
                            {formatMoney(t.pay)}
                            {t.manual && <span title="manuell im Auftrag festgelegt"> *</span>}
                          </span>
                        </li>
                      ))}
                      {items.expenses.map((e) => (
                        <li key={e.id} className="flex justify-between gap-2 py-1.5 text-slate-600">
                          <span>
                            {formatDate(e.date)} · {orderNo(e.order.number)} · {EXPENSE_CATEGORY[e.category] ?? e.category}
                            {e.vendor && ` · ${e.vendor}`}
                          </span>
                          <span className="tabular-nums">{formatMoney(e.amountGross)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                  <form action={createSettlement} className="mt-3 space-y-2">
                    <input type="hidden" name="userId" value={m.userId} />
                    <input type="hidden" name="from" value={period.from} />
                    <input type="hidden" name="to" value={period.to} />
                    <input name="notes" placeholder="Hinweis auf der Abrechnung (optional)" className="input mt-0" />
                    <SubmitButton className="btn-primary w-full" confirm="Abrechnung erstellen? Die enthaltenen Touren und Auslagen werden als abgerechnet markiert.">
                      Abrechnung erstellen
                    </SubmitButton>
                  </form>
                </>
              )}
            </Card>
          ))}
        </div>
      )}

      <Card title="Erstellte Abrechnungen" className="mt-6">
        {settlements.length === 0 ? (
          <p className="text-sm text-slate-500">Noch keine Abrechnungen.</p>
        ) : (
          <ul className="-my-2 divide-y divide-slate-100">
            {settlements.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-medium">{s.number}</span> · {s.driverName} · {formatDate(s.periodFrom)} – {formatDate(s.periodTo)}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">{formatMoney(s.grossTotal)}</span>
                  <a href={`/api/settlements/${s.id}/pdf`} target="_blank" rel="noreferrer" className="text-brand-600">
                    PDF
                  </a>
                  {latestPerDriver.has(s.id) && (
                    <form action={deleteSettlement}>
                      <input type="hidden" name="id" value={s.id} />
                      <SubmitButton className="text-xs text-red-500" confirm="Abrechnung zurücknehmen? Touren und Auslagen werden wieder offen.">
                        Zurücknehmen
                      </SubmitButton>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
