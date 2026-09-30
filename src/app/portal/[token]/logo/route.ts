import { NextResponse } from "next/server";
import { logoResponse } from "@/lib/public";
import { portalCustomer } from "@/lib/portal";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const customer = await portalCustomer(token);
  if (!customer) return new NextResponse("Not found", { status: 404 });
  return logoResponse(customer.organization.logoFileId);
}
