"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, ReceiptText, ScanBarcode, Store, WalletCards } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type { EnterprisePosTransactionDetailData } from "@/server/repositories/enterprise-pos.repository";

const numberFormatter = new Intl.NumberFormat("en-US");

type LineRow = EnterprisePosTransactionDetailData["lines"][number];
type InventoryRow = EnterprisePosTransactionDetailData["inventoryRows"][number];
type SyncTrailRow = EnterprisePosTransactionDetailData["syncTrail"][number];

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
    value === "COMPLETED" || value === "ACKNOWLEDGED"
      ? "bg-emerald-100 text-emerald-700"
      : value === "FAILED" || value === "DEAD_LETTER"
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

function formatLineIntent(value: string) {
  return value === "RETURN" ? "Return line" : "Sale line";
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

function SerialChipList({ serialNumbers }: { serialNumbers: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {serialNumbers.map((serialNumber) => (
        <span
          className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-900"
          key={serialNumber}
        >
          {serialNumber}
        </span>
      ))}
    </div>
  );
}

function PromotionBadge({
  promotionCode,
  promotionName
}: {
  promotionCode: string | null;
  promotionName: string | null;
}) {
  const label = promotionName ?? promotionCode;

  if (!label) {
    return null;
  }

  return (
    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-900">
      {label}
    </span>
  );
}

export function EnterprisePosTransactionDetail({
  detail
}: {
  detail: EnterprisePosTransactionDetailData;
}) {
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: detail.currencyCode
      }),
    [detail.currencyCode]
  );

  const totalItems = detail.lines.reduce((sum, line) => sum + line.quantity, 0);

  const lineColumns = useMemo<ColumnDef<LineRow>[]>(
    () => [
      {
        accessorKey: "productName",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.productName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.productCode}
              {row.original.barcode ? ` • ${row.original.barcode}` : ""}
            </p>
            {row.original.appliedPromotionCode || row.original.appliedPromotionName ? (
              <div className="mt-2">
                <PromotionBadge
                  promotionCode={row.original.appliedPromotionCode}
                  promotionName={row.original.appliedPromotionName}
                />
              </div>
            ) : null}
            {row.original.serialNumbers.length > 0 ? (
              <SerialChipList serialNumbers={row.original.serialNumbers} />
            ) : null}
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "lineIntent",
        header: "Intent",
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <span className="inline-flex w-fit rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
              {formatLineIntent(row.original.lineIntent)}
            </span>
            {row.original.sourceLineId ? (
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-500">
                Receipt-linked
              </span>
            ) : null}
          </div>
        )
      },
      {
        accessorKey: "quantity",
        header: "Qty",
        cell: ({ row }) => numberFormatter.format(row.original.quantity)
      },
      {
        accessorKey: "unitPrice",
        header: "Unit price",
        cell: ({ row }) => currencyFormatter.format(row.original.unitPrice)
      },
      {
        accessorKey: "discountAmount",
        header: "Discount",
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <span>{currencyFormatter.format(row.original.discountAmount)}</span>
            {row.original.appliedPromotionCode || row.original.appliedPromotionName ? (
              <PromotionBadge
                promotionCode={row.original.appliedPromotionCode}
                promotionName={row.original.appliedPromotionName}
              />
            ) : null}
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "taxAmount",
        header: "Tax",
        cell: ({ row }) => currencyFormatter.format(row.original.taxAmount)
      },
      {
        accessorKey: "lineTotal",
        header: "Line total",
        cell: ({ row }) => currencyFormatter.format(row.original.lineTotal)
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
        accessorKey: "movementType",
        header: "Movement"
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

  const syncColumns = useMemo<ColumnDef<SyncTrailRow>[]>(
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
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "aggregateType",
        header: "Aggregate"
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
        accessorKey: "receivedAtLabel",
        header: "Received",
        cell: ({ row }) => renderTimestamp(row.original.receivedAt, row.original.receivedAtLabel),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "appliedAtLabel",
        header: "Applied",
        cell: ({ row }) => renderTimestamp(row.original.appliedAt, row.original.appliedAtLabel),
        meta: {
          disableTruncate: true
        }
      }
    ],
    []
  );

  return (
    <EnterpriseShell
      activeSection="pos"
      description={`Inspect the posted basket, payment breakdown, stock impact, and inbound sync trail for ${detail.transaction.transactionNo}.`}
      eyebrow={`Flash ERP enterprise • ${detail.transaction.storeCode}`}
      heading={`POS transaction ${detail.transaction.transactionNo}`}
    >
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
            href="/pos"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to POS command
          </Link>
          {detail.transaction.originNodeCode ? (
            <Link
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
              href={`/sync/nodes/${detail.transaction.originNodeCode}`}
            >
              Open source node
            </Link>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-700">
            Last refresh {new Date(detail.refreshedAt).toLocaleString()}
          </div>
          {detail.transaction.sourceTransactionNo ? (
            <Link
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
              href={`/pos/transactions/${detail.transaction.sourceTransactionNo}`}
            >
              Source receipt {detail.transaction.sourceTransactionNo}
            </Link>
          ) : null}
          <StatusBadge value={detail.transaction.status} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          hint="Canonical total for this completed posted transaction."
          icon={ReceiptText}
          label="Basket total"
          value={currencyFormatter.format(detail.transaction.totalAmount)}
        />
        <MetricCard
          hint="Tender already recorded against this basket in enterprise."
          icon={WalletCards}
          label="Paid amount"
          value={currencyFormatter.format(detail.transaction.paidAmount)}
        />
        <MetricCard
          hint="Total number of units represented across the posted basket."
          icon={ScanBarcode}
          label="Units"
          value={numberFormatter.format(totalItems)}
        />
        <MetricCard
          hint="Store and terminal context for the posted retail fact."
          icon={Store}
          label="Store"
          value={detail.transaction.storeCode}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(22rem,1fr)]">
        <WorkspaceTabs
          ariaLabel="POS transaction detail views"
          defaultValue="basket"
          summaries={{
            basket:
              "Review the posted line items, serial capture, pricing, and payment breakdown for this basket.",
            stock:
              "Inspect the inventory movements linked back to this POS transaction in enterprise.",
            sync: "Trace the inbound sync packets that created this canonical enterprise transaction."
          }}
          tabs={[
            { value: "basket", label: "Basket", badge: "Live", badgeTone: "success" },
            { value: "stock", label: "Stock impact" },
            { value: "sync", label: "Sync trail" }
          ]}
        >
          <WorkspaceTabsContent value="basket">
            <div className="space-y-4">
              <SharedDataGrid
                columns={lineColumns}
                data={detail.lines}
                emptyLabel="No line items are attached to this transaction."
                exportFileName={`flash-erp-${detail.transaction.transactionNo}-lines`}
                searchPlaceholder="Search products in this basket"
              />

              <section className="grid gap-4 lg:grid-cols-2">
                {detail.appliedPromotions.length > 0 ? (
                  <article className="glass-panel rounded-[1.35rem] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                      Applied promotions
                    </p>
                    <div className="mt-4 space-y-3">
                      {detail.appliedPromotions.map((promotion) => (
                        <div
                          className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3"
                          key={`${promotion.promotionCode ?? "promotion"}:${promotion.promotionName ?? "unnamed"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-emerald-950">
                                {promotion.promotionName ??
                                  promotion.promotionCode ??
                                  "Enterprise promotion"}
                              </p>
                              <p className="mt-1 text-xs text-emerald-800">
                                {promotion.lineCount} line(s) received this promotion
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-emerald-950">
                              {currencyFormatter.format(promotion.discountAmount)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ) : null}

                {detail.payments.length > 0 ? (
                  <article className="glass-panel rounded-[1.35rem] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                      Payments
                    </p>
                    <div className="mt-4 space-y-3">
                      {detail.payments.map((payment) => (
                        <div
                          className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-3"
                          key={payment.id}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-stone-900">{payment.method}</p>
                              <p className="mt-1 text-xs text-stone-500">
                                {payment.reference ?? "No payment reference"}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-stone-950">
                              {currencyFormatter.format(payment.amount)}
                            </p>
                          </div>
                          <p className="mt-2 text-xs text-stone-500">
                            Received {payment.receivedAtLabel.toLowerCase()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </article>
                ) : null}

                <article className="glass-panel rounded-[1.35rem] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                    Transaction summary
                  </p>
                  <div className="mt-4 space-y-3">
                    {[
                      ["Store", detail.transaction.storeName],
                      [
                        "Terminal",
                        detail.transaction.terminalCode
                          ? `${detail.transaction.terminalCode}${
                              detail.transaction.terminalName
                                ? ` • ${detail.transaction.terminalName}`
                                : ""
                            }`
                          : "No terminal"
                      ],
                      ["Cashier", detail.transaction.cashierCode ?? "Not captured"],
                      ["Customer", detail.transaction.customerName ?? "Walk-in customer"],
                      [
                        "Source receipt",
                        detail.transaction.sourceTransactionNo ?? "Started directly from the store lane"
                      ],
                      ["Completed", detail.transaction.completedAtLabel],
                      ["Created", detail.transaction.createdAtLabel],
                      [
                        "Notes",
                        detail.transaction.notes ?? "No cashier note was attached to this basket."
                      ]
                    ].map(([label, value]) => (
                      <div
                        className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-3"
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
            </div>
          </WorkspaceTabsContent>

          <WorkspaceTabsContent value="stock">
            <SharedDataGrid
              columns={inventoryColumns}
              data={detail.inventoryRows}
              emptyLabel="No stock movement has been linked to this transaction yet."
              exportFileName={`flash-erp-${detail.transaction.transactionNo}-stock-impact`}
              searchPlaceholder="Search stock-impact rows"
            />
          </WorkspaceTabsContent>

          <WorkspaceTabsContent value="sync">
            <SharedDataGrid
              columns={syncColumns}
              data={detail.syncTrail}
              emptyLabel="No related inbound sync packets were found for this transaction."
              exportFileName={`flash-erp-${detail.transaction.transactionNo}-sync-trail`}
              searchPlaceholder="Search related sync packets"
            />
          </WorkspaceTabsContent>
        </WorkspaceTabs>

        <div className="space-y-4">
          <article className="glass-panel rounded-[1.35rem] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Financial breakdown
            </p>
            <div className="mt-4 grid gap-3">
              {[
                ["Subtotal", detail.transaction.subtotalAmount],
                ["Discount", detail.transaction.discountAmount],
                ["Tax", detail.transaction.taxAmount],
                ["Total", detail.transaction.totalAmount],
                ["Paid", detail.transaction.paidAmount],
                ["Change", detail.transaction.changeAmount]
              ].map(([label, value]) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white/90 px-4 py-3"
                  key={label}
                >
                  <p className="text-sm text-stone-700">{label}</p>
                  <p className="text-sm font-semibold text-stone-950">
                    {currencyFormatter.format(Number(value))}
                  </p>
                </div>
              ))}
            </div>
          </article>

          <article className="glass-panel rounded-[1.35rem] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Transaction posture
            </p>
            <div className="mt-4 space-y-3">
              {[
                `${detail.lines.length} line item(s) and ${detail.payments.length} payment record(s) are attached to this enterprise basket.`,
                detail.appliedPromotions.length > 0
                  ? `${detail.appliedPromotions.length} enterprise promotion(s) were captured on the posted basket.`
                  : "No enterprise promotion was captured on this basket.",
                `${detail.inventoryRows.length} inventory movement(s) currently point back to this transaction in the stock ledger.`,
                detail.syncTrail.length > 0
                  ? `${detail.syncTrail.length} related inbound packet(s) were found in the Flash ERP sync trail.`
                  : "No related inbound packets were found for this transaction in the current sync trail window."
              ].map((item) => (
                <div
                  className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800"
                  key={item}
                >
                  {item}
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="glass-panel rounded-[1.4rem] p-5">
        <p className="text-sm leading-6 text-stone-600">{detail.statusMessage}</p>
      </section>
    </EnterpriseShell>
  );
}
