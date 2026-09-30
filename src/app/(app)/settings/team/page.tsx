import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { canManage, requireCtx } from "@/lib/org";
import { formatDate } from "@/lib/format";
import { ROLE, ROLE_HINT } from "@/lib/labels";
import { appUrl, mailEnabled } from "@/lib/mail";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, PageHeader } from "@/components/ui";
import { SettingsNav } from "@/components/settings-nav";
import { changeRole, inviteMember, removeMember, revokeInvitation } from "../actions";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await requireCtx();
  if (ctx.role === "DRIVER") redirect("/settings/security");
  const manager = canManage(ctx.role);
  const [members, invitations] = await Promise.all([
    db.membership.findMany({ where: { organizationId: ctx.orgId }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    db.invitation.findMany({ where: { organizationId: ctx.orgId, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <>
      <PageHeader title="Einstellungen" subtitle="Lade Kolleginnen und Kollegen in deine Instanz ein, um gemeinsam zu arbeiten." />
      <SettingsNav active="team" fleet={ctx.org.moduleFleet} />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card title={`Mitglieder (${members.length})`} className="lg:col-span-3">
          <ul className="-my-3 divide-y divide-slate-100">
            {members.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {m.user.name ?? m.user.email} {m.userId === ctx.user.id && <span className="text-xs text-slate-400">(du)</span>}
                  </p>
                  <p className="truncate text-sm text-slate-500">{m.user.email}</p>
                </div>
                {manager && m.userId !== ctx.user.id ? (
                  <div className="flex gap-2">
                    <form action={changeRole} className="flex gap-1">
                      <input type="hidden" name="id" value={m.id} />
                      <select name="role" defaultValue={m.role} className="input mt-0 py-1.5 text-sm">
                        {Object.entries(ROLE)
                          .filter(([k]) => ctx.role === "OWNER" || k !== "OWNER" || m.role === "OWNER")
                          .map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                      </select>
                      <SubmitButton className="btn-secondary px-2 py-1.5 text-xs">OK</SubmitButton>
                    </form>
                    {m.role !== "OWNER" && (
                      <form action={removeMember}>
                        <input type="hidden" name="id" value={m.id} />
                        <SubmitButton className="btn-danger px-2 py-1.5 text-xs" confirm="Mitglied entfernen?">
                          Entfernen
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                ) : (
                  <span className="badge bg-slate-100 text-slate-600">{ROLE[m.role]}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {manager && (
            <Card title="Rollen">
              <ul className="space-y-1 text-sm text-slate-600">
                {Object.entries(ROLE).map(([k, v]) => (
                  <li key={k}>
                    <strong>{v}:</strong> {ROLE_HINT[k]}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {manager && (
            <Card title="Person einladen">
              <ActionForm action={inviteMember} resetOnSuccess>
                <div>
                  <label htmlFor="email">E-Mail</label>
                  <input id="email" name="email" type="email" required className="input" />
                </div>
                <div>
                  <label htmlFor="role">Rolle</label>
                  <select id="role" name="role" className="input" defaultValue="MEMBER">
                    <option value="DRIVER">Fahrer – nur eigene Touren, ohne Preise & Rechnungen</option>
                    <option value="MEMBER">Mitarbeiter (Büro) – Aufträge, Kunden, Angebote, Rechnungen</option>
                    <option value="ADMIN">Administrator – zusätzlich Einstellungen & Team</option>
                  </select>
                </div>
                <SubmitButton pendingText="Wird eingeladen…">Einladen</SubmitButton>
                {!mailEnabled() && <p className="text-xs text-slate-500">Kein E-Mail-Versand eingerichtet – du erhältst einen Link zum Teilen.</p>}
              </ActionForm>
            </Card>
          )}
          <Card title="Offene Einladungen">
            {invitations.length === 0 ? (
              <p className="text-sm text-slate-500">Keine offenen Einladungen.</p>
            ) : (
              <ul className="space-y-3">
                {invitations.map((i) => (
                  <li key={i.id} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{i.email}</span>
                      {manager && (
                        <form action={revokeInvitation}>
                          <input type="hidden" name="id" value={i.id} />
                          <SubmitButton className="text-xs text-red-500">Zurückziehen</SubmitButton>
                        </form>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {ROLE[i.role]} · gültig bis {formatDate(i.expiresAt)}
                    </p>
                    {manager && <input readOnly value={`${appUrl()}/invite/${i.token}`} className="input mt-1 font-mono text-xs" />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
