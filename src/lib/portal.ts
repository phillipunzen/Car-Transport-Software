import { db } from "@/lib/db";
import { validToken } from "@/lib/public";

export async function portalCustomer(token: string) {
  if (!validToken(token)) return null;
  return db.customer.findUnique({ where: { portalToken: token }, include: { organization: true } });
}
