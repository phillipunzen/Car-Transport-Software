"use client";

import { useEffect, useState } from "react";
import { listQueue, MAX_ATTEMPTS, QUEUE_EVENT, type QueueAction, type QueueItem } from "@/lib/offline-queue";

/** Zeigt Uploads dieses Auftrags, die noch auf dem Gerät auf Übertragung warten. */
export function PendingUploads({ orderId, action, stage }: { orderId: string; action: QueueAction; stage?: string }) {
  const [items, setItems] = useState<{ item: QueueItem; url: string | null }[]>([]);

  useEffect(() => {
    let urls: string[] = [];
    const load = async () => {
      const all = (await listQueue()).filter((i) => i.orderId === orderId && i.action === action && (!stage || i.fields.stage === stage));
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls = [];
      setItems(
        all.map((item) => {
          const img = item.files.find((f) => f.type.startsWith("image/"));
          const url = img ? URL.createObjectURL(img.blob) : null;
          if (url) urls.push(url);
          return { item, url };
        }),
      );
    };
    load();
    window.addEventListener(QUEUE_EVENT, load);
    return () => {
      window.removeEventListener(QUEUE_EVENT, load);
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [orderId, action, stage]);

  if (items.length === 0) return null;
  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-medium text-amber-900">
        {items.length} {items.length === 1 ? "Eintrag wartet" : "Einträge warten"} auf Übertragung – wird automatisch gesendet, sobald wieder Netz da ist.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map(({ item, url }) => (
          <div key={item.id} className="relative" title={item.lastError ?? item.label}>
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" className="h-16 w-20 rounded border border-amber-200 object-cover opacity-80" />
            ) : (
              <div className="flex h-16 w-20 items-center justify-center rounded border border-amber-200 bg-white px-1 text-center text-[10px] text-amber-800">{item.label}</div>
            )}
            <span className="absolute right-1 top-1 rounded bg-white/90 px-1 text-xs">{item.attempts >= MAX_ATTEMPTS ? "✕" : "⏳"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
