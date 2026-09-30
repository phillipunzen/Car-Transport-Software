"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PricingType, QuoteStatus, TransportMode } from "@prisma/client";
import { db } from "@/lib/db";
import { canManage, nextNumber, type Ctx } from "@/lib/org";
import { addressLines, decimal, formatDate, fromDateTimeLocal, str, toNumber } from "@/lib/format";
import { RETURN_TYPE } from "@/lib/labels";
import { computeTotals, type ItemInput } from "@/lib/invoice";
import { transportItems } from "@/lib/pricing";
import { syncVehicle } from "@/lib/vehicles";
import type { FormState } from "@/components/action-form";
import { logEvent } from "../orders/actions";
import { requireOffice } from "@/lib/permissions";

async function requireQuote(ctx: Ctx, id: string) {
  const quote = await db.quote.findFirst({ where: { id, organizationId: ctx.orgId }, include: { items: { orderBy: { position: "asc" } } } });
  if (!quote) throw new Error("Angebot nicht gefunden");
  return quote;
}

function quoteData(formData: FormData) {
  const mode = String(formData.get("transportMode"));
  const returnType = String(formData.get("returnType"));
  const minutes = decimal(formData.get("durationMinutes"));
  return {
    transportMode: (["DRIVEN", "TRAILER", "TRUCK"].includes(mode) ? mode : "DRIVEN") as TransportMode,
    pickupStreet: str(formData.get("pickupStreet")),
    pickupZip: str(formData.get("pickupZip")),
    pickupCity: str(formData.get("pickupCity")),
    pickupDate: fromDateTimeLocal(str(formData.get("pickupDate"))),
    deliveryStreet: str(formData.get("deliveryStreet")),
    deliveryZip: str(formData.get("deliveryZip")),
    deliveryCity: str(formData.get("deliveryCity")),
    licensePlate: str(formData.get("licensePlate"))?.toUpperCase() ?? null,
    make: str(formData.get("make")),
    model: str(formData.get("model")),
    distanceKm: decimal(formData.get("distanceKm")),
    durationMinutes: minutes === null ? null : Math.round(minutes),
    pricingType: (formData.get("pricingType") === "PER_KM" ? "PER_KM" : "FLAT") as PricingType,
    price: decimal(formData.get("price")),
    pricePerKm: decimal(formData.get("pricePerKm")),
    returnType: RETURN_TYPE[returnType] ? returnType : "NONE",
    returnFlat: decimal(formData.get("returnFlat")),
    returnPerKm: decimal(formData.get("returnPerKm")),
  };
}

const vatFor = (ctx: Ctx) => (ctx.org.smallBusiness ? 0 : toNumber(ctx.org.defaultVatRate));

/** Neues Angebot aus den Eckdaten – Positionen werden automatisch berechnet und sind danach frei editierbar. */
export async function createQuote(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireOffice();
  const customerId = str(formData.get("customerId"));
  const customer = customerId ? await db.customer.findFirst({ where: { id: customerId, organizationId: ctx.orgId } }) : null;
  if (!customer) return { error: "Bitte wähle einen Kunden aus." };
  const data = quoteData(formData);
  const items = transportItems(data, vatFor(ctx));
  const totals = computeTotals(items, ctx.org.smallBusiness);
  const seq = await nextNumber(ctx.orgId, "nextQuoteNumber");
  const now = new Date();
  const quote = await db.quote.create({
    data: {
      ...data,
      organizationId: ctx.orgId,
      customerId: customer.id,
      number: `${ctx.org.quotePrefix}${now.getFullYear()}-${String(seq).padStart(4, "0")}`,
      validUntil: new Date(now.getTime() + ctx.org.quoteValidDays * 86400000),
      recipient: addressLines(customer).join("\n"),
      smallBusiness: ctx.org.smallBusiness,
      introText: "Vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen die Überführung wie folgt an:",
      netTotal: totals.net,
      vatTotal: totals.vatTotal,
      grossTotal: totals.gross,
      items: { create: items.map((i, idx) => ({ ...i, position: idx + 1 })) },
    },
  });
  const inquiryId = str(formData.get("inquiryId"));
  if (inquiryId) {
    await db.inquiry.updateMany({ where: { id: inquiryId, organizationId: ctx.orgId }, data: { quoteId: quote.id, status: "ACCEPTED" } });
  }
  redirect(`/quotes/${quote.id}`);
}

/** Eckdaten ändern: berechnete Positionen (Transport, Rückreise) werden erneuert, eigene Positionen bleiben. */
export async function updateQuoteDetails(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireOffice();
  const quote = await requireQuote(ctx, String(formData.get("id")));
  if (quote.status === "ACCEPTED") return { error: "Angenommene Angebote können nicht mehr geändert werden." };
  const customerId = str(formData.get("customerId"));
  const customer = customerId ? await db.customer.findFirst({ where: { id: customerId, organizationId: ctx.orgId } }) : null;
  if (!customer) return { error: "Bitte wähle einen Kunden aus." };
  const data = quoteData(formData);
  const generated = (d: string) => d.startsWith("Fahrzeugüberführung") || d.startsWith("Rückreise des Fahrers");
  const keep: ItemInput[] = quote.items
    .filter((i) => !generated(i.description))
    .map((i) => ({ description: i.description, quantity: toNumber(i.quantity), unit: i.unit, unitPrice: toNumber(i.unitPrice), vatRate: toNumber(i.vatRate) }));
  const items = [...transportItems(data, vatFor(ctx)), ...keep];
  const totals = computeTotals(items, quote.smallBusiness);
  await db.$transaction([
    db.quoteItem.deleteMany({ where: { quoteId: quote.id } }),
    db.quote.update({
      where: { id: quote.id },
      data: {
        ...data,
        customerId: customer.id,
        ...(customer.id !== quote.customerId ? { recipient: addressLines(customer).join("\n") } : {}),
        netTotal: totals.net,
        vatTotal: totals.vatTotal,
        grossTotal: totals.gross,
        items: { create: items.map((i, idx) => ({ ...i, position: idx + 1 })) },
      },
    }),
  ]);
  redirect(`/quotes/${quote.id}`);
}

const ItemsSchema = z.array(
  z.object({
    description: z.string().trim().min(1, "Jede Position braucht eine Beschreibung."),
    quantity: z.coerce.number(),
    unit: z.string().trim().max(20).default("Stk."),
    unitPrice: z.coerce.number(),
    vatRate: z.coerce.number().min(0).max(100),
  }),
);

/** Positionen und Texte speichern (Editor). */
export async function saveQuote(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireOffice();
  const quote = await requireQuote(ctx, String(formData.get("id")));
  if (quote.status === "ACCEPTED") return { error: "Angenommene Angebote können nicht mehr geändert werden." };
  let items: ItemInput[];
  try {
    const parsed = ItemsSchema.safeParse(JSON.parse(String(formData.get("items") ?? "[]")));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    items = parsed.data;
  } catch {
    return { error: "Positionen konnten nicht gelesen werden." };
  }
  if (items.length === 0) return { error: "Das Angebot braucht mindestens eine Position." };
  const recipient = str(formData.get("recipient"))?.replace(/\r\n?/g, "\n") ?? null;
  if (!recipient) return { error: "Bitte die Empfängeranschrift angeben." };
  const smallBusiness = formData.get("smallBusiness") === "on";
  const totals = computeTotals(items, smallBusiness);
  const validUntil = str(formData.get("validUntil"));
  await db.$transaction([
    db.quoteItem.deleteMany({ where: { quoteId: quote.id } }),
    db.quote.update({
      where: { id: quote.id },
      data: {
        recipient,
        smallBusiness,
        validUntil: validUntil ? new Date(`${validUntil}T12:00:00Z`) : quote.validUntil,
        introText: str(formData.get("introText")),
        footerText: str(formData.get("footerText")),
        netTotal: totals.net,
        vatTotal: totals.vatTotal,
        grossTotal: totals.gross,
        items: { create: items.map((i, idx) => ({ ...i, position: idx + 1, vatRate: smallBusiness ? 0 : i.vatRate })) },
      },
    }),
  ]);
  revalidatePath(`/quotes/${quote.id}`);
  return { ok: "Angebot gespeichert." };
}

export async function setQuoteStatus(formData: FormData) {
  const ctx = await requireOffice();
  const quote = await requireQuote(ctx, String(formData.get("id")));
  const status = String(formData.get("status")) as QuoteStatus;
  if (!["DRAFT", "SENT", "DECLINED"].includes(status) || quote.status === "ACCEPTED") return;
  await db.quote.update({ where: { id: quote.id }, data: { status } });
  revalidatePath(`/quotes/${quote.id}`);
  revalidatePath("/quotes");
}

/** Angebot angenommen → Auftrag mit allen Eckdaten anlegen. Die Rechnung übernimmt später die Angebotspositionen. */
export async function acceptQuote(formData: FormData) {
  const ctx = await requireOffice();
  const quote = await requireQuote(ctx, String(formData.get("id")));
  if (quote.orderId) redirect(`/orders/${quote.orderId}`);
  const vehicle = { licensePlate: quote.licensePlate, make: quote.make, model: quote.model, vin: null, color: null, firstRegistration: null, vehicleType: null };
  const vehicleId = quote.licensePlate || quote.make ? await syncVehicle(ctx.orgId, quote.customerId, vehicle, null) : null;
  const number = await nextNumber(ctx.orgId, "nextOrderNumber");
  const order = await db.order.create({
    data: {
      organizationId: ctx.orgId,
      customerId: quote.customerId,
      number,
      status: quote.pickupDate ? "PLANNED" : "DRAFT",
      createdById: ctx.user.id,
      assignedToId: ctx.user.id,
      transportMode: quote.transportMode,
      pickupStreet: quote.pickupStreet,
      pickupZip: quote.pickupZip,
      pickupCity: quote.pickupCity,
      pickupDate: quote.pickupDate,
      deliveryStreet: quote.deliveryStreet,
      deliveryZip: quote.deliveryZip,
      deliveryCity: quote.deliveryCity,
      licensePlate: quote.licensePlate,
      make: quote.make,
      model: quote.model,
      vehicleId,
      distanceKm: quote.distanceKm,
      durationMinutes: quote.durationMinutes,
      pricingType: quote.pricingType,
      price: quote.price,
      pricePerKm: quote.pricePerKm,
      returnType: quote.returnType,
      returnFlat: quote.returnFlat,
      returnPerKm: quote.returnPerKm,
    },
  });
  await db.quote.update({ where: { id: quote.id }, data: { status: "ACCEPTED", orderId: order.id } });
  await db.inquiry.updateMany({ where: { quoteId: quote.id, orderId: null }, data: { orderId: order.id } });
  await logEvent(order.id, ctx, `Auftrag aus Angebot ${quote.number} (${formatDate(quote.createdAt)}) erstellt`);
  redirect(`/orders/${order.id}/edit`);
}

export async function deleteQuote(formData: FormData) {
  const ctx = await requireOffice();
  const quote = await requireQuote(ctx, String(formData.get("id")));
  if (quote.status === "ACCEPTED" && !canManage(ctx.role)) throw new Error("Angenommene Angebote können nur Administratoren löschen.");
  await db.quote.delete({ where: { id: quote.id } });
  redirect("/quotes");
}
