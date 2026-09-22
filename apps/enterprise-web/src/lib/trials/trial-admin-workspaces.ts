export const trialAdminWorkspaceStatuses = [
  "ACTIVE",
  "EXPIRED",
  "CONVERTING",
  "CONVERTED"
] as const;

export type TrialAdminWorkspaceStatus = (typeof trialAdminWorkspaceStatuses)[number];

export type TrialAdminWorkspace = {
  id: string;
  requestNo: string;
  companyName: string;
  email: string;
  status: TrialAdminWorkspaceStatus;
  trialExpiresAt: string | null;
  convertedAt: string | null;
  subscriptionPlanCode: string | null;
  subscriptionReference: string | null;
  subscriptionLicensedUntil: string | null;
  retainSupportAccess: boolean | null;
  supportAccessExpiresAt: string | null;
  supportApprovalReference: string | null;
  workspaceSlug: string | null;
  workspaceDatabaseName: string | null;
};

export type TrialAdminWorkspaceListResponse = {
  workspaces: TrialAdminWorkspace[];
};

export function canConvertTrialWorkspace(workspace: TrialAdminWorkspace) {
  return (
    workspace.status === "ACTIVE" ||
    workspace.status === "EXPIRED" ||
    workspace.status === "CONVERTING"
  );
}

export function isTrialAdminWorkspaceListResponse(
  value: unknown
): value is TrialAdminWorkspaceListResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const workspaces = (value as { workspaces?: unknown }).workspaces;
  return (
    Array.isArray(workspaces) &&
    workspaces.every(
      (workspace) =>
        workspace &&
        typeof workspace === "object" &&
        typeof (workspace as TrialAdminWorkspace).id === "string" &&
        typeof (workspace as TrialAdminWorkspace).requestNo === "string" &&
        typeof (workspace as TrialAdminWorkspace).companyName === "string" &&
        typeof (workspace as TrialAdminWorkspace).email === "string" &&
        trialAdminWorkspaceStatuses.includes((workspace as TrialAdminWorkspace).status)
    )
  );
}
