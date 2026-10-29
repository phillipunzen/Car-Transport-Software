import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { resendVerification } from "../actions";

export const metadata = { title: "E-Mail bestätigen" };

export default async function VerifyEmailPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Fverify-email");
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { email: true, emailVerified: true } });
  if (!user) redirect("/login");
  return (
    <div className="card card-body space-y-4">
      <h1 className="text-lg font-semibold">E-Mail-Adresse bestätigen</h1>
      {user.emailVerified ? (
        <p className="text-sm text-slate-600">
          <strong>{user.email}</strong> ist bestätigt.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            <strong>{user.email}</strong> ist noch nicht bestätigt. Erst danach lässt sich dein Konto mit Google oder Apple verknüpfen.
          </p>
          <ActionForm action={resendVerification}>
            <SubmitButton className="btn-primary w-full" pendingText="Wird gesendet…">
              Bestätigungslink senden
            </SubmitButton>
          </ActionForm>
        </>
      )}
      <Link href="/dashboard" className="btn-secondary w-full">
        Zur App
      </Link>
    </div>
  );
}
