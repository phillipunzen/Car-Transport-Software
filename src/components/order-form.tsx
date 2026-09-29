"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm, type FormState } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { VehicleScan } from "@/components/vehicle-scan";
import { TRANSPORT_MODE } from "@/lib/labels";

export type OrderFormValues = Partial<Record<string, string>>;

function F({ label, name, v, type = "text", className = "", required, ...rest }: { label: string; name: string; v?: OrderFormValues; type?: string; className?: string; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <label htmlFor={name}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input id={name} name={name} type={type} defaultValue={v?.[name] ?? ""} required={required} className="input" {...rest} />
    </div>
  );
}

function AddressBlock({ prefix, title, v }: { prefix: "pickup" | "delivery"; title: string; v?: OrderFormValues }) {
  return (
    <fieldset className="space-y-4">
      <legend className="section-title mb-2">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Name / Firma" name={`${prefix}Name`} v={v} className="sm:col-span-2" />
        <F label="Straße & Hausnummer" name={`${prefix}Street`} v={v} className="sm:col-span-2" autoComplete="off" />
        <F label="PLZ" name={`${prefix}Zip`} v={v} inputMode="numeric" />
        <F label="Ort" name={`${prefix}City`} v={v} />
        <F label="Ansprechpartner" name={`${prefix}Contact`} v={v} />
        <F label="Telefon" name={`${prefix}Phone`} v={v} type="tel" />
        <F label={prefix === "pickup" ? "Abholtermin" : "Zustelltermin"} name={`${prefix}Date`} v={v} type="datetime-local" className="sm:col-span-2" />
      </div>
    </fieldset>
  );
}

const VEHICLE_FIELDS = ["licensePlate", "make", "model", "vin", "color", "firstRegistration"] as const;

export function OrderForm({
  action,
  values,
  customers,
  members,
  orderId,
  aiEnabled,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  values?: OrderFormValues;
  customers: { id: string; name: string }[];
  members: { id: string; name: string }[];
  orderId?: string;
  aiEnabled: boolean;
}) {
  const [vehicle, setVehicle] = useState<Record<string, string>>(() =>
    Object.fromEntries(VEHICLE_FIELDS.map((k) => [k, values?.[k] ?? ""])),
  );
  const [pricing, setPricing] = useState(values?.pricingType ?? "FLAT");
  const set = (k: string, val: string) => setVehicle((s) => ({ ...s, [k]: val }));

  return (
    <ActionForm action={action} className="space-y-6">
      {orderId && <input type="hidden" name="id" value={orderId} />}

      <section className="card card-body space-y-4">
        <h2 className="section-title">Auftrag</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="customerId">
              Kunde <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <select id="customerId" name="customerId" defaultValue={values?.customerId ?? ""} required className="input">
                <option value="">Bitte wählen…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {!orderId && (
                <Link href="/customers/new?returnTo=order" className="btn-secondary mt-1 shrink-0">
                  + Neu
                </Link>
              )}
            </div>
          </div>
          <div>
            <label htmlFor="transportMode">Überführungsart</label>
            <select id="transportMode" name="transportMode" defaultValue={values?.transportMode ?? "DRIVEN"} className="input">
              {Object.entries(TRANSPORT_MODE).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <F label="Referenz / Bestellnr. des Kunden" name="reference" v={values} />
          <div className="sm:col-span-2">
            <label htmlFor="assignedToId">Fahrer</label>
            <select id="assignedToId" name="assignedToId" defaultValue={values?.assignedToId ?? ""} className="input">
              <option value="">Nicht zugewiesen</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="card card-body space-y-4">
        <h2 className="section-title">Fahrzeug</h2>
        {aiEnabled && (
          <VehicleScan
            orderId={orderId}
            onResult={(d) =>
              setVehicle((s) => ({
                licensePlate: d.licensePlate ?? s.licensePlate,
                make: d.make ?? s.make,
                model: d.model ?? s.model,
                vin: d.vin ?? s.vin,
                color: d.color ?? s.color,
                firstRegistration: d.firstRegistration ?? s.firstRegistration,
              }))
            }
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["licensePlate", "Kennzeichen"],
              ["vin", "Fahrgestellnummer (FIN)"],
              ["make", "Marke"],
              ["model", "Modell"],
              ["color", "Farbe"],
              ["firstRegistration", "Erstzulassung"],
            ] as const
          ).map(([k, label]) => (
            <div key={k}>
              <label htmlFor={k}>{label}</label>
              <input
                id={k}
                name={k}
                value={vehicle[k]}
                onChange={(e) => set(k, e.target.value)}
                className={`input ${k === "licensePlate" || k === "vin" ? "font-mono uppercase" : ""}`}
                maxLength={k === "vin" ? 17 : undefined}
              />
            </div>
          ))}
          <F label="Fahrzeugtyp (z. B. PKW, Transporter, Wohnmobil)" name="vehicleType" v={values} className="sm:col-span-2" />
        </div>
      </section>

      <section className="card card-body grid gap-8 lg:grid-cols-2">
        <AddressBlock prefix="pickup" title="Abholung" v={values} />
        <AddressBlock prefix="delivery" title="Zustellung" v={values} />
      </section>

      <section className="card card-body space-y-4">
        <h2 className="section-title">Preis</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="pricingType">Abrechnung</label>
            <select id="pricingType" name="pricingType" value={pricing} onChange={(e) => setPricing(e.target.value)} className="input">
              <option value="FLAT">Pauschalpreis</option>
              <option value="PER_KM">Nach Kilometern</option>
            </select>
          </div>
          <F label="Entfernung (km)" name="distanceKm" v={values} inputMode="decimal" />
          {pricing === "FLAT" ? (
            <F label="Pauschale netto (€)" name="price" v={values} inputMode="decimal" />
          ) : (
            <F label="Preis je km netto (€)" name="pricePerKm" v={values} inputMode="decimal" />
          )}
        </div>
        <div>
          <label htmlFor="notes">Notizen / Hinweise für den Fahrer</label>
          <textarea id="notes" name="notes" rows={3} defaultValue={values?.notes ?? ""} className="input" />
        </div>
      </section>

      <div className="flex gap-2">
        <SubmitButton>{orderId ? "Speichern" : "Auftrag anlegen"}</SubmitButton>
        <Link href={orderId ? `/orders/${orderId}` : "/orders"} className="btn-secondary">
          Abbrechen
        </Link>
      </div>
    </ActionForm>
  );
}
