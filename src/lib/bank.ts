import { createHash } from "node:crypto";

/**
 * Kontoauszug einlesen: CSV (Sparkasse, Volksbank, DKB, ING, Commerzbank … – Spalten werden
 * anhand der Überschriften erkannt) oder CAMT.053 (XML). Es werden nur Zahlungseingänge übernommen.
 */
export type BankTx = { hash: string; bookingDate: Date; amount: number; counterparty: string | null; purpose: string | null };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");

export function parseAmount(raw: string) {
  const s = raw.replace(/\s|€|EUR/gi, "").trim();
  if (!s) return NaN;
  // 1.234,56 / 1234,56 / -12,00 / 1,234.56 / 1234.56
  const de = /,\d{1,2}$/.test(s);
  const n = de ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  return Number(n);
}

export function parseDate(raw: string): Date | null {
  const s = raw.trim();
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1]), 12));
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return null;
}

function splitCsvLine(line: string, sep: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

const hashOf = (d: Date, amount: number, counterparty: string | null, purpose: string | null, n: number) =>
  createHash("sha256").update([d.toISOString().slice(0, 10), amount.toFixed(2), counterparty ?? "", purpose ?? "", n].join("|")).digest("hex");

/** Gleiche Buchungen am selben Tag (z. B. zwei gleiche Zahlungen) bekommen fortlaufende Nummern im Hash. */
function withHashes(rows: Omit<BankTx, "hash">[]): BankTx[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const key = [r.bookingDate.toISOString().slice(0, 10), r.amount.toFixed(2), r.counterparty, r.purpose].join("|");
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return { ...r, hash: hashOf(r.bookingDate, r.amount, r.counterparty, r.purpose, n) };
  });
}

export function parseCsv(text: string): BankTx[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  let headerIdx = -1;
  let sep = ";";
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const l = lines[i].toLowerCase();
    if (/(buchungstag|buchungsdatum|datum|valuta|wertstellung|booking date)/.test(l) && /(betrag|umsatz|amount|haben)/.test(l)) {
      headerIdx = i;
      sep = [";", "\t", ","].sort((a, b) => lines[i].split(b).length - lines[i].split(a).length)[0];
      break;
    }
  }
  if (headerIdx < 0) throw new Error("Im Kontoauszug wurden keine Spaltenüberschriften (Datum, Betrag) gefunden.");
  const header = splitCsvLine(lines[headerIdx], sep).map(norm);
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = header.findIndex((h) => h === n);
      if (i >= 0) return i;
    }
    for (const n of names) {
      const i = header.findIndex((h) => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const cDate = col("buchungstag", "buchungsdatum", "bookingdate", "datum", "valutadatum", "wertstellung");
  const cAmount = col("betrageur", "betrag", "umsatzineur", "umsatz", "amount");
  const cCredit = col("haben");
  const cDebit = col("soll");
  const cPurpose = col("verwendungszweck", "buchungstext", "vorgang", "purpose", "beschreibung");
  const cName = col(
    "beguenstigterzahlungspflichtiger",
    "namezahlungsbeteiligter",
    "auftraggeberbegünstigter",
    "zahlungspflichtigerempfänger",
    "zahlungsempfängerin",
    "auftraggeber",
    "gegenkonto",
    "name",
  );
  if (cDate < 0 || (cAmount < 0 && cCredit < 0)) throw new Error("Die Spalten für Datum und Betrag wurden nicht erkannt.");
  const rows: Omit<BankTx, "hash">[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim()) continue;
    const f = splitCsvLine(line, sep);
    const date = parseDate(f[cDate] ?? "");
    let amount = cAmount >= 0 ? parseAmount(f[cAmount] ?? "") : NaN;
    if (Number.isNaN(amount) && cCredit >= 0) {
      const credit = parseAmount(f[cCredit] ?? "");
      const debit = cDebit >= 0 ? parseAmount(f[cDebit] ?? "") : NaN;
      amount = !Number.isNaN(credit) && credit ? credit : !Number.isNaN(debit) ? -Math.abs(debit) : NaN;
    }
    if (!date || Number.isNaN(amount) || amount <= 0) continue;
    rows.push({
      bookingDate: date,
      amount: Math.round(amount * 100) / 100,
      counterparty: (cName >= 0 ? f[cName] : "") || null,
      purpose: (cPurpose >= 0 ? f[cPurpose] : "") || null,
    });
  }
  return withHashes(rows);
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`))?.[1];
const tags = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "g"))].map((m) => m[1]);
const unxml = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();

export function parseCamt(xml: string): BankTx[] {
  const rows: Omit<BankTx, "hash">[] = [];
  for (const entry of tags(xml, "Ntry")) {
    if (tag(entry, "CdtDbtInd")?.trim() !== "CRDT") continue;
    if (/<(?:\w+:)?RvslInd>\s*true/.test(entry)) continue;
    const amount = Number(tag(entry, "Amt"));
    const bookg = tag(entry, "BookgDt") ?? tag(entry, "ValDt") ?? "";
    const date = parseDate(tag(bookg, "Dt") ?? tag(bookg, "DtTm") ?? "");
    if (!date || !amount) continue;
    const dbtr = tag(entry, "Dbtr") ?? "";
    rows.push({
      bookingDate: date,
      amount: Math.round(amount * 100) / 100,
      counterparty: tag(dbtr, "Nm") ? unxml(tag(dbtr, "Nm")!) : null,
      purpose: tags(entry, "Ustrd").map(unxml).join(" ") || (tag(entry, "AddtlNtryInf") ? unxml(tag(entry, "AddtlNtryInf")!) : null),
    });
  }
  return withHashes(rows);
}

export function parseStatement(text: string): BankTx[] {
  return /<(?:\w+:)?BkToCstmrStmt|camt\.05[234]/.test(text) ? parseCamt(text) : parseCsv(text);
}

// ---------------------------------------------------------------------------
// Zuordnung zu offenen Rechnungen
// ---------------------------------------------------------------------------

export type OpenInvoice = { id: string; number: string; customerName: string; gross: number; payable: number[] };
export type Match = { invoiceId: string; confidence: "sicher" | "wahrscheinlich" | "prüfen"; reason: string };

const compact = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function matchTransaction(tx: Pick<BankTx, "amount" | "counterparty" | "purpose">, invoices: OpenInvoice[]): Match | null {
  const purpose = compact(tx.purpose ?? "");
  const who = norm(tx.counterparty ?? "");
  const amountOk = (i: OpenInvoice) => i.payable.some((p) => Math.abs(p - tx.amount) < 0.01);
  const byNumber = invoices.filter((i) => purpose.includes(compact(i.number)));
  if (byNumber.length === 1) {
    const i = byNumber[0];
    return amountOk(i)
      ? { invoiceId: i.id, confidence: "sicher", reason: "Rechnungsnummer und Betrag stimmen" }
      : { invoiceId: i.id, confidence: "prüfen", reason: `Rechnungsnummer stimmt, Betrag weicht ab (offen ${i.gross.toFixed(2).replace(".", ",")} €)` };
  }
  const byAmount = invoices.filter(amountOk);
  // Zahlername passt: vollständig enthalten oder gleiches erstes Wort (z. B. „Leasing“ in „LEASING WEST GMBH“)
  const firstWord = (x: string) => norm(x.split(/\s+/)[0] ?? "");
  const nameHit = (i: OpenInvoice) => {
    const n = norm(i.customerName);
    if (n.length < 4 || who.length < 4) return false;
    const fw = firstWord(i.customerName);
    return who.includes(n) || n.includes(who) || (fw.length >= 4 && fw === firstWord(tx.counterparty ?? ""));
  };
  const both = byAmount.filter(nameHit);
  if (both.length === 1) return { invoiceId: both[0].id, confidence: "wahrscheinlich", reason: "Betrag und Zahler passen" };
  if (byAmount.length === 1) return { invoiceId: byAmount[0].id, confidence: "prüfen", reason: "nur der Betrag passt" };
  return null;
}
