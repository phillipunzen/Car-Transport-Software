/** Führerscheinkontrolle & Überführungskennzeichen: Fälligkeiten berechnen (Hinweise nur bei Handlungsbedarf). */

export const PLATE_KIND: Record<string, string> = {
  RED: "Rotes Kennzeichen (06)",
  SHORT_TERM: "Kurzzeitkennzeichen",
  EXPORT: "Ausfuhrkennzeichen",
};

export const LICENSE_CHECK_MONTHS = 6;
const SOON = 14 * 86400000;

export type Due = "ok" | "soon" | "overdue" | "missing";

export function dueState(date: Date | null | undefined, now = new Date()): Due {
  if (!date) return "missing";
  const diff = date.getTime() - now.getTime();
  if (diff < 0) return "overdue";
  if (diff < SOON) return "soon";
  return "ok";
}

export function nextLicenseCheck(checkedAt: Date | null | undefined) {
  if (!checkedAt) return null;
  const d = new Date(checkedAt);
  d.setMonth(d.getMonth() + LICENSE_CHECK_MONTHS);
  return d;
}

/** Schlimmster Zustand eines Fahrers (Ablauf des Führerscheins oder fällige Kontrolle). */
export function licenseState(m: { licenseExpiry: Date | null; licenseCheckedAt: Date | null }, now = new Date()): Due {
  const order: Due[] = ["overdue", "missing", "soon", "ok"];
  const expiry = m.licenseExpiry ? dueState(m.licenseExpiry, now) : "ok"; // unbefristete Führerscheine
  const check = dueState(nextLicenseCheck(m.licenseCheckedAt), now);
  return order.find((s) => s === expiry || s === check) ?? "ok";
}

export const DUE_LABEL: Record<Due, { text: string; cls: string }> = {
  ok: { text: "in Ordnung", cls: "bg-emerald-50 text-emerald-700" },
  soon: { text: "bald fällig", cls: "bg-amber-100 text-amber-800" },
  overdue: { text: "abgelaufen", cls: "bg-red-100 text-red-700" },
  missing: { text: "nicht erfasst", cls: "bg-slate-100 text-slate-600" },
};
