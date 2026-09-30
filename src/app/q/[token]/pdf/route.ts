import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { quotePdf } from "@/lib/pdf/load";
import { validToken } from "@/lib/public";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!validToken(token)) return new NextResponse("Not found", { status: 404 });
  const quote = await db.quote.findUnique({ where: { publicToken: token }, select: { id: true, organizationId: true } });
  if (!quote) return new NextResponse("Not found", { status: 404 });
  const result = await quotePdf(quote.organizationId, quote.id);
  if (!result) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(result.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${result.filename}"`, "Cache-Control": "no-store" },
  });
}
