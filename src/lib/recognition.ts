import { aiEnabled, extractReceipt, extractVehicle } from "@/lib/ai";
import { extractPdfText, ocrEnabled, recognizeText } from "@/lib/ocr";
import { parseReceiptText, parseVehicleText, type ReceiptGuess, type VehicleGuess } from "@/lib/ocr-parse";

/**
 * Wählt die Erkennungsmethode:
 * - KI (Claude), sobald ein ANTHROPIC_API_KEY hinterlegt ist
 * - sonst lokale Texterkennung (OCR) auf dem eigenen Server – ohne Datenweitergabe
 */
export type RecognitionMode = "ai" | "ocr" | "off";

export function recognitionMode(): RecognitionMode {
  if (aiEnabled()) return "ai";
  if (ocrEnabled()) return "ocr";
  return "off";
}

type Input = { data: Buffer; mimeType: string };

async function textOf(file: Input) {
  if (file.mimeType === "application/pdf") return extractPdfText(file.data);
  return recognizeText(file.data);
}

export async function recognizeVehicle(files: Input[]): Promise<VehicleGuess> {
  const mode = recognitionMode();
  if (mode === "ai") return extractVehicle(files);
  if (mode === "off") throw new Error("Erkennung deaktiviert");
  const texts = [];
  for (const f of files) texts.push(await textOf(f));
  return parseVehicleText(texts.join("\n"));
}

export async function recognizeReceipt(file: Input): Promise<ReceiptGuess> {
  const mode = recognitionMode();
  if (mode === "ai") return extractReceipt(file);
  if (mode === "off") throw new Error("Erkennung deaktiviert");
  return parseReceiptText(await textOf(file));
}
