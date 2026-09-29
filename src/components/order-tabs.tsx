"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function OrderTabs({ id, counts }: { id: string; counts: { photos: number; damages: number; expenses: number } }) {
  const path = usePathname();
  const base = `/orders/${id}`;
  const tabs = [
    { href: base, label: "Übersicht", exact: true },
    { href: `${base}/condition`, label: `Fotos & Zustand${counts.photos + counts.damages ? ` (${counts.photos + counts.damages})` : ""}` },
    { href: `${base}/protocol/pickup`, label: "Abholprotokoll" },
    { href: `${base}/protocol/delivery`, label: "Übergabeprotokoll" },
    { href: `${base}/expenses`, label: `Belege${counts.expenses ? ` (${counts.expenses})` : ""}` },
  ];
  return (
    <nav className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => {
        const active = t.exact ? path === t.href || path === `${base}/edit` : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
