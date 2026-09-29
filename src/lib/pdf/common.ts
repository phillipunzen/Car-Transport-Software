import PDFDocument from "pdfkit";
import type { Organization } from "@prisma/client";
import { db } from "@/lib/db";
import { getFile } from "@/lib/storage";

export const MARGIN = 57; // ca. 20 mm
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const CONTENT_W = PAGE_W - 2 * MARGIN;
export const FOOTER_H = 70;
export const COLORS = { text: "#0f172a", muted: "#64748b", line: "#cbd5e1", accent: "#1d64e0", light: "#f1f5f9" };

/** Die Standardschriften von PDFKit kennen nur WinAnsi – Sonderzeichen ersetzen. */
export function t(s: string | null | undefined) {
  return (s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/→/g, "->")
    .replace(/[✓✔]/g, "x")
    .replace(/[✗✕]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF€„“”‚‘’–—…•]/g, "");
}

export function createDoc(title: string) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN + FOOTER_H, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: { Title: title, Creator: "Überführung" },
  });
  doc.font("Helvetica").fillColor(COLORS.text);
  return doc;
}

export function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export async function loadImage(fileId: string | null | undefined): Promise<Buffer | null> {
  if (!fileId) return null;
  const file = await db.file.findUnique({ where: { id: fileId } });
  if (!file || !["image/jpeg", "image/png"].includes(file.mimeType)) return null;
  try {
    return await getFile(file.storageKey);
  } catch {
    return null;
  }
}

export function senderLine(org: Organization) {
  return [org.companyName ?? org.name, org.street, [org.zip, org.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
}

/** Fußzeile mit Firmen-, Kontakt- und Bankdaten sowie Seitenzahlen auf allen Seiten. */
export function drawFooters(doc: PDFKit.PDFDocument, org: Organization) {
  const range = doc.bufferedPageRange();
  const cols = [
    [org.companyName ?? org.name, org.ownerName ? `Inh. ${org.ownerName}` : null, org.street, [org.zip, org.city].filter(Boolean).join(" ")],
    [org.phone ? `Tel. ${org.phone}` : null, org.email, org.website, org.vatId ? `USt-IdNr. ${org.vatId}` : org.taxNumber ? `St.-Nr. ${org.taxNumber}` : null],
    [org.bankName, org.accountHolder ? `Inhaber: ${org.accountHolder}` : null, org.iban ? `IBAN ${formatIban(org.iban)}` : null, org.bic ? `BIC ${org.bic}` : null],
  ].map((c) => c.filter(Boolean).join("\n"));
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = PAGE_H - MARGIN - FOOTER_H + 16;
    // Unterer Rand vorübergehend aufheben, sonst erzeugt PDFKit neue Seiten
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.moveTo(MARGIN, y - 8).lineTo(PAGE_W - MARGIN, y - 8).lineWidth(0.5).strokeColor(COLORS.line).stroke();
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted);
    const w = CONTENT_W / 3;
    cols.forEach((c, idx) => doc.text(t(c), MARGIN + idx * w, y, { width: w - 8, lineGap: 1 }));
    doc.text(`Seite ${i - range.start + 1} von ${range.count}`, MARGIN, PAGE_H - MARGIN + 4, { width: CONTENT_W, align: "right" });
    doc.page.margins.bottom = bottom;
  }
  doc.fillColor(COLORS.text);
}

export async function drawLogo(doc: PDFKit.PDFDocument, org: Organization) {
  const logo = await loadImage(org.logoFileId);
  if (!logo) return false;
  try {
    doc.image(logo, PAGE_W - MARGIN - 150, MARGIN - 20, { fit: [150, 60], align: "right" });
    return true;
  } catch {
    return false;
  }
}

export function formatIban(iban: string) {
  return iban.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}

/** Stellt sicher, dass noch `height` Punkte Platz sind, sonst neue Seite. */
export function ensureSpace(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height > PAGE_H - doc.page.margins.bottom) {
    doc.addPage();
    doc.y = MARGIN;
  }
}

/** Abschnittsüberschrift – `keep` hält so viel Platz für den folgenden Inhalt frei. */
export function heading(doc: PDFKit.PDFDocument, text: string, keep = 20) {
  ensureSpace(doc, 30 + keep);
  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.accent).text(t(text), MARGIN, doc.y, { width: CONTENT_W });
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.text);
}
