import type { Customer, Damage, Order, Organization, Photo, Protocol, User } from "@prisma/client";
import { addressLines, customerName, formatDateTime, orderNo } from "@/lib/format";
import { CHECKLIST_ITEMS, CLEANLINESS, DAMAGE_AREAS, DAMAGE_SEVERITY, DAMAGE_TYPES, PHOTO_CATEGORIES, TRANSPORT_MODE } from "@/lib/labels";
import { CAR_ZONES } from "@/lib/car-zones";
import { COLORS, CONTENT_W, MARGIN, createDoc, drawFooters, drawLogo, ensureSpace, heading, loadImage, t, toBuffer } from "./common";

type Data = {
  org: Organization;
  order: Order & { customer: Customer };
  protocol: Protocol & { performedBy: User | null };
  damages: Damage[];
  photos: Photo[];
  pickupDamages?: Damage[];
};

function kv(doc: PDFKit.PDFDocument, rows: [string, string | null | undefined][], x = MARGIN, width = CONTENT_W, labelW = 130) {
  for (const [k, v] of rows) {
    const y = doc.y;
    doc.fillColor(COLORS.muted).text(t(k), x, y, { width: labelW - 6 });
    doc.fillColor(COLORS.text).text(t(v || "–"), x + labelW, y, { width: width - labelW });
    doc.y = Math.max(doc.y, y + 13);
  }
}

function drawCar(doc: PDFKit.PDFDocument, x: number, y: number, scale: number, counts: Record<string, number>) {
  for (const z of CAR_ZONES) {
    const n = counts[z.id] ?? 0;
    doc
      .roundedRect(x + z.x * scale, y + z.y * scale, z.w * scale, z.h * scale, (z.r ?? 0) * scale)
      .lineWidth(0.6)
      .fillAndStroke(n ? "#fecaca" : z.id.startsWith("WHEEL") ? "#334155" : "#f1f5f9", n ? "#dc2626" : "#94a3b8");
    if (n) {
      doc.circle(x + (z.x + z.w / 2) * scale, y + (z.y + z.h / 2) * scale, 6).fill("#dc2626");
      doc.fillColor("#fff").fontSize(7).font("Helvetica-Bold").text(String(n), x + (z.x + z.w / 2) * scale - 6, y + (z.y + z.h / 2) * scale - 3, { width: 12, align: "center" });
    }
  }
  doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted).text("FRONT", x, y - 10, { width: 240 * scale, align: "center" });
  doc.fillColor(COLORS.text).fontSize(9.5);
}

export async function renderProtocolPdf({ org, order, protocol, damages, photos, pickupDamages }: Data) {
  const pickup = protocol.type === "PICKUP";
  const title = pickup ? "Abholprotokoll" : "Übergabeprotokoll";
  const doc = createDoc(`${title} ${orderNo(order.number)}`);
  await drawLogo(doc, org);

  doc.font("Helvetica-Bold").fontSize(18).text(t(title), MARGIN, MARGIN);
  doc.font("Helvetica").fontSize(10).fillColor(COLORS.muted).text(t(`Auftrag ${orderNo(order.number)} · ${org.companyName ?? org.name}`));
  doc.fillColor(COLORS.text).fontSize(9.5);
  doc.y = Math.max(doc.y, MARGIN + 60);

  // Auftrag & Fahrzeug nebeneinander
  heading(doc, "Auftrag & Fahrzeug");
  const top = doc.y;
  kv(
    doc,
    [
      ["Auftraggeber", customerName(order.customer)],
      ["Anschrift", addressLines(order.customer).slice(1).join(", ")],
      ["Überführungsart", TRANSPORT_MODE[order.transportMode]],
      ["Referenz", order.reference],
      ["Abholung", [order.pickupName, order.pickupStreet, [order.pickupZip, order.pickupCity].filter(Boolean).join(" ")].filter(Boolean).join(", ")],
      ["Zustellung", [order.deliveryName, order.deliveryStreet, [order.deliveryZip, order.deliveryCity].filter(Boolean).join(" ")].filter(Boolean).join(", ")],
    ],
    MARGIN,
    CONTENT_W / 2 - 10,
    95,
  );
  const leftBottom = doc.y;
  doc.y = top;
  kv(
    doc,
    [
      ["Kennzeichen", order.licensePlate],
      ["Marke / Modell", [order.make, order.model].filter(Boolean).join(" ")],
      ["FIN", order.vin],
      ["Farbe", order.color],
      ["Erstzulassung", order.firstRegistration],
    ],
    MARGIN + CONTENT_W / 2 + 10,
    CONTENT_W / 2 - 10,
    85,
  );
  doc.y = Math.max(doc.y, leftBottom);

  heading(doc, pickup ? "Abholung" : "Übergabe");
  kv(doc, [
    ["Datum / Uhrzeit", formatDateTime(protocol.performedAt)],
    ["Ort", protocol.location],
    ["Kilometerstand", protocol.mileage != null ? `${protocol.mileage.toLocaleString("de-DE")} km` : null],
    ["Tankfüllung / Ladestand", protocol.fuelLevel != null ? `${protocol.fuelLevel} %` : null],
    ["Sauberkeit außen / innen", `${CLEANLINESS[protocol.exteriorClean ?? ""] ?? "–"} / ${CLEANLINESS[protocol.interiorClean ?? ""] ?? "–"}`],
    ["Fahrer", protocol.performedBy?.name ?? protocol.performedBy?.email],
  ]);

  heading(doc, "Zubehör & Checkliste");
  const checklist = (protocol.checklist ?? {}) as Record<string, boolean | number>;
  const half = Math.ceil(CHECKLIST_ITEMS.length / 2);
  const cy = doc.y;
  CHECKLIST_ITEMS.forEach((item, idx) => {
    const col = idx < half ? 0 : 1;
    const row = idx < half ? idx : idx - half;
    const v = checklist[item.key];
    const mark = item.kind === "count" ? `${Number(v ?? 0)}x` : v ? "[x]" : "[  ]";
    doc.text(t(`${mark}  ${item.label}`), MARGIN + col * (CONTENT_W / 2), cy + row * 13, { width: CONTENT_W / 2 - 10 });
  });
  doc.y = cy + half * 13;

  // Schäden inkl. Skizze
  heading(doc, `Schäden (${damages.length})`, 190);
  const counts = damages.reduce<Record<string, number>>((a, d) => ({ ...a, [d.area]: (a[d.area] ?? 0) + 1 }), {});
  const sketchY = doc.y + 12;
  drawCar(doc, MARGIN, sketchY, 0.42, counts);
  doc.y = sketchY - 12;
  const listX = MARGIN + 120;
  if (damages.length === 0) {
    doc.text("Keine Schäden festgestellt.", listX, doc.y, { width: CONTENT_W - 120 });
  } else {
    damages.forEach((d, i) => {
      doc.text(
        t(`${i + 1}. ${DAMAGE_AREAS[d.area] ?? d.area}: ${DAMAGE_TYPES[d.type] ?? d.type} (${DAMAGE_SEVERITY[d.severity]?.label ?? d.severity})${d.description ? ` – ${d.description}` : ""}`),
        listX,
        doc.y,
        { width: CONTENT_W - 120 },
      );
    });
  }
  if (pickupDamages) {
    const known = new Set(pickupDamages.map((d) => d.area));
    const fresh = damages.filter((d) => !known.has(d.area));
    doc.moveDown(0.5).fillColor(fresh.length ? "#b91c1c" : COLORS.muted);
    doc.text(
      t(fresh.length ? `Achtung: ${fresh.length} Schaden/Schäden an Stellen, die bei Abholung ohne Befund waren.` : "Keine neuen Schadstellen gegenüber dem Abholprotokoll."),
      listX,
      doc.y,
      { width: CONTENT_W - 120 },
    );
    doc.fillColor(COLORS.text);
  }
  doc.y = Math.max(doc.y, sketchY + 412 * 0.42 + 6);

  if (protocol.notes) {
    heading(doc, "Bemerkungen");
    doc.text(t(protocol.notes), MARGIN, doc.y, { width: CONTENT_W });
  }

  // Unterschriften
  heading(doc, "Bestätigung", 150);
  if (org.protocolTerms) doc.fontSize(8).fillColor(COLORS.muted).text(t(org.protocolTerms), MARGIN, doc.y, { width: CONTENT_W }).moveDown(0.5);
  doc.fontSize(9.5).fillColor(COLORS.text);
  doc.text(
    t(
      pickup
        ? "Das Fahrzeug wurde im oben beschriebenen Zustand zur Überführung übergeben."
        : "Das Fahrzeug wurde im oben beschriebenen Zustand übernommen.",
    ),
    MARGIN,
    doc.y,
    { width: CONTENT_W },
  );
  ensureSpace(doc, 105);
  const sy = doc.y + 8;
  const sigs: [string, string | null][] = [
    [`${pickup ? "Übergeben" : "Empfangen"}: ${protocol.handoverName ?? ""}`, protocol.signatureCustomer],
    [`Fahrer: ${protocol.performedBy?.name ?? ""}`, protocol.signatureDriver],
  ];
  sigs.forEach(([label, sig], i) => {
    const x = MARGIN + i * (CONTENT_W / 2 + 10);
    const w = CONTENT_W / 2 - 10;
    if (sig) {
      try {
        doc.image(Buffer.from(sig.split(",")[1], "base64"), x, sy, { fit: [w, 70] });
      } catch {
        /* ungültige Signatur ignorieren */
      }
    }
    doc.moveTo(x, sy + 74).lineTo(x + w, sy + 74).lineWidth(0.5).strokeColor(COLORS.text).stroke();
    doc.fontSize(8).fillColor(COLORS.muted).text(t(label), x, sy + 78, { width: w });
  });
  doc.fontSize(9.5).fillColor(COLORS.text);
  doc.y = sy + 100;

  // Fotodokumentation
  const images: { buf: Buffer; label: string }[] = [];
  for (const p of photos.slice(0, 24)) {
    const buf = await loadImage(p.fileId);
    if (buf) images.push({ buf, label: `${PHOTO_CATEGORIES[p.category] ?? p.category} · ${formatDateTime(p.createdAt)}` });
  }
  if (images.length) {
    doc.addPage();
    doc.y = MARGIN;
    heading(doc, `Fotodokumentation (${images.length})`);
    const cols = 3;
    const gap = 8;
    const w = (CONTENT_W - gap * (cols - 1)) / cols;
    const h = w * 0.75;
    let y = doc.y;
    images.forEach((img, i) => {
      const col = i % cols;
      if (col === 0 && i > 0) y += h + 22;
      if (y + h + 20 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = MARGIN;
      }
      const x = MARGIN + col * (w + gap);
      try {
        doc.image(img.buf, x, y, { fit: [w, h], align: "center", valign: "center" });
      } catch {
        doc.rect(x, y, w, h).stroke();
      }
      doc.fontSize(7).fillColor(COLORS.muted).text(t(img.label), x, y + h + 3, { width: w });
    });
    doc.fillColor(COLORS.text);
  }

  drawFooters(doc, org);
  return toBuffer(doc);
}
