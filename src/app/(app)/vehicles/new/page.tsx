
import { customerOptions } from "@/lib/queries";
import { recognitionMode } from "@/lib/recognition";
import { Card, PageHeader } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";
import { createVehicle } from "../actions";
import { requireOffice } from "@/lib/permissions";

export const metadata = { title: "Neues Fahrzeug" };

export default async function NewVehiclePage() {
  const ctx = await requireOffice();
  const customers = await customerOptions(ctx.orgId);
  return (
    <>
      <PageHeader title="Neues Fahrzeug" back={{ href: "/vehicles", label: "Fahrzeuge" }} />
      <Card>
        <VehicleForm action={createVehicle} customers={customers} recognition={recognitionMode()} />
      </Card>
    </>
  );
}
