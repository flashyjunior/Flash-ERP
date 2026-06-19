"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, Boxes, Grid3X3, PackageCheck, Plus, ReceiptText, ScanBarcode, Store, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { ProductImageField } from "@/components/enterprise/product-image-field";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type {
  AddEnterpriseProductBarcodeResponse,
  EnterpriseProductDetailData,
  LinkEnterpriseProductSupplierResponse,
  UpsertEnterpriseProductMatrixResponse,
  UpdateEnterpriseProductProfileResponse,
  UpdateEnterpriseProductPricingResponse
} from "@/server/repositories/enterprise-catalog.repository";

type PriceRow = EnterpriseProductDetailData["priceRows"][number];
type MatrixVariantRow = EnterpriseProductDetailData["matrixVariants"][number];
type InventoryRow = EnterpriseProductDetailData["recentInventoryRows"][number];
type SalesRow = EnterpriseProductDetailData["recentSalesRows"][number];
type SupplierRow = EnterpriseProductDetailData["supplierRows"][number];
type SyncPacketRow = EnterpriseProductDetailData["syncPackets"][number];
type DepartmentOption = EnterpriseProductDetailData["availableDepartments"][number];
type CategoryOption = EnterpriseProductDetailData["availableCategories"][number];
type UnitOption = EnterpriseProductDetailData["availableUnitsOfMeasure"][number];
type UomScheduleOption = EnterpriseProductDetailData["availableUomSchedules"][number];
type MatrixAttributeOption = EnterpriseProductDetailData["availableMatrixAttributes"][number];

const priceCustomerTypeOptions = ["INDIVIDUAL", "CORPORATE", "WHOLESALE", "STAFF", "OTHER"];
const matrixProductTypeOptions = ["STOCK", "MATRIX", "SERVICE", "BUNDLE", "DIGITAL", "VOUCHER"];

function toMatrixKey(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

type MatrixAttributeDraft = {
  code: string;
  selectedValueCodes: string[];
};

type MatrixVariantDraft = {
  rowId: string;
  code: string;
  sku: string;
  displayName: string;
  unitPrice: string;
  costPrice: string;
  quantityOnHand: string;
  barcode: string;
  status: string;
  attributeValues: Record<string, string>;
};

function makeMatrixRowId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `matrix-row-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function moneyDraft(value: number | null | undefined) {
  return value === null || value === undefined ? "" : value.toFixed(2);
}

function quantityDraft(value: number | null | undefined) {
  return value === null || value === undefined ? "" : value.toFixed(3).replace(/\.?0+$/, "");
}

function activeMatrixAttributeOptions(detail: EnterpriseProductDetailData) {
  const optionsByCode = new Map<string, MatrixAttributeOption>();

  for (const option of detail.availableMatrixAttributes) {
    optionsByCode.set(option.code, option);
  }

  for (const attribute of detail.matrixAttributes) {
    if (!optionsByCode.has(attribute.code)) {
      optionsByCode.set(attribute.code, attribute);
    }
  }

  return [...optionsByCode.values()].sort((left, right) => {
    const sortDelta = left.sortOrder - right.sortOrder;
    return sortDelta || left.name.localeCompare(right.name);
  });
}

function toMatrixAttributeDrafts(detail: EnterpriseProductDetailData): MatrixAttributeDraft[] {
  return detail.matrixAttributes.map((attribute) => ({
    code: attribute.code,
    selectedValueCodes: attribute.values
      .filter((value) => value.status === "ACTIVE")
      .map((value) => value.code)
  }));
}

function toMatrixVariantDrafts(detail: EnterpriseProductDetailData): MatrixVariantDraft[] {
  return detail.matrixVariants.map((variant) => ({
    rowId: variant.id,
    code: variant.code,
    sku: variant.sku ?? variant.code,
    displayName: variant.displayName ?? "",
    unitPrice: moneyDraft(variant.unitPrice),
    costPrice: moneyDraft(variant.costPrice),
    quantityOnHand: quantityDraft(variant.quantityOnHand),
    barcode: variant.barcode ?? "",
    status: variant.status,
    attributeValues: Object.fromEntries(
      variant.attributeValues.map((value) => [value.attributeCode, value.valueCode])
    )
  }));
}

function selectedMatrixAttributeOptions(
  drafts: MatrixAttributeDraft[],
  options: MatrixAttributeOption[]
) {
  return drafts
    .map((draft) => options.find((option) => option.code === draft.code))
    .filter((option): option is MatrixAttributeOption => Boolean(option));
}

function getMatrixValueLabel(attribute: MatrixAttributeOption, valueCode: string) {
  return attribute.values.find((value) => value.code === valueCode)?.label ?? valueCode;
}

function matrixSelectionSignature(
  attributes: MatrixAttributeOption[],
  values: Record<string, string>
) {
  return attributes.map((attribute) => `${attribute.code}:${values[attribute.code] ?? ""}`).join("|");
}

function matrixCartesianProduct(groups: string[][]) {
  return groups.reduce<string[][]>(
    (rows, group) => rows.flatMap((row) => group.map((value) => [...row, value])),
    [[]]
  );
}

function generateMatrixCode(productCode: string, values: string[], existingCodes: Set<string>) {
  const baseCode = toMatrixKey([productCode, ...values].filter(Boolean).join("-")) || `MATRIX-${existingCodes.size + 1}`;
  let candidate = baseCode;
  let suffix = 2;

  while (existingCodes.has(candidate)) {
    candidate = `${baseCode}-${suffix}`;
    suffix += 1;
  }

  existingCodes.add(candidate);
  return candidate;
}

function normalizeHierarchyLookup(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeHierarchyCode(value: string | null | undefined) {
  return value?.trim().toUpperCase().replace(/\s+/g, "-") ?? "";
}

function resolveDepartmentSelection(
  value: string | null | undefined,
  departments: DepartmentOption[]
) {
  const raw = value?.trim() ?? "";

  if (!raw) {
    return "";
  }

  const normalizedCode = normalizeHierarchyCode(raw);
  const normalizedName = normalizeHierarchyLookup(raw);
  const match =
    departments.find((department) => department.code === normalizedCode) ??
    departments.find((department) => normalizeHierarchyLookup(department.name) === normalizedName);

  return match?.code ?? raw;
}

function resolveCategorySelection(
  value: string | null | undefined,
  departmentCode: string,
  categories: CategoryOption[]
) {
  const raw = value?.trim() ?? "";

  if (!raw) {
    return "";
  }

  const pool = categories.filter((category) => category.departmentCode === departmentCode);
  const normalizedCode = normalizeHierarchyCode(raw);
  const normalizedName = normalizeHierarchyLookup(raw);
  const match =
    pool.find((category) => category.code === normalizedCode) ??
    pool.find((category) => normalizeHierarchyLookup(category.name) === normalizedName);

  return match?.code ?? raw;
}

function formatDepartmentLabel(
  value: string | null | undefined,
  departments: DepartmentOption[]
) {
  const raw = value?.trim() ?? "";

  if (!raw) {
    return "Not set";
  }

  const resolved = resolveDepartmentSelection(raw, departments);
  const match = departments.find((department) => department.code === resolved);

  return match ? `${match.name} (${match.code})` : raw;
}

function formatCategoryLabel(value: string | null | undefined, categories: CategoryOption[]) {
  const raw = value?.trim() ?? "";

  if (!raw) {
    return "Not set";
  }

  const normalizedCode = normalizeHierarchyCode(raw);
  const normalizedName = normalizeHierarchyLookup(raw);
  const match =
    categories.find((category) => category.code === normalizedCode) ??
    categories.find((category) => normalizeHierarchyLookup(category.name) === normalizedName);

  return match ? `${match.name} (${match.code})` : raw;
}

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

function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "ACTIVE" || value === "ACKNOWLEDGED"
      ? "bg-emerald-100 text-emerald-700"
      : value === "FAILED" || value === "DEAD_LETTER" || value === "INACTIVE"
        ? "bg-rose-100 text-rose-700"
        : "bg-sky-100 text-sky-700";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
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
      <p className="mt-0.5 truncate text-xs text-stone-500">{new Date(value).toLocaleString()}</p>
    </div>
  );
}

export function EnterpriseProductDetail({
  detail
}: {
  detail: EnterpriseProductDetailData;
}) {
  const router = useRouter();
  const defaultPriceRow = detail.priceRows.find((row) => row.isDefault) ?? null;
  const [isPricingDialogOpen, setIsPricingDialogOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isBarcodeDialogOpen, setIsBarcodeDialogOpen] = useState(false);
  const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false);
  const [isMatrixDialogOpen, setIsMatrixDialogOpen] = useState(false);
  const [unitPrice, setUnitPrice] = useState(
    (defaultPriceRow?.unitPrice ?? detail.product.baseUnitPrice).toFixed(2)
  );
  const [priceScope, setPriceScope] = useState<"DEFAULT" | "CUSTOMER_TYPE" | "LOYALTY_TIER">(
    "DEFAULT"
  );
  const [priceCustomerType, setPriceCustomerType] = useState("WHOLESALE");
  const [priceLoyaltyTier, setPriceLoyaltyTier] = useState("");
  const [name, setName] = useState(detail.product.name);
  const [sku, setSku] = useState(detail.product.sku ?? "");
  const [shortName, setShortName] = useState(detail.product.shortName ?? "");
  const [description, setDescription] = useState(detail.product.description ?? "");
  const [productType, setProductType] = useState(detail.product.productType);
  const [department, setDepartment] = useState(
    resolveDepartmentSelection(detail.product.department, detail.availableDepartments)
  );
  const [category, setCategory] = useState(
    resolveCategorySelection(
      detail.product.category,
      resolveDepartmentSelection(detail.product.department, detail.availableDepartments),
      detail.availableCategories
    )
  );
  const [subcategory, setSubcategory] = useState(detail.product.subcategory ?? "");
  const [brand, setBrand] = useState(detail.product.brand ?? "");
  const [seasonCode, setSeasonCode] = useState(detail.product.seasonCode ?? "");
  const [unitOfMeasure, setUnitOfMeasure] = useState(detail.product.unitOfMeasure);
  const [uomScheduleCode, setUomScheduleCode] = useState(detail.product.uomScheduleCode ?? "");
  const [packSize, setPackSize] = useState(detail.product.packSize ?? "");
  const [countryOfOrigin, setCountryOfOrigin] = useState(detail.product.countryOfOrigin ?? "");
  const [primaryImageUrl, setPrimaryImageUrl] = useState(detail.product.primaryImageUrl ?? "");
  const [notes, setNotes] = useState(detail.product.notes ?? "");
  const [taxable, setTaxable] = useState(detail.product.taxable);
  const [taxProfileCode, setTaxProfileCode] = useState(detail.taxProfile?.code ?? "");
  const [trackInventory, setTrackInventory] = useState(detail.product.trackInventory);
  const [isSerialized, setIsSerialized] = useState(detail.product.isSerialized);
  const [trackSize, setTrackSize] = useState(detail.product.trackSize);
  const [trackColor, setTrackColor] = useState(detail.product.trackColor);
  const [allowPriceOverride, setAllowPriceOverride] = useState(detail.product.allowPriceOverride);
  const [mustEnterPriceAtPos, setMustEnterPriceAtPos] = useState(detail.product.mustEnterPriceAtPos);
  const [minStockLevel, setMinStockLevel] = useState(
    detail.product.minStockLevel !== null ? detail.product.minStockLevel.toFixed(3) : ""
  );
  const [reorderPoint, setReorderPoint] = useState(
    detail.product.reorderPoint !== null ? detail.product.reorderPoint.toFixed(3) : ""
  );
  const [reorderQuantity, setReorderQuantity] = useState(
    detail.product.reorderQuantity !== null ? detail.product.reorderQuantity.toFixed(3) : ""
  );
  const [safetyStockLevel, setSafetyStockLevel] = useState(
    detail.product.safetyStockLevel !== null ? detail.product.safetyStockLevel.toFixed(3) : ""
  );
  const [shelfLifeDays, setShelfLifeDays] = useState(
    detail.product.shelfLifeDays !== null ? String(detail.product.shelfLifeDays) : ""
  );
  const [weightKg, setWeightKg] = useState(
    detail.product.weightKg !== null ? detail.product.weightKg.toFixed(3) : ""
  );
  const [volumeLitres, setVolumeLitres] = useState(
    detail.product.volumeLitres !== null ? detail.product.volumeLitres.toFixed(3) : ""
  );
  const [baseCostPrice, setBaseCostPrice] = useState(
    detail.product.baseCostPrice !== null ? detail.product.baseCostPrice.toFixed(2) : ""
  );
  const [status, setStatus] = useState(detail.product.status);
  const [barcode, setBarcode] = useState("");
  const [barcodeType, setBarcodeType] = useState("EAN13");
  const [supplierNo, setSupplierNo] = useState(detail.availableSuppliers[0]?.supplierNo ?? "");
  const [supplierSku, setSupplierSku] = useState("");
  const [supplierProductName, setSupplierProductName] = useState("");
  const [supplierPackCostPrice, setSupplierPackCostPrice] = useState("");
  const [supplierLeadTimeDays, setSupplierLeadTimeDays] = useState("");
  const [supplierMinimumOrderQuantity, setSupplierMinimumOrderQuantity] = useState("");
  const [supplierIsPrimary, setSupplierIsPrimary] = useState(detail.supplierRows.length === 0);
  const [matrixAttributesDraft, setMatrixAttributesDraft] = useState<MatrixAttributeDraft[]>(() =>
    toMatrixAttributeDrafts(detail)
  );
  const [matrixVariantsDraft, setMatrixVariantsDraft] = useState<MatrixVariantDraft[]>(() =>
    toMatrixVariantDrafts(detail)
  );
  const [matrixAttributeToAdd, setMatrixAttributeToAdd] = useState("");
  const [pricingState, setPricingState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({
    status: "idle",
    message: ""
  });
  const [profileState, setProfileState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({
    status: "idle",
    message: ""
  });
  const [barcodeState, setBarcodeState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({
    status: "idle",
    message: ""
  });
  const [supplierState, setSupplierState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({
    status: "idle",
    message: ""
  });
  const [matrixState, setMatrixState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({
    status: "idle",
    message: ""
  });
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: detail.currencyCode
      }),
    [detail.currencyCode]
  );
  const activeCategoryOptions = useMemo(
    () => detail.availableCategories.filter((option) => option.departmentCode === department),
    [department, detail.availableCategories]
  );
  const hasKnownDepartment = useMemo(
    () => detail.availableDepartments.some((option) => option.code === department),
    [department, detail.availableDepartments]
  );
  const hasKnownCategory = useMemo(
    () => activeCategoryOptions.some((option) => option.code === category),
    [activeCategoryOptions, category]
  );
  const activeUomScheduleOptions = useMemo(
    () =>
      detail.availableUomSchedules.filter(
        (option) => !unitOfMeasure || option.baseUnitCode === unitOfMeasure
      ),
    [detail.availableUomSchedules, unitOfMeasure]
  );
  const hasKnownUnit = useMemo(
    () => detail.availableUnitsOfMeasure.some((option) => option.uomCode === unitOfMeasure),
    [detail.availableUnitsOfMeasure, unitOfMeasure]
  );
  const hasKnownSchedule = useMemo(
    () =>
      !uomScheduleCode ||
      activeUomScheduleOptions.some((option) => option.scheduleCode === uomScheduleCode),
    [activeUomScheduleOptions, uomScheduleCode]
  );
  const departmentDisplayLabel = useMemo(
    () => formatDepartmentLabel(detail.product.department, detail.availableDepartments),
    [detail.availableDepartments, detail.product.department]
  );
  const categoryDisplayLabel = useMemo(
    () => formatCategoryLabel(detail.product.category, detail.availableCategories),
    [detail.availableCategories, detail.product.category]
  );
  const matrixAttributeOptions = useMemo(() => activeMatrixAttributeOptions(detail), [detail]);
  const selectedMatrixAttributes = useMemo(
    () => selectedMatrixAttributeOptions(matrixAttributesDraft, matrixAttributeOptions),
    [matrixAttributeOptions, matrixAttributesDraft]
  );
  const availableMatrixAttributesToAdd = useMemo(
    () =>
      matrixAttributeOptions.filter(
        (option) => !matrixAttributesDraft.some((draft) => draft.code === option.code)
      ),
    [matrixAttributeOptions, matrixAttributesDraft]
  );

  const pricingColumns = useMemo<ColumnDef<PriceRow>[]>(
    () => [
      {
        accessorKey: "priceListName",
        header: "Price list",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.priceListName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.priceListCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "unitPrice",
        header: "Unit price",
        cell: ({ row }) => currencyFormatter.format(row.original.unitPrice)
      },
      {
        accessorKey: "currencyCode",
        header: "Currency"
      },
      {
        id: "profile",
        header: "Profile",
        cell: ({ row }) =>
          row.original.loyaltyTier
            ? `Tier: ${row.original.loyaltyTier}`
            : row.original.customerType
              ? `Type: ${row.original.customerType}`
              : row.original.isDefault
                ? "Walk-in/default"
                : "General"
      },
      {
        accessorKey: "isDefault",
        header: "Default",
        cell: ({ row }) => (row.original.isDefault ? "Default sell" : "Optional")
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter]
  );

  const matrixVariantColumns = useMemo<ColumnDef<MatrixVariantRow>[]>(
    () => [
      {
        accessorKey: "code",
        header: "SKU",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.code}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.displayName ?? row.original.sku ?? "Matrix option"}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        id: "attributes",
        header: "Attributes",
        cell: ({ row }) =>
          row.original.attributeValues.length > 0
            ? row.original.attributeValues
                .map((value) => `${value.attributeName}: ${value.valueLabel}`)
                .join(" / ")
            : "Not set"
      },
      {
        accessorKey: "unitPrice",
        header: "Price",
        cell: ({ row }) => currencyFormatter.format(row.original.unitPrice)
      },
      {
        accessorKey: "quantityOnHand",
        header: "Stock",
        cell: ({ row }) => row.original.quantityOnHand.toLocaleString()
      },
      {
        accessorKey: "barcode",
        header: "Barcode",
        cell: ({ row }) => row.original.barcode ?? "Not set"
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter]
  );

  const supplierColumns = useMemo<ColumnDef<SupplierRow>[]>(
    () => [
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
        accessorKey: "supplierSku",
        header: "Supplier SKU",
        cell: ({ row }) => row.original.supplierSku ?? "Not set"
      },
      {
        accessorKey: "packCostPrice",
        header: "Pack cost",
        cell: ({ row }) =>
          row.original.packCostPrice !== null
            ? currencyFormatter.format(row.original.packCostPrice)
            : "Not set"
      },
      {
        accessorKey: "leadTimeDays",
        header: "Lead time",
        cell: ({ row }) =>
          row.original.leadTimeDays !== null ? `${row.original.leadTimeDays} day(s)` : "Not set"
      },
      {
        accessorKey: "minimumOrderQuantity",
        header: "MOQ",
        cell: ({ row }) =>
          row.original.minimumOrderQuantity !== null ? row.original.minimumOrderQuantity : "Not set"
      },
      {
        accessorKey: "isPrimary",
        header: "Primary",
        cell: ({ row }) => (row.original.isPrimary ? "Primary" : "Secondary")
      }
    ],
    [currencyFormatter]
  );

  const inventoryColumns = useMemo<ColumnDef<InventoryRow>[]>(
    () => [
      {
        accessorKey: "movementType",
        header: "Movement"
      },
      {
        accessorKey: "quantity",
        header: "Quantity"
      },
      {
        accessorKey: "storeName",
        header: "Store",
        cell: ({ row }) =>
          row.original.storeName && row.original.storeCode
            ? `${row.original.storeName} • ${row.original.storeCode}`
            : "No store binding"
      },
      {
        accessorKey: "externalReference",
        header: "Reference",
        cell: ({ row }) => row.original.externalReference ?? "No reference"
      },
      {
        accessorKey: "occurredAtLabel",
        header: "Occurred",
        cell: ({ row }) => renderTimestamp(row.original.occurredAt, row.original.occurredAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const salesColumns = useMemo<ColumnDef<SalesRow>[]>(
    () => [
      {
        accessorKey: "transactionNo",
        header: "Transaction"
      },
      {
        accessorKey: "quantity",
        header: "Qty"
      },
      {
        accessorKey: "lineTotal",
        header: "Line total",
        cell: ({ row }) => currencyFormatter.format(row.original.lineTotal)
      },
      {
        accessorKey: "storeName",
        header: "Store",
        cell: ({ row }) => `${row.original.storeName} • ${row.original.storeCode}`
      },
      {
        accessorKey: "completedAtLabel",
        header: "Completed",
        cell: ({ row }) => renderTimestamp(row.original.completedAt, row.original.completedAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter]
  );

  const syncColumns = useMemo<ColumnDef<SyncPacketRow>[]>(
    () => [
      {
        accessorKey: "eventType",
        header: "Event",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.eventType}</p>
            <p className="truncate text-xs text-stone-500">{row.original.eventId}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "targetNodeCode",
        header: "Target",
        cell: ({ row }) => row.original.targetNodeCode ?? "All stores"
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "createdAtLabel",
        header: "Published",
        cell: ({ row }) => renderTimestamp(row.original.createdAt, row.original.createdAtLabel),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "acknowledgedAtLabel",
        header: "Acknowledged",
        cell: ({ row }) =>
          renderTimestamp(row.original.acknowledgedAt, row.original.acknowledgedAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  function handleDepartmentChange(nextDepartmentCode: string) {
    setDepartment(nextDepartmentCode);

    setCategory((currentCategory) =>
      detail.availableCategories.some(
        (option) =>
          option.departmentCode === nextDepartmentCode && option.code === currentCategory
      )
        ? currentCategory
        : ""
    );
  }

  function handlePricingDialogOpenChange(nextOpen: boolean) {
    setIsPricingDialogOpen(nextOpen);

    if (nextOpen) {
      setUnitPrice((defaultPriceRow?.unitPrice ?? detail.product.baseUnitPrice).toFixed(2));
      setPriceScope("DEFAULT");
      setPriceCustomerType("WHOLESALE");
      setPriceLoyaltyTier("");
      setPricingState({
        status: "idle",
        message: ""
      });
    }
  }

  function handleProfileDialogOpenChange(nextOpen: boolean) {
    setIsProfileDialogOpen(nextOpen);

    if (nextOpen) {
      setName(detail.product.name);
      setSku(detail.product.sku ?? "");
      setShortName(detail.product.shortName ?? "");
      setDescription(detail.product.description ?? "");
      setProductType(detail.product.productType);
      const resolvedDepartment = resolveDepartmentSelection(
        detail.product.department,
        detail.availableDepartments
      );
      setDepartment(resolvedDepartment);
      setCategory(
        resolveCategorySelection(
          detail.product.category,
          resolvedDepartment,
          detail.availableCategories
        )
      );
      setSubcategory(detail.product.subcategory ?? "");
      setBrand(detail.product.brand ?? "");
      setSeasonCode(detail.product.seasonCode ?? "");
      setUnitOfMeasure(detail.product.unitOfMeasure);
      setUomScheduleCode(detail.product.uomScheduleCode ?? "");
      setPackSize(detail.product.packSize ?? "");
      setCountryOfOrigin(detail.product.countryOfOrigin ?? "");
      setPrimaryImageUrl(detail.product.primaryImageUrl ?? "");
      setNotes(detail.product.notes ?? "");
      setTaxable(detail.product.taxable);
      setTaxProfileCode(detail.taxProfile?.code ?? "");
      setTrackInventory(detail.product.trackInventory);
      setIsSerialized(detail.product.isSerialized);
      setTrackSize(detail.product.trackSize);
      setTrackColor(detail.product.trackColor);
      setAllowPriceOverride(detail.product.allowPriceOverride);
      setMustEnterPriceAtPos(detail.product.mustEnterPriceAtPos);
      setMinStockLevel(
        detail.product.minStockLevel !== null ? detail.product.minStockLevel.toFixed(3) : ""
      );
      setReorderPoint(
        detail.product.reorderPoint !== null ? detail.product.reorderPoint.toFixed(3) : ""
      );
      setReorderQuantity(
        detail.product.reorderQuantity !== null ? detail.product.reorderQuantity.toFixed(3) : ""
      );
      setSafetyStockLevel(
        detail.product.safetyStockLevel !== null
          ? detail.product.safetyStockLevel.toFixed(3)
          : ""
      );
      setShelfLifeDays(
        detail.product.shelfLifeDays !== null ? String(detail.product.shelfLifeDays) : ""
      );
      setWeightKg(detail.product.weightKg !== null ? detail.product.weightKg.toFixed(3) : "");
      setVolumeLitres(
        detail.product.volumeLitres !== null ? detail.product.volumeLitres.toFixed(3) : ""
      );
      setBaseCostPrice(
        detail.product.baseCostPrice !== null ? detail.product.baseCostPrice.toFixed(2) : ""
      );
      setStatus(detail.product.status);
      setProfileState({
        status: "idle",
        message: ""
      });
    }
  }

  function handleBarcodeDialogOpenChange(nextOpen: boolean) {
    setIsBarcodeDialogOpen(nextOpen);

    if (nextOpen) {
      setBarcode("");
      setBarcodeType("EAN13");
      setBarcodeState({
        status: "idle",
        message: ""
      });
    }
  }

  function handleSupplierDialogOpenChange(nextOpen: boolean) {
    setIsSupplierDialogOpen(nextOpen);

    if (nextOpen) {
      setSupplierNo(detail.availableSuppliers[0]?.supplierNo ?? "");
      setSupplierSku("");
      setSupplierProductName("");
      setSupplierPackCostPrice("");
      setSupplierLeadTimeDays("");
      setSupplierMinimumOrderQuantity("");
      setSupplierIsPrimary(detail.supplierRows.length === 0);
      setSupplierState({
        status: "idle",
        message: ""
      });
    }
  }

  function handleMatrixDialogOpenChange(nextOpen: boolean) {
    setIsMatrixDialogOpen(nextOpen);

    if (nextOpen) {
      setMatrixAttributesDraft(toMatrixAttributeDrafts(detail));
      setMatrixVariantsDraft(toMatrixVariantDrafts(detail));
      setMatrixAttributeToAdd("");
      setMatrixState({
        status: "idle",
        message: ""
      });
    }
  }

  async function handleUpdatePricing() {
    const nextUnitPrice = Number(unitPrice);

    if (!Number.isFinite(nextUnitPrice) || nextUnitPrice <= 0) {
      setPricingState({
        status: "error",
        message: "Flash ERP needs a unit price greater than zero."
      });
      return;
    }

    setPricingState({
      status: "submitting",
      message: ""
    });

    try {
      const response = await fetch(
        `/api/catalog/products/${encodeURIComponent(detail.product.code)}/pricing`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            unitPrice: nextUnitPrice,
            priceScope,
            customerType:
              priceScope === "CUSTOMER_TYPE" || priceScope === "LOYALTY_TIER"
                ? priceCustomerType
                : null,
            loyaltyTier: priceScope === "LOYALTY_TIER" ? priceLoyaltyTier : null
          })
        }
      );
      const payload = (await response.json()) as Partial<UpdateEnterpriseProductPricingResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.message ?? "Flash ERP could not update the enterprise product price."
        );
      }

      setPricingState({
        status: "success",
        message:
          payload.message ??
          "Flash ERP updated the enterprise product price and queued the next downstream delta for store pulls."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsPricingDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setPricingState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update the enterprise product price."
      });
    }
  }

  async function handleUpdateProfile() {
    if (!name.trim()) {
      setProfileState({
        status: "error",
        message: "Flash ERP needs a product name before saving this profile."
      });
      return;
    }

    if (!department.trim()) {
      setProfileState({
        status: "error",
        message: "Select a product department before saving this profile."
      });
      return;
    }

    if (!category.trim()) {
      setProfileState({
        status: "error",
        message: "Select a product category before saving this profile."
      });
      return;
    }

    setProfileState({
      status: "submitting",
      message: ""
    });

    try {
      const response = await fetch(
        `/api/catalog/products/${encodeURIComponent(detail.product.code)}/profile`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name,
            sku,
            shortName,
            description,
            productType,
            department,
            category,
            subcategory,
            brand,
            seasonCode,
            unitOfMeasure,
            uomScheduleCode: uomScheduleCode || null,
            packSize,
            countryOfOrigin,
            primaryImageUrl,
            notes,
            taxable,
            taxProfileCode: taxable && taxProfileCode.trim() ? taxProfileCode : null,
            trackInventory,
            isSerialized,
            trackSize,
            trackColor,
            allowPriceOverride,
            mustEnterPriceAtPos,
            minStockLevel: minStockLevel.trim().length > 0 ? Number(minStockLevel) : null,
            reorderPoint: reorderPoint.trim().length > 0 ? Number(reorderPoint) : null,
            reorderQuantity:
              reorderQuantity.trim().length > 0 ? Number(reorderQuantity) : null,
            safetyStockLevel:
              safetyStockLevel.trim().length > 0 ? Number(safetyStockLevel) : null,
            shelfLifeDays: shelfLifeDays.trim().length > 0 ? Number(shelfLifeDays) : null,
            weightKg: weightKg.trim().length > 0 ? Number(weightKg) : null,
            volumeLitres: volumeLitres.trim().length > 0 ? Number(volumeLitres) : null,
            baseCostPrice: baseCostPrice.trim().length > 0 ? Number(baseCostPrice) : null,
            status
          })
        }
      );
      const payload = (await response.json()) as Partial<UpdateEnterpriseProductProfileResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.message ?? "Flash ERP could not update the enterprise product profile."
        );
      }

      setProfileState({
        status: "success",
        message:
          payload.message ??
          "Flash ERP updated the enterprise product profile and queued the next downstream delta for store pulls."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsProfileDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setProfileState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update the enterprise product profile."
      });
    }
  }

  async function handleLinkSupplier() {
    setSupplierState({
      status: "submitting",
      message: ""
    });

    try {
      const response = await fetch(
        `/api/catalog/products/${encodeURIComponent(detail.product.code)}/suppliers`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            supplierNo,
            supplierSku,
            supplierProductName,
            packCostPrice:
              supplierPackCostPrice.trim().length > 0 ? Number(supplierPackCostPrice) : null,
            leadTimeDays:
              supplierLeadTimeDays.trim().length > 0 ? Number(supplierLeadTimeDays) : null,
            minimumOrderQuantity:
              supplierMinimumOrderQuantity.trim().length > 0
                ? Number(supplierMinimumOrderQuantity)
                : null,
            isPrimary: supplierIsPrimary
          })
        }
      );
      const payload = (await response.json()) as Partial<LinkEnterpriseProductSupplierResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not link that supplier.");
      }

      setSupplierState({
        status: "success",
        message:
          payload.message ??
          "Flash ERP linked the supplier and queued the next product delta for stores."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsSupplierDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setSupplierState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not link that supplier."
      });
    }
  }

  async function handleAddBarcode() {
    setBarcodeState({
      status: "submitting",
      message: ""
    });

    try {
      const response = await fetch(
        `/api/catalog/products/${encodeURIComponent(detail.product.code)}/barcodes`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            barcode,
            barcodeType
          })
        }
      );
      const payload = (await response.json()) as Partial<AddEnterpriseProductBarcodeResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not attach that barcode.");
      }

      setBarcodeState({
        status: "success",
        message:
          payload.message ??
          "Flash ERP attached the barcode and queued the next scanner delta for store pulls."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsBarcodeDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setBarcodeState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not attach that barcode."
      });
    }
  }

  function addMatrixAttribute() {
    const option =
      matrixAttributeOptions.find((attribute) => attribute.code === matrixAttributeToAdd) ??
      availableMatrixAttributesToAdd[0];

    if (!option) {
      return;
    }

    setMatrixAttributesDraft((current) => [
      ...current,
      {
        code: option.code,
        selectedValueCodes: option.values.slice(0, 3).map((value) => value.code)
      }
    ]);
    setMatrixAttributeToAdd("");
  }

  function removeMatrixAttribute(attributeCode: string) {
    setMatrixAttributesDraft((current) =>
      current.filter((attribute) => attribute.code !== attributeCode)
    );
    setMatrixVariantsDraft((current) =>
      current.map((variant) => {
        const { [attributeCode]: _removed, ...attributeValues } = variant.attributeValues;
        return {
          ...variant,
          attributeValues
        };
      })
    );
  }

  function toggleMatrixAttributeValue(attributeCode: string, valueCode: string) {
    setMatrixAttributesDraft((current) =>
      current.map((attribute) => {
        if (attribute.code !== attributeCode) {
          return attribute;
        }

        const selectedValueCodes = attribute.selectedValueCodes.includes(valueCode)
          ? attribute.selectedValueCodes.filter((code) => code !== valueCode)
          : [...attribute.selectedValueCodes, valueCode];

        return {
          ...attribute,
          selectedValueCodes
        };
      })
    );
    setMatrixVariantsDraft((current) =>
      current.map((variant) =>
        variant.attributeValues[attributeCode] === valueCode
          ? {
              ...variant,
              attributeValues: {
                ...variant.attributeValues,
                [attributeCode]: ""
              }
            }
          : variant
      )
    );
  }

  function updateMatrixVariant(
    rowId: string,
    patch: Partial<Omit<MatrixVariantDraft, "rowId" | "attributeValues">>
  ) {
    setMatrixVariantsDraft((current) =>
      current.map((variant) => (variant.rowId === rowId ? { ...variant, ...patch } : variant))
    );
  }

  function updateMatrixVariantAttribute(rowId: string, attributeCode: string, valueCode: string) {
    setMatrixVariantsDraft((current) =>
      current.map((variant) =>
        variant.rowId === rowId
          ? {
              ...variant,
              attributeValues: {
                ...variant.attributeValues,
                [attributeCode]: valueCode
              }
            }
          : variant
      )
    );
  }

  function addMatrixVariantRow() {
    const attributeValues = Object.fromEntries(
      matrixAttributesDraft.map((attribute) => [
        attribute.code,
        attribute.selectedValueCodes[0] ?? ""
      ])
    );
    const selectedValues = selectedMatrixAttributes.map(
      (attribute) => attributeValues[attribute.code] ?? ""
    );
    const existingCodes = new Set(matrixVariantsDraft.map((variant) => variant.code));
    const code = generateMatrixCode(detail.product.code, selectedValues, existingCodes);

    setMatrixVariantsDraft((current) => [
      ...current,
      {
        rowId: makeMatrixRowId(),
        code,
        sku: code,
        displayName: selectedMatrixAttributes
          .map((attribute) => getMatrixValueLabel(attribute, attributeValues[attribute.code] ?? ""))
          .filter(Boolean)
          .join(" / "),
        unitPrice: detail.product.baseUnitPrice.toFixed(2),
        costPrice: moneyDraft(detail.product.baseCostPrice),
        quantityOnHand: "0",
        barcode: "",
        status: "ACTIVE",
        attributeValues
      }
    ]);
  }

  function removeMatrixVariantRow(rowId: string) {
    setMatrixVariantsDraft((current) => current.filter((variant) => variant.rowId !== rowId));
  }

  function generateMatrixVariants() {
    const attributes = selectedMatrixAttributes;

    if (attributes.length === 0) {
      setMatrixState({
        status: "error",
        message: "Choose at least one configured matrix attribute before generating combinations."
      });
      return;
    }

    const selectedValueGroups = attributes.map((attribute) => {
      const draft = matrixAttributesDraft.find((candidate) => candidate.code === attribute.code);
      return draft?.selectedValueCodes ?? [];
    });

    if (selectedValueGroups.some((group) => group.length === 0)) {
      setMatrixState({
        status: "error",
        message: "Each selected matrix attribute needs at least one configured value."
      });
      return;
    }

    const combinations = matrixCartesianProduct(selectedValueGroups);

    if (combinations.length > 250) {
      setMatrixState({
        status: "error",
        message: "Reduce the selected values before generating more than 250 combinations."
      });
      return;
    }

    const existingBySignature = new Map(
      matrixVariantsDraft.map((variant) => [
        matrixSelectionSignature(attributes, variant.attributeValues),
        variant
      ])
    );
    const usedCodes = new Set<string>();
    const nextVariants = combinations.map((values) => {
      const attributeValues = Object.fromEntries(
        attributes.map((attribute, index) => [attribute.code, values[index] ?? ""])
      );
      const signature = matrixSelectionSignature(attributes, attributeValues);
      const existing = existingBySignature.get(signature);
      const labels = attributes.map((attribute) =>
        getMatrixValueLabel(attribute, attributeValues[attribute.code] ?? "")
      );
      const code = existing?.code
        ? generateMatrixCode("", [existing.code], usedCodes)
        : generateMatrixCode(detail.product.code, values, usedCodes);

      return {
        rowId: existing?.rowId ?? makeMatrixRowId(),
        code,
        sku: existing?.sku || code,
        displayName: existing?.displayName || labels.join(" / "),
        unitPrice: existing?.unitPrice || detail.product.baseUnitPrice.toFixed(2),
        costPrice: existing?.costPrice ?? moneyDraft(detail.product.baseCostPrice),
        quantityOnHand: existing?.quantityOnHand || "0",
        barcode: existing?.barcode ?? "",
        status: existing?.status || "ACTIVE",
        attributeValues
      };
    });

    setMatrixVariantsDraft(nextVariants);
    setMatrixState({
      status: "idle",
      message: ""
    });
  }

  function buildMatrixPayload() {
    const attributes = selectedMatrixAttributes.map((attribute) => {
      const draft = matrixAttributesDraft.find((candidate) => candidate.code === attribute.code);
      const valueCodes = draft?.selectedValueCodes ?? [];
      const values = valueCodes.map((valueCode) => {
        const value = attribute.values.find((candidate) => candidate.code === valueCode);

        if (!value) {
          throw new Error(`${attribute.name} has an invalid selected value.`);
        }

        return {
          code: value.code,
          label: value.label
        };
      });

      if (values.length === 0) {
        throw new Error(`${attribute.name} needs at least one value.`);
      }

      return {
        code: attribute.code,
        name: attribute.name,
        values
      };
    });

    if (attributes.length === 0) {
      throw new Error("Choose at least one configured matrix attribute.");
    }

    if (matrixVariantsDraft.length === 0) {
      throw new Error("Add or generate at least one matrix combination.");
    }

    const seenCodes = new Set<string>();
    const variants = matrixVariantsDraft.map((variant) => {
      const code = toMatrixKey(variant.code || variant.sku);
      const unitPrice = Number(variant.unitPrice);
      const costPrice = variant.costPrice.trim() ? Number(variant.costPrice) : null;
      const quantityOnHand = Number(variant.quantityOnHand);

      if (!code) {
        throw new Error("Each matrix combination needs a SKU.");
      }

      if (seenCodes.has(code)) {
        throw new Error(`Matrix SKU "${code}" is duplicated.`);
      }

      seenCodes.add(code);

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error(`Enter a valid price for ${code}.`);
      }

      if (costPrice !== null && (!Number.isFinite(costPrice) || costPrice < 0)) {
        throw new Error(`Enter a valid cost for ${code}.`);
      }

      if (!Number.isFinite(quantityOnHand) || quantityOnHand < 0) {
        throw new Error(`Enter valid stock for ${code}.`);
      }

      const attributeValues = Object.fromEntries(
        attributes.map((attribute) => {
          const valueCode = variant.attributeValues[attribute.code] ?? "";
          const configured = attribute.values.some((value) => value.code === valueCode);

          if (!configured) {
            throw new Error(`Choose a configured ${attribute.name} value for ${code}.`);
          }

          return [attribute.code, valueCode];
        })
      );

      return {
        code,
        sku: variant.sku.trim() || code,
        displayName: variant.displayName.trim() || null,
        unitPrice,
        costPrice,
        quantityOnHand,
        barcode: variant.barcode.trim() || null,
        status: variant.status || "ACTIVE",
        attributeValues
      };
    });

    return {
      attributes,
      variants
    };
  }

  async function handleSaveMatrix() {
    setMatrixState({
      status: "submitting",
      message: ""
    });

    try {
      const { attributes, variants } = buildMatrixPayload();

      const response = await fetch(
        `/api/catalog/products/${encodeURIComponent(detail.product.code)}/matrix`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            attributes,
            variants
          })
        }
      );
      const payload = (await response.json()) as Partial<UpsertEnterpriseProductMatrixResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save the product matrix.");
      }

      setMatrixState({
        status: "success",
        message:
          payload.message ??
          "Flash ERP saved the matrix product combinations for this style."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsMatrixDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setMatrixState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save the product matrix."
      });
    }
  }

  return (
    <EnterpriseShell
      activeSection="master"
      description={`Inspect pricing, barcode coverage, downstream publication posture, and canonical usage for ${detail.product.name}.`}
      eyebrow={`Flash ERP enterprise • ${detail.product.code}`}
      heading={detail.product.name}
    >
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
            href="/catalog"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to catalog
          </Link>
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
            href="/sync"
          >
            Open sync command
          </Link>
          <ActionDialog
            description="Update the enterprise master sell price for this product. Flash ERP will keep the default price list aligned and let the next store pull publish the pricing delta automatically."
            onOpenChange={handlePricingDialogOpenChange}
            open={isPricingDialogOpen}
            title="Update product pricing"
            triggerClassName="border-[color:var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] text-[color:var(--brand-deep)] hover:border-[color:var(--brand)] hover:text-[color:var(--brand-deep)]"
            triggerLabel="Update price"
            widthClassName="max-w-2xl"
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
                Flash ERP will update the enterprise product master and the default sell price
                entry together. Stores will receive the delta the next time they pull from
                enterprise.
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Product</span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-stone-700"
                    disabled
                    value={`${detail.product.name} (${detail.product.code})`}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Default price list</span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-stone-700"
                    disabled
                    value={
                      defaultPriceRow
                        ? `${defaultPriceRow.priceListName} (${defaultPriceRow.priceListCode})`
                        : "Default sell price entry will be created"
                    }
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Price audience</span>
                  <select
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) =>
                      setPriceScope(
                        event.target.value as "DEFAULT" | "CUSTOMER_TYPE" | "LOYALTY_TIER"
                      )
                    }
                    value={priceScope}
                  >
                    <option value="DEFAULT">Default walk-in price</option>
                    <option value="CUSTOMER_TYPE">Customer type price</option>
                    <option value="LOYALTY_TIER">Loyalty tier price</option>
                  </select>
                </label>
                {priceScope !== "DEFAULT" ? (
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Customer type</span>
                    <select
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setPriceCustomerType(event.target.value)}
                      value={priceCustomerType}
                    >
                      {priceCustomerTypeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {priceScope === "LOYALTY_TIER" ? (
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Loyalty tier</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setPriceLoyaltyTier(event.target.value)}
                      placeholder="Gold"
                      value={priceLoyaltyTier}
                    />
                  </label>
                ) : null}
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Current base price</span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-stone-700"
                    disabled
                    value={currencyFormatter.format(detail.product.baseUnitPrice)}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">New unit price</span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    min="0.01"
                    onChange={(event) => setUnitPrice(event.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    type="number"
                    value={unitPrice}
                  />
                </label>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                <p className="font-semibold text-stone-900">Downstream effect</p>
                <p className="mt-1">
                  The next store pull will publish a product delta and a pricing delta for{" "}
                  {detail.product.code}. Stores do not need a manual republish for this change.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                  disabled={pricingState.status === "submitting"}
                  onClick={() => setIsPricingDialogOpen(false)}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
                  disabled={
                    pricingState.status === "submitting" ||
                    Number(unitPrice) <= 0 ||
                    (priceScope === "LOYALTY_TIER" && !priceLoyaltyTier.trim())
                  }
                  onClick={() => void handleUpdatePricing()}
                  type="button"
                >
                  {pricingState.status === "submitting" ? "Updating price..." : "Save price"}
                </button>
              </div>
              {pricingState.message ? (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                    pricingState.status === "error"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {pricingState.message}
                </div>
              ) : null}
            </div>
          </ActionDialog>
          <ActionDialog
            description="Update the product profile fields that drive enterprise catalog posture and downstream product publication."
            onOpenChange={handleProfileDialogOpenChange}
            open={isProfileDialogOpen}
            title="Edit product profile"
            triggerClassName="border-stone-300 bg-white text-stone-800 hover:border-stone-400 hover:text-stone-950"
            triggerLabel="Edit product"
            widthClassName="max-w-6xl"
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700">
                Flash ERP keeps pricing separate, so this action updates merchandising, tax, and
                replenishment posture while leaving the sell price flow on its own command path.
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Product code</span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-stone-700"
                    disabled
                    value={detail.product.code}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Status</span>
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
                  <span className="block font-semibold text-stone-900">Product name</span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setName(event.target.value)}
                    value={name}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">SKU</span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setSku(event.target.value)}
                    placeholder="Optional SKU"
                    value={sku}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Short name</span>
                  <input className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]" onChange={(event) => setShortName(event.target.value)} value={shortName} />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Product type</span>
                  <select className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]" onChange={(event) => setProductType(event.target.value)} value={productType}>
                    {matrixProductTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Department</span>
                  <select
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => handleDepartmentChange(event.target.value)}
                    value={department}
                  >
                    <option value="">Select department</option>
                    {!hasKnownDepartment && department ? (
                      <option value={department}>Legacy selection: {department}</option>
                    ) : null}
                    {detail.availableDepartments.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.name} ({option.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Category</span>
                  <select
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    disabled={!department}
                    onChange={(event) => setCategory(event.target.value)}
                    value={category}
                  >
                    <option value="">
                      {department ? "Select category" : "Select department first"}
                    </option>
                    {!hasKnownCategory && category ? (
                      <option value={category}>Legacy selection: {category}</option>
                    ) : null}
                    {activeCategoryOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.name} ({option.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Subcategory</span>
                  <input className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]" onChange={(event) => setSubcategory(event.target.value)} value={subcategory} />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Brand</span>
                  <input className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]" onChange={(event) => setBrand(event.target.value)} value={brand} />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Season code</span>
                  <input className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]" onChange={(event) => setSeasonCode(event.target.value)} value={seasonCode} />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Unit of measure</span>
                  <select
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => {
                      setUnitOfMeasure(event.target.value);
                      setUomScheduleCode("");
                    }}
                    value={unitOfMeasure}
                  >
                    {!hasKnownUnit && unitOfMeasure ? (
                      <option value={unitOfMeasure}>Legacy selection: {unitOfMeasure}</option>
                    ) : null}
                    {detail.availableUnitsOfMeasure.length === 0 ? (
                      <option value={unitOfMeasure || "EA"}>{unitOfMeasure || "EA"}</option>
                    ) : null}
                    {detail.availableUnitsOfMeasure.map((unit: UnitOption) => (
                      <option key={unit.uomCode} value={unit.uomCode}>
                        {unit.name} ({unit.uomCode})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">UOM schedule</span>
                  <select
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setUomScheduleCode(event.target.value)}
                    value={uomScheduleCode}
                  >
                    <option value="">Use stock default</option>
                    {!hasKnownSchedule && uomScheduleCode ? (
                      <option value={uomScheduleCode}>Legacy selection: {uomScheduleCode}</option>
                    ) : null}
                    {activeUomScheduleOptions.map((schedule: UomScheduleOption) => (
                      <option key={schedule.scheduleCode} value={schedule.scheduleCode}>
                        {schedule.name} ({schedule.scheduleCode})
                        {schedule.isDefaultForStock ? " - default" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Pack size</span>
                  <input className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]" onChange={(event) => setPackSize(event.target.value)} value={packSize} />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Country of origin</span>
                  <input className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]" onChange={(event) => setCountryOfOrigin(event.target.value)} value={countryOfOrigin} />
                </label>
                <ProductImageField
                  className="md:col-span-2 xl:col-span-3"
                  label="Primary image"
                  onChange={setPrimaryImageUrl}
                  value={primaryImageUrl}
                />
                <label className="space-y-2 text-sm text-stone-700 md:col-span-2 xl:col-span-3">
                  <span className="block font-semibold text-stone-900">Description</span>
                  <textarea
                    className="min-h-28 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Optional merchandising or handling notes."
                    value={description}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700 md:col-span-2 xl:col-span-3">
                  <span className="block font-semibold text-stone-900">Notes</span>
                  <textarea className="min-h-28 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]" onChange={(event) => setNotes(event.target.value)} value={notes} />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Tax profile</span>
                  <select className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]" disabled={!taxable} onChange={(event) => setTaxProfileCode(event.target.value)} value={taxProfileCode}>
                    <option value="">No tax profile</option>
                    {detail.availableTaxProfiles.map((profile) => <option key={profile.code} value={profile.code}>{profile.name} ({profile.ratePercent.toFixed(2)}%)</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-stone-700 md:col-span-2 xl:col-span-3">
                  <span className="block font-semibold text-stone-900">Base cost price</span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    min="0"
                    onChange={(event) => setBaseCostPrice(event.target.value)}
                    placeholder="Optional"
                    step="0.01"
                    type="number"
                    value={baseCostPrice}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Min stock level</span>
                  <input className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]" onChange={(event) => setMinStockLevel(event.target.value)} step="0.001" type="number" value={minStockLevel} />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Reorder point</span>
                  <input className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]" onChange={(event) => setReorderPoint(event.target.value)} step="0.001" type="number" value={reorderPoint} />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Reorder quantity</span>
                  <input className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]" onChange={(event) => setReorderQuantity(event.target.value)} step="0.001" type="number" value={reorderQuantity} />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Safety stock</span>
                  <input className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]" onChange={(event) => setSafetyStockLevel(event.target.value)} step="0.001" type="number" value={safetyStockLevel} />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Shelf life days</span>
                  <input className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]" onChange={(event) => setShelfLifeDays(event.target.value)} type="number" value={shelfLifeDays} />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Weight (kg)</span>
                  <input className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]" onChange={(event) => setWeightKg(event.target.value)} step="0.001" type="number" value={weightKg} />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Volume (litres)</span>
                  <input className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]" onChange={(event) => setVolumeLitres(event.target.value)} step="0.001" type="number" value={volumeLitres} />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
                <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700"><input checked={taxable} onChange={(event) => setTaxable(event.target.checked)} type="checkbox" />Taxable</label>
                <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700"><input checked={trackInventory} onChange={(event) => { setTrackInventory(event.target.checked); if (!event.target.checked) { setIsSerialized(false); } }} type="checkbox" />Track inventory</label>
                <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700"><input checked={isSerialized} onChange={(event) => { setIsSerialized(event.target.checked); if (event.target.checked) { setTrackInventory(true); } }} type="checkbox" />Serialized item</label>
                <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700"><input checked={trackSize} onChange={(event) => setTrackSize(event.target.checked)} type="checkbox" />Track size</label>
                <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700"><input checked={trackColor} onChange={(event) => setTrackColor(event.target.checked)} type="checkbox" />Track colour</label>
                <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700"><input checked={allowPriceOverride} onChange={(event) => setAllowPriceOverride(event.target.checked)} type="checkbox" />Allow price override</label>
                <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700"><input checked={mustEnterPriceAtPos} onChange={(event) => setMustEnterPriceAtPos(event.target.checked)} type="checkbox" />Must enter price at POS</label>
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                  disabled={profileState.status === "submitting"}
                  onClick={() => setIsProfileDialogOpen(false)}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
                  disabled={profileState.status === "submitting"}
                  onClick={() => void handleUpdateProfile()}
                  type="button"
                >
                  {profileState.status === "submitting" ? "Saving profile..." : "Save profile"}
                </button>
              </div>
              {profileState.message ? (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                    profileState.status === "error"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {profileState.message}
                </div>
              ) : null}
            </div>
          </ActionDialog>
          <ActionDialog
            description="Configure the sellable SKU combinations beneath this parent product."
            onOpenChange={handleMatrixDialogOpenChange}
            open={isMatrixDialogOpen}
            title="Configure product matrix"
            triggerClassName="border-indigo-300 bg-indigo-50 text-indigo-900 hover:border-indigo-400 hover:text-indigo-950"
            triggerIcon={Grid3X3}
            triggerLabel="Configure matrix"
            widthClassName="max-w-6xl"
          >
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.36fr)_minmax(0,1fr)]">
                <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-stone-950">Attributes</h3>
                      <p className="text-xs text-stone-500">{selectedMatrixAttributes.length} selected</p>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <select
                        className="min-h-10 min-w-40 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        disabled={availableMatrixAttributesToAdd.length === 0}
                        onChange={(event) => setMatrixAttributeToAdd(event.target.value)}
                        value={matrixAttributeToAdd}
                      >
                        <option value="">Select</option>
                        {availableMatrixAttributesToAdd.map((attribute) => (
                          <option key={attribute.code} value={attribute.code}>
                            {attribute.name}
                          </option>
                        ))}
                      </select>
                      <button
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-800 transition hover:border-indigo-300 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={availableMatrixAttributesToAdd.length === 0}
                        onClick={addMatrixAttribute}
                        title="Add attribute"
                        type="button"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {matrixAttributeOptions.length === 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      No active attribute library is available.
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    {selectedMatrixAttributes.map((attribute) => {
                      const draft = matrixAttributesDraft.find((candidate) => candidate.code === attribute.code);
                      const selectedValueCodes = draft?.selectedValueCodes ?? [];

                      return (
                        <section key={attribute.code} className="rounded-xl border border-stone-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-stone-950">{attribute.name}</p>
                              <p className="truncate text-xs text-stone-500">{attribute.code}</p>
                            </div>
                            <button
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => removeMatrixAttribute(attribute.code)}
                              title="Remove attribute"
                              type="button"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {attribute.values.map((value) => {
                              const checked = selectedValueCodes.includes(value.code);

                              return (
                                <label
                                  className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                                    checked
                                      ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                                      : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                                  }`}
                                  key={value.code}
                                >
                                  <input
                                    checked={checked}
                                    className="h-3.5 w-3.5"
                                    onChange={() => toggleMatrixAttributeValue(attribute.code, value.code)}
                                    type="checkbox"
                                  />
                                  {value.label}
                                </label>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-stone-950">Combinations</h3>
                      <p className="text-xs text-stone-500">{matrixVariantsDraft.length} sellable SKU row(s)</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
                        onClick={addMatrixVariantRow}
                        type="button"
                      >
                        <Plus className="h-4 w-4" />
                        Add row
                      </button>
                      <button
                        className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900 transition hover:border-indigo-300 hover:bg-indigo-100"
                        onClick={generateMatrixVariants}
                        type="button"
                      >
                        <Wand2 className="h-4 w-4" />
                        Generate
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[34rem] overflow-auto rounded-xl border border-stone-200">
                    <table className="min-w-full divide-y divide-stone-200 text-sm">
                      <thead className="sticky top-0 z-10 bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
                        <tr>
                          <th className="min-w-44 px-3 py-2 text-left">SKU</th>
                          {selectedMatrixAttributes.map((attribute) => (
                            <th className="min-w-36 px-3 py-2 text-left" key={attribute.code}>
                              {attribute.name}
                            </th>
                          ))}
                          <th className="min-w-28 px-3 py-2 text-right">Price</th>
                          <th className="min-w-28 px-3 py-2 text-right">Cost</th>
                          <th className="min-w-28 px-3 py-2 text-right">Stock</th>
                          <th className="min-w-40 px-3 py-2 text-left">Barcode</th>
                          <th className="min-w-32 px-3 py-2 text-left">Status</th>
                          <th className="w-12 px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 bg-white">
                        {matrixVariantsDraft.length === 0 ? (
                          <tr>
                            <td
                              className="px-3 py-8 text-center text-sm text-stone-500"
                              colSpan={selectedMatrixAttributes.length + 7}
                            >
                              No combinations configured.
                            </td>
                          </tr>
                        ) : (
                          matrixVariantsDraft.map((variant) => (
                            <tr key={variant.rowId} className="align-top">
                              <td className="px-3 py-2">
                                <input
                                  className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 font-mono text-sm outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                                  onChange={(event) => {
                                    const code = toMatrixKey(event.target.value);
                                    updateMatrixVariant(variant.rowId, {
                                      code,
                                      sku: code
                                    });
                                  }}
                                  value={variant.code}
                                />
                              </td>
                              {selectedMatrixAttributes.map((attribute) => {
                                const draft = matrixAttributesDraft.find((candidate) => candidate.code === attribute.code);
                                const selectedValueCodes = draft?.selectedValueCodes ?? [];

                                return (
                                  <td className="px-3 py-2" key={attribute.code}>
                                    <select
                                      className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                                      onChange={(event) =>
                                        updateMatrixVariantAttribute(variant.rowId, attribute.code, event.target.value)
                                      }
                                      value={variant.attributeValues[attribute.code] ?? ""}
                                    >
                                      <option value="">Select</option>
                                      {selectedValueCodes.map((valueCode) => (
                                        <option key={valueCode} value={valueCode}>
                                          {getMatrixValueLabel(attribute, valueCode)}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2">
                                <input
                                  className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-right text-sm outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                                  min="0"
                                  onChange={(event) => updateMatrixVariant(variant.rowId, { unitPrice: event.target.value })}
                                  step="0.01"
                                  type="number"
                                  value={variant.unitPrice}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-right text-sm outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                                  min="0"
                                  onChange={(event) => updateMatrixVariant(variant.rowId, { costPrice: event.target.value })}
                                  step="0.01"
                                  type="number"
                                  value={variant.costPrice}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-right text-sm outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                                  min="0"
                                  onChange={(event) => updateMatrixVariant(variant.rowId, { quantityOnHand: event.target.value })}
                                  step="1"
                                  type="number"
                                  value={variant.quantityOnHand}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                                  onChange={(event) => updateMatrixVariant(variant.rowId, { barcode: event.target.value })}
                                  value={variant.barcode}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                                  onChange={(event) => updateMatrixVariant(variant.rowId, { status: event.target.value })}
                                  value={variant.status}
                                >
                                  <option value="ACTIVE">ACTIVE</option>
                                  <option value="INACTIVE">INACTIVE</option>
                                  <option value="ARCHIVED">ARCHIVED</option>
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-stone-200 text-stone-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                                  onClick={() => removeMatrixVariantRow(variant.rowId)}
                                  title="Remove row"
                                  type="button"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                  disabled={matrixState.status === "submitting"}
                  onClick={() => setIsMatrixDialogOpen(false)}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#4f46e5,#4338ca)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(67,56,202,0.22)] transition hover:brightness-[1.03]"
                  disabled={matrixState.status === "submitting"}
                  onClick={() => void handleSaveMatrix()}
                  type="button"
                >
                  {matrixState.status === "submitting" ? "Saving matrix..." : "Save matrix"}
                </button>
              </div>
              {matrixState.message ? (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                    matrixState.status === "error"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {matrixState.message}
                </div>
              ) : null}
            </div>
          </ActionDialog>
          <ActionDialog
            description="Attach a barcode for scanner-driven retail flows. Flash ERP will publish the scanner delta to stores on their next pull."
            onOpenChange={handleBarcodeDialogOpenChange}
            open={isBarcodeDialogOpen}
            title="Add barcode"
            triggerClassName="border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-400 hover:text-emerald-950"
            triggerLabel="Add barcode"
            widthClassName="max-w-2xl"
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
                Flash ERP will attach this barcode to {detail.product.name} and let the next store
                pull hydrate scanner coverage locally.
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Barcode</span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setBarcode(event.target.value)}
                    placeholder="Scan or enter barcode"
                    value={barcode}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Barcode type</span>
                  <select
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setBarcodeType(event.target.value)}
                    value={barcodeType}
                  >
                    <option value="EAN13">EAN13</option>
                    <option value="CODE128">CODE128</option>
                    <option value="QR">QR</option>
                    <option value="INTERNAL">INTERNAL</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                  disabled={barcodeState.status === "submitting"}
                  onClick={() => setIsBarcodeDialogOpen(false)}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#059669,#047857)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(4,120,87,0.22)] transition hover:brightness-[1.03]"
                  disabled={barcodeState.status === "submitting" || !barcode.trim()}
                  onClick={() => void handleAddBarcode()}
                  type="button"
                >
                  {barcodeState.status === "submitting" ? "Adding barcode..." : "Attach barcode"}
                </button>
              </div>
              {barcodeState.message ? (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                    barcodeState.status === "error"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {barcodeState.message}
                </div>
              ) : null}
            </div>
          </ActionDialog>
          <ActionDialog
            description="Link an enterprise supplier so Flash ERP can carry replenishment posture, vendor SKU, and lead time from the product workspace."
            onOpenChange={handleSupplierDialogOpenChange}
            open={isSupplierDialogOpen}
            title="Link supplier"
            triggerClassName="border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400 hover:text-amber-950"
            triggerLabel="Link supplier"
            widthClassName="max-w-3xl"
          >
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Supplier</span>
                  <select
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setSupplierNo(event.target.value)}
                    value={supplierNo}
                  >
                    {detail.availableSuppliers.map((supplier) => (
                      <option key={supplier.supplierNo} value={supplier.supplierNo}>
                        {supplier.name} ({supplier.supplierNo})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Supplier SKU</span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setSupplierSku(event.target.value)}
                    value={supplierSku}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Supplier product name</span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setSupplierProductName(event.target.value)}
                    value={supplierProductName}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Pack cost price</span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setSupplierPackCostPrice(event.target.value)}
                    step="0.01"
                    type="number"
                    value={supplierPackCostPrice}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Lead time days</span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setSupplierLeadTimeDays(event.target.value)}
                    type="number"
                    value={supplierLeadTimeDays}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Minimum order quantity</span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setSupplierMinimumOrderQuantity(event.target.value)}
                    step="0.001"
                    type="number"
                    value={supplierMinimumOrderQuantity}
                  />
                </label>
              </div>
              <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                <input
                  checked={supplierIsPrimary}
                  onChange={(event) => setSupplierIsPrimary(event.target.checked)}
                  type="checkbox"
                />
                Set as primary supplier
              </label>
              <div className="flex flex-wrap justify-end gap-3">
                <button className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950" disabled={supplierState.status === "submitting"} onClick={() => setIsSupplierDialogOpen(false)} type="button">Close</button>
                <button className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#b45309,#92400e)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(146,64,14,0.22)] transition hover:brightness-[1.03]" disabled={supplierState.status === "submitting" || !supplierNo.trim()} onClick={() => void handleLinkSupplier()} type="button">{supplierState.status === "submitting" ? "Linking..." : "Link supplier"}</button>
              </div>
              {supplierState.message ? <div className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${supplierState.status === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{supplierState.message}</div> : null}
            </div>
          </ActionDialog>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-700">
            Last refresh {new Date(detail.refreshedAt).toLocaleString()}
          </div>
          <StatusBadge value={detail.product.status} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          hint="Current enterprise base unit price for this product."
          icon={ReceiptText}
          label="Base price"
          value={currencyFormatter.format(detail.product.baseUnitPrice)}
        />
        <MetricCard
          hint="Current enterprise base cost for this product."
          icon={Boxes}
          label="Base cost"
          value={
            detail.product.baseCostPrice !== null
              ? currencyFormatter.format(detail.product.baseCostPrice)
              : "Not set"
          }
        />
        <MetricCard
          hint="Barcode coverage currently attached to this product."
          icon={ScanBarcode}
          label="Barcodes"
          value={String(detail.barcodes.length)}
        />
        <MetricCard
          hint="Current record version for downstream publication and change tracking."
          icon={Store}
          label="Record version"
          value={`v${detail.product.recordVersion}`}
        />
      </section>

      <WorkspaceTabs
        ariaLabel="Product detail views"
        defaultValue="master"
        summaries={{
          master:
            "Review enterprise identity, classification, merchandising, and barcode posture for this product.",
          pricing:
            "Inspect tax posture, cost and sell pricing, and downstream commercial settings for this item.",
          matrix:
            "Review configurable attributes and sellable SKU combinations for matrix products.",
          replenishment:
            "Manage stock policy, physical planning values, and supplier sourcing posture from one tab.",
          activity:
            "See how this product is already appearing in canonical inventory and POS operations.",
          sync:
            "Review direct downstream publication packets for this product."
        }}
        tabs={[
          { value: "master", label: "Master", badge: "Live", badgeTone: "success" },
          { value: "pricing", label: "Pricing & Tax" },
          {
            value: "matrix",
            label: "Matrix",
            badge: detail.matrixVariants.length ? String(detail.matrixVariants.length) : undefined
          },
          { value: "replenishment", label: "Replenishment" },
          { value: "activity", label: "Activity" },
          { value: "sync", label: "Sync" }
        ]}
      >
        <WorkspaceTabsContent value="master">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(24rem,1fr)]">
            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Identity & Control
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {[
                    ["Product code", detail.product.code],
                    ["Status", detail.product.status],
                    ["Product type", detail.product.productType],
                    ["SKU", detail.product.sku ?? "Not set"],
                    ["Short name", detail.product.shortName ?? "Not set"],
                    ["Unit of measure", detail.product.unitOfMeasure],
                    ["Created", detail.product.createdAtLabel],
                    ["Updated", detail.product.updatedAtLabel]
                  ].map(([label, value]) => (
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3" key={label}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        {label}
                      </p>
                      <p className="mt-1 break-all text-sm leading-6 text-stone-800">{value}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Classification & Merchandising
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {[
                    ["Department", departmentDisplayLabel],
                    ["Category", categoryDisplayLabel],
                    ["Subcategory", detail.product.subcategory ?? "Not set"],
                    ["Brand", detail.product.brand ?? "Not set"],
                    ["Season code", detail.product.seasonCode ?? "Not set"],
                    ["Pack size", detail.product.packSize ?? "Not set"],
                    ["Country of origin", detail.product.countryOfOrigin ?? "Not set"],
                    ["Primary image", detail.product.primaryImageUrl ?? "Not set"],
                    ["Description", detail.product.description ?? "No description"],
                    ["Notes", detail.product.notes ?? "No notes recorded"]
                  ].map(([label, value]) => (
                    <div
                      className={`rounded-2xl border border-stone-200 bg-white px-4 py-3 ${
                        label === "Description" || label === "Notes"
                          ? "md:col-span-2 xl:col-span-3"
                          : ""
                      }`}
                      key={label}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        {label}
                      </p>
                      {label === "Primary image" && detail.product.primaryImageUrl ? (
                        <a
                          className="mt-1 block break-all text-sm leading-6 text-[color:var(--brand-deep)] underline-offset-4 hover:underline"
                          href={detail.product.primaryImageUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {detail.product.primaryImageUrl}
                        </a>
                      ) : (
                        <p className="mt-1 break-all text-sm leading-6 text-stone-800">{value}</p>
                      )}
                    </div>
                  ))}
                </div>
                {detail.product.primaryImageUrl ? (
                  <div className="mt-4 overflow-hidden rounded-[1.35rem] border border-stone-200 bg-white">
                    <img
                      alt={`${detail.product.name} preview`}
                      className="h-72 w-full object-cover"
                      src={detail.product.primaryImageUrl}
                    />
                  </div>
                ) : null}
              </article>
            </div>

            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Operating Flags
                </p>
                <div className="mt-4 grid gap-3">
                  {[
                    ["Taxable", detail.product.taxable ? "Yes" : "No"],
                    ["Track inventory", detail.product.trackInventory ? "Yes" : "No"],
                    ["Serialized item", detail.product.isSerialized ? "Yes" : "No"],
                    ["Track size", detail.product.trackSize ? "Yes" : "No"],
                    ["Track colour", detail.product.trackColor ? "Yes" : "No"],
                    [
                      "Allow price override",
                      detail.product.allowPriceOverride ? "Yes" : "No"
                    ],
                    [
                      "Must enter price at POS",
                      detail.product.mustEnterPriceAtPos ? "Yes" : "No"
                    ]
                  ].map(([label, value]) => (
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3" key={label}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        {label}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-stone-800">{value}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Barcodes
                </p>
                <div className="mt-4 space-y-3">
                  {detail.barcodes.length > 0 ? (
                    detail.barcodes.map((barcode) => (
                      <div
                        className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700"
                        key={barcode.code}
                      >
                        <p className="font-semibold text-stone-900">{barcode.code}</p>
                        <p className="mt-1 text-xs text-stone-500">{barcode.barcodeType}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                      No barcodes are attached to this product yet.
                    </div>
                  )}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Catalog posture
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
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="pricing">
          <section className="space-y-4">
            <section className="grid gap-4 xl:grid-cols-2">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Commercial posture
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {[
                    ["Base unit price", currencyFormatter.format(detail.product.baseUnitPrice)],
                    [
                      "Base cost price",
                      detail.product.baseCostPrice !== null
                        ? currencyFormatter.format(detail.product.baseCostPrice)
                        : "Not set"
                    ],
                    [
                      "Default sell price",
                      defaultPriceRow
                        ? currencyFormatter.format(defaultPriceRow.unitPrice)
                        : "Not attached"
                    ],
                    [
                      "Allow price override",
                      detail.product.allowPriceOverride ? "Enabled" : "Blocked"
                    ],
                    [
                      "POS price entry",
                      detail.product.mustEnterPriceAtPos ? "Required" : "Uses price list"
                    ]
                  ].map(([label, value]) => (
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3" key={label}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        {label}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-stone-800">{value}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Tax posture
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {[
                    ["Taxable", detail.product.taxable ? "Yes" : "No"],
                    ["Tax profile", detail.taxProfile?.name ?? "No tax profile"],
                    ["Tax code", detail.taxProfile?.code ?? "Not set"],
                    [
                      "Tax mode",
                      detail.taxProfile
                        ? detail.taxProfile.isTaxInclusive
                          ? "Inclusive pricing"
                          : "Exclusive pricing"
                        : "Not set"
                    ],
                    [
                      "Tax rate",
                      detail.taxProfile ? `${detail.taxProfile.ratePercent.toFixed(2)}%` : "0.00%"
                    ]
                  ].map(([label, value]) => (
                    <div
                      className={`rounded-2xl border border-stone-200 bg-white px-4 py-3 ${
                        label === "Tax rate" ? "md:col-span-2" : ""
                      }`}
                      key={label}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        {label}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-stone-800">{value}</p>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <SharedDataGrid
              columns={pricingColumns}
              data={detail.priceRows}
              emptyLabel="No price list entries are attached to this product."
              exportFileName={`flash-erp-${detail.product.code}-pricing`}
              searchPlaceholder="Search price lists for this product"
            />
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="matrix">
          <section className="space-y-4">
            <section className="grid gap-4 xl:grid-cols-3">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Matrix posture
                </p>
                <div className="mt-4 grid gap-3">
                  {[
                    ["Product type", detail.product.productType],
                    ["Attributes", String(detail.matrixAttributes.length)],
                    ["Combinations", String(detail.matrixVariants.length)],
                    [
                      "Available stock",
                      detail.matrixVariants
                        .reduce((sum, variant) => sum + variant.quantityOnHand, 0)
                        .toLocaleString()
                    ]
                  ].map(([label, value]) => (
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3" key={label}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        {label}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-stone-800">{value}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5 xl:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Configured attributes
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {detail.matrixAttributes.length > 0 ? (
                    detail.matrixAttributes.map((attribute) => (
                      <div
                        className="rounded-2xl border border-stone-200 bg-white px-4 py-3"
                        key={attribute.code}
                      >
                        <p className="text-sm font-semibold text-stone-900">{attribute.name}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {attribute.values.map((value) => (
                            <span
                              className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600"
                              key={value.code}
                            >
                              {value.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                      No matrix attributes are configured for this product.
                    </div>
                  )}
                </div>
              </article>
            </section>

            <SharedDataGrid
              columns={matrixVariantColumns}
              data={detail.matrixVariants}
              emptyLabel="No matrix combinations are configured for this product."
              exportFileName={`flash-erp-${detail.product.code}-matrix`}
              searchPlaceholder="Search SKU, barcode, attributes, or status"
            />
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="replenishment">
          <section className="space-y-4">
            <section className="grid gap-4 xl:grid-cols-2">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Replenishment Policy
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[
                    [
                      "Track inventory",
                      detail.product.trackInventory ? "Yes" : "No"
                    ],
                    [
                      "Min stock level",
                      detail.product.minStockLevel !== null
                        ? detail.product.minStockLevel.toFixed(3)
                        : "Not set"
                    ],
                    [
                      "Reorder point",
                      detail.product.reorderPoint !== null
                        ? detail.product.reorderPoint.toFixed(3)
                        : "Not set"
                    ],
                    [
                      "Reorder quantity",
                      detail.product.reorderQuantity !== null
                        ? detail.product.reorderQuantity.toFixed(3)
                        : "Not set"
                    ],
                    [
                      "Safety stock",
                      detail.product.safetyStockLevel !== null
                        ? detail.product.safetyStockLevel.toFixed(3)
                        : "Not set"
                    ],
                    [
                      "Shelf life days",
                      detail.product.shelfLifeDays !== null
                        ? String(detail.product.shelfLifeDays)
                        : "Not set"
                    ],
                    [
                      "Weight (kg)",
                      detail.product.weightKg !== null
                        ? detail.product.weightKg.toFixed(3)
                        : "Not set"
                    ],
                    [
                      "Volume (litres)",
                      detail.product.volumeLitres !== null
                        ? detail.product.volumeLitres.toFixed(3)
                        : "Not set"
                    ]
                  ].map(([label, value]) => (
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3" key={label}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        {label}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-stone-800">{value}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Supplier coverage
                </p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                    {detail.supplierRows.length > 0
                      ? `${detail.supplierRows.length} supplier link(s) are attached to this product, including ${detail.supplierRows.filter((supplier) => supplier.isPrimary).length} primary source(s).`
                      : "No supplier links are attached yet. Link at least one supplier before purchasing and replenishment flows depend on this product."}
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                    {detail.product.trackInventory
                      ? "Inventory tracking is enabled, so store and warehouse operations will expect replenishment thresholds and source suppliers to stay current."
                      : "Inventory tracking is disabled, so replenishment thresholds are informational only until this product becomes stock-managed."}
                  </div>
                </div>
              </article>
            </section>

            <SharedDataGrid
              columns={supplierColumns}
              data={detail.supplierRows}
              emptyLabel="No suppliers are linked to this product yet."
              exportFileName={`flash-erp-${detail.product.code}-suppliers`}
              searchPlaceholder="Search supplier links for this product"
            />
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="activity">
          <section className="grid gap-4 xl:grid-cols-2">
            <SharedDataGrid
              columns={salesColumns}
              data={detail.recentSalesRows}
              emptyLabel="This product has not appeared in recent canonical sales yet."
              exportFileName={`flash-erp-${detail.product.code}-sales`}
              getRowHref={(row) => `/pos/transactions/${encodeURIComponent(row.transactionNo)}`}
              searchPlaceholder="Search recent sale lines"
            />
            <SharedDataGrid
              columns={inventoryColumns}
              data={detail.recentInventoryRows}
              emptyLabel="This product has not appeared in recent canonical inventory movements yet."
              exportFileName={`flash-erp-${detail.product.code}-inventory`}
              getRowHref={(row) => `/operations/inventory/${encodeURIComponent(row.entryId)}`}
              searchPlaceholder="Search recent inventory movements"
            />
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="sync">
          <SharedDataGrid
            columns={syncColumns}
            data={detail.syncPackets}
            emptyLabel="No direct product publication packets are currently attached to this product."
            exportFileName={`flash-erp-${detail.product.code}-sync-packets`}
            getRowHref={(row) => (row.targetNodeCode ? `/sync/nodes/${encodeURIComponent(row.targetNodeCode)}` : "/sync")}
            searchPlaceholder="Search downstream publication packets"
          />
        </WorkspaceTabsContent>
      </WorkspaceTabs>

      <section className="glass-panel rounded-[1.4rem] p-5">
        <p className="text-sm leading-6 text-stone-600">{detail.statusMessage}</p>
      </section>
    </EnterpriseShell>
  );
}
