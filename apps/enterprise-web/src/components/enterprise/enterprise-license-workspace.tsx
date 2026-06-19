"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import { KeyRound, MonitorSmartphone, RefreshCcw, ShieldCheck, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";

import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type { EnterpriseStoresWorkspaceData } from "@/server/repositories/enterprise-stores.repository";

type StoreRow = EnterpriseStoresWorkspaceData["storeRows"][number];
type TerminalRow = EnterpriseStoresWorkspaceData["terminalLicenseRows"][number];

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

const storeFilter: FilterFn<StoreRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.storeName,
    row.original.storeCode,
    row.original.storeGroupLabel,
    row.original.licenseStatus,
    row.original.licenseKey ?? "",
    row.original.licensedUntil ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const terminalFilter: FilterFn<TerminalRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.terminalCode,
    row.original.terminalName,
    row.original.storeCode,
    row.original.storeName,
    row.original.licenseStatus,
    row.original.licenseKey ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

function getDefaultExpiryDate() {
  return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getLicenseTone(status: string) {
  switch (status) {
    case "LICENSED":
    case "TRIAL":
      return "bg-emerald-100 text-emerald-700";
    case "EXPIRED":
    case "SUSPENDED":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-amber-100 text-amber-700";
  }
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "Not set";
}

function isLicensed(row: { licenseStatus: string; licensedUntil: string | null }) {
  if (row.licenseStatus !== "LICENSED" && row.licenseStatus !== "TRIAL") {
    return false;
  }

  return !row.licensedUntil || new Date(row.licensedUntil).getTime() >= Date.now();
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article className="glass-panel rounded-[1.05rem] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
            {label}
          </p>
          <p className="mt-1.5 text-[1.35rem] font-semibold text-stone-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] text-white shadow-[0_12px_24px_rgba(29,78,216,0.22)]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-2 text-[13px] leading-5 text-stone-600">{hint}</p>
    </article>
  );
}

function Feedback({ state }: { state: MutationState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={`rounded-xl border px-3 py-2 text-sm leading-5 ${
        state.status === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {state.message}
    </div>
  );
}

export function EnterpriseLicenseWorkspace({
  workspace
}: {
  workspace: EnterpriseStoresWorkspaceData;
}) {
  const router = useRouter();
  const [selectedStoreCodes, setSelectedStoreCodes] = useState<Set<string>>(new Set());
  const [storeKeys, setStoreKeys] = useState<Record<string, string>>({});
  const [storeSharedKey, setStoreSharedKey] = useState("");
  const [storeApplySharedKey, setStoreApplySharedKey] = useState(true);
  const [storeLicensedUntil, setStoreLicensedUntil] = useState(getDefaultExpiryDate);
  const [storeLicenseStatus, setStoreLicenseStatus] = useState("LICENSED");
  const [storeState, setStoreState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [activeStoreCode, setActiveStoreCode] = useState(workspace.storeRows[0]?.storeCode ?? "");
  const [selectedTerminalIds, setSelectedTerminalIds] = useState<Set<string>>(new Set());
  const [terminalKeys, setTerminalKeys] = useState<Record<string, string>>({});
  const [terminalSharedKey, setTerminalSharedKey] = useState("");
  const [terminalApplySharedKey, setTerminalApplySharedKey] = useState(true);
  const [terminalLicensedUntil, setTerminalLicensedUntil] = useState(getDefaultExpiryDate);
  const [terminalLicenseStatus, setTerminalLicenseStatus] = useState("LICENSED");
  const [terminalState, setTerminalState] = useState<MutationState>({
    status: "idle",
    message: ""
  });

  const activeStore = useMemo(
    () => workspace.storeRows.find((store) => store.storeCode === activeStoreCode) ?? null,
    [activeStoreCode, workspace.storeRows]
  );
  const activeStoreTerminals = useMemo(
    () =>
      workspace.terminalLicenseRows.filter((terminal) => terminal.storeCode === activeStoreCode),
    [activeStoreCode, workspace.terminalLicenseRows]
  );
  const licensedStores = workspace.storeRows.filter(isLicensed).length;
  const licensedTerminals = workspace.terminalLicenseRows.filter(isLicensed).length;
  const storeLicenseNeedsKey = storeLicenseStatus === "LICENSED" || storeLicenseStatus === "TRIAL";
  const terminalLicenseNeedsKey =
    terminalLicenseStatus === "LICENSED" || terminalLicenseStatus === "TRIAL";

  const storeColumns = useMemo<ColumnDef<StoreRow>[]>(
    () => [
      {
        id: "select",
        header: "",
        cell: ({ row }) => (
          <input
            checked={selectedStoreCodes.has(row.original.storeCode)}
            onChange={(event) => toggleStore(row.original.storeCode, event.target.checked)}
            type="checkbox"
          />
        )
      },
      {
        accessorKey: "storeName",
        header: "Shop node",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.storeName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.storeCode} • {row.original.storeGroupLabel}
            </p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "licenseStatus",
        header: "Status",
        cell: ({ row }) => (
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getLicenseTone(
              row.original.licenseStatus
            )}`}
          >
            {row.original.licenseStatus}
          </span>
        )
      },
      {
        accessorKey: "licensedUntil",
        header: "Expiry",
        cell: ({ row }) => formatDate(row.original.licensedUntil)
      },
      {
        accessorKey: "licenseKey",
        header: "License key",
        cell: ({ row }) =>
          selectedStoreCodes.has(row.original.storeCode) && !storeApplySharedKey ? (
            <input
              className="h-8 min-w-48 rounded-lg border border-stone-200 px-2 text-xs outline-none focus:border-[var(--brand)]"
              onChange={(event) =>
                setStoreKeys((current) => ({
                  ...current,
                  [row.original.storeCode]: event.target.value
                }))
              }
              placeholder="Enter key"
              value={storeKeys[row.original.storeCode] ?? row.original.licenseKey ?? ""}
            />
          ) : (
            <span className="truncate text-xs text-stone-600">
              {row.original.licenseKey ?? "Not set"}
            </span>
          ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "terminalCount",
        header: "Terminals",
        cell: ({ row }) => numberFormatter.format(row.original.terminalCount)
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Open shop licenses",
                onSelect: () => {
                  setActiveStoreCode(row.original.storeCode);
                  setSelectedTerminalIds(new Set());
                },
                tone: "primary"
              },
              {
                label: selectedStoreCodes.has(row.original.storeCode) ? "Clear selection" : "Select shop",
                onSelect: () =>
                  toggleStore(row.original.storeCode, !selectedStoreCodes.has(row.original.storeCode))
              }
            ]}
          />
        )
      }
    ],
    [selectedStoreCodes, storeApplySharedKey, storeKeys]
  );
  const terminalColumns = useMemo<ColumnDef<TerminalRow>[]>(
    () => [
      {
        id: "select",
        header: "",
        cell: ({ row }) => (
          <input
            checked={selectedTerminalIds.has(row.original.terminalId)}
            onChange={(event) => toggleTerminal(row.original.terminalId, event.target.checked)}
            type="checkbox"
          />
        )
      },
      {
        accessorKey: "terminalName",
        header: "Terminal",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.terminalName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.terminalCode}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "licenseStatus",
        header: "Status",
        cell: ({ row }) => (
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getLicenseTone(
              row.original.licenseStatus
            )}`}
          >
            {row.original.licenseStatus}
          </span>
        )
      },
      {
        accessorKey: "licensedUntil",
        header: "Expiry",
        cell: ({ row }) => formatDate(row.original.licensedUntil)
      },
      {
        accessorKey: "licenseKey",
        header: "License key",
        cell: ({ row }) =>
          selectedTerminalIds.has(row.original.terminalId) && !terminalApplySharedKey ? (
            <input
              className="h-8 min-w-48 rounded-lg border border-stone-200 px-2 text-xs outline-none focus:border-[var(--brand)]"
              onChange={(event) =>
                setTerminalKeys((current) => ({
                  ...current,
                  [row.original.terminalId]: event.target.value
                }))
              }
              placeholder="Enter key"
              value={terminalKeys[row.original.terminalId] ?? row.original.licenseKey ?? ""}
            />
          ) : (
            <span className="truncate text-xs text-stone-600">
              {row.original.licenseKey ?? "Not set"}
            </span>
          ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "lastHeartbeatAtLabel",
        header: "Heartbeat",
        cell: ({ row }) => row.original.lastHeartbeatAtLabel
      }
    ],
    [selectedTerminalIds, terminalApplySharedKey, terminalKeys]
  );

  function toggleStore(storeCode: string, checked: boolean) {
    setSelectedStoreCodes((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(storeCode);
      } else {
        next.delete(storeCode);
      }

      return next;
    });
  }

  function toggleTerminal(terminalId: string, checked: boolean) {
    setSelectedTerminalIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(terminalId);
      } else {
        next.delete(terminalId);
      }

      return next;
    });
  }

  function selectActiveStoreTerminals() {
    setSelectedTerminalIds(new Set(activeStoreTerminals.map((terminal) => terminal.terminalId)));
  }

  async function handleSaveStoreLicenses() {
    const storeCodes = [...selectedStoreCodes];
    const selectedStoreKeyMap = Object.fromEntries(
      storeCodes.map((storeCode) => {
        const currentKey =
          workspace.storeRows.find((store) => store.storeCode === storeCode)?.licenseKey ?? "";

        return [storeCode, (storeKeys[storeCode] ?? currentKey).trim()];
      })
    );

    if (storeCodes.length === 0) {
      setStoreState({
        status: "error",
        message: "Select at least one shop node before saving store licenses."
      });
      return;
    }

    if (storeLicenseNeedsKey && storeApplySharedKey && !storeSharedKey.trim()) {
      setStoreState({
        status: "error",
        message: "Enter the shared shop license key or clear the apply-to-all checkbox."
      });
      return;
    }

    if (
      storeLicenseNeedsKey &&
      !storeApplySharedKey &&
      storeCodes.some((storeCode) => !selectedStoreKeyMap[storeCode])
    ) {
      setStoreState({
        status: "error",
        message: "Enter a license key for every selected shop node."
      });
      return;
    }

    setStoreState({
      status: "submitting",
      message: ""
    });

    try {
      const response = await fetch("/api/stores/licenses/renew", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          storeCodes,
          includeAllTerminals: false,
          licenseStatus: storeLicenseStatus,
          licensedUntil: storeLicensedUntil || null,
          licenseKey: storeApplySharedKey ? storeSharedKey : null,
          storeLicenseKeys: storeApplySharedKey ? {} : selectedStoreKeyMap,
          operatorName: "Enterprise administrator",
          note: "HQ shop-node license activation from the dedicated licensing workspace."
        })
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save those shop licenses.");
      }

      setStoreState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the selected shop licenses."
      });
      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setStoreState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save those shop licenses."
      });
    }
  }

  async function handleSaveTerminalLicenses() {
    const terminalIds = [...selectedTerminalIds];
    const selectedTerminalKeyMap = Object.fromEntries(
      terminalIds.map((terminalId) => {
        const currentKey =
          workspace.terminalLicenseRows.find((terminal) => terminal.terminalId === terminalId)
            ?.licenseKey ?? "";

        return [terminalId, (terminalKeys[terminalId] ?? currentKey).trim()];
      })
    );

    if (terminalIds.length === 0) {
      setTerminalState({
        status: "error",
        message: "Select at least one terminal before saving terminal licenses."
      });
      return;
    }

    if (terminalLicenseNeedsKey && terminalApplySharedKey && !terminalSharedKey.trim()) {
      setTerminalState({
        status: "error",
        message: "Enter the shared terminal license key or clear the apply-to-all checkbox."
      });
      return;
    }

    if (
      terminalLicenseNeedsKey &&
      !terminalApplySharedKey &&
      terminalIds.some((terminalId) => !selectedTerminalKeyMap[terminalId])
    ) {
      setTerminalState({
        status: "error",
        message: "Enter a license key for every selected terminal."
      });
      return;
    }

    setTerminalState({
      status: "submitting",
      message: ""
    });

    try {
      const response = await fetch("/api/stores/licenses/renew", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          terminalIds,
          includeAllTerminals: false,
          licenseStatus: terminalLicenseStatus,
          licensedUntil: terminalLicensedUntil || null,
          licenseKey: terminalApplySharedKey ? terminalSharedKey : null,
          terminalLicenseKeys: terminalApplySharedKey ? {} : selectedTerminalKeyMap,
          operatorName: "Enterprise administrator",
          note: `HQ terminal license activation from the dedicated licensing workspace for ${activeStoreCode}.`
        })
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save those terminal licenses.");
      }

      setTerminalState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the selected terminal licenses."
      });
      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setTerminalState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save those terminal licenses."
      });
    }
  }

  return (
    <EnterpriseShell
      activeSection="settings"
      description="Activate and renew shop-node licenses separately from terminal licenses, with HQ-controlled keys and expiry dates."
      eyebrow="Flash ERP enterprise"
      heading="Licensing"
    >
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
        <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-700">
          Last refresh {new Date(workspace.refreshedAt).toLocaleString()}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          hint="Shop nodes currently licensed or in trial and not expired."
          icon={ShieldCheck}
          label="Licensed shops"
          value={`${numberFormatter.format(licensedStores)} / ${numberFormatter.format(
            workspace.storeRows.length
          )}`}
        />
        <MetricCard
          hint="Terminals currently licensed or in trial and not expired."
          icon={MonitorSmartphone}
          label="Licensed terminals"
          value={`${numberFormatter.format(licensedTerminals)} / ${numberFormatter.format(
            workspace.terminalLicenseRows.length
          )}`}
        />
        <MetricCard
          hint="Shop nodes selected for this licensing action."
          icon={KeyRound}
          label="Selected shops"
          value={numberFormatter.format(selectedStoreCodes.size)}
        />
        <MetricCard
          hint="Terminals selected within the open shop detail panel."
          icon={RefreshCcw}
          label="Selected terminals"
          value={numberFormatter.format(selectedTerminalIds.size)}
        />
      </section>

      <WorkspaceTabs
        ariaLabel="License workspace views"
        defaultValue="shops"
        tabs={[
          { value: "shops", label: "Shop licensing" },
          { value: "terminals", label: "Terminal licensing" }
        ]}
      >
        <WorkspaceTabsContent value="shops">
          <div className="space-y-4">
            <section className="glass-panel rounded-[1.15rem] p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[color:var(--brand)]"
                  onClick={() =>
                    setSelectedStoreCodes(new Set(workspace.storeRows.map((row) => row.storeCode)))
                  }
                  type="button"
                >
                  <Store className="h-4 w-4" />
                  Select all shops
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300"
                  onClick={() => setSelectedStoreCodes(new Set())}
                  type="button"
                >
                  Clear shops
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <label className="grid gap-1 text-[13px] text-stone-700">
                  <span className="font-semibold text-stone-900">Shop status</span>
                  <select
                    className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)]"
                    onChange={(event) => setStoreLicenseStatus(event.target.value)}
                    value={storeLicenseStatus}
                  >
                    <option value="LICENSED">Licensed</option>
                    <option value="TRIAL">Trial</option>
                    <option value="SUSPENDED">Suspended</option>
                    <option value="EXPIRED">Expired</option>
                    <option value="UNLICENSED">Unlicensed</option>
                  </select>
                </label>
                <label className="grid gap-1 text-[13px] text-stone-700">
                  <span className="font-semibold text-stone-900">Shop expiry</span>
                  <input
                    className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)]"
                    onChange={(event) => setStoreLicensedUntil(event.target.value)}
                    type="date"
                    value={storeLicensedUntil}
                  />
                </label>
                <label className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700">
                  <input
                    checked={storeApplySharedKey}
                    onChange={(event) => setStoreApplySharedKey(event.target.checked)}
                    type="checkbox"
                  />
                  Apply one key to all selected shops
                </label>
                <label className="grid gap-1 text-[13px] text-stone-700 xl:col-span-2">
                  <span className="font-semibold text-stone-900">Shared shop key</span>
                  <input
                    className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] disabled:bg-stone-50"
                    disabled={!storeApplySharedKey}
                    onChange={(event) => setStoreSharedKey(event.target.value)}
                    placeholder="Enter one key for all selected shop nodes"
                    value={storeSharedKey}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-stone-600">
                  {selectedStoreCodes.size} shop node(s) selected.
                </p>
                <button
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-4 text-sm font-semibold text-white shadow-[0_14px_26px_rgba(29,78,216,0.18)] transition hover:brightness-[1.03] disabled:opacity-60"
                  disabled={storeState.status === "submitting"}
                  onClick={() => void handleSaveStoreLicenses()}
                  type="button"
                >
                  {storeState.status === "submitting" ? "Saving..." : "Save shop licenses"}
                </button>
              </div>
              <div className="mt-3">
                <Feedback state={storeState} />
              </div>
            </section>

            <SharedDataGrid
              columns={storeColumns}
              data={workspace.storeRows}
              emptyLabel="No shop nodes are available for licensing yet."
              exportFileName="flash-erp-shop-node-licenses"
              globalFilterFn={storeFilter}
              searchPlaceholder="Search shops by code, group, key, expiry, or status"
            />
          </div>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="terminals">
          <div className="space-y-4">
            <section className="grid gap-4 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
              <article className="glass-panel rounded-[1.15rem] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
                      Shop detail
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-stone-950">
                      {activeStore?.storeName ?? "Select a shop"}
                    </h3>
                    <p className="mt-1 text-sm text-stone-600">
                      {activeStore
                        ? `${activeStore.storeCode} • ${activeStore.storeGroupLabel}`
                        : "Choose a shop to manage its terminals."}
                    </p>
                  </div>
                  <select
                    className="h-9 max-w-44 rounded-lg border border-stone-200 bg-white px-2 text-sm outline-none focus:border-[var(--brand)]"
                    onChange={(event) => {
                      setActiveStoreCode(event.target.value);
                      setSelectedTerminalIds(new Set());
                    }}
                    value={activeStoreCode}
                  >
                    {workspace.storeRows.map((store) => (
                      <option key={store.storeCode} value={store.storeCode}>
                        {store.storeName}
                      </option>
                    ))}
                  </select>
                </div>

                {activeStore ? (
                  <div className="mt-4 grid gap-2 text-sm">
                    <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2">
                      <span className="text-stone-500">Shop node license</span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getLicenseTone(
                          activeStore.licenseStatus
                        )}`}
                      >
                        {activeStore.licenseStatus}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2">
                      <span className="text-stone-500">Shop expiry</span>
                      <span className="font-semibold text-stone-900">
                        {formatDate(activeStore.licensedUntil)}
                      </span>
                    </div>
                    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
                      <p className="text-stone-500">Shop key</p>
                      <p className="mt-1 break-all text-xs font-semibold text-stone-900">
                        {activeStore.licenseKey ?? "Not set"}
                      </p>
                    </div>
                  </div>
                ) : null}
              </article>

              <article className="glass-panel rounded-[1.15rem] p-4">
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-stone-950">Terminal licensing</p>
                      <p className="text-xs text-stone-500">
                        {activeStoreTerminals.length} terminal(s) for this shop
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700"
                        onClick={selectActiveStoreTerminals}
                        type="button"
                      >
                        Select all
                      </button>
                      <button
                        className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700"
                        onClick={() => setSelectedTerminalIds(new Set())}
                        type="button"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="grid gap-1 text-[13px] text-stone-700">
                      <span className="font-semibold text-stone-900">Terminal status</span>
                      <select
                        className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)]"
                        onChange={(event) => setTerminalLicenseStatus(event.target.value)}
                        value={terminalLicenseStatus}
                      >
                        <option value="LICENSED">Licensed</option>
                        <option value="TRIAL">Trial</option>
                        <option value="SUSPENDED">Suspended</option>
                        <option value="EXPIRED">Expired</option>
                        <option value="UNLICENSED">Unlicensed</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-[13px] text-stone-700">
                      <span className="font-semibold text-stone-900">Terminal expiry</span>
                      <input
                        className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)]"
                        onChange={(event) => setTerminalLicensedUntil(event.target.value)}
                        type="date"
                        value={terminalLicensedUntil}
                      />
                    </label>
                    <label className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700">
                      <input
                        checked={terminalApplySharedKey}
                        onChange={(event) => setTerminalApplySharedKey(event.target.checked)}
                        type="checkbox"
                      />
                      Apply one key to all selected terminals
                    </label>
                    <label className="grid gap-1 text-[13px] text-stone-700">
                      <span className="font-semibold text-stone-900">Shared terminal key</span>
                      <input
                        className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] disabled:bg-stone-50"
                        disabled={!terminalApplySharedKey}
                        onChange={(event) => setTerminalSharedKey(event.target.value)}
                        placeholder="Enter one key for selected terminals"
                        value={terminalSharedKey}
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Feedback state={terminalState} />
                    <button
                      className="inline-flex h-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#0f766e,#115e59)] px-4 text-sm font-semibold text-white shadow-[0_14px_26px_rgba(15,118,110,0.18)] transition hover:brightness-[1.03] disabled:opacity-60"
                      disabled={terminalState.status === "submitting"}
                      onClick={() => void handleSaveTerminalLicenses()}
                      type="button"
                    >
                      {terminalState.status === "submitting"
                        ? "Saving..."
                        : "Save terminal licenses"}
                    </button>
                  </div>
                </div>
              </article>
            </section>

            <SharedDataGrid
              columns={terminalColumns}
              data={activeStoreTerminals}
              emptyLabel="No terminals are registered for the selected shop yet."
              exportFileName="flash-erp-terminal-licenses"
              globalFilterFn={terminalFilter}
              searchPlaceholder="Search terminals by code, key, status, or heartbeat"
            />
          </div>
        </WorkspaceTabsContent>
      </WorkspaceTabs>
    </EnterpriseShell>
  );
}
