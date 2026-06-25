"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import { Activity, Boxes, Package, Plus, Store } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type { EnterpriseInventoryWorkspaceData } from "@/server/repositories/enterprise-inventory.repository";

const numberFormatter = new Intl.NumberFormat("en-US");
const quantityFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3
});

type LocationRow = EnterpriseInventoryWorkspaceData["locationRows"][number];
type ProductRow = EnterpriseInventoryWorkspaceData["productRows"][number];
type StockPositionRow = EnterpriseInventoryWorkspaceData["stockPositionRows"][number];
type MovementRow = EnterpriseInventoryWorkspaceData["movementRows"][number];
type SerialLookupRow = EnterpriseInventoryWorkspaceData["serialLookupRows"][number];
type SupplierClaimRow = EnterpriseInventoryWorkspaceData["supplierClaimRows"][number];
type SupplierReturnRow = EnterpriseInventoryWorkspaceData["supplierReturnRows"][number];
type PurchaseOrderRow = EnterpriseInventoryWorkspaceData["purchaseOrderRows"][number];
type InterStoreTransferRow = EnterpriseInventoryWorkspaceData["interStoreTransferRows"][number];
type InterStoreTransferHeaderRow = InterStoreTransferRow & {
  transferKey: string;
  lineCount: number;
  transferNos: string[];
  isDraftBatch: boolean;
};
type StockCountSessionRow = EnterpriseInventoryWorkspaceData["stockCountSessionRows"][number];

function MetricCard({
  icon: Icon,
  label,
  value,
  hint
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
          <p className="mt-2 text-[1.45rem] font-semibold text-stone-950">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] text-white shadow-[0_14px_30px_rgba(29,78,216,0.28)]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-600">{hint}</p>
    </article>
  );
}

const locationFilter: FilterFn<LocationRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.locationCode,
    row.original.locationName,
    row.original.storeName ?? "",
    row.original.warehouseName ?? "",
    row.original.locationType,
    row.original.defaults
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const productFilter: FilterFn<ProductRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [row.original.productCode, row.original.sku ?? "", row.original.productName, row.original.status]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const stockPositionFilter: FilterFn<StockPositionRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.storeCode ?? "",
    row.original.storeName ?? "",
    row.original.warehouseCode ?? "",
    row.original.warehouseName ?? "",
    row.original.locationCode,
    row.original.locationName,
    row.original.productCode,
    row.original.sku ?? "",
    row.original.productName,
    row.original.status
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const movementFilter: FilterFn<MovementRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.productCode,
    row.original.productName,
    row.original.locationCode,
    row.original.locationName,
    row.original.storeName ?? "",
    row.original.movementType,
    row.original.referenceLabel
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const serialLookupFilter: FilterFn<SerialLookupRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.serialNumber,
    row.original.productCode,
    row.original.productName,
    row.original.sourceType,
    row.original.activityLabel,
    row.original.storeCode ?? "",
    row.original.storeName ?? "",
    row.original.locationCode ?? "",
    row.original.locationName ?? "",
    row.original.targetLocationCode ?? "",
    row.original.targetLocationName ?? "",
    row.original.referenceLabel,
    row.original.statusLabel ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const supplierClaimFilter: FilterFn<SupplierClaimRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.claimNo,
    row.original.supplierNo,
    row.original.supplierName,
    row.original.storeCode ?? "",
    row.original.storeName ?? "",
    row.original.locationCode,
    row.original.locationName,
    row.original.statusLabel,
    row.original.purchaseOrderNo ?? "",
    row.original.goodsReceiptNo ?? "",
    row.original.supplierCaseReference ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const supplierReturnFilter: FilterFn<SupplierReturnRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.supplierReturnNo,
    row.original.supplierNo,
    row.original.supplierName,
    row.original.storeCode ?? "",
    row.original.storeName ?? "",
    row.original.locationCode,
    row.original.locationName,
    row.original.reasonLabel,
    row.original.statusLabel,
    row.original.purchaseOrderNo ?? "",
    row.original.goodsReceiptNo ?? "",
    row.original.cancellationAcknowledgedByNodeCode ?? "",
    row.original.cancellationAcknowledgedBy ?? "",
    row.original.cancellationAcknowledgementNote ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const purchaseOrderFilter: FilterFn<PurchaseOrderRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.purchaseOrderNo,
    row.original.statusLabel,
    row.original.supplierNo ?? "",
    row.original.supplierName ?? "",
    row.original.storeCode ?? "",
    row.original.storeName ?? "",
    row.original.locationCode,
    row.original.locationName
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const interStoreTransferFilter: FilterFn<InterStoreTransferHeaderRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.transferKey,
    row.original.transferNo,
    row.original.transferBatchNo ?? "",
    row.original.transferNos.join(" "),
    row.original.externalReference ?? "",
    row.original.statusLabel,
    row.original.origin,
    row.original.sourceStoreName,
    row.original.sourceLocationCode,
    row.original.sourceLocationName,
    row.original.destinationStoreName,
    row.original.destinationLocationCode,
    row.original.destinationLocationName,
    row.original.requiredAtLabel
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const stockCountSessionFilter: FilterFn<StockCountSessionRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.sessionNo,
    row.original.statusLabel,
    row.original.storeCode ?? "",
    row.original.storeName ?? "",
    row.original.locationCode,
    row.original.locationName,
    row.original.productCode,
    row.original.productName
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
      <p className="mt-0.5 truncate text-xs text-stone-500">{new Date(value).toLocaleString()}</p>
    </div>
  );
}

function SerialChip({ serialNumber }: { serialNumber: string }) {
  return (
    <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">
      {serialNumber}
    </span>
  );
}

function summarizeTransferLines(lines: InterStoreTransferRow[]) {
  const uniqueProducts = [
    ...new Map(lines.map((line) => [line.productCode, `${line.productName} (${line.productCode})`] as const)).values()
  ];

  if (uniqueProducts.length <= 2) {
    return uniqueProducts.join(", ");
  }

  return `${uniqueProducts[0]} + ${uniqueProducts.length - 1} more item(s)`;
}

export function EnterpriseInventoryWorkspace({
  defaultView = "products",
  dedicatedView = false,
  pageDescription,
  pageHeading,
  workspace
}: {
  defaultView?: "products" | "stock" | "transfers" | "in-transit" | "counts";
  dedicatedView?: boolean;
  pageDescription?: string;
  pageHeading?: string;
  workspace: EnterpriseInventoryWorkspaceData;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stockShopFilter, setStockShopFilter] = useState("");
  const [stockProductFilter, setStockProductFilter] = useState("");
  const [poLocationCode, setPoLocationCode] = useState("");
  const [poSupplierNo, setPoSupplierNo] = useState("");
  const [poProductCode, setPoProductCode] = useState("");
  const [poProductSearch, setPoProductSearch] = useState("");
  const [poQuantity, setPoQuantity] = useState("1");
  const [poUnitCost, setPoUnitCost] = useState("");
  const [poReference, setPoReference] = useState("");
  const [poNote, setPoNote] = useState("");
  const [poLines, setPoLines] = useState<
    Array<{ id: string; productCode: string; productName: string; quantity: number; unitCost: number | null }>
  >([]);
  const [poSubmitting, setPoSubmitting] = useState(false);
  const [poStatus, setPoStatus] = useState<{
    tone: "idle" | "success" | "error";
    message: string;
  }>({ tone: "idle", message: "" });
  const [transferSourceLocation, setTransferSourceLocation] = useState("");
  const [transferDestinationLocation, setTransferDestinationLocation] = useState("");
  const [transferProductCode, setTransferProductCode] = useState("");
  const [transferQuantity, setTransferQuantity] = useState("1");
  const [transferReference, setTransferReference] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [transferRequiredAt, setTransferRequiredAt] = useState("");
  const [transferTransporterName, setTransferTransporterName] = useState("");
  const [transferVehicleRegistrationNo, setTransferVehicleRegistrationNo] = useState("");
  const [transferDriverName, setTransferDriverName] = useState("");
  const [transferDriverContact, setTransferDriverContact] = useState("");
  const [transferDeliveryNoteNo, setTransferDeliveryNoteNo] = useState("");
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [editingTransferBatchNo, setEditingTransferBatchNo] = useState<string | null>(null);
  const [activeTransferEntryTab, setActiveTransferEntryTab] = useState<"header" | "details">(
    "header"
  );
  const [transferLines, setTransferLines] = useState<
    Array<{ id: string; productCode: string; productName: string; quantity: number }>
  >([]);
  const [transferStatus, setTransferStatus] = useState<{
    tone: "idle" | "success" | "error";
    message: string;
  }>({ tone: "idle", message: "" });
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [committingTransferBatchNo, setCommittingTransferBatchNo] = useState<string | null>(null);
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: workspace.currencyCode
      }),
    [workspace.currencyCode]
  );

  const locationColumns = useMemo<ColumnDef<LocationRow>[]>(
    () => [
      {
        accessorKey: "locationName",
        header: "Location",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.locationName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.locationCode}
              {row.original.warehouseName ? ` • ${row.original.warehouseName}` : ""}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "storeName",
        header: "Store",
        cell: ({ row }) => row.original.storeName ?? "Unassigned"
      },
      {
        accessorKey: "locationType",
        header: "Type"
      },
      {
        accessorKey: "defaults",
        header: "Defaults",
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "productCount",
        header: "Products",
        cell: ({ row }) => numberFormatter.format(row.original.productCount)
      },
      {
        accessorKey: "onHandQuantity",
        header: "On hand",
        cell: ({ row }) => quantityFormatter.format(row.original.onHandQuantity)
      },
      {
        accessorKey: "lastMovementAtLabel",
        header: "Last movement",
        cell: ({ row }) => renderTimestamp(row.original.lastMovementAt, row.original.lastMovementAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const productColumns = useMemo<ColumnDef<ProductRow>[]>(
    () => [
      {
        accessorKey: "productName",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.productName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.productCode}
              {row.original.sku ? ` • ${row.original.sku}` : ""}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "locationCount",
        header: "Locations",
        cell: ({ row }) => numberFormatter.format(row.original.locationCount)
      },
      {
        accessorKey: "onHandQuantity",
        header: "On hand",
        cell: ({ row }) => quantityFormatter.format(row.original.onHandQuantity)
      },
      {
        accessorKey: "estimatedRetailValue",
        header: "Retail value",
        cell: ({ row }) => currencyFormatter.format(row.original.estimatedRetailValue)
      },
      {
        accessorKey: "status",
        header: "Status"
      },
      {
        accessorKey: "lastMovementAtLabel",
        header: "Last movement",
        cell: ({ row }) => renderTimestamp(row.original.lastMovementAt, row.original.lastMovementAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter]
  );

  const stockPositionColumns = useMemo<ColumnDef<StockPositionRow>[]>(
    () => [
      {
        accessorKey: "storeName",
        header: "Shop / location",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.storeName ?? row.original.warehouseName ?? "Unassigned"}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.locationName} ({row.original.locationCode})
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "productName",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.productName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.productCode}
              {row.original.sku ? ` • ${row.original.sku}` : ""}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "onHandQuantity",
        header: "Current qty",
        cell: ({ row }) => quantityFormatter.format(row.original.onHandQuantity)
      },
      {
        accessorKey: "estimatedRetailValue",
        header: "Retail value",
        cell: ({ row }) => currencyFormatter.format(row.original.estimatedRetailValue)
      },
      {
        accessorKey: "status",
        header: "Status"
      },
      {
        accessorKey: "lastMovementAtLabel",
        header: "Last movement",
        cell: ({ row }) => renderTimestamp(row.original.lastMovementAt, row.original.lastMovementAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter]
  );
  const stockShopOptions = useMemo(() => {
    const options = new Map<string, string>();

    for (const row of workspace.stockPositionRows) {
      const key = row.locationCode;
      options.set(
        key,
        `${row.storeName ?? row.warehouseName ?? "Unassigned"} / ${row.locationName} (${row.locationCode})`
      );
    }

    return [...options.entries()].map(([value, label]) => ({ value, label }));
  }, [workspace.stockPositionRows]);
  const stockProductOptions = useMemo(() => {
    const options = new Map<string, string>();

    for (const row of workspace.stockPositionRows) {
      options.set(
        row.productCode,
        `${row.productName} (${row.productCode}${row.sku ? ` / ${row.sku}` : ""})`
      );
    }

    return [...options.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [workspace.stockPositionRows]);
  const filteredStockPositionRows = useMemo(
    () =>
      workspace.stockPositionRows.filter(
        (row) =>
          (!stockShopFilter || row.locationCode === stockShopFilter) &&
          (!stockProductFilter || row.productCode === stockProductFilter)
      ),
    [stockProductFilter, stockShopFilter, workspace.stockPositionRows]
  );
  const interStoreLocationOptions = useMemo(
    () =>
      workspace.transferLocationOptions
        .map((row) => ({
          value: row.locationCode,
          label: `${row.storeName} / ${row.locationName} (${row.locationCode})`,
          storeCode: row.storeCode
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [workspace.transferLocationOptions]
  );
  const interStoreProductOptions = useMemo(
    () =>
      workspace.transferProductOptions
        .map((row) => ({
          value: row.productCode,
          label: `${row.productName} (${row.productCode}${row.sku ? ` / ${row.sku}` : ""})`,
          productName: row.productName
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [workspace.transferProductOptions]
  );
  const filteredPoProductOptions = useMemo(() => {
    const query = poProductSearch.trim().toLowerCase();

    if (!query) {
      return interStoreProductOptions;
    }

    return interStoreProductOptions.filter((option) => option.label.toLowerCase().includes(query));
  }, [interStoreProductOptions, poProductSearch]);
  const receivingLocationOptions = useMemo(
    () =>
      workspace.locationRows
        .filter((row) => row.storeCode)
        .map((row) => ({
          value: row.locationCode,
          label: `${row.storeName ?? row.storeCode} / ${row.locationName} (${row.locationCode})`
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [workspace.locationRows]
  );
  const supplierOptions = useMemo(() => {
    const options = new Map<string, string>();

    for (const row of workspace.purchaseOrderRows) {
      if (row.supplierNo && row.supplierName) {
        options.set(row.supplierNo, row.supplierName);
      }
    }

    for (const row of workspace.supplierClaimRows) {
      options.set(row.supplierNo, row.supplierName);
    }

    for (const row of workspace.supplierReturnRows) {
      options.set(row.supplierNo, row.supplierName);
    }

    return [...options.entries()]
      .map(([value, label]) => ({ value, label: `${label} (${value})` }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [workspace.purchaseOrderRows, workspace.supplierClaimRows, workspace.supplierReturnRows]);
  const selectedPoProduct = interStoreProductOptions.find((option) => option.value === poProductCode);
  const canSavePurchaseOrder = poLocationCode.length > 0 && poLines.length > 0 && !poSubmitting;
  const selectedTransferProduct = interStoreProductOptions.find(
    (option) => option.value === transferProductCode
  );
  const selectedSourceLocation = interStoreLocationOptions.find(
    (option) => option.value === transferSourceLocation
  );
  const selectedDestinationLocation = interStoreLocationOptions.find(
    (option) => option.value === transferDestinationLocation
  );
  const editingTransferRows = useMemo(() => {
    if (!editingTransferBatchNo) {
      return [] as InterStoreTransferRow[];
    }

    return workspace.interStoreTransferRows
      .filter((transfer) => (transfer.transferBatchNo ?? transfer.transferNo) === editingTransferBatchNo)
      .sort((left, right) => left.lineNo - right.lineNo);
  }, [editingTransferBatchNo, workspace.interStoreTransferRows]);
  const isTransferDialogReadOnly = Boolean(
    editingTransferBatchNo &&
      editingTransferRows.length > 0 &&
      !editingTransferRows.every((transfer) => transfer.status === "DRAFT")
  );
  const interStoreRequestBlockReason = transferSubmitting
    ? "Transfer request is already saving."
    : isTransferDialogReadOnly
      ? "This transfer has already been committed, so it is read-only."
      : !transferSourceLocation
        ? "Choose the source shop/location."
        : !transferDestinationLocation
          ? "Choose the destination shop/location."
          : !selectedSourceLocation
            ? "Choose a valid source shop/location."
            : !selectedDestinationLocation
              ? "Choose a valid destination shop/location."
              : transferSourceLocation === transferDestinationLocation
                ? "Source and destination locations must be different."
                : selectedSourceLocation.storeCode === selectedDestinationLocation.storeCode
                  ? "Inter-store transfers need different source and destination shops. Use the local inter-location transfer flow for locations inside the same shop."
                  : transferLines.length === 0
                    ? "Add at least one item line before saving."
                    : "";
  const canSaveInterStoreRequest = !interStoreRequestBlockReason;
  const interStoreTransferHeaderRows = useMemo(() => {
    const groupedRows = new Map<string, InterStoreTransferRow[]>();

    for (const row of workspace.interStoreTransferRows) {
      const key = row.transferBatchNo ?? row.transferNo;
      groupedRows.set(key, [...(groupedRows.get(key) ?? []), row]);
    }

    return [...groupedRows.entries()].map<InterStoreTransferHeaderRow>(([transferKey, rows]) => {
      const sortedRows = [...rows].sort((left, right) => left.lineNo - right.lineNo);
      const firstRow = sortedRows[0]!;
      const statuses = new Set(sortedRows.map((row) => row.status));
      const latestRequestedRow = sortedRows.reduce((latest, row) =>
        new Date(row.requestedAt).getTime() > new Date(latest.requestedAt).getTime() ? row : latest
      );
      const requiredRows = sortedRows.filter((row) => row.requiredAt);
      const earliestRequiredRow = requiredRows.reduce<InterStoreTransferRow | null>((earliest, row) => {
        if (!earliest) {
          return row;
        }

        return new Date(row.requiredAt ?? row.requestedAt).getTime() <
          new Date(earliest.requiredAt ?? earliest.requestedAt).getTime()
          ? row
          : earliest;
      }, null);

      return {
        ...firstRow,
        transferNo: transferKey,
        transferBatchNo: firstRow.transferBatchNo ?? (sortedRows.length > 1 ? transferKey : null),
        lineNo: 1,
        status: statuses.size === 1 ? firstRow.status : "MIXED",
        statusLabel: statuses.size === 1 ? firstRow.statusLabel : "Mixed",
        productCode: `${sortedRows.length} line${sortedRows.length === 1 ? "" : "s"}`,
        productName: summarizeTransferLines(sortedRows),
        requestedQuantity: Number(
          sortedRows.reduce((sum, row) => sum + row.requestedQuantity, 0).toFixed(3)
        ),
        issuedQuantity: Number(sortedRows.reduce((sum, row) => sum + row.issuedQuantity, 0).toFixed(3)),
        receivedQuantity: Number(
          sortedRows.reduce((sum, row) => sum + row.receivedQuantity, 0).toFixed(3)
        ),
        inTransitQuantity: Number(
          sortedRows.reduce((sum, row) => sum + row.inTransitQuantity, 0).toFixed(3)
        ),
        requestedAt: latestRequestedRow.requestedAt,
        requestedAtLabel: latestRequestedRow.requestedAtLabel,
        requiredAt: earliestRequiredRow?.requiredAt ?? null,
        requiredAtLabel: earliestRequiredRow?.requiredAtLabel ?? "Not set",
        transferKey,
        lineCount: sortedRows.length,
        transferNos: sortedRows.map((row) => row.transferNo),
        isDraftBatch: sortedRows.every((row) => row.status === "DRAFT")
      };
    });
  }, [workspace.interStoreTransferRows]);
  const transferDetailBaseHref =
    dedicatedView && defaultView === "in-transit" ? "/inventory/in-transit" : "/inventory/transfers";
  const editingTransferFeedback = editingTransferRows[0] ?? null;

  function resetTransferDraft() {
    setEditingTransferBatchNo(null);
    setTransferSourceLocation("");
    setTransferDestinationLocation("");
    setTransferProductCode("");
    setTransferQuantity("1");
    setTransferReference("");
    setTransferNote("");
    setTransferRequiredAt("");
    setTransferTransporterName("");
    setTransferVehicleRegistrationNo("");
    setTransferDriverName("");
    setTransferDriverContact("");
    setTransferDeliveryNoteNo("");
    setTransferLines([]);
    setActiveTransferEntryTab("header");
  }

  function openNewTransferDialog() {
    resetTransferDraft();
    setTransferStatus({ tone: "idle", message: "" });
    setTransferDialogOpen(true);
  }

  const prepareTransferForEdit = useCallback((row: InterStoreTransferRow) => {
    const transferBatchNo = row.transferBatchNo ?? row.transferNo;
    const batchLines = workspace.interStoreTransferRows
      .filter((transfer) => (transfer.transferBatchNo ?? transfer.transferNo) === transferBatchNo)
      .sort((left, right) => left.lineNo - right.lineNo);

    setEditingTransferBatchNo(transferBatchNo);
    setTransferSourceLocation(row.sourceLocationCode);
    setTransferDestinationLocation(row.destinationLocationCode);
    setTransferReference(row.externalReference ?? "");
    setTransferNote("");
    setTransferRequiredAt(row.requiredAt ? row.requiredAt.slice(0, 10) : "");
    setTransferTransporterName(row.transporterName ?? "");
    setTransferVehicleRegistrationNo(row.vehicleRegistrationNo ?? "");
    setTransferDriverName(row.driverName ?? "");
    setTransferDriverContact(row.driverContact ?? "");
    setTransferDeliveryNoteNo(row.deliveryNoteNo ?? "");
    setTransferProductCode("");
    setTransferQuantity("1");
    setTransferLines(
      batchLines.map((line) => ({
        id: line.transferId,
        productCode: line.productCode,
        productName: line.productName,
        quantity: line.requestedQuantity
      }))
    );
    setActiveTransferEntryTab("header");
    setTransferStatus({ tone: "idle", message: "" });
    setTransferDialogOpen(true);
  }, [workspace.interStoreTransferRows]);

  useEffect(() => {
    const openTransfer = searchParams.get("openTransfer");

    if (!openTransfer) {
      return;
    }

    const transfer = interStoreTransferHeaderRows.find(
      (row) =>
        row.transferKey === openTransfer ||
        row.transferNo === openTransfer ||
        row.transferBatchNo === openTransfer ||
        row.transferNos.includes(openTransfer)
    );

    if (transfer) {
      prepareTransferForEdit(transfer);
    }
  }, [interStoreTransferHeaderRows, prepareTransferForEdit, searchParams]);

  function addPurchaseOrderLine() {
    const quantity = Number(poQuantity);
    const unitCost = poUnitCost.trim() ? Number(poUnitCost) : null;

    if (!poProductCode || !selectedPoProduct) {
      setPoStatus({ tone: "error", message: "Choose an item before adding a purchase-order line." });
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setPoStatus({ tone: "error", message: "Purchase-order quantity must be greater than zero." });
      return;
    }

    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      setPoStatus({ tone: "error", message: "Unit cost must be zero or greater." });
      return;
    }

    setPoLines((currentLines) => [
      ...currentLines.filter((line) => line.productCode !== poProductCode),
      {
        id: `${poProductCode}-${Date.now()}`,
        productCode: poProductCode,
        productName: selectedPoProduct.productName,
        quantity,
        unitCost
      }
    ]);
    setPoProductCode("");
    setPoProductSearch("");
    setPoQuantity("1");
    setPoUnitCost("");
    setPoStatus({ tone: "idle", message: "" });
  }

  async function savePurchaseOrder(autoCommit: boolean) {
    if (!canSavePurchaseOrder) {
      setPoStatus({ tone: "error", message: "Choose a receiving shop and add at least one PO line." });
      return;
    }

    setPoSubmitting(true);
    setPoStatus({ tone: "idle", message: "" });

    try {
      const response = await fetch(
        `/api/inventory/locations/${encodeURIComponent(poLocationCode)}/purchase-orders`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            supplierNo: poSupplierNo.trim() || null,
            externalReference: poReference.trim() || null,
            note: poNote.trim() || null,
            operatorName: "HQ purchasing",
            autoCommit,
            lines: poLines.map((line) => ({
              productCode: line.productCode,
              quantity: line.quantity,
              unitCost: line.unitCost
            }))
          })
        }
      );
      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Flash ERP could not save the purchase order.");
      }

      setPoLines([]);
      setPoReference("");
      setPoNote("");
      setPoStatus({
        tone: "success",
        message: payload.message ?? "Purchase order saved."
      });
      router.refresh();
    } catch (error) {
      setPoStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not save the purchase order."
      });
    } finally {
      setPoSubmitting(false);
    }
  }

  async function commitPurchaseOrder(purchaseOrderId: string) {
    setPoSubmitting(true);
    setPoStatus({ tone: "idle", message: "" });

    try {
      const response = await fetch(
        `/api/inventory/purchase-orders/${encodeURIComponent(purchaseOrderId)}/commit`,
        { method: "POST" }
      );
      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Flash ERP could not push the purchase order.");
      }

      setPoStatus({ tone: "success", message: payload.message ?? "Purchase order pushed." });
      router.refresh();
    } catch (error) {
      setPoStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not push the purchase order."
      });
    } finally {
      setPoSubmitting(false);
    }
  }

  function addTransferLine() {
    const quantity = Number(transferQuantity);

    if (!transferProductCode || !selectedTransferProduct) {
      setTransferStatus({ tone: "error", message: "Choose an item before adding a line." });
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setTransferStatus({ tone: "error", message: "Quantity must be greater than zero." });
      return;
    }

    setTransferLines((currentLines) => [
      ...currentLines,
      {
        id: `${transferProductCode}-${Date.now()}-${currentLines.length}`,
        productCode: transferProductCode,
        productName: selectedTransferProduct.productName,
        quantity
      }
    ]);
    setTransferProductCode("");
    setTransferQuantity("1");
    setTransferStatus({ tone: "idle", message: "" });
  }

  async function saveInterStoreRequest(saveAsDraft: boolean) {
    if (!canSaveInterStoreRequest) {
      setTransferStatus({
        tone: "error",
        message: interStoreRequestBlockReason || "Complete the transfer request before saving."
      });
      return;
    }

    setTransferSubmitting(true);
    setTransferStatus({ tone: "idle", message: "" });

    try {
      const response = await fetch(
        editingTransferBatchNo
          ? `/api/inventory/inter-store-transfers/${encodeURIComponent(editingTransferBatchNo)}`
          : "/api/inventory/inter-store-transfers",
        {
        method: editingTransferBatchNo ? "PATCH" : "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sourceLocationCode: transferSourceLocation,
          destinationLocationCode: transferDestinationLocation,
          externalReference: transferReference.trim() || null,
          transporterName: transferTransporterName.trim() || null,
          vehicleRegistrationNo: transferVehicleRegistrationNo.trim() || null,
          driverName: transferDriverName.trim() || null,
          driverContact: transferDriverContact.trim() || null,
          deliveryNoteNo: transferDeliveryNoteNo.trim() || null,
          note: transferNote.trim() || null,
          operatorName: "HQ inventory",
          requiredAt: transferRequiredAt || null,
          saveAsDraft: editingTransferBatchNo ? true : saveAsDraft,
          lines: transferLines.map((line) => ({
            productCode: line.productCode,
            quantity: line.quantity
          }))
        })
      });
      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Flash ERP could not commit the inter-store request.");
      }

      if (editingTransferBatchNo && !saveAsDraft) {
        const commitResponse = await fetch(
          `/api/inventory/inter-store-transfers/${encodeURIComponent(editingTransferBatchNo)}/commit`,
          { method: "POST" }
        );
        const commitPayload = (await commitResponse.json()) as { message?: string; error?: string };

        if (!commitResponse.ok) {
          throw new Error(commitPayload.error ?? "Flash ERP saved the draft but could not commit it.");
        }
      }

      resetTransferDraft();
      setTransferDialogOpen(false);
      setTransferStatus({
        tone: "success",
        message:
          payload.message ??
          (saveAsDraft
            ? "Inter-store request saved as draft."
            : "Inter-store request committed for the affected shops.")
      });
      router.refresh();
    } catch (error) {
      setTransferStatus({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not commit the inter-store request."
      });
    } finally {
      setTransferSubmitting(false);
    }
  }

  async function commitInterStoreDraft(row: InterStoreTransferRow) {
    const transferBatchNo = row.transferBatchNo ?? row.transferNo;

    setCommittingTransferBatchNo(transferBatchNo);
    setTransferStatus({ tone: "idle", message: "" });

    try {
      const response = await fetch(
        `/api/inventory/inter-store-transfers/${encodeURIComponent(transferBatchNo)}/commit`,
        { method: "POST" }
      );
      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Flash ERP could not commit the transfer request.");
      }

      setTransferStatus({
        tone: "success",
        message: payload.message ?? `${transferBatchNo} was committed for shop execution.`
      });
      router.refresh();
    } catch (error) {
      setTransferStatus({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not commit the transfer request."
      });
    } finally {
      setCommittingTransferBatchNo(null);
    }
  }

  const purchaseOrderColumns = useMemo<ColumnDef<PurchaseOrderRow>[]>(
    () => [
      {
        accessorKey: "purchaseOrderNo",
        header: "PO",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.purchaseOrderNo}</p>
            <p className="truncate text-xs text-stone-500">{row.original.statusLabel}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "locationName",
        header: "Receiving shop",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.storeName ?? row.original.storeCode ?? "Unassigned"}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.locationName} ({row.original.locationCode})
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "supplierName",
        header: "Supplier",
        cell: ({ row }) => row.original.supplierName ?? "Not set"
      },
      {
        accessorKey: "orderedQuantity",
        header: "Ordered",
        cell: ({ row }) => quantityFormatter.format(row.original.orderedQuantity)
      },
      {
        accessorKey: "receivedQuantity",
        header: "Received",
        cell: ({ row }) => quantityFormatter.format(row.original.receivedQuantity)
      },
      {
        accessorKey: "outstandingQuantity",
        header: "Outstanding",
        cell: ({ row }) => quantityFormatter.format(row.original.outstandingQuantity)
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
        cell: ({ row }) =>
          row.original.status === "DRAFT" ? (
            <button
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-stone-300"
              disabled={poSubmitting}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void commitPurchaseOrder(row.original.purchaseOrderId);
              }}
              type="button"
            >
              Push
            </button>
          ) : (
            <span className="text-xs font-semibold text-stone-500">Synced</span>
          )
      }
    ],
    [poSubmitting]
  );

  const interStoreTransferColumns = useMemo<ColumnDef<InterStoreTransferHeaderRow>[]>(
    () => [
      {
        accessorKey: "transferNo",
        header: "Transfer number",
        cell: ({ row }) => {
          const detailHref = `${transferDetailBaseHref}?openTransfer=${encodeURIComponent(row.original.transferKey)}`;

          return (
            <div className="min-w-0">
              <a
                className="truncate font-semibold text-[var(--brand)] underline-offset-4 transition hover:text-[var(--brand-deep)] hover:underline"
                href={detailHref}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  router.push(detailHref);
                  prepareTransferForEdit(row.original);
                }}
              >
                {row.original.transferKey}
              </a>
              <p className="truncate text-xs text-stone-500">
                {row.original.lineCount} detail line{row.original.lineCount === 1 ? "" : "s"}
              </p>
            </div>
          );
        },
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "externalReference",
        header: "Reference",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.externalReference ?? "No reference"}
            </p>
            <p className="truncate text-xs text-stone-500">
              Required {row.original.requiredAtLabel}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "vehicleRegistrationNo",
        header: "Logistics",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.vehicleRegistrationNo ?? row.original.deliveryNoteNo ?? "Not set"}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.driverName ?? row.original.driverContact ?? row.original.transporterName ?? "No driver"}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "sourceLocationName",
        header: "From",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.sourceStoreName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.sourceLocationName} ({row.original.sourceLocationCode})
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "destinationLocationName",
        header: "To",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.destinationStoreName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.destinationLocationName} ({row.original.destinationLocationCode})
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "statusLabel",
        header: "Status",
        cell: ({ row }) => (
          <span className="inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
            {row.original.statusLabel}
          </span>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "feedbackStatus",
        header: "Feedback",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.feedbackStatus ?? "PENDING"}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.feedbackVarianceQuantity === null
                ? row.original.feedbackRecordedAtLabel
                : `Variance ${quantityFormatter.format(row.original.feedbackVarianceQuantity)}`}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) =>
          row.original.isDraftBatch ? (
            <div className="flex gap-2">
              <button
                className="rounded-lg border border-[var(--brand)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--brand)] disabled:border-stone-200 disabled:text-stone-400"
                disabled={transferSubmitting}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  prepareTransferForEdit(row.original);
                }}
                type="button"
              >
                Edit
              </button>
              <button
                className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:bg-stone-300"
                disabled={committingTransferBatchNo === (row.original.transferBatchNo ?? row.original.transferNo)}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void commitInterStoreDraft(row.original);
                }}
                type="button"
              >
                {committingTransferBatchNo === (row.original.transferBatchNo ?? row.original.transferNo)
                  ? "Committing"
                  : "Commit"}
              </button>
            </div>
          ) : (
            <button
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                prepareTransferForEdit(row.original);
              }}
              type="button"
            >
              Open
            </button>
          )
      }
    ],
    [committingTransferBatchNo, prepareTransferForEdit, router, transferDetailBaseHref, transferSubmitting]
  );

  const stockCountSessionColumns = useMemo<ColumnDef<StockCountSessionRow>[]>(
    () => [
      {
        accessorKey: "sessionNo",
        header: "Count",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.sessionNo}</p>
            <p className="truncate text-xs text-stone-500">{row.original.statusLabel}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "locationName",
        header: "Shop / location",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.storeName ?? row.original.storeCode ?? "Unassigned"}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.locationName} ({row.original.locationCode})
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "productName",
        header: "Item",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.productName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.productCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "previousQuantity",
        header: "System",
        cell: ({ row }) => quantityFormatter.format(row.original.previousQuantity)
      },
      {
        accessorKey: "countedQuantity",
        header: "Counted",
        cell: ({ row }) => quantityFormatter.format(row.original.countedQuantity)
      },
      {
        accessorKey: "varianceQuantity",
        header: "Variance",
        cell: ({ row }) => (
          <span
            className={`rounded-full px-2 py-1 text-xs font-semibold ${
              row.original.varianceQuantity < 0
                ? "bg-rose-50 text-rose-700"
                : row.original.varianceQuantity > 0
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-sky-50 text-sky-700"
            }`}
          >
            {quantityFormatter.format(row.original.varianceQuantity)}
          </span>
        )
      },
      {
        accessorKey: "submittedAtLabel",
        header: "Submitted",
        cell: ({ row }) => renderTimestamp(row.original.submittedAt, row.original.submittedAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const movementColumns = useMemo<ColumnDef<MovementRow>[]>(
    () => [
      {
        accessorKey: "occurredAtLabel",
        header: "Occurred",
        cell: ({ row }) => renderTimestamp(row.original.occurredAt, row.original.occurredAtLabel),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "productName",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.productName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.productCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "locationName",
        header: "Location",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.locationName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.locationCode}
              {row.original.storeName ? ` • ${row.original.storeName}` : ""}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "movementType",
        header: "Movement"
      },
      {
        accessorKey: "quantity",
        header: "Quantity",
        cell: ({ row }) => quantityFormatter.format(row.original.quantity)
      },
      {
        accessorKey: "referenceLabel",
        header: "Reference",
        meta: { disableTruncate: true }
      }
    ],
    []
  );
  const serialLookupColumns = useMemo<ColumnDef<SerialLookupRow>[]>(
    () => [
      {
        accessorKey: "occurredAtLabel",
        header: "Occurred",
        cell: ({ row }) => renderTimestamp(row.original.occurredAt, row.original.occurredAtLabel),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "serialNumber",
        header: "Serial",
        cell: ({ row }) => <SerialChip serialNumber={row.original.serialNumber} />,
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "productName",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.productName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.productCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "locationName",
        header: "Location",
        accessorFn: (row) =>
          [
            row.storeName ?? row.storeCode ?? "",
            row.locationName ?? row.locationCode ?? "",
            row.targetLocationName ?? row.targetLocationCode ?? ""
          ]
            .filter(Boolean)
            .join(" "),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.locationName ?? row.original.locationCode ?? "Location pending"}
              {row.original.targetLocationName || row.original.targetLocationCode
                ? ` -> ${row.original.targetLocationName ?? row.original.targetLocationCode}`
                : ""}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.storeName ?? row.original.storeCode ?? "Store context pending"}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "activityLabel",
        header: "Activity",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.activityLabel}</p>
            <p className="truncate text-xs text-stone-500">{row.original.sourceType}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "referenceLabel",
        header: "Reference",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-stone-900">{row.original.referenceLabel}</p>
            {row.original.statusLabel ? (
              <p className="truncate text-xs text-stone-500">{row.original.statusLabel}</p>
            ) : null}
          </div>
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );
  const supplierClaimColumns = useMemo<ColumnDef<SupplierClaimRow>[]>(
    () => [
      {
        accessorKey: "createdAtLabel",
        header: "Opened",
        cell: ({ row }) => renderTimestamp(row.original.createdAt, row.original.createdAtLabel),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "claimNo",
        header: "Claim",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.claimNo}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.supplierCaseReference
                ? `Case ${row.original.supplierCaseReference}`
                : "Supplier case pending"}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "supplierName",
        header: "Supplier",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.supplierName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.supplierNo}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "locationName",
        header: "Location",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.locationName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.storeName ?? row.original.storeCode ?? "Unassigned"} •{" "}
              {row.original.locationCode}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "statusLabel",
        header: "Status",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.statusLabel}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.creditRequestedAt
                ? `Requested ${row.original.creditRequestedAtLabel}`
                : `${row.original.ageDays} day${row.original.ageDays === 1 ? "" : "s"} open`}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "claimAmount",
        header: "Claimed",
        cell: ({ row }) => currencyFormatter.format(row.original.claimAmount)
      },
      {
        accessorKey: "creditAmount",
        header: "Credited",
        cell: ({ row }) =>
          row.original.creditAmount === null
            ? "Pending"
            : currencyFormatter.format(row.original.creditAmount)
      },
      {
        accessorKey: "remainingAmount",
        header: "Gap",
        cell: ({ row }) => currencyFormatter.format(row.original.remainingAmount)
      }
    ],
    [currencyFormatter]
  );
  const supplierReturnColumns = useMemo<ColumnDef<SupplierReturnRow>[]>(
    () => [
      {
        accessorKey: "returnedAtLabel",
        header: "Returned",
        cell: ({ row }) => renderTimestamp(row.original.returnedAt, row.original.returnedAtLabel),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "supplierReturnNo",
        header: "Return",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.supplierReturnNo}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.goodsReceiptNo
                ? `Against ${row.original.goodsReceiptNo}`
                : row.original.purchaseOrderNo ?? "No source document"}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "supplierName",
        header: "Supplier",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.supplierName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.supplierNo}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "locationName",
        header: "Location",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.locationName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.storeName ?? row.original.storeCode ?? "Unassigned"} •{" "}
              {row.original.locationCode}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "reasonLabel",
        header: "Reason"
      },
      {
        accessorKey: "statusLabel",
        header: "Status"
      },
      {
        accessorKey: "cancellationAcknowledgedAtLabel",
        header: "Restored locally",
        cell: ({ row }) => {
          if (row.original.status !== "CANCELLED") {
            return "Not applicable";
          }

          if (row.original.cancellationAcknowledgedAt) {
            return renderTimestamp(
              row.original.cancellationAcknowledgedAt,
              row.original.cancellationAcknowledgedAtLabel
            );
          }

          return (
            <span className="text-xs font-medium text-amber-700">
              Waiting for branch confirm
            </span>
          );
        },
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "totalQuantity",
        header: "Quantity",
        cell: ({ row }) => quantityFormatter.format(row.original.totalQuantity)
      },
      {
        accessorKey: "totalValue",
        header: "Value",
        cell: ({ row }) => currencyFormatter.format(row.original.totalValue)
      }
    ],
    [currencyFormatter]
  );

  const transferRequestPanel = (
    <article className="glass-panel rounded-[1.2rem] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            Transfer request
          </p>
          <h3 className="mt-1 text-base font-semibold text-stone-950">
            Header and line entry
          </h3>
          <p className="mt-1 text-sm text-stone-600">
            Save a request as draft for review, or commit it when the shop should issue and receive it.
          </p>
        </div>
        <ActionDialog
          description="Header captures source, destination, logistics, reference, required date, and note; Content captures the item lines."
          onOpenChange={(open) => {
            if (open) {
              openNewTransferDialog();
            } else {
              setTransferDialogOpen(false);
              resetTransferDraft();
            }
          }}
          open={transferDialogOpen}
          title={
            isTransferDialogReadOnly
              ? "View transfer request"
              : editingTransferBatchNo
                ? "Edit transfer request"
                : "Create transfer request"
          }
          triggerClassName="border-[var(--brand)] bg-[var(--brand)] text-white hover:border-[var(--brand-deep)] hover:bg-[var(--brand-deep)] hover:text-white"
          triggerIcon={Plus}
          triggerLabel="New transfer request"
          widthClassName="max-w-6xl"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["header", "details"] as const).map((tab) => (
                <button
                  className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                    activeTransferEntryTab === tab
                      ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                      : "border-stone-200 bg-white text-stone-700"
                  }`}
                  key={tab}
                  onClick={() => setActiveTransferEntryTab(tab)}
                  type="button"
                >
                  {tab === "header" ? "Header" : "Content"}
                </button>
              ))}
            </div>

            {activeTransferEntryTab === "header" ? (
              <div className="grid gap-3 lg:grid-cols-3">
                <label className="grid gap-1 text-sm font-semibold text-stone-700">
                  Ship from
                  <select
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferDialogReadOnly}
                    onChange={(event) => setTransferSourceLocation(event.target.value)}
                    value={transferSourceLocation}
                  >
                    <option value="">Source shop/location</option>
                    {interStoreLocationOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-semibold text-stone-700">
                  Ship to
                  <select
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferDialogReadOnly}
                    onChange={(event) => setTransferDestinationLocation(event.target.value)}
                    value={transferDestinationLocation}
                  >
                    <option value="">Destination shop/location</option>
                    {interStoreLocationOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-semibold text-stone-700">
                  Reference
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferDialogReadOnly}
                    onChange={(event) => setTransferReference(event.target.value)}
                    placeholder="Optional reference"
                    value={transferReference}
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-stone-700">
                  Required date
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferDialogReadOnly}
                    onChange={(event) => setTransferRequiredAt(event.target.value)}
                    type="date"
                    value={transferRequiredAt}
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-stone-700">
                  Delivery note / waybill
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferDialogReadOnly}
                    onChange={(event) => setTransferDeliveryNoteNo(event.target.value)}
                    placeholder="Waybill or delivery note"
                    value={transferDeliveryNoteNo}
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-stone-700">
                  Transporter
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferDialogReadOnly}
                    onChange={(event) => setTransferTransporterName(event.target.value)}
                    placeholder="Transport company"
                    value={transferTransporterName}
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-stone-700">
                  Vehicle number
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferDialogReadOnly}
                    onChange={(event) => setTransferVehicleRegistrationNo(event.target.value)}
                    placeholder="Vehicle registration"
                    value={transferVehicleRegistrationNo}
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-stone-700">
                  Driver name
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferDialogReadOnly}
                    onChange={(event) => setTransferDriverName(event.target.value)}
                    placeholder="Driver name"
                    value={transferDriverName}
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-stone-700">
                  Driver contact
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferDialogReadOnly}
                    onChange={(event) => setTransferDriverContact(event.target.value)}
                    placeholder="Phone number"
                    value={transferDriverContact}
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-stone-700 lg:col-span-3">
                  Note
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferDialogReadOnly}
                    onChange={(event) => setTransferNote(event.target.value)}
                    placeholder="Reason, customer demand, or delivery instruction"
                    value={transferNote}
                  />
                </label>
                {editingTransferFeedback ? (
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 lg:col-span-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                      Feedback
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-4">
                      <div>
                        <span className="text-xs text-stone-500">Status</span>
                        <p className="text-sm font-semibold text-stone-900">
                          {editingTransferFeedback.feedbackStatus}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-stone-500">Water test</span>
                        <p className="text-sm font-semibold text-stone-900">
                          {editingTransferFeedback.waterTestResult ?? "Not captured"}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-stone-500">Actual received</span>
                        <p className="text-sm font-semibold text-stone-900">
                          {editingTransferFeedback.actualQuantityReceived === null
                            ? "Not captured"
                            : quantityFormatter.format(editingTransferFeedback.actualQuantityReceived)}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-stone-500">Variance</span>
                        <p className="text-sm font-semibold text-stone-900">
                          {editingTransferFeedback.feedbackVarianceQuantity === null
                            ? "Not captured"
                            : quantityFormatter.format(editingTransferFeedback.feedbackVarianceQuantity)}
                        </p>
                      </div>
                    </div>
                    {editingTransferFeedback.feedbackNote ? (
                      <p className="mt-3 text-sm text-stone-600">
                        {editingTransferFeedback.feedbackNote}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_8rem_auto]">
                  <select
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferDialogReadOnly}
                    onChange={(event) => setTransferProductCode(event.target.value)}
                    value={transferProductCode}
                  >
                    <option value="">Item</option>
                    {interStoreProductOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferDialogReadOnly}
                    min="0.001"
                    onChange={(event) => setTransferQuantity(event.target.value)}
                    step="0.001"
                    type="number"
                    value={transferQuantity}
                  />
                  <button
                    className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                    disabled={!transferProductCode || transferSubmitting || isTransferDialogReadOnly}
                    onClick={addTransferLine}
                    type="button"
                  >
                    Add line
                  </button>
                </div>
                <div className="rounded-2xl border border-stone-200">
                  {transferLines.length ? (
                    transferLines.map((line) => (
                      <div
                        className="grid grid-cols-[minmax(0,1fr)_8rem_auto] items-center gap-3 border-b border-stone-100 px-4 py-3 last:border-b-0"
                        key={line.id}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-stone-950">{line.productName}</p>
                          <p className="truncate text-xs text-stone-500">{line.productCode}</p>
                        </div>
                        <span className="text-right text-sm font-semibold text-stone-800">
                          {quantityFormatter.format(line.quantity)}
                        </span>
                        <button
                          className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700"
                          disabled={isTransferDialogReadOnly}
                          onClick={() =>
                            setTransferLines((currentLines) =>
                              currentLines.filter((currentLine) => currentLine.id !== line.id)
                            )
                          }
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="px-4 py-6 text-sm text-stone-500">
                      Add the transfer request lines before saving or committing.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap gap-3 text-sm text-stone-600">
                <span>{numberFormatter.format(transferLines.length)} line(s)</span>
                <span>
                  {quantityFormatter.format(
                    transferLines.reduce((sum, line) => sum + line.quantity, 0)
                  )}{" "}
                  requested
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 disabled:bg-stone-100"
                  disabled={!canSaveInterStoreRequest}
                  onClick={() => void saveInterStoreRequest(true)}
                  title={interStoreRequestBlockReason || undefined}
                  type="button"
                >
                  {transferSubmitting ? "Saving" : "Save draft"}
                </button>
                <button
                  className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:bg-stone-300"
                  disabled={!canSaveInterStoreRequest}
                  onClick={() => void saveInterStoreRequest(false)}
                  title={interStoreRequestBlockReason || undefined}
                  type="button"
                >
                  {transferSubmitting ? "Committing" : "Commit request"}
                </button>
              </div>
            </div>
            {interStoreRequestBlockReason && !transferSubmitting ? (
              <p className="text-xs font-medium text-stone-500">{interStoreRequestBlockReason}</p>
            ) : null}
            {transferStatus.message ? (
              <p
                className={`text-sm font-semibold ${
                  transferStatus.tone === "error" ? "text-rose-700" : "text-emerald-700"
                }`}
              >
                {transferStatus.message}
              </p>
            ) : null}
          </div>
        </ActionDialog>
      </div>
      {transferStatus.message ? (
        <p
          className={`mt-3 text-sm font-medium ${
            transferStatus.tone === "error" ? "text-rose-700" : "text-emerald-700"
          }`}
        >
          {transferStatus.message}
        </p>
      ) : null}
    </article>
  );

  return (
    <EnterpriseShell
      activeSection="inventory"
      description={
        pageDescription ??
        "Review stock posture, inventory locations, and recent canonical ledger movements across the Flash ERP enterprise estate."
      }
      eyebrow="Flash ERP enterprise"
      heading={pageHeading ?? "Inventory"}
    >
      <section className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          hint="Warehouses currently active in Flash ERP enterprise."
          icon={Store}
          label="Warehouses"
          value={numberFormatter.format(workspace.metrics.warehouses)}
        />
        <MetricCard
          hint="Inventory locations currently available for retail stock posture."
          icon={Boxes}
          label="Locations"
          value={numberFormatter.format(workspace.metrics.locations)}
        />
        <MetricCard
          hint="Products that currently hold positive on-hand stock in canonical enterprise inventory."
          icon={Package}
          label="Products with stock"
          value={numberFormatter.format(workspace.metrics.productsWithStock)}
        />
        <MetricCard
          hint="Product-location balances currently below zero and needing operator review."
          icon={Activity}
          label="Negative positions"
          value={numberFormatter.format(workspace.metrics.negativePositions)}
        />
      </section>

      <WorkspaceTabs
        ariaLabel="Enterprise inventory views"
        chromeClassName={dedicatedView ? "hidden" : undefined}
        className={dedicatedView ? "mt-0" : undefined}
        defaultValue={defaultView}
        summaries={{
          locations:
            "Inspect each inventory location, its store and warehouse context, and the latest canonical movement cadence.",
          products:
            "See which products hold stock, where they are active, and the current estimated retail value of that inventory posture.",
          stock:
            "Filter one shop to see every product quantity there, or filter one product to see its stock across all shops and locations.",
          exceptions:
            "Track supplier claims, returns, and unsettled vendor exposure across stores and receiving locations from one HQ lane.",
          serials:
            "Search recent serialized activity across stores, locations, posted receipts, and enterprise-issued stock-control tasks from one HQ workspace.",
          movements:
            "Follow the latest inventory ledger entries and jump directly into canonical movement detail when something looks off.",
          posture:
            "Review the immediate stock-control signals that matter most before adding transfers, counts, and receiving workflows."
        }}
        tabs={[
          { value: "locations", label: "Locations", badge: "Live", badgeTone: "success" },
          { value: "products", label: "Products" },
          { value: "stock", label: "Item Dynamic" },
          {
            value: "transfers",
            label: "Transfers",
            badge:
              interStoreTransferHeaderRows.filter((row) => row.status !== "RECEIVED" && row.status !== "CLOSED").length > 0
                ? String(Math.min(interStoreTransferHeaderRows.filter((row) => row.status !== "RECEIVED" && row.status !== "CLOSED").length, 99))
                : null,
            badgeTone: "warning"
          },
          {
            value: "in-transit",
            label: "In Transit",
            badge:
              interStoreTransferHeaderRows.filter((row) => row.inTransitQuantity > 0).length > 0
                ? String(Math.min(interStoreTransferHeaderRows.filter((row) => row.inTransitQuantity > 0).length, 99))
                : null,
            badgeTone: "warning"
          },
          {
            value: "counts",
            label: "Stock Counts",
            badge:
              workspace.stockCountSessionRows.filter((row) => row.status !== "COMMITTED").length > 0
                ? String(Math.min(workspace.stockCountSessionRows.filter((row) => row.status !== "COMMITTED").length, 99))
                : null,
            badgeTone: "warning"
          },
          {
            value: "exceptions",
            label: "Exceptions",
            badge:
              workspace.metrics.openSupplierClaims > 0
                ? String(Math.min(workspace.metrics.openSupplierClaims, 99))
                : null,
            badgeTone: "warning"
          },
          {
            value: "serials",
            label: "Serial Lookup",
            badge:
              workspace.serialLookupRows.length > 0
                ? String(Math.min(workspace.serialLookupRows.length, 99))
                : null,
            badgeTone: "warning"
          },
          { value: "movements", label: "Movements" },
          { value: "posture", label: "Posture" }
        ]}
      >
        <WorkspaceTabsContent value="locations">
          <SharedDataGrid
            columns={locationColumns}
            data={workspace.locationRows}
            emptyLabel="No inventory locations are provisioned in Flash ERP enterprise yet."
            exportFileName="flash-erp-inventory-locations"
            getRowHref={(row) => `/inventory/locations/${encodeURIComponent(row.locationCode)}`}
            globalFilterFn={locationFilter}
            searchPlaceholder="Search locations by code, store, warehouse, type, or default mode"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="products">
          <SharedDataGrid
            columns={productColumns}
            data={workspace.productRows}
            emptyLabel="No products are available for canonical inventory posture yet."
            exportFileName="flash-erp-inventory-products"
            getRowHref={(row) => `/catalog/products/${encodeURIComponent(row.productCode)}`}
            globalFilterFn={productFilter}
            searchPlaceholder="Search stocked products by code, SKU, name, or status"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="stock">
          <section className="space-y-4">
            <SharedDataGrid
              columns={stockPositionColumns}
              data={filteredStockPositionRows}
              emptyLabel="No shop inventory rows are available yet."
              exportFileName="flash-erp-stock-by-shop"
              getRowHref={(row) => `/inventory/locations/${encodeURIComponent(row.locationCode)}`}
              globalFilterFn={stockPositionFilter}
              hideSearch
              initialPageSize={25}
              pageSizeOptions={[25, 50, 100]}
              searchPlaceholder="Optional text search"
              toolbarFilters={
                <>
                  <select
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setStockShopFilter(event.target.value)}
                    value={stockShopFilter}
                  >
                    <option value="">All shops and locations</option>
                    {stockShopOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setStockProductFilter(event.target.value)}
                    value={stockProductFilter}
                  >
                    <option value="">All products</option>
                    {stockProductOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </>
              }
            />
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="purchasing">
          <section className="space-y-4">
            <article className="glass-panel rounded-[1.2rem] p-4">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_8rem_8rem_auto]">
                <select
                  className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                  onChange={(event) => setPoLocationCode(event.target.value)}
                  value={poLocationCode}
                >
                  <option value="">Receiving shop/location</option>
                  {receivingLocationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                  list="flash-erp-suppliers"
                  onChange={(event) => setPoSupplierNo(event.target.value)}
                  placeholder="Supplier no"
                  value={poSupplierNo}
                />
                <datalist id="flash-erp-suppliers">
                  {supplierOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </datalist>
                <div className="grid gap-2">
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => {
                      setPoProductSearch(event.target.value);
                      setPoProductCode("");
                    }}
                    placeholder="Search product, code, or SKU"
                    value={poProductSearch}
                  />
                  <select
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setPoProductCode(event.target.value)}
                    value={poProductCode}
                  >
                    <option value="">
                      {filteredPoProductOptions.length ? "Item" : "No matching products"}
                    </option>
                    {filteredPoProductOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                  min="0.001"
                  onChange={(event) => setPoQuantity(event.target.value)}
                  step="0.001"
                  type="number"
                  value={poQuantity}
                />
                <input
                  className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                  min="0"
                  onChange={(event) => setPoUnitCost(event.target.value)}
                  placeholder="Unit cost"
                  step="0.01"
                  type="number"
                  value={poUnitCost}
                />
                <button
                  className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                  disabled={!poProductCode || poSubmitting}
                  onClick={addPurchaseOrderLine}
                  type="button"
                >
                  Add line
                </button>
              </div>
              <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto_auto]">
                <input
                  className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                  onChange={(event) => setPoReference(event.target.value)}
                  placeholder="PO reference"
                  value={poReference}
                />
                <input
                  className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                  onChange={(event) => setPoNote(event.target.value)}
                  placeholder="Title or purchasing note"
                  value={poNote}
                />
                <button
                  className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:bg-stone-100"
                  disabled={!canSavePurchaseOrder}
                  onClick={() => void savePurchaseOrder(false)}
                  type="button"
                >
                  Save draft
                </button>
                <button
                  className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:bg-stone-300"
                  disabled={!canSavePurchaseOrder}
                  onClick={() => void savePurchaseOrder(true)}
                  type="button"
                >
                  Push to shop
                </button>
              </div>
              {poLines.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {poLines.map((line) => (
                    <span
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900"
                      key={line.id}
                    >
                      {line.productName} - {quantityFormatter.format(line.quantity)}
                      {line.unitCost === null ? "" : ` @ ${currencyFormatter.format(line.unitCost)}`}
                      <button
                        className="text-emerald-700 hover:text-emerald-950"
                        onClick={() =>
                          setPoLines((currentLines) =>
                            currentLines.filter((currentLine) => currentLine.id !== line.id)
                          )
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              {poStatus.message ? (
                <p
                  className={`mt-3 text-sm font-medium ${
                    poStatus.tone === "error" ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  {poStatus.message}
                </p>
              ) : null}
            </article>

            <SharedDataGrid
              columns={purchaseOrderColumns}
              data={workspace.purchaseOrderRows}
              emptyLabel="No purchase orders are available yet."
              exportFileName="flash-erp-purchase-orders"
              getRowHref={(row) => row.href}
              globalFilterFn={purchaseOrderFilter}
              initialPageSize={20}
              pageSizeOptions={[20, 50, 100]}
              searchPlaceholder="Search PO, supplier, receiving shop, location, or status"
            />
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="transfers">
          <section className="space-y-4">
            {transferRequestPanel}
            <SharedDataGrid
              columns={interStoreTransferColumns}
              data={interStoreTransferHeaderRows}
              emptyLabel="No inter-store transfer instructions are available yet."
              exportFileName="flash-erp-inter-store-transfers"
              getRowHref={(row) => `/inventory/locations/${encodeURIComponent(row.sourceLocationCode)}`}
              globalFilterFn={interStoreTransferFilter}
              initialPageSize={25}
              pageSizeOptions={[25, 50, 100]}
              searchPlaceholder="Search transfer, source, destination, item, status, or node"
            />
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="in-transit">
          <SharedDataGrid
            columns={interStoreTransferColumns}
            data={interStoreTransferHeaderRows.filter((row) => row.inTransitQuantity > 0)}
            emptyLabel="No inter-store stock is currently in transit."
            exportFileName="flash-erp-in-transit-transfers"
            getRowHref={(row) => `/inventory/locations/${encodeURIComponent(row.destinationLocationCode)}`}
            globalFilterFn={interStoreTransferFilter}
            initialPageSize={25}
            pageSizeOptions={[25, 50, 100]}
            searchPlaceholder="Search in-transit transfer, destination shop, item, or status"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="counts">
          <SharedDataGrid
            columns={stockCountSessionColumns}
            data={workspace.stockCountSessionRows}
            emptyLabel="No stock count sessions have synced to HQ yet."
            exportFileName="flash-erp-stock-count-sessions"
            globalFilterFn={stockCountSessionFilter}
            initialPageSize={25}
            pageSizeOptions={[25, 50, 100]}
            searchPlaceholder="Search count, shop, location, item, or status"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="exceptions">
          <section className="space-y-4">
            <section className="grid gap-4 xl:grid-cols-4">
              <MetricCard
                hint="Supplier claims that are not yet written off or closed."
                icon={Activity}
                label="Open claims"
                value={numberFormatter.format(workspace.metrics.openSupplierClaims)}
              />
              <MetricCard
                hint="Claims already in formal credit-request posture with the supplier."
                icon={Package}
                label="Credit requested"
                value={numberFormatter.format(workspace.metrics.creditRequestedClaims)}
              />
              <MetricCard
                hint="Outstanding supplier-claim value still exposed across unsettled cases."
                icon={Boxes}
                label="Exposure"
                value={currencyFormatter.format(workspace.metrics.supplierClaimExposureAmount)}
              />
              <MetricCard
                hint="Supplier returns already posted as physical vendor-return evidence."
                icon={Store}
                label="Returns posted"
                value={numberFormatter.format(workspace.metrics.postedSupplierReturns)}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,1fr)]">
              <div className="space-y-4">
                <article className="glass-panel rounded-[1.35rem] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                    Supplier claims
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Work claim aging, requested credit posture, and financial gaps from one
                    enterprise review lane, then jump into the source location for deeper action.
                  </p>
                  <div className="mt-4">
                    <SharedDataGrid
                      columns={supplierClaimColumns}
                      data={workspace.supplierClaimRows}
                      emptyLabel="No supplier claims are available in Flash ERP yet."
                      exportFileName="flash-erp-supplier-claims"
                      getRowHref={(row) => row.href}
                      globalFilterFn={supplierClaimFilter}
                      initialPageSize={12}
                      pageSizeOptions={[12, 24, 48]}
                      searchPlaceholder="Search claim, supplier, location, status, PO, GRN, or supplier case"
                    />
                  </div>
                </article>

                <article className="glass-panel rounded-[1.35rem] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                    Supplier returns
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Review the physical stock that has already been routed back to vendors so the
                    financial claim posture can stay tied to an operational return trail.
                  </p>
                  <div className="mt-4">
                    <SharedDataGrid
                      columns={supplierReturnColumns}
                      data={workspace.supplierReturnRows}
                      emptyLabel="No supplier returns are available in Flash ERP yet."
                      exportFileName="flash-erp-supplier-returns"
                      getRowHref={(row) => row.href}
                      globalFilterFn={supplierReturnFilter}
                      initialPageSize={8}
                      pageSizeOptions={[8, 16, 32]}
                      searchPlaceholder="Search return, supplier, location, reason, PO, or GRN"
                    />
                  </div>
                </article>
              </div>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Exception posture
                </p>
                <div className="mt-4 space-y-3">
                  {workspace.exceptionPostureMessages.map((message) => (
                    <div
                      className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
                      key={message}
                    >
                      {message}
                    </div>
                  ))}
                </div>
              </article>
            </section>
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="serials">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,1fr)]">
            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Enterprise serial inquiry
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Search one serial directly across recent posted receipts and enterprise-issued
                serialized stock-control tasks. When a row came from a posted basket, Flash ERP can
                jump straight into the receipt detail.
              </p>
              <div className="mt-4">
                <SharedDataGrid
                  columns={serialLookupColumns}
                  data={workspace.serialLookupRows}
                  emptyLabel="No recent serialized activity is available for enterprise lookup yet."
                  exportFileName="flash-erp-enterprise-serial-lookup"
                  getRowHref={(row) => row.href}
                  globalFilterFn={serialLookupFilter}
                  initialPageSize={12}
                  pageSizeOptions={[12, 24, 48]}
                  searchPlaceholder="Search serial, product, store, location, task, or receipt reference"
                />
              </div>
            </article>

            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Serial posture
              </p>
              <div className="mt-4 space-y-3">
                {workspace.serialPostureMessages.map((message) => (
                  <div
                    className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800"
                    key={message}
                  >
                    {message}
                  </div>
                ))}
              </div>
            </article>
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="movements">
          <SharedDataGrid
            columns={movementColumns}
            data={workspace.movementRows}
            emptyLabel="No inventory ledger entries are available yet."
            exportFileName="flash-erp-inventory-movements"
            getRowHref={(row) => `/operations/inventory/${encodeURIComponent(row.entryId)}`}
            globalFilterFn={movementFilter}
            searchPlaceholder="Search movements by product, location, store, type, or reference"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="posture">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,1fr)]">
            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Inventory posture
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
            </div>

            <article className="glass-panel rounded-[1.35rem] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                    Immediate priorities
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Last refreshed {new Date(workspace.refreshedAt).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-full border border-stone-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-600">
                  Inventory
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
        <p className="text-sm leading-6 text-stone-600">{workspace.statusMessage}</p>
      </section>
    </EnterpriseShell>
  );
}
