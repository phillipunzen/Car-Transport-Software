import sharp from "sharp";

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"];

/**
 * Firmenlogo vereinheitlichen: in PNG umwandeln (PDFs können nur PNG/JPG), leere bzw. weiße Ränder
 * abschneiden und auf eine sinnvolle Größe begrenzen. Transparenz bleibt erhalten.
 */
export async function normalizeLogo(file: File): Promise<File> {
  if (!LOGO_TYPES.includes(file.type)) throw new Error("Logo bitte als PNG, JPG, WebP oder SVG hochladen.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Das Logo ist zu groß (max. 10 MB).");
  const input = Buffer.from(await file.arrayBuffer());
  let img = sharp(input, { density: 300, animated: false }).rotate();
  try {
    // Ränder in der Farbe des Eckpixels (weiß oder transparent) entfernen
    const trimmed = await img.clone().trim({ threshold: 12 }).png().toBuffer();
    img = sharp(trimmed);
  } catch {
    /* einfarbiges Bild – nicht beschneiden */
  }
  const out = await img.resize({ width: 1200, height: 600, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
  return new File([new Uint8Array(out)], "logo.png", { type: "image/png" });
}
