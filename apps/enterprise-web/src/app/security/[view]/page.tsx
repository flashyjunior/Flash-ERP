import { notFound } from "next/navigation";

import { EnterpriseSecurityWorkspace } from "@/components/enterprise/enterprise-security-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseSecurityWorkspace,
  getEnterpriseSecurityWorkspace
} from "@/server/repositories/enterprise-security.repository";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";
import {
  isEnterpriseSecurityView,
  type EnterpriseSecurityView
} from "@/lib/navigation/enterprise-navigation";

export const dynamic = "force-dynamic";

export default async function SecuritySubmenuPage({
  params
}: {
  params: Promise<{
    view: string;
  }>;
}) {
  const { view } = await params;

  if (!isEnterpriseSecurityView(view)) {
    notFound();
  }

  const permissionByView: Record<EnterpriseSecurityView, string | string[]> = {
    users: "security.user.manage",
    "roles-privileges": ["security.role.manage", "security.privilege.manage"],
    "audit-logs": "security.audit-log.view",
    "online-users": "security.online-user.view",
    "password-policy": "security.password-policy.manage",
    "security-logs": "security.log.view",
    "data-purge": "security.data-purge.execute"
  };

  const required = permissionByView[view];
  if (Array.isArray(required)) {
    await requireEnterprisePermission(required, { any: true });
  } else {
    await requireEnterprisePermission([required]);
  }

  const workspace = await runEnterpriseOperation(
    "AUTHENTICATED_READ",
    getEnterpriseSecurityWorkspace
  ).catch((error: unknown) => {
    console.error("Flash ERP could not load the enterprise security workspace.", error);

    return buildUnavailableEnterpriseSecurityWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP security policy: ${error.message}`
        : "Unable to load live Flash ERP security policy.",
      {
        loadError:
          error instanceof Error ? error.message : "The security policy query failed without a message."
      }
    );
  });

  return (
    <EnterpriseSecurityWorkspace view={view as EnterpriseSecurityView} workspace={workspace} />
  );
}
