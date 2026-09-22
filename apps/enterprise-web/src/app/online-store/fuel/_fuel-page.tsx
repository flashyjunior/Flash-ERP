import { FuelOperationsWorkspace } from "@/components/enterprise/erp-fuel-operations-workspace";
import { requireEnterpriseSession } from "@/server/auth/enterprise-session";
import {
  buildUnavailableFuelOperationsWorkspace,
  getFuelOperationsWorkspace
} from "@/server/repositories/erp-fuel-operations.repository";
import { redirect } from "next/navigation";

const onlineStoreFuelViews = [
  "tanks",
  "dips",
  "meter-readings",
  "supplier-receipts",
  "reconciliation"
] as const;

type OnlineStoreFuelView = (typeof onlineStoreFuelViews)[number];

const onlineStoreFuelViewPermissions: Record<OnlineStoreFuelView, readonly string[]> = {
  tanks: ["fuel.tank.manage"],
  dips: ["fuel.dip.capture"],
  "meter-readings": ["fuel.meter-reading.capture"],
  "supplier-receipts": ["fuel.supplier-receipt.capture"],
  reconciliation: ["fuel.reconciliation.manage"]
};

const onlineStoreFuelViewHrefs: Record<OnlineStoreFuelView, string> = {
  tanks: "/online-store/fuel/tanks",
  dips: "/online-store/fuel/dips",
  "meter-readings": "/online-store/fuel/meter-readings",
  "supplier-receipts": "/online-store/fuel/supplier-receipts",
  reconciliation: "/online-store/fuel/reconciliation"
};

type OnlineStoreFuelPageProps = {
  defaultView?: OnlineStoreFuelView;
  dedicatedView?: boolean;
  pageDescription: string;
  pageHeading: string;
};

export async function OnlineStoreFuelPage({
  dedicatedView = true,
  defaultView = "tanks",
  pageDescription,
  pageHeading
}: OnlineStoreFuelPageProps) {
  const session = await requireEnterpriseSession();
  if (!session.isOnlineStoreUser) {
    redirect("/unauthorized");
  }

  const availableViews = onlineStoreFuelViews.filter((view) =>
    onlineStoreFuelViewPermissions[view].every((permissionCode) =>
      session.permissionCodes.includes(permissionCode)
    )
  );

  if (availableViews.length === 0) {
    redirect("/online-store");
  }

  const resolvedDefaultView = availableViews.includes(defaultView)
    ? defaultView
    : availableViews[0]!;

  if (dedicatedView && resolvedDefaultView !== defaultView) {
    redirect(onlineStoreFuelViewHrefs[resolvedDefaultView]);
  }

  const workspace = await getFuelOperationsWorkspace({ storeCode: session.homeStoreCode }).catch((error: unknown) =>
    buildUnavailableFuelOperationsWorkspace(
      error instanceof Error
        ? error.message
        : "Flash ERP could not load Online POS Fuel Operations."
    )
  );

  return (
    <FuelOperationsWorkspace
      autoRecordedBy={session.displayName}
      availableViews={[...availableViews]}
      dedicatedView={dedicatedView}
      defaultView={resolvedDefaultView}
      pageDescription={pageDescription}
      pageHeading={pageHeading}
      shellActiveSection="online-store"
      shellEyebrow="Online POS"
      workspace={workspace}
    />
  );
}
