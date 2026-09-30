import { NextResponse } from "next/server";
import { zipSync } from "fflate";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ACTIVE_ORG_COOKIE } from "@/lib/org";
import { getFile } from "@/lib/storage";
import { exportFileName, parseFilters, queryDocuments, type DocumentRow } from "@/lib/documents";
import { EXPENSE_CATEGORY } from "@/lib/labels";

export const runtime = "nodejs";

const csvCell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const num = (n: number | null) => (n === null ? "" : n.toFixed(2).replace(".", ","));

function csv(rows: DocumentRow[], names: Map<string, string>) {
  const header = ["Datum", "Typ", "Kategorie", "Aussteller/Titel", "Beschreibung", "Brutto", "USt %", "Währung", "Weiterberechnet", "Kunde", "Kennzeichen", "Auftrag", "Datei"];
  const lines = rows.map((r) =>
    [
      r.date.toISOString().slice(0, 10),
      r.type === "expense" ? "Beleg" : "Fahrzeugdokument",
      r.category ? EXPENSE_CATEGORY[r.category] ?? r.category : "",
      r.title,
      r.subtitle,
      num(r.amountGross),
      r.vatRate === null ? "" : String(r.vatRate).replace(".", ","),
      r.currency,
      r.rebillable === null ? "" : r.rebillable ? "ja" : "nein",
      r.customer?.name,
      r.plate,
      r.order?.label,
      names.get(r.key) ?? (r.file ? "" : "ohne Datei"),
    ]
      .map(csvCell)
      .join(";"),
  );
  // BOM, damit Excel Umlaute korrekt erkennt
  return "﻿" + [header.join(";"), ...lines].join("\r\n");
}

/** Export der (gefilterten) Belege & Dokumente als ZIP inkl. Übersicht oder als CSV. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

  // Aktive Instanz wie in der App bestimmen
  const cookieOrg = req.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${ACTIVE_ORG_COOKIE}=`))
    ?.split("=")[1];
  const memberships = await db.membership.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" } });
  const member = memberships.find((m) => m.organizationId === cookieOrg) ?? memberships[0];
  const orgId = member?.organizationId;
  // Belegarchiv ist Büro-Bereich
  if (!orgId || member.role === "DRIVER") return new NextResponse("Not found", { status: 404 });

  const url = new URL(req.url);
  const filters = parseFilters(Object.fromEntries(url.searchParams));
  const rows = await queryDocuments(orgId, filters, 1000);
  const stamp = new Date().toISOString().slice(0, 10);

  const names = new Map<string, string>();
  rows.forEach((r, i) => {
    if (r.file) names.set(r.key, exportFileName(r, r.category ? EXPENSE_CATEGORY[r.category] : undefined, i));
  });

  if (url.searchParams.get("format") === "csv") {
    return new NextResponse(csv(rows, names), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="Belege_${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const files: Record<string, Uint8Array> = {};
  for (const r of rows) {
    const name = names.get(r.key);
    if (!r.file || !name) continue;
    const record = await db.file.findUnique({ where: { id: r.file.id } });
    if (!record) continue;
    try {
      files[name] = new Uint8Array(await getFile(record.storageKey));
    } catch {
      names.set(r.key, `${name} (Datei fehlt)`);
    }
  }
  files["Uebersicht.csv"] = new TextEncoder().encode(csv(rows, names));
  // Bilder/PDFs sind bereits komprimiert → nur speichern (schneller, kaum größer)
  const zip = zipSync(files, { level: 0 });
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="Belege_${stamp}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
