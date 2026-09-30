import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

import { customerName, formatDate, formatMoney, formatNumber, orderNo, toDateInput, toNumber } from "@/lib/format";
import { QUOTE_STATUS, RETURN_TYPE, TRANSPORT_MODE } from "@/lib/labels";
import { appUrl, mailEnabled } from "@/lib/mail";
import { randomBytes } from "node:crypto";
import { CopyField } from "@/components/copy-field";
import { Badge, Card, PageHeader } from "@/components/ui";
import { InvoiceEditor } from "@/components/invoice-editor";
import { EmailDocuments } from "@/components/email-documents";
import { SubmitButton } from "@/components/submit-button";
import { acceptQuote, deleteQuote, saveQuote, setQuoteStatus } from "../actions";
import { requireOffice } from "@/lib/permissions";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOffice();
  const { id } = await params;
  const quote = await db.quote.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: { customer: true, items: { orderBy: { position: "asc" } }, order: true, inquiry: true },
  });
  if (!quote) notFound();
  // Link zur Online-Annahme (wird beim ersten Öffnen erzeugt)
  if (!quote.publicToken && quote.status !== "ACCEPTED") {
    quote.publicToken = randomBytes(18).toString("base64url");
    await db.quote.update({ where: { id: quote.id }, data: { publicToken: quote.publicToken } });
  }
  const publicUrl = quote.publicToken ? `${appUrl()}/q/${quote.publicToken}` : null;
  const locked = quote.status === "ACCEPTED";
  const company = ctx.org.companyName ?? ctx.org.name;
  const c = quote.customer;
  const greeting = c.type === "PRIVATE" || c.lastName ? `Guten Tag ${[c.firstName, c.lastName].filter(Boolean).join(" ")}`.trim() : "Guten Tag";
  const route = `${quote.pickupCity ?? "?"} → ${quote.deliveryCity ?? "?"}`;

  const status = (s: string, label: string, cls = "btn-secondary w-full") => (
    <form action={setQuoteStatus}>
      <input type="hidden" name="id" value={quote.id} />
      <input type="hidden" name="status" value={s} />
      <SubmitButton className={cls}>{label}</SubmitButton>
    </form>
  );

  return (
    <>
      <PageHeader
        back={{ href: "/quotes", label: "Angebote" }}
        title={
          <span className="flex items-center gap-2">
            Angebot {quote.number}
            <Badge className={QUOTE_STATUS[quote.status].color}>{QUOTE_STATUS[quote.status].label}</Badge>
          </span>
        }
        subtitle={
          <>
            <Link href={`/customers/${quote.customerId}`} className="text-brand-600">
              {customerName(c)}
            </Link>
            {" · "}
            {route}
            {quote.inquiry && (
              <>
                {" · "}
                <Link href={`/inquiries/${quote.inquiry.id}`} className="text-brand-600">
                  aus Anfrage
                </Link>
              </>
            )}
          </>
        }
        actions={
          <a href={`/api/quotes/${quote.id}/pdf`} target="_blank" rel="noreferrer" className="btn-secondary">
            PDF
          </a>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {locked ? (
            <Card title="Positionen">
              <ul className="divide-y divide-slate-100 text-sm">
                {quote.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-4 py-2">
                    <span className="whitespace-pre-wrap">{i.description}</span>
                    <span className="shrink-0">{formatMoney(toNumber(i.quantity) * toNumber(i.unitPrice))}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-right font-bold">Gesamt {formatMoney(quote.grossTotal)}</p>
            </Card>
          ) : (
            <InvoiceEditor
              kind="quote"
              action={saveQuote}
              defaultVat={ctx.org.smallBusiness ? 0 : toNumber(ctx.org.defaultVatRate)}
              invoice={{
                id: quote.id,
                recipient: quote.recipient,
                validUntil: toDateInput(quote.validUntil),
                introText: quote.introText ?? "",
                footerText: quote.footerText ?? "",
                smallBusiness: quote.smallBusiness,
              }}
              items={quote.items.map((i) => ({
                description: i.description,
                quantity: String(toNumber(i.quantity)).replace(".", ","),
                unit: i.unit,
                unitPrice: toNumber(i.unitPrice).toFixed(2).replace(".", ","),
                vatRate: String(toNumber(i.vatRate)),
              }))}
            />
          )}
        </div>
        <div className="space-y-6">
          <Card title="Nächster Schritt">
            {quote.responseNote && <p className="mb-3 whitespace-pre-wrap rounded bg-slate-50 px-3 py-2 text-sm text-slate-700">Rückmeldung des Kunden: {quote.responseNote}</p>}
            {quote.order ? (
              <p className="text-sm">
                Angenommen – daraus wurde{" "}
                <Link href={`/orders/${quote.order.id}`} className="font-semibold text-brand-600">
                  Auftrag {orderNo(quote.order.number)}
                </Link>
                .
              </p>
            ) : (
              <div className="space-y-2">
                <EmailDocuments
                  className="btn-primary w-full"
                  label="✉️ Angebot per E-Mail senden"
                  to={c.email ?? ""}
                  subject={`Angebot ${quote.number} – Fahrzeugüberführung ${route}`}
                  message={`${greeting},

vielen Dank für Ihre Anfrage. Anbei erhalten Sie unser Angebot ${quote.number} für die Überführung ${route} über ${formatMoney(quote.grossTotal)}.
Das Angebot ist gültig bis ${formatDate(quote.validUntil)}.${publicUrl ? `

Sie können das Angebot bequem online annehmen:
${publicUrl}` : " Zur Beauftragung genügt eine kurze Antwort auf diese E-Mail."}

Mit freundlichen Grüßen
${company}`}
                  docs={[{ key: "QUOTE", label: `Angebot ${quote.number}`, available: true, checked: true, downloadUrl: `/api/quotes/${quote.id}/pdf` }]}
                  refs={{ quoteId: quote.id }}
                  mailEnabled={mailEnabled()}
                />
                <form action={acceptQuote}>
                  <input type="hidden" name="id" value={quote.id} />
                  <SubmitButton className="btn-secondary w-full" confirm="Angebot als angenommen markieren und Auftrag anlegen?">
                    ✓ Angenommen → Auftrag anlegen
                  </SubmitButton>
                </form>
                {publicUrl && (
                  <div className="pt-2">
                    <p className="mb-1 text-xs font-medium text-slate-500">Link zur Online-Annahme</p>
                    <CopyField value={publicUrl} label="Link zur Online-Annahme" />
                  </div>
                )}
                {quote.status === "DRAFT" && status("SENT", "Als versendet markieren")}
                {quote.status !== "DECLINED" ? status("DECLINED", "Abgelehnt") : status("DRAFT", "Wieder öffnen")}
              </div>
            )}
          </Card>
          <Card
            title="Eckdaten"
            actions={
              !locked && (
                <Link href={`/quotes/${quote.id}/edit`} className="text-sm font-medium text-brand-600">
                  Bearbeiten
                </Link>
              )
            }
          >
            <dl className="space-y-1 text-sm">
              {(
                [
                  ["Art", TRANSPORT_MODE[quote.transportMode]],
                  ["Abholung", [quote.pickupStreet, [quote.pickupZip, quote.pickupCity].filter(Boolean).join(" ")].filter(Boolean).join(", ")],
                  ["Zustellung", [quote.deliveryStreet, [quote.deliveryZip, quote.deliveryCity].filter(Boolean).join(" ")].filter(Boolean).join(", ")],
                  ["Wunschtermin", quote.pickupDate ? formatDate(quote.pickupDate) : null],
                  ["Fahrzeug", [[quote.make, quote.model].filter(Boolean).join(" "), quote.licensePlate].filter(Boolean).join(" · ")],
                  ["Strecke", quote.distanceKm ? `${formatNumber(toNumber(quote.distanceKm), 0)} km` : null],
                  ["Rückreise", quote.returnType !== "NONE" ? RETURN_TYPE[quote.returnType] : null],
                ] as [string, string | null][]
              )
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="text-right">{v}</dd>
                  </div>
                ))}
            </dl>
          </Card>
          {!quote.order && (
            <form action={deleteQuote}>
              <input type="hidden" name="id" value={quote.id} />
              <SubmitButton className="btn-danger w-full" confirm="Angebot löschen?">
                Angebot löschen
              </SubmitButton>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
