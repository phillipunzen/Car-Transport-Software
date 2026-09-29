import Link from "next/link";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { customerName, customerNo } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Kunden" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireCtx();
  const { q } = await searchParams;
  const customers = await db.customer.findMany({
    where: {
      organizationId: ctx.orgId,
      ...(q
        ? {
            OR: [
              { companyName: { contains: q } },
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { city: { contains: q } },
              { email: { contains: q } },
            ],
          }
        : {}),
    },
    include: { _count: { select: { orders: true } } },
    orderBy: [{ companyName: "asc" }, { lastName: "asc" }],
    take: 200,
  });

  return (
    <>
      <PageHeader title="Kunden" actions={<Link href="/customers/new" className="btn-primary">+ Neuer Kunde</Link>} />
      <form className="mb-4">
        <input name="q" defaultValue={q} placeholder="Suchen nach Name, Ort, E-Mail…" className="input mt-0 max-w-md" />
      </form>
      {customers.length === 0 ? (
        <Empty title="Noch keine Kunden" text="Lege deinen ersten Kunden an, um Aufträge zu erfassen." action={<Link href="/customers/new" className="btn-primary">Kunde anlegen</Link>} />
      ) : (
        <div className="card divide-y divide-slate-100">
          {customers.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50 sm:px-6">
              <div className="min-w-0">
                <p className="truncate font-medium">{customerName(c)}</p>
                <p className="truncate text-sm text-slate-500">
                  {customerNo(c.number)} · {[c.zip, c.city].filter(Boolean).join(" ") || "Keine Adresse"}
                </p>
              </div>
              <span className="shrink-0 text-sm text-slate-500">{c._count.orders} Aufträge</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
