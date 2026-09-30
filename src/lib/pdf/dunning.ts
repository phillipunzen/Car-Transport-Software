import type { Customer, Dunning, Invoice, Organization } from "@prisma/client";
import { customerNo, formatDate, formatMoney, toNumber } from "@/lib/format";
import { DUNNING_LEVEL, dunningText } from "@/lib/dunning";
import { COLORS, CONTENT_W, MARGIN, PAGE_W, createDoc, drawFooters, drawLogo, formatIban, senderLine, t, toBuffer } from "./common";
import { giroCode } from "./invoice";

type Full = Invoice & { customer: Customer; dunnings: Dunning[] };

/** Mahnschreiben: offene Rechnung + aufgelaufene Mahngebühren, neue Frist, Bankverbindung/GiroCode. */
export async function renderDunningPdf(org: Organization, invoice: Full, dunning: Dunning) {
  const level = DUNNING_LEVEL[dunning.level] ?? DUNNING_LEVEL[1];
  const doc = createDoc(`${level.label} zu Rechnung ${invoice.number}`);
  await drawLogo(doc, org);

  const addrTop = 128;
  doc.fontSize(7).fillColor(COLORS.muted).text(t(senderLine(org)), MARGIN, addrTop, { width: 250, underline: true });
  doc.fontSize(10).fillColor(COLORS.text).text(t(invoice.recipient), MARGIN, addrTop + 16, { width: 250, lineGap: 1.5 });

  const info: [string, string][] = [
    ["Datum", formatDate(dunning.createdAt)],
    ["Rechnungsnummer", invoice.number ?? ""],
    ["Kundennummer", customerNo(invoice.customer.number)],
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
  doc.font("Helvetica-Bold").fontSize(16).text(t(`${level.title} zur Rechnung ${invoice.number}`), MARGIN, doc.y, { width: CONTENT_W });
  doc.moveDown(0.8);
  doc.font("Helvetica").fontSize(10);
  const c = invoice.customer;
  const salutation = c.type === "PRIVATE" && c.lastName ? `Guten Tag ${[c.firstName, c.lastName].filter(Boolean).join(" ")}` : "Sehr geehrte Damen und Herren";
  doc.text(t(`${salutation},`), MARGIN, doc.y, { width: CONTENT_W }).moveDown(0.6);
  doc.text(t(dunningText(dunning.level, invoice.number ?? "", formatDate(dunning.dueDate))), { width: CONTENT_W, lineGap: 1.5 }).moveDown(1);

  // Aufstellung: Rechnung + Gebühren aller Mahnstufen bis einschließlich dieser
  const fees = invoice.dunnings.filter((d) => d.level <= dunning.level && toNumber(d.fee) > 0).sort((a, b) => a.level - b.level);
  const rows: [string, number][] = [[`Rechnung ${invoice.number} vom ${formatDate(invoice.issueDate)}, fällig am ${formatDate(invoice.dueDate)}`, toNumber(invoice.grossTotal)]];
  for (const f of fees) rows.push([`Mahngebühr ${DUNNING_LEVEL[f.level]?.label ?? ""} vom ${formatDate(f.createdAt)}`, toNumber(f.fee)]);
  const total = rows.reduce((s, [, v]) => s + v, 0);

  const y0 = doc.y;
  doc.rect(MARGIN, y0 - 4, CONTENT_W, 18).fill(COLORS.light);
  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8.5);
  doc.text("Position", MARGIN + 4, y0, { width: CONTENT_W - 110 });
  doc.text("Betrag", PAGE_W - MARGIN - 100, y0, { width: 96, align: "right" });
  doc.font("Helvetica").fontSize(9.5);
  doc.y = y0 + 20;
  for (const [label, value] of rows) {
    const y = doc.y;
    doc.text(t(label), MARGIN + 4, y, { width: CONTENT_W - 110 });
    doc.text(t(formatMoney(value)), PAGE_W - MARGIN - 100, y, { width: 96, align: "right" });
    doc.y = Math.max(doc.y, y + 14) + 4;
    doc.moveTo(MARGIN, doc.y - 3).lineTo(PAGE_W - MARGIN, doc.y - 3).lineWidth(0.3).strokeColor(COLORS.line).stroke();
  }
  const ty = doc.y + 2;
  doc.font("Helvetica-Bold").fontSize(11).text("Offener Gesamtbetrag", MARGIN + 4, ty, { width: CONTENT_W - 110 });
  doc.text(t(formatMoney(total)), PAGE_W - MARGIN - 100, ty, { width: 96, align: "right" });
  doc.font("Helvetica").fontSize(10);
  doc.y = ty + 28;

  const qr = await giroCode(org, total, `${invoice.number} ${level.label}`);
  const y = doc.y;
  const bank = org.iban
    ? `Bitte überweisen Sie ${formatMoney(total)} bis zum ${formatDate(dunning.dueDate)} unter Angabe der Rechnungsnummer ${invoice.number} auf folgendes Konto:\n${org.accountHolder || org.companyName || org.name}\nIBAN: ${formatIban(org.iban)}${org.bic ? `\nBIC: ${org.bic}` : ""}${org.bankName ? ` (${org.bankName})` : ""}`
    : `Bitte überweisen Sie ${formatMoney(total)} bis zum ${formatDate(dunning.dueDate)} unter Angabe der Rechnungsnummer ${invoice.number}.`;
  doc.text(t(bank), MARGIN, y, { width: qr ? CONTENT_W - 110 : CONTENT_W, lineGap: 1.5 });
  if (qr) {
    doc.image(qr, PAGE_W - MARGIN - 90, y - 4, { width: 90 });
    doc.fontSize(7).fillColor(COLORS.muted).text("Mit Banking-App scannen", PAGE_W - MARGIN - 100, y + 88, { width: 110, align: "center" });
    doc.fontSize(10).fillColor(COLORS.text);
    doc.y = Math.max(doc.y, y + 100);
  }
  doc.moveDown(1.2).text("Mit freundlichen Grüßen", MARGIN, doc.y).moveDown(0.3).text(t(org.companyName || org.name));

  drawFooters(doc, org);
  return { pdf: await toBuffer(doc), total };
}
