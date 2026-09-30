import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { orderNo } from "@/lib/format";
import { validToken } from "@/lib/public";
import { ReviewForm } from "@/components/review-form";

export const metadata: Metadata = { title: "Ihre Bewertung", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ s?: string }> }) {
  const { token } = await params;
  const { s } = await searchParams;
  if (!validToken(token)) notFound();
  const order = await db.order.findUnique({ where: { feedbackToken: token }, include: { organization: true } });
  if (!order) notFound();
  const company = order.organization.companyName ?? order.organization.name;
  const initial = Math.min(5, Math.max(0, Number(s) || 0));
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-8">
      <div className="card card-body w-full max-w-md space-y-4">
        <div className="text-center">
          <p className="text-sm text-slate-500">{company}</p>
          <h1 className="text-lg font-semibold">
            Überführung {orderNo(order.number)} · {order.pickupCity ?? "?"} → {order.deliveryCity ?? "?"}
          </h1>
        </div>
        <ReviewForm token={token} initial={initial} existing={order.feedbackRating} reviewUrl={order.organization.reviewUrl} company={company} />
      </div>
    </main>
  );
}
