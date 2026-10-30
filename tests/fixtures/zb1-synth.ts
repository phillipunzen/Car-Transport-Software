import sharp from "sharp";

/**
 * Künstliche Zulassungsbescheinigungen Teil I (Fahrzeugschein) für den KI-Vergleichstest.
 * Erfundene Halter, Kennzeichen und FIN – Aufbau angelehnt an den echten Vordruck
 * (Feldnummern links, Werte rechts, grüner Sicherheitsuntergrund).
 */
export type Zb1Sample = {
  id: string;
  licensePlate: string;
  make: string; // D.1
  variant: string; // D.2
  model: string; // D.3
  vin: string; // E
  firstRegistration: string; // B
  color: string; // R
  fuel: string; // P.3
  ccm: string; // P.1
  kw: string; // P.2
  owner: [string, string, string]; // C.1.1, C.1.2, C.1.3
  codes: [string, string]; // 2.1, 2.2
};

export const SAMPLES: Zb1Sample[] = [
  { id: "vw-golf", licensePlate: "M-AB 1234", make: "VOLKSWAGEN", variant: "CD1 / DJHAX", model: "GOLF", vin: "WVWZZZCDZPW123456", firstRegistration: "14.03.2019", color: "GRAU", fuel: "BENZIN", ccm: "1498", kw: "110", owner: ["MUSTERMANN", "ERIKA", "HAUPTSTR. 12, 80331 MÜNCHEN"], codes: ["0603", "BQV"] },
  { id: "bmw-320d", licensePlate: "S-KL 4711", make: "BMW", variant: "3K / 8C11", model: "320D TOURING", vin: "WBA8E11030K456789", firstRegistration: "02.11.2017", color: "SCHWARZ", fuel: "DIESEL", ccm: "1995", kw: "140", owner: ["BEISPIEL GMBH", "", "INDUSTRIEWEG 4, 70173 STUTTGART"], codes: ["0005", "BKV"] },
  { id: "mb-e220", licensePlate: "HH-ME 220", make: "MERCEDES-BENZ", variant: "213 / E2EM0", model: "E 220 D", vin: "WDD2130041A987654", firstRegistration: "29.06.2020", color: "WEISS", fuel: "DIESEL", ccm: "1950", kw: "143", owner: ["SCHULZE", "THOMAS", "ELBCHAUSSEE 7, 22763 HAMBURG"], codes: ["1313", "BJD"] },
  { id: "skoda-octavia", licensePlate: "DD-OK 88", make: "SKODA", variant: "NX / ABDLZX", model: "OCTAVIA COMBI", vin: "TMBJJ7NX5M0123456", firstRegistration: "07.01.2021", color: "BLAU", fuel: "BENZIN", ccm: "1498", kw: "110", owner: ["KRAUSE", "MARIA", "LINDENWEG 3, 01067 DRESDEN"], codes: ["8004", "BEF"] },
  { id: "renault-clio", licensePlate: "K-RC 512", make: "RENAULT", variant: "B / 7D2A1", model: "CLIO", vin: "VF1RJA00X65432109", firstRegistration: "21.09.2022", color: "ROT", fuel: "BENZIN", ccm: "999", kw: "67", owner: ["ÖZDEMIR", "AYŞE", "RINGSTR. 101, 50672 KÖLN"], codes: ["3001", "BMA"] },
  { id: "mazda-cx5", licensePlate: "N-MZ 905", make: "MAZDA", variant: "KF / 2WL", model: "MAZDA CX-5", vin: "JMZKF6W1A00123456", firstRegistration: "15.05.2018", color: "ROT", fuel: "BENZIN", ccm: "1998", kw: "121", owner: ["WAGNER", "PETER", "BURGSTR. 9, 90403 NÜRNBERG"], codes: ["7118", "AGD"] },
  { id: "ford-focus", licensePlate: "B-FF 2023", make: "FORD", variant: "DEH / 3GJ", model: "FOCUS", vin: "WF0NXXGCHNKA12345", firstRegistration: "03.03.2023", color: "SILBER", fuel: "BENZIN", ccm: "999", kw: "92", owner: ["NOVAK", "JAN", "TORSTR. 55, 10119 BERLIN"], codes: ["0928", "BHZ"] },
  { id: "tesla-model3", licensePlate: "F-EL 3E", make: "TESLA", variant: "3 / ESDA", model: "MODEL 3", vin: "LRW3E7FS5NC123456", firstRegistration: "18.08.2022", color: "WEISS", fuel: "ELEKTRO", ccm: "", kw: "208", owner: ["HOFFMANN", "LENA", "MAINZER LDSTR. 2, 60329 FRANKFURT"], codes: ["5000", "BAU"] },
];

export type Variant = "scan" | "photo" | "lowres" | "hard";
export const VARIANTS: Variant[] = ["scan", "photo", "lowres", "hard"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const W = 1700;
const H = 1100;

function svg(s: Zb1Sample) {
  // Sicherheitsuntergrund: feine Wellenlinien wie auf dem Vordruck
  const waves = Array.from({ length: 70 }, (_, i) => {
    const y = 10 + i * 16;
    let d = `M0 ${y}`;
    for (let x = 0; x <= W; x += 40) d += ` Q${x + 20} ${y + (i % 2 ? 6 : -6)} ${x + 40} ${y}`;
    return `<path d="${d}" stroke="#b9d8b4" stroke-width="1" fill="none"/>`;
  }).join("");

  const label = (x: number, y: number, t: string) => `<text x="${x}" y="${y}" font-family="DejaVu Sans" font-size="15" fill="#3d6b44">${esc(t)}</text>`;
  const value = (x: number, y: number, t: string, size = 26) => `<text x="${x}" y="${y}" font-family="DejaVu Sans Mono" font-size="${size}" font-weight="bold" fill="#151515">${esc(t)}</text>`;
  const row = (x: number, y: number, code: string, desc: string, v: string) => `${label(x, y - 22, `${code}  ${desc}`)}${value(x + 10, y + 8, v)}<line x1="${x}" y1="${y + 20}" x2="${x + 760}" y2="${y + 20}" stroke="#7fae86" stroke-width="1"/>`;

  const left = [
    `<text x="50" y="70" font-family="DejaVu Sans" font-size="30" font-weight="bold" fill="#244a2b">Zulassungsbescheinigung Teil I</text>`,
    `<text x="50" y="100" font-family="DejaVu Sans" font-size="18" fill="#244a2b">(Fahrzeugschein) · Bundesrepublik Deutschland</text>`,
    label(50, 128, "Permiso de circulación – Parte I / Registration certificate – Part I / Certificat d'immatriculation – Partie I"),
    `<text x="640" y="70" font-family="DejaVu Sans Mono" font-size="18" fill="#a02020">Nr. AB-${s.vin.slice(-7)}</text>`,
    row(50, 200, "A", "Amtliches Kennzeichen", s.licensePlate),
    row(50, 290, "B", "Datum der Erstzulassung des Fahrzeugs", s.firstRegistration),
    row(50, 380, "C.1.1", "Name oder Firmenname", s.owner[0]),
    row(50, 470, "C.1.2", "Vorname(n)", s.owner[1]),
    row(50, 560, "C.1.3", "Anschrift", s.owner[2]),
    row(50, 650, "E", "Fahrzeug-Identifizierungsnummer", s.vin),
    row(50, 740, "I", "Datum dieser Zulassung", s.firstRegistration),
    label(50, 830, "Zulassungsbehörde"),
    `<circle cx="680" cy="900" r="70" fill="none" stroke="#5b6fb0" stroke-width="3" opacity="0.7"/>`,
    `<text x="618" y="905" font-family="DejaVu Sans" font-size="14" fill="#5b6fb0" opacity="0.8">Siegel · Stadt</text>`,
  ];
  const rx = 900;
  const right = [
    row(rx, 90, "2.1 / 2.2", "zu 2 / zu 2.1 Code", `${s.codes[0]}   ${s.codes[1]}`),
    row(rx, 180, "D.1", "Marke", s.make),
    row(rx, 270, "D.2", "Typ / Variante / Version", s.variant),
    row(rx, 360, "D.3", "Handelsbezeichnung(en)", s.model),
    row(rx, 450, "J  4", "Fahrzeugklasse · Art des Aufbaus", "M1   AC LIMOUSINE"),
    row(rx, 540, "R", "Farbe des Fahrzeugs", s.color),
    row(rx, 630, "P.3", "Kraftstoffart oder Energiequelle", s.fuel),
    row(rx, 720, "P.1  P.2", "Hubraum in cm³ · Nennleistung in kW", `${s.ccm || "—"}   ${s.kw}`),
    row(rx, 810, "F.1  G", "Techn. zul. Gesamtmasse · Masse fahrbereit", "1930   1405"),
    row(rx, 900, "22", "Bemerkungen und Ausnahmen", "**AB 03.2024 HU NAECHSTE**"),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#e7f3e3"/>${waves}
<line x1="850" y1="20" x2="850" y2="${H - 20}" stroke="#9cc39f" stroke-width="2" stroke-dasharray="6 6"/>
${left.join("")}${right.join("")}</svg>`;
}

/** Rendert einen Fahrzeugschein als JPEG – als Scan, als schräges Handyfoto, in niedriger Auflösung oder als schlechtes Foto. */
export async function renderZb1(s: Zb1Sample, variant: Variant): Promise<Buffer> {
  const base = sharp(Buffer.from(svg(s))).png();
  if (variant === "scan") return base.jpeg({ quality: 90 }).toBuffer();
  if (variant === "lowres") return sharp(await base.toBuffer()).resize({ width: 900 }).blur(0.6).jpeg({ quality: 55 }).toBuffer();

  // Handyfoto: Tischfläche, leicht gedreht, ungleichmäßiges Licht, etwas unscharf
  const rotated = await sharp(await base.toBuffer()).rotate(variant === "hard" ? 7 : -4, { background: "#6b5a48" }).toBuffer();
  const meta = await sharp(rotated).metadata();
  const w = meta.width!;
  const h = meta.height!;
  const light = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<defs><radialGradient id="g" cx="30%" cy="25%" r="85%"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>
<linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#s)"/></svg>`);
  // sharp skaliert vor dem Überlagern – daher erst Licht auftragen, dann weiterverarbeiten
  const lit = await sharp(rotated).composite([{ input: light, blend: "over" }]).png().toBuffer();
  const hard = variant === "hard";
  return sharp(lit)
    .blur(hard ? 2.4 : 1.3)
    .modulate({ brightness: hard ? 0.75 : 0.9, saturation: 0.8 })
    .resize({ width: hard ? 1000 : 1400 })
    .jpeg({ quality: hard ? 40 : 60 })
    .toBuffer();
}
