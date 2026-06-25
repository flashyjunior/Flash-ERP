import { FuelOperationsDedicatedPage } from "../_fuel-page";

export const dynamic = "force-dynamic";

export default async function FuelPumpsPage() {
  return FuelOperationsDedicatedPage({
    defaultView: "pumps",
    pageDescription: "Maintain pumps, nozzles, tank links, and meter baselines.",
    pageHeading: "Fuel Pumps & Nozzles"
  });
}
