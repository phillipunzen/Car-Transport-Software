"use server";

import { db } from "@/lib/db";
import { appUrl, mailEnabled, sendMailWith } from "@/lib/mail";
import { validToken } from "@/lib/public";
import { customerName, orderNo } from "@/lib/format";

export type ReviewState = { rating?: number; saved?: boolean; commentSaved?: boolean; error?: string } | undefined;

export async function submitRating(_: ReviewState, formData: FormData): Promise<ReviewState> {
  const token = String(formData.get("token") ?? "");
  const rating = Number(formData.get("rating"));
  if (!validToken(token) || !(rating >= 1 && rating <= 5)) return { error: "Ungültige Bewertung." };
  const order = await db.order.findUnique({ where: { feedbackToken: token } });
  if (!order) return { error: "Der Link ist nicht mehr gültig." };
  if (!order.feedbackRating) await db.order.update({ where: { id: order.id }, data: { feedbackRating: Math.round(rating), feedbackAt: new Date() } });
  return { rating: order.feedbackRating ?? Math.round(rating), saved: true };
}

export async function submitComment(state: ReviewState, formData: FormData): Promise<ReviewState> {
  const token = String(formData.get("token") ?? "");
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 3000);
  if (!validToken(token) || !comment) return { ...state, error: "Bitte ein paar Worte eingeben." };
  const order = await db.order.findUnique({ where: { feedbackToken: token }, include: { organization: true, customer: true } });
  if (!order) return { error: "Der Link ist nicht mehr gültig." };
  await db.order.update({ where: { id: order.id }, data: { feedbackComment: comment } });
  if (mailEnabled() && order.organization.email) {
    try {
      await sendMailWith({
        to: order.organization.email,
        subject: `Kundenrückmeldung zu ${orderNo(order.number)} (${order.feedbackRating ?? "?"}/5)`,
        text: `${customerName(order.customer)} schreibt:\n\n${comment}\n\n${appUrl()}/orders/${order.id}`,
      });
    } catch (e) {
      console.error("Rückmeldung konnte nicht gemeldet werden", e);
    }
  }
  return { ...state, commentSaved: true, error: undefined };
}
