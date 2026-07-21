"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, ClipboardList, Store, WalletCards } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type { EnterpriseSalesOrderDetailData } from "@/server/repositories/enterprise-pos.repository";

type LineRow = EnterpriseSalesOrderDetailData["lines"][number];
type SyncRow = EnterpriseSalesOrderDetailData["syncTrail"][number];

export function EnterpriseSalesOrderDetail({
  detail
}: {
  detail: EnterpriseSalesOrderDetailData;
}) {
  const currency = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: detail.currencyCode
      }),
    [detail.currencyCode]
  );
  const quantity = detail.lines.reduce((sum, line) => sum + line.quantity, 0);
  const lineColumns = useMemo<ColumnDef<LineRow>[]>(
    () => [
      {
        accessorKey: "productName",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium text-stone-900">{row.original.productName}</p>
            <p className="text-xs text-stone-500">
              {row.original.productCode}
              {row.original.variant ? ` / ${row.original.variant}` : ""}
            </p>
            {row.original.lineNote ? (
              <p className="mt-1 text-xs text-stone-600">{row.original.lineNote}</p>
            ) : null}
          </div>
        ),
        meta: { disableTruncate: true }
      },
      { accessorKey: "quantity", header: "Qty" },
      {
        accessorKey: "unitPrice",
        header: "Unit price",
        cell: ({ row }) => currency.format(row.original.unitPrice)
      },
      {
        accessorKey: "discountAmount",
        header: "Discount",
        cell: ({ row }) => currency.format(row.original.discountAmount)
      },
      {
        accessorKey: "taxAmount",
        header: "Tax",
        cell: ({ row }) => currency.format(row.original.taxAmount)
      },
      {
        accessorKey: "lineTotal",
        header: "Total",
        cell: ({ row }) => currency.format(row.original.lineTotal)
      }
    ],
    [currency]
  );
  const syncColumns = useMemo<ColumnDef<SyncRow>[]>(
    () => [
      { accessorKey: "eventType", header: "Event" },
      { accessorKey: "status", header: "Status" },
      {
        accessorKey: "receivedAtLabel",
        header: "Received",
        cell: ({ row }) => (
          <div>
            <p>{row.original.receivedAtLabel}</p>
            <p className="text-xs text-stone-500">
              {new Date(row.original.receivedAt).toLocaleString()}
            </p>
          </div>
        )
      },
      {
        accessorKey: "errorMessage",
        header: "Result",
        cell: ({ row }) => row.original.errorMessage ?? "Applied"
      }
    ],
    []
  );

  return (
    <EnterpriseShell
      activeSection="pos"
      description={`Review the original items, deposit, balance, and sync history for ${detail.order.orderNo}.`}
      eyebrow={`Flash ERP enterprise / ${detail.order.storeCode}`}
      heading={`Sales order ${detail.order.orderNo}`}
    >
      <section className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700"
          href="/pos"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to POS command
        </Link>
        <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          {detail.order.status}
        </span>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Order total", currency.format(detail.order.totalAmount), ClipboardList],
          ["Deposit", currency.format(detail.order.depositAmount), WalletCards],
          ["Balance", currency.format(detail.order.balanceAmount), WalletCards],
          ["Store", detail.order.storeCode, Store]
        ].map(([label, value, Icon]) => (
          <article className="glass-panel rounded-[1.3rem] p-4" key={String(label)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">{String(label)}</p>
                <p className="mt-2 text-xl font-semibold text-stone-950">{String(value)}</p>
              </div>
              <Icon className="h-5 w-5 text-sky-700" />
            </div>
          </article>
        ))}
      </section>

      <WorkspaceTabs
        ariaLabel="Sales order detail views"
        defaultValue="items"
        summaries={{
          items: detail.statusMessage,
          sync: "Trace the store events that created or changed this order at HQ."
        }}
        tabs={[
          { value: "items", label: "Items", badge: `${quantity} unit(s)` },
          { value: "sync", label: "Sync trail", badge: String(detail.syncTrail.length) }
        ]}
      >
        <WorkspaceTabsContent value="items">
          <SharedDataGrid
            columns={lineColumns}
            data={detail.lines}
            emptyLabel="Line details are unavailable for sales orders synced before this update."
            exportFileName={`flash-erp-${detail.order.orderNo}-items`}
            searchPlaceholder="Search order items"
          />
        </WorkspaceTabsContent>
        <WorkspaceTabsContent value="sync">
          <SharedDataGrid
            columns={syncColumns}
            data={detail.syncTrail}
            emptyLabel="No inbound sync events are attached to this order."
            exportFileName={`flash-erp-${detail.order.orderNo}-sync`}
            searchPlaceholder="Search order sync events"
          />
        </WorkspaceTabsContent>
      </WorkspaceTabs>

      <section className="glass-panel rounded-[1.3rem] p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div><p className="text-xs text-stone-500">Customer</p><p className="font-semibold">{detail.order.customerName ?? "No customer"}</p><p className="text-xs text-stone-500">{detail.order.customerNo ?? ""}</p></div>
          <div><p className="text-xs text-stone-500">Source basket</p><p className="font-semibold">{detail.order.sourceTransactionNo}</p></div>
          <div><p className="text-xs text-stone-500">Operator</p><p className="font-semibold">{detail.order.operatorName ?? "Not recorded"}</p></div>
          <div><p className="text-xs text-stone-500">Last updated</p><p className="font-semibold">{new Date(detail.order.updatedAt).toLocaleString()}</p></div>
        </div>
      </section>
    </EnterpriseShell>
  );
}
