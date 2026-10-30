/**
 * Hintergrund der Anmeldeseiten: abstrakte Karte bei Nacht – Höhenlinien, ein feines Straßennetz
 * und Lichtspuren, die langsam über die Hauptstraßen ziehen. Reines SVG mit CSS-Animation
 * (siehe .scene-* in globals.css); bei „Bewegung reduzieren“ steht das Bild still.
 */

// Hauptstraßen – darauf laufen die Lichtspuren
const HIGHWAYS = [
  "M-60 830 C 300 770, 430 570, 700 520 S 1150 380, 1660 300",
  "M-60 250 C 260 300, 500 420, 760 470 S 1200 650, 1660 770",
  "M300 -60 C 340 200, 520 360, 700 520 S 830 900, 760 1060",
  "M1220 -60 C 1160 200, 990 380, 1060 560 S 1300 860, 1360 1060",
];

// Nebenstraßen – nur Linien
const ROADS = [
  "M-60 560 C 200 540, 380 620, 560 700 S 900 760, 1100 900 S 1350 1000, 1500 1060",
  "M480 -60 C 470 120, 560 220, 760 260 S 1100 260, 1300 160 S 1500 60, 1660 80",
  "M-60 980 C 180 930, 300 880, 420 940",
  "M1660 520 C 1480 520, 1380 460, 1300 400 S 1180 300, 1060 300",
  "M120 -60 C 140 120, 90 260, 160 400 S 120 620, 40 700",
  "M1000 1060 C 990 900, 1080 820, 1200 760",
  "M820 260 C 900 330, 920 420, 900 480",
];

const TRAILS: { path: number; duration: number; delay: number }[] = [
  { path: 0, duration: 16, delay: 0 },
  { path: 0, duration: 16, delay: -9 },
  { path: 1, duration: 19, delay: -4 },
  { path: 1, duration: 19, delay: -14 },
  { path: 2, duration: 14, delay: -6 },
  { path: 3, duration: 17, delay: -2 },
  { path: 3, duration: 17, delay: -11 },
];

// Abhol- und Zielorte
const PLACES: [number, number, number][] = [
  [700, 520, 0],
  [1060, 560, -1.3],
  [330, 735, -2.1],
  [1330, 330, -0.7],
];

function contour(cx: number, cy: number, r: number) {
  // leicht unregelmäßige Ringe wie Höhenlinien
  return `M${cx - r} ${cy} C ${cx - r} ${cy - r * 0.62}, ${cx - r * 0.3} ${cy - r * 0.8}, ${cx + r * 0.25} ${cy - r * 0.7} S ${cx + r * 1.05} ${cy - r * 0.2}, ${cx + r * 0.9} ${cy + r * 0.25} S ${cx + r * 0.2} ${cy + r * 0.82}, ${cx - r * 0.35} ${cy + r * 0.66} S ${cx - r} ${cy + r * 0.3}, ${cx - r} ${cy}`;
}

export function AuthScene() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-[#0a1428]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,#16336f_0%,transparent_55%),radial-gradient(ellipse_at_80%_90%,#0f2a5c_0%,transparent_50%)]" />
      <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <filter id="scene-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="scene-fade" cx="50%" cy="50%" r="70%">
            <stop offset="0" stopColor="white" stopOpacity="1" />
            <stop offset="1" stopColor="white" stopOpacity="0.25" />
          </radialGradient>
          <mask id="scene-mask">
            <rect width="1600" height="1000" fill="url(#scene-fade)" />
          </mask>
        </defs>

        <g mask="url(#scene-mask)">
          {/* Höhenlinien */}
          <g fill="none" stroke="#9fb6e6" strokeOpacity="0.06" strokeWidth="1">
            {[60, 110, 165, 225, 290].map((r) => (
              <path key={`a${r}`} d={contour(260, 300, r)} />
            ))}
            {[70, 130, 195, 265, 340, 420].map((r) => (
              <path key={`b${r}`} d={contour(1330, 780, r)} />
            ))}
          </g>

          {/* Straßennetz */}
          <g fill="none" strokeLinecap="round">
            {ROADS.map((d) => (
              <path key={d} d={d} stroke="#7b9be0" strokeOpacity="0.14" strokeWidth="1.2" />
            ))}
            {HIGHWAYS.map((d) => (
              <path key={d} d={d} stroke="#5f88e6" strokeOpacity="0.28" strokeWidth="2" />
            ))}
          </g>

          {/* Lichtspuren */}
          <g fill="none" strokeLinecap="round" filter="url(#scene-glow)">
            {TRAILS.map((t, i) => (
              <path
                key={i}
                d={HIGHWAYS[t.path]}
                pathLength={1000}
                className="scene-trail"
                stroke={i % 3 === 2 ? "#fcd9a0" : "#a9c8ff"}
                strokeWidth="2.5"
                style={{ animationDuration: `${t.duration}s`, animationDelay: `${t.delay}s` }}
              />
            ))}
          </g>

          {/* Orte */}
          {PLACES.map(([x, y, delay]) => (
            <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
              <circle r="14" fill="none" stroke="#a9c8ff" strokeOpacity="0.5" className="scene-pulse" style={{ animationDelay: `${delay}s` }} />
              <circle r="3.5" fill="#dbe7ff" />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
