import Link from "next/link";

export function SettingsNav({ active }: { active: "company" | "team" }) {
  const cls = (a: boolean) => `-mb-px border-b-2 px-3 py-2 text-sm font-medium ${a ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500"}`;
  return (
    <nav className="mb-6 flex gap-1 border-b border-slate-200">
      <Link href="/settings" className={cls(active === "company")}>
        Firma & Rechnungen
      </Link>
      <Link href="/settings/team" className={cls(active === "team")}>
        Team & Einladungen
      </Link>
    </nav>
  );
}
