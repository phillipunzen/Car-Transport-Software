import { db } from "@/lib/db";

/** Tenant owners are not application administrators; signup cannot grant this permission. */
export async function canManageAppAi(user: { id: string; email: string }) {
  const configured = process.env.CHATGPT_APP_ADMIN_EMAILS;
  if (configured?.trim()) {
    const emails = configured.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
    return emails.includes(user.email.toLowerCase());
  }
  // Existing installations have no global role. The first account bootstraps app administration.
  const firstUser = await db.user.findFirst({ orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  return firstUser?.id === user.id;
}
