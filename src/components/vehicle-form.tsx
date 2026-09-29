"use client";

import { useEffect, useRef, useState } from "react";
import type { Vehicle } from "@prisma/client";
import { ActionForm, type FormState } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { VehicleScan } from "@/components/vehicle-scan";
import { prepareUpload } from "@/lib/client-image";

const FIELDS = [
  ["licensePlate", "Kennzeichen", true],
  ["vin", "Fahrgestellnummer (FIN)", true],
  ["make", "Marke", false],
  ["model", "Modell", false],
  ["color", "Farbe", false],
  ["firstRegistration", "Erstzulassung", false],
  ["vehicleType", "Fahrzeugtyp", false],
] as const;

type Key = (typeof FIELDS)[number][0];

export function VehicleForm({
  action,
  vehicle,
  customers,
  recognition,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  vehicle?: Vehicle;
  customers: { id: string; name: string }[];
  recognition: "ai" | "ocr" | "off";
}) {
  const [v, setV] = useState<Record<Key, string>>(() => Object.fromEntries(FIELDS.map(([k]) => [k, vehicle?.[k] ?? ""])) as Record<Key, string>);
  // Dokumente (z. B. Fahrzeugschein), die mit dem Formular gespeichert werden
  const [docs, setDocs] = useState<File[]>([]);
  const [preparing, setPreparing] = useState(false);
  const hiddenFiles = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hiddenFiles.current) return;
    const dt = new DataTransfer();
    docs.forEach((f) => dt.items.add(f));
    hiddenFiles.current.files = dt.files;
  }, [docs]);

  async function addDocs(list: FileList | null) {
    if (!list?.length) return;
    setPreparing(true);
    try {
      const prepared = await Promise.all(Array.from(list).map((f) => prepareUpload(f, 2400, 0.85)));
      setDocs((d) => [...d, ...prepared].slice(0, 5));
    } finally {
      setPreparing(false);
      if (picker.current) picker.current.value = "";
    }
  }

  return (
    <ActionForm action={action} onSuccess={() => setDocs([])}>
      {vehicle && <input type="hidden" name="id" value={vehicle.id} />}
      <input ref={hiddenFiles} type="file" name="documents" multiple hidden />

      {recognition !== "off" && (
        <VehicleScan
          mode={recognition}
          onFiles={(files) => setDocs((d) => [...d, ...files].slice(0, 5))}
          onResult={(d) =>
            setV((s) => ({
              ...s,
              licensePlate: d.licensePlate ?? s.licensePlate,
              vin: d.vin ?? s.vin,
              make: d.make ?? s.make,
              model: d.model ?? s.model,
              color: d.color ?? s.color,
              firstRegistration: d.firstRegistration ?? s.firstRegistration,
            }))
          }
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(([k, label, mono]) => (
          <div key={k}>
            <label htmlFor={k}>{label}</label>
            <input
              id={k}
              name={k}
              value={v[k]}
              onChange={(e) => setV((s) => ({ ...s, [k]: e.target.value }))}
              className={`input ${mono ? "font-mono uppercase" : ""}`}
              maxLength={k === "vin" ? 17 : undefined}
            />
          </div>
        ))}
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

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-700">Dokumente beim Fahrzeug speichern (z. B. Fahrzeugschein)</p>
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => picker.current?.click()}>
            + Foto / PDF hinzufügen
          </button>
        </div>
        <input ref={picker} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => addDocs(e.target.files)} />
        {docs.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">Fotos/PDFs, die du oben zum Auslesen verwendest, werden automatisch hier übernommen.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {docs.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">📄 {f.name}</span>
                <button type="button" className="text-xs text-red-500" onClick={() => setDocs((d) => d.filter((_, j) => j !== i))}>
                  Entfernen
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SubmitButton disabled={preparing}>{preparing ? "Dokument wird vorbereitet…" : vehicle ? "Speichern" : "Fahrzeug anlegen"}</SubmitButton>
    </ActionForm>
  );
}
