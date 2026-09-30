import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOffice } from "@/lib/permissions";
import { formatDate, orderNo, toDateInput } from "@/lib/format";
import { DUE_LABEL, PLATE_KIND, dueState, licenseState, nextLicenseCheck } from "@/lib/fleet";
import { Card, PageHeader } from "@/components/ui";
import { SettingsNav } from "@/components/settings-nav";
import { SubmitButton } from "@/components/submit-button";
import { saveLicense, savePlate, togglePlate } from "./actions";

export const metadata = { title: "Kennzeichen & Führerscheine" };

export default async function FleetPage() {
  const ctx = await requireOffice();
  if (!ctx.org.moduleFleet) redirect("/settings/modules");
  const [members, plates] = await Promise.all([
    db.membership.findMany({ where: { organizationId: ctx.orgId }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    db.tradePlate.findMany({
      where: { organizationId: ctx.orgId },
      include: { orders: { where: { status: { in: ["PLANNED", "IN_TRANSIT"] } }, orderBy: { pickupDate: "asc" }, take: 3 } },
      orderBy: [{ active: "desc" }, { plate: "asc" }],
    }),
  ]);
  return (
    <>
      <PageHeader title="Einstellungen" subtitle="Führerscheinkontrolle und Überführungskennzeichen – Hinweise erscheinen nur, wenn etwas abläuft." />
      <SettingsNav active="fleet" fleet />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Führerscheinkontrolle">
          <p className="mb-3 text-xs text-slate-500">Als Halter/Arbeitgeber regelmäßig prüfen (Empfehlung: alle 6 Monate). „Heute kontrolliert“ setzt das Datum.</p>
          <ul className="-my-2 divide-y divide-slate-100">
            {members.map((m) => {
              const st = licenseState(m);
              return (
                <li key={m.id} className="py-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium">{m.user.name ?? m.user.email}</span>
                    <span className={`badge ${DUE_LABEL[st].cls}`}>{DUE_LABEL[st].text}</span>
                  </div>
                  <form action={saveLicense} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <input type="hidden" name="id" value={m.id} />
                    <div>
                      <label className="text-xs">Klassen</label>
                      <input name="licenseClasses" defaultValue={m.licenseClasses ?? ""} placeholder="B, BE" className="input py-1.5" />
                    </div>
                    <div>
                      <label className="text-xs">gültig bis</label>
                      <input type="date" name="licenseExpiry" defaultValue={toDateInput(m.licenseExpiry)} className="input py-1.5" />
                    </div>
                    <div>
                      <label className="text-xs">kontrolliert am</label>
                      <input type="date" name="licenseCheckedAt" defaultValue={toDateInput(m.licenseCheckedAt)} className="input py-1.5" />
                    </div>
                    <div className="flex items-end gap-1">
                      <SubmitButton className="btn-secondary px-2 py-1.5 text-xs">Speichern</SubmitButton>
                      <button name="checkedToday" value="1" className="btn-secondary px-2 py-1.5 text-xs">
                        Heute kontrolliert
                      </button>
                    </div>
                  </form>
                  {m.licenseCheckedAt && <p className="mt-1 text-xs text-slate-500">Nächste Kontrolle: {formatDate(nextLicenseCheck(m.licenseCheckedAt))}</p>}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Überführungskennzeichen">
          <ul className="-my-2 divide-y divide-slate-100">
            {plates.map((p) => {
              const st = p.validUntil ? dueState(p.validUntil) : "ok";
              return (
                <li key={p.id} className={`py-3 ${p.active ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="rounded border border-red-300 bg-white px-2 font-mono font-semibold text-red-700">{p.plate}</span>{" "}
                      <span className="text-sm text-slate-500">{PLATE_KIND[p.kind]}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {p.validUntil && <span className={`badge ${DUE_LABEL[st].cls}`}>bis {formatDate(p.validUntil)}</span>}
                      <form action={togglePlate}>
                        <input type="hidden" name="id" value={p.id} />
                        <SubmitButton className="text-xs text-slate-500 underline">{p.active ? "stilllegen" : "reaktivieren"}</SubmitButton>
                      </form>
                    </span>
                  </div>
                  {p.orders.length > 0 && <p className="mt-1 text-xs text-slate-500">Geplant für: {p.orders.map((o) => orderNo(o.number)).join(", ")}</p>}
                  {p.notes && <p className="mt-1 text-xs text-slate-500">{p.notes}</p>}
                </li>
              );
            })}
            {plates.length === 0 && <li className="py-2 text-sm text-slate-500">Noch keine Kennzeichen erfasst.</li>}
          </ul>
          <form action={savePlate} className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <input name="plate" required placeholder="z. B. B-06123" className="input mt-0 font-mono uppercase" aria-label="Kennzeichen" />
            <select name="kind" className="input mt-0" aria-label="Art">
              {Object.entries(PLATE_KIND).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input type="date" name="validUntil" className="input mt-0" aria-label="gültig bis" />
            <input name="notes" placeholder="Notiz (z. B. Fahrzeugscheinheft Nr.)" className="input mt-0" />
            <SubmitButton className="btn-primary sm:col-span-2 sm:justify-self-start">Kennzeichen hinzufügen</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
