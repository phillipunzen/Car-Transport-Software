import { db } from "@/lib/db";
import { drivingRoute, geocode, geoEnabled, type Address } from "@/lib/geo";
import { toNumber } from "@/lib/format";

type Stop = { street: string | null; zip: string | null; city: string | null };
type Tour = {
  id: string;
  number: number;
  assignedToId: string | null;
  pickupDate: Date | null;
  pickupStreet: string | null;
  pickupZip: string | null;
  pickupCity: string | null;
  deliveryStreet: string | null;
  deliveryZip: string | null;
  deliveryCity: string | null;
  durationMinutes: number | null;
};

const pickup = (t: Tour): Stop => ({ street: t.pickupStreet, zip: t.pickupZip, city: t.pickupCity });
const delivery = (t: Tour): Stop => ({ street: t.deliveryStreet, zip: t.deliveryZip, city: t.deliveryCity });
const key = (s: Stop) => [s.zip ?? "", (s.city ?? "").trim().toLowerCase(), (s.street ?? "").trim().toLowerCase()].join("|");
const place = (s: Stop) => [s.zip, s.city].filter(Boolean).join(" ") || "?";

/** Gleicher Ort (PLZ oder Ortsname) – dann entfällt die Leerfahrt praktisch. */
export function samePlace(a: Stop, b: Stop) {
  if (a.zip && b.zip) return a.zip === b.zip;
  return Boolean(a.city && b.city && a.city.trim().toLowerCase() === b.city.trim().toLowerCase());
}

/** Gleiche Region (erste zwei PLZ-Stellen oder gleicher Ort) – für Anschluss-Vorschläge. */
export function nearby(a: Stop, b: Stop) {
  if (samePlace(a, b)) return true;
  return Boolean(a.zip && b.zip && a.zip.slice(0, 2) === b.zip.slice(0, 2));
}

/** Strecke mit Zwischenspeicher (Leerfahrten werden oft wiederholt angefragt). */
export async function cachedRoute(from: Stop, to: Stop, compute = true) {
  const k = `${key(from)}>${key(to)}`.slice(0, 190);
  const hit = await db.routeCache.findUnique({ where: { key: k } });
  if (hit) return { km: toNumber(hit.km), minutes: hit.minutes };
  if (!compute || !geoEnabled()) return null;
  try {
    const [a, b] = [await geocode(from as Address), await geocode(to as Address)];
    if (!a || !b) return null;
    const r = await drivingRoute(a, b);
    const km = Math.round(r.km * 10) / 10;
    const minutes = Math.round(r.minutes);
    await db.routeCache.upsert({ where: { key: k }, create: { key: k, km, minutes }, update: { km, minutes } });
    return { km, minutes };
  } catch {
    return null;
  }
}

export type Gap = { fromId: string; toId: string; from: string; to: string; same: boolean; km: number | null; minutes: number | null; mapsUrl: string };

/**
 * Tourenkette eines Fahrers an einem Tag: zwischen Zustellung der einen und Abholung der nächsten Tour liegt eine Leerfahrt.
 * Höchstens `budget` Strecken werden neu berechnet (Rest: Link zu Google Maps).
 */
export async function chainGaps(tours: Tour[], budget = { left: 8 }): Promise<Gap[]> {
  const sorted = [...tours].filter((t) => t.pickupDate).sort((a, b) => a.pickupDate!.getTime() - b.pickupDate!.getTime());
  const gaps: Gap[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    const from = delivery(prev);
    const to = pickup(next);
    const same = samePlace(from, to);
    let route: { km: number; minutes: number } | null = null;
    if (!same && (from.city || from.zip) && (to.city || to.zip)) {
      route = await cachedRoute(from, to, budget.left > 0);
      if (route === null) budget.left = 0;
      else budget.left--;
    }
    gaps.push({
      fromId: prev.id,
      toId: next.id,
      from: place(from),
      to: place(to),
      same,
      km: same ? 0 : (route?.km ?? null),
      minutes: same ? 0 : (route?.minutes ?? null),
      mapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent([from.street, from.zip, from.city].filter(Boolean).join(" "))}&destination=${encodeURIComponent([to.street, to.zip, to.city].filter(Boolean).join(" "))}`,
    });
  }
  return gaps;
}

/**
 * Anschluss-Vorschläge: Touren (± 1 Tag um den Wunschtermin bzw. die nächsten 14 Tage), die in der Nähe
 * des Abholorts enden – der Fahrer spart sich so die Rückreise.
 */
export function followUps<T extends Tour & { assignedTo?: { name: string | null; email: string } | null }>(order: Tour, planned: T[]) {
  const target = pickup(order);
  if (!target.city && !target.zip) return [];
  return planned
    .filter((t) => t.id !== order.id && t.assignedToId && t.pickupDate && nearby(delivery(t), target))
    .filter((t) => !order.pickupDate || Math.abs(t.pickupDate!.getTime() - order.pickupDate.getTime()) < 36 * 3600000)
    .slice(0, 3);
}
