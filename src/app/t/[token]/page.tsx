import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDateTime, orderNo } from "@/lib/format";
import { validToken } from "@/lib/public";

export const metadata: Metadata = { title: "Status Ihrer Überführung", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Step = { label: string; done: boolean; at?: Date | null; hint?: string };

export default async function TrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!validToken(token)) notFound();
  const order = await db.order.findUnique({
    where: { trackingToken: token },
    include: { organization: true, protocols: { select: { type: true, completedAt: true, performedAt: true } } },
  });
  if (!order) notFound();
  const org = order.organization;
  const company = org.companyName ?? org.name;
  const pickup = order.protocols.find((p) => p.type === "PICKUP" && p.completedAt);
  const delivery = order.protocols.find((p) => p.type === "DELIVERY" && p.completedAt);
  const cancelled = order.status === "CANCELLED";
  const vehicle = [order.make, order.model].filter(Boolean).join(" ") || "Ihr Fahrzeug";

  const steps: Step[] = [
    { label: "Auftrag bestätigt", done: true, at: order.createdAt },
    {
      label: "Abholung geplant",
      done: Boolean(order.pickupDate) || Boolean(pickup),
      at: order.pickupDate ?? pickup?.performedAt,
      hint: order.pickupDate ? undefined : "Termin wird noch abgestimmt",
    },
    { label: `Abgeholt${order.pickupCity ? ` in ${order.pickupCity}` : ""}`, done: Boolean(pickup), at: pickup?.performedAt ?? pickup?.completedAt },
    {
      label: `Zugestellt${order.deliveryCity ? ` in ${order.deliveryCity}` : ""}`,
      done: Boolean(delivery),
      at: delivery?.performedAt ?? delivery?.completedAt ?? null,
      hint: !delivery && order.deliveryDate ? `geplant: ${formatDateTime(order.deliveryDate)}` : undefined,
    },
  ];
  const current = steps.findIndex((s) => !s.done);
  const headline = cancelled ? "Auftrag storniert" : delivery ? "Zugestellt" : pickup ? "Unterwegs" : order.pickupDate ? "Abholung geplant" : "Auftrag bestätigt";

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-lg space-y-5">
        <header className="flex items-center gap-3">
          {org.logoFileId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/t/${token}/logo`} alt="" className="h-12 max-w-[8rem] object-contain" />
          )}
          <div>
            <p className="font-semibold">{company}</p>
            <p className="text-sm text-slate-500">Fahrzeugüberführung {orderNo(order.number)}</p>
          </div>
        </header>

        <section className="card card-body">
          <p className="text-sm text-slate-500">
            {vehicle}
            {order.licensePlate && ` · ${order.licensePlate}`}
          </p>
          <h1 className={`mt-1 text-2xl font-bold ${cancelled ? "text-red-600" : delivery ? "text-emerald-600" : "text-slate-900"}`}>{headline}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {order.pickupCity ?? "Abholort"} → {order.deliveryCity ?? "Zielort"}
          </p>
        </section>

        {!cancelled && (
          <section className="card card-body">
            <ol className="relative space-y-5">
              {steps.map((s, i) => (
                <li key={s.label} className="flex gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      s.done ? "bg-emerald-500 text-white" : i === current ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {s.done ? "✓" : i + 1}
                  </span>
                  <div>
                    <p className={`font-medium ${s.done || i === current ? "text-slate-900" : "text-slate-400"}`}>{s.label}</p>
                    {s.at && s.done && <p className="text-sm text-slate-500">{formatDateTime(s.at)}</p>}
                    {s.hint && !s.done && <p className="text-sm text-slate-500">{s.hint}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {(pickup || delivery) && (
          <section className="card card-body space-y-2">
            <h2 className="font-semibold">Protokolle</h2>
            {pickup && (
              <a href={`/t/${token}/protocol/pickup`} target="_blank" rel="noreferrer" className="btn-secondary w-full">
                Abholprotokoll (PDF)
              </a>
            )}
            {delivery && (
              <a href={`/t/${token}/protocol/delivery`} target="_blank" rel="noreferrer" className="btn-secondary w-full">
                Übergabeprotokoll (PDF)
              </a>
            )}
          </section>
        )}

        <footer className="text-center text-sm text-slate-500">
          Fragen? {company}
          {org.phone && (
            <>
              {" · "}
              <a href={`tel:${org.phone.replace(/\s/g, "")}`} className="text-brand-600">
                {org.phone}
              </a>
            </>
          )}
          {org.email && (
            <>
              {" · "}
              <a href={`mailto:${org.email}`} className="text-brand-600">
                {org.email}
              </a>
            </>
          )}
        </footer>
      </div>
    </main>
  );
}
