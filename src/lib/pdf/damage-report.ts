import type { Customer, Damage, Order, Organization, Protocol, User } from "@prisma/client";
import { customerName, formatDateTime, orderNo } from "@/lib/format";
import { DAMAGE_AREAS, DAMAGE_SEVERITY, DAMAGE_TYPES } from "@/lib/labels";
import { COLORS, CONTENT_W, MARGIN, createDoc, drawFooters, drawLogo, ensureSpace, heading, loadImage, t, toBuffer } from "./common";

type WithPhoto = Damage & { photo: { fileId: string } | null };
type Data = {
  org: Organization;
  order: Order & { customer: Customer; assignedTo: User | null };
  pickup: (Protocol & { performedBy: User | null }) | null;
  delivery: (Protocol & { performedBy: User | null }) | null;
  pickupDamages: WithPhoto[];
  deliveryDamages: WithPhoto[];
};

const label = (d: Damage) => `${DAMAGE_AREAS[d.area] ?? d.area}: ${DAMAGE_TYPES[d.type] ?? d.type} (${DAMAGE_SEVERITY[d.severity]?.label ?? d.severity})`;

/**
 * Schadensmeldung: stellt die bei der Übergabe festgestellten Schäden dem Zustand bei Abholung gegenüber
 * (inkl. Fotos) – als Grundlage für Versicherung bzw. Klärung mit dem Kunden.
 */
export async function renderDamageReportPdf({ org, order, pickup, delivery, pickupDamages, deliveryDamages }: Data) {
  const doc = createDoc(`Schadensmeldung ${orderNo(order.number)}`);
  await drawLogo(doc, org);
  doc.font("Helvetica-Bold").fontSize(18).text("Schadensmeldung", MARGIN, MARGIN);
  doc.font("Helvetica").fontSize(10).fillColor(COLORS.muted).text(t(`Auftrag ${orderNo(order.number)} · ${org.companyName ?? org.name}`));
  doc.fillColor(COLORS.text).fontSize(9.5);
  doc.y = Math.max(doc.y, MARGIN + 60);

  const kv = (rows: [string, string | null | undefined][]) => {
    for (const [k, v] of rows) {
      const y = doc.y;
      doc.fillColor(COLORS.muted).text(t(k), MARGIN, y, { width: 124 });
      doc.fillColor(COLORS.text).text(t(v || "–"), MARGIN + 130, y, { width: CONTENT_W - 130 });
      doc.y = Math.max(doc.y, y + 13);
    }
  };

  heading(doc, "Fahrzeug & Auftrag");
  kv([
    ["Auftraggeber", customerName(order.customer)],
    ["Fahrzeug", [order.make, order.model].filter(Boolean).join(" ")],
    ["Kennzeichen", order.licensePlate],
    ["FIN", order.vin],
    ["Strecke", `${order.pickupCity ?? "?"} → ${order.deliveryCity ?? "?"}`],
    ["Fahrer", delivery?.performedBy?.name ?? order.assignedTo?.name ?? null],
  ]);

  heading(doc, "Zustand im Vergleich");
  kv([
    ["Abholung", pickup ? `${formatDateTime(pickup.performedAt ?? pickup.completedAt)}${pickup.location ? `, ${pickup.location}` : ""} · km ${pickup.mileage ?? "–"}` : "kein Abholprotokoll"],
    ["Übergabe", delivery ? `${formatDateTime(delivery.performedAt ?? delivery.completedAt)}${delivery.location ? `, ${delivery.location}` : ""} · km ${delivery.mileage ?? "–"}` : "kein Übergabeprotokoll"],
    ["Schäden bei Abholung", String(pickupDamages.length)],
    ["Schäden bei Übergabe", String(deliveryDamages.length)],
  ]);

  // Zuordnung: gleiche Stelle bei Abholung dokumentiert → Vorschaden, sonst neu
  const rows = deliveryDamages.map((d) => ({ d, before: pickupDamages.filter((p) => p.area === d.area) }));
  const fresh = rows.filter((r) => r.before.length === 0);
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fillColor(fresh.length ? "#b91c1c" : "#047857");
  doc.text(
    t(
      fresh.length
        ? `${fresh.length} Schaden/Schäden an Stellen, die bei der Abholung ohne Befund waren.`
        : deliveryDamages.length
          ? "Alle bei der Übergabe festgestellten Schäden waren bereits bei der Abholung dokumentiert."
          : "Bei der Übergabe wurden keine Schäden festgestellt.",
    ),
    MARGIN,
    doc.y,
    { width: CONTENT_W },
  );
  doc.font("Helvetica").fillColor(COLORS.text);

  // Einzelaufstellung mit Fotos (Abholung | Übergabe)
  const colW = (CONTENT_W - 12) / 2;
  const imgH = colW * 0.62;
  for (const [idx, { d, before }] of rows.entries()) {
    ensureSpace(doc, 70 + imgH);
    heading(doc, `${idx + 1}. ${label(d)}${before.length ? "" : "  –  NEU"}`, 60 + imgH);
    if (d.description) doc.text(t(d.description), MARGIN, doc.y, { width: CONTENT_W }).moveDown(0.3);
    doc.fillColor(COLORS.muted).text(t(before.length ? `Bei Abholung dokumentiert: ${before.map(label).join("; ")}` : "Bei Abholung an dieser Stelle kein Schaden dokumentiert."), MARGIN, doc.y, { width: CONTENT_W });
    doc.fillColor(COLORS.text).moveDown(0.4);
    const y = doc.y;
    const pairs: [string, string | null | undefined][] = [
      ["Abholung", before.find((b) => b.photo)?.photo?.fileId],
      ["Übergabe", d.photo?.fileId],
    ];
    let drawn = false;
    for (const [i, [caption, fileId]] of pairs.entries()) {
      const x = MARGIN + i * (colW + 12);
      const buf = await loadImage(fileId);
      doc.fontSize(8).fillColor(COLORS.muted).text(caption, x, y, { width: colW });
      if (buf) {
        try {
          doc.image(buf, x, y + 11, { fit: [colW, imgH], align: "center" });
          drawn = true;
        } catch {
          /* Bild nicht lesbar */
        }
      } else {
        doc.rect(x, y + 11, colW, imgH).lineWidth(0.4).strokeColor(COLORS.line).stroke();
        doc.text("kein Foto", x, y + 11 + imgH / 2 - 4, { width: colW, align: "center" });
      }
    }
    void drawn;
    doc.fontSize(9.5).fillColor(COLORS.text);
    doc.y = y + imgH + 18;
  }

  if (delivery?.notes) {
    heading(doc, "Bemerkungen bei Übergabe");
    doc.text(t(delivery.notes), MARGIN, doc.y, { width: CONTENT_W });
  }

  heading(doc, "Bestätigung", 120);
  doc.text(
    t(`Die oben aufgeführten Schäden wurden bei der Übergabe am ${formatDateTime(delivery?.performedAt ?? delivery?.completedAt)} gemeinsam festgestellt.`),
    MARGIN,
    doc.y,
    { width: CONTENT_W },
  );
  ensureSpace(doc, 100);
  const sy = doc.y + 8;
  const sigs: [string, string | null | undefined][] = [
    [`Empfänger: ${delivery?.handoverName ?? ""}`, delivery?.signatureCustomer],
    [`Fahrer: ${delivery?.performedBy?.name ?? ""}`, delivery?.signatureDriver],
  ];
  sigs.forEach(([text, sig], i) => {
    const x = MARGIN + i * (CONTENT_W / 2 + 10);
    const w = CONTENT_W / 2 - 10;
    if (sig) {
      try {
        doc.image(Buffer.from(sig.split(",")[1], "base64"), x, sy, { fit: [w, 60] });
      } catch {
        /* ungültige Signatur */
      }
    }
    doc.moveTo(x, sy + 64).lineTo(x + w, sy + 64).lineWidth(0.5).strokeColor(COLORS.text).stroke();
    doc.fontSize(8).fillColor(COLORS.muted).text(t(text), x, sy + 68, { width: w });
  });
  doc.fontSize(9.5).fillColor(COLORS.text);
  doc.y = sy + 90;

  drawFooters(doc, org);
  return toBuffer(doc);
}
