import Link from "next/link";
import { requireOffice } from "@/lib/permissions";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { loadReport, periodFrom } from "@/lib/reports";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Auswertungen" };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card card-body">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const PRESETS: [string, string][] = [
  ["month", "Dieser Monat"],
  ["lastmonth", "Letzter Monat"],
  ["year", "Dieses Jahr"],
  ["lastyear", "Letztes Jahr"],
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  const ctx = await requireOffice();
  const sp = await searchParams;
  const period = periodFrom(sp.p, sp.from, sp.to);
  const r = await loadReport(ctx.orgId, period);
  const qs = `p=${period.key}&from=${period.from}&to=${period.to}`;
  const max = Math.max(1, ...r.months.map((m) => m.revenue));
  const periodText = `${formatDate(new Date(`${period.from}T12:00:00Z`))} – ${formatDate(new Date(`${period.to}T12:00:00Z`))}`;

  return (
    <>
      <PageHeader title="Auswertungen" subtitle={periodText} />

      {/* Filter in einer Zeile */}
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map(([k, label]) => (
            <Link
              key={k}
              href={`/reports?p=${k}`}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${period.key === k ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="p" value="custom" />
          <input type="date" name="from" defaultValue={period.from} aria-label="Von" className="input mt-0 w-auto" />
          <span className="text-slate-400">–</span>
          <input type="date" name="to" defaultValue={period.to} aria-label="Bis" className="input mt-0 w-auto" />
          <button className="btn-secondary">Anzeigen</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Umsatz netto" value={formatMoney(r.revenue)} hint="festgeschriebene Rechnungen" />
        <Stat label="Überführungen" value={String(r.orders)} hint={`${formatNumber(r.km, 0)} km`} />
        <Stat label="Umsatz je km" value={r.perKm !== null ? formatMoney(r.perKm) : "–"} />
        <Stat
          label="Deckungsbeitrag"
          value={formatMoney(r.margin)}
          hint={`nach Auslagen${r.driverCost ? " und Fahrervergütung" : ""} (vereinfacht)`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Umsatz netto je Monat" className="lg:col-span-2">
          {r.months.every((m) => m.revenue === 0) ? (
            <p className="text-sm text-slate-500">Im Zeitraum wurden keine Rechnungen festgeschrieben.</p>
          ) : (
            <figure>
              <div className="relative flex h-48 items-end gap-0.5 border-b border-slate-200" role="img" aria-label="Umsatz netto je Monat">
                <span className="absolute -top-1 left-0 text-[11px] tabular-nums text-slate-400">{formatMoney(max)}</span>
                {r.months.map((m) => (
                  <div key={m.key} className="group relative flex h-full flex-1 items-end justify-center px-px">
                    <div
                      className="w-full max-w-10 rounded-t bg-brand-500 transition group-hover:bg-brand-700"
                      style={{ height: `${Math.max(m.revenue > 0 ? 2 : 0, (m.revenue / max) * 100)}%` }}
                    />
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow group-hover:block">
                      {m.label}: {formatMoney(m.revenue)} · {m.orders} Tour{m.orders === 1 ? "" : "en"}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-0.5 text-center text-[10px] text-slate-500">
                {r.months.map((m) => (
                  <span key={m.key} className="flex-1 truncate">
                    {m.label}
                  </span>
                ))}
              </div>
            </figure>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-medium text-slate-500">Als Tabelle</summary>
            <table className="table mt-2">
              <thead>
                <tr>
                  <th>Monat</th>
                  <th className="text-right">Touren</th>
                  <th className="text-right">Umsatz netto</th>
                </tr>
              </thead>
              <tbody>
                {r.months.map((m) => (
                  <tr key={m.key}>
                    <td>{m.label}</td>
                    <td className="text-right tabular-nums">{m.orders}</td>
                    <td className="text-right tabular-nums">{formatMoney(m.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>

        <div className="space-y-6">
          <Card title="Kosten im Zeitraum">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Auslagen (netto)</dt>
                <dd className="tabular-nums">{formatMoney(r.expenseNet)}</dd>
              </div>
              {ctx.org.moduleDriverPay && (
                <div className="flex justify-between">
                  <dt>Fahrervergütung</dt>
                  <dd className="tabular-nums">{formatMoney(r.driverCost)}</dd>
                </div>
              )}
              {r.rating !== null && (
                <div className="flex justify-between border-t border-slate-100 pt-2">
                  <dt>Kundenbewertung</dt>
                  <dd>
                    {"★".repeat(Math.round(r.rating))} {formatNumber(r.rating, 1)} ({r.ratings})
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-2 text-xs text-slate-500">Weiterberechnete Auslagen sind im Umsatz enthalten und hier als Kosten abgezogen.</p>
          </Card>
          <Card title="Export für den Steuerberater">
            <div className="space-y-2">
              <a href={`/api/reports/export?format=datev&${qs}`} className="btn-primary w-full">
                DATEV-Buchungsstapel
              </a>
              <a href={`/api/reports/export?format=csv&${qs}`} className="btn-secondary w-full">
                Rechnungsliste (CSV)
              </a>
              <Link href="/documents" className="btn-secondary w-full">
                Belege als ZIP
              </Link>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Ausgangsrechnungen des Zeitraums, Kontenrahmen {ctx.org.datevChart}.{" "}
              {!ctx.org.datevConsultant && (
                <>
                  Berater- und Mandantennummer unter{" "}
                  <Link href="/settings#datev" className="text-brand-600">
                    Einstellungen
                  </Link>{" "}
                  eintragen.
                </>
              )}
            </p>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 2xl:grid-cols-2">
        <Card title="Kunden">
          {r.customers.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Daten im Zeitraum.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Kunde</th>
                    <th className="text-right">Touren</th>
                    <th className="text-right">km</th>
                    <th className="text-right">Umsatz</th>
                    <th className="text-right">Anteil</th>
                  </tr>
                </thead>
                <tbody>
                  {r.customers.slice(0, 20).map((c) => (
                    <tr key={c.id}>
                      <td className="max-w-[12rem] truncate">
                        <Link href={`/customers/${c.id}`} className="hover:text-brand-600">
                          {c.name}
                        </Link>
                      </td>
                      <td className="text-right tabular-nums">{c.orders}</td>
                      <td className="text-right tabular-nums">{formatNumber(c.km, 0)}</td>
                      <td className="text-right tabular-nums">{formatMoney(c.revenue)}</td>
                      <td className="text-right tabular-nums text-slate-500">{r.revenue ? `${formatNumber((c.revenue / r.revenue) * 100, 0)} %` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Fahrer & Auslastung">
          {r.drivers.length === 0 ? (
            <p className="text-sm text-slate-500">Keine zugewiesenen Touren im Zeitraum.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fahrer</th>
                    <th className="text-right">Touren</th>
                    <th className="text-right">km</th>
                    <th className="text-right">Auslastung</th>
                    {ctx.org.moduleDriverPay && <th className="text-right">Vergütung</th>}
                  </tr>
                </thead>
                <tbody>
                  {r.drivers.map((d) => (
                    <tr key={d.id}>
                      <td>{d.name}</td>
                      <td className="text-right tabular-nums">{d.tours}</td>
                      <td className="text-right tabular-nums">{formatNumber(d.km, 0)}</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-slate-100">
                            <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${Math.min(100, d.utilization * 100)}%` }} />
                          </div>
                          <span className="w-10 tabular-nums">{formatNumber(d.utilization * 100, 0)} %</span>
                        </div>
                      </td>
                      {ctx.org.moduleDriverPay && <td className="text-right tabular-nums">{formatMoney(d.pay)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">Auslastung = Tage mit Tour / {r.workdays} Werktage (Mo–Fr) im Zeitraum.</p>
        </Card>
      </div>
    </>
  );
}
