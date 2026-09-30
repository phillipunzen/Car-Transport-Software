import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { validToken } from "@/lib/public";
import { TRANSPORT_MODE } from "@/lib/labels";
import { QuoteResponse } from "@/components/quote-response";

export const metadata: Metadata = { title: "Ihr Angebot", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!validToken(token)) notFound();
  const quote = await db.quote.findUnique({ where: { publicToken: token }, include: { organization: true, items: { orderBy: { position: "asc" } } } });
  if (!quote) notFound();
  const org = quote.organization;
  const company = org.companyName ?? org.name;
  const expired = quote.validUntil && quote.validUntil.getTime() < Date.now() - 86400000;
  const open = quote.status !== "ACCEPTED" && quote.status !== "DECLINED" && !expired;
  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <header>
          <p className="font-semibold">{company}</p>
          <h1 className="text-2xl font-bold">Angebot {quote.number}</h1>
          <p className="text-sm text-slate-500">
            vom {formatDate(quote.createdAt)}
            {quote.validUntil && ` · gültig bis ${formatDate(quote.validUntil)}`}
          </p>
        </header>
        <section className="card card-body space-y-3">
          <p className="text-lg font-semibold">
            {quote.pickupCity ?? "?"} → {quote.deliveryCity ?? "?"}
          </p>
          <p className="text-sm text-slate-600">
            {[TRANSPORT_MODE[quote.transportMode], [quote.make, quote.model].filter(Boolean).join(" "), quote.licensePlate, quote.pickupDate ? `Wunschtermin ${formatDate(quote.pickupDate)}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <ul className="divide-y divide-slate-100 text-sm">
            {quote.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-4 py-2">
                <span className="whitespace-pre-wrap">{i.description}</span>
                <span className="shrink-0 tabular-nums">{formatMoney(toNumber(i.quantity) * toNumber(i.unitPrice))}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-sm">
            <span>Netto {formatMoney(quote.netTotal)}{!quote.smallBusiness && ` · zzgl. USt ${formatMoney(quote.vatTotal)}`}</span>
            <span className="text-base font-bold">{formatMoney(quote.grossTotal)}</span>
          </div>
          <a href={`/q/${token}/pdf`} target="_blank" rel="noreferrer" className="btn-secondary">
            Angebot als PDF
          </a>
        </section>
        {open ? (
          <QuoteResponse token={token} total={formatMoney(quote.grossTotal)} />
        ) : (
          <div className="card card-body text-center text-sm text-slate-600">
            {quote.status === "ACCEPTED" ? "✓ Dieses Angebot wurde angenommen – vielen Dank!" : quote.status === "DECLINED" ? "Dieses Angebot wurde abgelehnt." : "Dieses Angebot ist abgelaufen. Gerne erstellen wir Ihnen ein neues."}
          </div>
        )}
        <footer className="text-center text-sm text-slate-500">
          Fragen? {company}
          {org.phone && ` · ${org.phone}`}
          {org.email && ` · ${org.email}`}
        </footer>
      </div>
    </main>
  );
}
