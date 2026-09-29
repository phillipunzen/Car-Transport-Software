"use client";

import { useMemo, useState } from "react";
import type { VehicleOption } from "@/lib/vehicles";

const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[\s-]/g, "");

/** Suche im Fahrzeugbestand – übernimmt die Stammdaten ins Formular. */
export function VehiclePicker({
  vehicles,
  customerId,
  onSelect,
}: {
  vehicles: VehicleOption[];
  customerId?: string;
  onSelect: (v: VehicleOption) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const needle = norm(q);
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = vehicles.filter((v) => {
      if (!needle) return !customerId || v.customerId === customerId;
      if (norm(v.licensePlate).includes(needle) || norm(v.vin).includes(needle)) return true;
      const text = `${v.make ?? ""} ${v.model ?? ""} ${v.color ?? ""}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
    // Fahrzeuge des gewählten Kunden zuerst
    return list.sort((a, b) => Number(b.customerId === customerId) - Number(a.customerId === customerId)).slice(0, 8);
  }, [q, vehicles, customerId]);

  return (
    <div className="relative">
      <label htmlFor="vehicleSearch">Bekanntes Fahrzeug übernehmen</label>
      <input
        id="vehicleSearch"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Kennzeichen, FIN, Marke oder Modell suchen…"
        className="input"
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {results.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(v);
                  setQ("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{[v.make, v.model].filter(Boolean).join(" ") || "Fahrzeug"}</span>
                  <span className="block truncate font-mono text-xs text-slate-500">{v.vin ?? "FIN unbekannt"}</span>
                </span>
                {v.licensePlate && <span className="shrink-0 rounded border border-slate-300 px-1.5 font-mono text-xs">{v.licensePlate}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && q && results.length === 0 && <p className="mt-1 text-xs text-slate-500">Kein passendes Fahrzeug im Bestand.</p>}
    </div>
  );
}
