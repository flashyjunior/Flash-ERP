"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { PublishStoreLocationsResponse } from "@flash-erp/sync-core";
import {
  Activity,
  ArrowLeft,
  Boxes,
  RefreshCcw,
  Store,
  Waypoints,
} from "lucide-react";
import Link from "next/link";
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
  EnterpriseStoreDetailData,
  ProvisionEnterpriseStoreResponse,
  UpdateEnterpriseStoreResponse,
} from "@/server/repositories/enterprise-stores.repository";

const numberFormatter = new Intl.NumberFormat("en-US");

type NodeRow = EnterpriseStoreDetailData["nodeRows"][number];
type TransactionRow = EnterpriseStoreDetailData["recentTransactions"][number];
type InventoryRow = EnterpriseStoreDetailData["recentInventoryRows"][number];
type LocationRow = EnterpriseStoreDetailData["locationRows"][number];
type StoreOperatingMode = "HYBRID" | "SALES_ONLY" | "WAREHOUSE_ONLY";
type StoreExecutionMode = "OFFLINE_FIRST" | "ONLINE_DIRECT";
const legacyReceiptTemplateSelectionValue = "__LEGACY__";
const warehouseNameOptions = [
  "Main Warehouse",
  "Backroom Reserve",
  "Sales Floor Reserve",
  "Returns Holding",
  "Transit Staging",
] as const;
const locationTypeOptions = [
  "STORE_FLOOR",
  "BACKROOM",
  "WAREHOUSE",
  "RETURNS",
  "HOLD",
  "TRANSIT",
] as const;
type LocationTypeOption = (typeof locationTypeOptions)[number];

function normalizeLocationTypeOption(value: string | null | undefined): LocationTypeOption {
  const normalized = value?.trim().toUpperCase().replace(/[\s-]+/g, "_") ?? "";
  const aliased = normalized === "STORE" ? "STORE_FLOOR" : normalized;

  return locationTypeOptions.includes(aliased as LocationTypeOption)
    ? (aliased as LocationTypeOption)
    : "STORE_FLOOR";
}

function getCodeSegment(value: string) {
  const segment = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return segment || "store";
}

function getSuggestedTopology(
  nextStoreCode: string,
  nextStoreName: string,
  mode: StoreOperatingMode,
) {
  const codeBase = getCodeSegment(nextStoreCode || nextStoreName);
  const displayName =
    nextStoreName.trim() || nextStoreCode.trim() || "New store";
  const isWarehouseOnly = mode === "WAREHOUSE_ONLY";

  return {
    warehouseCode: `${codeBase}-main`,
    warehouseName: warehouseNameOptions[0],
    terminalCode: isWarehouseOnly ? "ops-01" : "front-01",
    terminalName: isWarehouseOnly ? "Warehouse Desk 01" : "Front Counter 01",
    nodeCode: `${codeBase}-${isWarehouseOnly ? "ops" : "pos"}-01`,
    nodeName: `${displayName} ${isWarehouseOnly ? "Ops" : "POS"} 01`,
    locationCode: `${codeBase}-${isWarehouseOnly ? "warehouse" : "floor"}`,
    locationName: `${displayName} ${isWarehouseOnly ? "Warehouse" : "Sales Floor"}`,
    locationType: isWarehouseOnly ? "WAREHOUSE" : "STORE_FLOOR",
  };
}

function getOperatingModeFromCapabilities(
  salesEnabled: boolean,
  warehouseEnabled: boolean,
): StoreOperatingMode {
  if (salesEnabled && warehouseEnabled) {
    return "HYBRID";
  }

  return salesEnabled ? "SALES_ONLY" : "WAREHOUSE_ONLY";
}

function getOperatingModeDescription(mode: StoreOperatingMode) {
  if (mode === "HYBRID") {
    return "This site can trade on POS while also acting as a receiving and stock-control node.";
  }

  return mode === "SALES_ONLY"
    ? "This site is expected to sell on POS without warehouse-led receiving posture."
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
    ? "Operators assigned to this store use the enterprise URL and browser store workspace. Store activity writes directly to the HQ SQL Server database and bypasses sync."
    : "Operators use the installed Store Desktop. Activity is durable locally and reaches HQ through store sync.";
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

function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "healthy" || value === "HEALTHY"
      ? "bg-emerald-100 text-emerald-700"
      : value === "attention" || value === "ATTENTION"
        ? "bg-rose-100 text-rose-700"
        : "bg-sky-100 text-sky-700";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      {value
        .toLowerCase()
        .split("_")
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ")}
    </span>
  );
}

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

export function EnterpriseStoreDetail({
  detail,
}: {
  detail: EnterpriseStoreDetailData;
}) {
  const router = useRouter();
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: detail.currencyCode,
      }),
    [detail.currencyCode],
  );
  const [isPublishLocationsOpen, setIsPublishLocationsOpen] = useState(false);
  const [isEditStoreOpen, setIsEditStoreOpen] = useState(false);
  const [isProvisionTopologyOpen, setIsProvisionTopologyOpen] = useState(false);
  const [isLocationSetupOpen, setIsLocationSetupOpen] = useState(false);
  const [isDatabaseInstructionOpen, setIsDatabaseInstructionOpen] =
    useState(false);
  const [storeName, setStoreName] = useState(detail.store.name);
  const [shortName, setShortName] = useState(detail.store.shortName ?? "");
  const [timezone, setTimezone] = useState(detail.store.timezone);
  const [currencyCode, setCurrencyCode] = useState(detail.store.currencyCode);
  const [operatingMode, setOperatingMode] = useState<StoreOperatingMode>(
    getOperatingModeFromCapabilities(
      detail.store.salesEnabled,
      detail.store.warehouseEnabled,
    ),
  );
  const [storeMode, setStoreMode] = useState<StoreExecutionMode>(
    detail.store.storeMode === "ONLINE_DIRECT" ? "ONLINE_DIRECT" : "OFFLINE_FIRST",
  );
  const [status, setStatus] = useState(detail.store.status);
  const [managerName, setManagerName] = useState(
    detail.store.managerName ?? "",
  );
  const [phone, setPhone] = useState(detail.store.phone ?? "");
  const [email, setEmail] = useState(detail.store.email ?? "");
  const [location, setLocation] = useState(detail.store.location ?? "");
  const [addressLine1, setAddressLine1] = useState(
    detail.store.addressLine1 ?? "",
  );
  const [addressLine2, setAddressLine2] = useState(
    detail.store.addressLine2 ?? "",
  );
  const [city, setCity] = useState(detail.store.city ?? "");
  const [region, setRegion] = useState(detail.store.region ?? "");
  const [storeGroupName, setStoreGroupName] = useState(
    detail.store.storeGroupName ?? "",
  );
  const [storeGroupType, setStoreGroupType] = useState(
    detail.store.storeGroupType ?? "REGION",
  );
  const [touchModeEnabled, setTouchModeEnabled] = useState(
    detail.store.touchModeEnabled,
  );
  const [countryCode, setCountryCode] = useState(
    detail.store.countryCode ?? "GH",
  );
  const [postalCode, setPostalCode] = useState(detail.store.postalCode ?? "");
  const [taxRegistrationNo, setTaxRegistrationNo] = useState(
    detail.store.taxRegistrationNo ?? "",
  );
  const [receiptHeader, setReceiptHeader] = useState(
    detail.store.receiptHeader ?? "",
  );
  const [receiptFooter, setReceiptFooter] = useState(
    detail.store.receiptFooter ?? "",
  );
  const [receiptTemplateSelection, setReceiptTemplateSelection] = useState(
    detail.store.receiptTemplateMode === "linked"
      ? (detail.store.receiptTemplateCode ?? "")
      : detail.store.receiptTemplateMode === "legacy"
        ? legacyReceiptTemplateSelectionValue
        : "",
  );
  const [openedOn, setOpenedOn] = useState(
    detail.store.openedOn ? detail.store.openedOn.slice(0, 10) : "",
  );
  const [warehouseCode, setWarehouseCode] = useState("");
  const [warehouseName, setWarehouseName] = useState<string>(
    warehouseNameOptions[0],
  );
  const [terminalCode, setTerminalCode] = useState("");
  const [terminalName, setTerminalName] = useState("");
  const [nodeCode, setNodeCode] = useState("");
  const [nodeName, setNodeName] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationType, setLocationType] = useState("STORE_FLOOR");
  const [editingLocationCode, setEditingLocationCode] = useState<string | null>(
    null,
  );
  const [locationFormCode, setLocationFormCode] = useState("");
  const [locationFormName, setLocationFormName] = useState("");
  const [locationFormType, setLocationFormType] = useState("STORE_FLOOR");
  const [locationFormWarehouseCode, setLocationFormWarehouseCode] =
    useState("");
  const [locationFormStatus, setLocationFormStatus] = useState("ACTIVE");
  const [locationFormSalesDefault, setLocationFormSalesDefault] =
    useState(false);
  const [locationFormSalesOrderDefault, setLocationFormSalesOrderDefault] =
    useState(false);
  const [locationFormReceivingDefault, setLocationFormReceivingDefault] =
    useState(false);
  const [publishOperatorName, setPublishOperatorName] =
    useState("Flash ERP operator");
  const [publishNote, setPublishNote] = useState(
    `Publishing inventory location topology for ${detail.store.name} from the Flash ERP enterprise workspace.`,
  );
  const [databaseInstructionType, setDatabaseInstructionType] =
    useState("SYNC_NOW");
  const [databaseInstructionPriority, setDatabaseInstructionPriority] =
    useState("NORMAL");
  const [databaseInstructionTarget, setDatabaseInstructionTarget] =
    useState("");
  const [databaseInstructionNote, setDatabaseInstructionNote] = useState(
    `Database administration instruction for ${detail.store.name}.`,
  );
  const [publishState, setPublishState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string | null;
  }>({
    status: "idle",
    message: null,
  });
  const [editStoreState, setEditStoreState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string | null;
  }>({
    status: "idle",
    message: null,
  });
  const [provisionState, setProvisionState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string | null;
  }>({
    status: "idle",
    message: null,
  });
  const [locationSetupState, setLocationSetupState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string | null;
  }>({
    status: "idle",
    message: null,
  });
  const [databaseInstructionState, setDatabaseInstructionState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string | null;
  }>({
    status: "idle",
    message: null,
  });
  const storeGroupOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            detail.store.storeGroupName,
            detail.store.storeGroupCode,
            detail.store.region,
            ...detail.storeGroupOptions,
          ]
            .map((value) => value?.trim() ?? "")
            .filter((value) => value && value !== "Ungrouped"),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [detail.store.region, detail.store.storeGroupCode, detail.store.storeGroupName, detail.storeGroupOptions],
  );
  const receiptTemplateOptions = useMemo(() => {
    const options = [
      {
        value: "",
        label: "Flash ERP built-in thermal slip",
      },
    ];

    if (detail.store.receiptTemplateMode === "legacy") {
      options.push({
        value: legacyReceiptTemplateSelectionValue,
        label: "Keep current legacy store template",
      });
    }

    options.push(
      ...detail.availableReceiptTemplates.map((template) => ({
        value: template.receiptTemplateCode,
        label: template.isDefault
          ? `${template.name} (${template.receiptTemplateCode}) • Default`
          : `${template.name} (${template.receiptTemplateCode})`,
      })),
    );

    return options;
  }, [detail.availableReceiptTemplates, detail.store.receiptTemplateMode]);
  const primaryNode = detail.nodeRows[0] ?? null;
  const isOnlineDirectStore = detail.store.storeMode === "ONLINE_DIRECT";
  const shouldShowProvisionTopology = !isOnlineDirectStore && !primaryNode;
  const canPublishLocations = Boolean(primaryNode) || isOnlineDirectStore;
  const locationPublishTargetLabel =
    primaryNode?.nodeCode ?? "Online store (enterprise direct)";
  const topologyRequiredTitle =
    "Provision topology first to create the primary desktop sync node for this shop.";
  const locationPublishDescription = primaryNode
    ? "Queue a fresh inventory-location publication set for the store desktop so Flash ERP can hydrate local location topology from enterprise."
    : isOnlineDirectStore
      ? "Confirm the active inventory-location topology for the online store. Online shops read these locations directly from enterprise."
      : topologyRequiredTitle;

  const nodeColumns = useMemo<ColumnDef<NodeRow>[]>(
    () => [
      {
        accessorKey: "nodeName",
        header: "Node",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.nodeName}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.nodeCode}
              {row.original.terminalCode
                ? ` • ${row.original.terminalCode}`
                : ""}
            </p>
          </div>
        ),
        meta: { disableTruncate: true },
      },
      {
        accessorKey: "health",
        header: "Health",
        cell: ({ row }) =>
          row.original.health ? (
            <StatusBadge value={row.original.health} />
          ) : (
            "Not reported"
          ),
        meta: { disableTruncate: true },
      },
      {
        accessorKey: "upstreamQueued",
        header: "Upstream",
        cell: ({ row }) => numberFormatter.format(row.original.upstreamQueued),
      },
      {
        accessorKey: "downstreamQueued",
        header: "Downstream",
        cell: ({ row }) =>
          numberFormatter.format(row.original.downstreamQueued),
      },
      {
        accessorKey: "deadLetter",
        header: "Dead-letter",
        cell: ({ row }) => numberFormatter.format(row.original.deadLetter),
      },
      {
        accessorKey: "lastSyncAtLabel",
        header: "Last sync",
        cell: ({ row }) =>
          renderTimestamp(
            row.original.lastSyncAt,
            row.original.lastSyncAtLabel,
          ),
        meta: { disableTruncate: true },
      },
    ],
    [],
  );

  const transactionColumns = useMemo<ColumnDef<TransactionRow>[]>(
    () => [
      {
        accessorKey: "transactionNo",
        header: "Transaction",
      },
      {
        accessorKey: "totalAmount",
        header: "Total",
        cell: ({ row }) => currencyFormatter.format(row.original.totalAmount),
      },
      {
        accessorKey: "completedAtLabel",
        header: "Completed",
        cell: ({ row }) =>
          renderTimestamp(
            row.original.completedAt,
            row.original.completedAtLabel,
          ),
        meta: { disableTruncate: true },
      },
    ],
    [currencyFormatter],
  );

  const inventoryColumns = useMemo<ColumnDef<InventoryRow>[]>(
    () => [
      {
        accessorKey: "productName",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.productName}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.productCode}
            </p>
          </div>
        ),
        meta: { disableTruncate: true },
      },
      {
        accessorKey: "movementType",
        header: "Movement",
      },
      {
        accessorKey: "quantity",
        header: "Quantity",
        cell: ({ row }) => numberFormatter.format(row.original.quantity),
      },
      {
        accessorKey: "occurredAtLabel",
        header: "Occurred",
        cell: ({ row }) =>
          renderTimestamp(
            row.original.occurredAt,
            row.original.occurredAtLabel,
          ),
        meta: { disableTruncate: true },
      },
    ],
    [],
  );

  function resetProvisionTopologyDialog() {
    const suggestedTopology = getSuggestedTopology(
      detail.store.code,
      detail.store.name,
      getOperatingModeFromCapabilities(
        detail.store.salesEnabled,
        detail.store.warehouseEnabled,
      ),
    );

    setWarehouseCode(suggestedTopology.warehouseCode);
    setWarehouseName(suggestedTopology.warehouseName);
    setTerminalCode(suggestedTopology.terminalCode);
    setTerminalName(suggestedTopology.terminalName);
    setNodeCode(suggestedTopology.nodeCode);
    setNodeName(suggestedTopology.nodeName);
    setLocationCode(suggestedTopology.locationCode);
    setLocationName(suggestedTopology.locationName);
    setLocationType(suggestedTopology.locationType);
    setProvisionState({
      status: "idle",
      message: null,
    });
  }

  function applySuggestedTopology() {
    resetProvisionTopologyDialog();
  }

  function openLocationSetupDialog(location?: LocationRow) {
    const suggested = getSuggestedTopology(
      detail.store.code,
      detail.store.name,
      getOperatingModeFromCapabilities(
        detail.store.salesEnabled,
        detail.store.warehouseEnabled,
      ),
    );

    setEditingLocationCode(location?.locationCode ?? null);
    setLocationFormCode(location?.locationCode ?? suggested.locationCode);
    setLocationFormName(location?.locationName ?? suggested.locationName);
    setLocationFormType(
      normalizeLocationTypeOption(location?.locationType ?? suggested.locationType),
    );
    setLocationFormWarehouseCode(location?.warehouseCode ?? "");
    setLocationFormStatus(location?.status ?? "ACTIVE");
    setLocationFormSalesDefault(location?.useForSalesDefault ?? detail.store.salesEnabled);
    setLocationFormSalesOrderDefault(
      location?.useForSalesOrderDefault ?? detail.store.salesEnabled,
    );
    setLocationFormReceivingDefault(
      location?.useForReceivingDefault ?? detail.store.warehouseEnabled,
    );
    setLocationSetupState({
      status: "idle",
      message: null,
    });
    setIsLocationSetupOpen(true);
  }

  async function handleSaveInventoryLocation() {
    const requestBody = {
      locationCode: locationFormCode.trim(),
      originalLocationCode: editingLocationCode,
      locationName: locationFormName.trim(),
      locationType: normalizeLocationTypeOption(locationFormType),
      warehouseCode: locationFormWarehouseCode.trim() || null,
      status: locationFormStatus,
      useForSalesDefault: locationFormSalesDefault,
      useForSalesOrderDefault: locationFormSalesOrderDefault,
      useForReceivingDefault: locationFormReceivingDefault,
      operatorName: publishOperatorName,
    };

    if (!requestBody.locationCode || !requestBody.locationName) {
      setLocationSetupState({
        status: "error",
        message: "Enter a location code and name before saving.",
      });
      return;
    }

    setLocationSetupState({
      status: "submitting",
      message: "Flash ERP is saving the inventory location and publishing store topology.",
    });

    try {
      const response = await fetch(
        `/api/stores/${encodeURIComponent(detail.store.code)}/inventory-locations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
      );
      const payload = (await response.json()) as {
        message?: string;
        publishMessage?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.message ?? "Flash ERP could not save that inventory location.",
        );
      }

      setLocationSetupState({
        status: "success",
        message: [payload.message, payload.publishMessage].filter(Boolean).join(" "),
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsLocationSetupOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setLocationSetupState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save that inventory location.",
      });
    }
  }

  async function handleProvisionTopology() {
    const requestBody = {
      primaryWarehouseCode: warehouseCode.trim(),
      primaryWarehouseName: warehouseName.trim(),
      primaryTerminalCode: terminalCode.trim(),
      primaryTerminalName: terminalName.trim(),
      primaryNodeCode: nodeCode.trim(),
      primaryNodeName: nodeName.trim(),
      primaryLocationCode: locationCode.trim(),
      primaryLocationName: locationName.trim(),
      primaryLocationType: locationType.trim(),
    };
    const missingFields = [
      ["primary warehouse code", requestBody.primaryWarehouseCode],
      ["primary warehouse name", requestBody.primaryWarehouseName],
      ["primary terminal code", requestBody.primaryTerminalCode],
      ["primary terminal name", requestBody.primaryTerminalName],
      ["primary node code", requestBody.primaryNodeCode],
      ["primary node name", requestBody.primaryNodeName],
      ["primary location code", requestBody.primaryLocationCode],
      ["primary location name", requestBody.primaryLocationName],
    ]
      .filter(([, value]) => !value)
      .map(([label]) => label);

    if (missingFields.length > 0) {
      setProvisionState({
        status: "error",
        message: `Complete ${missingFields.join(", ")} before provisioning topology.`,
      });
      return;
    }

    setProvisionState({
      status: "submitting",
      message: "Flash ERP is provisioning the store topology.",
    });

    try {
      const response = await fetch(
        `/api/stores/${encodeURIComponent(detail.store.code)}/provision`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
      );
      const payload =
        (await response.json()) as Partial<ProvisionEnterpriseStoreResponse> & {
          message?: string;
        };

      if (!response.ok) {
        throw new Error(
          payload.message ??
            "Flash ERP could not provision that store topology.",
        );
      }

      setProvisionState({
        status: "success",
        message:
          payload.message ??
          "Flash ERP provisioned the store topology and activated the primary node.",
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsProvisionTopologyOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setProvisionState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not provision that store topology.",
      });
    }
  }

  async function handlePublishLocations() {
    setPublishState({
      status: "submitting",
      message:
        "Flash ERP is queuing downstream location publication packets for the store desktop.",
    });

    try {
      const response = await fetch(
        `/api/stores/${encodeURIComponent(detail.store.code)}/publish-locations`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            operatorName: publishOperatorName,
            note: publishNote,
          }),
        },
      );
      const payload = (await response.json()) as
        | PublishStoreLocationsResponse
        | {
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Flash ERP could not queue the location publication packets.",
        );
      }

      const actionPayload = payload as PublishStoreLocationsResponse;
      setPublishState({
        status: "success",
        message: actionPayload.message,
      });

      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setPublishState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not queue the location publication packets.",
      });
    }
  }

  async function handleQueueDatabaseInstruction() {
    const primaryNode = detail.nodeRows[0];

    if (!primaryNode) {
      return;
    }

    setDatabaseInstructionState({
      status: "submitting",
      message:
        "Flash ERP is queueing the database instruction for the store desktop.",
    });

    try {
      const response = await fetch(
        `/api/sync/store-nodes/${encodeURIComponent(primaryNode.nodeCode)}/database-instructions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            instructionType: databaseInstructionType,
            priority: databaseInstructionPriority,
            target: databaseInstructionTarget.trim() || null,
            note: databaseInstructionNote.trim(),
          }),
        },
      );
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(
          payload.message ??
            "Flash ERP could not queue that database instruction.",
        );
      }

      setDatabaseInstructionState({
        status: "success",
        message:
          payload.message ?? "Flash ERP queued the database instruction.",
      });

      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setDatabaseInstructionState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not queue that database instruction.",
      });
    }
  }

  async function handleUpdateStore() {
    setEditStoreState({
      status: "submitting",
      message: "Flash ERP is updating the enterprise store profile.",
    });

    try {
      const response = await fetch(
        `/api/stores/${encodeURIComponent(detail.store.code)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            storeName,
            shortName,
            timezone,
            currencyCode,
            ...getOperatingCapabilities(operatingMode),
            storeMode,
            status,
            managerName,
            phone,
            email,
            location,
            addressLine1,
            addressLine2,
            city,
            region,
            storeGroupCode: (storeGroupName || region).trim(),
            storeGroupName,
            storeGroupType,
            touchModeEnabled,
            countryCode,
            postalCode,
            taxRegistrationNo,
            receiptHeader,
            receiptFooter,
            salesReceiptTemplateCode:
              receiptTemplateSelection &&
              receiptTemplateSelection !== legacyReceiptTemplateSelectionValue
                ? receiptTemplateSelection
                : null,
            retainLegacyReceiptTemplate:
              receiptTemplateSelection === legacyReceiptTemplateSelectionValue,
            openedOn: openedOn.trim() ? openedOn : null,
          }),
        },
      );
      const payload =
        (await response.json()) as Partial<UpdateEnterpriseStoreResponse> & {
          message?: string;
        };

      if (!response.ok) {
        throw new Error(
          payload.message ?? "Flash ERP could not update that store.",
        );
      }

      setEditStoreState({
        status: "success",
        message:
          payload.message ??
          "Flash ERP updated the enterprise store profile and operating posture.",
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsEditStoreOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setEditStoreState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update that store.",
      });
    }
  }

  return (
    <EnterpriseShell
      activeSection="master"
      description={`Inspect store topology, desktop-node posture, and canonical retail activity for ${detail.store.name}.`}
      eyebrow={`Flash ERP enterprise • ${detail.store.code}`}
      heading={detail.store.name}
    >
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
            href="/stores"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to stores
          </Link>
          <ActionDialog
            description="Update the enterprise-owned store profile, operating mode, contact posture, and receipt metadata for this site."
            onOpenChange={(nextOpen) => {
              setIsEditStoreOpen(nextOpen);

              if (nextOpen) {
                setStoreName(detail.store.name);
                setShortName(detail.store.shortName ?? "");
                setTimezone(detail.store.timezone);
                setCurrencyCode(detail.store.currencyCode);
                setOperatingMode(
                  getOperatingModeFromCapabilities(
                    detail.store.salesEnabled,
                    detail.store.warehouseEnabled,
                  ),
                );
                setStoreMode(
                  detail.store.storeMode === "ONLINE_DIRECT"
                    ? "ONLINE_DIRECT"
                    : "OFFLINE_FIRST",
                );
                setStatus(detail.store.status);
                setManagerName(detail.store.managerName ?? "");
                setPhone(detail.store.phone ?? "");
                setEmail(detail.store.email ?? "");
                setLocation(detail.store.location ?? "");
                setAddressLine1(detail.store.addressLine1 ?? "");
                setAddressLine2(detail.store.addressLine2 ?? "");
                setCity(detail.store.city ?? "");
                setRegion(detail.store.region ?? "");
                setStoreGroupName(detail.store.storeGroupName ?? "");
                setStoreGroupType(detail.store.storeGroupType ?? "REGION");
                setTouchModeEnabled(detail.store.touchModeEnabled);
                setCountryCode(detail.store.countryCode ?? "GH");
                setPostalCode(detail.store.postalCode ?? "");
                setTaxRegistrationNo(detail.store.taxRegistrationNo ?? "");
                setReceiptHeader(detail.store.receiptHeader ?? "");
                setReceiptFooter(detail.store.receiptFooter ?? "");
                setReceiptTemplateSelection(
                  detail.store.receiptTemplateMode === "linked"
                    ? (detail.store.receiptTemplateCode ?? "")
                    : detail.store.receiptTemplateMode === "legacy"
                      ? legacyReceiptTemplateSelectionValue
                      : "",
                );
                setOpenedOn(
                  detail.store.openedOn
                    ? detail.store.openedOn.slice(0, 10)
                    : "",
                );
                setEditStoreState({
                  status: "idle",
                  message: null,
                });
              }
            }}
            open={isEditStoreOpen}
            title="Edit store profile"
            triggerClassName="border-stone-300 bg-white text-stone-800 hover:border-stone-400 hover:text-stone-950"
            triggerLabel="Edit store"
            widthClassName="max-w-4xl"
          >
            <div className="space-y-4">
              <WorkspaceTabs
                ariaLabel="Store profile sections"
                className="mt-0"
                defaultValue="profile"
                summaries={{
                  profile:
                    "Update the enterprise-owned site identity, operating mode, trading status, and day-to-day contact posture.",
                  operations:
                    "Maintain address, tax registration, and receipt messaging that syncs to store operations.",
                }}
                tabs={[
                  { value: "profile", label: "Store profile" },
                  { value: "operations", label: "Operations & receipts" },
                ]}
              >
                <WorkspaceTabsContent value="profile">
                  <div className="grid gap-4 md:grid-cols-2">
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
                          setOperatingMode(
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
                        Status
                      </span>
                      <select
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setStatus(event.target.value)}
                        value={status}
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="INACTIVE">INACTIVE</option>
                        <option value="ARCHIVED">ARCHIVED</option>
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
                        Opened on
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setOpenedOn(event.target.value)}
                        type="date"
                        value={openedOn}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Store group
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        list="enterprise-store-detail-group-options"
                        onChange={(event) =>
                          setStoreGroupName(event.target.value)
                        }
                        value={storeGroupName}
                      />
                      <datalist id="enterprise-store-detail-group-options">
                        {storeGroupOptions.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
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
                    <label className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 md:col-span-2">
                      <span className="font-semibold text-stone-900">
                        Touch optimized desktop
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
                    <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
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
                        placeholder="Mall branch, roadside landmark, GPS address, or area"
                        value={location}
                      />
                    </label>
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700 md:col-span-2">
                      <p className="font-semibold text-stone-900">
                        {operatingMode === "HYBRID"
                          ? "Hybrid"
                          : operatingMode === "SALES_ONLY"
                            ? "Sales only"
                            : "Warehouse only"}
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

                <WorkspaceTabsContent value="operations">
                  <div className="grid gap-4 md:grid-cols-2">
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
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Postal code
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setPostalCode(event.target.value)}
                        value={postalCode}
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
                    <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                      <span className="block font-semibold text-stone-900">
                        Address line 2
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setAddressLine2(event.target.value)
                        }
                        value={addressLine2}
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
                    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm leading-6 text-indigo-900 md:col-span-2">
                      <p className="font-semibold text-indigo-950">
                        Catalog assignment is managed centrally
                      </p>
                      <p className="mt-1">
                        Linked catalogs for this store are maintained from the
                        Catalog workspace, then sent down through shop sync.
                        Current assignment: {detail.store.catalogPolicySummary}.
                      </p>
                    </div>
                    <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                      <span className="block font-semibold text-stone-900">
                        Tax registration number
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setTaxRegistrationNo(event.target.value)
                        }
                        value={taxRegistrationNo}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                      <span className="block font-semibold text-stone-900">
                        Receipt header
                      </span>
                      <textarea
                        className="min-h-24 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setReceiptHeader(event.target.value)
                        }
                        value={receiptHeader}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                      <span className="block font-semibold text-stone-900">
                        Receipt footer
                      </span>
                      <textarea
                        className="min-h-24 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setReceiptFooter(event.target.value)
                        }
                        value={receiptFooter}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                      <span className="block font-semibold text-stone-900">
                        Linked thermal receipt template
                      </span>
                      <select
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setReceiptTemplateSelection(event.target.value)
                        }
                        value={receiptTemplateSelection}
                      >
                        {receiptTemplateOptions.map((option) => (
                          <option
                            key={option.value || "default"}
                            value={option.value}
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900 md:col-span-2">
                      <p className="font-semibold text-sky-950">
                        Receipt design is now managed centrally
                      </p>
                      <p className="mt-1">
                        Design or modify thermal receipt templates from the
                        dedicated Settings workspace, then link the selected
                        template to this store here.
                      </p>
                      <div className="mt-3">
                        <Link
                          className="inline-flex items-center gap-2 rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-900 transition hover:border-sky-400 hover:text-sky-950"
                          href="/settings/receipt-templates"
                        >
                          Open receipt template designer
                        </Link>
                      </div>
                    </div>
                  </div>
                </WorkspaceTabsContent>
              </WorkspaceTabs>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                  disabled={editStoreState.status === "submitting"}
                  onClick={() => setIsEditStoreOpen(false)}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
                  disabled={
                    editStoreState.status === "submitting" || !storeName.trim()
                  }
                  onClick={() => void handleUpdateStore()}
                  type="button"
                >
                  {editStoreState.status === "submitting"
                    ? "Saving..."
                    : "Save store"}
                </button>
              </div>
              {editStoreState.message ? (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${editStoreState.status === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                >
                  {editStoreState.message}
                </div>
              ) : null}
            </div>
          </ActionDialog>
          {shouldShowProvisionTopology ? (
            <ActionDialog
              description="Create or complete the primary warehouse, terminal, desktop sync node, and operating inventory location for this saved store."
              onOpenChange={(nextOpen) => {
                setIsProvisionTopologyOpen(nextOpen);

                if (nextOpen) {
                  resetProvisionTopologyDialog();
                }
              }}
              open={isProvisionTopologyOpen}
              title="Provision topology"
              triggerClassName="border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-400 hover:text-emerald-950"
              triggerLabel="Provision topology"
              widthClassName="max-w-4xl"
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
                  <span>
                    Flash ERP will attach or complete the primary warehouse,
                    terminal, desktop node, and inventory location for{" "}
                    {detail.store.name}.
                  </span>
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 transition hover:border-emerald-400 hover:text-emerald-950"
                    onClick={applySuggestedTopology}
                    type="button"
                  >
                    Use suggested topology
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">
                      Primary warehouse code
                    </span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setWarehouseCode(event.target.value)}
                      value={warehouseCode}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">
                      Primary warehouse name
                    </span>
                    <select
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setWarehouseName(event.target.value)}
                      value={warehouseName}
                    >
                      {warehouseNameOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">
                      Primary terminal code
                    </span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setTerminalCode(event.target.value)}
                      value={terminalCode}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">
                      Primary terminal name
                    </span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setTerminalName(event.target.value)}
                      value={terminalName}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">
                      Primary node code
                    </span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setNodeCode(event.target.value)}
                      value={nodeCode}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">
                      Primary node name
                    </span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setNodeName(event.target.value)}
                      value={nodeName}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">
                      Primary location code
                    </span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setLocationCode(event.target.value)}
                      value={locationCode}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">
                      Primary location name
                    </span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setLocationName(event.target.value)}
                      value={locationName}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                    <span className="block font-semibold text-stone-900">
                      Location type
                    </span>
                    <select
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setLocationType(event.target.value)}
                      value={locationType}
                    >
                      {locationTypeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    disabled={provisionState.status === "submitting"}
                    onClick={() => setIsProvisionTopologyOpen(false)}
                    type="button"
                  >
                    Close
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#059669,#047857)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(4,120,87,0.22)] transition hover:brightness-[1.03]"
                    disabled={provisionState.status === "submitting"}
                    onClick={() => void handleProvisionTopology()}
                    type="button"
                  >
                    {provisionState.status === "submitting"
                      ? "Provisioning..."
                      : "Provision topology"}
                  </button>
                </div>
                {provisionState.message ? (
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${provisionState.status === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                  >
                    {provisionState.message}
                  </div>
                ) : null}
              </div>
            </ActionDialog>
          ) : null}
          {primaryNode ? (
            <Link
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
              href={`/sync/nodes/${primaryNode.nodeCode}`}
            >
              Open primary node
            </Link>
          ) : (
            <button
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-400"
              disabled
              title={topologyRequiredTitle}
              type="button"
            >
              Open primary node
            </button>
          )}
          {primaryNode ? (
            <ActionDialog
              description="Send a database administration instruction to the licensed store desktop node through downstream sync."
              onOpenChange={(nextOpen) => {
                setIsDatabaseInstructionOpen(nextOpen);

                if (nextOpen) {
                  setDatabaseInstructionState({
                    status: "idle",
                    message: null,
                  });
                }
              }}
              open={isDatabaseInstructionOpen}
              title="Database instruction"
              triggerClassName="border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400 hover:text-amber-950"
              triggerLabel="Database admin"
              widthClassName="max-w-2xl"
            >
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">
                      Instruction
                    </span>
                    <select
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) =>
                        setDatabaseInstructionType(event.target.value)
                      }
                      value={databaseInstructionType}
                    >
                      <option value="SYNC_NOW">Sync now</option>
                      <option value="VACUUM">Vacuum</option>
                      <option value="ANALYZE">Analyze</option>
                      <option value="REINDEX">Reindex</option>
                      <option value="BACKUP">Backup</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">
                      Priority
                    </span>
                    <select
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) =>
                        setDatabaseInstructionPriority(event.target.value)
                      }
                      value={databaseInstructionPriority}
                    >
                      <option value="NORMAL">Normal</option>
                      <option value="HIGH">High</option>
                      <option value="LOW">Low</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                    <span className="block font-semibold text-stone-900">
                      Target
                    </span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) =>
                        setDatabaseInstructionTarget(event.target.value)
                      }
                      placeholder="Optional table, area, or maintenance target"
                      value={databaseInstructionTarget}
                    />
                  </label>
                </div>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">
                    Note
                  </span>
                  <textarea
                    className="min-h-28 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) =>
                      setDatabaseInstructionNote(event.target.value)
                    }
                    value={databaseInstructionNote}
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    disabled={databaseInstructionState.status === "submitting"}
                    onClick={() => setIsDatabaseInstructionOpen(false)}
                    type="button"
                  >
                    Close
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#d97706,#b45309)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(180,83,9,0.22)] transition hover:brightness-[1.03]"
                    disabled={databaseInstructionState.status === "submitting"}
                    onClick={() => void handleQueueDatabaseInstruction()}
                    type="button"
                  >
                    {databaseInstructionState.status === "submitting"
                      ? "Queueing..."
                      : "Queue instruction"}
                  </button>
                </div>
                {databaseInstructionState.message ? (
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${databaseInstructionState.status === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                  >
                    {databaseInstructionState.message}
                  </div>
                ) : null}
              </div>
            </ActionDialog>
          ) : (
            <button
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-300"
              disabled
              title={topologyRequiredTitle}
              type="button"
            >
              Database admin
            </button>
          )}
          {canPublishLocations ? (
            <ActionDialog
              description={locationPublishDescription}
              onOpenChange={setIsPublishLocationsOpen}
              open={isPublishLocationsOpen}
              title="Publish location topology"
              triggerClassName="border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-400 hover:text-emerald-950"
              triggerLabel="Publish locations"
              widthClassName="max-w-2xl"
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
                  {primaryNode
                    ? "Flash ERP will queue fresh inventory-location packets for the primary store node so the desktop can rehydrate local location names, defaults, and status from enterprise."
                    : "Flash ERP will confirm the active inventory locations used by this online store. No desktop sync node is required because the online POS reads location topology directly from enterprise."}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">
                      Store
                    </span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-stone-700"
                      disabled
                      value={`${detail.store.name} (${detail.store.code})`}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">
                      Target
                    </span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-stone-700"
                      disabled
                      value={locationPublishTargetLabel}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                    <span className="block font-semibold text-stone-900">
                      Operator name
                    </span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) =>
                        setPublishOperatorName(event.target.value)
                      }
                      placeholder="Flash ERP operator"
                      value={publishOperatorName}
                    />
                  </label>
                </div>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">
                    Operator note
                  </span>
                  <textarea
                    className="min-h-28 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setPublishNote(event.target.value)}
                    placeholder="Describe why the store desktop should refresh local location topology."
                    value={publishNote}
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    disabled={publishState.status === "submitting"}
                    onClick={() => setIsPublishLocationsOpen(false)}
                    type="button"
                  >
                    Close
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#059669,#047857)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(4,120,87,0.22)] transition hover:brightness-[1.03]"
                    disabled={publishState.status === "submitting"}
                    onClick={() => void handlePublishLocations()}
                    type="button"
                  >
                    {publishState.status === "submitting"
                      ? "Queueing packets..."
                      : "Queue location packets"}
                  </button>
                </div>
                {publishState.message ? (
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                      publishState.status === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {publishState.message}
                  </div>
                ) : null}
              </div>
            </ActionDialog>
          ) : (
            <button
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-300"
              disabled
              title={topologyRequiredTitle}
              type="button"
            >
              Publish locations
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-700">
            Last refresh {new Date(detail.refreshedAt).toLocaleString()}
          </div>
          <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-700">
            {detail.store.operatingModeLabel}
          </div>
          <StatusBadge value={detail.store.status} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          hint="Registered Flash ERP terminals for this store."
          icon={Waypoints}
          label="Terminals"
          value={numberFormatter.format(detail.metrics.terminals)}
        />
        <MetricCard
          hint="Desktop node coverage currently attached to this store."
          icon={RefreshCcw}
          label="Desktop nodes"
          value={numberFormatter.format(detail.metrics.desktopNodes)}
        />
        <MetricCard
          hint={
            detail.store.salesEnabled
              ? "Canonical posted sales currently visible in enterprise for this store."
              : "Warehouse-only sites are not expected to post POS sales. This remains zero unless the site is switched into selling mode."
          }
          icon={Activity}
          label="Posted sales"
          value={numberFormatter.format(detail.metrics.postedTransactions)}
        />
        <MetricCard
          hint="Registered warehouses and inventory locations supporting this store."
          icon={Boxes}
          label="Locations"
          value={numberFormatter.format(detail.metrics.inventoryLocations)}
        />
      </section>

      <WorkspaceTabs
        ariaLabel="Store detail views"
        defaultValue="overview"
        summaries={{
          overview:
            "Review store setup, node posture, and rollout guidance from one workspace.",
          nodes:
            "Inspect live node telemetry and jump into sync recovery when needed.",
          activity:
            "Review the latest canonical posted sales and stock movements attached to this store.",
        }}
        tabs={[
          {
            value: "overview",
            label: "Overview",
            badge: "Live",
            badgeTone: "success",
          },
          { value: "nodes", label: "Nodes" },
          { value: "activity", label: "Activity" },
        ]}
      >
        <WorkspaceTabsContent value="overview">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,1fr)]">
            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Store profile
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[
                    ["Store code", detail.store.code],
                    ["Short name", detail.store.shortName ?? "Not set"],
                    ["Operating mode", detail.store.operatingModeLabel],
                    [
                      "Store group",
                      detail.store.storeGroupName ??
                        detail.store.storeGroupCode ??
                        "Ungrouped",
                    ],
                    ["License", detail.store.licenseStatus],
                    [
                      "Licensed until",
                      detail.store.licensedUntil
                        ? new Date(
                            detail.store.licensedUntil,
                          ).toLocaleDateString()
                        : "No expiry",
                    ],
                    ["Catalog policy", detail.store.catalogPolicySummary],
                    [
                      "Touch mode",
                      detail.store.touchModeEnabled ? "Enabled" : "Disabled",
                    ],
                    ["Timezone", detail.store.timezone],
                    ["Currency", detail.store.currencyCode],
                    ["Manager", detail.store.managerName ?? "Not set"],
                    ["Phone", detail.store.phone ?? "Not set"],
                    ["Email", detail.store.email ?? "Not set"],
                    ["Location", detail.store.location ?? "Not recorded"],
                    [
                      "Address",
                      [
                        detail.store.addressLine1,
                        detail.store.addressLine2,
                        detail.store.city,
                        detail.store.region,
                        detail.store.countryCode,
                      ]
                        .filter(Boolean)
                        .join(", ") || "Not recorded",
                    ],
                    [
                      "Tax registration",
                      detail.store.taxRegistrationNo ?? "Not set",
                    ],
                    ["Receipt header", detail.store.receiptHeader ?? "Not set"],
                    ["Receipt footer", detail.store.receiptFooter ?? "Not set"],
                    [
                      "Thermal template",
                      detail.store.receiptTemplateSourceLabel,
                    ],
                    [
                      "Opened",
                      detail.store.openedOn
                        ? new Date(detail.store.openedOn).toLocaleDateString()
                        : "Not recorded",
                    ],
                    [
                      "Projection issues",
                      String(detail.metrics.projectionIssues),
                    ],
                    ["Stock movements", String(detail.metrics.stockMovements)],
                  ].map(([label, value]) => (
                    <div
                      className="rounded-2xl border border-stone-200 bg-white px-4 py-3"
                      key={label}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        {label}
                      </p>
                      <p className="mt-1 break-all text-sm leading-6 text-stone-800">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                    Linked catalogs
                  </p>
                  <Link
                    className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:border-indigo-300"
                    href="/catalog"
                  >
                    Manage
                  </Link>
                </div>
                <div className="mt-4 space-y-3">
                  {detail.store.inventoryCatalogs.length > 0 ? (
                    detail.store.inventoryCatalogs.map((catalog) => (
                      <div
                        className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700"
                        key={catalog.catalogCode}
                      >
                        <p className="font-semibold text-stone-900">
                          {catalog.name}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {catalog.catalogCode} • {catalog.status} •{" "}
                          {catalog.productCount} product(s)
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                      This store is not linked to a managed inventory catalog
                      yet.
                    </div>
                  )}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Estate posture
                </p>
                <div className="mt-4 space-y-3">
                  {detail.postureMessages.map((message) => (
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

            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Warehouses
                </p>
                <div className="mt-4 space-y-3">
                  {detail.warehouseRows.length > 0 ? (
                    detail.warehouseRows.map((warehouse) => (
                      <div
                        className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700"
                        key={warehouse.warehouseCode}
                      >
                        <p className="font-semibold text-stone-900">
                          {warehouse.warehouseName}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {warehouse.warehouseCode} •{" "}
                          {warehouse.inventoryLocationCount} location(s)
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                      No warehouses are registered for this store yet.
                    </div>
                  )}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                    Inventory locations
                  </p>
                  <ActionDialog
                    description="Create or update the store inventory locations used by POS sales, sales orders, receiving, transfers, and reversals."
                    onOpenChange={(nextOpen) => {
                      if (nextOpen) {
                        openLocationSetupDialog();
                        return;
                      }

                      setIsLocationSetupOpen(false);
                    }}
                    open={isLocationSetupOpen}
                    title="Inventory location setup"
                    triggerClassName="border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:text-stone-950"
                    triggerLabel="Add location"
                    widthClassName="max-w-4xl"
                  >
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2 text-sm text-stone-700">
                          <span className="block font-semibold text-stone-900">
                            Location code
                          </span>
                          <input
                            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                            onChange={(event) =>
                              setLocationFormCode(event.target.value)
                            }
                            value={locationFormCode}
                          />
                        </label>
                        <label className="space-y-2 text-sm text-stone-700">
                          <span className="block font-semibold text-stone-900">
                            Location name
                          </span>
                          <input
                            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                            onChange={(event) =>
                              setLocationFormName(event.target.value)
                            }
                            value={locationFormName}
                          />
                        </label>
                        <label className="space-y-2 text-sm text-stone-700">
                          <span className="block font-semibold text-stone-900">
                            Location type
                          </span>
                          <select
                            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                            onChange={(event) =>
                              setLocationFormType(event.target.value)
                            }
                            value={locationFormType}
                          >
                            {locationTypeOptions.map((option) => (
                              <option key={option} value={option}>
                                {option.replace(/_/g, " ")}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-2 text-sm text-stone-700">
                          <span className="block font-semibold text-stone-900">
                            Warehouse code
                          </span>
                          <select
                            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                            onChange={(event) =>
                              setLocationFormWarehouseCode(event.target.value)
                            }
                            value={locationFormWarehouseCode}
                          >
                            <option value="">No warehouse link</option>
                            {detail.warehouseRows.map((warehouse) => (
                              <option
                                key={warehouse.warehouseCode}
                                value={warehouse.warehouseCode}
                              >
                                {warehouse.warehouseName} ({warehouse.warehouseCode})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-2 text-sm text-stone-700">
                          <span className="block font-semibold text-stone-900">
                            Status
                          </span>
                          <select
                            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                            onChange={(event) =>
                              setLocationFormStatus(event.target.value)
                            }
                            value={locationFormStatus}
                          >
                            <option value="ACTIVE">Active</option>
                            <option value="INACTIVE">Inactive</option>
                            <option value="ARCHIVED">Archived</option>
                          </select>
                        </label>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-800">
                          <input
                            checked={locationFormSalesDefault}
                            onChange={(event) =>
                              setLocationFormSalesDefault(event.target.checked)
                            }
                            type="checkbox"
                          />
                          Sales default
                        </label>
                        <label className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-800">
                          <input
                            checked={locationFormSalesOrderDefault}
                            onChange={(event) =>
                              setLocationFormSalesOrderDefault(
                                event.target.checked,
                              )
                            }
                            type="checkbox"
                          />
                          Sales order default
                        </label>
                        <label className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-800">
                          <input
                            checked={locationFormReceivingDefault}
                            onChange={(event) =>
                              setLocationFormReceivingDefault(
                                event.target.checked,
                              )
                            }
                            type="checkbox"
                          />
                          Receiving default
                        </label>
                      </div>
                      <div className="flex flex-wrap justify-end gap-3">
                        <button
                          className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                          disabled={locationSetupState.status === "submitting"}
                          onClick={() => setIsLocationSetupOpen(false)}
                          type="button"
                        >
                          Close
                        </button>
                        <button
                          className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
                          disabled={
                            locationSetupState.status === "submitting" ||
                            !locationFormCode.trim() ||
                            !locationFormName.trim()
                          }
                          onClick={() => void handleSaveInventoryLocation()}
                          type="button"
                        >
                          {locationSetupState.status === "submitting"
                            ? "Saving..."
                            : "Save location"}
                        </button>
                      </div>
                      {locationSetupState.message ? (
                        <div
                          className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                            locationSetupState.status === "error"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {locationSetupState.message}
                        </div>
                      ) : null}
                    </div>
                  </ActionDialog>
                </div>
                <div className="mt-4 space-y-3">
                  {detail.locationRows.length > 0 ? (
                    detail.locationRows.map((location) => (
                      <div
                        className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700"
                        key={location.locationCode}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <p className="font-semibold text-stone-900">
                            {location.locationName}
                          </p>
                          <button
                            className="inline-flex items-center justify-center rounded-full border border-stone-300 px-3 py-1 text-xs font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                            onClick={() => openLocationSetupDialog(location)}
                            type="button"
                          >
                            Edit
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-stone-500">
                          {location.locationCode} • {location.locationType}
                          {location.warehouseCode
                            ? ` • ${location.warehouseCode}`
                            : ""}
                        </p>
                        <p className="mt-2 text-xs text-stone-500">
                          {location.useForSalesDefault
                            ? "Sales default"
                            : "Not sales default"}
                          {" • "}
                          {location.useForSalesOrderDefault
                            ? "Sales order default"
                            : "Not sales order default"}
                          {" • "}
                          {location.useForReceivingDefault
                            ? "Receiving default"
                            : "Not receiving default"}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                      No inventory locations are registered for this store yet.
                    </div>
                  )}
                </div>
              </article>
            </div>
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="nodes">
          <SharedDataGrid
            columns={nodeColumns}
            data={detail.nodeRows}
            emptyLabel="No desktop nodes are currently attached to this store."
            exportFileName={`flash-erp-${detail.store.code}-nodes`}
            getRowHref={(row) =>
              `/sync/nodes/${encodeURIComponent(row.nodeCode)}`
            }
            searchPlaceholder="Search store nodes by code, name, or health"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="activity">
          <section className="grid gap-4 xl:grid-cols-2">
            <SharedDataGrid
              columns={transactionColumns}
              data={detail.recentTransactions}
              emptyLabel="No canonical posted sales are visible for this store yet."
              exportFileName={`flash-erp-${detail.store.code}-transactions`}
              getRowHref={(row) =>
                `/pos/transactions/${encodeURIComponent(row.transactionNo)}`
              }
              searchPlaceholder="Search recent posted sales"
            />
            <SharedDataGrid
              columns={inventoryColumns}
              data={detail.recentInventoryRows}
              emptyLabel="No canonical inventory movements are visible for this store yet."
              exportFileName={`flash-erp-${detail.store.code}-inventory`}
              getRowHref={(row) =>
                `/operations/inventory/${encodeURIComponent(row.entryId)}`
              }
              searchPlaceholder="Search recent inventory movements"
            />
          </section>
        </WorkspaceTabsContent>
      </WorkspaceTabs>

      <section className="glass-panel rounded-[1.4rem] p-5">
        <p className="text-sm leading-6 text-stone-600">
          {detail.statusMessage}
        </p>
      </section>
    </EnterpriseShell>
  );
}
