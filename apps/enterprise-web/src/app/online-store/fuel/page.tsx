import { OnlineStoreFuelPage } from "./_fuel-page";

export const dynamic = "force-dynamic";

export default async function OnlineStoreFuelOverviewPage() {
  return OnlineStoreFuelPage({
    dedicatedView: false,
    defaultView: "tanks",
    pageDescription:
      "Station-side fuel controls for tanks, dips, meter readings, supplier receipts, and reconciliation.",
    pageHeading: "Online POS Fuel"
  });
}
