import Link from "next/link";
import { db } from "@/lib/db";
import { requireOffice } from "@/lib/permissions";
import { customerName, formatMoney, formatNumber, toNumber } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { deleteTemplate, renameTemplate } from "./actions";

export const metadata = { title: "Vorlagen" };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const ctx = await requireOffice();
  const { saved } = await searchParams;
  const templates = await db.routeTemplate.findMany({ where: { organizationId: ctx.orgId }, include: { customer: true }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Vorlagen für Strecken" subtitle="Wiederkehrende Überführungen mit einem Klick anlegen" back={{ href: "/orders", label: "Aufträge" }} />
      {saved && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Vorlage gespeichert.</p>}
      {templates.length === 0 ? (
        <Empty title="Noch keine Vorlagen" text="Öffne einen Auftrag und wähle unter „Weitere Aktionen“ „Als Vorlage speichern“." />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <form action={renameTemplate} className="flex gap-2">
                  <input type="hidden" name="id" value={t.id} />
                  <input name="name" defaultValue={t.name} aria-label="Name der Vorlage" className="input mt-0 font-medium" />
                  <SubmitButton className="btn-ghost px-2 text-xs">Umbenennen</SubmitButton>
                </form>
                <p className="mt-1 text-xs text-slate-500">
                  {t.pickupCity ?? "?"} → {t.deliveryCity ?? "?"}
                  {t.distanceKm && ` · ${formatNumber(toNumber(t.distanceKm), 0)} km`}
                  {t.customer && ` · ${customerName(t.customer)}`}
                  {t.pricingType === "FLAT" && t.price && ` · ${formatMoney(t.price)}`}
                  {t.pricingType === "PER_KM" && t.pricePerKm && ` · ${formatMoney(t.pricePerKm)}/km`}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link href={`/orders/new?template=${t.id}`} className="btn-primary">
                  Auftrag anlegen
                </Link>
                <form action={deleteTemplate}>
                  <input type="hidden" name="id" value={t.id} />
                  <SubmitButton className="btn-secondary text-red-600" confirm="Vorlage löschen?">
                    Löschen
                  </SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
