import { FuelOperationsDedicatedPage } from "../_fuel-page";

export const dynamic = "force-dynamic";

export default async function FuelSupplierReceiptsPage() {
  return FuelOperationsDedicatedPage({
    defaultView: "supplier-receipts",
    pageDescription: "Review and record inbound supplier fuel receipts into tanks.",
    pageHeading: "Supplier Fuel Receipts"
  });
}
