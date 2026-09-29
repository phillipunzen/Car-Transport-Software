import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ACTIVE_ORG_COOKIE } from "@/lib/org";
import { ROLE } from "@/lib/labels";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Einladung" };

async function accept(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const invitation = await db.invitation.findUnique({ where: { token: String(formData.get("token")) } });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) redirect("/dashboard");
  await db.$transaction([
    db.membership.upsert({
      where: { userId_organizationId: { userId: session.user.id, organizationId: invitation.organizationId } },
      create: { userId: session.user.id, organizationId: invitation.organizationId, role: invitation.role },
      update: {},
    }),
    db.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } }),
  ]);
  (await cookies()).set(ACTIVE_ORG_COOKIE, invitation.organizationId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard");
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await db.invitation.findUnique({ where: { token }, include: { organization: true, invitedBy: true } });
  const session = await auth();
  const valid = invitation && !invitation.acceptedAt && invitation.expiresAt > new Date();
  const callback = encodeURIComponent(`/invite/${token}`);

  return (
    <div className="card card-body space-y-4 text-center">
      {!valid ? (
        <>
          <h1 className="text-lg font-semibold">Einladung ungültig</h1>
          <p className="text-sm text-slate-500">Diese Einladung ist abgelaufen oder wurde bereits verwendet.</p>
          <Link href="/login" className="btn-primary">
            Zur Anmeldung
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold">Einladung zu „{invitation.organization.name}“</h1>
          <p className="text-sm text-slate-600">
            {invitation.invitedBy?.name ?? "Ein Teammitglied"} lädt dich als <strong>{ROLE[invitation.role]}</strong> ein.
          </p>
          {session?.user ? (
            <form action={accept} className="space-y-2">
              <input type="hidden" name="token" value={token} />
              <p className="text-xs text-slate-500">Angemeldet als {session.user.email}</p>
              <SubmitButton className="btn-primary w-full" pendingText="Wird angenommen…">
                Einladung annehmen
              </SubmitButton>
            </form>
          ) : (
            <div className="flex flex-col gap-2">
              <Link href={`/register?callbackUrl=${callback}`} className="btn-primary">
                Neues Konto erstellen
              </Link>
              <Link href={`/login?callbackUrl=${callback}`} className="btn-secondary">
                Mit bestehendem Konto anmelden
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
