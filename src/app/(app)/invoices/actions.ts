"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCtx, type Ctx } from "@/lib/org";
import { addressLines, formatDate, formatNumber, fromDateTimeLocal, orderNo, str, toNumber } from "@/lib/format";
import { EXPENSE_CATEGORY } from "@/lib/labels";
import { computeTotals, type ItemInput } from "@/lib/invoice";
import type { FormState } from "@/components/action-form";
import { logEvent } from "../orders/actions";

const round2 = (n: number) => Math.round(n * 100) / 100;

async function createDraft(ctx: Ctx, customerId: string, items: ItemInput[], orderId?: string, serviceDate?: Date | null) {
  const customer = await db.customer.findFirstOrThrow({ where: { id: customerId, organizationId: ctx.orgId } });
  const totals = computeTotals(items, ctx.org.smallBusiness);
  return db.invoice.create({
    data: {
      organizationId: ctx.orgId,
      customerId,
      orderId,
      recipient: addressLines(customer).join("\n"),
      smallBusiness: ctx.org.smallBusiness,
      introText: ctx.org.invoiceIntroText ?? "Vielen Dank für Ihren Auftrag. Wir berechnen Ihnen folgende Leistungen:",
      footerText: ctx.org.invoiceFooterText,
      serviceDate: serviceDate ?? null,
      netTotal: totals.net,
      vatTotal: totals.vatTotal,
      grossTotal: totals.gross,
      items: { create: items.map((i, idx) => ({ ...i, position: idx + 1 })) },
    },
  });
}

/** Erstellt aus einem Auftrag einen Rechnungsentwurf inkl. weiterberechneter Belege. */
export async function createInvoiceFromOrder(formData: FormData) {
  const ctx = await requireCtx();
  const order = await db.order.findFirst({
    where: { id: String(formData.get("orderId")), organizationId: ctx.orgId },
    include: { expenses: { where: { rebillable: true }, orderBy: { date: "asc" } }, protocols: true },
  });
  if (!order) throw new Error("Auftrag nicht gefunden");
  const existing = await db.invoice.findFirst({ where: { orderId: order.id, status: { not: "CANCELLED" } } });
  if (existing) redirect(`/invoices/${existing.id}`);

  const vatRate = ctx.org.smallBusiness ? 0 : toNumber(ctx.org.defaultVatRate);
  const vehicle = [order.make, order.model].filter(Boolean).join(" ");
  const lines = [
    `Fahrzeugüberführung${vehicle ? ` ${vehicle}` : ""}${order.licensePlate ? ` (${order.licensePlate})` : ""}`,
    `${order.pickupCity ?? "?"} → ${order.deliveryCity ?? "?"}`,
    order.vin ? `FIN: ${order.vin}` : null,
    `Auftrag ${orderNo(order.number)}${order.reference ? ` · Ihre Referenz: ${order.reference}` : ""}`,
  ].filter(Boolean);
  const km = toNumber(order.distanceKm);
  const items: ItemInput[] = [];
  if (order.pricingType === "PER_KM") {
    items.push({ description: lines.join("\n"), quantity: km || 1, unit: "km", unitPrice: toNumber(order.pricePerKm), vatRate });
  } else {
    items.push({ description: lines.join("\n") + (km ? `\nStrecke: ${formatNumber(km, 1)} km` : ""), quantity: 1, unit: "Pausch.", unitPrice: toNumber(order.price), vatRate });
  }
  for (const e of order.expenses) {
    const gross = toNumber(e.amountGross);
    // Auslagen werden netto weiterberechnet (bei Kleinunternehmern brutto)
    const unitPrice = ctx.org.smallBusiness ? gross : round2(gross / (1 + toNumber(e.vatRate) / 100));
    const desc = [
      `Auslage: ${EXPENSE_CATEGORY[e.category] ?? e.category}`,
      [e.vendor, e.description].filter(Boolean).join(" – "),
      e.date ? `Beleg vom ${formatDate(e.date)}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    items.push({ description: desc, quantity: 1, unit: "Stk.", unitPrice, vatRate });
  }
  const delivery = order.protocols.find((p) => p.type === "DELIVERY");
  const invoice = await createDraft(ctx, order.customerId, items, order.id, delivery?.performedAt ?? order.deliveryDate ?? new Date());
  await logEvent(order.id, ctx, "Rechnungsentwurf erstellt");
  redirect(`/invoices/${invoice.id}`);
}

export async function createInvoice(formData: FormData) {
  const ctx = await requireCtx();
  const customerId = String(formData.get("customerId"));
  const vatRate = ctx.org.smallBusiness ? 0 : toNumber(ctx.org.defaultVatRate);
  const invoice = await createDraft(ctx, customerId, [{ description: "Fahrzeugüberführung", quantity: 1, unit: "Pausch.", unitPrice: 0, vatRate }], undefined, new Date());
  redirect(`/invoices/${invoice.id}`);
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

async function draftFor(ctx: Ctx, id: string) {
  const invoice = await db.invoice.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!invoice) throw new Error("Rechnung nicht gefunden");
  return invoice;
}

export async function saveInvoice(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  const invoice = await draftFor(ctx, String(formData.get("id")));
  if (invoice.status !== "DRAFT") return { error: "Festgeschriebene Rechnungen können nicht mehr geändert werden." };

  let items: ItemInput[];
  try {
    const parsed = ItemsSchema.safeParse(JSON.parse(String(formData.get("items") ?? "[]")));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    items = parsed.data;
  } catch {
    return { error: "Positionen konnten nicht gelesen werden." };
  }
  if (items.length === 0) return { error: "Die Rechnung braucht mindestens eine Position." };

  const smallBusiness = formData.get("smallBusiness") === "on";
  const totals = computeTotals(items, smallBusiness);
  const recipient = str(formData.get("recipient"))?.replace(/\r\n?/g, "\n") ?? null;
  if (!recipient) return { error: "Bitte die Empfängeranschrift angeben." };

  await db.$transaction([
    db.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } }),
    db.invoice.update({
      where: { id: invoice.id },
      data: {
        recipient,
        smallBusiness,
        serviceDate: fromDateTimeLocal(str(formData.get("serviceDate"))),
        introText: str(formData.get("introText")),
        footerText: str(formData.get("footerText")),
        netTotal: totals.net,
        vatTotal: totals.vatTotal,
        grossTotal: totals.gross,
        items: {
          create: items.map((i, idx) => ({
            ...i,
            position: idx + 1,
            vatRate: smallBusiness ? 0 : i.vatRate,
          })) satisfies Prisma.InvoiceItemCreateWithoutInvoiceInput[],
        },
      },
    }),
  ]);
  revalidatePath(`/invoices/${invoice.id}`);

  if (formData.get("intent") === "issue") return issue(ctx, invoice.id);
  return { ok: "Entwurf gespeichert." };
}

/** Vergibt die fortlaufende Rechnungsnummer und schreibt die Rechnung fest. */
async function finalize(ctx: Ctx, id: string, opts: { credit?: boolean } = {}) {
  const issueDate = new Date();
  return db.$transaction(async (tx) => {
    const org = await tx.organization.update({
      where: { id: ctx.orgId },
      data: { nextInvoiceNumber: { increment: 1 } },
    });
    const seq = org.nextInvoiceNumber - 1;
    const number = `${org.invoicePrefix}${issueDate.getFullYear()}-${String(seq).padStart(4, "0")}`;
    const current = await tx.invoice.findUniqueOrThrow({ where: { id } });
    const invoice = await tx.invoice.update({
      where: { id },
      data: {
        number,
        // Stornorechnungen sind mit der Verrechnung sofort erledigt
        status: opts.credit ? "PAID" : "ISSUED",
        paidAt: opts.credit ? issueDate : null,
        issueDate,
        dueDate: new Date(issueDate.getTime() + org.paymentTermDays * 86400000),
        serviceDate: current.serviceDate ?? issueDate,
      },
    });
    if (invoice.orderId && !opts.credit) {
      await tx.order.updateMany({ where: { id: invoice.orderId, status: { not: "CANCELLED" } }, data: { status: "INVOICED" } });
      await tx.orderEvent.create({
        data: { orderId: invoice.orderId, message: `Rechnung ${number} festgeschrieben`, userName: ctx.user.name ?? ctx.user.email },
      });
    }
    return invoice;
  });
}

async function issue(ctx: Ctx, id: string): Promise<FormState> {
  await finalize(ctx, id);
  revalidatePath(`/invoices/${id}`);
  redirect(`/invoices/${id}`);
}

export async function setPaid(formData: FormData) {
  const ctx = await requireCtx();
  const invoice = await draftFor(ctx, String(formData.get("id")));
  const paid = formData.get("paid") === "1";
  if (invoice.status !== "ISSUED" && invoice.status !== "PAID") return;
  await db.invoice.update({
    where: { id: invoice.id },
    data: { status: paid ? "PAID" : "ISSUED", paidAt: paid ? fromDateTimeLocal(str(formData.get("paidAt"))) ?? new Date() : null },
  });
  revalidatePath(`/invoices/${invoice.id}`);
}

/** Storniert eine festgeschriebene Rechnung durch eine Stornorechnung. */
export async function cancelInvoice(formData: FormData) {
  const ctx = await requireCtx();
  const invoice = await db.invoice.findFirst({
    where: { id: String(formData.get("id")), organizationId: ctx.orgId },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!invoice || invoice.status === "DRAFT" || invoice.status === "CANCELLED") return;
  const credit = await db.invoice.create({
    data: {
      organizationId: ctx.orgId,
      customerId: invoice.customerId,
      orderId: invoice.orderId,
      recipient: invoice.recipient,
      smallBusiness: invoice.smallBusiness,
      serviceDate: invoice.serviceDate,
      introText: `Stornorechnung zur Rechnung ${invoice.number} vom ${formatDate(invoice.issueDate)}.`,
      footerText: invoice.footerText,
      netTotal: -toNumber(invoice.netTotal),
      vatTotal: -toNumber(invoice.vatTotal),
      grossTotal: -toNumber(invoice.grossTotal),
      items: {
        create: invoice.items.map((i) => ({
          position: i.position,
          description: i.description,
          quantity: -toNumber(i.quantity),
          unit: i.unit,
          unitPrice: i.unitPrice,
          vatRate: i.vatRate,
        })),
      },
    },
  });
  await db.invoice.update({ where: { id: invoice.id }, data: { status: "CANCELLED" } });
  if (invoice.orderId) {
    await db.order.updateMany({ where: { id: invoice.orderId, status: "INVOICED" }, data: { status: "DELIVERED" } });
    await logEvent(invoice.orderId, ctx, `Rechnung ${invoice.number} storniert`);
  }
  await finalize(ctx, credit.id, { credit: true });
  revalidatePath("/invoices");
  redirect(`/invoices/${credit.id}`);
}

export async function deleteDraft(formData: FormData) {
  const ctx = await requireCtx();
  const invoice = await draftFor(ctx, String(formData.get("id")));
  if (invoice.status !== "DRAFT") throw new Error("Nur Entwürfe können gelöscht werden.");
  await db.invoice.delete({ where: { id: invoice.id } });
  redirect(invoice.orderId ? `/orders/${invoice.orderId}` : "/invoices");
}
