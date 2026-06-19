import { EnterpriseStorePricingWorkspace } from "@/components/enterprise/enterprise-store-pricing-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import { getEnterpriseStorePricingWorkspace } from "@/server/repositories/enterprise-store-pricing.repository";

export const dynamic = "force-dynamic";

export default async function InventoryShopPricesPage() {
  await requireEnterprisePermission(["master.product.manage"]);
  const workspace = await getEnterpriseStorePricingWorkspace();

  return <EnterpriseStorePricingWorkspace workspace={workspace} />;
}
