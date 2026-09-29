import { describe, expect, it } from "vitest";
import { currentStep, orderSteps, type OrderStepInput } from "../src/lib/order-steps";

const base: OrderStepInput = {
  status: "PLANNED",
  licensePlate: "M-AB 1234",
  vin: null,
  make: "VW",
  model: "Golf",
  pickupStreet: "Hauptstr. 1",
  pickupZip: "80331",
  pickupCity: "München",
  pickupDate: new Date(),
  deliveryStreet: "Ring 2",
  deliveryZip: "20095",
  deliveryCity: "Hamburg",
  assignedToId: "u1",
  price: 500,
  photos: { PICKUP: 0, DELIVERY: 0 },
  damages: { PICKUP: 0, DELIVERY: 0 },
  protocols: { PICKUP: "none", DELIVERY: "none" },
  expenses: 0,
  invoice: null,
};

const states = (o: OrderStepInput) => orderSteps(o).map((s) => s.state);

describe("Auftragsablauf", () => {
  it("unvollständiger Auftrag: zuerst vorbereiten", () => {
    const steps = orderSteps({ ...base, pickupDate: null, price: 0 });
    expect(currentStep(steps)?.key).toBe("prepare");
    expect(steps[0].detail).toBe("fehlt: Abholtermin, Preis");
  });

  it("vollständig vorbereitet: Fotos bei Abholung sind dran", () => {
    expect(currentStep(orderSteps(base))?.key).toBe("pickupPhotos");
  });

  it("Fotos gemacht: Abholprotokoll ist dran", () => {
    expect(currentStep(orderSteps({ ...base, photos: { PICKUP: 6, DELIVERY: 0 } }))?.key).toBe("pickupProtocol");
  });

  it("offen gebliebene Schritte werden markiert", () => {
    const o = { ...base, price: 0, protocols: { PICKUP: "done", DELIVERY: "none" } } as OrderStepInput;
    expect(states(o)).toEqual(["missed", "missed", "done", "current", "open", "open", "open"]);
  });

  it("bewusst übersprungene Fotos: weiter mit dem Protokoll", () => {
    const o = { ...base, skipped: ["pickupPhotos"] };
    expect(states(o)).toEqual(["done", "waived", "current", "open", "open", "open", "open"]);
  });

  it("Protokolle lassen sich nicht überspringen", () => {
    const o = { ...base, skipped: ["pickupProtocol", "unsinn"] };
    expect(currentStep(orderSteps(o))?.key).toBe("pickupPhotos");
    expect(orderSteps(o)[2].state).toBe("open");
  });

  it("keine Rechnung erforderlich: Auftrag ist nach der Übergabe fertig", () => {
    const o: OrderStepInput = {
      ...base,
      photos: { PICKUP: 4, DELIVERY: 4 },
      protocols: { PICKUP: "done", DELIVERY: "done" },
      skipped: ["invoice"],
    };
    expect(states(o).slice(5)).toEqual(["waived", "waived"]);
    expect(currentStep(orderSteps(o))).toBeNull();
  });

  it("später doch erledigt: erledigt hat Vorrang", () => {
    const o = { ...base, skipped: ["pickupPhotos"], photos: { PICKUP: 3, DELIVERY: 0 } };
    expect(orderSteps(o)[1].state).toBe("done");
  });

  it("Rechnungsentwurf zählt noch nicht als erledigt", () => {
    const o: OrderStepInput = {
      ...base,
      photos: { PICKUP: 4, DELIVERY: 4 },
      protocols: { PICKUP: "done", DELIVERY: "done" },
      invoice: { status: "DRAFT", number: null },
    };
    expect(currentStep(orderSteps(o))?.key).toBe("invoice");
    expect(currentStep(orderSteps({ ...o, invoice: { status: "ISSUED", number: "RE-1" } }))?.key).toBe("payment");
    expect(currentStep(orderSteps({ ...o, invoice: { status: "PAID", number: "RE-1" } }))).toBeNull();
  });
});
