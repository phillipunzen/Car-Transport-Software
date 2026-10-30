import Link from "next/link";
import { LoginForm } from "./login-form";
import { SocialButtons } from "../social-buttons";

export const metadata = { title: "Anmelden" };

const ERRORS: Record<string, string> = {
  AccountNotLinked:
    "Für diese E-Mail-Adresse gibt es bereits ein Konto mit Passwort, dessen Adresse noch nicht bestätigt ist. Bitte melde dich unten mit deinem Passwort an und bestätige anschließend die Adresse – danach funktioniert auch die Anmeldung mit Google bzw. Apple.",
  EmailNotVerified: "Der Anbieter hat keine bestätigte E-Mail-Adresse übermittelt. Bitte bestätige die Adresse dort oder melde dich mit E-Mail und Passwort an.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string; reset?: string; changed?: string; email?: string }> }) {
  const { callbackUrl, error, reset, changed, email } = await searchParams;
  return (
    <div className="card card-body space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Willkommen zurück</h1>
        <p className="mt-1 text-sm text-slate-500">Melde dich an, um deine Aufträge zu sehen.</p>
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {ERRORS[error] ?? "Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut."}
        </div>
      )}
      {(reset || changed) && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Dein Passwort wurde geändert. Bitte melde dich mit dem neuen Passwort an – auf anderen Geräten bist du abgemeldet.
        </div>
      )}
      <SocialButtons callbackUrl={callbackUrl} />
      <LoginForm callbackUrl={error === "AccountNotLinked" ? "/verify-email" : callbackUrl} defaultEmail={email} />
      <p className="text-center text-sm text-slate-500">
        Noch kein Konto?{" "}
        <Link href={`/register${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`} className="font-medium text-brand-600">
          Jetzt registrieren
        </Link>
      </p>
    </div>
  );
}
