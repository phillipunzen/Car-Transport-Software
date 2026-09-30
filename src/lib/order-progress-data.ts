import type { Order } from "@prisma/client";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { currentStep, orderSteps, parseSkipped, stepHref, type Step } from "@/lib/order-steps";

/** Fortschritt (nächster Schritt) für mehrere Aufträge auf einmal – z. B. für die Fahreransicht. */
export async function nextSteps(orders: Order[]) {
  const ids = orders.map((o) => o.id);
  const result = new Map<string, { step: Step | null; href: string | null }>();
  if (ids.length === 0) return result;
  const [photos, damages, protocols, expenses, invoices] = await Promise.all([
    db.photo.groupBy({ by: ["orderId", "stage"], where: { orderId: { in: ids } }, _count: true }),
    db.damage.groupBy({ by: ["orderId", "stage"], where: { orderId: { in: ids } }, _count: true }),
    db.protocol.findMany({ where: { orderId: { in: ids } }, select: { orderId: true, type: true, completedAt: true } }),
    db.expense.groupBy({ by: ["orderId"], where: { orderId: { in: ids } }, _count: true }),
    db.invoice.findMany({
      where: { orderId: { in: ids }, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, orderId: true, status: true, number: true },
    }),
  ]);
  const count = (rows: { orderId: string; stage: string; _count: number }[], id: string, stage: string) =>
    rows.find((r) => r.orderId === id && r.stage === stage)?._count ?? 0;
  for (const o of orders) {
    const prot = (type: string) => {
      const p = protocols.find((x) => x.orderId === o.id && x.type === type);
      return p?.completedAt ? ("done" as const) : p ? ("draft" as const) : ("none" as const);
    };
    const invoice = invoices.find((i) => i.orderId === o.id) ?? null;
    const steps = orderSteps({
      ...o,
      price: o.pricingType === "PER_KM" ? toNumber(o.distanceKm) * toNumber(o.pricePerKm) : toNumber(o.price),
      photos: { PICKUP: count(photos, o.id, "PICKUP"), DELIVERY: count(photos, o.id, "DELIVERY") },
      damages: { PICKUP: count(damages, o.id, "PICKUP"), DELIVERY: count(damages, o.id, "DELIVERY") },
      protocols: { PICKUP: prot("PICKUP"), DELIVERY: prot("DELIVERY") },
      expenses: expenses.find((e) => e.orderId === o.id)?._count ?? 0,
      invoice: invoice ? { status: invoice.status as "DRAFT" | "ISSUED" | "PAID", number: invoice.number } : null,
      skipped: parseSkipped(o.skippedSteps),
    });
    const step = currentStep(steps);
    result.set(o.id, { step, href: step ? stepHref(step.key, o.id, invoice?.id ?? null) : null });
  }
  return result;
}
