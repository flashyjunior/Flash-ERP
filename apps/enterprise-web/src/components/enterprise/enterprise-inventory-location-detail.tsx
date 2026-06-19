"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type {
  CancelSupplierReturnRequest,
  CancelSupplierReturnResponse,
  ClosePurchaseOrderRequest,
  CreateInterStoreTransferResponse,
  CreatePurchaseOrderResponse,
  InventoryAdjustmentTaskResponse,
  InventoryGoodsReceiptResponse,
  PurchaseOrderClosureReason,
  PurchaseOrderLifecycleResponse,
  SupplierClaimStatus,
  UpdateSupplierClaimRequest,
  UpdateSupplierClaimResponse
} from "@flash-erp/sync-core";
import { Activity, ArrowLeft, Boxes, Package, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type { EnterpriseInventoryLocationDetailData } from "@/server/repositories/enterprise-inventory.repository";

const numberFormatter = new Intl.NumberFormat("en-US");
const quantityFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3
});

type BalanceRow = EnterpriseInventoryLocationDetailData["balanceRows"][number];
type MovementRow = EnterpriseInventoryLocationDetailData["movementRows"][number];
type SerialTraceRow = EnterpriseInventoryLocationDetailData["serialTraceRows"][number];
type SerialRegistryRow = EnterpriseInventoryLocationDetailData["serialRegistryRows"][number];
type PurchaseOrderRow = EnterpriseInventoryLocationDetailData["purchaseOrderRows"][number];
type GoodsReceiptRow = EnterpriseInventoryLocationDetailData["goodsReceiptRows"][number];
type SupplierClaimRow = EnterpriseInventoryLocationDetailData["supplierClaimRows"][number];
type SupplierReturnRow = EnterpriseInventoryLocationDetailData["supplierReturnRows"][number];
type StockCountSessionRow = EnterpriseInventoryLocationDetailData["stockCountSessionRows"][number];
type DepartmentOption = EnterpriseInventoryLocationDetailData["availableDepartments"][number];
type CategoryOption = EnterpriseInventoryLocationDetailData["availableCategories"][number];
type ProductPickerRow = {
  productCode: string;
  sku: string | null;
  productName: string;
  departmentCode: string | null;
  departmentName: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  subcategory: string | null;
  isSerialized: boolean;
};
type PurchaseOrderDraftLine = {
  productCode: string;
  productName: string;
  hierarchy: string;
  quantity: string;
  unitCost: string;
  isSerialized: boolean;
};

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
    value === "ACTIVE"
      ? "bg-emerald-100 text-emerald-700"
      : value === "INACTIVE"
        ? "bg-stone-200 text-stone-700"
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

function formatHierarchyPath(product: {
  departmentName: string | null;
  categoryName: string | null;
  subcategory: string | null;
}) {
  return [product.departmentName, product.categoryName, product.subcategory]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" / ");
}

function parseSerialDraft(value: string) {
  const nextValues: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of value.split(/[\n,;]+/)) {
    const nextValue = rawValue.trim();

    if (!nextValue) {
      continue;
    }

    const duplicateKey = nextValue.toUpperCase();

    if (seen.has(duplicateKey)) {
      continue;
    }

    seen.add(duplicateKey);
    nextValues.push(nextValue);
  }

  return nextValues;
}

function SerializedTaskSerialPanel({
  title,
  description,
  serialDraft,
  onSerialDraftChange,
  serialNumbers
}: {
  title: string;
  description: string;
  serialDraft: string;
  onSerialDraftChange: (value: string) => void;
  serialNumbers: string[];
}) {
  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-sky-950">{title}</p>
        <p className="text-sm leading-6 text-sky-900">{description}</p>
      </div>
      <label className="mt-4 block space-y-2 text-sm text-stone-700">
        <span className="block font-semibold text-stone-900">Serial numbers</span>
        <textarea
          className="min-h-28 w-full rounded-[1.35rem] border border-sky-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
          onChange={(event) => onSerialDraftChange(event.target.value)}
          placeholder="Scan or paste one serial per line"
          value={serialDraft}
        />
      </label>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-sky-900">
        {serialNumbers.length} serial{serialNumbers.length === 1 ? "" : "s"} captured
      </p>
      {serialNumbers.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {serialNumbers.slice(0, 10).map((serialNumber) => (
            <span
              className="inline-flex rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-medium text-sky-900"
              key={serialNumber}
            >
              {serialNumber}
            </span>
          ))}
          {serialNumbers.length > 10 ? (
            <span className="inline-flex rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-medium text-sky-900">
              +{serialNumbers.length - 10} more
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SerialChipList({ serialNumbers }: { serialNumbers: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {serialNumbers.length > 0 ? (
        serialNumbers.map((serialNumber) => (
          <span
            className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-900"
            key={serialNumber}
          >
            {serialNumber}
          </span>
        ))
      ) : (
        <span className="inline-flex rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs font-medium text-stone-500">
          No serials captured
        </span>
      )}
    </div>
  );
}

function InventoryTaskProductPicker({
  productSearch,
  onProductSearchChange,
  departmentCode,
  onDepartmentCodeChange,
  categoryCode,
  onCategoryCodeChange,
  serializedOnly,
  onSerializedOnlyChange,
  availableDepartments,
  availableCategories,
  filteredProducts,
  emptyLabel,
  poolDescription,
  selectedProductCode,
  onSelectedProductCodeChange
}: {
  productSearch: string;
  onProductSearchChange: (value: string) => void;
  departmentCode: string;
  onDepartmentCodeChange: (value: string) => void;
  categoryCode: string;
  onCategoryCodeChange: (value: string) => void;
  serializedOnly: boolean;
  onSerializedOnlyChange: (value: boolean) => void;
  availableDepartments: DepartmentOption[];
  availableCategories: CategoryOption[];
  filteredProducts: ProductPickerRow[];
  emptyLabel?: string;
  poolDescription?: string;
  selectedProductCode: string;
  onSelectedProductCodeChange: (value: string) => void;
}) {
  const filteredCategoryOptions = availableCategories.filter(
    (option) => !departmentCode || option.departmentCode === departmentCode
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-2 text-sm text-stone-700 xl:col-span-2">
          <span className="block font-semibold text-stone-900">Search products</span>
          <input
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
            onChange={(event) => onProductSearchChange(event.target.value)}
            placeholder="Product, code, SKU, department, or category"
            value={productSearch}
          />
        </label>
        <label className="space-y-2 text-sm text-stone-700">
          <span className="block font-semibold text-stone-900">Department</span>
          <select
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
            onChange={(event) => onDepartmentCodeChange(event.target.value)}
            value={departmentCode}
          >
            <option value="">All departments</option>
            {availableDepartments.map((department) => (
              <option key={department.code} value={department.code}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm text-stone-700">
          <span className="block font-semibold text-stone-900">Category</span>
          <select
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
            disabled={!departmentCode}
            onChange={(event) => onCategoryCodeChange(event.target.value)}
            value={categoryCode}
          >
            <option value="">
              {departmentCode ? "All categories" : "Select department first"}
            </option>
            {filteredCategoryOptions.map((category) => (
              <option key={category.code} value={category.code}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
              Eligible product pool
            </p>
            <p className="mt-1 text-sm text-stone-600">
              {poolDescription ??
                "Use the same department and category hierarchy that product setup already controls."}
            </p>
          </div>
          <label className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-700">
            <input
              checked={serializedOnly}
              className="h-4 w-4 rounded border-stone-300 text-[var(--brand)] focus:ring-[var(--brand)]"
              onChange={(event) => onSerializedOnlyChange(event.target.checked)}
              type="checkbox"
            />
            Serialized only
          </label>
        </div>
        <label className="mt-4 block space-y-2 text-sm text-stone-700">
          <span className="block font-semibold text-stone-900">
            Product {filteredProducts.length > 0 ? `(${filteredProducts.length} match)` : ""}
          </span>
          <select
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
            disabled={filteredProducts.length === 0}
            onChange={(event) => onSelectedProductCodeChange(event.target.value)}
            value={selectedProductCode}
          >
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => {
                const hierarchyLabel = formatHierarchyPath(product);

                return (
                  <option key={product.productCode} value={product.productCode}>
                    {product.productName} ({product.productCode})
                    {hierarchyLabel ? ` • ${hierarchyLabel}` : ""}
                    {product.isSerialized ? " • Serialized" : ""}
                  </option>
                );
              })
            ) : (
              <option value="">{emptyLabel ?? "No matching products in this location"}</option>
            )}
          </select>
        </label>
      </div>
    </div>
  );
}

export function EnterpriseInventoryLocationDetail({
  detail
}: {
  detail: EnterpriseInventoryLocationDetailData;
}) {
  const router = useRouter();
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: detail.currencyCode
      }),
    [detail.currencyCode]
  );
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [selectedProductCode, setSelectedProductCode] = useState(
    detail.balanceRows[0]?.productCode ?? ""
  );
  const [productSearch, setProductSearch] = useState("");
  const [productDepartmentCode, setProductDepartmentCode] = useState("");
  const [productCategoryCode, setProductCategoryCode] = useState("");
  const [serializedOnly, setSerializedOnly] = useState(false);
  const [taskSerialDraft, setTaskSerialDraft] = useState("");
  const [movementType, setMovementType] = useState<"ADJUSTMENT_POSITIVE" | "ADJUSTMENT_NEGATIVE">(
    "ADJUSTMENT_POSITIVE"
  );
  const [quantity, setQuantity] = useState("1");
  const [operatorName, setOperatorName] = useState("Flash ERP operator");
  const [note, setNote] = useState(
    `Requesting a stock adjustment at ${detail.location.name} from the Flash ERP enterprise workspace.`
  );
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [selectedTransferTargetCode, setSelectedTransferTargetCode] = useState(
    detail.transferTargets[0]?.code ?? ""
  );
  const [transferQuantity, setTransferQuantity] = useState("1");
  const [transferOperatorName, setTransferOperatorName] = useState("Flash ERP operator");
  const [transferNote, setTransferNote] = useState(
    `Requesting an inter-location transfer from ${detail.location.name} in the Flash ERP enterprise workspace.`
  );
  const [isPurchaseOrderOpen, setIsPurchaseOrderOpen] = useState(false);
  const [purchaseOrderProductCode, setPurchaseOrderProductCode] = useState(
    detail.receivingProductRows[0]?.productCode ?? ""
  );
  const [purchaseOrderProductSearch, setPurchaseOrderProductSearch] = useState("");
  const [purchaseOrderDepartmentCode, setPurchaseOrderDepartmentCode] = useState("");
  const [purchaseOrderCategoryCode, setPurchaseOrderCategoryCode] = useState("");
  const [purchaseOrderSerializedOnly, setPurchaseOrderSerializedOnly] = useState(false);
  const [purchaseOrderLineQuantity, setPurchaseOrderLineQuantity] = useState("1");
  const [purchaseOrderLineUnitCost, setPurchaseOrderLineUnitCost] = useState("");
  const [purchaseOrderLines, setPurchaseOrderLines] = useState<PurchaseOrderDraftLine[]>([]);
  const [purchaseOrderSupplierNo, setPurchaseOrderSupplierNo] = useState(
    detail.availableSuppliers[0]?.supplierNo ?? ""
  );
  const [purchaseOrderExternalReference, setPurchaseOrderExternalReference] = useState("");
  const [purchaseOrderOperatorName, setPurchaseOrderOperatorName] = useState("Flash ERP operator");
  const [purchaseOrderNote, setPurchaseOrderNote] = useState(
    `Preparing a purchase order for ${detail.location.name} from the Flash ERP enterprise workspace.`
  );
  const [purchaseOrderToClose, setPurchaseOrderToClose] = useState<PurchaseOrderRow | null>(null);
  const [purchaseOrderClosureReason, setPurchaseOrderClosureReason] = useState<
    "" | PurchaseOrderClosureReason
  >("");
  const [purchaseOrderClosureOperatorName, setPurchaseOrderClosureOperatorName] =
    useState("Flash ERP operator");
  const [purchaseOrderClosureNote, setPurchaseOrderClosureNote] = useState("");
  const [supplierReturnToCancel, setSupplierReturnToCancel] = useState<SupplierReturnRow | null>(
    null
  );
  const [supplierReturnCancellationOperatorName, setSupplierReturnCancellationOperatorName] =
    useState("Flash ERP operator");
  const [supplierReturnCancellationNote, setSupplierReturnCancellationNote] = useState("");
  const [supplierClaimToUpdate, setSupplierClaimToUpdate] = useState<SupplierClaimRow | null>(null);
  const [supplierClaimStatus, setSupplierClaimStatus] = useState<"" | SupplierClaimStatus>("");
  const [supplierClaimCaseReference, setSupplierClaimCaseReference] = useState("");
  const [supplierClaimCreditNoteReference, setSupplierClaimCreditNoteReference] = useState("");
  const [supplierClaimCreditNoteAmount, setSupplierClaimCreditNoteAmount] = useState("");
  const [supplierClaimOperatorName, setSupplierClaimOperatorName] =
    useState("Flash ERP operator");
  const [supplierClaimNote, setSupplierClaimNote] = useState("");
  const [isGoodsReceiptOpen, setIsGoodsReceiptOpen] = useState(false);
  const [receivingProductCode, setReceivingProductCode] = useState(
    detail.receivingProductRows[0]?.productCode ?? ""
  );
  const [receivingProductSearch, setReceivingProductSearch] = useState("");
  const [receivingDepartmentCode, setReceivingDepartmentCode] = useState("");
  const [receivingCategoryCode, setReceivingCategoryCode] = useState("");
  const [receivingSerializedOnly, setReceivingSerializedOnly] = useState(false);
  const [receivingSerialDraft, setReceivingSerialDraft] = useState("");
  const [receiptQuantity, setReceiptQuantity] = useState("1");
  const [receiptUnitCost, setReceiptUnitCost] = useState("");
  const [receiptSupplierNo, setReceiptSupplierNo] = useState(
    detail.availableSuppliers[0]?.supplierNo ?? ""
  );
  const [receiptExternalReference, setReceiptExternalReference] = useState("");
  const [receiptOperatorName, setReceiptOperatorName] = useState("Flash ERP operator");
  const [receiptNote, setReceiptNote] = useState(
    `Recording a goods receipt into ${detail.location.name} from the Flash ERP enterprise workspace.`
  );
  const [adjustmentState, setAdjustmentState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string | null;
  }>({
    status: "idle",
    message: null
  });
  const [transferState, setTransferState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string | null;
  }>({
    status: "idle",
    message: null
  });
  const [goodsReceiptState, setGoodsReceiptState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string | null;
  }>({
    status: "idle",
    message: null
  });
  const [purchaseOrderState, setPurchaseOrderState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string | null;
  }>({
    status: "idle",
    message: null
  });
  const [supplierClaimState, setSupplierClaimState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string | null;
  }>({
    status: "idle",
    message: null
  });
  const [supplierReturnState, setSupplierReturnState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string | null;
  }>({
    status: "idle",
    message: null
  });
  const selectedProduct = useMemo(
    () => detail.balanceRows.find((product) => product.productCode === selectedProductCode) ?? null,
    [detail.balanceRows, selectedProductCode]
  );
  const selectedPurchaseOrderProduct = useMemo(
    () =>
      detail.receivingProductRows.find((product) => product.productCode === purchaseOrderProductCode) ??
      null,
    [detail.receivingProductRows, purchaseOrderProductCode]
  );
  const selectedReceivingProduct = useMemo(
    () =>
      detail.receivingProductRows.find((product) => product.productCode === receivingProductCode) ??
      null,
    [detail.receivingProductRows, receivingProductCode]
  );
  const filteredBalanceRows = useMemo(() => {
    const normalizedSearch = productSearch.trim().toUpperCase();

    return detail.balanceRows.filter((product) => {
      if (productDepartmentCode && product.departmentCode !== productDepartmentCode) {
        return false;
      }

      if (productCategoryCode && product.categoryCode !== productCategoryCode) {
        return false;
      }

      if (serializedOnly && !product.isSerialized) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystacks = [
        product.productCode,
        product.sku,
        product.productName,
        product.departmentCode,
        product.departmentName,
        product.categoryCode,
        product.categoryName,
        product.subcategory,
        product.status
      ];

      return haystacks.some((value) => value?.toUpperCase().includes(normalizedSearch));
    });
  }, [
    detail.balanceRows,
    productCategoryCode,
    productDepartmentCode,
    productSearch,
    serializedOnly
  ]);
  const filteredReceivingProductRows = useMemo(() => {
    const normalizedSearch = receivingProductSearch.trim().toUpperCase();

    return detail.receivingProductRows.filter((product) => {
      if (receivingDepartmentCode && product.departmentCode !== receivingDepartmentCode) {
        return false;
      }

      if (receivingCategoryCode && product.categoryCode !== receivingCategoryCode) {
        return false;
      }

      if (receivingSerializedOnly && !product.isSerialized) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystacks = [
        product.productCode,
        product.sku,
        product.productName,
        product.departmentCode,
        product.departmentName,
        product.categoryCode,
        product.categoryName,
        product.subcategory,
        product.status,
        product.primarySupplierNo,
        product.primarySupplierName
      ];

      return haystacks.some((value) => value?.toUpperCase().includes(normalizedSearch));
    });
  }, [
    detail.receivingProductRows,
    receivingCategoryCode,
    receivingDepartmentCode,
    receivingProductSearch,
    receivingSerializedOnly
  ]);
  const filteredPurchaseOrderProductRows = useMemo(() => {
    const normalizedSearch = purchaseOrderProductSearch.trim().toUpperCase();

    return detail.receivingProductRows.filter((product) => {
      if (purchaseOrderDepartmentCode && product.departmentCode !== purchaseOrderDepartmentCode) {
        return false;
      }

      if (purchaseOrderCategoryCode && product.categoryCode !== purchaseOrderCategoryCode) {
        return false;
      }

      if (purchaseOrderSerializedOnly && !product.isSerialized) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystacks = [
        product.productCode,
        product.sku,
        product.productName,
        product.departmentCode,
        product.departmentName,
        product.categoryCode,
        product.categoryName,
        product.subcategory,
        product.primarySupplierNo,
        product.primarySupplierName
      ];

      return haystacks.some((value) => value?.toUpperCase().includes(normalizedSearch));
    });
  }, [
    detail.receivingProductRows,
    purchaseOrderCategoryCode,
    purchaseOrderDepartmentCode,
    purchaseOrderProductSearch,
    purchaseOrderSerializedOnly
  ]);
  const selectedTransferTarget = useMemo(
    () =>
      detail.transferTargets.find((location) => location.code === selectedTransferTargetCode) ??
      detail.transferTargets[0] ??
      null,
    [detail.transferTargets, selectedTransferTargetCode]
  );
  const serializedBalanceRows = useMemo(
    () => detail.balanceRows.filter((product) => product.isSerialized),
    [detail.balanceRows]
  );
  const selectedProductHierarchy = selectedProduct ? formatHierarchyPath(selectedProduct) : "";
  const selectedPurchaseOrderProductHierarchy = selectedPurchaseOrderProduct
    ? formatHierarchyPath(selectedPurchaseOrderProduct)
    : "";
  const selectedReceivingProductHierarchy = selectedReceivingProduct
    ? formatHierarchyPath(selectedReceivingProduct)
    : "";
  const taskSelectedSerialNumbers = useMemo(() => parseSerialDraft(taskSerialDraft), [taskSerialDraft]);
  const receiptSelectedSerialNumbers = useMemo(
    () => parseSerialDraft(receivingSerialDraft),
    [receivingSerialDraft]
  );
  const effectiveAdjustmentQuantity = selectedProduct?.isSerialized
    ? taskSelectedSerialNumbers.length
    : Number(quantity);
  const effectiveTransferQuantity = Number(transferQuantity);
  const effectiveReceiptQuantity = selectedReceivingProduct?.isSerialized
    ? receiptSelectedSerialNumbers.length
    : Number(receiptQuantity);
  const selectedReceiptSupplier = useMemo(
    () =>
      detail.availableSuppliers.find((supplier) => supplier.supplierNo === receiptSupplierNo) ?? null,
    [detail.availableSuppliers, receiptSupplierNo]
  );

  useEffect(() => {
    const availableCategoryCodes = new Set(
      detail.availableCategories
        .filter((category) => !productDepartmentCode || category.departmentCode === productDepartmentCode)
        .map((category) => category.code)
    );

    if (productCategoryCode && !availableCategoryCodes.has(productCategoryCode)) {
      setProductCategoryCode("");
    }
  }, [detail.availableCategories, productCategoryCode, productDepartmentCode]);

  useEffect(() => {
    if (filteredBalanceRows.length === 0) {
      if (selectedProductCode) {
        setSelectedProductCode("");
      }

      return;
    }

    if (!filteredBalanceRows.some((product) => product.productCode === selectedProductCode)) {
      setSelectedProductCode(filteredBalanceRows[0]?.productCode ?? "");
    }
  }, [filteredBalanceRows, selectedProductCode]);

  useEffect(() => {
    if (!selectedProduct?.isSerialized && taskSerialDraft) {
      setTaskSerialDraft("");
    }
  }, [selectedProduct?.isSerialized, taskSerialDraft]);

  useEffect(() => {
    setTaskSerialDraft("");
  }, [selectedProductCode]);

  useEffect(() => {
    const availableCategoryCodes = new Set(
      detail.availableCategories
        .filter(
          (category) =>
            !purchaseOrderDepartmentCode || category.departmentCode === purchaseOrderDepartmentCode
        )
        .map((category) => category.code)
    );

    if (purchaseOrderCategoryCode && !availableCategoryCodes.has(purchaseOrderCategoryCode)) {
      setPurchaseOrderCategoryCode("");
    }
  }, [detail.availableCategories, purchaseOrderCategoryCode, purchaseOrderDepartmentCode]);

  useEffect(() => {
    if (filteredPurchaseOrderProductRows.length === 0) {
      if (purchaseOrderProductCode) {
        setPurchaseOrderProductCode("");
      }

      return;
    }

    if (
      !filteredPurchaseOrderProductRows.some(
        (product) => product.productCode === purchaseOrderProductCode
      )
    ) {
      setPurchaseOrderProductCode(filteredPurchaseOrderProductRows[0]?.productCode ?? "");
    }
  }, [filteredPurchaseOrderProductRows, purchaseOrderProductCode]);

  useEffect(() => {
    if (!selectedPurchaseOrderProduct) {
      return;
    }

    setPurchaseOrderLineUnitCost(
      selectedPurchaseOrderProduct.defaultUnitCost !== null
        ? String(selectedPurchaseOrderProduct.defaultUnitCost.toFixed(2))
        : ""
    );
    setPurchaseOrderLineQuantity("1");
    setPurchaseOrderSupplierNo(
      selectedPurchaseOrderProduct.primarySupplierNo ?? detail.availableSuppliers[0]?.supplierNo ?? ""
    );
  }, [detail.availableSuppliers, selectedPurchaseOrderProduct?.productCode]);

  useEffect(() => {
    const availableCategoryCodes = new Set(
      detail.availableCategories
        .filter(
          (category) =>
            !receivingDepartmentCode || category.departmentCode === receivingDepartmentCode
        )
        .map((category) => category.code)
    );

    if (receivingCategoryCode && !availableCategoryCodes.has(receivingCategoryCode)) {
      setReceivingCategoryCode("");
    }
  }, [detail.availableCategories, receivingCategoryCode, receivingDepartmentCode]);

  useEffect(() => {
    if (filteredReceivingProductRows.length === 0) {
      if (receivingProductCode) {
        setReceivingProductCode("");
      }

      return;
    }

    if (!filteredReceivingProductRows.some((product) => product.productCode === receivingProductCode)) {
      setReceivingProductCode(filteredReceivingProductRows[0]?.productCode ?? "");
    }
  }, [filteredReceivingProductRows, receivingProductCode]);

  useEffect(() => {
    if (!selectedReceivingProduct?.isSerialized && receivingSerialDraft) {
      setReceivingSerialDraft("");
    }
  }, [receivingSerialDraft, selectedReceivingProduct?.isSerialized]);

  useEffect(() => {
    if (!selectedReceivingProduct) {
      return;
    }

    setReceiptUnitCost(
      selectedReceivingProduct.defaultUnitCost !== null
        ? String(selectedReceivingProduct.defaultUnitCost.toFixed(2))
        : ""
    );
    setReceiptSupplierNo(selectedReceivingProduct.primarySupplierNo ?? "");
    setReceivingSerialDraft("");
    setReceiptQuantity(selectedReceivingProduct.isSerialized ? "1" : "1");
  }, [selectedReceivingProduct?.productCode]);

  const balanceColumns = useMemo<ColumnDef<BalanceRow>[]>(
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
              {row.original.isSerialized ? " • Serialized" : ""}
            </p>
            {row.original.departmentName || row.original.categoryName || row.original.subcategory ? (
              <p className="truncate text-xs text-stone-500">
                {formatHierarchyPath(row.original)}
              </p>
            ) : null}
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "status",
        header: "Status"
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
        accessorKey: "lastMovementAtLabel",
        header: "Last movement",
        cell: ({ row }) => renderTimestamp(row.original.lastMovementAt, row.original.lastMovementAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter]
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
  const serialTraceColumns = useMemo<ColumnDef<SerialTraceRow>[]>(
    () => [
      {
        accessorKey: "occurredAtLabel",
        header: "Occurred",
        cell: ({ row }) => renderTimestamp(row.original.occurredAt, row.original.occurredAtLabel),
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
        accessorKey: "serialNumbers",
        header: "Serials",
        accessorFn: (row) => row.serialNumbers.join(" "),
        cell: ({ row }) => <SerialChipList serialNumbers={row.original.serialNumbers} />,
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "quantity",
        header: "Quantity",
        cell: ({ row }) => quantityFormatter.format(row.original.quantity)
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
  const serialRegistryColumns = useMemo<ColumnDef<SerialRegistryRow>[]>(
    () => [
      {
        accessorKey: "updatedAtLabel",
        header: "Updated",
        cell: ({ row }) => renderTimestamp(row.original.updatedAt, row.original.updatedAtLabel),
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
        accessorKey: "serialNumber",
        header: "Serial"
      },
      {
        accessorKey: "status",
        header: "Status"
      },
      {
        accessorKey: "sourceReferenceLabel",
        header: "Source",
        cell: ({ row }) => row.original.sourceReferenceLabel ?? "Reference not captured"
      }
    ],
    []
  );

  async function handleRequestAdjustment() {
    if (!selectedProductCode || !selectedProduct) {
      setAdjustmentState({
        status: "error",
        message: "Select a product in the current location before queueing an adjustment task."
      });
      return;
    }

    if (selectedProduct.isSerialized && taskSelectedSerialNumbers.length === 0) {
      setAdjustmentState({
        status: "error",
        message:
          "Capture the exact serialized units to adjust before queueing this task."
      });
      return;
    }

    setAdjustmentState({
      status: "submitting",
      message: "Flash ERP is queuing the stock adjustment task for the store desktop."
    });

    try {
      const parsedQuantity = selectedProduct.isSerialized
        ? taskSelectedSerialNumbers.length
        : Number(quantity);
      const response = await fetch(
        `/api/inventory/locations/${encodeURIComponent(detail.location.code)}/adjustment-task`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            productCode: selectedProductCode,
            movementType,
            quantity: parsedQuantity,
            ...(selectedProduct.isSerialized ? { serialNumbers: taskSelectedSerialNumbers } : {}),
            operatorName,
            note
          })
        }
      );
      const payload = (await response.json()) as
        | InventoryAdjustmentTaskResponse
        | {
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Flash ERP could not queue the inventory adjustment task."
        );
      }

      const actionPayload = payload as InventoryAdjustmentTaskResponse;
      setAdjustmentState({
        status: "success",
        message: actionPayload.message
      });

      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setAdjustmentState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not queue the inventory adjustment task."
      });
    }
  }

  function handleAdjustmentOpenChange(open: boolean) {
    setIsAdjustmentOpen(open);

    if (open) {
      setTaskSerialDraft("");
      setAdjustmentState({
        status: "idle",
        message: null
      });
    }
  }

  function handleTransferOpenChange(open: boolean) {
    setIsTransferOpen(open);

    if (open) {
      setTransferState({
        status: "idle",
        message: null
      });
      setTransferQuantity("1");
      setTaskSerialDraft("");
      setSelectedTransferTargetCode(detail.transferTargets[0]?.code ?? "");
    }
  }

  async function handleRequestTransfer() {
    if (!selectedProductCode || !selectedProduct) {
      setTransferState({
        status: "error",
        message: "Select a product in the current location before queueing a transfer task."
      });
      return;
    }

    const parsedQuantity = Number(transferQuantity);

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setTransferState({
        status: "error",
        message: "Enter a transfer quantity greater than zero before issuing the instruction."
      });
      return;
    }

    if (selectedProduct.isSerialized && !Number.isInteger(parsedQuantity)) {
      setTransferState({
        status: "error",
        message:
          "Serialized items need a whole-number requested quantity. The actual serials will be selected by the source and destination shops locally."
      });
      return;
    }

    setTransferState({
      status: "submitting",
      message: "Flash ERP is creating the inter-store transfer instruction."
    });

    try {
      const response = await fetch(
        `/api/inventory/locations/${encodeURIComponent(detail.location.code)}/inter-store-transfers`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            productCode: selectedProductCode,
            destinationLocationCode: selectedTransferTargetCode,
            quantity: parsedQuantity,
            operatorName: transferOperatorName,
            note: transferNote
          })
        }
      );
      const payload = (await response.json()) as
        | CreateInterStoreTransferResponse
        | {
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Flash ERP could not create the inter-store transfer."
        );
      }

      const actionPayload = payload as CreateInterStoreTransferResponse;
      setTransferState({
        status: "success",
        message: actionPayload.message
      });

      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setTransferState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not create the inter-store transfer."
      });
    }
  }

  function handlePurchaseOrderOpenChange(open: boolean) {
    setIsPurchaseOrderOpen(open);

    if (open) {
      setPurchaseOrderState({
        status: "idle",
        message: null
      });
      setPurchaseOrderLines([]);
      setPurchaseOrderExternalReference("");
      setPurchaseOrderNote(
        `Preparing a purchase order for ${detail.location.name} from the Flash ERP enterprise workspace.`
      );
    }
  }

  function handleAddPurchaseOrderLine() {
    if (!purchaseOrderProductCode || !selectedPurchaseOrderProduct) {
      setPurchaseOrderState({
        status: "error",
        message: "Select a product before adding a purchase-order line."
      });
      return;
    }

    if (purchaseOrderLines.some((line) => line.productCode === purchaseOrderProductCode)) {
      setPurchaseOrderState({
        status: "error",
        message: `${selectedPurchaseOrderProduct.productName} is already staged on this purchase order.`
      });
      return;
    }

    const quantity = Number(purchaseOrderLineQuantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setPurchaseOrderState({
        status: "error",
        message: "Enter a quantity greater than zero before adding the line."
      });
      return;
    }

    if (selectedPurchaseOrderProduct.isSerialized && !Number.isInteger(quantity)) {
      setPurchaseOrderState({
        status: "error",
        message: "Serialized products need a whole-number purchase-order quantity."
      });
      return;
    }

    const unitCost =
      purchaseOrderLineUnitCost.trim().length > 0 ? Number(purchaseOrderLineUnitCost) : null;

    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      setPurchaseOrderState({
        status: "error",
        message: "Unit cost must be zero or greater when provided."
      });
      return;
    }

    setPurchaseOrderLines((current) => [
      ...current,
      {
        productCode: selectedPurchaseOrderProduct.productCode,
        productName: selectedPurchaseOrderProduct.productName,
        hierarchy: selectedPurchaseOrderProductHierarchy,
        quantity: quantity.toFixed(3),
        unitCost: unitCost === null ? "" : unitCost.toFixed(2),
        isSerialized: selectedPurchaseOrderProduct.isSerialized
      }
    ]);
    setPurchaseOrderState({
      status: "idle",
      message: null
    });
  }

  function handleRemovePurchaseOrderLine(productCode: string) {
    setPurchaseOrderLines((current) => current.filter((line) => line.productCode !== productCode));
  }

  async function handleCreatePurchaseOrder(autoCommit: boolean) {
    if (purchaseOrderLines.length === 0) {
      setPurchaseOrderState({
        status: "error",
        message: "Add at least one line before Flash ERP can save the purchase order."
      });
      return;
    }

    setPurchaseOrderState({
      status: "submitting",
      message: autoCommit
        ? "Flash ERP is committing the purchase order and preparing the downstream publication."
        : "Flash ERP is saving the purchase-order draft."
    });

    try {
      const response = await fetch(
        `/api/inventory/locations/${encodeURIComponent(detail.location.code)}/purchase-orders`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            supplierNo: purchaseOrderSupplierNo || null,
            externalReference: purchaseOrderExternalReference || null,
            note: purchaseOrderNote,
            operatorName: purchaseOrderOperatorName,
            autoCommit,
            lines: purchaseOrderLines.map((line) => ({
              productCode: line.productCode,
              quantity: Number(line.quantity),
              unitCost: line.unitCost.trim().length > 0 ? Number(line.unitCost) : null
            }))
          })
        }
      );
      const payload = (await response.json()) as
        | CreatePurchaseOrderResponse
        | {
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Flash ERP could not save the purchase order."
        );
      }

      setPurchaseOrderState({
        status: "success",
        message: (payload as CreatePurchaseOrderResponse).message
      });

      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setPurchaseOrderState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save the purchase order."
      });
    }
  }

  async function handleCommitPurchaseOrder(purchaseOrderId: string) {
    setPurchaseOrderState({
      status: "submitting",
      message: "Flash ERP is committing the purchase order downstream."
    });

    try {
      const response = await fetch(
        `/api/inventory/purchase-orders/${encodeURIComponent(purchaseOrderId)}/commit`,
        {
          method: "POST"
        }
      );
      const payload = (await response.json()) as
        | PurchaseOrderLifecycleResponse
        | {
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Flash ERP could not commit the purchase order."
        );
      }

      setPurchaseOrderState({
        status: "success",
        message: (payload as PurchaseOrderLifecycleResponse).message
      });

      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setPurchaseOrderState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not commit the purchase order."
      });
    }
  }

  function handlePurchaseOrderCloseDialogOpenChange(open: boolean) {
    if (open) {
      return;
    }

    setPurchaseOrderToClose(null);
    setPurchaseOrderClosureReason("");
    setPurchaseOrderClosureOperatorName("Flash ERP operator");
    setPurchaseOrderClosureNote("");
  }

  function handleOpenPurchaseOrderCloseDialog(purchaseOrder: PurchaseOrderRow) {
    setPurchaseOrderToClose(purchaseOrder);
    setPurchaseOrderClosureReason(
      purchaseOrder.outstandingQuantity > 0 || purchaseOrder.exceptionQuantity > 0
        ? ((purchaseOrder.closureReason as PurchaseOrderClosureReason | null) ?? "SHORT_SUPPLIED")
        : ((purchaseOrder.closureReason as PurchaseOrderClosureReason | null) ?? "FULFILLED")
    );
    setPurchaseOrderClosureOperatorName(
      purchaseOrder.closureOperatorName ?? purchaseOrder.operatorName ?? "Flash ERP operator"
    );
    setPurchaseOrderClosureNote(purchaseOrder.closureNote ?? "");
  }

  async function handleClosePurchaseOrder() {
    if (!purchaseOrderToClose) {
      return;
    }

    setPurchaseOrderState({
      status: "submitting",
      message: "Flash ERP is closing the purchase order."
    });

    try {
      const requestBody: ClosePurchaseOrderRequest = {
        closureReason: purchaseOrderClosureReason || null,
        closureNote: purchaseOrderClosureNote.trim() || null,
        operatorName: purchaseOrderClosureOperatorName.trim() || null
      };
      const response = await fetch(
        `/api/inventory/purchase-orders/${encodeURIComponent(purchaseOrderToClose.purchaseOrderId)}/close`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(requestBody)
        }
      );
      const payload = (await response.json()) as
        | PurchaseOrderLifecycleResponse
        | {
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Flash ERP could not close the purchase order."
        );
      }

      setPurchaseOrderState({
        status: "success",
        message: (payload as PurchaseOrderLifecycleResponse).message
      });
      handlePurchaseOrderCloseDialogOpenChange(false);

      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setPurchaseOrderState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not close the purchase order."
      });
    }
  }

  function handleSupplierReturnDialogOpenChange(open: boolean) {
    if (open) {
      return;
    }

    setSupplierReturnToCancel(null);
    setSupplierReturnCancellationOperatorName("Flash ERP operator");
    setSupplierReturnCancellationNote("");
  }

  function handleOpenSupplierReturnDialog(supplierReturn: SupplierReturnRow) {
    setSupplierReturnToCancel(supplierReturn);
    setSupplierReturnCancellationOperatorName(
      supplierReturn.cancellationOperatorName ??
        supplierReturn.operatorName ??
        "Flash ERP operator"
    );
    setSupplierReturnCancellationNote(
      supplierReturn.cancellationNote ??
        `Cancelling ${supplierReturn.supplierReturnNo} and restoring the stock posture back into ${detail.location.name}.`
    );
  }

  async function handleCancelSupplierReturn() {
    if (!supplierReturnToCancel) {
      return;
    }

    if (supplierReturnToCancel.status === "CANCELLED") {
      setSupplierReturnState({
        status: "error",
        message: `${supplierReturnToCancel.supplierReturnNo} is already cancelled.`
      });
      return;
    }

    setSupplierReturnState({
      status: "submitting",
      message: "Flash ERP is cancelling the supplier return and queuing stock rehydration."
    });

    try {
      const requestBody: CancelSupplierReturnRequest = {
        cancellationNote: supplierReturnCancellationNote.trim() || null,
        operatorName: supplierReturnCancellationOperatorName.trim() || null
      };
      const response = await fetch(
        `/api/inventory/supplier-returns/${encodeURIComponent(supplierReturnToCancel.supplierReturnId)}/cancel`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(requestBody)
        }
      );
      const payload = (await response.json()) as
        | CancelSupplierReturnResponse
        | {
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Flash ERP could not cancel the supplier return."
        );
      }

      setSupplierReturnState({
        status: "success",
        message: (payload as CancelSupplierReturnResponse).message
      });
      handleSupplierReturnDialogOpenChange(false);

      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setSupplierReturnState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not cancel the supplier return."
      });
    }
  }

  function handleSupplierClaimDialogOpenChange(open: boolean) {
    if (open) {
      return;
    }

    setSupplierClaimToUpdate(null);
    setSupplierClaimStatus("");
    setSupplierClaimCaseReference("");
    setSupplierClaimCreditNoteReference("");
    setSupplierClaimCreditNoteAmount("");
    setSupplierClaimOperatorName("Flash ERP operator");
    setSupplierClaimNote("");
  }

  function handleOpenSupplierClaimDialog(supplierClaim: SupplierClaimRow) {
    setSupplierClaimToUpdate(supplierClaim);
    setSupplierClaimStatus(supplierClaim.status as SupplierClaimStatus);
    setSupplierClaimCaseReference(supplierClaim.supplierCaseReference ?? "");
    setSupplierClaimCreditNoteReference(supplierClaim.creditNoteReference ?? "");
    setSupplierClaimCreditNoteAmount(
      supplierClaim.creditNoteAmount === null ? "" : String(supplierClaim.creditNoteAmount)
    );
    setSupplierClaimOperatorName(supplierClaim.operatorName ?? "Flash ERP operator");
    setSupplierClaimNote(supplierClaim.note ?? "");
  }

  async function handleUpdateSupplierClaim() {
    if (!supplierClaimToUpdate || !supplierClaimStatus) {
      return;
    }

    setSupplierClaimState({
      status: "submitting",
      message: "Flash ERP is updating the supplier claim."
    });

    try {
      const requestBody: UpdateSupplierClaimRequest = {
        status: supplierClaimStatus,
        supplierCaseReference: supplierClaimCaseReference.trim() || null,
        creditNoteReference: supplierClaimCreditNoteReference.trim() || null,
        creditNoteAmount: supplierClaimCreditNoteAmount.trim()
          ? Number(supplierClaimCreditNoteAmount)
          : null,
        note: supplierClaimNote.trim() || null,
        operatorName: supplierClaimOperatorName.trim() || null
      };
      const response = await fetch(
        `/api/inventory/supplier-claims/${encodeURIComponent(supplierClaimToUpdate.supplierClaimId)}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(requestBody)
        }
      );
      const payload = (await response.json()) as
        | UpdateSupplierClaimResponse
        | {
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Flash ERP could not update the supplier claim."
        );
      }

      setSupplierClaimState({
        status: "success",
        message: (payload as UpdateSupplierClaimResponse).message
      });
      handleSupplierClaimDialogOpenChange(false);

      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setSupplierClaimState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update the supplier claim."
      });
    }
  }

  function handleGoodsReceiptOpenChange(open: boolean) {
    setIsGoodsReceiptOpen(open);

    if (open) {
      setGoodsReceiptState({
        status: "idle",
        message: null
      });
      setReceivingSerialDraft("");
      setReceiptExternalReference("");
      setReceiptNote(
        `Recording a goods receipt into ${detail.location.name} from the Flash ERP enterprise workspace.`
      );
    }
  }

  async function handleRecordGoodsReceipt() {
    if (!receivingProductCode || !selectedReceivingProduct) {
      setGoodsReceiptState({
        status: "error",
        message: "Select a receivable product before posting a goods receipt."
      });
      return;
    }

    if (selectedReceivingProduct.isSerialized && receiptSelectedSerialNumbers.length === 0) {
      setGoodsReceiptState({
        status: "error",
        message: "Capture the exact serial numbers before posting this serialized goods receipt."
      });
      return;
    }

    setGoodsReceiptState({
      status: "submitting",
      message: "Flash ERP is posting the goods receipt into the canonical inventory ledger."
    });

    try {
      const response = await fetch(
        `/api/inventory/locations/${encodeURIComponent(detail.location.code)}/goods-receipt`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            productCode: receivingProductCode,
            quantity: effectiveReceiptQuantity,
            unitCost: receiptUnitCost.trim().length > 0 ? Number(receiptUnitCost) : null,
            supplierNo: receiptSupplierNo || null,
            externalReference: receiptExternalReference || null,
            note: receiptNote,
            operatorName: receiptOperatorName,
            ...(selectedReceivingProduct.isSerialized
              ? { serialNumbers: receiptSelectedSerialNumbers }
              : {})
          })
        }
      );
      const payload = (await response.json()) as
        | InventoryGoodsReceiptResponse
        | {
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Flash ERP could not post the goods receipt."
        );
      }

      const actionPayload = payload as InventoryGoodsReceiptResponse;
      setGoodsReceiptState({
        status: "success",
        message: actionPayload.message
      });

      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setGoodsReceiptState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not post the goods receipt."
      });
    }
  }

  return (
    <EnterpriseShell
      activeSection="inventory"
      description={`Inspect stock posture, recent movements, and recovery risk for ${detail.location.name}.`}
      eyebrow={`Flash ERP enterprise • ${detail.location.code}`}
      heading={detail.location.name}
    >
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
            href="/inventory"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to inventory
          </Link>
          {detail.location.storeCode ? (
            <Link
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
              href={`/stores/${encodeURIComponent(detail.location.storeCode)}`}
            >
              Open store
            </Link>
          ) : null}
          {detail.location.primaryNodeCode ? (
            <Link
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
              href={`/sync/nodes/${encodeURIComponent(detail.location.primaryNodeCode)}`}
            >
              Open primary node
            </Link>
          ) : null}
          {detail.receivingProductRows.length > 0 ? (
            <ActionDialog
              description="Create a purchase order for this destination location, then optionally commit it so the assigned store desktop can receive the order offline on its next sync pull."
              onOpenChange={handlePurchaseOrderOpenChange}
              open={isPurchaseOrderOpen}
              title="Create purchase order"
              triggerClassName="border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400 hover:text-amber-950"
              triggerLabel="Create purchase order"
              widthClassName="max-w-4xl"
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  Flash ERP will stage a purchase order for {detail.location.name}. When you commit
                  it, the destination desktop node can receive against it offline and sync the GRN
                  back to enterprise later.
                </div>
                <InventoryTaskProductPicker
                  availableCategories={detail.availableCategories}
                  availableDepartments={detail.availableDepartments}
                  categoryCode={purchaseOrderCategoryCode}
                  departmentCode={purchaseOrderDepartmentCode}
                  emptyLabel="No matching receivable products"
                  filteredProducts={filteredPurchaseOrderProductRows}
                  onCategoryCodeChange={setPurchaseOrderCategoryCode}
                  onDepartmentCodeChange={setPurchaseOrderDepartmentCode}
                  onProductSearchChange={setPurchaseOrderProductSearch}
                  onSelectedProductCodeChange={setPurchaseOrderProductCode}
                  onSerializedOnlyChange={setPurchaseOrderSerializedOnly}
                  poolDescription="Choose inventory-tracked products that should be received into this location later from the assigned execution node."
                  productSearch={purchaseOrderProductSearch}
                  selectedProductCode={purchaseOrderProductCode}
                  serializedOnly={purchaseOrderSerializedOnly}
                />
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Line quantity</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      min="0.001"
                      onChange={(event) => setPurchaseOrderLineQuantity(event.target.value)}
                      step="0.001"
                      type="number"
                      value={purchaseOrderLineQuantity}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Line unit cost</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      min="0"
                      onChange={(event) => setPurchaseOrderLineUnitCost(event.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                      value={purchaseOrderLineUnitCost}
                    />
                  </label>
                  <div className="space-y-2 text-sm text-stone-700 md:col-span-2 xl:col-span-2">
                    <span className="block font-semibold text-stone-900">Selected product</span>
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                      {selectedPurchaseOrderProduct ? (
                        <>
                          <p className="font-semibold text-stone-900">
                            {selectedPurchaseOrderProduct.productName}
                          </p>
                          <p className="mt-1 text-xs text-stone-500">
                            {selectedPurchaseOrderProduct.productCode}
                            {selectedPurchaseOrderProductHierarchy
                              ? ` • ${selectedPurchaseOrderProductHierarchy}`
                              : ""}
                            {selectedPurchaseOrderProduct.isSerialized
                              ? " • Serialized control item"
                              : " • Standard item"}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-stone-500">
                          Select a product from the eligible pool first.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-amber-300 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:border-amber-400"
                    disabled={!selectedPurchaseOrderProduct}
                    onClick={handleAddPurchaseOrderLine}
                    type="button"
                  >
                    Add line
                  </button>
                </div>
                {purchaseOrderLines.length > 0 ? (
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                      Staged lines
                    </p>
                    <div className="mt-3 space-y-3">
                      {purchaseOrderLines.map((line) => (
                        <div
                          className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
                          key={line.productCode}
                        >
                          <div>
                            <p className="font-semibold text-stone-900">{line.productName}</p>
                            <p className="mt-1 text-xs text-stone-500">
                              {line.productCode}
                              {line.hierarchy ? ` • ${line.hierarchy}` : ""}
                              {line.isSerialized ? " • Serialized" : ""}
                            </p>
                            <p className="mt-1 text-xs text-stone-500">
                              Quantity {quantityFormatter.format(Number(line.quantity))}
                              {line.unitCost ? ` • Unit cost ${currencyFormatter.format(Number(line.unitCost))}` : ""}
                            </p>
                          </div>
                          <button
                            className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                            onClick={() => handleRemovePurchaseOrderLine(line.productCode)}
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-600">
                    Add one or more lines to build the purchase order before saving or committing it.
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Supplier</span>
                    <select
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setPurchaseOrderSupplierNo(event.target.value)}
                      value={purchaseOrderSupplierNo}
                    >
                      <option value="">No supplier</option>
                      {detail.availableSuppliers.map((supplier) => (
                        <option key={supplier.supplierNo} value={supplier.supplierNo}>
                          {supplier.name} ({supplier.supplierNo})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-stone-700 md:col-span-2 xl:col-span-2">
                    <span className="block font-semibold text-stone-900">External reference</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setPurchaseOrderExternalReference(event.target.value)}
                      placeholder="Supplier quote, requisition, or planning reference"
                      value={purchaseOrderExternalReference}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Operator name</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setPurchaseOrderOperatorName(event.target.value)}
                      value={purchaseOrderOperatorName}
                    />
                  </label>
                </div>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Purchase-order note</span>
                  <textarea
                    className="min-h-28 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setPurchaseOrderNote(event.target.value)}
                    placeholder="Describe why this stock is being ordered for this location."
                    value={purchaseOrderNote}
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    disabled={purchaseOrderState.status === "submitting"}
                    onClick={() => setIsPurchaseOrderOpen(false)}
                    type="button"
                  >
                    Close
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    disabled={purchaseOrderState.status === "submitting" || purchaseOrderLines.length === 0}
                    onClick={() => void handleCreatePurchaseOrder(false)}
                    type="button"
                  >
                    {purchaseOrderState.status === "submitting" ? "Saving..." : "Save draft"}
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#b45309,#92400e)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(146,64,14,0.22)] transition hover:brightness-[1.03]"
                    disabled={purchaseOrderState.status === "submitting" || purchaseOrderLines.length === 0}
                    onClick={() => void handleCreatePurchaseOrder(true)}
                    type="button"
                  >
                    {purchaseOrderState.status === "submitting" ? "Committing..." : "Commit downstream"}
                  </button>
                </div>
                {purchaseOrderState.message ? (
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                      purchaseOrderState.status === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {purchaseOrderState.message}
                  </div>
                ) : null}
              </div>
            </ActionDialog>
          ) : null}
          {purchaseOrderToClose ? (
            <ActionDialog
              description="Close the purchase order with an explicit outcome so downstream nodes and enterprise history can distinguish fulfilled orders from shortages, rejections, and vendor exceptions."
              hideTrigger
              onOpenChange={handlePurchaseOrderCloseDialogOpenChange}
              open={purchaseOrderToClose !== null}
              title={`Close ${purchaseOrderToClose.purchaseOrderNo}`}
              triggerLabel="Close purchase order"
              widthClassName="max-w-2xl"
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  {purchaseOrderToClose.outstandingQuantity > 0
                    ? `This purchase order still has ${quantityFormatter.format(
                        purchaseOrderToClose.outstandingQuantity
                      )} unit(s) outstanding, so Flash ERP needs a non-fulfilled closure reason and a note before closing it.`
                    : "All ordered quantity is already received, so Flash ERP can close this as fulfilled unless you need to record another exception reason."}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Closure reason</span>
                    <select
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) =>
                        setPurchaseOrderClosureReason(
                          event.target.value as "" | PurchaseOrderClosureReason
                        )
                      }
                      value={purchaseOrderClosureReason}
                    >
                      <option value="">Select a closure reason</option>
                      <option value="FULFILLED">Fulfilled</option>
                      <option value="SHORT_SUPPLIED">Short supplied</option>
                      <option value="CANCELLED_BY_SUPPLIER">Cancelled by supplier</option>
                      <option value="REJECTED_AT_RECEIPT">Rejected at receipt</option>
                      <option value="RETURNED_TO_VENDOR">Returned to vendor</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Closing operator</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setPurchaseOrderClosureOperatorName(event.target.value)}
                      placeholder="Flash ERP operator"
                      value={purchaseOrderClosureOperatorName}
                    />
                  </label>
                </div>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Closure note</span>
                  <textarea
                    className="min-h-28 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setPurchaseOrderClosureNote(event.target.value)}
                    placeholder="Document shortages, rejected lines, or the supplier exception that closed this PO."
                    value={purchaseOrderClosureNote}
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    disabled={purchaseOrderState.status === "submitting"}
                    onClick={() => handlePurchaseOrderCloseDialogOpenChange(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#57534e,#292524)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(41,37,36,0.22)] transition hover:brightness-[1.03]"
                    disabled={purchaseOrderState.status === "submitting"}
                    onClick={() => void handleClosePurchaseOrder()}
                    type="button"
                  >
                    {purchaseOrderState.status === "submitting" ? "Closing..." : "Close purchase order"}
                  </button>
                </div>
              </div>
            </ActionDialog>
          ) : null}
          {supplierReturnToCancel ? (
            <ActionDialog
              description="Cancel the posted supplier return, restore the stock posture back into the originating location, and publish the reversal back to the execution node."
              hideTrigger
              onOpenChange={handleSupplierReturnDialogOpenChange}
              open={supplierReturnToCancel !== null}
              title={`Cancel ${supplierReturnToCancel.supplierReturnNo}`}
              triggerLabel="Cancel supplier return"
              widthClassName="max-w-2xl"
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
                  Flash ERP will reverse the RTV from canonical inventory, then queue downstream
                  stock and serial rehydration back to the original desktop node.
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                      Current status
                    </p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">
                      {supplierReturnToCancel.statusLabel}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                      Quantity
                    </p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">
                      {quantityFormatter.format(supplierReturnToCancel.totalQuantity)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                      Source GRN
                    </p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">
                      {supplierReturnToCancel.goodsReceiptNo ?? "Not linked"}
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Cancelling operator</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) =>
                        setSupplierReturnCancellationOperatorName(event.target.value)
                      }
                      placeholder="Flash ERP operator"
                      value={supplierReturnCancellationOperatorName}
                    />
                  </label>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                    <p className="font-semibold text-stone-900">Rehydration target</p>
                    <p className="mt-1 leading-6">
                      {detail.location.primaryNodeCode
                        ? `${detail.location.primaryNodeCode} will receive the reversal on its next sync pull.`
                        : "No primary node is currently registered for this location, so enterprise will only reverse the canonical stock posture."}
                    </p>
                  </div>
                </div>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Cancellation note</span>
                  <textarea
                    className="min-h-28 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setSupplierReturnCancellationNote(event.target.value)}
                    placeholder="Explain why this RTV is being reversed and what the store should expect."
                    value={supplierReturnCancellationNote}
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    disabled={supplierReturnState.status === "submitting"}
                    onClick={() => handleSupplierReturnDialogOpenChange(false)}
                    type="button"
                  >
                    Keep posted
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#be123c,#881337)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(136,19,55,0.22)] transition hover:brightness-[1.03]"
                    disabled={supplierReturnState.status === "submitting"}
                    onClick={() => void handleCancelSupplierReturn()}
                    type="button"
                  >
                    {supplierReturnState.status === "submitting"
                      ? "Cancelling..."
                      : "Cancel supplier return"}
                  </button>
                </div>
              </div>
            </ActionDialog>
          ) : null}
          {supplierClaimToUpdate ? (
            <ActionDialog
              description="Update supplier-claim posture so purchasing can track whether supplier credit is still being chased, already received, written off, or fully closed."
              hideTrigger
              onOpenChange={handleSupplierClaimDialogOpenChange}
              open={supplierClaimToUpdate !== null}
              title={`Update ${supplierClaimToUpdate.claimNo}`}
              triggerLabel="Update supplier claim"
              widthClassName="max-w-2xl"
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  {supplierClaimToUpdate.goodsReceiptNo
                    ? `This claim is linked to ${supplierClaimToUpdate.goodsReceiptNo} and currently sits at ${supplierClaimToUpdate.statusLabel.toLowerCase()}.`
                    : `This claim currently sits at ${supplierClaimToUpdate.statusLabel.toLowerCase()}.`}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                      Claimed value
                    </p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">
                      {currencyFormatter.format(supplierClaimToUpdate.claimAmount)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                      Recorded credit
                    </p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">
                      {currencyFormatter.format(supplierClaimToUpdate.creditNoteAmount ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                      Remaining gap
                    </p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">
                      {currencyFormatter.format(supplierClaimToUpdate.remainingAmount)}
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Claim status</span>
                    <select
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) =>
                        setSupplierClaimStatus(event.target.value as "" | SupplierClaimStatus)
                      }
                      value={supplierClaimStatus}
                    >
                      <option value="">Select a status</option>
                      <option value="OPEN">Open</option>
                      <option value="CREDIT_REQUESTED">Credit requested</option>
                      <option value="CREDIT_RECEIVED">Credit received</option>
                      <option value="WRITTEN_OFF">Written off</option>
                      <option value="CLOSED">Closed</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Operator</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setSupplierClaimOperatorName(event.target.value)}
                      placeholder="Flash ERP operator"
                      value={supplierClaimOperatorName}
                    />
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Supplier case reference</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setSupplierClaimCaseReference(event.target.value)}
                      placeholder="Vendor ticket, debit note, or supplier reference"
                      value={supplierClaimCaseReference}
                    />
                  </label>
                  <div className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Credit-request posture</span>
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-600">
                      {supplierClaimToUpdate.creditRequestedAt
                        ? `Requested ${supplierClaimToUpdate.creditRequestedAtLabel}${supplierClaimToUpdate.creditRequestedBy ? ` by ${supplierClaimToUpdate.creditRequestedBy}` : ""}.`
                        : "Flash ERP will stamp the request timing automatically the first time you move this claim into Credit requested."}
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Credit-note reference</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setSupplierClaimCreditNoteReference(event.target.value)}
                      placeholder="Supplier CN, debit note, or settlement reference"
                      value={supplierClaimCreditNoteReference}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Credit amount</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      min="0"
                      onChange={(event) => setSupplierClaimCreditNoteAmount(event.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                      value={supplierClaimCreditNoteAmount}
                    />
                  </label>
                </div>
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Claim note</span>
                  <textarea
                    className="min-h-28 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setSupplierClaimNote(event.target.value)}
                    placeholder="Capture supplier response, credit timing, or why this claim is being closed."
                    value={supplierClaimNote}
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    disabled={supplierClaimState.status === "submitting"}
                    onClick={() => handleSupplierClaimDialogOpenChange(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#57534e,#292524)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(41,37,36,0.22)] transition hover:brightness-[1.03]"
                    disabled={supplierClaimState.status === "submitting" || !supplierClaimStatus}
                    onClick={() => void handleUpdateSupplierClaim()}
                    type="button"
                  >
                    {supplierClaimState.status === "submitting" ? "Saving..." : "Update claim"}
                  </button>
                </div>
              </div>
            </ActionDialog>
          ) : null}
          {detail.receivingProductRows.length > 0 && !detail.location.primaryNodeCode ? (
            <ActionDialog
              description="Post a canonical enterprise goods receipt into this location. Store-attached locations will also receive a downstream receipt packet so the branch desktop can hydrate the same stock offline."
              onOpenChange={handleGoodsReceiptOpenChange}
              open={isGoodsReceiptOpen}
              title="Record goods receipt"
              triggerClassName="border-[color:var(--brand)]/30 bg-[color:var(--brand)]/10 text-[color:var(--brand-deep)] hover:border-[color:var(--brand)]/50 hover:text-[color:var(--brand-deep)]"
              triggerLabel="Record goods receipt"
              widthClassName="max-w-3xl"
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
                  {detail.location.primaryNodeCode
                    ? `Flash ERP will post the goods receipt canonically at enterprise and queue a downstream inventory packet for ${detail.location.primaryNodeCode} so the store desktop can hydrate the same stock offline on its next pull.`
                    : "Flash ERP will post the goods receipt canonically at enterprise for this location. This location is not currently attached to an active store desktop node."}
                </div>
                <InventoryTaskProductPicker
                  availableCategories={detail.availableCategories}
                  availableDepartments={detail.availableDepartments}
                  categoryCode={receivingCategoryCode}
                  departmentCode={receivingDepartmentCode}
                  emptyLabel="No matching inventory-tracked products"
                  filteredProducts={filteredReceivingProductRows}
                  onCategoryCodeChange={setReceivingCategoryCode}
                  onDepartmentCodeChange={setReceivingDepartmentCode}
                  onProductSearchChange={setReceivingProductSearch}
                  onSelectedProductCodeChange={setReceivingProductCode}
                  onSerializedOnlyChange={setReceivingSerializedOnly}
                  poolDescription="Choose any active inventory-tracked catalog product, not just items already carrying stock in this location."
                  productSearch={receivingProductSearch}
                  selectedProductCode={receivingProductCode}
                  serializedOnly={receivingSerializedOnly}
                />
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Quantity</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      disabled={selectedReceivingProduct?.isSerialized}
                      min="0.001"
                      onChange={(event) => setReceiptQuantity(event.target.value)}
                      placeholder="1.000"
                      readOnly={selectedReceivingProduct?.isSerialized}
                      step="0.001"
                      type="number"
                      value={
                        selectedReceivingProduct?.isSerialized
                          ? String(receiptSelectedSerialNumbers.length)
                          : receiptQuantity
                      }
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Unit cost</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      min="0"
                      onChange={(event) => setReceiptUnitCost(event.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                      value={receiptUnitCost}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Supplier</span>
                    <select
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setReceiptSupplierNo(event.target.value)}
                      value={receiptSupplierNo}
                    >
                      <option value="">No supplier</option>
                      {detail.availableSuppliers.map((supplier) => (
                        <option key={supplier.supplierNo} value={supplier.supplierNo}>
                          {supplier.name} ({supplier.supplierNo})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Operator name</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setReceiptOperatorName(event.target.value)}
                      placeholder="Flash ERP operator"
                      value={receiptOperatorName}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                    <span className="block font-semibold text-stone-900">External reference</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setReceiptExternalReference(event.target.value)}
                      placeholder="Vendor GRN, invoice, or shipment reference"
                      value={receiptExternalReference}
                    />
                  </label>
                </div>
                {selectedReceivingProduct ? (
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                    <p className="font-semibold text-stone-900">Receipt posture</p>
                    <p className="mt-1">
                      Flash ERP will post{" "}
                      {quantityFormatter.format(
                        Number.isFinite(effectiveReceiptQuantity) ? effectiveReceiptQuantity : 0
                      )}{" "}
                      unit(s) of {selectedReceivingProduct.productName} into {detail.location.name}.
                    </p>
                    <p className="mt-2 text-xs text-stone-500">
                      {selectedReceivingProductHierarchy || "No department/category assigned yet"}
                      {selectedReceivingProduct.isSerialized ? " • Serialized control item" : " • Standard item"}
                      {selectedReceiptSupplier
                        ? ` • Supplier ${selectedReceiptSupplier.name}`
                        : selectedReceivingProduct.primarySupplierName
                          ? ` • Primary supplier ${selectedReceivingProduct.primarySupplierName}`
                          : ""}
                    </p>
                  </div>
                ) : null}
                {selectedReceivingProduct?.isSerialized ? (
                  <SerializedTaskSerialPanel
                    description="Paste or scan the exact serial numbers being received. Flash ERP will derive the receipt quantity from this list and push the same units into the store desktop registry for store-attached locations."
                    onSerialDraftChange={setReceivingSerialDraft}
                    serialDraft={receivingSerialDraft}
                    serialNumbers={receiptSelectedSerialNumbers}
                    title="Serialized receiving control"
                  />
                ) : null}
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Receipt note</span>
                  <textarea
                    className="min-h-28 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setReceiptNote(event.target.value)}
                    placeholder="Describe what is being received into this location."
                    value={receiptNote}
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    disabled={goodsReceiptState.status === "submitting"}
                    onClick={() => setIsGoodsReceiptOpen(false)}
                    type="button"
                  >
                    Close
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
                    disabled={
                      goodsReceiptState.status === "submitting" ||
                      !receivingProductCode ||
                      !selectedReceivingProduct ||
                      filteredReceivingProductRows.length === 0 ||
                      effectiveReceiptQuantity <= 0
                    }
                    onClick={() => void handleRecordGoodsReceipt()}
                    type="button"
                  >
                    {goodsReceiptState.status === "submitting"
                      ? "Posting goods receipt..."
                      : "Post goods receipt"}
                  </button>
                </div>
                {goodsReceiptState.message ? (
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                      goodsReceiptState.status === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {goodsReceiptState.message}
                  </div>
                ) : null}
              </div>
            </ActionDialog>
          ) : null}
          {detail.location.primaryNodeCode && detail.receivingProductRows.length > 0 ? (
            <div className="glass-panel flex min-h-[12.5rem] flex-col justify-between rounded-[1.8rem] border border-emerald-200/70 bg-[linear-gradient(135deg,rgba(236,253,245,0.96),rgba(209,250,229,0.82))] p-5">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                  Local Receiving
                </p>
                <div className="space-y-2 text-sm leading-6 text-emerald-950">
                  <p className="font-semibold">
                    Purchase orders still start here, but goods receipt now happens on{" "}
                    {detail.location.primaryNodeCode}.
                  </p>
                  <p>
                    Commit the PO at enterprise, let the assigned shop or warehouse desktop receive
                    the physical stock locally, then Flash ERP will sync the GRN, stock, and serial
                    posture back into HQ automatically.
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-emerald-900/90">
                Use the <span className="font-semibold">Purchasing</span> tab below to review the
                resulting goods receipts after the node syncs them back.
              </p>
            </div>
          ) : null}
          {detail.location.primaryNodeCode && detail.balanceRows.length > 0 ? (
            <ActionDialog
              description="Queue a downstream stock adjustment for the store desktop, then let the store apply it locally and sync the resulting movement upstream."
              onOpenChange={handleAdjustmentOpenChange}
              open={isAdjustmentOpen}
              title="Request stock adjustment"
              triggerClassName="border-sky-300 bg-sky-50 text-sky-900 hover:border-sky-400 hover:text-sky-950"
              triggerLabel="Request adjustment"
              widthClassName="max-w-2xl"
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
                  Flash ERP will target {detail.location.primaryNodeCode} so the store desktop can
                  apply the adjustment even if the branch is offline from enterprise afterward.
                </div>
                <InventoryTaskProductPicker
                  availableCategories={detail.availableCategories}
                  availableDepartments={detail.availableDepartments}
                  categoryCode={productCategoryCode}
                  departmentCode={productDepartmentCode}
                  filteredProducts={filteredBalanceRows}
                  onCategoryCodeChange={setProductCategoryCode}
                  onDepartmentCodeChange={setProductDepartmentCode}
                  onProductSearchChange={setProductSearch}
                  onSelectedProductCodeChange={setSelectedProductCode}
                  onSerializedOnlyChange={setSerializedOnly}
                  productSearch={productSearch}
                  selectedProductCode={selectedProductCode}
                  serializedOnly={serializedOnly}
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Adjustment direction</span>
                    <select
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) =>
                        setMovementType(
                          event.target.value as "ADJUSTMENT_POSITIVE" | "ADJUSTMENT_NEGATIVE"
                        )
                      }
                      value={movementType}
                    >
                      <option value="ADJUSTMENT_POSITIVE">Positive adjustment</option>
                      <option value="ADJUSTMENT_NEGATIVE">Negative adjustment</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Quantity</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      disabled={selectedProduct?.isSerialized}
                      min="0.001"
                      onChange={(event) => setQuantity(event.target.value)}
                      placeholder="1.000"
                      readOnly={selectedProduct?.isSerialized}
                      step="0.001"
                      type="number"
                      value={
                        selectedProduct?.isSerialized ? String(taskSelectedSerialNumbers.length) : quantity
                      }
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Operator name</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setOperatorName(event.target.value)}
                      placeholder="Flash ERP operator"
                      value={operatorName}
                    />
                  </label>
                </div>
                {selectedProduct ? (
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                    <p className="font-semibold text-stone-900">Current canonical posture</p>
                    <p className="mt-1">
                      {selectedProduct.productName} is currently showing{" "}
                      {quantityFormatter.format(selectedProduct.onHandQuantity)} units on hand in{" "}
                      {detail.location.name}. This task will request{" "}
                      {quantityFormatter.format(
                        Number.isFinite(effectiveAdjustmentQuantity) ? effectiveAdjustmentQuantity : 0
                      )}{" "}
                      unit(s).
                    </p>
                    <p className="mt-2 text-xs text-stone-500">
                      {selectedProductHierarchy || "No department/category assigned yet"}
                      {selectedProduct.isSerialized ? " • Serialized control item" : " • Standard item"}
                    </p>
                  </div>
                ) : null}
                {selectedProduct?.isSerialized ? (
                  <SerializedTaskSerialPanel
                    description="Paste or scan the exact serials the store should adjust. Flash ERP will derive the adjustment quantity from this list and the branch will validate each serial locally before applying the task."
                    onSerialDraftChange={setTaskSerialDraft}
                    serialDraft={taskSerialDraft}
                    serialNumbers={taskSelectedSerialNumbers}
                    title="Serialized adjustment control"
                  />
                ) : null}
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Operator note</span>
                  <textarea
                    className="min-h-28 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Describe why the branch should apply this stock adjustment."
                    value={note}
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    disabled={adjustmentState.status === "submitting"}
                    onClick={() => setIsAdjustmentOpen(false)}
                    type="button"
                  >
                    Close
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
                    disabled={
                      adjustmentState.status === "submitting" ||
                      !selectedProductCode ||
                      !selectedProduct ||
                      filteredBalanceRows.length === 0 ||
                      effectiveAdjustmentQuantity <= 0
                    }
                    onClick={() => void handleRequestAdjustment()}
                    type="button"
                  >
                    {adjustmentState.status === "submitting"
                      ? "Queueing task..."
                      : "Queue stock adjustment"}
                  </button>
                </div>
                {adjustmentState.message ? (
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                      adjustmentState.status === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {adjustmentState.message}
                  </div>
                ) : null}
              </div>
            </ActionDialog>
          ) : null}
          {detail.location.primaryNodeCode ? (
            <div className="glass-panel flex min-h-[12.5rem] flex-col justify-between rounded-[1.8rem] border border-amber-200/70 bg-[linear-gradient(135deg,rgba(255,251,235,0.96),rgba(254,243,199,0.82))] p-5">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
                  Local Stock Counts
                </p>
                <div className="space-y-2 text-sm leading-6 text-amber-950">
                  <p className="font-semibold">
                    Flash ERP now starts physical counts on {detail.location.primaryNodeCode}, not
                    from enterprise.
                  </p>
                  <p>
                    The shop desktop saves the draft, submits the count session upstream for
                    visibility, then commits the resulting quantity and serial posture locally
                    before syncing the variance back to headquarters.
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-amber-900/90">
                Use the <span className="font-semibold">Counts</span> tab below to review submitted
                and committed branch sessions for this location.
              </p>
            </div>
          ) : null}
          {detail.location.primaryNodeCode &&
          detail.balanceRows.length > 0 &&
          detail.transferTargets.length > 0 ? (
            <ActionDialog
              description="Issue an inter-store transfer so the source shop can dispatch locally and the destination shop can receive locally, with both execution steps syncing back to enterprise."
              onOpenChange={handleTransferOpenChange}
              open={isTransferOpen}
              title="Create inter-store transfer"
              triggerClassName="border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-400 hover:text-emerald-950"
              triggerLabel="Create transfer"
              widthClassName="max-w-2xl"
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
                  Flash ERP will publish this instruction downstream to the source and destination
                  shop desktops. The source shop will issue the stock locally, then the destination
                  shop will receive it locally when the physical goods arrive.
                </div>
                <InventoryTaskProductPicker
                  availableCategories={detail.availableCategories}
                  availableDepartments={detail.availableDepartments}
                  categoryCode={productCategoryCode}
                  departmentCode={productDepartmentCode}
                  filteredProducts={filteredBalanceRows}
                  onCategoryCodeChange={setProductCategoryCode}
                  onDepartmentCodeChange={setProductDepartmentCode}
                  onProductSearchChange={setProductSearch}
                  onSelectedProductCodeChange={setSelectedProductCode}
                  onSerializedOnlyChange={setSerializedOnly}
                  productSearch={productSearch}
                  selectedProductCode={selectedProductCode}
                  serializedOnly={serializedOnly}
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Destination shop</span>
                    <select
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setSelectedTransferTargetCode(event.target.value)}
                      value={selectedTransferTargetCode}
                    >
                      {detail.transferTargets.map((location) => (
                        <option key={location.code} value={location.code}>
                          {location.storeName ? `${location.storeName} • ` : ""}
                          {location.name} ({location.code})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Quantity</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      min={selectedProduct?.isSerialized ? "1" : "0.001"}
                      onChange={(event) => setTransferQuantity(event.target.value)}
                      placeholder="1.000"
                      step={selectedProduct?.isSerialized ? "1" : "0.001"}
                      type="number"
                      value={transferQuantity}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Operator name</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setTransferOperatorName(event.target.value)}
                      placeholder="Flash ERP operator"
                      value={transferOperatorName}
                    />
                  </label>
                </div>
                {selectedProduct && selectedTransferTarget ? (
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                    <p className="font-semibold text-stone-900">Transfer posture</p>
                    <p className="mt-1">
                      Flash ERP will instruct the source shop to dispatch{" "}
                      {quantityFormatter.format(
                        Number.isFinite(effectiveTransferQuantity) ? effectiveTransferQuantity : 0
                      )}{" "}
                      units of {selectedProduct.productName} from {detail.location.name} to{" "}
                      {selectedTransferTarget.name}
                      {selectedTransferTarget.storeName
                        ? ` in ${selectedTransferTarget.storeName}`
                        : ""}. The source node will sync the issue first, then the destination node
                      will sync the receipt when goods are physically received.
                    </p>
                    <p className="mt-2 text-xs text-stone-500">
                      {selectedProductHierarchy || "No department/category assigned yet"}
                      {selectedProduct.isSerialized
                        ? " • Serialized control item, with actual serial selection handled at the shops"
                        : " • Standard item"}
                    </p>
                  </div>
                ) : null}
                <label className="space-y-2 text-sm text-stone-700">
                  <span className="block font-semibold text-stone-900">Operator note</span>
                  <textarea
                    className="min-h-28 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                    onChange={(event) => setTransferNote(event.target.value)}
                    placeholder="Describe why enterprise is issuing this inter-store transfer."
                    value={transferNote}
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    disabled={transferState.status === "submitting"}
                    onClick={() => setIsTransferOpen(false)}
                    type="button"
                  >
                    Close
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#059669,#047857)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(4,120,87,0.22)] transition hover:brightness-[1.03]"
                    disabled={
                      transferState.status === "submitting" ||
                      !selectedProductCode ||
                      !selectedProduct ||
                      !selectedTransferTargetCode ||
                      filteredBalanceRows.length === 0 ||
                      effectiveTransferQuantity <= 0
                    }
                    onClick={() => void handleRequestTransfer()}
                    type="button"
                  >
                    {transferState.status === "submitting" ? "Creating transfer..." : "Create transfer"}
                  </button>
                </div>
                {transferState.message ? (
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                      transferState.status === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {transferState.message}
                  </div>
                ) : null}
              </div>
            </ActionDialog>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-700">
            Last refresh {new Date(detail.refreshedAt).toLocaleString()}
          </div>
          <StatusBadge value={detail.location.status} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          hint="Tracked product positions currently visible in this canonical inventory location."
          icon={Package}
          label="Products tracked"
          value={numberFormatter.format(detail.metrics.productsTracked)}
        />
        <MetricCard
          hint="Net on-hand units currently sitting in this location."
          icon={Boxes}
          label="On hand"
          value={quantityFormatter.format(detail.metrics.onHandQuantity)}
        />
        <MetricCard
          hint="Canonical ledger entries that have posted into this location."
          icon={Activity}
          label="Ledger entries"
          value={numberFormatter.format(detail.metrics.ledgerEntries)}
        />
        <MetricCard
          hint="Product balances below zero that need operator review."
          icon={Store}
          label="Negative positions"
          value={numberFormatter.format(detail.metrics.negativePositions)}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <article className="glass-panel rounded-[1.35rem] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            Location context
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Store
              </p>
              <p className="mt-2 text-sm font-semibold text-stone-900">
                {detail.location.storeName ?? "Unassigned"}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {detail.location.storeCode ?? "No store code"}
                {detail.location.primaryNodeCode
                  ? ` • ${detail.location.primaryNodeCode}`
                  : ""}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Warehouse
              </p>
              <p className="mt-2 text-sm font-semibold text-stone-900">
                {detail.location.warehouseName ?? "Unassigned"}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {detail.location.warehouseCode ?? "No warehouse code"}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Type
              </p>
              <p className="mt-2 text-sm font-semibold text-stone-900">
                {detail.location.locationType.replace(/_/g, " ")}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Defaults
              </p>
              <p className="mt-2 text-sm font-semibold text-stone-900">{detail.location.defaults}</p>
              <p className="mt-1 text-xs text-stone-500">
                Updated {new Date(detail.location.updatedAt).toLocaleString()}
              </p>
            </div>
          </div>
        </article>

        <article className="glass-panel rounded-[1.35rem] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            Location posture
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
      </section>

      <WorkspaceTabs
        ariaLabel="Inventory location views"
        defaultValue="stock"
        summaries={{
          stock:
            "Review every tracked product balance in this location and jump into the catalog or operations workspace when needed.",
          purchasing:
            "Create destination purchase orders for this location, commit them to the assigned execution node, and track receipt progress coming back from the store desktop.",
          counts:
            "Review shop-led physical count sessions for this location, including what was submitted locally and what has already committed back into the canonical ledger.",
          serials:
            "Trace serialized activity touching this location from posted transaction snapshots and enterprise-issued stock-control tasks.",
          movements:
            "Inspect the latest stock movements posting into this location and follow any suspicious reference straight into movement detail.",
          priorities:
            "Keep operator attention focused on the highest-signal recovery and reconciliation tasks for this location."
        }}
        tabs={[
          { value: "stock", label: "Stock", badge: "Live", badgeTone: "success" },
          {
            value: "purchasing",
            label: "Purchasing",
            badge: detail.purchaseOrderRows.length > 0 ? String(detail.purchaseOrderRows.length) : null,
            badgeTone: "warning"
          },
          {
            value: "counts",
            label: "Counts",
            badge:
              detail.stockCountSessionRows.length > 0
                ? String(detail.stockCountSessionRows.length)
                : null,
            badgeTone: "warning"
          },
          {
            value: "serials",
            label: "Serials",
            badge: detail.serialTraceRows.length > 0 ? String(detail.serialTraceRows.length) : null,
            badgeTone: "warning"
          },
          { value: "movements", label: "Movements" },
          { value: "priorities", label: "Priorities" }
        ]}
      >
        <WorkspaceTabsContent value="stock">
          <SharedDataGrid
            columns={balanceColumns}
            data={detail.balanceRows}
            emptyLabel="No product balances are available for this location yet."
            exportFileName={`flash-erp-location-${detail.location.code.toLowerCase()}-balances`}
            getRowHref={(row) => `/catalog/products/${encodeURIComponent(row.productCode)}`}
            searchPlaceholder="Search balances by product code, SKU, name, or status"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="purchasing">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Destination purchase orders
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Commit a purchase order here, let the assigned desktop node receive against it
                offline, then watch Flash ERP roll the GRN and receipt progress back into this same
                location record.
              </p>
              <div className="mt-4 space-y-4">
                {detail.purchaseOrderRows.length > 0 ? (
                  detail.purchaseOrderRows.map((purchaseOrder) => (
                    <div
                      className="rounded-[1.35rem] border border-stone-200 bg-white/90 px-4 py-4"
                      key={purchaseOrder.purchaseOrderId}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-stone-900">
                            {purchaseOrder.purchaseOrderNo}
                          </p>
                          <p className="text-xs text-stone-500">
                            {purchaseOrder.supplierName
                              ? `${purchaseOrder.supplierName}${purchaseOrder.supplierNo ? ` • ${purchaseOrder.supplierNo}` : ""}`
                              : "No supplier linked"}
                            {purchaseOrder.externalReference
                              ? ` • Ref ${purchaseOrder.externalReference}`
                              : ""}
                          </p>
                          <p className="text-xs text-stone-500">
                            Ordered {quantityFormatter.format(purchaseOrder.orderedQuantity)} •
                            Received {quantityFormatter.format(purchaseOrder.receivedQuantity)} •
                            Exceptions {quantityFormatter.format(purchaseOrder.exceptionQuantity)} •
                            Outstanding {quantityFormatter.format(purchaseOrder.outstandingQuantity)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge value={purchaseOrder.status.toUpperCase().replace(/ /g, "_")} />
                          {purchaseOrder.status === "Draft" ? (
                            <button
                              className="inline-flex items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 transition hover:border-amber-400 hover:text-amber-950"
                              onClick={() => void handleCommitPurchaseOrder(purchaseOrder.purchaseOrderId)}
                              type="button"
                            >
                              Commit
                            </button>
                          ) : null}
                          {purchaseOrder.closedAt === null &&
                          purchaseOrder.status !== "Draft" &&
                          purchaseOrder.status !== "Closed" &&
                          purchaseOrder.status !== "Cancelled" &&
                          purchaseOrder.outstandingQuantity <= 0.0001 ? (
                            <button
                              className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                              onClick={() => handleOpenPurchaseOrderCloseDialog(purchaseOrder)}
                              type="button"
                            >
                              Close
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {purchaseOrder.note ? (
                        <p className="mt-3 text-sm leading-6 text-stone-600">{purchaseOrder.note}</p>
                      ) : null}
                      {purchaseOrder.closureReasonLabel || purchaseOrder.closureNote ? (
                        <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700">
                          <p className="font-semibold text-stone-900">
                            Closure posture
                            {purchaseOrder.closureReasonLabel
                              ? ` • ${purchaseOrder.closureReasonLabel}`
                              : ""}
                          </p>
                          {purchaseOrder.closureNote ? (
                            <p className="mt-1">{purchaseOrder.closureNote}</p>
                          ) : null}
                          {purchaseOrder.closureOperatorName ? (
                            <p className="mt-1 text-xs text-stone-500">
                              Closure operator {purchaseOrder.closureOperatorName}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {purchaseOrder.lines.map((line) => (
                          <div
                            className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3"
                            key={line.purchaseOrderLineId}
                          >
                            <p className="text-sm font-semibold text-stone-900">
                              {line.productName}
                            </p>
                            <p className="mt-1 text-xs text-stone-500">
                              {line.productCode}
                              {formatHierarchyPath(line) ? ` • ${formatHierarchyPath(line)}` : ""}
                              {line.isSerialized ? " • Serialized" : ""}
                            </p>
                            <p className="mt-2 text-xs text-stone-500">
                              Ordered {quantityFormatter.format(line.orderedQuantity)} • Received{" "}
                              {quantityFormatter.format(line.receivedQuantity)} • Exceptions{" "}
                              {quantityFormatter.format(line.exceptionQuantity)} • Outstanding{" "}
                              {quantityFormatter.format(line.outstandingQuantity)}
                            </p>
                            {line.unitCost !== null ? (
                              <p className="mt-1 text-xs text-stone-500">
                                Unit cost {currencyFormatter.format(line.unitCost)}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-xs text-stone-500">
                        Committed {purchaseOrder.committedAtLabel}
                        {purchaseOrder.closedAt ? ` • Closed ${purchaseOrder.closedAtLabel}` : ""}
                        {purchaseOrder.operatorName ? ` • Operator ${purchaseOrder.operatorName}` : ""}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-600">
                    No purchase orders are attached to this location yet.
                  </div>
                )}
              </div>
            </article>

            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Purchasing posture
              </p>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
                  Flash ERP now treats the purchase order as the enterprise-owned instruction and
                  the goods receipt as the store-owned execution fact.
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
                  Commiting a purchase order queues a downstream document for the destination
                  desktop node instead of posting stock immediately at HQ.
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
                  When the node receives the order locally, Flash ERP posts stock there first,
                  then syncs the GRN back so enterprise can update the canonical ledger, serials,
                  and PO progress.
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
                  Receipt shortages and rejections now travel back as first-class supplier claims,
                  with credit-note tracking kept at enterprise while the branch remains the source
                  of the physical receiving fact.
                </div>
                <div className="pt-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Recent goods receipts
                  </p>
                  <div className="mt-3 space-y-3">
                    {detail.goodsReceiptRows.length > 0 ? (
                      detail.goodsReceiptRows.map((receipt) => (
                        <div
                          className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-4"
                          key={receipt.goodsReceiptId}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-stone-900">
                                {receipt.goodsReceiptNo}
                              </p>
                              <p className="text-xs text-stone-500">
                                {receipt.purchaseOrderNo
                                  ? `Against ${receipt.purchaseOrderNo}`
                                  : "Not linked to a purchase order"}
                                {receipt.externalReference
                                  ? ` • Ref ${receipt.externalReference}`
                                  : ""}
                              </p>
                              <p className="text-xs text-stone-500">
                                Quantity {quantityFormatter.format(receipt.totalQuantity)} across{" "}
                                {numberFormatter.format(receipt.lineCount)} line
                                {receipt.lineCount === 1 ? "" : "s"}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                                {receipt.sourceNodeCode ? "Node-posted" : "Enterprise-posted"}
                              </span>
                              {receipt.sourceNodeCode ? (
                                <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                  {receipt.sourceNodeCode}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-stone-500">
                            {receipt.supplierName ? (
                              <span>
                                Supplier {receipt.supplierName}
                                {receipt.supplierNo ? ` • ${receipt.supplierNo}` : ""}
                              </span>
                            ) : null}
                            <span>Received {receipt.receivedAtLabel}</span>
                            <span>Posted {receipt.postedAtLabel}</span>
                            <span>Operator {receipt.operatorName}</span>
                          </div>
                          {receipt.note ? (
                            <p className="mt-3 text-sm leading-6 text-stone-600">{receipt.note}</p>
                          ) : null}
                          <div className="mt-3 space-y-2">
                            {receipt.lines.map((line) => (
                              <div
                                className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3"
                                key={line.goodsReceiptLineId}
                              >
                                <p className="text-sm font-semibold text-stone-900">
                                  {line.productName}
                                </p>
                                <p className="mt-1 text-xs text-stone-500">
                                  Line {line.lineNo} • {line.productCode} • Quantity{" "}
                                  {quantityFormatter.format(line.quantity)}
                                  {line.unitCost !== null
                                    ? ` • Unit cost ${currencyFormatter.format(line.unitCost)}`
                                    : ""}
                                </p>
                                {line.serialNumbers.length > 0 ? (
                                  <div className="mt-2">
                                    <SerialChipList serialNumbers={line.serialNumbers} />
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-600">
                        No goods receipts have posted back into this location yet.
                      </div>
                    )}
                  </div>
                </div>
                <div className="pt-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Recent supplier claims
                  </p>
                  <div className="mt-3 space-y-3">
                    {detail.supplierClaimRows.length > 0 ? (
                      detail.supplierClaimRows.map((supplierClaim) => (
                        <div
                          className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-4"
                          key={supplierClaim.supplierClaimId}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-stone-900">
                                {supplierClaim.claimNo}
                              </p>
                              <p className="text-xs text-stone-500">
                                {supplierClaim.goodsReceiptNo
                                  ? `Against ${supplierClaim.goodsReceiptNo}`
                                  : "Not linked to a goods receipt"}
                                {supplierClaim.purchaseOrderNo
                                  ? ` • PO ${supplierClaim.purchaseOrderNo}`
                                  : ""}
                                {supplierClaim.externalReference
                                  ? ` • Ref ${supplierClaim.externalReference}`
                                  : ""}
                              </p>
                              <p className="text-xs text-stone-500">
                                Quantity {quantityFormatter.format(supplierClaim.totalQuantity)} across{" "}
                                {numberFormatter.format(supplierClaim.lineCount)} line
                                {supplierClaim.lineCount === 1 ? "" : "s"}
                              </p>
                              <p className="text-xs text-stone-500">
                                Claimed {currencyFormatter.format(supplierClaim.claimAmount)} •
                                Credited{" "}
                                {currencyFormatter.format(supplierClaim.creditNoteAmount ?? 0)} •
                                Remaining{" "}
                                {currencyFormatter.format(supplierClaim.remainingAmount)}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                {supplierClaim.statusLabel}
                              </span>
                              <button
                                className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                                onClick={() => handleOpenSupplierClaimDialog(supplierClaim)}
                                type="button"
                              >
                                Update
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-stone-500">
                            <span>
                              Supplier {supplierClaim.supplierName}
                              {supplierClaim.supplierNo ? ` • ${supplierClaim.supplierNo}` : ""}
                            </span>
                            <span>Opened {supplierClaim.createdAtLabel}</span>
                            <span>Operator {supplierClaim.operatorName}</span>
                            {supplierClaim.supplierCaseReference ? (
                              <span>Case {supplierClaim.supplierCaseReference}</span>
                            ) : null}
                            {supplierClaim.creditRequestedAt ? (
                              <span>
                                Credit requested {supplierClaim.creditRequestedAtLabel}
                                {supplierClaim.creditRequestedBy
                                  ? ` • ${supplierClaim.creditRequestedBy}`
                                  : ""}
                              </span>
                            ) : null}
                            {supplierClaim.creditNoteReference ? (
                              <span>Credit note {supplierClaim.creditNoteReference}</span>
                            ) : null}
                            {supplierClaim.creditNoteAmount !== null ? (
                              <span>
                                Credit amount {currencyFormatter.format(supplierClaim.creditNoteAmount)}
                              </span>
                            ) : null}
                            {supplierClaim.creditReceivedAt ? (
                              <span>Credit received {supplierClaim.creditReceivedAtLabel}</span>
                            ) : null}
                            {supplierClaim.resolvedAt ? (
                              <span>Resolved {supplierClaim.resolvedAtLabel}</span>
                            ) : null}
                          </div>
                          {supplierClaim.note ? (
                            <p className="mt-3 text-sm leading-6 text-stone-600">
                              {supplierClaim.note}
                            </p>
                          ) : null}
                          <div className="mt-3 space-y-2">
                            {supplierClaim.lines.map((line) => (
                              <div
                                className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3"
                                key={line.supplierClaimLineId}
                              >
                                <p className="text-sm font-semibold text-stone-900">
                                  {line.productName}
                                </p>
                                <p className="mt-1 text-xs text-stone-500">
                                  Line {line.lineNo} • {line.productCode} • Quantity{" "}
                                  {quantityFormatter.format(line.quantity)} • {line.reasonLabel}
                                  {line.unitCost !== null
                                    ? ` • Unit cost ${currencyFormatter.format(line.unitCost)}`
                                    : ""}
                                </p>
                                {line.note ? (
                                  <p className="mt-2 text-sm leading-6 text-stone-600">{line.note}</p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-600">
                        No supplier claims have been raised from receipt exceptions at this location yet.
                      </div>
                    )}
                  </div>
                </div>
                <div className="pt-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Recent supplier returns
                  </p>
                  <div className="mt-3 space-y-3">
                    {detail.supplierReturnRows.length > 0 ? (
                      detail.supplierReturnRows.map((supplierReturn) => (
                        <div
                          className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-4"
                          key={supplierReturn.supplierReturnId}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-stone-900">
                                {supplierReturn.supplierReturnNo}
                              </p>
                              <p className="text-xs text-stone-500">
                                {supplierReturn.goodsReceiptNo
                                  ? `Against ${supplierReturn.goodsReceiptNo}`
                                  : "Not linked to a goods receipt"}
                                {supplierReturn.purchaseOrderNo
                                  ? ` • PO ${supplierReturn.purchaseOrderNo}`
                                  : ""}
                                {supplierReturn.externalReference
                                  ? ` • Ref ${supplierReturn.externalReference}`
                                  : ""}
                              </p>
                              <p className="text-xs text-stone-500">
                                Quantity {quantityFormatter.format(supplierReturn.totalQuantity)} across{" "}
                                {numberFormatter.format(supplierReturn.lineCount)} line
                                {supplierReturn.lineCount === 1 ? "" : "s"}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge value={supplierReturn.status} />
                              <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">
                                {supplierReturn.reasonLabel}
                              </span>
                              {supplierReturn.sourceNodeCode ? (
                                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                  {supplierReturn.sourceNodeCode}
                                </span>
                              ) : null}
                              {supplierReturn.status === "POSTED" ? (
                                <button
                                  className="inline-flex items-center justify-center rounded-full border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-400 hover:text-rose-800"
                                  onClick={() => handleOpenSupplierReturnDialog(supplierReturn)}
                                  type="button"
                                >
                                  Cancel return
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-stone-500">
                            <span>
                              Supplier {supplierReturn.supplierName}
                              {supplierReturn.supplierNo ? ` • ${supplierReturn.supplierNo}` : ""}
                            </span>
                            <span>Returned {supplierReturn.returnedAtLabel}</span>
                            <span>Posted {supplierReturn.postedAtLabel}</span>
                            <span>Operator {supplierReturn.operatorName}</span>
                            {supplierReturn.cancelledAt ? (
                              <span>
                                Cancelled {supplierReturn.cancelledAtLabel}
                                {supplierReturn.cancellationOperatorName
                                  ? ` • ${supplierReturn.cancellationOperatorName}`
                                  : ""}
                              </span>
                            ) : null}
                            {supplierReturn.cancellationAcknowledgedAt ? (
                              <span>
                                Store confirmed {supplierReturn.cancellationAcknowledgedAtLabel}
                                {supplierReturn.cancellationAcknowledgedBy
                                  ? ` • ${supplierReturn.cancellationAcknowledgedBy}`
                                  : supplierReturn.cancellationAcknowledgedByNodeCode
                                    ? ` • ${supplierReturn.cancellationAcknowledgedByNodeCode}`
                                    : ""}
                              </span>
                            ) : supplierReturn.status === "CANCELLED" ? (
                              <span>
                                Waiting for branch confirmation that rehydrated stock is back on
                                hand.
                              </span>
                            ) : null}
                          </div>
                          {supplierReturn.note ? (
                            <p className="mt-3 text-sm leading-6 text-stone-600">
                              {supplierReturn.note}
                            </p>
                          ) : null}
                          {supplierReturn.cancellationNote ? (
                            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
                              {supplierReturn.cancellationNote}
                            </div>
                          ) : null}
                          {supplierReturn.cancellationAcknowledgementNote ? (
                            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
                              <p className="font-semibold">Branch restoration confirmation</p>
                              <p className="mt-1">
                                {supplierReturn.cancellationAcknowledgementNote}
                              </p>
                            </div>
                          ) : null}
                          <div className="mt-3 space-y-2">
                            {supplierReturn.lines.map((line) => (
                              <div
                                className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3"
                                key={line.supplierReturnLineId}
                              >
                                <p className="text-sm font-semibold text-stone-900">
                                  {line.productName}
                                </p>
                                <p className="mt-1 text-xs text-stone-500">
                                  Line {line.lineNo} • {line.productCode} • Quantity{" "}
                                  {quantityFormatter.format(line.quantity)}
                                  {line.unitCost !== null
                                    ? ` • Unit cost ${currencyFormatter.format(line.unitCost)}`
                                    : ""}
                                </p>
                                {line.serialNumbers.length > 0 ? (
                                  <div className="mt-2">
                                    <SerialChipList serialNumbers={line.serialNumbers} />
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-600">
                        No supplier returns have been posted from this location yet.
                      </div>
                    )}
                  </div>
                </div>
                {purchaseOrderState.message ? (
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                      purchaseOrderState.status === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {purchaseOrderState.message}
                  </div>
                ) : null}
                {supplierClaimState.message ? (
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                      supplierClaimState.status === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {supplierClaimState.message}
                  </div>
                ) : null}
                {supplierReturnState.message ? (
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                      supplierReturnState.status === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {supplierReturnState.message}
                  </div>
                ) : null}
              </div>
            </article>
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="counts">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Shop-led stock count sessions
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Flash ERP now expects the branch to start physical counts locally, submit the count
                session upstream for visibility, then commit the count at the shop when the physical
                posture is ready to post into stock.
              </p>
              <div className="mt-4 space-y-4">
                {detail.stockCountSessionRows.length > 0 ? (
                  detail.stockCountSessionRows.map((session) => (
                    <div
                      className="rounded-[1.35rem] border border-stone-200 bg-white/90 px-4 py-4"
                      key={session.sessionId}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-stone-900">{session.sessionNo}</p>
                          <p className="text-xs text-stone-500">
                            {session.productName} • {session.productCode}
                            {formatHierarchyPath(session)
                              ? ` • ${formatHierarchyPath(session)}`
                              : ""}
                            {session.isSerialized ? " • Serialized" : ""}
                          </p>
                          <p className="text-xs text-stone-500">
                            Previous {quantityFormatter.format(session.previousQuantity)} • Counted{" "}
                            {quantityFormatter.format(session.countedQuantity)} • Variance{" "}
                            {quantityFormatter.format(session.varianceQuantity)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge
                            value={session.status.toUpperCase().replace(/ /g, "_")}
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-stone-500">
                        <span>Submitted {session.submittedAtLabel}</span>
                        {session.submittedByNodeCode ? (
                          <span>Submitted by {session.submittedByNodeCode}</span>
                        ) : null}
                        {session.committedAt ? (
                          <span>Committed {session.committedAtLabel}</span>
                        ) : null}
                        {session.committedByNodeCode ? (
                          <span>Committed by {session.committedByNodeCode}</span>
                        ) : null}
                        <span>Operator {session.operatorName}</span>
                      </div>
                      {session.note ? (
                        <p className="mt-3 text-sm leading-6 text-stone-600">{session.note}</p>
                      ) : null}
                      {session.countedSerialNumbers.length > 0 ? (
                        <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                            Counted serials
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {session.countedSerialNumbers.map((serialNumber) => (
                              <span
                                className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700"
                                key={`${session.sessionId}:${serialNumber}`}
                              >
                                {serialNumber}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-600">
                    No shop-led stock count sessions have been submitted for this location yet.
                  </div>
                )}
              </div>
            </article>

            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Count posture
              </p>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
                  Flash ERP now treats physical stock count initiation as a shop-owned workflow.
                  Enterprise receives the submitted count session first, then the committed count
                  variance after the branch posts the result locally.
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
                  This protects offline execution: the branch can submit and commit counts without
                  waiting for a live round trip, while HQ still gets a canonical audit trail.
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
                  Serialized count sessions capture the exact counted serial list, so enterprise can
                  trace both the session itself and the eventual canonical serial posture update.
                </div>
              </div>
            </article>
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="serials">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Serialized watchlist
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                These are the products in this location that currently carry serialized control in
                the canonical stock posture.
              </p>
              <div className="mt-4">
                <SharedDataGrid
                  columns={balanceColumns}
                  data={serializedBalanceRows}
                  emptyLabel="No serialized products are currently visible in this location."
                  exportFileName={`flash-erp-location-${detail.location.code.toLowerCase()}-serialized-balances`}
                  getRowHref={(row) => `/catalog/products/${encodeURIComponent(row.productCode)}`}
                  initialPageSize={6}
                  pageSizeOptions={[6, 12, 24]}
                  searchPlaceholder="Search serialized balances by product, code, or hierarchy"
                />
              </div>
            </article>

            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Serial advisory
              </p>
              <div className="mt-4 space-y-3">
                {detail.serialPostureMessages.map((message) => (
                  <div
                    className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900"
                    key={message}
                  >
                    {message}
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="mt-4">
            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Live enterprise serial registry
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                This registry reflects the current canonical serial state for this location and is
                what Flash ERP now publishes down to store desktops as offline setup posture for
                serialized items.
              </p>
              <div className="mt-4">
                <SharedDataGrid
                  columns={serialRegistryColumns}
                  data={detail.serialRegistryRows}
                  emptyLabel="No live serial registry rows are available for this location yet."
                  exportFileName={`flash-erp-location-${detail.location.code.toLowerCase()}-serial-registry`}
                  initialPageSize={8}
                  pageSizeOptions={[8, 16, 24]}
                  searchPlaceholder="Search live serial registry by serial, product, status, or source"
                />
              </div>
            </article>
          </section>

          <section className="mt-4">
            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Recent serial trace history
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Flash ERP reconstructs this view from canonical location ledger references, synced
                POS line serial snapshots, and enterprise-issued store tasks that carried exact
                serial lists.
              </p>
              <div className="mt-4">
                <SharedDataGrid
                  columns={serialTraceColumns}
                  data={detail.serialTraceRows}
                  emptyLabel="No recent serial traces are available for this location yet."
                  exportFileName={`flash-erp-location-${detail.location.code.toLowerCase()}-serial-trace`}
                  getRowHref={(row) => row.href}
                  initialPageSize={8}
                  pageSizeOptions={[8, 16, 24]}
                  searchPlaceholder="Search serial history by serial, product, activity, or reference"
                />
              </div>
            </article>
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="movements">
          <SharedDataGrid
            columns={movementColumns}
            data={detail.movementRows}
            emptyLabel="No canonical movements have posted into this location yet."
            exportFileName={`flash-erp-location-${detail.location.code.toLowerCase()}-movements`}
            getRowHref={(row) => `/operations/inventory/${encodeURIComponent(row.entryId)}`}
            searchPlaceholder="Search location movements by product, movement type, or reference"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="priorities">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,1fr)]">
            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Immediate priorities
              </p>
              <div className="mt-4 space-y-3">
                {detail.priorities.map((message) => (
                  <div
                    className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-3 text-sm leading-6 text-stone-700"
                    key={message}
                  >
                    {message}
                  </div>
                ))}
              </div>
            </article>

            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Status
              </p>
              <p className="mt-4 text-sm leading-6 text-stone-600">{detail.statusMessage}</p>
              <p className="mt-3 text-xs text-stone-500">
                Updated {detail.location.updatedAtLabel} • Refreshed{" "}
                {new Date(detail.refreshedAt).toLocaleString()}
              </p>
            </article>
          </section>
        </WorkspaceTabsContent>
      </WorkspaceTabs>
    </EnterpriseShell>
  );
}
