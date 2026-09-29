import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { formatDateTime } from "@/lib/format";
import { DAMAGE_AREAS, DAMAGE_SEVERITY, DAMAGE_TYPES, PHOTO_CATEGORIES } from "@/lib/labels";
import { Badge, Card } from "@/components/ui";
import { PhotoUpload } from "@/components/photo-upload";
import { DamageForm } from "@/components/damage-form";
import { CarDiagram } from "@/components/car-diagram";
import { SubmitButton } from "@/components/submit-button";
import { deleteDamage, deletePhoto } from "./actions";

export default async function ConditionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ stage?: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const stage = (await searchParams).stage === "delivery" ? "DELIVERY" : "PICKUP";
  const order = await db.order.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: {
      photos: { orderBy: { createdAt: "asc" } },
      damages: { orderBy: { createdAt: "asc" }, include: { photo: true } },
    },
  });
  if (!order) notFound();

  const photos = order.photos.filter((p) => p.stage === stage);
  const damages = order.damages.filter((d) => d.stage === stage);
  const pickupDamages = order.damages.filter((d) => d.stage === "PICKUP");
  const counts = damages.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.area]: (acc[d.area] ?? 0) + 1 }), {});
  const pickupCounts = pickupDamages.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.area]: (acc[d.area] ?? 0) + 1 }), {});

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
        {(["PICKUP", "DELIVERY"] as const).map((s) => (
          <Link
            key={s}
            href={`?stage=${s.toLowerCase()}`}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${stage === s ? "bg-white shadow-sm" : "text-slate-500"}`}
          >
            {s === "PICKUP" ? "Bei Abholung" : "Bei Übergabe"}
          </Link>
        ))}
      </div>

      <Card title={`Fotos (${photos.length})`}>
        <PhotoUpload orderId={order.id} stage={stage} />
        {photos.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              <figure key={p.id} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                <a href={`/api/files/${p.fileId}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${p.fileId}`} alt={PHOTO_CATEGORIES[p.category]} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                </a>
                <figcaption className="flex items-center justify-between gap-1 bg-white px-2 py-1.5 text-xs">
                  <span className="truncate">
                    <span className="font-medium">{PHOTO_CATEGORIES[p.category] ?? p.category}</span>
                    <span className="block text-slate-400">{formatDateTime(p.createdAt)}</span>
                  </span>
                  <form action={deletePhoto}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="photoId" value={p.id} />
                    <SubmitButton className="text-red-500 hover:text-red-700" pendingText="…" confirm="Foto löschen?">
                      ✕
                    </SubmitButton>
                  </form>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </Card>

      <Card title={`Schäden ${stage === "PICKUP" ? "bei Abholung" : "bei Übergabe"} (${damages.length})`}>
        <DamageForm orderId={order.id} stage={stage} counts={counts} />
        {damages.length > 0 && (
          <ul className="mt-6 divide-y divide-slate-100 border-t border-slate-100">
            {damages.map((d) => (
              <li key={d.id} className="flex items-start gap-3 py-3">
                {d.photo && (
                  <a href={`/api/files/${d.photo.fileId}`} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${d.photo.fileId}`} alt="" className="h-16 w-20 rounded object-cover" />
                  </a>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {DAMAGE_AREAS[d.area] ?? d.area} – {DAMAGE_TYPES[d.type] ?? d.type}{" "}
                    <Badge className={DAMAGE_SEVERITY[d.severity]?.color ?? ""}>{DAMAGE_SEVERITY[d.severity]?.label}</Badge>
                  </p>
                  {d.description && <p className="text-sm text-slate-600">{d.description}</p>}
                </div>
                <form action={deleteDamage}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="damageId" value={d.id} />
                  <SubmitButton className="text-sm text-red-500" pendingText="…" confirm="Schaden entfernen?">
                    Entfernen
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {stage === "DELIVERY" && (
        <Card title="Zum Vergleich: Schäden bei Abholung">
          {pickupDamages.length === 0 ? (
            <p className="text-sm text-slate-500">Bei der Abholung wurden keine Schäden dokumentiert.</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <CarDiagram counts={pickupCounts} />
              <ul className="space-y-2 text-sm">
                {pickupDamages.map((d) => (
                  <li key={d.id}>
                    • {DAMAGE_AREAS[d.area]} – {DAMAGE_TYPES[d.type]} ({DAMAGE_SEVERITY[d.severity]?.label})
                    {d.description && <span className="text-slate-500"> – {d.description}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
