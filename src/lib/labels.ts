// Deutsche Bezeichnungen für Enums & Auswahllisten

export const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Angelegt", color: "bg-slate-100 text-slate-700" },
  PLANNED: { label: "Geplant", color: "bg-blue-100 text-blue-700" },
  IN_TRANSIT: { label: "Unterwegs", color: "bg-amber-100 text-amber-800" },
  DELIVERED: { label: "Zugestellt", color: "bg-emerald-100 text-emerald-700" },
  INVOICED: { label: "Abgerechnet", color: "bg-violet-100 text-violet-700" },
  CANCELLED: { label: "Storniert", color: "bg-red-100 text-red-700" },
};

export const INVOICE_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Entwurf", color: "bg-slate-100 text-slate-700" },
  ISSUED: { label: "Offen", color: "bg-amber-100 text-amber-800" },
  PAID: { label: "Bezahlt", color: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { label: "Storniert", color: "bg-red-100 text-red-700" },
};

export const TRANSPORT_MODE: Record<string, string> = {
  DRIVEN: "Auf eigener Achse",
  TRAILER: "Anhänger",
  TRUCK: "Transporter / LKW",
};

export const ROLE: Record<string, string> = {
  OWNER: "Inhaber",
  ADMIN: "Administrator",
  MEMBER: "Mitarbeiter",
};

export const STAGE: Record<string, string> = {
  PICKUP: "Abholung",
  DELIVERY: "Übergabe",
};

export const PHOTO_CATEGORIES: Record<string, string> = {
  FRONT: "Front",
  REAR: "Heck",
  LEFT: "Seite links",
  RIGHT: "Seite rechts",
  FRONT_LEFT: "Schräg vorne links",
  FRONT_RIGHT: "Schräg vorne rechts",
  REAR_LEFT: "Schräg hinten links",
  REAR_RIGHT: "Schräg hinten rechts",
  INTERIOR: "Innenraum",
  DASHBOARD: "Tacho / Armaturen",
  TRUNK: "Kofferraum",
  WHEELS: "Räder / Felgen",
  VIN: "Fahrgestellnummer",
  DOCUMENTS: "Fahrzeugpapiere",
  DAMAGE: "Schaden",
  OTHER: "Sonstiges",
};

export const DAMAGE_AREAS: Record<string, string> = {
  FRONT_BUMPER: "Stoßfänger vorne",
  HOOD: "Motorhaube",
  WINDSHIELD: "Windschutzscheibe",
  ROOF: "Dach",
  REAR_WINDOW: "Heckscheibe",
  TRUNK: "Heckklappe / Kofferraum",
  REAR_BUMPER: "Stoßfänger hinten",
  FENDER_FL: "Kotflügel vorne links",
  DOOR_FL: "Tür vorne links",
  DOOR_RL: "Tür hinten links",
  QUARTER_RL: "Seitenwand hinten links",
  FENDER_FR: "Kotflügel vorne rechts",
  DOOR_FR: "Tür vorne rechts",
  DOOR_RR: "Tür hinten rechts",
  QUARTER_RR: "Seitenwand hinten rechts",
  MIRROR_L: "Außenspiegel links",
  MIRROR_R: "Außenspiegel rechts",
  WHEEL_FL: "Rad vorne links",
  WHEEL_FR: "Rad vorne rechts",
  WHEEL_RL: "Rad hinten links",
  WHEEL_RR: "Rad hinten rechts",
  SILL_L: "Schweller links",
  SILL_R: "Schweller rechts",
  INTERIOR: "Innenraum",
  UNDERBODY: "Unterboden",
  OTHER: "Sonstiges",
};

export const DAMAGE_TYPES: Record<string, string> = {
  SCRATCH: "Kratzer",
  DENT: "Delle",
  CHIP: "Steinschlag",
  CRACK: "Riss / Bruch",
  RUST: "Rost",
  PAINT: "Lackschaden",
  MISSING: "Fehlt",
  STAIN: "Verschmutzung / Fleck",
  RIM: "Felgenschaden",
  OTHER: "Sonstiges",
};

export const DAMAGE_SEVERITY: Record<string, { label: string; color: string }> = {
  MINOR: { label: "Leicht", color: "bg-yellow-100 text-yellow-800" },
  MEDIUM: { label: "Mittel", color: "bg-orange-100 text-orange-800" },
  SEVERE: { label: "Schwer", color: "bg-red-100 text-red-700" },
};

export const EXPENSE_CATEGORY: Record<string, string> = {
  TRAIN: "Bahn",
  FLIGHT: "Flug",
  BUS: "Fernbus",
  TAXI: "Taxi",
  PUBLIC_TRANSPORT: "ÖPNV",
  HOTEL: "Hotel",
  FUEL: "Tanken",
  CHARGING: "Laden (E-Auto)",
  TOLL: "Maut / Vignette",
  PARKING: "Parken",
  MEAL: "Verpflegung",
  PER_DIEM: "Spesen / Verpflegungspauschale",
  OTHER: "Sonstiges",
};

export const CLEANLINESS: Record<string, string> = {
  CLEAN: "Sauber",
  NORMAL: "Normal",
  DIRTY: "Verschmutzt",
  VERY_DIRTY: "Stark verschmutzt",
};

/** Checkliste für Übergabeprotokolle */
export const CHECKLIST_ITEMS: { key: string; label: string; kind: "bool" | "count" }[] = [
  { key: "keys", label: "Fahrzeugschlüssel (Anzahl)", kind: "count" },
  { key: "registration", label: "Zulassungsbescheinigung Teil I", kind: "bool" },
  { key: "serviceBook", label: "Serviceheft / Bordbuch", kind: "bool" },
  { key: "warningTriangle", label: "Warndreieck", kind: "bool" },
  { key: "firstAidKit", label: "Verbandskasten", kind: "bool" },
  { key: "safetyVest", label: "Warnweste(n)", kind: "bool" },
  { key: "spareWheel", label: "Reserverad / Pannenset", kind: "bool" },
  { key: "jack", label: "Wagenheber / Bordwerkzeug", kind: "bool" },
  { key: "chargingCable", label: "Ladekabel (E-Auto)", kind: "bool" },
  { key: "floorMats", label: "Fußmatten", kind: "bool" },
  { key: "parcelShelf", label: "Hutablage / Laderaumabdeckung", kind: "bool" },
  { key: "antenna", label: "Antenne", kind: "bool" },
  { key: "sdCard", label: "Navi-SD-Karte / Radiocode", kind: "bool" },
  { key: "tyresOk", label: "Reifen in Ordnung", kind: "bool" },
  { key: "lightsOk", label: "Beleuchtung in Ordnung", kind: "bool" },
  { key: "warningLights", label: "Warnleuchten im Kombiinstrument", kind: "bool" },
];

/** Rückreise des Fahrers (bei Überführung auf eigener Achse) */
export const RETURN_TYPE: Record<string, string> = {
  NONE: "Nicht berechnen",
  FLAT: "Pauschalbetrag",
  PER_KM: "Pro Kilometer",
  RECEIPTS: "Nach Belegen (Bahn, Bus, Taxi …)",
};

/** Beleg-Kategorien, die typischerweise zur Rückreise gehören */
export const TRAVEL_CATEGORIES = ["TRAIN", "BUS", "FLIGHT", "TAXI", "PUBLIC_TRANSPORT"];
