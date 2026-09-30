/**
 * Verpflegungspauschale (Inland, § 9 Abs. 4a EStG):
 * - eintägig, Abwesenheit > 8 Std.: kleine Pauschale
 * - mehrtägig (mit Übernachtung): An- und Abreisetag je kleine Pauschale, jeder volle Tag dazwischen die große Pauschale
 * - über Mitternacht ohne Übernachtung: wie eintägig (Gesamtdauer > 8 Std.)
 */
export type PerDiemLine = { day: string; label: string; amount: number };

const dayKey = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }); // YYYY-MM-DD
const fmtDay = (key: string) => key.split("-").reverse().join(".");

export function perDiem(start: Date, end: Date, partial: number, full: number, overnight?: boolean) {
  const lines: PerDiemLine[] = [];
  if (!(end > start)) return { total: 0, lines, hours: 0 };
  const hours = (end.getTime() - start.getTime()) / 3600000;
  const first = dayKey(start);
  const last = dayKey(end);
  const stayed = overnight ?? hours >= 24;
  if (first === last || !stayed) {
    if (hours > 8) lines.push({ day: first, label: `${fmtDay(first)}: Abwesenheit über 8 Std.`, amount: partial });
  } else {
    lines.push({ day: first, label: `${fmtDay(first)}: Anreisetag`, amount: partial });
    const d = new Date(`${first}T12:00:00Z`);
    for (;;) {
      d.setUTCDate(d.getUTCDate() + 1);
      const key = d.toISOString().slice(0, 10);
      if (key >= last) break;
      lines.push({ day: key, label: `${fmtDay(key)}: voller Kalendertag`, amount: full });
    }
    lines.push({ day: last, label: `${fmtDay(last)}: Abreisetag`, amount: partial });
  }
  return { total: lines.reduce((s, l) => s + l.amount, 0), lines, hours };
}
