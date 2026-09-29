import Link from "next/link";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { customerName, formatDate } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Fahrzeuge" };

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireCtx();
  const { q } = await searchParams;
  const compact = q?.replace(/[\s-]/g, "");
  const vehicles = await db.vehicle.findMany({
    where: {
      organizationId: ctx.orgId,
      ...(q
        ? {
            OR: [
              { licensePlate: { contains: q } },
              ...(compact && compact !== q ? [{ licensePlate: { contains: compact } }] : []),
              { vin: { contains: q.toUpperCase() } },
              { make: { contains: q } },
              { model: { contains: q } },
              { customer: { OR: [{ companyName: { contains: q } }, { lastName: { contains: q } }] } },
            ],
          }
        : {}),
    },
    include: {
      customer: true,
      _count: { select: { orders: true } },
      orders: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, pickupDate: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });

  return (
    <>
      <PageHeader
        title="Fahrzeuge"
        subtitle="Alle Fahrzeuge aus bisherigen Aufträgen – für neue Aufträge einfach übernehmen."
        actions={
          <Link href="/vehicles/new" className="btn-primary">
            + Fahrzeug
          </Link>
        }
      />
      <form className="mb-4">
        <input name="q" defaultValue={q} placeholder="Kennzeichen, FIN, Marke, Modell oder Kunde…" className="input mt-0 max-w-md" />
      </form>
      {vehicles.length === 0 ? (
        <Empty
          title={q ? "Kein Fahrzeug gefunden" : "Noch keine Fahrzeuge"}
          text="Fahrzeuge werden automatisch gespeichert, sobald du in einem Auftrag Kennzeichen oder FIN einträgst."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((v) => {
            const last = v.orders[0];
            return (
              <div key={v.id} className="card flex flex-col p-4">
                <Link href={`/vehicles/${v.id}`} className="min-w-0 flex-1 hover:text-brand-600">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold">{[v.make, v.model].filter(Boolean).join(" ") || "Fahrzeug"}</p>
                    {v.licensePlate && <span className="shrink-0 rounded border border-slate-300 bg-white px-1.5 font-mono text-xs">{v.licensePlate}</span>}
                  </div>
                  <p className="truncate font-mono text-xs text-slate-500">{v.vin ?? "FIN unbekannt"}</p>
                  <p className="mt-2 truncate text-sm text-slate-600">{v.customer ? customerName(v.customer) : "Kein Kunde"}</p>
                  <p className="text-xs text-slate-500">
                    {v._count.orders} Auftr{v._count.orders === 1 ? "ag" : "äge"}
                    {last && ` · zuletzt ${formatDate(last.pickupDate ?? last.createdAt)}`}
                  </p>
                </Link>
                <Link href={`/orders/new?vehicleId=${v.id}`} className="btn-secondary mt-3 py-1.5 text-xs">
                  + Neuer Auftrag mit diesem Fahrzeug
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
