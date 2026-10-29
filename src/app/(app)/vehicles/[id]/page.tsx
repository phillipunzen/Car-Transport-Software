import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

import { customerName, formatDate, orderNo } from "@/lib/format";
import { DAMAGE_AREAS, DAMAGE_SEVERITY, DAMAGE_TYPES, ORDER_STATUS } from "@/lib/labels";
import { customerOptions } from "@/lib/queries";
import { recognitionMode } from "@/lib/recognition";
import { Badge, Card, PageHeader } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";
import { SubmitButton } from "@/components/submit-button";
import { deleteVehicle, deleteVehicleDocument, updateVehicle } from "../actions";
import { requireOffice } from "@/lib/permissions";

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOffice();
  const { id } = await params;
  const vehicle = await db.vehicle.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: {
      customer: true,
      documents: { include: { file: true }, orderBy: { createdAt: "desc" } },
      orders: {
        orderBy: { createdAt: "desc" },
        include: { customer: true, protocols: true, damages: true },
      },
    },
  });
  if (!vehicle) notFound();
  const customers = await customerOptions(ctx.orgId);

  // Letzter bekannter Kilometerstand und Zustand aus den Protokollen
  const protocols = vehicle.orders
    .flatMap((o) => o.protocols.map((p) => ({ ...p, order: o })))
    .filter((p) => p.completedAt && p.mileage != null)
    .sort((a, b) => (b.performedAt?.getTime() ?? 0) - (a.performedAt?.getTime() ?? 0));
  const lastProtocol = protocols[0];
  const lastOrderWithDamages = vehicle.orders.find((o) => o.damages.length > 0);
  const lastDamages = lastOrderWithDamages
    ? lastOrderWithDamages.damages.filter((d) => d.stage === (lastOrderWithDamages.damages.some((x) => x.stage === "DELIVERY") ? "DELIVERY" : "PICKUP"))
    : [];

  return (
    <>
      <PageHeader
        back={{ href: "/vehicles", label: "Fahrzeuge" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Fahrzeug"}
            {vehicle.licensePlate && <span className="rounded border border-slate-300 bg-white px-2 font-mono text-base">{vehicle.licensePlate}</span>}
          </span>
        }
        subtitle={vehicle.vin ?? "FIN unbekannt"}
        actions={
          <>
            <a href={`/api/vehicles/${vehicle.id}/logbook`} className="btn-secondary">
              Fahrtenbuch (CSV)
            </a>
            <Link href={`/orders/new?vehicleId=${vehicle.id}`} className="btn-primary">
              + Neuer Auftrag
            </Link>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card title="Stammdaten">
            <VehicleForm action={updateVehicle} vehicle={vehicle} customers={customers} recognition={recognitionMode()} />
          </Card>
          <form action={deleteVehicle}>
            <input type="hidden" name="id" value={vehicle.id} />
            <SubmitButton className="btn-danger" pendingText="Löschen…" confirm="Fahrzeug aus dem Bestand löschen? Bestehende Aufträge bleiben unverändert.">
              Aus Bestand löschen
            </SubmitButton>
          </form>
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Card title="Auf einen Blick">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Kunde</dt>
                <dd className="text-right">
                  {vehicle.customer ? (
                    <Link href={`/customers/${vehicle.customer.id}`} className="text-brand-600">
                      {customerName(vehicle.customer)}
                    </Link>
                  ) : (
                    "–"
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Überführungen</dt>
                <dd>{vehicle.orders.length}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Letzter km-Stand</dt>
                <dd>{lastProtocol ? `${lastProtocol.mileage!.toLocaleString("de-DE")} km (${formatDate(lastProtocol.performedAt)})` : "–"}</dd>
              </div>
            </dl>
          </Card>
          <Card title={`Dokumente (${vehicle.documents.length})`}>
            {vehicle.documents.length === 0 ? (
              <p className="text-sm text-slate-500">Noch keine Dokumente – z. B. den Fahrzeugschein im Formular hinzufügen.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3">
                {vehicle.documents.map((d) => (
                  <li key={d.id} className="overflow-hidden rounded-lg border border-slate-200">
                    <a href={`/api/files/${d.fileId}`} target="_blank" rel="noreferrer" className="block bg-slate-50">
                      {d.file.mimeType === "application/pdf" ? (
                        <div className="flex aspect-[4/3] items-center justify-center text-sm font-semibold text-slate-500">PDF</div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/files/${d.fileId}`} alt="Fahrzeugdokument" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                      )}
                    </a>
                    <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs">
                      <span className="truncate text-slate-500">{formatDate(d.createdAt)}</span>
                      <form action={deleteVehicleDocument}>
                        <input type="hidden" name="documentId" value={d.id} />
                        <SubmitButton className="text-red-500" pendingText="…" confirm="Dokument löschen?">
                          Löschen
                        </SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {lastOrderWithDamages && (
            <Card title="Zuletzt dokumentierte Schäden">
              <p className="mb-2 text-xs text-slate-500">
                Aus Auftrag{" "}
                <Link href={`/orders/${lastOrderWithDamages.id}/condition`} className="text-brand-600">
                  {orderNo(lastOrderWithDamages.number)}
                </Link>
              </p>
              <ul className="space-y-1 text-sm">
                {lastDamages.map((d) => (
                  <li key={d.id}>
                    • {DAMAGE_AREAS[d.area] ?? d.area} – {DAMAGE_TYPES[d.type] ?? d.type} ({DAMAGE_SEVERITY[d.severity]?.label})
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Auftragshistorie">
            {vehicle.orders.length === 0 ? (
              <p className="text-sm text-slate-500">Noch keine Aufträge mit diesem Fahrzeug.</p>
            ) : (
              <ul className="-my-2 divide-y divide-slate-100">
                {vehicle.orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-2 py-2 hover:text-brand-600">
                      <span className="min-w-0 text-sm">
                        <span className="font-medium">{orderNo(o.number)}</span> · {formatDate(o.pickupDate ?? o.createdAt)}
                        <span className="block truncate text-xs text-slate-500">
                          {o.pickupCity ?? "?"} → {o.deliveryCity ?? "?"} · {customerName(o.customer)}
                        </span>
                      </span>
                      <Badge className={ORDER_STATUS[o.status].color}>{ORDER_STATUS[o.status].label}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
