import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { buildEInvoiceXml, countryCode, unitCode } from "../src/lib/einvoice";

const D = (n: number) => new Prisma.Decimal(n);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const org: any = { name: "T", companyName: "Muster & Söhne GmbH", ownerName: "Max", street: "Str. 1", zip: "10115", city: "Berlin", country: "Deutschland", phone: "030", email: "a@b.de", vatId: "DE123456789", taxNumber: null, iban: "DE89370400440532013000", bic: null, accountHolder: null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const base: any = {
  number: "RE-1", status: "ISSUED", issueDate: new Date("2026-09-30T10:00:00Z"), dueDate: new Date("2026-10-14T10:00:00Z"), serviceDate: null,
  smallBusiness: false, introText: null, footerText: null, discountPercent: D(2), discountDays: 7, buyerReference: null, correctsNumber: null, grossTotal: D(119),
  customer: { number: 1, companyName: "Kunde AG", street: "Weg 2", zip: "80331", city: "München", country: "Österreich", email: "k@x.de" }, order: null,
  items: [{ position: 1, description: "Überführung\nBerlin → München", quantity: D(1), unit: "Pausch.", unitPrice: D(100), vatRate: D(19) }],
};

describe("E-Rechnung (CII)", () => {
  it("erzeugt Rechnung mit Summen, Skonto und escaped Text", () => {
    const xml = buildEInvoiceXml(org, base);
    expect(xml).toContain("<ram:TypeCode>380</ram:TypeCode>");
    expect(xml).toContain("<ram:GrandTotalAmount>119.00</ram:GrandTotalAmount>");
    expect(xml).toContain("<ram:TaxTotalAmount currencyID=\"EUR\">19.00</ram:TaxTotalAmount>");
    expect(xml).toContain("#SKONTO#TAGE=7#PROZENT=2.00#");
    expect(xml).toContain("Muster &amp; Söhne GmbH");
    expect(xml).toContain('unitCode="LS"');
    expect(xml).toContain("<ram:CountryID>AT</ram:CountryID>");
    expect(xml).toContain("<ram:BuyerReference>K-00001</ram:BuyerReference>");
  });
  it("Stornorechnung: Typ 381, positive Beträge, Bezug auf Originalrechnung", () => {
    const xml = buildEInvoiceXml(org, { ...base, correctsNumber: "RE-0", grossTotal: D(-119), items: [{ ...base.items[0], quantity: D(-1) }] });
    expect(xml).toContain("<ram:TypeCode>381</ram:TypeCode>");
    expect(xml).toContain("<ram:GrandTotalAmount>119.00</ram:GrandTotalAmount>");
    expect(xml).toContain("<ram:IssuerAssignedID>RE-0</ram:IssuerAssignedID>");
    expect(xml).not.toContain("SKONTO");
  });
  it("Kleinunternehmer: Kategorie E mit Befreiungsgrund", () => {
    const xml = buildEInvoiceXml(org, { ...base, smallBusiness: true });
    expect(xml).toContain("<ram:CategoryCode>E</ram:CategoryCode>");
    expect(xml).toContain("§ 19 UStG");
    expect(xml).toContain("<ram:TaxTotalAmount currencyID=\"EUR\">0.00</ram:TaxTotalAmount>");
  });
  it("Einheiten und Länder", () => {
    expect(unitCode("km")).toBe("KMT");
    expect(unitCode("Stk.")).toBe("H87");
    expect(countryCode("de")).toBe("DE");
    expect(countryCode(null)).toBe("DE");
  });
});
