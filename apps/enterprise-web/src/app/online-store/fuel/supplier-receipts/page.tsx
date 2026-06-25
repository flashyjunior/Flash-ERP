import { OnlineStoreFuelPage } from "../_fuel-page";

export const dynamic = "force-dynamic";

export default async function OnlineStoreFuelSupplierReceiptsPage() {
  return OnlineStoreFuelPage({
    defaultView: "supplier-receipts",
    pageDescription: "Review and record station-side inbound supplier fuel receipts into tanks.",
    pageHeading: "Station Supplier Fuel Receipts"
  });
}
