import { describe, expect, it } from "vitest";
import { buildDatev, revenueAccount, toWindows1252 } from "../src/lib/datev";
import { driverPayFor } from "../src/lib/driver-pay";

describe("DATEV", () => {
  const csv = buildDatev(
    [
      { number: "RE-2026-0001", issueDate: new Date("2026-03-05T10:00:00Z"), customerNumber: 7, customerName: "Autohaus Süd", smallBusiness: false, byRate: [{ rate: 19, gross: 119 }, { rate: 7, gross: 10.7 }] },
      { number: "RE-2026-0002", issueDate: new Date("2026-03-06T10:00:00Z"), customerNumber: 7, customerName: "Autohaus Süd", smallBusiness: false, byRate: [{ rate: 19, gross: -119 }] },
    ],
    { consultant: "1234567", client: "10001", chart: "SKR03", revenueAccount: null, from: new Date("2026-03-01"), to: new Date("2026-03-31"), fiscalYearStart: new Date("2026-01-01") },
  );
  const lines = csv.trim().split("\r\n");
  it("Kopf und Spalten", () => {
    expect(lines[0].startsWith('"EXTF";700;21;"Buchungsstapel";13;')).toBe(true);
    expect(lines[0]).toContain(";1234567;10001;20260101;4;20260301;20260331;");
    expect(lines[1].split(";")[0]).toBe("Umsatz (ohne Soll/Haben-Kz)");
  });
  it("Buchungen je Steuersatz, Storno im Haben", () => {
    expect(lines).toHaveLength(5);
    expect(lines[2]).toBe('119,00;"S";"EUR";;;;10007;8400;"";0503;"RE-2026-0001";"";;"Autohaus Süd"');
    expect(lines[3].split(";")[7]).toBe("8300");
    expect(lines[4].split(";").slice(0, 2)).toEqual(["119,00", '"H"']);
  });
  it("Konten und Zeichensatz", () => {
    expect(revenueAccount("SKR04", 19, false)).toBe("4400");
    expect(revenueAccount("SKR03", 19, true)).toBe("8195");
    expect(Array.from(toWindows1252("ü€"))).toEqual([0xfc, 0x80]);
  });
});

describe("Fahrervergütung", () => {
  it("Regel und manueller Betrag", () => {
    expect(driverPayFor({ driverPay: null, distanceKm: 300 }, { payType: "PER_KM", payRate: 0.25 })).toBe(75);
    expect(driverPayFor({ driverPay: null, distanceKm: 300 }, { payType: "PER_TOUR", payRate: 90 })).toBe(90);
    expect(driverPayFor({ driverPay: 120, distanceKm: 300 }, { payType: "PER_TOUR", payRate: 90 })).toBe(120);
    expect(driverPayFor({ driverPay: null, distanceKm: 300 }, { payType: "NONE", payRate: null })).toBe(0);
  });
});
