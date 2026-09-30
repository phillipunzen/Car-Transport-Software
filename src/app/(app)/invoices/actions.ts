"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { type Ctx } from "@/lib/org";
import { addressLines, decimal, formatDate, fromDateTimeLocal, orderNo, str, toNumber } from "@/lib/format";
import { EXPENSE_CATEGORY } from "@/lib/labels";
import { computeTotals, type ItemInput } from "@/lib/invoice";
import type { FormState } from "@/components/action-form";
import { logEvent } from "../orders/actions";
import { effectiveConditions, transportItems } from "@/lib/pricing";
import { DUNNING_LEVEL, MAX_DUNNING_LEVEL, dunningFee } from "@/lib/dunning";
import { requireOffice } from "@/lib/permissions";

const round2 = (n: number) => Math.round(n * 100) / 100;

async function createDraft(ctx: Ctx, customerId: string, items: ItemInput[], orderId?: string, serviceDate?: Date | null) {
  const customer = await db.customer.findFirstOrThrow({ where: { id: customerId, organizationId: ctx.orgId } });
  const totals = computeTotals(items, ctx.org.smallBusiness);
  const cond = effectiveConditions(ctx.org, customer);
  return db.invoice.create({
    data: {
      organizationId: ctx.orgId,
      customerId,
      orderId,
      discountPercent: cond.discountPercent,
      discountDays: cond.discountPercent ? cond.discountDays : null,
      buyerReference: customer.buyerReference,
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

const orderInclude = {
  expenses: { where: { rebillable: true }, orderBy: { date: "asc" as const } },
  protocols: true,
  quote: { include: { items: { orderBy: { position: "asc" as const } } } },
} satisfies Prisma.OrderInclude;
type OrderForInvoice = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Positionen eines Auftrags: Angebots- bzw. Transportpositionen + weiterberechnete Auslagen. */
function orderItems(ctx: Ctx, order: OrderForInvoice, extraRef?: string): ItemInput[] {
  const vatRate = ctx.org.smallBusiness ? 0 : toNumber(ctx.org.defaultVatRate);
  const delivery = order.protocols.find((p) => p.type === "DELIVERY");
  const refLine = [
    `Auftrag ${orderNo(order.number)}${order.reference ? ` · Ihre Referenz: ${order.reference}` : ""}`,
    extraRef ?? (delivery?.performedAt ? `Übergabe am ${formatDate(delivery.performedAt)}` : null),
  ]
    .filter(Boolean)
    .join(" · ");
  // Aus einem Angebot entstanden: die (ggf. angepassten) Angebotspositionen übernehmen
  const items: ItemInput[] = order.quote?.items.length
    ? order.quote.items.map((i, idx) => ({
        description: idx === 0 ? `${i.description}\n${refLine}` : i.description,
        quantity: toNumber(i.quantity),
        unit: i.unit,
        unitPrice: toNumber(i.unitPrice),
        vatRate: ctx.org.smallBusiness ? 0 : toNumber(i.vatRate),
      }))
    : transportItems(order, vatRate, [refLine]);
  for (const e of order.expenses) {
    const gross = toNumber(e.amountGross);
    // Auslagen werden netto weiterberechnet (bei Kleinunternehmern brutto)
    const unitPrice = ctx.org.smallBusiness ? gross : round2(gross / (1 + toNumber(e.vatRate) / 100));
    const desc = [
      `Auslage: ${EXPENSE_CATEGORY[e.category] ?? e.category}`,
      [e.vendor, e.description].filter(Boolean).join(" – "),
      e.date ? `Beleg vom ${formatDate(e.date)}` : null,
      extraRef ? `Auftrag ${orderNo(order.number)}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    items.push({ description: desc, quantity: 1, unit: "Stk.", unitPrice, vatRate });
  }
  return items;
}

/** Erstellt aus einem Auftrag einen Rechnungsentwurf inkl. weiterberechneter Belege. */
export async function createInvoiceFromOrder(formData: FormData) {
  const ctx = await requireOffice();
  const order = await db.order.findFirst({
    where: { id: String(formData.get("orderId")), organizationId: ctx.orgId },
    include: orderInclude,
  });
  if (!order) throw new Error("Auftrag nicht gefunden");
  if (order.collectiveInvoiceId) redirect(`/invoices/${order.collectiveInvoiceId}`);
  const existing = await db.invoice.findFirst({ where: { orderId: order.id, status: { not: "CANCELLED" } } });
  if (existing) redirect(`/invoices/${existing.id}`);

  const delivery = order.protocols.find((p) => p.type === "DELIVERY");
  const invoice = await createDraft(ctx, order.customerId, orderItems(ctx, order), order.id, delivery?.performedAt ?? order.deliveryDate ?? new Date());
  await logEvent(order.id, ctx, "Rechnungsentwurf erstellt");
  redirect(`/invoices/${invoice.id}`);
}

/** Sammelrechnung: mehrere zugestellte Aufträge eines Kunden in einer Rechnung. */
export async function createCollectiveInvoice(formData: FormData) {
  const ctx = await requireOffice();
  const customerId = String(formData.get("customerId"));
  const ids = formData.getAll("orderIds").map(String);
  const orders = await db.order.findMany({
    where: { id: { in: ids }, organizationId: ctx.orgId, customerId, collectiveInvoiceId: null, invoices: { none: { status: { not: "CANCELLED" } } } },
    include: orderInclude,
    orderBy: [{ pickupDate: "asc" }, { number: "asc" }],
  });
  if (orders.length === 0) throw new Error("Bitte mindestens einen Auftrag auswählen.");
  const items = orders.flatMap((o) => {
    const d = o.protocols.find((p) => p.type === "DELIVERY");
    return orderItems(ctx, o, d?.performedAt ? `Übergabe am ${formatDate(d.performedAt)}` : o.pickupDate ? `Termin ${formatDate(o.pickupDate)}` : undefined);
  });
  const dates = orders.map((o) => o.protocols.find((p) => p.type === "DELIVERY")?.performedAt ?? o.pickupDate).filter((d): d is Date => Boolean(d));
  const invoice = await createDraft(ctx, customerId, items, undefined, dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date());
  await db.invoice.update({
    where: { id: invoice.id },
    data: { introText: `Vielen Dank für Ihre Aufträge. Wir berechnen Ihnen folgende ${orders.length} Überführungen:` },
  });
  await db.order.updateMany({ where: { id: { in: orders.map((o) => o.id) } }, data: { collectiveInvoiceId: invoice.id } });
  for (const o of orders) await logEvent(o.id, ctx, "In Sammelrechnung übernommen");
  redirect(`/invoices/${invoice.id}`);
}

export async function createInvoice(formData: FormData) {
  const ctx = await requireOffice();
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
  const ctx = await requireOffice();
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
  const discountPercent = decimal(formData.get("discountPercent"));
  const discountDays = decimal(formData.get("discountDays"));
  if (discountPercent !== null && (discountPercent < 0 || discountPercent > 20)) return { error: "Skonto muss zwischen 0 und 20 % liegen." };
  if (discountPercent && !discountDays) return { error: "Bitte die Skonto-Frist in Tagen angeben." };

  await db.$transaction([
    db.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } }),
    db.invoice.update({
      where: { id: invoice.id },
      data: {
        recipient,
        smallBusiness,
        discountPercent: discountPercent || null,
        discountDays: discountPercent && discountDays ? Math.round(discountDays) : null,
        buyerReference: str(formData.get("buyerReference")),
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
    const current = await tx.invoice.findUniqueOrThrow({ where: { id }, include: { customer: true } });
    const termDays = current.customer.paymentTermDays ?? org.paymentTermDays;
    const invoice = await tx.invoice.update({
      where: { id },
      data: {
        number,
        // Stornorechnungen sind mit der Verrechnung sofort erledigt
        status: opts.credit ? "PAID" : "ISSUED",
        paidAt: opts.credit ? issueDate : null,
        issueDate,
        dueDate: new Date(issueDate.getTime() + termDays * 86400000),
        serviceDate: current.serviceDate ?? issueDate,
      },
    });
    if (!opts.credit) {
      const collective = await tx.order.findMany({ where: { collectiveInvoiceId: id }, select: { id: true } });
      for (const o of collective) {
        await tx.order.updateMany({ where: { id: o.id, status: { not: "CANCELLED" } }, data: { status: "INVOICED" } });
        await tx.orderEvent.create({ data: { orderId: o.id, message: `Sammelrechnung ${number} festgeschrieben`, userName: ctx.user.name ?? ctx.user.email } });
      }
    }
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
  const ctx = await requireOffice();
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
  const ctx = await requireOffice();
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
      buyerReference: invoice.buyerReference,
      correctsNumber: invoice.number,
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
  // Sammelrechnung storniert: Aufträge wieder freigeben, damit sie neu abgerechnet werden können
  const collective = await db.order.findMany({ where: { collectiveInvoiceId: invoice.id }, select: { id: true } });
  if (collective.length) {
    await db.order.updateMany({ where: { collectiveInvoiceId: invoice.id, status: "INVOICED" }, data: { status: "DELIVERED" } });
    await db.order.updateMany({ where: { collectiveInvoiceId: invoice.id }, data: { collectiveInvoiceId: null } });
    for (const o of collective) await logEvent(o.id, ctx, `Sammelrechnung ${invoice.number} storniert`);
  }
  if (invoice.orderId) {
    await db.order.updateMany({ where: { id: invoice.orderId, status: "INVOICED" }, data: { status: "DELIVERED" } });
    await logEvent(invoice.orderId, ctx, `Rechnung ${invoice.number} storniert`);
  }
  await finalize(ctx, credit.id, { credit: true });
  revalidatePath("/invoices");
  redirect(`/invoices/${credit.id}`);
}

export async function deleteDraft(formData: FormData) {
  const ctx = await requireOffice();
  const invoice = await draftFor(ctx, String(formData.get("id")));
  if (invoice.status !== "DRAFT") throw new Error("Nur Entwürfe können gelöscht werden.");
  await db.invoice.delete({ where: { id: invoice.id } });
  redirect(invoice.orderId ? `/orders/${invoice.orderId}` : "/invoices");
}

/** Nächste Mahnstufe anlegen (Zahlungserinnerung → 1. Mahnung → 2. Mahnung). */
export async function createDunning(formData: FormData) {
  const ctx = await requireOffice();
  const invoice = await db.invoice.findFirst({
    where: { id: String(formData.get("id")), organizationId: ctx.orgId },
    include: { dunnings: true },
  });
  if (!invoice || invoice.status !== "ISSUED" || invoice.correctsNumber) throw new Error("Nur offene Rechnungen können gemahnt werden.");
  const level = Math.max(0, ...invoice.dunnings.map((d) => d.level)) + 1;
  if (level > MAX_DUNNING_LEVEL) throw new Error("Die letzte Mahnstufe ist bereits erreicht.");
  const fee = decimal(formData.get("fee")) ?? dunningFee(ctx.org, level);
  const days = Math.max(1, Math.round(decimal(formData.get("days")) ?? ctx.org.dunningDays));
  const dunning = await db.dunning.create({
    data: { invoiceId: invoice.id, level, fee: Math.max(0, fee), dueDate: new Date(Date.now() + days * 86400000) },
  });
  if (invoice.orderId) await logEvent(invoice.orderId, ctx, `${DUNNING_LEVEL[level].label} zu Rechnung ${invoice.number} erstellt`);
  revalidatePath(`/invoices/${invoice.id}`);
  redirect(`/invoices/${invoice.id}?dunning=${dunning.id}`);
}

/** Zuletzt erstellte Mahnstufe zurücknehmen (z. B. versehentlich angelegt). */
export async function deleteDunning(formData: FormData) {
  const ctx = await requireOffice();
  const dunning = await db.dunning.findFirst({
    where: { id: String(formData.get("dunningId")), invoice: { organizationId: ctx.orgId } },
    include: { invoice: { include: { dunnings: true } } },
  });
  if (!dunning) return;
  if (dunning.invoice.dunnings.some((d) => d.level > dunning.level)) throw new Error("Nur die letzte Mahnstufe kann zurückgenommen werden.");
  await db.dunning.delete({ where: { id: dunning.id } });
  revalidatePath(`/invoices/${dunning.invoiceId}`);
}
