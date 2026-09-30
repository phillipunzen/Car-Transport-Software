import type { Order } from "@prisma/client";
import { db } from "@/lib/db";
import { customerName, toDateTimeLocal } from "@/lib/format";
import { effectiveConditions } from "@/lib/pricing";

export async function customerOptions(orgId: string) {
  const [customers, org] = await Promise.all([
    db.customer.findMany({ where: { organizationId: orgId }, orderBy: [{ companyName: "asc" }, { lastName: "asc" }] }),
    db.organization.findUniqueOrThrow({ where: { id: orgId } }),
  ]);
  return customers.map((c) => ({
    conditions: effectiveConditions(org, c),
    id: c.id,
    name: customerName(c) + (c.city ? ` (${c.city})` : ""),
    displayName: customerName(c),
    contact: [c.firstName, c.lastName].filter(Boolean).join(" ") || null,
    street: c.street,
    zip: c.zip,
    city: c.city,
    phone: c.phone,
  }));
}

export async function memberOptions(orgId: string) {
  const members = await db.membership.findMany({ where: { organizationId: orgId }, include: { user: true } });
  return members.map((m) => ({ id: m.userId, name: m.user.name ?? m.user.email }));
}

export function orderToFormValues(o: Order): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined) continue;
    if (v instanceof Date) out[k] = toDateTimeLocal(v);
    else out[k] = String(v);
  }
  return out;
}

export async function getOrder(orgId: string, id: string) {
  return db.order.findFirst({
    where: { id, organizationId: orgId },
    include: { customer: true, assignedTo: true },
  });
}
