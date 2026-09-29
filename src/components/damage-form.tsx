"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareUpload } from "@/lib/client-image";
import { DAMAGE_AREAS, DAMAGE_SEVERITY, DAMAGE_TYPES } from "@/lib/labels";
import { addDamage } from "@/app/(app)/orders/[id]/condition/actions";
import { CarDiagram } from "@/components/car-diagram";
import { enqueue, isNetworkError } from "@/lib/offline-queue";
import { PendingUploads } from "@/components/pending-uploads";

export function DamageForm({ orderId, stage, counts }: { orderId: string; stage: "PICKUP" | "DELIVERY"; counts: Record<string, number> }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const fd = new FormData(e.currentTarget);
    const photo = fd.get("photo");
    const prepared = photo instanceof File && photo.size > 0 ? await prepareUpload(photo) : null;
    if (prepared) fd.set("photo", prepared);
    else fd.delete("photo");

    const reset = () => {
      form.current?.reset();
      setArea("");
    };
    const toQueue = async () => {
      const fields: Record<string, string> = {};
      fd.forEach((v, k) => {
        if (typeof v === "string") fields[k] = v;
      });
      await enqueue({
        action: "addDamage",
        orderId,
        label: `Schaden ${DAMAGE_AREAS[fields.area] ?? ""}`,
        fields,
        files: prepared ? [{ field: "photo", name: prepared.name, type: prepared.type, blob: prepared }] : [],
      });
      setInfo("Keine Verbindung – Schaden gesichert, wird automatisch übertragen.");
      reset();
    };

    try {
      if (!navigator.onLine) return await toQueue();
      const res = await addDamage(fd);
      if (res.error) return setError(res.error);
      reset();
      router.refresh();
    } catch (err) {
      if (isNetworkError(err)) await toQueue();
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <p className="mb-2 text-sm text-slate-500">Bereich antippen, um einen Schaden zu erfassen:</p>
        <CarDiagram counts={counts} selected={area} onSelect={setArea} />
      </div>
      <form ref={form} onSubmit={submit} className="space-y-3">
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="stage" value={stage} />
        <div>
          <label htmlFor="area">Position</label>
          <select id="area" name="area" value={area} onChange={(e) => setArea(e.target.value)} required className="input">
            <option value="">Bitte wählen…</option>
            {Object.entries(DAMAGE_AREAS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="type">Art</label>
            <select id="type" name="type" className="input">
              {Object.entries(DAMAGE_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="severity">Schwere</label>
            <select id="severity" name="severity" className="input">
              {Object.entries(DAMAGE_SEVERITY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="description">Beschreibung</label>
          <input id="description" name="description" placeholder="z. B. 5 cm Kratzer unterhalb Türgriff" className="input" />
        </div>
        <div>
          <label htmlFor="photo">Foto des Schadens</label>
          <input id="photo" name="photo" type="file" accept="image/*" capture="environment" className="input file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-amber-700">{info}</p>}
        <PendingUploads orderId={orderId} action="addDamage" stage={stage} />
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Speichern…" : "Schaden hinzufügen"}
        </button>
      </form>
    </div>
  );
}
