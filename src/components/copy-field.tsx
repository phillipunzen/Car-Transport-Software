"use client";

import { useState } from "react";

/** Schreibgeschütztes Feld mit Kopieren-Knopf (Links, Code-Schnipsel). */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Kopieren:", value);
    }
  };
  return (
    <div className="flex gap-2">
      <input readOnly value={value} aria-label={label} onFocus={(e) => e.target.select()} className="input mt-0 font-mono text-xs" />
      <button type="button" onClick={copy} className="btn-secondary shrink-0">
        {copied ? "✓ Kopiert" : "Kopieren"}
      </button>
    </div>
  );
}
