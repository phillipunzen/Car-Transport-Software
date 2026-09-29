import path from "path";
import { createWorker, OEM, type Worker } from "tesseract.js";

/**
 * Lokale Texterkennung (Tesseract, läuft komplett auf dem eigenen Server).
 * Wird genutzt, wenn kein KI-Schlüssel hinterlegt ist – es verlassen keine
 * Bilder das System. Sprachdaten werden mitgeliefert, nicht nachgeladen.
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
  }).catch((e) => {
    workerPromise = null;
    throw e;
  });
  return workerPromise;
}

/** Erkennt den Text eines Bildes. Aufrufe werden nacheinander abgearbeitet. */
export function recognizeText(image: Buffer): Promise<string> {
  const run = queue.then(async () => {
    const w = await worker();
    const { data } = await w.recognize(image);
    return data.text;
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Text aus PDFs mit Textebene (z. B. Online-Tickets, Hotelrechnungen). */
export async function extractPdfText(pdf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(doc, { mergePages: true });
  return text;
}
