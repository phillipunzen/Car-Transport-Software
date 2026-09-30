import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOffice } from "@/lib/permissions";
import { customerName, formatDate, formatMoney, formatNumber, orderNo, toNumber } from "@/lib/format";
import { returnCost } from "@/lib/pricing";
import { Card, Empty, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createCollectiveInvoice } from "../actions";

export const metadata = { title: "Sammelrechnung" };

export default async function CollectiveInvoicePage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const ctx = await requireOffice();
  const { customerId } = await searchParams;
  // Abrechenbar: zugestellt, noch in keiner (nicht stornierten) Rechnung
  const billable: Prisma.OrderWhereInput = {
    organizationId: ctx.orgId,
    status: "DELIVERED",
    collectiveInvoiceId: null,
    invoices: { none: { status: { not: "CANCELLED" } } },
  };
  const groups = await db.order.groupBy({ by: ["customerId"], where: billable, _count: true });
  const customers = await db.customer.findMany({ where: { id: { in: groups.map((g) => g.customerId) } } });
  const selected = customerId ? await db.customer.findFirst({ where: { id: customerId, organizationId: ctx.orgId } }) : null;
  const orders = selected
    ? await db.order.findMany({
        where: { ...billable, customerId: selected.id },
        include: { protocols: { where: { type: "DELIVERY" } }, expenses: { where: { rebillable: true } }, quote: true },
        orderBy: [{ pickupDate: "asc" }, { number: "asc" }],
      })
    : [];
  const value = (o: (typeof orders)[number]) =>
    o.quote
      ? toNumber(o.quote.netTotal)
      : (o.pricingType === "PER_KM" ? toNumber(o.distanceKm) * toNumber(o.pricePerKm) : toNumber(o.price)) + returnCost(o, o.distanceKm);

  return (
    <>
      <PageHeader title="Sammelrechnung" subtitle="Mehrere zugestellte Aufträge eines Kunden in einer Rechnung abrechnen" back={{ href: "/invoices", label: "Rechnungen" }} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Kunden mit offenen Aufträgen">
          {groups.length === 0 ? (
            <p className="text-sm text-slate-500">Keine zugestellten, noch nicht abgerechneten Aufträge.</p>
          ) : (
            <ul className="-my-1 space-y-1">
              {customers
                .map((c) => ({ c, n: groups.find((g) => g.customerId === c.id)?._count ?? 0 }))
                .sort((a, b) => b.n - a.n)
                .map(({ c, n }) => (
                  <li key={c.id}>
                    <Link
                      href={`/invoices/collective?customerId=${c.id}`}
                      className={`flex justify-between rounded-lg px-3 py-2 text-sm ${c.id === selected?.id ? "bg-brand-50 font-semibold text-brand-700" : "hover:bg-slate-50"}`}
                    >
                      <span className="truncate">{customerName(c)}</span>
                      <span className="tabular-nums text-slate-500">{n}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </Card>
        <div className="lg:col-span-2">
          {!selected ? (
            <Empty title="Kunde wählen" text="Links einen Kunden auswählen, dann die Aufträge für die Sammelrechnung ankreuzen." />
          ) : (
            <Card title={`Aufträge von ${customerName(selected)}`}>
              <form action={createCollectiveInvoice} className="space-y-4">
                <input type="hidden" name="customerId" value={selected.id} />
                <ul className="divide-y divide-slate-100">
                  {orders.map((o) => (
                    <li key={o.id}>
                      <label className="flex items-center gap-3 py-2 text-sm font-normal">
                        <input type="checkbox" name="orderIds" value={o.id} defaultChecked className="h-4 w-4 accent-brand-600" />
                        <span className="flex-1">
                          <span className="font-medium">{orderNo(o.number)}</span> · {formatDate(o.protocols[0]?.performedAt ?? o.pickupDate)} · {o.pickupCity ?? "?"} → {o.deliveryCity ?? "?"}
                          {o.licensePlate && <span className="text-slate-500"> · {o.licensePlate}</span>}
                          {o.distanceKm && <span className="text-slate-500"> · {formatNumber(toNumber(o.distanceKm), 0)} km</span>}
                          {o.expenses.length > 0 && <span className="text-slate-500"> · {o.expenses.length} Auslage(n)</span>}
                        </span>
                        <span className="tabular-nums">{formatMoney(value(o))}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-slate-500">Beträge netto ohne Auslagen. Die Positionen lassen sich im Rechnungsentwurf noch anpassen.</p>
                <SubmitButton>Sammelrechnung erstellen</SubmitButton>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
