"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  Boxes,
  ClipboardList,
  ReceiptText,
  Ruler,
  ScanBarcode,
  Store,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { ProductImageField } from "@/components/enterprise/product-image-field";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import {
  WorkspaceTabs,
  WorkspaceTabsContent,
} from "@/components/layouts/workspace-tabs";
import type {
  CreateEnterpriseProductResponse,
  EnterpriseCatalogWorkspaceData,
} from "@/server/repositories/enterprise-catalog.repository";

const numberFormatter = new Intl.NumberFormat("en-US");
const productTypeOptions = [
  "STOCK",
  "MATRIX",
  "SERVICE",
  "BUNDLE",
  "DIGITAL",
  "VOUCHER",
] as const;

type ProductRow = EnterpriseCatalogWorkspaceData["productRows"][number];
type InventoryCatalogRow =
  EnterpriseCatalogWorkspaceData["inventoryCatalogRows"][number];
type UnitOfMeasureRow =
  EnterpriseCatalogWorkspaceData["unitOfMeasureRows"][number];
type UomScheduleRow = EnterpriseCatalogWorkspaceData["uomScheduleRows"][number];
type DepartmentOption =
  EnterpriseCatalogWorkspaceData["availableDepartments"][number];
type CategoryOption =
  EnterpriseCatalogWorkspaceData["availableCategories"][number];

function normalizeHierarchyLookup(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeHierarchyCode(value: string | null | undefined) {
  return value?.trim().toUpperCase().replace(/\s+/g, "-") ?? "";
}

function resolveDepartmentSelection(
  value: string | null | undefined,
  departments: DepartmentOption[],
) {
  const raw = value?.trim() ?? "";

  if (!raw) {
    return "";
  }

  const normalizedCode = normalizeHierarchyCode(raw);
  const normalizedName = normalizeHierarchyLookup(raw);
  const match =
    departments.find((department) => department.code === normalizedCode) ??
    departments.find(
      (department) =>
        normalizeHierarchyLookup(department.name) === normalizedName,
    );

  return match?.code ?? raw;
}

function resolveCategorySelection(
  value: string | null | undefined,
  departmentCode: string,
  categories: CategoryOption[],
) {
  const raw = value?.trim() ?? "";

  if (!raw) {
    return "";
  }

  const pool = categories.filter(
    (category) => category.departmentCode === departmentCode,
  );
  const normalizedCode = normalizeHierarchyCode(raw);
  const normalizedName = normalizeHierarchyLookup(raw);
  const match =
    pool.find((category) => category.code === normalizedCode) ??
    pool.find(
      (category) => normalizeHierarchyLookup(category.name) === normalizedName,
    );

  return match?.code ?? raw;
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

const productFilter: FilterFn<ProductRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "")
    .trim()
    .toLowerCase();

  if (!query) {
    return true;
  }

  return [row.original.productCode, row.original.sku ?? "", row.original.name]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const inventoryCatalogFilter: FilterFn<InventoryCatalogRow> = (
  row,
  _columnId,
  filterValue,
) => {
  const query = String(filterValue ?? "")
    .trim()
    .toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.catalogCode,
    row.original.name,
    row.original.storeSummary,
    row.original.productSummary,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const unitFilter: FilterFn<UnitOfMeasureRow> = (
  row,
  _columnId,
  filterValue,
) => {
  const query = String(filterValue ?? "")
    .trim()
    .toLowerCase();

  if (!query) {
    return true;
  }

  return Object.values(row.original).join(" ").toLowerCase().includes(query);
};

const scheduleFilter: FilterFn<UomScheduleRow> = (
  row,
  _columnId,
  filterValue,
) => {
  const query = String(filterValue ?? "")
    .trim()
    .toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.scheduleCode,
    row.original.name,
    row.original.baseUnitCode,
    row.original.lines.map((line) => line.uomCode).join(" "),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

function renderTimestamp(value: string, label: string) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-stone-800">{label}</p>
      <p className="mt-0.5 truncate text-xs text-stone-500">
        {new Date(value).toLocaleString()}
      </p>
    </div>
  );
}

export function EnterpriseCatalogWorkspace({
  workspace,
}: {
  workspace: EnterpriseCatalogWorkspaceData;
}) {
  const router = useRouter();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCatalogDialogOpen, setIsCatalogDialogOpen] = useState(false);
  const [isUnitDialogOpen, setIsUnitDialogOpen] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [productCode, setProductCode] = useState("");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [shortName, setShortName] = useState("");
  const [description, setDescription] = useState("");
  const [productType, setProductType] =
    useState<(typeof productTypeOptions)[number]>("STOCK");
  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [brand, setBrand] = useState("");
  const [seasonCode, setSeasonCode] = useState("");
  const [unitOfMeasure, setUnitOfMeasure] = useState("EA");
  const [uomScheduleCode, setUomScheduleCode] = useState("");
  const [packSize, setPackSize] = useState("");
  const [countryOfOrigin, setCountryOfOrigin] = useState("");
  const [primaryImageUrl, setPrimaryImageUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [taxable, setTaxable] = useState(true);
  const [taxProfileCode, setTaxProfileCode] = useState("");
  const [trackInventory, setTrackInventory] = useState(true);
  const [isSerialized, setIsSerialized] = useState(false);
  const [trackSize, setTrackSize] = useState(false);
  const [trackColor, setTrackColor] = useState(false);
  const [allowPriceOverride, setAllowPriceOverride] = useState(false);
  const [mustEnterPriceAtPos, setMustEnterPriceAtPos] = useState(false);
  const [minStockLevel, setMinStockLevel] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");
  const [reorderQuantity, setReorderQuantity] = useState("");
  const [safetyStockLevel, setSafetyStockLevel] = useState("");
  const [shelfLifeDays, setShelfLifeDays] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [volumeLitres, setVolumeLitres] = useState("");
  const [baseUnitPrice, setBaseUnitPrice] = useState("");
  const [baseCostPrice, setBaseCostPrice] = useState("");
  const [barcode, setBarcode] = useState("");
  const [barcodeType, setBarcodeType] = useState("EAN13");
  const [createState, setCreateState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({
    status: "idle",
    message: "",
  });
  const [catalogCode, setCatalogCode] = useState("");
  const [catalogName, setCatalogName] = useState("");
  const [catalogDescription, setCatalogDescription] = useState("");
  const [catalogStatus, setCatalogStatus] = useState("ACTIVE");
  const [catalogProductCodes, setCatalogProductCodes] = useState("");
  const [catalogStoreCodes, setCatalogStoreCodes] = useState("");
  const [catalogState, setCatalogState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({
    status: "idle",
    message: "",
  });
  const [newUomCode, setNewUomCode] = useState("");
  const [newUomName, setNewUomName] = useState("");
  const [newUomDescription, setNewUomDescription] = useState("");
  const [newUomPrecision, setNewUomPrecision] = useState("0");
  const [newUomAllowFractionalSale, setNewUomAllowFractionalSale] =
    useState(false);
  const [unitState, setUnitState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({
    status: "idle",
    message: "",
  });
  const [scheduleCode, setScheduleCode] = useState("");
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleDescription, setScheduleDescription] = useState("");
  const [scheduleBaseUomCode, setScheduleBaseUomCode] = useState("EA");
  const [scheduleIsDefaultForStock, setScheduleIsDefaultForStock] =
    useState(false);
  const [scheduleLines, setScheduleLines] = useState("EA=1\nPACK=1");
  const [scheduleState, setScheduleState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({
    status: "idle",
    message: "",
  });
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: workspace.currencyCode,
      }),
    [workspace.currencyCode],
  );
  const activeCategoryOptions = useMemo(
    () =>
      workspace.availableCategories.filter(
        (option) => option.departmentCode === department,
      ),
    [department, workspace.availableCategories],
  );
  const hasKnownDepartment = useMemo(
    () =>
      workspace.availableDepartments.some(
        (option) => option.code === department,
      ),
    [department, workspace.availableDepartments],
  );
  const hasKnownCategory = useMemo(
    () => activeCategoryOptions.some((option) => option.code === category),
    [activeCategoryOptions, category],
  );

  const productColumns = useMemo<ColumnDef<ProductRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.name}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.productCode}
              {row.original.sku ? ` • ${row.original.sku}` : ""}
            </p>
          </div>
        ),
        meta: {
          disableTruncate: true,
        },
      },
      {
        accessorKey: "baseUnitPrice",
        header: "Base price",
        cell: ({ row }) => currencyFormatter.format(row.original.baseUnitPrice),
      },
      {
        accessorKey: "defaultPrice",
        header: "Default sell",
        cell: ({ row }) =>
          row.original.defaultPrice !== null
            ? currencyFormatter.format(row.original.defaultPrice)
            : "Missing",
      },
      {
        accessorKey: "barcodeCount",
        header: "Barcodes",
        cell: ({ row }) => numberFormatter.format(row.original.barcodeCount),
      },
      {
        accessorKey: "salesLineCount",
        header: "Sale lines",
        cell: ({ row }) => numberFormatter.format(row.original.salesLineCount),
      },
      {
        accessorKey: "inventoryMovementCount",
        header: "Stock moves",
        cell: ({ row }) =>
          numberFormatter.format(row.original.inventoryMovementCount),
      },
      {
        accessorKey: "updatedAtLabel",
        header: "Updated",
        cell: ({ row }) =>
          renderTimestamp(row.original.updatedAt, row.original.updatedAtLabel),
        meta: {
          disableTruncate: true,
        },
      },
    ],
    [currencyFormatter],
  );

  const inventoryCatalogColumns = useMemo<ColumnDef<InventoryCatalogRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Catalog",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.name}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.catalogCode}
            </p>
          </div>
        ),
        meta: {
          disableTruncate: true,
        },
      },
      {
        accessorKey: "storeCount",
        header: "Shops",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium text-stone-800">
              {numberFormatter.format(row.original.storeCount)}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.storeSummary}
            </p>
          </div>
        ),
        meta: {
          disableTruncate: true,
        },
      },
      {
        accessorKey: "productCount",
        header: "Products",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium text-stone-800">
              {numberFormatter.format(row.original.productCount)}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.productSummary}
            </p>
          </div>
        ),
        meta: {
          disableTruncate: true,
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => row.original.status,
      },
      {
        accessorKey: "updatedAtLabel",
        header: "Updated",
        cell: ({ row }) =>
          renderTimestamp(row.original.updatedAt, row.original.updatedAtLabel),
        meta: {
          disableTruncate: true,
        },
      },
    ],
    [],
  );

  const unitColumns = useMemo<ColumnDef<UnitOfMeasureRow>[]>(
    () => [
      {
        accessorKey: "uomCode",
        header: "Unit",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-stone-900">{row.original.uomCode}</p>
            <p className="text-xs text-stone-500">{row.original.name}</p>
          </div>
        ),
      },
      {
        accessorKey: "decimalPrecision",
        header: "Precision",
        cell: ({ row }) => row.original.decimalPrecision,
      },
      {
        accessorKey: "allowFractionalSale",
        header: "Fractional sale",
        cell: ({ row }) =>
          row.original.allowFractionalSale ? "Allowed" : "Whole units",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => row.original.status,
      },
    ],
    [],
  );

  const scheduleColumns = useMemo<ColumnDef<UomScheduleRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Schedule",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.name}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.scheduleCode} • base {row.original.baseUnitCode}
            </p>
          </div>
        ),
        meta: {
          disableTruncate: true,
        },
      },
      {
        accessorKey: "lineCount",
        header: "Lines",
        cell: ({ row }) => numberFormatter.format(row.original.lineCount),
      },
      {
        accessorKey: "productCount",
        header: "Products",
        cell: ({ row }) => numberFormatter.format(row.original.productCount),
      },
      {
        accessorKey: "isDefaultForStock",
        header: "Default",
        cell: ({ row }) =>
          row.original.isDefaultForStock ? "Stock default" : "Optional",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => row.original.status,
      },
    ],
    [],
  );

  function handleDepartmentChange(nextDepartmentCode: string) {
    setDepartment(nextDepartmentCode);

    setCategory((currentCategory) =>
      workspace.availableCategories.some(
        (option) =>
          option.departmentCode === nextDepartmentCode &&
          option.code === currentCategory,
      )
        ? currentCategory
        : "",
    );
  }

  function resetCreateDialog() {
    setProductCode("");
    setName("");
    setSku("");
    setShortName("");
    setDescription("");
    setProductType("STOCK");
    setDepartment("");
    setCategory("");
    setSubcategory("");
    setBrand("");
    setSeasonCode("");
    setUnitOfMeasure("EA");
    setUomScheduleCode(
      workspace.uomScheduleRows.find((schedule) => schedule.isDefaultForStock)
        ?.scheduleCode ?? "",
    );
    setPackSize("");
    setCountryOfOrigin("");
    setPrimaryImageUrl("");
    setNotes("");
    setTaxable(true);
    setTaxProfileCode("");
    setTrackInventory(true);
    setIsSerialized(false);
    setTrackSize(false);
    setTrackColor(false);
    setAllowPriceOverride(false);
    setMustEnterPriceAtPos(false);
    setMinStockLevel("");
    setReorderPoint("");
    setReorderQuantity("");
    setSafetyStockLevel("");
    setShelfLifeDays("");
    setWeightKg("");
    setVolumeLitres("");
    setBaseUnitPrice("");
    setBaseCostPrice("");
    setBarcode("");
    setBarcodeType("EAN13");
    setCreateState({
      status: "idle",
      message: "",
    });
  }

  function handleCreateDialogOpenChange(nextOpen: boolean) {
    setIsCreateDialogOpen(nextOpen);

    if (nextOpen) {
      resetCreateDialog();
    }
  }

  async function handleCreateProduct() {
    setCreateState({
      status: "submitting",
      message: "",
    });

    try {
      const response = await fetch("/api/catalog/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productCode,
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
          uomScheduleCode: uomScheduleCode.trim() ? uomScheduleCode : null,
          packSize,
          countryOfOrigin,
          primaryImageUrl,
          notes,
          taxable,
          taxProfileCode:
            taxable && taxProfileCode.trim() ? taxProfileCode : null,
          trackInventory,
          isSerialized,
          trackSize,
          trackColor,
          allowPriceOverride,
          mustEnterPriceAtPos,
          minStockLevel: minStockLevel.trim() ? Number(minStockLevel) : null,
          reorderPoint: reorderPoint.trim() ? Number(reorderPoint) : null,
          reorderQuantity: reorderQuantity.trim()
            ? Number(reorderQuantity)
            : null,
          safetyStockLevel: safetyStockLevel.trim()
            ? Number(safetyStockLevel)
            : null,
          shelfLifeDays: shelfLifeDays.trim() ? Number(shelfLifeDays) : null,
          weightKg: weightKg.trim() ? Number(weightKg) : null,
          volumeLitres: volumeLitres.trim() ? Number(volumeLitres) : null,
          baseUnitPrice: Number(baseUnitPrice),
          baseCostPrice:
            baseCostPrice.trim().length > 0 ? Number(baseCostPrice) : null,
          barcode: barcode.trim().length > 0 ? barcode : null,
          barcodeType: barcode.trim().length > 0 ? barcodeType : null,
        }),
      });
      const payload =
        (await response.json()) as Partial<CreateEnterpriseProductResponse> & {
          message?: string;
        };

      if (!response.ok) {
        throw new Error(
          payload.message ??
            "Flash ERP could not create the enterprise product.",
        );
      }

      setCreateState({
        status: "success",
        message:
          payload.message ??
          "Flash ERP created the new product and queued it for downstream publication on the next store pull.",
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsCreateDialogOpen(false);
          if (payload.productCode) {
            router.push(
              `/catalog/products/${encodeURIComponent(payload.productCode)}`,
            );
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
            : "Flash ERP could not create the enterprise product.",
      });
    }
  }

  function resetCatalogDialog() {
    setCatalogCode("");
    setCatalogName("");
    setCatalogDescription("");
    setCatalogStatus("ACTIVE");
    setCatalogProductCodes(
      workspace.productRows.map((product) => product.productCode).join("\n"),
    );
    setCatalogStoreCodes(
      workspace.availableStores.map((store) => store.storeCode).join("\n"),
    );
    setCatalogState({ status: "idle", message: "" });
  }

  function resetUnitDialog() {
    setNewUomCode("");
    setNewUomName("");
    setNewUomDescription("");
    setNewUomPrecision("0");
    setNewUomAllowFractionalSale(false);
    setUnitState({ status: "idle", message: "" });
  }

  function resetScheduleDialog() {
    const defaultUnit = workspace.unitOfMeasureRows[0]?.uomCode ?? "EA";
    setScheduleCode(`${defaultUnit}-STOCK`);
    setScheduleName(`${defaultUnit} stock schedule`);
    setScheduleDescription("");
    setScheduleBaseUomCode(defaultUnit);
    setScheduleIsDefaultForStock(workspace.uomScheduleRows.length === 0);
    setScheduleLines(`${defaultUnit}=1`);
    setScheduleState({ status: "idle", message: "" });
  }

  async function handleSaveCatalog() {
    setCatalogState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/catalog/inventory-catalogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalogCode,
          name: catalogName,
          description: catalogDescription.trim() ? catalogDescription : null,
          status: catalogStatus,
          productCodes: catalogProductCodes,
          storeCodes: catalogStoreCodes,
        }),
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(
          payload.message ?? "Flash ERP could not save that catalog.",
        );
      }

      setCatalogState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the inventory catalog.",
      });
      startTransition(() => {
        window.setTimeout(() => {
          setIsCatalogDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setCatalogState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save that catalog.",
      });
    }
  }

  async function handleSaveUnit() {
    setUnitState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/catalog/uom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uomCode: newUomCode,
          name: newUomName,
          description: newUomDescription.trim() ? newUomDescription : null,
          decimalPrecision: Number(newUomPrecision),
          allowFractionalSale: newUomAllowFractionalSale,
          status: "ACTIVE",
        }),
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(
          payload.message ?? "Flash ERP could not save that unit.",
        );
      }

      setUnitState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the unit of measure.",
      });
      startTransition(() => {
        window.setTimeout(() => {
          setIsUnitDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setUnitState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save that unit.",
      });
    }
  }

  function parseScheduleLines() {
    return scheduleLines
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [uomCode, conversionFactor] = line
          .split(/[=:,]/)
          .map((part) => part.trim());

        return {
          uomCode,
          conversionFactor: conversionFactor ? Number(conversionFactor) : 1,
          isBaseUnit:
            uomCode?.toUpperCase() === scheduleBaseUomCode.toUpperCase(),
          allowSale: true,
          allowPurchase: true,
        };
      });
  }

  async function handleSaveSchedule() {
    setScheduleState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/catalog/uom-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleCode,
          name: scheduleName,
          description: scheduleDescription.trim() ? scheduleDescription : null,
          baseUomCode: scheduleBaseUomCode,
          isDefaultForStock: scheduleIsDefaultForStock,
          status: "ACTIVE",
          lines: parseScheduleLines(),
        }),
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(
          payload.message ?? "Flash ERP could not save that UOM schedule.",
        );
      }

      setScheduleState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the UOM schedule.",
      });
      startTransition(() => {
        window.setTimeout(() => {
          setIsScheduleDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setScheduleState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save that UOM schedule.",
      });
    }
  }

  return (
    <EnterpriseShell
      activeSection="master"
      description="Inspect products, barcode coverage, pricing posture, and canonical operational usage across the Flash ERP enterprise catalog."
      eyebrow="Flash ERP enterprise"
      heading="Catalog"
    >
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <ActionDialog
            description="Create a new enterprise product with default pricing and an optional initial barcode. Flash ERP will publish the new master record to stores on their next pull."
            onOpenChange={handleCreateDialogOpenChange}
            open={isCreateDialogOpen}
            title="Create product"
            hideTrigger
            triggerClassName="border-[color:var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] text-[color:var(--brand-deep)] hover:border-[color:var(--brand)] hover:text-[color:var(--brand-deep)]"
            triggerLabel="Create product"
            widthClassName="max-w-6xl"
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
                Flash ERP will create the product master, align the default sell
                price list, and optionally attach the first barcode in one
                enterprise transaction.
              </div>
              <WorkspaceTabs
                ariaLabel="Product creation sections"
                className="mt-0"
                defaultValue="identity"
                summaries={{
                  identity:
                    "Create the core product identity, classification, merchandising text, and first scanner code.",
                  commercial:
                    "Capture tax, pricing, costing, and downstream selling posture from the enterprise master.",
                  replenishment:
                    "Set inventory behavior, reorder thresholds, and physical handling defaults before stores consume the item.",
                }}
                tabs={[
                  { value: "identity", label: "Identity" },
                  { value: "commercial", label: "Commercial" },
                  { value: "replenishment", label: "Replenishment" },
                ]}
              >
                <WorkspaceTabsContent value="identity">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Product code
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setProductCode(event.target.value)}
                        placeholder="FLASH-NEW-ITEM"
                        value={productCode}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Product name
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Flash New Item"
                        value={name}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Short name
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setShortName(event.target.value)}
                        placeholder="Shelf or receipt name"
                        value={shortName}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        SKU
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setSku(event.target.value)}
                        placeholder="FLASH-NEW-ITEM"
                        value={sku}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Product type
                      </span>
                      <select
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setProductType(
                            event.target
                              .value as (typeof productTypeOptions)[number],
                          )
                        }
                        value={productType}
                      >
                        {productTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Unit of measure
                      </span>
                      <select
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setUnitOfMeasure(event.target.value)
                        }
                        value={unitOfMeasure}
                      >
                        {workspace.unitOfMeasureRows.length === 0 ? (
                          <option value="EA">EA</option>
                        ) : null}
                        {workspace.unitOfMeasureRows.map((unit) => (
                          <option key={unit.uomCode} value={unit.uomCode}>
                            {unit.name} ({unit.uomCode})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        UOM schedule
                      </span>
                      <select
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setUomScheduleCode(event.target.value)
                        }
                        value={uomScheduleCode}
                      >
                        <option value="">Use stock default</option>
                        {workspace.uomScheduleRows.map((schedule) => (
                          <option
                            key={schedule.scheduleCode}
                            value={schedule.scheduleCode}
                          >
                            {schedule.name} ({schedule.scheduleCode})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Department
                      </span>
                      <select
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          handleDepartmentChange(event.target.value)
                        }
                        value={department}
                      >
                        <option value="">Select department</option>
                        {!hasKnownDepartment && department ? (
                          <option value={department}>
                            Legacy selection: {department}
                          </option>
                        ) : null}
                        {workspace.availableDepartments.map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.name} ({option.code})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Category
                      </span>
                      <select
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        disabled={!department}
                        onChange={(event) => setCategory(event.target.value)}
                        value={category}
                      >
                        <option value="">
                          {department
                            ? "Select category"
                            : "Select department first"}
                        </option>
                        {!hasKnownCategory && category ? (
                          <option value={category}>
                            Legacy selection: {category}
                          </option>
                        ) : null}
                        {activeCategoryOptions.map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.name} ({option.code})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Subcategory
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setSubcategory(event.target.value)}
                        value={subcategory}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Brand
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setBrand(event.target.value)}
                        value={brand}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Season code
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setSeasonCode(event.target.value)}
                        value={seasonCode}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Pack size
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setPackSize(event.target.value)}
                        value={packSize}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Country of origin
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setCountryOfOrigin(event.target.value)
                        }
                        value={countryOfOrigin}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Initial barcode
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setBarcode(event.target.value)}
                        placeholder="Optional scanner code"
                        value={barcode}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Barcode type
                      </span>
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
                    <ProductImageField
                      className="md:col-span-2 xl:col-span-3"
                      label="Primary image"
                      onChange={setPrimaryImageUrl}
                      value={primaryImageUrl}
                    />
                    <label className="space-y-2 text-sm text-stone-700 md:col-span-2 xl:col-span-3">
                      <span className="block font-semibold text-stone-900">
                        Description
                      </span>
                      <textarea
                        className="min-h-28 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="Optional merchandising or handling notes."
                        value={description}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700 md:col-span-2 xl:col-span-3">
                      <span className="block font-semibold text-stone-900">
                        Notes
                      </span>
                      <textarea
                        className="min-h-24 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Enterprise-only assortment or handling notes."
                        value={notes}
                      />
                    </label>
                  </div>
                </WorkspaceTabsContent>

                <WorkspaceTabsContent value="commercial">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Base unit price
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        min="0.01"
                        onChange={(event) =>
                          setBaseUnitPrice(event.target.value)
                        }
                        placeholder="0.00"
                        step="0.01"
                        type="number"
                        value={baseUnitPrice}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Base cost price
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        min="0"
                        onChange={(event) =>
                          setBaseCostPrice(event.target.value)
                        }
                        placeholder="Optional"
                        step="0.01"
                        type="number"
                        value={baseCostPrice}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Tax profile
                      </span>
                      <select
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        disabled={!taxable}
                        onChange={(event) =>
                          setTaxProfileCode(event.target.value)
                        }
                        value={taxProfileCode}
                      >
                        <option value="">No tax profile</option>
                        {workspace.availableTaxProfiles.map((profile) => (
                          <option key={profile.code} value={profile.code}>
                            {profile.name} ({profile.ratePercent.toFixed(2)}%
                            {profile.isTaxInclusive
                              ? ", inclusive"
                              : ", exclusive"}
                            )
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid gap-3 md:col-span-2 xl:col-span-3 md:grid-cols-2 xl:grid-cols-5">
                      <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                        <input
                          checked={taxable}
                          onChange={(event) => setTaxable(event.target.checked)}
                          type="checkbox"
                        />
                        Taxable
                      </label>
                      <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                        <input
                          checked={trackInventory}
                          onChange={(event) => {
                            setTrackInventory(event.target.checked);

                            if (!event.target.checked) {
                              setIsSerialized(false);
                            }
                          }}
                          type="checkbox"
                        />
                        Track inventory
                      </label>
                      <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                        <input
                          checked={isSerialized}
                          onChange={(event) => {
                            setIsSerialized(event.target.checked);

                            if (event.target.checked) {
                              setTrackInventory(true);
                            }
                          }}
                          type="checkbox"
                        />
                        Serialized item
                      </label>
                      <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                        <input
                          checked={trackSize}
                          onChange={(event) => setTrackSize(event.target.checked)}
                          type="checkbox"
                        />
                        Track size
                      </label>
                      <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                        <input
                          checked={trackColor}
                          onChange={(event) => setTrackColor(event.target.checked)}
                          type="checkbox"
                        />
                        Track colour
                      </label>
                      <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                        <input
                          checked={allowPriceOverride}
                          onChange={(event) =>
                            setAllowPriceOverride(event.target.checked)
                          }
                          type="checkbox"
                        />
                        Allow price override
                      </label>
                      <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                        <input
                          checked={mustEnterPriceAtPos}
                          onChange={(event) =>
                            setMustEnterPriceAtPos(event.target.checked)
                          }
                          type="checkbox"
                        />
                        Must enter price at POS
                      </label>
                    </div>
                  </div>
                </WorkspaceTabsContent>

                <WorkspaceTabsContent value="replenishment">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Min stock level
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setMinStockLevel(event.target.value)
                        }
                        step="0.001"
                        type="number"
                        value={minStockLevel}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Reorder point
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setReorderPoint(event.target.value)
                        }
                        step="0.001"
                        type="number"
                        value={reorderPoint}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Reorder quantity
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setReorderQuantity(event.target.value)
                        }
                        step="0.001"
                        type="number"
                        value={reorderQuantity}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Safety stock
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setSafetyStockLevel(event.target.value)
                        }
                        step="0.001"
                        type="number"
                        value={safetyStockLevel}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Shelf life days
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setShelfLifeDays(event.target.value)
                        }
                        type="number"
                        value={shelfLifeDays}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Weight (kg)
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) => setWeightKg(event.target.value)}
                        step="0.001"
                        type="number"
                        value={weightKg}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">
                        Volume (litres)
                      </span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setVolumeLitres(event.target.value)
                        }
                        step="0.001"
                        type="number"
                        value={volumeLitres}
                      />
                    </label>
                  </div>
                </WorkspaceTabsContent>
              </WorkspaceTabs>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                  disabled={createState.status === "submitting"}
                  onClick={() => setIsCreateDialogOpen(false)}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
                  disabled={
                    createState.status === "submitting" ||
                    !productCode.trim() ||
                    !name.trim() ||
                    !department.trim() ||
                    !category.trim() ||
                    Number(baseUnitPrice) <= 0
                  }
                  onClick={() => void handleCreateProduct()}
                  type="button"
                >
                  {createState.status === "submitting"
                    ? "Creating product..."
                    : "Create product"}
                </button>
              </div>
              {createState.message ? (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                    createState.status === "error"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {createState.message}
                </div>
              ) : null}
            </div>
          </ActionDialog>
          <ActionDialog
            description="Create or update a centrally managed inventory catalog and assign it to shops. The shop pull will use these links to control which products arrive on the desktop."
            hideTrigger
            onOpenChange={setIsCatalogDialogOpen}
            open={isCatalogDialogOpen}
            title="Inventory catalog"
            triggerLabel="Inventory catalog"
            widthClassName="max-w-5xl"
          >
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">
                    Catalog code
                  </span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setCatalogCode(event.target.value)}
                    placeholder="ACCRA-CORE"
                    value={catalogCode}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">
                    Catalog name
                  </span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setCatalogName(event.target.value)}
                    placeholder="Accra core assortment"
                    value={catalogName}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">
                    Status
                  </span>
                  <select
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setCatalogStatus(event.target.value)}
                    value={catalogStatus}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">
                    Description
                  </span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) =>
                      setCatalogDescription(event.target.value)
                    }
                    value={catalogDescription}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">
                    Product codes
                  </span>
                  <textarea
                    className="min-h-44 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 font-mono text-xs outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) =>
                      setCatalogProductCodes(event.target.value)
                    }
                    placeholder="One product code per line"
                    value={catalogProductCodes}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">
                    Shop codes
                  </span>
                  <textarea
                    className="min-h-44 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 font-mono text-xs outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) =>
                      setCatalogStoreCodes(event.target.value)
                    }
                    placeholder="One shop code per line"
                    value={catalogStoreCodes}
                  />
                </label>
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                  disabled={catalogState.status === "submitting"}
                  onClick={() => setIsCatalogDialogOpen(false)}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
                  disabled={
                    catalogState.status === "submitting" ||
                    !catalogCode.trim() ||
                    !catalogName.trim() ||
                    !catalogProductCodes.trim()
                  }
                  onClick={() => void handleSaveCatalog()}
                  type="button"
                >
                  {catalogState.status === "submitting"
                    ? "Saving..."
                    : "Save catalog"}
                </button>
              </div>
              {catalogState.message ? (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                    catalogState.status === "error"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {catalogState.message}
                </div>
              ) : null}
            </div>
          </ActionDialog>
          <ActionDialog
            description="Create a base unit of measure such as EA, KG, litre, pack, carton, or a retailer-specific stock unit."
            hideTrigger
            onOpenChange={setIsUnitDialogOpen}
            open={isUnitDialogOpen}
            title="Create unit of measure"
            triggerLabel="Create unit"
            widthClassName="max-w-3xl"
          >
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">
                    Unit code
                  </span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setNewUomCode(event.target.value)}
                    placeholder="EA"
                    value={newUomCode}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">
                    Name
                  </span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setNewUomName(event.target.value)}
                    placeholder="Each"
                    value={newUomName}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">
                    Decimal precision
                  </span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    min="0"
                    onChange={(event) => setNewUomPrecision(event.target.value)}
                    type="number"
                    value={newUomPrecision}
                  />
                </label>
                <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                  <input
                    checked={newUomAllowFractionalSale}
                    onChange={(event) =>
                      setNewUomAllowFractionalSale(event.target.checked)
                    }
                    type="checkbox"
                  />
                  Allow fractional sale
                </label>
                <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                  <span className="block font-semibold text-stone-900">
                    Description
                  </span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) =>
                      setNewUomDescription(event.target.value)
                    }
                    value={newUomDescription}
                  />
                </label>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700"
                  onClick={() => setIsUnitDialogOpen(false)}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white"
                  disabled={
                    unitState.status === "submitting" ||
                    !newUomCode.trim() ||
                    !newUomName.trim()
                  }
                  onClick={() => void handleSaveUnit()}
                  type="button"
                >
                  {unitState.status === "submitting"
                    ? "Saving..."
                    : "Save unit"}
                </button>
              </div>
              {unitState.message ? (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${unitState.status === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                >
                  {unitState.message}
                </div>
              ) : null}
            </div>
          </ActionDialog>
          <ActionDialog
            description="Create a unit schedule that defines the base unit plus pack/carton conversions for stock products."
            hideTrigger
            onOpenChange={setIsScheduleDialogOpen}
            open={isScheduleDialogOpen}
            title="Create UOM schedule"
            triggerLabel="Create UOM schedule"
            widthClassName="max-w-4xl"
          >
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">
                    Schedule code
                  </span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setScheduleCode(event.target.value)}
                    value={scheduleCode}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">
                    Schedule name
                  </span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setScheduleName(event.target.value)}
                    value={scheduleName}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">
                    Base unit
                  </span>
                  <select
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) =>
                      setScheduleBaseUomCode(event.target.value)
                    }
                    value={scheduleBaseUomCode}
                  >
                    {workspace.unitOfMeasureRows.length === 0 ? (
                      <option value="EA">EA</option>
                    ) : null}
                    {workspace.unitOfMeasureRows.map((unit) => (
                      <option key={unit.uomCode} value={unit.uomCode}>
                        {unit.name} ({unit.uomCode})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                  <input
                    checked={scheduleIsDefaultForStock}
                    onChange={(event) =>
                      setScheduleIsDefaultForStock(event.target.checked)
                    }
                    type="checkbox"
                  />
                  Default for stock items
                </label>
                <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                  <span className="block font-semibold text-stone-900">
                    Description
                  </span>
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) =>
                      setScheduleDescription(event.target.value)
                    }
                    value={scheduleDescription}
                  />
                </label>
                <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                  <span className="block font-semibold text-stone-900">
                    Conversion lines
                  </span>
                  <textarea
                    className="min-h-36 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 font-mono text-xs outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setScheduleLines(event.target.value)}
                    value={scheduleLines}
                  />
                </label>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700"
                  onClick={() => setIsScheduleDialogOpen(false)}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white"
                  disabled={
                    scheduleState.status === "submitting" ||
                    !scheduleCode.trim() ||
                    !scheduleName.trim() ||
                    !scheduleBaseUomCode.trim()
                  }
                  onClick={() => void handleSaveSchedule()}
                  type="button"
                >
                  {scheduleState.status === "submitting"
                    ? "Saving..."
                    : "Save schedule"}
                </button>
              </div>
              {scheduleState.message ? (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${scheduleState.status === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                >
                  {scheduleState.message}
                </div>
              ) : null}
            </div>
          </ActionDialog>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:border-indigo-300"
            onClick={() => {
              resetCatalogDialog();
              setIsCatalogDialogOpen(true);
            }}
            type="button"
          >
            <ClipboardList className="h-4 w-4" />
            Catalog
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 transition hover:border-cyan-300"
            onClick={() => {
              resetUnitDialog();
              setIsUnitDialogOpen(true);
            }}
            type="button"
          >
            <Ruler className="h-4 w-4" />
            Unit
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 transition hover:border-amber-300"
            onClick={() => {
              resetScheduleDialog();
              setIsScheduleDialogOpen(true);
            }}
            type="button"
          >
            <Ruler className="h-4 w-4" />
            UOM schedule
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-700">
            Last refresh {new Date(workspace.refreshedAt).toLocaleString()}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-6">
        <MetricCard
          hint="Active products currently available in Flash ERP enterprise."
          icon={Boxes}
          label="Active products"
          value={numberFormatter.format(workspace.metrics.activeProducts)}
        />
        <MetricCard
          hint="Products that already have at least one barcode attached."
          icon={ScanBarcode}
          label="Barcode coverage"
          value={numberFormatter.format(workspace.metrics.barcodeCoverage)}
        />
        <MetricCard
          hint="Products covered by the default enterprise sell price list."
          icon={ReceiptText}
          label="Default pricing"
          value={numberFormatter.format(workspace.metrics.defaultPriceCoverage)}
        />
        <MetricCard
          hint="Products that are already appearing in canonical retail operations."
          icon={Store}
          label="In operations"
          value={numberFormatter.format(workspace.metrics.productsInOperations)}
        />
        <MetricCard
          hint="Active inventory catalogs linked from HQ to one or more shops."
          icon={ClipboardList}
          label="Catalogs"
          value={numberFormatter.format(workspace.metrics.activeCatalogs)}
        />
        <MetricCard
          hint="Unit schedules available for product base-unit and pack/carton control."
          icon={Ruler}
          label="UOM schedules"
          value={numberFormatter.format(workspace.metrics.uomSchedules)}
        />
      </section>

      <WorkspaceTabs
        ariaLabel="Enterprise catalog views"
        defaultValue="products"
        summaries={{
          products:
            "Review catalog products, barcode coverage, pricing posture, and operational activity from one grid.",
          catalogs:
            "Manage HQ-defined inventory catalogs and shop assignments so desktop assortments are not free-text store settings.",
          units:
            "Create base units and UOM schedules, then link schedules to stock products before downstream publication.",
          posture:
            "See where catalog rollout is healthy and which pricing or barcode gaps still need attention.",
        }}
        tabs={[
          {
            value: "products",
            label: "Products",
            badge: "Live",
            badgeTone: "success",
          },
          { value: "catalogs", label: "Inventory catalogs" },
          { value: "units", label: "UOM" },
          { value: "posture", label: "Posture" },
        ]}
      >
        <WorkspaceTabsContent value="products">
          <SharedDataGrid
            columns={productColumns}
            data={workspace.productRows}
            emptyLabel="No catalog products are registered in Flash ERP enterprise yet."
            exportFileName="flash-erp-catalog-products"
            getRowHref={(row) =>
              `/catalog/products/${encodeURIComponent(row.productCode)}`
            }
            globalFilterFn={productFilter}
            searchPlaceholder="Search products by code, SKU, or name"
            toolbarActions={
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[var(--brand)]"
                onClick={() => handleCreateDialogOpenChange(true)}
                type="button"
              >
                <Boxes className="h-4 w-4" />
                Create product
              </button>
            }
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="catalogs">
          <SharedDataGrid
            columns={inventoryCatalogColumns}
            data={workspace.inventoryCatalogRows}
            emptyLabel="No inventory catalogs are registered yet."
            exportFileName="flash-erp-inventory-catalogs"
            globalFilterFn={inventoryCatalogFilter}
            searchPlaceholder="Search catalogs by code, product, or shop"
            toolbarActions={
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:border-indigo-300"
                onClick={() => {
                  resetCatalogDialog();
                  setIsCatalogDialogOpen(true);
                }}
                type="button"
              >
                <ClipboardList className="h-4 w-4" />
                Create catalog
              </button>
            }
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="units">
          <section className="grid gap-4 xl:grid-cols-2">
            <SharedDataGrid
              columns={unitColumns}
              data={workspace.unitOfMeasureRows}
              emptyLabel="No units of measure are registered yet."
              exportFileName="flash-erp-units-of-measure"
              globalFilterFn={unitFilter}
              searchPlaceholder="Search units"
              toolbarActions={
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 transition hover:border-cyan-300"
                  onClick={() => {
                    resetUnitDialog();
                    setIsUnitDialogOpen(true);
                  }}
                  type="button"
                >
                  <Ruler className="h-4 w-4" />
                  Create unit
                </button>
              }
            />
            <SharedDataGrid
              columns={scheduleColumns}
              data={workspace.uomScheduleRows}
              emptyLabel="No UOM schedules are registered yet."
              exportFileName="flash-erp-uom-schedules"
              globalFilterFn={scheduleFilter}
              searchPlaceholder="Search UOM schedules"
              toolbarActions={
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 transition hover:border-amber-300"
                  onClick={() => {
                    resetScheduleDialog();
                    setIsScheduleDialogOpen(true);
                  }}
                  type="button"
                >
                  <Ruler className="h-4 w-4" />
                  Create schedule
                </button>
              }
            />
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="posture">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,1fr)]">
            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Catalog posture
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
                    Last refreshed{" "}
                    {new Date(workspace.refreshedAt).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-full border border-stone-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-600">
                  Catalog
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
