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
  const lines = text.toUpperCase().split(/\n/);
  for (const line of lines) {
    // Leerzeichen/Bindestriche innerhalb der FIN zulassen
    const compact = line.replace(/[\s\-.:*]/g, "");
    for (let i = 0; i + 17 <= compact.length; i++) {
      const raw = compact.slice(i, i + 17);
      if (!/^[A-Z0-9]{17}$/.test(raw)) continue;
      const vin = normalizeVin(raw);
      if (!VIN_CHARS.test(vin)) continue;
      const digits = (vin.match(/\d/g) ?? []).length;
      if (digits < 4 || digits > 15) continue;
      // Letzte 4 Stellen sind bei (fast) allen Herstellern numerisch
      let score = /\d{4}$/.test(vin) ? 2 : 0;
      if (WMI_MAKES[vin.slice(0, 3)] || WMI_MAKES[vin.slice(0, 2)]) score += 3;
      if (vinCheckDigitValid(vin)) score += 2;
      if (/FIN|VIN|FAHRZEUG-?IDENT|\bE\b/.test(line)) score += 1;
      candidates.push({ vin, score });
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

export function findPlate(text: string): string | null {
  for (const line of text.toUpperCase().split(/\n/)) {
    const m = line.replace(/[|]/g, "").match(PLATE);
    if (!m) continue;
    // Häufige Fehltreffer (z. B. Datums- oder Fließtext) aussortieren
    if (/STRASSE|STR\.|GMBH|TEL|FAX/.test(line)) continue;
    return `${m[1]}-${m[2]} ${m[3]}${m[4] ?? ""}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fahrzeugschein (Zulassungsbescheinigung Teil I)
// ---------------------------------------------------------------------------

const DATE = /(\d{2})[.,](\d{2})[.,](\d{4}|\d{2})\b/;

function fieldValue(lines: string[], code: RegExp) {
  for (const line of lines) {
    const m = line.match(code);
    if (m && m[1]?.trim()) return m[1].trim().replace(/\s{2,}/g, " ");
  }
  return null;
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
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const vin = findVin(text);

  // Feldcodes des Fahrzeugscheins: A Kennzeichen, B Erstzulassung, D.1 Marke, D.3 Handelsbezeichnung, E FIN, R Farbe
  const isRegistration = /ZULASSUNGSBESCHEINIGUNG|D\.1|D\.3|\bE\b.*[A-Z0-9]{17}/i.test(text);
  let make = fieldValue(lines, /\bD\s?\.\s?1\b[:\s]*([A-ZÄÖÜa-zäöüé][\wÄÖÜäöüé\-. ]{1,30})/);
  let model = fieldValue(lines, /\bD\s?\.\s?3\b[:\s]*([\wÄÖÜäöüé\-. ]{2,40})/);
  const regDate = lines.map((l) => l.match(new RegExp(`\\bB\\b[^\\d]{0,6}${DATE.source}`))).find(Boolean);
  const color = fieldValue(lines, /\bR\b[:\s]+([A-ZÄÖÜ][A-ZÄÖÜa-zäöü]{2,15})\b/);

  make = make ? titleCase(make.replace(/\s*\(.*$/, "")) : makeFromVin(vin);
  if (model) model = model.replace(/\s+/g, " ");

  let firstRegistration: string | null = null;
  if (regDate) {
    const year = regDate[3].length === 2 ? `${Number(regDate[3]) > 50 ? "19" : "20"}${regDate[3]}` : regDate[3];
    firstRegistration = `${regDate[1]}.${regDate[2]}.${year}`;
  }

  const licensePlate =
    fieldValue(lines, /^A\b[:\s]+([A-ZÄÖÜ]{1,3}[\s\-][A-Z]{1,2}[\s\-]?\d{1,4}[EH]?)/)?.replace(/^([A-ZÄÖÜ]{1,3})[\s\-]+([A-Z]{1,2})[\s\-]?/, "$1-$2 ") ??
    findPlate(text);

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
