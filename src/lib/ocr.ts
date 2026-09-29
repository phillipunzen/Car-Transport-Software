import path from "path";
import sharp from "sharp";
import { createWorker, OEM, PSM, type Worker } from "tesseract.js";

/**
 * Lokale Texterkennung (Tesseract, läuft komplett auf dem eigenen Server).
 * Wird genutzt, wenn kein KI-Schlüssel hinterlegt ist. Sprachdaten werden
 * mitgeliefert, nicht nachgeladen.
 */
export const ocrEnabled = () => process.env.OCR_ENABLED !== "false";

// Im Docker-Image (standalone) wie lokal liegt node_modules im Arbeitsverzeichnis
const langPath = () =>
  process.env.OCR_LANG_PATH || path.join(process.cwd(), "node_modules/@tesseract.js-data/deu/4.0.0_best_int");

let workerPromise: Promise<Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function worker() {
  workerPromise ??= createWorker("deu", OEM.LSTM_ONLY, {
    langPath: langPath(),
    gzip: true,
    cacheMethod: "none",
  })
    .then(async (w) => {
      await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: "1" });
      return w;
    })
    .catch((e) => {
      workerPromise = null;
      throw e;
    });
  return workerPromise;
}

/** Erkennt den Text eines (bereits aufbereiteten) Bildes. Aufrufe werden nacheinander abgearbeitet. */
export function recognizeText(image: Buffer): Promise<string> {
  const run = queue.then(async () => {
    const w = await worker();
    const { data } = await w.recognize(image);
    return data.text;
  });
  queue = run.catch(() => undefined);
  return run;
}

// ---------------------------------------------------------------------------
// Bildaufbereitung
//
// Grünkanal: Fahrzeugscheine sind grün bedruckt (Linien, Feldnummern, Vordruck),
// die Eintragungen schwarz. Im Grünkanal verschwinden Linien & Vordruck fast
// vollständig, während der eigentliche Text dunkel bleibt.
// Helligkeitsausgleich: gleicht Schatten und ungleichmäßiges Licht von
// Handyfotos aus (Bild ÷ stark weichgezeichneter Hintergrund).
// ---------------------------------------------------------------------------

async function greenChannel(image: Buffer) {
  const meta = await sharp(image).metadata();
  const base = sharp(image).rotate();
  return (meta.channels ?? 3) >= 3 ? base.extractChannel("green") : base.grayscale();
}

async function flattened(image: Buffer, sigma: number) {
  const base = await greenChannel(image);
  const { data, info } = await base.clone().raw().toBuffer({ resolveWithObject: true });
  const bg = await base.clone().blur(sigma).raw().toBuffer();
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) out[i] = Math.min(255, Math.round((data[i] * 255) / Math.max(1, bg[i])));
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } })
    .normalise()
    .png()
    .toBuffer();
}

/** Aufbereitungsvarianten in der Reihenfolge, in der sie versucht werden. */
export const PREPROCESSING: { name: string; run: (image: Buffer) => Promise<Buffer> }[] = [
  { name: "ausgeglichen", run: (img) => flattened(img, 25) },
  { name: "gruen", run: async (img) => (await greenChannel(img)).normalise().png().toBuffer() },
  { name: "ausgeglichen-grob", run: (img) => flattened(img, 50) },
  { name: "original", run: async (img) => img },
];

/** Text aus PDFs mit Textebene (z. B. Online-Tickets, Hotelrechnungen). */
export async function extractPdfText(pdf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(doc, { mergePages: true });
  return text;
}
