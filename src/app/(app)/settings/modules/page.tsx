import { redirect } from "next/navigation";
import { canManage, requireCtx } from "@/lib/org";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { PageHeader } from "@/components/ui";
import { SettingsNav } from "@/components/settings-nav";
import { saveModules } from "./actions";

export const metadata = { title: "Module" };

function Module({ name, title, text, checked, children }: { name: string; title: string; text: string; checked: boolean; children?: React.ReactNode }) {
  return (
    <div className="card card-body">
      <label className="flex items-start gap-3 font-normal">
        <input type="checkbox" name={name} defaultChecked={checked} className="mt-1 h-5 w-5 accent-brand-600" />
        <span>
          <span className="block text-base font-semibold text-slate-900">{title}</span>
          <span className="mt-1 block text-sm text-slate-600">{text}</span>
        </span>
      </label>
      {children && <div className="mt-4 pl-8">{children}</div>}
    </div>
  );
}

export default async function ModulesPage() {
  const ctx = await requireCtx();
  if (ctx.role === "DRIVER") redirect("/settings/security");
  const o = ctx.org;
  const readOnly = !canManage(ctx.role);
  return (
    <>
      <PageHeader title="Einstellungen" subtitle="Zusatzfunktionen nach Bedarf einschalten – ausgeschaltete Module bleiben unsichtbar." />
      <SettingsNav active="modules" fleet={o.moduleFleet} />
      {readOnly && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">Nur Inhaber und Administratoren können Module ändern.</p>}
      <ActionForm action={saveModules} className="space-y-4">
        <fieldset disabled={readOnly} className="grid gap-4 lg:grid-cols-2">
          <Module
            name="moduleDriverPay"
            title="Fahrer-Abrechnung"
            checked={o.moduleDriverPay}
            text="Vergütung je Fahrer (pro Tour oder pro km) hinterlegen, monatliche Abrechnung mit Auslagen und Verpflegungspauschale als PDF erstellen. Neuer Menüpunkt „Fahrer-Abrechnung“."
          />
          <Module
            name="moduleBankImport"
            title="Zahlungsabgleich"
            checked={o.moduleBankImport}
            text="Kontoauszug (CSV oder CAMT.053 aus dem Online-Banking) hochladen – Zahlungen werden offenen Rechnungen zugeordnet und mit einem Klick als bezahlt markiert. Erreichbar unter Rechnungen."
          />
          <Module
            name="moduleFleet"
            title="Führerscheine & Überführungskennzeichen"
            checked={o.moduleFleet}
            text="Führerscheinkontrolle der Fahrer mit Erinnerung sowie rote Kennzeichen/Kurzzeitkennzeichen mit Ablaufdatum und Zuordnung zum Auftrag. Hinweise erscheinen nur, wenn etwas abläuft."
          />
          <Module
            name="moduleReviews"
            title="Bewertung nach Zustellung"
            checked={o.moduleReviews}
            text="Nach der Übergabe erhält der Kunde per E-Mail eine kurze Zufriedenheitsabfrage (1–5 Sterne). Zufriedene Kunden werden zu deinem Bewertungsprofil weitergeleitet, Kritik landet intern beim Auftrag."
          >
            <label htmlFor="reviewUrl">Link zum Bewertungsprofil (z. B. Google)</label>
            <input id="reviewUrl" name="reviewUrl" defaultValue={o.reviewUrl ?? ""} placeholder="https://g.page/r/…/review" className="input" />
            <p className="mt-1 text-xs text-slate-500">Google Unternehmensprofil → „Nach Rezensionen fragen“ → Link kopieren.</p>
          </Module>
        </fieldset>
        {!readOnly && <SubmitButton>Module speichern</SubmitButton>}
      </ActionForm>
    </>
  );
}
