"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { SignaturePad } from "@/components/signature-pad";
import { CHECKLIST_ITEMS, CLEANLINESS } from "@/lib/labels";
import { saveProtocol } from "@/app/(app)/orders/[id]/protocol/actions";

export type ProtocolValues = {
  performedAt: string;
  location: string;
  mileage: string;
  fuelLevel: number;
  checklist: Record<string, boolean | number>;
  exteriorClean: string;
  interiorClean: string;
  notes: string;
  handoverName: string;
  signatureCustomer: string | null;
  signatureDriver: string | null;
};

export function ProtocolForm({ orderId, type, values, terms }: { orderId: string; type: "PICKUP" | "DELIVERY"; values: ProtocolValues; terms?: string | null }) {
  const [fuel, setFuel] = useState(values.fuelLevel);
  return (
    <ActionForm action={saveProtocol} className="space-y-6">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="type" value={type} />

      <section className="card card-body grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="performedAt">Datum & Uhrzeit</label>
          <input id="performedAt" name="performedAt" type="datetime-local" defaultValue={values.performedAt} className="input" />
        </div>
        <div>
          <label htmlFor="location">Ort</label>
          <input id="location" name="location" defaultValue={values.location} className="input" />
        </div>
        <div>
          <label htmlFor="mileage">
            Kilometerstand <span className="text-red-500">*</span>
          </label>
          <input id="mileage" name="mileage" inputMode="numeric" defaultValue={values.mileage} className="input" placeholder="z. B. 45230" />
        </div>
        <div>
          <label htmlFor="fuelLevel">Tankfüllung / Ladestand: {fuel} %</label>
          <input
            id="fuelLevel"
            name="fuelLevel"
            type="range"
            min={0}
            max={100}
            step={5}
            value={fuel}
            onChange={(e) => setFuel(Number(e.target.value))}
            className="mt-3 w-full accent-brand-600"
          />
          <div className="flex justify-between text-xs text-slate-400">
            <span>Leer</span>
            <span>¼</span>
            <span>½</span>
            <span>¾</span>
            <span>Voll</span>
          </div>
        </div>
        <div>
          <label htmlFor="exteriorClean">Sauberkeit außen</label>
          <select id="exteriorClean" name="exteriorClean" defaultValue={values.exteriorClean} className="input">
            <option value="">–</option>
            {Object.entries(CLEANLINESS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="interiorClean">Sauberkeit innen</label>
          <select id="interiorClean" name="interiorClean" defaultValue={values.interiorClean} className="input">
            <option value="">–</option>
            {Object.entries(CLEANLINESS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="card card-body">
        <h2 className="section-title mb-3">Checkliste Zubehör & Zustand</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {CHECKLIST_ITEMS.map((item) =>
            item.kind === "count" ? (
              <label key={item.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 font-normal">
                {item.label}
                <input
                  name={`cl_${item.key}`}
                  type="number"
                  min={0}
                  max={20}
                  defaultValue={Number(values.checklist[item.key] ?? 1)}
                  className="w-16 rounded border border-slate-300 px-2 py-1 text-right"
                />
              </label>
            ) : (
              <label key={item.key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 font-normal has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50">
                <input name={`cl_${item.key}`} type="checkbox" defaultChecked={Boolean(values.checklist[item.key])} className="h-5 w-5 accent-emerald-600" />
                {item.label}
              </label>
            ),
          )}
        </div>
      </section>

      <section className="card card-body space-y-4">
        <div>
          <label htmlFor="notes">Bemerkungen</label>
          <textarea id="notes" name="notes" rows={3} defaultValue={values.notes} className="input" placeholder="z. B. Warnleuchte Reifendruck aktiv, Kunde informiert" />
        </div>
        <div>
          <label htmlFor="handoverName">
            {type === "PICKUP" ? "Name des Übergebenden (Kunde)" : "Name des Empfängers"} <span className="text-red-500">*</span>
          </label>
          <input id="handoverName" name="handoverName" defaultValue={values.handoverName} className="input" />
        </div>
        {terms && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{terms}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <SignaturePad name="signatureCustomer" label={type === "PICKUP" ? "Unterschrift Kunde / Übergebender" : "Unterschrift Empfänger"} defaultValue={values.signatureCustomer} />
          <SignaturePad name="signatureDriver" label="Unterschrift Fahrer" defaultValue={values.signatureDriver} />
        </div>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SubmitButton name="intent" value="save" className="btn-secondary">
          Zwischenspeichern
        </SubmitButton>
        <SubmitButton name="intent" value="complete" className="btn-primary" pendingText="Wird abgeschlossen…" confirm="Protokoll abschließen? Danach sind keine Änderungen mehr möglich.">
          Protokoll abschließen
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
