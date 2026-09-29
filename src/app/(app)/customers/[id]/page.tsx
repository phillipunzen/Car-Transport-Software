import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { customerName, customerNo, formatDate, formatMoney, orderNo } from "@/lib/format";
import { INVOICE_STATUS, ORDER_STATUS } from "@/lib/labels";
import { CustomerForm } from "@/components/customer-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { deleteCustomer, updateCustomer } from "../actions";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const customer = await db.customer.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: {
      orders: { orderBy: { createdAt: "desc" }, take: 50 },
      invoices: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!customer) notFound();

  return (
    <>
      <PageHeader
        title={customerName(customer)}
        subtitle={customerNo(customer.number)}
        back={{ href: "/customers", label: "Kunden" }}
        actions={<Link href={`/orders/new?customerId=${customer.id}`} className="btn-primary">+ Neuer Auftrag</Link>}
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card title="Stammdaten">
            <CustomerForm action={updateCustomer} customer={customer} />
          </Card>
          {customer.orders.length === 0 && customer.invoices.length === 0 && (
            <form action={deleteCustomer} className="mt-4">
              <input type="hidden" name="id" value={customer.id} />
              <SubmitButton className="btn-danger" pendingText="Löschen…" confirm="Kunde wirklich löschen?">
                Kunde löschen
              </SubmitButton>
            </form>
          )}
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Card title="Aufträge">
            {customer.orders.length === 0 ? (
              <p className="text-sm text-slate-500">Noch keine Aufträge.</p>
            ) : (
              <ul className="-my-2 divide-y divide-slate-100">
                {customer.orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-2 py-2 hover:text-brand-600">
                      <span className="min-w-0 truncate text-sm">
                        <span className="font-medium">{orderNo(o.number)}</span> · {[o.make, o.model].filter(Boolean).join(" ") || o.licensePlate || "Fahrzeug"}
                      </span>
                      <Badge className={ORDER_STATUS[o.status].color}>{ORDER_STATUS[o.status].label}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Rechnungen">
            {customer.invoices.length === 0 ? (
              <p className="text-sm text-slate-500">Noch keine Rechnungen.</p>
            ) : (
              <ul className="-my-2 divide-y divide-slate-100">
                {customer.invoices.map((i) => (
                  <li key={i.id}>
                    <Link href={`/invoices/${i.id}`} className="flex items-center justify-between gap-2 py-2 hover:text-brand-600">
                      <span className="text-sm">
                        <span className="font-medium">{i.number ?? "Entwurf"}</span> · {formatDate(i.issueDate ?? i.createdAt)} · {formatMoney(i.grossTotal)}
                      </span>
                      <Badge className={INVOICE_STATUS[i.status].color}>{INVOICE_STATUS[i.status].label}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
