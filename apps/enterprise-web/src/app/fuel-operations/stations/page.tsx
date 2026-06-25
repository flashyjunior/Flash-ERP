import { FuelOperationsDedicatedPage } from "../_fuel-page";

export const dynamic = "force-dynamic";

export default async function FuelStationsPage() {
  return FuelOperationsDedicatedPage({
    defaultView: "stations",
    pageDescription: "Maintain filling-station destinations and customer links.",
    pageHeading: "Filling Stations"
  });
}
