import { AuthScene } from "./auth-scene";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative isolate flex min-h-dvh items-start justify-center overflow-hidden px-4 pt-[8vh] pb-12 sm:items-center sm:py-16">
      <AuthScene />
      <div className="w-full max-w-[26rem]">
        <div className="mb-6 flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-12 w-12 rounded-2xl shadow-lg shadow-black/30 ring-1 ring-white/15" />
          <span className="text-base font-semibold tracking-tight text-white">Überführung</span>
        </div>
        <div className="[&>.card]:rounded-2xl [&>.card]:border-white/10 [&>.card]:shadow-[0_24px_64px_-16px_rgb(0_0_0/0.55)] sm:[&>.card]:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
