"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareUpload } from "@/lib/client-image";
import { PHOTO_CATEGORIES } from "@/lib/labels";
import { uploadPhotos } from "@/app/(app)/orders/[id]/condition/actions";

/** Foto-Upload direkt aus der Kamera oder Galerie, mit Kategorie & Stufe. */
export function PhotoUpload({ orderId, stage }: { orderId: string; stage: "PICKUP" | "DELIVERY" }) {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("FRONT");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const files = Array.from(list);
    try {
      // Einzeln hochladen – robuster bei schlechtem Mobilfunk
      for (let i = 0; i < files.length; i++) {
        setProgress(`Lade ${i + 1} von ${files.length} hoch…`);
        const fd = new FormData();
        fd.append("orderId", orderId);
        fd.append("stage", stage);
        fd.append("category", category);
        fd.append("files", await prepareUpload(files[i]));
        const res = await uploadPhotos(fd);
        if (res.error) throw new Error(res.error);
      }
      router.refresh();
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
    </div>
  );
}
