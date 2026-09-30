import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/auth";

export const ACTIVE_ORG_COOKIE = "active_org";

export async function createOrganizationForUser(userId: string, name: string) {
  return db.organization.create({
    data: {
      name,
      companyName: name,
      memberships: { create: { userId, role: "OWNER" } },
    },
  });
}

export type Ctx = Awaited<ReturnType<typeof requireCtx>>;

/**
 * Lädt den angemeldeten Benutzer samt aktiver Instanz.
 * Leitet auf /login um, wenn niemand angemeldet ist.
 */
export async function requireCtx() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { organization: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!user) redirect("/login");

  let memberships = user.memberships;
  if (memberships.length === 0) {
    await createOrganizationForUser(user.id, user.name ?? "Meine Firma");
    memberships = await db.membership.findMany({
      where: { userId: user.id },
      include: { organization: true },
    });
  }

  const cookieStore = await cookies();
  const wanted = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const membership = memberships.find((m) => m.organizationId === wanted) ?? memberships[0];

  return {
    user: { id: user.id, name: user.name, email: user.email, image: user.image },
    org: membership.organization,
    orgId: membership.organizationId,
    role: membership.role,
    memberships: memberships.map((m) => ({ id: m.organizationId, name: m.organization.name, role: m.role })),
  };
}

export function canManage(role: Role) {
  return role === "OWNER" || role === "ADMIN";
}

export async function requireManager() {
  const ctx = await requireCtx();
  if (!canManage(ctx.role)) throw new Error("Keine Berechtigung");
  return ctx;
}

/** Liefert die nächste fortlaufende Nummer (atomar) für Aufträge/Kunden. */
export async function nextNumber(orgId: string, field: "nextOrderNumber" | "nextCustomerNumber" | "nextQuoteNumber") {
  const org = await db.organization.update({
    where: { id: orgId },
    data: { [field]: { increment: 1 } },
    select: { nextOrderNumber: true, nextCustomerNumber: true, nextQuoteNumber: true },
  });
  return org[field] - 1;
}
