import Link from "next/link";
import { returnCost } from "@/lib/pricing";
import { trackingUrl } from "@/lib/tracking";
import { mileageCheck } from "@/lib/mileage";
import { TrackingLink } from "@/components/tracking-link";
import { MoreSection } from "@/components/more-section";
import { saveAsTemplate } from "../templates/actions";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { canManage, requireCtx } from "@/lib/org";
import { customerName, orderNo, formatDateTime, formatMoney, formatNumber, toNumber } from "@/lib/format";
import { INVOICE_STATUS, ORDER_STATUS, RETURN_TYPE, TRANSPORT_MODE } from "@/lib/labels";
import { Badge, Card, Dl } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { EmailDocuments } from "@/components/email-documents";
import { emailDocumentsProps } from "@/lib/email-docs";
import { deleteOrder, setOrderStatus } from "../actions";
import { isDriver, orderWhere } from "@/lib/permissions";

function Address({ o, p }: { o: Record<string, unknown>; p: "pickup" | "delivery" }) {
  const g = (k: string) => (o[`${p}${k}`] as string | null) ?? null;
  const street = g("Street");
  const city = [g("Zip"), g("City")].filter(Boolean).join(" ");
  const mapsQuery = [street, city].filter(Boolean).join(", ");
  return (
    <div className="space-y-1 text-sm">
      {g("Name") && <p className="font-medium">{g("Name")}</p>}
      <p>{street ?? "–"}</p>
      <p>{city}</p>
      {g("Contact") && <p className="text-slate-500">👤 {g("Contact")}</p>}
      {g("Phone") && (
        <p>
          <a href={`tel:${g("Phone")}`} className="text-brand-600">
            📞 {g("Phone")}
          </a>
        </p>
      )}
      <p className="font-medium">🗓 {formatDateTime(o[`${p}Date`] as Date | null)}</p>
      {mapsQuery && (
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`} target="_blank" rel="noreferrer" className="text-sm text-brand-600">
          In Karte öffnen ↗
        </a>
      )}
    </div>
  );
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const order = await db.order.findFirst({
    where: orderWhere(ctx, { id }),
    include: {
      customer: true,
      assignedTo: true,
      protocols: true,
      expenses: true,
      invoices: { orderBy: { createdAt: "desc" } },
      collectiveInvoice: true,
      events: { orderBy: { createdAt: "desc" }, take: 20 },
      _count: { select: { damages: { where: { stage: "DELIVERY" } } } },
    },
  });
  if (!order) notFound();

  const driver = isDriver(ctx.role);
  const km = toNumber(order.distanceKm);
  const pickupP = order.protocols.find((p) => p.type === "PICKUP" && p.completedAt);
  const deliveryP = order.protocols.find((p) => p.type === "DELIVERY" && p.completedAt);
  const mileage = mileageCheck(pickupP?.mileage, deliveryP?.mileage, km || null);
  const price = order.pricingType === "PER_KM" ? km * toNumber(order.pricePerKm) : toNumber(order.price);
  const expenses = order.expenses.reduce((s, e) => s + toNumber(e.amountGross), 0);
  const route = [
    [order.pickupStreet, order.pickupZip, order.pickupCity].filter(Boolean).join(" "),
    [order.deliveryStreet, order.deliveryZip, order.deliveryCity].filter(Boolean).join(" "),
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card title="Fahrzeug" actions={<Link href={`/orders/${order.id}/edit`} className="text-sm font-medium text-brand-600">Bearbeiten</Link>}>
          <Dl
            items={[
              ["Kennzeichen", order.licensePlate && <span className="font-mono">{order.licensePlate}</span>],
              ["Fahrgestellnummer", order.vin && <span className="font-mono">{order.vin}</span>],
              ["Marke / Modell", [order.make, order.model].filter(Boolean).join(" ")],
              ["Farbe", order.color],
              ["Erstzulassung", order.firstRegistration],
              ["Fahrzeugtyp", order.vehicleType],
            ]}
          />
          {order.vehicleId && (
            <Link href={`/vehicles/${order.vehicleId}`} className="mt-4 inline-block text-sm font-medium text-brand-600">
              Fahrzeughistorie ansehen →
            </Link>
          )}
        </Card>

        <Card title="Route" actions={<Link href={`/orders/${order.id}/edit`} className="text-sm font-medium text-brand-600">Bearbeiten</Link>}>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Abholung</p>
              <Address o={order as unknown as Record<string, unknown>} p="pickup" />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Zustellung</p>
              <Address o={order as unknown as Record<string, unknown>} p="delivery" />
            </div>
          </div>
          {route[0] && route[1] && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(route[0])}&destination=${encodeURIComponent(route[1])}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary mt-4"
            >
              🧭 Route planen
            </a>
          )}
        </Card>

        {order.notes && (
          <Card title="Notizen">
            <p className="whitespace-pre-wrap text-sm">{order.notes}</p>
          </Card>
        )}
      </div>

      <div className="space-y-6">
        {(order.protocols.some((p) => p.completedAt) || order.invoices.some((i) => i.status !== "DRAFT")) && (
          <Card title="Dokumente an Kunden">
            <p className="mb-3 text-sm text-slate-600">Protokolle{order.invoices.length ? " und Rechnung" : ""} als PDF direkt per E-Mail senden.</p>
            <EmailDocuments
              className="btn-primary w-full"
              {...emailDocumentsProps({
                org: ctx.org,
                order,
                customer: order.customer,
                protocols: order.protocols,
                invoice: driver ? null : (order.invoices.find((i) => i.status !== "CANCELLED") ?? null),
                focus: "protocols",
                deliveryDamages: order._count.damages,
              })}
            />
            {order._count.damages > 0 && (
              <a href={`/api/orders/${order.id}/damage-report`} target="_blank" rel="noreferrer" className="btn-secondary mt-2 w-full">
                ⚠️ Schadensmeldung (PDF)
              </a>
            )}
          </Card>
        )}
        <Card title="Details">
          <Dl
            items={[
              ["Kunde", <Link key="c" href={`/customers/${order.customer.id}`} className="text-brand-600">{customerName(order.customer)}</Link>],
              ["Referenz", order.reference],
              ["Überführungsart", TRANSPORT_MODE[order.transportMode]],
              ["Fahrer", order.assignedTo?.name ?? order.assignedTo?.email],
              [
                "Entfernung",
                km
                  ? `${formatNumber(km, 1)} km${order.durationMinutes ? ` · ca. ${Math.floor(order.durationMinutes / 60)} Std. ${order.durationMinutes % 60} Min.` : ""}`
                  : null,
              ],
              ["Preis (netto)", !driver && price ? formatMoney(price) + (order.pricingType === "PER_KM" ? ` (${formatMoney(order.pricePerKm)}/km)` : "") : null],
              [
                "Rückreise",
                driver || order.returnType === "NONE"
                  ? null
                  : order.returnType === "RECEIPTS"
                    ? RETURN_TYPE.RECEIPTS
                    : `${formatMoney(returnCost(order, order.distanceKm))} (${order.returnType === "FLAT" ? "Pauschale" : `${formatMoney(order.returnPerKm)}/km`})`,
              ],
              ["Belege", !driver && expenses ? formatMoney(expenses) : null],
              [
                "Gefahren",
                mileage
                  ? `${formatNumber(mileage.driven, 0)} km${km ? ` (geplant ${formatNumber(km, 0)} km)` : ""}${mileage.message ? ` – ⚠️ ${mileage.message}` : ""}`
                  : null,
              ],
              ["Tank / Ladung", pickupP?.fuelLevel != null && deliveryP?.fuelLevel != null ? `${pickupP.fuelLevel} % → ${deliveryP.fuelLevel} %` : null],
            ]}
          />
        </Card>

        <MoreSection title="Status-Link, Verlauf & weitere Optionen">
        {order.status !== "CANCELLED" && (
          <Card title="Status-Link für den Kunden">
            <TrackingLink
              orderId={order.id}
              url={order.trackingToken ? trackingUrl(order.trackingToken) : null}
              email={order.customer.email}
              text={`Den aktuellen Stand Ihrer Fahrzeugüberführung ${orderNo(order.number)} sehen Sie hier:`}
            />
          </Card>
        )}
        {!driver && (order.invoices.length > 0 || order.collectiveInvoice) && (
          <Card title="Rechnungen">
            <ul className="space-y-2">
              {[...order.invoices, ...(order.collectiveInvoice ? [order.collectiveInvoice] : [])].map((i) => (
                <li key={i.id}>
                  <Link href={`/invoices/${i.id}`} className="flex items-center justify-between text-sm hover:text-brand-600">
                    <span>
                      {i.number ?? "Entwurf"} · {formatMoney(i.grossTotal)}
                    </span>
                    <Badge className={INVOICE_STATUS[i.status].color}>{INVOICE_STATUS[i.status].label}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="Verlauf">
          <ol className="space-y-3">
            {order.events.map((e) => (
              <li key={e.id} className="text-sm">
                <p>{e.message}</p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(e.createdAt)}
                  {e.userName && ` · ${e.userName}`}
                </p>
              </li>
            ))}
          </ol>
        </Card>

        {!driver && (
          <Card title="Weitere Aktionen">
            <div className="grid gap-2 sm:grid-cols-2">
              <Link href={`/orders/new?copyFrom=${order.id}`} className="btn-secondary">
                Auftrag kopieren
              </Link>
              <form action={saveAsTemplate}>
                <input type="hidden" name="orderId" value={order.id} />
                <SubmitButton className="btn-secondary w-full">Als Vorlage speichern</SubmitButton>
              </form>
            </div>
          </Card>
        )}
        <Card title="Status manuell ändern">
          <form action={setOrderStatus} className="flex gap-2">
            <input type="hidden" name="id" value={order.id} />
            <select name="status" defaultValue={order.status} className="input mt-0">
              {Object.entries(ORDER_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
            <SubmitButton className="btn-secondary">Setzen</SubmitButton>
          </form>
          {canManage(ctx.role) && (
            <form action={deleteOrder} className="mt-4">
              <input type="hidden" name="id" value={order.id} />
              <SubmitButton className="btn-danger w-full" pendingText="Löschen…" confirm="Auftrag inkl. Fotos, Protokollen und Belegen endgültig löschen?">
                Auftrag löschen
              </SubmitButton>
            </form>
          )}
        </Card>
        </MoreSection>
      </div>
    </div>
  );
}
