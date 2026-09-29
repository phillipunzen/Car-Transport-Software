/**
 * Ablauf eines Auftrags als feste Schrittfolge – daraus ergibt sich,
 * was als Nächstes zu tun ist. Reine Funktion, damit sie testbar bleibt.
 */

export type StepKey =
  | "prepare"
  | "pickupPhotos"
  | "pickupProtocol"
  | "deliveryPhotos"
  | "deliveryProtocol"
  | "invoice"
  | "payment";

export type StepState = "done" | "current" | "open" | "skipped";

export type Step = {
  key: StepKey;
  label: string; // kurz, für die Schrittleiste
  state: StepState;
  detail?: string; // z. B. "4 Fotos", "fehlt: FIN"
};

export type OrderStepInput = {
  status: string;
  licensePlate: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  pickupStreet: string | null;
  pickupZip: string | null;
  pickupCity: string | null;
  pickupDate: Date | null;
  deliveryStreet: string | null;
  deliveryZip: string | null;
  deliveryCity: string | null;
  assignedToId: string | null;
  price: number; // berechneter Auftragswert netto
  photos: { PICKUP: number; DELIVERY: number };
  damages: { PICKUP: number; DELIVERY: number };
  protocols: { PICKUP: "none" | "draft" | "done"; DELIVERY: "none" | "draft" | "done" };
  expenses: number;
  invoice: { status: "DRAFT" | "ISSUED" | "PAID"; number: string | null } | null;
};

/** Angaben, die für die Durchführung noch fehlen */
export function missingOrderData(o: OrderStepInput) {
  return [
    !o.licensePlate && !o.vin && "Kennzeichen / FIN",
    !o.make && !o.model && "Marke / Modell",
    !(o.pickupStreet && (o.pickupZip || o.pickupCity)) && "Abholadresse",
    !(o.deliveryStreet && (o.deliveryZip || o.deliveryCity)) && "Zustelladresse",
    !o.pickupDate && "Abholtermin",
    !o.assignedToId && "Fahrer",
    !o.price && "Preis",
  ].filter((m): m is string => Boolean(m));
}

const photoDetail = (n: number, damages: number) =>
  `${n} Foto${n === 1 ? "" : "s"}${damages ? ` · ${damages} Schaden${damages === 1 ? "" : "/Schäden"}` : ""}`;

export function orderSteps(o: OrderStepInput): Step[] {
  const missing = missingOrderData(o);
  const raw: { key: StepKey; label: string; done: boolean; detail?: string }[] = [
    { key: "prepare", label: "Vorbereiten", done: missing.length === 0, detail: missing.length ? `fehlt: ${missing.join(", ")}` : "vollständig" },
    { key: "pickupPhotos", label: "Fotos Abholung", done: o.photos.PICKUP > 0, detail: photoDetail(o.photos.PICKUP, o.damages.PICKUP) },
    { key: "pickupProtocol", label: "Abholprotokoll", done: o.protocols.PICKUP === "done", detail: o.protocols.PICKUP === "draft" ? "begonnen" : undefined },
    { key: "deliveryPhotos", label: "Fotos Übergabe", done: o.photos.DELIVERY > 0, detail: photoDetail(o.photos.DELIVERY, o.damages.DELIVERY) },
    { key: "deliveryProtocol", label: "Übergabeprotokoll", done: o.protocols.DELIVERY === "done", detail: o.protocols.DELIVERY === "draft" ? "begonnen" : undefined },
    {
      key: "invoice",
      label: "Rechnung",
      done: o.invoice !== null && o.invoice.status !== "DRAFT",
      detail: o.invoice ? (o.invoice.status === "DRAFT" ? "Entwurf" : o.invoice.number ?? undefined) : o.expenses ? `${o.expenses} Beleg${o.expenses === 1 ? "" : "e"}` : undefined,
    },
    { key: "payment", label: "Bezahlt", done: o.invoice?.status === "PAID" },
  ];

  // Alles vor dem letzten erledigten Schritt, das nicht erledigt ist, gilt als übersprungen
  const lastDone = raw.map((s) => s.done).lastIndexOf(true);
  let currentSet = false;
  return raw.map((s, i) => {
    let state: StepState;
    if (s.done) state = "done";
    else if (i < lastDone) state = "skipped";
    else if (!currentSet) {
      state = "current";
      currentSet = true;
    } else state = "open";
    return { key: s.key, label: s.label, state, detail: s.detail };
  });
}

export function currentStep(steps: Step[]) {
  return steps.find((s) => s.state === "current") ?? null;
}
