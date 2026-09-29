"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { deleteFile, saveUpload } from "@/lib/files";
import { recognitionMode, recognizeReceipt } from "@/lib/recognition";
import { decimal, str } from "@/lib/format";
import { EXPENSE_CATEGORY } from "@/lib/labels";
import { logEvent } from "../../actions";

async function orderFor(orderId: string) {
  const ctx = await requireCtx();
  const order = await db.order.findFirst({ where: { id: orderId, organizationId: ctx.orgId } });
  if (!order) throw new Error("Auftrag nicht gefunden");
  return { ctx, order };
}

/** Beleg hochladen und automatisch auslesen (KI oder lokale OCR). */
export async function uploadReceipt(formData: FormData): Promise<{ error?: string; recognized?: boolean }> {
  const { ctx, order } = await orderFor(String(formData.get("orderId")));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Bitte eine Datei auswählen." };

  let saved;
  try {
    saved = await saveUpload(ctx.orgId, ctx.user.id, file);
  } catch (e) {
    return { error: (e as Error).message };
  }

  let extracted: Awaited<ReturnType<typeof recognizeReceipt>> | null = null;
  if (recognitionMode() !== "off") {
    try {
      const result = await recognizeReceipt({ data: saved.data, mimeType: saved.record.mimeType });
      // Nur als "erkannt" werten, wenn tatsächlich etwas gefunden wurde
      if (result.amountGross !== null || result.vendor || result.date) extracted = result;
    } catch (e) {
      console.error("Belegerkennung fehlgeschlagen", e);
    }
  }
  const date = extracted?.date ? new Date(`${extracted.date}T12:00:00Z`) : null;
  await db.expense.create({
    data: {
      orderId: order.id,
      fileId: saved.record.id,
      category: extracted?.category ?? "OTHER",
      vendor: extracted?.vendor ?? null,
      date: date && !isNaN(date.getTime()) ? date : new Date(),
      amountGross: extracted?.amountGross ?? 0,
      vatRate: extracted?.vatRate ?? (extracted?.category === "PER_DIEM" ? 0 : 19),
      currency: extracted?.currency?.toUpperCase().slice(0, 3) ?? "EUR",
      description: extracted?.description ?? null,
      aiExtracted: Boolean(extracted),
    },
  });
  await logEvent(order.id, ctx, `Beleg hinzugefügt${extracted?.vendor ? `: ${extracted.vendor}` : ""}`);
  revalidatePath(`/orders/${order.id}`, "layout");
  return { recognized: Boolean(extracted) };
}

export async function addExpense(formData: FormData) {
  const { ctx, order } = await orderFor(String(formData.get("orderId")));
  const category = String(formData.get("category") ?? "OTHER");
  await db.expense.create({
    data: {
      orderId: order.id,
      category: EXPENSE_CATEGORY[category] ? category : "OTHER",
      description: str(formData.get("description")),
      amountGross: decimal(formData.get("amountGross")) ?? 0,
      vatRate: decimal(formData.get("vatRate")) ?? 0,
      date: new Date(),
    },
  });
  await logEvent(order.id, ctx, "Ausgabe ohne Beleg hinzugefügt");
  revalidatePath(`/orders/${order.id}`, "layout");
}

export async function updateExpense(formData: FormData) {
  const { order } = await orderFor(String(formData.get("orderId")));
  const category = String(formData.get("category"));
  const dateStr = str(formData.get("date"));
  await db.expense.updateMany({
    where: { id: String(formData.get("expenseId")), orderId: order.id },
    data: {
      category: EXPENSE_CATEGORY[category] ? category : "OTHER",
      vendor: str(formData.get("vendor")),
      description: str(formData.get("description")),
      date: dateStr ? new Date(`${dateStr}T12:00:00Z`) : null,
      amountGross: decimal(formData.get("amountGross")) ?? 0,
      vatRate: decimal(formData.get("vatRate")) ?? 0,
      currency: (str(formData.get("currency")) ?? "EUR").toUpperCase().slice(0, 3),
      rebillable: formData.get("rebillable") === "on",
    },
  });
  revalidatePath(`/orders/${order.id}/expenses`);
}

export async function deleteExpense(formData: FormData) {
  const { ctx, order } = await orderFor(String(formData.get("orderId")));
  const expense = await db.expense.findFirst({ where: { id: String(formData.get("expenseId")), orderId: order.id } });
  if (!expense) return;
  await db.expense.delete({ where: { id: expense.id } });
  if (expense.fileId) await deleteFile(ctx.orgId, expense.fileId);
  revalidatePath(`/orders/${order.id}`, "layout");
}
