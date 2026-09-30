"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { ensureTrackingToken } from "@/lib/tracking";
import { logEvent } from "./actions";

export async function createTrackingLink(formData: FormData) {
  const ctx = await requireCtx();
  const order = await db.order.findFirst({ where: { id: String(formData.get("orderId")), organizationId: ctx.orgId } });
  if (!order) return;
  await ensureTrackingToken(order.id);
  await logEvent(order.id, ctx, "Status-Link für den Kunden erstellt");
  revalidatePath(`/orders/${order.id}`);
}

/** Link ungültig machen (z. B. versehentlich an Falsche weitergegeben). Ein neuer Link hat eine neue Adresse. */
export async function revokeTrackingLink(formData: FormData) {
  const ctx = await requireCtx();
  const order = await db.order.findFirst({ where: { id: String(formData.get("orderId")), organizationId: ctx.orgId } });
  if (!order) return;
  await db.order.update({ where: { id: order.id }, data: { trackingToken: null } });
  await logEvent(order.id, ctx, "Status-Link deaktiviert");
  revalidatePath(`/orders/${order.id}`);
}
