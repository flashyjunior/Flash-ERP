import { FuelOperationsDedicatedPage } from "../_fuel-page";

export const dynamic = "force-dynamic";

export default async function FuelTanksPage() {
  return FuelOperationsDedicatedPage({
    defaultView: "tanks",
    pageDescription: "Maintain fuel tanks, products, capacities, and book quantities.",
    pageHeading: "Fuel Tanks"
  });
}
