"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOffice } from "@/lib/permissions";
import { parseStatement } from "@/lib/bank";
import { logEvent } from "../orders/actions";

async function requireModule() {
  const ctx = await requireOffice();
  if (!ctx.org.moduleBankImport) redirect("/settings/modules");
  return ctx;
}

/** Kontoauszug hochladen: neue Zahlungseingänge speichern (bereits bekannte werden übersprungen). */
export async function importStatement(formData: FormData) {
  const ctx = await requireModule();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/bank?error=datei");
  if (file.size > 10 * 1024 * 1024) redirect("/bank?error=gross");
  const buf = Buffer.from(await file.arrayBuffer());
  // Viele Banken liefern CSV in Windows-1252 – UTF-8 bevorzugen, sonst Latin-1
  let text = buf.toString("utf8");
  if (text.includes("�")) text = buf.toString("latin1");
  let txs;
  try {
    txs = parseStatement(text);
  } catch (e) {
    redirect(`/bank?error=${encodeURIComponent((e as Error).message)}`);
  }
  let added = 0;
  for (const t of txs) {
    const exists = await db.bankTransaction.findUnique({ where: { organizationId_hash: { organizationId: ctx.orgId, hash: t.hash } } });
    if (exists) continue;
    await db.bankTransaction.create({ data: { ...t, organizationId: ctx.orgId } });
    added++;
  }
  redirect(`/bank?imported=${added}&total=${txs.length}`);
}

/** Ausgewählte Zuordnungen übernehmen: Rechnung auf „bezahlt“ (Zahldatum = Buchungstag). */
export async function applyMatches(formData: FormData) {
  const ctx = await requireModule();
  const selected = formData.getAll("apply").map(String);
  let paid = 0;
  for (const txId of selected) {
    const invoiceId = String(formData.get(`invoice_${txId}`) ?? "");
    if (!invoiceId) continue;
    const tx = await db.bankTransaction.findFirst({ where: { id: txId, organizationId: ctx.orgId, invoiceId: null } });
    const invoice = await db.invoice.findFirst({ where: { id: invoiceId, organizationId: ctx.orgId, status: "ISSUED" }, include: { collectiveOrders: { select: { id: true } } } });
    if (!tx || !invoice) continue;
    await db.$transaction([
      db.bankTransaction.update({ where: { id: tx.id }, data: { invoiceId: invoice.id } }),
      db.invoice.update({ where: { id: invoice.id }, data: { status: "PAID", paidAt: tx.bookingDate } }),
    ]);
    const orderIds = [invoice.orderId, ...invoice.collectiveOrders.map((o) => o.id)].filter((x): x is string => Boolean(x));
    for (const id of orderIds) await logEvent(id, ctx, `Zahlungseingang ${tx.amount.toFixed(2).replace(".", ",")} € für Rechnung ${invoice.number} verbucht`);
    paid++;
  }
  revalidatePath("/bank");
  revalidatePath("/invoices");
  redirect(`/bank?paid=${paid}`);
}

export async function ignoreTransaction(formData: FormData) {
  const ctx = await requireModule();
  await db.bankTransaction.updateMany({ where: { id: String(formData.get("id")), organizationId: ctx.orgId }, data: { ignored: formData.get("undo") !== "1" } });
  revalidatePath("/bank");
}
