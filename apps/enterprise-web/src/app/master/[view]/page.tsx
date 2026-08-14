import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { EnterpriseCustomerPanel } from "@/components/enterprise/enterprise-customer-panel";
import { EnterprisePromotionPanel } from "@/components/enterprise/enterprise-promotion-panel";
import { EnterpriseSetupWorkspace } from "@/components/enterprise/enterprise-setup-workspace";
import { EnterpriseSupplierPanel } from "@/components/enterprise/enterprise-supplier-panel";
import { EnterpriseUomWorkspace } from "@/components/enterprise/enterprise-uom-workspace";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseCatalogWorkspace,
  getEnterpriseCatalogWorkspace
} from "@/server/repositories/enterprise-catalog.repository";
import {
  buildUnavailableEnterpriseCustomerWorkspace,
  getEnterpriseCustomerWorkspace
} from "@/server/repositories/enterprise-customers.repository";
import {
  buildUnavailableEnterprisePromotionWorkspace,
  getEnterprisePromotionWorkspace
} from "@/server/repositories/enterprise-promotions.repository";
import {
  buildUnavailableEnterpriseSupplierWorkspace,
  getEnterpriseSupplierWorkspace
} from "@/server/repositories/enterprise-suppliers.repository";
import {
  buildUnavailableEnterpriseSetupWorkspace,
  getEnterpriseSetupWorkspace
} from "@/server/repositories/enterprise-setup.repository";
import {
  isEnterpriseMasterView,
  enterpriseMasterPageMeta,
  type EnterpriseMasterView
} from "@/lib/navigation/enterprise-navigation";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";

export const dynamic = "force-dynamic";

function renderMasterShell(view: EnterpriseMasterView, children: ReactNode) {
  const pageMeta = enterpriseMasterPageMeta[view];

  return (
    <EnterpriseShell
      activeSection="master"
      description={pageMeta.description}
      eyebrow="Flash ERP enterprise"
      heading={pageMeta.heading}
    >
      {children}
    </EnterpriseShell>
  );
}

export default async function MasterSubmenuPage({
  params
}: {
  params: Promise<{
    view: string;
  }>;
}) {
  const { view } = await params;

  if (!isEnterpriseMasterView(view)) {
    notFound();
  }

  const permissionByView: Record<EnterpriseMasterView, string> = {
    departments: "master.department.manage",
    categories: "master.category.manage",
    tax: "master.tax.manage",
    tenders: "master.tender.manage",
    banks: "master.bank.manage",
    loyalty: "master.loyalty.manage",
    promotions: "master.promotion.manage",
    uom: "master.product.manage",
    customers: "master.customer.manage",
    suppliers: "master.supplier.manage"
  };

  await requireEnterprisePermission([permissionByView[view]]);

  if (view === "customers") {
    const workspace = await runEnterpriseOperation(
      "AUTHENTICATED_READ",
      getEnterpriseCustomerWorkspace
    ).catch((error: unknown) =>
      buildUnavailableEnterpriseCustomerWorkspace(
        error instanceof Error
          ? `Unable to load live Flash ERP customer policy: ${error.message}`
          : "Unable to load live Flash ERP customer policy."
      )
    );

    return renderMasterShell(view, <EnterpriseCustomerPanel workspace={workspace} />);
  }

  if (view === "suppliers") {
    const workspace = await runEnterpriseOperation(
      "AUTHENTICATED_READ",
      getEnterpriseSupplierWorkspace
    ).catch((error: unknown) =>
      buildUnavailableEnterpriseSupplierWorkspace(
        error instanceof Error
          ? `Unable to load live Flash ERP supplier policy: ${error.message}`
          : "Unable to load live Flash ERP supplier policy."
      )
    );

    return renderMasterShell(view, <EnterpriseSupplierPanel workspace={workspace} />);
  }

  if (view === "promotions") {
    const workspace = await runEnterpriseOperation(
      "AUTHENTICATED_READ",
      getEnterprisePromotionWorkspace
    ).catch((error: unknown) =>
      buildUnavailableEnterprisePromotionWorkspace(
        error instanceof Error
          ? `Unable to load live Flash ERP promotion policy: ${error.message}`
          : "Unable to load live Flash ERP promotion policy."
      )
    );

    return renderMasterShell(view, <EnterprisePromotionPanel workspace={workspace} />);
  }

  if (view === "uom") {
    const workspace = await runEnterpriseOperation(
      "AUTHENTICATED_READ",
      getEnterpriseCatalogWorkspace
    ).catch((error: unknown) =>
      buildUnavailableEnterpriseCatalogWorkspace(
        error instanceof Error
          ? `Unable to load live Flash ERP unit-of-measure policy: ${error.message}`
          : "Unable to load live Flash ERP unit-of-measure policy."
      )
    );

    return <EnterpriseUomWorkspace workspace={workspace} />;
  }

  const workspace = await runEnterpriseOperation(
    "AUTHENTICATED_READ",
    getEnterpriseSetupWorkspace
  ).catch((error: unknown) =>
    buildUnavailableEnterpriseSetupWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP master policy: ${error.message}`
        : "Unable to load live Flash ERP master policy."
    )
  );

  return <EnterpriseSetupWorkspace view={view} workspace={workspace} />;
}
