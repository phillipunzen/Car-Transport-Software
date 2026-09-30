import { db } from "@/lib/db";
import { orderNo } from "@/lib/format";
import { renderProtocolPdf } from "@/lib/pdf/protocol";
import { renderInvoicePdf } from "@/lib/pdf/invoice";
import { buildEInvoiceXml } from "@/lib/einvoice";
import { renderDunningPdf } from "@/lib/pdf/dunning";
import { renderQuotePdf } from "@/lib/pdf/quote";
import { renderDamageReportPdf } from "@/lib/pdf/damage-report";
import { DUNNING_LEVEL } from "@/lib/dunning";

/** Erzeugt ein Protokoll-PDF (oder null, wenn es das Protokoll nicht gibt). */
export async function protocolPdf(orgId: string, orderId: string, type: "PICKUP" | "DELIVERY") {
  const order = await db.order.findFirst({
    where: { id: orderId, organizationId: orgId },
    include: {
      customer: true,
      organization: true,
      protocols: { include: { performedBy: true } },
      damages: { orderBy: { createdAt: "asc" } },
      photos: { orderBy: { createdAt: "asc" } },
    },
  });
  const protocol = order?.protocols.find((p) => p.type === type);
  if (!order || !protocol) return null;
  const pdf = await renderProtocolPdf({
    org: order.organization,
    order,
    protocol,
    damages: order.damages.filter((d) => d.stage === type),
    photos: order.photos.filter((p) => p.stage === type),
    pickupDamages: type === "DELIVERY" ? order.damages.filter((d) => d.stage === "PICKUP") : undefined,
  });
  return { pdf, filename: `${type === "PICKUP" ? "Abholprotokoll" : "Uebergabeprotokoll"}_${orderNo(order.number)}.pdf` };
}

/** Erzeugt ein Rechnungs-PDF (oder null). */
export async function invoicePdf(orgId: string, invoiceId: string) {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId: orgId },
    include: { items: { orderBy: { position: "asc" } }, customer: true, order: true, organization: true },
  });
  if (!invoice) return null;
  const pdf = await renderInvoicePdf(invoice.organization, invoice);
  return { pdf, filename: invoice.number ? `Rechnung_${invoice.number}.pdf` : "Rechnungsentwurf.pdf" };
}

/** E-Rechnung als reine XML-Datei (XRechnung, CII) – nur für festgeschriebene Rechnungen. */
export async function invoiceXml(orgId: string, invoiceId: string) {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId: orgId, status: { not: "DRAFT" } },
    include: { items: { orderBy: { position: "asc" } }, customer: true, order: true, organization: true },
  });
  if (!invoice?.number) return null;
  return { xml: buildEInvoiceXml(invoice.organization, invoice), filename: `XRechnung_${invoice.number}.xml` };
}

/** Mahnschreiben als PDF (oder null). */
export async function dunningPdf(orgId: string, dunningId: string) {
  const dunning = await db.dunning.findFirst({
    where: { id: dunningId, invoice: { organizationId: orgId } },
    include: { invoice: { include: { customer: true, dunnings: true, organization: true } } },
  });
  if (!dunning) return null;
  const { pdf } = await renderDunningPdf(dunning.invoice.organization, dunning.invoice, dunning);
  const label = (DUNNING_LEVEL[dunning.level]?.label ?? "Mahnung").replace(/\./g, "").replace(/\s+/g, "_");
  return { pdf, filename: `${label}_${dunning.invoice.number}.pdf` };
}

/** Angebot als PDF (oder null). */
export async function quotePdf(orgId: string, quoteId: string) {
  const quote = await db.quote.findFirst({
    where: { id: quoteId, organizationId: orgId },
    include: { items: { orderBy: { position: "asc" } }, customer: true, organization: true },
  });
  if (!quote) return null;
  return { pdf: await renderQuotePdf(quote.organization, quote), filename: `Angebot_${quote.number}.pdf` };
}

/** Schadensmeldung (Vergleich Abholung/Übergabe) – nur wenn bei der Übergabe Schäden erfasst wurden. */
export async function damageReportPdf(orgId: string, orderId: string) {
  const order = await db.order.findFirst({
    where: { id: orderId, organizationId: orgId },
    include: {
      customer: true,
      assignedTo: true,
      organization: true,
      protocols: { include: { performedBy: true } },
      damages: { orderBy: { createdAt: "asc" }, include: { photo: { select: { fileId: true } } } },
    },
  });
  if (!order) return null;
  const deliveryDamages = order.damages.filter((d) => d.stage === "DELIVERY");
  if (deliveryDamages.length === 0) return null;
  const pdf = await renderDamageReportPdf({
    org: order.organization,
    order,
    pickup: order.protocols.find((p) => p.type === "PICKUP") ?? null,
    delivery: order.protocols.find((p) => p.type === "DELIVERY") ?? null,
    pickupDamages: order.damages.filter((d) => d.stage === "PICKUP"),
    deliveryDamages,
  });
  return { pdf, filename: `Schadensmeldung_${orderNo(order.number)}.pdf` };
}

/**
 * Organisation des angemeldeten Benutzers, zu der ein Objekt gehört (für die PDF-Routen).
 * Fahrer: keine Büro-Dokumente (Rechnungen, Angebote, Mahnungen) und nur eigene Aufträge.
 */
export async function memberOrgFor(
  userId: string,
  organizationId: string | null | undefined,
  opts: { office?: boolean; assignedToId?: string | null } = {},
) {
  if (!organizationId) return null;
  const m = await db.membership.findFirst({ where: { userId, organizationId } });
  if (!m) return null;
  if (m.role === "DRIVER" && (opts.office || ("assignedToId" in opts && opts.assignedToId !== userId))) return null;
  return organizationId;
}
