"use client";

import { useActionState, useState } from "react";
import { submitInquiry, submitPortalInquiry } from "@/app/anfrage/actions";
import { TRANSPORT_MODE } from "@/lib/labels";
import type { FormState } from "@/components/action-form";

/** Öffentliches Anfrageformular (ohne Anmeldung). */
export function InquiryForm({
  token,
  company,
  portal = false,
  defaults = {},
}: {
  token: string;
  company: string;
  /** Aus dem Kundenportal: Kontaktdaten sind bekannt */
  portal?: boolean;
  defaults?: Partial<Record<"contactName" | "companyName" | "email" | "phone", string>>;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(portal ? submitPortalInquiry : submitInquiry, undefined);
  const [ts] = useState(() => Date.now());

  if (state?.ok) {
    return (
      <div className="card card-body text-center">
        <p className="text-4xl">✓</p>
        <p className="mt-2 text-lg font-semibold">{state.ok}</p>
      </div>
    );
  }

  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={props.className}>
      <label htmlFor={name}>
        {label}
        {props.required && <span className="text-red-500"> *</span>}
      </label>
      <input id={name} name={name} defaultValue={defaults[name as keyof typeof defaults]} {...props} className="input" />
    </div>
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="ts" value={ts} />
      {/* Honeypot für Bots – für Menschen unsichtbar */}
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <section className="card card-body space-y-4">
        <h2 className="section-title">Ihre Kontaktdaten</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("contactName", "Name", { required: true, autoComplete: "name" })}
          {field("companyName", "Firma", { autoComplete: "organization" })}
          {field("email", "E-Mail", { required: true, type: "email", autoComplete: "email" })}
          {field("phone", "Telefon", { type: "tel", autoComplete: "tel" })}
        </div>
      </section>

      <section className="card card-body space-y-4">
        <h2 className="section-title">Überführung</h2>
        <div>
          <label htmlFor="transportMode">Art</label>
          <select id="transportMode" name="transportMode" className="input" defaultValue="DRIVEN">
            {Object.entries(TRANSPORT_MODE).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <fieldset className="space-y-3">
            <legend className="mb-2 font-semibold">Abholung</legend>
            {field("pickupStreet", "Straße & Hausnummer")}
            <div className="grid grid-cols-3 gap-3">
              {field("pickupZip", "PLZ", { inputMode: "numeric" })}
              {field("pickupCity", "Ort", { required: true, className: "col-span-2" })}
            </div>
            {field("pickupDate", "Wunschtermin", { type: "date" })}
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="mb-2 font-semibold">Ziel</legend>
            {field("deliveryStreet", "Straße & Hausnummer")}
            <div className="grid grid-cols-3 gap-3">
              {field("deliveryZip", "PLZ", { inputMode: "numeric" })}
              {field("deliveryCity", "Ort", { required: true, className: "col-span-2" })}
            </div>
            {field("deliveryDate", "Spätestens am", { type: "date" })}
          </fieldset>
        </div>
      </section>

      <section className="card card-body space-y-4">
        <h2 className="section-title">Fahrzeug</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("make", "Marke")}
          {field("model", "Modell")}
          {field("licensePlate", "Kennzeichen")}
          {field("vin", "Fahrgestellnummer (optional)", { maxLength: 17 })}
        </div>
        <div>
          <label htmlFor="notes">Hinweise</label>
          <textarea id="notes" name="notes" rows={3} className="input" placeholder="z. B. nicht fahrbereit, Schlüsselübergabe, Zeitfenster …" />
        </div>
      </section>

      <label className="flex items-start gap-2 text-sm font-normal">
        <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 accent-brand-600" />
        <span>Ich bin einverstanden, dass {company} meine Angaben zur Bearbeitung dieser Anfrage speichert und mich dazu kontaktiert.</span>
      </label>
      {state?.error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full py-3 text-base">
        {pending ? "Wird gesendet…" : "Unverbindlich anfragen"}
      </button>
    </form>
  );
}
