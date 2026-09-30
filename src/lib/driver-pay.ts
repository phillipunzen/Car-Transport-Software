import { toNumber } from "@/lib/format";

type Num = Parameters<typeof toNumber>[0];

export const PAY_TYPE: Record<string, string> = {
  NONE: "Keine Vergütung (angestellt)",
  PER_TOUR: "Pauschal pro Tour",
  PER_KM: "Pro Kilometer",
};

/** Vergütung eines Fahrers für einen Auftrag: manuell eingetragener Betrag vor Regel des Fahrers. */
export function driverPayFor(order: { driverPay: Num; distanceKm: Num }, member: { payType: string; payRate: Num } | null | undefined) {
  if (order.driverPay !== null && order.driverPay !== undefined && order.driverPay !== "") return toNumber(order.driverPay);
  if (!member) return 0;
  if (member.payType === "PER_TOUR") return toNumber(member.payRate);
  if (member.payType === "PER_KM") return Math.round(toNumber(member.payRate) * toNumber(order.distanceKm) * 100) / 100;
  return 0;
}
