import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOffice } from "@/lib/permissions";
import { customerName, formatDate, formatMoney, toNumber } from "@/lib/format";
import { discountInfo } from "@/lib/pricing";
import { matchTransaction, type OpenInvoice } from "@/lib/bank";
import { Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { applyMatches, ignoreTransaction, importStatement } from "./actions";

export const metadata = { title: "Zahlungsabgleich" };

const TONE: Record<string, string> = {
  sicher: "bg-emerald-100 text-emerald-800",
  wahrscheinlich: "bg-blue-100 text-blue-800",
  prüfen: "bg-amber-100 text-amber-800",
};

export default async function BankPage({ searchParams }: { searchParams: Promise<{ imported?: string; total?: string; paid?: string; error?: string }> }) {
  const ctx = await requireOffice();
  if (!ctx.org.moduleBankImport) redirect("/settings/modules");
  const sp = await searchParams;
  const [txs, invoices, done] = await Promise.all([
    db.bankTransaction.findMany({ where: { organizationId: ctx.orgId, invoiceId: null, ignored: false }, orderBy: { bookingDate: "desc" }, take: 200 }),
    db.invoice.findMany({ where: { organizationId: ctx.orgId, status: "ISSUED", correctsNumber: null }, include: { customer: true, dunnings: true }, orderBy: { issueDate: "asc" } }),
    db.bankTransaction.findMany({ where: { organizationId: ctx.orgId, OR: [{ invoiceId: { not: null } }, { ignored: true }] }, include: { invoice: true }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  // Erwartete Beträge je Rechnung: voll, mit Skonto, mit Mahngebühren
  const open: OpenInvoice[] = invoices.map((i) => {
    const gross = toNumber(i.grossTotal);
    const fees = i.dunnings.reduce((s, d) => s + toNumber(d.fee), 0);
    const skonto = discountInfo(gross, i.discountPercent, i.discountDays, i.issueDate);
    return { id: i.id, number: i.number!, customerName: customerName(i.customer), gross, payable: [gross, ...(skonto ? [skonto.payable] : []), ...(fees ? [gross + fees] : [])] };
  });
  const rows = txs.map((t) => ({ t, match: matchTransaction({ amount: toNumber(t.amount), counterparty: t.counterparty, purpose: t.purpose }, open) }));

  return (
    <>
      <PageHeader title="Zahlungsabgleich" subtitle={`${invoices.length} offene Rechnungen · ${formatMoney(open.reduce((s, i) => s + i.gross, 0))}`} back={{ href: "/invoices", label: "Rechnungen" }} />
      {sp.error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{sp.error === "datei" ? "Bitte eine Datei auswählen." : sp.error === "gross" ? "Die Datei ist zu groß." : sp.error}</p>}
      {sp.imported && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {sp.imported} neue Zahlungseingänge übernommen{Number(sp.total) > Number(sp.imported) ? ` (${Number(sp.total) - Number(sp.imported)} waren bereits bekannt)` : ""}.
        </p>
      )}
      {sp.paid && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{sp.paid} Rechnung(en) als bezahlt markiert.</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card title="Kontoauszug hochladen">
            <form action={importStatement} className="space-y-3">
              <input type="file" name="file" accept=".csv,.txt,.xml,text/csv,application/xml,text/xml" required className="input file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1" />
              <SubmitButton pendingText="Wird gelesen…">Einlesen</SubmitButton>
            </form>
            <p className="mt-3 text-xs text-slate-500">
              Im Online-Banking die Umsätze als <strong>CSV</strong> (z. B. Sparkasse „CSV-CAMT“, Volksbank, DKB, ING, Commerzbank) oder als <strong>CAMT.053 (XML)</strong> exportieren.
              Gelesen werden nur Zahlungseingänge; nichts wird automatisch verbucht.
            </p>
          </Card>
          {done.length > 0 && (
            <Card title="Zuletzt verbucht">
              <ul className="space-y-2 text-sm">
                {done.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {formatDate(t.bookingDate)} · {formatMoney(t.amount)} ·{" "}
                      {t.invoice ? (
                        <Link href={`/invoices/${t.invoice.id}`} className="text-brand-600">
                          {t.invoice.number}
                        </Link>
                      ) : (
                        <span className="text-slate-400">ignoriert</span>
                      )}
                    </span>
                    {t.ignored && (
                      <form action={ignoreTransaction}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="undo" value="1" />
                        <SubmitButton className="text-xs text-brand-600">zurückholen</SubmitButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <Card title={`Offene Zahlungseingänge (${rows.length})`} className="lg:col-span-2">
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">Keine offenen Zahlungseingänge. Lade einen Kontoauszug hoch, um Zahlungen zuzuordnen.</p>
          ) : (
            <form action={applyMatches} className="space-y-4">
              <ul className="-my-3 divide-y divide-slate-100">
                {rows.map(({ t, match }) => (
                  <li key={t.id} className="grid gap-2 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-start">
                    <input type="checkbox" name="apply" value={t.id} defaultChecked={match?.confidence === "sicher"} aria-label="Übernehmen" className="mt-1 h-4 w-4 accent-brand-600" />
                    <div className="min-w-0 text-sm">
                      <p>
                        <span className="font-semibold tabular-nums">{formatMoney(t.amount)}</span> · {formatDate(t.bookingDate)} · {t.counterparty ?? "unbekannt"}
                      </p>
                      <p className="truncate text-xs text-slate-500" title={t.purpose ?? ""}>
                        {t.purpose ?? "–"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select name={`invoice_${t.id}`} defaultValue={match?.invoiceId ?? ""} aria-label="Rechnung" className="input mt-0 w-auto max-w-full py-1.5 text-sm">
                          <option value="">– Rechnung wählen –</option>
                          {open.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.number} · {i.customerName} · {formatMoney(i.gross)}
                            </option>
                          ))}
                        </select>
                        {match && <span className={`badge ${TONE[match.confidence]}`}>{match.confidence}: {match.reason}</span>}
                      </div>
                    </div>
                    <button formAction={ignoreTransaction} name="id" value={t.id} className="text-xs text-slate-500 underline sm:mt-1">
                      Ignorieren
                    </button>
                  </li>
                ))}
              </ul>
              <SubmitButton confirm="Die angehakten Rechnungen als bezahlt markieren?">Ausgewählte als bezahlt markieren</SubmitButton>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
