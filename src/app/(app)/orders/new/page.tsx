import { requireCtx } from "@/lib/org";
import { customerOptions, memberOptions } from "@/lib/queries";
import { recognitionMode } from "@/lib/recognition";
import { OrderForm } from "@/components/order-form";
import { PageHeader } from "@/components/ui";
import { createOrder } from "../actions";

export const metadata = { title: "Neuer Auftrag" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const ctx = await requireCtx();
  const { customerId } = await searchParams;
  const [customers, members] = await Promise.all([customerOptions(ctx.orgId), memberOptions(ctx.orgId)]);
  const values: Record<string, string> = { assignedToId: ctx.user.id };
  if (customerId) values.customerId = customerId;
  if (ctx.org.defaultPricePerKm) values.pricePerKm = String(ctx.org.defaultPricePerKm);
  return (
    <>
      <PageHeader title="Neuer Auftrag" back={{ href: "/orders", label: "Aufträge" }} />
      <OrderForm action={createOrder} customers={customers} members={members} values={values} recognition={recognitionMode()} />
    </>
  );
}
