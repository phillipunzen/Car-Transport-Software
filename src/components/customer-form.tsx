"use client";

import { useState } from "react";
import type { Customer } from "@prisma/client";
import { ActionForm, type FormState } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";

function Input({ label, name, defaultValue, required, type = "text", className = "" }: { label: string; name: string; defaultValue?: string | null; required?: boolean; type?: string; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={name}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input id={name} name={name} type={type} defaultValue={defaultValue ?? ""} required={required} className="input" />
    </div>
  );
}

export function CustomerForm({
  action,
  customer,
  returnTo,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  customer?: Customer;
  returnTo?: string;
}) {
  const [type, setType] = useState(customer?.type ?? "COMPANY");
  return (
    <ActionForm action={action}>
      {customer && <input type="hidden" name="id" value={customer.id} />}
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <input type="hidden" name="type" value={type} />
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
        {(["COMPANY", "PRIVATE"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${type === t ? "bg-white shadow-sm" : "text-slate-500"}`}
          >
            {t === "COMPANY" ? "Firma" : "Privatperson"}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {type === "COMPANY" && <Input label="Firmenname" name="companyName" defaultValue={customer?.companyName} required className="sm:col-span-2" />}
        <Input label={type === "COMPANY" ? "Ansprechpartner Vorname" : "Vorname"} name="firstName" defaultValue={customer?.firstName} />
        <Input label={type === "COMPANY" ? "Ansprechpartner Nachname" : "Nachname"} name="lastName" defaultValue={customer?.lastName} required={type === "PRIVATE"} />
        <Input label="E-Mail" name="email" type="email" defaultValue={customer?.email} />
        <Input label="Telefon" name="phone" type="tel" defaultValue={customer?.phone} />
        <Input label="Straße & Hausnummer" name="street" defaultValue={customer?.street} className="sm:col-span-2" />
        <Input label="PLZ" name="zip" defaultValue={customer?.zip} />
        <Input label="Ort" name="city" defaultValue={customer?.city} />
        <Input label="Land" name="country" defaultValue={customer?.country ?? "Deutschland"} />
        {type === "COMPANY" && <Input label="USt-IdNr." name="vatId" defaultValue={customer?.vatId} />}
        <div className="sm:col-span-2">
          <label htmlFor="notes">Notizen</label>
          <textarea id="notes" name="notes" rows={3} defaultValue={customer?.notes ?? ""} className="input" />
        </div>
      </div>
      <SubmitButton>{customer ? "Speichern" : "Kunde anlegen"}</SubmitButton>
    </ActionForm>
  );
}
