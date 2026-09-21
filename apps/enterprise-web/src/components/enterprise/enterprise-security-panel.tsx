"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ShieldCheck, UserCog } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { SharedDataGrid } from "@/components/data-grid/data-grid";
import type {
  CreateEnterpriseRetailUserRequest,
  CreateEnterpriseRoleRequest,
  EnterpriseRetailUserMutationResponse,
  EnterpriseRoleMutationResponse,
  EnterpriseSecurityWorkspaceData
} from "@/server/repositories/enterprise-security.repository";

type RoleRow = EnterpriseSecurityWorkspaceData["roleRows"][number];
type UserRow = EnterpriseSecurityWorkspaceData["userRows"][number];
type PermissionRow = EnterpriseSecurityWorkspaceData["permissionRows"][number];

const onlineStoreRoleCodes = new Set([
  "ONLINE_STORE_CASHIER",
  "ONLINE_STORE_SUPERVISOR"
]);

function hasOnlineStoreRole(roleCodes: string[]) {
  return roleCodes.some((roleCode) => onlineStoreRoleCodes.has(roleCode));
}

function formatStoreMode(mode: string | null | undefined) {
  return mode ? mode.replace(/_/g, " ") : "No store mode";
}

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

function SecurityMetricCard({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-[1.15rem] border border-stone-200 bg-white/90 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-stone-950">{value}</p>
    </article>
  );
}

function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "ACTIVE"
      ? "bg-emerald-100 text-emerald-700"
      : value === "INVITED"
        ? "bg-sky-100 text-sky-700"
        : value === "SUSPENDED" || value === "INACTIVE"
          ? "bg-amber-100 text-amber-700"
          : "bg-stone-200 text-stone-700";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {value}
    </span>
  );
}

function renderTimestamp(value: string, label: string) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-stone-800">{label}</p>
      <p className="mt-0.5 truncate text-xs text-stone-500">{new Date(value).toLocaleString()}</p>
    </div>
  );
}

function DialogTextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "password";
  disabled?: boolean;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <input
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)] disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

function DialogTextArea({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <textarea
        className="min-h-28 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function DialogSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{
    label: string;
    value: string;
  }>;
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

function MultiSelectChecklist({
  title,
  description,
  items,
  selectedValues,
  onToggle
}: {
  title: string;
  description: string;
  items: Array<{
    value: string;
    label: string;
    helper?: string | null;
  }>;
  selectedValues: string[];
  onToggle: (value: string, nextChecked: boolean) => void;
}) {
  const selectedValueSet = new Set(selectedValues);

  return (
    <div className="rounded-[1.35rem] border border-stone-200 bg-white p-4">
      <p className="text-sm font-semibold text-stone-950">{title}</p>
      <p className="mt-1 text-sm leading-6 text-stone-600">{description}</p>
      <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
        {items.map((item) => (
          <label
            className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-stone-50/80 px-3 py-3 text-sm text-stone-700"
            key={item.value}
          >
            <input
              checked={selectedValueSet.has(item.value)}
              className="mt-1 h-4 w-4"
              onChange={(event) => onToggle(item.value, event.target.checked)}
              type="checkbox"
            />
            <span className="min-w-0">
              <span className="block font-semibold text-stone-900">{item.label}</span>
              {item.helper ? (
                <span className="mt-0.5 block text-xs leading-5 text-stone-500">{item.helper}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function PermissionChecklist({
  groups,
  selectedValues,
  onToggle,
  onBulkToggle
}: {
  groups: EnterpriseSecurityWorkspaceData["permissionGroups"];
  selectedValues: string[];
  onToggle: (value: string, nextChecked: boolean) => void;
  onBulkToggle: (values: string[], nextChecked: boolean) => void;
}) {
  const [permissionQuery, setPermissionQuery] = useState("");
  const selectedValueSet = new Set(selectedValues);
  const normalizedQuery = permissionQuery.trim().toLowerCase();
  const totalPermissionCount = groups.reduce(
    (domainTotal, domainEntry) =>
      domainTotal +
      domainEntry.groups.reduce(
        (groupTotal, groupEntry) => groupTotal + groupEntry.permissions.length,
        0
      ),
    0
  );
  const filteredGroups = groups
    .map((domainEntry) => ({
      ...domainEntry,
      groups: domainEntry.groups
        .map((groupEntry) => ({
          ...groupEntry,
          permissions: groupEntry.permissions.filter((permission) => {
            if (!normalizedQuery) {
              return true;
            }

            return [
              domainEntry.domain,
              groupEntry.group,
              permission.permissionCode,
              permission.name,
              permission.description,
              permission.surface,
              permission.legacy ? "legacy" : ""
            ]
              .join(" ")
              .toLowerCase()
              .includes(normalizedQuery);
          })
        }))
        .filter((groupEntry) => groupEntry.permissions.length > 0)
    }))
    .filter((domainEntry) => domainEntry.groups.length > 0);
  const visiblePermissionCodes = filteredGroups.flatMap((domainEntry) =>
    domainEntry.groups.flatMap((groupEntry) =>
      groupEntry.permissions.map((permission) => permission.permissionCode)
    )
  );

  return (
    <div className="rounded-[1.35rem] border border-stone-200 bg-white p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-stone-950">Privileges</p>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Search, review, and bulk assign privileges by business domain.
            </p>
          </div>
          <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-600">
            {selectedValues.length}/{totalPermissionCount} selected
          </span>
        </div>

        <input
          className="h-11 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
          onChange={(event) => setPermissionQuery(event.target.value)}
          placeholder="Search privilege name, code, domain, group, or surface"
          value={permissionQuery}
        />

        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:border-[var(--brand)] hover:text-stone-950 disabled:opacity-50"
            disabled={visiblePermissionCodes.length === 0}
            onClick={() => onBulkToggle(visiblePermissionCodes, true)}
            type="button"
          >
            Select visible
          </button>
          <button
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950 disabled:opacity-50"
            disabled={visiblePermissionCodes.length === 0}
            onClick={() => onBulkToggle(visiblePermissionCodes, false)}
            type="button"
          >
            Clear visible
          </button>
        </div>
      </div>

      <div className="mt-4 max-h-[32rem] space-y-4 overflow-y-auto pr-1">
        {filteredGroups.map((domainEntry) => {
          const domainPermissionCodes = domainEntry.groups.flatMap((groupEntry) =>
            groupEntry.permissions.map((permission) => permission.permissionCode)
          );

          return (
            <section className="space-y-3" key={domainEntry.domain}>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-600">
                  {domainEntry.domain}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 ring-1 ring-stone-200"
                    onClick={() => onBulkToggle(domainPermissionCodes, true)}
                    type="button"
                  >
                    Select domain
                  </button>
                  <button
                    className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 ring-1 ring-stone-200"
                    onClick={() => onBulkToggle(domainPermissionCodes, false)}
                    type="button"
                  >
                    Clear
                  </button>
                </div>
              </div>
              {domainEntry.groups.map((groupEntry) => {
                const groupPermissionCodes = groupEntry.permissions.map(
                  (permission) => permission.permissionCode
                );
                const assignedInGroup = groupPermissionCodes.filter((permissionCode) =>
                  selectedValueSet.has(permissionCode)
                ).length;

                return (
                  <div
                    className="rounded-[1.2rem] border border-stone-200 bg-stone-50/75 p-3"
                    key={`${domainEntry.domain}:${groupEntry.group}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-stone-900">{groupEntry.group}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-600 ring-1 ring-stone-200">
                          {assignedInGroup}/{groupPermissionCodes.length}
                        </span>
                        <button
                          className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 ring-1 ring-stone-200"
                          onClick={() => onBulkToggle(groupPermissionCodes, true)}
                          type="button"
                        >
                          Select group
                        </button>
                        <button
                          className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 ring-1 ring-stone-200"
                          onClick={() => onBulkToggle(groupPermissionCodes, false)}
                          type="button"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 2xl:grid-cols-2">
                      {groupEntry.permissions.map((permission) => (
                        <label
                          className={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-sm transition ${
                            selectedValueSet.has(permission.permissionCode)
                              ? "border-[var(--brand)] bg-[color:rgba(37,99,235,0.08)] text-stone-800"
                              : "border-stone-200 bg-white text-stone-700"
                          }`}
                          key={permission.permissionCode}
                        >
                          <input
                            checked={selectedValueSet.has(permission.permissionCode)}
                            className="mt-1 h-4 w-4"
                            onChange={(event) =>
                              onToggle(permission.permissionCode, event.target.checked)
                            }
                            type="checkbox"
                          />
                          <span className="min-w-0">
                            <span className="block font-semibold text-stone-900">
                              {permission.name}
                            </span>
                            <span className="mt-0.5 block break-all text-xs font-semibold text-stone-500">
                              {permission.permissionCode}
                            </span>
                            <span className="mt-0.5 block text-xs leading-5 text-stone-500">
                              {permission.description}
                            </span>
                            <span className="mt-1 inline-flex rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-600">
                              {permission.surface}
                              {permission.legacy ? " / legacy" : ""}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
        {filteredGroups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm font-medium text-stone-500">
            No privileges match that search.
          </div>
        ) : null}
      </div>
    </div>
  );
}

const recordStatusOptions = [
  { value: "ACTIVE", label: "ACTIVE" },
  { value: "INACTIVE", label: "INACTIVE" },
  { value: "ARCHIVED", label: "ARCHIVED" }
];

const accountStatusOptions = [
  { value: "INVITED", label: "INVITED" },
  { value: "ACTIVE", label: "ACTIVE" },
  { value: "SUSPENDED", label: "SUSPENDED" },
  { value: "DISABLED", label: "DISABLED" }
];

const emptyRole = (): CreateEnterpriseRoleRequest => ({
  roleCode: "",
  name: "",
  description: "",
  status: "ACTIVE",
  permissionCodes: []
});

const emptyUser = (): CreateEnterpriseRetailUserRequest => ({
  loginId: "",
  email: "",
  displayName: "",
  accountStatus: "INVITED",
  homeStoreCode: "",
  roleCodes: [],
  password: ""
});

export function EnterpriseSecurityPanel({
  mode,
  workspace
}: {
  mode: "roles" | "users";
  workspace: EnterpriseSecurityWorkspaceData;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openUserId = searchParams.get("openUser");
  const [roleDraft, setRoleDraft] = useState<CreateEnterpriseRoleRequest>(emptyRole());
  const [userDraft, setUserDraft] = useState<CreateEnterpriseRetailUserRequest>(emptyUser());
  const [editingRoleCode, setEditingRoleCode] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [roleState, setRoleState] = useState<MutationState>({ status: "idle", message: "" });
  const [userState, setUserState] = useState<MutationState>({ status: "idle", message: "" });
  const [unlockingUserId, setUnlockingUserId] = useState<string | null>(null);
  const [unlockState, setUnlockState] = useState<MutationState>({ status: "idle", message: "" });

  useEffect(() => {
    if (mode !== "users" || !openUserId) {
      return;
    }

    const user = workspace.userRows.find(
      (row) =>
        row.userId.toLowerCase() === openUserId.toLowerCase() ||
        row.loginId.toLowerCase() === openUserId.toLowerCase()
    );

    if (!user) {
      return;
    }

    setEditingUserId(user.userId);
    setUserDraft({
      loginId: user.loginId,
      email: user.email ?? "",
      displayName: user.displayName,
      accountStatus: user.accountStatus,
      homeStoreCode: user.homeStoreCode ?? "",
      roleCodes: user.roleCodes,
      password: ""
    });
    setUserState({ status: "idle", message: "" });
    setIsUserDialogOpen(true);
  }, [mode, openUserId, workspace.userRows]);

  const roleColumns = useMemo<ColumnDef<RoleRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Role",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.name}</p>
            <p className="truncate text-xs text-stone-500">{row.original.roleCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "permissionCount",
        header: "Permissions",
        cell: ({ row }) =>
          `${row.original.permissionCount} assigned across ${row.original.permissionDomainCount} domain(s)`
      },
      {
        accessorKey: "assignedUserCount",
        header: "Users",
        cell: ({ row }) => `${row.original.assignedUserCount} linked`
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "updatedAtLabel",
        header: "Updated",
        cell: ({ row }) => renderTimestamp(row.original.updatedAt, row.original.updatedAtLabel),
        meta: { disableTruncate: true }
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <button
            className="inline-flex rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
            onClick={() => {
              setEditingRoleCode(row.original.roleCode);
              setRoleDraft({
                roleCode: row.original.roleCode,
                name: row.original.name,
                description: row.original.description ?? "",
                status: row.original.status,
                permissionCodes: row.original.permissionCodes
              });
              setRoleState({ status: "idle", message: "" });
              setIsRoleDialogOpen(true);
            }}
            type="button"
          >
            Edit
          </button>
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const userColumns = useMemo<ColumnDef<UserRow>[]>(
    () => [
      {
        accessorKey: "displayName",
        header: "User",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.displayName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.loginId}
              {row.original.email ? ` • ${row.original.email}` : ""}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "homeStoreName",
        header: "Home store",
        cell: ({ row }) =>
          row.original.homeStoreName ? (
            <div className="min-w-0">
              <p className="truncate font-medium text-stone-900">{row.original.homeStoreName}</p>
              <p className="truncate text-xs text-stone-500">
                {row.original.homeStoreCode} • {formatStoreMode(row.original.homeStoreMode)}
              </p>
            </div>
          ) : (
            "Unassigned"
          ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "roleNames",
        header: "Roles",
        cell: ({ row }) => row.original.roleNames.join(", ")
      },
      {
        accessorKey: "access",
        header: "Access",
        cell: ({ row }) => {
          const isOnlineStoreLoginReady =
            row.original.onlineStoreEligible &&
            row.original.accountStatus === "ACTIVE" &&
            !row.original.isLocked;
          const onlineStoreLabel = !row.original.onlineStoreEligible
            ? "No online-store login"
            : row.original.isLocked
              ? "Online login locked"
              : row.original.accountStatus === "ACTIVE"
                ? "Online-store login"
                : "Online setup inactive";

          return (
            <div className="flex flex-wrap gap-2">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                  isOnlineStoreLoginReady
                    ? "bg-emerald-100 text-emerald-700"
                    : row.original.onlineStoreEligible
                      ? "bg-amber-100 text-amber-700"
                      : "bg-stone-100 text-stone-700"
                }`}
              >
                {onlineStoreLabel}
              </span>
              <span className="inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                {row.original.cashierEligible ? "Cashier-ready" : "No cashier lane"}
              </span>
              <span className="inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                {row.original.supervisorEligible ? "Supervisor-ready" : "No supervisor override"}
              </span>
              <span className="inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                {row.original.capabilities.canProcessReturn ? "Returns" : "No returns"}
              </span>
              <span className="inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                {row.original.capabilities.canSearchReceipt ? "Receipt search" : "No receipt search"}
              </span>
            </div>
          );
        },
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "accountStatus",
        header: "Status",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge value={row.original.accountStatus} />
            {row.original.isLocked ? (
              <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">
                LOCKED
              </span>
            ) : null}
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "updatedAtLabel",
        header: "Updated",
        cell: ({ row }) => renderTimestamp(row.original.updatedAt, row.original.updatedAtLabel),
        meta: { disableTruncate: true }
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <div className="flex flex-wrap justify-end gap-2">
            {row.original.isLocked ? (
              <button
                className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-400 hover:text-emerald-900 disabled:opacity-50"
                disabled={unlockingUserId === row.original.userId}
                onClick={() => void unlockUser(row.original.userId)}
                type="button"
              >
                {unlockingUserId === row.original.userId ? "Unlocking..." : "Unlock account"}
              </button>
            ) : null}
            <button
              className="inline-flex rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              onClick={() => {
                setEditingUserId(row.original.userId);
                setUserDraft({
                  loginId: row.original.loginId,
                  email: row.original.email ?? "",
                  displayName: row.original.displayName,
                  accountStatus: row.original.accountStatus,
                  homeStoreCode: row.original.homeStoreCode ?? "",
                  roleCodes: row.original.roleCodes,
                  password: ""
                });
                setUserState({ status: "idle", message: "" });
                setIsUserDialogOpen(true);
              }}
              type="button"
            >
              Edit
            </button>
          </div>
        ),
        meta: { disableTruncate: true }
      }
    ],
    [unlockingUserId]
  );

  const permissionColumns = useMemo<ColumnDef<PermissionRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Permission",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.name}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.permissionCode} • {row.original.domain} / {row.original.group}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "surface",
        header: "Surface",
        cell: ({ row }) => `${row.original.surface}${row.original.legacy ? " • legacy" : ""}`
      },
      {
        accessorKey: "assignedRoleCount",
        header: "Roles",
        cell: ({ row }) => `${row.original.assignedRoleCount} role(s)`
      },
      {
        accessorKey: "description",
        header: "Description"
      }
    ],
    []
  );

  const storeByCode = useMemo(
    () => new Map(workspace.availableStores.map((store) => [store.storeCode, store] as const)),
    [workspace.availableStores]
  );
  const selectedHomeStore = userDraft.homeStoreCode
    ? storeByCode.get(userDraft.homeStoreCode) ?? null
    : null;
  const selectedHasOnlineStoreRole = hasOnlineStoreRole(userDraft.roleCodes);
  const selectedHomeStoreIsOnlineDirect =
    selectedHomeStore?.storeMode === "ONLINE_DIRECT" && selectedHomeStore.status === "ACTIVE";
  const hasOnlineStoreDraftConflict =
    selectedHasOnlineStoreRole && !selectedHomeStoreIsOnlineDirect;

  const storeOptions = useMemo(
    () => [
      { value: "", label: "No home store" },
      ...workspace.availableStores.map((store) => ({
        value: store.storeCode,
        label: `${store.name} (${store.storeCode}) • ${formatStoreMode(store.storeMode)}${
          store.status === "ACTIVE" ? "" : ` • ${store.status}`
        }`
      }))
    ],
    [workspace.availableStores]
  );

  async function saveRole() {
    setRoleState({ status: "submitting", message: "" });

    try {
      const response = await fetch(
        editingRoleCode
          ? `/api/setup/roles/${encodeURIComponent(editingRoleCode)}`
          : "/api/setup/roles",
        {
          method: editingRoleCode ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(roleDraft)
        }
      );
      const payload = (await response.json()) as Partial<EnterpriseRoleMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.message ?? "Flash ERP could not save that enterprise role right now."
        );
      }

      setRoleState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the role."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsRoleDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setRoleState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not save that role."
      });
    }
  }

  async function saveUser() {
    if (hasOnlineStoreDraftConflict) {
      setUserState({
        status: "error",
        message: "Choose an active ONLINE_DIRECT home store before saving Online POS roles."
      });
      return;
    }

    setUserState({ status: "submitting", message: "" });

    try {
      const response = await fetch(
        editingUserId ? `/api/setup/users/${encodeURIComponent(editingUserId)}` : "/api/setup/users",
        {
          method: editingUserId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(userDraft)
        }
      );
      const payload = (await response.json()) as Partial<EnterpriseRetailUserMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.message ?? "Flash ERP could not save that enterprise user right now."
        );
      }

      setUserState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the retail user."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsUserDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setUserState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save that retail user."
      });
    }
  }

  async function unlockUser(userId: string) {
    setUnlockingUserId(userId);
    setUnlockState({ status: "submitting", message: "" });

    try {
      const response = await fetch(`/api/setup/users/${encodeURIComponent(userId)}/unlock`, {
        method: "PATCH"
      });
      const payload = (await response.json()) as Partial<EnterpriseRetailUserMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not unlock that account right now.");
      }

      setUnlockState({
        status: "success",
        message: payload.message ?? "Flash ERP unlocked the account."
      });
      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setUnlockState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not unlock that account."
      });
    } finally {
      setUnlockingUserId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SecurityMetricCard
          label="Active roles"
          value={String(workspace.metrics.activeRoles)}
        />
        <SecurityMetricCard
          label="Permissions"
          value={String(workspace.metrics.permissionCatalogCount)}
        />
        <SecurityMetricCard
          label="Active users"
          value={String(workspace.metrics.activeUsers)}
        />
        <SecurityMetricCard
          label="Cashier-ready"
          value={String(workspace.metrics.cashierEligibleUsers)}
        />
        <SecurityMetricCard
          label="Supervisor-ready"
          value={String(workspace.metrics.supervisorEligibleUsers)}
        />
        <SecurityMetricCard
          label="Online-store ready"
          value={String(workspace.metrics.onlineStoreEligibleUsers)}
        />
      </section>

      {workspace.loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
          <p className="font-semibold">
            Enterprise security policy could not be read, so the roles and privilege lists on this
            page are unavailable rather than empty.
          </p>
          <p className="mt-1 break-words">{workspace.loadError}</p>
          <button
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-rose-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700 transition hover:border-rose-400"
            onClick={() => router.refresh()}
            type="button"
          >
            Try loading again
          </button>
        </div>
      ) : null}

      {mode === "roles" ? (
        <>
          <SharedDataGrid
            columns={roleColumns}
            data={workspace.roleRows}
            emptyLabel="No enterprise roles are configured in Flash ERP yet."
            exportFileName="flash-erp-security-roles"
            searchPlaceholder="Search roles"
            toolbarActions={
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[var(--brand)]"
                onClick={() => {
                  setEditingRoleCode(null);
                  setRoleDraft(emptyRole());
                  setRoleState({ status: "idle", message: "" });
                  setIsRoleDialogOpen(true);
                }}
                type="button"
              >
                <ShieldCheck className="h-4 w-4" />
                Create role
              </button>
            }
          />

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,1fr)]">
            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Permission catalog
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Privileges are centrally seeded and grouped by business domain here so store
                desktops can validate cashier, supervisor, inventory, and back-office capability
                offline.
              </p>
              <div className="mt-4">
                <SharedDataGrid
                  columns={permissionColumns}
                  data={workspace.permissionRows}
                  emptyLabel="No permission codes are available in Flash ERP right now."
                  exportFileName="flash-erp-security-permissions"
                  initialPageSize={8}
                  pageSizeOptions={[8, 16, 32]}
                  searchPlaceholder="Search permissions"
                />
              </div>
            </article>

            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Security posture
                </p>
                <div className="mt-4 space-y-3">
                  {workspace.postureMessages.map((message) => (
                    <div
                      className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800"
                      key={message}
                    >
                      {message}
                    </div>
                  ))}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Immediate priorities
                </p>
                <div className="mt-4 space-y-3">
                  {workspace.priorities.map((message) => (
                    <div
                      className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-3 text-sm leading-6 text-stone-700"
                      key={message}
                    >
                      {message}
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>
        </>
      ) : (
        <>
          <SharedDataGrid
            columns={userColumns}
            data={workspace.userRows}
            emptyLabel="No enterprise retail users are configured in Flash ERP yet."
            exportFileName="flash-erp-security-users"
            searchPlaceholder="Search users"
            toolbarActions={
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[var(--brand)]"
                onClick={() => {
                  setEditingUserId(null);
                  setUserDraft(emptyUser());
                  setUserState({ status: "idle", message: "" });
                  setIsUserDialogOpen(true);
                }}
                type="button"
              >
                <UserCog className="h-4 w-4" />
                Create user
              </button>
            }
          />

          {unlockState.message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                unlockState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {unlockState.message}
            </div>
          ) : null}

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,1fr)]">
            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Operator readiness
              </p>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-3 text-sm leading-6 text-stone-700">
                  Flash ERP syncs active roles and users down to store desktops, where cashier shift
                  opening and supervisor overrides are validated locally even when enterprise is
                  unreachable.
                </div>
                <div className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-3 text-sm leading-6 text-stone-700">
                  A user becomes cashier-ready when their active role mix grants both
                  `pos.shift.open` and `pos.sale.process`. Supervisor readiness is now driven by
                  explicit override privileges such as `pos.override.no-receipt-return`,
                  `pos.override.discount`, or `pos.override.price`.
                </div>
                <div className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-3 text-sm leading-6 text-stone-700">
                  Online-store sign-in is role plus store based: assign ONLINE_STORE_CASHIER or
                  ONLINE_STORE_SUPERVISOR and choose an active ONLINE_DIRECT home store. Multiple
                  named staff can share the same store; the login ID is the unique value.
                </div>
              </div>
            </article>

            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Priorities
              </p>
              <div className="mt-4 space-y-3">
                {workspace.priorities.map((message) => (
                  <div
                    className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-3 text-sm leading-6 text-stone-700"
                    key={message}
                  >
                    {message}
                  </div>
                ))}
              </div>
            </article>
          </section>
        </>
      )}

      <section className="glass-panel rounded-[1.35rem] p-5">
        <p className="text-sm leading-6 text-stone-600">{workspace.statusMessage}</p>
      </section>

      <ActionDialog
        description="Create or update enterprise roles and assign granular privilege codes."
        onOpenChange={setIsRoleDialogOpen}
        open={isRoleDialogOpen}
        title={editingRoleCode ? "Edit role" : "Create role"}
        triggerLabel=""
        widthClassName="max-w-6xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,1.2fr)]">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <DialogTextInput
                  disabled={Boolean(editingRoleCode)}
                  label="Role code"
                  onChange={(value) => setRoleDraft((current) => ({ ...current, roleCode: value }))}
                  placeholder="STORE-SUPERVISOR"
                  value={roleDraft.roleCode}
                />
                <DialogTextInput
                  label="Role name"
                  onChange={(value) => setRoleDraft((current) => ({ ...current, name: value }))}
                  placeholder="Store Supervisor"
                  value={roleDraft.name}
                />
              </div>

              <DialogSelect
                label="Status"
                onChange={(value) => setRoleDraft((current) => ({ ...current, status: value }))}
                options={recordStatusOptions}
                value={roleDraft.status ?? "ACTIVE"}
              />

              <DialogTextArea
                label="Description"
                onChange={(value) => setRoleDraft((current) => ({ ...current, description: value }))}
                value={roleDraft.description ?? ""}
              />
            </div>

            <PermissionChecklist
              groups={workspace.permissionGroups}
              onBulkToggle={(values, nextChecked) =>
                setRoleDraft((current) => ({
                  ...current,
                  permissionCodes: nextChecked
                    ? Array.from(new Set([...current.permissionCodes, ...values]))
                    : current.permissionCodes.filter((permissionCode) => !values.includes(permissionCode))
                }))
              }
              onToggle={(value, nextChecked) =>
                setRoleDraft((current) => ({
                  ...current,
                  permissionCodes: nextChecked
                    ? [...current.permissionCodes, value]
                    : current.permissionCodes.filter((permissionCode) => permissionCode !== value)
                }))
              }
              selectedValues={roleDraft.permissionCodes}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              disabled={roleState.status === "submitting"}
              onClick={() => setIsRoleDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
              disabled={
                roleState.status === "submitting" ||
                !roleDraft.roleCode.trim() ||
                !roleDraft.name.trim() ||
                roleDraft.permissionCodes.length === 0
              }
              onClick={() => void saveRole()}
              type="button"
            >
              {roleState.status === "submitting" ? "Saving..." : "Save role"}
            </button>
          </div>

          {roleState.message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                roleState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {roleState.message}
            </div>
          ) : null}
        </div>
      </ActionDialog>

      <ActionDialog
        description="Create or update enterprise retail users and assign centrally managed roles."
        onOpenChange={setIsUserDialogOpen}
        open={isUserDialogOpen}
        title={editingUserId ? "Edit user" : "Create user"}
        triggerLabel=""
        widthClassName="max-w-6xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,1.1fr)]">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <DialogTextInput
                  label="Login ID"
                  onChange={(value) => setUserDraft((current) => ({ ...current, loginId: value }))}
                  placeholder="cashier.ama"
                  value={userDraft.loginId}
                />
                <DialogTextInput
                  label="Display name"
                  onChange={(value) =>
                    setUserDraft((current) => ({ ...current, displayName: value }))
                  }
                  placeholder="Ama Mensah"
                  value={userDraft.displayName}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <DialogTextInput
                  label="Email"
                  onChange={(value) => setUserDraft((current) => ({ ...current, email: value }))}
                  placeholder="ama@flashrms.local"
                  type="email"
                  value={userDraft.email ?? ""}
                />
                <DialogSelect
                  label="Account status"
                  onChange={(value) =>
                    setUserDraft((current) => ({ ...current, accountStatus: value }))
                  }
                  options={accountStatusOptions}
                  value={userDraft.accountStatus ?? "INVITED"}
                />
              </div>

              <DialogTextInput
                label={editingUserId ? "Reset password (optional)" : "Temporary password"}
                onChange={(value) => setUserDraft((current) => ({ ...current, password: value }))}
                placeholder={editingUserId ? "Leave blank to keep existing password" : "Set a password"}
                type="password"
                value={userDraft.password ?? ""}
              />

              <DialogSelect
                label="Home store"
                onChange={(value) =>
                  setUserDraft((current) => ({ ...current, homeStoreCode: value }))
                }
                options={storeOptions}
                value={userDraft.homeStoreCode ?? ""}
              />

              <div
                className={`rounded-[1.15rem] border px-4 py-3 text-sm leading-6 ${
                  hasOnlineStoreDraftConflict
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : selectedHasOnlineStoreRole
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-stone-200 bg-stone-50 text-stone-600"
                }`}
              >
                <p className="font-semibold">
                  {selectedHasOnlineStoreRole
                    ? "Online-store login"
                    : "Store desktop or HQ access"}
                </p>
                <p className="mt-1">
                  {hasOnlineStoreDraftConflict
                    ? "Online POS roles require an active ONLINE_DIRECT home store."
                    : selectedHasOnlineStoreRole && selectedHomeStore
                      ? `${selectedHomeStore.name} is ready for online-store sign-in.`
                      : selectedHasOnlineStoreRole
                        ? "Choose an active ONLINE_DIRECT home store."
                        : "Select an online-store role when this user should sign into browser POS."}
                </p>
              </div>
            </div>

            <MultiSelectChecklist
              description="Assign one or more roles. Effective cashier and supervisor capability is derived from the permissions on these roles."
              items={workspace.availableRoles.map((role) => ({
                value: role.roleCode,
                label: `${role.name} (${role.roleCode})`,
                helper: `${role.permissionCount} permission(s) • ${role.status}${
                  onlineStoreRoleCodes.has(role.roleCode) ? " • Online POS login role" : ""
                }`
              }))}
              onToggle={(value, nextChecked) =>
                setUserDraft((current) => ({
                  ...current,
                  roleCodes: nextChecked
                    ? [...current.roleCodes, value]
                    : current.roleCodes.filter((roleCode) => roleCode !== value)
                }))
              }
              selectedValues={userDraft.roleCodes}
              title="Roles"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              disabled={userState.status === "submitting"}
              onClick={() => setIsUserDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
              disabled={
                userState.status === "submitting" ||
                !userDraft.loginId.trim() ||
                !userDraft.displayName.trim() ||
                userDraft.roleCodes.length === 0 ||
                (!editingUserId && !userDraft.password?.trim()) ||
                hasOnlineStoreDraftConflict
              }
              onClick={() => void saveUser()}
              type="button"
            >
              {userState.status === "submitting" ? "Saving..." : "Save user"}
            </button>
          </div>

          {userState.message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                userState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {userState.message}
            </div>
          ) : null}
        </div>
      </ActionDialog>
    </div>
  );
}
