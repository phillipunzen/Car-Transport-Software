export type ItemInput = { description: string; quantity: number; unit: string; unitPrice: number; vatRate: number };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function lineTotal(i: { quantity: number; unitPrice: number }) {
  return round2(i.quantity * i.unitPrice);
}

/** Summen je Steuersatz – bei Kleinunternehmern ohne Umsatzsteuer. */
export function computeTotals(items: ItemInput[], smallBusiness: boolean) {
  const groups = new Map<number, number>();
  let net = 0;
  for (const i of items) {
    const t = lineTotal(i);
    net += t;
    const rate = smallBusiness ? 0 : i.vatRate;
    groups.set(rate, (groups.get(rate) ?? 0) + t);
  }
  const vat = [...groups.entries()]
    .filter(([rate]) => rate > 0)
    .sort(([a], [b]) => b - a)
    .map(([rate, base]) => ({ rate, base: round2(base), amount: round2((base * rate) / 100) }));
  const vatTotal = round2(vat.reduce((s, v) => s + v.amount, 0));
  net = round2(net);
  return { net, vat, vatTotal, gross: round2(net + vatTotal) };
}
