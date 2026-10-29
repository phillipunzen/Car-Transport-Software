import { db } from "@/lib/db";

type Input = {
  user: { email?: string | null };
  account?: { type: string; provider: string; providerAccountId: string } | null;
  profile?: Record<string, unknown> | null;
};

/**
 * signIn-Callback für Google/Apple. Ein bestehendes Konto wird nur dann per
 * gleicher E-Mail verknüpft, wenn seine Adresse bestätigt ist. Sonst könnte jemand
 * vorab ein Passwort-Konto mit fremder Adresse anlegen und es nach dem ersten
 * Google-Login des echten Inhabers weiter nutzen.
 */
export async function oauthSignInCheck({ user, account, profile }: Input): Promise<boolean | string> {
  if (!account || account.type === "credentials") return true;
  // Der Anbieter muss die Adresse selbst bestätigt haben (Apple liefert "true" als Text)
  const verified = profile?.email_verified === true || profile?.email_verified === "true";
  const email = user.email?.trim().toLowerCase();
  if (!email || !verified) return "/login?error=EmailNotVerified";

  const existing = await db.user.findUnique({
    where: { email },
    select: { emailVerified: true, passwordHash: true, accounts: { select: { provider: true, providerAccountId: true } } },
  });
  if (!existing) return true;
  if (existing.accounts.some((a) => a.provider === account.provider && a.providerAccountId === account.providerAccountId)) return true;
  // Ohne Passwort konnte kein Fremder das Konto vorbereiten (nur über einen Anbieter mit bestätigter Adresse)
  if (existing.emailVerified || !existing.passwordHash) return true;
  return "/login?error=AccountNotLinked";
}
