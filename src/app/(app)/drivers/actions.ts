"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOffice } from "@/lib/permissions";
import { fromDateTimeLocal, str, toNumber } from "@/lib/format";
import { nextDayKey } from "@/lib/calendar";
import { openItems } from "@/lib/settlements";

/** Abrechnung für einen Fahrer bis zum Stichtag erstellen; Vergütung je Tour wird dabei festgeschrieben. */
export async function createSettlement(formData: FormData) {
  const ctx = await requireOffice();
  if (!ctx.org.moduleDriverPay) throw new Error("Modul Fahrer-Abrechnung ist nicht aktiv.");
  const userId = String(formData.get("userId"));
  const fromKey = String(formData.get("from"));
  const toKey = String(formData.get("to"));
  const until = fromDateTimeLocal(`${nextDayKey(toKey)}T00:00`)!;
  const items = await openItems(ctx.orgId, userId, until);
  if (!items.member) throw new Error("Fahrer nicht gefunden");
  if (items.tours.length === 0 && items.expenses.length === 0) throw new Error("Keine offenen Touren oder Auslagen.");
  const vatRate = items.member.payVat ? toNumber(ctx.org.defaultVatRate) : 0;
  const vat = Math.round(items.payTotal * vatRate) / 100;
  await db.$transaction(async (tx) => {
    const org = await tx.organization.update({ where: { id: ctx.orgId }, data: { nextSettlementNumber: { increment: 1 } } });
    const number = `FA-${toKey.slice(0, 4)}-${String(org.nextSettlementNumber - 1).padStart(4, "0")}`;
    const s = await tx.driverSettlement.create({
      data: {
        organizationId: ctx.orgId,
        userId,
        number,
        driverName: items.member!.user.name ?? items.member!.user.email,
        periodFrom: fromDateTimeLocal(`${fromKey}T12:00`)!,
        periodTo: fromDateTimeLocal(`${toKey}T12:00`)!,
        vatRate,
        payTotal: items.payTotal,
        expenseTotal: items.expenseTotal,
        grossTotal: Math.round((items.payTotal + vat + items.expenseTotal) * 100) / 100,
        notes: str(formData.get("notes")),
      },
    });
    for (const t of items.tours) await tx.order.update({ where: { id: t.id }, data: { settlementId: s.id, driverPay: t.pay } });
    await tx.expense.updateMany({ where: { id: { in: items.expenses.map((e) => e.id) } }, data: { settlementId: s.id } });
  });
  revalidatePath("/drivers");
}

/** Letzte Abrechnung zurücknehmen (z. B. um Touren nachzutragen). */
export async function deleteSettlement(formData: FormData) {
  const ctx = await requireOffice();
  const s = await db.driverSettlement.findFirst({ where: { id: String(formData.get("id")), organizationId: ctx.orgId } });
  if (!s) return;
  await db.$transaction([
    db.order.updateMany({ where: { settlementId: s.id }, data: { settlementId: null } }),
    db.expense.updateMany({ where: { settlementId: s.id }, data: { settlementId: null } }),
    db.driverSettlement.delete({ where: { id: s.id } }),
  ]);
  revalidatePath("/drivers");
}
