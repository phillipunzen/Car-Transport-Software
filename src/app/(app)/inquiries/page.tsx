import Link from "next/link";
import type { InquiryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { formatDateTime } from "@/lib/format";
import { INQUIRY_STATUS } from "@/lib/labels";
import { Badge, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Anfragen" };

export default async function InquiriesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireCtx();
  const { status = "NEW" } = await searchParams;
  const valid = INQUIRY_STATUS[status] ? (status as InquiryStatus) : undefined;
  const inquiries = await db.inquiry.findMany({
    where: { organizationId: ctx.orgId, ...(valid ? { status: valid } : {}) },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return (
    <>
      <PageHeader title="Anfragen" subtitle="Eingänge über das öffentliche Anfrageformular" back={{ href: "/quotes", label: "Angebote" }} />
      {!ctx.org.requestEnabled && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          Das Anfrageformular ist noch nicht aktiv. Du kannst es unter{" "}
          <Link href="/settings" className="font-semibold text-brand-600">
            Einstellungen → Kundenservice
          </Link>{" "}
          einschalten und den Link an Kunden geben oder auf deiner Website einbinden.
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-1">
        {[...Object.entries(INQUIRY_STATUS).map(([k, v]) => [k, v.label]), ["all", "Alle"]].map(([k, label]) => (
          <Link
            key={k}
            href={`/inquiries?status=${k}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${status === k ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      {inquiries.length === 0 ? (
        <Empty title="Keine Anfragen" text="Neue Anfragen erscheinen hier automatisch." />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {inquiries.map((i) => (
            <li key={i.id}>
              <Link href={`/inquiries/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {i.pickupCity} → {i.deliveryCity}
                    {(i.make || i.model) && <span className="font-normal text-slate-500"> · {[i.make, i.model].filter(Boolean).join(" ")}</span>}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {i.companyName ? `${i.companyName} · ` : ""}
                    {i.contactName} · {formatDateTime(i.createdAt)}
                  </p>
                </div>
                <Badge className={INQUIRY_STATUS[i.status].color}>{INQUIRY_STATUS[i.status].label}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
