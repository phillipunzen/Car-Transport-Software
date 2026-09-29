import { describe, expect, it } from "vitest";
import { findPlate, findVin, makeFromVin, parseReceiptText, parseVehicleText, vinCheckDigitValid } from "../src/lib/ocr-parse";

describe("FIN", () => {
  it("findet eine FIN und korrigiert OCR-Verwechslungen", () => {
    expect(findVin("Fahrzeug-Ident.-Nr.\nWVWZZZ1KZAW0OOOO1")).toBe("WVWZZZ1KZAW000001");
    expect(findVin("E  WBA 8E9 C5 1 GK 123456")).toBe("WBA8E9C51GK123456");
  });
  it("ignoriert Text ohne FIN", () => {
    expect(findVin("Hauptstraße 12, 20095 Hamburg")).toBeNull();
  });
  it("prüft die Prüfziffer", () => {
    expect(vinCheckDigitValid("1M8GDM9AXKP042788")).toBe(true);
    expect(vinCheckDigitValid("1M8GDM9A1KP042788")).toBe(false);
  });
  it("leitet die Marke aus der FIN ab", () => {
    expect(makeFromVin("WVWZZZ1KZAW000001")).toBe("Volkswagen");
    expect(makeFromVin("WBA8E9C51GK123456")).toBe("BMW");
    expect(makeFromVin("5YJ3E7EB0KF123456")).toBe("Tesla");
  });
});

describe("Kennzeichen", () => {
  it("erkennt deutsche Kennzeichen in verschiedenen Schreibweisen", () => {
    expect(findPlate("M AB 1234")).toBe("M-AB 1234");
    expect(findPlate("xx\nHH-X 12E")).toBe("HH-X 12E");
    expect(findPlate("B-MW 7")).toBe("B-MW 7");
  });
});

describe("Fahrzeugschein", () => {
  const text = `ZULASSUNGSBESCHEINIGUNG TEIL I
A M-AB 1234
B 15.03.2019
D.1 VOLKSWAGEN
D.3 GOLF VARIANT
E WVWZZZAUZKP012345
R GRAU`;
  it("liest die Felder aus", () => {
    const v = parseVehicleText(text);
    expect(v.licensePlate).toBe("M-AB 1234");
    expect(v.firstRegistration).toBe("15.03.2019");
    expect(v.make).toBe("Volkswagen");
    expect(v.model).toBe("GOLF VARIANT");
    expect(v.vin).toBe("WVWZZZAUZKP012345");
    expect(v.color).toBe("GRAU");
  });
  it("nutzt die FIN für die Marke, wenn nur die FIN fotografiert wurde", () => {
    const v = parseVehicleText("WBA8E9C51GK123456");
    expect(v.make).toBe("BMW");
    expect(v.model).toBeNull();
  });
});

describe("Belege", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  it("Bahnticket", () => {
    const r = parseReceiptText(
      `DB Fernverkehr AG
Fahrkarte ICE Hamburg Hbf -> München Hbf
Reisedatum 28.09.2026
Summe 89,90 €
enthaltene MwSt 7% 5,88 €`,
      now,
    );
    expect(r.vendor).toBe("Deutsche Bahn");
    expect(r.category).toBe("TRAIN");
    expect(r.amountGross).toBe(89.9);
    expect(r.vatRate).toBe(7);
    expect(r.date).toBe("2026-09-28");
  });
  it("Tankbeleg mit Rückgeld", () => {
    const r = parseReceiptText(
      `ARAL Station 1234
Super E10  42,18 l  1,749 EUR/l
Betrag EUR 73,77
Gegeben bar 80,00
Rückgeld 6,23
MwSt 19% 11,78
29.09.26 14:02`,
      now,
    );
    expect(r.category).toBe("FUEL");
    expect(r.amountGross).toBe(73.77);
    expect(r.vatRate).toBe(19);
    expect(r.date).toBe("2026-09-29");
  });
  it("Hotelkette: Name aus dem Beleg übernehmen", () => {
    const r = parseReceiptText("MOTEL ONE Hamburg\nGesamtbetrag 119,00 EUR\nMwSt 7%", now);
    expect(r.vendor).toBe("Motel One");
    expect(r.category).toBe("HOTEL");
  });
  it("unbekannter Aussteller: erste Zeile, Datum nicht in der Zukunft", () => {
    const r = parseReceiptText(`Hotel Zur Post\nÜbernachtung 1 Nacht\n01.01.2030\n02.09.2026\nGesamtbetrag 119,00`, now);
    expect(r.vendor).toBe("Hotel Zur Post");
    expect(r.category).toBe("HOTEL");
    expect(r.date).toBe("2026-09-02");
    expect(r.amountGross).toBe(119);
  });
});
