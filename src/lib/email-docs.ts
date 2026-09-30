import type { Customer, Dunning, Invoice, Order, Organization, Protocol } from "@prisma/client";
import { DUNNING_LEVEL } from "@/lib/dunning";
import { formatMoney, formatDate, orderNo } from "@/lib/format";
import { mailEnabled } from "@/lib/mail";
import type { EmailDoc } from "@/components/email-documents";

/**
 * Vorbelegung für den Dialog "Per E-Mail senden" (Empfänger, Betreff, Text, Anhänge).
 * `focus` bestimmt den Anlass: nach der Überführung (Protokolle) oder Rechnungsversand.
 */
export function emailDocumentsProps({
  org,
  order,
  customer,
  protocols,
  invoice,
  focus,
  dunning,
  dunningTotal,
  deliveryDamages = 0,
}: {
  org: Organization;
  order: Order | null;
  customer: Customer;
  protocols: Pick<Protocol, "type" | "completedAt">[];
  invoice: Pick<Invoice, "id" | "number" | "status" | "grossTotal" | "dueDate"> | null;
  focus: "protocols" | "invoice" | "dunning";
  dunning?: Dunning | null;
  dunningTotal?: number;
  /** Anzahl der bei der Übergabe erfassten Schäden → Schadensmeldung anbieten */
  deliveryDamages?: number;
}) {
  const done = (t: "PICKUP" | "DELIVERY") => protocols.some((p) => p.type === t && p.completedAt);
  const vehicle = order ? [order.make, order.model].filter(Boolean).join(" ") : "";
  const vehicleText = order ? `${vehicle || "Ihres Fahrzeugs"}${order.licensePlate ? ` (${order.licensePlate})` : ""}` : "";
  const company = org.companyName ?? org.name;
  const greeting = customer.type === "PRIVATE" || customer.lastName ? `Guten Tag ${[customer.firstName, customer.lastName].filter(Boolean).join(" ")}`.trim() : "Guten Tag";
  const invoiceIssued = invoice && invoice.status !== "DRAFT" && invoice.status !== "CANCELLED";

  const docs: EmailDoc[] = [];
  if (order) {
    docs.push(
      {
        key: "PICKUP",
        label: "Abholprotokoll",
        available: done("PICKUP"),
        hint: "noch nicht abgeschlossen",
        checked: focus === "protocols",
        downloadUrl: `/api/orders/${order.id}/protocol/pickup/pdf`,
      },
      {
        key: "DELIVERY",
        label: "Übergabeprotokoll",
        available: done("DELIVERY"),
        hint: "noch nicht abgeschlossen",
        checked: focus === "protocols",
        downloadUrl: `/api/orders/${order.id}/protocol/delivery/pdf`,
      },
    );
  }
  if (order && deliveryDamages > 0) {
    docs.push({
      key: "DAMAGE",
      label: `Schadensmeldung (${deliveryDamages} ${deliveryDamages === 1 ? "Schaden" : "Schäden"})`,
      available: true,
      checked: false,
      downloadUrl: `/api/orders/${order.id}/damage-report`,
    });
  }
  if (dunning) {
    docs.push({
      key: "DUNNING",
      label: DUNNING_LEVEL[dunning.level]?.label ?? "Mahnung",
      available: true,
      checked: true,
      downloadUrl: `/api/dunnings/${dunning.id}/pdf`,
    });
  }
  if (invoice) {
    docs.push({
      key: "INVOICE",
      label: invoice.number ? `Rechnung ${invoice.number}` : "Rechnung",
      available: Boolean(invoiceIssued),
      hint: invoice.status === "DRAFT" ? "noch nicht festgeschrieben" : "storniert",
      checked: focus === "invoice" || focus === "dunning",
      downloadUrl: `/api/invoices/${invoice.id}/pdf`,
    });
    docs.push({
      key: "XRECHNUNG",
      label: "E-Rechnung als XML (XRechnung)",
      available: Boolean(invoiceIssued),
      hint: invoice.status === "DRAFT" ? "noch nicht festgeschrieben" : "storniert",
      // Behörden (Leitweg-ID) erwarten die reine XML-Datei; sonst reicht das PDF mit eingebetteter E-Rechnung
      checked: focus === "invoice" && Boolean(customer.buyerReference),
      downloadUrl: `/api/invoices/${invoice.id}/xml`,
    });
  }

  const ref = order ? `Auftrag ${orderNo(order.number)}${order.reference ? ` / Ihre Referenz ${order.reference}` : ""}` : "";
  let subject: string;
  let body: string;
  if (focus === "dunning" && dunning && invoice) {
    const label = DUNNING_LEVEL[dunning.level]?.label ?? "Mahnung";
    subject = `${label} zur Rechnung ${invoice.number}`;
    body = `${greeting},

anbei erhalten Sie unsere ${label} zur Rechnung ${invoice.number}. Bitte überweisen Sie den offenen Betrag${dunningTotal ? ` von ${formatMoney(dunningTotal)}` : ""} bis zum ${formatDate(dunning.dueDate)}.
Zur Übersicht haben wir die Rechnung noch einmal beigefügt.

Sollten Sie die Zahlung bereits veranlasst haben, betrachten Sie diese E-Mail bitte als gegenstandslos.

Mit freundlichen Grüßen
${company}`;
  } else if (focus === "invoice" && invoice) {
    subject = `Rechnung ${invoice.number ?? ""}${order ? ` – ${vehicleText}` : ""}`.trim();
    body = `${greeting},

anbei erhalten Sie unsere Rechnung ${invoice.number ?? ""} über ${formatMoney(invoice.grossTotal)}${invoice.dueDate ? `, zahlbar bis ${formatDate(invoice.dueDate)}` : ""}.${order ? `\n\nBetreff: Überführung ${vehicleText}, ${ref}.` : ""}

Vielen Dank für Ihren Auftrag!

Mit freundlichen Grüßen
${company}`;
  } else {
    const both = done("PICKUP") && done("DELIVERY");
    subject = `${both ? "Übergabeprotokolle" : "Protokoll"} – Überführung ${vehicleText}`.trim();
    body = `${greeting},

anbei erhalten Sie ${both ? "das Abhol- und das Übergabeprotokoll" : "das Protokoll"} zur Überführung ${vehicleText}${ref ? `, ${ref}` : ""}.
Die Protokolle enthalten den dokumentierten Fahrzeugzustand inkl. Fotos und Unterschriften.

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
${company}`;
  }

  return {
    orderId: order?.id ?? null,
    invoiceId: invoice?.id ?? null,
    to: customer.email ?? "",
    subject,
    message: body,
    docs,
    refs: dunning ? { dunningId: dunning.id } : undefined,
    mailEnabled: mailEnabled(),
  };
}
