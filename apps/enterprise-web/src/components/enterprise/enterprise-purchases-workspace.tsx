"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import { AlertTriangle, Bot, FileText, PackageCheck, Plus, Printer, Send, Truck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import { renderDocumentTemplateHtml } from "@/lib/templates/thermal-receipt-templates";
import type { EnterprisePurchasesWorkspaceData } from "@/server/repositories/enterprise-purchases.repository";

const numberFormatter = new Intl.NumberFormat("en-US");
const quantityFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3
});

type PurchaseOrderRow = EnterprisePurchasesWorkspaceData["purchaseOrderRows"][number];
type GoodsReceiptRow = EnterprisePurchasesWorkspaceData["goodsReceiptRows"][number];
type PredictivePurchaseRow = EnterprisePurchasesWorkspaceData["predictiveRows"][number];
type TemplateTokenValue =
  | string
  | number
  | null
  | undefined
  | {
      rawHtml: string;
    };

function MetricCard({
  icon: Icon,
  label,
  value,
  hint
}: {
  icon: typeof Truck;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article className="glass-panel rounded-[1.15rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">{label}</p>
          <p className="mt-2 text-[1.45rem] font-semibold text-stone-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-600">{hint}</p>
    </article>
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

function escapeHtml(value: string | null | undefined) {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPrintLogo(companyLogoUrl: string | null | undefined) {
  if (!companyLogoUrl?.trim()) {
    return "";
  }

  return `<img alt="Company logo" class="logo" onerror="this.remove()" src="${escapeHtml(companyLogoUrl)}" />`;
}

function rawHtml(value: string): TemplateTokenValue {
  return { rawHtml: value };
}

function formatPrintDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : new Date().toLocaleString();
}

function renderA4DocumentWindow(input: {
  title: string;
  actionLabel: string;
  templateHtml: string;
  tokens: Record<string, TemplateTokenValue>;
}) {
  const renderedDocument = renderDocumentTemplateHtml(input.templateHtml, input.tokens);

  return `
    <html>
      <head>
        <title>${escapeHtml(input.title)}</title>
        <style>
          @page { size: A4 portrait; margin: 14mm; }
          * { box-sizing: border-box; }
          body { margin: 0; background: #eef2f7; color: #17211b; font-family: Arial, sans-serif; }
          .toolbar { display: flex; justify-content: flex-end; gap: 8px; padding: 16px; }
          .toolbar button { border: 1px solid #ccd6ce; border-radius: 8px; background: white; cursor: pointer; font-weight: 700; padding: 10px 14px; }
          .sheet { width: 210mm; min-height: 297mm; margin: 0 auto; background: white; padding: 16mm; position: relative; }
          .content { padding-bottom: 34mm; }
          .logo { max-height: 58px; max-width: 150px; object-fit: contain; }
          .document-template-html table { width: 100%; border-collapse: collapse; }
          .document-template-html th,
          .document-template-html td { vertical-align: top; }
          .document-lines { margin-top: 18px; width: 100%; border-collapse: collapse; font-size: 12.5px; }
          .document-lines th,
          .document-lines td { border: 1px solid #ccd6ce; padding: 9px; text-align: left; }
          .document-lines th { background: #edf3ee; color: #334155; font-size: 11px; text-transform: uppercase; }
          .document-lines .num { text-align: right; }
          .document-line-serials { margin-top: 4px; color: #475569; font-size: 11px; }
          .signatures { bottom: 16mm; display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; left: 16mm; position: absolute; right: 16mm; font-size: 12px; }
          .signatures div { border-top: 1px solid #94a3b8; padding-top: 8px; color: #475569; }
          @media print {
            body { background: white; }
            .toolbar { display: none; }
            .sheet { width: auto; min-height: auto; margin: 0; padding: 0; }
            .content { min-height: calc(297mm - 24mm); padding-bottom: 30mm; }
            .signatures { bottom: 0; left: 0; right: 0; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar"><button onclick="window.print()">${escapeHtml(input.actionLabel)}</button></div>
        <div class="sheet">
          <div class="content">
            <div class="document-template-html">${renderedDocument}</div>
          </div>
          <div class="signatures">
            <div>Prepared by</div>
            <div>Approved by</div>
            <div>Supplier acknowledgement</div>
          </div>
        </div>
      </body>
    </html>`;
}

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
    row.original.locationName,
    row.original.externalReference ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const goodsReceiptFilter: FilterFn<GoodsReceiptRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.goodsReceiptNo,
    row.original.purchaseOrderNo ?? "",
    row.original.supplierNo ?? "",
    row.original.supplierName ?? "",
    row.original.storeCode ?? "",
    row.original.storeName ?? "",
    row.original.locationCode,
    row.original.locationName,
    row.original.externalReference ?? "",
    row.original.sourceNodeCode ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const predictivePurchaseFilter: FilterFn<PredictivePurchaseRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.storeCode,
    row.original.storeName,
    row.original.locationCode,
    row.original.locationName,
    row.original.productCode,
    row.original.productName,
    row.original.supplierNo ?? "",
    row.original.supplierName ?? "",
    row.original.severity,
    row.original.demandSignal,
    row.original.demandConfidenceLabel,
    row.original.reason
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

type PurchaseLineDraft = {
  id: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitCost: number | null;
};

function emptyStatus() {
  return { tone: "idle" as const, message: "" };
}

export function EnterprisePurchasesWorkspace({
  defaultView,
  dedicatedView = false,
  pageDescription,
  pageHeading,
  predictiveSeverityFilter = "all",
  workspace
}: {
  defaultView: "purchase-orders" | "goods-receipt" | "predictive-review";
  dedicatedView?: boolean;
  pageDescription?: string;
  pageHeading?: string;
  predictiveSeverityFilter?: "all" | "critical";
  workspace: EnterprisePurchasesWorkspaceData;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [activeCreateTab, setActiveCreateTab] = useState<"header" | "details">("header");
  const [editingPurchaseOrder, setEditingPurchaseOrder] = useState<PurchaseOrderRow | null>(null);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState<PurchaseOrderRow | null>(null);
  const [selectedGoodsReceipt, setSelectedGoodsReceipt] = useState<GoodsReceiptRow | null>(null);
  const [shopCode, setShopCode] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [supplierNo, setSupplierNo] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [note, setNote] = useState("");
  const [productCode, setProductCode] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [shippingAmount, setShippingAmount] = useState("0");
  const [freightAmount, setFreightAmount] = useState("0");
  const [otherChargesAmount, setOtherChargesAmount] = useState("0");
  const [taxAmount, setTaxAmount] = useState("0");
  const [lines, setLines] = useState<PurchaseLineDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [raisingPredictionId, setRaisingPredictionId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "idle" | "success" | "error"; message: string }>(
    emptyStatus()
  );
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: workspace.currencyCode
      }),
    [workspace.currencyCode]
  );
  const selectedProduct = workspace.productOptions.find((product) => product.productCode === productCode);
  const filteredProductOptions = useMemo(() => {
    const query = productSearch.trim().toLowerCase();

    if (!query) {
      return workspace.productOptions;
    }

    return workspace.productOptions.filter((product) =>
      [product.productCode, product.productName, product.sku]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query))
    );
  }, [productSearch, workspace.productOptions]);
  const receivingLocationOptions = useMemo(
    () =>
      shopCode
        ? workspace.locationOptions.filter((location) => location.storeCode === shopCode)
        : workspace.locationOptions,
    [shopCode, workspace.locationOptions]
  );
  const subtotalAmount = Number(
    lines.reduce((sum, line) => sum + line.quantity * (line.unitCost ?? 0), 0).toFixed(2)
  );
  const grandTotalAmount = Number(
    Math.max(
      0,
      subtotalAmount -
        Number(discountAmount || 0) +
        Number(shippingAmount || 0) +
        Number(freightAmount || 0) +
        Number(otherChargesAmount || 0) +
        Number(taxAmount || 0)
    ).toFixed(2)
  );
  const canSave = Boolean(locationCode && supplierNo && lines.length > 0 && !submitting);
  const predictiveReviewRows = useMemo(() => {
    const severityWeight: Record<PredictivePurchaseRow["severity"], number> = {
      critical: 0,
      missing_supplier: 1,
      warning: 2
    };

    return [...workspace.predictiveRows].sort((left, right) => {
      const severityDelta = severityWeight[left.severity] - severityWeight[right.severity];

      if (severityDelta !== 0) {
        return severityDelta;
      }

      return right.estimatedOrderValue - left.estimatedOrderValue;
    });
  }, [workspace.predictiveRows]);
  const criticalPredictiveRows = predictiveReviewRows.filter((row) => row.severity === "critical");
  const visiblePredictiveRows =
    predictiveSeverityFilter === "critical" ? criticalPredictiveRows : predictiveReviewRows;

  useEffect(() => {
    const openPo = searchParams.get("openPo");
    const openGrn = searchParams.get("openGrn");

    if (openPo) {
      const purchaseOrder = workspace.purchaseOrderRows.find(
        (row) => row.purchaseOrderNo === openPo || row.purchaseOrderId === openPo
      );

      if (purchaseOrder) {
        setSelectedPurchaseOrder(purchaseOrder);
      }
    }

    if (openGrn) {
      const goodsReceipt = workspace.goodsReceiptRows.find(
        (row) => row.goodsReceiptNo === openGrn || row.goodsReceiptId === openGrn
      );

      if (goodsReceipt) {
        setSelectedGoodsReceipt(goodsReceipt);
      }
    }
  }, [searchParams, workspace.goodsReceiptRows, workspace.purchaseOrderRows]);

  function resolveDefaultLocationForShop(nextShopCode: string) {
    const shop = workspace.shopOptions.find((option) => option.storeCode === nextShopCode);
    const shopLocations = nextShopCode
      ? workspace.locationOptions.filter((location) => location.storeCode === nextShopCode)
      : workspace.locationOptions;

    return shop?.defaultReceivingLocationCode ?? shopLocations[0]?.locationCode ?? "";
  }

  function prepareDraftDefaults() {
    setEditingPurchaseOrder(null);
    const defaultShopCode = workspace.shopOptions[0]?.storeCode ?? "";
    setShopCode(defaultShopCode);
    setLocationCode(resolveDefaultLocationForShop(defaultShopCode));
    setSupplierNo(workspace.supplierOptions[0]?.supplierNo ?? "");
    setExternalReference("");
    setNote("");
    setProductCode("");
    setProductSearch("");
    setQuantity("1");
    setUnitCost("");
    setDiscountAmount("0");
    setShippingAmount("0");
    setFreightAmount("0");
    setOtherChargesAmount("0");
    setTaxAmount("0");
    setLines([]);
    setStatus(emptyStatus());
    setActiveCreateTab("header");
  }

  function preparePurchaseOrderForEdit(row: PurchaseOrderRow) {
    setEditingPurchaseOrder(row);
    setShopCode(row.storeCode ?? "");
    setLocationCode(row.locationCode);
    setSupplierNo(row.supplierNo ?? "");
    setExternalReference(row.externalReference ?? "");
    setNote(row.note ?? "");
    setProductCode("");
    setProductSearch("");
    setQuantity("1");
    setUnitCost("");
    setDiscountAmount(String(row.discountAmount));
    setShippingAmount(String(row.shippingAmount));
    setFreightAmount(String(row.freightAmount));
    setOtherChargesAmount(String(row.otherChargesAmount));
    setTaxAmount(String(row.taxAmount));
    setLines(
      row.lines.map((line) => ({
        id: line.purchaseOrderLineId,
        productCode: line.productCode,
        productName: line.productName,
        quantity: line.orderedQuantity,
        unitCost: line.unitCost
      }))
    );
    setStatus(emptyStatus());
    setActiveCreateTab("header");
    setCreateDialogOpen(true);
  }

  function addLine() {
    const nextQuantity = Number(quantity);
    const nextUnitCost = unitCost.trim()
      ? Number(unitCost)
      : selectedProduct?.unitCost === null || selectedProduct?.unitCost === undefined
        ? null
        : selectedProduct.unitCost;

    if (!selectedProduct || !Number.isFinite(nextQuantity) || nextQuantity <= 0) {
      setStatus({ tone: "error", message: "Choose an item and enter a quantity greater than zero." });
      return;
    }

    if (nextUnitCost !== null && (!Number.isFinite(nextUnitCost) || nextUnitCost < 0)) {
      setStatus({ tone: "error", message: "Unit cost must be zero or greater." });
      return;
    }

    setLines((currentLines) => [
      ...currentLines.filter((line) => line.productCode !== selectedProduct.productCode),
      {
        id: `${selectedProduct.productCode}-${Date.now()}`,
        productCode: selectedProduct.productCode,
        productName: selectedProduct.productName,
        quantity: nextQuantity,
        unitCost: nextUnitCost
      }
    ]);
    setProductCode("");
    setProductSearch("");
    setQuantity("1");
    setUnitCost("");
    setStatus(emptyStatus());
  }

  function resetDraft() {
    setEditingPurchaseOrder(null);
    setShopCode("");
    setLocationCode("");
    setSupplierNo("");
    setExternalReference("");
    setNote("");
    setProductCode("");
    setProductSearch("");
    setQuantity("1");
    setUnitCost("");
    setDiscountAmount("0");
    setShippingAmount("0");
    setFreightAmount("0");
    setOtherChargesAmount("0");
    setTaxAmount("0");
    setLines([]);
    setStatus(emptyStatus());
    setActiveCreateTab("header");
  }

  async function savePurchaseOrder(autoCommit: boolean) {
    if (!canSave) {
      setStatus({ tone: "error", message: "Choose a receiving shop, supplier, and at least one item." });
      return;
    }

    setSubmitting(true);
    setStatus(emptyStatus());

    try {
      const requestBody = {
        locationCode,
        supplierNo,
        externalReference: externalReference.trim() || null,
        note: note.trim() || null,
        operatorName: "HQ purchasing",
        autoCommit: editingPurchaseOrder ? false : autoCommit,
        discountAmount: Number(discountAmount || 0),
        shippingAmount: Number(shippingAmount || 0),
        freightAmount: Number(freightAmount || 0),
        otherChargesAmount: Number(otherChargesAmount || 0),
        taxAmount: Number(taxAmount || 0),
        lines: lines.map((line) => ({
          productCode: line.productCode,
          quantity: line.quantity,
          unitCost: line.unitCost
        }))
      };
      const response = await fetch(
        editingPurchaseOrder
          ? `/api/inventory/purchase-orders/${encodeURIComponent(editingPurchaseOrder.purchaseOrderId)}`
          : `/api/inventory/locations/${encodeURIComponent(locationCode)}/purchase-orders`,
        {
          method: editingPurchaseOrder ? "PATCH" : "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(requestBody)
        }
      );
      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Flash ERP could not save the purchase order.");
      }

      if (editingPurchaseOrder && autoCommit) {
        const commitResponse = await fetch(
          `/api/inventory/purchase-orders/${encodeURIComponent(editingPurchaseOrder.purchaseOrderId)}/commit`,
          { method: "POST" }
        );
        const commitPayload = (await commitResponse.json()) as { message?: string; error?: string };

        if (!commitResponse.ok) {
          throw new Error(commitPayload.error ?? "Flash ERP saved the draft but could not push it.");
        }
      }

      resetDraft();
      setCreateDialogOpen(false);
      router.refresh();
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not save the purchase order."
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function commitPurchaseOrder(row: PurchaseOrderRow) {
    setSubmitting(true);
    setStatus(emptyStatus());

    try {
      const response = await fetch(
        `/api/inventory/purchase-orders/${encodeURIComponent(row.purchaseOrderId)}/commit`,
        { method: "POST" }
      );
      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Flash ERP could not push the purchase order.");
      }

      setSelectedPurchaseOrder(null);
      router.refresh();
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not push the purchase order."
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function raisePredictivePurchaseOrder(row: PredictivePurchaseRow) {
    if (!row.supplierNo) {
      setStatus({
        tone: "error",
        message: "Assign a primary active supplier to this item before raising a predictive PO."
      });
      return;
    }

    setRaisingPredictionId(row.predictionId);
    setStatus(emptyStatus());

    try {
      const response = await fetch("/api/purchases/predictive-purchase-orders", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          predictionId: row.predictionId,
          locationCode: row.locationCode,
          supplierNo: row.supplierNo,
          productCode: row.productCode,
          quantity: row.recommendedQuantity,
          unitCost: row.unitCost,
          note: row.reason
        })
      });
      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? payload.message ?? "Flash ERP could not raise the predictive purchase order.");
      }

      setStatus({
        tone: "success",
        message: payload.message ?? "Flash ERP raised the predictive purchase order for HQ review."
      });
      router.refresh();
    } catch (error) {
      setStatus({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not raise the predictive purchase order."
      });
    } finally {
      setRaisingPredictionId(null);
    }
  }

  function printPurchaseOrder(row: PurchaseOrderRow) {
    const itemTable = `
      <table class="document-lines">
        <thead>
          <tr><th>Code</th><th>Item</th><th>Qty ordered</th><th>Unit cost</th><th>Total</th></tr>
        </thead>
        <tbody>
          ${row.lines
            .map(
              (line) => `
                <tr>
                  <td>${escapeHtml(line.productCode)}</td>
                  <td>${escapeHtml(line.productName)}</td>
                  <td class="num">${quantityFormatter.format(line.orderedQuantity)}</td>
                  <td class="num">${line.unitCost === null ? "" : currencyFormatter.format(line.unitCost)}</td>
                  <td class="num">${currencyFormatter.format(line.lineTotal)}</td>
                </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
    const popup = window.open("", "_blank", "width=1120,height=900");

    if (!popup) {
      return;
    }

    popup.document.write(
      renderA4DocumentWindow({
        title: row.purchaseOrderNo,
        actionLabel: `Print ${workspace.documentTemplates.purchaseOrder.name}`,
        templateHtml: workspace.documentTemplates.purchaseOrder.templateHtml,
        tokens: {
          RETAIL_ORG_NAME: workspace.retailOrgName,
          COMPANY_LOGO_HTML: rawHtml(renderPrintLogo(workspace.companyLogoUrl)),
          STORE_NAME: row.storeName ?? row.locationName,
          STORE_CODE: row.storeCode,
          TERMINAL_CODE: "HQ",
          RECEIPT_TITLE: "Purchase Order",
          RECEIPT_NO: row.purchaseOrderNo,
          PURCHASE_ORDER_NO: row.purchaseOrderNo,
          RECEIPT_DATE_TIME: formatPrintDateTime(row.committedAt ?? row.updatedAt),
          STATUS: row.statusLabel,
          SUPPLIER_NO: row.supplierNo,
          SUPPLIER_NAME: row.supplierName ?? "Supplier not set",
          LOCATION_CODE: row.locationCode,
          LOCATION_NAME: row.locationName,
          OPERATOR: row.operatorName ?? "HQ purchasing",
          PAYMENT_REFERENCE: row.externalReference,
          TRANSACTION_REFERENCE: row.externalReference,
          ITEM_TABLE: rawHtml(itemTable),
          SUBTOTAL: currencyFormatter.format(row.subtotalAmount),
          DISCOUNT: currencyFormatter.format(row.discountAmount),
          SHIPPING: currencyFormatter.format(row.shippingAmount),
          FREIGHT: currencyFormatter.format(row.freightAmount),
          OTHER_CHARGES: currencyFormatter.format(row.otherChargesAmount),
          TAX: currencyFormatter.format(row.taxAmount),
          TOTAL: currencyFormatter.format(row.grandTotalAmount),
          NOTES: row.note,
          RECEIPT_HEADER: `Template: ${workspace.documentTemplates.purchaseOrder.name} (${workspace.documentTemplates.purchaseOrder.code})`,
          RECEIPT_FOOTER: "Generated from Flash ERP HQ purchase-order history."
        }
      })
    );
    popup.document.close();
    popup.focus();
    popup.print();
  }

  function printGoodsReceipt(row: GoodsReceiptRow) {
    const orderedQuantity = row.lines.reduce((sum, line) => sum + (line.orderedQuantity ?? 0), 0);
    const itemTable = `
      <table class="document-lines">
        <thead>
          <tr><th>Code</th><th>Item</th><th>Qty ordered</th><th>Qty received</th></tr>
        </thead>
        <tbody>
          ${row.lines
            .map((line) => {
              const serials = line.serialNumbers.length
                ? `<div class="document-line-serials">Serials: ${line.serialNumbers
                    .map((serialNumber) => escapeHtml(serialNumber))
                    .join(", ")}</div>`
                : "";

              return `
                <tr>
                  <td>${escapeHtml(line.productCode)}</td>
                  <td>${escapeHtml(line.productName)}${serials}</td>
                  <td class="num">${line.orderedQuantity === null ? "" : quantityFormatter.format(line.orderedQuantity)}</td>
                  <td class="num">${quantityFormatter.format(line.quantity)}</td>
                </tr>`;
            })
            .join("")}
        </tbody>
      </table>`;
    const popup = window.open("", "_blank", "width=1120,height=900");

    if (!popup) {
      return;
    }

    popup.document.write(
      renderA4DocumentWindow({
        title: row.goodsReceiptNo,
        actionLabel: `Print ${workspace.documentTemplates.goodsReceipt.name}`,
        templateHtml: workspace.documentTemplates.goodsReceipt.templateHtml,
        tokens: {
          RETAIL_ORG_NAME: workspace.retailOrgName,
          COMPANY_LOGO_HTML: rawHtml(renderPrintLogo(workspace.companyLogoUrl)),
          STORE_NAME: row.storeName ?? row.locationName,
          STORE_CODE: row.storeCode,
          TERMINAL_CODE: row.sourceNodeCode ?? "HQ",
          RECEIPT_TITLE: "Goods Receipt Note",
          RECEIPT_NO: row.goodsReceiptNo,
          PURCHASE_ORDER_NO: row.purchaseOrderNo ?? "Direct receipt",
          RECEIPT_DATE_TIME: formatPrintDateTime(row.receivedAt ?? row.postedAt),
          STATUS: "Posted",
          SUPPLIER_NO: row.supplierNo,
          SUPPLIER_NAME: row.supplierName ?? "Supplier not set",
          LOCATION_CODE: row.locationCode,
          LOCATION_NAME: row.locationName,
          OPERATOR: row.operatorName ?? "Store receiving",
          PAYMENT_REFERENCE: row.externalReference,
          TRANSACTION_REFERENCE: row.externalReference,
          ITEM_TABLE: rawHtml(itemTable),
          TOTAL_ORDERED_QTY: quantityFormatter.format(orderedQuantity),
          TOTAL_RECEIVED_QTY: quantityFormatter.format(row.totalQuantity),
          TOTAL: quantityFormatter.format(row.totalQuantity),
          NOTES: row.note,
          RECEIPT_HEADER: `Template: ${workspace.documentTemplates.goodsReceipt.name} (${workspace.documentTemplates.goodsReceipt.code})`,
          RECEIPT_FOOTER: "Generated from Flash ERP goods-receipt history."
        }
      })
    );
    popup.document.close();
    popup.focus();
    popup.print();
  }

  const purchaseOrderColumns = useMemo<ColumnDef<PurchaseOrderRow>[]>(
    () => [
      {
        accessorKey: "purchaseOrderNo",
        header: "PO",
        cell: ({ row }) => (
          <button
            className="min-w-0 text-left"
            onClick={() => setSelectedPurchaseOrder(row.original)}
            type="button"
          >
            <p className="truncate font-medium text-stone-900">{row.original.purchaseOrderNo}</p>
            <p className="truncate text-xs text-stone-500">{row.original.statusLabel}</p>
          </button>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "supplierName",
        header: "Supplier",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.supplierName ?? "Missing"}</p>
            <p className="truncate text-xs text-stone-500">{row.original.supplierNo ?? "Supplier required"}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "locationName",
        header: "Receiving",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.storeName ?? row.original.storeCode ?? "Unassigned"}
            </p>
            <p className="truncate text-xs text-stone-500">{row.original.locationName}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "orderedQuantity",
        header: "Ordered",
        cell: ({ row }) => quantityFormatter.format(row.original.orderedQuantity)
      },
      {
        accessorKey: "outstandingQuantity",
        header: "Outstanding",
        cell: ({ row }) => quantityFormatter.format(row.original.outstandingQuantity)
      },
      {
        accessorKey: "grandTotalAmount",
        header: "Total",
        cell: ({ row }) => currencyFormatter.format(row.original.grandTotalAmount)
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
          <div className="flex gap-2">
            {row.original.status === "DRAFT" ? (
              <>
                <button
                  className="rounded-lg border border-[var(--brand)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--brand)] disabled:border-stone-200 disabled:text-stone-400"
                  disabled={submitting || Boolean(row.original.committedAt)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    preparePurchaseOrderForEdit(row.original);
                  }}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:bg-stone-300"
                  disabled={submitting}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void commitPurchaseOrder(row.original);
                  }}
                  type="button"
                >
                  Push
                </button>
              </>
            ) : null}
            <button
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                printPurchaseOrder(row.original);
              }}
              type="button"
            >
              Print
            </button>
          </div>
        ),
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter, submitting]
  );

  const goodsReceiptColumns = useMemo<ColumnDef<GoodsReceiptRow>[]>(
    () => [
      {
        accessorKey: "goodsReceiptNo",
        header: "GRN",
        cell: ({ row }) => (
          <button
            className="min-w-0 text-left"
            onClick={() => setSelectedGoodsReceipt(row.original)}
            type="button"
          >
            <p className="truncate font-medium text-stone-900">{row.original.goodsReceiptNo}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.purchaseOrderNo ?? "Direct receipt"}
            </p>
          </button>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "supplierName",
        header: "Supplier",
        cell: ({ row }) => row.original.supplierName ?? "Not set"
      },
      {
        accessorKey: "locationName",
        header: "Shop",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.storeName ?? row.original.storeCode ?? "Unassigned"}
            </p>
            <p className="truncate text-xs text-stone-500">{row.original.locationName}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "totalQuantity",
        header: "Quantity",
        cell: ({ row }) => quantityFormatter.format(row.original.totalQuantity)
      },
      {
        accessorKey: "lineCount",
        header: "Lines",
        cell: ({ row }) => numberFormatter.format(row.original.lineCount)
      },
      {
        accessorKey: "postedAtLabel",
        header: "Posted",
        cell: ({ row }) => renderTimestamp(row.original.postedAt, row.original.postedAtLabel),
        meta: { disableTruncate: true }
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <button
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              printGoodsReceipt(row.original);
            }}
            type="button"
          >
            Print
          </button>
        )
      }
    ],
    [currencyFormatter]
  );

  const predictiveColumns = useMemo<ColumnDef<PredictivePurchaseRow>[]>(
    () => [
      {
        accessorKey: "severity",
        header: "Risk",
        cell: ({ row }) => (
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
              row.original.severity === "critical"
                ? "bg-rose-100 text-rose-700"
                : row.original.severity === "missing_supplier"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-sky-100 text-sky-700"
            }`}
          >
            {row.original.severity === "missing_supplier" ? "Supplier" : row.original.severity}
          </span>
        )
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
        accessorKey: "storeName",
        header: "Shop",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.storeName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.locationName}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "supplierName",
        header: "Supplier",
        cell: ({ row }) => row.original.supplierName ?? "Assign supplier"
      },
      {
        accessorKey: "onHandQuantity",
        header: "On hand",
        cell: ({ row }) => quantityFormatter.format(row.original.onHandQuantity)
      },
      {
        accessorKey: "averageDailyIssue",
        header: "30d avg",
        cell: ({ row }) => quantityFormatter.format(row.original.averageDailyIssue)
      },
      {
        accessorKey: "forecastDailyDemand",
        header: "Forecast/day",
        cell: ({ row }) => quantityFormatter.format(row.original.forecastDailyDemand)
      },
      {
        accessorKey: "demandConfidence",
        header: "Signal",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.demandConfidenceLabel}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.demandSignal} {row.original.demandTrendPercent.toFixed(1)}%
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "recommendedQuantity",
        header: "Suggested",
        cell: ({ row }) => quantityFormatter.format(row.original.recommendedQuantity)
      },
      {
        accessorKey: "estimatedOrderValue",
        header: "Value",
        cell: ({ row }) => currencyFormatter.format(row.original.estimatedOrderValue)
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <button
            className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:bg-stone-300"
            disabled={
              !row.original.supplierNo ||
              raisingPredictionId === row.original.predictionId ||
              submitting
            }
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void raisePredictivePurchaseOrder(row.original);
            }}
            type="button"
          >
            {raisingPredictionId === row.original.predictionId ? "Raising" : "Raise draft"}
          </button>
        ),
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter, raisingPredictionId, submitting]
  );

  return (
    <EnterpriseShell
      activeSection="purchases"
      description={
        pageDescription ??
        "Create supplier-backed purchase orders, push committed PO packets to shops, and review synced GRNs from store receiving."
      }
      eyebrow="Flash ERP enterprise"
      heading={pageHeading ?? "Purchases"}
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          hint="Committed or partially received purchase orders still open at shops."
          icon={Truck}
          label="Open POs"
          value={numberFormatter.format(workspace.metrics.openPurchaseOrders)}
        />
        <MetricCard
          hint="Draft purchase orders waiting for HQ review before they are pushed."
          icon={FileText}
          label="Drafts"
          value={numberFormatter.format(workspace.metrics.draftPurchaseOrders)}
        />
        <MetricCard
          hint="Goods receipt notes synced from store receiving workflows."
          icon={PackageCheck}
          label="GRNs"
          value={numberFormatter.format(workspace.metrics.goodsReceipts)}
        />
        <MetricCard
          hint="Current value of draft, committed, and partially received purchase orders."
          icon={Send}
          label="Open value"
          value={currencyFormatter.format(workspace.metrics.openOrderValue)}
        />
        <MetricCard
          hint="Predictive reorder lines waiting for HQ review before stocks run short."
          icon={Bot}
          label="Predictive POs"
          value={numberFormatter.format(workspace.metrics.predictiveRecommendations)}
        />
      </section>

      <WorkspaceTabs
        ariaLabel="Purchasing views"
        chromeClassName={dedicatedView ? "hidden" : undefined}
        className={dedicatedView ? "mt-0" : undefined}
        defaultValue={defaultView}
        summaries={{
          "purchase-orders":
            "Review PO history, create supplier-backed purchase orders, push drafts to shops, and print PO documents.",
          "goods-receipt":
            "Review goods receipt notes synced from shop receiving and print GRN documents.",
          "predictive-review":
            "Review reorder risk calculated from stock movements, safety stock, supplier lead time, and open PO cover."
        }}
        tabs={[
          {
            value: "purchase-orders",
            label: "Purchase orders",
            badge:
              workspace.metrics.draftPurchaseOrders > 0
                ? String(Math.min(workspace.metrics.draftPurchaseOrders, 99))
                : null,
            badgeTone: "warning"
          },
          {
            value: "goods-receipt",
            label: "Goods Receipt",
            badge:
              workspace.metrics.goodsReceipts > 0
                ? String(Math.min(workspace.metrics.goodsReceipts, 99))
                : null,
            badgeTone: "success"
          },
          {
            value: "predictive-review",
            label: "Predictive review",
            badge:
              workspace.metrics.predictiveRecommendations > 0
                ? String(Math.min(workspace.metrics.predictiveRecommendations, 99))
                : null,
            badgeTone: workspace.metrics.predictiveCritical > 0 ? "warning" : "default"
          }
        ]}
      >
        <WorkspaceTabsContent value="purchase-orders">
          <SharedDataGrid
            columns={purchaseOrderColumns}
            data={workspace.purchaseOrderRows}
            emptyLabel="No purchase orders are available yet."
            exportFileName="flash-erp-purchase-orders"
            globalFilterFn={purchaseOrderFilter}
            initialPageSize={25}
            pageSizeOptions={[25, 50, 100]}
            searchPlaceholder="Search PO, supplier, receiving shop, status, or reference"
            toolbarActions={
              <ActionDialog
                description="Supplier is mandatory. Header captures supplier, receiving shop, freight, shipping, and charges; Details captures ordered items."
                onOpenChange={(open) => {
                  if (open) {
                    prepareDraftDefaults();
                    setCreateDialogOpen(true);
                  } else {
                    setCreateDialogOpen(false);
                    resetDraft();
                  }
                }}
                open={createDialogOpen}
                title={editingPurchaseOrder ? "Edit purchase order" : "Create purchase order"}
                triggerClassName="border-[var(--brand)] bg-[var(--brand)] text-white hover:border-[var(--brand-deep)] hover:bg-[var(--brand-deep)] hover:text-white"
                triggerIcon={Plus}
                triggerLabel="New purchase order"
                widthClassName="max-w-6xl"
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {(["header", "details"] as const).map((tab) => (
                      <button
                        className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                          activeCreateTab === tab
                            ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                            : "border-stone-200 bg-white text-stone-700"
                        }`}
                        key={tab}
                        onClick={() => setActiveCreateTab(tab)}
                        type="button"
                      >
                        {tab === "header" ? "Header" : "Details"}
                      </button>
                    ))}
                  </div>

                  {activeCreateTab === "header" ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                      <label className="grid gap-1 text-sm font-semibold text-stone-700">
                        Shop
                        <select
                          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                          onChange={(event) => {
                            const nextShopCode = event.target.value;
                            setShopCode(nextShopCode);
                            setLocationCode(resolveDefaultLocationForShop(nextShopCode));
                          }}
                          value={shopCode}
                        >
                          <option value="">Select shop</option>
                          {workspace.shopOptions.map((shop) => (
                            <option key={shop.storeCode} value={shop.storeCode}>
                              {shop.storeName} ({shop.storeCode})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm font-semibold text-stone-700">
                        Receiving location
                        <select
                          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                          onChange={(event) => setLocationCode(event.target.value)}
                          value={locationCode}
                        >
                          <option value="">Select receiving location</option>
                          {receivingLocationOptions.map((location) => (
                            <option key={location.locationCode} value={location.locationCode}>
                              {location.locationName} ({location.locationCode})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm font-semibold text-stone-700">
                        Supplier
                        <select
                          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                          onChange={(event) => setSupplierNo(event.target.value)}
                          value={supplierNo}
                        >
                          <option value="">Select supplier</option>
                          {workspace.supplierOptions.map((supplier) => (
                            <option key={supplier.supplierNo} value={supplier.supplierNo}>
                              {supplier.supplierName} ({supplier.supplierNo})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm font-semibold text-stone-700">
                        Reference
                        <input
                          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                          onChange={(event) => setExternalReference(event.target.value)}
                          value={externalReference}
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold text-stone-700">
                        Discount
                        <input
                          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                          min="0"
                          onChange={(event) => setDiscountAmount(event.target.value)}
                          step="0.01"
                          type="number"
                          value={discountAmount}
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold text-stone-700">
                        Shipping cost
                        <input
                          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                          min="0"
                          onChange={(event) => setShippingAmount(event.target.value)}
                          step="0.01"
                          type="number"
                          value={shippingAmount}
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold text-stone-700">
                        Freight
                        <input
                          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                          min="0"
                          onChange={(event) => setFreightAmount(event.target.value)}
                          step="0.01"
                          type="number"
                          value={freightAmount}
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold text-stone-700">
                        Other charges
                        <input
                          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                          min="0"
                          onChange={(event) => setOtherChargesAmount(event.target.value)}
                          step="0.01"
                          type="number"
                          value={otherChargesAmount}
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold text-stone-700">
                        Tax
                        <input
                          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                          min="0"
                          onChange={(event) => setTaxAmount(event.target.value)}
                          step="0.01"
                          type="number"
                          value={taxAmount}
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold text-stone-700 lg:col-span-2">
                        Note
                        <input
                          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                          onChange={(event) => setNote(event.target.value)}
                          value={note}
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_8rem_8rem_auto]">
                        <div className="grid gap-2">
                          <input
                            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                            onChange={(event) => {
                              setProductSearch(event.target.value);
                              setProductCode("");
                            }}
                            placeholder="Search product, code, or SKU"
                            value={productSearch}
                          />
                          <select
                            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                            onChange={(event) => setProductCode(event.target.value)}
                            value={productCode}
                          >
                            <option value="">
                              {filteredProductOptions.length ? "Select item" : "No matching products"}
                            </option>
                            {filteredProductOptions.map((product) => (
                              <option key={product.productCode} value={product.productCode}>
                                {product.productName} ({product.productCode}{product.sku ? ` / ${product.sku}` : ""})
                              </option>
                            ))}
                          </select>
                        </div>
                        <input
                          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                          min="0.001"
                          onChange={(event) => setQuantity(event.target.value)}
                          step="0.001"
                          type="number"
                          value={quantity}
                        />
                        <input
                          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                          min="0"
                          onChange={(event) => setUnitCost(event.target.value)}
                          placeholder="Unit cost"
                          step="0.01"
                          type="number"
                          value={unitCost}
                        />
                        <button
                          className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
                          onClick={addLine}
                          type="button"
                        >
                          Add line
                        </button>
                      </div>
                      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                        {lines.length ? (
                          lines.map((line) => (
                            <div
                              className="grid gap-3 border-b border-stone-100 px-4 py-3 text-sm last:border-b-0 lg:grid-cols-[minmax(0,1fr)_6rem_8rem_8rem_auto]"
                              key={line.id}
                            >
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-stone-900">{line.productName}</p>
                                <p className="truncate text-xs text-stone-500">{line.productCode}</p>
                              </div>
                              <span>{quantityFormatter.format(line.quantity)}</span>
                              <span>{line.unitCost === null ? "Cost pending" : currencyFormatter.format(line.unitCost)}</span>
                              <strong>{currencyFormatter.format(line.quantity * (line.unitCost ?? 0))}</strong>
                              <button
                                className="text-xs font-semibold text-rose-700"
                                onClick={() =>
                                  setLines((currentLines) =>
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
                          <div className="px-4 py-6 text-sm font-medium text-stone-500">
                            No purchase-order details yet.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 md:grid-cols-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Subtotal</p>
                      <p className="mt-1 text-lg font-semibold text-stone-950">{currencyFormatter.format(subtotalAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Freight + shipping</p>
                      <p className="mt-1 text-lg font-semibold text-stone-950">
                        {currencyFormatter.format(Number(shippingAmount || 0) + Number(freightAmount || 0))}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Grand total</p>
                      <p className="mt-1 text-lg font-semibold text-stone-950">{currencyFormatter.format(grandTotalAmount)}</p>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 disabled:bg-stone-100"
                        disabled={!canSave}
                        onClick={() => void savePurchaseOrder(false)}
                        type="button"
                      >
                        Save draft
                      </button>
                      <button
                        className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:bg-stone-300"
                        disabled={!canSave}
                        onClick={() => void savePurchaseOrder(true)}
                        type="button"
                      >
                        Push
                      </button>
                    </div>
                  </div>
                  {status.message ? (
                    <p
                      className={`text-sm font-semibold ${
                        status.tone === "error" ? "text-rose-700" : "text-emerald-700"
                      }`}
                    >
                      {status.message}
                    </p>
                  ) : null}
                </div>
              </ActionDialog>
            }
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="predictive-review">
          {criticalPredictiveRows.length > 0 ? (
            <section className="mb-4 grid gap-3 xl:grid-cols-2">
              {criticalPredictiveRows.slice(0, 4).map((row) => (
                <article
                  className="rounded-2xl border border-rose-200 bg-rose-50/85 p-4"
                  key={row.predictionId}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
                        Critical reorder risk
                      </p>
                      <h3 className="mt-1 truncate text-base font-semibold text-stone-950">
                        {row.productName}
                      </h3>
                      <p className="mt-1 text-sm text-stone-600">
                        {row.storeName} / {row.locationName}
                      </p>
                    </div>
                    <button
                      className="rounded-xl bg-rose-700 px-3 py-2 text-xs font-semibold text-white disabled:bg-stone-300"
                      disabled={!row.supplierNo || raisingPredictionId === row.predictionId || submitting}
                      onClick={() => void raisePredictivePurchaseOrder(row)}
                      type="button"
                    >
                      {raisingPredictionId === row.predictionId ? "Raising" : "Raise draft"}
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-stone-700 sm:grid-cols-5">
                    <span>On hand {quantityFormatter.format(row.onHandQuantity)}</span>
                    <span>Open PO {quantityFormatter.format(row.openPurchaseOrderQuantity)}</span>
                    <span>Cover {row.coverDays === null ? "0" : quantityFormatter.format(row.coverDays)} days</span>
                    <span>{row.demandConfidenceLabel} confidence</span>
                    <span>Suggest {quantityFormatter.format(row.recommendedQuantity)}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-rose-800">{row.reason}</p>
                </article>
              ))}
            </section>
          ) : null}
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <MetricCard
              hint="Lines Flash ERP can convert to draft purchase orders for HQ review."
              icon={Bot}
              label="Recommendations"
              value={numberFormatter.format(workspace.metrics.predictiveRecommendations)}
            />
            <MetricCard
              hint="Items at or below their safety stock or reorder point."
              icon={AlertTriangle}
              label="Critical"
              value={numberFormatter.format(workspace.metrics.predictiveCritical)}
            />
            <MetricCard
              hint="Predicted draft PO value using supplier pack cost or product base cost."
              icon={Truck}
              label="Forecast value"
              value={currencyFormatter.format(
                workspace.predictiveRows.reduce((sum, row) => sum + row.estimatedOrderValue, 0)
              )}
            />
            <MetricCard
              hint="Average confidence from the weighted demand forecast across visible reorder rows."
              icon={AlertTriangle}
              label="AI confidence"
              value={`${
                visiblePredictiveRows.length
                  ? (
                      visiblePredictiveRows.reduce((sum, row) => sum + row.demandConfidence, 0) /
                      visiblePredictiveRows.length
                    ).toFixed(1)
                  : "0.0"
              }%`}
            />
          </div>
          {status.message ? (
            <p
              className={`mb-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
                status.tone === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {status.message}
            </p>
          ) : null}
          {predictiveSeverityFilter === "critical" ? (
            <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Showing only critical predictive reorder items from the alert notification.
            </p>
          ) : null}
          <SharedDataGrid
            columns={predictiveColumns}
            data={visiblePredictiveRows}
            emptyLabel={
              predictiveSeverityFilter === "critical"
                ? "No critical predictive purchase-order lines are currently waiting for review."
                : "No predictive purchase orders are required from the current stock and supplier-lead-time picture."
            }
            exportFileName="flash-erp-predictive-purchase-orders"
            globalFilterFn={predictivePurchaseFilter}
            initialPageSize={25}
            pageSizeOptions={[25, 50, 100]}
            searchPlaceholder={
              predictiveSeverityFilter === "critical"
                ? "Search critical item, shop, supplier, or reason"
                : "Search item, shop, supplier, risk, or reason"
            }
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="goods-receipt">
          <SharedDataGrid
            columns={goodsReceiptColumns}
            data={workspace.goodsReceiptRows}
            emptyLabel="No goods receipt notes have synced from shops yet."
            exportFileName="flash-erp-goods-receipts"
            globalFilterFn={goodsReceiptFilter}
            initialPageSize={25}
            pageSizeOptions={[25, 50, 100]}
            searchPlaceholder="Search GRN, PO, supplier, receiving shop, node, or reference"
          />
        </WorkspaceTabsContent>
      </WorkspaceTabs>

      <ActionDialog
        hideTrigger
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPurchaseOrder(null);
          }
        }}
        open={Boolean(selectedPurchaseOrder)}
        title={selectedPurchaseOrder?.purchaseOrderNo ?? "Purchase order"}
        triggerLabel="Open purchase order"
        widthClassName="max-w-5xl"
      >
        {selectedPurchaseOrder ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <MetricCard
                hint={selectedPurchaseOrder.supplierName ?? "Supplier missing"}
                icon={Truck}
                label="Supplier"
                value={selectedPurchaseOrder.supplierNo ?? "Missing"}
              />
              <MetricCard
                hint={selectedPurchaseOrder.statusLabel}
                icon={FileText}
                label="Status"
                value={selectedPurchaseOrder.status}
              />
              <MetricCard
                hint="Quantity still pending from shops."
                icon={PackageCheck}
                label="Outstanding"
                value={quantityFormatter.format(selectedPurchaseOrder.outstandingQuantity)}
              />
              <MetricCard
                hint="Includes freight, shipping, tax, and other charges."
                icon={Send}
                label="Total"
                value={currencyFormatter.format(selectedPurchaseOrder.grandTotalAmount)}
              />
            </div>
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              {selectedPurchaseOrder.lines.map((line) => (
                <div
                  className="grid gap-3 border-b border-stone-100 px-4 py-3 text-sm last:border-b-0 lg:grid-cols-[minmax(0,1fr)_7rem_7rem_8rem]"
                  key={line.purchaseOrderLineId}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-stone-900">{line.productName}</p>
                    <p className="truncate text-xs text-stone-500">{line.productCode}</p>
                  </div>
                  <span>{quantityFormatter.format(line.orderedQuantity)}</span>
                  <span>{quantityFormatter.format(line.receivedQuantity)} received</span>
                  <strong>{currencyFormatter.format(line.lineTotal)}</strong>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {selectedPurchaseOrder.status === "DRAFT" ? (
                <button
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:bg-stone-300"
                  disabled={submitting}
                  onClick={() => void commitPurchaseOrder(selectedPurchaseOrder)}
                  type="button"
                >
                  <Send className="h-4 w-4" />
                  Push to shop
                </button>
              ) : null}
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700"
                onClick={() => printPurchaseOrder(selectedPurchaseOrder)}
                type="button"
              >
                <Printer className="h-4 w-4" />
                Print PO
              </button>
            </div>
          </div>
        ) : null}
      </ActionDialog>

      <ActionDialog
        hideTrigger
        onOpenChange={(open) => {
          if (!open) {
            setSelectedGoodsReceipt(null);
          }
        }}
        open={Boolean(selectedGoodsReceipt)}
        title={selectedGoodsReceipt?.goodsReceiptNo ?? "Goods receipt"}
        triggerLabel="Open GRN"
        widthClassName="max-w-5xl"
      >
        {selectedGoodsReceipt ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <MetricCard
                hint={selectedGoodsReceipt.purchaseOrderNo ?? "Direct receipt"}
                icon={FileText}
                label="Source"
                value={selectedGoodsReceipt.goodsReceiptNo}
              />
              <MetricCard
                hint={selectedGoodsReceipt.supplierName ?? "Supplier missing"}
                icon={Truck}
                label="Supplier"
                value={selectedGoodsReceipt.supplierNo ?? "Missing"}
              />
              <MetricCard
                hint="Received quantity across all lines."
                icon={PackageCheck}
                label="Quantity"
                value={quantityFormatter.format(selectedGoodsReceipt.totalQuantity)}
              />
              <MetricCard
                hint={selectedGoodsReceipt.sourceNodeCode ?? "Enterprise"}
                icon={Send}
                label="Source node"
                value={selectedGoodsReceipt.storeCode ?? "HQ"}
              />
            </div>
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              {selectedGoodsReceipt.lines.map((line) => (
                <div
                  className="grid gap-3 border-b border-stone-100 px-4 py-3 text-sm last:border-b-0 lg:grid-cols-[minmax(0,1fr)_8rem_8rem]"
                  key={line.goodsReceiptLineId}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-stone-900">{line.productName}</p>
                    <p className="truncate text-xs text-stone-500">{line.productCode}</p>
                  </div>
                  <span>
                    {line.orderedQuantity === null
                      ? "Not linked"
                      : `${quantityFormatter.format(line.orderedQuantity)} ordered`}
                  </span>
                  <strong>{quantityFormatter.format(line.quantity)} received</strong>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700"
                onClick={() => printGoodsReceipt(selectedGoodsReceipt)}
                type="button"
              >
                <Printer className="h-4 w-4" />
                Print GRN
              </button>
            </div>
          </div>
        ) : null}
      </ActionDialog>

      <section className="glass-panel rounded-[1.25rem] p-5">
        <div className="space-y-3">
          {workspace.postureMessages.map((message) => (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800" key={message}>
              {message}
            </div>
          ))}
        </div>
      </section>
    </EnterpriseShell>
  );
}
