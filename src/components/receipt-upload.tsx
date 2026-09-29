"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareUpload } from "@/lib/client-image";
import { uploadReceipt } from "@/app/(app)/orders/[id]/expenses/actions";

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
    try {
      for (let i = 0; i < files.length; i++) {
        setBusy(auto ? `Beleg ${i + 1}/${files.length} wird hochgeladen & ausgelesen…` : `Beleg ${i + 1}/${files.length} wird hochgeladen…`);
        const fd = new FormData();
        fd.append("orderId", orderId);
        fd.append("file", await prepareUpload(files[i], 2400, 0.85));
        const res = await uploadReceipt(fd);
        if (res.error) throw new Error(res.error);
        if (res.recognized) recognized++;
      }
      setMsg({
        text: auto
          ? `${recognized} von ${files.length} Beleg(en) automatisch erkannt – bitte Werte prüfen.`
          : `${files.length} Beleg(e) hochgeladen – bitte Beträge eintragen.`,
      });
      router.refresh();
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
    </div>
  );
}
