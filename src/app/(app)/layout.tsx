import Link from "next/link";
import { requireCtx } from "@/lib/org";
import { ROLE } from "@/lib/labels";
import { BottomNav, SettingsIconLink, SideNav } from "@/components/nav";
import { SyncStatus } from "@/components/sync-status";
import { logout, switchOrg } from "./actions";

function OrgSwitcher({ current, memberships }: { current: string; memberships: { id: string; name: string }[] }) {
  if (memberships.length < 2) return null;
  return (
    <form action={switchOrg} className="flex gap-1">
      <select name="orgId" defaultValue={current} className="input mt-0 py-1.5 text-sm">
        {memberships.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <button className="btn-secondary px-2 py-1.5 text-xs">Wechseln</button>
    </form>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const logoUrl = ctx.org.logoFileId ? `/api/files/${ctx.org.logoFileId}` : null;
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-4 lg:flex lg:fixed lg:inset-y-0">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={ctx.org.name} className="h-12 max-w-full object-contain object-left" />
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.svg" alt="" className="h-8 w-8" />
              <span className="font-bold">Überführung</span>
            </>
          )}
        </Link>
        <div className="mb-4 px-2">
          <p className="truncate text-sm font-semibold">{ctx.org.name}</p>
          <p className="text-xs text-slate-500">{ROLE[ctx.role]}</p>
          <div className="mt-2">
            <OrgSwitcher current={ctx.orgId} memberships={ctx.memberships} />
          </div>
        </div>
        <SideNav />
        <div className="mt-auto border-t border-slate-100 px-2 pt-4">
          <p className="truncate text-sm font-medium">{ctx.user.name ?? ctx.user.email}</p>
          <p className="truncate text-xs text-slate-500">{ctx.user.email}</p>
          <form action={logout} className="mt-2">
            <button className="text-sm text-slate-500 hover:text-slate-900">Abmelden</button>
          </form>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl ?? "/icon.svg"} alt="" className={logoUrl ? "h-8 max-w-[7rem] object-contain" : "h-7 w-7"} />
          {!logoUrl && <span className="truncate text-sm font-semibold">{ctx.org.name}</span>}
        </Link>
        <div className="flex items-center gap-1">
          <OrgSwitcher current={ctx.orgId} memberships={ctx.memberships} />
          <SettingsIconLink />
          <form action={logout}>
            <button className="btn-ghost px-2 py-1 text-xs">Abmelden</button>
          </form>
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-6 lg:ml-64 lg:px-10 lg:pb-10">
        <SyncStatus />
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
