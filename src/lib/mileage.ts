/**
 * Kilometer-Plausibilität: gefahrene km (Tacho Übergabe − Abholung) im Vergleich zur geplanten Strecke.
 * Großzügige Toleranz (Umwege, Tanken, Stau-Umfahrung) – gewarnt wird nur bei deutlichen Abweichungen.
 */
export function mileageCheck(pickupKm: number | null | undefined, deliveryKm: number | null | undefined, plannedKm: number | null | undefined) {
  if (pickupKm === null || pickupKm === undefined || deliveryKm === null || deliveryKm === undefined) return null;
  const driven = deliveryKm - pickupKm;
  if (driven < 0) return { driven, status: "invalid" as const, message: "Der Kilometerstand bei Übergabe ist kleiner als bei der Abholung." };
  if (!plannedKm || plannedKm <= 0) return { driven, status: "ok" as const, message: null };
  if (driven > plannedKm * 1.3 + 30) {
    return { driven, status: "high" as const, message: `${Math.round(driven)} km gefahren, geplant waren ${Math.round(plannedKm)} km – deutlich mehr als die Strecke.` };
  }
  if (driven < plannedKm * 0.7 - 20) {
    return { driven, status: "low" as const, message: `Nur ${Math.round(driven)} km gefahren, geplant waren ${Math.round(plannedKm)} km – Kilometerstand prüfen.` };
  }
  return { driven, status: "ok" as const, message: null };
}
