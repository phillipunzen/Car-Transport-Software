import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

import { formatDate, formatDateTime } from "@/lib/format";
import { INQUIRY_STATUS, TRANSPORT_MODE } from "@/lib/labels";
import { Badge, Card, Dl, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { deleteInquiry, inquiryToOrder, inquiryToQuote, setInquiryStatus } from "../actions";
import { requireOffice } from "@/lib/permissions";

export default async function InquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOffice();
  const { id } = await params;
  const i = await db.inquiry.findFirst({ where: { id, organizationId: ctx.orgId }, include: { quote: true, order: true } });
  if (!i) notFound();
  const date = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? formatDate(new Date(`${s}T12:00:00Z`)) : s);
  const addr = (street: string | null, zip: string | null, city: string | null) => [street, [zip, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return (
    <>
      <PageHeader
        back={{ href: "/inquiries", label: "Anfragen" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {i.pickupCity} → {i.deliveryCity}
            <Badge className={INQUIRY_STATUS[i.status].color}>{INQUIRY_STATUS[i.status].label}</Badge>
          </span>
        }
        subtitle={`Eingegangen am ${formatDateTime(i.createdAt)}`}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Kontakt">
            <Dl
              items={[
                ["Name", i.contactName],
                ["Firma", i.companyName],
                ["E-Mail", <a key="m" href={`mailto:${i.email}`} className="text-brand-600">{i.email}</a>],
                ["Telefon", i.phone ? <a key="t" href={`tel:${i.phone.replace(/\s/g, "")}`} className="text-brand-600">{i.phone}</a> : null],
              ]}
            />
          </Card>
          <Card title="Überführung">
            <Dl
              items={[
                ["Art", TRANSPORT_MODE[i.transportMode]],
                ["Abholung", addr(i.pickupStreet, i.pickupZip, i.pickupCity)],
                ["Wunschtermin", date(i.pickupDate)],
                ["Ziel", addr(i.deliveryStreet, i.deliveryZip, i.deliveryCity)],
                ["Spätestens", date(i.deliveryDate)],
                ["Fahrzeug", [i.make, i.model].filter(Boolean).join(" ") || null],
                ["Kennzeichen", i.licensePlate],
                ["FIN", i.vin],
                ["Hinweise", i.notes],
              ]}
            />
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Bearbeiten">
            <div className="space-y-2">
              {i.quote ? (
                <Link href={`/quotes/${i.quote.id}`} className="btn-secondary w-full">
                  Angebot {i.quote.number} öffnen
                </Link>
              ) : (
                <form action={inquiryToQuote}>
                  <input type="hidden" name="id" value={i.id} />
                  <SubmitButton className="btn-primary w-full">Angebot erstellen</SubmitButton>
                </form>
              )}
              {i.order ? (
                <Link href={`/orders/${i.order.id}`} className="btn-secondary w-full">
                  Auftrag öffnen
                </Link>
              ) : (
                <form action={inquiryToOrder}>
                  <input type="hidden" name="id" value={i.id} />
                  <SubmitButton className="btn-secondary w-full" confirm="Anfrage direkt als Auftrag übernehmen (ohne Angebot)?">
                    Direkt als Auftrag übernehmen
                  </SubmitButton>
                </form>
              )}
              {i.status === "NEW" && !i.quote && !i.order && (
                <form action={setInquiryStatus}>
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="status" value="REJECTED" />
                  <SubmitButton className="btn-secondary w-full">Ablehnen</SubmitButton>
                </form>
              )}
              {i.status === "REJECTED" && (
                <form action={setInquiryStatus}>
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="status" value="NEW" />
                  <SubmitButton className="btn-secondary w-full">Wieder öffnen</SubmitButton>
                </form>
              )}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Der Kunde wird anhand der E-Mail-Adresse zugeordnet oder automatisch angelegt.
            </p>
          </Card>
          <form action={deleteInquiry}>
            <input type="hidden" name="id" value={i.id} />
            <SubmitButton className="btn-danger w-full" confirm="Anfrage löschen?">
              Anfrage löschen
            </SubmitButton>
          </form>
        </div>
      </div>
    </>
  );
}
