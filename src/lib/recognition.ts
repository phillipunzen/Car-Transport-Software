import { aiEnabled, extractReceipt, extractVehicle } from "@/lib/ai";
import { extractPdfText, ocrEnabled, PREPROCESSING, recognizeText } from "@/lib/ocr";
import {
  isCompleteRegistration,
  mergeVehicleGuesses,
  parseReceiptText,
  parseVehicleText,
  type ReceiptGuess,
  type VehicleGuess,
} from "@/lib/ocr-parse";

/**
 * Wählt die Erkennungsmethode:
 * - KI (Claude), sobald ein ANTHROPIC_API_KEY hinterlegt ist
 * - sonst lokale Texterkennung (OCR) auf dem eigenen Server
 */
export type RecognitionMode = "ai" | "ocr" | "off";

export function recognitionMode(): RecognitionMode {
  if (aiEnabled()) return "ai";
  if (ocrEnabled()) return "ocr";
  return "off";
}

type Input = { data: Buffer; mimeType: string };

const isPdf = (f: Input) => f.mimeType === "application/pdf";

/**
 * Fahrzeugdaten per OCR: jedes Bild wird mit mehreren Aufbereitungen gelesen
 * (Schatten-Ausgleich, Grünkanal …). Die Ergebnisse werden feldweise
 * zusammengeführt; sind alle Felder gefunden, wird früh abgebrochen.
 */
async function ocrVehicle(files: Input[]): Promise<VehicleGuess> {
  const guesses: VehicleGuess[] = [];
  for (const file of files) {
    if (isPdf(file)) {
      guesses.push(parseVehicleText(await extractPdfText(file.data)));
      continue;
    }
    const perFile: VehicleGuess[] = [];
    for (const variant of PREPROCESSING) {
      try {
        perFile.push(parseVehicleText(await recognizeText(await variant.run(file.data))));
      } catch (e) {
        console.warn(`OCR-Variante ${variant.name} fehlgeschlagen`, e);
      }
      const merged = mergeVehicleGuesses(perFile);
      // Genug gefunden: vollständiger Fahrzeugschein …
      if (isCompleteRegistration(merged)) break;
      // … oder bei einem Einzelfoto (FIN-Plakette, Kennzeichen) zweimal dasselbe Ergebnis
      const agree = perFile.filter((g) => g.vin === merged.vin && g.licensePlate === merged.licensePlate).length;
      if (!merged.model && (merged.vin || merged.licensePlate) && agree >= 2) break;
    }
    guesses.push(...perFile);
  }
  return mergeVehicleGuesses(guesses);
}

async function ocrReceipt(file: Input): Promise<ReceiptGuess> {
  if (isPdf(file)) return parseReceiptText(await extractPdfText(file.data));
  let best: ReceiptGuess | null = null;
  for (const variant of PREPROCESSING.slice(0, 3)) {
    const guess = parseReceiptText(await recognizeText(await variant.run(file.data)));
    const score = [guess.amountGross, guess.date, guess.vatRate, guess.vendor].filter((v) => v !== null).length;
    const bestScore = best ? [best.amountGross, best.date, best.vatRate, best.vendor].filter((v) => v !== null).length : -1;
    if (score > bestScore) best = guess;
    if (guess.amountGross !== null && guess.date) break;
  }
  return best!;
}

export async function recognizeVehicle(files: Input[]): Promise<VehicleGuess> {
  const mode = recognitionMode();
  if (mode === "ai") return extractVehicle(files);
  if (mode === "off") throw new Error("Erkennung deaktiviert");
  return ocrVehicle(files);
}

export async function recognizeReceipt(file: Input): Promise<ReceiptGuess> {
  const mode = recognitionMode();
  if (mode === "ai") return extractReceipt(file);
  if (mode === "off") throw new Error("Erkennung deaktiviert");
  return ocrReceipt(file);
}
