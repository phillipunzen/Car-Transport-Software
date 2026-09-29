import { canManage, requireCtx } from "@/lib/org";
import { toNumber } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, PageHeader, TextArea } from "@/components/ui";
import { SettingsNav } from "@/components/settings-nav";
import { saveSettings } from "./actions";

export const metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const ctx = await requireCtx();
  const o = ctx.org;
  const readOnly = !canManage(ctx.role);
  return (
    <>
      <PageHeader title="Einstellungen" subtitle="Diese Angaben erscheinen automatisch auf Rechnungen und Protokollen." />
      <SettingsNav active="company" />
      {readOnly && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">Nur Inhaber und Administratoren können diese Angaben ändern.</p>}
      <ActionForm action={saveSettings} className="space-y-6">
        <fieldset disabled={readOnly} className="space-y-6">
          <Card title="Firma (Absender)">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Firmenname" name="companyName" defaultValue={o.companyName ?? o.name} required className="sm:col-span-2" />
              <Field label="Inhaber / Geschäftsführer" name="ownerName" defaultValue={o.ownerName} />
              <Field label="Telefon" name="phone" defaultValue={o.phone} />
              <Field label="Straße & Hausnummer" name="street" defaultValue={o.street} className="sm:col-span-2" />
              <Field label="PLZ" name="zip" defaultValue={o.zip} />
              <Field label="Ort" name="city" defaultValue={o.city} />
              <Field label="Land" name="country" defaultValue={o.country} />
              <Field label="E-Mail" name="email" type="email" defaultValue={o.email} />
              <Field label="Website" name="website" defaultValue={o.website} />
              <div>
                <label htmlFor="logo">Logo (PNG/JPG)</label>
                <input id="logo" name="logo" type="file" accept="image/png,image/jpeg" className="input file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1" />
                {o.logoFileId && (
                  <div className="mt-2 flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${o.logoFileId}`} alt="Logo" className="h-10 rounded border border-slate-200 bg-white object-contain p-1" />
                    <label className="flex items-center gap-1 text-xs font-normal">
                      <input type="checkbox" name="removeLogo" /> entfernen
                    </label>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card title="Steuer & Bank">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Steuernummer" name="taxNumber" defaultValue={o.taxNumber} />
              <Field label="USt-IdNr." name="vatId" defaultValue={o.vatId} />
              <Field label="Bank" name="bankName" defaultValue={o.bankName} />
              <Field label="Kontoinhaber" name="accountHolder" defaultValue={o.accountHolder} />
              <Field label="IBAN" name="iban" defaultValue={o.iban} className="font-mono" />
              <Field label="BIC" name="bic" defaultValue={o.bic} />
            </div>
          </Card>

          <Card title="Rechnungen">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Präfix Rechnungsnummer" name="invoicePrefix" defaultValue={o.invoicePrefix} hint={`Beispiel: ${o.invoicePrefix}${new Date().getFullYear()}-${String(o.nextInvoiceNumber).padStart(4, "0")}`} />
              <Field label="Nächste laufende Nummer" name="nextInvoiceNumber" type="number" min={1} defaultValue={o.nextInvoiceNumber} />
              <Field label="Zahlungsziel (Tage)" name="paymentTermDays" type="number" min={0} defaultValue={o.paymentTermDays} />
              <Field label="Standard-USt-Satz (%)" name="defaultVatRate" defaultValue={toNumber(o.defaultVatRate)} inputMode="decimal" />
              <Field label="Standardpreis je km (€ netto)" name="defaultPricePerKm" defaultValue={o.defaultPricePerKm ? toNumber(o.defaultPricePerKm) : ""} inputMode="decimal" />
              <label className="flex items-center gap-2 self-end pb-3 font-normal">
                <input type="checkbox" name="smallBusiness" defaultChecked={o.smallBusiness} className="h-4 w-4 accent-brand-600" />
                Kleinunternehmer (§ 19 UStG)
              </label>
              <TextArea label="Einleitungstext" name="invoiceIntroText" defaultValue={o.invoiceIntroText} className="sm:col-span-3" placeholder="Vielen Dank für Ihren Auftrag. Wir berechnen Ihnen folgende Leistungen:" />
              <TextArea label="Weiterer Infotext / Schlusstext" name="invoiceFooterText" defaultValue={o.invoiceFooterText} className="sm:col-span-3" placeholder="z. B. Wir freuen uns auf die weitere Zusammenarbeit." />
            </div>
          </Card>

          <Card title="Übergabeprotokolle">
            <TextArea
              label="Hinweistext / Bedingungen (erscheint über den Unterschriften)"
              name="protocolTerms"
              defaultValue={o.protocolTerms}
              rows={4}
              placeholder="z. B. Verdeckte Mängel sowie Schäden durch Verschmutzung sind von der Prüfung ausgenommen."
            />
          </Card>
        </fieldset>
        {!readOnly && <SubmitButton>Einstellungen speichern</SubmitButton>}
      </ActionForm>
    </>
  );
}
