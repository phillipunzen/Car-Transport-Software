import { toNumber } from "@/lib/format";

type Num = Parameters<typeof toNumber>[0];

export type ReturnConfig = { returnType: string | null | undefined; returnFlat?: Num; returnPerKm?: Num };

/** Kosten der Rückreise (netto) – bei "Nach Belegen" kommen sie über die Belege. */
export function returnCost(cfg: ReturnConfig, distanceKm: Num) {
  if (cfg.returnType === "FLAT") return toNumber(cfg.returnFlat);
  if (cfg.returnType === "PER_KM") return toNumber(distanceKm) * toNumber(cfg.returnPerKm);
  return 0;
}

/** Rechnungs-/Angebotsposition für die Rückreise (oder null). */
export function returnLine(cfg: ReturnConfig, distanceKm: Num, vatRate: number) {
  const km = toNumber(distanceKm);
  if (cfg.returnType === "FLAT" && toNumber(cfg.returnFlat) > 0) {
    return { description: "Rückreise des Fahrers (Pauschale)", quantity: 1, unit: "Pausch.", unitPrice: toNumber(cfg.returnFlat), vatRate };
  }
  if (cfg.returnType === "PER_KM" && toNumber(cfg.returnPerKm) > 0 && km > 0) {
    return { description: "Rückreise des Fahrers", quantity: km, unit: "km", unitPrice: toNumber(cfg.returnPerKm), vatRate };
  }
  return null;
}

/** Wirksame Konditionen: Kunde vor Firmenstandard */
export function effectiveConditions(
  org: { paymentTermDays: number; defaultPricePerKm: Num; defaultReturnType: string; defaultReturnFlat: Num; defaultReturnPerKm: Num },
  customer: {
    pricePerKm?: Num;
    paymentTermDays?: number | null;
    discountPercent?: Num;
    discountDays?: number | null;
    returnType?: string | null;
    returnFlat?: Num;
    returnPerKm?: Num;
  } | null,
) {
  const has = (v: Num) => v !== null && v !== undefined && v !== "";
  return {
    pricePerKm: has(customer?.pricePerKm) ? toNumber(customer!.pricePerKm) : has(org.defaultPricePerKm) ? toNumber(org.defaultPricePerKm) : null,
    paymentTermDays: customer?.paymentTermDays ?? org.paymentTermDays,
    discountPercent: has(customer?.discountPercent) ? toNumber(customer!.discountPercent) : null,
    discountDays: customer?.discountDays ?? null,
    returnType: customer?.returnType || org.defaultReturnType || "NONE",
    returnFlat: has(customer?.returnFlat) ? toNumber(customer!.returnFlat) : has(org.defaultReturnFlat) ? toNumber(org.defaultReturnFlat) : null,
    returnPerKm: has(customer?.returnPerKm) ? toNumber(customer!.returnPerKm) : has(org.defaultReturnPerKm) ? toNumber(org.defaultReturnPerKm) : null,
  };
}

/** Skonto-Betrag und -Frist */
export function discountInfo(gross: number, percent: Num, days: number | null | undefined, issueDate: Date | null) {
  const p = toNumber(percent);
  if (!p || !days || !issueDate) return null;
  const amount = Math.round(gross * p) / 100;
  return { percent: p, days, until: new Date(issueDate.getTime() + days * 86400000), amount, payable: Math.round((gross - amount) * 100) / 100 };
}
