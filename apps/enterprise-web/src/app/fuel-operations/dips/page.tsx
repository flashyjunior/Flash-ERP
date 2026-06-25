import { FuelOperationsDedicatedPage } from "../_fuel-page";

export const dynamic = "force-dynamic";

export default async function FuelDipsPage() {
  return FuelOperationsDedicatedPage({
    defaultView: "dips",
    pageDescription: "Record and edit tank dips with mandatory photo evidence.",
    pageHeading: "Fuel Tank Dips"
  });
}
