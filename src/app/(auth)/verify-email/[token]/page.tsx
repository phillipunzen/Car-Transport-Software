import Link from "next/link";
import { confirmEmail } from "@/lib/email-verification";

export const metadata = { title: "E-Mail bestätigen", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ConfirmEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const email = await confirmEmail(token);
  return (
    <div className="card card-body space-y-4 text-center">
      {email ? (
        <>
          <h1 className="text-lg font-semibold">E-Mail-Adresse bestätigt</h1>
          <p className="text-sm text-slate-600">
            <strong>{email}</strong> ist jetzt bestätigt. Du kannst dich ab sofort auch mit Google oder Apple anmelden, sofern dort dieselbe Adresse hinterlegt ist.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold">Link ungültig</h1>
          <p className="text-sm text-slate-500">Der Bestätigungslink ist abgelaufen oder wurde bereits verwendet. Nach der Anmeldung kannst du einen neuen anfordern.</p>
        </>
      )}
      <Link href={email ? "/dashboard" : "/verify-email"} className="btn-primary">
        {email ? "Weiter zur App" : "Neuen Link anfordern"}
      </Link>
    </div>
  );
}
