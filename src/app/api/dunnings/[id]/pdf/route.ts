import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { dunningPdf, memberOrgFor } from "@/lib/pdf/load";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const dunning = await db.dunning.findUnique({ where: { id }, select: { invoice: { select: { organizationId: true } } } });
  const orgId = await memberOrgFor(session.user.id, dunning?.invoice.organizationId);
  if (!orgId) return new NextResponse("Not found", { status: 404 });
  const result = await dunningPdf(orgId, id);
  if (!result) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(result.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${result.filename}"`, "Cache-Control": "no-store" },
  });
}
