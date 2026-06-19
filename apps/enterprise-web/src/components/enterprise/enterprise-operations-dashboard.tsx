"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  AlertTriangle,
  Boxes,
  ClipboardCheck,
  Landmark,
  ReceiptText,
  Store,
  WalletCards
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type { EnterpriseOperationsDashboardData } from "@/server/repositories/enterprise-operations.repository";

const numberFormatter = new Intl.NumberFormat("en-US");

type SalesRow = EnterpriseOperationsDashboardData["salesRows"][number];
type InventoryRow = EnterpriseOperationsDashboardData["inventoryRows"][number];
type ReconciliationRow = EnterpriseOperationsDashboardData["reconciliationRows"][number];
type BankingRow = EnterpriseOperationsDashboardData["bankingRows"][number];

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

function MovementBadge({ value }: { value: string }) {
  const tone =
    value === "SALE"
      ? "bg-sky-100 text-sky-700"
      : value === "RETURN"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-stone-100 text-stone-700";

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

const salesFilter: FilterFn<SalesRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.transactionNo,
    row.original.store,
    row.original.storeCode,
    row.original.productSummary,
    row.original.paymentSummary
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const inventoryFilter: FilterFn<InventoryRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.productCode,
    row.original.productName,
    row.original.store,
    row.original.storeCode,
    row.original.movementType,
    row.original.externalReference ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const reconciliationFilter: FilterFn<ReconciliationRow> = (row, _columnId, filterValue) => {
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

const bankingFilter: FilterFn<BankingRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.depositNo,
    row.original.store,
    row.original.storeCode,
    row.original.reconciliationNo,
    row.original.shiftNo,
    row.original.bankName ?? "",
    row.original.reference ?? ""
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

export function EnterpriseOperationsDashboard({
  dashboard
}: {
  dashboard: EnterpriseOperationsDashboardData;
}) {
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: dashboard.currencyCode
      }),
    [dashboard.currencyCode]
  );

  const salesColumns = useMemo<ColumnDef<SalesRow>[]>(
    () => [
      {
        accessorKey: "transactionNo",
        header: "Transaction",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.transactionNo}</p>
            <p className="truncate text-xs text-stone-500">{row.original.productSummary}</p>
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
        accessorKey: "totalAmount",
        header: "Total",
        cell: ({ row }) => currencyFormatter.format(row.original.totalAmount)
      },
      {
        accessorKey: "lineCount",
        header: "Lines",
        cell: ({ row }) => `${numberFormatter.format(row.original.lineCount)} item(s)`
      },
      {
        accessorKey: "paymentSummary",
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

  const inventoryColumns = useMemo<ColumnDef<InventoryRow>[]>(
    () => [
      {
        accessorKey: "productName",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.productName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.productCode}</p>
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
        accessorKey: "movementType",
        header: "Movement",
        cell: ({ row }) => <MovementBadge value={row.original.movementType} />,
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "quantity",
        header: "Quantity",
        cell: ({ row }) => numberFormatter.format(row.original.quantity)
      },
      {
        accessorKey: "externalReference",
        header: "Reference",
        cell: ({ row }) => row.original.externalReference ?? "Manual reference"
      },
      {
        accessorKey: "occurredAtLabel",
        header: "Occurred",
        cell: ({ row }) => renderTimestamp(row.original.occurredAt, row.original.occurredAtLabel),
        meta: {
          disableTruncate: true
        }
      }
    ],
    []
  );

  const reconciliationColumns = useMemo<ColumnDef<ReconciliationRow>[]>(
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
            <p className="truncate text-sm font-medium text-stone-900">{row.original.store}</p>
            <p className="truncate text-xs text-stone-500">{row.original.terminal ?? "No terminal"}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "declaredCashAmount",
        header: "Declared cash",
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
        cell: ({ row }) => currencyFormatter.format(row.original.remainingBankingAmount)
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

  const bankingColumns = useMemo<ColumnDef<BankingRow>[]>(
    () => [
      {
        accessorKey: "depositNo",
        header: "Deposit",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.depositNo}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.reconciliationNo} • {row.original.shiftNo}
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
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => currencyFormatter.format(row.original.amount)
      },
      {
        accessorKey: "bankName",
        header: "Bank",
        cell: ({ row }) => row.original.bankName ?? "Cash office"
      },
      {
        accessorKey: "reference",
        header: "Reference",
        cell: ({ row }) => row.original.reference ?? "No reference"
      },
      {
        accessorKey: "depositedAtLabel",
        header: "Deposited",
        cell: ({ row }) => renderTimestamp(row.original.depositedAt, row.original.depositedAtLabel),
        meta: {
          disableTruncate: true
        }
      }
    ],
    [currencyFormatter]
  );

  return (
    <EnterpriseShell
      activeSection="operations"
      description="Inspect the canonical enterprise sales ledger and inventory movements that were projected out of store sync packets. This view shows what Flash ERP has accepted as retail fact, not just what is queued."
      eyebrow="Flash ERP enterprise"
      heading="Operations ledger"
    >
      <section className="grid gap-4 xl:grid-cols-3">
        <MetricCard
          hint="Completed store-posted transactions now written into enterprise POS tables."
          icon={ReceiptText}
          label="Posted sales"
          value={numberFormatter.format(dashboard.metrics.postedTransactions)}
        />
        <MetricCard
          hint="Total value of canonical posted sales currently visible across the enterprise estate."
          icon={WalletCards}
          label="Posted revenue"
          value={currencyFormatter.format(dashboard.metrics.postedRevenue)}
        />
        <MetricCard
          hint="Store-sourced inventory movements already written into the enterprise ledger."
          icon={Boxes}
          label="Stock movements"
          value={numberFormatter.format(dashboard.metrics.stockMovements)}
        />
        <MetricCard
          hint="Upstream packets that still need operator attention before they can be trusted as enterprise fact."
          icon={AlertTriangle}
          label="Projection issues"
          value={numberFormatter.format(dashboard.metrics.projectionIssues)}
        />
        <MetricCard
          hint="Store end-of-day reconciliations already written into the enterprise closeout ledger."
          icon={ClipboardCheck}
          label="Closeouts"
          value={numberFormatter.format(dashboard.metrics.closeoutsPosted)}
        />
        <MetricCard
          hint="Cash that store managers have already banked and pushed into enterprise visibility."
          icon={Landmark}
          label="Banked cash"
          value={currencyFormatter.format(dashboard.metrics.bankedAmount)}
        />
      </section>

      <WorkspaceTabs
        ariaLabel="Enterprise operations views"
        defaultValue="sales"
        summaries={{
          sales:
            "Review recent store-posted transactions that have already landed in enterprise tables.",
          inventory:
            "Inspect enterprise inventory movements created from store sync events.",
          closeout:
            "Inspect store EOD reconciliations, drawer variance, and declared cash already accepted by enterprise.",
          banking:
            "Review canonical banking deposits linked back to the exact reconciliation and shift they closed.",
          posture:
            "See which stores are actively posting, which remain silent, and whether upstream projection is healthy."
        }}
        tabs={[
          { value: "sales", label: "Posted sales", badge: "Live", badgeTone: "success" },
          { value: "inventory", label: "Inventory ledger" },
          {
            value: "closeout",
            label: "Closeouts",
            badge: dashboard.metrics.closeoutsPosted > 0 ? "Live" : "Awaiting",
            badgeTone: dashboard.metrics.closeoutsPosted > 0 ? "success" : "warning"
          },
          {
            value: "banking",
            label: "Banking",
            badge: dashboard.metrics.bankedAmount > 0 ? "Live" : "Quiet",
            badgeTone: dashboard.metrics.bankedAmount > 0 ? "success" : "default"
          },
          {
            value: "posture",
            label: "Posting posture",
            badge: dashboard.metrics.projectionIssues > 0 ? "Review" : "Healthy",
            badgeTone: dashboard.metrics.projectionIssues > 0 ? "warning" : "success"
          }
        ]}
      >
        <WorkspaceTabsContent value="sales">
          <SharedDataGrid
            columns={salesColumns}
            data={dashboard.salesRows}
            emptyLabel="No store-posted sales have landed in enterprise yet."
            exportFileName="flash-erp-enterprise-posted-sales"
            getRowHref={(row) => `/pos/transactions/${encodeURIComponent(row.transactionNo)}`}
            globalFilterFn={salesFilter}
            searchPlaceholder="Search transactions, stores, product snapshots, or tender types"
            toolbarActions={
              <Link
                className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                href="/sync"
              >
                Open sync command
              </Link>
            }
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="inventory">
          <SharedDataGrid
            columns={inventoryColumns}
            data={dashboard.inventoryRows}
            emptyLabel="No store-sourced inventory movements have been projected into enterprise yet."
            exportFileName="flash-erp-enterprise-inventory-ledger"
            getRowHref={(row) => `/operations/inventory/${encodeURIComponent(row.entryId)}`}
            globalFilterFn={inventoryFilter}
            searchPlaceholder="Search products, stores, movement types, or references"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="closeout">
          <SharedDataGrid
            columns={reconciliationColumns}
            data={dashboard.reconciliationRows}
            emptyLabel="No EOD reconciliations have landed in enterprise yet."
            exportFileName="flash-erp-enterprise-closeouts"
            globalFilterFn={reconciliationFilter}
            searchPlaceholder="Search closeouts, shifts, stores, or cashiers"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="banking">
          <SharedDataGrid
            columns={bankingColumns}
            data={dashboard.bankingRows}
            emptyLabel="No banking deposits have been projected into enterprise yet."
            exportFileName="flash-erp-enterprise-banking"
            globalFilterFn={bankingFilter}
            searchPlaceholder="Search deposits, reconciliations, stores, banks, or references"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="posture">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
            <div className="grid gap-4 md:grid-cols-2">
              {dashboard.storeSummaries.map((store) => (
                <article className="glass-panel rounded-[1.3rem] p-5" key={store.storeCode}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                        Store activity
                      </p>
                      <h2 className="mt-2 text-lg font-semibold text-stone-950">{store.store}</h2>
                      <p className="mt-1 text-xs text-stone-500">{store.storeCode}</p>
                    </div>
                    {store.nodeCode ? (
                      <Link
                        className="rounded-full border border-stone-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-600 transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
                        href={`/sync/nodes/${store.nodeCode}`}
                      >
                        Node
                      </Link>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-stone-200 bg-white/90 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        Posted sales
                      </p>
                      <p className="mt-2 text-lg font-semibold text-stone-950">
                        {numberFormatter.format(store.postedTransactions)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-stone-200 bg-white/90 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        Revenue
                      </p>
                      <p className="mt-2 text-lg font-semibold text-stone-950">
                        {currencyFormatter.format(store.salesValue)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-stone-200 bg-white/90 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        Movements
                      </p>
                      <p className="mt-2 text-lg font-semibold text-stone-950">
                        {numberFormatter.format(store.stockMovements)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-stone-200 bg-white/90 px-4 py-3 text-sm text-stone-700">
                    Last posted activity {store.lastPostedAtLabel.toLowerCase()}.
                  </div>
                </article>
              ))}
            </div>

            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                      Posting summary
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      Last refreshed {new Date(dashboard.refreshedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-full border border-stone-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-600">
                    Operations
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {dashboard.projectionMessages.map((item) => (
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
                  {dashboard.priorities.map((item) => (
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
              Canonical posture
            </p>
            <h2 className="mt-1 text-lg font-semibold text-stone-950">
              Store sync is no longer just transport. Flash ERP is persisting real enterprise operations that HQ can inspect and reconcile.
            </h2>
          </div>
          <Link
            className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
            href="/sync"
          >
            Review node health
          </Link>
        </div>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-stone-600">{dashboard.statusMessage}</p>
      </section>
    </EnterpriseShell>
  );
}
