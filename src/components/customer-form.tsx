"use client";

import { useState } from "react";
import type { Customer } from "@prisma/client";
import { RETURN_TYPE } from "@/lib/labels";
import type { toPlain } from "@/lib/plain";

type PlainCustomer = ReturnType<typeof toPlain<Customer>>;
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
  customer?: PlainCustomer;
  returnTo?: string;
}) {
  const [type, setType] = useState(customer?.type ?? "COMPANY");
  const [returnType, setReturnType] = useState(customer?.returnType ?? "");
  const hasConditions = Boolean(
    customer && (customer.pricePerKm || customer.paymentTermDays !== null || customer.discountPercent || customer.returnType || customer.buyerReference),
  );
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

      <details open={hasConditions} className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Konditionen für diesen Kunden (optional)</summary>
        <p className="mt-1 text-xs text-slate-500">Leere Felder = Standard aus den Einstellungen. Die Werte werden bei neuen Aufträgen, Angeboten und Rechnungen automatisch verwendet.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Input label="Preis je km netto (€)" name="pricePerKm" defaultValue={customer?.pricePerKm} />
          <Input label="Zahlungsziel (Tage)" name="paymentTermDays" type="number" defaultValue={customer?.paymentTermDays?.toString()} />
          <Input label="Skonto (%)" name="discountPercent" defaultValue={customer?.discountPercent} />
          <Input label="Skonto-Frist (Tage)" name="discountDays" type="number" defaultValue={customer?.discountDays?.toString()} />
          <div>
            <label htmlFor="returnType">Rückreise des Fahrers</label>
            <select id="returnType" name="returnType" value={returnType} onChange={(e) => setReturnType(e.target.value)} className="input">
              <option value="">Standard</option>
              {Object.entries(RETURN_TYPE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {returnType === "FLAT" && <Input label="Rückreise-Pauschale netto (€)" name="returnFlat" defaultValue={customer?.returnFlat} />}
          {returnType === "PER_KM" && <Input label="Rückreise je km netto (€)" name="returnPerKm" defaultValue={customer?.returnPerKm} />}
          {type === "COMPANY" && (
            <Input label="Leitweg-ID / Käuferreferenz (E-Rechnung)" name="buyerReference" defaultValue={customer?.buyerReference} className="sm:col-span-2" />
          )}
        </div>
      </details>
      <SubmitButton>{customer ? "Speichern" : "Kunde anlegen"}</SubmitButton>
    </ActionForm>
  );
}
