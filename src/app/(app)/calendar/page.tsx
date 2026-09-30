import Link from "next/link";
import type { Order, User } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { memberOptions } from "@/lib/queries";
import { berlinDay, weekOf } from "@/lib/calendar";
import { formatDate, formatNumber, orderNo, toDateTimeLocal } from "@/lib/format";
import { isDriver } from "@/lib/permissions";
import { chainGaps, followUps, type Gap } from "@/lib/tour-chain";
import { ORDER_STATUS } from "@/lib/labels";
import { Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { planOrder } from "./actions";

export const metadata = { title: "Kalender" };

type Row = Order & { assignedTo: User | null };

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const time = (d: Date | null) => (d ? d.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }) : "");
const dayLabel = (key: string) => {
  const d = new Date(`${key}T12:00:00Z`);
  return `${WEEKDAYS[(d.getUTCDay() + 6) % 7]} ${key.slice(8, 10)}.${key.slice(5, 7)}.`;
};

function PlanForm({ order, members }: { order: Row; members: { id: string; name: string }[] }) {
  return (
    <form action={planOrder} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="orderId" value={order.id} />
      <select name="assignedToId" defaultValue={order.assignedToId ?? ""} className="input mt-0 w-auto min-w-[9rem] flex-1" aria-label="Fahrer">
        <option value="">– Fahrer –</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <input type="datetime-local" name="pickupDate" defaultValue={toDateTimeLocal(order.pickupDate)} className="input mt-0 w-auto flex-1" aria-label="Abholtermin" />
      <SubmitButton className="btn-primary py-2">Einplanen</SubmitButton>
    </form>
  );
}

function GapLine({ gap }: { gap: Gap }) {
  return (
    <p className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      <span className="text-slate-400">⤷</span>
      {gap.same ? (
        <>Anschluss vor Ort ({gap.to}) – keine Leerfahrt</>
      ) : (
        <>
          Leerfahrt {gap.from} → {gap.to}
          {gap.km !== null ? ` · ${formatNumber(gap.km, 0)} km${gap.minutes ? `, ca. ${Math.floor(gap.minutes / 60)}:${String(gap.minutes % 60).padStart(2, "0")} Std.` : ""}` : ""}
          <a href={gap.mapsUrl} target="_blank" rel="noreferrer" className="text-brand-600">
            Route
          </a>
        </>
      )}
    </p>
  );
}

function Chip({ o, showDriver }: { o: Row; showDriver?: boolean }) {
  const cancelled = o.status === "CANCELLED";
  return (
    <Link
      href={`/orders/${o.id}`}
      className={`block rounded-md border px-2 py-1 text-xs leading-tight hover:border-brand-400 ${cancelled ? "border-slate-200 bg-slate-50 text-slate-400 line-through" : `border-transparent ${ORDER_STATUS[o.status].color}`}`}
      title={`${orderNo(o.number)} · ${ORDER_STATUS[o.status].label}`}
    >
      <span className="font-semibold">{time(o.pickupDate)}</span> {o.pickupCity ?? "?"} → {o.deliveryCity ?? "?"}
      {(o.licensePlate || o.make) && <span className="block truncate opacity-80">{o.licensePlate ?? o.make}</span>}
      {showDriver && <span className="block truncate opacity-80">{o.assignedTo?.name ?? "offen"}</span>}
    </Link>
  );
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string; mine?: string }> }) {
  const ctx = await requireCtx();
  const { week, mine: mineParam } = await searchParams;
  const driver = isDriver(ctx.role);
  const mine = driver ? "1" : mineParam;
  const w = weekOf(week);
  const today = berlinDay(new Date());
  const [orders, unplanned, members, planned] = await Promise.all([
    db.order.findMany({
      where: { organizationId: ctx.orgId, pickupDate: { gte: w.start, lt: w.end }, ...(mine ? { assignedToId: ctx.user.id } : {}) },
      include: { assignedTo: true },
      orderBy: { pickupDate: "asc" },
    }),
    db.order.findMany({
      where: {
        organizationId: ctx.orgId,
        status: { in: ["DRAFT", "PLANNED"] },
        OR: [{ pickupDate: null }, { assignedToId: null }],
        ...(driver ? { id: "-" } : {}),
      },
      include: { assignedTo: true },
      orderBy: [{ pickupDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 50,
    }),
    memberOptions(ctx.orgId),
    // Geplante Touren der nächsten Wochen – für Anschluss-Vorschläge
    driver
      ? Promise.resolve([] as Row[])
      : db.order.findMany({
          where: {
            organizationId: ctx.orgId,
            status: { in: ["PLANNED", "IN_TRANSIT"] },
            assignedToId: { not: null },
            pickupDate: { gte: new Date(Date.now() - 86400000), lt: new Date(Date.now() + 21 * 86400000) },
          },
          include: { assignedTo: true },
          orderBy: { pickupDate: "asc" },
        }),
  ]);
  // Leerfahrten zwischen aufeinanderfolgenden Touren eines Fahrers (je Tag)
  const budget = { left: 8 };
  const gapByTarget = new Map<string, Gap>();
  for (const d of w.days) {
    const dayList = orders.filter((o) => o.pickupDate && berlinDay(o.pickupDate) === d && o.assignedToId && o.status !== "CANCELLED");
    for (const driverId of new Set(dayList.map((o) => o.assignedToId))) {
      for (const g of await chainGaps(dayList.filter((o) => o.assignedToId === driverId), budget)) gapByTarget.set(g.toId, g);
    }
  }
  const byDay = (key: string, list: Row[]) => list.filter((o) => o.pickupDate && berlinDay(o.pickupDate) === key);
  const lanes = [...members.filter((m) => !mine || m.id === ctx.user.id), ...(mine ? [] : [{ id: "", name: "Nicht zugewiesen" }])].filter(
    (lane) => lane.id !== "" || orders.some((o) => !o.assignedToId),
  );
  const q = (params: Record<string, string | undefined>) => {
    const sp = new URLSearchParams(Object.entries({ week: w.days[0], mine, ...params }).filter(([, v]) => v) as [string, string][]);
    return `/calendar?${sp}`;
  };

  return (
    <>
      <PageHeader
        title="Kalender & Touren"
        subtitle={`KW ${isoWeek(w.days[3])} · ${formatDate(new Date(`${w.days[0]}T12:00:00Z`))} – ${formatDate(new Date(`${w.days[6]}T12:00:00Z`))}`}
        actions={
          <Link href="/calendar/setup" className="btn-secondary">
            📅 Kalender-Abo
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={q({ week: w.prev })} className="btn-secondary px-3" aria-label="Vorherige Woche">
          ←
        </Link>
        <Link href={q({ week: today })} className="btn-secondary">
          Heute
        </Link>
        <Link href={q({ week: w.next })} className="btn-secondary px-3" aria-label="Nächste Woche">
          →
        </Link>
        <div className={driver ? "hidden" : "ml-auto flex gap-1"}>
          <Link href={q({ mine: undefined })} className={`rounded-full px-3 py-1.5 text-sm font-medium ${!mine ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            Alle Fahrer
          </Link>
          <Link href={q({ mine: "1" })} className={`rounded-full px-3 py-1.5 text-sm font-medium ${mine ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            Nur meine
          </Link>
        </div>
      </div>

      {/* Wochenraster je Fahrer (Tablet/Desktop) */}
      <div className="card mb-6 hidden overflow-x-auto md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-32 border-b border-slate-200 p-2 text-left text-xs font-semibold uppercase text-slate-500">Fahrer</th>
              {w.days.map((d) => (
                <th key={d} className={`border-b border-l border-slate-200 p-2 text-left text-xs font-semibold ${d === today ? "bg-brand-50 text-brand-700" : "text-slate-500"}`}>
                  {dayLabel(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lanes.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
                  Keine Touren in dieser Woche.
                </td>
              </tr>
            )}
            {lanes.map((lane) => {
              const laneOrders = orders.filter((o) => (o.assignedToId ?? "") === lane.id);
              return (
                <tr key={lane.id || "none"} className="align-top">
                  <td className="border-b border-slate-100 p-2 text-sm font-medium">{lane.name}</td>
                  {w.days.map((d) => (
                    <td key={d} className={`space-y-1 border-b border-l border-slate-100 p-1 ${d === today ? "bg-brand-50/40" : ""}`}>
                      {byDay(d, laneOrders).map((o) => (
                        <Chip key={o.id} o={o} />
                      ))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tagesliste mit Umplanen (Smartphone: Hauptansicht) */}
        <div className="space-y-4 lg:col-span-2">
          {w.days.map((d) => {
            const list = byDay(d, orders);
            if (list.length === 0 && d !== today) return null;
            return (
              <Card key={d} title={`${dayLabel(d)}${d === today ? " · heute" : ""}`}>
                {list.length === 0 ? (
                  <p className="text-sm text-slate-500">Keine Touren.</p>
                ) : (
                  <ul className="-my-2 divide-y divide-slate-100">
                    {[...list]
                      .sort((a, b) => (a.assignedTo?.name ?? "~").localeCompare(b.assignedTo?.name ?? "~") || a.pickupDate!.getTime() - b.pickupDate!.getTime())
                      .map((o) => (
                      <li key={o.id} className="py-2">
                        {gapByTarget.has(o.id) && <GapLine gap={gapByTarget.get(o.id)!} />}
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/orders/${o.id}`} className="min-w-0 text-sm hover:text-brand-600">
                            <span className="font-semibold">{time(o.pickupDate)}</span> · {orderNo(o.number)} · {o.pickupCity ?? "?"} → {o.deliveryCity ?? "?"}
                            <span className="block text-xs text-slate-500">
                              {[o.make, o.model, o.licensePlate].filter(Boolean).join(" ")} · {o.assignedTo?.name ?? "kein Fahrer"}
                            </span>
                          </Link>
                          <span className={`badge shrink-0 ${ORDER_STATUS[o.status].color}`}>{ORDER_STATUS[o.status].label}</span>
                        </div>
                        {!driver && ["DRAFT", "PLANNED"].includes(o.status) && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs font-medium text-brand-600">Umplanen</summary>
                            <div className="mt-2">
                              <PlanForm order={o} members={members} />
                            </div>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
          {orders.length === 0 && <p className="text-sm text-slate-500">In dieser Woche sind keine Touren geplant.</p>}
        </div>

        <div className={driver ? "hidden" : "space-y-4"}>
          <Card title={`Noch einzuplanen (${unplanned.length})`}>
            {unplanned.length === 0 ? (
              <p className="text-sm text-slate-500">Alle Aufträge haben Termin und Fahrer. 👍</p>
            ) : (
              <ul className="-my-2 divide-y divide-slate-100">
                {unplanned.map((o) => (
                  <li key={o.id} className="space-y-2 py-3">
                    {followUps(o, planned).map((f) => (
                      <form key={f.id} action={planOrder} className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">
                        <input type="hidden" name="orderId" value={o.id} />
                        <input type="hidden" name="assignedToId" value={f.assignedToId!} />
                        <input type="hidden" name="pickupDate" value={toDateTimeLocal(o.pickupDate ?? new Date(f.pickupDate!.getTime() + ((f.durationMinutes ?? 150) + 30) * 60000))} />
                        <span className="flex-1">
                          💡 Anschluss an {orderNo(f.number)}: {f.assignedTo?.name ?? "Fahrer"} ist am {formatDate(f.pickupDate)} in {f.deliveryCity ?? "der Nähe"} – spart die Rückreise.
                        </span>
                        <SubmitButton className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white">Einplanen</SubmitButton>
                      </form>
                    ))}
                    <Link href={`/orders/${o.id}`} className="block text-sm hover:text-brand-600">
                      <span className="font-medium">{orderNo(o.number)}</span> · {o.pickupCity ?? "?"} → {o.deliveryCity ?? "?"}
                      <span className="block text-xs text-slate-500">
                        {!o.pickupDate && "kein Termin"}
                        {!o.pickupDate && !o.assignedToId && " · "}
                        {!o.assignedToId && "kein Fahrer"}
                      </span>
                    </Link>
                    <PlanForm order={o} members={members} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="So funktioniert die Tourenplanung">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
              <li>
                Aufträge ohne Termin oder Fahrer stehen unter <strong>„Noch einzuplanen“</strong>. Fahrer und Abholtermin wählen, <strong>Einplanen</strong> – fertig.
              </li>
              <li>Geplante Touren erscheinen im Wochenraster in der Zeile des Fahrers. Über „Umplanen“ lassen sich Termin und Fahrer jederzeit ändern.</li>
              <li>
                Zwischen zwei Touren eines Fahrers zeigt die Tagesliste die <strong>Leerfahrt</strong> (km und Fahrzeit). Endet eine Tour in der Nähe einer offenen Abholung, erscheint ein
                grüner <strong>Anschluss-Vorschlag</strong> – so entfällt die Rückreise.
              </li>
              <li>
                Jeder Fahrer sieht seine Touren unter <strong>„Heute“</strong> – mit Navigation, Anruf beim Kontakt und dem nächsten Arbeitsschritt.
              </li>
              <li>
                Mit dem <Link href="/calendar/setup" className="font-medium text-brand-600">Kalender-Abo</Link> erscheinen die Touren automatisch im iPhone-, Google- oder Outlook-Kalender.
              </li>
            </ol>
            <p className="mt-3 text-xs text-slate-500">Fahrer lädst du unter Einstellungen → Team ein. Farben: Status des Auftrags (z. B. geplant, unterwegs, zugestellt).</p>
          </Card>
        </div>
      </div>
    </>
  );
}

function isoWeek(key: string) {
  const d = new Date(`${key}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}
