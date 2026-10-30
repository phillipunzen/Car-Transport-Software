import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** Zeitpunkt der Anmeldung (ms) – für das Abmelden nach Passwortänderung */
    authAt?: number;
  }
}
