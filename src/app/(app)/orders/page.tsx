import Link from "next/link";
import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { isDriver, orderWhere } from "@/lib/permissions";
import { customerName, formatDateTime, orderNo } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/labels";
import { Badge, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Aufträge" };

const FILTERS: { key: string; label: string; statuses?: OrderStatus[] }[] = [
  { key: "active", label: "Aktiv", statuses: ["DRAFT", "PLANNED", "IN_TRANSIT", "DELIVERED"] },
  { key: "PLANNED", label: "Geplant", statuses: ["PLANNED"] },
  { key: "IN_TRANSIT", label: "Unterwegs", statuses: ["IN_TRANSIT"] },
  { key: "DELIVERED", label: "Abzurechnen", statuses: ["DELIVERED"] },
  { key: "INVOICED", label: "Abgerechnet", statuses: ["INVOICED"] },
  { key: "all", label: "Alle" },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; mine?: string }> }) {
  const ctx = await requireCtx();
  const { q, f = "active", mine } = await searchParams;
  const filter = FILTERS.find((x) => x.key === f) ?? FILTERS[0];

  const driver = isDriver(ctx.role);
  const where: Prisma.OrderWhereInput = {
    ...orderWhere(ctx),
    ...(filter.statuses ? { status: { in: filter.statuses } } : {}),
    ...(mine ? { assignedToId: ctx.user.id } : {}),
    ...(q
      ? {
          OR: [
            { licensePlate: { contains: q } },
            { vin: { contains: q } },
            { make: { contains: q } },
            { model: { contains: q } },
            { reference: { contains: q } },
            { pickupCity: { contains: q } },
            { deliveryCity: { contains: q } },
            { customer: { OR: [{ companyName: { contains: q } }, { lastName: { contains: q } }] } },
            ...(/^\d+$/.test(q.replace(/^A-?/i, "")) ? [{ number: Number(q.replace(/^A-?/i, "")) }] : []),
          ],
        }
      : {}),
  };
  const orders = await db.order.findMany({
    where,
    include: { customer: true, assignedTo: true },
    orderBy: [{ pickupDate: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    take: 200,
  });

  const qs = (params: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ q, f, mine, ...params }).filter(([, v]) => v) as [string, string][]);
    return `/orders?${p}`;
  };

  return (
    <>
      <PageHeader
        title={driver ? "Meine Aufträge" : "Aufträge"}
        actions={
          !driver && (
            <>
              <Link href="/orders/templates" className="btn-secondary">
                Vorlagen
              </Link>
              <Link href="/orders/new" className="btn-primary">
                + Neuer Auftrag
              </Link>
            </>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {FILTERS.map((x) => (
            <Link
              key={x.key}
              href={qs({ f: x.key })}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${x.key === filter.key ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
            >
              {x.label}
            </Link>
          ))}
          {!driver && (
            <Link
              href={qs({ mine: mine ? undefined : "1" })}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${mine ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
            >
              Meine
            </Link>
          )}
        </div>
        <form>
          <input type="hidden" name="f" value={f} />
          {mine && <input type="hidden" name="mine" value="1" />}
          <input name="q" defaultValue={q} placeholder="Kennzeichen, FIN, Kunde, Ort…" className="input mt-0 sm:w-72" />
        </form>
      </div>

      {orders.length === 0 ? (
        <Empty title="Keine Aufträge gefunden" action={<Link href="/orders/new" className="btn-primary">Auftrag anlegen</Link>} />
      ) : (
        <div className="grid gap-3">
          {orders.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="card flex flex-col gap-2 p-4 transition hover:border-brand-500/50 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{orderNo(o.number)}</span>
                  <Badge className={ORDER_STATUS[o.status].color}>{ORDER_STATUS[o.status].label}</Badge>
                  {o.licensePlate && <span className="rounded border border-slate-300 bg-white px-1.5 font-mono text-xs">{o.licensePlate}</span>}
                </div>
                <p className="mt-1 truncate text-sm text-slate-700">
                  {[o.make, o.model].filter(Boolean).join(" ") || "Fahrzeug"} · {customerName(o.customer)}
                </p>
                <p className="truncate text-sm text-slate-500">
                  {o.pickupCity ?? "?"} → {o.deliveryCity ?? "?"}
                </p>
              </div>
              <div className="shrink-0 text-sm text-slate-500 sm:text-right">
                <p>{o.pickupDate ? formatDateTime(o.pickupDate) : "Kein Termin"}</p>
                {o.assignedTo && <p>👤 {o.assignedTo.name ?? o.assignedTo.email}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
