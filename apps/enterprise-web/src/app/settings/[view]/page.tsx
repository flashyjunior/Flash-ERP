import { notFound, redirect } from "next/navigation";

import { EnterpriseInventoryCatalogWorkspace } from "@/components/enterprise/enterprise-inventory-catalog-workspace";
import { EnterpriseLicenseWorkspace } from "@/components/enterprise/enterprise-license-workspace";
import { EnterpriseSettingsWorkspace } from "@/components/enterprise/enterprise-settings-workspace";
import { ErpHrLeaveTypesSettingsWorkspace } from "@/components/enterprise/erp-hr-leave-types-settings-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseCatalogWorkspace,
  getEnterpriseCatalogWorkspace
} from "@/server/repositories/enterprise-catalog.repository";
import {
  buildUnavailableEnterpriseSecurityWorkspace,
  getEnterpriseSecurityWorkspace
} from "@/server/repositories/enterprise-security.repository";
import {
  buildUnavailableEnterpriseSettingsWorkspace,
  getEnterpriseSettingsWorkspace
} from "@/server/repositories/enterprise-settings.repository";
import {
  buildUnavailableFuelOperationsSettingsWorkspace,
  getFuelOperationsSettingsWorkspace
} from "@/server/repositories/erp-fuel-operations.repository";
import {
  buildUnavailableErpLeaveTypesSettingsWorkspace,
  getErpLeaveTypesSettingsWorkspace
} from "@/server/repositories/erp-hr-leave.repository";
import {
  buildUnavailableEnterpriseSetupWorkspace,
  getEnterpriseSetupWorkspace
} from "@/server/repositories/enterprise-setup.repository";
import {
  buildUnavailableEnterpriseStoresWorkspace,
  getEnterpriseStoresWorkspace
} from "@/server/repositories/enterprise-stores.repository";
import {
  isEnterpriseSettingsView,
  type EnterpriseSettingsView
} from "@/lib/navigation/enterprise-navigation";

export const dynamic = "force-dynamic";

export default async function SettingsSubmenuPage({
  params
}: {
  params: Promise<{
    view: string;
  }>;
}) {
  const { view } = await params;

  if (!isEnterpriseSettingsView(view)) {
    notFound();
  }

  if (view === "shop-prices") {
    redirect("/inventory/shop-prices");
  }

  const permissionByView: Record<EnterpriseSettingsView, string> = {
    company: "settings.company.manage",
    ldap: "settings.ldap.manage",
    smtp: "settings.smtp.manage",
    sms: "settings.sms.manage",
    "inventory-catalogs": "master.product.manage",
    "fuel-operations": "settings.company.manage",
    "leave-types": "hr.leave.manage",
    "shop-prices": "master.product.manage",
    licenses: "master.store.manage",
    "receipt-templates": "settings.receipt-template.manage",
    "retail-users": "settings.retail-user.manage",
    options: "settings.option.manage"
  };

  await requireEnterprisePermission([permissionByView[view]]);

  if (view === "leave-types") {
    const workspace = await getErpLeaveTypesSettingsWorkspace().catch((error: unknown) =>
      buildUnavailableErpLeaveTypesSettingsWorkspace(
        error instanceof Error
          ? `Unable to load Flash ERP leave type settings: ${error.message}`
          : "Unable to load Flash ERP leave type settings."
      )
    );
    return <ErpHrLeaveTypesSettingsWorkspace workspace={workspace} />;
  }

  if (view === "inventory-catalogs") {
    const workspace = await getEnterpriseCatalogWorkspace().catch((error: unknown) =>
      buildUnavailableEnterpriseCatalogWorkspace(
        error instanceof Error
          ? `Unable to load live Flash ERP inventory catalog policy: ${error.message}`
          : "Unable to load live Flash ERP inventory catalog policy."
      )
    );

    return <EnterpriseInventoryCatalogWorkspace workspace={workspace} />;
  }

  if (view === "licenses") {
    const workspace = await getEnterpriseStoresWorkspace().catch((error: unknown) =>
      buildUnavailableEnterpriseStoresWorkspace(
        error instanceof Error
          ? `Unable to load live Flash ERP licensing posture: ${error.message}`
          : "Unable to load live Flash ERP licensing posture."
      )
    );

    return <EnterpriseLicenseWorkspace workspace={workspace} />;
  }

  const [workspace, setupWorkspace, fuelOperationsSettingsWorkspace, securityWorkspace] = await Promise.all([
    getEnterpriseSettingsWorkspace().catch((error: unknown) =>
      buildUnavailableEnterpriseSettingsWorkspace(
        error instanceof Error
          ? `Unable to load live Flash ERP settings policy: ${error.message}`
          : "Unable to load live Flash ERP settings policy."
      )
    ),
    view === "receipt-templates"
      ? getEnterpriseSetupWorkspace().catch((error: unknown) =>
          buildUnavailableEnterpriseSetupWorkspace(
            error instanceof Error
              ? `Unable to load live Flash ERP setup policy: ${error.message}`
              : "Unable to load live Flash ERP setup policy."
          )
        )
      : Promise.resolve(undefined),
    view === "fuel-operations"
      ? getFuelOperationsSettingsWorkspace().catch((error: unknown) =>
          buildUnavailableFuelOperationsSettingsWorkspace(
            error instanceof Error
              ? `Unable to load live Flash ERP Fuel Operations settings: ${error.message}`
              : "Unable to load live Flash ERP Fuel Operations settings."
          )
        )
      : Promise.resolve(undefined),
    view === "retail-users"
      ? getEnterpriseSecurityWorkspace().catch((error: unknown) =>
          buildUnavailableEnterpriseSecurityWorkspace(
            error instanceof Error
              ? `Unable to load live Flash ERP security policy: ${error.message}`
              : "Unable to load live Flash ERP security policy."
          )
        )
      : Promise.resolve(undefined)
  ]);

  return (
    <EnterpriseSettingsWorkspace
      fuelOperationsSettingsWorkspace={fuelOperationsSettingsWorkspace}
      securityWorkspace={securityWorkspace}
      setupWorkspace={setupWorkspace}
      view={view as EnterpriseSettingsView}
      workspace={workspace}
    />
  );
}
