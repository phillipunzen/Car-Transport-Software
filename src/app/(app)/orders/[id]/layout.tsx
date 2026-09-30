import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { customerName, orderNo, toNumber } from "@/lib/format";
import { missingOrderData, orderSteps, parseSkipped, type OrderStepInput } from "@/lib/order-steps";
import { ORDER_STATUS } from "@/lib/labels";
import { Badge, PageHeader } from "@/components/ui";
import { OrderTabs } from "@/components/order-tabs";
import { OrderProgress } from "@/components/order-progress";
import { isDriver, orderWhere } from "@/lib/permissions";

export default async function OrderLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const order = await db.order.findFirst({
    where: orderWhere(ctx, { id }),
    include: {
      customer: true,
      quote: { select: { id: true, number: true } },
      protocols: { select: { type: true, completedAt: true } },
      invoices: { where: { status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, take: 1 },
      collectiveInvoice: true,
      _count: { select: { photos: true, damages: true, expenses: true } },
    },
  });
  if (!order) notFound();

  // Fortschritt: was ist erledigt, was ist der nächste Schritt?
  const [photoStages, damageStages] = await Promise.all([
    db.photo.groupBy({ by: ["stage"], where: { orderId: order.id }, _count: true }),
    db.damage.groupBy({ by: ["stage"], where: { orderId: order.id }, _count: true }),
  ]);
  const count = (rows: { stage: string; _count: number }[], stage: string) => rows.find((r) => r.stage === stage)?._count ?? 0;
  const protocolState = (type: string) => {
    const p = order.protocols.find((x) => x.type === type);
    return p?.completedAt ? "done" : p ? "draft" : "none";
  };
  const collective = order.collectiveInvoice && order.collectiveInvoice.status !== "CANCELLED" ? order.collectiveInvoice : null;
  const invoice = order.invoices[0] ?? collective;
  const input: OrderStepInput = {
    ...order,
    price: order.pricingType === "PER_KM" ? toNumber(order.distanceKm) * toNumber(order.pricePerKm) : toNumber(order.price),
    photos: { PICKUP: count(photoStages, "PICKUP"), DELIVERY: count(photoStages, "DELIVERY") },
    damages: { PICKUP: count(damageStages, "PICKUP"), DELIVERY: count(damageStages, "DELIVERY") },
    protocols: { PICKUP: protocolState("PICKUP"), DELIVERY: protocolState("DELIVERY") },
    expenses: order._count.expenses,
    invoice: invoice ? { status: invoice.status as "DRAFT" | "ISSUED" | "PAID", number: invoice.number } : null,
    skipped: parseSkipped(order.skippedSteps),
  };
  const vehicle = [order.make, order.model].filter(Boolean).join(" ");
  const driver = isDriver(ctx.role);
  return (
    <>
      <PageHeader
        back={{ href: "/orders", label: "Aufträge" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {orderNo(order.number)}
            <Badge className={ORDER_STATUS[order.status].color}>{ORDER_STATUS[order.status].label}</Badge>
          </span>
        }
        subtitle={
          <>
            {customerName(order.customer)}
            {vehicle && ` · ${vehicle}`}
            {order.licensePlate && ` · ${order.licensePlate}`}
            {order.quote && (
              <>
                {" · "}
                <Link href={`/quotes/${order.quote.id}`} className="text-brand-600">
                  Angebot {order.quote.number}
                </Link>
              </>
            )}
          </>
        }
      />
        <OrderProgress
          orderId={order.id}
          steps={driver ? orderSteps(input).filter((st) => st.key !== "invoice" && st.key !== "payment") : orderSteps(input)}
          invoiceId={driver ? null : (invoice?.id ?? null)}
          invoiceNumber={invoice?.number ?? null}
          expenses={order._count.expenses}
          missing={missingOrderData(input)}
          cancelled={order.status === "CANCELLED"}
        />
      <OrderTabs id={order.id} counts={order._count} />
      {children}
    </>
  );
}
