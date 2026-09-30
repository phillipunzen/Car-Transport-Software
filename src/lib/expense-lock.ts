import { db } from "@/lib/db";

export type ExpenseLock = {
  /** Aktive (festgeschriebene, nicht stornierte) Rechnung → Belege unveränderbar */
  locked: boolean;
  invoiceNumber: string | null;
  /** Belege waren schon einmal Teil einer festgeschriebenen Rechnung → Dateien werden nicht gelöscht (Aufbewahrungspflicht) */
  archived: boolean;
};

/** Belegschutz (GoBD): Nach dem Festschreiben einer Rechnung dürfen die zugrunde liegenden Belege nicht mehr verändert werden. */
export async function expenseLock(orderId: string): Promise<ExpenseLock> {
  const invoices = await db.invoice.findMany({
    where: { OR: [{ orderId }, { collectiveOrders: { some: { id: orderId } } }], status: { not: "DRAFT" } },
    select: { status: true, number: true, correctsNumber: true },
  });
  const active = invoices.find((i) => !i.correctsNumber && (i.status === "ISSUED" || i.status === "PAID"));
  return { locked: Boolean(active), invoiceNumber: active?.number ?? null, archived: invoices.length > 0 };
}

export function lockMessage(lock: ExpenseLock) {
  return `Die Belege sind gesperrt, weil die Rechnung ${lock.invoiceNumber ?? ""} festgeschrieben ist. Für Änderungen die Rechnung stornieren.`;
}
