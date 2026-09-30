import { notFound } from "next/navigation";
import { db } from "@/lib/db";

import { customerOptions } from "@/lib/queries";
import { geoEnabled } from "@/lib/geo";
import { vehicleOptions } from "@/lib/vehicles";
import { toDateTimeLocal } from "@/lib/format";
import { OrderForm } from "@/components/order-form";
import { PageHeader } from "@/components/ui";
import { updateQuoteDetails } from "../../actions";
import { requireOffice } from "@/lib/permissions";

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOffice();
  const { id } = await params;
  const quote = await db.quote.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!quote) notFound();
  const [customers, vehicles] = await Promise.all([customerOptions(ctx.orgId), vehicleOptions(ctx.orgId)]);
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(quote)) {
    if (v === null || v === undefined) continue;
    values[k] = v instanceof Date ? toDateTimeLocal(v) : typeof v === "object" ? String(v).replace(".", ",") : String(v);
  }
  return (
    <>
      <PageHeader
        title={`Angebot ${quote.number} – Eckdaten`}
        subtitle="Beim Speichern werden Transport- und Rückreiseposition neu berechnet. Selbst ergänzte Positionen bleiben erhalten."
        back={{ href: `/quotes/${quote.id}`, label: "Angebot" }}
      />
      <OrderForm action={updateQuoteDetails} mode="quote" quoteId={quote.id} customers={customers} members={[]} vehicles={vehicles} values={values} recognition="off" geo={geoEnabled()} />
    </>
  );
}
