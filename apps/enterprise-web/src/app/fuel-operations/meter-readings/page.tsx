import { FuelOperationsDedicatedPage } from "../_fuel-page";

export const dynamic = "force-dynamic";

export default async function FuelMeterReadingsPage() {
  return FuelOperationsDedicatedPage({
    defaultView: "meter-readings",
    pageDescription: "Record and edit nozzle meter readings with mandatory photo evidence and stock adjustment.",
    pageHeading: "Fuel Meter Readings"
  });
}
