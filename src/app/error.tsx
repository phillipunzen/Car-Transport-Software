"use client";

import { useEffect, useState } from "react";
import { isNetworkError } from "@/lib/network";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    setOffline(isNetworkError(error));
    // Bei Verbindungsfehlern automatisch neu versuchen, sobald wieder Netz da ist
    const retry = () => reset();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [error, reset]);

  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-lg font-semibold">{offline ? "Keine Internetverbindung" : "Da ist etwas schiefgelaufen."}</p>
      <p className="max-w-md text-sm text-slate-500">
        {offline
          ? "Die Aktion konnte nicht ausgeführt werden. Sobald wieder Netz da ist, wird die Seite automatisch neu geladen."
          : error.message}
      </p>
      <button onClick={reset} className="btn-primary">
        Erneut versuchen
      </button>
    </main>
  );
}
