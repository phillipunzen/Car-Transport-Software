import Link from "next/link";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { customerName, formatDateTime, formatMoney, orderNo, toNumber } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/labels";
import { berlinDay, dayBounds } from "@/lib/calendar";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Übersicht" };

function Stat({ label, value, href, hint }: { label: string; value: string | number; href: string; hint?: string }) {
  return (
    <Link href={href} className="card card-body transition hover:border-brand-500/50">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </Link>
  );
}

export default async function DashboardPage() {
  const ctx = await requireCtx();
  const orgId = ctx.orgId;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfToday = dayBounds(berlinDay(now)).start;

  const [statusCounts, openInvoices, monthRevenue, upcoming, recent, customers, newInquiries, openQuotes] = await Promise.all([
    db.order.groupBy({ by: ["status"], where: { organizationId: orgId }, _count: true }),
    db.invoice.findMany({ where: { organizationId: orgId, status: "ISSUED" }, select: { grossTotal: true, dueDate: true } }),
    db.invoice.aggregate({
      where: { organizationId: orgId, status: { in: ["ISSUED", "PAID"] }, issueDate: { gte: monthStart } },
      _sum: { netTotal: true },
    }),
    db.order.findMany({
      where: { organizationId: orgId, status: { in: ["DRAFT", "PLANNED", "IN_TRANSIT"] }, OR: [{ pickupDate: { gte: startOfToday } }, { status: "IN_TRANSIT" }] },
      include: { customer: true, assignedTo: true },
      orderBy: { pickupDate: "asc" },
      take: 8,
    }),
    db.order.findMany({ where: { organizationId: orgId }, include: { customer: true }, orderBy: { updatedAt: "desc" }, take: 6 }),
    db.customer.count({ where: { organizationId: orgId } }),
    db.inquiry.count({ where: { organizationId: orgId, status: "NEW" } }),
    db.quote.count({ where: { organizationId: orgId, status: "SENT" } }),
  ]);
  const count = (s: string) => statusCounts.find((c) => c.status === s)?._count ?? 0;
  const openSum = openInvoices.reduce((s, i) => s + toNumber(i.grossTotal), 0);
  const overdue = openInvoices.filter((i) => i.dueDate && i.dueDate < now).length;

  return (
    <>
      <PageHeader
        title={`Hallo${ctx.user.name ? `, ${ctx.user.name.split(" ")[0]}` : ""} 👋`}
        subtitle={ctx.org.name}
        actions={
          <>
            <Link href="/orders/new" className="btn-primary">
              + Neuer Auftrag
            </Link>
            <Link href="/customers/new" className="btn-secondary">
              + Kunde
            </Link>
          </>
        }
      />

      {customers === 0 && (
        <div className="mb-6 rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm text-slate-700">
          <p className="font-semibold">Los geht&apos;s in drei Schritten:</p>
          <ol className="mt-2 list-inside list-decimal space-y-1">
            <li>
              <Link href="/settings" className="text-brand-700 underline">
                Firmendaten & Bankverbindung
              </Link>{" "}
              für Rechnungen hinterlegen
            </li>
            <li>
              <Link href="/customers/new" className="text-brand-700 underline">
                Ersten Kunden anlegen
              </Link>
            </li>
            <li>Auftrag erstellen, Fahrzeug fotografieren, Protokolle ausfüllen & abrechnen</li>
          </ol>
        </div>
      )}

      {(newInquiries > 0 || overdue > 0) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {newInquiries > 0 && (
            <Link href="/inquiries" className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-200">
              📨 {newInquiries} neue {newInquiries === 1 ? "Anfrage" : "Anfragen"}
            </Link>
          )}
          {overdue > 0 && (
            <Link href="/invoices?status=OVERDUE" className="rounded-full bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-200">
              ⏰ {overdue} überfällige {overdue === 1 ? "Rechnung" : "Rechnungen"}
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Geplant" value={count("PLANNED") + count("DRAFT")} href="/orders?f=PLANNED" />
        <Stat label="Unterwegs" value={count("IN_TRANSIT")} href="/orders?f=IN_TRANSIT" />
        <Stat label="Abzurechnen" value={count("DELIVERED")} href="/orders?f=DELIVERED" hint="Zugestellt, noch keine Rechnung" />
        <Stat
          label="Offene Rechnungen"
          value={formatMoney(openSum)}
          href="/invoices?status=ISSUED"
          hint={`${openInvoices.length} offen${overdue ? ` · ${overdue} überfällig` : ""}`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Anstehende Überführungen" className="lg:col-span-2">
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">Keine anstehenden Aufträge.</p>
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {upcoming.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-brand-600">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {orderNo(o.number)} · {[o.make, o.model].filter(Boolean).join(" ") || o.licensePlate || "Fahrzeug"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {customerName(o.customer)} · {o.pickupCity ?? "?"} → {o.deliveryCity ?? "?"}
                        {o.assignedTo && ` · ${o.assignedTo.name ?? o.assignedTo.email}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge className={ORDER_STATUS[o.status].color}>{ORDER_STATUS[o.status].label}</Badge>
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(o.pickupDate)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <Card title="Touren & Angebote">
            <div className="grid grid-cols-2 gap-2">
              <Link href="/today" className="btn-secondary">
                Heute
              </Link>
              <Link href="/calendar" className="btn-secondary">
                Wochenplan
              </Link>
            </div>
            {openQuotes > 0 && (
              <Link href="/quotes?status=SENT" className="mt-3 block text-sm text-brand-600">
                {openQuotes} {openQuotes === 1 ? "Angebot wartet" : "Angebote warten"} auf Antwort →
              </Link>
            )}
          </Card>
          <Card title="Umsatz diesen Monat">
            <p className="text-2xl font-bold">{formatMoney(monthRevenue._sum.netTotal)}</p>
            <p className="text-xs text-slate-500">netto, festgeschriebene Rechnungen</p>
          </Card>
          <Card title="Zuletzt bearbeitet">
            <ul className="space-y-2">
              {recent.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="block truncate text-sm hover:text-brand-600">
                    {orderNo(o.number)} · {customerName(o.customer)}
                  </Link>
                </li>
              ))}
              {recent.length === 0 && <li className="text-sm text-slate-500">Noch keine Aufträge.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
