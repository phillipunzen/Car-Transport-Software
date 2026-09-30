import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoicePdf } from "@/lib/pdf/load";
import { portalCustomer } from "@/lib/portal";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const customer = await portalCustomer(token);
  if (!customer) return new NextResponse("Not found", { status: 404 });
  const invoice = await db.invoice.findFirst({ where: { id, customerId: customer.id, status: { not: "DRAFT" } }, select: { id: true } });
  if (!invoice) return new NextResponse("Not found", { status: 404 });
  const result = await invoicePdf(customer.organizationId, invoice.id);
  if (!result) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(result.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${result.filename}"`, "Cache-Control": "no-store" },
  });
}
