"use server";

import { requireCtx } from "@/lib/org";
import { drivingRoute, geocode, geoEnabled, reverseGeocode, type Address } from "@/lib/geo";

export type LocateResult = { error?: string; address?: Address & { label: string } };

/** Ermittelt die Adresse zum aktuellen Standort (Koordinaten aus dem Browser). */
export async function locateAddress(lat: number, lon: number): Promise<LocateResult> {
  await requireCtx();
  if (!geoEnabled()) return { error: "Standortdienste sind deaktiviert." };
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { error: "Ungültige Koordinaten." };
  }
  try {
    return { address: await reverseGeocode({ lat, lon }) };
  } catch (e) {
    console.error("Adressermittlung fehlgeschlagen", e);
    return { error: "Die Adresse konnte nicht ermittelt werden." };
  }
}

export type RouteResult = { error?: string; km?: number; minutes?: number };

/** Berechnet Strecke und Fahrzeit zwischen Abhol- und Zieladresse. */
export async function calculateRoute(from: Address, to: Address): Promise<RouteResult> {
  await requireCtx();
  if (!geoEnabled()) return { error: "Routenberechnung ist deaktiviert." };
  const complete = (a: Address) => Boolean(a.city || a.zip);
  if (!complete(from) || !complete(to)) return { error: "Bitte bei Abholung und Zustellung mindestens PLZ oder Ort angeben." };
  try {
    const [a, b] = [await geocode(from), await geocode(to)];
    if (!a) return { error: "Die Abholadresse wurde nicht gefunden." };
    if (!b) return { error: "Die Zustelladresse wurde nicht gefunden." };
    const route = await drivingRoute(a, b);
    return { km: Math.round(route.km * 10) / 10, minutes: Math.round(route.minutes) };
  } catch (e) {
    console.error("Routenberechnung fehlgeschlagen", e);
    return { error: "Die Strecke konnte nicht berechnet werden." };
  }
}
