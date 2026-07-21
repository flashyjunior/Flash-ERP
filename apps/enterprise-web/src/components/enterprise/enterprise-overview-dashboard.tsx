"use client";

import {
  Activity,
  AlertTriangle,
  BadgePercent,
  CalendarDays,
  Package,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  Users,
  WalletCards
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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
import type { EnterpriseOperationsDashboardData } from "@/server/repositories/enterprise-operations.repository";

type EnterpriseOverviewDashboardProps = {
  operationsDashboard: EnterpriseOperationsDashboardData;
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

function buildPosDrilldownHref(input: {
  storeCode: string;
  dateFrom: string;
  dateTo: string;
}) {
  const params = new URLSearchParams();
  params.set("shop", input.storeCode);

  if (input.dateFrom) {
    params.set("from", input.dateFrom);
  }

  if (input.dateTo) {
    params.set("to", input.dateTo);
  }

  return `/pos?${params.toString()}`;
}

const storeSalesCardTones = [
  {
    card: "border-blue-600 bg-[linear-gradient(135deg,#1d4ed8,#2563eb)] shadow-blue-500/15",
    icon: "bg-white/18 text-white ring-1 ring-white/25"
  },
  {
    card: "border-emerald-600 bg-[linear-gradient(135deg,#047857,#10b981)] shadow-emerald-500/15",
    icon: "bg-white/18 text-white ring-1 ring-white/25"
  },
  {
    card: "border-fuchsia-600 bg-[linear-gradient(135deg,#a21caf,#d946ef)] shadow-fuchsia-500/15",
    icon: "bg-white/18 text-white ring-1 ring-white/25"
  },
  {
    card: "border-amber-600 bg-[linear-gradient(135deg,#b45309,#f59e0b)] shadow-amber-500/15",
    icon: "bg-white/18 text-white ring-1 ring-white/25"
  },
  {
    card: "border-rose-600 bg-[linear-gradient(135deg,#be123c,#f43f5e)] shadow-rose-500/15",
    icon: "bg-white/18 text-white ring-1 ring-white/25"
  },
  {
    card: "border-violet-600 bg-[linear-gradient(135deg,#6d28d9,#8b5cf6)] shadow-violet-500/15",
    icon: "bg-white/18 text-white ring-1 ring-white/25"
  },
  {
    card: "border-cyan-600 bg-[linear-gradient(135deg,#0e7490,#06b6d4)] shadow-cyan-500/15",
    icon: "bg-white/18 text-white ring-1 ring-white/25"
  },
  {
    card: "border-lime-600 bg-[linear-gradient(135deg,#4d7c0f,#84cc16)] shadow-lime-500/15",
    icon: "bg-white/18 text-white ring-1 ring-white/25"
  },
  {
    card: "border-orange-600 bg-[linear-gradient(135deg,#c2410c,#f97316)] shadow-orange-500/15",
    icon: "bg-white/18 text-white ring-1 ring-white/25"
  },
  {
    card: "border-indigo-600 bg-[linear-gradient(135deg,#3730a3,#6366f1)] shadow-indigo-500/15",
    icon: "bg-white/18 text-white ring-1 ring-white/25"
  }
];

function StoreSalesCard({
  row,
  currencyCode,
  index,
  href
}: {
  row: EnterpriseOperationsDashboardData["storeSummaries"][number];
  currencyCode: string;
  index: number;
  href: string;
}) {
  const tone = storeSalesCardTones[index % storeSalesCardTones.length];
  return (
    <Link
      className={`group block min-h-[6.75rem] rounded-2xl border p-4 text-white shadow-[0_14px_28px_var(--tw-shadow-color)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_var(--tw-shadow-color)] focus:outline-none focus:ring-4 focus:ring-blue-200 ${tone.card}`}
      href={href}
    >
      <div className="flex h-full items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-extrabold uppercase text-white/75">{row.storeCode}</p>
          <h2 className="mt-1 truncate text-sm font-semibold text-white">{row.store}</h2>
          <p className="mt-2 truncate text-[1.3rem] font-semibold leading-tight text-white">
            {formatCurrency(row.salesValue, currencyCode)}
          </p>
          <p className="mt-1 truncate text-xs font-medium text-white/78">
            {numberFormatter.format(row.postedTransactions)} sale(s), {numberFormatter.format(row.salesOrders)} order(s) / {row.lastPostedAtLabel}
          </p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm ${tone.icon}`}>
          <Store className="h-5 w-5" />
        </div>
      </div>
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

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-56 items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 text-sm font-medium text-stone-500">
      {label}
    </div>
  );
}

export function EnterpriseOverviewDashboard({
  operationsDashboard
}: EnterpriseOverviewDashboardProps) {
  const currencyCode = operationsDashboard.currencyCode;
  const [salesTrendPeriod, setSalesTrendPeriod] = useState<TrendPeriod>("daily");
  const [totalSalesPeriod, setTotalSalesPeriod] = useState<TrendPeriod>("monthly");
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

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {operationsDashboard.storeSummaries.map((row, index) => (
          <StoreSalesCard
            currencyCode={currencyCode}
            href={buildPosDrilldownHref({
              storeCode: row.storeCode,
              dateFrom: operationsDashboard.filters.dateFrom,
              dateTo: operationsDashboard.filters.dateTo
            })}
            index={index}
            key={row.storeCode}
            row={row}
          />
        ))}
        {operationsDashboard.storeSummaries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white p-6 text-sm font-medium text-stone-500 sm:col-span-2 lg:col-span-3 xl:col-span-5">
            No shop sales have posted yet for this dashboard scope.
          </div>
        ) : null}
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
            {salesTrendRows.length > 0 && operationsDashboard.salesTrendSeries.length > 0 ? (
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
            {tenderRows.length > 0 ? (
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
            {hasTotalSales ? (
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
            {topStoreRows.length > 0 ? (
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
    </EnterpriseShell>
  );
}
