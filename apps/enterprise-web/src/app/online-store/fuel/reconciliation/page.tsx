import { OnlineStoreFuelPage } from "../_fuel-page";

export const dynamic = "force-dynamic";

export default async function OnlineStoreFuelReconciliationPage() {
  return OnlineStoreFuelPage({
    defaultView: "reconciliation",
    pageDescription:
      "Review station fuel reconciliation across deliveries, meter readings, dips, gains, and losses.",
    pageHeading: "Station Fuel Reconciliation"
  });
}
