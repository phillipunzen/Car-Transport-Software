"use client";

import { useRef, useState } from "react";
import { prepareUpload } from "@/lib/client-image";
import { scanVehicle, type VehicleScanResult } from "@/app/(app)/orders/actions";

/** Button: Fotos aufnehmen → Fahrzeugdaten automatisch auslesen */
export function VehicleScan({
  orderId,
  onResult,
}: {
  orderId?: string;
  onResult: (data: NonNullable<VehicleScanResult["data"]>) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const fd = new FormData();
      if (orderId) fd.append("orderId", orderId);
      for (const f of Array.from(files).slice(0, 5)) fd.append("files", await prepareUpload(f, 1600));
      const res = await scanVehicle(fd);
      if (res.error || !res.data) {
        setMessage({ text: res.error ?? "Keine Daten erkannt.", error: true });
      } else {
        onResult(res.data);
        const found = [res.data.licensePlate, res.data.make, res.data.model, res.data.vin].filter(Boolean).length;
        setMessage({
          text: found ? `Erkannt – bitte Werte prüfen.${res.data.notes ? ` Hinweis: ${res.data.notes}` : ""}` : "Es konnten keine Fahrzeugdaten erkannt werden.",
          error: !found,
        });
      }
    } catch {
      setMessage({ text: "Die Erkennung ist fehlgeschlagen.", error: true });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-brand-500/40 bg-brand-50 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Automatisch erkennen:</span> Foto von Fahrzeug/Kennzeichen, FIN oder Fahrzeugschein aufnehmen.
        </p>
        <button type="button" className="btn-primary shrink-0" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Wird ausgelesen…" : "📷 Foto auslesen"}
        </button>
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => handle(e.target.files)} />
      {message && <p className={`mt-2 text-sm ${message.error ? "text-red-600" : "text-emerald-700"}`}>{message.text}</p>}
    </div>
  );
}
