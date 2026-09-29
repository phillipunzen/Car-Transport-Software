"use client";

import { DAMAGE_AREAS } from "@/lib/labels";
import { CAR_ZONES as ZONES } from "@/lib/car-zones";

const EXTRA = ["SILL_L", "SILL_R", "INTERIOR", "UNDERBODY", "OTHER"];

export function CarDiagram({
  counts,
  selected,
  onSelect,
}: {
  counts: Record<string, number>;
  selected?: string;
  onSelect?: (area: string) => void;
}) {
  return (
    <div>
      <svg viewBox="0 0 240 412" className="mx-auto h-auto w-full max-w-[260px] select-none" role="img" aria-label="Fahrzeugskizze">
        <text x="120" y="6" textAnchor="middle" fontSize="7" fill="#94a3b8">
          FRONT
        </text>
        {ZONES.map((z) => {
          const n = counts[z.id] ?? 0;
          const isSel = selected === z.id;
          const fill = isSel ? "#bfdbfe" : n ? "#fecaca" : z.id.startsWith("WHEEL") ? "#334155" : "#f1f5f9";
          return (
            <g key={z.id} onClick={() => onSelect?.(z.id)} className={onSelect ? "cursor-pointer" : ""}>
              <title>{DAMAGE_AREAS[z.id]}</title>
              <rect
                x={z.x}
                y={z.y}
                width={z.w}
                height={z.h}
                rx={z.r}
                fill={fill}
                stroke={isSel ? "#1d64e0" : n ? "#dc2626" : "#94a3b8"}
                strokeWidth={isSel ? 2 : 1}
              />
              {n > 0 && (
                <>
                  <circle cx={z.x + z.w / 2} cy={z.y + z.h / 2} r="8" fill="#dc2626" />
                  <text x={z.x + z.w / 2} y={z.y + z.h / 2 + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
                    {n}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      {onSelect && (
        <div className="mt-3 flex flex-wrap justify-center gap-1">
          {EXTRA.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onSelect(a)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                selected === a ? "bg-brand-100 text-brand-700 ring-brand-500" : counts[a] ? "bg-red-50 text-red-700 ring-red-300" : "bg-white text-slate-600 ring-slate-200"
              }`}
            >
              {DAMAGE_AREAS[a]}
              {counts[a] ? ` (${counts[a]})` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
