"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { deleteFile, saveUpload } from "@/lib/files";
import { recognitionMode, recognizeReceipt } from "@/lib/recognition";
import { decimal, fromDateTimeLocal, str, toNumber } from "@/lib/format";
import { EXPENSE_CATEGORY, TRAVEL_CATEGORIES } from "@/lib/labels";
import { expenseLock, lockMessage } from "@/lib/expense-lock";
import { perDiem } from "@/lib/per-diem";
import { logEvent } from "../../actions";
import { isDriver } from "@/lib/permissions";
import { orderWhere } from "@/lib/permissions";

async function orderFor(orderId: string, opts: { write?: boolean } = { write: true }) {
  const ctx = await requireCtx();
  const order = await db.order.findFirst({ where: orderWhere(ctx, { id: orderId }) });
  if (!order) throw new Error("Auftrag nicht gefunden");
  const lock = await expenseLock(order.id);
  if (opts.write && lock.locked) throw new Error(lockMessage(lock));
  return { ctx, order, lock };
}

/** Fahrtkosten (Bahn, Taxi …) sind bei pauschal abgerechneter Rückreise bereits abgegolten. */
function defaultRebillable(order: { returnType: string }, category: string) {
  return !(TRAVEL_CATEGORIES.includes(category) && (order.returnType === "FLAT" || order.returnType === "PER_KM"));
}

/** Beleg hochladen und automatisch auslesen (KI oder lokale OCR). */
export async function uploadReceipt(formData: FormData): Promise<{ error?: string; recognized?: boolean }> {
  let found;
  try {
    found = await orderFor(String(formData.get("orderId")));
  } catch (e) {
    return { error: (e as Error).message };
  }
  const { ctx, order } = found;
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
      rebillable: defaultRebillable(order, extracted?.category ?? "OTHER"),
      // Beleg vom Fahrer hochgeladen → vorgestreckt, wird über die Fahrer-Abrechnung erstattet
      reimburse: ctx.org.moduleDriverPay && isDriver(ctx.role),
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
  const raw = String(formData.get("category") ?? "OTHER");
  const category = EXPENSE_CATEGORY[raw] ? raw : "OTHER";
  await db.expense.create({
    data: {
      orderId: order.id,
      category,
      rebillable: defaultRebillable(order, category),
      reimburse: ctx.org.moduleDriverPay && (isDriver(ctx.role) || category === "PER_DIEM"),
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
  // Bereits mit dem Fahrer abgerechnete Belege bleiben unverändert
  await db.expense.updateMany({
    where: { id: String(formData.get("expenseId")), orderId: order.id, settlementId: null },
    data: {
      category: EXPENSE_CATEGORY[category] ? category : "OTHER",
      vendor: str(formData.get("vendor")),
      description: str(formData.get("description")),
      date: dateStr ? new Date(`${dateStr}T12:00:00Z`) : null,
      amountGross: decimal(formData.get("amountGross")) ?? 0,
      vatRate: decimal(formData.get("vatRate")) ?? 0,
      currency: (str(formData.get("currency")) ?? "EUR").toUpperCase().slice(0, 3),
      rebillable: formData.get("rebillable") === "on",
      ...(formData.has("reimburseShown") ? { reimburse: formData.get("reimburse") === "on" } : {}),
    },
  });
  revalidatePath(`/orders/${order.id}/expenses`);
}

export async function deleteExpense(formData: FormData) {
  const { ctx, order, lock } = await orderFor(String(formData.get("orderId")));
  const expense = await db.expense.findFirst({ where: { id: String(formData.get("expenseId")), orderId: order.id } });
  if (!expense) return;
  if (expense.settlementId) throw new Error("Dieser Beleg ist Teil einer Fahrer-Abrechnung.");
  // Einmal abgerechnete Belege bleiben archiviert (Aufbewahrungspflicht)
  if (lock.archived && expense.fileId) throw new Error("Dieser Beleg war bereits Teil einer Rechnung und muss aufbewahrt werden.");
  await db.expense.delete({ where: { id: expense.id } });
  if (expense.fileId) await deleteFile(ctx.orgId, expense.fileId);
  revalidatePath(`/orders/${order.id}`, "layout");
}

/** Verpflegungspauschale aus Abwesenheitszeit berechnen und als Ausgabe übernehmen. */
export async function addPerDiem(formData: FormData) {
  const { ctx, order } = await orderFor(String(formData.get("orderId")));
  const start = fromDateTimeLocal(str(formData.get("start")));
  const end = fromDateTimeLocal(str(formData.get("end")));
  if (!start || !end || end <= start) throw new Error("Bitte gültige Abwesenheitszeiten angeben.");
  const result = perDiem(start, end, toNumber(ctx.org.perDiemPartial), toNumber(ctx.org.perDiemFull), formData.get("overnight") === "on");
  if (result.total <= 0) throw new Error("Für diese Abwesenheit fällt keine Verpflegungspauschale an (8 Stunden oder weniger).");
  await db.expense.create({
    data: {
      orderId: order.id,
      category: "PER_DIEM",
      description: `Verpflegungspauschale – ${result.lines.map((l) => l.label).join("; ")}`,
      amountGross: result.total,
      vatRate: 0,
      date: end,
      rebillable: formData.get("rebillable") === "on",
      reimburse: ctx.org.moduleDriverPay,
    },
  });
  await logEvent(order.id, ctx, `Verpflegungspauschale übernommen (${result.total.toFixed(2).replace(".", ",")} €)`);
  revalidatePath(`/orders/${order.id}`, "layout");
}
