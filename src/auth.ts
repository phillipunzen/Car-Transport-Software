import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import { db } from "@/lib/db";
import { createOrganizationForUser } from "@/lib/org";
import { consumeRecoveryCode, verifyTotp } from "@/lib/totp";
import { checkPassword, recordFailedLogin, resetFailedLogins } from "@/lib/login-guard";
import { oauthSignInCheck } from "@/lib/oauth-linking";
import { startedBeforePasswordChange } from "@/lib/password-reset";

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "E-Mail",
    credentials: { email: {}, password: {}, code: {} },
    async authorize(raw) {
      const parsed = z
        .object({ email: z.string().email(), password: z.string().min(1), code: z.string().optional() })
        .safeParse(raw);
      if (!parsed.success) return null;
      const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
      if (!user?.passwordHash) return null;
      // Sperre nach zu vielen Fehlversuchen – gilt auch für direkte Aufrufe von /api/auth/callback/credentials
      if ((await checkPassword(user, parsed.data.password)) !== "ok") return null;
      // Zwei-Faktor: Code aus der Authenticator-App oder ein Wiederherstellungscode
      if (user.totpEnabled && user.totpSecret) {
        const code = parsed.data.code?.trim() ?? "";
        if (!verifyTotp(user.totpSecret, code)) {
          const rest = consumeRecoveryCode(user.recoveryCodes, code);
          if (!rest) {
            await recordFailedLogin(user.id);
            return null;
          }
          await db.user.update({ where: { id: user.id }, data: { recoveryCodes: rest } });
        }
      }
      await resetFailedLogins(user);
      return { id: user.id, name: user.name, email: user.email, image: user.image };
    },
  }),
];

// Verknüpfen per E-Mail nur nach Prüfung im signIn-Callback (bestätigte Adresse, siehe oauth-linking.ts)
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({ allowDangerousEmailAccountLinking: true }));
}
if (process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET) {
  providers.push(Apple({ allowDangerousEmailAccountLinking: true }));
}

export const enabledSocialProviders = {
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  apple: Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET),
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  trustHost: true,
  providers,
  pages: { signIn: "/login" },
  callbacks: {
    signIn({ user, account, profile }) {
      return oauthSignInCheck({ user, account, profile });
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.authAt = Date.now();
        return token;
      }
      // Nach einer Passwortänderung gelten nur noch Sitzungen, die danach begonnen haben
      if (token.sub) {
        const current = await db.user.findUnique({ where: { id: token.sub }, select: { passwordChangedAt: true } });
        if (!current || startedBeforePasswordChange(token, current.passwordChangedAt)) return null;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  events: {
    // Google/Apple haben die Adresse bestätigt (im signIn-Callback geprüft)
    async signIn({ user, account }) {
      if (user.id && account && account.type !== "credentials") {
        await db.user.updateMany({ where: { id: user.id, emailVerified: null }, data: { emailVerified: new Date() } });
      }
    },
    // Social-Login: neue Benutzer erhalten automatisch eine eigene Instanz
    async createUser({ user }) {
      if (user.id) await createOrganizationForUser(user.id, user.name ?? user.email ?? "Meine Firma");
    },
  },
});
