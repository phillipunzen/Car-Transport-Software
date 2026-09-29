import { requireCtx } from "@/lib/org";
import { customerOptions } from "@/lib/queries";
import { Card, PageHeader } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";
import { createVehicle } from "../actions";

export const metadata = { title: "Neues Fahrzeug" };

export default async function NewVehiclePage() {
  const ctx = await requireCtx();
  const customers = await customerOptions(ctx.orgId);
  return (
    <>
      <PageHeader title="Neues Fahrzeug" back={{ href: "/vehicles", label: "Fahrzeuge" }} />
      <Card>
        <VehicleForm action={createVehicle} customers={customers} />
      </Card>
    </>
  );
}
