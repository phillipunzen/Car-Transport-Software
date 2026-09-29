export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-14 w-14" />
          <div>
            <p className="text-xl font-bold">Überführung</p>
            <p className="text-sm text-slate-500">Fahrzeugüberführungen einfach dokumentieren &amp; abrechnen</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
