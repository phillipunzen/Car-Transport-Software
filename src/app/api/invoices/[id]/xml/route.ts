import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { invoiceXml, memberOrgFor } from "@/lib/pdf/load";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const invoice = await db.invoice.findUnique({ where: { id }, select: { organizationId: true } });
  const orgId = await memberOrgFor(session.user.id, invoice?.organizationId, { office: true });
  if (!orgId) return new NextResponse("Not found", { status: 404 });
  const result = await invoiceXml(orgId, id);
  if (!result) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(result.xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
