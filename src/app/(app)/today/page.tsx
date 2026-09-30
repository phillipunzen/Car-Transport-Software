import { Fragment } from "react";
import Link from "next/link";
import { chainGaps } from "@/lib/tour-chain";
import type { Customer, Order, Protocol, User } from "@prisma/client";
import { db } from "@/lib/db";
import { canManage, requireCtx } from "@/lib/org";
import { berlinDay, dayBounds, nextDayKey } from "@/lib/calendar";
import { orderNo } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/labels";
import { nextSteps } from "@/lib/order-progress-data";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Heute" };

type Tour = Order & { customer: Customer; assignedTo: User | null; protocols: Pick<Protocol, "type" | "completedAt">[] };

const time = (d: Date | null) => (d ? d.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }) : "–");
const addr = (street: string | null, zip: string | null, city: string | null) => [street, [zip, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

function TourCard({ o, next, showDriver }: { o: Tour; next?: { step: { label: string } | null; href: string | null }; showDriver: boolean }) {
  const pickedUp = o.protocols.some((p) => p.type === "PICKUP" && p.completedAt);
  // Vor der Abholung zum Abholort navigieren, danach zum Ziel
  const target = pickedUp
    ? { label: "Ziel", address: addr(o.deliveryStreet, o.deliveryZip, o.deliveryCity), contact: o.deliveryContact, phone: o.deliveryPhone }
    : { label: "Abholung", address: addr(o.pickupStreet, o.pickupZip, o.pickupCity), contact: o.pickupContact, phone: o.pickupPhone };
  const vehicle = [[o.make, o.model].filter(Boolean).join(" "), o.licensePlate].filter(Boolean).join(" · ");
  return (
    <li className="card overflow-hidden">
      <Link href={`/orders/${o.id}`} className="block p-4 hover:bg-slate-50">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-900">{time(o.pickupDate)}</span> · {orderNo(o.number)}
            {showDriver && ` · ${o.assignedTo?.name ?? "kein Fahrer"}`}
          </p>
          <span className={`badge ${ORDER_STATUS[o.status].color}`}>{ORDER_STATUS[o.status].label}</span>
        </div>
        <p className="mt-1 text-lg font-semibold">
          {o.pickupCity ?? "?"} → {o.deliveryCity ?? "?"}
        </p>
        <p className="text-sm text-slate-600">{[vehicle, o.customer.companyName ?? o.customer.lastName].filter(Boolean).join(" · ")}</p>
        {target.address && (
          <p className="mt-2 text-sm">
            <span className="text-slate-500">{target.label}:</span> {target.address}
            {target.contact && <span className="text-slate-500"> · {target.contact}</span>}
          </p>
        )}
        {o.notes && <p className="mt-2 line-clamp-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{o.notes}</p>}
      </Link>
      <div className="grid grid-cols-3 gap-px border-t border-slate-100 bg-slate-100 text-sm font-medium">
        {target.address ? (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target.address)}`}
            target="_blank"
            rel="noreferrer"
            className="bg-white px-2 py-3 text-center text-brand-700 hover:bg-slate-50"
          >
            🧭 Navigation
          </a>
        ) : (
          <span className="bg-white px-2 py-3 text-center text-slate-300">🧭 Navigation</span>
        )}
        {target.phone ? (
          <a href={`tel:${target.phone.replace(/[^\d+]/g, "")}`} className="bg-white px-2 py-3 text-center text-brand-700 hover:bg-slate-50">
            📞 Anrufen
          </a>
        ) : (
          <span className="bg-white px-2 py-3 text-center text-slate-300">📞 Anrufen</span>
        )}
        {next?.href && next.step ? (
          <Link href={next.href} className="bg-brand-600 px-2 py-3 text-center text-white hover:bg-brand-700">
            {next.step.label} →
          </Link>
        ) : (
          <Link href={`/orders/${o.id}`} className="bg-white px-2 py-3 text-center text-brand-700 hover:bg-slate-50">
            Öffnen →
          </Link>
        )}
      </div>
    </li>
  );
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const ctx = await requireCtx();
  const { all } = await searchParams;
  const showAll = Boolean(all) && canManage(ctx.role);
  const today = berlinDay(new Date());
  const { start, end } = dayBounds(today);
  const tomorrow = dayBounds(nextDayKey(today));
  const mine = showAll ? {} : { assignedToId: ctx.user.id };
  const include = { customer: true, assignedTo: true, protocols: { select: { type: true, completedAt: true } } } as const;

  const [onTheRoad, todays, overdue, upcoming] = await Promise.all([
    db.order.findMany({ where: { organizationId: ctx.orgId, ...mine, status: "IN_TRANSIT" }, include, orderBy: { pickupDate: "asc" } }),
    db.order.findMany({
      where: { organizationId: ctx.orgId, ...mine, status: { in: ["DRAFT", "PLANNED", "DELIVERED"] }, pickupDate: { gte: start, lt: end } },
      include,
      orderBy: { pickupDate: "asc" },
    }),
    db.order.findMany({
      where: { organizationId: ctx.orgId, ...mine, status: { in: ["DRAFT", "PLANNED"] }, pickupDate: { lt: start } },
      include,
      orderBy: { pickupDate: "asc" },
      take: 20,
    }),
    db.order.findMany({
      where: { organizationId: ctx.orgId, ...mine, status: { in: ["DRAFT", "PLANNED"] }, pickupDate: { gte: tomorrow.start, lt: tomorrow.end } },
      include,
      orderBy: { pickupDate: "asc" },
    }),
  ]);
  const steps = await nextSteps([...onTheRoad, ...todays, ...overdue]);
  // Eigene Tourenkette heute: Leerfahrt zwischen Zustellung und nächster Abholung
  const gaps = new Map((showAll ? [] : await chainGaps([...onTheRoad, ...todays])).map((g) => [g.toId, g]));
  const dateLabel = new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long" });
  const first = (ctx.user.name ?? "").split(" ")[0];
  const nothing = onTheRoad.length + todays.length + overdue.length === 0;

  const section = (title: string, list: Tour[], tone = "text-slate-500") =>
    list.length > 0 && (
      <section>
        <h2 className={`mb-2 text-sm font-semibold uppercase tracking-wide ${tone}`}>
          {title} ({list.length})
        </h2>
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((o) => (
            <Fragment key={o.id}>
              {gaps.has(o.id) && (
                <li className="-my-1 text-center text-xs text-slate-500 lg:col-span-2">
                  ⤓ {gaps.get(o.id)!.same ? `Anschluss vor Ort in ${gaps.get(o.id)!.to}` : `Leerfahrt nach ${gaps.get(o.id)!.to}${gaps.get(o.id)!.km !== null ? ` · ${Math.round(gaps.get(o.id)!.km!)} km` : ""}`}
                </li>
              )}
              <TourCard o={o} next={steps.get(o.id)} showDriver={showAll} />
            </Fragment>
          ))}
        </ul>
      </section>
    );

  return (
    <>
      <PageHeader
        title={first ? `Hallo ${first}!` : "Heute"}
        subtitle={`${dateLabel} · ${showAll ? "alle Fahrer" : "deine Touren"}`}
        actions={
          canManage(ctx.role) && (
            <Link href={showAll ? "/today" : "/today?all=1"} className="btn-secondary">
              {showAll ? "Nur meine" : "Alle Fahrer"}
            </Link>
          )
        }
      />
      <div className="space-y-6">
        {section("Unterwegs", onTheRoad, "text-blue-700")}
        {section("Heute", todays)}
        {section("Überfällig – noch nicht abgeholt", overdue, "text-red-600")}
        {nothing && <Empty title="Heute keine Touren" text={showAll ? "Für heute ist nichts geplant." : "Dir ist für heute keine Tour zugewiesen."} />}
        {upcoming.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Morgen ({upcoming.length})</h2>
            <ul className="card divide-y divide-slate-100">
              {upcoming.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50">
                    <span>
                      <span className="font-semibold">{time(o.pickupDate)}</span> · {o.pickupCity ?? "?"} → {o.deliveryCity ?? "?"}
                      {showAll && <span className="text-slate-500"> · {o.assignedTo?.name ?? "kein Fahrer"}</span>}
                    </span>
                    <span className="text-slate-400">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="text-center text-sm text-slate-500">
          <Link href="/calendar" className="text-brand-600">
            Wochenplan ansehen
          </Link>
          {" · "}
          <Link href="/calendar/setup" className="text-brand-600">
            Touren im Handy-Kalender
          </Link>
        </p>
      </div>
    </>
  );
}
