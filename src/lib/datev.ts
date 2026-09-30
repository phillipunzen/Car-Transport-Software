/**
 * DATEV-Buchungsstapel (EXTF, Formatversion 700/13) für Ausgangsrechnungen.
 * Je Rechnung und Steuersatz eine Buchung: Debitor an Erlöskonto (Automatikkonto, Steuer rechnet DATEV).
 */

export type DatevInvoice = {
  number: string;
  issueDate: Date;
  customerNumber: number;
  customerName: string;
  smallBusiness: boolean;
  /** Summen brutto je Steuersatz (negativ bei Stornorechnungen) */
  byRate: { rate: number; gross: number }[];
};

export type DatevOptions = {
  consultant: string | null;
  client: string | null;
  chart: string; // SKR03 | SKR04
  revenueAccount: string | null; // Erlöskonto 19 % (leer = Standard)
  from: Date;
  to: Date;
  fiscalYearStart: Date;
};

const ACCOUNTS: Record<string, Record<string, string>> = {
  SKR03: { "19": "8400", "7": "8300", "0": "8200", small: "8195" },
  SKR04: { "19": "4400", "7": "4300", "0": "4200", small: "4185" },
};

export function revenueAccount(chart: string, rate: number, smallBusiness: boolean, custom?: string | null) {
  const a = ACCOUNTS[chart] ?? ACCOUNTS.SKR03;
  if (smallBusiness) return a.small;
  if (rate === 19 && custom) return custom;
  return a[String(rate)] ?? a["19"];
}

const d8 = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }).replace(/-/g, "");
const ddmm = (d: Date) => d8(d).slice(6, 8) + d8(d).slice(4, 6);
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const amount = (n: number) => Math.abs(n).toFixed(2).replace(".", ",");

const COLUMNS = [
  "Umsatz (ohne Soll/Haben-Kz)",
  "Soll/Haben-Kennzeichen",
  "WKZ Umsatz",
  "Kurs",
  "Basis-Umsatz",
  "WKZ Basis-Umsatz",
  "Konto",
  "Gegenkonto (ohne BU-Schlüssel)",
  "BU-Schlüssel",
  "Belegdatum",
  "Belegfeld 1",
  "Belegfeld 2",
  "Skonto",
  "Buchungstext",
];

export function buildDatev(invoices: DatevInvoice[], o: DatevOptions) {
  const now = new Date();
  const created = d8(now) + now.toISOString().slice(11, 23).replace(/[:.]/g, "");
  const header = [
    q("EXTF"), "700", "21", q("Buchungsstapel"), "13", created, "", q("RE"), q("Ueberfuehrung"), q(""),
    o.consultant ?? "", o.client ?? "", d8(o.fiscalYearStart), "4", d8(o.from), d8(o.to), q("Ausgangsrechnungen"), q(""),
    "1", "0", "0", q("EUR"), "", q(""), "", "", q(o.chart === "SKR04" ? "04" : "03"), "", "", q(""), q(""),
  ].join(";");
  const lines = [header, COLUMNS.join(";")];
  const digits = String(Math.max(0, ...invoices.map((i) => i.customerNumber)) + 10000).length;
  for (const inv of invoices) {
    for (const r of inv.byRate) {
      if (!r.gross) continue;
      const debtor = String(10000 + inv.customerNumber).padStart(digits, "0");
      lines.push(
        [
          amount(r.gross),
          q(r.gross >= 0 ? "S" : "H"),
          q("EUR"), "", "", "",
          debtor,
          revenueAccount(o.chart, r.rate, inv.smallBusiness, o.revenueAccount),
          q(""),
          ddmm(inv.issueDate),
          q(inv.number.slice(0, 36)),
          q(""),
          "",
          q(`${inv.customerName}`.slice(0, 60)),
        ].join(";"),
      );
    }
  }
  return lines.join("\r\n") + "\r\n";
}

/** DATEV erwartet ANSI (Windows-1252). */
export function toWindows1252(s: string) {
  const special: Record<string, number> = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "–": 0x96, "—": 0x97 };
  const out = new Uint8Array(s.length);
  let i = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out[i++] = special[ch] ?? (c < 256 && !(c >= 0x80 && c < 0xa0) ? c : 0x3f);
  }
  return out.slice(0, i);
}
