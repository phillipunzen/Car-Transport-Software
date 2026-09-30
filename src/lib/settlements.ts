import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { driverPayFor } from "@/lib/driver-pay";

/** Noch nicht abgerechnete, erledigte Touren und vorgestreckte Auslagen eines Fahrers bis zu einem Stichtag. */
export async function openItems(orgId: string, userId: string, until: Date) {
  const member = await db.membership.findFirst({ where: { organizationId: orgId, userId }, include: { user: true } });
  const orders = await db.order.findMany({
    where: {
      organizationId: orgId,
      assignedToId: userId,
      settlementId: null,
      status: { not: "CANCELLED" },
      protocols: { some: { type: "DELIVERY", completedAt: { not: null, lt: until } } },
    },
    include: { protocols: { where: { type: "DELIVERY" } } },
    orderBy: { pickupDate: "asc" },
  });
  const expenses = await db.expense.findMany({
    where: { reimburse: true, settlementId: null, order: { organizationId: orgId, assignedToId: userId }, OR: [{ date: { lt: until } }, { date: null }] },
    include: { order: { select: { number: true } } },
    orderBy: { date: "asc" },
  });
  const tours = orders.map((o) => ({
    id: o.id,
    number: o.number,
    date: o.protocols[0]?.performedAt ?? o.protocols[0]?.completedAt ?? o.pickupDate,
    route: `${o.pickupCity ?? "?"} → ${o.deliveryCity ?? "?"}`,
    km: toNumber(o.distanceKm),
    pay: driverPayFor(o, member),
    manual: o.driverPay !== null,
  }));
  const payTotal = Math.round(tours.reduce((s, t) => s + t.pay, 0) * 100) / 100;
  const expenseTotal = Math.round(expenses.reduce((s, e) => s + toNumber(e.amountGross), 0) * 100) / 100;
  return { member, tours, expenses, payTotal, expenseTotal };
}
