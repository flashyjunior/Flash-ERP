"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import { AlertTriangle, ClipboardList, ReceiptText, Store, WalletCards } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type { EnterprisePosWorkspaceData } from "@/server/repositories/enterprise-pos.repository";

const numberFormatter = new Intl.NumberFormat("en-US");

type TransactionRow = EnterprisePosWorkspaceData["transactionRows"][number];
type SalesOrderRow = EnterprisePosWorkspaceData["salesOrderRows"][number];
type ExceptionRow = EnterprisePosWorkspaceData["exceptionRows"][number];
type LaneRow = EnterprisePosWorkspaceData["laneRows"][number];

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
    value === "FAILED" || value === "DEAD_LETTER" || value === "CANCELLED"
      ? "bg-rose-100 text-rose-700"
      : value === "FULFILLED"
        ? "bg-emerald-100 text-emerald-700"
        : value === "OPEN"
          ? "bg-amber-100 text-amber-700"
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

const transactionFilter: FilterFn<TransactionRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.transactionNo,
    row.original.store,
    row.original.storeCode,
    row.original.cashierCode ?? "",
    row.original.productSummary,
    row.original.promotionSummary ?? "",
    row.original.tenderSummary
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
    row.original.sourceTransactionNo,
    row.original.customerName ?? "",
    row.original.customerNo ?? "",
    row.original.status,
    row.original.fulfilledTransactionNo ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const laneFilter: FilterFn<LaneRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [row.original.store, row.original.storeCode, row.original.nodeCode]
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

export function EnterprisePosWorkspace({
  workspace
}: {
  workspace: EnterprisePosWorkspaceData;
}) {
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: workspace.currencyCode
      }),
    [workspace.currencyCode]
  );
  const hasActiveFilter = Boolean(
    workspace.filters.storeCode || workspace.filters.dateFrom || workspace.filters.dateTo
  );
  const activeFilterLabel = [
    workspace.filters.scopeLabel,
    workspace.filters.dateFrom || workspace.filters.dateTo
      ? `${workspace.filters.dateFrom || "Start"} to ${workspace.filters.dateTo || "Today"}`
      : "All dates"
  ].join(" / ");

  const transactionColumns = useMemo<ColumnDef<TransactionRow>[]>(
    () => [
      {
        accessorKey: "transactionNo",
        header: "Transaction",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.transactionNo}</p>
            <p className="truncate text-xs text-stone-500">{row.original.productSummary}</p>
            {row.original.promotionSummary ? (
              <p className="truncate text-xs text-emerald-700">
                Promotion: {row.original.promotionSummary}
              </p>
            ) : null}
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
            <p className="truncate text-sm font-medium text-stone-900">{row.original.store}</p>
            <p className="truncate text-xs text-stone-500">
              {[
                row.original.terminal ?? "No terminal",
                row.original.cashierCode ? `Cashier ${row.original.cashierCode}` : null
              ]
                .filter(Boolean)
                .join(" / ")}
            </p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "totalAmount",
        header: "Total",
        cell: ({ row }) => currencyFormatter.format(row.original.totalAmount)
      },
      {
        accessorKey: "itemCount",
        header: "Items",
        cell: ({ row }) => numberFormatter.format(row.original.itemCount)
      },
      {
        accessorKey: "tenderSummary",
        header: "Tender"
      },
      {
        accessorKey: "completedAtLabel",
        header: "Completed",
        cell: ({ row }) => renderTimestamp(row.original.completedAt, row.original.completedAtLabel),
        meta: {
          disableTruncate: true
        }
      }
    ],
    [currencyFormatter]
  );

  const exceptionColumns = useMemo<ColumnDef<ExceptionRow>[]>(
    () => [
      {
        accessorKey: "eventType",
        header: "Packet",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.eventType}</p>
            <p className="truncate text-xs text-stone-500">{row.original.eventId}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "store",
        header: "Store"
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "referenceLabel",
        header: "Reference"
      },
      {
        accessorKey: "errorMessage",
        header: "Failure",
        cell: ({ row }) => row.original.errorMessage ?? "Operator review required"
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
            <p className="truncate text-sm font-medium text-stone-900">{row.original.store}</p>
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
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "totalAmount",
        header: "Total",
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

  const laneColumns = useMemo<ColumnDef<LaneRow>[]>(
    () => [
      {
        accessorKey: "store",
        header: "Store",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.store}</p>
            <p className="truncate text-xs text-stone-500">{row.original.nodeCode}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "completedTransactions",
        header: "Posted sales",
        cell: ({ row }) => numberFormatter.format(row.original.completedTransactions)
      },
      {
        accessorKey: "salesValue",
        header: "Revenue",
        cell: ({ row }) => currencyFormatter.format(row.original.salesValue)
      },
      {
        accessorKey: "exceptionCount",
        header: "Exceptions",
        cell: ({ row }) => numberFormatter.format(row.original.exceptionCount)
      },
      {
        accessorKey: "lastTransactionAtLabel",
        header: "Last posting",
        cell: ({ row }) =>
          renderTimestamp(row.original.lastTransactionAt, row.original.lastTransactionAtLabel),
        meta: {
          disableTruncate: true
        }
      }
    ],
    [currencyFormatter]
  );

  return (
    <EnterpriseShell
      activeSection="pos"
      description="Review canonical posted transactions, investigate upstream POS exceptions, and see which store lanes are actively landing sales in enterprise."
      eyebrow="Flash ERP enterprise"
      heading="POS command"
    >
      {hasActiveFilter ? (
        <section className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Drilldown filter
              </p>
              <p className="mt-1 text-sm font-semibold text-sky-950">{activeFilterLabel}</p>
            </div>
            <Link
              className="inline-flex w-fit items-center justify-center rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-800 transition hover:border-sky-300 hover:text-sky-950"
              href="/pos"
            >
              Clear filter
            </Link>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          hint="Completed store sales that have already landed in enterprise POS tables."
          icon={ReceiptText}
          label="Completed sales"
          value={numberFormatter.format(workspace.metrics.completedTransactions)}
        />
        <MetricCard
          hint="Canonical posted revenue currently available for HQ review."
          icon={WalletCards}
          label="Posted revenue"
          value={currencyFormatter.format(workspace.metrics.postedRevenue)}
        />
        <MetricCard
          hint="Average value per completed posted basket in the enterprise POS ledger."
          icon={Store}
          label="Average basket"
          value={currencyFormatter.format(workspace.metrics.averageBasket)}
        />
        <MetricCard
          hint="Inbound POS packets that still need repair before they can become trusted enterprise facts."
          icon={AlertTriangle}
          label="POS exceptions"
          value={numberFormatter.format(workspace.metrics.exceptionCount)}
        />
      </section>

      <WorkspaceTabs
        ariaLabel="Enterprise POS views"
        defaultValue="transactions"
        summaries={{
          transactions:
            "Inspect the canonical completed transactions that already landed in enterprise POS tables.",
          exceptions:
            "Review failed or dead-letter upstream POS packets and jump to the right store node for recovery.",
          orders:
            "Track store-created sales orders from hold through fulfilment without leaving the enterprise POS lane.",
          lanes:
            "See which stores are actively posting sales and which lanes are still silent or exception-heavy."
        }}
        tabs={[
          {
            value: "transactions",
            label: "Transactions",
            badge: "Live",
            badgeTone: "success"
          },
          {
            value: "exceptions",
            label: "Exceptions",
            badge: workspace.metrics.exceptionCount > 0 ? "Review" : "Clean",
            badgeTone: workspace.metrics.exceptionCount > 0 ? "warning" : "success"
          },
          {
            value: "orders",
            label: "Sales orders",
            badge: workspace.salesOrderRows.some((order) => order.status === "OPEN") ? "Open" : "Tracked",
            badgeTone: workspace.salesOrderRows.some((order) => order.status === "OPEN") ? "warning" : "success"
          },
          { value: "lanes", label: "Store lanes" }
        ]}
      >
        <WorkspaceTabsContent value="transactions">
          <SharedDataGrid
            columns={transactionColumns}
            data={workspace.transactionRows}
            emptyLabel="No canonical store transactions have landed in enterprise yet."
            exportFileName="flash-erp-enterprise-pos-transactions"
            getRowHref={(row) => `/pos/transactions/${encodeURIComponent(row.transactionNo)}`}
            globalFilterFn={transactionFilter}
            searchPlaceholder="Search transaction numbers, stores, products, or tender types"
            toolbarActions={
              <Link
                className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                href="/operations"
              >
                Open operations ledger
              </Link>
            }
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="exceptions">
          <SharedDataGrid
            columns={exceptionColumns}
            data={workspace.exceptionRows}
            emptyLabel="There are no POS-related inbound projection exceptions right now."
            exportFileName="flash-erp-enterprise-pos-exceptions"
            getRowHref={(row) => `/pos/exceptions/${encodeURIComponent(row.eventId)}`}
            globalFilterFn={exceptionFilter}
            searchPlaceholder="Search stores, packet types, references, or failure messages"
            toolbarActions={
              <Link
                className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                href="/sync"
              >
                Open sync recovery
              </Link>
            }
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="orders">
          <SharedDataGrid
            columns={salesOrderColumns}
            data={workspace.salesOrderRows}
            emptyLabel="No store-created sales orders have landed in enterprise yet."
            exportFileName="flash-erp-enterprise-sales-orders"
            getRowHref={(row) => `/pos/sales-orders/${encodeURIComponent(row.orderNo)}`}
            globalFilterFn={salesOrderFilter}
            searchPlaceholder="Search orders, baskets, customers, or fulfilment references"
            toolbarActions={
              <Link
                className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                href="/reports"
              >
                <ClipboardList className="h-4 w-4" />
                Open reports
              </Link>
            }
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="lanes">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,1fr)]">
            <SharedDataGrid
              columns={laneColumns}
              data={workspace.laneRows}
              emptyLabel="No store lanes are provisioned yet."
              exportFileName="flash-erp-enterprise-pos-lanes"
              getRowHref={(row) => `/sync/nodes/${row.nodeCode}`}
              globalFilterFn={laneFilter}
              searchPlaceholder="Search stores, codes, or node bindings"
            />

            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                      Posting posture
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      Last refreshed {new Date(workspace.refreshedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-full border border-stone-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-600">
                    POS
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {workspace.postureMessages.map((item) => (
                    <div
                      className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800"
                      key={item}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Immediate priorities
                </p>
                <div className="mt-4 space-y-3">
                  {workspace.priorities.map((item) => (
                    <div
                      className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-3 text-sm leading-6 text-stone-700"
                      key={item}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>
        </WorkspaceTabsContent>
      </WorkspaceTabs>

      <section className="glass-panel rounded-[1.4rem] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              POS posture
            </p>
            <h2 className="mt-1 text-lg font-semibold text-stone-950">
              Flash ERP enterprise can now separate posted sales review from sync recovery work without losing the link between them.
            </h2>
          </div>
          <Link
            className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
            href="/sync"
          >
            Review node recovery
          </Link>
        </div>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-stone-600">{workspace.statusMessage}</p>
      </section>
    </EnterpriseShell>
  );
}
