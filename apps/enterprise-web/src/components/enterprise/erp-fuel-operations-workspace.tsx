"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  Camera,
  CreditCard,
  Droplets,
  Eye,
  ExternalLink,
  Fuel,
  Gauge,
  LoaderCircle,
  MapPin,
  PackagePlus,
  Pencil,
  Plus,
  Printer,
  Scale,
  Store,
  Trash2,
  Upload,
  Warehouse,
  type LucideIcon
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import {
  defaultThermalReceiptTemplateHtml,
  documentTemplateRawHtml,
  renderDocumentTemplateHtml,
  type TemplateTokenValue
} from "@/lib/templates/thermal-receipt-templates";
import type {
  CreateFuelDeliveryRequest,
  CreateFuelMeterReadingRequest,
  CreateFuelReconciliationRequest,
  CreateFuelSaleRequest,
  CreateFuelStationDeliveryRequest,
  CreateFuelTankDipRequest,
  FulfillFuelSaleOrderRequest,
  FuelOperationsMutationResponse,
  FuelOperationsWorkspaceData,
  RecordFuelTransferFeedbackRequest,
  UpsertFuelNozzleRequest,
  UpsertFuelPumpRequest,
  UpsertFuelStationRequest,
  UpsertFuelTankRequest
} from "@/server/repositories/erp-fuel-operations.repository";

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

export type ViewKey =
  | "tanks"
  | "pumps"
  | "dips"
  | "meter-readings"
  | "sales"
  | "stations"
  | "station-deliveries"
  | "supplier-receipts"
  | "reconciliation";

type TankRow = FuelOperationsWorkspaceData["tankRows"][number];
type PumpRow = FuelOperationsWorkspaceData["pumpRows"][number];
type NozzleRow = FuelOperationsWorkspaceData["nozzleRows"][number];
type DipRow = FuelOperationsWorkspaceData["dipRows"][number];
type MeterReadingRow = FuelOperationsWorkspaceData["meterReadingRows"][number];
type DeliveryRow = FuelOperationsWorkspaceData["deliveryRows"][number];
type StationRow = FuelOperationsWorkspaceData["stationRows"][number];
type StationDeliveryRow = FuelOperationsWorkspaceData["stationDeliveryRows"][number];
type FuelSaleRow = FuelOperationsWorkspaceData["fuelSaleRows"][number];
type ReconciliationRow = FuelOperationsWorkspaceData["reconciliationRows"][number];
type ReconciliationLineRow = FuelOperationsWorkspaceData["reconciliationLineRows"][number];
type FuelReceiptTemplateOption = FuelOperationsWorkspaceData["receiptTemplateOptions"][number];
type FuelSalePaymentDraft = {
  id: string;
  tenderMethodCode: string;
  amount: string;
  reference: string;
  receivedAt: string;
  notes: string;
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3
});
const moneyFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2
});

function formatEnumLabel(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function dateOnly(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function fuelSalePaymentDraftId() {
  return `fuel-sale-payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createFuelSalePaymentDraft(
  tenderMethodCode = "",
  amount = "",
  receivedAt = ""
): FuelSalePaymentDraft {
  return {
    id: fuelSalePaymentDraftId(),
    tenderMethodCode,
    amount,
    reference: "",
    receivedAt,
    notes: ""
  };
}

type FuelReceiptPaperKind = "THERMAL" | "A4";

function resolveReceiptPaperKind(value: string | null | undefined): FuelReceiptPaperKind {
  return value === "A4" ? "A4" : "THERMAL";
}

function escapeReceiptHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderReceiptLogo(companyLogoUrl: string | null | undefined, altText: string) {
  if (!companyLogoUrl?.trim()) {
    return "";
  }

  const trimmedUrl = companyLogoUrl.trim();
  const resolvedUrl =
    /^https?:\/\//i.test(trimmedUrl) || /^(data|blob):/i.test(trimmedUrl)
      ? trimmedUrl
      : `${typeof window === "undefined" ? "" : window.location.origin}${
          trimmedUrl.startsWith("/") ? "" : "/"
        }${trimmedUrl}`;

  return `<img alt="${escapeReceiptHtml(altText)}" class="logo" onerror="this.remove()" src="${escapeReceiptHtml(resolvedUrl)}" />`;
}

function renderReceiptLogoBlock(companyLogoUrl: string | null | undefined, altText: string) {
  const logoHtml = renderReceiptLogo(companyLogoUrl, altText);

  if (!logoHtml) {
    return "";
  }

  return `<div class="document-logo" style="margin-bottom:10px; text-align:center;">${logoHtml}</div>`;
}

function formatReceiptMoney(value: number, currencyCode: string) {
  return `${currencyCode} ${moneyFormatter.format(value)}`;
}

function renderReceiptTemplateTaxRow(amount: number, currencyCode: string) {
  if (Math.abs(amount) < 0.005) {
    return "";
  }

  return `<tr>
    <td style="padding:0.12rem 0; font-size:0.74rem; text-transform:uppercase; color:#78716c;">Tax</td>
    <td style="padding:0.12rem 0; text-align:right;">${escapeReceiptHtml(formatReceiptMoney(amount, currencyCode))}</td>
  </tr>`;
}

function renderReceiptTemplateDetailsBlock(lines: Array<string | null | undefined>) {
  const visibleLines = lines.map((line) => line?.trim()).filter(Boolean);

  if (visibleLines.length === 0) {
    return "";
  }

  return `<div style="margin-top:0.55rem; border-top:1px dashed #d6d3d1; border-bottom:1px dashed #d6d3d1; padding:0.42rem 0; text-align:center; font-size:0.72rem; line-height:1.35; color:#44403c;">
    ${visibleLines.map((line) => `<span style="display:block;">${escapeReceiptHtml(line)}</span>`).join("")}
  </div>`;
}

function removeEmptyTemplateRows(renderedHtml: string, labels: string[]) {
  return labels.reduce((currentHtml, label) => {
    const rowPattern = new RegExp(
      `<tr>\\s*<t[dh][^>]*>\\s*${label}\\s*<\\/t[dh]>\\s*<t[dh][^>]*>\\s*(?:&nbsp;|\\s|<br\\s*\\/?>)*<\\/t[dh]>\\s*<\\/tr>`,
      "gi"
    );

    return currentHtml.replace(rowPattern, "");
  }, renderedHtml);
}

function renderFuelThermalReceiptHtml(
  templateHtml: string,
  tokens: Record<string, TemplateTokenValue>,
  options: {
    fallbackLogoHtml?: string;
  } = {}
) {
  const logoHtml =
    options.fallbackLogoHtml && !/\{COMPANY_LOGO_HTML\}/i.test(templateHtml)
      ? options.fallbackLogoHtml
      : "";

  return removeEmptyTemplateRows(`${logoHtml}${renderDocumentTemplateHtml(templateHtml, tokens)}`, [
    "Source",
    "Status"
  ]);
}

function receiptLineRows(
  lines: Array<{
    productCode: string | null;
    productName: string | null;
    uomCode: string;
    quantity?: number;
    deliveredQuantity?: number;
    unitPrice?: number;
    unitSellingPrice?: number;
    lineAmount?: number;
    salesAmount?: number;
  }>
) {
  return lines
    .map((line) => {
      const quantity = line.quantity ?? line.deliveredQuantity ?? 0;
      const unitPrice = line.unitPrice ?? line.unitSellingPrice ?? 0;
      const amount = line.lineAmount ?? line.salesAmount ?? 0;
      const productLabel = line.productCode ?? line.productName ?? "Fuel";
      const productName =
        line.productName && line.productName !== line.productCode ? line.productName : "";

      return `
        <tr>
          <td style="padding:0.36rem 0 0.3rem 0; border-top:1px dashed #e7e5e4;">
            <div style="font-weight:650; color:#111827;">${escapeReceiptHtml(productLabel)}</div>
            ${productName ? `<div style="font-size:0.69rem; color:#78716c;">${escapeReceiptHtml(productName)}</div>` : ""}
            <div style="font-size:0.69rem; color:#78716c;">
              ${escapeReceiptHtml(numberFormatter.format(quantity))} ${escapeReceiptHtml(line.uomCode)}
              x ${escapeReceiptHtml(moneyFormatter.format(unitPrice))}
            </div>
          </td>
          <td style="padding:0.36rem 0.2rem 0.3rem 0; border-top:1px dashed #e7e5e4; text-align:right;">${escapeReceiptHtml(numberFormatter.format(quantity))}</td>
          <td style="padding:0.36rem 0 0.3rem 0.42rem; border-top:1px dashed #e7e5e4; text-align:right;">${escapeReceiptHtml(moneyFormatter.format(amount))}</td>
        </tr>`;
    })
    .join("");
}

function receiptItemTable(
  lines: Parameters<typeof receiptLineRows>[0]
) {
  return `<table style="margin-top:0.62rem; width:100%; table-layout:fixed; border-collapse:collapse;">
    <colgroup>
      <col style="width:56%;" />
      <col style="width:14%;" />
      <col style="width:30%;" />
    </colgroup>
    <thead>
      <tr>
        <th style="padding:0.24rem 0; border-bottom:1px solid #d6d3d1; text-align:left; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Item</th>
        <th style="padding:0.24rem 0.2rem 0.24rem 0; border-bottom:1px solid #d6d3d1; text-align:right; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Qty</th>
        <th style="padding:0.24rem 0 0.24rem 0.42rem; border-bottom:1px solid #d6d3d1; text-align:right; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Total</th>
      </tr>
    </thead>
    <tbody>${receiptLineRows(lines)}</tbody>
  </table>`;
}

function receiptPaymentRows(
  payments: Array<{
    tenderMethodName: string | null;
    paymentMode: string;
    cashbookAccountName: string | null;
    amount: number;
    reference: string | null;
  }>
) {
  if (payments.length === 0) {
    return `<div style="margin-top:0.62rem; color:#78716c; font-size:0.74rem;">No tender lines were captured for this receipt.</div>`;
  }

  const rows = payments
    .map((payment) => {
      const label =
        payment.tenderMethodName ??
        payment.cashbookAccountName ??
        formatEnumLabel(payment.paymentMode);

      return `
        <tr>
          <td style="padding:0.28rem 0 0.24rem 0; border-top:1px dashed #e7e5e4;">
            <div style="font-weight:600; color:#111827;">${escapeReceiptHtml(label)}</div>
            <div style="font-size:0.69rem; color:#78716c;">${escapeReceiptHtml(payment.reference ?? payment.paymentMode)}</div>
          </td>
          <td style="padding:0.28rem 0 0.24rem 0; border-top:1px dashed #e7e5e4; text-align:right;">${escapeReceiptHtml(moneyFormatter.format(payment.amount))}</td>
        </tr>`;
    })
    .join("");

  return `<table style="margin-top:0.62rem; width:100%; border-collapse:collapse;">
    <thead>
      <tr>
        <th style="padding:0.24rem 0; border-bottom:1px solid #d6d3d1; text-align:left; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Tender</th>
        <th style="padding:0.24rem 0; border-bottom:1px solid #d6d3d1; text-align:right; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function resolveFuelReceiptTemplate(
  templates: FuelReceiptTemplateOption[],
  paperKind: FuelReceiptPaperKind
) {
  const salesReceiptTemplates = templates.filter((template) => {
    const identity = `${template.receiptTemplateCode} ${template.name}`.toLowerCase();

    return (
      !identity.includes("account-payment") &&
      !identity.includes("account payment") &&
      !identity.includes("payment receipt") &&
      !identity.includes("goods-receipt") &&
      !identity.includes("goods receipt") &&
      !identity.includes("purchase-order") &&
      !identity.includes("purchase order")
    );
  });
  const matchingTemplates = salesReceiptTemplates.filter((template) =>
    paperKind === "A4" ? template.paperWidthMm >= 200 : template.paperWidthMm < 200
  );
  const salesStarter = matchingTemplates.find((template) =>
    `${template.receiptTemplateCode} ${template.name}`.toLowerCase().includes("sales")
  );

  return salesStarter ?? matchingTemplates[0] ?? null;
}

function buildFuelReceiptTemplateTokens(input: {
  companyName: string;
  companyLogoUrl: string | null;
  currencyCode: string;
  receiptTitle: string;
  receiptNo: string;
  receiptDate: string | null;
  customerName: string | null;
  sourceLabel: string | null;
  statusLabel: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceLabel: string;
  itemTableHtml: string;
  paymentTableHtml: string;
  comments: Array<string | null | undefined>;
}): Record<string, TemplateTokenValue> {
  const companyLogoUrl = input.companyLogoUrl?.trim() ?? "";

  return {
    RETAIL_ORG_NAME: input.companyName,
    COMPANY_LOGO: companyLogoUrl,
    COMPANY_LOGO_URL: companyLogoUrl,
    COMPANY_LOGO_HTML: documentTemplateRawHtml(
      renderReceiptLogoBlock(input.companyLogoUrl, `${input.companyName} logo`)
    ),
    LOGO_URL: companyLogoUrl,
    STORE_NAME: input.companyName,
    STORE_CODE: "",
    STORE_LOCATION: "",
    STORE_PHONE: "",
    STORE_ADDRESS: "",
    STORE_ADDRESS_LINE_1: "",
    STORE_ADDRESS_LINE_2: "",
    STORE_CONTACT: documentTemplateRawHtml("Fuel Operations"),
    TERMINAL_CODE: "HQ",
    RECEIPT_TITLE: input.receiptTitle,
    RECEIPT_NO: input.receiptNo,
    RECEIPT_DATE_TIME: input.receiptDate ? new Date(input.receiptDate).toLocaleString() : "",
    STATUS: "",
    TRANSACTION_TYPE: input.receiptTitle,
    SOURCE_RECEIPT_NO: "",
    SHIFT_NO: "",
    CASHIER: "Flash ERP",
    OPERATOR: "Flash ERP",
    CUSTOMER_NAME: input.customerName ?? "Walk-in customer",
    CUSTOMER_NO: "",
    ITEM_TABLE: documentTemplateRawHtml(input.itemTableHtml),
    PAYMENT_TABLE: documentTemplateRawHtml(input.paymentTableHtml),
    SUBTOTAL: formatReceiptMoney(input.subtotalAmount, input.currencyCode),
    PROMOTION_DISCOUNT: formatReceiptMoney(0, input.currencyCode),
    DISCOUNT: formatReceiptMoney(0, input.currencyCode),
    TAX: Math.abs(input.taxAmount) < 0.005 ? "" : formatReceiptMoney(input.taxAmount, input.currencyCode),
    TAX_ROW: documentTemplateRawHtml(renderReceiptTemplateTaxRow(input.taxAmount, input.currencyCode)),
    TOTAL: formatReceiptMoney(input.totalAmount, input.currencyCode),
    PAID: formatReceiptMoney(input.paidAmount, input.currencyCode),
    CHANGE: input.balanceLabel,
    NOTES: input.comments.filter(Boolean).join(" | "),
    TRANSACTION_REFERENCE: "",
    TRANSACTION_REFERENCE_ROW: documentTemplateRawHtml(""),
    TRANSACTION_REFERENCE_BLOCK: documentTemplateRawHtml(""),
    ADDITIONAL_DETAILS: input.comments.filter(Boolean).join(" | "),
    ADDITIONAL_DETAILS_BLOCK: documentTemplateRawHtml(""),
    COMMENTS_BLOCK: documentTemplateRawHtml(renderReceiptTemplateDetailsBlock(input.comments)),
    RECEIPT_HEADER: "",
    RECEIPT_FOOTER: "Thank you."
  };
}

function buildA4FuelReceiptContent(input: {
  companyName: string;
  companyLogoUrl: string | null;
  title: string;
  documentNo: string;
  documentDate: string | null;
  customerName: string | null;
  customerNo?: string | null;
  stationName?: string | null;
  currencyCode: string;
  lines: Array<{
    productCode: string | null;
    productName: string | null;
    uomCode: string;
    quantity?: number;
    deliveredQuantity?: number;
    unitPrice?: number;
    unitSellingPrice?: number;
    lineAmount?: number;
    salesAmount?: number;
  }>;
  payments: Array<{
    tenderMethodName: string | null;
    paymentMode: string;
    cashbookAccountName: string | null;
    amount: number;
    reference: string | null;
  }>;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
}) {
  const logoHtml = renderReceiptLogo(input.companyLogoUrl, `${input.companyName} logo`);
  const lineRows = input.lines
    .map((line, index) => {
      const quantity = line.quantity ?? line.deliveredQuantity ?? 0;
      const unitPrice = line.unitPrice ?? line.unitSellingPrice ?? 0;
      const amount = line.lineAmount ?? line.salesAmount ?? 0;

      return `<tr>
        <td>${index + 1}</td>
        <td>
          <strong>${escapeReceiptHtml(line.productCode ?? "Fuel")}</strong>
          <span>${escapeReceiptHtml(line.productName ?? "")}</span>
        </td>
        <td class="num">${escapeReceiptHtml(numberFormatter.format(quantity))}</td>
        <td>${escapeReceiptHtml(line.uomCode)}</td>
        <td class="num">${escapeReceiptHtml(formatReceiptMoney(unitPrice, input.currencyCode))}</td>
        <td class="num">${escapeReceiptHtml(formatReceiptMoney(amount, input.currencyCode))}</td>
      </tr>`;
    })
    .join("");
  const paymentRows =
    input.payments.length > 0
      ? input.payments
          .map((payment) => {
            const tender =
              payment.tenderMethodName ??
              payment.cashbookAccountName ??
              formatEnumLabel(payment.paymentMode);

            return `<tr>
              <td>${escapeReceiptHtml(tender)}</td>
              <td>${escapeReceiptHtml(payment.reference ?? "")}</td>
              <td class="num">${escapeReceiptHtml(formatReceiptMoney(payment.amount, input.currencyCode))}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="3">No tender lines were captured.</td></tr>`;
  const stationRow = input.stationName
    ? `<div><span>Station</span><strong>${escapeReceiptHtml(input.stationName)}</strong></div>`
    : "";
  const customerNoRow = input.customerNo
    ? `<div><span>Customer No.</span><strong>${escapeReceiptHtml(input.customerNo)}</strong></div>`
    : "";

  return `<section class="fuel-a4-document">
    <header class="fuel-a4-header">
      <div class="fuel-a4-brand">
        ${logoHtml ? `<div class="fuel-a4-logo">${logoHtml}</div>` : ""}
        <div>
          <h1>${escapeReceiptHtml(input.companyName)}</h1>
          <p>Fuel Operations</p>
        </div>
      </div>
      <div class="fuel-a4-title">
        <p>Receipt</p>
        <h2>${escapeReceiptHtml(input.title)}</h2>
      </div>
    </header>
    <section class="fuel-a4-meta">
      <div><span>Document No.</span><strong>${escapeReceiptHtml(input.documentNo)}</strong></div>
      <div><span>Date</span><strong>${escapeReceiptHtml(input.documentDate ? new Date(input.documentDate).toLocaleDateString() : "")}</strong></div>
      <div><span>Customer</span><strong>${escapeReceiptHtml(input.customerName ?? "Walk-in customer")}</strong></div>
      ${customerNoRow}
      ${stationRow}
      <div><span>Currency</span><strong>${escapeReceiptHtml(input.currencyCode)}</strong></div>
    </section>
    <table class="fuel-a4-lines">
      <thead>
        <tr>
          <th>No.</th>
          <th>Product</th>
          <th class="num">Qty</th>
          <th>UOM</th>
          <th class="num">Unit price</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${lineRows}</tbody>
    </table>
    <section class="fuel-a4-bottom">
      <div>
        <h3>Payment</h3>
        <table class="fuel-a4-payments">
          <thead><tr><th>Tender</th><th>Reference</th><th class="num">Amount</th></tr></thead>
          <tbody>${paymentRows}</tbody>
        </table>
      </div>
      <div class="fuel-a4-totals">
        <div><span>Subtotal</span><strong>${escapeReceiptHtml(formatReceiptMoney(input.subtotalAmount, input.currencyCode))}</strong></div>
        ${
          Math.abs(input.taxAmount) > 0.005
            ? `<div><span>Tax</span><strong>${escapeReceiptHtml(formatReceiptMoney(input.taxAmount, input.currencyCode))}</strong></div>`
            : ""
        }
        <div class="is-total"><span>Total</span><strong>${escapeReceiptHtml(formatReceiptMoney(input.totalAmount, input.currencyCode))}</strong></div>
        <div><span>Paid</span><strong>${escapeReceiptHtml(formatReceiptMoney(input.paidAmount, input.currencyCode))}</strong></div>
        <div><span>Balance</span><strong>${escapeReceiptHtml(formatReceiptMoney(input.balanceAmount, input.currencyCode))}</strong></div>
      </div>
    </section>
    <footer class="fuel-a4-signatures">
      <div>Prepared by</div>
      <div>Approved by</div>
      <div>Received by</div>
    </footer>
  </section>`;
}

function buildReceiptDocument(input: {
  renderedTemplateHtml: string;
  paperKind: FuelReceiptPaperKind;
  title: string;
  templateName: string | null;
}) {
  const isThermal = input.paperKind === "THERMAL";
  const paperLabel = isThermal ? "80mm thermal slip" : "A4 receipt";

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeReceiptHtml(input.title)} - Flash ERP ${paperLabel}</title>
      <style>
        *{box-sizing:border-box}
        body{margin:0;background:#e8eef7;color:#0f172a;font-family:"Segoe UI",Inter,sans-serif}
        .receipt-window{min-height:100vh;padding:${isThermal ? "42px 24px" : "32px 24px"}}
        .receipt-toolbar{position:fixed;left:24px;right:24px;top:32px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:${isThermal ? "440px" : "860px"};border-radius:22px;background:white;padding:14px 18px;box-shadow:0 18px 40px rgba(15,23,42,.14)}
        .receipt-toolbar-copy{display:grid;gap:2px}.receipt-toolbar-copy strong{font-size:15px}.receipt-toolbar-copy span{color:#475569;font-size:12px}
        .receipt-toolbar-actions{display:flex;gap:10px}.receipt-toolbar button{min-height:44px;border:1px solid #cbd5e1;border-radius:999px;background:white;padding:0 18px;font-weight:800}
        .receipt-toolbar .is-primary{border-color:#0f766e;background:#0f766e;color:white}
        .print-receipt-sheet{width:${isThermal ? "286px" : "210mm"};min-height:${isThermal ? "auto" : "297mm"};margin:${isThermal ? "90px auto 0" : "76px auto 0"};border-radius:${isThermal ? "22px" : "8px"};background:white;padding:${isThermal ? "10px 8px 12px" : "0"};box-shadow:0 20px 45px rgba(15,23,42,.16)}
        .document-template-html{font-family:"Segoe UI",Inter,sans-serif;font-size:${isThermal ? "10.5px" : "12.5px"};line-height:1.35;color:#111827}
        .document-template-html table{width:100%;border-collapse:collapse}
        .document-template-html th,.document-template-html td{vertical-align:top}
        .logo{max-height:${isThermal ? "48px" : "64px"};max-width:${isThermal ? "120px" : "160px"};object-fit:contain}
        .fuel-a4-document{display:flex;min-height:297mm;flex-direction:column;padding:16mm;color:#17211b;font-family:Arial,"Segoe UI",sans-serif}
        .fuel-a4-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18mm;border-bottom:2px solid #0f766e;padding-bottom:10mm}
        .fuel-a4-brand{display:flex;align-items:center;gap:12px}
        .fuel-a4-logo{display:grid;min-height:64px;min-width:92px;place-items:center;border:1px solid #d6e5df;border-radius:8px;padding:6px}
        .fuel-a4-header h1{margin:0;color:#111827;font-size:23px;line-height:1.1}
        .fuel-a4-header p{margin:4px 0 0;color:#64748b;font-size:12px}
        .fuel-a4-title{text-align:right;text-transform:uppercase}
        .fuel-a4-title p{margin:0;color:#0f766e;font-size:11px;font-weight:700;letter-spacing:.16em}
        .fuel-a4-title h2{margin:6px 0 0;color:#111827;font-size:20px;letter-spacing:.08em}
        .fuel-a4-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10mm}
        .fuel-a4-meta div{border:1px solid #d6e5df;border-radius:8px;background:#f8fafc;padding:9px 10px}
        .fuel-a4-meta span{display:block;color:#64748b;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
        .fuel-a4-meta strong{display:block;margin-top:4px;color:#111827;font-size:12px}
        .fuel-a4-lines{margin-top:10mm;border-collapse:collapse;width:100%;font-size:12px}
        .fuel-a4-lines th{border:1px solid #cbd5d1;background:#edf6f2;color:#334155;font-size:10px;letter-spacing:.08em;padding:8px;text-align:left;text-transform:uppercase}
        .fuel-a4-lines td{border:1px solid #dbe5e1;padding:8px;vertical-align:top}
        .fuel-a4-lines td span{display:block;margin-top:3px;color:#64748b;font-size:10px}
        .fuel-a4-lines .num,.fuel-a4-payments .num{text-align:right;white-space:nowrap}
        .fuel-a4-bottom{display:grid;grid-template-columns:minmax(0,1fr) 72mm;gap:12mm;margin-top:10mm}
        .fuel-a4-bottom h3{margin:0 0 6px;color:#111827;font-size:13px;text-transform:uppercase}
        .fuel-a4-payments{border-collapse:collapse;width:100%;font-size:11px}
        .fuel-a4-payments th,.fuel-a4-payments td{border-bottom:1px solid #dbe5e1;padding:7px;text-align:left}
        .fuel-a4-totals{border:1px solid #d6e5df;border-radius:8px;overflow:hidden}
        .fuel-a4-totals div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e2ece8;padding:8px 10px}
        .fuel-a4-totals div:last-child{border-bottom:0}
        .fuel-a4-totals span{color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase}
        .fuel-a4-totals strong{font-size:12px}
        .fuel-a4-totals .is-total{background:#0f766e;color:white}
        .fuel-a4-totals .is-total span,.fuel-a4-totals .is-total strong{color:white}
        .fuel-a4-signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:auto;padding-top:22mm;font-size:11px;color:#64748b}
        .fuel-a4-signatures div{border-top:1px solid #94a3b8;padding-top:7px}
        @media print{
          .print-hidden{display:none!important}
          body{background:white}
          .receipt-window{padding:0;background:white}
          .print-receipt-sheet{box-shadow:none;margin:0;width:${isThermal ? "80mm" : "210mm"};min-height:${isThermal ? "auto" : "297mm"};border-radius:0}
          @page{size:${isThermal ? "80mm auto" : "A4 portrait"};margin:0}
        }
      </style>
    </head>
    <body>
      <div class="receipt-window">
        <div class="receipt-toolbar print-hidden">
          <div class="receipt-toolbar-copy">
            <strong>${escapeReceiptHtml(input.title)}</strong>
            <span>${escapeReceiptHtml(paperLabel)}${input.templateName ? ` - ${escapeReceiptHtml(input.templateName)}` : ""}</span>
          </div>
          <div class="receipt-toolbar-actions">
            <button onclick="window.close()">Close</button>
            <button class="is-primary" onclick="window.print()">Print receipt</button>
          </div>
        </div>
        <main class="print-receipt-sheet">
          <div class="document-template-html document-template-html--receipt">
            ${input.renderedTemplateHtml}
          </div>
        </main>
      </div>
    </body>
  </html>`;
}

function buildFuelSaleReceipt(input: {
  row: FuelSaleRow;
  paperKind: FuelReceiptPaperKind;
  template: FuelReceiptTemplateOption | null;
  companyName: string;
  companyLogoUrl: string | null;
}) {
  const receiptTitle = input.row.status === "ORDERED" ? "Fuel Sales Order" : "Fuel Sale Receipt";
  const currencyCode = input.row.currencyCode;
  const templateHtml = input.template?.templateHtml.trim() || defaultThermalReceiptTemplateHtml;
  const renderedTemplateHtml =
    input.paperKind === "A4"
      ? buildA4FuelReceiptContent({
          companyName: input.companyName,
          companyLogoUrl: input.companyLogoUrl,
          title: receiptTitle,
          documentNo: input.row.saleNo,
          documentDate: input.row.dispatchDate ?? input.row.loadingDate,
          customerName: input.row.customerName,
          customerNo: input.row.customerNo,
          stationName: input.row.stationName,
          currencyCode,
          lines: input.row.lines,
          payments: input.row.payments,
          subtotalAmount: input.row.totalAmount,
          taxAmount: 0,
          totalAmount: input.row.totalAmount,
          paidAmount: input.row.paymentReceivedAmount,
          balanceAmount: input.row.balanceAmount
        })
      : renderFuelThermalReceiptHtml(
          templateHtml,
          buildFuelReceiptTemplateTokens({
            companyName: input.companyName,
            companyLogoUrl: input.companyLogoUrl,
            currencyCode,
            receiptTitle,
            receiptNo: input.row.saleNo,
            receiptDate: input.row.dispatchDate ?? input.row.loadingDate,
            customerName: input.row.customerName,
            sourceLabel: input.row.sourceSiteCode,
            statusLabel: formatEnumLabel(input.row.status),
            subtotalAmount: input.row.totalAmount,
            taxAmount: 0,
            totalAmount: input.row.totalAmount,
            paidAmount: input.row.paymentReceivedAmount,
            balanceLabel: `Balance ${formatReceiptMoney(input.row.balanceAmount, currencyCode)}`,
            itemTableHtml: receiptItemTable(input.row.lines),
            paymentTableHtml: receiptPaymentRows(input.row.payments),
            comments: [
              input.row.truckLoaded ? `Truck: ${input.row.truckLoaded}` : null,
              input.row.balanceAmount > 0.005
                ? `Balance: ${formatReceiptMoney(input.row.balanceAmount, currencyCode)}`
                : null
            ]
          }),
          {
            fallbackLogoHtml: renderReceiptLogoBlock(
              input.companyLogoUrl,
              `${input.companyName} logo`
            )
          }
        );

  return buildReceiptDocument({
    renderedTemplateHtml,
    paperKind: input.paperKind,
    title: `${receiptTitle} ${input.row.saleNo}`,
    templateName: input.template?.name ?? "Existing sales starter"
  });
}

function buildStationDeliveryReceipt(input: {
  row: StationDeliveryRow;
  paperKind: FuelReceiptPaperKind;
  template: FuelReceiptTemplateOption | null;
  companyName: string;
  companyLogoUrl: string | null;
}) {
  const isTransfer = input.row.paymentMode === "TRANSFER";
  const receiptTitle = isTransfer ? "Fuel Transfer Waybill" : "Station Sale / Delivery";
  const currencyCode = input.row.currencyCode;
  const templateHtml = input.template?.templateHtml.trim() || defaultThermalReceiptTemplateHtml;
  const paymentRows =
    !isTransfer && input.row.amountReceived > 0.005
      ? [
          {
            tenderMethodName: formatEnumLabel(input.row.paymentMode),
            paymentMode: input.row.paymentMode,
            cashbookAccountName: null,
            amount: input.row.amountReceived,
            reference: input.row.paymentReference
          }
        ]
      : [];
  const renderedTemplateHtml =
    input.paperKind === "A4"
      ? buildA4FuelReceiptContent({
          companyName: input.companyName,
          companyLogoUrl: input.companyLogoUrl,
          title: receiptTitle,
          documentNo: input.row.deliveryNo,
          documentDate: input.row.deliveryDate,
          customerName: input.row.customerName,
          customerNo: input.row.customerNo,
          stationName: input.row.stationName,
          currencyCode,
          lines: input.row.lines,
          payments: paymentRows,
          subtotalAmount: input.row.totalSalesAmount,
          taxAmount: 0,
          totalAmount: input.row.totalSalesAmount,
          paidAmount: input.row.amountReceived,
          balanceAmount: input.row.outstandingAmount
        })
      : renderFuelThermalReceiptHtml(
          templateHtml,
          buildFuelReceiptTemplateTokens({
            companyName: input.companyName,
            companyLogoUrl: input.companyLogoUrl,
            currencyCode,
            receiptTitle,
            receiptNo: input.row.deliveryNo,
            receiptDate: input.row.deliveryDate,
            customerName: input.row.customerName,
            sourceLabel: input.row.sourceSiteCode,
            statusLabel: formatEnumLabel(input.row.paymentStatus),
            subtotalAmount: input.row.totalSalesAmount,
            taxAmount: 0,
            totalAmount: input.row.totalSalesAmount,
            paidAmount: input.row.amountReceived,
            balanceLabel: `Outstanding ${formatReceiptMoney(input.row.outstandingAmount, currencyCode)}`,
            itemTableHtml: receiptItemTable(input.row.lines),
            paymentTableHtml: receiptPaymentRows(paymentRows),
            comments: [
              `Station: ${input.row.stationName}`,
              isTransfer
                ? `Destination: ${input.row.destinationStoreName ?? input.row.stationName}`
                : null,
              `Issued: ${numberFormatter.format(input.row.totalLoadedQuantity)} ${input.row.uomSummary}`,
              `Received: ${numberFormatter.format(input.row.totalDeliveredQuantity)} ${input.row.uomSummary}`,
              input.row.vehicleRegistrationNo ? `Vehicle: ${input.row.vehicleRegistrationNo}` : null,
              input.row.driverName ? `Driver: ${input.row.driverName}` : null,
              input.row.outstandingAmount > 0.005
                ? `Outstanding: ${formatReceiptMoney(input.row.outstandingAmount, currencyCode)}`
                : null,
              input.row.paymentReference ? `Payment ref: ${input.row.paymentReference}` : null
            ]
          }),
          {
            fallbackLogoHtml: renderReceiptLogoBlock(
              input.companyLogoUrl,
              `${input.companyName} logo`
            )
          }
        );

  return buildReceiptDocument({
    renderedTemplateHtml,
    paperKind: input.paperKind,
    title: `${receiptTitle} ${input.row.deliveryNo}`,
    templateName: input.template?.name ?? "Existing sales starter"
  });
}

function openReceiptPrintWindow(html: string, targetWindow?: Window | null) {
  const printWindow = targetWindow ?? window.open("", "_blank", "width=900,height=800");

  if (!printWindow) {
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function openReceiptPreparingWindow(title: string) {
  const printWindow = window.open("", "_blank", "width=900,height=800");

  if (!printWindow) {
    return null;
  }

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeReceiptHtml(title)}</title>
        <style>
          body{margin:0;display:grid;min-height:100vh;place-items:center;background:#e8eef7;color:#0f172a;font-family:"Segoe UI",Inter,sans-serif}
          div{border-radius:20px;background:white;padding:24px 28px;box-shadow:0 20px 45px rgba(15,23,42,.16);font-weight:700}
        </style>
      </head>
      <body><div>Preparing receipt...</div></body>
    </html>`);
  printWindow.document.close();

  return printWindow;
}

function parseDraftMoney(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "ACTIVE" || value === "POSTED"
      ? "bg-emerald-100 text-emerald-700"
      : value === "INACTIVE"
        ? "bg-amber-100 text-amber-700"
        : "bg-stone-200 text-stone-700";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {formatEnumLabel(value)}
    </span>
  );
}

function MetricCard({
  hint,
  icon: Icon,
  label,
  value
}: {
  hint: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <article className="glass-panel rounded-[1.15rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">{label}</p>
          <p className="mt-2 text-[1.35rem] font-semibold text-stone-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-600">{hint}</p>
    </article>
  );
}

function DialogTextInput({
  label,
  min,
  onChange,
  step,
  type = "text",
  value
}: {
  label: string;
  min?: string;
  onChange: (value: string) => void;
  step?: string;
  type?: "date" | "number" | "text";
  value: string | number | null | undefined;
}) {
  return (
    <label className="space-y-1 text-xs text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <input
        className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
        min={min}
        onChange={(event) => onChange(event.target.value)}
        step={step}
        type={type}
        value={value ?? ""}
      />
    </label>
  );
}

function DialogSelect({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string | null | undefined;
}) {
  return (
    <label className="space-y-1 text-xs text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <select
        className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
        onChange={(event) => onChange(event.target.value)}
        value={value ?? ""}
      >
        <option value="">Not set</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DialogReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <label className="space-y-1 text-xs text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <span className="block w-full rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm font-medium text-stone-700">
        {value || "Select product"}
      </span>
    </label>
  );
}

function DialogTextArea({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  value: string | null | undefined;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <textarea
        className="min-h-24 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
        onChange={(event) => onChange(event.target.value)}
        value={value ?? ""}
      />
    </label>
  );
}

type EvidenceUploadPayload = {
  url: string;
  fileName?: string;
  capturedAt?: string;
};

function EvidenceUploadField({
  evidenceKind,
  fileName,
  label,
  onClear,
  onUploaded,
  value
}: {
  evidenceKind: "tank-dip" | "meter-reading";
  fileName?: string | null;
  label: string;
  onClear: () => void;
  onUploaded: (payload: EvidenceUploadPayload) => void;
  value?: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadState, setUploadState] = useState<MutationState>(mutationIdle);

  async function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setUploadState({
      status: "submitting",
      message: `Uploading ${file.name} as fuel evidence...`
    });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("evidenceKind", evidenceKind);

      const response = await fetch("/api/fuel-operations/evidence", {
        body: formData,
        method: "POST"
      });
      const payload = (await response.json()) as Partial<EvidenceUploadPayload> & {
        message?: string;
      };

      if (!response.ok || !payload.url) {
        throw new Error(payload.message ?? "Flash ERP could not upload the fuel evidence photo.");
      }

      onUploaded({
        url: payload.url,
        fileName: payload.fileName,
        capturedAt: payload.capturedAt
      });
      setUploadState({
        status: "success",
        message: payload.message ?? "Fuel evidence uploaded."
      });
    } catch (error) {
      setUploadState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not upload the fuel evidence photo."
      });
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="space-y-3 rounded-[1.35rem] border border-sky-200 bg-sky-50/60 p-4 md:col-span-2">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-stone-950">{label}</span>
        <span className="text-xs leading-5 text-stone-600">
          A photo is required before this record can be saved.
        </span>
      </div>
      <input
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        capture="environment"
        className="hidden"
        onChange={(event) => void handleFileSelection(event)}
        ref={fileInputRef}
        type="file"
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_13rem]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-900 transition hover:border-sky-400 hover:text-sky-950 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={uploadState.status === "submitting"}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {uploadState.status === "submitting" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              Capture/upload photo
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={uploadState.status === "submitting" || !value}
              onClick={() => {
                onClear();
                setUploadState(mutationIdle());
              }}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              Clear photo
            </button>
          </div>
          <p className="text-xs leading-5 text-stone-500">
            Flash ERP accepts JPG, PNG, WEBP, GIF, and AVIF evidence photos up to 8 MB.
          </p>
          {fileName || value ? (
            <p className="text-xs font-medium text-stone-700">
              Evidence: {fileName ?? value}
            </p>
          ) : null}
          {uploadState.message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                uploadState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : uploadState.status === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-sky-200 bg-white text-sky-800"
              }`}
            >
              {uploadState.message}
            </div>
          ) : null}
        </div>
        <div className="overflow-hidden rounded-2xl border border-dashed border-sky-300 bg-white">
          {value ? (
            <img alt={`${label} preview`} className="h-full min-h-36 w-full object-cover" src={value} />
          ) : (
            <div className="flex min-h-36 flex-col items-center justify-center gap-2 px-4 text-center text-stone-500">
              <Upload className="h-6 w-6" />
              <span className="text-xs font-semibold">No evidence uploaded</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DialogFooter({
  disabled = false,
  disabledReason,
  mutation,
  onCancel,
  onSubmit,
  submitLabel
}: {
  disabled?: boolean;
  disabledReason?: string;
  mutation: MutationState;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-stone-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p
        className={`text-sm ${
          mutation.status === "error"
            ? "text-rose-600"
            : mutation.status === "success"
              ? "text-emerald-700"
              : "text-stone-500"
        }`}
      >
        {mutation.message || disabledReason}
      </p>
      <div className="flex gap-2">
        <button
          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={mutation.status === "submitting" || disabled}
          onClick={onSubmit}
          type="button"
        >
          {mutation.status === "submitting" ? "Saving..." : submitLabel}
        </button>
      </div>
    </div>
  );
}

function mutationIdle(): MutationState {
  return { status: "idle", message: "" };
}

const tankSearch: FilterFn<TankRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").toLowerCase();
  return [row.original.code, row.original.name, row.original.siteCode, row.original.productCode]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
};

function matchesRowValues<T extends object>(row: T, filterValue: unknown) {
  const query = String(filterValue ?? "").toLowerCase();
  return Object.values(row).some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(query)
  );
}

const pumpSearch: FilterFn<PumpRow> = (row, _columnId, filterValue) => {
  return matchesRowValues(row.original, filterValue);
};

const nozzleSearch: FilterFn<NozzleRow> = (row, _columnId, filterValue) => {
  return matchesRowValues(row.original, filterValue);
};

const dipSearch: FilterFn<DipRow> = (row, _columnId, filterValue) => {
  return matchesRowValues(row.original, filterValue);
};

const meterReadingSearch: FilterFn<MeterReadingRow> = (row, _columnId, filterValue) => {
  return matchesRowValues(row.original, filterValue);
};

const deliverySearch: FilterFn<DeliveryRow> = (row, _columnId, filterValue) => {
  return matchesRowValues(row.original, filterValue);
};

const stationSearch: FilterFn<StationRow> = (row, _columnId, filterValue) => {
  return matchesRowValues(row.original, filterValue);
};

const stationDeliverySearch: FilterFn<StationDeliveryRow> = (row, _columnId, filterValue) => {
  return matchesRowValues(row.original, filterValue);
};

const fuelSaleSearch: FilterFn<FuelSaleRow> = (row, _columnId, filterValue) => {
  return matchesRowValues(row.original, filterValue);
};

const reconciliationSearch: FilterFn<ReconciliationRow> = (row, _columnId, filterValue) => {
  return matchesRowValues(row.original, filterValue);
};

const fuelViewKeys: ViewKey[] = [
  "tanks",
  "pumps",
  "dips",
  "meter-readings",
  "sales",
  "stations",
  "station-deliveries",
  "supplier-receipts",
  "reconciliation"
];

function isViewKey(value: string): value is ViewKey {
  return fuelViewKeys.includes(value as ViewKey);
}

function ViewTabs({
  activeView,
  availableViews,
  onChange
}: {
  activeView: ViewKey;
  availableViews?: ViewKey[];
  onChange: (view: ViewKey) => void;
}) {
  const tabs: Array<{ key: ViewKey; label: string }> = [
    { key: "tanks", label: "Tanks" },
    { key: "pumps", label: "Pumps & Nozzles" },
    { key: "dips", label: "Dips" },
    { key: "meter-readings", label: "Meter readings" },
    { key: "sales", label: "Fuel sales" },
    { key: "stations", label: "Stations" },
    { key: "station-deliveries", label: "Deliveries" },
    { key: "supplier-receipts", label: "Supplier receipts" },
    { key: "reconciliation", label: "Reconciliation" }
  ];
  const availableViewSet = availableViews?.length ? new Set(availableViews) : null;
  const visibleTabs = availableViewSet
    ? tabs.filter((tab) => availableViewSet.has(tab.key))
    : tabs;

  return (
    <div className="flex flex-wrap gap-2">
      {visibleTabs.map((tab) => (
        <button
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
            activeView === tab.key
              ? "border-[var(--brand)] bg-[var(--brand)] text-white"
              : "border-stone-300 bg-white text-stone-700 hover:border-[var(--brand)]"
          }`}
          key={tab.key}
          onClick={() => onChange(tab.key)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function Section({
  actions,
  children,
  description,
  id,
  title
}: {
  actions?: ReactNode;
  children: ReactNode;
  description: string;
  id?: string;
  title: string;
}) {
  return (
    <section className="space-y-4 scroll-mt-24" id={id}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-stone-950">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function FuelOperationsWorkspace({
  availableViews,
  dedicatedView = false,
  defaultView = "tanks",
  pageDescription,
  pageHeading,
  embedInShell = false,
  shellActiveSection = "fuel-operations",
  shellEyebrow = "Module 5",
  autoRecordedBy,
  workspace
}: {
  availableViews?: ViewKey[];
  dedicatedView?: boolean;
  defaultView?: ViewKey;
  pageDescription?: string;
  pageHeading?: string;
  embedInShell?: boolean;
  shellActiveSection?: string;
  shellEyebrow?: string;
  autoRecordedBy?: string | null;
  workspace: FuelOperationsWorkspaceData;
}) {
  const router = useRouter();
  const functionalCurrencyCode = workspace.functionalCurrencyCode || workspace.currencyCode;
  const defaultSaleSourceSiteId =
    workspace.fuelSettings.defaultSaleSourceSiteId ?? workspace.siteOptions[0]?.operatingSiteId ?? "";
  const defaultDispatchSiteId =
    workspace.fuelSettings.defaultDispatchSiteId ?? defaultSaleSourceSiteId;
  const automaticRecordedBy = autoRecordedBy?.trim() || null;
  const [activeView, setActiveView] = useState<ViewKey>(defaultView);
  const [hqSiteFilterId, setHqSiteFilterId] = useState("");
  const allowedViewSet = useMemo(
    () => (availableViews?.length ? new Set<ViewKey>(availableViews) : null),
    [availableViews]
  );
  const [tankDialogOpen, setTankDialogOpen] = useState(false);
  const [pumpDialogOpen, setPumpDialogOpen] = useState(false);
  const [nozzleDialogOpen, setNozzleDialogOpen] = useState(false);
  const [dipDialogOpen, setDipDialogOpen] = useState(false);
  const [meterDialogOpen, setMeterDialogOpen] = useState(false);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [stationDialogOpen, setStationDialogOpen] = useState(false);
  const [stationDeliveryDialogOpen, setStationDeliveryDialogOpen] = useState(false);
  const [fuelSaleDialogOpen, setFuelSaleDialogOpen] = useState(false);
  const [fulfillFuelSaleDialogOpen, setFulfillFuelSaleDialogOpen] = useState(false);
  const [fulfillingFuelSale, setFulfillingFuelSale] = useState<FuelSaleRow | null>(null);
  const [viewingFuelSale, setViewingFuelSale] = useState<FuelSaleRow | null>(null);
  const [viewingStationDelivery, setViewingStationDelivery] = useState<StationDeliveryRow | null>(null);
  const [fuelTransferFeedbackDraft, setFuelTransferFeedbackDraft] =
    useState<RecordFuelTransferFeedbackRequest>({});
  const [reconciliationDialogOpen, setReconciliationDialogOpen] = useState(false);
  const [mutation, setMutation] = useState<MutationState>(mutationIdle);
  const [tankDraft, setTankDraft] = useState<UpsertFuelTankRequest>({
    tankType: "UNDERGROUND",
    uomCode: "LTR",
    status: "ACTIVE"
  });
  const [pumpDraft, setPumpDraft] = useState<UpsertFuelPumpRequest>({
    pumpType: "DISPENSER",
    status: "ACTIVE"
  });
  const [nozzleDraft, setNozzleDraft] = useState<UpsertFuelNozzleRequest>({
    meterUomCode: "LTR",
    status: "ACTIVE"
  });
  const [dipDraft, setDipDraft] = useState<CreateFuelTankDipRequest>({
    dipDate: workspace.defaultOperationDate,
    recordedBy: automaticRecordedBy ?? undefined
  });
  const [meterDraft, setMeterDraft] = useState<CreateFuelMeterReadingRequest>({
    readingDate: workspace.defaultOperationDate,
    recordedBy: automaticRecordedBy ?? undefined
  });
  const [deliveryDraft, setDeliveryDraft] = useState<CreateFuelDeliveryRequest>({
    deliveryDate: workspace.defaultOperationDate,
    currencyCode: functionalCurrencyCode,
    lines: [{}]
  });
  const [stationDraft, setStationDraft] = useState<UpsertFuelStationRequest>({
    stationType: "CUSTOMER",
    status: "ACTIVE"
  });
  const [stationDeliveryDraft, setStationDeliveryDraft] =
    useState<CreateFuelStationDeliveryRequest>({
      deliveryDate: workspace.defaultOperationDate,
      sourceOperatingSiteId: defaultDispatchSiteId,
      currencyCode: functionalCurrencyCode,
      paymentMode: "CREDIT",
      lines: [{}]
    });
  const [fuelSaleDraft, setFuelSaleDraft] = useState<CreateFuelSaleRequest>({
    documentMode: "SALE",
    loadingDate: workspace.defaultOperationDate,
    dispatchDate: workspace.defaultOperationDate,
    serviceType: "COMBO",
    sourceOperatingSiteId: defaultSaleSourceSiteId,
    currencyCode: functionalCurrencyCode,
    lines: [{}]
  });
  const [fuelSalePaymentDrafts, setFuelSalePaymentDrafts] = useState<FuelSalePaymentDraft[]>(() => [
    createFuelSalePaymentDraft(
      workspace.paymentTenderOptions.find((tender) => tender.paymentMethod === "CASH")
        ?.tenderMethodCode ??
        workspace.paymentTenderOptions[0]?.tenderMethodCode ??
        "",
      "",
      workspace.defaultOperationDate
    )
  ]);
  const [fulfillFuelSaleDraft, setFulfillFuelSaleDraft] = useState<FulfillFuelSaleOrderRequest>({
    dispatchDate: workspace.defaultOperationDate
  });
  const [reconciliationDraft, setReconciliationDraft] = useState<CreateFuelReconciliationRequest>({
    reconciliationDate: workspace.defaultOperationDate
  });

  useEffect(() => {
    if (dedicatedView) {
      setActiveView(defaultView);
      return;
    }

    const syncViewFromHash = () => {
      const nextView = window.location.hash.replace("#", "");

      if (isViewKey(nextView) && (!allowedViewSet || allowedViewSet.has(nextView))) {
        setActiveView(nextView);
      }
    };

    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);

    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, [allowedViewSet, dedicatedView, defaultView]);

  function handleViewChange(view: ViewKey) {
    if (allowedViewSet && !allowedViewSet.has(view)) {
      return;
    }

    setActiveView(view);

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${view}`);
    }
  }

  const siteOptions = workspace.siteOptions.map((site) => ({
    label: site.label,
    value: site.operatingSiteId
  }));
  const showHqSiteFilter = shellActiveSection === "fuel-operations";
  const selectedHqSite = showHqSiteFilter
    ? workspace.siteOptions.find((site) => site.operatingSiteId === hqSiteFilterId) ?? null
    : null;
  const filteredTankRows = selectedHqSite
    ? workspace.tankRows.filter((row) => row.operatingSiteId === selectedHqSite.operatingSiteId)
    : workspace.tankRows;
  const filteredPumpRows = selectedHqSite
    ? workspace.pumpRows.filter((row) => row.operatingSiteId === selectedHqSite.operatingSiteId)
    : workspace.pumpRows;
  const filteredNozzleRows = selectedHqSite
    ? workspace.nozzleRows.filter((row) => row.operatingSiteId === selectedHqSite.operatingSiteId)
    : workspace.nozzleRows;
  const filteredDipRows = selectedHqSite
    ? workspace.dipRows.filter((row) => row.operatingSiteId === selectedHqSite.operatingSiteId)
    : workspace.dipRows;
  const filteredMeterReadingRows = selectedHqSite
    ? workspace.meterReadingRows.filter(
        (row) => row.operatingSiteId === selectedHqSite.operatingSiteId
      )
    : workspace.meterReadingRows;
  const filteredDeliveryRows = selectedHqSite
    ? workspace.deliveryRows.filter((row) => row.siteCode === selectedHqSite.code)
    : workspace.deliveryRows;
  const filteredStationRows = selectedHqSite
    ? workspace.stationRows.filter(
        (row) =>
          row.operatingSiteId === selectedHqSite.operatingSiteId ||
          row.inventoryLocationCode === selectedHqSite.code ||
          (Boolean(selectedHqSite.storeCode) && row.storeCode === selectedHqSite.storeCode)
      )
    : workspace.stationRows;
  const filteredStationDeliveryRows = selectedHqSite
    ? workspace.stationDeliveryRows.filter((row) => row.sourceSiteCode === selectedHqSite.code)
    : workspace.stationDeliveryRows;
  const filteredFuelSaleRows = selectedHqSite
    ? workspace.fuelSaleRows.filter((row) => row.sourceSiteCode === selectedHqSite.code)
    : workspace.fuelSaleRows;
  const filteredReconciliationRows = selectedHqSite
    ? workspace.reconciliationRows.filter((row) => row.siteCode === selectedHqSite.code)
    : workspace.reconciliationRows;
  const filteredReconciliationNos = new Set(
    filteredReconciliationRows.map((row) => row.reconciliationNo)
  );
  const filteredReconciliationLineRows = selectedHqSite
    ? workspace.reconciliationLineRows.filter((row) =>
        filteredReconciliationNos.has(row.reconciliationNo)
      )
    : workspace.reconciliationLineRows;
  const latestFilteredReconciliation = filteredReconciliationRows[0] ?? null;
  const displayedMetrics = selectedHqSite
    ? {
        activeTanks: filteredTankRows.filter((row) => row.status === "ACTIVE").length,
        totalBookQuantity: filteredTankRows.reduce(
          (total, row) => total + row.currentBookQuantity,
          0
        ),
        latestGainLossQuantity: latestFilteredReconciliation?.totalGainLossQuantity ?? 0,
        latestMarginAmount: latestFilteredReconciliation?.marginAmount ?? 0
      }
    : workspace.metrics;
  const currencyOptions =
    workspace.currencyOptions.length > 0
      ? workspace.currencyOptions.map((currency) => ({
          label: currency.label,
          value: currency.code
        }))
      : [{ label: `${functionalCurrencyCode} - Functional currency`, value: functionalCurrencyCode }];
  const customerOptions = workspace.customerOptions.map((customer) => ({
    label: customer.label,
    value: customer.customerId
  }));
  const customerById = new Map(
    workspace.customerOptions.map((customer) => [customer.customerId, customer] as const)
  );
  const userOptions = workspace.userOptions.map((user) => ({
    label: user.label,
    value: user.displayName
  }));
  const productOptions = workspace.productOptions.map((product) => ({
    label: product.label,
    value: product.productProfileId
  }));
  const fuelProductByProfileId = new Map(
    workspace.productOptions.map((product) => [product.productProfileId, product] as const)
  );
  const fuelSaleProductOptions = workspace.productOptions.map((product) => ({
    label: product.label,
    productProfileId: product.productProfileId,
    value: product.productId
  }));
  const selectedTankProduct = tankDraft.productProfileId
    ? fuelProductByProfileId.get(tankDraft.productProfileId) ?? null
    : null;
  const selectedTankUomCode = selectedTankProduct?.uomCode ?? tankDraft.uomCode ?? "";
  const tankOptions = workspace.tankOptions.map((tank) => ({
    label: tank.label,
    operatingSiteId: tank.operatingSiteId,
    productProfileId: tank.productProfileId,
    uomCode: tank.uomCode,
    value: tank.tankId
  }));
  const pumpOptions = workspace.pumpOptions.map((pump) => ({
    label: pump.label,
    value: pump.pumpId
  }));
  const nozzleOptions = workspace.nozzleOptions.map((nozzle) => ({
    label: nozzle.label,
    value: nozzle.nozzleId
  }));
  const stationOptions = workspace.stationOptions.map((station) => ({
    customerId: station.customerId,
    storeId: station.storeId,
    inventoryLocationId: station.inventoryLocationId,
    label: station.label,
    value: station.stationId
  }));
  const stationById = new Map(
    workspace.stationOptions.map((station) => [station.stationId, station] as const)
  );
  const transferStationOptions = stationOptions.filter((station) => Boolean(station.storeId));
  const storeOptions = workspace.storeOptions.map((store) => ({
    label: store.label,
    value: store.storeId
  }));
  const selectedStationStore =
    workspace.storeOptions.find((store) => store.storeId === stationDraft.storeId) ?? null;
  const selectedStationStoreLocationOptions =
    selectedStationStore?.locations.map((location) => ({
      label: location.label,
      value: location.inventoryLocationId
    })) ?? [];

  function applyAutomaticRecordedBy<T extends { recordedBy?: string | null }>(payload: T): T {
    if (!automaticRecordedBy || payload.recordedBy?.trim()) {
      return payload;
    }

    return { ...payload, recordedBy: automaticRecordedBy };
  }
  const supplierReceiptTankOptions = tankOptions.filter(
    (tank) => !deliveryDraft.operatingSiteId || tank.operatingSiteId === deliveryDraft.operatingSiteId
  );
  const stationDeliveryTankOptions = tankOptions.filter(
    (tank) =>
      Boolean(stationDeliveryDraft.sourceOperatingSiteId) &&
      tank.operatingSiteId === stationDeliveryDraft.sourceOperatingSiteId
  );
  const fuelPaymentTenders = workspace.paymentTenderOptions;
  const defaultFuelPaymentTenderCode =
    fuelPaymentTenders.find((tender) => tender.paymentMethod === "CASH")?.tenderMethodCode ??
    fuelPaymentTenders[0]?.tenderMethodCode ??
    "";
  const fuelPaymentTenderByCode = new Map(
    fuelPaymentTenders.map((tender) => [tender.tenderMethodCode, tender] as const)
  );
  const paymentTenderOptions = workspace.paymentTenderOptions.map((tender) => ({
    label: tender.label,
    value: tender.tenderMethodCode
  }));
  const bankMobilePaymentAccountOptions = workspace.paymentAccountOptions
    .filter((account) => account.accountType === "BANK" || account.accountType === "MOBILE_MONEY")
    .map((account) => ({
      label: account.label,
      value: account.cashbookAccountId
    }));
  const serviceTypeOptions = [
    { label: "Combo", value: "COMBO" },
    { label: "BDC only", value: "BDC_ONLY" },
    { label: "OMC only", value: "OMC_ONLY" },
    { label: "Others", value: "OTHERS" }
  ];
  const waterTestOptions = [
    { label: "Positive", value: "POSITIVE" },
    { label: "Negative", value: "NEGATIVE" }
  ];
  const fuelSaleDocumentModeOptions = [
    { label: "Immediate sale", value: "SALE" },
    { label: "Sales order", value: "SALES_ORDER" }
  ];
  const operationalStatusOptions = [
    { label: "Active", value: "ACTIVE" },
    { label: "Inactive", value: "INACTIVE" }
  ];
  const tankTypeOptions = [
    { label: "Underground", value: "UNDERGROUND" },
    { label: "Above-ground", value: "ABOVE_GROUND" },
    { label: "Mobile", value: "MOBILE" },
    { label: "Other", value: "OTHER" }
  ];
  const pumpTypeOptions = [
    { label: "Dispenser", value: "DISPENSER" },
    { label: "Transfer pump", value: "TRANSFER" },
    { label: "Other", value: "OTHER" }
  ];
  const stationTypeOptions = [
    { label: "Customer station", value: "CUSTOMER" },
    { label: "Owned station", value: "OWNED" },
    { label: "Dealer station", value: "DEALER" },
    { label: "Other", value: "OTHER" }
  ];

  function priceListMatchScore(
    priceRow: FuelOperationsWorkspaceData["productOptions"][number]["priceRows"][number],
    customerId: string | null | undefined
  ) {
    const customer = customerId ? customerById.get(customerId) ?? null : null;

    if (!customer) {
      return priceRow.isDefaultPriceList ? 10 : 0;
    }

    const customerTypeMatches =
      Boolean(priceRow.customerType) &&
      priceRow.customerType?.toUpperCase() === customer.customerType.toUpperCase();
    const loyaltyTierMatches =
      Boolean(priceRow.loyaltyTier) &&
      priceRow.loyaltyTier?.toUpperCase() === customer.loyaltyTier?.toUpperCase();

    if (customerTypeMatches && loyaltyTierMatches) {
      return 40;
    }

    if (loyaltyTierMatches) {
      return 35;
    }

    if (customerTypeMatches) {
      return 30;
    }

    return priceRow.isDefaultPriceList ? 10 : 0;
  }

  function resolveFuelSaleCustomerId(draft: CreateFuelSaleRequest) {
    if (draft.stationId) {
      return stationById.get(draft.stationId)?.customerId ?? draft.customerId ?? null;
    }

    return draft.customerId ?? null;
  }

  function resolveFuelProductUnitPrice(
    product: FuelOperationsWorkspaceData["productOptions"][number] | null,
    sourceOperatingSiteId: string | null | undefined,
    customerId: string | null | undefined
  ) {
    if (!product) {
      return "";
    }

    const sourceSite = sourceOperatingSiteId
      ? workspace.siteOptions.find((site) => site.operatingSiteId === sourceOperatingSiteId) ?? null
      : null;
    const customerPrice = product.priceRows
      .map((priceRow) => ({
        priceRow,
        score: priceListMatchScore(priceRow, customerId)
      }))
      .filter(({ priceRow, score }) => priceRow.sourceType === "PRICE_LIST" && score > 10)
      .sort((left, right) => right.score - left.score)[0]?.priceRow;

    if (customerPrice) {
      return customerPrice.unitPrice.toFixed(4);
    }

    if (sourceSite?.storeCode) {
      const shopPrice = product.priceRows.find(
        (priceRow) => priceRow.sourceType === "SHOP_PRICE" && priceRow.storeCode === sourceSite.storeCode
      );

      if (shopPrice) {
        return shopPrice.unitPrice.toFixed(4);
      }
    }

    const defaultPrice = product.priceRows.find(
      (priceRow) => priceRow.sourceType === "PRICE_LIST" && priceRow.isDefaultPriceList
    );

    if (defaultPrice) {
      return defaultPrice.unitPrice.toFixed(4);
    }

    const basePrice = product.priceRows.find((priceRow) => priceRow.sourceType === "BASE_PRICE");

    return (basePrice?.unitPrice ?? product.baseUnitPrice).toFixed(4);
  }

  function resolveFuelSaleLineUnitPrice(
    line: NonNullable<CreateFuelSaleRequest["lines"]>[number],
    draft: CreateFuelSaleRequest
  ) {
    const product =
      (line.productId
        ? workspace.productOptions.find((option) => option.productId === line.productId)
        : null) ??
      (line.productProfileId
        ? fuelProductByProfileId.get(line.productProfileId) ?? null
        : null);

    return resolveFuelProductUnitPrice(
      product,
      draft.sourceOperatingSiteId,
      resolveFuelSaleCustomerId(draft)
    );
  }

  function repriceFuelSaleDraft(draft: CreateFuelSaleRequest) {
    return {
      ...draft,
      lines: (draft.lines?.length ? draft.lines : [{}]).map((line) => ({
        ...line,
        unitPrice: resolveFuelSaleLineUnitPrice(line, draft) || line.unitPrice
      }))
    };
  }

  async function submitJson(
    url: string,
    payload: unknown,
    closeDialog: () => void,
    options?: {
      onError?: () => void;
      onSuccess?: (body: Partial<FuelOperationsMutationResponse>) => void;
    }
  ) {
    setMutation({ status: "submitting", message: "" });
    const response = await fetch(url, {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const body = (await response.json().catch(() => ({}))) as Partial<FuelOperationsMutationResponse> & {
      error?: string;
      message?: string;
    };

    if (!response.ok) {
      setMutation({
        status: "error",
        message: body.error ?? body.message ?? "Flash ERP could not save that fuel operation."
      });
      options?.onError?.();
      return;
    }

    setMutation({
      status: "success",
      message: body.message ?? "Fuel operation saved."
    });
    closeDialog();
    options?.onSuccess?.(body);
    router.refresh();
  }

  function editTank(row: TankRow) {
    const productUomCode = row.productProfileId
      ? fuelProductByProfileId.get(row.productProfileId)?.uomCode
      : null;

    setTankDraft({
      tankId: row.tankId,
      code: row.code,
      name: row.name,
      tankType: row.tankType,
      operatingSiteId: row.operatingSiteId,
      productProfileId: row.productProfileId,
      capacityQuantity: row.capacityQuantity,
      safeCapacityQuantity: row.safeCapacityQuantity,
      reorderLevelQuantity: row.reorderLevelQuantity,
      openingQuantity: row.openingQuantity,
      currentBookQuantity: row.currentBookQuantity,
      status: row.status,
      notes: row.notes,
      uomCode: productUomCode ?? row.uomCode
    });
    setMutation(mutationIdle());
    setTankDialogOpen(true);
  }

  function editPump(row: PumpRow) {
    setPumpDraft({
      pumpId: row.pumpId,
      code: row.code,
      name: row.name,
      pumpType: row.pumpType,
      operatingSiteId: row.operatingSiteId,
      manufacturer: row.manufacturer,
      serialNo: row.serialNo,
      status: row.status
    });
    setMutation(mutationIdle());
    setPumpDialogOpen(true);
  }

  function editNozzle(row: NozzleRow) {
    setNozzleDraft({
      nozzleId: row.nozzleId,
      pumpId: row.pumpId,
      tankId: row.tankId,
      productProfileId: row.productProfileId,
      code: row.code,
      name: row.name,
      meterUomCode: row.meterUomCode,
      openingMeterReading: row.openingMeterReading,
      currentMeterReading: row.currentMeterReading,
      status: row.status
    });
    setMutation(mutationIdle());
    setNozzleDialogOpen(true);
  }

  function editDip(row: DipRow) {
    setDipDraft({
      dipId: row.dipId,
      tankId: row.tankId,
      dipReference: row.dipReference,
      dipDate: dateOnly(row.dipDate),
      dipQuantity: row.dipQuantity,
      waterQuantity: row.waterQuantity,
      evidenceImageUrl: row.evidenceImageUrl,
      evidenceFileName: row.evidenceFileName,
      evidenceCapturedAt: row.evidenceCapturedAt,
      recordedBy: row.recordedBy ?? automaticRecordedBy ?? undefined,
      notes: row.notes
    });
    setMutation(mutationIdle());
    setDipDialogOpen(true);
  }

  function editMeterReading(row: MeterReadingRow) {
    setMeterDraft({
      meterReadingId: row.meterReadingId,
      nozzleId: row.nozzleId,
      readingDate: dateOnly(row.readingDate),
      shiftReference: row.shiftReference,
      openingMeterReading: row.openingMeterReading,
      closingMeterReading: row.closingMeterReading,
      adjustmentQuantity: row.adjustmentQuantity,
      unitSellingPrice: row.unitSellingPrice,
      salesAmount: row.salesAmount,
      evidenceImageUrl: row.evidenceImageUrl,
      evidenceFileName: row.evidenceFileName,
      evidenceCapturedAt: row.evidenceCapturedAt,
      recordedBy: row.recordedBy ?? automaticRecordedBy ?? undefined,
      notes: row.notes
    });
    setMutation(mutationIdle());
    setMeterDialogOpen(true);
  }

  function editStation(row: StationRow) {
    setStationDraft({
      stationId: row.stationId,
      stationCode: row.stationCode,
      stationName: row.stationName,
      stationType: row.stationType,
      customerId: row.customerId,
      storeId: row.storeId,
      inventoryLocationId: row.inventoryLocationId,
      operatingSiteId: row.operatingSiteId,
      location: row.location,
      city: row.city,
      gpsLatitude: row.gpsLatitude,
      gpsLongitude: row.gpsLongitude,
      contactName: row.contactName,
      phone: row.phone,
      status: row.status,
      notes: row.notes
    });
    setMutation(mutationIdle());
    setStationDialogOpen(true);
  }

  function fulfillFuelSale(row: FuelSaleRow) {
    setFulfillingFuelSale(row);
    setFulfillFuelSaleDraft({
      dispatchDate: dateOnly(row.dispatchDate ?? workspace.defaultOperationDate),
      paymentCashbookAccountId: "",
      paymentReceivedAmount: "",
      paymentDate: workspace.defaultOperationDate,
      paymentReference: "",
      paymentDetails: "",
      truckLoaded: row.truckLoaded ?? ""
    });
    setMutation(mutationIdle());
    setFulfillFuelSaleDialogOpen(true);
  }

  function printFuelSale(row: FuelSaleRow) {
    const paperKind = resolveReceiptPaperKind(
      row.status === "ORDERED"
        ? workspace.fuelSettings.salesOrderReceiptPaperKind
        : workspace.fuelSettings.saleReceiptPaperKind
    );
    const receiptTemplate = resolveFuelReceiptTemplate(workspace.receiptTemplateOptions, paperKind);

    openReceiptPrintWindow(
      buildFuelSaleReceipt({
        row,
        paperKind,
        template: receiptTemplate,
        companyName: workspace.companyName,
        companyLogoUrl: workspace.companyLogoUrl
      })
    );
  }

  function printStationDelivery(row: StationDeliveryRow) {
    const paperKind = resolveReceiptPaperKind(workspace.fuelSettings.deliveryReceiptPaperKind);
    const receiptTemplate = resolveFuelReceiptTemplate(workspace.receiptTemplateOptions, paperKind);

    openReceiptPrintWindow(
      buildStationDeliveryReceipt({
        row,
        paperKind,
        template: receiptTemplate,
        companyName: workspace.companyName,
        companyLogoUrl: workspace.companyLogoUrl
      })
    );
  }

  function viewStationDelivery(row: StationDeliveryRow) {
    setViewingStationDelivery(row);
    setFuelTransferFeedbackDraft({
      waterTestResult: row.waterTestResult ?? "",
      quantityBeforeDelivery: row.quantityBeforeDelivery ?? "",
      expectedQuantityReceived:
        row.expectedQuantityReceived ?? row.totalLoadedQuantity,
      expectedStockQuantity: row.expectedStockQuantity ?? "",
      quantityAfterDelivery: row.quantityAfterDelivery ?? "",
      actualQuantityReceived: row.actualQuantityReceived ?? "",
      feedbackNote: row.feedbackNote ?? ""
    });
    setMutation(mutationIdle());
  }

  async function submitFuelTransferFeedback(action: "SAVE" | "CONFIRM" | "POST") {
    if (!viewingStationDelivery) {
      return;
    }

    setMutation({ status: "submitting", message: "" });

    try {
      const response = await fetch(
        `/api/fuel-operations/station-deliveries/${encodeURIComponent(
          viewingStationDelivery.stationDeliveryId
        )}/feedback`,
        {
          body: JSON.stringify({
            ...fuelTransferFeedbackDraft,
            action
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );
      const body = (await response.json()) as Partial<FuelOperationsMutationResponse>;

      if (!response.ok) {
        throw new Error(body.message ?? "Flash ERP could not save the transfer feedback.");
      }

      setMutation({
        status: "success",
        message: body.message ?? "Fuel transfer feedback saved."
      });
      router.refresh();
    } catch (error) {
      setMutation({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save the transfer feedback."
      });
    }
  }

  function submitFuelSale() {
    const printWindow = openReceiptPreparingWindow("Fuel sale receipt");

    void submitJson(
      "/api/fuel-operations/sales",
      buildFuelSalePayload(),
      () => setFuelSaleDialogOpen(false),
      {
        onError: () => printWindow?.close(),
        onSuccess: (body) => {
          if (!body.fuelSaleReceipt) {
            printWindow?.close();
            return;
          }

          const paperKind = resolveReceiptPaperKind(
            body.fuelSaleReceipt.status === "ORDERED"
              ? workspace.fuelSettings.salesOrderReceiptPaperKind
              : workspace.fuelSettings.saleReceiptPaperKind
          );
          const receiptTemplate = resolveFuelReceiptTemplate(
            workspace.receiptTemplateOptions,
            paperKind
          );

          openReceiptPrintWindow(
            buildFuelSaleReceipt({
              row: body.fuelSaleReceipt,
              paperKind,
              template: receiptTemplate,
              companyName: workspace.companyName,
              companyLogoUrl: workspace.companyLogoUrl
            }),
            printWindow
          );
        }
      }
    );
  }

  function submitStationDelivery() {
    const printWindow = openReceiptPreparingWindow("Fuel transfer waybill");

    void submitJson(
      "/api/fuel-operations/station-deliveries",
      stationDeliveryDraft,
      () => setStationDeliveryDialogOpen(false),
      {
        onError: () => printWindow?.close(),
        onSuccess: (body) => {
          if (!body.stationDeliveryReceipt) {
            printWindow?.close();
            return;
          }

          const paperKind = resolveReceiptPaperKind(
            workspace.fuelSettings.deliveryReceiptPaperKind
          );
          const receiptTemplate = resolveFuelReceiptTemplate(
            workspace.receiptTemplateOptions,
            paperKind
          );

          openReceiptPrintWindow(
            buildStationDeliveryReceipt({
              row: body.stationDeliveryReceipt,
              paperKind,
              template: receiptTemplate,
              companyName: workspace.companyName,
              companyLogoUrl: workspace.companyLogoUrl
            }),
            printWindow
          );
        }
      }
    );
  }

  function updateFuelSaleLine(
    index: number,
    patch: NonNullable<CreateFuelSaleRequest["lines"]>[number]
  ) {
    setFuelSaleDraft((current) => {
      const currentLines = current.lines?.length ? current.lines : [{}];
      return {
        ...current,
        lines: currentLines.map((line, lineIndex) =>
          lineIndex === index ? { ...line, ...patch } : line
        )
      };
    });
  }

  function addFuelSaleLine() {
    setFuelSaleDraft((current) => ({
      ...current,
      lines: [...(current.lines?.length ? current.lines : [{}]), {}]
    }));
  }

  function removeFuelSaleLine(index: number) {
    setFuelSaleDraft((current) => {
      const currentLines = current.lines?.length ? current.lines : [{}];
      const nextLines = currentLines.filter((_, lineIndex) => lineIndex !== index);
      return {
        ...current,
        lines: nextLines.length ? nextLines : [{}]
      };
    });
  }

  function updateFuelSalePaymentDraft(draftId: string, patch: Partial<FuelSalePaymentDraft>) {
    setFuelSalePaymentDrafts((drafts) =>
      drafts.map((draft) => (draft.id === draftId ? { ...draft, ...patch } : draft))
    );
  }

  function addFuelSalePaymentDraft() {
    setFuelSalePaymentDrafts((drafts) => [
      ...drafts,
      createFuelSalePaymentDraft(defaultFuelPaymentTenderCode, "", workspace.defaultOperationDate)
    ]);
  }

  function removeFuelSalePaymentDraft(draftId: string) {
    setFuelSalePaymentDrafts((drafts) =>
      drafts.length <= 1 ? drafts : drafts.filter((draft) => draft.id !== draftId)
    );
  }

  function buildFuelSalePayload(): CreateFuelSaleRequest {
    const payments =
      fuelSalePaymentDrafts
        .map((draft) => ({
          tenderMethodCode: draft.tenderMethodCode || null,
          amount: parseDraftMoney(draft.amount),
          reference: draft.reference.trim() || null,
          receivedAt: draft.receivedAt || null,
          notes: draft.notes.trim() || null
        }))
        .filter((payment) => payment.amount > 0);
    const paymentTotal = payments.reduce((sum, payment) => {
      const tender = payment.tenderMethodCode
        ? fuelPaymentTenderByCode.get(payment.tenderMethodCode)
        : null;

      return tender?.paymentMethod === "STORE_CREDIT" ? sum : sum + payment.amount;
    }, 0);
    const paymentReferences = payments
      .map((payment) => payment.reference)
      .filter((reference): reference is string => Boolean(reference));

    return {
      ...fuelSaleDraft,
      paymentReceivedAmount: Number(paymentTotal.toFixed(2)),
      paymentDate: payments[0]?.receivedAt ?? null,
      paymentReference: paymentReferences.join(", ") || null,
      payments
    };
  }

  const tankColumns = useMemo<ColumnDef<TankRow>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Tank",
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-stone-950">{row.original.code}</p>
            <p className="text-xs text-stone-500">{row.original.name}</p>
          </div>
        )
      },
      { accessorKey: "siteCode", header: "Site" },
      { accessorKey: "productCode", header: "Product" },
      { accessorKey: "uomCode", header: "UOM" },
      {
        accessorKey: "capacityQuantity",
        header: "Capacity",
        cell: ({ row }) => numberFormatter.format(row.original.capacityQuantity)
      },
      {
        accessorKey: "currentBookQuantity",
        header: "Book qty",
        cell: ({ row }) => numberFormatter.format(row.original.currentBookQuantity)
      },
      {
        accessorKey: "utilizationPercent",
        header: "Fill %",
        cell: ({ row }) => `${row.original.utilizationPercent.toFixed(2)}%`
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
        meta: { disableTruncate: true }
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <button
            aria-label={`Edit tank ${row.original.code}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 hover:border-[var(--brand)] hover:text-[var(--brand)]"
            onClick={() => editTank(row.original)}
            title="Edit tank"
            type="button"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const pumpColumns = useMemo<ColumnDef<PumpRow>[]>(
    () => [
      { accessorKey: "code", header: "Pump" },
      { accessorKey: "name", header: "Name" },
      { accessorKey: "siteCode", header: "Site" },
      { accessorKey: "nozzleCount", header: "Nozzles" },
      { accessorKey: "manufacturer", header: "Manufacturer" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <button
            aria-label={`Edit pump ${row.original.code}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 hover:border-[var(--brand)] hover:text-[var(--brand)]"
            onClick={() => editPump(row.original)}
            title="Edit pump"
            type="button"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const nozzleColumns = useMemo<ColumnDef<NozzleRow>[]>(
    () => [
      { accessorKey: "code", header: "Nozzle" },
      { accessorKey: "name", header: "Name" },
      { accessorKey: "pumpCode", header: "Pump" },
      { accessorKey: "tankCode", header: "Tank" },
      { accessorKey: "productCode", header: "Product" },
      {
        accessorKey: "currentMeterReading",
        header: "Meter",
        cell: ({ row }) => numberFormatter.format(row.original.currentMeterReading)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <button
            aria-label={`Edit nozzle ${row.original.code}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 hover:border-[var(--brand)] hover:text-[var(--brand)]"
            onClick={() => editNozzle(row.original)}
            title="Edit nozzle"
            type="button"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const dipColumns = useMemo<ColumnDef<DipRow>[]>(
    () => [
      {
        accessorKey: "siteCode",
        header: "Site",
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-stone-950">{row.original.siteCode ?? "Not linked"}</p>
            <p className="text-xs text-stone-500">{row.original.siteName ?? "No site name"}</p>
          </div>
        )
      },
      {
        accessorKey: "stationCode",
        header: "Station",
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-stone-950">{row.original.stationCode ?? "Not linked"}</p>
            <p className="text-xs text-stone-500">{row.original.stationName ?? "No station"}</p>
          </div>
        )
      },
      { accessorKey: "tankCode", header: "Tank" },
      {
        accessorKey: "dipDate",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.dipDate)
      },
      {
        accessorKey: "dipQuantity",
        header: "Dip reading",
        cell: ({ row }) => numberFormatter.format(row.original.dipQuantity)
      },
      {
        accessorKey: "waterQuantity",
        header: "Water volume",
        cell: ({ row }) => numberFormatter.format(row.original.waterQuantity)
      },
      {
        accessorKey: "bookQuantity",
        header: "Book qty",
        cell: ({ row }) => numberFormatter.format(row.original.bookQuantity)
      },
      {
        accessorKey: "varianceQuantity",
        header: "Variance",
        cell: ({ row }) => (
          <span className={row.original.varianceQuantity < 0 ? "text-rose-700" : "text-emerald-700"}>
            {numberFormatter.format(row.original.varianceQuantity)}
          </span>
        )
      },
      { accessorKey: "dipReference", header: "Reference" },
      {
        accessorKey: "evidenceImageUrl",
        header: "Evidence",
        cell: ({ row }) =>
          row.original.evidenceImageUrl ? (
            <a
              className="inline-flex items-center gap-1 text-sm font-semibold text-sky-700 hover:text-sky-900"
              href={row.original.evidenceImageUrl}
              rel="noreferrer"
              target="_blank"
            >
              Photo
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span className="text-xs font-semibold text-rose-700">Missing</span>
          )
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <button
            aria-label={`Edit dip ${row.original.tankCode}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 hover:border-[var(--brand)] hover:text-[var(--brand)]"
            onClick={() => editDip(row.original)}
            title="Edit dip"
            type="button"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const meterColumns = useMemo<ColumnDef<MeterReadingRow>[]>(
    () => [
      {
        accessorKey: "siteCode",
        header: "Site",
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-stone-950">{row.original.siteCode ?? "Not linked"}</p>
            <p className="text-xs text-stone-500">{row.original.siteName ?? "No site name"}</p>
          </div>
        )
      },
      {
        accessorKey: "stationCode",
        header: "Station",
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-stone-950">{row.original.stationCode ?? "Not linked"}</p>
            <p className="text-xs text-stone-500">{row.original.stationName ?? "No station"}</p>
          </div>
        )
      },
      { accessorKey: "nozzleCode", header: "Nozzle" },
      { accessorKey: "tankCode", header: "Tank" },
      {
        accessorKey: "readingDate",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.readingDate)
      },
      {
        accessorKey: "salesQuantity",
        header: "Sales qty",
        cell: ({ row }) => numberFormatter.format(row.original.salesQuantity)
      },
      {
        accessorKey: "salesAmount",
        header: "Sales",
        cell: ({ row }) => moneyFormatter.format(row.original.salesAmount)
      },
      { accessorKey: "shiftReference", header: "Shift" },
      {
        accessorKey: "evidenceImageUrl",
        header: "Evidence",
        cell: ({ row }) =>
          row.original.evidenceImageUrl ? (
            <a
              className="inline-flex items-center gap-1 text-sm font-semibold text-sky-700 hover:text-sky-900"
              href={row.original.evidenceImageUrl}
              rel="noreferrer"
              target="_blank"
            >
              Photo
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span className="text-xs font-semibold text-rose-700">Missing</span>
          )
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <button
            aria-label={`Edit meter reading ${row.original.nozzleCode}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 hover:border-[var(--brand)] hover:text-[var(--brand)]"
            onClick={() => editMeterReading(row.original)}
            title="Edit meter reading"
            type="button"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const deliveryColumns = useMemo<ColumnDef<DeliveryRow>[]>(
    () => [
      { accessorKey: "deliveryNo", header: "Receipt" },
      {
        accessorKey: "createdAt",
        header: "Captured",
        cell: ({ row }) => formatDateTime(row.original.createdAt)
      },
      { accessorKey: "supplierName", header: "Supplier" },
      { accessorKey: "siteCode", header: "Site" },
      { accessorKey: "uomSummary", header: "UOM" },
      {
        accessorKey: "totalAcceptedQuantity",
        header: "Accepted qty",
        cell: ({ row }) => numberFormatter.format(row.original.totalAcceptedQuantity)
      },
      {
        accessorKey: "totalVarianceQuantity",
        header: "Variance",
        cell: ({ row }) => numberFormatter.format(row.original.totalVarianceQuantity)
      },
      {
        accessorKey: "totalCostAmount",
        header: "Cost",
        cell: ({ row }) => moneyFormatter.format(row.original.totalCostAmount)
      }
    ],
    []
  );

  const stationColumns = useMemo<ColumnDef<StationRow>[]>(
    () => [
      {
        accessorKey: "stationCode",
        header: "Station",
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-stone-950">{row.original.stationCode}</p>
            <p className="text-xs text-stone-500">{row.original.stationName}</p>
          </div>
        )
      },
      { accessorKey: "stationType", header: "Type", cell: ({ row }) => formatEnumLabel(row.original.stationType) },
      { accessorKey: "storeName", header: "Linked shop" },
      { accessorKey: "inventoryLocationCode", header: "Receiving location" },
      { accessorKey: "operatingSiteCode", header: "Owned site" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <button
            aria-label={`Edit filling station ${row.original.stationCode}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 hover:border-[var(--brand)] hover:text-[var(--brand)]"
            onClick={() => editStation(row.original)}
            title="Edit filling station"
            type="button"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const stationDeliveryColumns = useMemo<ColumnDef<StationDeliveryRow>[]>(
    () => [
      { accessorKey: "deliveryNo", header: "Transfer/waybill" },
      {
        accessorKey: "createdAt",
        header: "Issued",
        cell: ({ row }) => formatDateTime(row.original.createdAt)
      },
      { accessorKey: "stationName", header: "Station" },
      { accessorKey: "destinationStoreName", header: "Destination shop" },
      { accessorKey: "sourceSiteCode", header: "Source" },
      { accessorKey: "uomSummary", header: "UOM" },
      {
        accessorKey: "totalLoadedQuantity",
        header: "Issued qty",
        cell: ({ row }) => numberFormatter.format(row.original.totalLoadedQuantity)
      },
      {
        accessorKey: "totalDeliveredQuantity",
        header: "Received qty",
        cell: ({ row }) => numberFormatter.format(row.original.totalDeliveredQuantity)
      },
      {
        accessorKey: "totalVarianceQuantity",
        header: "In transit",
        cell: ({ row }) =>
          numberFormatter.format(
            Math.max(0, row.original.totalLoadedQuantity - row.original.totalDeliveredQuantity)
          )
      },
      { accessorKey: "vehicleRegistrationNo", header: "Vehicle" },
      {
        accessorKey: "feedbackStatus",
        header: "Feedback",
        cell: ({ row }) => <StatusBadge value={row.original.feedbackStatus} />
      },
      {
        accessorKey: "valuationStatus",
        header: "Valuation",
        cell: ({ row }) => <StatusBadge value={row.original.valuationStatus} />
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "View",
                onSelect: () => viewStationDelivery(row.original)
              },
              {
                label: "Print waybill",
                onSelect: () => printStationDelivery(row.original)
              }
            ]}
            label={`Open actions for station delivery ${row.original.deliveryNo}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const fuelSaleColumns = useMemo<ColumnDef<FuelSaleRow>[]>(
    () => [
      { accessorKey: "saleNo", header: "Sale" },
      {
        accessorKey: "createdAt",
        header: "Captured",
        cell: ({ row }) => formatDateTime(row.original.createdAt)
      },
      {
        accessorKey: "dispatchDate",
        header: "Dispatch",
        cell: ({ row }) => formatDateTime(row.original.dispatchDate)
      },
      { accessorKey: "sourceSiteCode", header: "Source store" },
      { accessorKey: "customerName", header: "Customer" },
      {
        accessorKey: "serviceType",
        header: "Service",
        cell: ({ row }) => formatEnumLabel(row.original.serviceType)
      },
      { accessorKey: "productSummary", header: "Product" },
      { accessorKey: "uomSummary", header: "UOM" },
      {
        accessorKey: "quantity",
        header: "Qty",
        cell: ({ row }) => numberFormatter.format(row.original.quantity)
      },
      {
        accessorKey: "totalAmount",
        header: "Amount",
        cell: ({ row }) => moneyFormatter.format(row.original.totalAmount)
      },
      {
        accessorKey: "paymentReceivedAmount",
        header: "Received",
        cell: ({ row }) => moneyFormatter.format(row.original.paymentReceivedAmount)
      },
      {
        accessorKey: "balanceAmount",
        header: "Balance",
        cell: ({ row }) => moneyFormatter.format(row.original.balanceAmount)
      },
      {
        accessorKey: "paymentStatus",
        header: "Payment",
        cell: ({ row }) => <StatusBadge value={row.original.paymentStatus} />
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "View",
                onSelect: () => setViewingFuelSale(row.original)
              },
              {
                label: "Reprint receipt",
                onSelect: () => printFuelSale(row.original)
              },
              ...(row.original.status === "ORDERED"
                ? [
                    {
                      label: "Fulfill order",
                      onSelect: () => fulfillFuelSale(row.original),
                      tone: "primary" as const
                    }
                  ]
                : [])
            ]}
            label={`Open actions for fuel sale ${row.original.saleNo}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const reconciliationColumns = useMemo<ColumnDef<ReconciliationRow>[]>(
    () => [
      { accessorKey: "reconciliationNo", header: "Reconciliation" },
      {
        accessorKey: "reconciliationDate",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.reconciliationDate)
      },
      { accessorKey: "siteCode", header: "Site" },
      {
        accessorKey: "totalStationDeliveryQuantity",
        header: "Station dispatch",
        cell: ({ row }) => numberFormatter.format(row.original.totalStationDeliveryQuantity)
      },
      {
        accessorKey: "totalMeterSalesQuantity",
        header: "Meter sales",
        cell: ({ row }) => numberFormatter.format(row.original.totalMeterSalesQuantity)
      },
      {
        accessorKey: "totalGainLossQuantity",
        header: "Gain/Loss",
        cell: ({ row }) => numberFormatter.format(row.original.totalGainLossQuantity)
      },
      {
        accessorKey: "marginAmount",
        header: "Margin",
        cell: ({ row }) => moneyFormatter.format(row.original.marginAmount)
      },
      {
        accessorKey: "marginPercent",
        header: "Margin %",
        cell: ({ row }) => `${row.original.marginPercent.toFixed(2)}%`
      }
    ],
    []
  );

  const reconciliationLineColumns = useMemo<ColumnDef<ReconciliationLineRow>[]>(
    () => [
      { accessorKey: "reconciliationNo", header: "Day" },
      { accessorKey: "tankCode", header: "Tank" },
      { accessorKey: "productCode", header: "Product" },
      {
        accessorKey: "stationDeliveryQuantity",
        header: "Station dispatch",
        cell: ({ row }) => numberFormatter.format(row.original.stationDeliveryQuantity)
      },
      {
        accessorKey: "bookClosingQuantity",
        header: "Book close",
        cell: ({ row }) => numberFormatter.format(row.original.bookClosingQuantity)
      },
      {
        accessorKey: "dipClosingQuantity",
        header: "Dip close",
        cell: ({ row }) => numberFormatter.format(row.original.dipClosingQuantity)
      },
      {
        accessorKey: "gainLossQuantity",
        header: "Gain/Loss",
        cell: ({ row }) => numberFormatter.format(row.original.gainLossQuantity)
      },
      {
        accessorKey: "marginAmount",
        header: "Margin",
        cell: ({ row }) => moneyFormatter.format(row.original.marginAmount)
      }
    ],
    []
  );

  const deliveryLine = deliveryDraft.lines?.[0] ?? {};
  const stationDeliveryLine = stationDeliveryDraft.lines?.[0] ?? {};
  const selectedStationDeliveryTank = stationDeliveryLine.sourceTankId
    ? tankOptions.find((tank) => tank.value === stationDeliveryLine.sourceTankId) ?? null
    : null;
  const stationDeliveryStationLabel =
    transferStationOptions.find((station) => station.value === stationDeliveryDraft.stationId)?.label ??
    "Select station";
  const stationDeliverySiteLabel =
    siteOptions.find((site) => site.value === stationDeliveryDraft.sourceOperatingSiteId)?.label ??
    "Select dispatch site";
  const stationTransferIssueQuantity = Math.max(
    0,
    parseDraftMoney(
      stationDeliveryLine.loadedQuantity ??
        stationDeliveryLine.deliveredQuantity ??
        stationDeliveryLine.orderedQuantity
    )
  );
  const selectedSupplierReceiptTank = deliveryLine.tankId
    ? tankOptions.find((tank) => tank.value === deliveryLine.tankId) ?? null
    : null;
  const fuelTransferFeedbackExpectedQuantity = parseDraftMoney(
    fuelTransferFeedbackDraft.expectedQuantityReceived
  );
  const fuelTransferFeedbackActualQuantity =
    fuelTransferFeedbackDraft.actualQuantityReceived !== null &&
    fuelTransferFeedbackDraft.actualQuantityReceived !== undefined &&
    fuelTransferFeedbackDraft.actualQuantityReceived !== ""
      ? parseDraftMoney(fuelTransferFeedbackDraft.actualQuantityReceived)
      : parseDraftMoney(fuelTransferFeedbackDraft.quantityAfterDelivery) -
        parseDraftMoney(fuelTransferFeedbackDraft.quantityBeforeDelivery);
  const fuelTransferFeedbackVariance =
    fuelTransferFeedbackActualQuantity - fuelTransferFeedbackExpectedQuantity;
  const fuelSaleLines = fuelSaleDraft.lines?.length ? fuelSaleDraft.lines : [{}];
  const fuelSaleAmount = fuelSaleLines.reduce((sum, line) => {
    const quantity = Number(line.quantity ?? 0);
    const price = Number(line.unitPrice ?? 0);
    return sum + (Number.isFinite(quantity) && Number.isFinite(price) ? quantity * price : 0);
  }, 0);
  const fuelSaleSubtotal = fuelSaleAmount;
  const fuelSaleTaxAmount = 0;
  const fuelSaleTotal = fuelSaleSubtotal + fuelSaleTaxAmount;
  const fuelSalePaymentTotal = fuelSalePaymentDrafts.reduce(
    (sum, draft) => sum + Math.max(0, parseDraftMoney(draft.amount)),
    0
  );
  const fuelSaleCreditTenderTotal = fuelSalePaymentDrafts.reduce((sum, draft) => {
    const tender = fuelPaymentTenderByCode.get(draft.tenderMethodCode);

    return tender?.paymentMethod === "STORE_CREDIT"
      ? sum + Math.max(0, parseDraftMoney(draft.amount))
      : sum;
  }, 0);
  const fuelSaleCashPaymentTotal = fuelSalePaymentTotal - fuelSaleCreditTenderTotal;
  const fuelSaleBalance = fuelSaleTotal - fuelSaleCashPaymentTotal;
  const fuelSaleSourceLabel =
    siteOptions.find((site) => site.value === fuelSaleDraft.sourceOperatingSiteId)?.label ??
    "Select source";
  const fuelSaleCustomerLabel =
    customerOptions.find((customer) => customer.value === fuelSaleDraft.customerId)?.label ??
    fuelSaleDraft.customerName ??
    "Walk-in customer";
  const fuelSaleStationLabel =
    stationOptions.find((station) => station.value === fuelSaleDraft.stationId)?.label ??
    "No station";
  const fuelSaleHasPaymentOverTotal = fuelSalePaymentTotal - fuelSaleTotal > 0.005;
  const fuelSaleMissingPaymentTender = fuelSalePaymentDrafts.some(
    (draft) => parseDraftMoney(draft.amount) > 0 && !draft.tenderMethodCode
  );
  const fuelSaleMissingTenderAccount = fuelSalePaymentDrafts.some((draft) => {
    const tender = fuelPaymentTenderByCode.get(draft.tenderMethodCode);

    return (
      parseDraftMoney(draft.amount) > 0 &&
      Boolean(tender) &&
      tender?.paymentMethod !== "STORE_CREDIT" &&
      !tender?.cashbookAccountId
    );
  });
  const fuelSaleMissingTenderMapping = fuelSalePaymentDrafts.some(
    (draft) => parseDraftMoney(draft.amount) > 0 && Boolean(draft.tenderMethodCode) && !fuelPaymentTenderByCode.has(draft.tenderMethodCode)
  );
  const fuelSaleMissingReference = fuelSalePaymentDrafts.some((draft) => {
    const tender = fuelPaymentTenderByCode.get(draft.tenderMethodCode);

    return (
      parseDraftMoney(draft.amount) > 0 &&
      Boolean(tender?.requiresReference) &&
      !draft.reference.trim()
    );
  });
  const fuelSaleNeedsCustomerAccount =
    (fuelSaleDraft.documentMode === "SALES_ORDER" || fuelSaleBalance > 0.005) &&
    !fuelSaleDraft.customerId;
  const fuelSaleSubmitBlockReason = fuelSaleHasPaymentOverTotal
    ? "Fuel sale payments cannot exceed the total."
    : fuelSaleMissingPaymentTender
      ? "Select a tender for every payment row with an amount."
      : fuelSaleMissingTenderMapping
        ? "Refresh tender setup before saving this fuel sale payment."
        : fuelSaleMissingTenderAccount
          ? "Map the selected tender to a Finance cashbook account on the tender page."
          : fuelSaleMissingReference
            ? "Enter references for tender payments that require references."
            : fuelSaleNeedsCustomerAccount
              ? "Select an AR customer account for sales orders or part-paid fuel sales."
              : "";

  const content = (
      <div className="space-y-6">
        {showHqSiteFilter ? (
          <div className="flex flex-col gap-3 border-b border-stone-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-950">HQ site scope</p>
                <p className="text-xs text-stone-500">Applies to every Fuel Management grid on this page.</p>
              </div>
            </div>
            <label className="w-full space-y-1.5 text-sm sm:max-w-sm">
              <span className="block font-semibold text-stone-800">Site</span>
              <select
                className="h-10 w-full border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-[var(--brand)]"
                onChange={(event) => setHqSiteFilterId(event.target.value)}
                value={hqSiteFilterId}
              >
                <option value="">All sites</option>
                {workspace.siteOptions.map((site) => (
                  <option key={site.operatingSiteId} value={site.operatingSiteId}>
                    {site.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            hint="Registered tank count."
            icon={Warehouse}
            label="Active tanks"
            value={String(displayedMetrics.activeTanks)}
          />
          <MetricCard
            hint="Current operational book quantity."
            icon={Droplets}
            label="Book quantity"
            value={numberFormatter.format(displayedMetrics.totalBookQuantity)}
          />
          <MetricCard
            hint="Latest reconciled physical gain or loss."
            icon={Scale}
            label="Latest gain/loss"
            value={numberFormatter.format(displayedMetrics.latestGainLossQuantity)}
          />
          <MetricCard
            hint={`Latest margin in ${functionalCurrencyCode}.`}
            icon={Gauge}
            label="Latest margin"
            value={moneyFormatter.format(displayedMetrics.latestMarginAmount)}
          />
        </div>

        {dedicatedView ? null : (
          <ViewTabs
            activeView={activeView}
            availableViews={availableViews}
            onChange={handleViewChange}
          />
        )}

        {activeView === "tanks" ? (
          <Section
            actions={
              <ActionDialog
                onOpenChange={(open) => {
                  setTankDialogOpen(open);
                  if (!open) {
                    setTankDraft({ tankType: "UNDERGROUND", uomCode: "LTR", status: "ACTIVE" });
                    setMutation(mutationIdle());
                  }
                }}
                open={tankDialogOpen}
                title="Fuel tank"
                triggerIcon={Plus}
                triggerLabel="New tank"
                widthClassName="max-w-5xl"
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <DialogTextInput
                    label="Tank code"
                    onChange={(value) => setTankDraft((current) => ({ ...current, code: value }))}
                    value={tankDraft.code ?? ""}
                  />
                  <DialogTextInput
                    label="Tank name"
                    onChange={(value) => setTankDraft((current) => ({ ...current, name: value }))}
                    value={tankDraft.name ?? ""}
                  />
                  <DialogSelect
                    label="Tank type"
                    onChange={(value) => setTankDraft((current) => ({ ...current, tankType: value }))}
                    options={tankTypeOptions}
                    value={tankDraft.tankType ?? "UNDERGROUND"}
                  />
                  <DialogSelect
                    label="Operating site"
                    onChange={(value) =>
                      setTankDraft((current) => ({ ...current, operatingSiteId: value }))
                    }
                    options={siteOptions}
                    value={tankDraft.operatingSiteId ?? ""}
                  />
                  <DialogSelect
                    label="Fuel product (Products)"
                    onChange={(value) => {
                      const selectedProduct = fuelProductByProfileId.get(value);

                      setTankDraft((current) => ({
                        ...current,
                        productProfileId: value,
                        uomCode: selectedProduct?.uomCode ?? ""
                      }));
                    }}
                    options={productOptions}
                    value={tankDraft.productProfileId ?? ""}
                  />
                  <DialogSelect
                    label="Tank status"
                    onChange={(value) => setTankDraft((current) => ({ ...current, status: value }))}
                    options={operationalStatusOptions}
                    value={tankDraft.status ?? "ACTIVE"}
                  />
                  <DialogReadOnlyValue
                    label="UOM"
                    value={selectedTankUomCode}
                  />
                  <DialogTextInput
                    label="Capacity"
                    min="0"
                    onChange={(value) =>
                      setTankDraft((current) => ({ ...current, capacityQuantity: value }))
                    }
                    step="0.001"
                    type="number"
                    value={tankDraft.capacityQuantity ?? ""}
                  />
                  <DialogTextInput
                    label="Safe capacity"
                    min="0"
                    onChange={(value) =>
                      setTankDraft((current) => ({ ...current, safeCapacityQuantity: value }))
                    }
                    step="0.001"
                    type="number"
                    value={tankDraft.safeCapacityQuantity ?? ""}
                  />
                  <DialogTextInput
                    label="Opening quantity"
                    min="0"
                    onChange={(value) =>
                      setTankDraft((current) => ({ ...current, openingQuantity: value }))
                    }
                    step="0.001"
                    type="number"
                    value={tankDraft.openingQuantity ?? ""}
                  />
                </div>
                <DialogFooter
                  mutation={mutation}
                  onCancel={() => setTankDialogOpen(false)}
                  onSubmit={() =>
                    void submitJson("/api/fuel-operations/tanks", tankDraft, () =>
                      setTankDialogOpen(false)
                    )
                  }
                  submitLabel="Save tank"
                />
              </ActionDialog>
            }
            description="Tank registration, product assignment, capacity, and current book quantity."
            id="tanks"
            title="Tank management"
          >
            <SharedDataGrid
              columns={tankColumns}
              data={filteredTankRows}
              emptyLabel="No fuel tanks are registered."
              exportFileName="flash-erp-fuel-tanks"
              globalFilterFn={tankSearch}
              searchPlaceholder="Search tanks, sites, or products"
            />
          </Section>
        ) : null}

        {activeView === "pumps" || activeView === "sales" ? (
          <div className="space-y-8">
            {activeView === "pumps" ? (
            <Section
              actions={
                <ActionDialog
                  onOpenChange={(open) => {
                    setPumpDialogOpen(open);
                    if (!open) {
                      setPumpDraft({ pumpType: "DISPENSER", status: "ACTIVE" });
                      setMutation(mutationIdle());
                    }
                  }}
                  open={pumpDialogOpen}
                  title="Fuel pump"
                  triggerIcon={Plus}
                  triggerLabel="New pump"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <DialogTextInput
                      label="Pump code"
                      onChange={(value) =>
                        setPumpDraft((current) => ({ ...current, code: value }))
                      }
                      value={pumpDraft.code ?? ""}
                    />
                    <DialogTextInput
                      label="Pump name"
                      onChange={(value) =>
                        setPumpDraft((current) => ({ ...current, name: value }))
                      }
                      value={pumpDraft.name ?? ""}
                    />
                    <DialogSelect
                      label="Operating site"
                      onChange={(value) =>
                        setPumpDraft((current) => ({ ...current, operatingSiteId: value }))
                      }
                      options={siteOptions}
                      value={pumpDraft.operatingSiteId ?? ""}
                    />
                    <DialogSelect
                      label="Pump type"
                      onChange={(value) =>
                        setPumpDraft((current) => ({ ...current, pumpType: value }))
                      }
                      options={pumpTypeOptions}
                      value={pumpDraft.pumpType ?? "DISPENSER"}
                    />
                    <DialogSelect
                      label="Pump status"
                      onChange={(value) =>
                        setPumpDraft((current) => ({ ...current, status: value }))
                      }
                      options={operationalStatusOptions}
                      value={pumpDraft.status ?? "ACTIVE"}
                    />
                    <DialogTextInput
                      label="Manufacturer"
                      onChange={(value) =>
                        setPumpDraft((current) => ({ ...current, manufacturer: value }))
                      }
                      value={pumpDraft.manufacturer ?? ""}
                    />
                    <DialogTextInput
                      label="Serial no."
                      onChange={(value) =>
                        setPumpDraft((current) => ({ ...current, serialNo: value }))
                      }
                      value={pumpDraft.serialNo ?? ""}
                    />
                  </div>
                  <DialogFooter
                    mutation={mutation}
                    onCancel={() => setPumpDialogOpen(false)}
                    onSubmit={() =>
                      void submitJson("/api/fuel-operations/pumps", pumpDraft, () =>
                        setPumpDialogOpen(false)
                      )
                    }
                    submitLabel="Save pump"
                  />
                </ActionDialog>
              }
              description="Pump registration by operating site."
              id="pumps"
              title="Pump management"
            >
              <SharedDataGrid
                columns={pumpColumns}
                data={filteredPumpRows}
                emptyLabel="No fuel pumps are registered."
                exportFileName="flash-erp-fuel-pumps"
                globalFilterFn={pumpSearch}
                searchPlaceholder="Search pumps"
              />
            </Section>
            ) : null}

            {activeView === "sales" ? (
            <Section
              actions={
                <>
                <ActionDialog
                  onOpenChange={(open) => {
                    setFuelSaleDialogOpen(open);
                    if (!open) {
                      setFuelSaleDraft({
                        documentMode: "SALE",
                        loadingDate: workspace.defaultOperationDate,
                        dispatchDate: workspace.defaultOperationDate,
                        serviceType: "COMBO",
                        sourceOperatingSiteId: defaultSaleSourceSiteId,
                        currencyCode: functionalCurrencyCode,
                        lines: [{}]
                      });
                      setFuelSalePaymentDrafts([
                        createFuelSalePaymentDraft(
                          defaultFuelPaymentTenderCode,
                          "",
                          workspace.defaultOperationDate
                        )
                      ]);
                      setMutation(mutationIdle());
                    }
                  }}
                  open={fuelSaleDialogOpen}
                  title="Fuel sale"
                  triggerIcon={CreditCard}
                  triggerLabel="New fuel sale"
                  widthClassName="max-w-[92rem]"
                >
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-sky-50 p-4 shadow-sm">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                            Fuel sale
                          </p>
                          <p className="mt-1 truncate text-lg font-semibold text-stone-950">
                            {formatEnumLabel(fuelSaleDraft.documentMode ?? "SALE")}
                          </p>
                          <p className="mt-1 truncate text-sm text-stone-600">
                            {fuelSaleCustomerLabel}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                            Source
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold text-stone-900">
                            {fuelSaleSourceLabel}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                            Station
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold text-stone-900">
                            {fuelSaleStationLabel}
                          </p>
                        </div>
                        <div className="rounded-xl border border-emerald-200 bg-emerald-600 px-3 py-2 text-white">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50">
                            Total
                          </p>
                          <p className="mt-1 text-lg font-semibold">
                            {moneyFormatter.format(fuelSaleTotal)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-5">
                    <DialogSelect
                      label="Document mode"
                      onChange={(value) =>
                        setFuelSaleDraft((current) => ({ ...current, documentMode: value }))
                      }
                      options={fuelSaleDocumentModeOptions}
                      value={fuelSaleDraft.documentMode ?? "SALE"}
                    />
                    <DialogSelect
                      label="Source store/site"
                      onChange={(value) =>
                        setFuelSaleDraft((current) =>
                          repriceFuelSaleDraft({ ...current, sourceOperatingSiteId: value })
                        )
                      }
                      options={siteOptions}
                      value={fuelSaleDraft.sourceOperatingSiteId ?? ""}
                    />
                    <DialogTextInput
                      label="Date of loading"
                      onChange={(value) =>
                        setFuelSaleDraft((current) => ({ ...current, loadingDate: value }))
                      }
                      type="date"
                      value={dateOnly(fuelSaleDraft.loadingDate ?? workspace.defaultOperationDate)}
                    />
                    <DialogTextInput
                      label="Date of dispatch"
                      onChange={(value) =>
                        setFuelSaleDraft((current) => ({ ...current, dispatchDate: value }))
                      }
                      type="date"
                      value={dateOnly(fuelSaleDraft.dispatchDate ?? workspace.defaultOperationDate)}
                    />
                    <DialogSelect
                      label="Customer account (AR)"
                      onChange={(value) =>
                        setFuelSaleDraft((current) =>
                          repriceFuelSaleDraft({ ...current, customerId: value })
                        )
                      }
                      options={customerOptions}
                      value={fuelSaleDraft.customerId ?? ""}
                    />
                    <DialogTextInput
                      label="Customer name"
                      onChange={(value) =>
                        setFuelSaleDraft((current) => ({ ...current, customerName: value }))
                      }
                      value={fuelSaleDraft.customerName ?? ""}
                    />
                    <DialogSelect
                      label="Service type"
                      onChange={(value) =>
                        setFuelSaleDraft((current) => ({ ...current, serviceType: value }))
                      }
                      options={serviceTypeOptions}
                      value={fuelSaleDraft.serviceType ?? "COMBO"}
                    />
                    <DialogTextInput
                      label="Truck loaded"
                      onChange={(value) =>
                        setFuelSaleDraft((current) => ({ ...current, truckLoaded: value }))
                      }
                      value={fuelSaleDraft.truckLoaded ?? ""}
                    />
                    <DialogSelect
                      label="Filling station"
                      onChange={(value) =>
                        setFuelSaleDraft((current) =>
                          repriceFuelSaleDraft({ ...current, stationId: value })
                        )
                      }
                      options={stationOptions}
                      value={fuelSaleDraft.stationId ?? ""}
                    />
                    <DialogSelect
                      label="Currency"
                      onChange={(value) =>
                        setFuelSaleDraft((current) => ({ ...current, currencyCode: value }))
                      }
                      options={currencyOptions}
                      value={fuelSaleDraft.currencyCode ?? functionalCurrencyCode}
                    />
                    <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3 md:col-span-4 xl:col-span-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-emerald-950">Sale lines</p>
                        <button
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:border-emerald-400"
                          onClick={addFuelSaleLine}
                          type="button"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add line
                        </button>
                      </div>
                      <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white">
                        <div className="grid gap-3 border-b border-emerald-100 bg-emerald-100/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800 md:grid-cols-[minmax(0,1fr)_5rem_8rem_8rem_8rem_3rem]">
                          <span>Product</span>
                          <span>UOM</span>
                          <span>Price</span>
                          <span>Quantity</span>
                          <span>Amount</span>
                          <span />
                        </div>
                        {fuelSaleLines.map((line, index) => {
                          const lineQuantity = Number(line.quantity ?? 0);
                          const linePrice = Number(line.unitPrice ?? 0);
                          const lineAmount =
                            Number.isFinite(lineQuantity) && Number.isFinite(linePrice)
                              ? lineQuantity * linePrice
                              : 0;
                          const selectedProduct =
                            (line.productId
                              ? workspace.productOptions.find(
                                  (option) => option.productId === line.productId
                                )
                              : null) ??
                            (line.productProfileId
                              ? fuelProductByProfileId.get(line.productProfileId) ?? null
                              : null);

                          return (
                            <div
                              className="grid gap-2 border-b border-stone-100 px-3 py-2 last:border-b-0 md:grid-cols-[minmax(0,1fr)_5rem_8rem_8rem_8rem_3rem]"
                              key={index}
                            >
                              <select
                                className="min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                                onChange={(event) => {
                                  const productId = event.target.value;
                                  const selectedProduct =
                                    workspace.productOptions.find(
                                      (option) => option.productId === productId
                                    ) ?? null;

                                  updateFuelSaleLine(index, {
                                    productId,
                                    productProfileId: selectedProduct?.productProfileId ?? "",
                                    unitPrice: resolveFuelProductUnitPrice(
                                      selectedProduct,
                                      fuelSaleDraft.sourceOperatingSiteId,
                                      resolveFuelSaleCustomerId(fuelSaleDraft)
                                    )
                                  });
                                }}
                                value={line.productId ?? ""}
                              >
                                <option value="">Select product</option>
                                {fuelSaleProductOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <span className="flex items-center rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-700">
                                {selectedProduct?.uomCode ?? "UOM"}
                              </span>
                              <input
                                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                                min="0"
                                onChange={(event) =>
                                  updateFuelSaleLine(index, { unitPrice: event.target.value })
                                }
                                step="0.0001"
                                type="number"
                                value={line.unitPrice ?? ""}
                              />
                              <input
                                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                                min="0"
                                onChange={(event) =>
                                  updateFuelSaleLine(index, { quantity: event.target.value })
                                }
                                step="0.001"
                                type="number"
                                value={line.quantity ?? ""}
                              />
                              <span className="flex items-center text-sm font-semibold text-stone-900">
                                {moneyFormatter.format(lineAmount)}
                              </span>
                              <button
                                aria-label="Remove sale line"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 hover:border-rose-300 hover:text-rose-700"
                                disabled={fuelSaleLines.length === 1}
                                onClick={() => removeFuelSaleLine(index)}
                                type="button"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grid gap-2 md:col-span-4 md:grid-cols-4 xl:col-span-5">
                      <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                          Subtotal
                        </p>
                        <p className="mt-1 text-base font-semibold text-stone-950">
                          {moneyFormatter.format(fuelSaleSubtotal)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                          Tax
                        </p>
                        <p className="mt-1 text-base font-semibold text-amber-950">
                          {moneyFormatter.format(fuelSaleTaxAmount)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                          Total
                        </p>
                        <p className="mt-1 text-base font-semibold text-emerald-950">
                          {moneyFormatter.format(fuelSaleTotal)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                          Balance
                        </p>
                        <p
                          className={`mt-1 text-base font-semibold ${
                            fuelSaleBalance > 0.005
                              ? "text-amber-700"
                              : fuelSaleBalance < -0.005
                                ? "text-rose-700"
                                : "text-emerald-700"
                          }`}
                        >
                          {moneyFormatter.format(fuelSaleBalance)}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-3 md:col-span-4 xl:col-span-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-sky-950">Payments</p>
                          <p className="text-xs text-stone-500">
                            Cash {moneyFormatter.format(fuelSaleCashPaymentTotal)}
                            {fuelSaleCreditTenderTotal > 0
                              ? ` - Credit ${moneyFormatter.format(fuelSaleCreditTenderTotal)}`
                              : ""}{" "}
                            - Balance {moneyFormatter.format(fuelSaleBalance)}
                          </p>
                        </div>
                        <button
                          className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-800 hover:border-sky-400"
                          onClick={addFuelSalePaymentDraft}
                          type="button"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add payment
                        </button>
                      </div>
                      <div className="overflow-hidden rounded-2xl border border-sky-200 bg-white">
                        <div className="grid gap-2 border-b border-sky-100 bg-sky-100/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-sky-800 md:grid-cols-[minmax(14rem,1.5fr)_8rem_9rem_minmax(9rem,1fr)_3rem]">
                          <span>Tender</span>
                          <span>Amount</span>
                          <span>Date</span>
                          <span>Reference</span>
                          <span />
                        </div>
                        {fuelSalePaymentDrafts.map((draft) => {
                          const tender = fuelPaymentTenderByCode.get(draft.tenderMethodCode);

                          return (
                            <div
                              className="grid gap-2 border-b border-stone-100 px-3 py-2 last:border-b-0 md:grid-cols-[minmax(14rem,1.5fr)_8rem_9rem_minmax(9rem,1fr)_3rem]"
                              key={draft.id}
                            >
                              <select
                                className="min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                                onChange={(event) =>
                                  updateFuelSalePaymentDraft(draft.id, {
                                    tenderMethodCode: event.target.value
                                  })
                                }
                                value={draft.tenderMethodCode}
                              >
                                <option value="">Select tender</option>
                                {paymentTenderOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                                min="0"
                                onChange={(event) =>
                                  updateFuelSalePaymentDraft(draft.id, {
                                    amount: event.target.value
                                  })
                                }
                                step="0.01"
                                type="number"
                                value={draft.amount}
                              />
                              <input
                                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                                onChange={(event) =>
                                  updateFuelSalePaymentDraft(draft.id, {
                                    receivedAt: event.target.value
                                  })
                                }
                                type="date"
                                value={dateOnly(draft.receivedAt)}
                              />
                              <input
                                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
                                onChange={(event) =>
                                  updateFuelSalePaymentDraft(draft.id, {
                                    reference: event.target.value
                                  })
                                }
                                placeholder={tender?.requiresReference ? "Reference required" : "Reference"}
                                value={draft.reference}
                              />
                              <button
                                aria-label="Remove payment"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={fuelSalePaymentDrafts.length === 1}
                                onClick={() => removeFuelSalePaymentDraft(draft.id)}
                                type="button"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      {fuelSaleHasPaymentOverTotal ? (
                        <p className="text-sm font-medium text-rose-700">
                          Fuel sale payments cannot exceed the total.
                        </p>
                      ) : null}
                      {fuelSaleMissingPaymentTender ? (
                        <p className="text-sm font-medium text-rose-700">
                          Every payment row with an amount needs a tender.
                        </p>
                      ) : null}
                      {fuelSaleMissingTenderMapping ? (
                        <p className="text-sm font-medium text-rose-700">
                          Refresh tender setup before saving this fuel sale payment.
                        </p>
                      ) : null}
                      {fuelSaleMissingTenderAccount ? (
                        <p className="text-sm font-medium text-rose-700">
                          Map the selected tender to a Finance cashbook account on the tender page.
                        </p>
                      ) : null}
                      {fuelSaleMissingReference ? (
                        <p className="text-sm font-medium text-rose-700">
                          Tender payments that require references need a reference before saving.
                        </p>
                      ) : null}
                    </div>
                  </div>
                  </div>
                  <DialogFooter
                    disabled={Boolean(fuelSaleSubmitBlockReason)}
                    disabledReason={fuelSaleSubmitBlockReason}
                    mutation={mutation}
                    onCancel={() => setFuelSaleDialogOpen(false)}
                    onSubmit={submitFuelSale}
                    submitLabel={
                      fuelSaleDraft.documentMode === "SALES_ORDER"
                        ? "Save sales order"
                        : "Save fuel sale"
                    }
                  />
                </ActionDialog>
                <ActionDialog
                  hideTrigger
                  onOpenChange={(open) => {
                    if (!open) {
                      setViewingFuelSale(null);
                    }
                  }}
                  open={Boolean(viewingFuelSale)}
                  title="Fuel sale detail"
                  triggerLabel="View fuel sale"
                  widthClassName="max-w-5xl"
                >
                  {viewingFuelSale ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <DialogReadOnlyValue label="Sale no." value={viewingFuelSale.saleNo} />
                        <DialogReadOnlyValue label="Customer" value={viewingFuelSale.customerName} />
                        <DialogReadOnlyValue label="Source store" value={viewingFuelSale.sourceSiteCode} />
                        <DialogReadOnlyValue label="Status" value={formatEnumLabel(viewingFuelSale.status)} />
                        <DialogReadOnlyValue label="Total quantity" value={`${numberFormatter.format(viewingFuelSale.quantity)} ${viewingFuelSale.uomSummary}`} />
                        <DialogReadOnlyValue label="Total" value={moneyFormatter.format(viewingFuelSale.totalAmount)} />
                        <DialogReadOnlyValue label="Paid" value={moneyFormatter.format(viewingFuelSale.paymentReceivedAmount)} />
                        <DialogReadOnlyValue label="Balance" value={moneyFormatter.format(viewingFuelSale.balanceAmount)} />
                      </div>
                      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                        <div className="grid gap-3 border-b border-stone-100 bg-stone-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 md:grid-cols-[minmax(0,1fr)_6rem_6rem_8rem_8rem]">
                          <span>Product</span>
                          <span>Qty</span>
                          <span>UOM</span>
                          <span>Price</span>
                          <span>Amount</span>
                        </div>
                        {viewingFuelSale.lines.map((line) => (
                          <div
                            className="grid gap-3 border-b border-stone-100 px-3 py-2 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_6rem_6rem_8rem_8rem]"
                            key={line.lineId}
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-stone-900">{line.productCode}</span>
                              <span className="block truncate text-xs text-stone-500">{line.productName}</span>
                            </span>
                            <span>{numberFormatter.format(line.quantity)}</span>
                            <span>{line.uomCode}</span>
                            <span>{moneyFormatter.format(line.unitPrice)}</span>
                            <span>{moneyFormatter.format(line.lineAmount)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                        <div className="grid gap-3 border-b border-stone-100 bg-stone-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 md:grid-cols-[minmax(0,1fr)_10rem_8rem]">
                          <span>Tender</span>
                          <span>Reference</span>
                          <span>Amount</span>
                        </div>
                        {(viewingFuelSale.payments.length ? viewingFuelSale.payments : []).map((payment) => (
                          <div
                            className="grid gap-3 border-b border-stone-100 px-3 py-2 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_10rem_8rem]"
                            key={payment.paymentId}
                          >
                            <span>{payment.tenderMethodName ?? payment.cashbookAccountName ?? formatEnumLabel(payment.paymentMode)}</span>
                            <span>{payment.reference ?? "Not set"}</span>
                            <span>{moneyFormatter.format(payment.amount)}</span>
                          </div>
                        ))}
                        {viewingFuelSale.payments.length === 0 ? (
                          <p className="px-3 py-3 text-sm text-stone-500">No cash payment rows were captured.</p>
                        ) : null}
                      </div>
                      <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
                        <button
                          className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400"
                          onClick={() => setViewingFuelSale(null)}
                          type="button"
                        >
                          <Eye className="h-4 w-4" />
                          Close
                        </button>
                        <button
                          className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)]"
                          onClick={() => printFuelSale(viewingFuelSale)}
                          type="button"
                        >
                          <Printer className="h-4 w-4" />
                          Print waybill
                        </button>
                      </div>
                    </div>
                  ) : null}
                </ActionDialog>
                <ActionDialog
                  hideTrigger
                  onOpenChange={(open) => {
                    setFulfillFuelSaleDialogOpen(open);
                    if (!open) {
                      setFulfillingFuelSale(null);
                      setFulfillFuelSaleDraft({
                        dispatchDate: workspace.defaultOperationDate
                      });
                      setMutation(mutationIdle());
                    }
                  }}
                  open={fulfillFuelSaleDialogOpen}
                  title="Fulfill sales order"
                  triggerLabel="Fulfill sales order"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 md:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                        Sales order
                      </p>
                      <p className="mt-2 text-lg font-semibold text-stone-950">
                        {fulfillingFuelSale?.saleNo ?? "Not selected"}
                      </p>
                      <p className="mt-1 text-sm text-stone-600">
                        {fulfillingFuelSale
                          ? `${fulfillingFuelSale.customerName} - ${moneyFormatter.format(
                              fulfillingFuelSale.balanceAmount
                            )} balance`
                          : ""}
                      </p>
                    </div>
                    <DialogTextInput
                      label="Dispatch date"
                      onChange={(value) =>
                        setFulfillFuelSaleDraft((current) => ({
                          ...current,
                          dispatchDate: value
                        }))
                      }
                      type="date"
                      value={dateOnly(
                        fulfillFuelSaleDraft.dispatchDate ?? workspace.defaultOperationDate
                      )}
                    />
                    <DialogTextInput
                      label="Pyt received now"
                      min="0"
                      onChange={(value) =>
                        setFulfillFuelSaleDraft((current) => ({
                          ...current,
                          paymentReceivedAmount: value
                        }))
                      }
                      step="0.01"
                      type="number"
                      value={fulfillFuelSaleDraft.paymentReceivedAmount ?? ""}
                    />
                    <DialogTextInput
                      label="Pyt date"
                      onChange={(value) =>
                        setFulfillFuelSaleDraft((current) => ({ ...current, paymentDate: value }))
                      }
                      type="date"
                      value={dateOnly(fulfillFuelSaleDraft.paymentDate ?? "")}
                    />
                    <DialogSelect
                      label="Bank/MoMo"
                      onChange={(value) =>
                        setFulfillFuelSaleDraft((current) => ({
                          ...current,
                          paymentCashbookAccountId: value
                        }))
                      }
                      options={bankMobilePaymentAccountOptions}
                      value={fulfillFuelSaleDraft.paymentCashbookAccountId ?? ""}
                    />
                    <DialogTextInput
                      label="Pyt reference"
                      onChange={(value) =>
                        setFulfillFuelSaleDraft((current) => ({
                          ...current,
                          paymentReference: value
                        }))
                      }
                      value={fulfillFuelSaleDraft.paymentReference ?? ""}
                    />
                    <DialogTextInput
                      label="Truck loaded"
                      onChange={(value) =>
                        setFulfillFuelSaleDraft((current) => ({ ...current, truckLoaded: value }))
                      }
                      value={fulfillFuelSaleDraft.truckLoaded ?? ""}
                    />
                    <DialogTextArea
                      label="Pyt details"
                      onChange={(value) =>
                        setFulfillFuelSaleDraft((current) => ({
                          ...current,
                          paymentDetails: value
                        }))
                      }
                      value={fulfillFuelSaleDraft.paymentDetails ?? ""}
                    />
                    <DialogTextArea
                      label="Notes"
                      onChange={(value) =>
                        setFulfillFuelSaleDraft((current) => ({ ...current, notes: value }))
                      }
                      value={fulfillFuelSaleDraft.notes ?? ""}
                    />
                  </div>
                  <DialogFooter
                    disabled={!fulfillingFuelSale}
                    disabledReason="Select a sales order to fulfill."
                    mutation={mutation}
                    onCancel={() => setFulfillFuelSaleDialogOpen(false)}
                    onSubmit={() => {
                      if (!fulfillingFuelSale) {
                        return;
                      }

                      void submitJson(
                        `/api/fuel-operations/sales/${fulfillingFuelSale.fuelSaleId}/fulfill`,
                        fulfillFuelSaleDraft,
                        () => setFulfillFuelSaleDialogOpen(false)
                      );
                    }}
                    submitLabel="Fulfill order"
                  />
                </ActionDialog>
                </>
              }
              description="Customer fuel sales and sales orders captured from the Item Dynamic source store/location where fuel was received."
              title="Fuel sales"
            >
              <SharedDataGrid
                columns={fuelSaleColumns}
                data={filteredFuelSaleRows}
                emptyLabel="No fuel sales have been recorded."
                exportFileName="flash-erp-fuel-sales"
                globalFilterFn={fuelSaleSearch}
                searchPlaceholder="Search sales, customers, products, payments, or stores"
              />
            </Section>
            ) : null}

            {activeView === "pumps" ? (
            <Section
              actions={
                <ActionDialog
                  onOpenChange={(open) => {
                    setNozzleDialogOpen(open);
                    if (!open) {
                      setNozzleDraft({ meterUomCode: "LTR", status: "ACTIVE" });
                      setMutation(mutationIdle());
                    }
                  }}
                  open={nozzleDialogOpen}
                  title="Fuel nozzle"
                  triggerIcon={Plus}
                  triggerLabel="New nozzle"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <DialogSelect
                      label="Pump"
                      onChange={(value) =>
                        setNozzleDraft((current) => ({ ...current, pumpId: value }))
                      }
                      options={pumpOptions}
                      value={nozzleDraft.pumpId ?? ""}
                    />
                    <DialogSelect
                      label="Tank"
                      onChange={(value) =>
                        setNozzleDraft((current) => ({ ...current, tankId: value }))
                      }
                      options={tankOptions}
                      value={nozzleDraft.tankId ?? ""}
                    />
                    <DialogTextInput
                      label="Nozzle code"
                      onChange={(value) =>
                        setNozzleDraft((current) => ({ ...current, code: value }))
                      }
                      value={nozzleDraft.code ?? ""}
                    />
                    <DialogTextInput
                      label="Nozzle name"
                      onChange={(value) =>
                        setNozzleDraft((current) => ({ ...current, name: value }))
                      }
                      value={nozzleDraft.name ?? ""}
                    />
                    <DialogSelect
                      label="Fuel product (Products)"
                      onChange={(value) =>
                        setNozzleDraft((current) => ({ ...current, productProfileId: value }))
                      }
                      options={productOptions}
                      value={nozzleDraft.productProfileId ?? ""}
                    />
                    <DialogSelect
                      label="Nozzle status"
                      onChange={(value) =>
                        setNozzleDraft((current) => ({ ...current, status: value }))
                      }
                      options={operationalStatusOptions}
                      value={nozzleDraft.status ?? "ACTIVE"}
                    />
                    <DialogTextInput
                      label="Opening meter"
                      min="0"
                      onChange={(value) =>
                        setNozzleDraft((current) => ({ ...current, openingMeterReading: value }))
                      }
                      step="0.001"
                      type="number"
                      value={nozzleDraft.openingMeterReading ?? ""}
                    />
                  </div>
                  <DialogFooter
                    mutation={mutation}
                    onCancel={() => setNozzleDialogOpen(false)}
                    onSubmit={() =>
                      void submitJson("/api/fuel-operations/nozzles", nozzleDraft, () =>
                        setNozzleDialogOpen(false)
                      )
                    }
                    submitLabel="Save nozzle"
                  />
                </ActionDialog>
              }
              description="Nozzle linkage to pumps, tanks, products, and meter readings."
              title="Nozzle management"
            >
              <SharedDataGrid
                columns={nozzleColumns}
                data={filteredNozzleRows}
                emptyLabel="No fuel nozzles are registered."
                exportFileName="flash-erp-fuel-nozzles"
                globalFilterFn={nozzleSearch}
                searchPlaceholder="Search nozzles"
              />
            </Section>
            ) : null}
          </div>
        ) : null}

        {activeView === "dips" || activeView === "meter-readings" ? (
          <div className="space-y-8">
            <Section
              actions={
                <>
                  <ActionDialog
                    onOpenChange={(open) => {
                      setDipDialogOpen(open);
                      if (!open) {
                        setDipDraft({
                          dipDate: workspace.defaultOperationDate,
                          recordedBy: automaticRecordedBy ?? undefined
                        });
                        setMutation(mutationIdle());
                      }
                    }}
                    open={dipDialogOpen}
                    title="Tank dip"
                    triggerIcon={Droplets}
                    triggerLabel="Record dip"
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <DialogSelect
                        label="Tank"
                        onChange={(value) =>
                          setDipDraft((current) => ({ ...current, tankId: value }))
                        }
                        options={tankOptions}
                        value={dipDraft.tankId ?? ""}
                      />
                      <DialogTextInput
                        label="Dip date"
                        onChange={(value) =>
                          setDipDraft((current) => ({ ...current, dipDate: value }))
                        }
                        type="date"
                        value={dateOnly(dipDraft.dipDate ?? workspace.defaultOperationDate)}
                      />
                      <DialogTextInput
                        label="Dip reading"
                        min="0"
                        onChange={(value) =>
                          setDipDraft((current) => ({ ...current, dipQuantity: value }))
                        }
                        step="0.001"
                        type="number"
                        value={dipDraft.dipQuantity ?? ""}
                      />
                      <DialogTextInput
                        label="Water volume"
                        min="0"
                        onChange={(value) =>
                          setDipDraft((current) => ({ ...current, waterQuantity: value }))
                        }
                        step="0.001"
                        type="number"
                        value={dipDraft.waterQuantity ?? ""}
                      />
                      <DialogTextInput
                        label="Reference"
                        onChange={(value) =>
                          setDipDraft((current) => ({ ...current, dipReference: value }))
                        }
                        value={dipDraft.dipReference ?? ""}
                      />
                      {automaticRecordedBy ? (
                        <DialogReadOnlyValue
                          label="Recorded by"
                          value={dipDraft.recordedBy?.trim() || automaticRecordedBy}
                        />
                      ) : (
                        <DialogSelect
                          label="Recorded by"
                          onChange={(value) =>
                            setDipDraft((current) => ({ ...current, recordedBy: value }))
                          }
                          options={userOptions}
                          value={dipDraft.recordedBy ?? ""}
                        />
                      )}
                      <EvidenceUploadField
                        evidenceKind="tank-dip"
                        fileName={dipDraft.evidenceFileName}
                        label="Tank dip photo evidence"
                        onClear={() =>
                          setDipDraft((current) => ({
                            ...current,
                            evidenceCapturedAt: null,
                            evidenceFileName: null,
                            evidenceImageUrl: null
                          }))
                        }
                        onUploaded={(payload) =>
                          setDipDraft((current) => ({
                            ...current,
                            evidenceCapturedAt: payload.capturedAt ?? null,
                            evidenceFileName: payload.fileName ?? null,
                            evidenceImageUrl: payload.url
                          }))
                        }
                        value={dipDraft.evidenceImageUrl}
                      />
                    </div>
                    <DialogFooter
                      disabled={!dipDraft.evidenceImageUrl}
                      disabledReason="Upload tank dip photo evidence before saving."
                      mutation={mutation}
                      onCancel={() => setDipDialogOpen(false)}
                      onSubmit={() =>
                        void submitJson(
                          "/api/fuel-operations/dips",
                          applyAutomaticRecordedBy(dipDraft),
                          () => setDipDialogOpen(false)
                        )
                      }
                      submitLabel="Record dip"
                    />
                  </ActionDialog>
                  <ActionDialog
                    onOpenChange={(open) => {
                      setMeterDialogOpen(open);
                      if (!open) {
                        setMeterDraft({
                          readingDate: workspace.defaultOperationDate,
                          recordedBy: automaticRecordedBy ?? undefined
                        });
                        setMutation(mutationIdle());
                      }
                    }}
                    open={meterDialogOpen}
                    title="Meter reading"
                    triggerIcon={Gauge}
                    triggerLabel="Meter reading"
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <DialogSelect
                        label="Nozzle"
                        onChange={(value) =>
                          setMeterDraft((current) => ({ ...current, nozzleId: value }))
                        }
                        options={nozzleOptions}
                        value={meterDraft.nozzleId ?? ""}
                      />
                      <DialogTextInput
                        label="Reading date"
                        onChange={(value) =>
                          setMeterDraft((current) => ({ ...current, readingDate: value }))
                        }
                        type="date"
                        value={dateOnly(meterDraft.readingDate ?? workspace.defaultOperationDate)}
                      />
                      <DialogTextInput
                        label="Opening meter"
                        min="0"
                        onChange={(value) =>
                          setMeterDraft((current) => ({ ...current, openingMeterReading: value }))
                        }
                        step="0.001"
                        type="number"
                        value={meterDraft.openingMeterReading ?? ""}
                      />
                      <DialogTextInput
                        label="Closing meter"
                        min="0"
                        onChange={(value) =>
                          setMeterDraft((current) => ({ ...current, closingMeterReading: value }))
                        }
                        step="0.001"
                        type="number"
                        value={meterDraft.closingMeterReading ?? ""}
                      />
                      <DialogTextInput
                        label="Unit selling price"
                        min="0"
                        onChange={(value) =>
                          setMeterDraft((current) => ({ ...current, unitSellingPrice: value }))
                        }
                        step="0.0001"
                        type="number"
                        value={meterDraft.unitSellingPrice ?? ""}
                      />
                      <DialogTextInput
                        label="Shift reference"
                        onChange={(value) =>
                          setMeterDraft((current) => ({ ...current, shiftReference: value }))
                        }
                        value={meterDraft.shiftReference ?? ""}
                      />
                      <EvidenceUploadField
                        evidenceKind="meter-reading"
                        fileName={meterDraft.evidenceFileName}
                        label="Meter reading photo evidence"
                        onClear={() =>
                          setMeterDraft((current) => ({
                            ...current,
                            evidenceCapturedAt: null,
                            evidenceFileName: null,
                            evidenceImageUrl: null
                          }))
                        }
                        onUploaded={(payload) =>
                          setMeterDraft((current) => ({
                            ...current,
                            evidenceCapturedAt: payload.capturedAt ?? null,
                            evidenceFileName: payload.fileName ?? null,
                            evidenceImageUrl: payload.url
                          }))
                        }
                        value={meterDraft.evidenceImageUrl}
                      />
                    </div>
                    <DialogFooter
                      disabled={!meterDraft.evidenceImageUrl}
                      disabledReason="Upload meter reading photo evidence before saving."
                      mutation={mutation}
                      onCancel={() => setMeterDialogOpen(false)}
                      onSubmit={() =>
                        void submitJson(
                          "/api/fuel-operations/meter-readings",
                          applyAutomaticRecordedBy(meterDraft),
                          () => setMeterDialogOpen(false)
                        )
                      }
                      submitLabel="Record reading"
                    />
                  </ActionDialog>
                </>
              }
              description="Physical tank dips and nozzle meter activity."
              id={activeView}
              title={activeView === "dips" ? "Tank dips" : "Meter readings"}
            >
              <div className="space-y-6">
                {activeView === "dips" ? (
                <SharedDataGrid
                  columns={dipColumns}
                  data={filteredDipRows}
                  emptyLabel="No tank dips have been recorded."
                  exportFileName="flash-erp-fuel-dips"
                  globalFilterFn={dipSearch}
                  searchPlaceholder="Search dips"
                />
                ) : null}
                {activeView === "meter-readings" ? (
                <SharedDataGrid
                  columns={meterColumns}
                  data={filteredMeterReadingRows}
                  emptyLabel="No meter readings have been recorded."
                  exportFileName="flash-erp-fuel-meter-readings"
                  globalFilterFn={meterReadingSearch}
                  searchPlaceholder="Search readings"
                />
                ) : null}
              </div>
            </Section>
          </div>
        ) : null}

        {activeView === "stations" ||
        activeView === "station-deliveries" ||
        activeView === "supplier-receipts" ? (
          <div className="space-y-8">
            {activeView === "stations" ? (
            <Section
              actions={
                <ActionDialog
                  onOpenChange={(open) => {
                    setStationDialogOpen(open);
                    if (open) {
                      setStationDraft((current) =>
                        current.stationId
                          ? current
                          : {
                              ...current,
                              storeId: current.storeId ?? workspace.storeOptions[0]?.storeId ?? "",
                              inventoryLocationId:
                                current.inventoryLocationId ??
                                workspace.storeOptions[0]?.defaultInventoryLocationId ??
                                ""
                            }
                      );
                    }
                    if (!open) {
                      setStationDraft({
                        stationType: "CUSTOMER",
                        status: "ACTIVE",
                        storeId: workspace.storeOptions[0]?.storeId ?? "",
                        inventoryLocationId:
                          workspace.storeOptions[0]?.defaultInventoryLocationId ?? ""
                      });
                      setMutation(mutationIdle());
                    }
                  }}
                  open={stationDialogOpen}
                  title="Filling station"
                  triggerIcon={Store}
                  triggerLabel="New station"
                  widthClassName="max-w-5xl"
                >
                  <div className="grid gap-4 md:grid-cols-3">
                    <DialogTextInput
                      label="Station code"
                      onChange={(value) =>
                        setStationDraft((current) => ({ ...current, stationCode: value }))
                      }
                      value={stationDraft.stationCode ?? ""}
                    />
                    <DialogTextInput
                      label="Station name"
                      onChange={(value) =>
                        setStationDraft((current) => ({ ...current, stationName: value }))
                      }
                      value={stationDraft.stationName ?? ""}
                    />
                    <DialogSelect
                      label="Station type"
                      onChange={(value) =>
                        setStationDraft((current) => ({
                          ...current,
                          stationType: value,
                          operatingSiteId: value === "OWNED" ? current.operatingSiteId : null
                        }))
                      }
                      options={stationTypeOptions}
                      value={stationDraft.stationType ?? "CUSTOMER"}
                    />
                    <DialogSelect
                      label="Linked shop"
                      onChange={(value) => {
                        const nextStore =
                          workspace.storeOptions.find((store) => store.storeId === value) ?? null;

                        setStationDraft((current) => ({
                          ...current,
                          storeId: value,
                          inventoryLocationId: nextStore?.defaultInventoryLocationId ?? ""
                        }));
                      }}
                      options={storeOptions}
                      value={stationDraft.storeId ?? ""}
                    />
                    <DialogSelect
                      label="Receiving location"
                      onChange={(value) =>
                        setStationDraft((current) => ({
                          ...current,
                          inventoryLocationId: value
                        }))
                      }
                      options={selectedStationStoreLocationOptions}
                      value={stationDraft.inventoryLocationId ?? ""}
                    />
                    {stationDraft.stationType === "OWNED" ? (
                      <DialogSelect
                        label="Owned operating site"
                        onChange={(value) =>
                          setStationDraft((current) => ({ ...current, operatingSiteId: value }))
                        }
                        options={siteOptions}
                        value={stationDraft.operatingSiteId ?? ""}
                      />
                    ) : null}
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm md:col-span-3">
                      <p className="font-semibold text-stone-900">Station destination and shop costing</p>
                      <div className="mt-2 grid gap-2 text-stone-600 sm:grid-cols-3">
                        <span>
                          Shop: {selectedStationStore?.label ?? "No shop selected"}
                        </span>
                        <span>
                          Receiving:{" "}
                          {selectedStationStoreLocationOptions.find(
                            (location) => location.value === stationDraft.inventoryLocationId
                          )?.label ?? "No location selected"}
                        </span>
                        <span>Finance: shop P&amp;L uses the linked shop cost center</span>
                      </div>
                    </div>
                    <DialogTextInput
                      label="Contact name"
                      onChange={(value) =>
                        setStationDraft((current) => ({ ...current, contactName: value }))
                      }
                      value={stationDraft.contactName ?? ""}
                    />
                    <DialogTextInput
                      label="Phone"
                      onChange={(value) =>
                        setStationDraft((current) => ({ ...current, phone: value }))
                      }
                      value={stationDraft.phone ?? ""}
                    />
                    <DialogTextInput
                      label="Location"
                      onChange={(value) =>
                        setStationDraft((current) => ({ ...current, location: value }))
                      }
                      value={stationDraft.location ?? ""}
                    />
                    <DialogTextInput
                      label="City"
                      onChange={(value) =>
                        setStationDraft((current) => ({ ...current, city: value }))
                      }
                      value={stationDraft.city ?? ""}
                    />
                    <DialogTextInput
                      label="GPS latitude"
                      onChange={(value) =>
                        setStationDraft((current) => ({ ...current, gpsLatitude: value }))
                      }
                      step="0.0000001"
                      type="number"
                      value={stationDraft.gpsLatitude ?? ""}
                    />
                    <DialogTextInput
                      label="GPS longitude"
                      onChange={(value) =>
                        setStationDraft((current) => ({ ...current, gpsLongitude: value }))
                      }
                      step="0.0000001"
                      type="number"
                      value={stationDraft.gpsLongitude ?? ""}
                    />
                    <DialogSelect
                      label="Station status"
                      onChange={(value) =>
                        setStationDraft((current) => ({ ...current, status: value }))
                      }
                      options={operationalStatusOptions}
                      value={stationDraft.status ?? "ACTIVE"}
                    />
                    <DialogTextArea
                      label="Notes"
                      onChange={(value) =>
                        setStationDraft((current) => ({ ...current, notes: value }))
                      }
                      value={stationDraft.notes ?? ""}
                    />
                  </div>
                  <DialogFooter
                    mutation={mutation}
                    onCancel={() => setStationDialogOpen(false)}
                    onSubmit={() =>
                      void submitJson(
                        "/api/fuel-operations/stations",
                        { ...stationDraft, customerId: null },
                        () => setStationDialogOpen(false)
                      )
                    }
                    submitLabel="Save station"
                  />
                </ActionDialog>
              }
              description="Filling-station destinations for fuel transfers, linked to shop inventory locations and Finance shop cost centers."
              id="deliveries"
              title="Filling stations"
            >
              <SharedDataGrid
                columns={stationColumns}
                data={filteredStationRows}
                emptyLabel="No filling stations have been registered."
                exportFileName="flash-erp-fuel-stations"
                globalFilterFn={stationSearch}
                searchPlaceholder="Search stations, shops, or sites"
              />
            </Section>
            ) : null}

            {activeView === "station-deliveries" ? (
            <Section
              actions={
                <>
                <ActionDialog
                  onOpenChange={(open) => {
                    setStationDeliveryDialogOpen(open);
                    if (!open) {
                      setStationDeliveryDraft({
                        deliveryDate: workspace.defaultOperationDate,
                        sourceOperatingSiteId: defaultDispatchSiteId,
                        currencyCode: functionalCurrencyCode,
                        lines: [{}]
                      });
                      setMutation(mutationIdle());
                    }
                  }}
                  open={stationDeliveryDialogOpen}
                  title="Fuel transfer out"
                  triggerIcon={PackagePlus}
                  triggerLabel="New transfer out"
                  widthClassName="max-w-5xl"
                >
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-emerald-50 p-4 shadow-sm">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                            Transfer out
                          </p>
                          <p className="mt-1 truncate text-lg font-semibold text-stone-950">
                            {stationDeliveryStationLabel}
                          </p>
                          <p className="mt-1 truncate text-sm text-stone-600">
                            {stationDeliverySiteLabel}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                            Issue quantity
                          </p>
                          <p className="mt-1 text-sm font-semibold text-stone-900">
                            {numberFormatter.format(stationTransferIssueQuantity)}{" "}
                            {selectedStationDeliveryTank?.uomCode ?? ""}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                            Destination
                          </p>
                          <p className="mt-1 text-sm font-semibold text-stone-900">
                            {stationById.get(stationDeliveryDraft.stationId ?? "")?.storeCode ?? "Shop"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-emerald-200 bg-emerald-600 px-3 py-2 text-white">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50">
                            Receipt
                          </p>
                          <p className="mt-1 text-lg font-semibold">
                            Pending
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                      <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-3">
                        <p className="text-sm font-semibold text-sky-950">Dispatch header</p>
                        <div className="grid gap-3 md:grid-cols-2">
                          <DialogSelect
                            label="Filling station"
                            onChange={(value) =>
                              setStationDeliveryDraft((current) => ({
                                ...current,
                                stationId: value
                              }))
                            }
                            options={transferStationOptions}
                            value={stationDeliveryDraft.stationId ?? ""}
                          />
                          <DialogSelect
                            label="Dispatch site"
                            onChange={(value) =>
                              setStationDeliveryDraft((current) => ({
                                ...current,
                                sourceOperatingSiteId: value,
                                lines: [
                                  {
                                    ...(current.lines?.[0] ?? {}),
                                    sourceTankId: ""
                                  }
                                ]
                              }))
                            }
                            options={siteOptions}
                            value={stationDeliveryDraft.sourceOperatingSiteId ?? ""}
                          />
                          <DialogTextInput
                            label="Delivery date"
                            onChange={(value) =>
                              setStationDeliveryDraft((current) => ({
                                ...current,
                                deliveryDate: value
                              }))
                            }
                            type="date"
                            value={dateOnly(
                              stationDeliveryDraft.deliveryDate ?? workspace.defaultOperationDate
                            )}
                          />
                          <DialogTextInput
                            label="Due date"
                            onChange={(value) =>
                              setStationDeliveryDraft((current) => ({ ...current, dueDate: value }))
                            }
                            type="date"
                            value={dateOnly(stationDeliveryDraft.dueDate ?? "")}
                          />
                          <DialogSelect
                            label="Currency"
                            onChange={(value) =>
                              setStationDeliveryDraft((current) => ({
                                ...current,
                                currencyCode: value
                              }))
                            }
                            options={currencyOptions}
                            value={stationDeliveryDraft.currencyCode ?? functionalCurrencyCode}
                          />
                          <DialogTextInput
                            label="Customer reference"
                            onChange={(value) =>
                              setStationDeliveryDraft((current) => ({
                                ...current,
                                customerReference: value
                              }))
                            }
                            value={stationDeliveryDraft.customerReference ?? ""}
                          />
                        </div>
                      </div>

                      <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-3">
                        <p className="text-sm font-semibold text-stone-950">Logistics</p>
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
                          <DialogTextInput
                            label="Delivery note no."
                            onChange={(value) =>
                              setStationDeliveryDraft((current) => ({
                                ...current,
                                deliveryNoteNo: value
                              }))
                            }
                            value={stationDeliveryDraft.deliveryNoteNo ?? ""}
                          />
                          <DialogTextInput
                            label="Vehicle registration"
                            onChange={(value) =>
                              setStationDeliveryDraft((current) => ({
                                ...current,
                                vehicleRegistrationNo: value
                              }))
                            }
                            value={stationDeliveryDraft.vehicleRegistrationNo ?? ""}
                          />
                          <DialogTextInput
                            label="Driver"
                            onChange={(value) =>
                              setStationDeliveryDraft((current) => ({
                                ...current,
                                driverName: value
                              }))
                            }
                            value={stationDeliveryDraft.driverName ?? ""}
                          />
                          <DialogTextInput
                            label="Driver contact"
                            onChange={(value) =>
                              setStationDeliveryDraft((current) => ({
                                ...current,
                                driverContact: value
                              }))
                            }
                            value={stationDeliveryDraft.driverContact ?? ""}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
                      <p className="text-sm font-semibold text-emerald-950">Fuel movement</p>
                      <div className="grid gap-3 md:grid-cols-3">
                        <DialogSelect
                          label="Source tank"
                          onChange={(value) => {
                            setStationDeliveryDraft((current) => ({
                              ...current,
                              lines: [{ ...(current.lines?.[0] ?? {}), sourceTankId: value }]
                            }));
                          }}
                          options={stationDeliveryTankOptions}
                          value={stationDeliveryLine.sourceTankId ?? ""}
                        />
                        <DialogReadOnlyValue
                          label="UOM"
                          value={selectedStationDeliveryTank?.uomCode ?? "Select tank"}
                        />
                        <DialogReadOnlyValue
                          label="Cost method"
                          value="Weighted average from source stock"
                        />
                        <DialogTextInput
                          label="Ordered quantity"
                          min="0"
                          onChange={(value) =>
                            setStationDeliveryDraft((current) => ({
                              ...current,
                              lines: [{ ...stationDeliveryLine, orderedQuantity: value }]
                            }))
                          }
                          step="0.001"
                          type="number"
                          value={stationDeliveryLine.orderedQuantity ?? ""}
                        />
                        <DialogTextInput
                          label="Issue quantity"
                          min="0"
                          onChange={(value) =>
                            setStationDeliveryDraft((current) => ({
                              ...current,
                              lines: [{ ...stationDeliveryLine, loadedQuantity: value }]
                            }))
                          }
                          step="0.001"
                          type="number"
                          value={stationDeliveryLine.loadedQuantity ?? ""}
                        />
                        <DialogReadOnlyValue
                          label="Transfer amount"
                          value="Inventory transfer - no customer sale"
                        />
                        <DialogReadOnlyValue
                          label="Destination receipt"
                          value="Pending online-store receive"
                        />
                      </div>
                    </div>
                    <DialogTextArea
                      label="Notes"
                      onChange={(value) =>
                        setStationDeliveryDraft((current) => ({ ...current, notes: value }))
                      }
                      value={stationDeliveryDraft.notes ?? ""}
                    />
                  </div>
                  <DialogFooter
                    mutation={mutation}
                    onCancel={() => setStationDeliveryDialogOpen(false)}
                    onSubmit={submitStationDelivery}
                    submitLabel="Issue transfer"
                  />
                </ActionDialog>
                <ActionDialog
                  hideTrigger
                  onOpenChange={(open) => {
                    if (!open) {
                      setViewingStationDelivery(null);
                    }
                  }}
                  open={Boolean(viewingStationDelivery)}
                  title="Fuel transfer detail"
                  triggerLabel="View fuel transfer"
                  widthClassName="max-w-5xl"
                >
                  {viewingStationDelivery ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <DialogReadOnlyValue label="Dispatch no." value={viewingStationDelivery.deliveryNo} />
                        <DialogReadOnlyValue label="Station" value={viewingStationDelivery.stationName} />
                        <DialogReadOnlyValue label="Destination shop" value={viewingStationDelivery.destinationStoreName ?? "Not set"} />
                        <DialogReadOnlyValue label="Destination location" value={viewingStationDelivery.destinationLocationCode ?? "Not set"} />
                        <DialogReadOnlyValue label="Source store" value={viewingStationDelivery.sourceSiteCode ?? "Not set"} />
                        <DialogReadOnlyValue label="Issued" value={`${numberFormatter.format(viewingStationDelivery.totalLoadedQuantity)} ${viewingStationDelivery.uomSummary}`} />
                        <DialogReadOnlyValue label="Received" value={`${numberFormatter.format(viewingStationDelivery.totalDeliveredQuantity)} ${viewingStationDelivery.uomSummary}`} />
                        <DialogReadOnlyValue label="In transit" value={`${numberFormatter.format(Math.max(0, viewingStationDelivery.totalLoadedQuantity - viewingStationDelivery.totalDeliveredQuantity))} ${viewingStationDelivery.uomSummary}`} />
                        <DialogReadOnlyValue label="Vehicle" value={viewingStationDelivery.vehicleRegistrationNo ?? "Not set"} />
                        <DialogReadOnlyValue label="Driver" value={viewingStationDelivery.driverName ?? "Not set"} />
                        <DialogReadOnlyValue label="Driver contact" value={viewingStationDelivery.driverContact ?? "Not set"} />
                        <DialogReadOnlyValue label="Feedback status" value={formatEnumLabel(viewingStationDelivery.feedbackStatus)} />
                        <DialogReadOnlyValue label="Valuation status" value={formatEnumLabel(viewingStationDelivery.valuationStatus)} />
                        <DialogReadOnlyValue
                          label="Issued value"
                          value={moneyFormatter.format(viewingStationDelivery.issuedValuationAmount ?? viewingStationDelivery.totalCostAmount)}
                        />
                        <DialogReadOnlyValue
                          label="Received value"
                          value={
                            viewingStationDelivery.receivedValuationAmount === null
                              ? "Pending"
                              : moneyFormatter.format(viewingStationDelivery.receivedValuationAmount)
                          }
                        />
                        <DialogReadOnlyValue
                          label="Variance value"
                          value={
                            viewingStationDelivery.varianceValuationAmount === null
                              ? "Pending"
                              : moneyFormatter.format(viewingStationDelivery.varianceValuationAmount)
                          }
                        />
                      </div>
                      <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
                        <p className="text-sm font-semibold text-sky-950">Feedback</p>
                        <div className="mt-3 grid gap-3 md:grid-cols-4">
                          <DialogSelect
                            label="Water test"
                            onChange={(value) =>
                              setFuelTransferFeedbackDraft((current) => ({
                                ...current,
                                waterTestResult: value
                              }))
                            }
                            options={waterTestOptions}
                            value={fuelTransferFeedbackDraft.waterTestResult ?? ""}
                          />
                          <DialogTextInput
                            label="Qty before delivery"
                            min="0"
                            onChange={(value) =>
                              setFuelTransferFeedbackDraft((current) => ({
                                ...current,
                                quantityBeforeDelivery: value
                              }))
                            }
                            step="0.001"
                            type="number"
                            value={fuelTransferFeedbackDraft.quantityBeforeDelivery ?? ""}
                          />
                          <DialogTextInput
                            label="Expected qty received"
                            min="0"
                            onChange={(value) =>
                              setFuelTransferFeedbackDraft((current) => ({
                                ...current,
                                expectedQuantityReceived: value
                              }))
                            }
                            step="0.001"
                            type="number"
                            value={fuelTransferFeedbackDraft.expectedQuantityReceived ?? ""}
                          />
                          <DialogTextInput
                            label="Expected stock"
                            min="0"
                            onChange={(value) =>
                              setFuelTransferFeedbackDraft((current) => ({
                                ...current,
                                expectedStockQuantity: value
                              }))
                            }
                            step="0.001"
                            type="number"
                            value={fuelTransferFeedbackDraft.expectedStockQuantity ?? ""}
                          />
                          <DialogTextInput
                            label="Qty after delivery"
                            min="0"
                            onChange={(value) =>
                              setFuelTransferFeedbackDraft((current) => ({
                                ...current,
                                quantityAfterDelivery: value
                              }))
                            }
                            step="0.001"
                            type="number"
                            value={fuelTransferFeedbackDraft.quantityAfterDelivery ?? ""}
                          />
                          <DialogTextInput
                            label="Actual qty received"
                            min="0"
                            onChange={(value) =>
                              setFuelTransferFeedbackDraft((current) => ({
                                ...current,
                                actualQuantityReceived: value
                              }))
                            }
                            step="0.001"
                            type="number"
                            value={fuelTransferFeedbackDraft.actualQuantityReceived ?? ""}
                          />
                          <DialogReadOnlyValue
                            label="Variance"
                            value={numberFormatter.format(fuelTransferFeedbackVariance)}
                          />
                          <DialogReadOnlyValue label="Confirmed" value={formatDateTime(viewingStationDelivery.feedbackConfirmedAt)} />
                        </div>
                        <div className="mt-3">
                          <DialogTextArea
                            label="Feedback note"
                            onChange={(value) =>
                              setFuelTransferFeedbackDraft((current) => ({
                                ...current,
                                feedbackNote: value
                              }))
                            }
                            value={fuelTransferFeedbackDraft.feedbackNote ?? ""}
                          />
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-sky-200 pt-3">
                          <p className={`text-sm ${mutation.status === "error" ? "text-rose-700" : mutation.status === "success" ? "text-emerald-700" : "text-sky-800"}`}>
                            {mutation.message || "Save feedback first, confirm when reviewed, then post when the cycle is complete."}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-900 transition hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={mutation.status === "submitting"}
                              onClick={() => void submitFuelTransferFeedback("SAVE")}
                              type="button"
                            >
                              Save feedback
                            </button>
                            <button
                              className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={mutation.status === "submitting"}
                              onClick={() => void submitFuelTransferFeedback("CONFIRM")}
                              type="button"
                            >
                              Confirm
                            </button>
                            <button
                              className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={mutation.status === "submitting"}
                              onClick={() => void submitFuelTransferFeedback("POST")}
                              type="button"
                            >
                              Post
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                        <div className="grid gap-3 border-b border-stone-100 bg-stone-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 md:grid-cols-[minmax(0,1fr)_6rem_6rem_8rem_8rem]">
                          <span>Product</span>
                          <span>Issued</span>
                          <span>UOM</span>
                          <span>Received</span>
                          <span>Cost</span>
                        </div>
                        {viewingStationDelivery.lines.map((line) => (
                          <div
                            className="grid gap-3 border-b border-stone-100 px-3 py-2 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_6rem_6rem_8rem_8rem]"
                            key={line.lineId}
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-stone-900">{line.productCode ?? "Fuel"}</span>
                              <span className="block truncate text-xs text-stone-500">{line.productName ?? ""}</span>
                            </span>
                            <span>{numberFormatter.format(line.loadedQuantity)}</span>
                            <span>{line.uomCode}</span>
                            <span>{numberFormatter.format(line.deliveredQuantity)}</span>
                            <span>{moneyFormatter.format(line.costAmount)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
                        <button
                          className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400"
                          onClick={() => setViewingStationDelivery(null)}
                          type="button"
                        >
                          <Eye className="h-4 w-4" />
                          Close
                        </button>
                        <button
                          className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)]"
                          onClick={() => printStationDelivery(viewingStationDelivery)}
                          type="button"
                        >
                          <Printer className="h-4 w-4" />
                          Reprint
                        </button>
                      </div>
                    </div>
                  ) : null}
                </ActionDialog>
                </>
              }
              description="Fuel transfer-outs issued from HQ/source stock to filling-station shops, ready for online-store receipt and feedback."
              title="Fuel transfer-outs"
            >
              <SharedDataGrid
                columns={stationDeliveryColumns}
                data={filteredStationDeliveryRows}
                emptyLabel="No fuel transfer-outs have been recorded."
                exportFileName="flash-erp-fuel-station-deliveries"
                globalFilterFn={stationDeliverySearch}
                searchPlaceholder="Search transfer-outs, stations, shops, vehicles, or waybills"
              />
            </Section>
            ) : null}

            {activeView === "supplier-receipts" ? (
            <Section
              actions={
                <ActionDialog
                  onOpenChange={(open) => {
                    setDeliveryDialogOpen(open);
                    if (!open) {
                      setDeliveryDraft({
                        deliveryDate: workspace.defaultOperationDate,
                        currencyCode: functionalCurrencyCode,
                        lines: [{}]
                      });
                      setMutation(mutationIdle());
                    }
                  }}
                  open={deliveryDialogOpen}
                  title="Supplier fuel receipt"
                  triggerIcon={PackagePlus}
                  triggerLabel="New receipt"
                  widthClassName="max-w-5xl"
                >
                  <div className="grid gap-4 md:grid-cols-3">
                    <DialogSelect
                      label="Receiving site"
                      onChange={(value) =>
                        setDeliveryDraft((current) => ({
                          ...current,
                          operatingSiteId: value,
                          lines: [{ ...(current.lines?.[0] ?? {}), tankId: "" }]
                        }))
                      }
                      options={siteOptions}
                      value={deliveryDraft.operatingSiteId ?? ""}
                    />
                    <DialogTextInput
                      label="Receipt date"
                      onChange={(value) =>
                        setDeliveryDraft((current) => ({ ...current, deliveryDate: value }))
                      }
                      type="date"
                      value={dateOnly(deliveryDraft.deliveryDate ?? workspace.defaultOperationDate)}
                    />
                    <DialogSelect
                      label="Currency"
                      onChange={(value) =>
                        setDeliveryDraft((current) => ({ ...current, currencyCode: value }))
                      }
                      options={currencyOptions}
                      value={deliveryDraft.currencyCode ?? functionalCurrencyCode}
                    />
                    <DialogTextInput
                      label="Supplier"
                      onChange={(value) =>
                        setDeliveryDraft((current) => ({ ...current, supplierName: value }))
                      }
                      value={deliveryDraft.supplierName ?? ""}
                    />
                    <DialogTextInput
                      label="Supplier doc no."
                      onChange={(value) =>
                        setDeliveryDraft((current) => ({ ...current, supplierDocumentNo: value }))
                      }
                      value={deliveryDraft.supplierDocumentNo ?? ""}
                    />
                    <DialogTextInput
                      label="Vehicle registration"
                      onChange={(value) =>
                        setDeliveryDraft((current) => ({ ...current, vehicleRegistrationNo: value }))
                      }
                      value={deliveryDraft.vehicleRegistrationNo ?? ""}
                    />
                    <DialogSelect
                      label="Tank"
                      onChange={(value) =>
                        setDeliveryDraft((current) => ({
                          ...current,
                          lines: [{ ...deliveryLine, tankId: value }]
                        }))
                      }
                      options={supplierReceiptTankOptions}
                      value={deliveryLine.tankId ?? ""}
                    />
                    <DialogReadOnlyValue
                      label="UOM"
                      value={selectedSupplierReceiptTank?.uomCode ?? "Select tank"}
                    />
                    <DialogTextInput
                      label="Ordered quantity"
                      min="0"
                      onChange={(value) =>
                        setDeliveryDraft((current) => ({
                          ...current,
                          lines: [{ ...deliveryLine, orderedQuantity: value }]
                        }))
                      }
                      step="0.001"
                      type="number"
                      value={deliveryLine.orderedQuantity ?? ""}
                    />
                    <DialogTextInput
                      label="Received quantity"
                      min="0"
                      onChange={(value) =>
                        setDeliveryDraft((current) => ({
                          ...current,
                          lines: [{ ...deliveryLine, deliveredQuantity: value }]
                        }))
                      }
                      step="0.001"
                      type="number"
                      value={deliveryLine.deliveredQuantity ?? ""}
                    />
                    <DialogTextInput
                      label="Accepted quantity"
                      min="0"
                      onChange={(value) =>
                        setDeliveryDraft((current) => ({
                          ...current,
                          lines: [{ ...deliveryLine, acceptedQuantity: value }]
                        }))
                      }
                      step="0.001"
                      type="number"
                      value={deliveryLine.acceptedQuantity ?? ""}
                    />
                    <DialogTextInput
                      label="Unit cost"
                      min="0"
                      onChange={(value) =>
                        setDeliveryDraft((current) => ({
                          ...current,
                          lines: [{ ...deliveryLine, unitCost: value }]
                        }))
                      }
                      step="0.0001"
                      type="number"
                      value={deliveryLine.unitCost ?? ""}
                    />
                    <DialogTextArea
                      label="Notes"
                      onChange={(value) =>
                        setDeliveryDraft((current) => ({ ...current, notes: value }))
                      }
                      value={deliveryDraft.notes ?? ""}
                    />
                  </div>
                  <DialogFooter
                    mutation={mutation}
                    onCancel={() => setDeliveryDialogOpen(false)}
                    onSubmit={() =>
                      void submitJson("/api/fuel-operations/deliveries", deliveryDraft, () =>
                        setDeliveryDialogOpen(false)
                      )
                    }
                    submitLabel="Record receipt"
                  />
                </ActionDialog>
              }
              description="Inbound supplier receipts into tanks. Purchase-order and goods-receipt workflows remain in Procurement."
              title="Supplier fuel receipts"
            >
              <SharedDataGrid
                columns={deliveryColumns}
                data={filteredDeliveryRows}
                emptyLabel="No supplier fuel receipts have been recorded."
                exportFileName="flash-erp-fuel-supplier-receipts"
                globalFilterFn={deliverySearch}
                searchPlaceholder="Search supplier receipts"
              />
            </Section>
            ) : null}
          </div>
        ) : null}

        {activeView === "reconciliation" ? (
          <div className="space-y-8">
            <Section
              actions={
                <ActionDialog
                  onOpenChange={(open) => {
                    setReconciliationDialogOpen(open);
                    if (!open) {
                      setReconciliationDraft({
                        reconciliationDate: workspace.defaultOperationDate
                      });
                      setMutation(mutationIdle());
                    }
                  }}
                  open={reconciliationDialogOpen}
                  title="Daily reconciliation"
                  triggerIcon={Scale}
                  triggerLabel="Reconcile day"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <DialogSelect
                      label="Operating site"
                      onChange={(value) =>
                        setReconciliationDraft((current) => ({
                          ...current,
                          operatingSiteId: value
                        }))
                      }
                      options={siteOptions}
                      value={reconciliationDraft.operatingSiteId ?? ""}
                    />
                    <DialogTextInput
                      label="Reconciliation date"
                      onChange={(value) =>
                        setReconciliationDraft((current) => ({
                          ...current,
                          reconciliationDate: value
                        }))
                      }
                      type="date"
                      value={dateOnly(
                        reconciliationDraft.reconciliationDate ?? workspace.defaultOperationDate
                      )}
                    />
                  </div>
                  <DialogFooter
                    mutation={mutation}
                    onCancel={() => setReconciliationDialogOpen(false)}
                    onSubmit={() =>
                      void submitJson(
                        "/api/fuel-operations/reconciliations",
                        reconciliationDraft,
                        () => setReconciliationDialogOpen(false)
                      )
                    }
                    submitLabel="Reconcile"
                  />
                </ActionDialog>
              }
              description="Daily tank movement, gain/loss, and margin calculation."
              id="reconciliation"
              title="Daily fuel reconciliation"
            >
              <SharedDataGrid
                columns={reconciliationColumns}
                data={filteredReconciliationRows}
                emptyLabel="No fuel reconciliations have been posted."
                exportFileName="flash-erp-fuel-reconciliations"
                globalFilterFn={reconciliationSearch}
                searchPlaceholder="Search reconciliations"
              />
            </Section>
            <Section
              description="Tank-level loss/gain and margin detail from posted reconciliations."
              title="Reconciliation lines"
            >
              <SharedDataGrid
                columns={reconciliationLineColumns}
                data={filteredReconciliationLineRows}
                emptyLabel="No reconciliation lines are available."
                exportFileName="flash-erp-fuel-reconciliation-lines"
                searchPlaceholder="Search reconciliation lines"
              />
            </Section>
          </div>
        ) : null}
      </div>
  );

  if (embedInShell) {
    return content;
  }

  return (
    <EnterpriseShell
      activeSection={shellActiveSection}
      description={
        pageDescription ??
        "Tank, pump, nozzle, dipping, delivery, variance, and daily fuel reconciliation controls."
      }
      eyebrow={shellEyebrow}
      heading={pageHeading ?? "Fuel Operations"}
    >
      {content}
    </EnterpriseShell>
  );
}
