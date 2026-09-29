"use client";

import type { Vehicle } from "@prisma/client";
import { ActionForm, type FormState } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";

export function VehicleForm({
  action,
  vehicle,
  customers,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  vehicle?: Vehicle;
  customers: { id: string; name: string }[];
}) {
  const field = (name: keyof Vehicle, label: string, mono = false, className = "") => (
    <div className={className}>
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} defaultValue={(vehicle?.[name] as string | null) ?? ""} className={`input ${mono ? "font-mono uppercase" : ""}`} maxLength={name === "vin" ? 17 : undefined} />
    </div>
  );
  return (
    <ActionForm action={action}>
      {vehicle && <input type="hidden" name="id" value={vehicle.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        {field("licensePlate", "Kennzeichen", true)}
        {field("vin", "Fahrgestellnummer (FIN)", true)}
        {field("make", "Marke")}
        {field("model", "Modell")}
        {field("color", "Farbe")}
        {field("firstRegistration", "Erstzulassung")}
        {field("vehicleType", "Fahrzeugtyp")}
        <div>
          <label htmlFor="customerId">Kunde / Halter</label>
          <select id="customerId" name="customerId" defaultValue={vehicle?.customerId ?? ""} className="input">
            <option value="">– kein Kunde –</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="notes">Notizen (z. B. Besonderheiten, Schlüsselübergabe, Ladekabel)</label>
          <textarea id="notes" name="notes" rows={3} defaultValue={vehicle?.notes ?? ""} className="input" />
        </div>
      </div>
      <SubmitButton>{vehicle ? "Speichern" : "Fahrzeug anlegen"}</SubmitButton>
    </ActionForm>
  );
}
