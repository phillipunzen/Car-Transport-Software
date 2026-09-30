import type { Quote } from "@prisma/client";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { nextNumber } from "@/lib/org";
import { syncVehicle } from "@/lib/vehicles";

/** Angebot → Auftrag (aus dem Büro oder bei Online-Annahme durch den Kunden). */
export async function createOrderFromQuote(quote: Quote, by: { userId: string | null; userName: string; event?: string }) {
  if (quote.orderId) return db.order.findUniqueOrThrow({ where: { id: quote.orderId } });
  const vehicle = { licensePlate: quote.licensePlate, make: quote.make, model: quote.model, vin: null, color: null, firstRegistration: null, vehicleType: null };
  const vehicleId = quote.licensePlate || quote.make ? await syncVehicle(quote.organizationId, quote.customerId, vehicle, null) : null;
  const number = await nextNumber(quote.organizationId, "nextOrderNumber");
  const order = await db.order.create({
    data: {
      organizationId: quote.organizationId,
      customerId: quote.customerId,
      number,
      status: quote.pickupDate ? "PLANNED" : "DRAFT",
      createdById: by.userId,
      assignedToId: by.userId,
      transportMode: quote.transportMode,
      pickupStreet: quote.pickupStreet,
      pickupZip: quote.pickupZip,
      pickupCity: quote.pickupCity,
      pickupDate: quote.pickupDate,
      deliveryStreet: quote.deliveryStreet,
      deliveryZip: quote.deliveryZip,
      deliveryCity: quote.deliveryCity,
      licensePlate: quote.licensePlate,
      make: quote.make,
      model: quote.model,
      vehicleId,
      distanceKm: quote.distanceKm,
      durationMinutes: quote.durationMinutes,
      pricingType: quote.pricingType,
      price: quote.price,
      pricePerKm: quote.pricePerKm,
      returnType: quote.returnType,
      returnFlat: quote.returnFlat,
      returnPerKm: quote.returnPerKm,
    },
  });
  await db.quote.update({ where: { id: quote.id }, data: { status: "ACCEPTED", orderId: order.id } });
  await db.inquiry.updateMany({ where: { quoteId: quote.id, orderId: null }, data: { orderId: order.id } });
  await db.orderEvent.create({
    data: { orderId: order.id, userName: by.userName, message: by.event ?? `Auftrag aus Angebot ${quote.number} (${formatDate(quote.createdAt)}) erstellt` },
  });
  return order;
}
