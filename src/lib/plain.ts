import { Prisma } from "@prisma/client";

type Plain<T> = {
  [K in keyof T]: T[K] extends Prisma.Decimal ? string : T[K] extends Prisma.Decimal | null ? string | null : T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

/** Macht Datenbankobjekte für Client-Komponenten übergabefähig (Decimal → String, Date → ISO). */
export function toPlain<T extends object>(obj: T): Plain<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v instanceof Prisma.Decimal) out[k] = v.toString();
    else if (v instanceof Date) out[k] = v.toISOString();
    else out[k] = v;
  }
  return out as Plain<T>;
}
