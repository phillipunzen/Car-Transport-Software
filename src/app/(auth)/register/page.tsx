import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field } from "@/components/ui";
import { registerAction } from "../actions";
import { SocialButtons } from "../social-buttons";

export const metadata = { title: "Registrieren" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  const invited = callbackUrl?.startsWith("/invite/");
  return (
    <div className="card card-body space-y-4">
      <h1 className="text-lg font-semibold">Konto erstellen</h1>
      <SocialButtons callbackUrl={callbackUrl} />
      <ActionForm action={registerAction}>
        <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
        <Field label="Dein Name" name="name" autoComplete="name" required />
        {!invited && <Field label="Firmenname" name="company" autoComplete="organization" hint="Kann später in den Einstellungen geändert werden." />}
        <Field label="E-Mail" name="email" type="email" autoComplete="email" required />
        <Field label="Passwort" name="password" type="password" autoComplete="new-password" minLength={8} required hint="Mindestens 8 Zeichen" />
        <SubmitButton className="btn-primary w-full" pendingText="Konto wird erstellt…">
          Registrieren
        </SubmitButton>
      </ActionForm>
      <p className="text-center text-sm text-slate-500">
        Bereits registriert?{" "}
        <Link href={`/login${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`} className="font-medium text-brand-600">
          Anmelden
        </Link>
      </p>
    </div>
  );
}
