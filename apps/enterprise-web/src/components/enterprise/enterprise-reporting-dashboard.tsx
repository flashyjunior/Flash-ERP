"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Landmark,
  Sparkles,
  Store,
  WalletCards
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type { EnterpriseReportingDashboardData } from "@/server/repositories/enterprise-reporting.repository";

const numberFormatter = new Intl.NumberFormat("en-US");

type StorePerformanceRow = EnterpriseReportingDashboardData["storePerformanceRows"][number];
type ReceivableRow = EnterpriseReportingDashboardData["receivableRows"][number];
type StatementReportRow = EnterpriseReportingDashboardData["customerStatementRows"][number];
type InventoryRiskRow = EnterpriseReportingDashboardData["inventoryRiskRows"][number];
type PromotionRow = EnterpriseReportingDashboardData["promotionRows"][number];
type ExceptionRow = EnterpriseReportingDashboardData["exceptionRows"][number];
type SalesOrderRow = EnterpriseReportingDashboardData["salesOrderRows"][number];
type CloseoutRow = EnterpriseReportingDashboardData["closeoutRows"][number];
type TenderReportRow = EnterpriseReportingDashboardData["tenderReportRows"][number];
type ReceiptReportRow = EnterpriseReportingDashboardData["receiptReportRows"][number];
type CashierSalesRow = EnterpriseReportingDashboardData["cashierSalesRows"][number];
type ItemSalesRow = EnterpriseReportingDashboardData["itemSalesRows"][number];
type PromotionPerformanceRow = EnterpriseReportingDashboardData["promotionPerformanceRows"][number];
type StockValuationRow = EnterpriseReportingDashboardData["stockValuationRows"][number];
type CogsReportRow = EnterpriseReportingDashboardData["cogsReportRows"][number];
type ProfitAndLossRow = EnterpriseReportingDashboardData["profitAndLossRows"][number];
type ExpenseTrackingRow = EnterpriseReportingDashboardData["expenseTrackingRows"][number];
type SlowMovingItemRow = EnterpriseReportingDashboardData["slowMovingItemRows"][number];
type KpiScorecardRow = EnterpriseReportingDashboardData["kpiScorecardRows"][number];
type CashierVarianceRow = EnterpriseReportingDashboardData["cashierVarianceRows"][number];
type PurchaseOrderReportRow = EnterpriseReportingDashboardData["purchaseOrderReportRows"][number];
type GoodsReceiptReportRow = EnterpriseReportingDashboardData["goodsReceiptReportRows"][number];
type TransferReportRow = EnterpriseReportingDashboardData["transferReportRows"][number];
type FuelDailyReportRow = EnterpriseReportingDashboardData["fuelDailyReportRows"][number];
type SupplierReportRow = EnterpriseReportingDashboardData["supplierReportRows"][number];
type UserReportRow = EnterpriseReportingDashboardData["userReportRows"][number];

type ReportId =
  | "tenders"
  | "receipts"
  | "cashierSales"
  | "itemSales"
  | "promotionPerformance"
  | "kpiScorecard"
  | "profitAndLoss"
  | "cogs"
  | "expenseTracking"
  | "storePerformance"
  | "salesOrders"
  | "closeouts"
  | "cashierVariance"
  | "purchaseOrders"
  | "goodsReceipts"
  | "suppliers"
  | "transfers"
  | "fuelDaily"
  | "inventoryRisk"
  | "stockValuation"
  | "slowMovingItems"
  | "receivables"
  | "customerStatements"
  | "supplierStatements"
  | "users"
  | "promotions"
  | "exceptions";

type ReportCatalogItem = {
  id: ReportId;
  label: string;
  description: string;
  rowCount: number;
};

type ReportCatalogGroup = {
  label: string;
  reports: ReportCatalogItem[];
};

type ReportRuntimeFilters = {
  status: string;
  tender: string;
  supplier: string;
  location: string;
  role: string;
  credit: string;
  cashier: string;
  product: string;
  promotion: string;
  category: string;
};

type ReportFilterKey = keyof ReportRuntimeFilters;

const reportIds: ReportId[] = [
  "tenders",
  "receipts",
  "cashierSales",
  "itemSales",
  "promotionPerformance",
  "kpiScorecard",
  "profitAndLoss",
  "cogs",
  "expenseTracking",
  "storePerformance",
  "salesOrders",
  "closeouts",
  "cashierVariance",
  "purchaseOrders",
  "goodsReceipts",
  "suppliers",
  "transfers",
  "fuelDaily",
  "inventoryRisk",
  "stockValuation",
  "slowMovingItems",
  "receivables",
  "customerStatements",
  "supplierStatements",
  "users",
  "promotions",
  "exceptions"
];

const defaultReportRuntimeFilters: ReportRuntimeFilters = {
  status: "",
  tender: "",
  supplier: "",
  location: "",
  role: "",
  credit: "",
  cashier: "",
  product: "",
  promotion: "",
  category: ""
};

const reportsWithStoreScope = new Set<ReportId>([
  "tenders",
  "receipts",
  "cashierSales",
  "itemSales",
  "promotionPerformance",
  "kpiScorecard",
  "profitAndLoss",
  "cogs",
  "expenseTracking",
  "storePerformance",
  "salesOrders",
  "closeouts",
  "cashierVariance",
  "purchaseOrders",
  "goodsReceipts",
  "transfers",
  "fuelDaily",
  "inventoryRisk",
  "stockValuation",
  "slowMovingItems",
  "receivables",
  "users",
  "exceptions"
]);

const reportsWithDateScope = new Set<ReportId>(reportIds);

function normalizeChoice(value: string | number | boolean | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function matchesChoice(
  selectedValue: string,
  values: Array<string | number | boolean | null | undefined>
) {
  const selected = normalizeChoice(selectedValue);

  if (!selected) {
    return true;
  }

  return values.some((value) => normalizeChoice(value).includes(selected));
}

function buildChoiceOptions(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const options: Array<{ value: string; label: string }> = [];

  for (const value of values) {
    const label = value?.trim();

    if (!label) {
      continue;
    }

    const key = label.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    options.push({ value: label, label });
  }

  return options.sort((left, right) => left.label.localeCompare(right.label));
}

function parseReportBoundary(value: string, boundary: "start" | "end") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (boundary === "end") {
    parsed.setHours(23, 59, 59, 999);
  }

  return parsed;
}

function matchesDateScope(value: string | null | undefined, dateFrom: string, dateTo: string) {
  const start = parseReportBoundary(dateFrom, "start");
  const end = parseReportBoundary(dateTo, "end");

  if (!start && !end) {
    return true;
  }

  if (!value) {
    return false;
  }

  const current = new Date(value);

  if (Number.isNaN(current.getTime())) {
    return false;
  }

  if (start && current < start) {
    return false;
  }

  if (end && current > end) {
    return false;
  }

  return true;
}

function coerceReportId(value: string | null | undefined): ReportId | null {
  return reportIds.includes(value as ReportId) ? (value as ReportId) : null;
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

function StatusBadge({
  label,
  tone
}: {
  label: string;
  tone: "success" | "warning" | "danger" | "default";
}) {
  const toneClassName =
    tone === "success"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "warning"
        ? "bg-amber-100 text-amber-700"
        : tone === "danger"
          ? "bg-rose-100 text-rose-700"
          : "bg-stone-100 text-stone-700";

    return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${toneClassName}`}>
      {label}
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

function formatReportDateTime(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Date(value).toLocaleString();
}

function matchesReportQuery(values: Array<string | number | boolean | null | undefined>, filterValue: unknown) {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return values.join(" ").toLowerCase().includes(query);
}

const storePerformanceFilter: FilterFn<StorePerformanceRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [row.original.store, row.original.storeCode, row.original.nodeCode ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const tenderReportFilter: FilterFn<TenderReportRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [
      row.original.tenderCode,
      row.original.tenderName,
      row.original.paymentMethod,
      row.original.netAmount,
      row.original.transactionCount
    ],
    filterValue
  );

const receiptReportFilter: FilterFn<ReceiptReportRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [
      row.original.transactionNo,
      row.original.store,
      row.original.storeCode,
      row.original.terminal,
      row.original.cashierCode,
      row.original.originNodeCode,
      row.original.tenderSummary,
      row.original.productSummary
    ],
    filterValue
  );

const cashierSalesFilter: FilterFn<CashierSalesRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [row.original.cashierCode, row.original.store, row.original.storeCode],
    filterValue
  );

const itemSalesFilter: FilterFn<ItemSalesRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [
      row.original.productCode,
      row.original.productName,
      row.original.department,
      row.original.category,
      row.original.store,
      row.original.storeCode
    ],
    filterValue
  );

const promotionPerformanceFilter: FilterFn<PromotionPerformanceRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [
      row.original.promotionCode,
      row.original.promotionName,
      row.original.store,
      row.original.storeCode
    ],
    filterValue
  );

const stockValuationFilter: FilterFn<StockValuationRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [
      row.original.locationCode,
      row.original.locationName,
      row.original.storeCode,
      row.original.storeName,
      row.original.warehouseCode,
      row.original.warehouseName,
      row.original.productCode,
      row.original.productName
    ],
    filterValue
  );

const cogsReportFilter: FilterFn<CogsReportRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [
      row.original.productCode,
      row.original.productName,
      row.original.department,
      row.original.category,
      row.original.store,
      row.original.storeCode
    ],
    filterValue
  );

const profitAndLossFilter: FilterFn<ProfitAndLossRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [row.original.section, row.original.lineItem, row.original.lineType, row.original.basis],
    filterValue
  );

const expenseTrackingFilter: FilterFn<ExpenseTrackingRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [
      row.original.expenseType,
      row.original.category,
      row.original.referenceNo,
      row.original.storeCode,
      row.original.storeName,
      row.original.supplierName,
      row.original.status,
      row.original.source
    ],
    filterValue
  );

const slowMovingItemFilter: FilterFn<SlowMovingItemRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [
      row.original.productCode,
      row.original.productName,
      row.original.locationCode,
      row.original.locationName,
      row.original.storeCode,
      row.original.storeName,
      row.original.warehouseName,
      row.original.riskBand
    ],
    filterValue
  );

const kpiScorecardFilter: FilterFn<KpiScorecardRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [row.original.kpiCode, row.original.kpiName, row.original.group, row.original.status, row.original.basis],
    filterValue
  );

const cashierVarianceFilter: FilterFn<CashierVarianceRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [row.original.cashierCode, row.original.store, row.original.storeCode],
    filterValue
  );

const purchaseOrderReportFilter: FilterFn<PurchaseOrderReportRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [
      row.original.purchaseOrderNo,
      row.original.status,
      row.original.supplierNo,
      row.original.supplierName,
      row.original.locationCode,
      row.original.locationName,
      row.original.storeCode,
      row.original.storeName
    ],
    filterValue
  );

const goodsReceiptReportFilter: FilterFn<GoodsReceiptReportRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [
      row.original.goodsReceiptNo,
      row.original.purchaseOrderNo,
      row.original.supplierNo,
      row.original.supplierName,
      row.original.locationCode,
      row.original.locationName,
      row.original.storeCode,
      row.original.storeName
    ],
    filterValue
  );

const transferReportFilter: FilterFn<TransferReportRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [
      row.original.transferNo,
      row.original.transferBatchNo,
      row.original.status,
      row.original.origin,
      row.original.sourceStoreName,
      row.original.sourceLocationCode,
      row.original.destinationStoreName,
      row.original.destinationLocationCode,
      row.original.productCode,
      row.original.productName
    ],
    filterValue
  );

const fuelDailyReportFilter: FilterFn<FuelDailyReportRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [
      row.original.tankCode,
      row.original.tankName,
      row.original.siteCode,
      row.original.siteName,
      row.original.storeCode,
      row.original.storeName,
      row.original.stationCode,
      row.original.stationName,
      row.original.productCode,
      row.original.productName,
      row.original.reconciliationNo,
      row.original.status
    ],
    filterValue
  );

const supplierReportFilter: FilterFn<SupplierReportRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [
      row.original.supplierNo,
      row.original.name,
      row.original.contactName,
      row.original.phone,
      row.original.email,
      row.original.status
    ],
    filterValue
  );

const userReportFilter: FilterFn<UserReportRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [
      row.original.loginId,
      row.original.displayName,
      row.original.email,
      row.original.accountStatus,
      row.original.homeStoreCode,
      row.original.homeStoreName,
      row.original.roleCodes.join(" ")
    ],
    filterValue
  );

const receivableFilter: FilterFn<ReceivableRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.customerNo,
    row.original.fullName,
    row.original.homeStoreName ?? "",
    row.original.allowCreditSales ? "credit enabled" : "cash only"
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const inventoryRiskFilter: FilterFn<InventoryRiskRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.locationCode,
    row.original.locationName,
    row.original.storeName ?? "",
    row.original.warehouseName ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const promotionFilter: FilterFn<PromotionRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.promotionCode,
    row.original.name,
    row.original.targetScope,
    row.original.status,
    row.original.discountLabel,
    row.original.mechanicLabel,
    row.original.eligibilityLabel
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const exceptionFilter: FilterFn<ExceptionRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.store,
    row.original.storeCode,
    row.original.aggregateType,
    row.original.eventType,
    row.original.referenceLabel,
    row.original.errorMessage ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const salesOrderFilter: FilterFn<SalesOrderRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.orderNo,
    row.original.store,
    row.original.storeCode,
    row.original.customerNo ?? "",
    row.original.customerName ?? "",
    row.original.sourceTransactionNo,
    row.original.status,
    row.original.fulfilledTransactionNo ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const closeoutFilter: FilterFn<CloseoutRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.reconciliationNo,
    row.original.store,
    row.original.storeCode,
    row.original.shiftNo,
    row.original.cashierCode
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const statementReportFilter: FilterFn<StatementReportRow> = (row, _columnId, filterValue) =>
  matchesReportQuery(
    [
      row.original.partyNo,
      row.original.partyName,
      row.original.referenceNo,
      row.original.documentType,
      row.original.sourceType,
      row.original.memo ?? "",
      row.original.journalNo ?? "",
      row.original.status
    ],
    filterValue
  );

export function EnterpriseReportingDashboard({
  canViewHrReports = false,
  dashboard,
  initialReportId
}: {
  canViewHrReports?: boolean;
  dashboard: EnterpriseReportingDashboardData;
  initialReportId?: string | null;
}) {
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: dashboard.currencyCode
      }),
    [dashboard.currencyCode]
  );
  const [selectedReportId, setSelectedReportId] = useState<ReportId | null>(() =>
    coerceReportId(initialReportId)
  );
  const [reportFilters, setReportFilters] = useState<
    Partial<Record<ReportId, ReportRuntimeFilters>>
  >({});

  const selectedShop = dashboard.shopOptions.find(
    (shop) =>
      normalizeChoice(shop.storeCode) === normalizeChoice(dashboard.filters.storeCode)
  );

  function getReportFilterValues(reportId: ReportId): ReportRuntimeFilters {
    return {
      ...defaultReportRuntimeFilters,
      ...(reportFilters[reportId] ?? {})
    };
  }

  function updateReportFilter(reportId: ReportId, key: ReportFilterKey, value: string) {
    setReportFilters((current) => ({
      ...current,
      [reportId]: {
        ...defaultReportRuntimeFilters,
        ...(current[reportId] ?? {}),
        [key]: value
      }
    }));
  }

  function clearReportFilters(reportId: ReportId) {
    setReportFilters((current) => ({
      ...current,
      [reportId]: defaultReportRuntimeFilters
    }));
  }

  function matchesStoreScope(values: Array<string | null | undefined>) {
    const selectedCode = dashboard.filters.storeCode;

    if (!selectedCode) {
      return true;
    }

    return matchesChoice(selectedCode, [
      ...values,
      selectedShop?.storeCode,
      selectedShop?.storeName
    ]);
  }

  function matchesDate(value: string | null | undefined) {
    return matchesDateScope(value, dashboard.filters.dateFrom, dashboard.filters.dateTo);
  }

  const storePerformanceColumns = useMemo<ColumnDef<StorePerformanceRow>[]>(
    () => [
      {
        accessorKey: "store",
        header: "Store",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.store}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.storeCode}
              {row.original.nodeCode ? ` • ${row.original.nodeCode}` : ""}
            </p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "salesValue",
        header: "Revenue",
        cell: ({ row }) => currencyFormatter.format(row.original.salesValue)
      },
      {
        accessorKey: "completedTransactions",
        header: "Transactions",
        cell: ({ row }) => numberFormatter.format(row.original.completedTransactions)
      },
      {
        accessorKey: "averageBasket",
        header: "Avg basket",
        cell: ({ row }) => currencyFormatter.format(row.original.averageBasket)
      },
      {
        accessorKey: "exceptionCount",
        header: "Exceptions",
        cell: ({ row }) => (
          <StatusBadge
            label={numberFormatter.format(row.original.exceptionCount)}
            tone={row.original.exceptionCount > 0 ? "warning" : "success"}
          />
        )
      },
      {
        accessorKey: "lastActivityAtLabel",
        header: "Last activity",
        cell: ({ row }) => renderTimestamp(row.original.lastActivityAt, row.original.lastActivityAtLabel),
        meta: {
          disableTruncate: true
        }
      }
    ],
    [currencyFormatter]
  );

  const receivableColumns = useMemo<ColumnDef<ReceivableRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: "Customer",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.fullName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.customerNo}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "receivableBalanceAmount",
        header: "Balance",
        cell: ({ row }) => currencyFormatter.format(row.original.receivableBalanceAmount)
      },
      {
        accessorKey: "creditLimitAmount",
        header: "Credit limit",
        cell: ({ row }) =>
          row.original.creditLimitAmount === null
            ? "Not set"
            : currencyFormatter.format(row.original.creditLimitAmount)
      },
      {
        accessorKey: "homeStoreName",
        header: "Home store",
        cell: ({ row }) => row.original.homeStoreName ?? "Any branch"
      },
      {
        accessorKey: "allowCreditSales",
        header: "Credit",
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.allowCreditSales ? "Enabled" : "Disabled"}
            tone={row.original.allowCreditSales ? "success" : "default"}
          />
        )
      },
      {
        accessorKey: "lastTransactionAtLabel",
        header: "Last activity",
        cell: ({ row }) =>
          renderTimestamp(row.original.lastTransactionAt, row.original.lastTransactionAtLabel),
        meta: {
          disableTruncate: true
        }
      }
    ],
    [currencyFormatter]
  );
  const statementReportColumns = useMemo<ColumnDef<StatementReportRow>[]>(
    () => [
      {
        accessorKey: "partyName",
        header: "Party",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.partyName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.partyNo}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "referenceNo",
        header: "Reference",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.referenceNo}</p>
            <p className="truncate text-xs text-stone-500">{row.original.documentType}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "transactionDate",
        header: "Timestamp",
        cell: ({ row }) => renderTimestamp(row.original.transactionDate, row.original.sourceType),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "debitAmount",
        header: "Debit",
        cell: ({ row }) => currencyFormatter.format(row.original.debitAmount)
      },
      {
        accessorKey: "creditAmount",
        header: "Credit",
        cell: ({ row }) => currencyFormatter.format(row.original.creditAmount)
      },
      {
        accessorKey: "runningBalance",
        header: "Running balance",
        cell: ({ row }) => (
          <span className="font-semibold text-stone-950">
            {currencyFormatter.format(row.original.runningBalance)}
          </span>
        )
      },
      {
        accessorKey: "journalNo",
        header: "Journal",
        cell: ({ row }) =>
          row.original.journalEntryId ? (
            <Link
              className="font-semibold text-[var(--brand)] transition hover:text-[var(--brand-deep)]"
              href={`/finance/journal-inquiry/${row.original.journalEntryId}`}
            >
              {row.original.journalNo ?? "Open"}
            </Link>
          ) : (
            <span className="text-stone-500">Not posted</span>
          )
      }
    ],
    [currencyFormatter]
  );

  const inventoryRiskColumns = useMemo<ColumnDef<InventoryRiskRow>[]>(
    () => [
      {
        accessorKey: "locationName",
        header: "Location",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.locationName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.locationCode}
              {row.original.storeName ? ` • ${row.original.storeName}` : ""}
              {!row.original.storeName && row.original.warehouseName
                ? ` • ${row.original.warehouseName}`
                : ""}
            </p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "negativePositions",
        header: "Negatives",
        cell: ({ row }) => (
          <StatusBadge
            label={numberFormatter.format(row.original.negativePositions)}
            tone={row.original.negativePositions > 0 ? "danger" : "success"}
          />
        )
      },
      {
        accessorKey: "productCount",
        header: "Products",
        cell: ({ row }) => numberFormatter.format(row.original.productCount)
      },
      {
        accessorKey: "onHandQuantity",
        header: "On hand",
        cell: ({ row }) => numberFormatter.format(row.original.onHandQuantity)
      },
      {
        accessorKey: "lastMovementAtLabel",
        header: "Last movement",
        cell: ({ row }) =>
          renderTimestamp(row.original.lastMovementAt, row.original.lastMovementAtLabel),
        meta: {
          disableTruncate: true
        }
      }
    ],
    []
  );

  const promotionColumns = useMemo<ColumnDef<PromotionRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Promotion",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.name}</p>
            <p className="truncate text-xs text-stone-500">{row.original.promotionCode}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "targetScope",
        header: "Scope"
      },
      {
        accessorKey: "discountLabel",
        header: "Discount"
      },
      {
        accessorKey: "mechanicLabel",
        header: "Mechanic"
      },
      {
        accessorKey: "eligibilityLabel",
        header: "Eligibility"
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.status}
            tone={
              row.original.status === "ACTIVE"
                ? "success"
                : row.original.status === "SCHEDULED"
                  ? "warning"
                  : "default"
            }
          />
        )
      },
      {
        accessorKey: "updatedAtLabel",
        header: "Updated",
        cell: ({ row }) => renderTimestamp(row.original.updatedAt, row.original.updatedAtLabel),
        meta: {
          disableTruncate: true
        }
      }
    ],
    []
  );

  const exceptionColumns = useMemo<ColumnDef<ExceptionRow>[]>(
    () => [
      {
        accessorKey: "store",
        header: "Store",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.store}</p>
            <p className="truncate text-xs text-stone-500">{row.original.storeCode}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "eventType",
        header: "Event",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.eventType}</p>
            <p className="truncate text-xs text-stone-500">{row.original.aggregateType}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "referenceLabel",
        header: "Reference"
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.retryable ? `${row.original.status} • Retryable` : row.original.status}
            tone={row.original.retryable ? "warning" : "danger"}
          />
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "receivedAtLabel",
        header: "Received",
        cell: ({ row }) => renderTimestamp(row.original.receivedAt, row.original.receivedAtLabel),
        meta: {
          disableTruncate: true
        }
      }
    ],
    []
  );

  const salesOrderColumns = useMemo<ColumnDef<SalesOrderRow>[]>(
    () => [
      {
        accessorKey: "orderNo",
        header: "Order",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.orderNo}</p>
            <p className="truncate text-xs text-stone-500">
              Basket {row.original.sourceTransactionNo}
            </p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "store",
        header: "Store",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.store}</p>
            <p className="truncate text-xs text-stone-500">{row.original.terminal ?? "No terminal"}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "customerName",
        header: "Customer",
        cell: ({ row }) =>
          row.original.customerName
            ? `${row.original.customerName}${row.original.customerNo ? ` (${row.original.customerNo})` : ""}`
            : row.original.customerNo ?? "Walk-in customer"
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.status}
            tone={
              row.original.status === "OPEN"
                ? "warning"
                : row.original.status === "FULFILLED"
                  ? "success"
                  : "default"
            }
          />
        )
      },
      {
        accessorKey: "totalAmount",
        header: "Value",
        cell: ({ row }) => currencyFormatter.format(row.original.totalAmount)
      },
      {
        accessorKey: "updatedAtLabel",
        header: "Latest",
        cell: ({ row }) => renderTimestamp(row.original.updatedAt, row.original.updatedAtLabel),
        meta: {
          disableTruncate: true
        }
      }
    ],
    [currencyFormatter]
  );

  const closeoutColumns = useMemo<ColumnDef<CloseoutRow>[]>(
    () => [
      {
        accessorKey: "reconciliationNo",
        header: "Closeout",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.reconciliationNo}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.shiftNo} • cashier {row.original.cashierCode}
            </p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "store",
        header: "Store",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.store}</p>
            <p className="truncate text-xs text-stone-500">{row.original.terminal ?? "No terminal"}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "declaredCashAmount",
        header: "Declared",
        cell: ({ row }) => currencyFormatter.format(row.original.declaredCashAmount)
      },
      {
        accessorKey: "bankedAmount",
        header: "Banked",
        cell: ({ row }) => currencyFormatter.format(row.original.bankedAmount)
      },
      {
        accessorKey: "remainingBankingAmount",
        header: "Remaining",
        cell: ({ row }) => (
          <StatusBadge
            label={currencyFormatter.format(row.original.remainingBankingAmount)}
            tone={row.original.remainingBankingAmount > 0 ? "warning" : "success"}
          />
        )
      },
      {
        accessorKey: "reconciledAtLabel",
        header: "Reconciled",
        cell: ({ row }) => renderTimestamp(row.original.reconciledAt, row.original.reconciledAtLabel),
        meta: {
          disableTruncate: true
        }
      }
    ],
    [currencyFormatter]
  );

  const tenderReportColumns = useMemo<ColumnDef<TenderReportRow>[]>(
    () => [
      {
        accessorKey: "tenderName",
        header: "Tender",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.tenderName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.tenderCode ?? row.original.paymentMethod}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      { accessorKey: "paymentMethod", header: "Method" },
      {
        accessorKey: "netAmount",
        header: "Net amount",
        cell: ({ row }) => currencyFormatter.format(row.original.netAmount)
      },
      {
        accessorKey: "transactionCount",
        header: "Transactions",
        cell: ({ row }) => numberFormatter.format(row.original.transactionCount)
      },
      {
        accessorKey: "share",
        header: "Share",
        cell: ({ row }) => `${row.original.share.toFixed(2)}%`
      }
    ],
    [currencyFormatter]
  );

  const receiptReportColumns = useMemo<ColumnDef<ReceiptReportRow>[]>(
    () => [
      {
        accessorKey: "transactionNo",
        header: "Receipt",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.transactionNo}</p>
            <p className="truncate text-xs text-stone-500">{row.original.tenderSummary}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "store",
        header: "Store",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.store}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.cashierCode ?? row.original.terminal ?? row.original.storeCode}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      { accessorKey: "productSummary", header: "Products" },
      {
        accessorKey: "itemCount",
        header: "Items",
        cell: ({ row }) => numberFormatter.format(row.original.itemCount)
      },
      {
        accessorKey: "totalAmount",
        header: "Total",
        cell: ({ row }) => currencyFormatter.format(row.original.totalAmount)
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

  const cashierSalesColumns = useMemo<ColumnDef<CashierSalesRow>[]>(
    () => [
      {
        accessorKey: "cashierCode",
        header: "Cashier",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.cashierCode}</p>
            <p className="truncate text-xs text-stone-500">{row.original.store}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "netSales",
        header: "Net sales",
        cell: ({ row }) => currencyFormatter.format(row.original.netSales)
      },
      {
        accessorKey: "transactionCount",
        header: "Receipts",
        cell: ({ row }) => numberFormatter.format(row.original.transactionCount)
      },
      {
        accessorKey: "averageBasket",
        header: "Avg basket",
        cell: ({ row }) => currencyFormatter.format(row.original.averageBasket)
      },
      {
        accessorKey: "lastSaleAtLabel",
        header: "Last sale",
        cell: ({ row }) => renderTimestamp(row.original.lastSaleAt, row.original.lastSaleAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter]
  );

  const itemSalesColumns = useMemo<ColumnDef<ItemSalesRow>[]>(
    () => [
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
        accessorKey: "store",
        header: "Store",
        cell: ({ row }) => row.original.store
      },
      {
        accessorKey: "quantitySold",
        header: "Qty",
        cell: ({ row }) => numberFormatter.format(row.original.quantitySold)
      },
      {
        accessorKey: "netSales",
        header: "Net sales",
        cell: ({ row }) => currencyFormatter.format(row.original.netSales)
      },
      {
        accessorKey: "discountAmount",
        header: "Discount",
        cell: ({ row }) => currencyFormatter.format(row.original.discountAmount)
      },
      {
        accessorKey: "lastSoldAtLabel",
        header: "Last sold",
        cell: ({ row }) => renderTimestamp(row.original.lastSoldAt, row.original.lastSoldAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter]
  );

  const promotionPerformanceColumns = useMemo<ColumnDef<PromotionPerformanceRow>[]>(
    () => [
      {
        accessorKey: "promotionName",
        header: "Promotion",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.promotionName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.promotionCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      { accessorKey: "store", header: "Store" },
      {
        accessorKey: "discountAmount",
        header: "Discount",
        cell: ({ row }) => currencyFormatter.format(row.original.discountAmount)
      },
      {
        accessorKey: "netSales",
        header: "Net sales",
        cell: ({ row }) => currencyFormatter.format(row.original.netSales)
      },
      {
        accessorKey: "transactionCount",
        header: "Receipts",
        cell: ({ row }) => numberFormatter.format(row.original.transactionCount)
      },
      {
        accessorKey: "lastAppliedAtLabel",
        header: "Last applied",
        cell: ({ row }) => renderTimestamp(row.original.lastAppliedAt, row.original.lastAppliedAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter]
  );

  const stockValuationColumns = useMemo<ColumnDef<StockValuationRow>[]>(
    () => [
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
        accessorKey: "locationName",
        header: "Location",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.locationName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.storeName ?? row.original.warehouseName ?? row.original.locationCode}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "onHandQuantity",
        header: "On hand",
        cell: ({ row }) => numberFormatter.format(row.original.onHandQuantity)
      },
      {
        accessorKey: "unitCost",
        header: "Unit cost",
        cell: ({ row }) => currencyFormatter.format(row.original.unitCost)
      },
      {
        accessorKey: "stockValue",
        header: "Value",
        cell: ({ row }) => currencyFormatter.format(row.original.stockValue)
      }
    ],
    [currencyFormatter]
  );

  const cogsReportColumns = useMemo<ColumnDef<CogsReportRow>[]>(
    () => [
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
      { accessorKey: "store", header: "Store" },
      {
        accessorKey: "quantitySold",
        header: "Qty sold",
        cell: ({ row }) => numberFormatter.format(row.original.quantitySold)
      },
      {
        accessorKey: "netSales",
        header: "Net sales",
        cell: ({ row }) => currencyFormatter.format(row.original.netSales)
      },
      {
        accessorKey: "cogsAmount",
        header: "COGS",
        cell: ({ row }) => currencyFormatter.format(row.original.cogsAmount)
      },
      {
        accessorKey: "grossProfit",
        header: "Gross profit",
        cell: ({ row }) => currencyFormatter.format(row.original.grossProfit)
      },
      {
        accessorKey: "grossMarginPercent",
        header: "Margin",
        cell: ({ row }) => `${row.original.grossMarginPercent.toFixed(2)}%`
      },
      {
        accessorKey: "lastSoldAtLabel",
        header: "Last sale",
        cell: ({ row }) => renderTimestamp(row.original.lastSoldAt, row.original.lastSoldAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter]
  );

  const profitAndLossColumns = useMemo<ColumnDef<ProfitAndLossRow>[]>(
    () => [
      { accessorKey: "section", header: "Section" },
      {
        accessorKey: "lineItem",
        header: "Line",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.lineItem}</p>
            <p className="truncate text-xs text-stone-500">{row.original.basis}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "lineType",
        header: "Type",
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.lineType}
            tone={
              row.original.lineType === "expense"
                ? "warning"
                : row.original.amount < 0
                  ? "danger"
                  : "success"
            }
          />
        )
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => currencyFormatter.format(row.original.amount)
      }
    ],
    [currencyFormatter]
  );

  const expenseTrackingColumns = useMemo<ColumnDef<ExpenseTrackingRow>[]>(
    () => [
      {
        accessorKey: "expenseType",
        header: "Expense",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.expenseType}</p>
            <p className="truncate text-xs text-stone-500">{row.original.category}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "referenceNo",
        header: "Reference",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.referenceNo}</p>
            <p className="truncate text-xs text-stone-500">{row.original.source}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "storeName",
        header: "Store",
        cell: ({ row }) => row.original.storeName ?? row.original.storeCode ?? "HQ"
      },
      {
        accessorKey: "supplierName",
        header: "Supplier",
        cell: ({ row }) => row.original.supplierName ?? "Not supplier-linked"
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => currencyFormatter.format(row.original.amount)
      },
      {
        accessorKey: "recognizedAmount",
        header: "Recognized",
        cell: ({ row }) => currencyFormatter.format(row.original.recognizedAmount)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.status}
            tone={row.original.recognizedAmount > 0 ? "warning" : "default"}
          />
        )
      },
      {
        accessorKey: "incurredAtLabel",
        header: "Date",
        cell: ({ row }) => renderTimestamp(row.original.incurredAt, row.original.incurredAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter]
  );

  const slowMovingItemColumns = useMemo<ColumnDef<SlowMovingItemRow>[]>(
    () => [
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
        accessorKey: "locationName",
        header: "Location",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.locationName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.storeName ?? row.original.warehouseName ?? row.original.locationCode}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "riskBand",
        header: "Risk",
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.riskBand}
            tone={row.original.riskBand === "No sales" ? "danger" : "warning"}
          />
        )
      },
      {
        accessorKey: "onHandQuantity",
        header: "On hand",
        cell: ({ row }) => numberFormatter.format(row.original.onHandQuantity)
      },
      {
        accessorKey: "stockValue",
        header: "Stock value",
        cell: ({ row }) => currencyFormatter.format(row.original.stockValue)
      },
      {
        accessorKey: "quantitySoldInScope",
        header: "Qty sold",
        cell: ({ row }) => numberFormatter.format(row.original.quantitySoldInScope)
      },
      {
        accessorKey: "lastSaleAtLabel",
        header: "Last sale",
        cell: ({ row }) => renderTimestamp(row.original.lastSaleAt, row.original.lastSaleAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter]
  );

  const kpiScorecardColumns = useMemo<ColumnDef<KpiScorecardRow>[]>(
    () => [
      {
        accessorKey: "kpiName",
        header: "KPI",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.kpiName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.basis}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      { accessorKey: "group", header: "Group" },
      {
        accessorKey: "value",
        header: "Value",
        cell: ({ row }) =>
          row.original.displayKind === "currency"
            ? currencyFormatter.format(row.original.value)
            : row.original.displayKind === "percent"
              ? `${row.original.value.toFixed(2)}%`
              : numberFormatter.format(row.original.value)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.status}
            tone={
              row.original.status === "Healthy"
                ? "success"
                : row.original.status === "Watch"
                  ? "warning"
                  : "danger"
            }
          />
        )
      }
    ],
    [currencyFormatter]
  );

  const cashierVarianceColumns = useMemo<ColumnDef<CashierVarianceRow>[]>(
    () => [
      {
        accessorKey: "cashierCode",
        header: "Cashier",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.cashierCode}</p>
            <p className="truncate text-xs text-stone-500">{row.original.store}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "declaredCashAmount",
        header: "Declared",
        cell: ({ row }) => currencyFormatter.format(row.original.declaredCashAmount)
      },
      {
        accessorKey: "varianceAmount",
        header: "Variance",
        cell: ({ row }) => (
          <StatusBadge
            label={currencyFormatter.format(row.original.varianceAmount)}
            tone={Math.abs(row.original.varianceAmount) > 0 ? "warning" : "success"}
          />
        )
      },
      {
        accessorKey: "bankedAmount",
        header: "Banked",
        cell: ({ row }) => currencyFormatter.format(row.original.bankedAmount)
      },
      {
        accessorKey: "lastCloseoutAtLabel",
        header: "Last closeout",
        cell: ({ row }) => renderTimestamp(row.original.lastCloseoutAt, row.original.lastCloseoutAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter]
  );

  const purchaseOrderReportColumns = useMemo<ColumnDef<PurchaseOrderReportRow>[]>(
    () => [
      {
        accessorKey: "purchaseOrderNo",
        header: "PO",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.purchaseOrderNo}</p>
            <p className="truncate text-xs text-stone-500">{row.original.supplierName ?? "No supplier"}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "locationName",
        header: "Receiving",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.locationName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.storeName ?? row.original.locationCode}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      { accessorKey: "status", header: "Status" },
      {
        accessorKey: "orderedQuantity",
        header: "Ordered",
        cell: ({ row }) => numberFormatter.format(row.original.orderedQuantity)
      },
      {
        accessorKey: "receivedQuantity",
        header: "Received",
        cell: ({ row }) => numberFormatter.format(row.original.receivedQuantity)
      },
      {
        accessorKey: "outstandingQuantity",
        header: "Outstanding",
        cell: ({ row }) => numberFormatter.format(row.original.outstandingQuantity)
      },
      {
        accessorKey: "grandTotalAmount",
        header: "Value",
        cell: ({ row }) => currencyFormatter.format(row.original.grandTotalAmount)
      },
      {
        accessorKey: "updatedAtLabel",
        header: "Updated",
        cell: ({ row }) => renderTimestamp(row.original.updatedAt, row.original.updatedAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter]
  );

  const goodsReceiptReportColumns = useMemo<ColumnDef<GoodsReceiptReportRow>[]>(
    () => [
      {
        accessorKey: "goodsReceiptNo",
        header: "GRN",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.goodsReceiptNo}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.purchaseOrderNo ?? "Manual receipt"}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "supplierName",
        header: "Supplier",
        cell: ({ row }) => row.original.supplierName ?? "No supplier"
      },
      {
        accessorKey: "locationName",
        header: "Location",
        cell: ({ row }) => `${row.original.locationName}${row.original.storeName ? ` - ${row.original.storeName}` : ""}`
      },
      {
        accessorKey: "totalQuantity",
        header: "Qty",
        cell: ({ row }) => numberFormatter.format(row.original.totalQuantity)
      },
      {
        accessorKey: "lineCount",
        header: "Lines",
        cell: ({ row }) => numberFormatter.format(row.original.lineCount)
      },
      {
        accessorKey: "receivedAtLabel",
        header: "Received",
        cell: ({ row }) => renderTimestamp(row.original.receivedAt, row.original.receivedAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const transferReportColumns = useMemo<ColumnDef<TransferReportRow>[]>(
    () => [
      {
        accessorKey: "transferNo",
        header: "Transfer",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.transferNo}</p>
            <p className="truncate text-xs text-stone-500">{row.original.transferBatchNo ?? row.original.origin}</p>
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
        accessorKey: "sourceStoreName",
        header: "From",
        cell: ({ row }) => `${row.original.sourceStoreName} - ${row.original.sourceLocationCode}`
      },
      {
        accessorKey: "destinationStoreName",
        header: "To",
        cell: ({ row }) => `${row.original.destinationStoreName} - ${row.original.destinationLocationCode}`
      },
      { accessorKey: "status", header: "Status" },
      {
        accessorKey: "requestedQuantity",
        header: "Requested",
        cell: ({ row }) => numberFormatter.format(row.original.requestedQuantity)
      },
      {
        accessorKey: "issuedQuantity",
        header: "Issued",
        cell: ({ row }) => numberFormatter.format(row.original.issuedQuantity)
      },
      {
        accessorKey: "receivedQuantity",
        header: "Received",
        cell: ({ row }) => numberFormatter.format(row.original.receivedQuantity)
      },
      {
        accessorKey: "inTransitQuantity",
        header: "In transit",
        cell: ({ row }) => numberFormatter.format(row.original.inTransitQuantity)
      }
    ],
    []
  );

  const fuelDailyReportColumns = useMemo<ColumnDef<FuelDailyReportRow>[]>(
    () => [
      {
        accessorKey: "tankCode",
        header: "Tank",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.tankCode}</p>
            <p className="truncate text-xs text-stone-500">{row.original.tankName}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "storeName",
        header: "Shop / station",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.storeName ?? row.original.siteName ?? "Unassigned"}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.stationName ?? row.original.siteCode ?? row.original.storeCode ?? "No station"}
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
            <p className="truncate font-medium text-stone-900">
              {row.original.productName ?? "No product"}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.productCode ?? "Not linked"} / {row.original.uomCode}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "currentBookQuantity",
        header: "Book qty",
        cell: ({ row }) => numberFormatter.format(row.original.currentBookQuantity)
      },
      {
        accessorKey: "latestDipQuantity",
        header: "Last dip",
        cell: ({ row }) =>
          row.original.latestDipQuantity === null
            ? "Not dipped"
            : numberFormatter.format(row.original.latestDipQuantity)
      },
      {
        accessorKey: "latestWaterQuantity",
        header: "Water",
        cell: ({ row }) =>
          row.original.latestWaterQuantity === null
            ? "Not recorded"
            : numberFormatter.format(row.original.latestWaterQuantity)
      },
      {
        accessorKey: "meterSalesQuantity",
        header: "Meter sales",
        cell: ({ row }) => numberFormatter.format(row.original.meterSalesQuantity)
      },
      {
        accessorKey: "meterSalesAmount",
        header: "Meter value",
        cell: ({ row }) => currencyFormatter.format(row.original.meterSalesAmount)
      },
      {
        accessorKey: "reconciliationGainLossQuantity",
        header: "Gain/loss",
        cell: ({ row }) => numberFormatter.format(row.original.reconciliationGainLossQuantity)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.status}
            tone={
              row.original.status === "Reconciled"
                ? "success"
                : row.original.status === "No activity"
                  ? "default"
                  : "warning"
            }
          />
        )
      },
      {
        accessorKey: "lastActivityAt",
        header: "Last activity",
        cell: ({ row }) => formatReportDateTime(row.original.lastActivityAt),
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter]
  );

  const supplierReportColumns = useMemo<ColumnDef<SupplierReportRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Supplier",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.name}</p>
            <p className="truncate text-xs text-stone-500">{row.original.supplierNo}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      { accessorKey: "contactName", header: "Contact" },
      { accessorKey: "phone", header: "Phone" },
      { accessorKey: "email", header: "Email" },
      { accessorKey: "status", header: "Status" },
      {
        accessorKey: "linkedProductCount",
        header: "Products",
        cell: ({ row }) => numberFormatter.format(row.original.linkedProductCount)
      },
      {
        accessorKey: "openPurchaseOrderCount",
        header: "Open POs",
        cell: ({ row }) => numberFormatter.format(row.original.openPurchaseOrderCount)
      },
      {
        accessorKey: "openSupplierClaimCount",
        header: "Open claims",
        cell: ({ row }) => numberFormatter.format(row.original.openSupplierClaimCount)
      }
    ],
    []
  );

  const userReportColumns = useMemo<ColumnDef<UserReportRow>[]>(
    () => [
      {
        accessorKey: "displayName",
        header: "User",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.displayName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.loginId}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      { accessorKey: "email", header: "Email" },
      { accessorKey: "accountStatus", header: "Status" },
      {
        accessorKey: "homeStoreName",
        header: "Home store",
        cell: ({ row }) => row.original.homeStoreName ?? "Any branch"
      },
      {
        accessorKey: "roleCodes",
        header: "Roles",
        cell: ({ row }) => row.original.roleCodes.join(", ") || "No role",
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "cashierEligible",
        header: "Cashier",
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.cashierEligible ? "Yes" : "No"}
            tone={row.original.cashierEligible ? "success" : "default"}
          />
        )
      },
      {
        accessorKey: "supervisorEligible",
        header: "Supervisor",
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.supervisorEligible ? "Yes" : "No"}
            tone={row.original.supervisorEligible ? "success" : "default"}
          />
        )
      }
    ],
    []
  );

  const reportCatalog = useMemo<ReportCatalogGroup[]>(
    () => [
      {
        label: "Finance and KPIs",
        reports: [
          {
            id: "kpiScorecard",
            label: "HQ KPI scorecard",
            description: "Revenue, margin, expense, and inventory risk KPIs.",
            rowCount: dashboard.kpiScorecardRows.length,
          },
          {
            id: "profitAndLoss",
            label: "Profit and loss snapshot",
            description: "Revenue, tax, COGS, tracked expenses, and operating result.",
            rowCount: dashboard.profitAndLossRows.length,
          },
          {
            id: "cogs",
            label: "COGS and margin",
            description: "Item-level COGS, gross profit, and margin by shop.",
            rowCount: dashboard.cogsReportRows.length,
          },
          {
            id: "expenseTracking",
            label: "Expense tracking",
            description: "PO charges, cash shortages, and supplier recovery exposure.",
            rowCount: dashboard.expenseTrackingRows.length,
          },
          {
            id: "customerStatements",
            label: "Customer statements",
            description: "Customer AR statement activity with running balances.",
            rowCount: dashboard.customerStatementRows.length,
          },
          {
            id: "supplierStatements",
            label: "Supplier statements",
            description: "Supplier AP statement activity with vouchers and running balances.",
            rowCount: dashboard.supplierStatementRows.length,
          }
        ]
      },
      {
        label: "Sales and tenders",
        reports: [
          {
            id: "tenders",
            label: "Tender summary",
            description: "Payment method value, transactions, and share.",
            rowCount: dashboard.tenderReportRows.length,
          },
          {
            id: "receipts",
            label: "Receipt history",
            description: "Posted receipts with tender and basket summaries.",
            rowCount: dashboard.receiptReportRows.length,
          },
          {
            id: "cashierSales",
            label: "Cashier sales",
            description: "Cashier sales value, receipt count, and average basket.",
            rowCount: dashboard.cashierSalesRows.length,
          },
          {
            id: "itemSales",
            label: "Item sales",
            description: "Product movement, discount, and net sales by shop.",
            rowCount: dashboard.itemSalesRows.length,
          },
          {
            id: "promotionPerformance",
            label: "Promotion performance",
            description: "Promotion discounts, lines, receipts, and sales impact.",
            rowCount: dashboard.promotionPerformanceRows.length,
          },
          {
            id: "storePerformance",
            label: "Sales by store",
            description: "Revenue, transaction count, basket value, and exceptions.",
            rowCount: dashboard.storePerformanceRows.length,
          },
          {
            id: "salesOrders",
            label: "Sales orders",
            description: "Store-created holds and fulfilment status.",
            rowCount: dashboard.salesOrderRows.length,
          },
          {
            id: "closeouts",
            label: "Cash closeouts",
            description: "Declared, banked, and remaining store cash.",
            rowCount: dashboard.closeoutRows.length,
          },
          {
            id: "cashierVariance",
            label: "Cashier variance",
            description: "Closeout variance and banked cash by cashier.",
            rowCount: dashboard.cashierVarianceRows.length,
          }
        ]
      },
      {
        label: "Purchasing",
        reports: [
          {
            id: "purchaseOrders",
            label: "Purchase orders",
            description: "PO status, supplier, receiving progress, and value.",
            rowCount: dashboard.purchaseOrderReportRows.length,
          },
          {
            id: "goodsReceipts",
            label: "Goods receipts",
            description: "GRN history by supplier, PO, location, and quantity.",
            rowCount: dashboard.goodsReceiptReportRows.length,
          },
          {
            id: "suppliers",
            label: "Suppliers",
            description: "Supplier contact, product links, open POs, and claims.",
            rowCount: dashboard.supplierReportRows.length,
          }
        ]
      },
      {
        label: "Inventory",
        reports: [
          {
            id: "transfers",
            label: "Inter-store transfers",
            description: "Transfer request, issue, receipt, and in-transit state.",
            rowCount: dashboard.transferReportRows.length,
          },
          {
            id: "inventoryRisk",
            label: "Inventory risk",
            description: "Negative stock and stale movement locations.",
            rowCount: dashboard.inventoryRiskRows.length,
          },
          {
            id: "stockValuation",
            label: "Stock valuation",
            description: "On-hand quantity, cost, and stock value by location.",
            rowCount: dashboard.stockValuationRows.length,
          },
          {
            id: "slowMovingItems",
            label: "Slow-moving items",
            description: "Stocked items with no sales or stale sales movement.",
            rowCount: dashboard.slowMovingItemRows.length,
          }
        ]
      },
      {
        label: "Fuel operations",
        reports: [
          {
            id: "fuelDaily",
            label: "Daily station fuel report",
            description: "Tank dips, meter readings, book stock, and reconciliation gain/loss by shop.",
            rowCount: dashboard.fuelDailyReportRows.length,
          }
        ]
      },
      {
        label: "Customers and security",
        reports: [
          {
            id: "receivables",
            label: "Customer receivables",
            description: "Credit-enabled customers and outstanding exposure.",
            rowCount: dashboard.receivableRows.length,
          },
          {
            id: "users",
            label: "User access",
            description: "Users, home store, roles, cashier and supervisor access.",
            rowCount: dashboard.userReportRows.length,
          }
        ]
      },
      {
        label: "Controls",
        reports: [
          {
            id: "promotions",
            label: "Promotions",
            description: "Commercial rules, discount posture, and status.",
            rowCount: dashboard.promotionRows.length,
          },
          {
            id: "exceptions",
            label: "POS exceptions",
            description: "Store events blocking clean enterprise posting.",
            rowCount: dashboard.exceptionRows.length,
          }
        ]
      }
    ],
    [dashboard]
  );

  function getStatusOptions(reportId: ReportId) {
    switch (reportId) {
      case "kpiScorecard":
        return buildChoiceOptions(dashboard.kpiScorecardRows.map((row) => row.status));
      case "profitAndLoss":
        return buildChoiceOptions(dashboard.profitAndLossRows.map((row) => row.lineType));
      case "expenseTracking":
        return buildChoiceOptions(dashboard.expenseTrackingRows.map((row) => row.status));
      case "customerStatements":
        return buildChoiceOptions(dashboard.customerStatementRows.map((row) => row.status));
      case "supplierStatements":
        return buildChoiceOptions(dashboard.supplierStatementRows.map((row) => row.status));
      case "slowMovingItems":
        return buildChoiceOptions(dashboard.slowMovingItemRows.map((row) => row.riskBand));
      case "salesOrders":
        return buildChoiceOptions(dashboard.salesOrderRows.map((row) => row.status));
      case "purchaseOrders":
        return buildChoiceOptions(dashboard.purchaseOrderReportRows.map((row) => row.status));
      case "suppliers":
        return buildChoiceOptions(dashboard.supplierReportRows.map((row) => row.status));
      case "transfers":
        return buildChoiceOptions(dashboard.transferReportRows.map((row) => row.status));
      case "fuelDaily":
        return buildChoiceOptions(dashboard.fuelDailyReportRows.map((row) => row.status));
      case "users":
        return buildChoiceOptions(dashboard.userReportRows.map((row) => row.accountStatus));
      case "promotions":
        return buildChoiceOptions(dashboard.promotionRows.map((row) => row.status));
      case "exceptions":
        return buildChoiceOptions(dashboard.exceptionRows.map((row) => row.status));
      default:
        return [];
    }
  }

  function getSupplierOptions(reportId: ReportId) {
    switch (reportId) {
      case "purchaseOrders":
        return buildChoiceOptions(
          dashboard.purchaseOrderReportRows.flatMap((row) => [row.supplierNo, row.supplierName])
        );
      case "goodsReceipts":
        return buildChoiceOptions(
          dashboard.goodsReceiptReportRows.flatMap((row) => [row.supplierNo, row.supplierName])
        );
      case "suppliers":
        return buildChoiceOptions(
          dashboard.supplierReportRows.flatMap((row) => [row.supplierNo, row.name])
        );
      case "expenseTracking":
        return buildChoiceOptions(dashboard.expenseTrackingRows.map((row) => row.supplierName));
      default:
        return [];
    }
  }

  function getLocationOptions(reportId: ReportId) {
    switch (reportId) {
      case "purchaseOrders":
        return buildChoiceOptions(
          dashboard.purchaseOrderReportRows.flatMap((row) => [
            row.locationCode,
            row.locationName,
            row.storeCode,
            row.storeName
          ])
        );
      case "goodsReceipts":
        return buildChoiceOptions(
          dashboard.goodsReceiptReportRows.flatMap((row) => [
            row.locationCode,
            row.locationName,
            row.storeCode,
            row.storeName
          ])
        );
      case "transfers":
        return buildChoiceOptions(
          dashboard.transferReportRows.flatMap((row) => [
            row.sourceStoreName,
            row.sourceLocationCode,
            row.destinationStoreName,
            row.destinationLocationCode
          ])
        );
      case "inventoryRisk":
        return buildChoiceOptions(
          dashboard.inventoryRiskRows.flatMap((row) => [
            row.locationCode,
            row.locationName,
            row.storeName,
            row.warehouseName
          ])
        );
      case "stockValuation":
        return buildChoiceOptions(
          dashboard.stockValuationRows.flatMap((row) => [
            row.locationCode,
            row.locationName,
            row.storeCode,
            row.storeName,
            row.warehouseCode,
            row.warehouseName
          ])
        );
      case "expenseTracking":
        return buildChoiceOptions(
          dashboard.expenseTrackingRows.flatMap((row) => [row.storeCode, row.storeName])
        );
      case "slowMovingItems":
        return buildChoiceOptions(
          dashboard.slowMovingItemRows.flatMap((row) => [
            row.locationCode,
            row.locationName,
            row.storeCode,
            row.storeName,
            row.warehouseName
          ])
        );
      case "fuelDaily":
        return buildChoiceOptions(
          dashboard.fuelDailyReportRows.flatMap((row) => [
            row.storeCode,
            row.storeName,
            row.stationCode,
            row.stationName,
            row.siteCode,
            row.siteName,
            row.tankCode,
            row.tankName
          ])
        );
      default:
        return [];
    }
  }

  function getTenderOptions(reportId: ReportId) {
    if (reportId === "tenders") {
      return buildChoiceOptions(
        dashboard.tenderReportRows.flatMap((row) => [
          row.tenderCode,
          row.tenderName,
          row.paymentMethod
        ])
      );
    }

    if (reportId === "receipts") {
      return buildChoiceOptions(dashboard.receiptReportRows.map((row) => row.tenderSummary));
    }

    return [];
  }

  function getRoleOptions(reportId: ReportId) {
    if (reportId !== "users") {
      return [];
    }

    return buildChoiceOptions(dashboard.userReportRows.flatMap((row) => row.roleCodes));
  }

  function getCashierOptions(reportId: ReportId) {
    switch (reportId) {
      case "cashierSales":
        return buildChoiceOptions(dashboard.cashierSalesRows.map((row) => row.cashierCode));
      case "receipts":
        return buildChoiceOptions(dashboard.receiptReportRows.map((row) => row.cashierCode));
      case "cashierVariance":
      case "closeouts":
        return buildChoiceOptions(
          [
            ...dashboard.cashierVarianceRows.map((row) => row.cashierCode),
            ...dashboard.closeoutRows.map((row) => row.cashierCode)
          ]
        );
      default:
        return [];
    }
  }

  function getProductOptions(reportId: ReportId) {
    switch (reportId) {
      case "itemSales":
        return buildChoiceOptions(
          dashboard.itemSalesRows.flatMap((row) => [
            row.productCode,
            row.productName,
            row.department,
            row.category
          ])
        );
      case "stockValuation":
        return buildChoiceOptions(
          dashboard.stockValuationRows.flatMap((row) => [row.productCode, row.productName])
        );
      case "cogs":
        return buildChoiceOptions(
          dashboard.cogsReportRows.flatMap((row) => [
            row.productCode,
            row.productName,
            row.department,
            row.category
          ])
        );
      case "slowMovingItems":
        return buildChoiceOptions(
          dashboard.slowMovingItemRows.flatMap((row) => [row.productCode, row.productName])
        );
      case "fuelDaily":
        return buildChoiceOptions(
          dashboard.fuelDailyReportRows.flatMap((row) => [row.productCode, row.productName])
        );
      default:
        return [];
    }
  }

  function getPromotionOptions(reportId: ReportId) {
    if (reportId !== "promotionPerformance") {
      return [];
    }

    return buildChoiceOptions(
      dashboard.promotionPerformanceRows.flatMap((row) => [
        row.promotionCode,
        row.promotionName
      ])
    );
  }

  function getCategoryOptions(reportId: ReportId) {
    switch (reportId) {
      case "kpiScorecard":
        return buildChoiceOptions(dashboard.kpiScorecardRows.map((row) => row.group));
      case "profitAndLoss":
        return buildChoiceOptions(dashboard.profitAndLossRows.map((row) => row.section));
      case "expenseTracking":
        return buildChoiceOptions(dashboard.expenseTrackingRows.map((row) => row.category));
      case "cogs":
        return buildChoiceOptions(
          dashboard.cogsReportRows.flatMap((row) => [row.department, row.category])
        );
      default:
        return [];
    }
  }

  function renderChoiceFilter({
    label,
    value,
    options,
    onChange
  }: {
    label: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
  }) {
    if (options.length === 0) {
      return null;
    }

    return (
      <label className="grid min-w-0 gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
        {label}
        <select
          className="h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-stone-800 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          <option value="">All {label.toLowerCase()}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderScopeCriteria(reportId: ReportId) {
    const showStore = reportsWithStoreScope.has(reportId);
    const showDate = reportsWithDateScope.has(reportId);

    if (!showStore && !showDate) {
      return null;
    }

    return (
      <form
        action="/reports"
        className="min-w-0"
        method="get"
      >
        <input name="report" type="hidden" value={reportId} />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Scope</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {showStore ? (
            <label className="grid min-w-0 gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500 sm:col-span-2">
              Shop
              <select
                className="h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-stone-800 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                defaultValue={dashboard.filters.storeCode}
                name="shop"
              >
                <option value="">All shops</option>
                {dashboard.shopOptions.map((shop) => (
                  <option key={shop.storeCode} value={shop.storeCode}>
                    {shop.storeName} ({shop.storeCode})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {showDate ? (
            <>
              <label className="grid min-w-0 gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                From
                <input
                  className="h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-stone-800 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                  defaultValue={dashboard.filters.dateFrom}
                  name="from"
                  type="date"
                />
              </label>
              <label className="grid min-w-0 gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                To
                <input
                  className="h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-stone-800 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                  defaultValue={dashboard.filters.dateTo}
                  name="to"
                  type="date"
                />
              </label>
            </>
          ) : null}

          <div className="flex min-w-0 items-end gap-2 sm:col-span-2 xl:col-span-4">
            <button
              className="inline-flex h-11 items-center rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-[1.03]"
              type="submit"
            >
              Apply
            </button>
            <a
              className="inline-flex h-11 items-center rounded-lg border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              href={`/reports?report=${reportId}`}
            >
              Reset
            </a>
          </div>
        </div>
      </form>
    );
  }

  function renderReportCriteriaPanel(reportId: ReportId) {
    const filters = getReportFilterValues(reportId);
    const statusOptions = getStatusOptions(reportId);
    const tenderOptions = getTenderOptions(reportId);
    const supplierOptions = getSupplierOptions(reportId);
    const locationOptions = getLocationOptions(reportId);
    const roleOptions = getRoleOptions(reportId);
    const cashierOptions = getCashierOptions(reportId);
    const productOptions = getProductOptions(reportId);
    const promotionOptions = getPromotionOptions(reportId);
    const categoryOptions = getCategoryOptions(reportId);
    const hasLocalFilter =
      filters.status ||
      filters.tender ||
      filters.supplier ||
      filters.location ||
      filters.role ||
      filters.credit ||
      filters.cashier ||
      filters.product ||
      filters.promotion ||
      filters.category;

    const hasReportFilters =
      statusOptions.length > 0 ||
      tenderOptions.length > 0 ||
      supplierOptions.length > 0 ||
      locationOptions.length > 0 ||
      roleOptions.length > 0 ||
      cashierOptions.length > 0 ||
      productOptions.length > 0 ||
      promotionOptions.length > 0 ||
      categoryOptions.length > 0 ||
      reportId === "receivables";
    const scopeCriteria = renderScopeCriteria(reportId);

    if (!scopeCriteria && !hasReportFilters) {
      return null;
    }

    return (
      <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-stone-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-600">
            Report criteria
          </h2>
          {hasLocalFilter ? (
            <button
              className="inline-flex h-10 w-fit items-center rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              onClick={() => clearReportFilters(reportId)}
              type="button"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {scopeCriteria}
          {hasReportFilters ? (
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Report filters
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {renderChoiceFilter({
                  label: "Status",
                  value: filters.status,
                  options: statusOptions,
                  onChange: (value) => updateReportFilter(reportId, "status", value)
                })}
                {renderChoiceFilter({
                  label: "Tender",
                  value: filters.tender,
                  options: tenderOptions,
                  onChange: (value) => updateReportFilter(reportId, "tender", value)
                })}
                {renderChoiceFilter({
                  label: "Supplier",
                  value: filters.supplier,
                  options: supplierOptions,
                  onChange: (value) => updateReportFilter(reportId, "supplier", value)
                })}
                {renderChoiceFilter({
                  label: "Location",
                  value: filters.location,
                  options: locationOptions,
                  onChange: (value) => updateReportFilter(reportId, "location", value)
                })}
                {renderChoiceFilter({
                  label: "Role",
                  value: filters.role,
                  options: roleOptions,
                  onChange: (value) => updateReportFilter(reportId, "role", value)
                })}
                {renderChoiceFilter({
                  label: "Cashier",
                  value: filters.cashier,
                  options: cashierOptions,
                  onChange: (value) => updateReportFilter(reportId, "cashier", value)
                })}
                {renderChoiceFilter({
                  label: "Product",
                  value: filters.product,
                  options: productOptions,
                  onChange: (value) => updateReportFilter(reportId, "product", value)
                })}
                {renderChoiceFilter({
                  label: "Promotion",
                  value: filters.promotion,
                  options: promotionOptions,
                  onChange: (value) => updateReportFilter(reportId, "promotion", value)
                })}
                {renderChoiceFilter({
                  label: "Category",
                  value: filters.category,
                  options: categoryOptions,
                  onChange: (value) => updateReportFilter(reportId, "category", value)
                })}
                {reportId === "receivables" ? (
                  <label className="grid min-w-0 gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Credit
                    <select
                      className="h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-stone-800 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                      onChange={(event) =>
                        updateReportFilter(reportId, "credit", event.target.value)
                      }
                      value={filters.credit}
                    >
                      <option value="">All credit</option>
                      <option value="enabled">Enabled</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </label>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  const selectedReport = reportCatalog
    .flatMap((group) => group.reports)
    .find((report) => report.id === selectedReportId);

  function openReport(reportId: ReportId) {
    setSelectedReportId(reportId);
  }

  function renderSelectedReportGrid(reportId: ReportId) {
    const filters = getReportFilterValues(reportId);

    switch (reportId) {
      case "kpiScorecard":
        return (
          <SharedDataGrid
            columns={kpiScorecardColumns}
            data={dashboard.kpiScorecardRows.filter(
              (row) =>
                matchesChoice(filters.status, [row.status]) &&
                matchesChoice(filters.category, [row.group])
            )}
            emptyLabel="No KPI scorecard rows are available for this report."
            exportFileName="flash-erp-hq-kpi-scorecard"
            globalFilterFn={kpiScorecardFilter}
            initialPageSize={12}
            searchPlaceholder="Search KPIs, groups, status, or basis"
          />
        );
      case "profitAndLoss":
        return (
          <SharedDataGrid
            columns={profitAndLossColumns}
            data={dashboard.profitAndLossRows
              .filter(
                (row) =>
                  matchesChoice(filters.status, [row.lineType]) &&
                  matchesChoice(filters.category, [row.section])
              )
              .sort((left, right) => left.sortOrder - right.sortOrder)}
            emptyLabel="No profit and loss rows are available for this report."
            exportFileName="flash-erp-hq-profit-and-loss"
            globalFilterFn={profitAndLossFilter}
            initialPageSize={12}
            searchPlaceholder="Search sections, lines, or basis"
          />
        );
      case "cogs":
        return (
          <SharedDataGrid
            columns={cogsReportColumns}
            data={dashboard.cogsReportRows.filter(
              (row) =>
                matchesStoreScope([row.storeCode, row.store]) &&
                matchesDate(row.lastSoldAt) &&
                matchesChoice(filters.product, [
                  row.productCode,
                  row.productName,
                  row.department,
                  row.category
                ]) &&
                matchesChoice(filters.category, [row.department, row.category])
            )}
            emptyLabel="No COGS rows are available for this report."
            exportFileName="flash-erp-hq-cogs-margin"
            globalFilterFn={cogsReportFilter}
            initialPageSize={12}
            initialSorting={[{ id: "cogsAmount", desc: true }]}
            searchPlaceholder="Search items, departments, categories, or stores"
          />
        );
      case "expenseTracking":
        return (
          <SharedDataGrid
            columns={expenseTrackingColumns}
            data={dashboard.expenseTrackingRows.filter(
              (row) =>
                matchesStoreScope([row.storeCode, row.storeName]) &&
                matchesDate(row.incurredAt) &&
                matchesChoice(filters.status, [row.status]) &&
                matchesChoice(filters.supplier, [row.supplierName]) &&
                matchesChoice(filters.location, [row.storeCode, row.storeName]) &&
                matchesChoice(filters.category, [row.category])
            )}
            emptyLabel="No expense tracking rows are available for this report."
            exportFileName="flash-erp-hq-expense-tracking"
            globalFilterFn={expenseTrackingFilter}
            initialPageSize={12}
            initialSorting={[{ id: "incurredAtLabel", desc: true }]}
            searchPlaceholder="Search expenses, references, suppliers, or stores"
          />
        );
      case "tenders":
        return (
          <SharedDataGrid
            columns={tenderReportColumns}
            data={dashboard.tenderReportRows.filter((row) =>
              matchesChoice(filters.tender, [
                row.tenderCode,
                row.tenderName,
                row.paymentMethod
              ])
            )}
            emptyLabel="No tender reporting rows are available for this report."
            exportFileName="flash-erp-hq-tender-report"
            globalFilterFn={tenderReportFilter}
            initialPageSize={12}
            initialSorting={[{ id: "netAmount", desc: true }]}
            searchPlaceholder="Search tender code, name, or method"
          />
        );
      case "receipts":
        return (
          <SharedDataGrid
            columns={receiptReportColumns}
            data={dashboard.receiptReportRows.filter(
              (row) =>
                matchesStoreScope([row.storeCode, row.store]) &&
                matchesDate(row.completedAt) &&
                matchesChoice(filters.tender, [row.tenderSummary]) &&
                matchesChoice(filters.cashier, [row.cashierCode])
            )}
            emptyLabel="No receipt reporting rows are available for this report."
            exportFileName="flash-erp-hq-receipt-report"
            globalFilterFn={receiptReportFilter}
            initialPageSize={12}
            initialSorting={[{ id: "completedAtLabel", desc: true }]}
            searchPlaceholder="Search receipts, stores, tenders, or products"
          />
        );
      case "cashierSales":
        return (
          <SharedDataGrid
            columns={cashierSalesColumns}
            data={dashboard.cashierSalesRows.filter(
              (row) =>
                matchesStoreScope([row.storeCode, row.store]) &&
                matchesDate(row.lastSaleAt) &&
                matchesChoice(filters.cashier, [row.cashierCode])
            )}
            emptyLabel="No cashier sales rows are available for this report."
            exportFileName="flash-erp-cashier-sales"
            globalFilterFn={cashierSalesFilter}
            initialPageSize={12}
            initialSorting={[{ id: "netSales", desc: true }]}
            searchPlaceholder="Search cashiers or stores"
          />
        );
      case "itemSales":
        return (
          <SharedDataGrid
            columns={itemSalesColumns}
            data={dashboard.itemSalesRows.filter(
              (row) =>
                matchesStoreScope([row.storeCode, row.store]) &&
                matchesDate(row.lastSoldAt) &&
                matchesChoice(filters.product, [
                  row.productCode,
                  row.productName,
                  row.department,
                  row.category
                ])
            )}
            emptyLabel="No item sales rows are available for this report."
            exportFileName="flash-erp-item-sales"
            globalFilterFn={itemSalesFilter}
            initialPageSize={12}
            initialSorting={[{ id: "netSales", desc: true }]}
            searchPlaceholder="Search items, departments, categories, or stores"
          />
        );
      case "promotionPerformance":
        return (
          <SharedDataGrid
            columns={promotionPerformanceColumns}
            data={dashboard.promotionPerformanceRows.filter(
              (row) =>
                matchesStoreScope([row.storeCode, row.store]) &&
                matchesDate(row.lastAppliedAt) &&
                matchesChoice(filters.promotion, [row.promotionCode, row.promotionName])
            )}
            emptyLabel="No promotion performance rows are available for this report."
            exportFileName="flash-erp-promotion-performance"
            globalFilterFn={promotionPerformanceFilter}
            initialPageSize={12}
            initialSorting={[{ id: "discountAmount", desc: true }]}
            searchPlaceholder="Search promotions or stores"
          />
        );
      case "storePerformance":
        return (
          <SharedDataGrid
            columns={storePerformanceColumns}
            data={dashboard.storePerformanceRows.filter(
              (row) =>
                matchesStoreScope([row.storeCode, row.store]) &&
                matchesDate(row.lastActivityAt)
            )}
            emptyLabel="No store performance rows are available for this report."
            exportFileName="flash-erp-store-performance"
            globalFilterFn={storePerformanceFilter}
            initialPageSize={12}
            initialSorting={[{ id: "salesValue", desc: true }]}
            searchPlaceholder="Search stores, codes, or node IDs"
          />
        );
      case "salesOrders":
        return (
          <SharedDataGrid
            columns={salesOrderColumns}
            data={dashboard.salesOrderRows.filter(
              (row) =>
                matchesStoreScope([row.storeCode, row.store]) &&
                matchesDate(row.updatedAt) &&
                matchesChoice(filters.status, [row.status])
            )}
            emptyLabel="No sales-order rows are available for this report."
            exportFileName="flash-erp-sales-order-watchlist"
            globalFilterFn={salesOrderFilter}
            initialPageSize={12}
            searchPlaceholder="Search orders, stores, customers, or basket references"
          />
        );
      case "closeouts":
        return (
          <SharedDataGrid
            columns={closeoutColumns}
            data={dashboard.closeoutRows.filter(
              (row) =>
                matchesStoreScope([row.storeCode, row.store]) &&
                matchesDate(row.reconciledAt) &&
                matchesChoice(filters.cashier, [row.cashierCode])
            )}
            emptyLabel="No closeout rows are available for this report."
            exportFileName="flash-erp-closeout-watchlist"
            globalFilterFn={closeoutFilter}
            initialPageSize={12}
            searchPlaceholder="Search closeouts, shifts, stores, or cashiers"
          />
        );
      case "cashierVariance":
        return (
          <SharedDataGrid
            columns={cashierVarianceColumns}
            data={dashboard.cashierVarianceRows.filter(
              (row) =>
                matchesStoreScope([row.storeCode, row.store]) &&
                matchesDate(row.lastCloseoutAt) &&
                matchesChoice(filters.cashier, [row.cashierCode])
            )}
            emptyLabel="No cashier variance rows are available for this report."
            exportFileName="flash-erp-cashier-variance"
            globalFilterFn={cashierVarianceFilter}
            initialPageSize={12}
            initialSorting={[{ id: "varianceAmount", desc: true }]}
            searchPlaceholder="Search cashiers or stores"
          />
        );
      case "purchaseOrders":
        return (
          <SharedDataGrid
            columns={purchaseOrderReportColumns}
            data={dashboard.purchaseOrderReportRows.filter(
              (row) =>
                matchesStoreScope([row.storeCode, row.storeName]) &&
                matchesDate(row.updatedAt) &&
                matchesChoice(filters.status, [row.status]) &&
                matchesChoice(filters.supplier, [row.supplierNo, row.supplierName]) &&
                matchesChoice(filters.location, [
                  row.locationCode,
                  row.locationName,
                  row.storeCode,
                  row.storeName
                ])
            )}
            emptyLabel="No purchase-order rows are available for this report."
            exportFileName="flash-erp-hq-purchase-order-report"
            globalFilterFn={purchaseOrderReportFilter}
            initialPageSize={12}
            initialSorting={[{ id: "updatedAtLabel", desc: true }]}
            searchPlaceholder="Search PO, supplier, store, location, or status"
          />
        );
      case "goodsReceipts":
        return (
          <SharedDataGrid
            columns={goodsReceiptReportColumns}
            data={dashboard.goodsReceiptReportRows.filter(
              (row) =>
                matchesStoreScope([row.storeCode, row.storeName]) &&
                matchesDate(row.receivedAt) &&
                matchesChoice(filters.supplier, [row.supplierNo, row.supplierName]) &&
                matchesChoice(filters.location, [
                  row.locationCode,
                  row.locationName,
                  row.storeCode,
                  row.storeName
                ])
            )}
            emptyLabel="No goods-receipt rows are available for this report."
            exportFileName="flash-erp-hq-goods-receipt-report"
            globalFilterFn={goodsReceiptReportFilter}
            initialPageSize={12}
            initialSorting={[{ id: "receivedAtLabel", desc: true }]}
            searchPlaceholder="Search GRN, PO, supplier, store, or location"
          />
        );
      case "suppliers":
        return (
          <SharedDataGrid
            columns={supplierReportColumns}
            data={dashboard.supplierReportRows.filter(
              (row) =>
                matchesDate(row.updatedAt) &&
                matchesChoice(filters.status, [row.status]) &&
                matchesChoice(filters.supplier, [row.supplierNo, row.name])
            )}
            emptyLabel="No supplier rows are available for this report."
            exportFileName="flash-erp-hq-supplier-report"
            globalFilterFn={supplierReportFilter}
            initialPageSize={12}
            searchPlaceholder="Search suppliers, contacts, email, phone, or status"
          />
        );
      case "transfers":
        return (
          <SharedDataGrid
            columns={transferReportColumns}
            data={dashboard.transferReportRows.filter(
              (row) =>
                matchesStoreScope([row.sourceStoreName, row.destinationStoreName]) &&
                matchesDate(row.requestedAt) &&
                matchesChoice(filters.status, [row.status]) &&
                matchesChoice(filters.location, [
                  row.sourceStoreName,
                  row.sourceLocationCode,
                  row.destinationStoreName,
                  row.destinationLocationCode
                ])
            )}
            emptyLabel="No transfer rows are available for this report."
            exportFileName="flash-erp-hq-transfer-report"
            globalFilterFn={transferReportFilter}
            initialPageSize={12}
            initialSorting={[{ id: "requestedAtLabel", desc: true }]}
            searchPlaceholder="Search transfers, products, source, destination, or status"
          />
        );
      case "fuelDaily":
        return (
          <SharedDataGrid
            columns={fuelDailyReportColumns}
            data={dashboard.fuelDailyReportRows.filter(
              (row) =>
                matchesStoreScope([row.storeCode, row.storeName, row.stationName, row.siteName]) &&
                matchesDate(row.lastActivityAt ?? row.reconciliationDate ?? row.latestDipAt ?? row.latestMeterReadingAt) &&
                matchesChoice(filters.status, [row.status]) &&
                matchesChoice(filters.location, [
                  row.storeCode,
                  row.storeName,
                  row.stationCode,
                  row.stationName,
                  row.siteCode,
                  row.siteName,
                  row.tankCode,
                  row.tankName
                ]) &&
                matchesChoice(filters.product, [row.productCode, row.productName])
            )}
            emptyLabel="No fuel daily report rows are available for this scope."
            exportFileName="flash-erp-hq-fuel-daily-report"
            globalFilterFn={fuelDailyReportFilter}
            initialPageSize={12}
            initialSorting={[{ id: "lastActivityAt", desc: true }]}
            searchPlaceholder="Search tanks, products, stations, shops, or reconciliation"
          />
        );
      case "inventoryRisk":
        return (
          <SharedDataGrid
            columns={inventoryRiskColumns}
            data={dashboard.inventoryRiskRows.filter(
              (row) =>
                matchesStoreScope([row.storeName, row.warehouseName]) &&
                matchesDate(row.lastMovementAt) &&
                matchesChoice(filters.location, [
                  row.locationCode,
                  row.locationName,
                  row.storeName,
                  row.warehouseName
                ])
            )}
            emptyLabel="No inventory risk rows are available for this report."
            exportFileName="flash-erp-inventory-risk"
            globalFilterFn={inventoryRiskFilter}
            initialPageSize={12}
            initialSorting={[{ id: "negativePositions", desc: true }]}
            searchPlaceholder="Search location, store, or warehouse"
          />
        );
      case "stockValuation":
        return (
          <SharedDataGrid
            columns={stockValuationColumns}
            data={dashboard.stockValuationRows.filter(
              (row) =>
                matchesStoreScope([row.storeCode, row.storeName, row.warehouseName]) &&
                matchesDate(row.lastMovementAt) &&
                matchesChoice(filters.location, [
                  row.locationCode,
                  row.locationName,
                  row.storeCode,
                  row.storeName,
                  row.warehouseCode,
                  row.warehouseName
                ]) &&
                matchesChoice(filters.product, [row.productCode, row.productName])
            )}
            emptyLabel="No stock valuation rows are available for this report."
            exportFileName="flash-erp-stock-valuation"
            globalFilterFn={stockValuationFilter}
            initialPageSize={12}
            initialSorting={[{ id: "stockValue", desc: true }]}
            searchPlaceholder="Search locations, items, stores, or warehouses"
          />
        );
      case "slowMovingItems":
        return (
          <SharedDataGrid
            columns={slowMovingItemColumns}
            data={dashboard.slowMovingItemRows.filter(
              (row) =>
                matchesStoreScope([row.storeCode, row.storeName, row.warehouseName]) &&
                matchesDate(row.lastMovementAt) &&
                matchesChoice(filters.status, [row.riskBand]) &&
                matchesChoice(filters.location, [
                  row.locationCode,
                  row.locationName,
                  row.storeCode,
                  row.storeName,
                  row.warehouseName
                ]) &&
                matchesChoice(filters.product, [row.productCode, row.productName])
            )}
            emptyLabel="No slow-moving item rows are available for this report."
            exportFileName="flash-erp-slow-moving-items"
            globalFilterFn={slowMovingItemFilter}
            initialPageSize={12}
            initialSorting={[{ id: "stockValue", desc: true }]}
            searchPlaceholder="Search slow movers by item, location, store, or risk"
          />
        );
      case "receivables":
        return (
          <SharedDataGrid
            columns={receivableColumns}
            data={dashboard.receivableRows.filter(
              (row) =>
                matchesStoreScope([row.homeStoreName]) &&
                matchesDate(row.lastTransactionAt) &&
                (filters.credit === ""
                  ? true
                  : filters.credit === "enabled"
                    ? row.allowCreditSales
                    : !row.allowCreditSales)
            )}
            emptyLabel="No receivable rows are available for this report."
            exportFileName="flash-erp-customer-receivables"
            globalFilterFn={receivableFilter}
            initialPageSize={12}
            initialSorting={[{ id: "receivableBalanceAmount", desc: true }]}
            searchPlaceholder="Search customers, numbers, or home stores"
          />
        );
      case "customerStatements":
        return (
          <SharedDataGrid
            columns={statementReportColumns}
            data={dashboard.customerStatementRows.filter(
              (row) => matchesDate(row.transactionDate) && matchesChoice(filters.status, [row.status])
            )}
            emptyLabel="No customer statement activity is available for this report."
            exportFileName="flash-erp-customer-statements"
            globalFilterFn={statementReportFilter}
            initialPageSize={20}
            searchPlaceholder="Search customer statements, references, journals, or memo"
          />
        );
      case "supplierStatements":
        return (
          <SharedDataGrid
            columns={statementReportColumns}
            data={dashboard.supplierStatementRows.filter(
              (row) => matchesDate(row.transactionDate) && matchesChoice(filters.status, [row.status])
            )}
            emptyLabel="No supplier statement activity is available for this report."
            exportFileName="flash-erp-supplier-statements"
            globalFilterFn={statementReportFilter}
            initialPageSize={20}
            searchPlaceholder="Search supplier statements, vouchers, journals, or memo"
          />
        );
      case "users":
        return (
          <SharedDataGrid
            columns={userReportColumns}
            data={dashboard.userReportRows.filter(
              (row) =>
                matchesStoreScope([row.homeStoreCode, row.homeStoreName]) &&
                matchesDate(row.updatedAt) &&
                matchesChoice(filters.status, [row.accountStatus]) &&
                matchesChoice(filters.role, row.roleCodes)
            )}
            emptyLabel="No user rows are available for this report."
            exportFileName="flash-erp-hq-user-access-report"
            globalFilterFn={userReportFilter}
            initialPageSize={12}
            searchPlaceholder="Search users, roles, stores, email, or status"
          />
        );
      case "promotions":
        return (
          <SharedDataGrid
            columns={promotionColumns}
            data={dashboard.promotionRows.filter(
              (row) => matchesDate(row.updatedAt) && matchesChoice(filters.status, [row.status])
            )}
            emptyLabel="No promotion rows are available for this report."
            exportFileName="flash-erp-promotion-report"
            globalFilterFn={promotionFilter}
            initialPageSize={12}
            searchPlaceholder="Search promotions, scope, or status"
          />
        );
      case "exceptions":
        return (
          <SharedDataGrid
            columns={exceptionColumns}
            data={dashboard.exceptionRows.filter(
              (row) =>
                matchesStoreScope([row.storeCode, row.store]) &&
                matchesDate(row.receivedAt) &&
                matchesChoice(filters.status, [row.status])
            )}
            emptyLabel="No POS exception rows are available for this report."
            exportFileName="flash-erp-pos-exceptions"
            globalFilterFn={exceptionFilter}
            initialPageSize={12}
            searchPlaceholder="Search store, event, or reference"
          />
        );
      default:
        return null;
    }
  }

  if (!selectedReport) {
    return (
      <EnterpriseShell
        activeSection="reports"
        description="Choose a report group and open an export-ready grid."
        eyebrow="HQ reporting"
        heading="Reports"
      >
        <section className="rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Posted revenue", currencyFormatter.format(dashboard.metrics.postedRevenue)],
              ["Gross profit", currencyFormatter.format(dashboard.metrics.grossProfitAmount)],
              ["Gross margin", `${dashboard.metrics.grossMarginPercent.toFixed(2)}%`],
              ["Receipts", numberFormatter.format(dashboard.metrics.receipts)],
              ["Tracked expense", currencyFormatter.format(dashboard.metrics.trackedExpenseAmount)],
              ["Slow movers", numberFormatter.format(dashboard.metrics.slowMovingItems)]
            ].map(([label, value]) => (
              <div className="flex items-center justify-between gap-3 border-b border-stone-100 py-2 last:border-b-0 sm:border-b-0 sm:border-r sm:pr-3 sm:last:border-r-0" key={label}>
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</dt>
                <dd className="text-base font-semibold text-stone-950">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2 2xl:grid-cols-3">
            {canViewHrReports ? (
              <details className="group/report min-w-0" open>
                <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-sm font-semibold text-stone-950">
                  <ChevronDown className="h-4 w-4 shrink-0 text-stone-500 transition group-open/report:rotate-0" />
                  <span className="truncate">Human Resources</span>
                  <span className="ml-auto rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                    1
                  </span>
                </summary>
                <ul className="mt-2 space-y-1 border-l border-stone-200 pl-5">
                  <li>
                    <Link
                      className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-blue-700 transition hover:bg-blue-50 hover:text-blue-900"
                      href="/human-resources/reports"
                    >
                      <FileText className="h-4 w-4 shrink-0 fill-stone-900 text-stone-900" />
                      <span className="min-w-0 flex-1 truncate">HR operational reports</span>
                    </Link>
                  </li>
                </ul>
              </details>
            ) : null}
            {reportCatalog.map((group) => (
              <details className="group/report min-w-0" key={group.label} open>
                <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-sm font-semibold text-stone-950">
                  <ChevronDown className="h-4 w-4 shrink-0 text-stone-500 transition group-open/report:rotate-0" />
                  <span className="truncate">{group.label}</span>
                  <span className="ml-auto rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                    {group.reports.length}
                  </span>
                </summary>
                <ul className="mt-2 space-y-1 border-l border-stone-200 pl-5">
                  {group.reports.map((report) => (
                    <li key={report.id}>
                      <button
                        className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-blue-700 transition hover:bg-blue-50 hover:text-blue-900"
                        onClick={() => openReport(report.id)}
                        title={report.description}
                        type="button"
                      >
                        <FileText className="h-4 w-4 shrink-0 fill-stone-900 text-stone-900" />
                        <span className="min-w-0 flex-1 truncate">{report.label}</span>
                        <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600 group-hover:bg-white">
                          {numberFormatter.format(report.rowCount)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      </EnterpriseShell>
    );
  }

  return (
    <EnterpriseShell
      activeSection="reports"
      description="Review the report grid, search within the results, then export."
      eyebrow="HQ reporting"
      heading={selectedReport.label}
    >
      <section className="glass-panel rounded-[1.35rem] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <button
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
            onClick={() => setSelectedReportId(null)}
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to reports
          </button>
          <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600">
            Refreshed {new Date(dashboard.refreshedAt).toLocaleString()}
          </div>
        </div>
      </section>

      {renderReportCriteriaPanel(selectedReport.id)}

      <section className="glass-panel rounded-[1.35rem] p-4">
        {renderSelectedReportGrid(selectedReport.id)}
      </section>
    </EnterpriseShell>
  );

  return (
    <EnterpriseShell
      activeSection="reports"
      description="Read enterprise sales, branch posture, receivable exposure, stock risk, and promotion activity from one reporting workspace built for Flash ERP operations."
      eyebrow="Enterprise reporting"
      heading="Reports"
    >
      <section className="grid gap-4 xl:grid-cols-3">
        <MetricCard
          hint="Sales-enabled store nodes currently visible in the Flash ERP enterprise control plane."
          icon={Store}
          label="Active stores"
          value={numberFormatter.format(dashboard.metrics.activeStores)}
        />
        <MetricCard
          hint="Canonical store-posted transactions already accepted into enterprise history."
          icon={WalletCards}
          label="Posted transactions"
          value={numberFormatter.format(dashboard.metrics.completedTransactions)}
        />
        <MetricCard
          hint="Net posted retail revenue visible to enterprise reporting right now."
          icon={LayoutDashboard}
          label="Posted revenue"
          value={currencyFormatter.format(dashboard.metrics.postedRevenue)}
        />
        <MetricCard
          hint="Promotion and manual discounts captured on posted sales in the selected reporting scope."
          icon={Sparkles}
          label="Discounts"
          value={currencyFormatter.format(dashboard.metrics.discountAmount)}
        />
        <MetricCard
          hint="Average value per posted basket across active store nodes."
          icon={CreditCard}
          label="Average basket"
          value={currencyFormatter.format(dashboard.metrics.averageBasket)}
        />
        <MetricCard
          hint="Store-created sales orders still waiting on fulfilment or cancellation visibility."
          icon={ClipboardList}
          label="Open sales orders"
          value={numberFormatter.format(dashboard.metrics.openSalesOrders)}
        />
        <MetricCard
          hint="Store end-of-day reconciliations already accepted into the enterprise closeout ledger."
          icon={ClipboardCheck}
          label="Posted closeouts"
          value={numberFormatter.format(dashboard.metrics.closeoutsPosted)}
        />
        <MetricCard
          hint="Cash already banked by store teams and visible to enterprise reporting."
          icon={Landmark}
          label="Banked cash"
          value={currencyFormatter.format(dashboard.metrics.bankedAmount)}
        />
        <MetricCard
          hint="Outstanding enterprise receivable posture across credit-enabled customers."
          icon={AlertTriangle}
          label="Receivable exposure"
          value={currencyFormatter.format(dashboard.metrics.receivableExposureAmount)}
        />
        <MetricCard
          hint="Negative stock positions already visible in the enterprise inventory projection."
          icon={Boxes}
          label="Negative positions"
          value={numberFormatter.format(dashboard.metrics.negativePositions)}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(22rem,0.9fr)]">
        <article className="glass-panel rounded-[1.35rem] p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Reporting posture
              </p>
              <h2 className="mt-2 text-lg font-semibold text-stone-950">
                Cross-functional enterprise insight, not just module-by-module screens.
              </h2>
            </div>
            <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700">
              Refreshed {new Date(dashboard.refreshedAt).toLocaleString()}
            </div>
          </div>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-stone-600">{dashboard.statusMessage}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {dashboard.postureMessages.map((message) => (
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Focus now
              </p>
              <h2 className="mt-2 text-lg font-semibold text-stone-950">
                Enterprise priorities worth acting on next
              </h2>
            </div>
            <Sparkles className="mt-1 h-5 w-5 text-[var(--brand)]" />
          </div>
          <div className="mt-4 space-y-3">
            {dashboard.priorities.map((item) => (
              <div
                className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-3 text-sm leading-6 text-stone-700"
                key={item}
              >
                {item}
              </div>
            ))}
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              {numberFormatter.format(dashboard.metrics.activePromotions)} active promotion(s),{" "}
              {numberFormatter.format(dashboard.metrics.openSupplierClaims)} open supplier claim(s),
              and {numberFormatter.format(dashboard.metrics.attentionNodes)} attention node(s) are
              currently shaping enterprise posture.
            </div>
          </div>
        </article>
      </section>

      <section className="glass-panel rounded-[1.4rem] p-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              HQ report center
            </p>
            <h2 className="mt-1 text-lg font-semibold text-stone-950">
              Exportable operational reports across sales, purchasing, stock transfer, suppliers, and users.
            </h2>
          </div>
          <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700">
            Excel-ready grids
          </div>
        </div>

        <WorkspaceTabs
          ariaLabel="HQ reporting datasets"
          className="mt-4"
          defaultValue="tenders"
          summaries={{
            tenders: "Tender method performance by transaction count, net amount, and share.",
            receipts: "Posted receipt history with tender and basket summaries.",
            purchaseOrders: "Purchase-order status, receiving progress, outstanding quantity, and value.",
            goodsReceipts: "GRN history by supplier, location, received quantity, and purchase order.",
            transfers: "Inter-store transfer request, issue, receipt, and in-transit quantities.",
            suppliers: "Supplier master report with sourcing, purchase, claim, and return posture.",
            customerStatements: "Customer AR statement activity and running balances.",
            supplierStatements: "Supplier AP statement activity and payment vouchers.",
            users: "User access report with branch, role, cashier, and supervisor eligibility."
          }}
          tabs={[
            {
              value: "tenders",
              label: "Tenders",
              badge: String(dashboard.tenderReportRows.length)
            },
            {
              value: "receipts",
              label: "Receipts",
              badge: String(dashboard.receiptReportRows.length)
            },
            {
              value: "purchaseOrders",
              label: "PO",
              badge: String(dashboard.purchaseOrderReportRows.length)
            },
            {
              value: "goodsReceipts",
              label: "GRN",
              badge: String(dashboard.goodsReceiptReportRows.length)
            },
            {
              value: "transfers",
              label: "Transfers",
              badge: String(dashboard.transferReportRows.length)
            },
            {
              value: "suppliers",
              label: "Suppliers",
              badge: String(dashboard.supplierReportRows.length)
            },
            {
              value: "customerStatements",
              label: "Customer statements",
              badge: String(dashboard.customerStatementRows.length)
            },
            {
              value: "supplierStatements",
              label: "Supplier statements",
              badge: String(dashboard.supplierStatementRows.length)
            },
            {
              value: "users",
              label: "Users",
              badge: String(dashboard.userReportRows.length)
            }
          ]}
        >
          <WorkspaceTabsContent value="tenders">
            <SharedDataGrid
              columns={tenderReportColumns}
              data={dashboard.tenderReportRows}
              emptyLabel="No tender reporting rows are available yet."
              exportFileName="flash-erp-hq-tender-report"
              globalFilterFn={tenderReportFilter}
              initialPageSize={10}
              initialSorting={[{ id: "netAmount", desc: true }]}
              searchPlaceholder="Search tender code, name, or method"
            />
          </WorkspaceTabsContent>

          <WorkspaceTabsContent value="receipts">
            <SharedDataGrid
              columns={receiptReportColumns}
              data={dashboard.receiptReportRows}
              emptyLabel="No receipt reporting rows are available yet."
              exportFileName="flash-erp-hq-receipt-report"
              getRowHref={(row) => `/pos/transactions/${row.transactionNo}`}
              globalFilterFn={receiptReportFilter}
              initialPageSize={10}
              initialSorting={[{ id: "completedAtLabel", desc: true }]}
              searchPlaceholder="Search receipts, stores, tenders, or products"
            />
          </WorkspaceTabsContent>

          <WorkspaceTabsContent value="purchaseOrders">
            <SharedDataGrid
              columns={purchaseOrderReportColumns}
              data={dashboard.purchaseOrderReportRows}
              emptyLabel="No purchase-order reporting rows are available yet."
              exportFileName="flash-erp-hq-purchase-order-report"
              globalFilterFn={purchaseOrderReportFilter}
              initialPageSize={10}
              initialSorting={[{ id: "updatedAtLabel", desc: true }]}
              searchPlaceholder="Search PO, supplier, store, location, or status"
            />
          </WorkspaceTabsContent>

          <WorkspaceTabsContent value="goodsReceipts">
            <SharedDataGrid
              columns={goodsReceiptReportColumns}
              data={dashboard.goodsReceiptReportRows}
              emptyLabel="No goods-receipt reporting rows are available yet."
              exportFileName="flash-erp-hq-goods-receipt-report"
              globalFilterFn={goodsReceiptReportFilter}
              initialPageSize={10}
              initialSorting={[{ id: "receivedAtLabel", desc: true }]}
              searchPlaceholder="Search GRN, PO, supplier, store, or location"
            />
          </WorkspaceTabsContent>

          <WorkspaceTabsContent value="transfers">
            <SharedDataGrid
              columns={transferReportColumns}
              data={dashboard.transferReportRows}
              emptyLabel="No transfer reporting rows are available yet."
              exportFileName="flash-erp-hq-transfer-report"
              globalFilterFn={transferReportFilter}
              initialPageSize={10}
              initialSorting={[{ id: "requestedAtLabel", desc: true }]}
              searchPlaceholder="Search transfers, products, source, destination, or status"
            />
          </WorkspaceTabsContent>

          <WorkspaceTabsContent value="suppliers">
            <SharedDataGrid
              columns={supplierReportColumns}
              data={dashboard.supplierReportRows}
              emptyLabel="No supplier reporting rows are available yet."
              exportFileName="flash-erp-hq-supplier-report"
              globalFilterFn={supplierReportFilter}
              initialPageSize={10}
              searchPlaceholder="Search suppliers, contacts, email, phone, or status"
            />
          </WorkspaceTabsContent>

          <WorkspaceTabsContent value="customerStatements">
            <SharedDataGrid
              columns={statementReportColumns}
              data={dashboard.customerStatementRows}
              emptyLabel="No customer statement rows are available yet."
              exportFileName="flash-erp-hq-customer-statements"
              globalFilterFn={statementReportFilter}
              initialPageSize={10}
              searchPlaceholder="Search customer statements, references, journals, or memo"
            />
          </WorkspaceTabsContent>

          <WorkspaceTabsContent value="supplierStatements">
            <SharedDataGrid
              columns={statementReportColumns}
              data={dashboard.supplierStatementRows}
              emptyLabel="No supplier statement rows are available yet."
              exportFileName="flash-erp-hq-supplier-statements"
              globalFilterFn={statementReportFilter}
              initialPageSize={10}
              searchPlaceholder="Search supplier statements, vouchers, journals, or memo"
            />
          </WorkspaceTabsContent>

          <WorkspaceTabsContent value="users">
            <SharedDataGrid
              columns={userReportColumns}
              data={dashboard.userReportRows}
              emptyLabel="No user reporting rows are available yet."
              exportFileName="flash-erp-hq-user-access-report"
              globalFilterFn={userReportFilter}
              initialPageSize={10}
              searchPlaceholder="Search users, roles, stores, email, or status"
            />
          </WorkspaceTabsContent>
        </WorkspaceTabs>
      </section>

      <section className="glass-panel rounded-[1.4rem] p-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Sales by store
            </p>
            <h2 className="mt-1 text-lg font-semibold text-stone-950">
              Compare posted revenue, basket value, and branch exceptions in one table.
            </h2>
          </div>
          <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700">
            {numberFormatter.format(dashboard.storePerformanceRows.length)} store row(s)
          </div>
        </div>
        <div className="mt-4">
          <SharedDataGrid
            columns={storePerformanceColumns}
            data={dashboard.storePerformanceRows}
            emptyLabel="No store reporting rows are available yet."
            exportFileName="flash-erp-store-performance"
            getRowHref={(row) => `/stores/${row.storeCode}`}
            globalFilterFn={storePerformanceFilter}
            initialPageSize={8}
            initialSorting={[{ id: "salesValue", desc: true }]}
            searchPlaceholder="Search stores, codes, or node IDs"
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="glass-panel rounded-[1.4rem] p-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Receivable watchlist
              </p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">
                Customers carrying enterprise credit and cross-branch exposure.
              </h2>
            </div>
            <StatusBadge
              label={currencyFormatter.format(dashboard.metrics.receivableExposureAmount)}
              tone={dashboard.metrics.receivableExposureAmount > 0 ? "warning" : "success"}
            />
          </div>
          <div className="mt-4">
            <SharedDataGrid
              columns={receivableColumns}
              data={dashboard.receivableRows}
              emptyLabel="No credit-enabled customer exposure is available yet."
              exportFileName="flash-erp-customer-receivables"
              globalFilterFn={receivableFilter}
              initialPageSize={6}
              initialSorting={[{ id: "receivableBalanceAmount", desc: true }]}
              searchPlaceholder="Search customers, numbers, or home stores"
            />
          </div>
        </article>

        <article className="glass-panel rounded-[1.4rem] p-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Inventory risk
              </p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">
                Locations most likely to need stock review or enterprise follow-up.
              </h2>
            </div>
            <StatusBadge
              label={`${numberFormatter.format(dashboard.metrics.negativePositions)} negatives`}
              tone={dashboard.metrics.negativePositions > 0 ? "danger" : "success"}
            />
          </div>
          <div className="mt-4">
            <SharedDataGrid
              columns={inventoryRiskColumns}
              data={dashboard.inventoryRiskRows}
              emptyLabel="No inventory location risk rows are available yet."
              exportFileName="flash-erp-inventory-risk"
              getRowHref={(row) => `/inventory/locations/${row.locationCode}`}
              globalFilterFn={inventoryRiskFilter}
              initialPageSize={6}
              initialSorting={[{ id: "negativePositions", desc: true }]}
              searchPlaceholder="Search location, store, or warehouse"
            />
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="glass-panel rounded-[1.4rem] p-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Sales order watchlist
              </p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">
                Store-created holds and fulfilment state that still need branch follow-through.
              </h2>
            </div>
            <StatusBadge
              label={`${numberFormatter.format(dashboard.metrics.openSalesOrders)} open`}
              tone={dashboard.metrics.openSalesOrders > 0 ? "warning" : "success"}
            />
          </div>
          <div className="mt-4">
            <SharedDataGrid
              columns={salesOrderColumns}
              data={dashboard.salesOrderRows}
              emptyLabel="No sales-order watch rows are available yet."
              exportFileName="flash-erp-sales-order-watchlist"
              globalFilterFn={salesOrderFilter}
              initialPageSize={6}
              searchPlaceholder="Search orders, stores, customers, or basket references"
            />
          </div>
        </article>

        <article className="glass-panel rounded-[1.4rem] p-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Cash closeout watchlist
              </p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">
                Reconciliations and banked cash that still need treasury completion.
              </h2>
            </div>
            <StatusBadge
              label={currencyFormatter.format(dashboard.metrics.bankedAmount)}
              tone={dashboard.metrics.bankedAmount > 0 ? "success" : "default"}
            />
          </div>
          <div className="mt-4">
            <SharedDataGrid
              columns={closeoutColumns}
              data={dashboard.closeoutRows}
              emptyLabel="No enterprise closeout rows are available yet."
              exportFileName="flash-erp-closeout-watchlist"
              globalFilterFn={closeoutFilter}
              initialPageSize={6}
              searchPlaceholder="Search closeouts, shifts, stores, or cashiers"
            />
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="glass-panel rounded-[1.4rem] p-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Promotion snapshot
              </p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">
                Active and upcoming commercial rules that will shape store pricing.
              </h2>
            </div>
            <StatusBadge
              label={`${numberFormatter.format(dashboard.metrics.activePromotions)} active`}
              tone={dashboard.metrics.activePromotions > 0 ? "success" : "default"}
            />
          </div>
          <div className="mt-4">
            <SharedDataGrid
              columns={promotionColumns}
              data={dashboard.promotionRows}
              emptyLabel="No promotion rows are available yet."
              exportFileName="flash-erp-promotion-report"
              globalFilterFn={promotionFilter}
              initialPageSize={6}
              searchPlaceholder="Search promotions, scope, or status"
            />
          </div>
        </article>

        <article className="glass-panel rounded-[1.4rem] p-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                POS exceptions
              </p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">
                Upstream retail events still blocking clean enterprise reporting.
              </h2>
            </div>
            <StatusBadge
              label={`${numberFormatter.format(dashboard.exceptionRows.length)} visible`}
              tone={dashboard.exceptionRows.length > 0 ? "warning" : "success"}
            />
          </div>
          <div className="mt-4">
            <SharedDataGrid
              columns={exceptionColumns}
              data={dashboard.exceptionRows}
              emptyLabel="No POS exception rows are waiting for review."
              exportFileName="flash-erp-pos-exceptions"
              getRowHref={(row) => `/pos/exceptions/${row.eventId}`}
              globalFilterFn={exceptionFilter}
              initialPageSize={6}
              searchPlaceholder="Search store, event, or reference"
            />
          </div>
        </article>
      </section>
    </EnterpriseShell>
  );
}
