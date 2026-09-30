import { db } from "@/lib/db";
import { canManage, requireCtx } from "@/lib/org";
import { appUrl } from "@/lib/mail";
import { Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CopyField } from "@/components/copy-field";
import { removeCalendarToken, resetCalendarToken } from "../actions";

export const metadata = { title: "Kalender-Abo einrichten" };

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  );
}

export default async function CalendarSetupPage() {
  const ctx = await requireCtx();
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  const token = user.calendarToken;
  const mine = token ? `${appUrl()}/api/calendar/${token}.ics` : null;
  const all = mine && canManage(ctx.role) ? `${mine}?scope=all` : null;
  const webcal = (url: string) => url.replace(/^https?:\/\//, "webcal://");

  return (
    <>
      <PageHeader
        title="Kalender-Abo einrichten"
        subtitle="Touren automatisch im iPhone-, Google- oder Outlook-Kalender – ohne doppelte Eingabe."
        back={{ href: "/calendar", label: "Kalender" }}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="1. Persönlichen Link erzeugen">
            {!token ? (
              <form action={resetCalendarToken} className="space-y-3">
                <p className="text-sm text-slate-600">
                  Der Link ist persönlich und geheim: Wer ihn kennt, kann deine Touren lesen (nur lesen, nichts ändern). Du kannst ihn jederzeit erneuern.
                </p>
                <SubmitButton>Kalender-Link erzeugen</SubmitButton>
              </form>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-sm font-medium">Meine Touren</p>
                  <CopyField value={mine!} label="Kalender-Link meine Touren" />
                  <a href={webcal(mine!)} className="btn-primary mt-2">
                    Auf diesem iPhone/iPad/Mac abonnieren
                  </a>
                </div>
                {all && (
                  <div>
                    <p className="mb-1 text-sm font-medium">Alle Touren (Disposition)</p>
                    <CopyField value={all} label="Kalender-Link alle Touren" />
                    <p className="mt-1 text-xs text-slate-500">Enthält die Touren aller Fahrer mit dem Fahrernamen im Titel – nur für Inhaber und Administratoren.</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <form action={resetCalendarToken}>
                    <SubmitButton className="btn-secondary" confirm="Neuen Link erzeugen? Bestehende Abos funktionieren dann nicht mehr und müssen neu eingerichtet werden.">
                      Link erneuern
                    </SubmitButton>
                  </form>
                  <form action={removeCalendarToken}>
                    <SubmitButton className="btn-secondary text-red-600" confirm="Kalender-Abo deaktivieren?">
                      Deaktivieren
                    </SubmitButton>
                  </form>
                </div>
              </div>
            )}
          </Card>

          <Card title="2. Im Kalender abonnieren">
            <div className="space-y-5">
              <section>
                <h3 className="mb-2 font-semibold">iPhone &amp; iPad</h3>
                <Steps
                  items={[
                    <>Am einfachsten: diese Seite auf dem iPhone öffnen und auf <strong>„Auf diesem iPhone/iPad/Mac abonnieren“</strong> tippen, dann <strong>Abonnieren</strong>.</>,
                    <>Alternativ: Link kopieren → <strong>Einstellungen</strong> → <strong>Kalender</strong> → <strong>Accounts</strong> → <strong>Account hinzufügen</strong> → <strong>Andere</strong> → <strong>Kalenderabo hinzufügen</strong> → Link einfügen → <strong>Weiter</strong> → <strong>Sichern</strong>.</>,
                    <>Aktualisierung einstellen: Einstellungen → Kalender → Accounts → <strong>Datenabgleich</strong> → z. B. „Alle 15 Minuten“.</>,
                  ]}
                />
              </section>
              <section>
                <h3 className="mb-2 font-semibold">Mac (Kalender-App)</h3>
                <Steps items={[<>Auf den Abonnieren-Knopf klicken oder in der Kalender-App <strong>Ablage → Neues Kalenderabonnement</strong> wählen und den Link einfügen.</>, <>Bei „Automatisch aktualisieren“ z. B. <strong>Alle 15 Minuten</strong> wählen.</>]} />
              </section>
              <section>
                <h3 className="mb-2 font-semibold">Google Kalender (auch Android)</h3>
                <Steps
                  items={[
                    <>
                      Am Computer{" "}
                      <a href="https://calendar.google.com/calendar/r/settings/addbyurl" target="_blank" rel="noreferrer" className="font-medium text-brand-600">
                        Google Kalender → „Per URL hinzufügen“
                      </a>{" "}
                      öffnen (geht nicht in der Android-App selbst).
                    </>,
                    <>Link einfügen → <strong>Kalender hinzufügen</strong>.</>,
                    <>Auf dem Android-Handy erscheint der Kalender danach automatisch (ggf. in der Kalender-App unter Einstellungen einblenden/synchronisieren).</>,
                    <>Hinweis: Google aktualisiert abonnierte Kalender nur alle paar Stunden – kurzfristige Änderungen siehst du sofort in der App unter „Heute“.</>,
                  ]}
                />
              </section>
              <section>
                <h3 className="mb-2 font-semibold">Outlook</h3>
                <Steps
                  items={[
                    <><strong>Outlook im Web / neues Outlook:</strong> Kalender → <strong>Kalender hinzufügen</strong> → <strong>Aus dem Internet abonnieren</strong> → Link einfügen → Name vergeben → <strong>Importieren</strong>.</>,
                    <><strong>Klassisches Outlook (Windows):</strong> Kalender → <strong>Kalender hinzufügen</strong> → <strong>Aus dem Internet…</strong> → Link einfügen → <strong>OK</strong> → <strong>Ja</strong>.</>,
                  ]}
                />
              </section>
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Gut zu wissen">
            <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
              <li>Der Kalender ist <strong>nur zum Lesen</strong>. Termine änderst du in der App (Kalender → Umplanen oder im Auftrag).</li>
              <li>Jede Tour enthält Abhol- und Zieladresse, Ansprechpartner, Telefon und einen Link zum Auftrag.</li>
              <li>Stornierte Aufträge werden im Kalender als abgesagt markiert.</li>
              <li>Link versehentlich weitergegeben? Einfach <strong>„Link erneuern“</strong> – der alte funktioniert dann nicht mehr.</li>
              <li>Jeder Fahrer richtet sein eigenes Abo ein (eigene Anmeldung → Kalender → Kalender-Abo).</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
