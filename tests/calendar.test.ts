import { describe, expect, it } from "vitest";
import { buildIcs, weekOf } from "../src/lib/calendar";

describe("Kalender", () => {
  it("Woche beginnt am Montag (deutsche Zeit)", () => {
    const w = weekOf("2026-10-01"); // Donnerstag
    expect(w.days[0]).toBe("2026-09-28");
    expect(w.days[6]).toBe("2026-10-04");
    expect(w.start.toISOString()).toBe("2026-09-27T22:00:00.000Z"); // Mitternacht MESZ
    expect(w.prev).toBe("2026-09-21");
  });
  it("Woche über die Zeitumstellung", () => {
    const w = weekOf("2026-10-25");
    expect(w.days[0]).toBe("2026-10-19");
    expect(w.end.toISOString()).toBe("2026-10-25T23:00:00.000Z"); // Mitternacht MEZ
  });
  it("ICS: Escaping, Faltung, CRLF", () => {
    const ics = buildIcs("Touren", [
      {
        uid: "a@b",
        start: new Date("2026-10-01T08:00:00Z"),
        end: new Date("2026-10-01T12:00:00Z"),
        summary: "A-00001 Abholung München → Hamburg, BMW; iX3",
        description: "Zeile 1\nZeile 2 " + "x".repeat(120),
      },
    ]);
    expect(ics).toContain("DTSTART:20261001T080000Z");
    expect(ics).toContain("SUMMARY:A-00001 Abholung München → Hamburg\\, BMW\; iX3");
    expect(ics).toContain("Zeile 1\\nZeile 2");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l, "utf8") <= 75)).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
