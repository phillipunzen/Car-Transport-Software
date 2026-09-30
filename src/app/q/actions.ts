"use server";

import { db } from "@/lib/db";
import { appUrl, mailEnabled, sendMailWith } from "@/lib/mail";
import { validToken } from "@/lib/public";
import { createOrderFromQuote } from "@/lib/quote-order";
import { orderNo } from "@/lib/format";

export type QuoteResponseState = { error?: string; ok?: string } | undefined;

async function openQuote(token: string) {
  if (!validToken(token)) return null;
  const quote = await db.quote.findUnique({ where: { publicToken: token }, include: { organization: true, customer: true } });
  if (!quote || quote.status === "ACCEPTED" || quote.status === "DECLINED") return null;
  if (quote.validUntil && quote.validUntil.getTime() < Date.now() - 86400000) return null;
  return quote;
}

async function notifyOffice(org: { email: string | null }, subject: string, text: string) {
  if (!mailEnabled() || !org.email) return;
  try {
    await sendMailWith({ to: org.email, subject, text });
  } catch (e) {
    console.error("Benachrichtigung fehlgeschlagen", e);
  }
}

/** Kunde nimmt das Angebot online an → Auftrag wird angelegt, das Büro informiert. */
export async function acceptQuoteOnline(_: QuoteResponseState, formData: FormData): Promise<QuoteResponseState> {
  const quote = await openQuote(String(formData.get("token") ?? ""));
  if (!quote) return { error: "Dieses Angebot kann nicht mehr angenommen werden. Bitte kontaktieren Sie uns." };
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Bitte Ihren Namen angeben." };
  if (formData.get("confirm") !== "on") return { error: "Bitte die Beauftragung bestätigen." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  const order = await createOrderFromQuote(quote, {
    userId: null,
    userName: `${name} (online)`,
    event: `Angebot ${quote.number} online angenommen von ${name}${note ? ` – Hinweis: ${note}` : ""}`,
  });
  await db.quote.update({ where: { id: quote.id }, data: { respondedAt: new Date(), responseNote: `Angenommen von ${name}${note ? `\n${note}` : ""}` } });
  await notifyOffice(
    quote.organization,
    `Angebot ${quote.number} angenommen – Auftrag ${orderNo(order.number)}`,
    `${name} hat das Angebot ${quote.number} online angenommen.${note ? `\n\nHinweis des Kunden:\n${note}` : ""}\n\nAuftrag: ${appUrl()}/orders/${order.id}`,
  );
  return { ok: "Vielen Dank für Ihren Auftrag! Wir melden uns mit der Terminbestätigung." };
}

export async function declineQuoteOnline(_: QuoteResponseState, formData: FormData): Promise<QuoteResponseState> {
  const quote = await openQuote(String(formData.get("token") ?? ""));
  if (!quote) return { error: "Dieses Angebot ist nicht mehr offen." };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 2000);
  await db.quote.update({ where: { id: quote.id }, data: { status: "DECLINED", respondedAt: new Date(), responseNote: reason ? `Abgelehnt: ${reason}` : "Abgelehnt" } });
  await notifyOffice(quote.organization, `Angebot ${quote.number} abgelehnt`, `Das Angebot ${quote.number} wurde online abgelehnt.${reason ? `\n\nBegründung: ${reason}` : ""}\n\n${appUrl()}/quotes/${quote.id}`);
  return { ok: "Danke für Ihre Rückmeldung." };
}
