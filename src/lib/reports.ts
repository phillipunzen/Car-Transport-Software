import { db } from "@/lib/db";
import { berlinDay, dayBounds, nextDayKey } from "@/lib/calendar";
import { customerName, toNumber } from "@/lib/format";
import { computeTotals } from "@/lib/invoice";
import { driverPayFor } from "@/lib/driver-pay";

export type Period = { key: string; label: string; from: string; to: string };

/** Zeitraum aus der URL: Voreinstellungen oder frei (from/to als YYYY-MM-DD, jeweils einschließlich). */
export function periodFrom(p: string | undefined, from?: string, to?: string): Period {
  const today = berlinDay(new Date());
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const month = (yy: number, mm: number) => ({ from: `${yy}-${pad(mm)}-01`, to: `${yy}-${pad(mm)}-${lastDay(yy, mm)}` });
  const re = /^\d{4}-\d{2}-\d{2}$/;
  switch (p) {
    case "month":
      return { key: "month", label: "Dieser Monat", ...month(y, m) };
    case "lastmonth": {
      const [yy, mm] = m === 1 ? [y - 1, 12] : [y, m - 1];
      return { key: "lastmonth", label: "Letzter Monat", ...month(yy, mm) };
    }
    case "lastyear":
      return { key: "lastyear", label: `Jahr ${y - 1}`, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case "custom":
      if (from && to && re.test(from) && re.test(to) && from <= to) return { key: "custom", label: "Zeitraum", from, to };
      break;
  }
  return { key: "year", label: `Jahr ${y}`, from: `${y}-01-01`, to: `${y}-12-31` };
}

const net = (gross: number, vat: number) => gross / (1 + vat / 100);

export async function loadReport(orgId: string, period: Period) {
  const start = dayBounds(period.from).start;
  const end = dayBounds(nextDayKey(period.to)).start;

  const [invoices, orders, members, org] = await Promise.all([
    db.invoice.findMany({
      where: { organizationId: orgId, status: { not: "DRAFT" }, issueDate: { gte: start, lt: end } },
      include: { customer: true, items: true },
      orderBy: { issueDate: "asc" },
    }),
    db.order.findMany({
      where: { organizationId: orgId, status: { not: "CANCELLED" }, pickupDate: { gte: start, lt: end } },
      include: { customer: true, assignedTo: true, expenses: true },
    }),
    db.membership.findMany({ where: { organizationId: orgId }, include: { user: true } }),
    db.organization.findUniqueOrThrow({ where: { id: orgId } }),
  ]);

  // Umsatz: alle festgeschriebenen Rechnungen (Storno + Stornorechnung heben sich auf)
  const revenue = invoices.reduce((s, i) => s + toNumber(i.netTotal), 0);
  const km = orders.reduce((s, o) => s + toNumber(o.distanceKm), 0);
  const expenseNet = orders.reduce((s, o) => s + o.expenses.reduce((x, e) => x + net(toNumber(e.amountGross), toNumber(e.vatRate)), 0), 0);
  const memberOf = (userId: string | null) => members.find((m) => m.userId === userId);
  const driverCost = org.moduleDriverPay ? orders.reduce((s, o) => s + driverPayFor(o, memberOf(o.assignedToId)), 0) : 0;
  const ratings = orders.filter((o) => o.feedbackRating).map((o) => o.feedbackRating!);

  // Umsatz je Monat
  const months: { key: string; label: string; revenue: number; orders: number }[] = [];
  for (let d = new Date(`${period.from.slice(0, 7)}-01T12:00:00Z`); d.toISOString().slice(0, 7) <= period.to.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) {
    const key = d.toISOString().slice(0, 7);
    months.push({ key, label: d.toLocaleDateString("de-DE", { month: "short", year: "2-digit", timeZone: "UTC" }), revenue: 0, orders: 0 });
    if (months.length > 36) break;
  }
  for (const i of invoices) {
    const mm = months.find((x) => x.key === berlinDay(i.issueDate!).slice(0, 7));
    if (mm) mm.revenue += toNumber(i.netTotal);
  }
  for (const o of orders) {
    const mm = months.find((x) => x.key === berlinDay(o.pickupDate!).slice(0, 7));
    if (mm) mm.orders += 1;
  }

  // Kunden
  const customers = new Map<string, { id: string; name: string; orders: number; km: number; revenue: number }>();
  const cust = (c: { id: string } & Parameters<typeof customerName>[0]) => {
    if (!customers.has(c.id)) customers.set(c.id, { id: c.id, name: customerName(c), orders: 0, km: 0, revenue: 0 });
    return customers.get(c.id)!;
  };
  for (const o of orders) {
    const c = cust(o.customer);
    c.orders += 1;
    c.km += toNumber(o.distanceKm);
  }
  for (const i of invoices) cust(i.customer).revenue += toNumber(i.netTotal);

  // Fahrer: Touren, km, Einsatztage, Auslastung (Einsatztage / Werktage Mo–Fr)
  let workdays = 0;
  for (let k = period.from; k <= period.to; k = nextDayKey(k)) {
    const wd = new Date(`${k}T12:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) workdays++;
  }
  const drivers = members
    .map((m) => {
      const list = orders.filter((o) => o.assignedToId === m.userId);
      const days = new Set(list.map((o) => berlinDay(o.pickupDate!)));
      return {
        id: m.userId,
        name: m.user.name ?? m.user.email,
        tours: list.length,
        km: list.reduce((s, o) => s + toNumber(o.distanceKm), 0),
        days: days.size,
        utilization: workdays ? days.size / workdays : 0,
        revenue: list.reduce((s, o) => s + (o.pricingType === "PER_KM" ? toNumber(o.distanceKm) * toNumber(o.pricePerKm) : toNumber(o.price)), 0),
        pay: org.moduleDriverPay ? list.reduce((s, o) => s + driverPayFor(o, m), 0) : null,
      };
    })
    .filter((d) => d.tours > 0)
    .sort((a, b) => b.tours - a.tours);

  return {
    revenue,
    orders: orders.length,
    km,
    perKm: km ? revenue / km : null,
    expenseNet,
    driverCost,
    margin: revenue - expenseNet - driverCost,
    rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    ratings: ratings.length,
    months,
    customers: [...customers.values()].sort((a, b) => b.revenue - a.revenue),
    drivers,
    workdays,
    invoices: invoices.map((i) => ({
      number: i.number!,
      issueDate: i.issueDate!,
      customerNumber: i.customer.number,
      customerName: customerName(i.customer),
      smallBusiness: i.smallBusiness,
      net: toNumber(i.netTotal),
      gross: toNumber(i.grossTotal),
      byRate: (() => {
        const t = computeTotals(
          i.items.map((it) => ({ description: "", unit: "", quantity: toNumber(it.quantity), unitPrice: toNumber(it.unitPrice), vatRate: toNumber(it.vatRate) })),
          i.smallBusiness,
        );
        const rates = new Map<number, number>();
        for (const it of i.items) {
          const rate = i.smallBusiness ? 0 : toNumber(it.vatRate);
          const lineNet = Math.round(toNumber(it.quantity) * toNumber(it.unitPrice) * 100) / 100;
          rates.set(rate, (rates.get(rate) ?? 0) + lineNet);
        }
        return [...rates.entries()].map(([rate, n]) => ({ rate, gross: Math.round((n + (t.vat.find((v) => v.rate === rate)?.amount ?? 0)) * 100) / 100 }));
      })(),
    })),
  };
}
