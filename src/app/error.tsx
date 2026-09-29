"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-lg font-semibold">Da ist etwas schiefgelaufen.</p>
      <p className="max-w-md text-sm text-slate-500">{error.message}</p>
      <button onClick={reset} className="btn-primary">
        Erneut versuchen
      </button>
    </main>
  );
}
