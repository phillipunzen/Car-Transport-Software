import { fromDateTimeLocal } from "@/lib/format";

/** Kalendertag in deutscher Zeit als YYYY-MM-DD */
export const berlinDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

const addDaysKey = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Montag der Woche (deutsche Zeit) und die 7 Tage als Schlüssel + Zeitgrenzen für Abfragen. */
export function weekOf(anchor: string | undefined) {
  const key = anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? anchor : berlinDay(new Date());
  const weekday = (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7; // Mo = 0
  const monday = addDaysKey(key, -weekday);
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(monday, i));
  return {
    days,
    start: fromDateTimeLocal(`${days[0]}T00:00`)!,
    end: fromDateTimeLocal(`${addDaysKey(days[6], 1)}T00:00`)!,
    prev: addDaysKey(monday, -7),
    next: addDaysKey(monday, 7),
  };
}

export function dayBounds(key: string) {
  return { start: fromDateTimeLocal(`${key}T00:00`)!, end: fromDateTimeLocal(`${addDaysKey(key, 1)}T00:00`)! };
}

export const nextDayKey = (key: string) => addDaysKey(key, 1);

// ---------------------------------------------------------------------------
// iCalendar (RFC 5545)
// ---------------------------------------------------------------------------

export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  updated?: Date;
  cancelled?: boolean;
};

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Zeilen nach 75 Oktetten falten (UTF-8-sicher). */
function fold(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const len = Buffer.byteLength(ch, "utf8");
    if (size + len > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += len;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(name: string, events: IcsEvent[]) {
  const now = icsDate(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ueberfuehrung//Tourenplanung//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    "X-WR-TIMEZONE:Europe/Berlin",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(e.end > e.start ? e.end : new Date(e.start.getTime() + 3600000))}`,
      `SUMMARY:${esc(e.summary)}`,
    );
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.updated) lines.push(`LAST-MODIFIED:${icsDate(e.updated)}`, `SEQUENCE:${Math.floor(e.updated.getTime() / 1000) % 2147483647}`);
    lines.push(`STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
