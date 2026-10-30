import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SAMPLES, VARIANTS, renderZb1, type Zb1Sample } from "./fixtures/zb1-synth";

/**
 * Vergleich der Fahrzeugschein-Erkennung je Modell auf künstlichen Fahrzeugscheinen.
 * Läuft nur auf Wunsch (kostet API-Guthaben):
 *   RUN_AI_EVAL=1 npx vitest run tests/recognition-eval.test.ts
 * ANTHROPIC_API_KEY kommt aus der Umgebung oder der .env. Modelle über AI_EVAL_MODELS
 * (kommagetrennt, "ocr" = lokale Texterkennung als Vergleich). Bericht: data/recognition-eval.md
 * (oder AI_EVAL_OUT).
 */
if (existsSync(".env")) process.loadEnvFile(".env");

const MODELS = (process.env.AI_EVAL_MODELS || "claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5,ocr").split(",").map((m) => m.trim()).filter(Boolean);
const needsKey = MODELS.some((m) => m !== "ocr");
const enabled = Boolean(process.env.RUN_AI_EVAL) && (!needsKey || Boolean(process.env.ANTHROPIC_API_KEY));

// US-$ je 1 Mio. Tokens (Eingabe, Ausgabe)
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
};

const FIELDS = ["licensePlate", "vin", "make", "model", "firstRegistration", "color"] as const;
type Field = (typeof FIELDS)[number];
type Guess = Partial<Record<Field, string | null>>;

const norm = (v: string | null | undefined) => (v ?? "").toUpperCase().replace(/ß/g, "SS").replace(/[\s\-./]/g, "");
const plate = (v: string | null | undefined) => (v ?? "").toUpperCase().trim().replace(/\s+/g, " ");

/** Bewertung je Feld – Kennzeichen streng im deutschen Format, Modell/Farbe tolerant. */
function score(truth: Zb1Sample, g: Guess): Record<Field, boolean> {
  const model = norm(g.model);
  return {
    licensePlate: plate(g.licensePlate) === truth.licensePlate,
    vin: norm(g.vin) === truth.vin,
    make: norm(g.make) === norm(truth.make),
    model: Boolean(model) && (model.includes(norm(truth.model)) || norm(truth.model).includes(model)),
    firstRegistration: (g.firstRegistration ?? "").trim() === truth.firstRegistration,
    color: Boolean(g.color) && norm(g.color).includes(norm(truth.color)),
  };
}

/** Zählt die Tokens aller Antworten der Claude-API mit. */
function countUsage() {
  const usage = { input: 0, output: 0 };
  const original = globalThis.fetch;
  globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await original(...args);
    if (String(args[0]).includes("/v1/messages")) {
      const body = await res.clone().json().catch(() => null);
      usage.input += body?.usage?.input_tokens ?? 0;
      usage.output += body?.usage?.output_tokens ?? 0;
    }
    return res;
  };
  return { usage, restore: () => (globalThis.fetch = original) };
}

async function recognizerFor(model: string) {
  vi.resetModules();
  // Die Umgebung dieses Rechners kann auf einen Proxy zeigen – der Test spricht direkt mit der Claude-API
  vi.stubEnv("ANTHROPIC_BASE_URL", process.env.AI_EVAL_BASE_URL || "https://api.anthropic.com");
  if (model === "ocr") {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    vi.doMock("@/lib/db", () => ({ db: {} }));
    const { recognizeVehicle } = await import("@/lib/recognition");
    return (data: Buffer) => recognizeVehicle([{ data, mimeType: "image/jpeg" }]) as Promise<Guess>;
  }
  vi.stubEnv("ANTHROPIC_MODEL", model);
  const { extractVehicle } = await import("@/lib/ai");
  return (data: Buffer) => extractVehicle([{ data, mimeType: "image/jpeg" }]) as Promise<Guess>;
}

describe.skipIf(!enabled)("Fahrzeugschein-Erkennung je Modell", () => {
  it(
    "liest künstliche Fahrzeugscheine aus",
    async () => {
      const images = await Promise.all(
        SAMPLES.flatMap((s) => VARIANTS.map(async (v) => ({ sample: s, variant: v, data: await renderZb1(s, v) }))),
      );
      const report: string[] = [];
      for (const model of MODELS) {
        const recognize = await recognizerFor(model);
        const { usage, restore } = countUsage();
        const perField = Object.fromEntries(FIELDS.map((f) => [f, 0])) as Record<Field, number>;
        const perVariant = Object.fromEntries(VARIANTS.map((v) => [v, 0])) as Record<string, number>;
        const misses: string[] = [];
        let errors = 0;
        const started = Date.now();
        try {
          // höchstens 4 Anfragen gleichzeitig
          const queue = [...images];
          await Promise.all(
            Array.from({ length: model === "ocr" ? 1 : 4 }, async () => {
              for (let item = queue.shift(); item; item = queue.shift()) {
                let guess: Guess = {};
                let failed = false;
                try {
                  guess = await recognize(item.data);
                } catch (e) {
                  errors++;
                  failed = true;
                  misses.push(`${item.sample.id}/${item.variant}: Fehler ${(e as Error).message}`);
                }
                const result = score(item.sample, guess);
                for (const f of FIELDS) {
                  if (result[f]) perField[f]++;
                  else if (!failed) misses.push(`${item.sample.id}/${item.variant} ${f}: „${guess[f] ?? "–"}“ statt „${item.sample[f]}“`);
                }
                if (FIELDS.every((f) => result[f])) perVariant[item.variant]++;
              }
            }),
          );
        } finally {
          restore();
          vi.unstubAllEnvs();
          vi.doUnmock("@/lib/db");
        }
        const n = images.length;
        const total = Object.values(perField).reduce((a, b) => a + b, 0);
        const price = PRICES[model];
        const cost = price ? (usage.input * price[0] + usage.output * price[1]) / 1e6 : 0;
        report.push(
          [
            `## ${model}`,
            `Felder richtig: ${total}/${n * FIELDS.length} (${((100 * total) / (n * FIELDS.length)).toFixed(1)} %) · Fehler: ${errors} · Dauer: ${((Date.now() - started) / 1000).toFixed(0)} s`,
            price ? `Tokens: ${usage.input} ein / ${usage.output} aus · Kosten: $${cost.toFixed(4)} gesamt, $${(cost / n).toFixed(5)} pro Bild` : "Kosten: keine (lokal)",
            `Je Feld: ${FIELDS.map((f) => `${f} ${perField[f]}/${n}`).join(" · ")}`,
            `Komplett richtig je Variante: ${VARIANTS.map((v) => `${v} ${perVariant[v]}/${SAMPLES.length}`).join(" · ")}`,
            ...(misses.length ? ["Abweichungen:", ...misses.slice(0, 40).map((m) => `  - ${m}`)] : []),
          ].join("\n"),
        );
        console.log(report.at(-1));
      }
      const out = process.env.AI_EVAL_OUT || "data/recognition-eval.md";
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, `# Fahrzeugschein-Erkennung (${new Date().toISOString()})\n\n${report.join("\n\n")}\n`);
      expect(report).toHaveLength(MODELS.length);
    },
    45 * 60000,
  );
});
