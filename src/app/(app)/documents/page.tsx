import Link from "next/link";

import { formatDate, formatMoney } from "@/lib/format";
import { EXPENSE_CATEGORY } from "@/lib/labels";
import { customerOptions } from "@/lib/queries";
import { parseFilters, queryDocuments, type DocumentFilters } from "@/lib/documents";
import { Empty, PageHeader } from "@/components/ui";
import { requireOffice } from "@/lib/permissions";

export const metadata = { title: "Belege & Dokumente" };

function qs(f: DocumentFilters, patch: Partial<DocumentFilters> = {}) {
  const merged = { ...f, ...patch };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v && !(k === "type" && v === "all")) p.set(k, String(v));
  return p.toString();
}

function Tag({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={`badge bg-slate-100 text-slate-700 hover:bg-brand-100 hover:text-brand-700 ${className}`}>
      {children}
    </Link>
  );
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOffice();
  const f = parseFilters(await searchParams);
  const [rows, customers] = await Promise.all([queryDocuments(ctx.orgId, f, 300), customerOptions(ctx.orgId)]);
  const expenses = rows.filter((r) => r.type === "expense");
  const sum = expenses.reduce((s, r) => s + (r.currency === "EUR" || !r.currency ? r.amountGross ?? 0 : 0), 0);
  const rebill = expenses.filter((r) => r.rebillable).reduce((s, r) => s + (r.currency === "EUR" || !r.currency ? r.amountGross ?? 0 : 0), 0);
  const withoutFile = expenses.filter((r) => !r.file).length;
  const filterCount = [f.customerId, f.plate, f.category, f.from, f.to, f.type !== "all" ? f.type : null].filter(Boolean).length;
  const active = Boolean(f.q) || filterCount > 0;
  const exportQs = qs(f);

  return (
    <>
      <PageHeader
        title="Belege & Dokumente"
        subtitle="Alle Belege aus Aufträgen und alle Fahrzeugdokumente – automatisch nach Kunde, Kennzeichen und Auftrag verschlagwortet."
        actions={
          <>
            <a href={`/api/documents/export?${exportQs}&format=zip`} className="btn-primary">
              ZIP exportieren
            </a>
            <a href={`/api/documents/export?${exportQs}&format=csv`} className="btn-secondary">
              CSV
            </a>
          </>
        }
      />

      <form className="card card-body mb-4 space-y-3">
        <div className="flex gap-2">
          <input name="q" defaultValue={f.q} placeholder="Suche: Aussteller, Kennzeichen, Kunde, Auftrag…" className="input mt-0" aria-label="Suche" />
          <button className="btn-primary shrink-0">Suchen</button>
        </div>
        <details open={filterCount > 0} className="group">
          <summary className="cursor-pointer select-none text-sm font-medium text-slate-600">
            Weitere Filter{filterCount > 0 ? ` (${filterCount} aktiv)` : ""}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div>
              <label htmlFor="type">Typ</label>
              <select id="type" name="type" defaultValue={f.type} className="input">
                <option value="all">Alle</option>
                <option value="expense">Belege</option>
                <option value="vehicle">Fahrzeugdokumente</option>
              </select>
            </div>
            <div>
              <label htmlFor="customerId">Kunde</label>
              <select id="customerId" name="customerId" defaultValue={f.customerId ?? ""} className="input">
                <option value="">Alle Kunden</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="plate">Kennzeichen</label>
              <input id="plate" name="plate" defaultValue={f.plate} className="input font-mono uppercase" />
            </div>
            <div>
              <label htmlFor="category">Kategorie</label>
              <select id="category" name="category" defaultValue={f.category ?? ""} className="input">
                <option value="">Alle</option>
                {Object.entries(EXPENSE_CATEGORY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="from">Von</label>
              <input id="from" name="from" type="date" defaultValue={f.from} className="input" />
            </div>
            <div>
              <label htmlFor="to">Bis</label>
              <input id="to" name="to" type="date" defaultValue={f.to} className="input" />
            </div>
          </div>
        </details>
        {active && (
          <Link href="/documents" className="inline-block text-sm text-slate-500 hover:text-slate-800">
            ✕ Alle Filter zurücksetzen
          </Link>
        )}
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card card-body">
          <p className="text-xs uppercase text-slate-500">Dokumente</p>
          <p className="text-2xl font-bold">{rows.length}</p>
        </div>
        <div className="card card-body">
          <p className="text-xs uppercase text-slate-500">Summe Belege (brutto)</p>
          <p className="text-2xl font-bold">{formatMoney(sum)}</p>
        </div>
        <div className="card card-body">
          <p className="text-xs uppercase text-slate-500">Davon weiterberechnet</p>
          <p className="text-2xl font-bold">{formatMoney(rebill)}</p>
        </div>
        <div className="card card-body">
          <p className="text-xs uppercase text-slate-500">Ohne Belegdatei</p>
          <p className={`text-2xl font-bold ${withoutFile ? "text-amber-600" : ""}`}>{withoutFile}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty title="Keine Dokumente gefunden" text={active ? "Passe die Filter an." : "Belege erfasst du im Auftrag unter „Belege“, Fahrzeugdokumente beim Fahrzeug."} />
      ) : (
        <div className="card divide-y divide-slate-100">
          {rows.map((r) => (
            <div key={r.key} className="flex gap-3 p-3 sm:gap-4 sm:px-5">
              {r.file ? (
                <a href={`/api/files/${r.file.id}`} target="_blank" rel="noreferrer" className="shrink-0" title="Original öffnen">
                  {r.file.mimeType === "application/pdf" ? (
                    <div className="flex h-16 w-14 items-center justify-center rounded border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">PDF</div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${r.file.id}`} alt="" loading="lazy" className="h-16 w-14 rounded border border-slate-200 object-cover" />
                  )}
                </a>
              ) : (
                <div className="flex h-16 w-14 shrink-0 items-center justify-center rounded border border-dashed border-slate-300 text-center text-[10px] text-slate-400">ohne Datei</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-x-3">
                  <p className="min-w-0 truncate font-medium">{r.title}</p>
                  {r.amountGross !== null && <p className="shrink-0 font-semibold">{formatMoney(r.amountGross, r.currency ?? "EUR")}</p>}
                </div>
                <p className="truncate text-xs text-slate-500">
                  {formatDate(r.date)}
                  {r.subtitle && ` · ${r.subtitle}`}
                  {r.vatRate !== null && ` · ${r.vatRate} % USt`}
                  {r.rebillable && " · weiterberechnet"}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className={`badge ${r.type === "expense" ? "bg-violet-50 text-violet-700" : "bg-sky-50 text-sky-700"}`}>
                    {r.type === "expense" ? "Beleg" : "Fahrzeugdokument"}
                  </span>
                  {r.category && <Tag href={`/documents?${qs(f, { category: r.category })}`}>{EXPENSE_CATEGORY[r.category] ?? r.category}</Tag>}
                  {r.customer && <Tag href={`/documents?${qs(f, { customerId: r.customer.id })}`}>👤 {r.customer.name}</Tag>}
                  {r.plate && (
                    <Tag href={`/documents?${qs(f, { plate: r.plate })}`} className="font-mono">
                      {r.plate}
                    </Tag>
                  )}
                  {r.order && (
                    <Link href={`/orders/${r.order.id}/expenses`} className="badge bg-white text-brand-700 ring-1 ring-slate-200 hover:bg-brand-50">
                      {r.order.label} →
                    </Link>
                  )}
                  {!r.order && r.vehicleId && (
                    <Link href={`/vehicles/${r.vehicleId}`} className="badge bg-white text-brand-700 ring-1 ring-slate-200 hover:bg-brand-50">
                      Fahrzeug →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {rows.length >= 300 && <p className="mt-3 text-center text-xs text-slate-500">Es werden die neuesten 300 Einträge angezeigt – bitte Filter verwenden.</p>}
    </>
  );
}
