import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/org";
import { customerOptions, getOrder, memberOptions, orderToFormValues } from "@/lib/queries";
import { aiEnabled } from "@/lib/ai";
import { OrderForm } from "@/components/order-form";
import { updateOrder } from "../../actions";

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const order = await getOrder(ctx.orgId, id);
  if (!order) notFound();
  const [customers, members] = await Promise.all([customerOptions(ctx.orgId), memberOptions(ctx.orgId)]);
  return (
    <OrderForm
      action={updateOrder}
      customers={customers}
      members={members}
      values={orderToFormValues(order)}
      orderId={order.id}
      aiEnabled={aiEnabled()}
    />
  );
}
