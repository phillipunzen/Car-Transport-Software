/** Erkennt Verbindungsfehler (im Unterschied zu fachlichen Fehlern vom Server). */
export function isNetworkError(e: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return e instanceof TypeError || /failed to fetch|network|load failed|internet/i.test(msg);
}
