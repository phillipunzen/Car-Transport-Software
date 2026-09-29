import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { customerName, orderNo } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/labels";
import { Badge, PageHeader } from "@/components/ui";
import { OrderTabs } from "@/components/order-tabs";

export default async function OrderLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const order = await db.order.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: { customer: true, _count: { select: { photos: true, damages: true, expenses: true } } },
  });
  if (!order) notFound();
  const vehicle = [order.make, order.model].filter(Boolean).join(" ");
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
          </>
        }
      />
      <OrderTabs id={order.id} counts={order._count} />
      {children}
    </>
  );
}
