import type { DriverSettlement, Expense, Order, Organization, Protocol } from "@prisma/client";
import { formatDate, formatMoney, formatNumber, orderNo, toNumber } from "@/lib/format";
import { EXPENSE_CATEGORY } from "@/lib/labels";
import { COLORS, CONTENT_W, MARGIN, PAGE_W, createDoc, drawFooters, drawLogo, ensureSpace, senderLine, t, toBuffer } from "./common";

type Full = DriverSettlement & {
  orders: (Order & { protocols: Protocol[] })[];
  expenses: (Expense & { order: { number: number } })[];
};

/** Fahrer-Abrechnung: Touren mit Vergütung + erstattete Auslagen. */
export async function renderSettlementPdf(org: Organization, s: Full, payFor: (o: Order) => number) {
  const title = toNumber(s.vatRate) ? "Gutschrift" : "Fahrer-Abrechnung";
  const doc = createDoc(`${title} ${s.number}`);
  await drawLogo(doc, org);
  const top = 128;
  doc.fontSize(7).fillColor(COLORS.muted).text(t(senderLine(org)), MARGIN, top, { width: 250, underline: true });
  doc.fontSize(10).fillColor(COLORS.text).text(t(s.driverName), MARGIN, top + 16, { width: 250 });
  const info: [string, string][] = [
    ["Abrechnung", s.number],
    ["Datum", formatDate(s.createdAt)],
    ["Zeitraum", `${formatDate(s.periodFrom)} – ${formatDate(s.periodTo)}`],
  ];
  let iy = top + 16;
  doc.fontSize(9);
  for (const [k, v] of info) {
    doc.fillColor(COLORS.muted).text(t(k), PAGE_W - MARGIN - 200, iy, { width: 80 });
    doc.fillColor(COLORS.text).text(t(v), PAGE_W - MARGIN - 120, iy, { width: 120, align: "right" });
    iy += 14;
  }
  doc.y = top + 100;
  doc.font("Helvetica-Bold").fontSize(16).text(t(`${title} ${s.number}`), MARGIN, doc.y);
  doc.font("Helvetica").fontSize(9.5).moveDown(0.8);

  const row = (cols: string[], widths: number[], bold = false, align: ("left" | "right")[] = []) => {
    ensureSpace(doc, 18);
    const y = doc.y;
    let x = MARGIN;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica");
    cols.forEach((c, i) => {
      doc.text(t(c), x, y, { width: widths[i] - 6, align: align[i] ?? "left" });
      x += widths[i];
    });
    doc.y = Math.max(doc.y, y + 13) + 3;
    doc.font("Helvetica");
  };
  const W = [70, 70, CONTENT_W - 70 - 70 - 60 - 80, 60, 80];
  doc.rect(MARGIN, doc.y - 3, CONTENT_W, 17).fill(COLORS.light).fillColor(COLORS.text);
  row(["Datum", "Auftrag", "Strecke", "km", "Vergütung"], W, true, ["left", "left", "left", "right", "right"]);
  for (const o of s.orders) {
    const date = o.protocols.find((p) => p.type === "DELIVERY")?.performedAt ?? o.pickupDate;
    row([formatDate(date), orderNo(o.number), `${o.pickupCity ?? "?"} -> ${o.deliveryCity ?? "?"}`, formatNumber(toNumber(o.distanceKm), 0), formatMoney(payFor(o))], W, false, ["left", "left", "left", "right", "right"]);
  }
  const vatRate = toNumber(s.vatRate);
  const pay = toNumber(s.payTotal);
  const sums: [string, number][] = [["Vergütung netto", pay]];
  if (vatRate) sums.push([`zzgl. ${formatNumber(vatRate, 0)} % USt`, Math.round(pay * vatRate) / 100]);

  if (s.expenses.length) {
    doc.moveDown(0.8).font("Helvetica-Bold").text("Erstattete Auslagen", MARGIN, doc.y).font("Helvetica").moveDown(0.3);
    for (const e of s.expenses) {
      row([formatDate(e.date), orderNo(e.order.number), [EXPENSE_CATEGORY[e.category] ?? e.category, e.vendor, e.description].filter(Boolean).join(" – "), "", formatMoney(e.amountGross)], W, false, ["left", "left", "left", "right", "right"]);
    }
    sums.push(["Auslagen (brutto, ohne USt-Ausweis)", toNumber(s.expenseTotal)]);
  }
  sums.push(["Auszahlungsbetrag", toNumber(s.grossTotal)]);
  doc.moveDown(0.6);
  for (const [i, [label, value]] of sums.entries()) {
    const bold = i === sums.length - 1;
    ensureSpace(doc, 18);
    const y = doc.y;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9.5);
    doc.text(t(label), MARGIN + 200, y, { width: CONTENT_W - 290, align: "right" });
    doc.text(t(formatMoney(value)), PAGE_W - MARGIN - 90, y, { width: 90, align: "right" });
    doc.y = y + (bold ? 18 : 14);
  }
  doc.font("Helvetica").fontSize(9.5);
  if (s.notes) doc.moveDown(1).text(t(s.notes), MARGIN, doc.y, { width: CONTENT_W });
  doc
    .moveDown(1)
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(
      t(vatRate ? "Abrechnung im Gutschriftsverfahren (§ 14 Abs. 2 Satz 2 UStG). Bitte die Angaben prüfen; bei Einwänden bitte innerhalb von 14 Tagen melden." : "Bitte die Angaben prüfen; bei Einwänden bitte innerhalb von 14 Tagen melden."),
      MARGIN,
      doc.y,
      { width: CONTENT_W },
    );
  drawFooters(doc, org);
  return toBuffer(doc);
}
