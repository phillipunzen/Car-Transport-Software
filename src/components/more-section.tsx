"use client";

import { useEffect, useState } from "react";

const OFFICE = "(min-width: 64rem) and (pointer: fine)";

/**
 * Bereich mit Zusatzinfos: im Büro (großer Bildschirm, Maus) aufgeklappt,
 * auf Handy/iPad zugeklappt – mit einem Tipp erreichbar, ohne die Seite zu überladen.
 */
export function MoreSection({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(OFFICE);
    setOpen(mq.matches);
  }, []);
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className={`group ${className}`}>
      <summary className="office:hidden flex cursor-pointer list-none items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm group-open:mb-4 [&::-webkit-details-marker]:hidden">
        {title}
        <span className="text-slate-400 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-6">{children}</div>
    </details>
  );
}
