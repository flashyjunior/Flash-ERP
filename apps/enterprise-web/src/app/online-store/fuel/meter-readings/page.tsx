import { OnlineStoreFuelPage } from "../_fuel-page";

export const dynamic = "force-dynamic";

export default async function OnlineStoreFuelMeterReadingsPage() {
  return OnlineStoreFuelPage({
    defaultView: "meter-readings",
    pageDescription: "Record station nozzle meter readings with mandatory photo evidence.",
    pageHeading: "Station Meter Readings"
  });
}
