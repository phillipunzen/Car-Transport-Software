import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import Link from "next/link";
import { canManage, requireCtx } from "@/lib/org";
import { ROLE } from "@/lib/labels";
import { Card, PageHeader } from "@/components/ui";
import { SettingsNav } from "@/components/settings-nav";
import { SubmitButton } from "@/components/submit-button";
import { TwoFactor } from "@/components/two-factor";
import { ActionForm } from "@/components/action-form";
import { changePassword, setRequire2fa } from "./actions";

export const metadata = { title: "Sicherheit" };

export default async function SecurityPage() {
  const ctx = await requireCtx();
  const driver = ctx.role === "DRIVER";
  const settlements = ctx.org.moduleDriverPay
    ? await db.driverSettlement.findMany({ where: { organizationId: ctx.orgId, userId: ctx.user.id }, orderBy: { createdAt: "desc" }, take: 12 })
    : [];
  const hasPassword = Boolean((await db.user.findUnique({ where: { id: ctx.user.id }, select: { passwordHash: true } }))?.passwordHash);
  return (
    <>
      <PageHeader title={driver ? "Profil & Sicherheit" : "Einstellungen"} subtitle={`${ctx.user.name ?? ctx.user.email} · ${ROLE[ctx.role]}`} />
      <SettingsNav active="security" driver={driver} fleet={ctx.org.moduleFleet} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={hasPassword ? "Passwort ändern" : "Passwort festlegen"}>
            <ActionForm action={changePassword} className="max-w-md space-y-4">
              {hasPassword ? (
                <div>
                  <label htmlFor="current">Aktuelles Passwort</label>
                  <input id="current" name="current" type="password" autoComplete="current-password" required className="input" />
                </div>
              ) : (
                <p className="text-sm text-slate-600">Du meldest dich bisher nur über Google oder Apple an. Mit einem Passwort geht es zusätzlich per E-Mail.</p>
              )}
              <div>
                <label htmlFor="password">Neues Passwort</label>
                <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="input" />
                <p className="mt-1 text-xs text-slate-500">Mindestens 8 Zeichen.</p>
              </div>
              <div>
                <label htmlFor="confirm">Neues Passwort wiederholen</label>
                <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} className="input" />
              </div>
              <p className="text-xs text-slate-500">Danach meldest du dich neu an. Auf allen anderen Geräten wirst du abgemeldet.</p>
              <SubmitButton className="btn-primary" pendingText="Wird gespeichert…">
                Passwort speichern
              </SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Zwei-Faktor-Anmeldung">
            <TwoFactor enabled={ctx.user.totpEnabled} />
          </Card>
        </div>
        <div className="space-y-6">
          {ctx.org.moduleDriverPay && settlements.length > 0 && (
            <Card title="Meine Abrechnungen">
              <ul className="space-y-1 text-sm">
                {settlements.map((st) => (
                  <li key={st.id} className="flex justify-between gap-2">
                    <a href={`/api/settlements/${st.id}/pdf`} target="_blank" rel="noreferrer" className="text-brand-600">
                      {st.number}
                    </a>
                    <span className="tabular-nums">{formatMoney(st.grossTotal)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Kalender">
            <p className="text-sm text-slate-600">Eigene Touren automatisch im Handy-Kalender.</p>
            <Link href="/calendar/setup" className="btn-secondary mt-3">
              Kalender-Abo einrichten
            </Link>
          </Card>
          {canManage(ctx.role) && (
            <Card title="Für das ganze Team">
              <form action={setRequire2fa} className="space-y-3">
                <label className="flex items-start gap-2 text-sm font-normal">
                  <input type="checkbox" name="require2fa" defaultChecked={ctx.org.require2fa} className="mt-0.5 h-4 w-4 accent-brand-600" />
                  Zwei-Faktor-Anmeldung für Inhaber und Administratoren verlangen
                </label>
                <p className="text-xs text-slate-500">Wer sie noch nicht eingerichtet hat, sieht einen deutlichen Hinweis, bis sie aktiv ist.</p>
                <SubmitButton className="btn-secondary">Speichern</SubmitButton>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
