import { FuelOperationsWorkspace } from "@/components/enterprise/erp-fuel-operations-workspace";
import {
  buildUnavailableFuelOperationsWorkspace,
  getFuelOperationsWorkspace
} from "@/server/repositories/erp-fuel-operations.repository";

export const dynamic = "force-dynamic";

const hqFuelOperationsViews = [
  "tanks",
  "pumps",
  "dips",
  "meter-readings",
  "stations",
  "station-deliveries",
  "supplier-receipts",
  "reconciliation"
] as const;

export default async function FuelOperationsPage() {
  const workspace = await getFuelOperationsWorkspace().catch((error: unknown) =>
    buildUnavailableFuelOperationsWorkspace(
      error instanceof Error
        ? error.message
        : "Flash ERP Fuel Operations is waiting for the enterprise database."
    )
  );

  return <FuelOperationsWorkspace availableViews={[...hqFuelOperationsViews]} workspace={workspace} />;
}
