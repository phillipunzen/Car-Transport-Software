import { redirect } from "next/navigation";
import type { Prisma, Role } from "@prisma/client";
import { requireCtx, type Ctx } from "@/lib/org";

/**
 * Rollen:
 * - OWNER/ADMIN: alles inkl. Einstellungen und Team
 * - MEMBER (Büro): Aufträge, Kunden, Angebote, Rechnungen, Belege, Auswertungen
 * - DRIVER (Fahrer): nur eigene Touren – keine Preise, Kunden, Angebote oder Rechnungen
 */
export const isDriver = (role: Role) => role === "DRIVER";
export const isOffice = (role: Role) => role !== "DRIVER";

/** Filter für Aufträge: Fahrer sehen nur die ihnen zugewiesenen. */
export function orderWhere(ctx: Pick<Ctx, "orgId" | "role" | "user">, extra: Prisma.OrderWhereInput = {}): Prisma.OrderWhereInput {
  return { organizationId: ctx.orgId, ...(isDriver(ctx.role) ? { assignedToId: ctx.user.id } : {}), ...extra };
}

/** Büro-Bereiche (Kunden, Angebote, Rechnungen, Auswertungen …): Fahrer landen auf „Heute“. */
export async function requireOffice() {
  const ctx = await requireCtx();
  if (isDriver(ctx.role)) redirect("/today");
  return ctx;
}
