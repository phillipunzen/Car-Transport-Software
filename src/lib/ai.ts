import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

/**
 * KI-gestützte Erkennung (Claude Vision) für Fahrzeugdaten und Belege.
 * Ist kein ANTHROPIC_API_KEY gesetzt, ist die Funktion deaktiviert und alle
 * Felder werden manuell gepflegt.
 */
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

let client: Anthropic | undefined;
const anthropic = () => (client ??= new Anthropic());

type Input = { data: Buffer; mimeType: string };

function toContent(file: Input): Anthropic.Beta.BetaContentBlockParam {
  const data = file.data.toString("base64");
  if (file.mimeType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  const mediaType = file.mimeType as "image/jpeg" | "image/png" | "image/webp";
  return { type: "image", source: { type: "base64", media_type: mediaType, data } };
}

async function extract<S extends z.ZodType>(files: Input[], instruction: string, schema: S): Promise<z.infer<S>> {
  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: [...files.map(toContent), { type: "text", text: instruction }] }],
  });
  if (response.stop_reason === "refusal") throw new Error("Die Erkennung wurde abgelehnt.");
  if (!response.parsed_output) throw new Error("Die Erkennung lieferte kein verwertbares Ergebnis.");
  return response.parsed_output;
}

export const VehicleSchema = z.object({
  licensePlate: z.string().nullable().describe("Amtliches Kennzeichen, z.B. 'B-AB 1234'"),
  make: z.string().nullable().describe("Marke/Hersteller, z.B. 'Volkswagen'"),
  model: z.string().nullable().describe("Modell/Handelsbezeichnung, z.B. 'Golf 8 Variant'"),
  vin: z.string().nullable().describe("Fahrzeug-Identifizierungsnummer (17 Zeichen)"),
  color: z.string().nullable(),
  firstRegistration: z.string().nullable().describe("Erstzulassung im Format TT.MM.JJJJ"),
  mileage: z.number().int().nullable().describe("Kilometerstand, falls ein Tacho zu sehen ist"),
  notes: z.string().nullable().describe("Kurzer Hinweis, falls etwas unsicher oder unleserlich war"),
});

export async function extractVehicle(files: Input[]) {
  const result = await extract(
    files,
    `Du bekommst ein oder mehrere Fotos eines Fahrzeugs, des Kennzeichens, der Fahrgestellnummer (FIN/VIN),
des Tachos oder der Zulassungsbescheinigung Teil I (Fahrzeugschein).
Lies alle erkennbaren Fahrzeugdaten aus. Gib nur Werte zurück, die du im Bild tatsächlich erkennst
oder aus dem Erscheinungsbild sicher ableiten kannst (Marke/Modell anhand von Emblem und Form).
Kennzeichen im deutschen Format mit Bindestrich und Leerzeichen, FIN ohne Leerzeichen in Großbuchstaben.
Unbekannte Werte sind null.`,
    VehicleSchema,
  );
  if (result.vin) result.vin = result.vin.replace(/[\s-]/g, "").toUpperCase();
  return result;
}

export const EXPENSE_CATEGORIES = [
  "TRAIN",
  "FLIGHT",
  "BUS",
  "TAXI",
  "PUBLIC_TRANSPORT",
  "HOTEL",
  "FUEL",
  "CHARGING",
  "TOLL",
  "PARKING",
  "MEAL",
  "PER_DIEM",
  "OTHER",
] as const;

export const ReceiptSchema = z.object({
  vendor: z.string().nullable().describe("Aussteller des Belegs, z.B. 'Deutsche Bahn'"),
  date: z.string().nullable().describe("Belegdatum im Format JJJJ-MM-TT"),
  amountGross: z.number().nullable().describe("Gesamtbetrag brutto"),
  vatRate: z.number().nullable().describe("Umsatzsteuersatz in Prozent, z.B. 19 oder 7"),
  currency: z.string().nullable().describe("ISO-Währung, z.B. EUR"),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().nullable().describe("Kurzbeschreibung, z.B. 'ICE Hamburg – München'"),
});

export async function extractReceipt(file: Input) {
  return extract(
    [file],
    `Das ist ein Beleg (Quittung, Rechnung, Fahrkarte, Hotelrechnung o.ä.), der bei einer Fahrzeugüberführung angefallen ist.
Lies Aussteller, Datum, Bruttobetrag, Umsatzsteuersatz, Währung und eine kurze Beschreibung aus
und ordne den Beleg einer Kategorie zu (TRAIN=Bahn, FLIGHT=Flug, BUS=Fernbus, TAXI, PUBLIC_TRANSPORT=ÖPNV,
HOTEL, FUEL=Tanken, CHARGING=Laden E-Auto, TOLL=Maut/Vignette, PARKING, MEAL=Bewirtung/Essen,
PER_DIEM=Verpflegungspauschale, OTHER). Wenn mehrere Steuersätze vorkommen, nimm den für den größten Betrag.
Unbekannte Werte sind null.`,
    ReceiptSchema,
  );
}
