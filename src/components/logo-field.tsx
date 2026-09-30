"use client";

import { useEffect, useState } from "react";

/** Logo-Upload mit Vorschau (neu gewählte Datei bzw. aktuelles Logo) und Entfernen-Option. */
export function LogoField({ currentUrl }: { currentUrl: string | null }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const shown = preview ?? (remove ? null : currentUrl);

  return (
    <div className="sm:col-span-2">
      <label htmlFor="logo">Firmenlogo</label>
      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-20 w-48 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-2">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="Logo-Vorschau" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-slate-400">kein Logo</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPreview(f ? URL.createObjectURL(f) : null);
              if (f) setRemove(false);
            }}
            className="input file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1"
          />
          {currentUrl && !preview && (
            <label className="flex items-center gap-2 text-sm font-normal">
              <input type="checkbox" name="removeLogo" checked={remove} onChange={(e) => setRemove(e.target.checked)} className="h-4 w-4 accent-brand-600" />
              Logo entfernen
            </label>
          )}
          <p className="text-xs text-slate-500">
            PNG, JPG, WebP oder SVG – am besten mit transparentem Hintergrund. Leere Ränder werden automatisch entfernt. Das Logo erscheint auf Rechnungen, Angeboten, Mahnungen,
            Protokollen, dem Status-Link, dem Anfrageformular und oben in der App. Nach dem Auswählen „Einstellungen speichern“.
          </p>
        </div>
      </div>
    </div>
  );
}
