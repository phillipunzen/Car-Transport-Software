"use client";

/**
 * Warteschlange für Uploads ohne Internet ("Funkloch-sicher").
 * Fotos, Belege und Schäden werden bei fehlender Verbindung im Browser
 * (IndexedDB) abgelegt und automatisch gesendet, sobald wieder Netz da ist.
 */

import { uploadPhotos, addDamage } from "@/app/(app)/orders/[id]/condition/actions";
import { uploadReceipt } from "@/app/(app)/orders/[id]/expenses/actions";
import { isNetworkError } from "@/lib/network";

export type QueueAction = "uploadPhotos" | "uploadReceipt" | "addDamage";

export type QueueItem = {
  id: string;
  action: QueueAction;
  orderId: string;
  label: string; // z. B. "Foto Front (Abholung)"
  fields: Record<string, string>;
  files: { field: string; name: string; type: string; blob: Blob }[];
  createdAt: number;
  attempts: number;
  lastError?: string;
};

const ACTIONS: Record<QueueAction, (fd: FormData) => Promise<{ error?: string } | unknown>> = {
  uploadPhotos,
  uploadReceipt,
  addDamage,
};

export const MAX_ATTEMPTS = 3;
const DB_NAME = "ueberfuehrung-offline";
const STORE = "queue";
export const QUEUE_EVENT = "offline-queue-changed";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const notify = () => window.dispatchEvent(new Event(QUEUE_EVENT));

export { isNetworkError };

export async function enqueue(item: Omit<QueueItem, "id" | "createdAt" | "attempts">) {
  const full: QueueItem = { ...item, id: crypto.randomUUID(), createdAt: Date.now(), attempts: 0 };
  await tx("readwrite", (s) => s.put(full));
  notify();
  return full;
}

export async function listQueue(): Promise<QueueItem[]> {
  try {
    const all = await tx<QueueItem[]>("readonly", (s) => s.getAll() as IDBRequest<QueueItem[]>);
    return all.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function removeFromQueue(id: string) {
  await tx("readwrite", (s) => s.delete(id));
  notify();
}

let running: Promise<number> | null = null;

/**
 * Sendet alle wartenden Einträge. Bricht beim ersten Verbindungsfehler ab.
 * Liefert die Anzahl erfolgreich gesendeter Einträge.
 */
export function processQueue(): Promise<number> {
  running ??= (async () => {
    let sent = 0;
    try {
      for (const item of await listQueue()) {
        if (!navigator.onLine) break;
        if (item.attempts >= MAX_ATTEMPTS) continue; // wird in der Anzeige als fehlgeschlagen gelistet
        const fd = new FormData();
        for (const [k, v] of Object.entries(item.fields)) fd.append(k, v);
        for (const f of item.files) fd.append(f.field, new File([f.blob], f.name, { type: f.type }));
        try {
          const res = (await ACTIONS[item.action](fd)) as { error?: string } | undefined;
          if (res && typeof res === "object" && "error" in res && res.error) {
            // Fachlicher Fehler (z. B. Auftrag gelöscht) – nicht endlos wiederholen
            await tx("readwrite", (s) => s.put({ ...item, attempts: item.attempts + 1, lastError: res.error }));
          } else {
            await tx("readwrite", (s) => s.delete(item.id));
            sent++;
          }
        } catch (e) {
          if (isNetworkError(e)) break;
          await tx("readwrite", (s) => s.put({ ...item, attempts: item.attempts + 1, lastError: (e as Error).message }));
        }
      }
    } finally {
      running = null;
      notify();
    }
    return sent;
  })();
  return running;
}
