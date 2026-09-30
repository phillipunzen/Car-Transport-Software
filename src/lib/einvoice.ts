import type { Customer, Invoice, InvoiceItem, Order, Organization } from "@prisma/client";
import { customerName, customerNo, toNumber } from "@/lib/format";
import { computeTotals, lineTotal } from "@/lib/invoice";

/**
 * E-Rechnung im Format UN/CEFACT CII nach EN 16931 (XRechnung 3.0, CII-Syntax).
 * Dieselbe XML-Datei wird auch als factur-x.xml in das PDF eingebettet (ZUGFeRD/Factur-X).
 */

type Full = Invoice & { items: InvoiceItem[]; customer: Customer; order: Order | null };

const XRECHNUNG_ID = "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Steuerzeichen sind in XML 1.0 nicht erlaubt
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const amt = (n: number) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
const qty = (n: number) => String(Math.round(n * 10000) / 10000);
const date102 = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }).replace(/-/g, "");
const el = (tag: string, value: string | null | undefined, attrs = "") => (value ? `<${tag}${attrs}>${esc(value)}</${tag}>` : "");

const COUNTRIES: Record<string, string> = {
  deutschland: "DE",
  germany: "DE",
  österreich: "AT",
  oesterreich: "AT",
  austria: "AT",
  schweiz: "CH",
  switzerland: "CH",
  niederlande: "NL",
  belgien: "BE",
  luxemburg: "LU",
  frankreich: "FR",
  italien: "IT",
  spanien: "ES",
  polen: "PL",
  tschechien: "CZ",
  dänemark: "DK",
};
export function countryCode(country: string | null | undefined) {
  const c = (country ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(c)) return c.toUpperCase();
  return COUNTRIES[c.toLowerCase()] ?? "DE";
}

/** Einheiten nach UN/ECE Rec. 20 */
export function unitCode(unit: string) {
  const u = unit.trim().toLowerCase().replace(/\.$/, "");
  if (u === "km") return "KMT";
  if (["pausch", "pauschale", "psch", "ls"].includes(u)) return "LS";
  if (["std", "h", "stunde", "stunden"].includes(u)) return "HUR";
  if (["tag", "tage", "d"].includes(u)) return "DAY";
  if (["l", "liter"].includes(u)) return "LTR";
  if (["kwh"].includes(u)) return "KWH";
  return "H87"; // Stück
}

/** Fehlende Angaben, ohne die Empfänger (v. a. Behörden) die E-Rechnung ablehnen würden. */
export function einvoiceIssues(org: Organization, invoice: Pick<Full, "customer" | "buyerReference">) {
  const issues: string[] = [];
  if (!org.street || !org.zip || !org.city) issues.push("Firmenanschrift (Einstellungen)");
  if (!org.email) issues.push("Firmen-E-Mail (Einstellungen)");
  if (!org.phone) issues.push("Firmen-Telefon (Einstellungen)");
  if (!org.vatId && !org.taxNumber) issues.push("USt-IdNr. oder Steuernummer (Einstellungen)");
  if (!org.iban) issues.push("IBAN (Einstellungen)");
  if (!invoice.customer.email) issues.push("E-Mail-Adresse des Kunden");
  if (!invoice.customer.city || !invoice.customer.zip) issues.push("Anschrift des Kunden");
  return issues;
}

function address(a: { street: string | null; zip: string | null; city: string | null; country: string | null }) {
  return `<ram:PostalTradeAddress>${el("ram:PostcodeCode", a.zip)}${el("ram:LineOne", a.street)}${el("ram:CityName", a.city)}<ram:CountryID>${countryCode(a.country)}</ram:CountryID></ram:PostalTradeAddress>`;
}

export function buildEInvoiceXml(org: Organization, invoice: Full) {
  const credit = Boolean(invoice.correctsNumber) || toNumber(invoice.grossTotal) < 0;
  // Stornorechnungen (381) werden mit positiven Beträgen übertragen, das Vorzeichen ergibt sich aus der Art
  const sign = credit ? -1 : 1;
  const items = [...invoice.items]
    .sort((a, b) => a.position - b.position)
    .map((i) => ({
      position: i.position,
      description: i.description,
      unit: i.unit,
      quantity: sign * toNumber(i.quantity),
      unitPrice: toNumber(i.unitPrice),
      vatRate: invoice.smallBusiness ? 0 : toNumber(i.vatRate),
    }));
  const totals = computeTotals(items, invoice.smallBusiness);
  const issueDate = invoice.issueDate ?? new Date();
  const sellerName = org.companyName || org.name;

  const category = (rate: number) => (invoice.smallBusiness ? "E" : rate > 0 ? "S" : "Z");
  const exemption = invoice.smallBusiness ? "Kein Ausweis von Umsatzsteuer, da Kleinunternehmer gemäß § 19 UStG" : null;

  // Steuergruppen inkl. 0 %
  const groups = new Map<number, number>();
  for (const i of items) groups.set(i.vatRate, (groups.get(i.vatRate) ?? 0) + lineTotal(i));
  const taxes = [...groups.entries()].map(([rate, base]) => ({
    rate,
    base,
    amount: totals.vat.find((v) => v.rate === rate)?.amount ?? 0,
  }));

  const lines = items
    .map((i) => {
      const [name, ...rest] = i.description.split("\n");
      return `<ram:IncludedSupplyChainTradeLineItem>
<ram:AssociatedDocumentLineDocument><ram:LineID>${i.position}</ram:LineID></ram:AssociatedDocumentLineDocument>
<ram:SpecifiedTradeProduct>${el("ram:Name", name.slice(0, 200) || "Leistung")}${el("ram:Description", rest.join("\n"))}</ram:SpecifiedTradeProduct>
<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${amt(i.unitPrice)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${unitCode(i.unit)}">${qty(i.quantity)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
<ram:SpecifiedLineTradeSettlement>
<ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${category(i.vatRate)}</ram:CategoryCode><ram:RateApplicablePercent>${amt(i.vatRate)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amt(lineTotal(i))}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
</ram:SpecifiedLineTradeSettlement>
</ram:IncludedSupplyChainTradeLineItem>`;
    })
    .join("\n");

  const taxXml = taxes
    .map(
      (t) =>
        `<ram:ApplicableTradeTax><ram:CalculatedAmount>${amt(t.amount)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>${el("ram:ExemptionReason", exemption)}<ram:BasisAmount>${amt(t.base)}</ram:BasisAmount><ram:CategoryCode>${category(t.rate)}</ram:CategoryCode>${invoice.smallBusiness ? "<ram:ExemptionReasonCode>VATEX-EU-O</ram:ExemptionReasonCode>" : ""}<ram:RateApplicablePercent>${amt(t.rate)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`,
    )
    .join("\n");

  // Zahlungsbedingungen inkl. Skonto im XRechnung-Format (#SKONTO#TAGE=..#PROZENT=..#)
  const termParts: string[] = [];
  if (invoice.dueDate && !credit) termParts.push(`Zahlbar bis ${invoice.dueDate.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} ohne Abzug.`);
  if (credit) termParts.push(`Gutschrift zur Rechnung ${invoice.correctsNumber ?? ""}.`.replace(" .", "."));
  let terms = termParts.join(" ");
  const discount = toNumber(invoice.discountPercent);
  if (discount > 0 && invoice.discountDays && !credit) terms += `\n#SKONTO#TAGE=${invoice.discountDays}#PROZENT=${amt(discount)}#\n`;

  const buyer = invoice.customer;
  const buyerName = customerName(buyer);
  const buyerRef = invoice.buyerReference || invoice.order?.reference || customerNo(buyer.number);
  const contactName = org.ownerName || sellerName;
  const notes = [invoice.introText, invoice.smallBusiness ? exemption : null, invoice.footerText].filter(Boolean) as string[];

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
<rsm:ExchangedDocumentContext>
<ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>
<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${XRECHNUNG_ID}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
</rsm:ExchangedDocumentContext>
<rsm:ExchangedDocument>
<ram:ID>${esc(invoice.number ?? "ENTWURF")}</ram:ID>
<ram:TypeCode>${credit ? "381" : "380"}</ram:TypeCode>
<ram:IssueDateTime><udt:DateTimeString format="102">${date102(issueDate)}</udt:DateTimeString></ram:IssueDateTime>
${notes.map((n) => `<ram:IncludedNote><ram:Content>${esc(n)}</ram:Content></ram:IncludedNote>`).join("\n")}
</rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction>
${lines}
<ram:ApplicableHeaderTradeAgreement>
<ram:BuyerReference>${esc(buyerRef)}</ram:BuyerReference>
<ram:SellerTradeParty>
<ram:Name>${esc(sellerName)}</ram:Name>
<ram:DefinedTradeContact><ram:PersonName>${esc(contactName)}</ram:PersonName>${org.phone ? `<ram:TelephoneUniversalCommunication><ram:CompleteNumber>${esc(org.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>` : ""}${org.email ? `<ram:EmailURIUniversalCommunication><ram:URIID>${esc(org.email)}</ram:URIID></ram:EmailURIUniversalCommunication>` : ""}</ram:DefinedTradeContact>
${address(org)}
${org.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(org.email)}</ram:URIID></ram:URIUniversalCommunication>` : ""}
${org.vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(org.vatId.replace(/\s/g, ""))}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}
${org.taxNumber ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(org.taxNumber)}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}
</ram:SellerTradeParty>
<ram:BuyerTradeParty>
${el("ram:ID", customerNo(buyer.number))}
<ram:Name>${esc(buyerName)}</ram:Name>
${address(buyer)}
${buyer.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(buyer.email)}</ram:URIID></ram:URIUniversalCommunication>` : ""}
${buyer.vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(buyer.vatId.replace(/\s/g, ""))}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}
</ram:BuyerTradeParty>
${invoice.order?.reference ? `<ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>${esc(invoice.order.reference)}</ram:IssuerAssignedID></ram:BuyerOrderReferencedDocument>` : ""}
</ram:ApplicableHeaderTradeAgreement>
<ram:ApplicableHeaderTradeDelivery>
<ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${date102(invoice.serviceDate ?? issueDate)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>
</ram:ApplicableHeaderTradeDelivery>
<ram:ApplicableHeaderTradeSettlement>
${invoice.number ? `<ram:PaymentReference>${esc(invoice.number)}</ram:PaymentReference>` : ""}
<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
${
  org.iban
    ? `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(org.iban.replace(/\s/g, ""))}</ram:IBANID>${el("ram:AccountName", org.accountHolder || sellerName)}</ram:PayeePartyCreditorFinancialAccount>${org.bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${esc(org.bic.replace(/\s/g, ""))}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>` : ""}</ram:SpecifiedTradeSettlementPaymentMeans>`
    : `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>1</ram:TypeCode></ram:SpecifiedTradeSettlementPaymentMeans>`
}
${taxXml}
${terms || (invoice.dueDate && !credit) ? `<ram:SpecifiedTradePaymentTerms>${el("ram:Description", terms)}${invoice.dueDate && !credit ? `<ram:DueDateDateTime><udt:DateTimeString format="102">${date102(invoice.dueDate)}</udt:DateTimeString></ram:DueDateDateTime>` : ""}</ram:SpecifiedTradePaymentTerms>` : ""}
<ram:SpecifiedTradeSettlementHeaderMonetarySummation>
<ram:LineTotalAmount>${amt(totals.net)}</ram:LineTotalAmount>
<ram:TaxBasisTotalAmount>${amt(totals.net)}</ram:TaxBasisTotalAmount>
<ram:TaxTotalAmount currencyID="EUR">${amt(totals.vatTotal)}</ram:TaxTotalAmount>
<ram:GrandTotalAmount>${amt(totals.gross)}</ram:GrandTotalAmount>
<ram:DuePayableAmount>${amt(totals.gross)}</ram:DuePayableAmount>
</ram:SpecifiedTradeSettlementHeaderMonetarySummation>
${invoice.correctsNumber ? `<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${esc(invoice.correctsNumber)}</ram:IssuerAssignedID></ram:InvoiceReferencedDocument>` : ""}
</ram:ApplicableHeaderTradeSettlement>
</rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`.replace(/\n{2,}/g, "\n");
}
