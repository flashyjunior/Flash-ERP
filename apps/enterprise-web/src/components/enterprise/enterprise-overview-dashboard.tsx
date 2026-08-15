"use client";

import {
  Activity,
  AlertTriangle,
  BadgePercent,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Package,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  Users,
  WalletCards,
  X
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import type {
  EnterpriseOperationsDashboardData,
  EnterpriseSalesDashboardDetailData,
  EnterpriseSalesDashboardDetailView
} from "@/server/repositories/enterprise-operations.repository";

type EnterpriseOverviewDashboardProps = {
  operationsDashboard: EnterpriseOperationsDashboardData;
  detailStoreCode: string;
  detailView: EnterpriseSalesDashboardDetailView | null;
  salesDetail: EnterpriseSalesDashboardDetailData | null;
};

const numberFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1
});
const chartColors = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"];
const trendPeriodOptions = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" }
] as const;

type TrendPeriod = (typeof trendPeriodOptions)[number]["value"];
function formatCompactCurrency(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function formatCurrency(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2
  }).format(value);
}

function axisCurrency(value: number, currencyCode: string) {
  return formatCompactCurrency(value, currencyCode).replace(".0", "");
}

function buildDashboardHref(input: {
  storeCode: string;
  dateFrom: string;
  dateTo: string;
  detail?: EnterpriseSalesDashboardDetailView | null;
  detailShop?: string | null;
  page?: number | null;
  pageSize?: number | null;
}) {
  const params = new URLSearchParams();

  if (input.storeCode) {
    params.set("shop", input.storeCode);
  }

  if (input.dateFrom) {
    params.set("from", input.dateFrom);
  }

  if (input.dateTo) {
    params.set("to", input.dateTo);
  }

  if (input.detail) {
    params.set("detail", input.detail);
  }

  if (input.detailShop) {
    params.set("detailShop", input.detailShop);
  }

  if (input.page && input.page > 1) {
    params.set("page", String(input.page));
  }

  if (input.pageSize && input.pageSize !== 20) {
    params.set("pageSize", String(input.pageSize));
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}

const shopCardTones = [
  {
    border: "border-t-amber-500",
    icon: "bg-amber-500 text-white"
  },
  {
    border: "border-t-rose-600",
    icon: "bg-rose-600 text-white"
  },
  {
    border: "border-t-red-500",
    icon: "bg-red-500 text-white"
  },
  {
    border: "border-t-orange-500",
    icon: "bg-orange-500 text-white"
  }
] as const;

function StoreSalesCard({
  row,
  currencyCode,
  href,
  index
}: {
  row: EnterpriseOperationsDashboardData["storeSummaries"][number];
  currencyCode: string;
  href: string;
  index: number;
}) {
  const tone = shopCardTones[index % shopCardTones.length];
  const isTrading = row.postedTransactions > 0;

  return (
    <Link
      className={`group block min-h-[12.5rem] overflow-hidden rounded-b-lg rounded-t-[18px] border border-t-4 border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-stone-200 ${tone.border}`}
      href={href}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone.icon}`}>
              <Store className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-stone-950">{row.store}</h2>
              <p className="mt-1 truncate text-xs text-stone-500">{row.storeCode}</p>
            </div>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${isTrading ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isTrading ? "bg-emerald-500" : "bg-stone-400"}`} />
            {isTrading ? "Live" : "No sales"}
          </span>
        </div>
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase text-stone-500">Net sales</p>
          <p className="mt-1 truncate text-2xl font-semibold text-stone-950">
            {formatCurrency(row.salesValue, currencyCode)}
          </p>
          <p
            className="mt-1.5 truncate text-[11px] font-medium text-stone-500"
            title={`${numberFormatter.format(row.salesOrders)} order(s) / ${row.lastPostedAtLabel}`}
          >
            {numberFormatter.format(row.salesOrders)} order(s) / {row.lastPostedAtLabel}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-[0.7fr_1.35fr_1fr] border-t border-stone-200 text-center text-xs">
        <div className="bg-stone-50 px-2 py-3">
          <span className="block text-[10px] font-semibold uppercase text-stone-500">Sales</span>
          <strong className="mt-1 block text-stone-900">{numberFormatter.format(row.postedTransactions)}</strong>
        </div>
        <div className="bg-emerald-50 px-2 py-3 text-emerald-800">
          <span className="block text-[10px] font-semibold uppercase">Collected</span>
          <strong className="mt-1 block truncate">{formatCurrency(row.paidAmount, currencyCode)}</strong>
          <span className="mt-1 block text-[10px] font-semibold">View breakdown</span>
        </div>
        <div className="bg-amber-50 px-2 py-3 text-amber-800">
          <span className="block text-[10px] font-semibold uppercase">Discount</span>
          <strong className="mt-1 block truncate">{formatCurrency(row.discountAmount, currencyCode)}</strong>
          <span className="mt-1 block text-[10px] font-semibold">View details</span>
        </div>
      </div>
    </Link>
  );
}

function DashboardMetricCard({
  href,
  icon: Icon,
  label,
  value,
  detail
}: {
  href: string;
  icon: typeof Store;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Link
      className="group block min-h-32 rounded-lg border border-stone-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-100"
      href={href}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-stone-500">{label}</p>
          <p className="mt-3 truncate text-2xl font-semibold text-stone-950">{value}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs text-stone-500">{detail}</p>
    </Link>
  );
}

function MasterSummaryCard({
  href,
  icon: Icon,
  label,
  value,
  tone
}: {
  href: string;
  icon: typeof Store;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <Link
      className={`group block rounded-2xl border p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-stone-200 ${tone}`}
      href={href}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-extrabold uppercase tracking-[0.16em] text-current opacity-70">
            {label}
          </p>
          <p className="mt-2 text-xl font-semibold text-current">{value}</p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70 text-current ring-1 ring-current/10">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Link>
  );
}

function SalesDashboardDetailDialog({
  closeHref,
  currencyCode,
  dashboardStoreCode,
  dateFrom,
  dateTo,
  detail,
  detailStoreCode,
  pageHref,
  requestedView,
  shopOptions
}: {
  closeHref: string;
  currencyCode: string;
  dashboardStoreCode: string;
  dateFrom: string;
  dateTo: string;
  detail: EnterpriseSalesDashboardDetailData | null;
  detailStoreCode: string;
  pageHref: (page: number, pageSize?: number) => string;
  requestedView: EnterpriseSalesDashboardDetailView;
  shopOptions: EnterpriseOperationsDashboardData["shopOptions"];
}) {
  const fallbackTitles: Record<EnterpriseSalesDashboardDetailView, string> = {
    "net-sales": "Net sales detail",
    transactions: "Completed transactions",
    collections: "Collections by tender",
    discounts: "Discounted sales",
    tax: "Taxed sales"
  };
  const receiptSummary =
    detail && detail.view !== "collections"
      ? detail.view === "discounts"
        ? { label: "Discounts", value: detail.totals.discountAmount }
        : detail.view === "tax"
          ? { label: "Tax", value: detail.totals.taxAmount }
          : { label: "Net sales", value: detail.totals.netSales }
      : null;

  return (
    <div
      aria-labelledby="sales-dashboard-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-2 sm:p-4"
      role="dialog"
    >
      <section className="flex h-[min(90vh,54rem)] w-full max-w-[65rem] flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-blue-700">Sales dashboard detail</p>
            <h2 className="mt-1 truncate text-xl font-semibold text-stone-950" id="sales-dashboard-dialog-title">
              {detail?.title ?? fallbackTitles[requestedView]}
            </h2>
            {detail ? <p className="mt-1 text-sm text-stone-500">{detail.description}</p> : null}
          </div>
          <Link
            aria-label="Close sales detail"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-50 hover:text-stone-950"
            href={closeHref}
            title="Close"
          >
            <X className="h-5 w-5" />
          </Link>
        </header>

        <form
          action="/"
          className="flex shrink-0 flex-wrap items-end gap-2 border-b border-stone-200 bg-stone-50 px-5 py-2.5"
          method="get"
        >
          {dashboardStoreCode ? <input name="shop" type="hidden" value={dashboardStoreCode} /> : null}
          {dateFrom ? <input name="from" type="hidden" value={dateFrom} /> : null}
          {dateTo ? <input name="to" type="hidden" value={dateTo} /> : null}
          <input name="detail" type="hidden" value={requestedView} />
          {detail?.pageSize && detail.pageSize !== 20 ? (
            <input name="pageSize" type="hidden" value={detail.pageSize} />
          ) : null}
          <label className="grid min-w-56 gap-1 text-[11px] font-semibold text-stone-600">
            Shop
            <select
              className="h-9 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-800 outline-none"
              defaultValue={
                detailStoreCode === "__all__"
                  ? "__all__"
                  : detailStoreCode || dashboardStoreCode || "__all__"
              }
              name="detailShop"
            >
              <option value="__all__">All active shops</option>
              {shopOptions.map((shop) => (
                <option key={shop.storeCode} value={shop.storeCode}>
                  {shop.storeName}
                </option>
              ))}
            </select>
          </label>
          <button
            className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-xs font-semibold text-stone-800 transition hover:bg-stone-100"
            type="submit"
          >
            Apply
          </button>
        </form>

        {!detail ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm font-medium text-rose-700">
            Flash ERP could not load this dashboard detail. Close the dialog and try again.
          </div>
        ) : detail.view === "collections" ? (
          <>
            <div className="shrink-0 px-5 pb-2 pt-4">
              <div className="grid gap-2.5 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">Total tendered</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">
                    {formatCurrency(detail.totals.tenderedAmount, currencyCode)}
                  </p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3.5">
                  <p className="text-[10px] font-semibold uppercase text-emerald-700">Cash and electronic collections</p>
                  <p className="mt-2 text-xl font-semibold text-emerald-800">
                    {formatCurrency(detail.totals.collectedAmount, currencyCode)}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5">
                  <p className="text-[10px] font-semibold uppercase text-amber-700">Credit sales</p>
                  <p className="mt-2 text-xl font-semibold text-amber-800">
                    {formatCurrency(detail.totals.creditSalesAmount, currencyCode)}
                  </p>
                </div>
              </div>
              <p className="mt-2.5 text-[11px] text-stone-500">
                Credit is included in the tendered total but separated from cash and electronic collections.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden px-5 pb-4 pt-3">
              <div className="h-full w-full overflow-auto rounded-lg border border-stone-200 [scrollbar-gutter:stable]">
                <table className="w-full min-w-[52rem] border-collapse whitespace-nowrap text-[12px]">
                  <thead className="sticky top-0 bg-stone-50 text-left text-[10px] font-semibold uppercase text-stone-500">
                    <tr>
                      <th className="px-4 py-3">Tender</th>
                      <th className="px-4 py-3">Classification</th>
                      <th className="px-4 py-3 text-right">Shops</th>
                      <th className="px-4 py-3 text-right">Transactions</th>
                      <th className="px-4 py-3 text-right">Payment entries</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 bg-white">
                    {detail.rows.map((row) => (
                      <tr className="even:bg-stone-50/70" key={row.tenderKey}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-stone-900">{row.tenderName}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${row.classification === "COLLECTED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                            {row.classification}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-stone-700">{numberFormatter.format(row.shopCount)}</td>
                        <td className="px-4 py-3 text-right text-stone-700">{numberFormatter.format(row.transactionCount)}</td>
                        <td className="px-4 py-3 text-right text-stone-700">{numberFormatter.format(row.paymentEntries)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-stone-950">{formatCurrency(row.amount, currencyCode)}</td>
                      </tr>
                    ))}
                    {detail.rows.length === 0 ? (
                      <tr>
                        <td className="px-4 py-10 text-center text-stone-500" colSpan={6}>No tender collections match this scope.</td>
                      </tr>
                    ) : null}
                  </tbody>
                  <tfoot className="border-t border-stone-200 bg-stone-50 text-[11px] font-semibold text-stone-900">
                    <tr>
                      <td className="px-4 py-3" colSpan={5}>Total tendered for the selected period</td>
                      <td className="px-4 py-3 text-right">
                        {formatCurrency(detail.totals.tenderedAmount, currencyCode)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-stone-200 px-5 py-3 text-xs text-stone-500">
              <span>{numberFormatter.format(detail.totalRows)} completed transaction(s) for the selected period</span>
              {receiptSummary ? (
                <strong className="shrink-0 text-sm text-stone-900">
                  {receiptSummary.label}: {formatCurrency(receiptSummary.value, currencyCode)}
                </strong>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden px-5 pb-4 pt-3">
              <div className="h-full w-full overflow-auto rounded-lg border border-stone-200 [scrollbar-gutter:stable]">
                <table className="w-full min-w-[68rem] border-collapse whitespace-nowrap text-[12px]">
                  <thead className="sticky top-0 bg-stone-50 text-left text-[10px] font-semibold uppercase text-stone-500">
                    <tr>
                      <th className="px-4 py-3">Sale</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Shop</th>
                      <th className="px-4 py-3">Cashier</th>
                      <th className="px-4 py-3">Completed</th>
                      <th className="px-4 py-3 text-right">Net sale</th>
                      <th className="px-4 py-3 text-right">Paid</th>
                      <th className="px-4 py-3 text-right">Tax</th>
                      <th className="px-4 py-3 text-right">Discount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 bg-white">
                    {detail.rows.map((row) => (
                      <tr className="even:bg-stone-50/70" key={row.transactionNo}>
                        <td className="px-4 py-3">
                          <Link className="font-semibold text-blue-700 hover:underline" href={`/pos/transactions/${encodeURIComponent(row.transactionNo)}`}>
                            {row.transactionNo}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-stone-700">{row.customerName}</td>
                        <td className="px-4 py-3 text-stone-700">{row.storeName}</td>
                        <td className="px-4 py-3 text-stone-700">{row.cashierCode}</td>
                        <td className="px-4 py-3 text-stone-600">{row.completedAtLabel}</td>
                        <td className="px-4 py-3 text-right font-semibold text-stone-950">{formatCurrency(row.netSale, currencyCode)}</td>
                        <td className="px-4 py-3 text-right text-stone-700">{formatCurrency(row.paidAmount, currencyCode)}</td>
                        <td className="px-4 py-3 text-right text-stone-700">{formatCurrency(row.taxAmount, currencyCode)}</td>
                        <td className="px-4 py-3 text-right text-stone-700">{formatCurrency(row.discountAmount, currencyCode)}</td>
                      </tr>
                    ))}
                    {detail.rows.length === 0 ? (
                      <tr>
                        <td className="px-4 py-10 text-center text-stone-500" colSpan={9}>No completed sales match this scope.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {detail ? (
          <footer className="flex shrink-0 flex-col gap-3 border-t border-stone-200 bg-stone-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-sm text-stone-600">
              Page {detail.page} of {detail.totalPages} · {numberFormatter.format(detail.totalRows)} row(s)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {[10, 20, 50].map((size) => (
                <Link
                  className={`inline-flex h-9 items-center rounded-lg border px-3 text-xs font-semibold ${detail.pageSize === size ? "border-blue-600 bg-blue-600 text-white" : "border-stone-200 bg-white text-stone-700"}`}
                  href={pageHref(1, size)}
                  key={size}
                >
                  {size} rows
                </Link>
              ))}
              <Link
                aria-disabled={detail.page <= 1}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${detail.page <= 1 ? "pointer-events-none border-stone-200 text-stone-300" : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"}`}
                href={pageHref(Math.max(1, detail.page - 1))}
                title="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <Link
                aria-disabled={detail.page >= detail.totalPages}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${detail.page >= detail.totalPages ? "pointer-events-none border-stone-200 text-stone-300" : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"}`}
                href={pageHref(Math.min(detail.totalPages, detail.page + 1))}
                title="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </footer>
        ) : null}
      </section>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-56 items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 text-sm font-medium text-stone-500">
      {label}
    </div>
  );
}

function ChartPlaceholder() {
  return <div aria-hidden="true" className="h-full min-h-56 animate-pulse rounded-lg bg-stone-100" />;
}

export function EnterpriseOverviewDashboard({
  detailStoreCode,
  detailView,
  operationsDashboard,
  salesDetail
}: EnterpriseOverviewDashboardProps) {
  const currencyCode = operationsDashboard.currencyCode;
  const [salesTrendPeriod, setSalesTrendPeriod] = useState<TrendPeriod>("daily");
  const [totalSalesPeriod, setTotalSalesPeriod] = useState<TrendPeriod>("monthly");
  const [chartsReady, setChartsReady] = useState(false);

  useEffect(() => setChartsReady(true), []);
  const salesTrendRows =
    operationsDashboard.salesTrendByPeriod[salesTrendPeriod] ?? operationsDashboard.salesTrendRows;
  const totalSalesRows = operationsDashboard.totalSalesTrendByPeriod[totalSalesPeriod] ?? [];
  const hasTotalSales = totalSalesRows.some((row) => row.salesValue > 0);
  const topStoreRows = operationsDashboard.storeSummaries.slice(0, 8);
  const stockRiskRows = operationsDashboard.stockRiskRows.slice(0, 5);
  const tenderRows = operationsDashboard.tenderRows.slice(0, 6);
  const totalStoreRevenue = Math.max(
    operationsDashboard.storeSummaries.reduce((sum, row) => sum + row.salesValue, 0),
    1
  );
  const dashboardHref = (
    view: EnterpriseSalesDashboardDetailView,
    detailShop = "",
    page = 1,
    pageSize = 20
  ) =>
    buildDashboardHref({
      storeCode: operationsDashboard.filters.storeCode,
      dateFrom: operationsDashboard.filters.dateFrom,
      dateTo: operationsDashboard.filters.dateTo,
      detail: view,
      detailShop,
      page,
      pageSize
    });
  const closeDetailHref = buildDashboardHref({
    storeCode: operationsDashboard.filters.storeCode,
    dateFrom: operationsDashboard.filters.dateFrom,
    dateTo: operationsDashboard.filters.dateTo
  });
  const masterSummaryCards = [
    {
      label: "Total customers",
      value: numberFormatter.format(operationsDashboard.masterCounts.customers),
      href: "/master/customers",
      icon: Users,
      tone: "border-sky-200 bg-sky-50 text-sky-950"
    },
    {
      label: "Loyalty members",
      value: numberFormatter.format(operationsDashboard.masterCounts.loyaltyCustomers),
      href: "/master/customers",
      icon: BadgePercent,
      tone: "border-cyan-200 bg-cyan-50 text-cyan-950"
    },
    {
      label: "Total products",
      value: numberFormatter.format(operationsDashboard.masterCounts.products),
      href: "/catalog",
      icon: Package,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-950"
    },
    {
      label: "Total suppliers",
      value: numberFormatter.format(operationsDashboard.masterCounts.suppliers),
      href: "/master/suppliers",
      icon: Truck,
      tone: "border-amber-200 bg-amber-50 text-amber-950"
    },
    {
      label: "Total users",
      value: numberFormatter.format(operationsDashboard.masterCounts.users),
      href: "/security/users",
      icon: ShieldCheck,
      tone: "border-violet-200 bg-violet-50 text-violet-950"
    },
    {
      label: "Promotions",
      value: numberFormatter.format(operationsDashboard.masterCounts.activePromotions),
      href: "/master/promotions",
      icon: Sparkles,
      tone: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950"
    }
  ];

  return (
    <EnterpriseShell
      activeSection="overview"
      heading="Dashboard"
    >
      <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <form action="/" className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_10rem_10rem_auto_auto]" method="get">
          <label className="grid gap-1 text-sm font-semibold text-stone-700">
            Shop
            <select
              className="h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-800 outline-none"
              defaultValue={operationsDashboard.filters.storeCode}
              name="shop"
            >
              <option value="">All shops</option>
              {operationsDashboard.shopOptions.map((shop) => (
                <option key={shop.storeCode} value={shop.storeCode}>
                  {shop.storeName} ({shop.storeCode})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-stone-700">
            From
            <input
              className="h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-800 outline-none"
              defaultValue={operationsDashboard.filters.dateFrom}
              name="from"
              type="date"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-stone-700">
            To
            <input
              className="h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-800 outline-none"
              defaultValue={operationsDashboard.filters.dateTo}
              name="to"
              type="date"
            />
          </label>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white"
            type="submit"
          >
            <CalendarDays className="h-4 w-4" />
            Apply
          </button>
          <a
            className="inline-flex h-10 items-center justify-center self-end rounded-lg border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700"
            href="/"
          >
            Reset
          </a>
        </form>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard
          detail="Open the completed receipt breakdown"
          href={dashboardHref("net-sales")}
          icon={CircleDollarSign}
          label="Net sales"
          value={formatCurrency(operationsDashboard.metrics.postedRevenue, currencyCode)}
        />
        <DashboardMetricCard
          detail="Completed, non-void sales in this scope"
          href={dashboardHref("transactions")}
          icon={ReceiptText}
          label="Transactions"
          value={numberFormatter.format(operationsDashboard.metrics.postedTransactions)}
        />
        <DashboardMetricCard
          detail="Average net value per completed transaction"
          href={dashboardHref("transactions")}
          icon={Activity}
          label="Average sale"
          value={formatCurrency(operationsDashboard.analytics.averageBasket, currencyCode)}
        />
        <DashboardMetricCard
          detail="Separate cash, electronic and credit tenders"
          href={dashboardHref("collections")}
          icon={CreditCard}
          label="Amount collected"
          value={formatCurrency(operationsDashboard.metrics.paidAmount, currencyCode)}
        />
      </section>

      <section className="grid overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm sm:grid-cols-3">
        <Link className="border-b border-stone-200 px-5 py-4 transition hover:bg-stone-50 sm:border-b-0 sm:border-r" href={dashboardHref("tax")}>
          <span className="block text-xs font-semibold text-stone-500">Tax collected</span>
          <strong className="mt-2 block text-lg text-stone-950">{formatCurrency(operationsDashboard.metrics.taxAmount, currencyCode)}</strong>
          <span className="mt-2 block text-xs font-semibold text-blue-700">View transaction details</span>
        </Link>
        <Link className="border-b border-stone-200 px-5 py-4 transition hover:bg-stone-50 sm:border-b-0 sm:border-r" href={dashboardHref("discounts")}>
          <span className="block text-xs font-semibold text-stone-500">Discounts</span>
          <strong className="mt-2 block text-lg text-stone-950">{formatCurrency(operationsDashboard.metrics.discountAmount, currencyCode)}</strong>
          <span className="mt-2 block text-xs font-semibold text-blue-700">View discount details</span>
        </Link>
        <a className="px-5 py-4 transition hover:bg-stone-50" href="#shop-performance">
          <span className="block text-xs font-semibold text-stone-500">Shops trading</span>
          <strong className="mt-2 block text-lg text-stone-950">
            {numberFormatter.format(operationsDashboard.analytics.storesPosting)} of {numberFormatter.format(operationsDashboard.storeSummaries.length)}
          </strong>
          <span className="mt-2 block text-xs font-semibold text-blue-700">View ranked shops</span>
        </a>
      </section>

      <section id="shop-performance">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-stone-500">Shop performance</p>
            <h2 className="mt-1 text-lg font-semibold text-stone-950">Active shops ranked by net sales</h2>
          </div>
          <span className="text-xs font-medium text-stone-500">Select a shop for its sales detail</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {operationsDashboard.storeSummaries.map((row, index) => (
            <StoreSalesCard
              currencyCode={currencyCode}
              href={dashboardHref("net-sales", row.storeCode)}
              index={index}
              key={row.storeCode}
              row={row}
            />
          ))}
          {operationsDashboard.storeSummaries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-stone-300 bg-white p-6 text-sm font-medium text-stone-500 md:col-span-2 xl:col-span-4">
              No active shop sales are available for this dashboard scope.
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {masterSummaryCards.map((card) => (
          <MasterSummaryCard
            href={card.href}
            icon={card.icon}
            key={card.label}
            label={card.label}
            tone={card.tone}
            value={card.value}
          />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(24rem,0.9fr)]">
        <article className="glass-panel rounded-lg p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-stone-500">Sales trend</p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">Recent all-shop revenue</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-lg border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 outline-none"
                onChange={(event) => setSalesTrendPeriod(event.target.value as TrendPeriod)}
                value={salesTrendPeriod}
              >
                {trendPeriodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-600">
                Revenue {formatCurrency(operationsDashboard.metrics.postedRevenue, currencyCode)}
              </div>
              <div className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                Discounts {formatCurrency(operationsDashboard.metrics.discountAmount, currencyCode)}
              </div>
            </div>
          </div>
          <div className="mt-4 h-72">
            {!chartsReady ? (
              <ChartPlaceholder />
            ) : salesTrendRows.length > 0 && operationsDashboard.salesTrendSeries.length > 0 ? (
              <ResponsiveContainer height="100%" width="100%">
                <LineChart data={salesTrendRows} margin={{ left: 4, right: 18, top: 12 }}>
                  <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#78716c", fontSize: 12 }} tickLine={false} />
                  <YAxis
                    tick={{ fill: "#78716c", fontSize: 12 }}
                    tickFormatter={(value) => axisCurrency(Number(value), currencyCode)}
                    tickLine={false}
                    width={72}
                  />
                  <Tooltip
                    formatter={(value, name) => [formatCurrency(Number(value), currencyCode), name]}
                  />
                  <Legend />
                  {operationsDashboard.salesTrendSeries.map((series) => (
                    <Line
                      activeDot={{ r: 5 }}
                      dataKey={series.storeCode}
                      dot={false}
                      key={series.storeCode}
                      name={series.storeName}
                      stroke={series.color}
                      strokeWidth={3}
                      type="monotone"
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label="No top-shop sales trend yet" />
            )}
          </div>
        </article>

        <article className="glass-panel rounded-lg p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-stone-500">Tender mix</p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">Actual tender methods</h2>
            </div>
            <WalletCards className="h-5 w-5 text-stone-400" />
          </div>
          <div className="mt-4 h-64">
            {!chartsReady ? (
              <ChartPlaceholder />
            ) : tenderRows.length > 0 ? (
              <ResponsiveContainer height="100%" width="100%">
                <PieChart>
                  <Pie
                    cx="50%"
                    cy="50%"
                    data={tenderRows}
                    dataKey="netAmount"
                    innerRadius={58}
                    nameKey="tenderName"
                    outerRadius={90}
                    paddingAngle={3}
                  >
                    {tenderRows.map((row, index) => (
                      <Cell fill={chartColors[index % chartColors.length]} key={row.tenderKey} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label="No tender activity yet" />
            )}
          </div>
          <div className="mt-2 space-y-2">
            {tenderRows.map((row, index) => (
              <div className="flex items-center justify-between gap-3 text-sm" key={row.tenderKey}>
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: chartColors[index % chartColors.length] }}
                  />
                  <span className="truncate font-medium text-stone-700">{row.tenderName}</span>
                </div>
                <span className="shrink-0 text-stone-500">{percentFormatter.format(row.share)}%</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(24rem,0.8fr)]">
        <article className="glass-panel rounded-lg p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-stone-500">All-shop sales</p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">Month-on-month total sales</h2>
            </div>
            <select
              className="h-9 rounded-lg border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 outline-none"
              onChange={(event) => setTotalSalesPeriod(event.target.value as TrendPeriod)}
              value={totalSalesPeriod}
            >
              {trendPeriodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4 h-72">
            {!chartsReady ? (
              <ChartPlaceholder />
            ) : hasTotalSales ? (
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={totalSalesRows} margin={{ left: 4, right: 18, top: 10 }}>
                  <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#78716c", fontSize: 12 }} tickLine={false} />
                  <YAxis
                    tick={{ fill: "#78716c", fontSize: 12 }}
                    tickFormatter={(value) => axisCurrency(Number(value), currencyCode)}
                    tickLine={false}
                    width={72}
                  />
                  <Tooltip
                    formatter={(value) => [formatCurrency(Number(value), currencyCode), "Sales"]}
                  />
                  <Legend />
                  <Bar dataKey="salesValue" fill="#0f766e" name="Sales" radius={[7, 7, 0, 0]}>
                    {totalSalesRows.map((row, index) => (
                      <Cell fill={chartColors[index % chartColors.length]} key={row.period} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label="No all-shop sales totals yet" />
            )}
          </div>
        </article>

        <article className="glass-panel rounded-lg p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-stone-500">Top customers</p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">Top 10 by total sales</h2>
            </div>
            <Users className="h-5 w-5 text-stone-400" />
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-stone-200">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-left text-xs font-semibold uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Sales</th>
                  <th className="px-4 py-3">Txns</th>
                  <th className="px-4 py-3">Latest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white">
                {operationsDashboard.topCustomerRows.map((row, index) => (
                  <tr key={row.customerKey}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-xs font-semibold text-stone-600">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-stone-900">{row.customerName}</div>
                          <div className="truncate text-xs text-stone-500">{row.customerNo ?? "Named customer"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-stone-900">
                      {formatCurrency(row.totalSales, currencyCode)}
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      {numberFormatter.format(row.transactionCount)}
                    </td>
                    <td className="px-4 py-3 text-stone-600">{row.lastSaleAtLabel}</td>
                  </tr>
                ))}
                {operationsDashboard.topCustomerRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-stone-500" colSpan={4}>
                      No customer-linked sales are visible in this dashboard date scope.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="grid gap-4">
        <article className="glass-panel rounded-lg p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-stone-500">Store performance</p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">Revenue and movement by shop</h2>
            </div>
            <div className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-600">
              Top {numberFormatter.format(topStoreRows.length)}
            </div>
          </div>
          <div className="mt-4 h-72">
            {!chartsReady ? (
              <ChartPlaceholder />
            ) : topStoreRows.length > 0 ? (
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={topStoreRows} margin={{ left: 4, right: 18, top: 10 }}>
                  <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="storeCode" tick={{ fill: "#78716c", fontSize: 12 }} tickLine={false} />
                  <YAxis
                    tick={{ fill: "#78716c", fontSize: 12 }}
                    tickFormatter={(value) => axisCurrency(Number(value), currencyCode)}
                    tickLine={false}
                    width={72}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="salesValue" fill="#2563eb" name="Sales" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label="No store performance data yet" />
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <article className="glass-panel rounded-lg p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-stone-500">Predictive purchasing</p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">Stock risk before supplier lead time</h2>
            </div>
            <AlertTriangle className="h-5 w-5 text-stone-400" />
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-stone-200">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-left text-xs font-semibold uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Shop</th>
                  <th className="px-4 py-3">On hand</th>
                  <th className="px-4 py-3">Suggested</th>
                  <th className="px-4 py-3">Supplier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white">
                {stockRiskRows.map((row) => (
                  <tr key={row.predictionId}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-stone-900">{row.productName}</div>
                      <div className="text-xs text-stone-500">{row.productCode}</div>
                    </td>
                    <td className="px-4 py-3 text-stone-700">{row.storeName}</td>
                    <td className="px-4 py-3 text-stone-700">{numberFormatter.format(row.onHandQuantity)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-stone-900">
                        {numberFormatter.format(row.recommendedQuantity)}
                      </div>
                      <div className="text-xs text-stone-500">
                        {formatCurrency(row.estimatedOrderValue, currencyCode)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-stone-700">{row.supplierName ?? "Missing"}</td>
                  </tr>
                ))}
                {stockRiskRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-stone-500" colSpan={5}>
                      No predictive reorder risk is visible in this dashboard scope.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="glass-panel rounded-lg p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-stone-500">Controls analytics</p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">Cash, tender, and stock signals</h2>
            </div>
            <Activity className="h-5 w-5 text-stone-400" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase text-stone-500">Banking gap</p>
              <p className="mt-1 text-xl font-semibold text-stone-950">
                {formatCurrency(operationsDashboard.analytics.bankingGap, currencyCode)}
              </p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase text-stone-500">Cash variance</p>
              <p className="mt-1 text-xl font-semibold text-stone-950">
                {formatCurrency(operationsDashboard.analytics.varianceAmount, currencyCode)}
              </p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase text-stone-500">Top tender</p>
              <p className="mt-1 text-xl font-semibold text-stone-950">
                {operationsDashboard.analytics.topTenderName ?? "No tender"}
              </p>
              <p className="mt-1 text-xs font-medium text-stone-500">
                {percentFormatter.format(operationsDashboard.analytics.topTenderShare)}% of tender value
              </p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase text-stone-500">Stock moves / sale</p>
              <p className="mt-1 text-xl font-semibold text-stone-950">
                {numberFormatter.format(operationsDashboard.analytics.stockMovementsPerTransaction)}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <article className="glass-panel rounded-lg p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-stone-500">Shop ranking</p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">All-shop contribution</h2>
            </div>
            <Store className="h-5 w-5 text-stone-400" />
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-stone-200">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-left text-xs font-semibold uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-3">Shop</th>
                  <th className="px-4 py-3">Sales</th>
                  <th className="px-4 py-3">Transactions</th>
                  <th className="px-4 py-3">Stock moves</th>
                  <th className="px-4 py-3">Last post</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white">
                {operationsDashboard.storeSummaries.slice(0, 8).map((row) => (
                  <tr key={row.storeCode}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-stone-900">{row.store}</div>
                      <div className="text-xs text-stone-500">{row.storeCode}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-stone-900">
                        {formatCurrency(row.salesValue, currencyCode)}
                      </div>
                      <div className="mt-2 h-1.5 w-32 max-w-full rounded-full bg-stone-100">
                        <div
                          className="h-1.5 rounded-full bg-blue-600"
                          style={{ width: `${Math.min(100, (row.salesValue / totalStoreRevenue) * 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      {numberFormatter.format(row.postedTransactions)}
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      {numberFormatter.format(row.stockMovements)}
                    </td>
                    <td className="px-4 py-3 text-stone-600">{row.lastPostedAtLabel}</td>
                  </tr>
                ))}
                {operationsDashboard.storeSummaries.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-stone-500" colSpan={5}>
                      No shop analytics are available yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="glass-panel rounded-lg p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-stone-500">Executive queue</p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">Priority signals</h2>
            </div>
            <AlertTriangle className="h-5 w-5 text-stone-400" />
          </div>
          <div className="mt-4 space-y-3">
            {operationsDashboard.priorities.slice(0, 5).map((item) => (
              <div
                className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700"
                key={item}
              >
                {item}
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase text-stone-500">Refreshed</p>
            <p className="mt-1 text-sm font-medium text-stone-700">
              {new Date(operationsDashboard.refreshedAt).toLocaleString()}
            </p>
          </div>
        </article>
      </section>
      {detailView ? (
        <SalesDashboardDetailDialog
          closeHref={closeDetailHref}
          currencyCode={currencyCode}
          dashboardStoreCode={operationsDashboard.filters.storeCode}
          dateFrom={operationsDashboard.filters.dateFrom}
          dateTo={operationsDashboard.filters.dateTo}
          detail={salesDetail}
          detailStoreCode={detailStoreCode}
          pageHref={(page, pageSize) =>
            dashboardHref(
              detailView,
              detailStoreCode,
              page,
              pageSize ?? salesDetail?.pageSize ?? 20
            )
          }
          requestedView={detailView}
          shopOptions={operationsDashboard.shopOptions}
        />
      ) : null}
    </EnterpriseShell>
  );
}
