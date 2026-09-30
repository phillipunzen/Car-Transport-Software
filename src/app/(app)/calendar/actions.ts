"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { fromDateTimeLocal, str } from "@/lib/format";
import { logEvent } from "../orders/actions";

/** Persönlichen Kalender-Link erzeugen bzw. erneuern (alter Link wird ungültig). */
export async function resetCalendarToken() {
  const ctx = await requireCtx();
  await db.user.update({ where: { id: ctx.user.id }, data: { calendarToken: randomBytes(18).toString("base64url") } });
  revalidatePath("/calendar/setup");
}

export async function removeCalendarToken() {
  const ctx = await requireCtx();
  await db.user.update({ where: { id: ctx.user.id }, data: { calendarToken: null } });
  revalidatePath("/calendar/setup");
}

/** Tour einplanen: Fahrer und Abholtermin setzen (Entwurf wird dadurch „Geplant“). */
export async function planOrder(formData: FormData) {
  const ctx = await requireCtx();
  const order = await db.order.findFirst({ where: { id: String(formData.get("orderId")), organizationId: ctx.orgId }, include: { assignedTo: true } });
  if (!order) throw new Error("Auftrag nicht gefunden");
  const assignedToId = str(formData.get("assignedToId"));
  if (assignedToId && !(await db.membership.findFirst({ where: { userId: assignedToId, organizationId: ctx.orgId } }))) throw new Error("Ungültiger Fahrer");
  const pickupDate = fromDateTimeLocal(str(formData.get("pickupDate")));
  const driver = assignedToId ? await db.user.findUnique({ where: { id: assignedToId } }) : null;
  await db.order.update({
    where: { id: order.id },
    data: {
      assignedToId,
      pickupDate,
      ...(order.status === "DRAFT" && pickupDate ? { status: "PLANNED" as const } : {}),
    },
  });
  const changes = [
    (order.assignedToId ?? null) !== assignedToId ? `Fahrer: ${driver?.name ?? driver?.email ?? "nicht zugewiesen"}` : null,
    (order.pickupDate?.getTime() ?? null) !== (pickupDate?.getTime() ?? null) ? `Termin: ${pickupDate ? pickupDate.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" }) : "offen"}` : null,
  ].filter(Boolean);
  if (changes.length) await logEvent(order.id, ctx, `Tour geplant – ${changes.join(", ")}`);
  revalidatePath("/calendar");
  revalidatePath("/today");
}
