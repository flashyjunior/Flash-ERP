"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, Boxes, ShieldAlert, Store, Waypoints } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type { EnterpriseInventoryEntryDetailData } from "@/server/repositories/enterprise-operations.repository";

const numberFormatter = new Intl.NumberFormat("en-US");

type SyncTrailRow = EnterpriseInventoryEntryDetailData["syncTrail"][number];

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
    value === "ACKNOWLEDGED"
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

export function EnterpriseInventoryEntryDetail({
  detail
}: {
  detail: EnterpriseInventoryEntryDetailData;
}) {
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: detail.currencyCode
      }),
    [detail.currencyCode]
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
        accessorKey: "recordVersion",
        header: "Version",
        cell: ({ row }) => `v${row.original.recordVersion}`
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
      activeSection="operations"
      description={`Inspect the canonical inventory movement, linked store context, and sync history for ${detail.entry.id}.`}
      eyebrow={`Flash ERP enterprise • ${detail.entry.storeCode ?? "inventory ledger"}`}
      heading={`Inventory movement ${detail.entry.id}`}
    >
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
            href="/operations"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to operations
          </Link>
          {detail.sourceNode ? (
            <Link
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
              href={`/sync/nodes/${detail.sourceNode.code}`}
            >
              Open source node
            </Link>
          ) : null}
          {detail.relatedTransaction ? (
            <Link
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
              href={`/pos/transactions/${encodeURIComponent(detail.relatedTransaction.transactionNo)}`}
            >
              Open related transaction
            </Link>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-700">
            Last refresh {new Date(detail.refreshedAt).toLocaleString()}
          </div>
          {detail.syncTrail[0] ? <StatusBadge value={detail.syncTrail[0].status} /> : null}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          hint="Canonical inventory movement type now stored in the enterprise ledger."
          icon={Waypoints}
          label="Movement"
          value={detail.entry.movementType}
        />
        <MetricCard
          hint="Accepted quantity for this store-sourced stock movement."
          icon={Boxes}
          label="Quantity"
          value={numberFormatter.format(detail.entry.quantity)}
        />
        <MetricCard
          hint="Inventory location enterprise used when posting this movement."
          icon={Store}
          label="Location"
          value={detail.entry.inventoryLocationCode}
        />
        <MetricCard
          hint="When this movement actually occurred in store operations."
          icon={ShieldAlert}
          label="Occurred"
          value={detail.entry.occurredAtLabel}
        />
      </section>

      <WorkspaceTabs
        ariaLabel="Inventory movement detail views"
        defaultValue="overview"
        summaries={{
          overview:
            "Review the canonical stock movement, product/location context, and linked transaction facts.",
          sync:
            "Trace the inbound inventory packets that created or retried this ledger movement in enterprise.",
          audit:
            "Review operator actions that were recorded against earlier failed packets for this movement."
        }}
        tabs={[
          { value: "overview", label: "Overview", badge: "Live", badgeTone: "success" },
          { value: "sync", label: "Sync trail" },
          { value: "audit", label: "Operator audit" }
        ]}
      >
        <WorkspaceTabsContent value="overview">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(22rem,1fr)]">
            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Canonical movement
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[
                    ["Product", `${detail.entry.productCode} • ${detail.entry.productName}`],
                    ["Movement type", detail.entry.movementType],
                    ["Inventory location", `${detail.entry.inventoryLocationCode} • ${detail.entry.inventoryLocationName}`],
                    [
                      "Warehouse",
                      detail.entry.warehouseCode && detail.entry.warehouseName
                        ? `${detail.entry.warehouseCode} • ${detail.entry.warehouseName}`
                        : "Warehouse binding not available"
                    ],
                    ["Reference type", detail.entry.referenceType],
                    ["Reference id", detail.entry.referenceId],
                    ["External reference", detail.entry.externalReference ?? "Not provided"],
                    [
                      "Unit cost",
                      detail.entry.unitCost !== null
                        ? currencyFormatter.format(detail.entry.unitCost)
                        : "No unit cost captured"
                    ]
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
                  Recovery guidance
                </p>
                <div className="mt-4 space-y-3">
                  {detail.recoveryMessages.map((message) => (
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

            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Store context
                </p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                    <p className="font-semibold text-stone-900">
                      {detail.entry.storeName ?? "Store binding not available"}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {detail.entry.storeCode ?? "unknown-store"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Occurred
                    </p>
                    <div className="mt-1">
                      {renderTimestamp(detail.entry.occurredAt, detail.entry.occurredAtLabel)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Created
                    </p>
                    <div className="mt-1">
                      {renderTimestamp(detail.entry.createdAt, detail.entry.createdAtLabel)}
                    </div>
                  </div>
                  {detail.sourceNode ? (
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                      <p className="font-semibold text-stone-900">{detail.sourceNode.name}</p>
                      <p className="mt-1 text-xs text-stone-500">
                        {detail.sourceNode.code}
                        {detail.sourceNode.storeCode
                          ? ` • ${detail.sourceNode.storeName} • ${detail.sourceNode.storeCode}`
                          : ""}
                      </p>
                    </div>
                  ) : null}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Related enterprise facts
                </p>
                <div className="mt-4 space-y-3">
                  {detail.relatedTransaction ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      <p className="font-semibold">{detail.relatedTransaction.transactionNo}</p>
                      <p className="mt-1">
                        {detail.relatedTransaction.storeName} • {detail.relatedTransaction.storeCode}
                      </p>
                      <p className="mt-1">
                        {currencyFormatter.format(detail.relatedTransaction.totalAmount)} •{" "}
                        {detail.relatedTransaction.completedAtLabel}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                      No canonical POS transaction is currently linked to this stock movement.
                    </div>
                  )}
                </div>
              </article>
            </div>
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="sync">
          <SharedDataGrid
            columns={syncColumns}
            data={detail.syncTrail}
            emptyLabel="No inbound sync events are linked to this inventory movement yet."
            exportFileName={`flash-erp-inventory-${detail.entry.id}-sync-trail`}
            getRowHref={(row) => `/pos/exceptions/${encodeURIComponent(row.eventId)}`}
            searchPlaceholder="Search inventory sync packets by event id, status, or event type"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="audit">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Operator audit
              </p>
              <div className="mt-4 space-y-3">
                {detail.operatorActions.length > 0 ? (
                  detail.operatorActions.map((action) => (
                    <div
                      className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700"
                      key={action.id}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge value={action.actionType} />
                        <span className="text-xs text-stone-500">
                          {action.operatorName} • {action.createdAtLabel}
                        </span>
                      </div>
                      <p className="mt-2 leading-6 text-stone-800">{action.note}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                    No operator actions were recorded for the sync packets behind this inventory movement.
                  </div>
                )}
              </div>
            </article>

            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Movement status
              </p>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                  {detail.statusMessage}
                </div>
                <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                  <p className="font-semibold text-stone-900">Latest known packet posture</p>
                  <p className="mt-2 leading-6 text-stone-700">
                    {detail.syncTrail[0]
                      ? `Record version ${detail.syncTrail[0].recordVersion} is ${detail.syncTrail[0].status.toLowerCase()} in enterprise.`
                      : "No packet posture is available for this movement yet."}
                  </p>
                </div>
              </div>
            </article>
          </section>
        </WorkspaceTabsContent>
      </WorkspaceTabs>

      <section className="glass-panel rounded-[1.4rem] p-5">
        <p className="text-sm leading-6 text-stone-600">{detail.statusMessage}</p>
      </section>
    </EnterpriseShell>
  );
}
