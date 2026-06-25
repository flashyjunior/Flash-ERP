import { FuelOperationsDedicatedPage } from "../_fuel-page";

export const dynamic = "force-dynamic";

export default async function FuelDeliveriesPage() {
  return FuelOperationsDedicatedPage({
    defaultView: "station-deliveries",
    pageDescription: "Record outbound physical dispatches from source tanks to filling stations.",
    pageHeading: "Fuel Deliveries"
  });
}
