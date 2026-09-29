import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { customerName, orderNo, toNumber } from "@/lib/format";

/**
 * Zentrale Dokumentenübersicht: Belege aus Aufträgen und Fahrzeugdokumente.
 * Die "Tags" (Kunde, Kennzeichen, Auftrag, Kategorie) werden automatisch aus
 * den verknüpften Aufträgen und Fahrzeugen abgeleitet – nichts wird doppelt gepflegt.
 */

export type DocumentFilters = {
  q?: string;
  type?: "all" | "expense" | "vehicle";
  customerId?: string;
  plate?: string;
  category?: string;
  from?: string; // YYYY-MM-DD
  to?: string;
};

export type DocumentRow = {
  key: string;
  type: "expense" | "vehicle";
  date: Date;
  title: string;
  subtitle: string | null;
  category: string | null;
  amountGross: number | null;
  vatRate: number | null;
  currency: string | null;
  rebillable: boolean | null;
  customer: { id: string; name: string } | null;
  plate: string | null;
  order: { id: string; label: string } | null;
  vehicleId: string | null;
  file: { id: string; mimeType: string; originalName: string | null } | null;
};

export function parseFilters(sp: Record<string, string | string[] | undefined>): DocumentFilters {
  const get = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : undefined;
  };
  const type = get("type");
  return {
    q: get("q"),
    type: type === "expense" || type === "vehicle" ? type : "all",
    customerId: get("customerId"),
    plate: get("plate"),
    category: get("category"),
    from: get("from"),
    to: get("to"),
  };
}

const day = (s: string | undefined, end = false) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return new Date(`${s}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
};

export async function queryDocuments(orgId: string, f: DocumentFilters, limit = 500): Promise<DocumentRow[]> {
  const from = day(f.from);
  const to = day(f.to, true);
  const dateRange = from || to ? { gte: from, lte: to } : undefined;
  const orderNumber = f.q && /^A?-?\d+$/i.test(f.q) ? Number(f.q.replace(/\D/g, "")) : undefined;
  const plate = f.plate?.replace(/\s+/g, " ");

  const rows: DocumentRow[] = [];

  if (f.type !== "vehicle") {
    const orderWhere: Prisma.OrderWhereInput = {
      organizationId: orgId,
      ...(f.customerId ? { customerId: f.customerId } : {}),
      ...(plate ? { licensePlate: { contains: plate } } : {}),
    };
    const expenses = await db.expense.findMany({
      where: {
        order: orderWhere,
        ...(f.category ? { category: f.category } : {}),
        ...(dateRange ? { OR: [{ date: dateRange }, { date: null, createdAt: dateRange }] } : {}),
        ...(f.q
          ? {
              AND: [
                {
                  OR: [
                    { vendor: { contains: f.q } },
                    { description: { contains: f.q } },
                    { order: { licensePlate: { contains: f.q } } },
                    { order: { customer: { OR: [{ companyName: { contains: f.q } }, { lastName: { contains: f.q } }] } } },
                    ...(orderNumber ? [{ order: { number: orderNumber } }] : []),
                  ],
                },
              ],
            }
          : {}),
      },
      include: { file: true, order: { include: { customer: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
    for (const e of expenses) {
      rows.push({
        key: `e-${e.id}`,
        type: "expense",
        date: e.date ?? e.createdAt,
        title: e.vendor ?? e.description ?? "Beleg",
        subtitle: e.vendor ? e.description : null,
        category: e.category,
        amountGross: toNumber(e.amountGross),
        vatRate: toNumber(e.vatRate),
        currency: e.currency,
        rebillable: e.rebillable,
        customer: { id: e.order.customer.id, name: customerName(e.order.customer) },
        plate: e.order.licensePlate,
        order: { id: e.order.id, label: orderNo(e.order.number) },
        vehicleId: e.order.vehicleId,
        file: e.file ? { id: e.file.id, mimeType: e.file.mimeType, originalName: e.file.originalName } : null,
      });
    }
  }

  // Fahrzeugdokumente haben keine Kategorie – bei Kategorie-Filter ausblenden
  if (f.type !== "expense" && !f.category) {
    const docs = await db.vehicleDocument.findMany({
      where: {
        vehicle: {
          organizationId: orgId,
          ...(f.customerId ? { customerId: f.customerId } : {}),
          ...(plate ? { licensePlate: { contains: plate } } : {}),
          ...(f.q
            ? {
                OR: [
                  { licensePlate: { contains: f.q } },
                  { vin: { contains: f.q } },
                  { make: { contains: f.q } },
                  { model: { contains: f.q } },
                  { customer: { OR: [{ companyName: { contains: f.q } }, { lastName: { contains: f.q } }] } },
                ],
              }
            : {}),
        },
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      include: { file: true, vehicle: { include: { customer: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    for (const d of docs) {
      rows.push({
        key: `v-${d.id}`,
        type: "vehicle",
        date: d.createdAt,
        title: d.kind === "REGISTRATION" ? "Fahrzeugschein" : "Fahrzeugdokument",
        subtitle: [d.vehicle.make, d.vehicle.model].filter(Boolean).join(" ") || null,
        category: null,
        amountGross: null,
        vatRate: null,
        currency: null,
        rebillable: null,
        customer: d.vehicle.customer ? { id: d.vehicle.customer.id, name: customerName(d.vehicle.customer) } : null,
        plate: d.vehicle.licensePlate,
        order: null,
        vehicleId: d.vehicle.id,
        file: { id: d.file.id, mimeType: d.file.mimeType, originalName: d.file.originalName },
      });
    }
  }

  return rows.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);
}

/** Dateiname für den Export, z. B. "2026-09-28_A-00012_M-AB-1234_Bahn_89,90EUR.pdf" */
export function exportFileName(row: DocumentRow, categoryLabel: string | undefined, index: number) {
  const ext = row.file?.mimeType === "application/pdf" ? "pdf" : row.file?.mimeType === "image/png" ? "png" : "jpg";
  const parts = [
    row.date.toISOString().slice(0, 10),
    row.order?.label,
    row.plate?.replace(/\s+/g, "-"),
    row.type === "vehicle" ? null : categoryLabel,
    row.title,
    row.amountGross !== null ? `${row.amountGross.toFixed(2).replace(".", ",")}${row.currency ?? "EUR"}` : null,
  ];
  const base = parts
    .filter(Boolean)
    .join("_")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120);
  return `${String(index + 1).padStart(3, "0")}_${base}.${ext}`;
}
