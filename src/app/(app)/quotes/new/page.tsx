import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { customerOptions } from "@/lib/queries";
import { geoEnabled } from "@/lib/geo";
import { vehicleOptions } from "@/lib/vehicles";
import { effectiveConditions } from "@/lib/pricing";
import { OrderForm } from "@/components/order-form";
import { PageHeader } from "@/components/ui";
import { createQuote } from "../actions";

export const metadata = { title: "Neues Angebot" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ customerId?: string; inquiryId?: string }> }) {
  const ctx = await requireCtx();
  const { customerId, inquiryId } = await searchParams;
  const [customers, vehicles] = await Promise.all([customerOptions(ctx.orgId), vehicleOptions(ctx.orgId)]);
  const values: Record<string, string> = {};
  const conditions = customers.find((c) => c.id === customerId)?.conditions ?? effectiveConditions(ctx.org, null);
  if (customerId) values.customerId = customerId;
  const fmt = (n: number | null) => (n === null ? undefined : String(n).replace(".", ","));
  if (fmt(conditions.pricePerKm)) values.pricePerKm = fmt(conditions.pricePerKm)!;
  values.returnType = conditions.returnType;
  if (fmt(conditions.returnFlat)) values.returnFlat = fmt(conditions.returnFlat)!;
  if (fmt(conditions.returnPerKm)) values.returnPerKm = fmt(conditions.returnPerKm)!;

  // Aus einer Auftragsanfrage: Eckdaten übernehmen
  if (inquiryId) {
    const inq = await db.inquiry.findFirst({ where: { id: inquiryId, organizationId: ctx.orgId } });
    if (inq) {
      Object.assign(
        values,
        Object.fromEntries(
          Object.entries({
            transportMode: inq.transportMode,
            pickupStreet: inq.pickupStreet,
            pickupZip: inq.pickupZip,
            pickupCity: inq.pickupCity,
            deliveryStreet: inq.deliveryStreet,
            deliveryZip: inq.deliveryZip,
            deliveryCity: inq.deliveryCity,
            licensePlate: inq.licensePlate,
            make: inq.make,
            model: inq.model,
            // Wunschtermin (nur Datum) → 9:00 Uhr als Vorschlag
            pickupDate: inq.pickupDate && /^\d{4}-\d{2}-\d{2}$/.test(inq.pickupDate) ? `${inq.pickupDate}T09:00` : null,
          }).filter(([, v]) => v),
        ) as Record<string, string>,
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Neues Angebot"
        subtitle="Preis wird aus Strecke und Konditionen berechnet – die Positionen kannst du danach frei anpassen."
        back={{ href: "/quotes", label: "Angebote" }}
      />
      <OrderForm
        action={createQuote}
        mode="quote"
        customers={customers}
        members={[]}
        vehicles={vehicles}
        values={values}
        recognition="off"
        geo={geoEnabled()}
        hidden={inquiryId ? { inquiryId } : undefined}
      />
    </>
  );
}

