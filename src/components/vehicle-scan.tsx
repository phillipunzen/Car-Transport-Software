"use client";

import { useRef, useState } from "react";
import { prepareUpload } from "@/lib/client-image";
import { scanVehicle, type VehicleScanResult } from "@/app/(app)/orders/actions";

/**
 * Fotos oder Scans (z. B. Fahrzeugschein als Foto/PDF) auswählen → Fahrzeugdaten automatisch auslesen.
 * `onFiles` erhält die (verkleinerten) Dateien, z. B. um sie anschließend am Fahrzeug abzulegen.
 */
export function VehicleScan({
  orderId,
  mode,
  onResult,
  onFiles,
}: {
  orderId?: string;
  mode: "ai" | "ocr";
  onResult: (data: NonNullable<VehicleScanResult["data"]>) => void;
  onFiles?: (files: File[]) => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function handle(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const files = await Promise.all(Array.from(list).slice(0, 5).map((f) => prepareUpload(f, 2600, 0.9)));
      onFiles?.(files);
      const fd = new FormData();
      if (orderId) fd.append("orderId", orderId);
      for (const f of files) fd.append("files", f);
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
      if (camera.current) camera.current.value = "";
      if (picker.current) picker.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-brand-500/40 bg-brand-50 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Automatisch erkennen:</span>{" "}
          {mode === "ai"
            ? "Fahrzeugschein, Fahrzeug/Kennzeichen oder FIN fotografieren bzw. hochladen."
            : "Fahrzeugschein, Kennzeichen oder FIN formatfüllend fotografieren bzw. hochladen."}
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => camera.current?.click()}>
            {busy ? "Wird ausgelesen…" : "📷 Foto"}
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => picker.current?.click()}>
            Datei / PDF
          </button>
        </div>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => handle(e.target.files)} />
      <input ref={picker} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => handle(e.target.files)} />
      {message && <p className={`mt-2 text-sm ${message.error ? "text-red-600" : "text-emerald-700"}`}>{message.text}</p>}
    </div>
  );
}
