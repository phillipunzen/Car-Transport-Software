import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { customerName, formatDateTime, orderNo } from "@/lib/format";
import { appUrl, mailEnabled, sendMailWith } from "@/lib/mail";
import { protocolPdf } from "@/lib/pdf/load";

export const trackingUrl = (token: string) => `${appUrl()}/t/${token}`;

/** Öffentlicher, nicht erratbarer Status-Link für den Kunden. */
export async function ensureTrackingToken(orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { trackingToken: true } });
  if (order.trackingToken) return order.trackingToken;
  const token = randomBytes(18).toString("base64url");
  await db.order.update({ where: { id: orderId }, data: { trackingToken: token } });
  return token;
}

/**
 * Automatische Kunden-Info bei Abholung/Zustellung (Einstellung „Kunden automatisch informieren“).
 * Fehler beim Versand brechen den Protokollabschluss nicht ab.
 */
export async function notifyCustomerStatus(orderId: string, type: "PICKUP" | "DELIVERY", userName: string) {
  try {
    const order = await db.order.findUnique({ where: { id: orderId }, include: { customer: true, organization: true } });
    if (!order || !order.organization.notifyCustomerOnStatus || !mailEnabled() || !order.customer.email) return;
    const org = order.organization;
    const token = await ensureTrackingToken(order.id);
    const vehicle = [order.make, order.model].filter(Boolean).join(" ") || "Ihr Fahrzeug";
    const plate = order.licensePlate ? ` (${order.licensePlate})` : "";
    const company = org.companyName ?? org.name;
    const c = order.customer;
    const greeting = c.lastName ? `Guten Tag ${[c.firstName, c.lastName].filter(Boolean).join(" ")}` : `Guten Tag`;
    const pickup = type === "PICKUP";
    const attachments = [];
    if (!pickup) {
      const doc = await protocolPdf(org.id, order.id, "DELIVERY");
      if (doc) attachments.push({ filename: doc.filename, content: doc.pdf, contentType: "application/pdf" });
    }
    const text = pickup
      ? `${greeting},

${vehicle}${plate} wurde soeben abgeholt und ist jetzt unterwegs nach ${order.deliveryCity ?? "zum Ziel"}.${order.deliveryDate ? `\nGeplante Zustellung: ${formatDateTime(order.deliveryDate)}` : ""}

Den aktuellen Stand sehen Sie jederzeit hier:
${trackingUrl(token)}

Mit freundlichen Grüßen
${company}`
      : `${greeting},

${vehicle}${plate} wurde in ${order.deliveryCity ?? "am Ziel"} übergeben. Das Übergabeprotokoll finden Sie im Anhang.

Status und Protokolle: ${trackingUrl(token)}

Vielen Dank für Ihren Auftrag!

Mit freundlichen Grüßen
${company}`;
    await sendMailWith({
      to: c.email!,
      subject: `${pickup ? "Abgeholt" : "Zugestellt"}: ${vehicle}${plate} – Auftrag ${orderNo(order.number)}`,
      text,
      fromName: company,
      replyTo: org.email ?? undefined,
      attachments,
    });
    await db.orderEvent.create({
      data: { orderId: order.id, userName, message: `Kunde automatisch informiert (${pickup ? "Abholung" : "Zustellung"}) an ${c.email} – ${customerName(c)}` },
    });
  } catch (e) {
    console.error("Kundenbenachrichtigung fehlgeschlagen", e);
  }
}

/**
 * Modul Bewertungen: nach der Zustellung eine kurze Zufriedenheitsabfrage senden (einmal pro Auftrag).
 * Die Sterne-Links öffnen nur die Seite – gespeichert wird erst nach dem Bestätigen (E-Mail-Scanner klicken Links sonst mit).
 */
export async function sendReviewRequest(orderId: string) {
  try {
    const order = await db.order.findUnique({ where: { id: orderId }, include: { customer: true, organization: true } });
    if (!order || order.feedbackToken || !order.organization.moduleReviews || !order.organization.reviewUrl || !mailEnabled() || !order.customer.email) return;
    const org = order.organization;
    const token = randomBytes(18).toString("base64url");
    await db.order.update({ where: { id: order.id }, data: { feedbackToken: token } });
    const company = org.companyName ?? org.name;
    const c = order.customer;
    const greeting = c.lastName ? `Guten Tag ${[c.firstName, c.lastName].filter(Boolean).join(" ")}` : "Guten Tag";
    const stars = [5, 4, 3, 2, 1].map((n) => `${"★".repeat(n)}${"☆".repeat(5 - n)}  ${appUrl()}/r/${token}?s=${n}`).join("\n");
    await sendMailWith({
      to: c.email!,
      subject: `Wie zufrieden waren Sie? – Überführung ${orderNo(order.number)}`,
      text: `${greeting},

Ihr Fahrzeug wurde übergeben. Wir würden uns sehr über eine kurze Rückmeldung freuen – ein Klick genügt:

${stars}

Vielen Dank!
${company}`,
      fromName: company,
      replyTo: org.email ?? undefined,
    });
  } catch (e) {
    console.error("Bewertungsanfrage fehlgeschlagen", e);
  }
}
