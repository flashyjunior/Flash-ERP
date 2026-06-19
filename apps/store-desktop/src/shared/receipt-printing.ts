import type {
  StorePrintableAccountPaymentReceiptDocument,
  StorePrintableGoodsReceiptDocument,
  StorePrintableReceiptDocument,
  StoreReceiptPrintLine,
  StoreReceiptPrintPayment
} from "./desktop-runtime.js";

type DocumentTemplateTokenValue =
  | string
  | number
  | null
  | undefined
  | {
      rawHtml: string;
    };

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlWithBreaks(value: string | null | undefined) {
  return escapeHtml(value ?? "").replace(/\r?\n/g, "<br />");
}

function documentTemplateRawHtml(rawHtml: string): DocumentTemplateTokenValue {
  return { rawHtml };
}

function formatTemplateTokenValue(value: DocumentTemplateTokenValue) {
  if (value && typeof value === "object" && "rawHtml" in value) {
    return value.rawHtml;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return escapeHtmlWithBreaks(value);
}

function removeEmptyTaxRows(renderedHtml: string, tokens: Record<string, DocumentTemplateTokenValue>) {
  if (!Object.prototype.hasOwnProperty.call(tokens, "TAX")) {
    return renderedHtml;
  }

  const taxValue = formatTemplateTokenValue(tokens.TAX).replace(/<[^>]*>/g, "").trim();

  if (taxValue) {
    return renderedHtml;
  }

  return renderedHtml.replace(
    /<tr>\s*<t[dh][^>]*>\s*Tax\s*<\/t[dh]>\s*<t[dh][^>]*>\s*<\/t[dh]>\s*<\/tr>/gi,
    ""
  );
}

function renderDocumentTemplateHtml(
  templateHtml: string,
  tokens: Record<string, DocumentTemplateTokenValue>
) {
  const normalizedTokens = Object.fromEntries(
    Object.entries(tokens).map(([key, value]) => [key.toUpperCase(), value])
  );

  const renderedHtml = templateHtml.replace(/\{([A-Z0-9_]+)\}/g, (match, tokenName) => {
    if (!Object.prototype.hasOwnProperty.call(normalizedTokens, tokenName)) {
      return match;
    }

    return formatTemplateTokenValue(normalizedTokens[tokenName]);
  });

  return removeEmptyTaxRows(renderedHtml, normalizedTokens);
}

function formatMoney(amount: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: currencyCode
    }).format(amount);
  } catch {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: "GHS"
    }).format(amount);
  }
}

function formatLineMoney(amount: number) {
  return new Intl.NumberFormat("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function formatQuantity(quantity: number) {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(3);
}

function formatDateTime(value: string | null, timezone: string) {
  if (!value) {
    return "Pending local completion";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: timezone
    }).format(parsed);
  } catch {
    return parsed.toLocaleString();
  }
}

function formatTransactionTypeLabel(transactionType: StorePrintableReceiptDocument["transactionType"]) {
  if (transactionType === "SALES_ORDER") {
    return "Sales order";
  }

  if (transactionType === "RETURN") {
    return "Return";
  }

  if (transactionType === "EXCHANGE") {
    return "Exchange";
  }

  return "Sale";
}

function formatReceiptTitle(document: StorePrintableReceiptDocument) {
  const voidMarkers = [
    document.headerReference,
    document.additionalDetails,
    document.notes
  ].map((value) => value?.trim().toUpperCase() ?? "");

  if (
    document.transactionType === "RETURN" &&
    voidMarkers.some((value) => value === "VOID" || value.startsWith("VOID "))
  ) {
    return "Void Receipt";
  }

  if (document.transactionType === "RETURN") {
    return "Return Receipt";
  }

  if (document.transactionType === "EXCHANGE") {
    return "Exchange Receipt";
  }

  if (String(document.transactionType) === "SALES_ORDER") {
    return "Sales Order";
  }

  return "Sales Receipt";
}

function renderReceiptMetaRow(label: string, value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return `<div class="receipt-meta-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(
    value
  )}</strong></div>`;
}

function renderTemplateMetaRow(label: string, value: string | null | undefined) {
  if (!value?.trim()) {
    return "";
  }

  return `<tr>
    <th style="padding:0.22rem 0; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">${escapeHtml(label)}</th>
    <td style="padding:0.22rem 0; text-align:right;">${escapeHtmlWithBreaks(value)}</td>
  </tr>`;
}

function renderTemplateValueRow(value: string | null | undefined) {
  if (!value?.trim()) {
    return "";
  }

  return `<tr>
    <td colspan="2" style="padding:0.22rem 0; text-align:right;">${escapeHtmlWithBreaks(value)}</td>
  </tr>`;
}

function shouldRenderAmount(amount: number) {
  return Math.abs(amount) >= 0.005;
}

function renderTemplateTaxRow(amount: number, currencyCode: string) {
  if (!shouldRenderAmount(amount)) {
    return "";
  }

  return `<tr>
      <td style="padding:0.12rem 0; font-size:0.74rem; text-transform:uppercase; color:#78716c;">Tax</td>
      <td style="padding:0.12rem 0; text-align:right;">${escapeHtml(formatMoney(amount, currencyCode))}</td>
    </tr>`;
}

function renderTemplateDetailsBlock(
  value: string | null | undefined
) {
  if (!value?.trim()) {
    return "";
  }

  return `<div style="margin-top:0.8rem; border-top:1px dashed #d6d3d1; padding-top:0.7rem; font-size:0.77rem; line-height:1.55; color:#44403c;">
    <div>${escapeHtmlWithBreaks(value)}</div>
  </div>`;
}

function renderTemplateCommentsBlock(reference: string | null | undefined) {
  const comments = reference?.trim();

  if (!comments) {
    return "";
  }

  return `<div style="margin-top:0.5rem; text-align:center;">
    <div style="font-size:0.74rem; line-height:1.35; color:#44403c;">${escapeHtmlWithBreaks(comments)}</div>
  </div>`;
}

function splitReceiptAddressLines(
  addressLine1: string | null | undefined,
  addressLine2?: string | null | undefined
) {
  const explicitLine2 = addressLine2?.trim();
  const lines = (addressLine1 ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (explicitLine2) {
    return [lines[0] ?? "", explicitLine2].filter(Boolean);
  }

  return lines.slice(0, 2);
}

function renderStoreContactHtml(input: {
  addressLine1: string | null | undefined;
  addressLine2?: string | null | undefined;
  phone: string | null | undefined;
}) {
  const addressLines = splitReceiptAddressLines(input.addressLine1, input.addressLine2);
  const phone = input.phone?.trim();

  if (addressLines.length === 0 && !phone) {
    return "";
  }

  const locationIconHtml =
    '<svg aria-hidden="true" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; margin-right:3px; vertical-align:-1px;"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>';
  const addressHtml = addressLines
    .map(
      (line) =>
        `<span style="display:block; text-align:center;">${locationIconHtml}<span>${escapeHtml(line)}</span></span>`
    )
    .join("");
  const phoneHtml = phone
    ? `<span style="display:block; margin-top:0.12rem; text-align:center;">${escapeHtml(phone)}</span>`
    : "";

  return `<span style="display:block; text-align:center; line-height:1.42;">${addressHtml}${phoneHtml}</span>`;
}

function renderCompanyLogoHtml(
  companyLogoUrl: string | null | undefined,
  altLabel: string,
  options?: {
    align?: "center" | "left";
  }
) {
  if (!companyLogoUrl?.trim()) {
    return "";
  }

  const alignment = options?.align ?? "center";

  return `<div class="document-logo" style="margin-bottom:10px; text-align:${alignment};">
    <img
      alt="${escapeHtml(altLabel)}"
      onerror="this.remove()"
      src="${escapeHtml(companyLogoUrl)}"
      style="display:inline-block; max-height:132px; max-width:280px; object-fit:contain;"
    />
  </div>`;
}

const friendlyColourNamesByHex: Record<string, string> = {
  "#000000": "Black",
  "#ffffff": "White",
  "#ff0000": "Red",
  "#008000": "Green",
  "#0000ff": "Blue",
  "#ffff00": "Yellow",
  "#ffa500": "Orange",
  "#800080": "Purple",
  "#ffc0cb": "Pink",
  "#a52a2a": "Brown",
  "#808080": "Grey",
  "#c0c0c0": "Silver",
  "#00ffff": "Cyan",
  "#ff00ff": "Magenta",
  "#111827": "Charcoal",
  "#1f2937": "Slate",
  "#6b7280": "Grey",
  "#78716c": "Stone",
  "#ef4444": "Red",
  "#f97316": "Orange",
  "#f59e0b": "Amber",
  "#eab308": "Yellow",
  "#22c55e": "Green",
  "#10b981": "Emerald",
  "#14b8a6": "Teal",
  "#06b6d4": "Cyan",
  "#3b82f6": "Blue",
  "#6366f1": "Indigo",
  "#8b5cf6": "Violet",
  "#a855f7": "Purple",
  "#ec4899": "Pink",
  "#f43f5e": "Rose"
};

function formatFriendlyColour(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  const hex = normalized.toLowerCase();

  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return friendlyColourNamesByHex[hex] ?? "Custom colour";
  }

  return normalized
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function renderReceiptItemRows(
  lines: StoreReceiptPrintLine[],
  document: StorePrintableReceiptDocument
) {
  return lines
    .map((line) => {
      const serialHtml =
        line.serialNumbers.length > 0
          ? `<div class="receipt-line-serials">${line.serialNumbers
              .map((serialNumber) => `<span>${escapeHtml(serialNumber)}</span>`)
              .join("")}</div>`
          : "";
      const intentLabel =
        document.transactionType === "EXCHANGE"
          ? `<span class="receipt-line-intent">${
              line.lineIntent === "RETURN" ? "Return" : "Replacement"
            }</span>`
          : "";
      const friendlyColour = formatFriendlyColour(line.variantColor);
      const variantLabels = [
        line.variantSize ? `Size ${line.variantSize}` : null,
        friendlyColour ? `Colour ${friendlyColour}` : null,
        line.discountAmount > 0
          ? `${line.appliedPromotionName ?? "Discount"} -${formatLineMoney(line.discountAmount)}`
          : null,
      ]
        .filter((value): value is string => Boolean(value));
      const lineMeta = [`@ ${formatLineMoney(line.unitPrice)}`, ...variantLabels]
        .filter(Boolean)
        .join(" · ");
      const lineNoteHtml = line.lineNote?.trim()
        ? `<div style="font-size:0.69rem; color:#57534e;">${escapeHtml(line.lineNote)}</div>`
        : "";

      return `<tr>
        <td style="padding:0.28rem 0 0.24rem 0; border-top:1px dashed #e7e5e4;">
          <div style="font-weight:600; color:#111827;">${escapeHtml(line.productName)}</div>
          <div style="font-size:0.69rem; color:#78716c;">${escapeHtml(lineMeta)}${intentLabel}</div>
          ${lineNoteHtml}
          ${serialHtml}
        </td>
        <td style="padding:0.28rem 0.2rem 0.24rem 0; border-top:1px dashed #e7e5e4; text-align:right; white-space:nowrap;">${escapeHtml(
          formatQuantity(line.quantity)
        )}</td>
        <td style="padding:0.28rem 0 0.24rem 0.42rem; border-top:1px dashed #e7e5e4; text-align:right; white-space:nowrap;">${escapeHtml(
          formatLineMoney(line.lineTotal)
        )}</td>
      </tr>`;
    })
    .join("");
}

function renderReceiptItemTable(document: StorePrintableReceiptDocument) {
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
    <tbody>${renderReceiptItemRows(document.lines, document)}</tbody>
  </table>`;
}

function renderReceiptPaymentRows(
  payments: StoreReceiptPrintPayment[],
  currencyCode: string
) {
  if (payments.length === 0) {
    return `<div style="margin-top:0.62rem; color:#78716c; font-size:0.74rem;">No tender lines were captured for this receipt.</div>`;
  }

  return `<table style="margin-top:0.62rem; width:100%; border-collapse:collapse;">
    <thead>
      <tr>
        <th style="padding:0.24rem 0; border-bottom:1px solid #d6d3d1; text-align:left; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Tender</th>
        <th style="padding:0.24rem 0; border-bottom:1px solid #d6d3d1; text-align:right; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${payments
        .map(
          (payment) => `<tr>
            <td style="padding:0.28rem 0 0.24rem 0; border-top:1px dashed #e7e5e4;">
              <div style="font-weight:600; color:#111827;">${escapeHtml(
                payment.tenderMethodName ?? payment.method
              )}</div>
              <div style="font-size:0.69rem; color:#78716c;">${escapeHtml(
                payment.reference ?? payment.method
              )}</div>
            </td>
            <td style="padding:0.28rem 0 0.24rem 0; border-top:1px dashed #e7e5e4; text-align:right;">${escapeHtml(formatMoney(payment.amount, currencyCode))}</td>
          </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderReceiptTotals(document: StorePrintableReceiptDocument) {
  const isSalesOrderReceipt = String(document.transactionType) === "SALES_ORDER";
  const balanceAmount = Math.max(0, document.totalAmount - document.paidAmount + document.changeAmount);
  const totalRows = [
    ["Subtotal", formatMoney(document.subtotalAmount, document.currencyCode)],
    document.discountAmount > 0
      ? ["Discount", formatMoney(document.discountAmount, document.currencyCode)]
      : null,
    document.loyaltyRedemptionAmount > 0
      ? [
          `Loyalty redemption${
            document.loyaltyRedemptionPoints > 0
              ? ` (${document.loyaltyRedemptionPoints} pts)`
              : ""
          }`,
          formatMoney(document.loyaltyRedemptionAmount, document.currencyCode)
        ]
      : null,
    shouldRenderAmount(document.taxAmount)
      ? ["Tax", formatMoney(document.taxAmount, document.currencyCode)]
      : null,
    ["Total", formatMoney(document.totalAmount, document.currencyCode)],
    document.payments.length > 0 || document.paidAmount !== 0
      ? [
          document.transactionType === "RETURN" ||
          (document.transactionType === "EXCHANGE" && document.totalAmount < 0)
            ? "Refunded"
            : isSalesOrderReceipt
              ? "Deposit"
              : "Paid",
          formatMoney(document.paidAmount, document.currencyCode)
        ]
      : null,
    isSalesOrderReceipt
      ? ["Balance", formatMoney(balanceAmount, document.currencyCode)]
      : null,
    document.changeAmount !== 0
      ? ["Change", formatMoney(document.changeAmount, document.currencyCode)]
      : null
  ].filter((row): row is [string, string] => row !== null);

  return `<div class="receipt-totals">
    ${totalRows
      .map(
        ([label, value], index) => `<div class="receipt-total-row${
          index === totalRows.length - 1 ? " is-grand" : ""
        }"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
      )
      .join("")}
  </div>`;
}

const defaultThermalReceiptTemplateHtml = `
<div style="text-align:center;">
  {COMPANY_LOGO_HTML}
  <h2 style="margin:0.22rem 0 0; font-size:1rem; line-height:1.18; color:#111827;">
    {STORE_NAME}
  </h2>
  <p style="margin:0.14rem 0 0; font-size:0.7rem; line-height:1.28; color:#57534e;">
    {STORE_CONTACT}
  </p>
  <p style="margin:0.34rem 0 0; font-size:0.72rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:#0f172a;">
    {RECEIPT_TITLE}
  </p>
  <div style="margin-top:0.42rem; font-size:0.74rem; line-height:1.35; color:#44403c;">
    {RECEIPT_HEADER}
  </div>
</div>
<table style="margin-top:0.62rem; width:100%; border-collapse:collapse;">
  <tbody>
    <tr>
      <th style="width:38%; padding:0.13rem 0; text-align:left; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Receipt</th>
      <td style="padding:0.13rem 0; text-align:right;">{RECEIPT_NO}</td>
    </tr>
    <tr>
      <th style="padding:0.13rem 0; text-align:left; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Date</th>
      <td style="padding:0.13rem 0; text-align:right;">{RECEIPT_DATE_TIME}</td>
    </tr>
    <tr>
      <th style="padding:0.13rem 0; text-align:left; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Terminal</th>
      <td style="padding:0.13rem 0; text-align:right;">{TERMINAL_CODE}</td>
    </tr>
    <tr>
      <th style="padding:0.13rem 0; text-align:left; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Cashier</th>
      <td style="padding:0.13rem 0; text-align:right;">{CASHIER}</td>
    </tr>
    <tr>
      <th style="padding:0.13rem 0; text-align:left; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Customer</th>
      <td style="padding:0.13rem 0; text-align:right;">{CUSTOMER_NAME}</td>
    </tr>
    <tr>
      <th style="padding:0.13rem 0; text-align:left; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Source</th>
      <td style="padding:0.13rem 0; text-align:right;">{SOURCE_RECEIPT_NO}</td>
    </tr>
  </tbody>
</table>
{COMMENTS_BLOCK}
{ITEM_TABLE}
<table style="margin-top:0.62rem; width:100%; border-collapse:collapse;">
  <tbody>
    <tr>
      <td style="padding:0.12rem 0; font-size:0.74rem; text-transform:uppercase; color:#78716c;">Subtotal</td>
      <td style="padding:0.12rem 0; text-align:right;">{SUBTOTAL}</td>
    </tr>
    <tr>
      <td style="padding:0.12rem 0; font-size:0.74rem; text-transform:uppercase; color:#78716c;">Discount</td>
      <td style="padding:0.12rem 0; text-align:right;">{DISCOUNT}</td>
    </tr>
    {TAX_ROW}
    <tr>
      <td style="padding:0.16rem 0; font-size:0.76rem; font-weight:700; text-transform:uppercase; color:#111827;">Total</td>
      <td style="padding:0.16rem 0; text-align:right;"><strong>{TOTAL}</strong></td>
    </tr>
    <tr>
      <td style="padding:0.12rem 0; font-size:0.74rem; text-transform:uppercase; color:#78716c;">Paid</td>
      <td style="padding:0.12rem 0; text-align:right;">{PAID}</td>
    </tr>
    <tr>
      <td style="padding:0.12rem 0; font-size:0.74rem; text-transform:uppercase; color:#78716c;">Change</td>
      <td style="padding:0.12rem 0; text-align:right;">{CHANGE}</td>
    </tr>
  </tbody>
</table>
{PAYMENT_TABLE}
<div style="margin-top:0.55rem; border-top:1px dashed #d6d3d1; padding-top:0.45rem; text-align:center; font-size:0.74rem; line-height:1.35; color:#44403c;">
  {RECEIPT_FOOTER}
</div>
`.trim();

const defaultAccountPaymentReceiptTemplateHtml = `
<div style="text-align:center;">
  {COMPANY_LOGO_HTML}
  <h2 style="margin:0.22rem 0 0; font-size:1rem; line-height:1.18; color:#111827;">
    {STORE_NAME}
  </h2>
  <p style="margin:0.14rem 0 0; font-size:0.7rem; line-height:1.28; color:#57534e;">
    {STORE_CONTACT}
  </p>
  <p style="margin:0.34rem 0 0; font-size:0.72rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:#0f172a;">
    Account Payment Receipt
  </p>
  <div style="margin-top:0.42rem; font-size:0.74rem; line-height:1.35; color:#44403c;">
    {RECEIPT_HEADER}
  </div>
</div>
<table style="margin-top:0.62rem; width:100%; border-collapse:collapse;">
  <tbody>
    <tr>
      <th style="width:42%; padding:0.13rem 0; text-align:left; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Receipt</th>
      <td style="padding:0.13rem 0; text-align:right;">{ENTRY_NO}</td>
    </tr>
    <tr>
      <th style="padding:0.13rem 0; text-align:left; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Date</th>
      <td style="padding:0.13rem 0; text-align:right;">{RECEIPT_DATE_TIME}</td>
    </tr>
    <tr>
      <th style="padding:0.13rem 0; text-align:left; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Terminal</th>
      <td style="padding:0.13rem 0; text-align:right;">{TERMINAL_CODE}</td>
    </tr>
    <tr>
      <th style="padding:0.13rem 0; text-align:left; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Cashier</th>
      <td style="padding:0.13rem 0; text-align:right;">{CASHIER}</td>
    </tr>
  </tbody>
</table>
<div style="margin-top:0.62rem; border-top:1px dashed #d6d3d1; border-bottom:1px dashed #d6d3d1; padding:0.45rem 0;">
  <p style="margin:0; font-size:0.72rem; text-transform:uppercase; color:#78716c;">Customer</p>
  <p style="margin:0.18rem 0 0; font-size:0.9rem; font-weight:700; color:#111827;">{CUSTOMER_NAME}</p>
  <p style="margin:0.12rem 0 0; font-size:0.76rem; color:#57534e;">{CUSTOMER_NO}</p>
</div>
<table style="margin-top:0.62rem; width:100%; border-collapse:collapse;">
  <tbody>
    <tr>
      <td style="padding:0.13rem 0; font-size:0.74rem; text-transform:uppercase; color:#78716c;">Tender</td>
      <td style="padding:0.13rem 0; text-align:right;">{PAYMENT_METHOD}</td>
    </tr>
    <tr>
      <td style="padding:0.13rem 0; font-size:0.74rem; text-transform:uppercase; color:#78716c;">Reference</td>
      <td style="padding:0.13rem 0; text-align:right;">{PAYMENT_REFERENCE}</td>
    </tr>
    <tr>
      <td style="padding:0.18rem 0; font-size:0.76rem; font-weight:700; text-transform:uppercase; color:#111827;">Paid</td>
      <td style="padding:0.18rem 0; text-align:right;"><strong>{AMOUNT}</strong></td>
    </tr>
    <tr>
      <td style="padding:0.13rem 0; font-size:0.74rem; text-transform:uppercase; color:#78716c;">Current balance</td>
      <td style="padding:0.13rem 0; text-align:right;"><strong>{REMAINING_BALANCE}</strong></td>
    </tr>
  </tbody>
</table>
<div style="margin-top:0.55rem; border-top:1px dashed #d6d3d1; padding-top:0.45rem; text-align:center; font-size:0.74rem; line-height:1.35; color:#44403c;">
  {RECEIPT_FOOTER}
</div>
`.trim();

function renderDefaultReceiptBody(document: StorePrintableReceiptDocument) {
  const logoHtml = renderCompanyLogoHtml(document.companyLogoUrl, `${document.storeName} logo`);
  const storeContactHtml = renderStoreContactHtml({
    addressLine1: document.storeAddress,
    addressLine2: document.storeAddressLine2,
    phone: document.storePhone
  });
  const headerText = document.receiptHeader?.trim()
    ? `<div class="receipt-copy">${escapeHtmlWithBreaks(document.receiptHeader)}</div>`
    : "";
  const footerText = document.receiptFooter?.trim()
    ? `<div class="receipt-copy">${escapeHtmlWithBreaks(document.receiptFooter)}</div>`
    : "";
  const capturedDetails = [document.headerReference?.trim()].filter(
    (value): value is string => Boolean(value)
  );
  const capturedDetailsBlock = capturedDetails.length
    ? `<div class="receipt-section">${capturedDetails
        .map((value) => `<div class="receipt-copy">${escapeHtmlWithBreaks(value)}</div>`)
        .join("")}</div>`
    : "";

  return `<div class="print-sheet print-receipt-sheet">
    <div class="receipt-header">
      ${logoHtml}
      <h1>${escapeHtml(document.storeName)}</h1>
      ${storeContactHtml ? `<div class="receipt-copy">${storeContactHtml}</div>` : ""}
      <div class="receipt-title-chip">${escapeHtml(formatReceiptTitle(document))}</div>
      ${headerText}
    </div>
    <div class="receipt-meta">
      ${renderReceiptMetaRow("Receipt", document.transactionNo)}
      ${renderReceiptMetaRow("Date", formatDateTime(document.completedAt, document.timezone))}
      ${renderReceiptMetaRow("Terminal", document.terminalCode)}
      ${renderReceiptMetaRow("Cashier", document.cashierCode)}
      ${renderReceiptMetaRow("Customer", document.customerName ?? document.customerNo)}
      ${renderReceiptMetaRow("Source", document.sourceTransactionNo)}
    </div>
    ${capturedDetailsBlock}
    <div class="receipt-section">
      ${renderReceiptItemTable(document)}
    </div>
    <div class="receipt-section">
      ${renderReceiptTotals(document)}
    </div>
    <div class="receipt-section">
      ${renderReceiptPaymentRows(document.payments, document.currencyCode)}
    </div>
    ${footerText ? `<div class="receipt-section">${footerText}</div>` : ""}
  </div>`;
}

function buildReceiptTemplateTokens(document: StorePrintableReceiptDocument) {
  const storeContact = renderStoreContactHtml({
    addressLine1: document.storeAddress,
    addressLine2: document.storeAddressLine2,
    phone: document.storePhone
  });

  return {
    RETAIL_ORG_NAME: "",
    COMPANY_LOGO_URL: document.companyLogoUrl,
    COMPANY_LOGO_HTML: documentTemplateRawHtml(
      renderCompanyLogoHtml(document.companyLogoUrl, `${document.storeName} logo`)
    ),
    STORE_NAME: document.storeName,
    STORE_CODE: document.storeCode,
    STORE_LOCATION: document.storeLocation ?? "",
    STORE_PHONE: document.storePhone ?? "",
    STORE_ADDRESS: document.storeAddress ?? "",
    STORE_ADDRESS_LINE_1: document.storeAddress ?? "",
    STORE_ADDRESS_LINE_2: document.storeAddressLine2 ?? "",
    STORE_CONTACT: documentTemplateRawHtml(storeContact),
    TERMINAL_CODE: document.terminalCode,
    RECEIPT_TITLE: formatReceiptTitle(document),
    RECEIPT_NO: document.transactionNo,
    RECEIPT_DATE_TIME: formatDateTime(document.completedAt, document.timezone),
    TRANSACTION_TYPE: formatTransactionTypeLabel(document.transactionType),
    SOURCE_RECEIPT_NO: document.sourceTransactionNo,
    SHIFT_NO: document.shiftNo,
    CASHIER: document.cashierCode,
    CUSTOMER_NAME: document.customerName ?? document.customerNo,
    ITEM_TABLE: documentTemplateRawHtml(renderReceiptItemTable(document)),
    PAYMENT_TABLE: documentTemplateRawHtml(
      renderReceiptPaymentRows(document.payments, document.currencyCode)
    ),
    SUBTOTAL: formatMoney(document.subtotalAmount, document.currencyCode),
    PROMOTION_DISCOUNT: formatMoney(document.discountAmount, document.currencyCode),
    DISCOUNT: formatMoney(document.discountAmount, document.currencyCode),
    LOYALTY_POINTS_REDEEMED: document.loyaltyRedemptionPoints,
    LOYALTY_REDEMPTION_AMOUNT: formatMoney(
      document.loyaltyRedemptionAmount,
      document.currencyCode
    ),
    TAX: shouldRenderAmount(document.taxAmount)
      ? formatMoney(document.taxAmount, document.currencyCode)
      : "",
    TAX_ROW: documentTemplateRawHtml(
      renderTemplateTaxRow(document.taxAmount, document.currencyCode)
    ),
    TOTAL: formatMoney(document.totalAmount, document.currencyCode),
    PAID: formatMoney(document.paidAmount, document.currencyCode),
    CHANGE: formatMoney(document.changeAmount, document.currencyCode),
    NOTES: document.notes,
    TRANSACTION_REFERENCE: document.headerReference,
    TRANSACTION_REFERENCE_ROW: documentTemplateRawHtml(
      renderTemplateValueRow(document.headerReference)
    ),
    TRANSACTION_REFERENCE_BLOCK: documentTemplateRawHtml(
      renderTemplateDetailsBlock(document.headerReference)
    ),
    ADDITIONAL_DETAILS: "",
    ADDITIONAL_DETAILS_BLOCK: documentTemplateRawHtml(""),
    COMMENTS_BLOCK: documentTemplateRawHtml(renderTemplateCommentsBlock(document.headerReference)),
    RECEIPT_HEADER: document.receiptHeader,
    RECEIPT_FOOTER: document.receiptFooter
  } as const;
}

function renderReceiptBody(document: StorePrintableReceiptDocument) {
  const templateHtml =
    document.salesReceiptTemplateHtml?.trim() || defaultThermalReceiptTemplateHtml;

  const logoHtml = /\{COMPANY_LOGO_HTML\}/i.test(templateHtml)
    ? ""
    : renderCompanyLogoHtml(document.companyLogoUrl, `${document.storeName} logo`);

  return `<div class="print-sheet print-receipt-sheet">
    ${logoHtml}
    <div class="document-template-html document-template-html--receipt">
      ${renderDocumentTemplateHtml(templateHtml, buildReceiptTemplateTokens(document))}
    </div>
  </div>`;
}

function buildAccountPaymentTemplateTokens(document: StorePrintableAccountPaymentReceiptDocument) {
  const storeContact = renderStoreContactHtml({
    addressLine1: document.storeAddress,
    addressLine2: document.storeAddressLine2,
    phone: document.storePhone
  });

  return {
    RETAIL_ORG_NAME: "",
    COMPANY_LOGO_URL: document.companyLogoUrl,
    COMPANY_LOGO_HTML: documentTemplateRawHtml(
      renderCompanyLogoHtml(document.companyLogoUrl, `${document.storeName} logo`)
    ),
    STORE_NAME: document.storeName,
    STORE_CODE: document.storeCode,
    STORE_LOCATION: document.storeLocation ?? "",
    STORE_PHONE: document.storePhone ?? "",
    STORE_ADDRESS: document.storeAddress ?? "",
    STORE_ADDRESS_LINE_1: document.storeAddress ?? "",
    STORE_ADDRESS_LINE_2: document.storeAddressLine2 ?? "",
    STORE_CONTACT: documentTemplateRawHtml(storeContact),
    TERMINAL_CODE: document.terminalCode,
    RECEIPT_TITLE: "Account Payment Receipt",
    RECEIPT_NO: document.entryNo,
    ENTRY_NO: document.entryNo,
    RECEIPT_DATE_TIME: formatDateTime(document.occurredAt, document.timezone),
    SHIFT_NO: document.shiftNo,
    CASHIER: document.cashierCode,
    CUSTOMER_NO: document.customerNo,
    CUSTOMER_NAME: document.customerName,
    PAYMENT_METHOD: document.tenderMethodName ?? document.paymentMethod,
    PAYMENT_REFERENCE: document.reference,
    AMOUNT: formatMoney(document.amount, document.currencyCode),
    TOTAL: formatMoney(document.amount, document.currencyCode),
    REMAINING_BALANCE:
      document.remainingBalanceAmount === null
        ? ""
        : formatMoney(document.remainingBalanceAmount, document.currencyCode),
    NOTES: document.note,
    RECEIPT_HEADER: document.receiptHeader,
    RECEIPT_FOOTER: document.receiptFooter
  } as const;
}

function renderDefaultAccountPaymentReceiptBody(document: StorePrintableAccountPaymentReceiptDocument) {
  const logoHtml = renderCompanyLogoHtml(document.companyLogoUrl, `${document.storeName} logo`);
  const storeContactHtml = renderStoreContactHtml({
    addressLine1: document.storeAddress,
    addressLine2: document.storeAddressLine2,
    phone: document.storePhone
  });
  const headerText = document.receiptHeader?.trim()
    ? `<div class="receipt-copy">${escapeHtmlWithBreaks(document.receiptHeader)}</div>`
    : "";
  const footerText = document.receiptFooter?.trim()
    ? `<div class="receipt-copy">${escapeHtmlWithBreaks(document.receiptFooter)}</div>`
    : "";

  return `<div class="print-sheet print-receipt-sheet">
    <div class="receipt-header">
      ${logoHtml}
      <h1>${escapeHtml(document.storeName)}</h1>
      ${storeContactHtml ? `<div class="receipt-copy">${storeContactHtml}</div>` : ""}
      <div class="receipt-title-chip">Account Payment Receipt</div>
      ${headerText}
    </div>
    <div class="receipt-meta">
      ${renderReceiptMetaRow("Receipt", document.entryNo)}
      ${renderReceiptMetaRow("Date", formatDateTime(document.occurredAt, document.timezone))}
      ${renderReceiptMetaRow("Terminal", document.terminalCode)}
      ${renderReceiptMetaRow("Cashier", document.cashierCode)}
      ${renderReceiptMetaRow("Customer", `${document.customerName} (${document.customerNo})`)}
      ${renderReceiptMetaRow("Reference", document.reference)}
    </div>
    <div class="receipt-section">
      <table class="receipt-table receipt-payment-table">
        <thead>
          <tr>
            <th>Tender</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div class="receipt-line-name">${escapeHtml(
                document.tenderMethodName ?? document.paymentMethod
              )}</div>
              <div class="receipt-line-meta">
                <span>${escapeHtml(document.paymentMethod)}</span>
                ${document.reference ? `<span>${escapeHtml(document.reference)}</span>` : ""}
              </div>
            </td>
            <td>${escapeHtml(formatMoney(document.amount, document.currencyCode))}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="receipt-section">
      <div class="receipt-totals">
        <div class="receipt-total-row is-grand"><span>Paid</span><strong>${escapeHtml(
          formatMoney(document.amount, document.currencyCode)
        )}</strong></div>
        ${
          document.remainingBalanceAmount === null
            ? ""
            : `<div class="receipt-total-row"><span>Balance</span><strong>${escapeHtml(
                formatMoney(document.remainingBalanceAmount, document.currencyCode)
              )}</strong></div>`
        }
      </div>
    </div>
    ${footerText ? `<div class="receipt-section">${footerText}</div>` : ""}
  </div>`;
}

function renderAccountPaymentReceiptBody(document: StorePrintableAccountPaymentReceiptDocument) {
  const templateHtml =
    document.accountPaymentReceiptTemplateHtml?.trim() || defaultAccountPaymentReceiptTemplateHtml;

  const logoHtml = /\{COMPANY_LOGO_HTML\}/i.test(templateHtml)
    ? ""
    : renderCompanyLogoHtml(document.companyLogoUrl, `${document.storeName} logo`);

  return `<div class="print-sheet print-receipt-sheet">
    ${logoHtml}
    <div class="document-template-html document-template-html--receipt">
      ${renderDocumentTemplateHtml(templateHtml, buildAccountPaymentTemplateTokens(document))}
    </div>
  </div>`;
}

const defaultGoodsReceiptTemplateHtml = `
<div style="display:flex; align-items:flex-start; justify-content:space-between; gap:24px; border-bottom:2px solid #17211b; padding-bottom:14px;">
  <div style="display:flex; align-items:flex-start; gap:14px;">
    <div style="min-width:74px; text-align:left;">{COMPANY_LOGO_HTML}</div>
    <div>
      <p style="margin:0; font-size:0.72rem; letter-spacing:0.16em; text-transform:uppercase; color:#57534e;">{RETAIL_ORG_NAME}</p>
      <h1 style="margin:0.28rem 0 0; font-size:1.65rem; line-height:1.1; color:#111827;">Goods Receipt Note</h1>
      <p style="margin:0.42rem 0 0; font-size:0.82rem; font-weight:700; color:#334155;">{STORE_NAME}</p>
      <div style="margin-top:0.45rem; font-size:0.76rem; line-height:1.5; color:#44403c;">{RECEIPT_HEADER}</div>
    </div>
  </div>
  <div style="border:1px solid #ccd6ce; border-radius:10px; padding:10px 12px; text-align:right; min-width:172px;">
    <strong style="display:block; font-size:0.86rem; color:#111827;">{RECEIPT_NO}</strong>
    <span style="display:block; margin-top:4px; font-size:0.74rem; color:#64748b;">{RECEIPT_DATE_TIME}</span>
  </div>
</div>
<table style="margin-top:1rem; width:100%; border-collapse:collapse;">
  <tbody>
    <tr><th style="width:42%; padding:0.28rem 0; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">GRN</th><td style="padding:0.28rem 0; text-align:right;">{RECEIPT_NO}</td></tr>
    <tr><th style="padding:0.22rem 0; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">PO</th><td style="padding:0.22rem 0; text-align:right;">{PURCHASE_ORDER_NO}</td></tr>
    <tr><th style="padding:0.22rem 0; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">Supplier</th><td style="padding:0.22rem 0; text-align:right;">{SUPPLIER_NAME}</td></tr>
    <tr><th style="padding:0.22rem 0; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">Location</th><td style="padding:0.22rem 0; text-align:right;">{LOCATION_NAME}</td></tr>
    <tr><th style="padding:0.22rem 0; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">Operator</th><td style="padding:0.22rem 0; text-align:right;">{OPERATOR}</td></tr>
  </tbody>
</table>
{ITEM_TABLE}
<table style="margin-top:0.95rem; width:100%; border-collapse:collapse;">
  <tbody>
    <tr><td style="padding:0.22rem 0; font-size:0.78rem; text-transform:uppercase; color:#78716c;">Ordered qty</td><td style="padding:0.22rem 0; text-align:right;">{TOTAL_ORDERED_QTY}</td></tr>
    <tr><td style="padding:0.26rem 0; font-size:0.82rem; font-weight:700; text-transform:uppercase; color:#111827;">Received qty</td><td style="padding:0.26rem 0; text-align:right;"><strong>{TOTAL_RECEIVED_QTY}</strong></td></tr>
  </tbody>
</table>
<div style="margin-top:0.8rem; border-top:1px dashed #d6d3d1; padding-top:0.7rem; font-size:0.77rem; line-height:1.55; color:#44403c;">{NOTES}</div>
<div style="margin-top:0.8rem; border-top:1px dashed #d6d3d1; padding-top:0.7rem; font-size:0.77rem; line-height:1.55; color:#44403c;">{RECEIPT_FOOTER}</div>
`.trim();

function renderGoodsReceiptLineRows(document: StorePrintableGoodsReceiptDocument) {
  return document.lines
    .map((line) => {
      const serialHtml =
        line.serialNumbers.length > 0
          ? `<div class="receipt-line-serials">${line.serialNumbers
              .map((serialNumber) => `<span>${escapeHtml(serialNumber)}</span>`)
              .join("")}</div>`
          : "";

      return `<tr>
        <td>
          <div class="receipt-line-name">${escapeHtml(line.productName)}</div>
          <div class="receipt-line-meta"><span>${escapeHtml(line.productCode)}</span></div>
          ${serialHtml}
        </td>
        <td>${escapeHtml(formatQuantity(line.orderedQuantity))}</td>
        <td>${escapeHtml(formatQuantity(line.receivedQuantity))}</td>
      </tr>`;
    })
    .join("");
}

function renderGoodsReceiptItemTable(document: StorePrintableGoodsReceiptDocument) {
  return `<table class="receipt-table receipt-grn-table">
    <thead>
      <tr>
        <th>Item</th>
        <th>Ordered</th>
        <th>Received</th>
      </tr>
    </thead>
    <tbody>${renderGoodsReceiptLineRows(document)}</tbody>
  </table>`;
}

function buildGoodsReceiptTemplateTokens(document: StorePrintableGoodsReceiptDocument) {
  return {
    RETAIL_ORG_NAME: document.retailOrgName,
    COMPANY_LOGO_URL: document.companyLogoUrl,
    COMPANY_LOGO_HTML: documentTemplateRawHtml(
      renderCompanyLogoHtml(document.companyLogoUrl, `${document.retailOrgName} logo`, {
        align: "left"
      })
    ),
    STORE_NAME: document.storeName,
    STORE_CODE: document.storeCode,
    TERMINAL_CODE: document.terminalCode,
    RECEIPT_TITLE: "Goods Receipt Note",
    RECEIPT_NO: document.goodsReceiptNo,
    PURCHASE_ORDER_NO: document.purchaseOrderNo ?? "Direct receipt",
    RECEIPT_DATE_TIME: formatDateTime(document.receivedAt, document.timezone),
    SUPPLIER_NO: document.supplierNo,
    SUPPLIER_NAME: document.supplierName ?? "Supplier not set",
    LOCATION_CODE: document.inventoryLocationCode,
    LOCATION_NAME: document.inventoryLocationName,
    OPERATOR: document.operatorName,
    CASHIER: document.operatorName,
    PAYMENT_REFERENCE: document.externalReference,
    TRANSACTION_REFERENCE: document.externalReference,
    ITEM_TABLE: documentTemplateRawHtml(renderGoodsReceiptItemTable(document)),
    TOTAL_ORDERED_QTY: formatQuantity(document.totalOrderedQuantity),
    TOTAL_RECEIVED_QTY: formatQuantity(document.totalReceivedQuantity),
    TOTAL: formatQuantity(document.totalReceivedQuantity),
    NOTES: document.note,
    RECEIPT_HEADER: document.receiptHeader,
    RECEIPT_FOOTER: document.receiptFooter
  } as const;
}

function renderGoodsReceiptBody(document: StorePrintableGoodsReceiptDocument) {
  const templateHtml = document.goodsReceiptTemplateHtml?.trim() || defaultGoodsReceiptTemplateHtml;
  const logoHtml = /\{COMPANY_LOGO_HTML\}/i.test(templateHtml)
    ? ""
    : renderCompanyLogoHtml(document.companyLogoUrl, `${document.retailOrgName} logo`, {
        align: "left"
      });

  return `<div class="print-sheet print-receipt-sheet">
    ${logoHtml}
    <div class="document-template-html document-template-html--receipt">
      ${renderDocumentTemplateHtml(templateHtml, buildGoodsReceiptTemplateTokens(document))}
    </div>
    <div class="document-signature-footer">
      <div>Prepared by</div>
      <div>Approved by</div>
      <div>Supplier acknowledgement</div>
    </div>
  </div>`;
}

export function buildReceiptPrintWindowHtml(
  document: StorePrintableReceiptDocument,
  options?: {
    autoPrint?: boolean;
  }
) {
  const autoPrint = options?.autoPrint === true;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
    />
    <title>${escapeHtml(document.transactionNo)} • Flash ERP thermal receipt</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        background: #e7ecf3;
        color: #111827;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 22%),
          linear-gradient(180deg, #eef4fb 0%, #e4ebf5 100%);
        color: #0f172a;
      }

      .print-hidden {
        display: block;
      }

      .receipt-window {
        min-height: 100vh;
        padding: 24px;
      }

      .receipt-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 0 auto 18px;
        max-width: 210mm;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.84);
        padding: 14px 16px;
        box-shadow: 0 26px 52px rgba(15, 23, 42, 0.08);
      }

      .receipt-toolbar-copy {
        display: grid;
        gap: 2px;
      }

      .receipt-toolbar-copy strong {
        font-size: 0.98rem;
      }

      .receipt-toolbar-copy span {
        color: #475569;
        font-size: 0.8rem;
      }

      .receipt-toolbar-actions {
        display: flex;
        gap: 10px;
      }

      .receipt-toolbar button {
        appearance: none;
        border: 1px solid transparent;
        border-radius: 999px;
        cursor: pointer;
        font: inherit;
        font-weight: 700;
        padding: 10px 16px;
      }

      .receipt-toolbar .is-primary {
        background: linear-gradient(135deg, #0f766e, #0f5e73);
        color: white;
      }

      .receipt-toolbar .is-secondary {
        background: white;
        border-color: rgba(148, 163, 184, 0.36);
        color: #0f172a;
      }

      .print-sheet {
        border: 1px solid rgba(148, 163, 184, 0.26);
        border-radius: 26px;
        background: white;
        box-shadow: 0 28px 60px rgba(15, 23, 42, 0.12);
      }

      .print-receipt-sheet {
        width: 76mm;
        max-width: 76mm;
        margin: 0 auto;
        padding: 3mm 2.6mm;
      }

      .receipt-header {
        text-align: center;
      }

      .receipt-brand-eyebrow {
        color: #475569;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .receipt-header h1 {
        margin: 5px 0 0;
        font-size: 16px;
        line-height: 1.2;
      }

      .receipt-title-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-top: 6px;
        border-radius: 999px;
        background: #0f172a;
        color: white;
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.12em;
        padding: 4px 9px;
        text-transform: uppercase;
      }

      .receipt-copy {
        margin-top: 6px;
        color: #334155;
        font-size: 10px;
        line-height: 1.35;
      }

      .receipt-meta,
      .receipt-section {
        margin-top: 9px;
      }

      .receipt-section-title {
        margin-bottom: 8px;
        color: #475569;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.15em;
        text-transform: uppercase;
      }

      .receipt-meta-row,
      .receipt-total-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        border-bottom: 1px dashed rgba(148, 163, 184, 0.55);
        padding: 3px 0;
      }

      .receipt-meta-row span,
      .receipt-total-row span {
        color: #64748b;
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .receipt-meta-row strong,
      .receipt-total-row strong {
        font-size: 11px;
        font-weight: 700;
        text-align: right;
      }

      .receipt-total-row.is-grand {
        border-bottom: none;
        padding-top: 5px;
      }

      .receipt-total-row.is-grand span,
      .receipt-total-row.is-grand strong {
        color: #0f172a;
        font-size: 12px;
      }

      .receipt-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
      }

      .receipt-table thead th {
        border-bottom: 1px solid rgba(148, 163, 184, 0.42);
        color: #64748b;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.12em;
        padding: 0 0 4px;
        text-align: left;
        text-transform: uppercase;
      }

      .receipt-table thead th:last-child,
      .receipt-table tbody td:last-child {
        text-align: right;
      }

      .receipt-table tbody td {
        border-bottom: 1px solid rgba(226, 232, 240, 0.75);
        padding: 5px 0;
        vertical-align: top;
      }

      .receipt-line-name {
        font-weight: 700;
        line-height: 1.35;
      }

      .receipt-line-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 6px;
        margin-top: 2px;
      }

      .receipt-line-meta span,
      .receipt-line-intent {
        border-radius: 999px;
        background: #f1f5f9;
        color: #475569;
        font-size: 9.5px;
        font-weight: 700;
        padding: 2px 6px;
      }

      .receipt-line-serials {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 6px;
      }

      .receipt-line-serials span {
        border: 1px dashed rgba(148, 163, 184, 0.7);
        border-radius: 999px;
        color: #334155;
        font-size: 9.5px;
        padding: 2px 6px;
      }

      .receipt-empty {
        border: 1px dashed rgba(148, 163, 184, 0.6);
        border-radius: 14px;
        color: #64748b;
        font-size: 11px;
        line-height: 1.5;
        padding: 10px 12px;
      }

      .document-template-html {
        color: #0f172a;
      }

      .document-template-html table {
        width: 100%;
        border-collapse: collapse;
      }

      .document-template-html img {
        max-width: 100%;
      }

      @media print {
        @page pos-receipt {
          size: 80mm auto;
          margin: 3mm;
        }

        body {
          background: white;
        }

        .print-hidden {
          display: none !important;
        }

        .print-sheet {
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }

        .print-receipt-sheet {
          page: pos-receipt;
          width: 76mm !important;
          max-width: 76mm !important;
          margin: 0 auto !important;
          padding: 1.8mm 1.4mm !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="receipt-window">
      <div class="receipt-toolbar print-hidden">
        <div class="receipt-toolbar-copy">
          <strong>${escapeHtml(document.transactionNo)}</strong>
          <span>80mm thermal slip preview</span>
        </div>
        <div class="receipt-toolbar-actions">
          <button class="is-secondary" type="button" onclick="window.close()">Close</button>
          <button class="is-primary" type="button" onclick="window.print()">Print receipt</button>
        </div>
      </div>
      ${renderReceiptBody(document)}
    </div>
    <script>
      window.addEventListener("load", () => {
        if (${autoPrint ? "true" : "false"}) {
          window.setTimeout(() => window.print(), 260);
        }
      });
    </script>
  </body>
</html>`;
}

export function buildAccountPaymentReceiptPrintWindowHtml(
  document: StorePrintableAccountPaymentReceiptDocument,
  options?: {
    autoPrint?: boolean;
  }
) {
  const autoPrint = options?.autoPrint === true;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <title>${escapeHtml(document.entryNo)} • Account payment receipt</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        background: #e7ecf3;
        color: #111827;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(180deg, #eef4fb 0%, #e4ebf5 100%);
        color: #0f172a;
      }

      .receipt-window { min-height: 100vh; padding: 24px; }
      .receipt-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 0 auto 18px;
        max-width: 420px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.9);
        padding: 14px 16px;
        box-shadow: 0 22px 48px rgba(15, 23, 42, 0.08);
      }
      .receipt-toolbar-copy { display: grid; gap: 2px; }
      .receipt-toolbar-copy strong { font-size: 0.98rem; }
      .receipt-toolbar-copy span { color: #475569; font-size: 0.8rem; }
      .receipt-toolbar-actions { display: flex; gap: 10px; }
      .receipt-toolbar button {
        border: 1px solid transparent;
        border-radius: 999px;
        cursor: pointer;
        font: inherit;
        font-weight: 700;
        padding: 10px 16px;
      }
      .receipt-toolbar .is-primary { background: #0f766e; color: white; }
      .receipt-toolbar .is-secondary { background: white; border-color: rgba(148, 163, 184, 0.36); color: #0f172a; }
      .print-sheet {
        border: 1px solid rgba(148, 163, 184, 0.26);
        border-radius: 22px;
        background: white;
        box-shadow: 0 28px 60px rgba(15, 23, 42, 0.12);
      }
      .print-receipt-sheet {
        width: 76mm;
        max-width: 76mm;
        margin: 0 auto;
        padding: 3mm 2.6mm;
      }
      .receipt-header { text-align: center; }
      .receipt-brand-eyebrow {
        color: #475569;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
      .receipt-header h1 { margin: 5px 0 0; font-size: 16px; line-height: 1.2; }
      .receipt-title-chip {
        display: inline-flex;
        margin-top: 6px;
        border-radius: 999px;
        background: #0f172a;
        color: white;
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.12em;
        padding: 4px 9px;
        text-transform: uppercase;
      }
      .receipt-copy { margin-top: 6px; color: #334155; font-size: 10px; line-height: 1.35; }
      .receipt-meta, .receipt-section { margin-top: 9px; }
      .receipt-section-title {
        margin-bottom: 8px;
        color: #475569;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.15em;
        text-transform: uppercase;
      }
      .receipt-meta-row, .receipt-total-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        border-bottom: 1px dashed rgba(148, 163, 184, 0.55);
        padding: 3px 0;
      }
      .receipt-meta-row span, .receipt-total-row span {
        color: #64748b;
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .receipt-meta-row strong, .receipt-total-row strong {
        font-size: 11px;
        font-weight: 700;
        text-align: right;
      }
      .receipt-total-row.is-grand { border-bottom: none; padding-top: 5px; }
      .receipt-table { width: 100%; border-collapse: collapse; font-size: 11px; }
      .receipt-table th {
        border-bottom: 1px solid rgba(148, 163, 184, 0.42);
        color: #64748b;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.12em;
        padding: 0 0 4px;
        text-align: left;
        text-transform: uppercase;
      }
      .receipt-table th:last-child, .receipt-table td:last-child { text-align: right; }
      .receipt-table td { border-bottom: 1px solid rgba(226, 232, 240, 0.75); padding: 5px 0; vertical-align: top; }
      .receipt-line-name { font-weight: 700; line-height: 1.35; }
      .receipt-line-meta { display: flex; flex-wrap: wrap; gap: 4px 6px; margin-top: 2px; }
      .receipt-line-meta span {
        border-radius: 999px;
        background: #f1f5f9;
        color: #475569;
        font-size: 9.5px;
        font-weight: 700;
        padding: 2px 6px;
      }
      .document-template-html table { width: 100%; border-collapse: collapse; }
      .document-template-html img { max-width: 100%; }
      @media print {
        @page pos-receipt { size: 80mm auto; margin: 3mm; }
        body { background: white; }
        .print-hidden { display: none !important; }
        .print-sheet { border: none !important; border-radius: 0 !important; box-shadow: none !important; }
        .print-receipt-sheet {
          page: pos-receipt;
          width: 76mm !important;
          max-width: 76mm !important;
          margin: 0 auto !important;
          padding: 1.8mm 1.4mm !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="receipt-window">
      <div class="receipt-toolbar print-hidden">
        <div class="receipt-toolbar-copy">
          <strong>${escapeHtml(document.entryNo)}</strong>
          <span>80mm account payment slip preview</span>
        </div>
        <div class="receipt-toolbar-actions">
          <button class="is-secondary" type="button" onclick="window.close()">Close</button>
          <button class="is-primary" type="button" onclick="window.print()">Print receipt</button>
        </div>
      </div>
      ${renderAccountPaymentReceiptBody(document)}
    </div>
    <script>
      window.addEventListener("load", () => {
        if (${autoPrint ? "true" : "false"}) {
          window.setTimeout(() => window.print(), 260);
        }
      });
    </script>
  </body>
</html>`;
}

export function buildGoodsReceiptPrintWindowHtml(
  document: StorePrintableGoodsReceiptDocument,
  options?: {
    autoPrint?: boolean;
  }
) {
  const autoPrint = options?.autoPrint === true;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <title>${escapeHtml(document.goodsReceiptNo)} • Goods receipt note</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        background: #e7ecf3;
        color: #111827;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(180deg, #eef4fb 0%, #e4ebf5 100%);
        color: #0f172a;
      }
      .receipt-window { min-height: 100vh; padding: 24px; }
      .receipt-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 0 auto 18px;
        max-width: 420px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.9);
        padding: 14px 16px;
        box-shadow: 0 22px 48px rgba(15, 23, 42, 0.08);
      }
      .receipt-toolbar-copy { display: grid; gap: 2px; }
      .receipt-toolbar-copy strong { font-size: 0.98rem; }
      .receipt-toolbar-copy span { color: #475569; font-size: 0.8rem; }
      .receipt-toolbar-actions { display: flex; gap: 10px; }
      .receipt-toolbar button {
        border: 1px solid transparent;
        border-radius: 999px;
        cursor: pointer;
        font: inherit;
        font-weight: 700;
        padding: 10px 16px;
      }
      .receipt-toolbar .is-primary { background: #0f766e; color: white; }
      .receipt-toolbar .is-secondary { background: white; border-color: rgba(148, 163, 184, 0.36); color: #0f172a; }
      .print-sheet {
        border: 1px solid rgba(148, 163, 184, 0.26);
        border-radius: 22px;
        background: white;
        box-shadow: 0 28px 60px rgba(15, 23, 42, 0.12);
      }
      .print-receipt-sheet {
        width: 210mm;
        max-width: 210mm;
        margin: 0 auto;
        min-height: 297mm;
        padding: 16mm;
        position: relative;
      }
      .document-template-html--receipt { padding-bottom: 34mm; }
      .receipt-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
      .receipt-table th {
        border-bottom: 1px solid rgba(148, 163, 184, 0.42);
        color: #64748b;
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.08em;
        padding: 0 0 8px;
        text-align: left;
        text-transform: uppercase;
      }
      .receipt-table th:nth-child(2),
      .receipt-table th:nth-child(3),
      .receipt-table td:nth-child(2),
      .receipt-table td:nth-child(3) { text-align: right; white-space: nowrap; }
      .receipt-table td { border-bottom: 1px solid rgba(226, 232, 240, 0.75); padding: 9px 0; vertical-align: top; }
      .receipt-line-name { font-weight: 700; line-height: 1.35; }
      .receipt-line-meta { display: flex; flex-wrap: wrap; gap: 4px 6px; margin-top: 4px; }
      .receipt-line-meta span {
        border-radius: 999px;
        background: #f1f5f9;
        color: #475569;
        font-size: 9.5px;
        font-weight: 700;
        padding: 2px 6px;
      }
      .receipt-line-serials { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
      .receipt-line-serials span {
        border: 1px dashed rgba(148, 163, 184, 0.7);
        border-radius: 999px;
        color: #334155;
        font-size: 9.5px;
        padding: 2px 6px;
      }
      .document-template-html table { width: 100%; border-collapse: collapse; }
      .document-template-html img { max-width: 100%; }
      .document-signature-footer {
        bottom: 16mm;
        display: grid;
        gap: 18px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        left: 16mm;
        position: absolute;
        right: 16mm;
      }
      .document-signature-footer div {
        border-top: 1px solid #94a3b8;
        color: #475569;
        font-size: 12px;
        padding-top: 8px;
      }
      @media print {
        @page goods-receipt-note { size: A4 portrait; margin: 12mm; }
        body { background: white; }
        .print-hidden { display: none !important; }
        .print-sheet { border: none !important; border-radius: 0 !important; box-shadow: none !important; }
        .print-receipt-sheet {
          page: goods-receipt-note;
          width: auto !important;
          max-width: none !important;
          min-height: auto !important;
          margin: 0 auto !important;
          padding: 0 !important;
        }
        .document-template-html--receipt { min-height: calc(297mm - 24mm); padding-bottom: 30mm; }
        .document-signature-footer { bottom: 0; left: 0; right: 0; }
      }
    </style>
  </head>
  <body>
    <div class="receipt-window">
      <div class="receipt-toolbar print-hidden">
        <div class="receipt-toolbar-copy">
          <strong>${escapeHtml(document.goodsReceiptNo)}</strong>
          <span>A4 GRN document preview</span>
        </div>
        <div class="receipt-toolbar-actions">
          <button class="is-secondary" type="button" onclick="window.close()">Close</button>
          <button class="is-primary" type="button" onclick="window.print()">Print GRN</button>
        </div>
      </div>
      ${renderGoodsReceiptBody(document)}
    </div>
    <script>
      window.addEventListener("load", () => {
        if (${autoPrint ? "true" : "false"}) {
          window.setTimeout(() => window.print(), 260);
        }
      });
    </script>
  </body>
</html>`;
}
