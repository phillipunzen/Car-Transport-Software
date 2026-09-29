"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listQueue, MAX_ATTEMPTS, processQueue, QUEUE_EVENT, removeFromQueue, type QueueItem } from "@/lib/offline-queue";

/**
 * Zeigt den Verbindungsstatus und sendet wartende Uploads automatisch,
 * sobald wieder eine Verbindung besteht. Einmal im App-Layout eingebunden.
 */
export function SyncStatus() {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => setItems(await listQueue()), []);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const sent = await processQueue();
      if (sent > 0) router.refresh();
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [router, refresh]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();
    sync();
    const on = () => {
      setOnline(true);
      sync();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener(QUEUE_EVENT, refresh);
    // Falls das "online"-Ereignis ausbleibt (z. B. WLAN ohne Internet): regelmäßig erneut versuchen
    const timer = setInterval(() => sync(), 30000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener(QUEUE_EVENT, refresh);
      clearInterval(timer);
    };
  }, [refresh, sync]);

  // Offline-Fallback-Seite (Service Worker) registrieren
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  const pending = items.filter((i) => i.attempts < MAX_ATTEMPTS);
  const failed = items.filter((i) => i.attempts >= MAX_ATTEMPTS);
  if (online && items.length === 0) return null;

  return (
    <div
      className={`sticky top-[57px] z-10 -mx-4 -mt-6 mb-6 border-b px-4 py-2 text-sm sm:-mx-6 lg:top-0 lg:-mx-10 lg:px-10 ${
        !online ? "border-amber-300 bg-amber-100 text-amber-900" : failed.length ? "border-red-200 bg-red-50 text-red-800" : "border-brand-100 bg-brand-50 text-brand-800"
      }`}
      role="status"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <span>
          {!online ? "⚠ Keine Internetverbindung – du kannst weiterarbeiten, Eingaben werden gesichert." : syncing ? "⟳ Wird synchronisiert…" : "Wieder online."}
          {pending.length > 0 && ` ${pending.length} Upload${pending.length === 1 ? "" : "s"} warte${pending.length === 1 ? "t" : "n"} auf Übertragung.`}
          {failed.length > 0 && ` ${failed.length} Upload${failed.length === 1 ? "" : "s"} fehlgeschlagen.`}
        </span>
        <span className="flex gap-3">
          {online && pending.length > 0 && !syncing && (
            <button type="button" onClick={sync} className="font-semibold underline">
              Jetzt senden
            </button>
          )}
          {items.length > 0 && (
            <button type="button" onClick={() => setOpen((o) => !o)} className="underline">
              {open ? "Ausblenden" : "Details"}
            </button>
          )}
        </span>
      </div>
      {open && items.length > 0 && (
        <ul className="mx-auto mt-2 max-w-6xl space-y-1 text-xs">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2">
              <span className="truncate">
                {i.attempts >= MAX_ATTEMPTS ? "✕" : "⏳"} {i.label} · {new Date(i.createdAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                {i.lastError && ` – ${i.lastError}`}
              </span>
              <button
                type="button"
                className="shrink-0 text-red-600 underline"
                onClick={() => {
                  if (window.confirm("Diesen Upload verwerfen? Die Datei ist dann verloren.")) removeFromQueue(i.id);
                }}
              >
                verwerfen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
