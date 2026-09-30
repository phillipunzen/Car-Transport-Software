import Link from "next/link";
import type { QuoteStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { customerName, formatDate, formatMoney } from "@/lib/format";
import { QUOTE_STATUS } from "@/lib/labels";
import { Badge, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Angebote" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireCtx();
  const { status } = await searchParams;
  const valid = status && QUOTE_STATUS[status] ? (status as QuoteStatus) : undefined;
  const [quotes, newInquiries] = await Promise.all([
    db.quote.findMany({
      where: { organizationId: ctx.orgId, ...(valid ? { status: valid } : {}) },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    db.inquiry.count({ where: { organizationId: ctx.orgId, status: "NEW" } }),
  ]);
  const now = new Date();
  const open = quotes.filter((q) => q.status === "SENT");

  return (
    <>
      <PageHeader
        title="Angebote"
        subtitle={`${open.length} offen · ${formatMoney(open.reduce((s, q) => s + Number(q.grossTotal), 0))}`}
        actions={
          <div className="flex gap-2">
            <Link href="/inquiries" className="btn-secondary">
              Anfragen{newInquiries > 0 && <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-xs text-white">{newInquiries}</span>}
            </Link>
            <Link href="/quotes/new" className="btn-primary">
              + Neues Angebot
            </Link>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap gap-1">
        {[["", "Alle"], ...Object.entries(QUOTE_STATUS).map(([k, v]) => [k, v.label])].map(([k, label]) => (
          <Link
            key={k}
            href={k ? `/quotes?status=${k}` : "/quotes"}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${(valid ?? "") === k ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      {quotes.length === 0 ? (
        <Empty title="Keine Angebote" text="Erstelle ein Angebot mit automatischer Preisberechnung aus Strecke und Kundenkonditionen." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Nummer</th>
                <th>Kunde</th>
                <th className="hidden md:table-cell">Strecke</th>
                <th className="hidden sm:table-cell">Gültig bis</th>
                <th className="text-right">Betrag</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const expired = q.status === "SENT" && q.validUntil && q.validUntil < now;
                return (
                  <tr key={q.id} className="hover:bg-slate-50">
                    <td>
                      <Link href={`/quotes/${q.id}`} className="font-medium text-brand-600">
                        {q.number}
                      </Link>
                    </td>
                    <td className="max-w-[12rem] truncate">{customerName(q.customer)}</td>
                    <td className="hidden md:table-cell">
                      {q.pickupCity ?? "?"} → {q.deliveryCity ?? "?"}
                    </td>
                    <td className={`hidden sm:table-cell ${expired ? "text-red-600" : ""}`}>{formatDate(q.validUntil)}</td>
                    <td className="text-right font-medium">{formatMoney(q.grossTotal)}</td>
                    <td>
                      <Badge className={expired ? "bg-orange-100 text-orange-700" : QUOTE_STATUS[q.status].color}>{expired ? "Abgelaufen" : QUOTE_STATUS[q.status].label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
