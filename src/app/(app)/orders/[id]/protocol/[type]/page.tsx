import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { canManage, requireCtx } from "@/lib/org";
import { formatDateTime, toDateTimeLocal } from "@/lib/format";
import { CHECKLIST_ITEMS, CLEANLINESS, DAMAGE_AREAS, DAMAGE_SEVERITY, DAMAGE_TYPES } from "@/lib/labels";
import { Card, Dl } from "@/components/ui";
import { ProtocolForm } from "@/components/protocol-form";
import { SubmitButton } from "@/components/submit-button";
import { reopenProtocol } from "../actions";

export default async function ProtocolPage({ params }: { params: Promise<{ id: string; type: string }> }) {
  const ctx = await requireCtx();
  const { id, type: rawType } = await params;
  if (rawType !== "pickup" && rawType !== "delivery") notFound();
  const type = rawType === "pickup" ? "PICKUP" : "DELIVERY";
  const order = await db.order.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: { customer: true, protocols: true, damages: { where: { stage: type } }, _count: { select: { photos: { where: { stage: type } } } } },
  });
  if (!order) notFound();
  const protocol = order.protocols.find((p) => p.type === type);
  const pickup = order.protocols.find((p) => p.type === "PICKUP");
  const checklist = (protocol?.checklist ?? (type === "DELIVERY" ? pickup?.checklist : null) ?? {}) as Record<string, boolean | number>;
  const title = type === "PICKUP" ? "Abholprotokoll" : "Übergabeprotokoll";
  const conditionHref = `/orders/${order.id}/condition?stage=${rawType}`;

  const summary = (
    <Card
      title="Fotos & Schäden"
      actions={
        <Link href={conditionHref} className="text-sm font-medium text-brand-600">
          {protocol?.completedAt ? "Ansehen" : "Erfassen"} →
        </Link>
      }
    >
      <p className="text-sm text-slate-600">
        {order._count.photos} Foto(s), {order.damages.length} Schaden/Schäden dokumentiert.
      </p>
      {order.damages.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {order.damages.map((d) => (
            <li key={d.id}>
              • {DAMAGE_AREAS[d.area]} – {DAMAGE_TYPES[d.type]} ({DAMAGE_SEVERITY[d.severity]?.label})
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  if (protocol?.completedAt) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-emerald-800">
            ✔ {title} abgeschlossen am {formatDateTime(protocol.completedAt)}
          </p>
          <div className="flex gap-2">
            <a href={`/api/orders/${order.id}/protocol/${rawType}/pdf`} target="_blank" rel="noreferrer" className="btn-primary">
              PDF herunterladen
            </a>
            {canManage(ctx.role) && (
              <form action={reopenProtocol}>
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="type" value={type} />
                <SubmitButton className="btn-secondary" confirm="Protokoll wieder zur Bearbeitung öffnen?">
                  Wieder öffnen
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
        <Card title={title}>
          <Dl
            items={[
              ["Datum", formatDateTime(protocol.performedAt)],
              ["Ort", protocol.location],
              ["Kilometerstand", protocol.mileage != null ? `${protocol.mileage.toLocaleString("de-DE")} km` : null],
              ["Tankfüllung / Ladestand", protocol.fuelLevel != null ? `${protocol.fuelLevel} %` : null],
              ["Sauberkeit außen", protocol.exteriorClean ? CLEANLINESS[protocol.exteriorClean] : null],
              ["Sauberkeit innen", protocol.interiorClean ? CLEANLINESS[protocol.interiorClean] : null],
              [type === "PICKUP" ? "Übergeben von" : "Empfangen von", protocol.handoverName],
              ["Bemerkungen", protocol.notes],
            ]}
          />
          <div className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
            {CHECKLIST_ITEMS.map((i) => (
              <p key={i.key}>
                {i.kind === "count" ? `${checklist[i.key] ?? 0} ×` : checklist[i.key] ? "✔" : "✗"} {i.label}
              </p>
            ))}
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              ["Kunde / Übergebender", protocol.signatureCustomer],
              ["Fahrer", protocol.signatureDriver],
            ].map(([label, sig]) => (
              <div key={label}>
                <p className="text-xs font-medium uppercase text-slate-500">Unterschrift {label}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {sig && <img src={sig} alt={`Unterschrift ${label}`} className="mt-1 h-28 rounded border border-slate-200 bg-white" />}
              </div>
            ))}
          </div>
        </Card>
        {summary}
      </div>
    );
  }

  const address = type === "PICKUP" ? [order.pickupStreet, order.pickupZip, order.pickupCity] : [order.deliveryStreet, order.deliveryZip, order.deliveryCity];
  return (
    <div className="space-y-6">
      {summary}
      <ProtocolForm
        orderId={order.id}
        type={type}
        terms={ctx.org.protocolTerms}
        values={{
          performedAt: toDateTimeLocal(protocol?.performedAt ?? new Date()),
          location: protocol?.location ?? address.filter(Boolean).join(" "),
          mileage: protocol?.mileage?.toString() ?? "",
          fuelLevel: protocol?.fuelLevel ?? 50,
          checklist,
          exteriorClean: protocol?.exteriorClean ?? "",
          interiorClean: protocol?.interiorClean ?? "",
          notes: protocol?.notes ?? "",
          handoverName:
            protocol?.handoverName ?? (type === "PICKUP" ? order.pickupContact : order.deliveryContact) ?? "",
          signatureCustomer: protocol?.signatureCustomer ?? null,
          signatureDriver: protocol?.signatureDriver ?? null,
        }}
      />
    </div>
  );
}
