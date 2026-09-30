"use client";

import { mileageCheck } from "@/lib/mileage";
import { useCallback, useEffect, useRef, useState } from "react";
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

type Props = {
  orderId: string;
  type: "PICKUP" | "DELIVERY";
  values: ProtocolValues;
  terms?: string | null;
  /** Übergabe: Kilometerstand bei Abholung und geplante Strecke für die Plausibilitätsprüfung */
  mileageRef?: { pickup: number | null; planned: number | null };
};

/** Liest die aktuellen Formularwerte aus (für die Sicherung auf dem Gerät). */
function readForm(form: HTMLFormElement, signatures: Partial<Record<"signatureCustomer" | "signatureDriver", string>>): ProtocolValues {
  const fd = new FormData(form);
  const get = (k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
  const checklist: Record<string, boolean | number> = {};
  for (const item of CHECKLIST_ITEMS) {
    checklist[item.key] = item.kind === "count" ? Number(get(`cl_${item.key}`) || 0) : fd.get(`cl_${item.key}`) === "on";
  }
  return {
    performedAt: get("performedAt"),
    location: get("location"),
    mileage: get("mileage"),
    fuelLevel: Number(get("fuelLevel") || 0),
    checklist,
    exteriorClean: get("exteriorClean"),
    interiorClean: get("interiorClean"),
    notes: get("notes"),
    handoverName: get("handoverName"),
    signatureCustomer: signatures.signatureCustomer ?? (get("signatureCustomer") || null),
    signatureDriver: signatures.signatureDriver ?? (get("signatureDriver") || null),
  };
}

/**
 * Protokollformular mit Sicherung auf dem Gerät: Eingaben inkl. Unterschriften
 * überstehen Funklöcher, Neuladen und versehentliches Schließen.
 */
export function ProtocolForm(props: Props) {
  const draftKey = `protocol-draft:${props.orderId}:${props.type}`;
  const [values, setValues] = useState(props.values);
  const [version, setVersion] = useState(0);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        setValues(JSON.parse(raw));
        setVersion((v) => v + 1);
        setRestored(true);
      }
    } catch {
      /* Speicher nicht verfügbar */
    }
  }, [draftKey]);

  const save = useCallback(
    (v: ProtocolValues) => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(v));
      } catch {
        /* z. B. Speicher voll – Formular funktioniert trotzdem */
      }
    },
    [draftKey],
  );
  const clear = useCallback(() => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignorieren */
    }
  }, [draftKey]);

  return (
    <>
      {restored && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span>Nicht gesendete Eingaben von diesem Gerät wurden wiederhergestellt (inkl. Unterschriften).</span>
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              clear();
              setValues(props.values);
              setVersion((v) => v + 1);
              setRestored(false);
            }}
          >
            Verwerfen
          </button>
        </div>
      )}
      <ProtocolFormInner key={version} {...props} values={values} onDraft={save} onSaved={clear} />
    </>
  );
}

function ProtocolFormInner({
  orderId,
  type,
  values,
  terms,
  mileageRef,
  onDraft,
  onSaved,
}: Props & { onDraft: (v: ProtocolValues) => void; onSaved: () => void }) {
  const [fuel, setFuel] = useState(values.fuelLevel);
  const [km, setKm] = useState(values.mileage);
  const kmNum = Number(km.replace(/\D/g, ""));
  const kmHint = mileageRef && km ? mileageCheck(mileageRef.pickup, kmNum || null, mileageRef.planned) : null;
  const wrapper = useRef<HTMLDivElement>(null);
  const signatures = useRef<Partial<Record<"signatureCustomer" | "signatureDriver", string>>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveDraft = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const form = wrapper.current?.closest("form");
      if (form) onDraft(readForm(form, signatures.current));
    }, 300);
  }, [onDraft]);

  return (
    <ActionForm action={saveProtocol} className="space-y-6" onSuccess={onSaved} onQueued={saveDraft}>
      <div ref={wrapper} className="space-y-6" onInput={saveDraft} onChange={saveDraft}>
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
          <input
            id="mileage"
            name="mileage"
            inputMode="numeric"
            defaultValue={values.mileage}
            onChange={(e) => setKm(e.target.value)}
            className="input"
            placeholder="z. B. 45230"
          />
          {kmHint && <p className={`mt-1 text-xs ${kmHint.status === "ok" ? "text-slate-500" : "text-amber-700"}`}>{kmHint.message ?? `${Math.round(kmHint.driven)} km gefahren`}</p>}
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
          <SignaturePad
            onChange={(v) => {
              signatures.current.signatureCustomer = v;
              saveDraft();
            }}
            name="signatureCustomer" label={type === "PICKUP" ? "Unterschrift Kunde / Übergebender" : "Unterschrift Empfänger"} defaultValue={values.signatureCustomer} />
          <SignaturePad
            onChange={(v) => {
              signatures.current.signatureDriver = v;
              saveDraft();
            }}
            name="signatureDriver" label="Unterschrift Fahrer" defaultValue={values.signatureDriver} />
        </div>
      </section>

      </div>

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
