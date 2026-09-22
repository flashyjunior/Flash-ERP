import { FuelOperationsWorkspace } from "@/components/enterprise/erp-fuel-operations-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableFuelOperationsWorkspace,
  getFuelOperationsWorkspace
} from "@/server/repositories/erp-fuel-operations.repository";

type FuelOperationsPageProps = {
  defaultView:
    | "tanks"
    | "pumps"
    | "dips"
    | "meter-readings"
    | "sales"
    | "stations"
    | "station-deliveries"
    | "supplier-receipts"
    | "reconciliation";
  pageDescription: string;
  pageHeading: string;
};

export async function FuelOperationsDedicatedPage({
  defaultView,
  pageDescription,
  pageHeading
}: FuelOperationsPageProps) {
  await requireEnterprisePermission(["fuel.hq.view"]);

  const workspace = await getFuelOperationsWorkspace().catch((error: unknown) =>
    buildUnavailableFuelOperationsWorkspace(
      error instanceof Error
        ? error.message
        : "Flash ERP could not load Fuel Operations."
    )
  );

  return (
    <FuelOperationsWorkspace
      dedicatedView
      defaultView={defaultView}
      pageDescription={pageDescription}
      pageHeading={pageHeading}
      workspace={workspace}
    />
  );
}
