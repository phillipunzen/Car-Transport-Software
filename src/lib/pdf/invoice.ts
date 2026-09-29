import QRCode from "qrcode";
import type { Customer, Invoice, InvoiceItem, Order, Organization } from "@prisma/client";
import { customerNo, formatDate, formatMoney, orderNo, toNumber } from "@/lib/format";
import { computeTotals } from "@/lib/invoice";
import { COLORS, CONTENT_W, MARGIN, PAGE_W, createDoc, drawFooters, drawLogo, ensureSpace, senderLine, t, toBuffer } from "./common";

type Full = Invoice & { items: InvoiceItem[]; customer: Customer; order: Order | null };

/** EPC-QR-Code ("GiroCode") – lässt sich mit jeder Banking-App scannen. */
async function giroCode(org: Organization, amount: number, reference: string) {
  if (!org.iban || amount <= 0 || amount > 999999999.99) return null;
  const payload = [
    "BCD",
    "002",
    "1",
    "SCT",
    (org.bic ?? "").replace(/\s/g, ""),
    (org.accountHolder || org.companyName || org.name).slice(0, 70),
    org.iban.replace(/\s/g, ""),
    `EUR${amount.toFixed(2)}`,
    "",
    "",
    reference.slice(0, 140),
  ].join("\n");
  return QRCode.toBuffer(payload, { errorCorrectionLevel: "M", margin: 1, width: 240 });
}

export async function renderInvoicePdf(org: Organization, invoice: Full) {
  const isCredit = toNumber(invoice.grossTotal) < 0;
  const title = invoice.status === "DRAFT" ? "Rechnungsentwurf" : isCredit ? "Stornorechnung" : "Rechnung";
  const doc = createDoc(`${title} ${invoice.number ?? ""}`.trim());

  await drawLogo(doc, org);

  // Absenderzeile + Anschriftfeld (DIN 5008, Fensterposition)
  const addrTop = 128;
  doc.fontSize(7).fillColor(COLORS.muted).text(t(senderLine(org)), MARGIN, addrTop, { width: 250, underline: true });
  doc.fontSize(10).fillColor(COLORS.text).text(t(invoice.recipient), MARGIN, addrTop + 16, { width: 250, lineGap: 1.5 });

  // Infoblock rechts
  const info: [string, string][] = [
    [isCredit ? "Stornonummer" : "Rechnungsnummer", invoice.number ?? "– (Entwurf)"],
    ["Rechnungsdatum", formatDate(invoice.issueDate ?? new Date())],
    ["Leistungsdatum", formatDate(invoice.serviceDate)],
    ["Kundennummer", customerNo(invoice.customer.number)],
  ];
  if (invoice.order) info.push(["Auftragsnummer", orderNo(invoice.order.number)]);
  if (invoice.order?.reference) info.push(["Ihre Referenz", invoice.order.reference]);
  if (invoice.customer.vatId) info.push(["Ihre USt-IdNr.", invoice.customer.vatId]);
  const infoX = PAGE_W - MARGIN - 200;
  let iy = addrTop + 16;
  doc.fontSize(9);
  for (const [k, v] of info) {
    doc.fillColor(COLORS.muted).text(t(k), infoX, iy, { width: 95 });
    doc.fillColor(COLORS.text).text(t(v), infoX + 95, iy, { width: 105, align: "right" });
    iy += 14;
  }

  // Titel & Einleitung
  doc.y = Math.max(addrTop + 130, iy + 20);
  doc.font("Helvetica-Bold").fontSize(16).text(t(`${title}${invoice.number ? ` ${invoice.number}` : ""}`), MARGIN, doc.y);
  doc.moveDown(0.6);
  doc.font("Helvetica").fontSize(10);
  if (invoice.introText) doc.text(t(invoice.introText), { width: CONTENT_W, lineGap: 1.5 }).moveDown(0.8);

  // Positionstabelle
  const cols = { pos: MARGIN, desc: MARGIN + 30, qty: MARGIN + 290, price: MARGIN + 360, total: MARGIN + 420 };
  const widths = { pos: 28, desc: 255, qty: 65, price: 58, total: CONTENT_W - 420 };
  const tableHeader = () => {
    const y = doc.y;
    doc.rect(MARGIN, y - 4, CONTENT_W, 18).fill(COLORS.light);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8.5);
    doc.text("Pos.", cols.pos + 2, y, { width: widths.pos });
    doc.text("Beschreibung", cols.desc, y, { width: widths.desc });
    doc.text("Menge", cols.qty, y, { width: widths.qty, align: "right" });
    doc.text("Einzelpreis", cols.price, y, { width: widths.price, align: "right" });
    doc.text("Gesamt", cols.total, y, { width: widths.total, align: "right" });
    doc.font("Helvetica").fontSize(9.5);
    doc.y = y + 20;
  };
  tableHeader();
  for (const item of invoice.items) {
    const qty = toNumber(item.quantity);
    const price = toNumber(item.unitPrice);
    const desc = t(item.description);
    const h = doc.heightOfString(desc, { width: widths.desc }) + 10;
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      doc.y = MARGIN;
      tableHeader();
    }
    const y = doc.y;
    doc.text(String(item.position), cols.pos + 2, y, { width: widths.pos });
    doc.text(desc, cols.desc, y, { width: widths.desc, lineGap: 1 });
    doc.text(t(`${qty.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${item.unit}`), cols.qty, y, { width: widths.qty, align: "right" });
    doc.text(t(formatMoney(price)), cols.price, y, { width: widths.price, align: "right" });
    doc.text(t(formatMoney(qty * price)), cols.total, y, { width: widths.total, align: "right" });
    doc.y = y + h;
    doc.moveTo(MARGIN, doc.y - 4).lineTo(PAGE_W - MARGIN, doc.y - 4).lineWidth(0.3).strokeColor(COLORS.line).stroke();
  }

  // Summen
  const totals = computeTotals(
    invoice.items.map((i) => ({ description: i.description, unit: i.unit, quantity: toNumber(i.quantity), unitPrice: toNumber(i.unitPrice), vatRate: toNumber(i.vatRate) })),
    invoice.smallBusiness,
  );
  const sumRows: [string, number, boolean?][] = [["Summe netto", totals.net]];
  for (const v of totals.vat) sumRows.push([`zzgl. ${v.rate.toLocaleString("de-DE")} % USt auf ${formatMoney(v.base)}`, v.amount]);
  sumRows.push([isCredit ? "Gutschriftsbetrag" : "Rechnungsbetrag", totals.gross, true]);
  ensureSpace(doc, sumRows.length * 16 + 20);
  doc.moveDown(0.4);
  for (const [label, value, bold] of sumRows) {
    const y = doc.y;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9.5);
    doc.text(t(label), MARGIN + 220, y, { width: 190, align: "right" });
    doc.text(t(formatMoney(value)), cols.total - 20, y, { width: widths.total + 20, align: "right" });
    doc.y = y + (bold ? 18 : 14);
  }
  doc.font("Helvetica").fontSize(9.5);

  if (invoice.smallBusiness) {
    doc.moveDown(0.5).text("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).", MARGIN, doc.y, { width: CONTENT_W });
  }

  // Zahlungsinformationen inkl. GiroCode
  doc.moveDown(1);
  const gross = totals.gross;
  if (invoice.status !== "DRAFT" && gross > 0 && invoice.status !== "PAID") {
    const qr = await giroCode(org, gross, invoice.number ? `Rechnung ${invoice.number}` : "Rechnung");
    ensureSpace(doc, qr ? 100 : 40);
    const y = doc.y;
    const text = `Bitte überweisen Sie den Rechnungsbetrag von ${formatMoney(gross)} bis zum ${formatDate(invoice.dueDate)} unter Angabe der Rechnungsnummer${
      org.iban ? ` auf folgendes Konto:\n${org.accountHolder || org.companyName || org.name}\nIBAN: ${org.iban.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim()}${org.bic ? `\nBIC: ${org.bic}` : ""}${org.bankName ? ` (${org.bankName})` : ""}` : "."
    }`;
    doc.text(t(text), MARGIN, y, { width: qr ? CONTENT_W - 110 : CONTENT_W, lineGap: 1.5 });
    if (qr) {
      doc.image(qr, PAGE_W - MARGIN - 90, y - 4, { width: 90 });
      doc.fontSize(7).fillColor(COLORS.muted).text("Mit Banking-App scannen", PAGE_W - MARGIN - 100, y + 88, { width: 110, align: "center" });
      doc.fontSize(9.5).fillColor(COLORS.text);
      doc.y = Math.max(doc.y, y + 100);
    }
  } else if (invoice.status === "PAID" && !isCredit) {
    doc.text(t(`Der Rechnungsbetrag wurde am ${formatDate(invoice.paidAt)} beglichen. Vielen Dank!`), MARGIN, doc.y, { width: CONTENT_W });
  }

  if (invoice.footerText) {
    ensureSpace(doc, 40);
    doc.moveDown(1).text(t(invoice.footerText), MARGIN, doc.y, { width: CONTENT_W, lineGap: 1.5 });
  }

  if (invoice.status === "DRAFT") {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.save().rotate(-35, { origin: [PAGE_W / 2, 420] });
      doc.font("Helvetica-Bold").fontSize(80).fillColor("#e2e8f0").fillOpacity(0.5).text("ENTWURF", 60, 380, { width: 480, align: "center", lineBreak: false });
      doc.restore();
    }
    doc.fillOpacity(1);
  }

  drawFooters(doc, org);
  return toBuffer(doc);
}
