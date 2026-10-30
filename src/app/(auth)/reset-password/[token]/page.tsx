import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { isResetTokenValid } from "@/lib/password-reset";
import { resetPasswordAction } from "../../actions";

// Der Link steht in der Adresse – nicht an andere Seiten weitergeben
export const metadata = { title: "Neues Passwort", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await isResetTokenValid(token))) {
    return (
      <div className="card card-body space-y-4 text-center">
        <h1 className="text-lg font-semibold">Link ungültig</h1>
        <p className="text-sm text-slate-500">Der Link ist abgelaufen oder wurde bereits verwendet. Links zum Zurücksetzen gelten 1 Stunde.</p>
        <Link href="/forgot-password" className="btn-primary">
          Neuen Link anfordern
        </Link>
      </div>
    );
  }
  return (
    <div className="card card-body space-y-4">
      <h1 className="text-lg font-semibold">Neues Passwort festlegen</h1>
      <ActionForm action={resetPasswordAction}>
        <input type="hidden" name="token" value={token} />
        <div>
          <label htmlFor="password">Neues Passwort</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="input" />
          <p className="mt-1 text-xs text-slate-500">Mindestens 8 Zeichen.</p>
        </div>
        <div>
          <label htmlFor="confirm">Passwort wiederholen</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} className="input" />
        </div>
        <p className="text-xs text-slate-500">Danach wirst du auf allen Geräten abgemeldet. Eine eingerichtete Zwei-Faktor-Anmeldung bleibt aktiv.</p>
        <SubmitButton className="btn-primary w-full" pendingText="Wird gespeichert…">
          Passwort speichern
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
