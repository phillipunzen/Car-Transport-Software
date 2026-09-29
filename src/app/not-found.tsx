import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl font-bold text-slate-300">404</p>
      <p className="text-slate-600">Diese Seite wurde nicht gefunden.</p>
      <Link href="/dashboard" className="btn-primary">
        Zur Übersicht
      </Link>
    </main>
  );
}
