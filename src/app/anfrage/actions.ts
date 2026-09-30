"use server";

import { headers } from "next/headers";
import { z } from "zod";
import type { TransportMode } from "@prisma/client";
import { db } from "@/lib/db";
import { appUrl, mailEnabled, sendMailWith } from "@/lib/mail";
import { validToken } from "@/lib/public";
import type { FormState } from "@/components/action-form";

// Einfache Drosselung je IP (pro Server-Instanz) – zusätzlich begrenzt die Datenbank pro Firma und Tag.
const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

const opt = z.string().trim().max(200).optional().transform((v) => v || null);
const Schema = z.object({
  companyName: opt,
  contactName: z.string().trim().min(2, "Bitte Ihren Namen angeben.").max(120),
  email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse angeben."),
  phone: opt,
  transportMode: z.enum(["DRIVEN", "TRAILER", "TRUCK"]).catch("DRIVEN"),
  pickupStreet: opt,
  pickupZip: opt,
  pickupCity: z.string().trim().min(2, "Bitte den Abholort angeben.").max(120),
  pickupDate: opt,
  deliveryStreet: opt,
  deliveryZip: opt,
  deliveryCity: z.string().trim().min(2, "Bitte den Zielort angeben.").max(120),
  deliveryDate: opt,
  licensePlate: opt,
  make: opt,
  model: opt,
  vin: opt,
  notes: z.string().trim().max(3000).optional().transform((v) => v || null),
});

export async function submitInquiry(_: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  if (!validToken(token)) return { error: "Das Formular ist nicht mehr gültig." };
  // Spamschutz: verstecktes Feld muss leer bleiben, Ausfüllen dauert mindestens 3 Sekunden
  const started = Number(formData.get("ts"));
  if (String(formData.get("website") ?? "") !== "" || !started || Date.now() - started < 3000) return { ok: "Vielen Dank! Ihre Anfrage ist eingegangen." };
  if (formData.get("consent") !== "on") return { error: "Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu." };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "local").split(",")[0].trim();
  if (limited(ip, 5, 60 * 60 * 1000)) return { error: "Zu viele Anfragen. Bitte versuchen Sie es später noch einmal." };

  const org = await db.organization.findUnique({ where: { requestToken: token } });
  if (!org || !org.requestEnabled) return { error: "Das Formular ist nicht mehr gültig." };
  const today = await db.inquiry.count({ where: { organizationId: org.id, createdAt: { gte: new Date(Date.now() - 86400000) } } });
  if (today >= 100) return { error: "Derzeit können keine Anfragen angenommen werden. Bitte kontaktieren Sie uns direkt." };

  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const inquiry = await db.inquiry.create({
    data: { ...d, transportMode: d.transportMode as TransportMode, vin: d.vin?.replace(/\s/g, "").toUpperCase() ?? null, licensePlate: d.licensePlate?.toUpperCase() ?? null, organizationId: org.id },
  });

  // Benachrichtigung an die Firma
  if (mailEnabled() && org.email) {
    try {
      await sendMailWith({
        to: org.email,
        replyTo: d.email,
        subject: `Neue Auftragsanfrage: ${d.pickupCity} → ${d.deliveryCity}`,
        text: `Neue Anfrage von ${d.contactName}${d.companyName ? ` (${d.companyName})` : ""}, ${d.email}${d.phone ? `, ${d.phone}` : ""}

${d.pickupCity} → ${d.deliveryCity}${d.pickupDate ? `, Wunschtermin ${d.pickupDate}` : ""}
Fahrzeug: ${[d.make, d.model, d.licensePlate].filter(Boolean).join(" ") || "–"}
${d.notes ? `\n${d.notes}\n` : ""}
Bearbeiten: ${appUrl()}/inquiries/${inquiry.id}`,
      });
    } catch (e) {
      console.error("Benachrichtigung zur Anfrage fehlgeschlagen", e);
    }
  }
  return { ok: "Vielen Dank! Ihre Anfrage ist eingegangen – wir melden uns in Kürze mit einem Angebot." };
}
