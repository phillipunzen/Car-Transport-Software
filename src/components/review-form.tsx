"use client";

import { useActionState, useState } from "react";
import { submitComment, submitRating } from "@/app/r/actions";

export function ReviewForm({ token, initial, existing, reviewUrl, company }: { token: string; initial: number; existing: number | null; reviewUrl: string | null; company: string }) {
  const [rated, rate, rating] = useActionState(submitRating, existing ? { rating: existing, saved: true } : undefined);
  const [commented, comment, commenting] = useActionState(submitComment, undefined);
  const [stars, setStars] = useState(initial);

  if (rated?.saved) {
    const good = (rated.rating ?? 0) >= 4;
    return (
      <div className="space-y-4 text-center">
        <p className="text-3xl text-amber-400">{"★".repeat(rated.rating ?? 0)}</p>
        <p className="text-lg font-semibold">Vielen Dank für Ihre Bewertung!</p>
        {good && reviewUrl ? (
          <>
            <p className="text-sm text-slate-600">Es würde uns sehr helfen, wenn Sie Ihre Erfahrung auch öffentlich teilen – das dauert nur eine Minute.</p>
            <a href={reviewUrl} target="_blank" rel="noreferrer" className="btn-primary w-full py-3 text-base">
              Bewertung für {company} schreiben
            </a>
          </>
        ) : commented?.commentSaved ? (
          <p className="text-sm text-emerald-700">Danke – Ihre Nachricht ist bei uns angekommen. Wir melden uns.</p>
        ) : (
          <form action={comment} className="space-y-2 text-left">
            <input type="hidden" name="token" value={token} />
            <label htmlFor="comment">Was können wir besser machen?</label>
            <textarea id="comment" name="comment" rows={4} className="input" />
            {commented?.error && <p className="text-sm text-red-600">{commented.error}</p>}
            <button className="btn-primary w-full" disabled={commenting}>
              Nachricht senden
            </button>
          </form>
        )}
      </div>
    );
  }
  return (
    <form action={rate} className="space-y-4 text-center">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="rating" value={stars} />
      <p className="font-medium">Wie zufrieden waren Sie mit der Überführung?</p>
      <div className="flex justify-center gap-1" role="radiogroup" aria-label="Sterne">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} Sterne`}
            onClick={() => setStars(n)}
            className={`text-4xl ${n <= stars ? "text-amber-400" : "text-slate-300"}`}
          >
            ★
          </button>
        ))}
      </div>
      {rated?.error && <p className="text-sm text-red-600">{rated.error}</p>}
      <button className="btn-primary w-full" disabled={!stars || rating}>
        Bewertung abgeben
      </button>
    </form>
  );
}
