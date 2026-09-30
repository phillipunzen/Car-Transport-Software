import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ACTIVE_ORG_COOKIE } from "@/lib/org";
import { loadReport, periodFrom } from "@/lib/reports";
import { buildDatev, toWindows1252 } from "@/lib/datev";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  const memberships = await db.membership.findMany({ where: { userId: session.user.id }, include: { organization: true }, orderBy: { createdAt: "asc" } });
  const wanted = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const m = memberships.find((x) => x.organizationId === wanted) ?? memberships[0];
  if (!m || m.role === "DRIVER") return new NextResponse("Not found", { status: 404 });
  const url = new URL(req.url);
  const period = periodFrom(url.searchParams.get("p") ?? undefined, url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined);
  const r = await loadReport(m.organizationId, period);
  const org = m.organization;

  if (url.searchParams.get("format") === "datev") {
    const fyStart = new Date(`${period.from.slice(0, 4)}-01-01T12:00:00Z`);
    const csv = buildDatev(r.invoices, {
      consultant: org.datevConsultant,
      client: org.datevClient,
      chart: org.datevChart,
      revenueAccount: org.datevRevenue,
      from: new Date(`${period.from}T12:00:00Z`),
      to: new Date(`${period.to}T12:00:00Z`),
      fiscalYearStart: fyStart,
    });
    return new NextResponse(toWindows1252(csv), {
      headers: {
        "Content-Type": "text/csv; charset=windows-1252",
        "Content-Disposition": `attachment; filename="EXTF_Buchungsstapel_${period.from}_${period.to}.csv"`,
      },
    });
  }
  const rows = [["Rechnungsnummer", "Datum", "Kundennummer", "Kunde", "Netto", "Brutto"].join(";")];
  for (const i of r.invoices) {
    rows.push(
      [i.number, i.issueDate.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }), String(i.customerNumber), `"${i.customerName.replace(/"/g, '""')}"`, i.net.toFixed(2).replace(".", ","), i.gross.toFixed(2).replace(".", ",")].join(";"),
    );
  }
  return new NextResponse("﻿" + rows.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="Rechnungen_${period.from}_${period.to}.csv"` },
  });
}
