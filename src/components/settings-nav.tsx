import Link from "next/link";

type Tab = "company" | "team" | "modules" | "security" | "fleet";

export function SettingsNav({ active, driver = false, fleet = false }: { active: Tab; driver?: boolean; fleet?: boolean }) {
  const cls = (a: boolean) => `-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${a ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500"}`;
  const tabs: [Tab, string, string][] = driver
    ? [["security", "/settings/security", "Profil & Sicherheit"]]
    : [
        ["company", "/settings", "Firma & Rechnungen"],
        ["team", "/settings/team", "Team"],
        ["modules", "/settings/modules", "Module"],
        ...(fleet ? ([["fleet", "/settings/fleet", "Kennzeichen & Führerscheine"]] as [Tab, string, string][]) : []),
        ["security", "/settings/security", "Sicherheit"],
      ];
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map(([key, href, label]) => (
        <Link key={key} href={href} className={cls(active === key)}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
