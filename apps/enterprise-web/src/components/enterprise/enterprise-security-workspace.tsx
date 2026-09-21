"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseSecurityPanel } from "@/components/enterprise/enterprise-security-panel";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import {
  enterpriseSecurityPageMeta,
  type EnterpriseSecurityView
} from "@/lib/navigation/enterprise-navigation";
import type {
  EnterpriseSecurityWorkspaceData,
  UpdateEnterprisePasswordPolicyRequest
} from "@/server/repositories/enterprise-security.repository";
import {
  enterpriseDataPurgeConfirmationText,
  enterpriseDataPurgeScopeByKey as purgeScopeByKey,
  enterpriseDataPurgeScopes,
  type EnterpriseDataPurgeResponse,
  type EnterpriseDataPurgeScopeKey
} from "@/lib/security/data-purge-scopes";

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

const transactionalPurgeScopes = enterpriseDataPurgeScopes.filter(
  (scope) => scope.group === "Transactional"
);
const masterDataPurgeScopes = enterpriseDataPurgeScopes.filter(
  (scope) => scope.group === "Master data"
);

type AuditLogRow = EnterpriseSecurityWorkspaceData["auditLogRows"][number];
type SecurityLogRow = EnterpriseSecurityWorkspaceData["securityLogRows"][number];
type LogRow = AuditLogRow | SecurityLogRow;

function MetricCard({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="glass-panel rounded-[1.15rem] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-stone-950">{value}</p>
    </article>
  );
}

function Badge({ value }: { value: string }) {
  const tone =
    value === "CRITICAL" || value === "ERROR"
      ? "bg-rose-100 text-rose-700"
      : value === "WARNING"
        ? "bg-amber-100 text-amber-700"
        : "bg-sky-100 text-sky-700";

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{value}</span>;
}

function Field({
  label,
  value,
  onChange,
  type = "number"
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  type?: "number";
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <input
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        type={type}
        value={value}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "password";
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <input
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function Check({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      {label}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <select
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Feedback({ state }: { state: MutationState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
        state.status === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {state.message}
    </div>
  );
}

function renderLogSummary({
  message,
  category,
  action,
  detailsLabel
}: {
  message: string;
  category: string;
  action: string;
  detailsLabel?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-stone-900">{message}</p>
      <p className="truncate text-xs text-stone-500">
        {[category, action, detailsLabel].filter(Boolean).join(" • ")}
      </p>
    </div>
  );
}

function formatDetailValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value, null, 2);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecordByKeys(details: Record<string, unknown> | null, keys: string[]) {
  if (!details) {
    return null;
  }

  for (const key of keys) {
    const value = details[key];

    if (isPlainRecord(value)) {
      return value;
    }
  }

  return null;
}

function resolveBeforeAfterJson(details: Record<string, unknown> | null) {
  const previousJson = readRecordByKeys(details, ["previousJson", "previousValues", "beforeJson", "before"]);
  const updatedJson = readRecordByKeys(details, ["updatedJson", "updatedValues", "afterJson", "after"]);

  if (!previousJson || !updatedJson) {
    return null;
  }

  return {
    previousJson,
    updatedJson
  };
}

function JsonPayloadBlock({ label, value }: { label: string; value: Record<string, unknown> }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
        {label}
      </p>
      <pre className="mt-2 max-h-[30rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-stone-950 p-4 text-xs leading-5 text-stone-100 shadow-inner">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-lg border border-stone-200 bg-white px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-stone-900">{formatDetailValue(value)}</p>
    </div>
  );
}

function LogDetailsPanel({ log }: { log: LogRow }) {
  const beforeAfterJson = resolveBeforeAfterJson(log.details);
  const beforeAfterKeys = new Set([
    "previousJson",
    "previousValues",
    "beforeJson",
    "before",
    "updatedJson",
    "updatedValues",
    "afterJson",
    "after"
  ]);
  const detailEntries = log.details
    ? Object.entries(log.details).filter(([key]) => !beforeAfterKeys.has(key))
    : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <DetailField label="Log ID" value={log.securityLogId} />
        <DetailField label="Severity" value={log.severity} />
        <DetailField label="When" value={new Date(log.createdAt).toLocaleString()} />
        <DetailField label="Category" value={log.category} />
        <DetailField label="Action" value={log.action} />
        <DetailField label="Actor" value={log.actorLabel} />
        <DetailField label="Source node" value={log.sourceNodeCode ?? "Enterprise"} />
        <DetailField label="Target" value={log.targetLabel ?? "N/A"} />
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
          Message
        </p>
        <p className="mt-2 text-sm leading-6 text-stone-800">{log.message}</p>
      </div>

      {beforeAfterJson ? (
        <div className="rounded-lg border border-stone-200 bg-white p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            Before and after JSON
          </p>
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            <JsonPayloadBlock label="Previous JSON request" value={beforeAfterJson.previousJson} />
            <JsonPayloadBlock label="Updated JSON request" value={beforeAfterJson.updatedJson} />
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-stone-200 bg-white p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
          Details
        </p>
        {detailEntries.length > 0 ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {detailEntries.map(([key, value]) => {
              const renderedValue = formatDetailValue(value);
              const isStructured = typeof value === "object" && value !== null;

              return (
                <div className="min-w-0 rounded-lg border border-stone-100 bg-stone-50/80 p-3" key={key}>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    {key}
                  </p>
                  {isStructured ? (
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-stone-950 p-3 text-xs leading-5 text-stone-100">
                      {renderedValue}
                    </pre>
                  ) : (
                    <p className="mt-2 break-words text-sm leading-6 text-stone-800">
                      {renderedValue}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-600">No detail payload.</p>
        )}
      </div>
    </div>
  );
}

function resolveSecurityView(value: string | undefined): EnterpriseSecurityView {
  switch (value) {
    case "roles-privileges":
    case "audit-logs":
    case "online-users":
    case "password-policy":
    case "security-logs":
      return value;
    default:
      return "users";
  }
}

function countDistinct(values: Array<string | null | undefined>) {
  return new Set(values.filter((value): value is string => Boolean(value))).size;
}

export function EnterpriseSecurityWorkspace({
  workspace,
  initialView,
  view
}: {
  workspace: EnterpriseSecurityWorkspaceData;
  initialView?: string;
  view?: EnterpriseSecurityView;
}) {
  const router = useRouter();
  const forcedView = view ?? resolveSecurityView(initialView);
  const [passwordPolicyDraft, setPasswordPolicyDraft] = useState<UpdateEnterprisePasswordPolicyRequest>(
    workspace.passwordPolicy
  );
  const [passwordPolicyState, setPasswordPolicyState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [stepUpPassword, setStepUpPassword] = useState("");
  const [purgeScopes, setPurgeScopes] = useState<Set<EnterpriseDataPurgeScopeKey>>(
    () => new Set()
  );
  const [purgeConfirmationText, setPurgeConfirmationText] = useState("");
  const [purgePassword, setPurgePassword] = useState("");
  const [purgeState, setPurgeState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [purgeResult, setPurgeResult] = useState<EnterpriseDataPurgeResponse | null>(null);
  const [selectedLog, setSelectedLog] = useState<LogRow | null>(null);
  const selectedView = forcedView;
  const pageMeta = enterpriseSecurityPageMeta[selectedView];
  const latestAuditLog = workspace.auditLogRows[0] ?? null;
  const latestSecurityLog = workspace.securityLogRows[0] ?? null;
  const warningSecurityEvents = workspace.securityLogRows.filter(
    (entry) => entry.severity === "WARNING" || entry.severity === "ERROR" || entry.severity === "CRITICAL"
  ).length;
  const criticalSecurityEvents = workspace.securityLogRows.filter(
    (entry) => entry.severity === "ERROR" || entry.severity === "CRITICAL"
  ).length;
  const connectedStores = countDistinct(workspace.onlineUserRows.map((row) => row.storeName));
  const connectedTerminals = countDistinct(workspace.onlineUserRows.map((row) => row.terminalName));
  const assignedPermissions = workspace.permissionRows.filter(
    (permission) => permission.assignedRoleCount > 0
  ).length;
  const summaryCards = (() => {
    switch (selectedView) {
      case "users":
        return [
          {
            label: "Active users",
            value: String(workspace.metrics.activeUsers)
          },
          {
            label: "Cashier-ready",
            value: String(workspace.metrics.cashierEligibleUsers)
          },
          {
            label: "Supervisor-ready",
            value: String(workspace.metrics.supervisorEligibleUsers)
          }
        ];
      case "roles-privileges":
        return [
          {
            label: "Active roles",
            value: String(workspace.metrics.activeRoles)
          },
          {
            label: "Privilege catalog",
            value: String(workspace.metrics.permissionCatalogCount)
          },
          {
            label: "Assigned privileges",
            value: String(assignedPermissions)
          }
        ];
      case "audit-logs":
        return [
          {
            label: "Last 7 days",
            value: String(workspace.metrics.auditLogsLast7Days)
          },
          {
            label: "Visible rows",
            value: String(workspace.auditLogRows.length)
          },
          {
            label: "Latest actor",
            value: latestAuditLog?.actorLabel ?? "No entries"
          }
        ];
      case "online-users":
        return [
          {
            label: "Online users",
            value: String(workspace.metrics.onlineUsers)
          },
          {
            label: "Connected stores",
            value: String(connectedStores)
          },
          {
            label: "Connected terminals",
            value: String(connectedTerminals)
          }
        ];
      case "password-policy":
        return [
          {
            label: "Minimum length",
            value: String(workspace.passwordPolicy.minimumLength)
          },
          {
            label: "Lockout threshold",
            value: String(workspace.passwordPolicy.maxFailedAttempts)
          },
          {
            label: "MFA mode",
            value: workspace.passwordPolicy.mfaMode.replace("_", " ")
          }
        ];
      case "security-logs":
        return [
          {
            label: "Last 7 days",
            value: String(workspace.metrics.securityLogsLast7Days)
          },
          {
            label: "Warning+ events",
            value: String(warningSecurityEvents)
          },
          {
            label: "Critical/Error",
            value: String(criticalSecurityEvents)
          }
        ];
      default:
        return [
          {
            label: "Active users",
            value: String(workspace.metrics.activeUsers)
          }
        ];
    }
  })();
  const pageStatusMessage = (() => {
    if (workspace.loadError) {
      return `Enterprise security policy could not be read: ${workspace.loadError} The counts and lists on this page are unavailable because the query failed, not because nothing is configured.`;
    }

    switch (selectedView) {
      case "users":
        return `${workspace.metrics.activeUsers} active retail user(s) are currently managed here, with ${workspace.metrics.cashierEligibleUsers} cashier-ready and ${workspace.metrics.supervisorEligibleUsers} supervisor-ready account(s).`;
      case "roles-privileges":
        return `${workspace.metrics.activeRoles} active role(s) currently shape access across ${workspace.metrics.permissionCatalogCount} available privilege code(s). Use this view to keep access explicit and role-driven.`;
      case "audit-logs":
        return latestAuditLog
          ? `The latest audit activity was recorded ${latestAuditLog.createdAtLabel.toLowerCase()} by ${latestAuditLog.actorLabel}. Review this view for administrator changes and control-plane traceability.`
          : "Administrative audit logging is enabled, but no audit events have been recorded yet in this workspace.";
      case "online-users":
        return workspace.metrics.onlineUsers > 0
          ? `${workspace.metrics.onlineUsers} operator session(s) are currently visible across ${connectedStores} store(s) and ${connectedTerminals} terminal(s).`
          : "No branch operators currently appear online. This view will populate when stores open shifts and sync terminal posture.";
      case "password-policy":
        return `The current password policy requires at least ${workspace.passwordPolicy.minimumLength} character(s), locks accounts after ${workspace.passwordPolicy.maxFailedAttempts} failed attempt(s), uses ${workspace.passwordPolicy.mfaMode.replace("_", " ")} MFA mode, and ${workspace.passwordPolicy.stepUpForSensitiveActions ? "requires" : "does not require"} step-up for sensitive actions.`;
      case "security-logs":
        return latestSecurityLog
          ? `The latest security event was recorded ${latestSecurityLog.createdAtLabel.toLowerCase()} with ${latestSecurityLog.severity.toLowerCase()} severity. Use this view for warnings, recovery events, restrictions, and policy-sensitive security activity.`
          : "Security logging is enabled, but no security events have been recorded yet in this workspace.";
      default:
        return workspace.statusMessage;
    }
  })();

  const auditColumns = useMemo<ColumnDef<EnterpriseSecurityWorkspaceData["auditLogRows"][number]>[]>(
    () => [
      {
        accessorKey: "message",
        header: "Audit activity",
        cell: ({ row }) => renderLogSummary(row.original),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "actorLabel",
        header: "Actor"
      },
      {
        accessorKey: "targetLabel",
        header: "Target",
        cell: ({ row }) => row.original.targetLabel ?? "N/A"
      },
      {
        accessorKey: "severity",
        header: "Severity",
        cell: ({ row }) => <Badge value={row.original.severity} />,
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "createdAtLabel",
        header: "When",
        cell: ({ row }) => row.original.createdAtLabel
      },
      {
        id: "open",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <button
            aria-label="Open audit log details"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 transition hover:border-stone-400 hover:text-stone-950"
            onClick={() => setSelectedLog(row.original)}
            title="Open details"
            type="button"
          >
            <Eye className="h-4 w-4" />
          </button>
        ),
        meta: { disableTruncate: true, cellClassName: "text-right" }
      }
    ],
    []
  );

  const securityColumns = useMemo<
    ColumnDef<EnterpriseSecurityWorkspaceData["securityLogRows"][number]>[]
  >(
    () => [
      {
        accessorKey: "message",
        header: "Security event",
        cell: ({ row }) => renderLogSummary(row.original),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "severity",
        header: "Severity",
        cell: ({ row }) => <Badge value={row.original.severity} />,
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "actorLabel",
        header: "Actor"
      },
      {
        accessorKey: "sourceNodeCode",
        header: "Source node",
        cell: ({ row }) => row.original.sourceNodeCode ?? "Enterprise"
      },
      {
        accessorKey: "targetLabel",
        header: "Target",
        cell: ({ row }) => row.original.targetLabel ?? "N/A"
      },
      {
        accessorKey: "createdAtLabel",
        header: "When",
        cell: ({ row }) => row.original.createdAtLabel
      },
      {
        id: "open",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <button
            aria-label="Open security log details"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 transition hover:border-stone-400 hover:text-stone-950"
            onClick={() => setSelectedLog(row.original)}
            title="Open details"
            type="button"
          >
            <Eye className="h-4 w-4" />
          </button>
        ),
        meta: { disableTruncate: true, cellClassName: "text-right" }
      }
    ],
    []
  );

  const onlineColumns = useMemo<
    ColumnDef<EnterpriseSecurityWorkspaceData["onlineUserRows"][number]>[]
  >(
    () => [
      {
        accessorKey: "displayName",
        header: "Operator",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.displayName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.loginId}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "storeName",
        header: "Store"
      },
      {
        accessorKey: "terminalName",
        header: "Terminal"
      },
      {
        accessorKey: "shiftNo",
        header: "Shift"
      },
      {
        accessorKey: "nodeHealth",
        header: "Node health"
      },
      {
        accessorKey: "openedAtLabel",
        header: "Opened"
      }
    ],
    []
  );

  async function savePasswordPolicy() {
    setPasswordPolicyState({ status: "submitting", message: "" });

    try {
      if (stepUpPassword.trim()) {
        const stepUpResponse = await fetch("/api/auth/step-up", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            password: stepUpPassword
          })
        });
        const stepUpPayload = (await stepUpResponse.json()) as { message?: string };

        if (!stepUpResponse.ok) {
          throw new Error(stepUpPayload.message ?? "Flash ERP could not verify step-up.");
        }
      }

      const response = await fetch("/api/security/password-policy", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(passwordPolicyDraft)
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Flash ERP could not update the password policy.");
      }

      setPasswordPolicyState({
        status: "success",
        message: data.message ?? "Flash ERP saved the password policy."
      });
      setStepUpPassword("");
      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setPasswordPolicyState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update the password policy."
      });
    }
  }

  function togglePurgeScope(key: EnterpriseDataPurgeScopeKey, checked: boolean) {
    setPurgeScopes((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(key);

        for (const dependency of purgeScopeByKey.get(key)?.requires ?? []) {
          next.add(dependency);
        }
      } else {
        next.delete(key);

        // Drop anything that depended on the scope just removed.
        for (const scope of enterpriseDataPurgeScopes) {
          if (scope.requires.includes(key)) {
            next.delete(scope.key);
          }
        }
      }

      return next;
    });
  }

  async function runDataPurge() {
    setPurgeState({ status: "submitting", message: "" });
    setPurgeResult(null);

    try {
      const stepUpResponse = await fetch("/api/auth/step-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: purgePassword })
      });
      const stepUpPayload = (await stepUpResponse.json()) as { message?: string };

      if (!stepUpResponse.ok) {
        throw new Error(
          stepUpPayload.message ?? "Flash ERP could not verify your password."
        );
      }

      const response = await fetch("/api/security/data-purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopes: [...purgeScopes],
          confirmationText: purgeConfirmationText
        })
      });
      const data = (await response.json()) as Partial<EnterpriseDataPurgeResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Flash ERP could not purge enterprise data.");
      }

      setPurgeResult(data as EnterpriseDataPurgeResponse);
      setPurgeState({
        status: "success",
        message: data.message ?? "Flash ERP purged the selected data."
      });
      setPurgeScopes(new Set());
      setPurgeConfirmationText("");
      setPurgePassword("");
      startTransition(() => {
        window.setTimeout(() => router.refresh(), 900);
      });
    } catch (error) {
      setPurgeState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not purge enterprise data."
      });
    }
  }

  const renderSecurityContent = (currentView: EnterpriseSecurityView) => {
    switch (currentView) {
      case "users":
        return <EnterpriseSecurityPanel mode="users" workspace={workspace} />;
      case "roles-privileges":
        return <EnterpriseSecurityPanel mode="roles" workspace={workspace} />;
      case "audit-logs":
        return (
          <SharedDataGrid
            columns={auditColumns}
            data={workspace.auditLogRows}
            emptyLabel="No security audit logs have been written yet."
            exportFileName="flash-erp-audit-logs"
            searchPlaceholder="Search audit logs"
          />
        );
      case "online-users":
        return (
          <SharedDataGrid
            columns={onlineColumns}
            data={workspace.onlineUserRows}
            emptyLabel="No branch operators currently appear online."
            exportFileName="flash-erp-online-users"
            searchPlaceholder="Search online users"
          />
        );
      case "password-policy":
        return (
          <article className="glass-panel rounded-[1.35rem] p-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Check
                checked={passwordPolicyDraft.requireUppercase}
                label="Require uppercase"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({ ...current, requireUppercase: value }))
                }
              />
              <Check
                checked={passwordPolicyDraft.requireLowercase}
                label="Require lowercase"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({ ...current, requireLowercase: value }))
                }
              />
              <Check
                checked={passwordPolicyDraft.requireDigit}
                label="Require digit"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({ ...current, requireDigit: value }))
                }
              />
              <Check
                checked={passwordPolicyDraft.requireSymbol}
                label="Require symbol"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({ ...current, requireSymbol: value }))
                }
              />
              <Check
                checked={passwordPolicyDraft.stepUpForSensitiveActions}
                label="Step-up for sensitive actions"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({
                    ...current,
                    stepUpForSensitiveActions: value
                  }))
                }
              />
              <Check
                checked={passwordPolicyDraft.accountUnlockRequiresAdmin}
                label="Admin unlock required"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({
                    ...current,
                    accountUnlockRequiresAdmin: value
                  }))
                }
              />
              <Check
                checked={passwordPolicyDraft.alertOnAccountLockout}
                label="Alert on lockout"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({
                    ...current,
                    alertOnAccountLockout: value
                  }))
                }
              />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <SelectField
                label="MFA mode"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({
                    ...current,
                    mfaMode: value as UpdateEnterprisePasswordPolicyRequest["mfaMode"]
                  }))
                }
                options={[
                  { label: "Disabled", value: "DISABLED" },
                  { label: "Admins only", value: "ADMIN_ONLY" },
                  { label: "All users", value: "ALL_USERS" }
                ]}
                value={passwordPolicyDraft.mfaMode}
              />
              <Field
                label="Minimum length"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({ ...current, minimumLength: value }))
                }
                value={passwordPolicyDraft.minimumLength}
              />
              <Field
                label="Expiry days"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({ ...current, expiryDays: value }))
                }
                value={passwordPolicyDraft.expiryDays}
              />
              <Field
                label="History count"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({ ...current, historyCount: value }))
                }
                value={passwordPolicyDraft.historyCount}
              />
              <Field
                label="Max failed attempts"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({ ...current, maxFailedAttempts: value }))
                }
                value={passwordPolicyDraft.maxFailedAttempts}
              />
              <Field
                label="Lockout minutes"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({ ...current, lockoutMinutes: value }))
                }
                value={passwordPolicyDraft.lockoutMinutes}
              />
              <Field
                label="Session timeout minutes"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({
                    ...current,
                    sessionTimeoutMinutes: value
                  }))
                }
                value={passwordPolicyDraft.sessionTimeoutMinutes}
              />
              <Field
                label="MFA grace minutes"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({ ...current, mfaGraceMinutes: value }))
                }
                value={passwordPolicyDraft.mfaGraceMinutes}
              />
              <Field
                label="Step-up window minutes"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({ ...current, stepUpWindowMinutes: value }))
                }
                value={passwordPolicyDraft.stepUpWindowMinutes}
              />
              <Field
                label="Critical escalation minutes"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({
                    ...current,
                    criticalAlertEscalationMinutes: value
                  }))
                }
                value={passwordPolicyDraft.criticalAlertEscalationMinutes}
              />
              <TextField
                label="Security alert email"
                onChange={(value) =>
                  setPasswordPolicyDraft((current) => ({ ...current, securityAlertEmail: value }))
                }
                type="email"
                value={passwordPolicyDraft.securityAlertEmail}
              />
              <TextField
                label="Step-up password"
                onChange={setStepUpPassword}
                type="password"
                value={stepUpPassword}
              />
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
                disabled={passwordPolicyState.status === "submitting"}
                onClick={() => void savePasswordPolicy()}
                type="button"
              >
                {passwordPolicyState.status === "submitting" ? "Saving..." : "Save password policy"}
              </button>
            </div>
            <div className="mt-4">
              <Feedback state={passwordPolicyState} />
            </div>
          </article>
        );
      case "security-logs":
        return (
          <SharedDataGrid
            columns={securityColumns}
            data={workspace.securityLogRows}
            emptyLabel="No security logs have been written yet."
            exportFileName="flash-erp-security-logs"
            searchPlaceholder="Search security logs"
          />
        );
      case "data-purge":
        return (
          <article className="glass-panel rounded-[1.35rem] p-5">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
              <p className="font-semibold">This permanently deletes data. There is no undo.</p>
              <p className="mt-1">
                Every transactional record for this organisation is removed. Master data is only
                removed where you tick it below. Take a database backup first. Shops, terminals,
                users, roles, and security logs are always kept.
              </p>
            </div>

            <section className="mt-5">
              <h3 className="text-sm font-semibold text-stone-900">
                Always included — transactional data
              </h3>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {transactionalPurgeScopes.map((scope) => (
                  <div
                    className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm"
                    key={scope.key}
                  >
                    <label className="inline-flex items-center gap-3 font-semibold text-stone-800">
                      <input checked disabled type="checkbox" />
                      {scope.label}
                    </label>
                    <p className="mt-1 pl-7 text-xs leading-5 text-stone-500">
                      {scope.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-6">
              <h3 className="text-sm font-semibold text-stone-900">
                Optional — master data
              </h3>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                Tick only what you want removed. Some scopes depend on others and are ticked
                automatically.
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {masterDataPurgeScopes.map((scope) => {
                  const unmetRequirement = scope.requires.find((key) => !purgeScopes.has(key));

                  return (
                    <div
                      className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
                      key={scope.key}
                    >
                      <label className="inline-flex items-center gap-3 font-semibold text-stone-800">
                        <input
                          checked={purgeScopes.has(scope.key)}
                          onChange={(event) =>
                            togglePurgeScope(scope.key, event.target.checked)
                          }
                          type="checkbox"
                        />
                        {scope.label}
                      </label>
                      <p className="mt-1 pl-7 text-xs leading-5 text-stone-500">
                        {scope.description}
                      </p>
                      {unmetRequirement && purgeScopes.has(scope.key) ? (
                        <p className="mt-1 pl-7 text-xs font-semibold text-amber-700">
                          Also selects {purgeScopeByKey.get(unmetRequirement)?.label}.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-6 grid gap-4 md:grid-cols-2">
              <TextField
                label={`Type ${enterpriseDataPurgeConfirmationText} to confirm`}
                onChange={setPurgeConfirmationText}
                value={purgeConfirmationText}
              />
              <TextField
                label="Re-enter your password"
                onChange={setPurgePassword}
                type="password"
                value={purgePassword}
              />
            </section>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <span className="text-xs text-stone-500">
                {purgeScopes.size
                  ? `${purgeScopes.size} master-data scope(s) selected.`
                  : "Transactional data only."}
              </span>
              <button
                className="inline-flex items-center justify-center rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(225,29,72,0.22)] transition hover:brightness-[1.05] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  purgeState.status === "submitting" ||
                  purgeConfirmationText.trim().toUpperCase() !==
                    enterpriseDataPurgeConfirmationText ||
                  purgePassword.trim().length === 0
                }
                onClick={() => void runDataPurge()}
                type="button"
              >
                {purgeState.status === "submitting"
                  ? "Purging..."
                  : "Purge data permanently"}
              </button>
            </div>

            <div className="mt-4">
              <Feedback state={purgeState} />
            </div>

            {purgeResult?.deletedCounts.length ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Table</th>
                      <th className="px-4 py-2 text-right font-semibold">Rows deleted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purgeResult.deletedCounts.map((entry) => (
                      <tr className="border-t border-stone-100" key={entry.model}>
                        <td className="px-4 py-2 text-stone-700">{entry.model}</td>
                        <td className="px-4 py-2 text-right font-semibold text-stone-900">
                          {entry.count.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-stone-200 bg-stone-50">
                      <td className="px-4 py-2 font-semibold text-stone-900">Total</td>
                      <td className="px-4 py-2 text-right font-semibold text-stone-900">
                        {purgeResult.totalDeleted.toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
          </article>
        );
      default:
        return null;
    }
  };

  return (
    <EnterpriseShell
      activeSection="security"
      description={pageMeta.description}
      eyebrow="Flash ERP enterprise"
      heading={pageMeta.heading}
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} />
        ))}
      </section>

      {renderSecurityContent(selectedView)}

      <ActionDialog
        description={selectedLog?.detailsLabel || undefined}
        hideTrigger
        onOpenChange={(open) => {
          if (!open) {
            setSelectedLog(null);
          }
        }}
        open={selectedLog !== null}
        title={selectedLog ? `${selectedLog.category} / ${selectedLog.action}` : "Log details"}
        triggerLabel="Open log details"
        widthClassName="max-w-5xl"
      >
        {selectedLog ? <LogDetailsPanel log={selectedLog} /> : null}
      </ActionDialog>

      <section className="glass-panel rounded-[1.4rem] p-5">
        <p className="text-sm leading-6 text-stone-600">{pageStatusMessage}</p>
      </section>
    </EnterpriseShell>
  );
}
