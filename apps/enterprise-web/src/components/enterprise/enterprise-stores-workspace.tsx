"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  Boxes,
  Plus,
  RefreshCcw,
  Store,
  Waypoints,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import {
  WorkspaceTabs,
  WorkspaceTabsContent,
} from "@/components/layouts/workspace-tabs";
import type {
  CreateEnterpriseStoreRequest,
  CreateEnterpriseStoreResponse,
  EnterpriseStoresWorkspaceData,
} from "@/server/repositories/enterprise-stores.repository";

const numberFormatter = new Intl.NumberFormat("en-US");

type StoreRow = EnterpriseStoresWorkspaceData["storeRows"][number];
type StoreOperatingMode = "HYBRID" | "SALES_ONLY" | "WAREHOUSE_ONLY";
type StoreExecutionMode = "OFFLINE_FIRST" | "ONLINE_DIRECT";

function getOperatingModeLabel(mode: StoreOperatingMode) {
  if (mode === "HYBRID") {
    return "Hybrid";
  }

  return mode === "SALES_ONLY" ? "Sales only" : "Warehouse only";
}

function getOperatingModeDescription(mode: StoreOperatingMode) {
  if (mode === "HYBRID") {
    return "The desktop node can sell, receive, count, and execute stock transfers for the same site.";
  }

  return mode === "SALES_ONLY"
    ? "This site is expected to trade on POS but not act as a warehouse-led receiving node."
    : "This site is expected to receive, count, and transfer stock without POS sales expectations.";
}

function getOperatingCapabilities(mode: StoreOperatingMode) {
  return {
    salesEnabled: mode !== "WAREHOUSE_ONLY",
    warehouseEnabled: mode !== "SALES_ONLY",
  };
}

function getStoreModeLabel(mode: StoreExecutionMode) {
  return mode === "ONLINE_DIRECT" ? "Online store" : "Offline-first";
}

function getStoreModeDescription(mode: StoreExecutionMode) {
  return mode === "ONLINE_DIRECT"
    ? "Operators use the enterprise URL and the browser store workspace; activity writes directly to the HQ SQL Server database with this store attached."
    : "Operators use the Windows Store Desktop, local activity stays durable offline, and HQ receives activity through sync.";
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Store;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article className="glass-panel rounded-[1.3rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            {label}
          </p>
          <p className="mt-2 text-[1.45rem] font-semibold text-stone-950">
            {value}
          </p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] text-white shadow-[0_14px_30px_rgba(29,78,216,0.28)]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-600">{hint}</p>
    </article>
  );
}

const storeFilter: FilterFn<StoreRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "")
    .trim()
    .toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.storeName,
    row.original.storeCode,
    row.original.timezone,
    row.original.currencyCode,
    row.original.operatingModeLabel,
    row.original.storeModeLabel,
    row.original.storeGroupLabel,
    row.original.catalogPolicySummary,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

function renderTimestamp(value: string | null, label: string) {
  if (!value) {
    return "Not yet";
  }

  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-stone-800">{label}</p>
      <p className="mt-0.5 truncate text-xs text-stone-500">
        {new Date(value).toLocaleString()}
      </p>
    </div>
  );
}

export function EnterpriseStoresWorkspace({
  workspace,
}: {
  workspace: EnterpriseStoresWorkspaceData;
}) {
  const router = useRouter();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [storeCode, setStoreCode] = useState("");
  const [storeName, setStoreName] = useState("");
  const [shortName, setShortName] = useState("");
  const [timezone, setTimezone] = useState("Africa/Accra");
  const [currencyCode, setCurrencyCode] = useState(
    workspace.storeRows[0]?.currencyCode ?? "USD",
  );
  const [operatingMode, setOperatingMode] =
    useState<StoreOperatingMode>("HYBRID");
  const [storeMode, setStoreMode] =
    useState<StoreExecutionMode>("OFFLINE_FIRST");
  const [managerName, setManagerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [storeGroupName, setStoreGroupName] = useState("");
  const [storeGroupType, setStoreGroupType] = useState("REGION");
  const [touchModeEnabled, setTouchModeEnabled] = useState(true);
  const [countryCode, setCountryCode] = useState("GH");
  const [createState, setCreateState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({
    status: "idle",
    message: "",
  });

  const storeColumns = useMemo<ColumnDef<StoreRow>[]>(
    () => [
      {
        accessorKey: "storeName",
        header: "Store",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.storeName}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.storeCode} • {row.original.storeGroupLabel} •{" "}
              {row.original.operatingModeLabel}
            </p>
          </div>
        ),
        meta: {
          disableTruncate: true,
        },
      },
      {
        accessorKey: "storeGroupLabel",
        header: "Group",
      },
      {
        accessorKey: "catalogPolicySummary",
        header: "Catalog",
      },
      {
        accessorKey: "operatingModeLabel",
        header: "Mode",
      },
      {
        accessorKey: "storeModeLabel",
        header: "Execution",
      },
      {
        accessorKey: "nodeCount",
        header: "Nodes",
        cell: ({ row }) =>
          `${numberFormatter.format(row.original.nodeCount)} desktop`,
      },
      {
        accessorKey: "terminalCount",
        header: "Terminals",
        cell: ({ row }) => numberFormatter.format(row.original.terminalCount),
      },
      {
        accessorKey: "locationCount",
        header: "Locations",
        cell: ({ row }) => numberFormatter.format(row.original.locationCount),
      },
      {
        accessorKey: "postedTransactions",
        header: "Posted sales",
        cell: ({ row }) =>
          numberFormatter.format(row.original.postedTransactions),
      },
      {
        accessorKey: "projectionIssues",
        header: "Issues",
        cell: ({ row }) =>
          numberFormatter.format(row.original.projectionIssues),
      },
      {
        accessorKey: "lastSyncAtLabel",
        header: "Last sync",
        cell: ({ row }) =>
          renderTimestamp(
            row.original.lastSyncAt,
            row.original.lastSyncAtLabel,
          ),
        meta: {
          disableTruncate: true,
        },
      },
    ],
    [],
  );

  function resetCreateDialog() {
    setStoreCode("");
    setStoreName("");
    setShortName("");
    setTimezone("Africa/Accra");
    setCurrencyCode(workspace.storeRows[0]?.currencyCode ?? "USD");
    setOperatingMode("HYBRID");
    setStoreMode("OFFLINE_FIRST");
    setManagerName("");
    setPhone("");
    setEmail("");
    setLocation("");
    setAddressLine1("");
    setCity("");
    setRegion("");
    setStoreGroupName("");
    setStoreGroupType("REGION");
    setTouchModeEnabled(true);
    setCountryCode("GH");
    setCreateState({
      status: "idle",
      message: "",
    });
  }

  function handleOperatingModeChange(nextMode: StoreOperatingMode) {
    setOperatingMode(nextMode);
  }

  async function handleCreateStore() {
    const capabilities = getOperatingCapabilities(operatingMode);
    const requestBody: CreateEnterpriseStoreRequest = {
      storeCode: storeCode.trim(),
      storeName: storeName.trim(),
      shortName: shortName.trim(),
      timezone: timezone.trim(),
      currencyCode: currencyCode.trim(),
      salesEnabled: capabilities.salesEnabled,
      warehouseEnabled: capabilities.warehouseEnabled,
      storeMode,
      managerName: managerName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      location: location.trim(),
      addressLine1: addressLine1.trim(),
      city: city.trim(),
      region: region.trim(),
      storeGroupCode: (storeGroupName || region).trim(),
      storeGroupName: (storeGroupName || region).trim(),
      storeGroupType: storeGroupType.trim(),
      touchModeEnabled,
      countryCode: countryCode.trim(),
    };
    const missingFields = [
      ["store code", requestBody.storeCode],
      ["store name", requestBody.storeName],
      ["timezone", requestBody.timezone],
      ["currency code", requestBody.currencyCode],
    ]
      .filter(([, value]) => !value)
      .map(([label]) => label);

    if (missingFields.length > 0) {
      setCreateState({
        status: "error",
        message: `Complete ${missingFields.join(", ")} before saving the store.`,
      });
      return;
    }

    setCreateState({
      status: "submitting",
      message: "Flash ERP is saving the enterprise store profile.",
    });

    try {
      const response = await fetch("/api/stores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      const payload =
        (await response.json()) as Partial<CreateEnterpriseStoreResponse> & {
          message?: string;
        };

      if (!response.ok) {
        throw new Error(
          payload.message ?? "Flash ERP could not create that store.",
        );
      }

      setCreateState({
        status: "success",
        message:
          payload.message ??
          "Flash ERP saved the store profile. You can provision topology from the store workspace.",
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsCreateDialogOpen(false);
          if (payload.storeCode) {
            router.push(`/stores/${encodeURIComponent(payload.storeCode)}`);
            return;
          }

          router.refresh();
        }, 700);
      });
    } catch (error) {
      setCreateState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not create that store.",
      });
    }
  }

  return (
    <EnterpriseShell
      activeSection="master"
      description="Review store topology, desktop-node coverage, and canonical posting posture across the Flash ERP retail estate."
      eyebrow="Flash ERP enterprise"
      heading="Stores"
    >
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <ActionDialog
            description="Save the enterprise store profile first. Topology, terminals, nodes, inventory locations, and receipt settings can be added from the store workspace after the shop exists."
            onOpenChange={(nextOpen) => {
              setIsCreateDialogOpen(nextOpen);

              if (nextOpen) {
                resetCreateDialog();
              }
            }}
            open={isCreateDialogOpen}
            hideTrigger
            title="Create shop"
            triggerClassName="border-[color:var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] text-[color:var(--brand-deep)] hover:border-[color:var(--brand)] hover:text-[color:var(--brand-deep)]"
            triggerIcon={Plus}
            triggerLabel="Create shop"
            widthClassName="max-w-4xl"
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
                Flash ERP will create only the store master record here. Open
                the saved store afterward to provision its first warehouse,
                terminal, node, locations, and receipt settings when you are
                ready.
              </div>
              <WorkspaceTabs
                ariaLabel="Store creation sections"
                className="mt-0"
                defaultValue="profile"
                summaries={{
                  profile:
                    "Capture the enterprise-owned site identity, operating mode, timezone, manager, and contact posture before adding rollout topology.",
                }}
                tabs={[{ value: "profile", label: "Store profile" }]}
              >
                <WorkspaceTabsContent value="profile">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Store code
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setStoreCode(event.target.value)}
                        value={storeCode}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Store name
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setStoreName(event.target.value)}
                        value={storeName}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Short name
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setShortName(event.target.value)}
                        value={shortName}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Timezone
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setTimezone(event.target.value)}
                        value={timezone}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Currency code
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setCurrencyCode(event.target.value)
                        }
                        value={currencyCode}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Operating mode
                      </span>
                      <select
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          handleOperatingModeChange(
                            event.target.value as StoreOperatingMode,
                          )
                        }
                        value={operatingMode}
                      >
                        <option value="HYBRID">Hybrid</option>
                        <option value="SALES_ONLY">Sales only</option>
                        <option value="WAREHOUSE_ONLY">Warehouse only</option>
                      </select>
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Store execution
                      </span>
                      <select
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setStoreMode(event.target.value as StoreExecutionMode)
                        }
                        value={storeMode}
                      >
                        <option value="OFFLINE_FIRST">Offline-first desktop</option>
                        <option value="ONLINE_DIRECT">Online store</option>
                      </select>
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Manager name
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setManagerName(event.target.value)}
                        value={managerName}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Phone
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setPhone(event.target.value)}
                        value={phone}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Email
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setEmail(event.target.value)}
                        value={email}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                      <span className="block font-semibold text-stone-900">
                        Location
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setLocation(event.target.value)}
                        placeholder="Mall branch, landmark, GPS address, or area"
                        value={location}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                      <span className="block font-semibold text-stone-900">
                        Address line 1
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setAddressLine1(event.target.value)
                        }
                        value={addressLine1}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        City
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setCity(event.target.value)}
                        value={city}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Region
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setRegion(event.target.value)}
                        value={region}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Store group
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setStoreGroupName(event.target.value)
                        }
                        placeholder="Region, area, cluster, or trading zone"
                        value={storeGroupName}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Group type
                      </span>
                      <select
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setStoreGroupType(event.target.value)
                        }
                        value={storeGroupType}
                      >
                        <option value="REGION">Region</option>
                        <option value="AREA">Area</option>
                        <option value="CITY">City</option>
                        <option value="FRANCHISE">Franchise</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                      <span className="font-semibold text-stone-900">
                        Touch optimized
                      </span>
                      <input
                        checked={touchModeEnabled}
                        onChange={(event) =>
                          setTouchModeEnabled(event.target.checked)
                        }
                        type="checkbox"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Country code
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setCountryCode(event.target.value)}
                        value={countryCode}
                      />
                    </label>
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700 md:col-span-2">
                      <p className="font-semibold text-stone-900">
                        {getOperatingModeLabel(operatingMode)}
                      </p>
                      <p className="mt-1">
                        {getOperatingModeDescription(operatingMode)}
                      </p>
                      <p className="mt-3 font-semibold text-stone-900">
                        {getStoreModeLabel(storeMode)}
                      </p>
                      <p className="mt-1">{getStoreModeDescription(storeMode)}</p>
                    </div>
                  </div>
                </WorkspaceTabsContent>
              </WorkspaceTabs>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={createState.status === "submitting"}
                  onClick={() => setIsCreateDialogOpen(false)}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03] disabled:cursor-wait disabled:opacity-70"
                  disabled={createState.status === "submitting"}
                  onClick={() => void handleCreateStore()}
                  type="button"
                >
                  {createState.status === "submitting"
                    ? "Saving..."
                    : "Save store"}
                </button>
              </div>
              {createState.message ? (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${createState.status === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                >
                  {createState.message}
                </div>
              ) : null}
            </div>
          </ActionDialog>
        </div>

        <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-700">
          Last refresh {new Date(workspace.refreshedAt).toLocaleString()}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          hint="Active store profiles currently saved in Flash ERP enterprise."
          icon={Store}
          label="Active stores"
          value={numberFormatter.format(workspace.metrics.activeStores)}
        />
        <MetricCard
          hint="Desktop sync nodes currently attached across the store estate."
          icon={RefreshCcw}
          label="Desktop nodes"
          value={numberFormatter.format(workspace.metrics.desktopNodes)}
        />
        <MetricCard
          hint="Store terminals currently registered for Flash ERP retail operations."
          icon={Waypoints}
          label="Terminals"
          value={numberFormatter.format(workspace.metrics.terminals)}
        />
        <MetricCard
          hint="Inventory locations currently visible across the enterprise store topology."
          icon={Boxes}
          label="Locations"
          value={numberFormatter.format(workspace.metrics.inventoryLocations)}
        />
      </section>

      <WorkspaceTabs
        ariaLabel="Enterprise store views"
        defaultValue="estate"
        summaries={{
          estate:
            "Review live store coverage, topology counts, and posting posture across the estate.",
          posture:
            "See where rollout is healthy, where canonical posting is still silent, and which stores need operator attention next.",
        }}
        tabs={[
          {
            value: "estate",
            label: "Store estate",
            badge: "Live",
            badgeTone: "success",
          },
          { value: "posture", label: "Posture" },
        ]}
      >
        <WorkspaceTabsContent value="estate">
          <SharedDataGrid
            columns={storeColumns}
            data={workspace.storeRows}
            emptyLabel="No stores are saved in Flash ERP enterprise yet."
            exportFileName="flash-erp-store-estate"
            getRowHref={(row) => `/stores/${encodeURIComponent(row.storeCode)}`}
            globalFilterFn={storeFilter}
            searchPlaceholder="Search stores by name, code, mode, timezone, or currency"
            toolbarActions={
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[color:var(--brand)] hover:text-[color:var(--brand-deep)]"
                onClick={() => {
                  resetCreateDialog();
                  setIsCreateDialogOpen(true);
                }}
                type="button"
              >
                <Plus className="h-4 w-4" />
                Create shop
              </button>
            }
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="posture">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,1fr)]">
            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Estate coverage
                </p>
                <div className="mt-4 space-y-3">
                  {workspace.coverageMessages.map((message) => (
                    <div
                      className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800"
                      key={message}
                    >
                      {message}
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <article className="glass-panel rounded-[1.35rem] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                    Immediate priorities
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Last refreshed{" "}
                    {new Date(workspace.refreshedAt).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-full border border-stone-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-600">
                  Stores
                </div>
              </div>
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
        </WorkspaceTabsContent>
      </WorkspaceTabs>

      <section className="glass-panel rounded-[1.4rem] p-5">
        <p className="text-sm leading-6 text-stone-600">
          {workspace.statusMessage}
        </p>
      </section>
    </EnterpriseShell>
  );
}
