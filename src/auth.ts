import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { createOrganizationForUser } from "@/lib/org";

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "E-Mail",
    credentials: { email: {}, password: {} },
    async authorize(raw) {
      const parsed = z
        .object({ email: z.string().email(), password: z.string().min(1) })
        .safeParse(raw);
      if (!parsed.success) return null;
      const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
      if (!user?.passwordHash) return null;
      const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
      return ok ? { id: user.id, name: user.name, email: user.email, image: user.image } : null;
    },
  }),
];

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
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  events: {
    // Social-Login: neue Benutzer erhalten automatisch eine eigene Instanz
    async createUser({ user }) {
      if (user.id) await createOrganizationForUser(user.id, user.name ?? user.email ?? "Meine Firma");
    },
  },
});
