import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { customerName, formatDate, formatMoney, orderNo, toDateTimeLocal, toNumber } from "@/lib/format";
import { INVOICE_STATUS } from "@/lib/labels";
import { computeTotals } from "@/lib/invoice";
import { Badge, Card, PageHeader } from "@/components/ui";
import { InvoiceEditor } from "@/components/invoice-editor";
import { SubmitButton } from "@/components/submit-button";
import { cancelInvoice, deleteDraft, setPaid } from "../actions";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const invoice = await db.invoice.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: { customer: true, order: true, items: { orderBy: { position: "asc" } } },
  });
  if (!invoice) notFound();

  const header = (
    <PageHeader
      back={{ href: "/invoices", label: "Rechnungen" }}
      title={
        <span className="flex items-center gap-2">
          {invoice.number ? `Rechnung ${invoice.number}` : "Rechnungsentwurf"}
          <Badge className={INVOICE_STATUS[invoice.status].color}>{INVOICE_STATUS[invoice.status].label}</Badge>
        </span>
      }
      subtitle={
        <>
          <Link href={`/customers/${invoice.customerId}`} className="text-brand-600">
            {customerName(invoice.customer)}
          </Link>
          {invoice.order && (
            <>
              {" · "}
              <Link href={`/orders/${invoice.order.id}`} className="text-brand-600">
                Auftrag {orderNo(invoice.order.number)}
              </Link>
            </>
          )}
        </>
      }
      actions={
        <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer" className="btn-secondary">
          {invoice.status === "DRAFT" ? "PDF-Vorschau" : "PDF herunterladen"}
        </a>
      }
    />
  );

  if (invoice.status === "DRAFT") {
    const missing = [
      !ctx.org.companyName && "Firmenname",
      !ctx.org.street && "Anschrift",
      !ctx.org.iban && "IBAN",
      !ctx.org.taxNumber && !ctx.org.vatId && "Steuernummer oder USt-IdNr.",
    ].filter(Boolean);
    return (
      <>
        {header}
        {missing.length > 0 && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Für eine vollständige Rechnung fehlen noch Angaben in den{" "}
            <Link href="/settings" className="font-semibold underline">
              Einstellungen
            </Link>
            : {missing.join(", ")}.
          </div>
        )}
        <InvoiceEditor
          defaultVat={ctx.org.smallBusiness ? 0 : toNumber(ctx.org.defaultVatRate)}
          invoice={{
            id: invoice.id,
            recipient: invoice.recipient,
            serviceDate: toDateTimeLocal(invoice.serviceDate),
            introText: invoice.introText ?? "",
            footerText: invoice.footerText ?? "",
            smallBusiness: invoice.smallBusiness,
          }}
          items={invoice.items.map((i) => ({
            description: i.description,
            quantity: String(toNumber(i.quantity)),
            unit: i.unit,
            unitPrice: toNumber(i.unitPrice).toFixed(2),
            vatRate: String(toNumber(i.vatRate)),
          }))}
        />
        <form action={deleteDraft} className="mt-6">
          <input type="hidden" name="id" value={invoice.id} />
          <SubmitButton className="btn-danger" confirm="Entwurf löschen?">
            Entwurf löschen
          </SubmitButton>
        </form>
      </>
    );
  }

  const totals = computeTotals(
    invoice.items.map((i) => ({ description: i.description, unit: i.unit, quantity: toNumber(i.quantity), unitPrice: toNumber(i.unitPrice), vatRate: toNumber(i.vatRate) })),
    invoice.smallBusiness,
  );
  return (
    <>
      {header}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Positionen" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Beschreibung</th>
                  <th className="text-right">Menge</th>
                  <th className="text-right">Einzel</th>
                  <th className="text-right">Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.position}</td>
                    <td className="whitespace-pre-wrap">{i.description}</td>
                    <td className="text-right whitespace-nowrap">
                      {toNumber(i.quantity).toLocaleString("de-DE")} {i.unit}
                    </td>
                    <td className="text-right">{formatMoney(i.unitPrice)}</td>
                    <td className="text-right">{formatMoney(toNumber(i.quantity) * toNumber(i.unitPrice))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Netto</dt>
              <dd>{formatMoney(totals.net)}</dd>
            </div>
            {totals.vat.map((v) => (
              <div key={v.rate} className="flex justify-between">
                <dt>USt {v.rate} %</dt>
                <dd>{formatMoney(v.amount)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t pt-1 font-bold">
              <dt>Gesamt</dt>
              <dd>{formatMoney(invoice.grossTotal)}</dd>
            </div>
          </dl>
        </Card>
        <div className="space-y-6">
          <Card title="Zahlung">
            <p className="text-sm">Rechnungsdatum: {formatDate(invoice.issueDate)}</p>
            <p className="text-sm">Fällig am: {formatDate(invoice.dueDate)}</p>
            {invoice.paidAt && <p className="text-sm text-emerald-700">Bezahlt am {formatDate(invoice.paidAt)}</p>}
            <div className="mt-4 space-y-2">
              {invoice.status === "ISSUED" && (
                <form action={setPaid} className="flex gap-2">
                  <input type="hidden" name="id" value={invoice.id} />
                  <input type="hidden" name="paid" value="1" />
                  <input type="date" name="paidAt" defaultValue={toDateTimeLocal(new Date()).slice(0, 10)} className="input mt-0" />
                  <SubmitButton className="btn-primary shrink-0">Als bezahlt markieren</SubmitButton>
                </form>
              )}
              {invoice.status === "PAID" && toNumber(invoice.grossTotal) >= 0 && (
                <form action={setPaid}>
                  <input type="hidden" name="id" value={invoice.id} />
                  <input type="hidden" name="paid" value="0" />
                  <SubmitButton className="btn-secondary w-full">Zahlung zurücksetzen</SubmitButton>
                </form>
              )}
              {(invoice.status === "ISSUED" || invoice.status === "PAID") && toNumber(invoice.grossTotal) >= 0 && (
                <form action={cancelInvoice}>
                  <input type="hidden" name="id" value={invoice.id} />
                  <SubmitButton className="btn-danger w-full" confirm="Rechnung stornieren? Es wird automatisch eine Stornorechnung erzeugt.">
                    Stornieren
                  </SubmitButton>
                </form>
              )}
            </div>
          </Card>
          <Card title="Empfänger">
            <p className="whitespace-pre-wrap text-sm">{invoice.recipient}</p>
            {invoice.customer.email && (
              <a
                href={`mailto:${invoice.customer.email}?subject=${encodeURIComponent(`Rechnung ${invoice.number}`)}&body=${encodeURIComponent(
                  `Guten Tag,\n\nanbei erhalten Sie unsere Rechnung ${invoice.number} über ${formatMoney(invoice.grossTotal)}.\n\nMit freundlichen Grüßen\n${ctx.org.companyName ?? ctx.org.name}`,
                )}`}
                className="btn-secondary mt-3 w-full"
              >
                ✉️ Per E-Mail senden
              </a>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
