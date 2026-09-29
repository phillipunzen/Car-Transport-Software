/**
 * Auswertung von OCR-Rohtext (ohne KI): Fahrgestellnummer, Kennzeichen,
 * Fahrzeugschein-Felder und Belegdaten per Regeln & Mustern.
 */

// ---------------------------------------------------------------------------
// Fahrgestellnummer (FIN / VIN)
// ---------------------------------------------------------------------------

const VIN_CHARS = /^[A-HJ-NPR-Z0-9]{17}$/;
const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/** Prüfziffer (Stelle 9) – in Nordamerika Pflicht, in Europa optional. */
export function vinCheckDigitValid(vin: string) {
  const sum = [...vin].reduce((s, c, i) => s + (/\d/.test(c) ? Number(c) : TRANSLIT[c] ?? 0) * WEIGHTS[i], 0);
  const check = sum % 11 === 10 ? "X" : String(sum % 11);
  return vin[8] === check;
}

/** Typische OCR-Verwechslungen korrigieren (I, O, Q kommen in FINs nicht vor). */
function normalizeVin(s: string) {
  return s.toUpperCase().replace(/O/g, "0").replace(/Q/g, "0").replace(/I/g, "1");
}

export function findVin(text: string): string | null {
  const candidates: { vin: string; score: number }[] = [];
  for (const line of text.toUpperCase().split(/\n/)) {
    // FIN = ein Wort mit 17 Zeichen; OCR (oder die Schreibweise) trennt es manchmal in mehrere Teile
    const tokens = line.split(/[\s|\-.:*]+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      let raw = "";
      for (let j = i; j < Math.min(tokens.length, i + 7); j++) {
        raw += tokens[j];
        if (raw.length > 18) break;
        // Prüfziffer (Feld 3) hinten oder eine als "1" gelesene Tabellenlinie vorn → 18 Zeichen zulassen
        for (const cand of raw.length === 18 ? [raw.slice(0, 17), raw.slice(1)] : raw.length === 17 ? [raw] : []) {
          if (!/^[A-Z0-9]{17}$/.test(cand)) continue;
          // Echte Ziffern zählen (nicht erst durch O→0 / I→1 entstanden) – filtert lange Wörter heraus
          const realDigits = (cand.match(/\d/g) ?? []).length;
          if (realDigits < 3 || /[A-Z]{12,}/.test(cand)) continue;
          const vin = normalizeVin(cand);
          if (!VIN_CHARS.test(vin)) continue;
          // Ohne bekannte Herstellerkennung und gültige Prüfziffer nur mit typischer Seriennummer (viele Ziffern)
          if (!makeFromVin(vin) && !vinCheckDigitValid(vin) && realDigits < 6) continue;
          let score = /\d{4}$/.test(vin) ? 2 : 0;
          if (WMI_MAKES[vin.slice(0, 3)] || WMI_MAKES[vin.slice(0, 2)]) score += 3;
          if (vinCheckDigitValid(vin)) score += 2;
          if (j === i) score += 1; // zusammenhängend erkannt
          candidates.push({ vin, score });
        }
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.vin ?? null;
}

// Hersteller-Kennung (World Manufacturer Identifier) – die ersten Stellen der FIN
export const WMI_MAKES: Record<string, string> = {
  WVW: "Volkswagen", WV1: "Volkswagen Nutzfahrzeuge", WV2: "Volkswagen Nutzfahrzeuge", WV3: "Volkswagen Nutzfahrzeuge",
  WAU: "Audi", WUA: "Audi", TRU: "Audi", WBA: "BMW", WBS: "BMW M", WBY: "BMW", WMW: "MINI",
  WDD: "Mercedes-Benz", WDB: "Mercedes-Benz", WDC: "Mercedes-Benz", WDF: "Mercedes-Benz", W1K: "Mercedes-Benz", W1N: "Mercedes-Benz", W1V: "Mercedes-Benz", W1W: "Mercedes-Benz",
  WME: "smart", WP0: "Porsche", WP1: "Porsche", W0L: "Opel", W0V: "Opel", WF0: "Ford", WF1: "Ford",
  VSS: "SEAT", VSE: "SEAT", TMB: "Škoda", VF1: "Renault", VF3: "Peugeot", VF7: "Citroën", VR3: "Peugeot", VR7: "Citroën", VR1: "DS",
  ZFA: "Fiat", ZFF: "Ferrari", ZAR: "Alfa Romeo", ZHW: "Lamborghini", ZAM: "Maserati", ZCF: "Iveco",
  VNK: "Toyota", SB1: "Toyota", JTD: "Toyota", JTE: "Toyota", JTN: "Toyota", JHM: "Honda", SHH: "Honda",
  JMZ: "Mazda", JN1: "Nissan", SJN: "Nissan", VSK: "Nissan", JS: "Suzuki", TSM: "Suzuki", JMB: "Mitsubishi",
  KMH: "Hyundai", TMA: "Hyundai", NLH: "Hyundai", KNA: "Kia", U5Y: "Kia", KNE: "Kia",
  YV1: "Volvo", YV4: "Volvo", LVY: "Volvo", SAL: "Land Rover", SAJ: "Jaguar", SCC: "Lotus",
  "5YJ": "Tesla", "7SA": "Tesla", LRW: "Tesla", XP7: "Tesla", UU1: "Dacia", VSX: "Opel", LSJ: "MG", LVV: "Chery",
  LGX: "BYD", LC0: "BYD", YS3: "Saab", YSM: "Polestar", LPS: "Polestar", WMA: "MAN", "1FA": "Ford", "1G1": "Chevrolet",
};

export function makeFromVin(vin: string | null) {
  if (!vin) return null;
  return WMI_MAKES[vin.slice(0, 3)] ?? WMI_MAKES[vin.slice(0, 2)] ?? null;
}

// ---------------------------------------------------------------------------
// Kennzeichen (deutsches Format)
// ---------------------------------------------------------------------------

const PLATE = /\b([A-ZÄÖÜ]{1,3})[\s\-:·.]{0,2}([A-Z]{1,2})[\s\-]{0,2}([1-9]\d{0,3})\s?([EH])?\b/;
const PLATE_LINE = /^([A-ZÄÖÜ]{1,3})[\s\-:·.]{1,3}([A-Z]{1,2})[\s\-]{0,2}([1-9]\d{0,3})\s?([EH])?$/;
// Häufige Fehltreffer aus Fahrzeugschein & Belegen (Abgasnorm, Kraftstoff, Adresse …)
const PLATE_NOISE = /EURO|DIESEL|BENZIN|STRASSE|STR\.|GMBH|TEL|FAX|WLTP|NEFZ|HYBR|KW\b|SPL/;
const NOT_A_DISTRICT = new Set(["EUR", "EU", "ST", "NR", "TEL", "FAX", "KW", "KM", "PS", "UST"]);

const formatPlate = (m: RegExpMatchArray) => `${m[1]}-${m[2]} ${m[3]}${m[4] ?? ""}`;

export function findPlate(text: string, strict = false): string | null {
  // Störzeichen am Zeilenrand (Tabellenlinien, Staub: "(", ".", "\\" …) entfernen
  // Im Fahrzeugschein ist das Kennzeichen immer in Großbuchstaben gedruckt – Kleinbuchstaben = Fehltreffer
  const lines = (strict ? text : text.toUpperCase())
    .split(/\n/)
    .map((l) => cleanLine(l).replace(/^[^A-ZÄÖÜ0-9]+|[^A-Z0-9]+$/g, ""));
  // 1. Zeile, die nur aus einem Kennzeichen besteht (z. B. Feld A im Fahrzeugschein)
  for (const line of lines) {
    const m = line.replace(/^A\s+(?=[A-ZÄÖÜ]{1,3}[\s\-]+[A-Z]{1,2}[\s\-]?\d)/, "").match(PLATE_LINE);
    if (m && !NOT_A_DISTRICT.has(m[1])) return formatPlate(m);
  }
  if (strict) return null;
  // 2. Kennzeichen irgendwo in einer Zeile
  for (const line of lines) {
    if (PLATE_NOISE.test(line)) continue;
    const m = line.match(PLATE);
    if (m && !NOT_A_DISTRICT.has(m[1])) return formatPlate(m);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fahrzeugschein (Zulassungsbescheinigung Teil I)
//
// Aufbau (rechte Seite, von oben): B Erstzulassung · 2.1 HSN · 2.2 TSN / J · 4 /
// E FIN / D.1 Marke / D.2 Typ, Variante, Version (3 Zeilen) / D.3 Handelsbezeichnung /
// 2 Herstellerkurzbezeichnung / 5 Fahrzeugklasse … Links: A Kennzeichen, C.1 Halter.
// Die kleinen Feldnummern und Tabellenlinien erkennt OCR oft als Störzeichen –
// deshalb wird zusätzlich über die feste Reihenfolge der Zeilen ausgewertet.
// ---------------------------------------------------------------------------

const MAKES: [RegExp, string][] = [
  [/MERCEDES[\s\-]*BENZ|^MERCEDES$|DAIMLER/, "Mercedes-Benz"],
  [/VOLKSWAGEN|^VW\b/, "Volkswagen"],
  [/^BMW\b|BAYER(ISCHE)?\s*MOTOREN/, "BMW"],
  [/^AUDI\b/, "Audi"],
  [/^OPEL\b/, "Opel"],
  [/^FORD\b/, "Ford"],
  [/^PORSCHE\b/, "Porsche"],
  [/^SKODA\b|^ŠKODA\b/, "Škoda"],
  [/^SEAT\b/, "SEAT"],
  [/^CUPRA\b/, "Cupra"],
  [/^RENAULT\b/, "Renault"],
  [/^DACIA\b/, "Dacia"],
  [/^PEUGEOT\b/, "Peugeot"],
  [/^CITRO[EË]N\b/, "Citroën"],
  [/^DS\b/, "DS"],
  [/^FIAT\b/, "Fiat"],
  [/^ALFA\s*ROMEO\b/, "Alfa Romeo"],
  [/^JEEP\b/, "Jeep"],
  [/^TOYOTA\b/, "Toyota"],
  [/^LEXUS\b/, "Lexus"],
  [/^MAZDA\b/, "Mazda"],
  [/^NISSAN\b/, "Nissan"],
  [/^HONDA\b/, "Honda"],
  [/^MITSUBISHI\b/, "Mitsubishi"],
  [/^SUZUKI\b/, "Suzuki"],
  [/^SUBARU\b/, "Subaru"],
  [/^HYUNDAI\b/, "Hyundai"],
  [/^KIA\b/, "Kia"],
  [/^VOLVO\b/, "Volvo"],
  [/^TESLA\b/, "Tesla"],
  [/^MINI\b/, "MINI"],
  [/^SMART\b/, "smart"],
  [/^LAND\s*ROVER\b/, "Land Rover"],
  [/^JAGUAR\b/, "Jaguar"],
  [/^MG\b/, "MG"],
  [/^BYD\b/, "BYD"],
  [/^POLESTAR\b/, "Polestar"],
  [/^IVECO\b/, "Iveco"],
  [/^MAN\b/, "MAN"],
];

/** Tabellenlinien, Anführungszeichen u. ä. entfernen, Leerraum normalisieren. */
function cleanLine(l: string) {
  return l
    .replace(/[|\[\]{}_=~»«„“”"'`¦!\\°]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Führende Feldnummern wie "D.1", "D 3", "2.1", "2" entfernen. */
function stripFieldLabel(l: string) {
  return l
    .replace(/^(?:[A-Z]\s?[.,:]\s?\d(?:\s?[.,]\s?\d)?|[0O]\s?[.,]\s?\d|\d{1,2}(?:[.,]\d)?)\s+(?=\S)/, "")
    .trim();
}

/** Zeile ohne Feldnummer und ohne Störzeichen am Rand, in Großbuchstaben */
const core = (line: string) =>
  stripFieldLabel(cleanLine(line).replace(/^[^A-Za-z0-9ÄÖÜäöü]+/, ""))
    .toUpperCase()
    .replace(/[^A-Z0-9ÄÖÜ)]+$/, "");

function matchMake(line: string): string | null {
  const u = core(line);
  for (const [re, name] of MAKES) if (re.test(u)) return name;
  return null;
}

/** Zeile besteht nur aus der Marke (optional mit Länderkürzel, z. B. "MAZDA (J)") → Feld D.1 oder 2 */
function isMakeOnly(line: string, make: string) {
  const u = core(line).replace(/\(.*?\)|\bAG\b|\bGMBH\b/g, "").trim();
  return matchMake(u) === make && u.split(/\s+/).length <= 2 && !/\d/.test(u);
}

function toDate(d: string, m: string, y: string) {
  const year = y.length === 2 ? `${Number(y) > 50 ? "19" : "20"}${y}` : y;
  if (Number(d) < 1 || Number(d) > 31 || Number(m) < 1 || Number(m) > 12) return null;
  if (Number(year) < 1950 || Number(year) > new Date().getFullYear()) return null;
  return `${d.padStart(2, "0")}.${m.padStart(2, "0")}.${year}`;
}

export type VehicleGuess = {
  licensePlate: string | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  color: string | null;
  firstRegistration: string | null;
  mileage: number | null;
  notes: string | null;
};

export function parseVehicleText(text: string): VehicleGuess {
  const lines = text.split(/\n/).map(cleanLine).filter(Boolean);
  const upper = text.toUpperCase();
  const vin = findVin(text);

  // Erstzulassung (Feld B): Datum, direkt gefolgt von der 4-stelligen Herstellerschlüsselnummer
  const bMatch = upper.match(/(\d{1,2})[.,](\d{1,2})[.,](\d{4})\D{1,8}\d{4}\b/);
  const bField = bMatch && toDate(bMatch[1], bMatch[2], bMatch[3]) ? bMatch : null;
  const anyDate = lines
    .map((l) => (/DATUM|HU\b/i.test(l) ? null : l.match(/\b(\d{1,2})[.,](\d{1,2})[.,](\d{4})\b/)))
    .find((m) => m && toDate(m[1], m[2], m[3]));
  const isRegistration =
    /ZULASSUNGSBESCHEINIGUNG|FAHRZEUGSCHEIN|FZ\.?\s?Z\.?\s?PERS|KENNZEICHEN|EG-?TYP|\bD\s?\.\s?[13]\b/i.test(text) || Boolean(bField && vin);

  // Marke (Feld D.1): erste Zeile mit einer bekannten Marke; sonst aus der FIN
  const makeIdx = lines.findIndex((l) => matchMake(l));
  const legacyD1 = lines.map((l) => l.match(/\bD\s?\.\s?1\b[:\s]*([A-ZÄÖÜa-zäöüé][\wÄÖÜäöüé\-. ]{1,30})/)).find(Boolean)?.[1];
  let make = makeIdx >= 0 ? matchMake(lines[makeIdx]) : legacyD1 ? titleCase(legacyD1.replace(/\s*\(.*$/, "")) : null;
  const vinMake = makeFromVin(vin);
  if (!make) make = vinMake;

  // Modell (Feld D.3): die Zeile direkt vor Feld 2 (Marke erneut, z. B. "MAZDA (J)")
  let model: string | null = null;
  const d3 = lines.map((l) => l.match(/\bD\s?\.\s?3\b[:\s]*([\wÄÖÜäöüé\-. ]{2,40})/)).find(Boolean)?.[1];
  if (d3) model = d3;
  if (!model && make && makeIdx >= 0) {
    // D.1 ist eine reine Markenzeile. Fehlt sie im OCR-Text, ist die erste Markenzeile schon D.3 ("MAZDA CX-5").
    const d1 = isMakeOnly(lines[makeIdx], make) ? makeIdx : -1;
    let field2 = lines.findIndex((l, i) => i > makeIdx && i - 1 !== d1 && isMakeOnly(l, make!));
    if (field2 < 0) {
      // Alternativ: Fahrzeugklasse (Feld 5, "FZ.Z.PERS.BEF…") steht zwei Zeilen nach D.3
      const cls = lines.findIndex((l, i) => i > makeIdx && /PERS|BEF\.|SPL\b|LKW|KRAFTRAD|SATTEL/i.test(l));
      if (cls > makeIdx + 1) field2 = cls - 1;
    }
    const candidate = field2 > 0 ? lines[field2 - 1] : d1 >= 0 ? lines[d1 + 4] : null;
    if (candidate && (field2 - 1 !== d1 || field2 < 0)) {
      const cleaned = stripFieldLabel(candidate);
      if (/[A-Za-z0-9]/.test(cleaned) && cleaned.length <= 40 && !/PERS|BEF\.|EURO|\d{3}\/\d{2}R\d/.test(cleaned.toUpperCase())) {
        model = cleaned;
      }
    }
  }
  if (model) model = model.replace(/^[^A-Za-z0-9ÄÖÜäöü]+|[^A-Za-z0-9ÄÖÜäöü)]+$/g, "").trim() || null;
  // Nur 1–2 Ziffern ist eine Feldnummer, kein Modell
  if (model && /^\d{1,2}$/.test(model)) model = null;
  if (model && make) {
    // "MAZDA CX-5" → "CX-5"
    const prefix = new RegExp(`^${make.replace(/[-\s]/g, "[\\s-]?")}\\s+`, "i");
    model = model.replace(prefix, "").trim() || model;
  }

  const color = lines.map((l) => l.match(/\bR\b[:\s]+([A-ZÄÖÜ][A-ZÄÖÜa-zäöü]{2,15})\b/)).find(Boolean)?.[1] ?? null;
  const reg = bField ?? anyDate;
  const firstRegistration = reg ? toDate(reg[1], reg[2], reg[3]) : null;
  // Im Fahrzeugschein nur eindeutige Kennzeichen-Zeilen (Feld A) werten – sonst viele Fehltreffer
  const licensePlate = findPlate(text, isRegistration);

  const found = [licensePlate, make, model, vin].filter(Boolean).length;
  return {
    licensePlate,
    make,
    model: isRegistration ? model : null,
    vin,
    color: isRegistration ? color : null,
    firstRegistration: isRegistration ? firstRegistration : null,
    mileage: null,
    notes: found
      ? isRegistration
        ? null
        : "Modell & Farbe lassen sich am besten vom Fahrzeugschein auslesen."
      : "Kein Text erkannt. Tipp: Kennzeichen, FIN oder Fahrzeugschein formatfüllend und scharf fotografieren.",
  };
}

/** Plausibilität je Feld – entscheidet bei Gleichstand zwischen Durchläufen. */
function fieldQuality(key: keyof VehicleGuess, value: string) {
  switch (key) {
    case "vin":
      return (makeFromVin(value) ? 2 : 0) + (/\d{4}$/.test(value) ? 1 : 0);
    case "model":
      return /^[A-Za-z0-9ÄÖÜäöü][\w .\-/()ÄÖÜäöü]{0,24}$/.test(value) ? 1 : 0;
    default:
      return 0;
  }
}

/**
 * Führt die Ergebnisse mehrerer OCR-Durchläufe (verschiedene Bildaufbereitungen)
 * zusammen: je Feld gewinnt der häufigste Wert, bei Gleichstand der plausibelste,
 * danach der aus dem früheren Durchlauf.
 */
export function mergeVehicleGuesses(guesses: VehicleGuess[]): VehicleGuess {
  if (guesses.length === 0) return parseVehicleText("");
  const keys = ["licensePlate", "make", "model", "vin", "color", "firstRegistration"] as const;
  const merged: VehicleGuess = { ...guesses[0] };
  for (const key of keys) {
    const votes = new Map<string, { count: number; first: number }>();
    guesses.forEach((g, i) => {
      const v = g[key];
      if (!v) return;
      const e = votes.get(v) ?? { count: 0, first: i };
      e.count++;
      votes.set(v, e);
    });
    const best = [...votes.entries()].sort(
      ([av, a], [bv, b]) => b.count - a.count || fieldQuality(key, bv) - fieldQuality(key, av) || a.first - b.first,
    )[0];
    merged[key] = best ? best[0] : null;
  }
  const found = [merged.licensePlate, merged.make, merged.model, merged.vin].filter(Boolean).length;
  merged.notes = found ? (merged.model ? null : guesses.find((g) => g.notes)?.notes ?? null) : guesses[guesses.length - 1].notes;
  return merged;
}

/** Sind alle wichtigen Felder eines Fahrzeugscheins erkannt? */
export function isCompleteRegistration(g: VehicleGuess) {
  // FIN nur als sicher werten, wenn ihre Herstellerkennung zur erkannten Marke passt
  const vinOk = Boolean(g.vin && makeFromVin(g.vin) && makeFromVin(g.vin)!.startsWith(g.make ?? "-"));
  return Boolean(g.licensePlate && vinOk && g.make && g.model && g.firstRegistration);
}

function titleCase(s: string) {
  if (s.length <= 3) return s.toUpperCase();
  return s
    .toLowerCase()
    .split(/(\s|-)/)
    .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1) : w))
    .join("");
}

// ---------------------------------------------------------------------------
// Belege
// ---------------------------------------------------------------------------

export type ReceiptGuess = {
  vendor: string | null;
  date: string | null;
  amountGross: number | null;
  vatRate: number | null;
  currency: string | null;
  category: string;
  description: string | null;
};

// [Muster, Anzeigename (null = gefundenen Namen übernehmen), Kategorie]
const VENDORS: [RegExp, string | null, string][] = [
  [/DEUTSCHE BAHN|DB FERNVERKEHR|DB REGIO|BAHN\.DE|\bICE\b/i, "Deutsche Bahn", "TRAIN"],
  [/FLIXBUS|FLIXTRAIN/i, "FlixBus", "BUS"],
  [/LUFTHANSA|EUROWINGS|RYANAIR|EASYJET|CONDOR/i, null, "FLIGHT"],
  [/\bUBER\b|FREE ?NOW|BOLT/i, null, "TAXI"],
  [/\bARAL\b/i, "Aral", "FUEL"],
  [/\bSHELL\b/i, "Shell", "FUEL"],
  [/\bESSO\b/i, "Esso", "FUEL"],
  [/TOTAL ?ENERGIES|\bTOTAL\b TANK/i, "TotalEnergies", "FUEL"],
  [/\bJET\b/i, "JET", "FUEL"],
  [/\bAVIA\b|\bOMV\b|STAR TANK|\bHEM\b|AGIP|ENI\b/i, null, "FUEL"],
  [/IONITY|ENBW|ALLEGO|FASTNED|TESLA SUPERCHARG|EWE GO|ELECTRA/i, null, "CHARGING"],
  [/TANK ?& ?RAST|SANIFAIR/i, "Tank & Rast", "MEAL"],
  [/MOTEL ONE|\bIBIS\b|B ?& ?B HOTEL|INTERCITY ?HOTEL|HOLIDAY INN|PREMIER INN|NH HOTEL|ACHAT|LEONARDO|MARITIM|HILTON|MARRIOTT|A&O/i, null, "HOTEL"],
  [/\bMVG\b|\bMVV\b|\bHVV\b|\bBVG\b|\bVBB\b|\bVRR\b|\bRMV\b|\bKVB\b|\bVVS\b|DEUTSCHLANDTICKET/i, null, "PUBLIC_TRANSPORT"],
  [/ASFINAG|VIGNETTE|AUTOSTRADE|TOLL COLLECT|MAUT/i, null, "TOLL"],
  [/APCOA|CONTIPARK|Q-PARK|PARKHAUS|PARKSCHEIN|EASYPARK|PARK ?NOW/i, null, "PARKING"],
];

const CATEGORY_WORDS: [RegExp, string][] = [
  [/ÜBERNACHTUNG|UEBERNACHTUNG|HOTEL|ZIMMER|LOGIS|BEHERBERGUNG/i, "HOTEL"],
  [/FAHRKARTE|FAHRSCHEIN|TICKET|\bICE\b|\bIC\b|\bRE\b ?\d|ZUGBINDUNG|BAHNCARD/i, "TRAIN"],
  [/TAXI/i, "TAXI"],
  [/DIESEL|SUPER ?(E10|E5|PLUS)?|BENZIN|KRAFTSTOFF|ADBLUE|\bLITER\b|\bLTR\b/i, "FUEL"],
  [/\bKWH\b|LADEVORGANG|LADEPUNKT|LADESÄULE/i, "CHARGING"],
  [/MAUT|VIGNETTE|PÉAGE|PEAGE/i, "TOLL"],
  [/PARKEN|PARKGEB|PARKSCHEIN|PARKHAUS/i, "PARKING"],
  [/RESTAURANT|BEWIRTUNG|SPEISEN|GETRÄNKE|KAFFEE|BÄCKEREI|BAECKEREI/i, "MEAL"],
  [/FLUG|FLIGHT|BOARDING/i, "FLIGHT"],
];

const MONEY = /(?:€|EUR)?\s?(-?\d{1,3}(?:[.\s]\d{3})*,\d{2}|-?\d+\.\d{2}|-?\d+,\d{2})\s?(?:€|EUR)?/g;
// Schlüsselwörter für den Gesamtbetrag, nach Verlässlichkeit gestaffelt
const TOTAL_TIERS = [
  /(GESAMT|SUMME|TOTAL|ZU ZAHLEN|ENDBETRAG|RECHNUNGSBETRAG)/i,
  /(BETRAG|BRUTTO|PREIS)/i,
  /(EC-?KARTE|KARTENZAHLUNG|GIROCARD|VISA|MASTERCARD|\bBAR\b)/i,
];
const NOT_TOTAL = /MWST|UST|STEUER|NETTO|RÜCKGELD|RUECKGELD|ZURÜCK|GEGEBEN|\/ ?L\b|EUR\/L|PRO LITER/i;

function parseMoney(s: string) {
  const t = s.replace(/\s/g, "");
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : null;
}

function amountsIn(line: string) {
  return [...line.matchAll(MONEY)].map((m) => parseMoney(m[1])).filter((n): n is number => n !== null && n > 0 && n < 100000);
}

export function parseReceiptText(text: string, now = new Date()): ReceiptGuess {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);

  // Betrag: bevorzugt Zeilen mit "Summe/Gesamt/…", ohne MwSt-/Netto-Zeilen
  let amount: number | null = null;
  for (const tier of TOTAL_TIERS) {
    const found = lines.filter((l) => tier.test(l) && !NOT_TOTAL.test(l)).flatMap(amountsIn);
    if (found.length) {
      amount = Math.max(...found);
      break;
    }
  }
  if (amount === null) {
    const all = lines.filter((l) => !NOT_TOTAL.test(l)).flatMap(amountsIn);
    if (all.length) amount = Math.max(...all);
  }

  // Datum: erstes plausibles Datum (nicht in der Zukunft, max. 3 Jahre alt)
  let date: string | null = null;
  for (const m of text.matchAll(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4}|\d{2})\b|(\d{4})-(\d{2})-(\d{2})/g)) {
    const [y, mo, d] = m[4] ? [Number(m[4]), Number(m[5]), Number(m[6])] : [Number(m[3].length === 2 ? `20${m[3]}` : m[3]), Number(m[2]), Number(m[1])];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getTime() > now.getTime() + 86400000 || now.getTime() - dt.getTime() > 3 * 365 * 86400000) continue;
    date = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    break;
  }

  // Steuersatz
  let vatRate: number | null = null;
  const vatMatch = text.match(/(?:MWST|UST|MEHRWERTSTEUER|UMSATZSTEUER|VAT)[^\n%]{0,25}?(\d{1,2}(?:[,.]\d{1,2})?)\s?%/i) ?? text.match(/\b(19|7|0)(?:[,.]0{1,2})?\s?%/);
  if (vatMatch) {
    const v = Number(vatMatch[1].replace(",", "."));
    if ([0, 5, 7, 10, 16, 19, 20, 21, 22].includes(v)) vatRate = v;
  }

  // Aussteller & Kategorie
  let vendor: string | null = null;
  let category = "OTHER";
  const known = VENDORS.map(([re, name, cat]) => ({ m: text.match(re), name, cat })).find((v) => v.m);
  if (known?.m) {
    vendor = known.name ?? titleCase(known.m[0].trim());
    category = known.cat;
  } else {
    const head = lines.slice(0, 5).find((l) => /[A-Za-zÄÖÜäöü]{3}/.test(l) && !/QUITTUNG|RECHNUNG|BELEG|KASSENBON|WILLKOMMEN/i.test(l));
    vendor = head ? head.replace(/[^\wÄÖÜäöüß&.\- ]/g, "").trim().slice(0, 60) || null : null;
  }
  if (category === "OTHER") category = CATEGORY_WORDS.find(([re]) => re.test(text))?.[1] ?? "OTHER";

  const currency = /\bCHF\b|FR\./.test(text) ? "CHF" : /\bPLN\b|ZŁ/i.test(text) ? "PLN" : /\bCZK\b|KČ/i.test(text) ? "CZK" : "EUR";

  return { vendor, date, amountGross: amount, vatRate, currency, category, description: null };
}
