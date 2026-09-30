import { describe, expect, it } from "vitest";
import { matchTransaction, parseAmount, parseStatement } from "../src/lib/bank";

const sparkasse = `"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info"
"DE89370400440532013000";"03.10.26";"03.10.26";"GUTSCHR. UEBERWEISUNG";"RE-2026-0001 Danke";"Autohaus Nord AG";"DE11";"X";"1.305,60";"EUR";"Umsatz gebucht"
"DE89370400440532013000";"04.10.26";"04.10.26";"LASTSCHRIFT";"Tankstelle";"Aral";"DE22";"Y";"-89,90";"EUR";"Umsatz gebucht"
"DE89370400440532013000";"05.10.26";"05.10.26";"GUTSCHR. UEBERWEISUNG";"Ueberfuehrung Golf";"Leasing West GmbH";"DE33";"Z";"357,00";"EUR";"Umsatz gebucht"`;

const dkb = `"Kontonummer:";"DE12 3456";
"Zeitraum:";"01.10.2026 - 31.10.2026";

"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)"
"06.10.26";"06.10.26";"Gebucht";"Max Muster";"Firma";"Rechnung RE 2026 0002";"Eingang";"DE44";"250,00 €"`;

const camt = `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"><BkToCstmrStmt><Stmt>
<Ntry><Amt Ccy="EUR">1305.60</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-10-03</Dt></BookgDt><NtryDtls><TxDtls><RltdPties><Dbtr><Pty><Nm>Autohaus Nord AG</Nm></Pty></Dbtr></RltdPties><RmtInf><Ustrd>RE-2026-0001</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">20.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-10-04</Dt></BookgDt></Ntry>
</Stmt></BkToCstmrStmt></Document>`;

describe("Kontoauszug", () => {
  it("Beträge", () => {
    expect(parseAmount("1.305,60")).toBe(1305.6);
    expect(parseAmount("-89,90 €")).toBe(-89.9);
    expect(parseAmount("1,305.60")).toBe(1305.6);
  });
  it("Sparkasse-CSV: nur Eingänge", () => {
    const tx = parseStatement(sparkasse);
    expect(tx).toHaveLength(2);
    expect(tx[0]).toMatchObject({ amount: 1305.6, counterparty: "Autohaus Nord AG", purpose: "RE-2026-0001 Danke" });
    expect(tx[0].bookingDate.toISOString().slice(0, 10)).toBe("2026-10-03");
  });
  it("DKB-CSV mit Vorspann", () => {
    const tx = parseStatement(dkb);
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ amount: 250, purpose: "Rechnung RE 2026 0002" });
  });
  it("CAMT.053", () => {
    const tx = parseStatement(camt);
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ amount: 1305.6, counterparty: "Autohaus Nord AG", purpose: "RE-2026-0001" });
  });
  it("Zuordnung", () => {
    const open = [
      { id: "a", number: "RE-2026-0001", customerName: "Autohaus Nord AG", gross: 1305.6, payable: [1305.6, 1279.49] },
      { id: "b", number: "RE-2026-0002", customerName: "Max Muster", gross: 300, payable: [300] },
      { id: "c", number: "RE-2026-0003", customerName: "Leasing West GmbH", gross: 357, payable: [357] },
    ];
    expect(matchTransaction({ amount: 1305.6, counterparty: "x", purpose: "RE-2026-0001" }, open)).toMatchObject({ invoiceId: "a", confidence: "sicher" });
    expect(matchTransaction({ amount: 1279.49, counterparty: "x", purpose: "re 2026 0001 abzgl skonto" }, open)).toMatchObject({ invoiceId: "a", confidence: "sicher" });
    expect(matchTransaction({ amount: 250, counterparty: "Max", purpose: "Rechnung RE 2026 0002" }, open)).toMatchObject({ invoiceId: "b", confidence: "prüfen" });
    expect(matchTransaction({ amount: 357, counterparty: "LEASING WEST GMBH", purpose: "Golf" }, open)).toMatchObject({ invoiceId: "c", confidence: "wahrscheinlich" });
    expect(matchTransaction({ amount: 999, counterparty: "?", purpose: "?" }, open)).toBeNull();
  });
});
