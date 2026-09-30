import Link from "next/link";
import { LoginForm } from "./login-form";
import { SocialButtons } from "../social-buttons";

export const metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  return (
    <div className="card card-body space-y-4">
      <h1 className="text-lg font-semibold">Anmelden</h1>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.
        </div>
      )}
      <SocialButtons callbackUrl={callbackUrl} />
      <LoginForm callbackUrl={callbackUrl} />
      <p className="text-center text-sm text-slate-500">
        Noch kein Konto?{" "}
        <Link href={`/register${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`} className="font-medium text-brand-600">
          Jetzt registrieren
        </Link>
      </p>
    </div>
  );
}
