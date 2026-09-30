import type { Organization } from "@prisma/client";
import { toNumber } from "@/lib/format";

export const DUNNING_LEVEL: Record<number, { label: string; title: string }> = {
  1: { label: "Zahlungserinnerung", title: "Zahlungserinnerung" },
  2: { label: "1. Mahnung", title: "1. Mahnung" },
  3: { label: "2. Mahnung", title: "2. Mahnung (letzte Mahnung)" },
};

export const MAX_DUNNING_LEVEL = 3;

export function dunningFee(org: Pick<Organization, "dunningFee1" | "dunningFee2" | "dunningFee3">, level: number) {
  return toNumber(level === 1 ? org.dunningFee1 : level === 2 ? org.dunningFee2 : org.dunningFee3);
}

/** Standardtexte je Mahnstufe – bewusst freundlich in Stufe 1, bestimmt in Stufe 3. */
export function dunningText(level: number, invoiceNumber: string, dueDate: string) {
  if (level === 1) {
    return `sicher ist es Ihrer Aufmerksamkeit entgangen: Für die Rechnung ${invoiceNumber} konnten wir bisher keinen Zahlungseingang feststellen. Wir bitten Sie, den offenen Betrag bis zum ${dueDate} zu überweisen. Sollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.`;
  }
  if (level === 2) {
    return `leider konnten wir trotz unserer Zahlungserinnerung noch keinen Zahlungseingang für die Rechnung ${invoiceNumber} feststellen. Bitte überweisen Sie den offenen Gesamtbetrag bis spätestens ${dueDate}.`;
  }
  return `trotz Zahlungserinnerung und Mahnung ist die Rechnung ${invoiceNumber} weiterhin unbezahlt. Wir fordern Sie hiermit letztmalig auf, den offenen Gesamtbetrag bis spätestens ${dueDate} zu begleichen. Nach Ablauf dieser Frist werden wir die Forderung ohne weitere Ankündigung an ein Inkassounternehmen übergeben bzw. gerichtlich geltend machen. Die dadurch entstehenden Kosten gehen zu Ihren Lasten.`;
}
