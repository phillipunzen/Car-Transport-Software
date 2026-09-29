"use server";

import { revalidatePath } from "next/cache";
import type { Prisma, Stage } from "@prisma/client";
import { db } from "@/lib/db";
import { canManage, requireCtx } from "@/lib/org";
import { decimal, fromDateTimeLocal, str } from "@/lib/format";
import { CHECKLIST_ITEMS } from "@/lib/labels";
import type { FormState } from "@/components/action-form";
import { logEvent } from "../../actions";

const isSignature = (v: string | null) => (v && v.startsWith("data:image/png;base64,") && v.length < 2_000_000 ? v : null);

export async function saveProtocol(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  const orderId = String(formData.get("orderId"));
  const type: Stage = formData.get("type") === "DELIVERY" ? "DELIVERY" : "PICKUP";
  const order = await db.order.findFirst({ where: { id: orderId, organizationId: ctx.orgId } });
  if (!order) return { error: "Auftrag nicht gefunden." };
  const existing = await db.protocol.findUnique({ where: { orderId_type: { orderId, type } } });
  if (existing?.completedAt) return { error: "Das Protokoll ist bereits abgeschlossen." };

  const checklist: Record<string, boolean | number> = {};
  for (const item of CHECKLIST_ITEMS) {
    if (item.kind === "count") checklist[item.key] = Math.max(0, Math.round(decimal(formData.get(`cl_${item.key}`)) ?? 0));
    else checklist[item.key] = formData.get(`cl_${item.key}`) === "on";
  }
  const mileage = decimal(formData.get("mileage"));
  const fuel = decimal(formData.get("fuelLevel"));
  const data = {
    performedAt: fromDateTimeLocal(str(formData.get("performedAt"))) ?? new Date(),
    location: str(formData.get("location")),
    mileage: mileage === null ? null : Math.round(mileage),
    fuelLevel: fuel === null ? null : Math.min(100, Math.max(0, Math.round(fuel))),
    checklist: checklist as Prisma.InputJsonValue,
    exteriorClean: str(formData.get("exteriorClean")),
    interiorClean: str(formData.get("interiorClean")),
    notes: str(formData.get("notes")),
    handoverName: str(formData.get("handoverName")),
    signatureCustomer: isSignature(str(formData.get("signatureCustomer"))),
    signatureDriver: isSignature(str(formData.get("signatureDriver"))),
    performedById: ctx.user.id,
  };

  const complete = formData.get("intent") === "complete";
  if (complete) {
    if (!data.handoverName) return { error: "Bitte den Namen des Übergebenden/Empfängers eintragen." };
    if (!data.signatureCustomer || !data.signatureDriver) return { error: "Zum Abschließen sind beide Unterschriften erforderlich." };
    if (data.mileage === null) return { error: "Bitte den Kilometerstand eintragen." };
  }

  await db.protocol.upsert({
    where: { orderId_type: { orderId, type } },
    create: { ...data, orderId, type, completedAt: complete ? new Date() : null },
    update: { ...data, completedAt: complete ? new Date() : null },
  });

  const label = type === "PICKUP" ? "Abholprotokoll" : "Übergabeprotokoll";
  if (complete) {
    // Auftragsstatus automatisch fortschreiben
    if (type === "PICKUP" && ["DRAFT", "PLANNED"].includes(order.status)) {
      await db.order.update({ where: { id: orderId }, data: { status: "IN_TRANSIT" } });
    }
    if (type === "DELIVERY" && ["DRAFT", "PLANNED", "IN_TRANSIT"].includes(order.status)) {
      await db.order.update({ where: { id: orderId }, data: { status: "DELIVERED" } });
    }
    await logEvent(orderId, ctx, `${label} abgeschlossen`);
  } else {
    await logEvent(orderId, ctx, `${label} gespeichert`);
  }
  revalidatePath(`/orders/${orderId}`, "layout");
  return { ok: complete ? `${label} abgeschlossen.` : "Zwischenstand gespeichert." };
}

export async function reopenProtocol(formData: FormData) {
  const ctx = await requireCtx();
  if (!canManage(ctx.role)) throw new Error("Nur Administratoren können Protokolle wieder öffnen.");
  const orderId = String(formData.get("orderId"));
  const type: Stage = formData.get("type") === "DELIVERY" ? "DELIVERY" : "PICKUP";
  const order = await db.order.findFirst({ where: { id: orderId, organizationId: ctx.orgId } });
  if (!order) return;
  await db.protocol.update({ where: { orderId_type: { orderId, type } }, data: { completedAt: null } });
  await logEvent(orderId, ctx, `${type === "PICKUP" ? "Abholprotokoll" : "Übergabeprotokoll"} wieder geöffnet`);
  revalidatePath(`/orders/${orderId}`, "layout");
}
