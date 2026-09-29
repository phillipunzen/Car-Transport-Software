import type { Customer, Invoice, Order, Organization, Protocol } from "@prisma/client";
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
}: {
  org: Organization;
  order: Order | null;
  customer: Customer;
  protocols: Pick<Protocol, "type" | "completedAt">[];
  invoice: Pick<Invoice, "id" | "number" | "status" | "grossTotal" | "dueDate"> | null;
  focus: "protocols" | "invoice";
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
  if (invoice) {
    docs.push({
      key: "INVOICE",
      label: invoice.number ? `Rechnung ${invoice.number}` : "Rechnung",
      available: Boolean(invoiceIssued),
      hint: invoice.status === "DRAFT" ? "noch nicht festgeschrieben" : "storniert",
      checked: focus === "invoice",
      downloadUrl: `/api/invoices/${invoice.id}/pdf`,
    });
  }

  const ref = order ? `Auftrag ${orderNo(order.number)}${order.reference ? ` / Ihre Referenz ${order.reference}` : ""}` : "";
  let subject: string;
  let body: string;
  if (focus === "invoice" && invoice) {
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
    mailEnabled: mailEnabled(),
  };
}
