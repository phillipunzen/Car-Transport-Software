import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { customerName, formatDate, formatMoney, orderNo } from "@/lib/format";
import { portalCustomer } from "@/lib/portal";
import { ensureTrackingToken } from "@/lib/tracking";
import { InquiryForm } from "@/components/inquiry-form";

export const metadata: Metadata = { title: "Kundenportal", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "angenommen", cls: "bg-slate-100 text-slate-700" },
  PLANNED: { label: "geplant", cls: "bg-blue-100 text-blue-700" },
  IN_TRANSIT: { label: "unterwegs", cls: "bg-amber-100 text-amber-800" },
  DELIVERED: { label: "zugestellt", cls: "bg-emerald-100 text-emerald-700" },
  INVOICED: { label: "zugestellt", cls: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { label: "storniert", cls: "bg-red-100 text-red-700" },
};

export default async function PortalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ neu?: string }> }) {
  const { token } = await params;
  const { neu } = await searchParams;
  const customer = await portalCustomer(token);
  if (!customer) notFound();
  const org = customer.organization;
  const company = org.companyName ?? org.name;
  const since = new Date(Date.now() - 365 * 86400000);
  const [orders, quotes, invoices] = await Promise.all([
    db.order.findMany({
      where: { customerId: customer.id, OR: [{ status: { notIn: ["INVOICED", "CANCELLED"] } }, { updatedAt: { gte: since } }] },
      include: { protocols: { select: { type: true, completedAt: true } } },
      orderBy: [{ pickupDate: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
      take: 50,
    }),
    db.quote.findMany({ where: { customerId: customer.id, status: { in: ["DRAFT", "SENT"] }, publicToken: { not: null } }, orderBy: { createdAt: "desc" } }),
    db.invoice.findMany({ where: { customerId: customer.id, status: { not: "DRAFT" }, issueDate: { gte: since } }, orderBy: { issueDate: "desc" } }),
  ]);
  // Status-Links für laufende Aufträge bereitstellen
  const tracking = new Map<string, string>();
  for (const o of orders.filter((x) => ["PLANNED", "IN_TRANSIT"].includes(x.status)).slice(0, 10)) tracking.set(o.id, await ensureTrackingToken(o.id));
  const openSum = invoices.filter((i) => i.status === "ISSUED").reduce((s, i) => s + Number(i.grossTotal), 0);

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {org.logoFileId && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/portal/${token}/logo`} alt="" className="h-12 max-w-[8rem] object-contain" />
            )}
            <div>
              <p className="text-sm text-slate-500">{company} · Kundenportal</p>
              <h1 className="text-xl font-bold">{customerName(customer)}</h1>
            </div>
          </div>
          <a href="?neu=1#anfrage" className="btn-primary">
            + Neue Überführung anfragen
          </a>
        </header>

        {quotes.length > 0 && (
          <section className="card card-body">
            <h2 className="section-title mb-3">Offene Angebote</h2>
            <ul className="divide-y divide-slate-100">
              {quotes.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <span className="font-medium">{q.number}</span> · {q.pickupCity ?? "?"} → {q.deliveryCity ?? "?"} · {formatMoney(q.grossTotal)}
                    {q.validUntil && <span className="text-slate-500"> · gültig bis {formatDate(q.validUntil)}</span>}
                  </span>
                  <a href={`/q/${q.publicToken}`} className="btn-primary px-3 py-1.5 text-xs">
                    Ansehen & annehmen
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card card-body">
          <h2 className="section-title mb-3">Aufträge</h2>
          {orders.length === 0 ? (
            <p className="text-sm text-slate-500">Noch keine Aufträge.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {orders.map((o) => {
                const done = (t: string) => o.protocols.some((p) => p.type === t && p.completedAt);
                return (
                  <li key={o.id} className="py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="font-medium">{orderNo(o.number)}</span> · {o.pickupCity ?? "?"} → {o.deliveryCity ?? "?"}
                        {(o.make || o.licensePlate) && <span className="text-slate-500"> · {[o.make, o.model, o.licensePlate].filter(Boolean).join(" ")}</span>}
                      </span>
                      <span className={`badge ${STATUS[o.status].cls}`}>{STATUS[o.status].label}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs">
                      {o.pickupDate && <span className="text-slate-500">Termin {formatDate(o.pickupDate)}</span>}
                      {tracking.has(o.id) && (
                        <a href={`/t/${tracking.get(o.id)}`} className="text-brand-600">
                          Live-Status
                        </a>
                      )}
                      {done("PICKUP") && (
                        <a href={`/portal/${token}/protocol/${o.id}/pickup`} target="_blank" rel="noreferrer" className="text-brand-600">
                          Abholprotokoll
                        </a>
                      )}
                      {done("DELIVERY") && (
                        <a href={`/portal/${token}/protocol/${o.id}/delivery`} target="_blank" rel="noreferrer" className="text-brand-600">
                          Übergabeprotokoll
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card card-body">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Rechnungen</h2>
            {openSum > 0 && <span className="text-sm text-slate-600">offen: {formatMoney(openSum)}</span>}
          </div>
          {invoices.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Rechnungen in den letzten 12 Monaten.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {invoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <span className="font-medium">{i.number}</span> · {formatDate(i.issueDate)} · {formatMoney(i.grossTotal)}
                    <span className={`ml-2 text-xs ${i.status === "ISSUED" ? "text-amber-700" : "text-slate-500"}`}>
                      {i.status === "ISSUED" ? `offen, fällig ${formatDate(i.dueDate)}` : i.status === "PAID" ? "bezahlt" : "storniert"}
                    </span>
                  </span>
                  <a href={`/portal/${token}/invoice/${i.id}`} target="_blank" rel="noreferrer" className="text-brand-600">
                    PDF
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="anfrage" className={neu ? "" : "hidden"}>
          <h2 className="mb-3 text-lg font-semibold">Neue Überführung anfragen</h2>
          <InquiryForm
            token={token}
            company={company}
            portal
            defaults={{ contactName: [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customerName(customer), companyName: customer.companyName ?? "", email: customer.email ?? "", phone: customer.phone ?? "" }}
          />
        </section>

        <footer className="text-center text-sm text-slate-500">
          {company}
          {org.phone && ` · ${org.phone}`}
          {org.email && ` · ${org.email}`}
        </footer>
      </div>
    </main>
  );
}
