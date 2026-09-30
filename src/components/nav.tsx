"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const ICONS: Record<string, React.ReactNode> = {
  dashboard: <path d="M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z" />,
  orders: <path d="M9 2h6a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V3a1 1 0 0 1 1-1m1 2v2h4V4zm-3 7v2h10v-2zm0 4v2h7v-2z" />,
  vehicles: <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11v6a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zm2.2-.5h9.6l-1-3.2a.5.5 0 0 0-.5-.3H8.7a.5.5 0 0 0-.5.3zM7.5 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2m9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2" />,
  customers: <path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6m-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6m0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13m8 0c-.3 0-.6 0-1 .1 1.2.8 2 2 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5" />,
  documents: <path d="M4 5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm4 6v2h8v-2zm0 4v2h5v-2z" />,
  quotes: <path d="M6 2h9l5 5v6.2l-2 2V8h-5V4H6v16h6v2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2m2 8h8v2H8zm0 4h5v2H8zm12.7 1.3 1 1a1 1 0 0 1 0 1.4L16.4 23H14v-2.4l5.3-5.3a1 1 0 0 1 1.4 0" />,
  invoices: <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2m8 1.5V8h4.5zM8 12v2h8v-2zm0 4v2h5v-2z" />,
  today: <path d="M12 2a1 1 0 0 1 1 1v1.1a8 8 0 0 1 6.9 6.9H21a1 1 0 1 1 0 2h-1.1a8 8 0 0 1-6.9 6.9V21a1 1 0 1 1-2 0v-1.1A8 8 0 0 1 4.1 13H3a1 1 0 1 1 0-2h1.1A8 8 0 0 1 11 4.1V3a1 1 0 0 1 1-1m0 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12m0 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6" />,
  calendar: <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1M5 10v9h14v-9zm2 2h4v3H7z" />,
  more: <path d="M5 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4m7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4m7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4" />,
  settings: <path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7 7 0 0 0-1.7-1L15 3h-4l-.4 2.9a7 7 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7 7 0 0 0 1.7 1L11 21h4l.4-2.9a7 7 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7" />,
};

export const NAV = [
  { href: "/dashboard", label: "Übersicht", icon: "dashboard" },
  { href: "/today", label: "Heute", icon: "today" },
  { href: "/calendar", label: "Kalender", icon: "calendar" },
  { href: "/orders", label: "Aufträge", icon: "orders" },
  { href: "/quotes", label: "Angebote", icon: "quotes" },
  { href: "/vehicles", label: "Fahrzeuge", icon: "vehicles" },
  { href: "/customers", label: "Kunden", icon: "customers" },
  { href: "/invoices", label: "Rechnungen", icon: "invoices" },
  { href: "/documents", label: "Belege", icon: "documents" },
  { href: "/settings", label: "Einstellungen", icon: "settings" },
];

/** Smartphone: die vier wichtigsten Ziele für unterwegs direkt, der Rest unter „Mehr“. */
const MOBILE_PRIMARY = ["/today", "/orders", "/calendar", "/customers"];
const MOBILE_NAV = NAV.filter((n) => MOBILE_PRIMARY.includes(n.href));
const MOBILE_MORE = NAV.filter((n) => !MOBILE_PRIMARY.includes(n.href));
const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`) || (href === "/quotes" && path.startsWith("/inquiries"));

export function SettingsIconLink() {
  const path = usePathname();
  return (
    <Link href="/settings" aria-label="Einstellungen" className={`rounded-lg p-1.5 ${path.startsWith("/settings") ? "text-brand-600" : "text-slate-500"}`}>
      <Icon name="settings" />
    </Link>
  );
}

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const active = isActive(path, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Icon name={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const moreActive = MOBILE_MORE.some((item) => isActive(path, item.href));
  // Nach dem Navigieren das Menü schließen
  useEffect(() => setMore(false), [path]);

  return (
    <>
      {more && (
        <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setMore(false)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Weitere Bereiche"
          >
            <div className="grid grid-cols-3 gap-2">
              {MOBILE_MORE.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMore(false)}
                  className={`flex flex-col items-center gap-1 rounded-xl p-3 text-xs font-medium ${isActive(path, item.href) ? "bg-brand-50 text-brand-700" : "bg-slate-50 text-slate-700"}`}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-5">
          {MOBILE_NAV.map((item) => {
            const active = isActive(path, item.href) && !more;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${active ? "text-brand-600" : "text-slate-500"}`}
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMore((m) => !m)}
            aria-expanded={more}
            className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${more || moreActive ? "text-brand-600" : "text-slate-500"}`}
          >
            <Icon name="more" />
            Mehr
          </button>
        </div>
      </nav>
    </>
  );
}
