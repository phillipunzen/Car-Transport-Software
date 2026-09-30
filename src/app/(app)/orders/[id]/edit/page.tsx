import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/org";
import { customerOptions, getOrder, memberOptions, orderToFormValues } from "@/lib/queries";
import { recognitionMode } from "@/lib/recognition";
import { geoEnabled } from "@/lib/geo";
import { vehicleOptions } from "@/lib/vehicles";
import { OrderForm } from "@/components/order-form";
import { isDriver } from "@/lib/permissions";
import { updateOrder } from "../../actions";

export default async function EditOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const { saved } = await searchParams;
  const order = await getOrder(ctx, id);
  if (!order) notFound();
  const [customers, members, vehicles] = await Promise.all([customerOptions(ctx.orgId), memberOptions(ctx.orgId), vehicleOptions(ctx.orgId)]);
  const driver = isDriver(ctx.role);
  const values = orderToFormValues(order);
  if (driver) for (const k of ["price", "pricePerKm", "returnFlat", "returnPerKm", "driverPay", "feedbackComment"]) delete values[k];
  if (values.distanceKm) values.distanceKm = values.distanceKm.replace(".", ",");
  return (
    <>
      {saved && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Auftrag angelegt. Du kannst jetzt weitere Angaben ergänzen oder später vor Ort vervollständigen.
        </div>
      )}
      <OrderForm
        action={updateOrder}
        // Fahrer bekommen keine Kundenliste/Konditionen und keinen Fahrzeugbestand
        customers={driver ? customers.filter((c) => c.id === order.customerId).map((c) => ({ ...c, conditions: { ...c.conditions, pricePerKm: null, returnFlat: null, returnPerKm: null } })) : customers}
        members={members}
        vehicles={driver ? [] : vehicles}
        values={values}
        orderId={order.id}
        restricted={driver}
        recognition={recognitionMode()}
        geo={geoEnabled()}
      />
    </>
  );
}
