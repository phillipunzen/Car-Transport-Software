"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { ACTIVE_ORG_COOKIE, requireCtx } from "@/lib/org";

export async function switchOrg(formData: FormData) {
  const ctx = await requireCtx();
  const orgId = String(formData.get("orgId"));
  if (ctx.memberships.some((m) => m.id === orgId)) {
    (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  redirect("/dashboard");
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
