import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { renderInvoicePdf } from "@/lib/pdf/invoice";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: { items: { orderBy: { position: "asc" } }, customer: true, order: true, organization: true },
  });
  if (!invoice) return new NextResponse("Not found", { status: 404 });
  const member = await db.membership.findFirst({ where: { userId: session.user.id, organizationId: invoice.organizationId } });
  if (!member) return new NextResponse("Not found", { status: 404 });

  const pdf = await renderInvoicePdf(invoice.organization, invoice);
  const name = invoice.number ? `Rechnung_${invoice.number}.pdf` : "Rechnungsentwurf.pdf";
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
