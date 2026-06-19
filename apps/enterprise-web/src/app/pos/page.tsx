import { EnterprisePosWorkspace } from "@/components/enterprise/enterprise-pos-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterprisePosWorkspace,
  getEnterprisePosWorkspace
} from "@/server/repositories/enterprise-pos.repository";

export const dynamic = "force-dynamic";

type PosPageProps = {
  searchParams?: Promise<{
    shop?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function PosPage({ searchParams }: PosPageProps) {
  await requireEnterprisePermission(["operations.dashboard.view"]);
  const filters = (await searchParams) ?? {};
  const workspace = await getEnterprisePosWorkspace({
    storeCode: filters.shop ?? "",
    dateFrom: filters.from ?? "",
    dateTo: filters.to ?? ""
  }).catch((error: unknown) =>
    buildUnavailableEnterprisePosWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP POS telemetry: ${error.message}`
        : "Unable to load live Flash ERP POS telemetry."
    )
  );

  return <EnterprisePosWorkspace workspace={workspace} />;
}
