import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { requestPasswordReset } from "../actions";

export const metadata = { title: "Passwort vergessen" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <div className="card card-body space-y-4">
      <h1 className="text-lg font-semibold">Passwort vergessen</h1>
      <p className="text-sm text-slate-600">Gib die E-Mail-Adresse deines Kontos ein. Wir schicken dir einen Link, mit dem du ein neues Passwort festlegst.</p>
      <ActionForm action={requestPasswordReset}>
        <div>
          <label htmlFor="email">E-Mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required defaultValue={email} className="input" />
        </div>
        <SubmitButton className="btn-primary w-full" pendingText="Wird gesendet…">
          Link senden
        </SubmitButton>
      </ActionForm>
      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-brand-600">
          Zurück zur Anmeldung
        </Link>
      </p>
    </div>
  );
}
