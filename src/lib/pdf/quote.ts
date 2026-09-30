import type { Customer, Organization, Quote, QuoteItem } from "@prisma/client";
import { customerNo, formatDate, formatNumber, toNumber } from "@/lib/format";
import { TRANSPORT_MODE } from "@/lib/labels";
import { COLORS, CONTENT_W, MARGIN, PAGE_W, createDoc, drawFooters, drawLogo, ensureSpace, senderLine, t, toBuffer } from "./common";
import { drawItems } from "./invoice";

type Full = Quote & { items: QuoteItem[]; customer: Customer };

export async function renderQuotePdf(org: Organization, quote: Full) {
  const doc = createDoc(`Angebot ${quote.number}`);
  await drawLogo(doc, org);

  const addrTop = 128;
  doc.fontSize(7).fillColor(COLORS.muted).text(t(senderLine(org)), MARGIN, addrTop, { width: 250, underline: true });
  doc.fontSize(10).fillColor(COLORS.text).text(t(quote.recipient), MARGIN, addrTop + 16, { width: 250, lineGap: 1.5 });

  const info: [string, string][] = [
    ["Angebotsnummer", quote.number],
    ["Datum", formatDate(quote.createdAt)],
    ["Gültig bis", formatDate(quote.validUntil)],
    ["Kundennummer", customerNo(quote.customer.number)],
  ];
  const infoX = PAGE_W - MARGIN - 200;
  let iy = addrTop + 16;
  doc.fontSize(9);
  for (const [k, v] of info) {
    doc.fillColor(COLORS.muted).text(t(k), infoX, iy, { width: 95 });
    doc.fillColor(COLORS.text).text(t(v), infoX + 95, iy, { width: 105, align: "right" });
    iy += 14;
  }

  doc.y = Math.max(addrTop + 130, iy + 20);
  doc.font("Helvetica-Bold").fontSize(16).text(t(`Angebot ${quote.number}`), MARGIN, doc.y);
  doc.moveDown(0.6);
  doc.font("Helvetica").fontSize(10);
  if (quote.introText) doc.text(t(quote.introText), { width: CONTENT_W, lineGap: 1.5 }).moveDown(0.6);

  // Eckdaten der Überführung
  const facts: [string, string | null][] = [
    ["Art", TRANSPORT_MODE[quote.transportMode] ?? null],
    ["Abholung", [quote.pickupStreet, [quote.pickupZip, quote.pickupCity].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null],
    ["Zustellung", [quote.deliveryStreet, [quote.deliveryZip, quote.deliveryCity].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null],
    ["Wunschtermin", quote.pickupDate ? formatDate(quote.pickupDate) : null],
    ["Fahrzeug", [[quote.make, quote.model].filter(Boolean).join(" "), quote.licensePlate].filter(Boolean).join(" · ") || null],
    ["Strecke", quote.distanceKm ? `ca. ${formatNumber(toNumber(quote.distanceKm), 0)} km` : null],
  ];
  const shown = facts.filter(([, v]) => v);
  if (shown.length) {
    ensureSpace(doc, shown.length * 13 + 16);
    doc.fontSize(9);
    for (const [k, v] of shown) {
      const y = doc.y;
      doc.fillColor(COLORS.muted).text(t(k), MARGIN, y, { width: 90 });
      doc.fillColor(COLORS.text).text(t(v), MARGIN + 90, y, { width: CONTENT_W - 90 });
      doc.y = Math.max(doc.y, y + 13);
    }
    doc.moveDown(0.8);
  }

  doc.fontSize(9.5);
  drawItems(doc, quote.items, quote.smallBusiness, "Angebotssumme");
  if (quote.smallBusiness) {
    doc.moveDown(0.5).text("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).", MARGIN, doc.y, { width: CONTENT_W });
  }
  doc.moveDown(1);
  ensureSpace(doc, 40);
  doc.text(t(`Dieses Angebot ist gültig bis ${formatDate(quote.validUntil)}. Zur Beauftragung genügt eine kurze Antwort per E-Mail.`), MARGIN, doc.y, { width: CONTENT_W, lineGap: 1.5 });
  if (quote.footerText) doc.moveDown(0.8).text(t(quote.footerText), MARGIN, doc.y, { width: CONTENT_W, lineGap: 1.5 });
  doc.moveDown(1.2).text("Mit freundlichen Grüßen", MARGIN, doc.y).moveDown(0.3).text(t(org.companyName || org.name));

  drawFooters(doc, org);
  return toBuffer(doc);
}
