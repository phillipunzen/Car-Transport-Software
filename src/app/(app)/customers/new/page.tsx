import { CustomerForm } from "@/components/customer-form";
import { Card, PageHeader } from "@/components/ui";
import { createCustomer } from "../actions";

export const metadata = { title: "Neuer Kunde" };

export default async function NewCustomerPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  return (
    <>
      <PageHeader title="Neuer Kunde" back={{ href: "/customers", label: "Kunden" }} />
      <Card>
        <CustomerForm action={createCustomer} returnTo={returnTo} />
      </Card>
    </>
  );
}
