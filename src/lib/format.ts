import type { Prisma } from "@prisma/client";

type Num = number | string | Prisma.Decimal | null | undefined;

export const toNumber = (v: Num) => (v === null || v === undefined || v === "" ? 0 : Number(v));

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
export const formatMoney = (v: Num, currency = "EUR") =>
  currency === "EUR"
    ? eur.format(toNumber(v))
    : new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(toNumber(v));

export const formatNumber = (v: Num, digits = 2) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(toNumber(v));

export const formatDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }) : "–";

export const formatDateTime = (d: Date | string | null | undefined) =>
  d
    ? new Date(d).toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Berlin",
      })
    : "–";

/** Wert für <input type="datetime-local"> in Berliner Zeit */
export function toDateTimeLocal(d: Date | null | undefined) {
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return parts.replace(" ", "T");
}

/** Interpretiert "YYYY-MM-DDTHH:mm" als Berliner Zeit. */
export function fromDateTimeLocal(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [date, time = "00:00"] = value.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (!y || !m || !d) return null;
  const utcGuess = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  const berlin = new Date(new Date(utcGuess).toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const utc = new Date(new Date(utcGuess).toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(utcGuess - (berlin.getTime() - utc.getTime()));
}

export const toDateInput = (d: Date | null | undefined) => (d ? toDateTimeLocal(d).slice(0, 10) : "");

export const orderNo = (n: number) => `A-${String(n).padStart(5, "0")}`;
export const customerNo = (n: number) => `K-${String(n).padStart(5, "0")}`;

export function customerName(c: { type?: string; companyName?: string | null; firstName?: string | null; lastName?: string | null }) {
  const person = [c.firstName, c.lastName].filter(Boolean).join(" ");
  if (c.type === "COMPANY" && c.companyName) return c.companyName;
  return person || c.companyName || "Unbenannt";
}

export function addressLines(c: {
  type?: string;
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
}) {
  const person = [c.firstName, c.lastName].filter(Boolean).join(" ");
  const lines = [
    c.type === "COMPANY" ? c.companyName : null,
    c.type === "COMPANY" && person ? `z. Hd. ${person}` : c.type !== "COMPANY" ? person || c.companyName : null,
    c.street,
    [c.zip, c.city].filter(Boolean).join(" "),
    c.country && c.country !== "Deutschland" ? c.country : null,
  ];
  return lines.filter((l): l is string => Boolean(l && l.trim()));
}

export const str = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

/** Zahl aus einem Formularfeld – akzeptiert "1.234,56" und "1234.56". */
export const decimal = (v: FormDataEntryValue | null) => {
  if (typeof v !== "string" || v.trim() === "") return null;
  const s = v.trim();
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};
