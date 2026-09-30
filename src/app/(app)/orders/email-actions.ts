"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { mailEnabled, sendMailWith } from "@/lib/mail";
import { dunningPdf, invoicePdf, invoiceXml, protocolPdf, quotePdf } from "@/lib/pdf/load";
import type { FormState } from "@/components/action-form";
import { logEvent } from "./actions";

const emailList = z
  .string()
  .trim()
  .transform((s) => s.split(/[,;\s]+/).filter(Boolean))
  .pipe(z.array(z.string().email("Bitte gültige E-Mail-Adresse(n) angeben.")));

/**
 * Sendet Protokolle und/oder Rechnung als PDF-Anhang per E-Mail an den Kunden.
 * Absendername ist die eigene Firma, Antworten gehen an die Firmen-E-Mail.
 */
export async function sendDocumentsEmail(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  if (!mailEnabled()) return { error: "Der E-Mail-Versand ist nicht eingerichtet (SMTP)." };

  const to = emailList.safeParse(String(formData.get("to") ?? ""));
  if (!to.success || to.data.length === 0) return { error: to.success ? "Bitte einen Empfänger angeben." : to.error.issues[0].message };
  const ccRaw = String(formData.get("cc") ?? "").trim();
  const cc = ccRaw ? emailList.safeParse(ccRaw) : null;
  if (cc && !cc.success) return { error: `CC: ${cc.error.issues[0].message}` };

  const subject = String(formData.get("subject") ?? "").trim();
  const text = String(formData.get("message") ?? "").trim();
  if (!subject) return { error: "Bitte einen Betreff angeben." };
  const docs = formData.getAll("docs").map(String);
  if (docs.length === 0) return { error: "Bitte mindestens ein Dokument auswählen." };

  const orderId = String(formData.get("orderId") ?? "") || null;
  const invoiceId = String(formData.get("invoiceId") ?? "") || null;
  if (orderId && !(await db.order.findFirst({ where: { id: orderId, organizationId: ctx.orgId } }))) return { error: "Auftrag nicht gefunden." };

  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
  const names: string[] = [];
  for (const doc of docs) {
    let result: { pdf: Buffer; filename: string; contentType?: string } | null = null;
    if ((doc === "PICKUP" || doc === "DELIVERY") && orderId) {
      const protocol = await db.protocol.findUnique({ where: { orderId_type: { orderId, type: doc } } });
      if (!protocol?.completedAt) return { error: `Das ${doc === "PICKUP" ? "Abholprotokoll" : "Übergabeprotokoll"} ist noch nicht abgeschlossen.` };
      result = await protocolPdf(ctx.orgId, orderId, doc);
      names.push(doc === "PICKUP" ? "Abholprotokoll" : "Übergabeprotokoll");
    } else if (doc === "INVOICE" && invoiceId) {
      const inv = await db.invoice.findFirst({ where: { id: invoiceId, organizationId: ctx.orgId } });
      if (!inv || inv.status === "DRAFT") return { error: "Nur festgeschriebene Rechnungen können versendet werden." };
      result = await invoicePdf(ctx.orgId, invoiceId);
      names.push(`Rechnung ${inv.number}`);
    } else if (doc === "XRECHNUNG" && invoiceId) {
      const x = await invoiceXml(ctx.orgId, invoiceId);
      if (!x) return { error: "Die E-Rechnung gibt es erst nach dem Festschreiben." };
      result = { pdf: Buffer.from(x.xml, "utf8"), filename: x.filename, contentType: "application/xml" };
      names.push("E-Rechnung (XML)");
    } else if (doc === "DUNNING") {
      const dunningId = String(formData.get("dunningId") ?? "");
      result = dunningId ? await dunningPdf(ctx.orgId, dunningId) : null;
      if (!result) return { error: "Mahnung nicht gefunden." };
      names.push(result.filename.replace(/_/g, " ").replace(/\.pdf$/, ""));
    } else if (doc === "QUOTE") {
      const quoteId = String(formData.get("quoteId") ?? "");
      result = quoteId ? await quotePdf(ctx.orgId, quoteId) : null;
      if (!result) return { error: "Angebot nicht gefunden." };
      names.push(result.filename.replace(/_/g, " ").replace(/\.pdf$/, ""));
    }
    if (result) attachments.push({ filename: result.filename, content: result.pdf, contentType: result.contentType ?? "application/pdf" });
  }
  if (attachments.length === 0) return { error: "Keine Dokumente zum Versenden gefunden." };

  try {
    await sendMailWith({
      to: to.data.join(", "),
      cc: cc?.success ? cc.data.join(", ") : undefined,
      subject,
      text,
      fromName: ctx.org.companyName ?? ctx.org.name,
      replyTo: ctx.org.email ?? undefined,
      attachments,
    });
  } catch (e) {
    console.error("E-Mail-Versand fehlgeschlagen", e);
    return { error: "Die E-Mail konnte nicht gesendet werden. Bitte SMTP-Einstellungen prüfen." };
  }

  // Angebot versendet: Status automatisch auf "Versendet"
  const quoteId = String(formData.get("quoteId") ?? "");
  if (docs.includes("QUOTE") && quoteId) {
    await db.quote.updateMany({ where: { id: quoteId, organizationId: ctx.orgId, status: "DRAFT" }, data: { status: "SENT" } });
    revalidatePath(`/quotes/${quoteId}`);
  }

  const logOrderId = orderId ?? (invoiceId ? (await db.invoice.findUnique({ where: { id: invoiceId } }))?.orderId : null);
  if (logOrderId) {
    await logEvent(logOrderId, ctx, `${names.join(", ")} per E-Mail gesendet an ${to.data.join(", ")}`);
    revalidatePath(`/orders/${logOrderId}`, "layout");
  }
  return { ok: `E-Mail mit ${names.join(", ")} an ${to.data.join(", ")} gesendet.` };
}
