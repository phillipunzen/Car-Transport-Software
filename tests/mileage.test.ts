import { describe, expect, it } from "vitest";
import { mileageCheck } from "../src/lib/mileage";

describe("Kilometer-Plausibilität", () => {
  it("im Rahmen", () => expect(mileageCheck(1000, 1790, 776)?.status).toBe("ok"));
  it("zu viel", () => expect(mileageCheck(1000, 2200, 776)?.status).toBe("high"));
  it("zu wenig", () => expect(mileageCheck(1000, 1300, 776)?.status).toBe("low"));
  it("rückwärts", () => expect(mileageCheck(1000, 900, 776)?.status).toBe("invalid"));
  it("ohne Werte", () => expect(mileageCheck(null, 900, 776)).toBeNull());
  it("kurze Strecke tolerant", () => expect(mileageCheck(100, 145, 12)?.status).toBe("ok"));
});
