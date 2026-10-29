"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareUpload } from "@/lib/client-image";
import { uploadReceipt } from "@/app/(app)/orders/[id]/expenses/actions";
import { enqueue, isNetworkError } from "@/lib/offline-queue";
import { PendingUploads } from "@/components/pending-uploads";

export function ReceiptUpload({ orderId, recognition }: { orderId: string; recognition: "ai" | "ocr" | "off" }) {
  const auto = recognition !== "off";
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  async function handle(list: FileList | null) {
    if (!list?.length) return;
    setMsg(null);
    const files = Array.from(list);
    let recognized = 0;
    let queued = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        setBusy(auto ? `Beleg ${i + 1}/${files.length} wird hochgeladen & ausgelesen…` : `Beleg ${i + 1}/${files.length} wird hochgeladen…`);
        const file = await prepareUpload(files[i], 2400, 0.85);
        const toQueue = () =>
          enqueue({
            action: "uploadReceipt",
            orderId,
            label: `Beleg ${file.name}`,
            fields: { orderId },
            files: [{ field: "file", name: file.name, type: file.type, blob: file }],
          });
        if (!navigator.onLine) {
          await toQueue();
          queued++;
          continue;
        }
        const fd = new FormData();
        fd.append("orderId", orderId);
        fd.append("file", file);
        try {
          const res = await uploadReceipt(fd);
          if (res.error) throw new Error(res.error);
          if (res.recognized) recognized++;
        } catch (e) {
          if (!isNetworkError(e)) throw e;
          await toQueue();
          queued++;
        }
      }
      const sent = files.length - queued;
      setMsg(
        queued
          ? { text: `Keine Verbindung – ${queued} Beleg(e) gesichert, Upload & Auslesen folgen automatisch.`, error: false }
          : {
              text: auto
                ? `${recognized} von ${sent} Beleg(en) automatisch erkannt – bitte Werte prüfen.`
                : `${sent} Beleg(e) hochgeladen – bitte Beträge eintragen.`,
            },
      );
      if (sent) router.refresh();
    } catch (e) {
      setMsg({ text: (e as Error).message, error: true });
    } finally {
      setBusy(null);
      if (camera.current) camera.current.value = "";
      if (picker.current) picker.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn-primary" disabled={!!busy} onClick={() => camera.current?.click()}>
          📷 Beleg fotografieren
        </button>
        <button type="button" className="btn-secondary" disabled={!!busy} onClick={() => picker.current?.click()}>
          Datei / PDF hochladen
        </button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handle(e.target.files)} />
      <input ref={picker} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => handle(e.target.files)} />
      {busy && <p className="text-sm text-brand-700">{busy}</p>}
      {msg && <p className={`text-sm ${msg.error ? "text-red-600" : "text-emerald-700"}`}>{msg.text}</p>}
      <PendingUploads orderId={orderId} action="uploadReceipt" />
    </div>
  );
}
