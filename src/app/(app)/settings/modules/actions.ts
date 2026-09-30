"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/org";
import { str } from "@/lib/format";
import type { FormState } from "@/components/action-form";

export async function saveModules(_: FormState, formData: FormData): Promise<FormState> {
  let ctx;
  try {
    ctx = await requireManager();
  } catch {
    return { error: "Nur Inhaber und Administratoren können Module ändern." };
  }
  const reviewUrl = str(formData.get("reviewUrl"));
  if (reviewUrl && !/^https:\/\/\S+$/.test(reviewUrl)) return { error: "Der Bewertungslink muss mit https:// beginnen." };
  const moduleReviews = formData.get("moduleReviews") === "on";
  if (moduleReviews && !reviewUrl) return { error: "Für Bewertungen bitte den Link zu deinem Bewertungsprofil (z. B. Google) eintragen." };
  await db.organization.update({
    where: { id: ctx.orgId },
    data: {
      moduleDriverPay: formData.get("moduleDriverPay") === "on",
      moduleBankImport: formData.get("moduleBankImport") === "on",
      moduleFleet: formData.get("moduleFleet") === "on",
      moduleReviews,
      reviewUrl,
    },
  });
  revalidatePath("/", "layout");
  return { ok: "Module gespeichert." };
}
