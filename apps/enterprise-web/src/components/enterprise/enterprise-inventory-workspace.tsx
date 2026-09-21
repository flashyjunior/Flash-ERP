"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import { Activity, Boxes, Package, PackageCheck, Plus, Store } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import { matchesInventorySearchTerms } from "@/components/enterprise/enterprise-inventory-search";
import type {
  EnterpriseInventorySerialDetailResponse,
  EnterpriseInventoryWorkspaceData
} from "@/server/repositories/enterprise-inventory.repository";

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

function productCatalogHref(productCode: string) {
  return `/catalog/products/${encodeURIComponent(productCode)}`;
}

function inventoryLocationHref(locationCode: string) {
  return `/inventory/locations/${encodeURIComponent(locationCode)}`;
}

/**
 * Inventory drill-down: clicking a product row or a shop stock position opens
 * the same serial / batch-expiry detail the store desktop and Online POS screens
 * already show. Detail is fetched on demand from /api/inventory/serial-detail so
 * the page payload stays unchanged regardless of serialized catalogue size.
 */
type InventoryDrillDownTarget = {
  productCode: string;
  productName: string;
  locationCode: string | null;
  locationName: string | null;
  onHandQuantity: number;
  isSerialized: boolean;
  trackExpiry: boolean;
};

const inventorySerialStatusOptions = [
  { value: "ALL", label: "All statuses" },
  { value: "AVAILABLE", label: "Available" },
  { value: "SOLD", label: "Sold" },
  { value: "IN_TRANSIT", label: "In transit" },
  { value: "ADJUSTED_OUT", label: "Adjusted out" }
];

function formatSerialStatus(status: string) {
  return status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (character) => character.toUpperCase());
}

function InventoryDetailPill({
  tone = "neutral",
  children
}: {
  tone?: "good" | "warning" | "neutral";
  children: ReactNode;
}) {
  const toneClassName =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-stone-200 bg-white/90 text-stone-700";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${toneClassName}`}
    >
      {children}
    </span>
  );
}

function renderTrackingBadges(
  row: { isSerialized: boolean; trackExpiry: boolean },
  untrackedHint = "Select the row for its usual detail"
) {
  const isTracked = row.isSerialized || row.trackExpiry;

  return (
    <div className="min-w-0">
      {isTracked ? (
        <div className="flex flex-wrap gap-1.5">
          {row.isSerialized ? (
            <InventoryDetailPill tone="good">Serialised</InventoryDetailPill>
          ) : null}
          {row.trackExpiry ? (
            <InventoryDetailPill tone="warning">Batch / expiry</InventoryDetailPill>
          ) : null}
        </div>
      ) : (
        <span className="text-sm text-stone-400">Not tracked</span>
      )}
      <p className="mt-0.5 truncate text-xs text-stone-500">
        {isTracked ? "Select the row to open serial and batch detail" : untrackedHint}
      </p>
    </div>
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
  const serializedSearchParams = searchParams.toString();
  const updateProductQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(serializedSearchParams);
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      const query = params.toString();
      router.push(query ? `/inventory/products?${query}` : "/inventory/products", {
        scroll: false
      });
    },
    [router, serializedSearchParams]
  );
  const changeProductPage = useCallback(
    (page: number) => updateProductQuery({ p: String(page) }),
    [updateProductQuery]
  );
  const changeProductPageSize = useCallback(
    (pageSize: number) => updateProductQuery({ p: null, ps: String(pageSize) }),
    [updateProductQuery]
  );
  const changeProductSearch = useCallback(
    (search: string) => updateProductQuery({ p: null, q: search || null }),
    [updateProductQuery]
  );
  const [stockShopFilter, setStockShopFilter] = useState("");
  const [stockProductFilter, setStockProductFilter] = useState("");

  const [inventoryDrillDown, setInventoryDrillDown] = useState<InventoryDrillDownTarget | null>(
    null
  );
  const [inventoryDrillDownTab, setInventoryDrillDownTab] = useState<"serials" | "batches">(
    "serials"
  );
  const [inventoryDrillDownSerialStatus, setInventoryDrillDownSerialStatus] = useState("ALL");
  const [inventoryDrillDownDetail, setInventoryDrillDownDetail] =
    useState<EnterpriseInventorySerialDetailResponse | null>(null);
  const [inventoryDrillDownLoading, setInventoryDrillDownLoading] = useState(false);
  const [inventoryDrillDownError, setInventoryDrillDownError] = useState<string | null>(null);
  const inventoryDrillDownRequestRef = useRef(0);

  const loadInventoryDrillDownDetail = useCallback(
    async (target: InventoryDrillDownTarget) => {
      const params = new URLSearchParams({ productCode: target.productCode });

      if (target.locationCode) {
        params.set("locationCode", target.locationCode);
      }

      const requestId = inventoryDrillDownRequestRef.current + 1;

      inventoryDrillDownRequestRef.current = requestId;
      setInventoryDrillDownLoading(true);
      setInventoryDrillDownError(null);

      try {
        const response = await fetch(`/api/inventory/serial-detail?${params.toString()}`, {
          cache: "no-store"
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            payload && typeof payload === "object" && typeof payload.message === "string"
              ? payload.message
              : `Flash ERP could not load serial and batch detail (HTTP ${response.status}).`;

          throw new Error(message);
        }

        if (inventoryDrillDownRequestRef.current !== requestId) {
          return;
        }

        setInventoryDrillDownDetail(payload as EnterpriseInventorySerialDetailResponse);
      } catch (error) {
        if (inventoryDrillDownRequestRef.current !== requestId) {
          return;
        }

        setInventoryDrillDownDetail(null);
        setInventoryDrillDownError(
          error instanceof Error
            ? error.message
            : "Flash ERP could not load serial and batch detail."
        );
      } finally {
        if (inventoryDrillDownRequestRef.current === requestId) {
          setInventoryDrillDownLoading(false);
        }
      }
    },
    []
  );

  const openInventoryDrillDown = useCallback(
    (target: InventoryDrillDownTarget) => {
      if (!target.isSerialized && !target.trackExpiry) {
        return;
      }

      // Mirrors the store desktop and Online POS behaviour: serialised items land
      // on the serial tab, everything else on batches, and the status filter
      // resets so a reopened panel never inherits a stale narrowing.
      setInventoryDrillDown(target);
      setInventoryDrillDownTab(target.isSerialized ? "serials" : "batches");
      setInventoryDrillDownSerialStatus("ALL");
      setInventoryDrillDownDetail(null);
      void loadInventoryDrillDownDetail(target);
    },
    [loadInventoryDrillDownDetail]
  );

  const closeInventoryDrillDown = useCallback(() => {
    inventoryDrillDownRequestRef.current += 1;
    setInventoryDrillDown(null);
    setInventoryDrillDownDetail(null);
    setInventoryDrillDownError(null);
    setInventoryDrillDownLoading(false);
  }, []);

  const retryInventoryDrillDown = useCallback(() => {
    if (inventoryDrillDown) {
      void loadInventoryDrillDownDetail(inventoryDrillDown);
    }
  }, [inventoryDrillDown, loadInventoryDrillDownDetail]);

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
  const [transferSourceStore, setTransferSourceStore] = useState("");
  const [transferDestinationLocation, setTransferDestinationLocation] = useState("");
  const [transferProductCode, setTransferProductCode] = useState("");
  const [transferQuantity, setTransferQuantity] = useState("1");
  const [transferUnitOfMeasure, setTransferUnitOfMeasure] = useState("");
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
  const [activeTransferEntryTab, setActiveTransferEntryTab] = useState<"header" | "details" | "feedback">(
    "header"
  );
  const [transferLines, setTransferLines] = useState<
    Array<{
      id: string;
      productCode: string;
      productName: string;
      quantity: number;
      unitOfMeasure: string;
      conversionFactor: number;
      baseUnitOfMeasure: string;
    }>
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
            <p className="flex flex-wrap items-center gap-2 truncate text-xs text-stone-500">
              <span>
                {row.original.productCode}
                {row.original.sku ? ` • ${row.original.sku}` : ""}
              </span>
              <a
                className="font-semibold text-[var(--brand)] transition hover:text-[var(--brand-deep)]"
                href={productCatalogHref(row.original.productCode)}
              >
                Open catalog
              </a>
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
        accessorKey: "isSerialized",
        header: "Serial / batch detail",
        cell: ({ row }) =>
          renderTrackingBadges(row.original, "Select the row to open the catalogue profile"),
        meta: { disableTruncate: true }
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
            <p className="flex flex-wrap items-center gap-2 truncate text-xs text-stone-500">
              <span>
                {row.original.locationName} ({row.original.locationCode})
              </span>
              <a
                className="font-semibold text-[var(--brand)] transition hover:text-[var(--brand-deep)]"
                href={inventoryLocationHref(row.original.locationCode)}
              >
                Open location
              </a>
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
        header: "On hand",
        cell: ({ row }) => quantityFormatter.format(row.original.onHandQuantity)
      },
      {
        accessorKey: "activeReservedQuantity",
        header: "Active reserved",
        cell: ({ row }) => quantityFormatter.format(row.original.activeReservedQuantity)
      },
      {
        accessorKey: "safetyStockLevel",
        header: "Safety stock",
        cell: ({ row }) => quantityFormatter.format(row.original.safetyStockLevel)
      },
      {
        accessorKey: "ecommerceSellableQuantity",
        header: "Web sellable",
        cell: ({ row }) =>
          row.original.ecommercePickupEligible || row.original.ecommerceDeliveryEligible
            ? quantityFormatter.format(row.original.ecommerceSellableQuantity)
            : "-"
      },
      {
        accessorKey: "ecommerceEligibilityLabel",
        header: "Ecommerce eligibility",
        cell: ({ row }) => {
          const modes = [
            row.original.ecommercePickupEligible ? "Pickup" : null,
            row.original.ecommerceDeliveryEligible ? "Delivery" : null
          ].filter((value): value is string => Boolean(value));

          return (
            <div className="min-w-0" title={row.original.ecommerceEligibilityLabel}>
              <p className="font-medium text-stone-900">
                {modes.length ? modes.join(" + ") : "Not eligible"}
              </p>
              <p className="max-w-72 truncate text-xs text-stone-500">
                {row.original.ecommerceEligibilityLabel}
              </p>
            </div>
          );
        },
        meta: { disableTruncate: true }
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
        accessorKey: "isSerialized",
        header: "Serial / batch detail",
        cell: ({ row }) =>
          renderTrackingBadges(row.original, "Select the row to open that shop or warehouse"),
        meta: { disableTruncate: true }
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
          matchesInventorySearchTerms(
            [
              row.storeCode,
              row.storeName,
              row.warehouseCode,
              row.warehouseName,
              row.locationCode,
              row.locationName,
            ],
            stockShopFilter,
          ) &&
          matchesInventorySearchTerms(
            [row.productCode, row.sku, row.productName],
            stockProductFilter,
          )
      ),
    [stockProductFilter, stockShopFilter, workspace.stockPositionRows]
  );

  const inventoryDrillDownSerialRows = useMemo(() => {
    const rows = inventoryDrillDownDetail?.serialUnits ?? [];

    return rows
      .filter(
        (serialUnit) =>
          inventoryDrillDownSerialStatus === "ALL" ||
          serialUnit.status.toUpperCase() === inventoryDrillDownSerialStatus
      )
      .sort(
        (left, right) =>
          left.status.localeCompare(right.status) ||
          left.serialNumber.localeCompare(right.serialNumber)
      );
  }, [inventoryDrillDownDetail, inventoryDrillDownSerialStatus]);
  const inventoryDrillDownSerialCounts = useMemo(() => {
    return (inventoryDrillDownDetail?.serialUnits ?? []).reduce<Record<string, number>>(
      (counts, serialUnit) => {
        const status = serialUnit.status.toUpperCase();

        return { ...counts, [status]: (counts[status] ?? 0) + 1 };
      },
      {}
    );
  }, [inventoryDrillDownDetail]);
  const inventoryDrillDownBatchRows = useMemo(() => {
    return [...(inventoryDrillDownDetail?.batches ?? [])].sort((left, right) =>
      left.expiryDate.localeCompare(right.expiryDate)
    );
  }, [inventoryDrillDownDetail]);
  const inventoryDrillDownExpiringSoon = useMemo(
    () =>
      inventoryDrillDownBatchRows.filter(
        (batch) =>
          batch.daysUntilExpiry >= 0 &&
          batch.daysUntilExpiry <= (inventoryDrillDownDetail?.expiryAlertLeadDays ?? 30)
      ).length,
    [inventoryDrillDownBatchRows, inventoryDrillDownDetail]
  );
  const inventoryDrillDownExpired = useMemo(
    () => inventoryDrillDownBatchRows.filter((batch) => batch.daysUntilExpiry < 0).length,
    [inventoryDrillDownBatchRows]
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
  const interStoreSourceShopOptions = useMemo(
    () =>
      Array.from(
        new Map(
          workspace.transferLocationOptions.map((row) => [
            row.storeCode,
            row.storeName
          ] as const)
        ).entries()
      )
        .map(([value, label]) => ({ value, label }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [workspace.transferLocationOptions]
  );
  const interStoreProductOptions = useMemo(
    () =>
      workspace.transferProductOptions
        .map((row) => ({
          value: row.productCode,
          label: `${row.productName} (${row.productCode}${row.sku ? ` / ${row.sku}` : ""})`,
          productName: row.productName,
          baseUnitOfMeasure: row.baseUnitOfMeasure,
          uomConversions: row.uomConversions
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
  const selectedTransferUom = selectedTransferProduct?.uomConversions.find(
    (option) => option.uomCode === transferUnitOfMeasure
  );
  const selectedSourceStore = interStoreSourceShopOptions.find(
    (option) => option.value === transferSourceStore
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
  const isTransferFeedbackFinal = Boolean(
    editingTransferBatchNo &&
      editingTransferRows.some(
        (transfer) =>
          transfer.feedbackStatus === "CONFIRMED" ||
          transfer.feedbackStatus === "POSTED" ||
          transfer.feedbackConfirmedAt ||
          transfer.feedbackPostedAt
      )
  );
  const isTransferCommitted = Boolean(
    editingTransferBatchNo &&
      editingTransferRows.length > 0 &&
      !editingTransferRows.every((transfer) => transfer.status === "DRAFT")
  );
  const isTransferHeaderLocked = isTransferFeedbackFinal;
  const isTransferLineLocked = isTransferFeedbackFinal || isTransferCommitted;
  const interStoreRequestBlockReason = transferSubmitting
    ? "Transfer request is already saving."
    : isTransferFeedbackFinal
      ? "This transfer already has confirmed filling-station feedback, so it is read-only."
    : !transferSourceStore
      ? "Choose the source shop."
        : !transferDestinationLocation
          ? "Choose the destination shop/location."
          : !selectedSourceStore
            ? "Choose a valid source shop."
            : !selectedDestinationLocation
              ? "Choose a valid destination shop/location."
              : selectedSourceStore.value === selectedDestinationLocation.storeCode
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
      const issuePending = sortedRows.some((row) => row.issueStockUpdateStatus === "PENDING");
      const receiptPending = sortedRows.some((row) => row.receiptStockUpdateStatus === "PENDING");
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
        issueStockUpdateStatus: issuePending ? "PENDING" : firstRow.issueStockUpdateStatus,
        issueStockUpdateStatusLabel: issuePending ? "Pending" : firstRow.issueStockUpdateStatusLabel,
        issueStockConfirmedAt: issuePending ? null : firstRow.issueStockConfirmedAt,
        issueStockConfirmedAtLabel: issuePending ? "Not yet" : firstRow.issueStockConfirmedAtLabel,
        issueStockConfirmedBy: issuePending ? null : firstRow.issueStockConfirmedBy,
        receiptStockUpdateStatus: receiptPending ? "PENDING" : firstRow.receiptStockUpdateStatus,
        receiptStockUpdateStatusLabel: receiptPending ? "Pending" : firstRow.receiptStockUpdateStatusLabel,
        receiptStockConfirmedAt: receiptPending ? null : firstRow.receiptStockConfirmedAt,
        receiptStockConfirmedAtLabel: receiptPending ? "Not yet" : firstRow.receiptStockConfirmedAtLabel,
        receiptStockConfirmedBy: receiptPending ? null : firstRow.receiptStockConfirmedBy,
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
  const hasPendingIssueStock = editingTransferRows.some((row) => row.issueStockUpdateStatus === "PENDING");
  const hasPendingReceiptStock = editingTransferRows.some((row) => row.receiptStockUpdateStatus === "PENDING");

  function resetTransferDraft() {
    setEditingTransferBatchNo(null);
    setTransferSourceStore("");
    setTransferDestinationLocation("");
    setTransferProductCode("");
    setTransferQuantity("1");
    setTransferUnitOfMeasure("");
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
    setTransferSourceStore(row.sourceStoreCode);
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
    setTransferUnitOfMeasure("");
    setTransferLines(
      batchLines.map((line) => ({
        id: line.transferId,
        productCode: line.productCode,
        productName: line.productName,
        quantity: line.requestedUnitQuantity,
        unitOfMeasure: line.requestedUnitOfMeasure,
        conversionFactor: line.uomConversionFactor,
        baseUnitOfMeasure: line.baseUnitOfMeasure
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

    const unit =
      selectedTransferUom ??
      selectedTransferProduct.uomConversions.find(
        (option) => option.uomCode === selectedTransferProduct.baseUnitOfMeasure
      );

    if (!unit) {
      setTransferStatus({
        tone: "error",
        message: "Choose a configured unit of measure before adding this line."
      });
      return;
    }

    setTransferLines((currentLines) => [
      ...currentLines,
      {
        id: `${transferProductCode}-${Date.now()}-${currentLines.length}`,
        productCode: transferProductCode,
        productName: selectedTransferProduct.productName,
        quantity,
        unitOfMeasure: unit.uomCode,
        conversionFactor: unit.conversionFactor,
        baseUnitOfMeasure: selectedTransferProduct.baseUnitOfMeasure
      }
    ]);
    setTransferProductCode("");
    setTransferQuantity("1");
    setTransferUnitOfMeasure("");
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
          sourceStoreCode: transferSourceStore,
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
            quantity: line.quantity,
            unitOfMeasure: line.unitOfMeasure
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

  async function confirmTransferFeedback() {
    const feedback = editingTransferFeedback;

    if (!feedback) {
      return;
    }

    setTransferSubmitting(true);
    setTransferStatus({ tone: "idle", message: "" });

    try {
      const response = await fetch(
        `/api/fuel-operations/station-deliveries/${encodeURIComponent(feedback.transferId)}/feedback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "CONFIRM",
            waterTestResult: feedback.waterTestResult,
            quantityBeforeDelivery: feedback.quantityBeforeDelivery,
            expectedQuantityReceived: feedback.expectedQuantityReceived,
            expectedStockQuantity: feedback.expectedStockQuantity,
            quantityAfterDelivery: feedback.quantityAfterDelivery,
            actualQuantityReceived: feedback.actualQuantityReceived,
            feedbackDipReading: feedback.feedbackDipReading,
            beforeDischargeEvidence: feedback.beforeDischargeEvidence,
            afterDischargeEvidence: feedback.afterDischargeEvidence,
            feedbackNote: feedback.feedbackNote,
            feedbackOperatorName: "HQ inventory",
          }),
        },
      );
      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? "Flash ERP could not confirm transfer feedback.");
      }

      setTransferStatus({
        tone: "success",
        message: payload.message ?? "Transfer feedback confirmed.",
      });
      router.refresh();
    } catch (error) {
      setTransferStatus({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not confirm transfer feedback.",
      });
    } finally {
      setTransferSubmitting(false);
    }
  }

  async function confirmTransferStock(direction: "ISSUE" | "RECEIPT") {
    const transferBatchNo = editingTransferBatchNo;

    if (!transferBatchNo) {
      return;
    }

    setTransferSubmitting(true);
    setTransferStatus({ tone: "idle", message: "" });

    try {
      const response = await fetch(
        `/api/inventory/inter-store-transfers/${encodeURIComponent(transferBatchNo)}/stock-confirm`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ direction }),
        },
      );
      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(
          payload.message ??
            payload.error ??
            `Flash ERP could not post the ${direction === "ISSUE" ? "issue" : "receipt"} stock update.`,
        );
      }

      setTransferStatus({
        tone: "success",
        message:
          payload.message ??
          `${transferBatchNo} ${direction === "ISSUE" ? "issue" : "receipt"} stock is now posted.`,
      });
      router.refresh();
    } catch (error) {
      setTransferStatus({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : `Flash ERP could not post the ${direction === "ISSUE" ? "issue" : "receipt"} stock update.`,
      });
    } finally {
      setTransferSubmitting(false);
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
              {row.original.sourceLocationName}
              {row.original.sourceLocationCode
                ? ` (${row.original.sourceLocationCode})`
                : ""}
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
        id: "stockStatus",
        header: "Stock",
        cell: ({ row }) => {
          const issuePending = row.original.issueStockUpdateStatus === "PENDING";
          const receiptPending = row.original.receiptStockUpdateStatus === "PENDING";

          return (
            <div className="min-w-0 space-y-1">
              <p
                className={`truncate text-xs font-semibold ${
                  issuePending ? "text-amber-700" : "text-emerald-700"
                }`}
              >
                Issue {row.original.issueStockUpdateStatusLabel}
              </p>
              <p
                className={`truncate text-xs font-semibold ${
                  receiptPending ? "text-amber-700" : "text-emerald-700"
                }`}
              >
                Receipt {row.original.receiptStockUpdateStatusLabel}
              </p>
            </div>
          );
        },
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
            isTransferFeedbackFinal
              ? "View transfer request"
              : isTransferCommitted
                ? "Reroute transfer request"
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
              {(
                [
                  "header",
                  "details",
                  ...(editingTransferFeedback ? ["feedback"] : []),
                ] as Array<"header" | "details" | "feedback">
              ).map((tab) => (
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
                  {tab === "header" ? "Header" : tab === "details" ? "Content" : "Feedback"}
                </button>
              ))}
            </div>

            {activeTransferEntryTab === "header" ? (
              <div className="grid gap-3 lg:grid-cols-3">
                <label className="grid gap-1 text-sm font-semibold text-stone-700">
                  Source shop
                  <select
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferHeaderLocked || isTransferCommitted}
                    onChange={(event) => setTransferSourceStore(event.target.value)}
                    value={transferSourceStore}
                  >
                    <option value="">Select source shop</option>
                    {interStoreSourceShopOptions.map((option) => (
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
                    disabled={isTransferHeaderLocked}
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
                    disabled={isTransferHeaderLocked}
                    onChange={(event) => setTransferReference(event.target.value)}
                    placeholder="Optional reference"
                    value={transferReference}
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-stone-700">
                  Required date
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferHeaderLocked}
                    onChange={(event) => setTransferRequiredAt(event.target.value)}
                    type="date"
                    value={transferRequiredAt}
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-stone-700">
                  Delivery note / waybill
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferHeaderLocked}
                    onChange={(event) => setTransferDeliveryNoteNo(event.target.value)}
                    placeholder="Waybill or delivery note"
                    value={transferDeliveryNoteNo}
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-stone-700">
                  Transporter
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferHeaderLocked}
                    onChange={(event) => setTransferTransporterName(event.target.value)}
                    placeholder="Transport company"
                    value={transferTransporterName}
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-stone-700">
                  Vehicle number
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferHeaderLocked}
                    onChange={(event) => setTransferVehicleRegistrationNo(event.target.value)}
                    placeholder="Vehicle registration"
                    value={transferVehicleRegistrationNo}
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-stone-700">
                  Driver name
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferHeaderLocked}
                    onChange={(event) => setTransferDriverName(event.target.value)}
                    placeholder="Driver name"
                    value={transferDriverName}
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-stone-700">
                  Driver contact
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferLineLocked}
                    onChange={(event) => setTransferDriverContact(event.target.value)}
                    placeholder="Phone number"
                    value={transferDriverContact}
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-stone-700 lg:col-span-3">
                  Note
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferLineLocked}
                    onChange={(event) => setTransferNote(event.target.value)}
                    placeholder="Reason, customer demand, or delivery instruction"
                    value={transferNote}
                  />
                </label>
              </div>
            ) : activeTransferEntryTab === "details" ? (
              <div className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem_8rem_auto]">
                  <select
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferLineLocked}
                    onChange={(event) => {
                      const productCode = event.target.value;
                      const product = interStoreProductOptions.find(
                        (option) => option.value === productCode
                      );
                      setTransferProductCode(productCode);
                      setTransferUnitOfMeasure(
                        product?.uomConversions.find(
                          (unit) => unit.uomCode === product.baseUnitOfMeasure
                        )?.uomCode ??
                          product?.uomConversions[0]?.uomCode ??
                          ""
                      );
                    }}
                    value={transferProductCode}
                  >
                    <option value="">Item</option>
                    {interStoreProductOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferLineLocked || !selectedTransferProduct}
                    onChange={(event) => setTransferUnitOfMeasure(event.target.value)}
                    value={transferUnitOfMeasure}
                  >
                    <option value="">Unit</option>
                    {selectedTransferProduct?.uomConversions.map((unit) => (
                      <option key={unit.uomCode} value={unit.uomCode}>
                        {unit.uomName} ({unit.uomCode})
                      </option>
                    ))}
                  </select>
                  <input
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                    disabled={isTransferLineLocked}
                    min="0.001"
                    onChange={(event) => setTransferQuantity(event.target.value)}
                    step="0.001"
                    type="number"
                    value={transferQuantity}
                  />
                  <button
                    className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                    disabled={!transferProductCode || transferSubmitting || isTransferLineLocked}
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
                          {quantityFormatter.format(line.quantity)} {line.unitOfMeasure}
                          {line.unitOfMeasure !== line.baseUnitOfMeasure ? (
                            <small className="block font-normal text-stone-500">
                              {quantityFormatter.format(line.quantity * line.conversionFactor)}{" "}
                              {line.baseUnitOfMeasure}
                            </small>
                          ) : null}
                        </span>
                        <button
                          className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700"
                          disabled={isTransferLineLocked}
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
            ) : (
              <div className="space-y-4">
                {editingTransferFeedback ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-4">
                      {[
                        { label: "Status", value: editingTransferFeedback.feedbackStatus },
                        {
                          label: "Issue stock",
                          value: (
                            <span
                              className={
                                editingTransferFeedback.issueStockUpdateStatus === "PENDING"
                                  ? "text-amber-700"
                                  : "text-emerald-700"
                              }
                            >
                              {editingTransferFeedback.issueStockUpdateStatusLabel}
                            </span>
                          )
                        },
                        {
                          label: "Receipt stock",
                          value: (
                            <span
                              className={
                                editingTransferFeedback.receiptStockUpdateStatus === "PENDING"
                                  ? "text-amber-700"
                                  : "text-emerald-700"
                              }
                            >
                              {editingTransferFeedback.receiptStockUpdateStatusLabel}
                            </span>
                          )
                        },
                        {
                          label: "Water test",
                          value: editingTransferFeedback.waterTestResult ?? "Not captured"
                        },
                        {
                          label: "Before quantity",
                          value:
                            editingTransferFeedback.quantityBeforeDelivery === null
                              ? "Not captured"
                              : quantityFormatter.format(editingTransferFeedback.quantityBeforeDelivery)
                        },
                        {
                          label: "Expected received",
                          value:
                            editingTransferFeedback.expectedQuantityReceived === null
                              ? "Not captured"
                              : quantityFormatter.format(editingTransferFeedback.expectedQuantityReceived)
                        },
                        {
                          label: "Expected stock",
                          value:
                            editingTransferFeedback.expectedStockQuantity === null
                              ? "Not captured"
                              : quantityFormatter.format(editingTransferFeedback.expectedStockQuantity)
                        },
                        {
                          label: "After quantity",
                          value:
                            editingTransferFeedback.quantityAfterDelivery === null
                              ? "Not captured"
                              : quantityFormatter.format(editingTransferFeedback.quantityAfterDelivery)
                        },
                        {
                          label: "Dip reading",
                          value:
                            editingTransferFeedback.feedbackDipReading === null
                              ? "Not captured"
                              : quantityFormatter.format(editingTransferFeedback.feedbackDipReading)
                        },
                        {
                          label: "Actual received",
                          value:
                            editingTransferFeedback.actualQuantityReceived === null
                              ? "Not captured"
                              : quantityFormatter.format(editingTransferFeedback.actualQuantityReceived)
                        },
                        {
                          label: "Variance",
                          value:
                            editingTransferFeedback.feedbackVarianceQuantity === null
                              ? "Not captured"
                              : quantityFormatter.format(editingTransferFeedback.feedbackVarianceQuantity)
                        },
                        {
                          label: "Recorded by",
                          value: editingTransferFeedback.feedbackOperatorName ?? "Not captured"
                        },
                        {
                          label: "Recorded",
                          value: editingTransferFeedback.feedbackRecordedAt
                            ? renderTimestamp(
                                editingTransferFeedback.feedbackRecordedAt,
                                editingTransferFeedback.feedbackRecordedAtLabel
                              )
                            : "Not captured"
                        },
                        {
                          label: "Confirmed",
                          value: editingTransferFeedback.feedbackConfirmedAt
                            ? renderTimestamp(
                                editingTransferFeedback.feedbackConfirmedAt,
                                "Confirmed"
                              )
                            : "Not confirmed"
                        },
                        {
                          label: "Posted",
                          value: editingTransferFeedback.feedbackPostedAt
                            ? renderTimestamp(editingTransferFeedback.feedbackPostedAt, "Posted")
                            : "Not posted"
                        },
                        {
                          label: "Issue confirmed",
                          value: editingTransferFeedback.issueStockConfirmedAt
                            ? renderTimestamp(
                                editingTransferFeedback.issueStockConfirmedAt,
                                editingTransferFeedback.issueStockConfirmedAtLabel
                              )
                            : "Not posted"
                        },
                        {
                          label: "Receipt confirmed",
                          value: editingTransferFeedback.receiptStockConfirmedAt
                            ? renderTimestamp(
                                editingTransferFeedback.receiptStockConfirmedAt,
                                editingTransferFeedback.receiptStockConfirmedAtLabel
                              )
                            : "Not posted"
                        }
                      ].map((stat) => (
                        <div className="rounded-xl border border-stone-200 bg-stone-50 p-3" key={stat.label}>
                          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                            {stat.label}
                          </span>
                          <div className="mt-1 text-sm font-semibold text-stone-900">
                            {stat.value}
                          </div>
                        </div>
                      ))}
                    </div>
                    {hasPendingIssueStock || hasPendingReceiptStock ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-amber-950">
                              Pending HQ stock update
                            </p>
                            <p className="mt-1 text-sm leading-6 text-amber-900">
                              Post only after the source/destination evidence has been reviewed.
                              POS sales are not held by this policy.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {hasPendingIssueStock ? (
                              <button
                                className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-60"
                                disabled={transferSubmitting}
                                onClick={() => void confirmTransferStock("ISSUE")}
                                type="button"
                              >
                                <PackageCheck className="h-4 w-4" />
                                Post issue stock
                              </button>
                            ) : null}
                            {hasPendingReceiptStock ? (
                              <button
                                className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-60"
                                disabled={transferSubmitting}
                                onClick={() => void confirmTransferStock("RECEIPT")}
                                type="button"
                              >
                                <PackageCheck className="h-4 w-4" />
                                Post receipt stock
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {editingTransferFeedback.feedbackNote ? (
                      <div className="rounded-xl border border-stone-200 bg-white p-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                          Feedback note
                        </span>
                        <p className="mt-1 text-sm text-stone-700">
                          {editingTransferFeedback.feedbackNote}
                        </p>
                      </div>
                    ) : null}
                    <div className="grid gap-3 md:grid-cols-2">
                      {[
                        ["Before discharge", editingTransferFeedback.beforeDischargeEvidence],
                        ["After discharge", editingTransferFeedback.afterDischargeEvidence],
                      ].map(([label, evidence]) => (
                        <div className="rounded-xl border border-stone-200 bg-white p-3" key={label as string}>
                          <div className="flex items-center justify-between gap-3">
                            <strong className="text-sm text-stone-900">{label as string}</strong>
                            <span className="text-xs font-semibold text-stone-500">
                              {(evidence as typeof editingTransferFeedback.beforeDischargeEvidence).length} photo(s)
                            </span>
                          </div>
                          <div className="mt-3 grid gap-2">
                            {(evidence as typeof editingTransferFeedback.beforeDischargeEvidence).map((item) => (
                              <a
                                className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                                href={item.url}
                                key={item.url}
                                rel="noreferrer"
                                target="_blank"
                              >
                                {item.fileName ?? "Evidence photo"}
                              </a>
                            ))}
                            {(evidence as typeof editingTransferFeedback.beforeDischargeEvidence).length === 0 ? (
                              <span className="text-sm text-stone-500">No evidence uploaded.</span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                    {!isTransferFeedbackFinal ? (
                      <div className="flex justify-end">
                        <button
                          className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:bg-stone-300"
                          disabled={transferSubmitting}
                          onClick={() => void confirmTransferFeedback()}
                          type="button"
                        >
                          {transferSubmitting ? "Confirming" : "Confirm feedback"}
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
                    No transfer feedback has been captured yet.
                  </p>
                )}
              </div>
            )}

            {activeTransferEntryTab !== "feedback" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap gap-3 text-sm text-stone-600">
                <span>{numberFormatter.format(transferLines.length)} line(s)</span>
                <span>
                  {quantityFormatter.format(
                    transferLines.reduce(
                      (sum, line) => sum + line.quantity * line.conversionFactor,
                      0
                    )
                  )}{" "}
                  base units requested
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
                  {transferSubmitting ? "Saving" : isTransferCommitted ? "Save reroute" : "Save draft"}
                </button>
                {!isTransferCommitted ? (
                  <button
                    className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:bg-stone-300"
                    disabled={!canSaveInterStoreRequest}
                    onClick={() => void saveInterStoreRequest(false)}
                    title={interStoreRequestBlockReason || undefined}
                    type="button"
                  >
                    {transferSubmitting ? "Committing" : "Commit request"}
                  </button>
                ) : null}
              </div>
            </div>
            ) : null}
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
            getRowHref={(row) => productCatalogHref(row.productCode)}
            globalFilterFn={productFilter}
            onRowSelect={(row) => {
              if (!row.isSerialized && !row.trackExpiry) {
                router.push(productCatalogHref(row.productCode));
                return;
              }

              openInventoryDrillDown({
                isSerialized: row.isSerialized,
                locationCode: null,
                locationName: "Every shop and warehouse",
                onHandQuantity: row.onHandQuantity,
                productCode: row.productCode,
                productName: row.productName,
                trackExpiry: row.trackExpiry
              });
            }}
            searchPlaceholder="Search stocked products by code, SKU, name, or status"
            serverPagination={
              dedicatedView
                ? {
                    ...workspace.productPage,
                    searchValue: workspace.productPage.search,
                    onPageChange: changeProductPage,
                    onPageSizeChange: changeProductPageSize,
                    onSearchChange: changeProductSearch
                  }
                : undefined
            }
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="stock">
          <section className="space-y-4">
            <SharedDataGrid
              columns={stockPositionColumns}
              data={filteredStockPositionRows}
              emptyLabel="No shop inventory rows are available yet."
              exportFileName="flash-erp-stock-by-shop"
              getRowHref={(row) => inventoryLocationHref(row.locationCode)}
              globalFilterFn={stockPositionFilter}
              hideSearch
              onRowSelect={(row) => {
                if (!row.isSerialized && !row.trackExpiry) {
                  router.push(inventoryLocationHref(row.locationCode));
                  return;
                }

                openInventoryDrillDown({
                  isSerialized: row.isSerialized,
                  locationCode: row.locationCode,
                  locationName: row.locationName,
                  onHandQuantity: row.onHandQuantity,
                  productCode: row.productCode,
                  productName: row.productName,
                  trackExpiry: row.trackExpiry
                });
              }}
              initialPageSize={25}
              pageSizeOptions={[25, 50, 100]}
              searchPlaceholder="Optional text search"
              toolbarFilters={
                <>
                  <input
                    aria-label="Search shops and locations"
                    autoComplete="off"
                    className="w-full min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none transition placeholder:text-stone-400 focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)] sm:w-auto sm:min-w-[16rem] sm:flex-1 md:min-w-[20rem]"
                    list="stock-shop-options"
                    onChange={(event) => setStockShopFilter(event.target.value)}
                    placeholder="Search shop or location"
                    type="search"
                    value={stockShopFilter}
                  />
                  <datalist id="stock-shop-options">
                    {stockShopOptions.map((option) => (
                      <option key={option.value} value={option.label} />
                    ))}
                  </datalist>
                  <input
                    aria-label="Search products"
                    autoComplete="off"
                    className="w-full min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none transition placeholder:text-stone-400 focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)] sm:w-auto sm:min-w-[16rem] sm:flex-1 md:min-w-[20rem]"
                    list="stock-product-options"
                    onChange={(event) => setStockProductFilter(event.target.value)}
                    placeholder="Search product name, code, or SKU"
                    type="search"
                    value={stockProductFilter}
                  />
                  <datalist id="stock-product-options">
                    {stockProductOptions.map((option) => (
                      <option key={option.value} value={option.label} />
                    ))}
                  </datalist>
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
              getRowHref={(row) =>
                row.sourceLocationCode
                  ? `/inventory/locations/${encodeURIComponent(row.sourceLocationCode)}`
                  : null
              }
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

      <ActionDialog
        description={
          inventoryDrillDown
            ? `${inventoryDrillDown.productCode} • ${
                inventoryDrillDown.locationName ?? "Every shop and warehouse"
              }`
            : undefined
        }
        hideTrigger
        onOpenChange={(open) => {
          if (!open) {
            closeInventoryDrillDown();
          }
        }}
        open={inventoryDrillDown !== null}
        title={inventoryDrillDown?.productName ?? "Inventory detail"}
        triggerLabel="Open serial and batch detail"
        widthClassName="max-w-5xl"
      >
        {inventoryDrillDown ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <InventoryDetailPill
                tone={inventoryDrillDown.onHandQuantity > 0 ? "good" : "warning"}
              >{`On hand ${quantityFormatter.format(inventoryDrillDown.onHandQuantity)}`}</InventoryDetailPill>
              {inventoryDrillDown.isSerialized ? (
                <InventoryDetailPill tone="good">Serialised</InventoryDetailPill>
              ) : null}
              {inventoryDrillDown.trackExpiry ? (
                <InventoryDetailPill tone="warning">Batch / expiry tracked</InventoryDetailPill>
              ) : null}
              {inventoryDrillDownDetail ? (
                <button
                  className="text-xs font-semibold text-[var(--brand)] transition hover:text-[var(--brand-deep)]"
                  onClick={() => void retryInventoryDrillDown()}
                  type="button"
                >
                  Reload detail
                </button>
              ) : null}
            </div>

            <p className="text-xs leading-5 text-stone-500">
              {inventoryDrillDownLoading
                ? "Reading the canonical serial registry and batch ledger…"
                : inventoryDrillDownDetail?.statusMessage ??
                  "Serial and batch detail is read from the canonical enterprise ledger for this item."}
            </p>

            {inventoryDrillDownError ? (
              <div
                className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700"
                role="alert"
              >
                <p className="font-semibold">Serial and batch detail could not be read.</p>
                <p className="mt-1 break-words">{inventoryDrillDownError}</p>
                <button
                  className="mt-3 inline-flex items-center rounded-full border border-rose-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700 transition hover:border-rose-400"
                  onClick={() => void retryInventoryDrillDown()}
                  type="button"
                >
                  Try again
                </button>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {inventoryDrillDown.isSerialized ? (
                <button
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    inventoryDrillDownTab === "serials"
                      ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                      : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"
                  }`}
                  onClick={() => setInventoryDrillDownTab("serials")}
                  type="button"
                >
                  {`Serial numbers${
                    inventoryDrillDownDetail ? ` (${quantityFormatter.format(inventoryDrillDownDetail.serialUnitTotal)})` : ""
                  }`}
                </button>
              ) : null}
              {inventoryDrillDown.trackExpiry ? (
                <button
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    inventoryDrillDownTab === "batches"
                      ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                      : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"
                  }`}
                  onClick={() => setInventoryDrillDownTab("batches")}
                  type="button"
                >
                  {`Batches & expiry${
                    inventoryDrillDownDetail ? ` (${quantityFormatter.format(inventoryDrillDownDetail.batchTotal)})` : ""
                  }`}
                </button>
              ) : null}
            </div>

            {inventoryDrillDown.isSerialized && inventoryDrillDownTab === "serials" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Filter serial numbers by status"
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-[var(--brand)]"
                    onChange={(event) => setInventoryDrillDownSerialStatus(event.target.value)}
                    value={inventoryDrillDownSerialStatus}
                  >
                    {inventorySerialStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <InventoryDetailPill tone="good">{`Available ${quantityFormatter.format(
                    inventoryDrillDownSerialCounts.AVAILABLE ?? 0
                  )}`}</InventoryDetailPill>
                  <InventoryDetailPill>{`Sold ${quantityFormatter.format(
                    inventoryDrillDownSerialCounts.SOLD ?? 0
                  )}`}</InventoryDetailPill>
                  <InventoryDetailPill>{`In transit ${quantityFormatter.format(
                    inventoryDrillDownSerialCounts.IN_TRANSIT ?? 0
                  )}`}</InventoryDetailPill>
                  <InventoryDetailPill tone="warning">{`Adjusted out ${quantityFormatter.format(
                    inventoryDrillDownSerialCounts.ADJUSTED_OUT ?? 0
                  )}`}</InventoryDetailPill>
                </div>

                {inventoryDrillDownDetail &&
                inventoryDrillDownDetail.serialUnits.length < inventoryDrillDownDetail.serialUnitTotal ? (
                  <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs leading-5 text-amber-800">
                    {`Showing the first ${quantityFormatter.format(
                      inventoryDrillDownDetail.serialUnits.length
                    )} of ${quantityFormatter.format(
                      inventoryDrillDownDetail.serialUnitTotal
                    )} units for this scope. Filter by shop on the Item Dynamic view to narrow the window.`}
                  </p>
                ) : null}

                {inventoryDrillDownSerialRows.length ? (
                  <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                    <table className="min-w-full table-fixed border-collapse text-sm">
                      <thead className="bg-stone-100/90">
                        <tr>
                          {["Serial number", "Status", "Location", "Last document", "Last movement"].map(
                            (heading) => (
                              <th
                                className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500"
                                key={heading}
                              >
                                {heading}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {inventoryDrillDownSerialRows.map((serialUnit) => (
                          <tr className="border-t border-stone-200/80" key={serialUnit.serialUnitId}>
                            <td className="px-3 py-2.5">
                              <SerialChip serialNumber={serialUnit.serialNumber} />
                            </td>
                            <td className="px-3 py-2.5">
                              <InventoryDetailPill
                                tone={
                                  serialUnit.status.toUpperCase() === "AVAILABLE"
                                    ? "good"
                                    : serialUnit.status.toUpperCase() === "ADJUSTED_OUT"
                                      ? "warning"
                                      : "neutral"
                                }
                              >
                                {formatSerialStatus(serialUnit.status)}
                              </InventoryDetailPill>
                            </td>
                            <td className="truncate px-3 py-2.5 text-stone-700">
                              {serialUnit.locationName ?? "Unassigned"}
                            </td>
                            <td className="truncate px-3 py-2.5 text-stone-700">
                              {serialUnit.sourceReferenceLabel ?? "-"}
                            </td>
                            <td className="px-3 py-2.5 text-stone-700">
                              {new Date(
                                serialUnit.lastOccurredAt ?? serialUnit.updatedAt
                              ).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : inventoryDrillDownLoading || inventoryDrillDownError ? null : (
                  <p className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-6 text-center text-sm text-stone-600">
                    No serial units match this item, location, and status filter.
                  </p>
                )}
              </div>
            ) : null}

            {inventoryDrillDown.trackExpiry && inventoryDrillDownTab === "batches" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <InventoryDetailPill>{`Active batches ${quantityFormatter.format(
                    inventoryDrillDownDetail?.batchTotal ?? 0
                  )}`}</InventoryDetailPill>
                  <InventoryDetailPill tone="warning">{`Expiring within ${
                    inventoryDrillDownDetail?.expiryAlertLeadDays ?? 30
                  } days ${quantityFormatter.format(inventoryDrillDownExpiringSoon)}`}</InventoryDetailPill>
                  <InventoryDetailPill tone="warning">{`Expired ${quantityFormatter.format(
                    inventoryDrillDownExpired
                  )}`}</InventoryDetailPill>
                </div>

                {inventoryDrillDownBatchRows.length ? (
                  <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                    <table className="min-w-full table-fixed border-collapse text-sm">
                      <thead className="bg-stone-100/90">
                        <tr>
                          {["Batch", "Location", "Manufactured", "Expiry", "Qty on hand", "Status"].map(
                            (heading) => (
                              <th
                                className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500"
                                key={heading}
                              >
                                {heading}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {inventoryDrillDownBatchRows.map((batch) => (
                          <tr className="border-t border-stone-200/80" key={batch.batchId}>
                            <td className="truncate px-3 py-2.5 font-medium text-stone-900">
                              {batch.batchNo}
                            </td>
                            <td className="truncate px-3 py-2.5 text-stone-700">{batch.locationName}</td>
                            <td className="px-3 py-2.5 text-stone-700">
                              {batch.manufacturedAt
                                ? new Date(batch.manufacturedAt).toLocaleDateString()
                                : "-"}
                            </td>
                            <td className="px-3 py-2.5 text-stone-700">
                              {new Date(batch.expiryDate).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-2.5 font-medium text-stone-900">
                              {quantityFormatter.format(batch.quantityOnHand)}
                            </td>
                            <td className="px-3 py-2.5">
                              <InventoryDetailPill
                                tone={
                                  batch.daysUntilExpiry <=
                                  (inventoryDrillDownDetail?.expiryAlertLeadDays ?? 30)
                                    ? "warning"
                                    : "good"
                                }
                              >
                                {batch.daysUntilExpiry < 0
                                  ? "Expired"
                                  : batch.daysUntilExpiry === 0
                                    ? "Expires today"
                                    : `${batch.daysUntilExpiry} days`}
                              </InventoryDetailPill>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : inventoryDrillDownLoading || inventoryDrillDownError ? null : (
                  <p className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-6 text-center text-sm text-stone-600">
                    No batch or expiry records with stock are held for this item in this scope.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </ActionDialog>

      <section className="glass-panel rounded-[1.4rem] p-5">
        <p className="text-sm leading-6 text-stone-600">{workspace.statusMessage}</p>
      </section>
    </EnterpriseShell>
  );
}
