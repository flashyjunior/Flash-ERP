"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowLeft,
  ClipboardList,
  CreditCard,
  ReceiptText,
  Store,
  WalletCards
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type { EnterpriseSalesOrderDetailData } from "@/server/repositories/enterprise-pos.repository";

type LineRow = EnterpriseSalesOrderDetailData["lines"][number];
type PaymentRow = EnterpriseSalesOrderDetailData["payments"][number];
type SyncRow = EnterpriseSalesOrderDetailData["syncTrail"][number];

function formatPaymentPurpose(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

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
  const isLayaway = detail.order.orderType === "LAYAWAY";
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
  const paymentColumns = useMemo<ColumnDef<PaymentRow>[]>(
    () => [
      {
        accessorKey: "paymentPurpose",
        header: "Purpose",
        cell: ({ row }) => formatPaymentPurpose(row.original.paymentPurpose)
      },
      { accessorKey: "tenderName", header: "Tender" },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => (
          <span className={row.original.amount < 0 ? "text-rose-700" : "font-semibold text-stone-950"}>
            {currency.format(row.original.amount)}
          </span>
        )
      },
      {
        accessorKey: "reference",
        header: "Reference",
        cell: ({ row }) => row.original.reference ?? "No reference"
      },
      {
        accessorKey: "cashierCode",
        header: "Received by",
        cell: ({ row }) => (
          <div>
            <p>{row.original.cashierCode ?? "Not recorded"}</p>
            <p className="text-xs text-stone-500">
              {[row.original.shiftNo, row.original.terminalCode].filter(Boolean).join(" / ") || "No shift"}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
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
        ),
        meta: { disableTruncate: true }
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
      description={`Review the original items, payment history, balance, receipts, and sync history for ${detail.order.orderNo}.`}
      eyebrow={`Flash ERP enterprise / ${detail.order.storeCode}`}
      heading={`${isLayaway ? "Layaway" : "Sales order"} ${detail.order.orderNo}`}
    >
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700"
            href={isLayaway ? "/reports?report=layawayAgeing" : "/reports?report=salesOrders"}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to reports
          </Link>
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700"
            href={`/pos/transactions/${encodeURIComponent(detail.order.sourceTransactionNo)}`}
          >
            <ReceiptText className="h-4 w-4" />
            Source receipt
          </Link>
          {detail.order.fulfilledTransactionNo ? (
            <Link
              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800"
              href={`/pos/transactions/${encodeURIComponent(detail.order.fulfilledTransactionNo)}`}
            >
              <ReceiptText className="h-4 w-4" />
              Fulfilment receipt
            </Link>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isLayaway ? (
            <span className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
              {detail.order.reservationStatus.replaceAll("_", " ")}
            </span>
          ) : null}
          <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            {detail.order.status}
          </span>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Order total", currency.format(detail.order.totalAmount), ClipboardList],
          ["Paid", currency.format(detail.order.paidAmount), CreditCard],
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
          payments: "Review every deposit, installment, and refund recorded against this order.",
          sync: "Trace the store events that created or changed this order at HQ."
        }}
        tabs={[
          { value: "items", label: "Items", badge: `${quantity} unit(s)` },
          { value: "payments", label: "Payment history", badge: String(detail.payments.length) },
          { value: "sync", label: "Sync trail", badge: String(detail.syncTrail.length) }
        ]}
      >
        <WorkspaceTabsContent value="items">
          <SharedDataGrid
            columns={lineColumns}
            data={detail.lines}
            emptyLabel="HQ has not received this order's line snapshot. Run Sync from the updated store desktop."
            exportFileName={`flash-erp-${detail.order.orderNo}-items`}
            searchPlaceholder="Search order items"
          />
        </WorkspaceTabsContent>
        <WorkspaceTabsContent value="payments">
          <SharedDataGrid
            columns={paymentColumns}
            data={detail.payments}
            emptyLabel="No payment records are attached to this order."
            exportFileName={`flash-erp-${detail.order.orderNo}-payments`}
            initialSorting={[{ id: "receivedAtLabel", desc: true }]}
            searchPlaceholder="Search payment purpose, tender, reference, cashier, shift, or terminal"
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
          <div>
            <p className="text-xs text-stone-500">Source receipt</p>
            <Link
              className="font-semibold text-sky-700 underline-offset-4 hover:underline"
              href={`/pos/transactions/${encodeURIComponent(detail.order.sourceTransactionNo)}`}
            >
              {detail.order.sourceTransactionNo}
            </Link>
          </div>
          <div><p className="text-xs text-stone-500">Operator</p><p className="font-semibold">{detail.order.operatorName ?? "Not recorded"}</p></div>
          <div><p className="text-xs text-stone-500">Last updated</p><p className="font-semibold">{new Date(detail.order.updatedAt).toLocaleString()}</p></div>
          {isLayaway ? (
            <>
              <div><p className="text-xs text-stone-500">Minimum deposit</p><p className="font-semibold">{currency.format(detail.order.minimumDepositAmount)}</p></div>
              <div><p className="text-xs text-stone-500">Original deposit</p><p className="font-semibold">{currency.format(detail.order.depositAmount)}</p></div>
              <div><p className="text-xs text-stone-500">Expires</p><p className="font-semibold">{detail.order.layawayExpiresAt ? new Date(detail.order.layawayExpiresAt).toLocaleString() : "No expiry"}</p></div>
              <div><p className="text-xs text-stone-500">Refund / fee</p><p className="font-semibold">{currency.format(detail.order.refundedAmount)} / {currency.format(detail.order.cancellationFeeAmount)}</p></div>
            </>
          ) : null}
        </div>
      </section>
    </EnterpriseShell>
  );
}
