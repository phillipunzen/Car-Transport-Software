import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { validToken } from "@/lib/public";
import { InquiryForm } from "@/components/inquiry-form";

export const metadata: Metadata = { title: "Überführung anfragen", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function InquiryPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ embed?: string }> }) {
  const { token } = await params;
  const { embed } = await searchParams;
  if (!validToken(token)) notFound();
  const org = await db.organization.findUnique({ where: { requestToken: token } });
  if (!org || !org.requestEnabled) notFound();
  const company = org.companyName ?? org.name;
  return (
    <main className={embed ? "bg-transparent p-1" : "min-h-dvh bg-slate-50 px-4 py-8"}>
      <div className="mx-auto max-w-2xl space-y-5">
        {!embed && (
          <header className="flex items-center gap-3">
            {org.logoFileId && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/anfrage/${token}/logo`} alt="" className="h-12 max-w-[8rem] object-contain" />
            )}
            <div>
              <h1 className="text-xl font-bold">Überführung anfragen</h1>
              <p className="text-sm text-slate-500">{company} – Sie erhalten ein unverbindliches Angebot.</p>
            </div>
          </header>
        )}
        <InquiryForm token={token} company={company} />
      </div>
    </main>
  );
}
