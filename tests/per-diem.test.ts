import { describe, expect, it } from "vitest";
import { perDiem } from "../src/lib/per-diem";

describe("perDiem", () => {
  it("gibt nichts bei bis zu 8 Stunden", () => {
    expect(perDiem(new Date("2026-03-02T07:00:00+01:00"), new Date("2026-03-02T15:00:00+01:00"), 14, 28).total).toBe(0);
  });
  it("kleine Pauschale bei über 8 Stunden am selben Tag", () => {
    expect(perDiem(new Date("2026-03-02T06:00:00+01:00"), new Date("2026-03-02T18:00:00+01:00"), 14, 28).total).toBe(14);
  });
  it("mehrtägig: An-/Abreise + volle Tage", () => {
    const r = perDiem(new Date("2026-03-02T20:00:00+01:00"), new Date("2026-03-04T09:00:00+01:00"), 14, 28, true);
    expect(r.lines.map((l) => l.amount)).toEqual([14, 28, 14]);
    expect(r.total).toBe(56);
  });
  it("mit Übernachtung, kein voller Tag dazwischen", () => {
    expect(perDiem(new Date("2026-03-02T20:00:00+01:00"), new Date("2026-03-03T10:00:00+01:00"), 14, 28, true).total).toBe(28);
  });
  it("über Mitternacht ohne Übernachtung zählt wie eintägig", () => {
    expect(perDiem(new Date("2026-03-02T18:00:00+01:00"), new Date("2026-03-03T04:00:00+01:00"), 14, 28).total).toBe(14);
    expect(perDiem(new Date("2026-03-02T20:00:00+01:00"), new Date("2026-03-03T02:00:00+01:00"), 14, 28).total).toBe(0);
  });
});
