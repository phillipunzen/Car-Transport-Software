import Link from "next/link";
import type { InvoiceStatus } from "@prisma/client";
import { db } from "@/lib/db";

import { customerName, formatDate, formatMoney, toNumber } from "@/lib/format";
import { INVOICE_STATUS } from "@/lib/labels";
import { DUNNING_LEVEL } from "@/lib/dunning";
import { customerOptions } from "@/lib/queries";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createInvoice } from "./actions";
import { requireOffice } from "@/lib/permissions";

export const metadata = { title: "Rechnungen" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireOffice();
  const { status } = await searchParams;
  const valid = status && INVOICE_STATUS[status] ? (status as InvoiceStatus) : undefined;
  const overdueOnly = status === "OVERDUE";
  const [invoices, customers] = await Promise.all([
    db.invoice.findMany({
      where: {
        organizationId: ctx.orgId,
        ...(valid ? { status: valid } : {}),
        ...(overdueOnly ? { status: "ISSUED" as const, dueDate: { lt: new Date() }, correctsNumber: null } : {}),
      },
      include: { customer: true, dunnings: { select: { level: true } } },
      orderBy: [{ issueDate: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
      take: 300,
    }),
    customerOptions(ctx.orgId),
  ]);
  const now = new Date();
  const open = invoices.filter((i) => i.status === "ISSUED");
  const openSum = open.reduce((s, i) => s + toNumber(i.grossTotal), 0);

  return (
    <>
      <PageHeader title="Rechnungen" subtitle={`${open.length} offen · ${formatMoney(openSum)}`} />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1">
          {[["", "Alle"], ...Object.entries(INVOICE_STATUS).map(([k, v]) => [k, v.label]), ["OVERDUE", "Überfällig"]].map(([k, label]) => (
            <Link
              key={k}
              href={k ? `/invoices?status=${k}` : "/invoices"}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${(overdueOnly ? "OVERDUE" : (valid ?? "")) === k ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
            >
              {label}
            </Link>
          ))}
        </div>
        {customers.length > 0 && (
          <form action={createInvoice} className="flex gap-2">
            <select name="customerId" required className="input mt-0 lg:w-64">
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <SubmitButton className="btn-primary shrink-0">+ Freie Rechnung</SubmitButton>
          </form>
        )}
        {customers.length > 0 && (
          <div className="flex gap-2">
            <Link href="/invoices/collective" className="btn-secondary">
              Sammelrechnung
            </Link>
            {ctx.org.moduleBankImport && (
              <Link href="/bank" className="btn-secondary">
                Zahlungsabgleich
              </Link>
            )}
          </div>
        )}
      </div>

      {invoices.length === 0 ? (
        <Empty title="Keine Rechnungen" text="Rechnungen erstellst du am einfachsten direkt aus einem abgeschlossenen Auftrag." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Nummer</th>
                <th>Kunde</th>
                <th className="hidden sm:table-cell">Datum</th>
                <th className="hidden md:table-cell">Fällig</th>
                <th className="text-right">Betrag</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => {
                const overdue = i.status === "ISSUED" && i.dueDate && i.dueDate < now;
                const level = Math.max(0, ...i.dunnings.map((d) => d.level));
                return (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td>
                      <Link href={`/invoices/${i.id}`} className="font-medium text-brand-600">
                        {i.number ?? "Entwurf"}
                      </Link>
                    </td>
                    <td className="max-w-[12rem] truncate">{customerName(i.customer)}</td>
                    <td className="hidden sm:table-cell">{formatDate(i.issueDate)}</td>
                    <td className={`hidden md:table-cell ${overdue ? "font-semibold text-red-600" : ""}`}>{formatDate(i.dueDate)}</td>
                    <td className="text-right font-medium">{formatMoney(i.grossTotal)}</td>
                    <td>
                      <Badge className={overdue ? "bg-red-100 text-red-700" : INVOICE_STATUS[i.status].color}>{overdue ? "Überfällig" : INVOICE_STATUS[i.status].label}</Badge>
                      {level > 0 && i.status === "ISSUED" && <span className="ml-1 text-xs text-red-600">{DUNNING_LEVEL[level]?.label}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
