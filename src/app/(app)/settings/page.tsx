import { canManage, requireCtx } from "@/lib/org";
import { toNumber } from "@/lib/format";
import { RETURN_TYPE } from "@/lib/labels";
import { appUrl } from "@/lib/mail";
import { LogoField } from "@/components/logo-field";
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
              <LogoField currentUrl={o.logoFileId ? `/api/files/${o.logoFileId}` : null} />
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

          <Card title="Rückreise & Spesen">
            <p className="mb-4 text-sm text-slate-500">
              Standard für neue Aufträge. Pro Kunde kann das unter „Konditionen“ abweichend eingestellt werden, pro Auftrag ebenfalls.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="defaultReturnType">Rückreise des Fahrers</label>
                <select id="defaultReturnType" name="defaultReturnType" defaultValue={o.defaultReturnType} className="input">
                  {Object.entries(RETURN_TYPE).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <Field label="Pauschale Rückreise (€ netto)" name="defaultReturnFlat" defaultValue={o.defaultReturnFlat ? toNumber(o.defaultReturnFlat) : ""} inputMode="decimal" />
              <Field label="Rückreise je km (€ netto)" name="defaultReturnPerKm" defaultValue={o.defaultReturnPerKm ? toNumber(o.defaultReturnPerKm) : ""} inputMode="decimal" />
              <label className="flex items-center gap-2 font-normal sm:col-span-3">
                <input type="checkbox" name="perDiemEnabled" defaultChecked={o.perDiemEnabled} className="h-4 w-4 accent-brand-600" />
                Verpflegungspauschale bei den Belegen automatisch vorschlagen
              </label>
              <Field label="Kleine Pauschale (> 8 Std., An-/Abreisetag)" name="perDiemPartial" defaultValue={toNumber(o.perDiemPartial)} inputMode="decimal" />
              <Field label="Große Pauschale (voller Tag)" name="perDiemFull" defaultValue={toNumber(o.perDiemFull)} inputMode="decimal" />
            </div>
          </Card>

          <Card title="Angebote">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Präfix Angebotsnummer" name="quotePrefix" defaultValue={o.quotePrefix} hint={`Beispiel: ${o.quotePrefix}${new Date().getFullYear()}-${String(o.nextQuoteNumber).padStart(4, "0")}`} />
              <Field label="Nächste laufende Nummer" name="nextQuoteNumber" type="number" min={1} defaultValue={o.nextQuoteNumber} />
              <Field label="Gültigkeit (Tage)" name="quoteValidDays" type="number" min={1} defaultValue={o.quoteValidDays} />
            </div>
          </Card>

          <Card title="Mahnwesen">
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Gebühr Zahlungserinnerung (€)" name="dunningFee1" defaultValue={toNumber(o.dunningFee1)} inputMode="decimal" />
              <Field label="Gebühr 1. Mahnung (€)" name="dunningFee2" defaultValue={toNumber(o.dunningFee2)} inputMode="decimal" />
              <Field label="Gebühr 2. Mahnung (€)" name="dunningFee3" defaultValue={toNumber(o.dunningFee3)} inputMode="decimal" />
              <Field label="Neue Zahlungsfrist (Tage)" name="dunningDays" type="number" min={1} defaultValue={o.dunningDays} />
            </div>
          </Card>

          <Card title="Kundenservice">
            <div className="space-y-4">
              <label className="flex items-start gap-2 font-normal">
                <input type="checkbox" name="notifyCustomerOnStatus" defaultChecked={o.notifyCustomerOnStatus} className="mt-0.5 h-4 w-4 accent-brand-600" />
                <span>
                  Kunden bei Abholung und Zustellung automatisch per E-Mail informieren
                  <span className="block text-xs text-slate-500">
                    Mit Status-Link; bei der Zustellung wird das Übergabeprotokoll angehängt. Voraussetzung: E-Mail-Versand (SMTP) ist eingerichtet und beim Kunden ist eine E-Mail-Adresse hinterlegt.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 font-normal">
                <input type="checkbox" name="requestEnabled" defaultChecked={o.requestEnabled} className="mt-0.5 h-4 w-4 accent-brand-600" />
                <span>
                  Öffentliches Anfrageformular aktivieren
                  <span className="block text-xs text-slate-500">Kunden können über einen Link oder auf deiner Website Überführungen anfragen. Anfragen landen unter „Angebote → Anfragen“.</span>
                </span>
              </label>
              {o.requestEnabled && o.requestToken && (
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="font-medium">Link zum Formular</p>
                  <input readOnly value={`${appUrl()}/anfrage/${o.requestToken}`} className="input font-mono text-xs" aria-label="Link zum Anfrageformular" />
                  <p className="mt-3 font-medium">Auf der eigenen Website einbinden</p>
                  <textarea
                    readOnly
                    rows={3}
                    className="input font-mono text-xs"
                    aria-label="HTML-Code zum Einbinden"
                    value={`<iframe src="${appUrl()}/anfrage/${o.requestToken}?embed=1" style="width:100%;min-height:1100px;border:0" title="Überführung anfragen"></iframe>`}
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Den Code einfach in eine Seite deiner Website (z. B. WordPress-Block „Individuelles HTML“) einfügen. Deaktivieren macht den Link sofort unbrauchbar.
                  </p>
                </div>
              )}
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
