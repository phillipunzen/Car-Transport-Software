"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareUpload } from "@/lib/client-image";
import { PHOTO_CATEGORIES } from "@/lib/labels";
import { uploadPhotos } from "@/app/(app)/orders/[id]/condition/actions";
import { enqueue, isNetworkError } from "@/lib/offline-queue";
import { PendingUploads } from "@/components/pending-uploads";

/** Foto-Upload direkt aus der Kamera oder Galerie, mit Kategorie & Stufe. */
export function PhotoUpload({ orderId, stage }: { orderId: string; stage: "PICKUP" | "DELIVERY" }) {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("FRONT");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [info, setInfo] = useState<string | null>(null);

  async function handle(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    setInfo(null);
    const files = Array.from(list);
    let queued = 0;
    try {
      // Einzeln hochladen – robuster bei schlechtem Mobilfunk
      for (let i = 0; i < files.length; i++) {
        setProgress(`Lade ${i + 1} von ${files.length} hoch…`);
        const file = await prepareUpload(files[i]);
        const fields = { orderId, stage, category };
        const offlineItem = () =>
          enqueue({
            action: "uploadPhotos",
            orderId,
            label: `Foto ${PHOTO_CATEGORIES[category] ?? ""} (${stage === "PICKUP" ? "Abholung" : "Übergabe"})`,
            fields,
            files: [{ field: "files", name: file.name, type: file.type, blob: file }],
          });
        // Ohne Netz direkt in die Warteschlange
        if (!navigator.onLine) {
          await offlineItem();
          queued++;
          continue;
        }
        const fd = new FormData();
        Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
        fd.append("files", file);
        try {
          const res = await uploadPhotos(fd);
          if (res.error) throw new Error(res.error);
        } catch (e) {
          if (!isNetworkError(e)) throw e;
          await offlineItem();
          queued++;
        }
      }
      if (queued) setInfo(`Keine Verbindung – ${queued} Foto${queued === 1 ? "" : "s"} gesichert, Upload folgt automatisch.`);
      if (queued < files.length) router.refresh();
    } catch (e) {
      setError((e as Error).message || "Upload fehlgeschlagen");
    } finally {
      setProgress(null);
      if (camera.current) camera.current.value = "";
      if (gallery.current) gallery.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input mt-0 sm:w-56">
          {Object.entries(PHOTO_CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button type="button" className="btn-primary" disabled={!!progress} onClick={() => camera.current?.click()}>
          📷 Foto aufnehmen
        </button>
        <button type="button" className="btn-secondary" disabled={!!progress} onClick={() => gallery.current?.click()}>
          Aus Galerie wählen
        </button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handle(e.target.files)} />
      <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => handle(e.target.files)} />
      {progress && <p className="text-sm text-brand-700">{progress}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {info && <p className="text-sm text-amber-700">{info}</p>}
      <PendingUploads orderId={orderId} action="uploadPhotos" stage={stage} />
    </div>
  );
}
