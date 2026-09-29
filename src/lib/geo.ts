/**
 * Geokodierung (Adresse ↔ Koordinaten) und Routenberechnung.
 *
 * Standard sind die freien OpenStreetMap-Dienste (Nominatim & OSRM). Für den
 * produktiven Einsatz mit vielen Anfragen empfiehlt sich ein eigener Server
 * (GEOCODER_URL / ROUTING_URL) oder OpenRouteService (ORS_API_KEY).
 */

export const geoEnabled = () => process.env.GEO_ENABLED !== "false";

const GEOCODER_URL = () => (process.env.GEOCODER_URL || "https://nominatim.openstreetmap.org").replace(/\/$/, "");
const ROUTING_URL = () => (process.env.ROUTING_URL || "https://router.project-osrm.org").replace(/\/$/, "");
const USER_AGENT = () =>
  `Ueberfuehrung-Software/1.0 (${process.env.GEOCODER_CONTACT || process.env.APP_URL || "self-hosted"})`;

export type Address = { street: string | null; zip: string | null; city: string | null; country?: string | null };
export type Point = { lat: number; lon: number };

// Nominatim erlaubt max. 1 Anfrage/Sekunde → Anfragen nacheinander mit Abstand
let nominatimQueue: Promise<unknown> = Promise.resolve();
let lastCall = 0;
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const wait = lastCall + 1100 - Date.now();
    if (wait > 0 && !process.env.GEOCODER_URL) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  nominatimQueue = run.catch(() => undefined);
  return run;
}

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT(), "Accept-Language": "de", Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Geodienst antwortet mit ${res.status}`);
  return res.json();
}

const cache = new Map<string, Point | null>();

export async function reverseGeocode({ lat, lon }: Point): Promise<Address & { label: string }> {
  const data = await throttled(() =>
    getJson(`${GEOCODER_URL()}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lon}`),
  );
  const a = data?.address ?? {};
  const street = [a.road ?? a.pedestrian ?? a.footway ?? a.street ?? a.path, a.house_number].filter(Boolean).join(" ") || null;
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.hamlet ?? a.suburb ?? null;
  return {
    street,
    zip: a.postcode ?? null,
    city,
    country: a.country ?? null,
    label: data?.display_name ?? [street, a.postcode, city].filter(Boolean).join(", "),
  };
}

export async function geocode(address: Address): Promise<Point | null> {
  const key = [address.street, address.zip, address.city, address.country].map((s) => (s ?? "").trim().toLowerCase()).join("|");
  if (cache.has(key)) return cache.get(key)!;
  const params = new URLSearchParams({ format: "jsonv2", limit: "1" });
  if (address.street) params.set("street", address.street);
  if (address.zip) params.set("postalcode", address.zip);
  if (address.city) params.set("city", address.city);
  params.set("country", address.country || "Deutschland");
  let data = await throttled(() => getJson(`${GEOCODER_URL()}/search?${params}`));
  // Fallback: freie Suche (hilft bei Tippfehlern in der Straße)
  if (!Array.isArray(data) || data.length === 0) {
    const q = [address.street, address.zip, address.city, address.country].filter(Boolean).join(", ");
    data = await throttled(() => getJson(`${GEOCODER_URL()}/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`));
  }
  const hit = Array.isArray(data) && data[0] ? { lat: Number(data[0].lat), lon: Number(data[0].lon) } : null;
  if (cache.size > 2000) cache.clear();
  cache.set(key, hit);
  return hit;
}

/** Fahrstrecke in km und Fahrzeit in Minuten (schnellste Route mit dem PKW). */
export async function drivingRoute(from: Point, to: Point): Promise<{ km: number; minutes: number }> {
  const orsKey = process.env.ORS_API_KEY;
  if (orsKey) {
    const data = await getJson(
      `https://api.openrouteservice.org/v2/directions/driving-car?start=${from.lon},${from.lat}&end=${to.lon},${to.lat}`,
      { Authorization: orsKey },
    );
    const summary = data?.features?.[0]?.properties?.summary;
    if (!summary) throw new Error("Keine Route gefunden");
    return { km: summary.distance / 1000, minutes: summary.duration / 60 };
  }
  const data = await getJson(
    `${ROUTING_URL()}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false&alternatives=false`,
  );
  const route = data?.routes?.[0];
  if (data?.code !== "Ok" || !route) throw new Error("Keine Route gefunden");
  return { km: route.distance / 1000, minutes: route.duration / 60 };
}
