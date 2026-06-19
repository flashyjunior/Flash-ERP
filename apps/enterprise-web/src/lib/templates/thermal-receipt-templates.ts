export type ThermalReceiptTemplateTokenDefinition = {
  token: string;
  label: string;
  description: string;
  group: string;
};

export type TemplateTokenValue =
  | string
  | number
  | null
  | undefined
  | {
      rawHtml: string;
    };

export const thermalReceiptTemplateTokens: ThermalReceiptTemplateTokenDefinition[] = [
  {
    token: "RETAIL_ORG_NAME",
    label: "Enterprise name",
    description: "Retail organization display name.",
    group: "Business"
  },
  {
    token: "COMPANY_LOGO_HTML",
    label: "Company logo",
    description: "Rendered company logo block as raw HTML when a logo is available.",
    group: "Business"
  },
  {
    token: "STORE_NAME",
    label: "Store name",
    description: "Branch or warehouse display name.",
    group: "Business"
  },
  {
    token: "STORE_CODE",
    label: "Store code",
    description: "Branch code published from enterprise.",
    group: "Business"
  },
  {
    token: "STORE_ADDRESS",
    label: "Store address",
    description: "Branch Address 1 from the Store page.",
    group: "Business"
  },
  {
    token: "STORE_ADDRESS_LINE_1",
    label: "Store address line 1",
    description: "Branch Address line 1 from the Store page.",
    group: "Business"
  },
  {
    token: "STORE_ADDRESS_LINE_2",
    label: "Store address line 2",
    description: "Branch Address line 2 from the Store page.",
    group: "Business"
  },
  {
    token: "STORE_PHONE",
    label: "Store phone",
    description: "Branch phone number from the Store page.",
    group: "Business"
  },
  {
    token: "STORE_CONTACT",
    label: "Store contact",
    description: "Centered branch address and phone block.",
    group: "Business"
  },
  {
    token: "TERMINAL_CODE",
    label: "Terminal code",
    description: "Desktop terminal or lane code.",
    group: "Business"
  },
  {
    token: "RECEIPT_TITLE",
    label: "Receipt title",
    description: "Resolved document title such as Sales Receipt or Exchange Receipt.",
    group: "Receipt"
  },
  {
    token: "RECEIPT_NO",
    label: "Receipt number",
    description: "Posted transaction number.",
    group: "Receipt"
  },
  {
    token: "PURCHASE_ORDER_NO",
    label: "Purchase order",
    description: "Purchase order number linked to a goods receipt.",
    group: "Receipt"
  },
  {
    token: "RECEIPT_DATE_TIME",
    label: "Receipt date/time",
    description: "Receipt completion date and time in store timezone.",
    group: "Receipt"
  },
  {
    token: "STATUS",
    label: "Document status",
    description: "Purchase, receipt, or workflow status label.",
    group: "Receipt"
  },
  {
    token: "TRANSACTION_TYPE",
    label: "Transaction type",
    description: "Sale, return, or exchange label.",
    group: "Receipt"
  },
  {
    token: "SOURCE_RECEIPT_NO",
    label: "Source receipt",
    description: "Original receipt number for linked returns or exchanges.",
    group: "Receipt"
  },
  {
    token: "TRANSACTION_REFERENCE",
    label: "Transaction reference",
    description: "Reference captured from the store transaction details dialog.",
    group: "Receipt"
  },
  {
    token: "TRANSACTION_REFERENCE_ROW",
    label: "Reference value row",
    description: "Rendered value-only table row for the captured transaction reference when present.",
    group: "Receipt"
  },
  {
    token: "TRANSACTION_REFERENCE_BLOCK",
    label: "Reference value block",
    description: "Rendered value-only block for the captured transaction reference when present.",
    group: "Receipt"
  },
  {
    token: "COMMENTS_BLOCK",
    label: "Comments block",
    description: "Centered reference-only block before the item table.",
    group: "Text blocks"
  },
  {
    token: "SHIFT_NO",
    label: "Shift number",
    description: "Active POS shift identifier.",
    group: "Operators"
  },
  {
    token: "CASHIER",
    label: "Cashier",
    description: "Cashier or operator code.",
    group: "Operators"
  },
  {
    token: "OPERATOR",
    label: "Operator",
    description: "Store operator that posted the document.",
    group: "Operators"
  },
  {
    token: "SUPPLIER_NAME",
    label: "Supplier",
    description: "Supplier name on a purchase or goods receipt document.",
    group: "Supplier"
  },
  {
    token: "SUPPLIER_NO",
    label: "Supplier number",
    description: "Supplier account number on a purchase or goods receipt document.",
    group: "Supplier"
  },
  {
    token: "LOCATION_NAME",
    label: "Inventory location",
    description: "Receiving or stock location name.",
    group: "Inventory"
  },
  {
    token: "LOCATION_CODE",
    label: "Location code",
    description: "Receiving or stock location code.",
    group: "Inventory"
  },
  {
    token: "CUSTOMER_NAME",
    label: "Customer",
    description: "Attached customer name or customer number.",
    group: "Customer"
  },
  {
    token: "CUSTOMER_NO",
    label: "Customer number",
    description: "Registered customer account number.",
    group: "Customer"
  },
  {
    token: "ENTRY_NO",
    label: "Account entry number",
    description: "Customer account payment entry number.",
    group: "Receipt"
  },
  {
    token: "PAYMENT_METHOD",
    label: "Payment method",
    description: "Tender or settlement method used on the receipt.",
    group: "Tender"
  },
  {
    token: "PAYMENT_REFERENCE",
    label: "Payment reference",
    description: "Cheque, bank deposit, or transfer reference.",
    group: "Tender"
  },
  {
    token: "AMOUNT",
    label: "Paid amount",
    description: "Amount collected on an account payment receipt.",
    group: "Totals"
  },
  {
    token: "REMAINING_BALANCE",
    label: "Remaining account balance",
    description: "Customer account balance after the posted payment.",
    group: "Totals"
  },
  {
    token: "ITEM_TABLE",
    label: "Item table",
    description: "Rendered receipt item rows as raw HTML.",
    group: "Dynamic tables"
  },
  {
    token: "PAYMENT_TABLE",
    label: "Payment table",
    description: "Rendered payment rows as raw HTML.",
    group: "Dynamic tables"
  },
  {
    token: "SUBTOTAL",
    label: "Subtotal",
    description: "Subtotal amount before tax and discounts.",
    group: "Totals"
  },
  {
    token: "DISCOUNT",
    label: "Discount",
    description: "Total discount amount.",
    group: "Totals"
  },
  {
    token: "TAX",
    label: "Tax",
    description: "Tax total for the receipt.",
    group: "Totals"
  },
  {
    token: "TAX_ROW",
    label: "Tax row",
    description: "Rendered tax total row when tax is not zero.",
    group: "Totals"
  },
  {
    token: "SHIPPING",
    label: "Shipping",
    description: "Purchase-order shipping charge.",
    group: "Totals"
  },
  {
    token: "FREIGHT",
    label: "Freight",
    description: "Purchase-order freight charge.",
    group: "Totals"
  },
  {
    token: "OTHER_CHARGES",
    label: "Other charges",
    description: "Additional purchase-order charge amount.",
    group: "Totals"
  },
  {
    token: "TOTAL",
    label: "Grand total",
    description: "Total due for the receipt.",
    group: "Totals"
  },
  {
    token: "TOTAL_ORDERED_QTY",
    label: "Total ordered quantity",
    description: "Total quantity ordered on a GRN document.",
    group: "Totals"
  },
  {
    token: "TOTAL_RECEIVED_QTY",
    label: "Total received quantity",
    description: "Total quantity received on a GRN document.",
    group: "Totals"
  },
  {
    token: "PAID",
    label: "Paid or refunded",
    description: "Tendered amount for sales or refunded amount for returns.",
    group: "Totals"
  },
  {
    token: "CHANGE",
    label: "Change",
    description: "Change returned to the shopper.",
    group: "Totals"
  },
  {
    token: "NOTES",
    label: "Receipt notes",
    description: "Operator or receipt note block.",
    group: "Text blocks"
  },
  {
    token: "ADDITIONAL_DETAILS",
    label: "Additional details",
    description: "Details captured from the store transaction details dialog.",
    group: "Text blocks"
  },
  {
    token: "ADDITIONAL_DETAILS_BLOCK",
    label: "Additional details value block",
    description: "Rendered value-only block for captured transaction details when present.",
    group: "Text blocks"
  },
  {
    token: "RECEIPT_HEADER",
    label: "Receipt header",
    description: "Store-specific header text block.",
    group: "Text blocks"
  },
  {
    token: "RECEIPT_FOOTER",
    label: "Receipt footer",
    description: "Store-specific footer text block.",
    group: "Text blocks"
  }
];

export const defaultThermalReceiptTemplateHtml = `
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

export const defaultAccountPaymentReceiptTemplateHtml = `
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

export const defaultPurchaseOrderTemplateHtml = `
<div style="display:flex; align-items:flex-start; justify-content:space-between; gap:24px; border-bottom:2px solid #17211b; padding-bottom:14px;">
  <div style="display:flex; align-items:flex-start; gap:14px;">
    <div style="min-width:74px; text-align:left;">{COMPANY_LOGO_HTML}</div>
    <div>
      <p style="margin:0; font-size:0.72rem; letter-spacing:0.16em; text-transform:uppercase; color:#57534e;">{RETAIL_ORG_NAME}</p>
      <h1 style="margin:0.28rem 0 0; font-size:1.65rem; line-height:1.1; color:#111827;">Purchase Order</h1>
      <p style="margin:0.42rem 0 0; font-size:0.82rem; font-weight:700; color:#334155;">{STORE_NAME}</p>
      <div style="margin-top:0.45rem; font-size:0.76rem; line-height:1.5; color:#44403c;">{RECEIPT_HEADER}</div>
    </div>
  </div>
  <div style="border:1px solid #ccd6ce; border-radius:10px; padding:10px 12px; text-align:right; min-width:172px;">
    <strong style="display:block; font-size:0.86rem; color:#111827;">{PURCHASE_ORDER_NO}</strong>
    <span style="display:block; margin-top:4px; font-size:0.74rem; color:#64748b;">{RECEIPT_DATE_TIME}</span>
  </div>
</div>
<table style="margin-top:1rem; width:100%; border-collapse:collapse;">
  <tbody>
    <tr><th style="width:42%; padding:0.28rem 0; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">PO</th><td style="padding:0.28rem 0; text-align:right;">{PURCHASE_ORDER_NO}</td></tr>
    <tr><th style="padding:0.22rem 0; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">Status</th><td style="padding:0.22rem 0; text-align:right;">{STATUS}</td></tr>
    <tr><th style="padding:0.22rem 0; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">Supplier</th><td style="padding:0.22rem 0; text-align:right;">{SUPPLIER_NAME}</td></tr>
    <tr><th style="padding:0.22rem 0; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">Location</th><td style="padding:0.22rem 0; text-align:right;">{LOCATION_NAME}</td></tr>
    <tr><th style="padding:0.22rem 0; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">Reference</th><td style="padding:0.22rem 0; text-align:right;">{TRANSACTION_REFERENCE}</td></tr>
    <tr><th style="padding:0.22rem 0; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">Operator</th><td style="padding:0.22rem 0; text-align:right;">{OPERATOR}</td></tr>
  </tbody>
</table>
{ITEM_TABLE}
<table style="margin-top:0.95rem; width:100%; border-collapse:collapse;">
  <tbody>
    <tr><td style="padding:0.22rem 0; font-size:0.78rem; text-transform:uppercase; color:#78716c;">Subtotal</td><td style="padding:0.22rem 0; text-align:right;">{SUBTOTAL}</td></tr>
    <tr><td style="padding:0.22rem 0; font-size:0.78rem; text-transform:uppercase; color:#78716c;">Discount</td><td style="padding:0.22rem 0; text-align:right;">{DISCOUNT}</td></tr>
    <tr><td style="padding:0.22rem 0; font-size:0.78rem; text-transform:uppercase; color:#78716c;">Shipping</td><td style="padding:0.22rem 0; text-align:right;">{SHIPPING}</td></tr>
    <tr><td style="padding:0.22rem 0; font-size:0.78rem; text-transform:uppercase; color:#78716c;">Freight</td><td style="padding:0.22rem 0; text-align:right;">{FREIGHT}</td></tr>
    <tr><td style="padding:0.22rem 0; font-size:0.78rem; text-transform:uppercase; color:#78716c;">Other charges</td><td style="padding:0.22rem 0; text-align:right;">{OTHER_CHARGES}</td></tr>
    <tr><td style="padding:0.22rem 0; font-size:0.78rem; text-transform:uppercase; color:#78716c;">Tax</td><td style="padding:0.22rem 0; text-align:right;">{TAX}</td></tr>
    <tr><td style="padding:0.26rem 0; font-size:0.82rem; font-weight:700; text-transform:uppercase; color:#111827;">Total</td><td style="padding:0.26rem 0; text-align:right;"><strong>{TOTAL}</strong></td></tr>
  </tbody>
</table>
<div style="margin-top:0.8rem; border-top:1px dashed #d6d3d1; padding-top:0.7rem; font-size:0.77rem; line-height:1.55; color:#44403c;">{NOTES}</div>
<div style="margin-top:0.8rem; border-top:1px dashed #d6d3d1; padding-top:0.7rem; font-size:0.77rem; line-height:1.55; color:#44403c;">{RECEIPT_FOOTER}</div>
`.trim();

export const defaultGoodsReceiptTemplateHtml = `
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
    <tr>
      <th style="width:42%; padding:0.28rem 0; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">GRN</th>
      <td style="padding:0.28rem 0; text-align:right;">{RECEIPT_NO}</td>
    </tr>
    <tr>
      <th style="padding:0.22rem 0; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">PO</th>
      <td style="padding:0.22rem 0; text-align:right;">{PURCHASE_ORDER_NO}</td>
    </tr>
    <tr>
      <th style="padding:0.22rem 0; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">Supplier</th>
      <td style="padding:0.22rem 0; text-align:right;">{SUPPLIER_NAME}</td>
    </tr>
    <tr>
      <th style="padding:0.22rem 0; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">Location</th>
      <td style="padding:0.22rem 0; text-align:right;">{LOCATION_NAME}</td>
    </tr>
    <tr>
      <th style="padding:0.22rem 0; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">Operator</th>
      <td style="padding:0.22rem 0; text-align:right;">{OPERATOR}</td>
    </tr>
  </tbody>
</table>
{ITEM_TABLE}
<table style="margin-top:0.95rem; width:100%; border-collapse:collapse;">
  <tbody>
    <tr>
      <td style="padding:0.22rem 0; font-size:0.78rem; text-transform:uppercase; color:#78716c;">Ordered qty</td>
      <td style="padding:0.22rem 0; text-align:right;">{TOTAL_ORDERED_QTY}</td>
    </tr>
    <tr>
      <td style="padding:0.26rem 0; font-size:0.82rem; font-weight:700; text-transform:uppercase; color:#111827;">Received qty</td>
      <td style="padding:0.26rem 0; text-align:right;"><strong>{TOTAL_RECEIVED_QTY}</strong></td>
    </tr>
  </tbody>
</table>
<div style="margin-top:0.8rem; border-top:1px dashed #d6d3d1; padding-top:0.7rem; font-size:0.77rem; line-height:1.55; color:#44403c;">
  {NOTES}
</div>
<div style="margin-top:0.8rem; border-top:1px dashed #d6d3d1; padding-top:0.7rem; font-size:0.77rem; line-height:1.55; color:#44403c;">
  {RECEIPT_FOOTER}
</div>
`.trim();

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

function renderTemplateStoreContactHtml(input: {
  addressLine1: string | null | undefined;
  addressLine2?: string | null | undefined;
  phone: string | null | undefined;
}) {
  const addressLines = [input.addressLine1?.trim(), input.addressLine2?.trim()].filter(
    (value): value is string => Boolean(value)
  );
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

export function documentTemplateRawHtml(rawHtml: string): TemplateTokenValue {
  return { rawHtml };
}

function formatTemplateTokenValue(value: TemplateTokenValue) {
  if (value && typeof value === "object" && "rawHtml" in value) {
    return value.rawHtml;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return escapeHtmlWithBreaks(value);
}

function removeEmptyTaxRows(renderedHtml: string, tokens: Record<string, TemplateTokenValue>) {
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

export function renderDocumentTemplateHtml(
  templateHtml: string,
  tokens: Record<string, TemplateTokenValue>
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

function buildPreviewItemTable() {
  return `<table style="margin-top:0.95rem; width:100%; table-layout:fixed; border-collapse:collapse;">
    <colgroup>
      <col style="width:56%;" />
      <col style="width:14%;" />
      <col style="width:30%;" />
    </colgroup>
    <thead>
      <tr>
        <th style="padding:0.42rem 0 0.42rem 0; border-bottom:1px solid #d6d3d1; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">Item</th>
        <th style="padding:0.42rem 0.2rem 0.42rem 0; border-bottom:1px solid #d6d3d1; text-align:right; font-size:0.72rem; text-transform:uppercase; color:#78716c;">Qty</th>
        <th style="padding:0.42rem 0 0.42rem 0.42rem; border-bottom:1px solid #d6d3d1; text-align:right; font-size:0.72rem; text-transform:uppercase; color:#78716c;">Total</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding:0.45rem 0 0.4rem 0;">
          <div style="font-weight:600; color:#111827;">Flash POS Keyboard</div>
          <div style="font-size:0.72rem; color:#78716c;">@ 120.00</div>
        </td>
        <td style="padding:0.45rem 0.2rem 0.4rem 0; text-align:right; white-space:nowrap;">1</td>
        <td style="padding:0.45rem 0 0.4rem 0.42rem; text-align:right; white-space:nowrap;">120.00</td>
      </tr>
      <tr>
        <td style="padding:0.45rem 0 0.4rem 0; border-top:1px dashed #e7e5e4;">
          <div style="font-weight:600; color:#111827;">Barcode Scanner Stand</div>
          <div style="font-size:0.72rem; color:#78716c;">@ 18.50</div>
        </td>
        <td style="padding:0.45rem 0.2rem 0.4rem 0; border-top:1px dashed #e7e5e4; text-align:right; white-space:nowrap;">2</td>
        <td style="padding:0.45rem 0 0.4rem 0.42rem; border-top:1px dashed #e7e5e4; text-align:right; white-space:nowrap;">37.00</td>
      </tr>
    </tbody>
  </table>`;
}

function buildPreviewPaymentTable() {
  return `<table style="margin-top:0.95rem; width:100%; border-collapse:collapse;">
    <thead>
      <tr>
        <th style="padding:0.42rem 0 0.42rem 0; border-bottom:1px solid #d6d3d1; text-align:left; font-size:0.72rem; text-transform:uppercase; color:#78716c;">Tender</th>
        <th style="padding:0.42rem 0 0.42rem 0; border-bottom:1px solid #d6d3d1; text-align:right; font-size:0.72rem; text-transform:uppercase; color:#78716c;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding:0.45rem 0 0.4rem 0;">
          <div style="font-weight:600; color:#111827;">Cash</div>
          <div style="font-size:0.72rem; color:#78716c;">Tendered locally</div>
        </td>
        <td style="padding:0.45rem 0 0.4rem 0; text-align:right;">$170.00</td>
      </tr>
    </tbody>
  </table>`;
}

function buildPreviewTaxRow() {
  return `<tr>
      <td style="padding:0.12rem 0; font-size:0.74rem; text-transform:uppercase; color:#78716c;">Tax</td>
      <td style="padding:0.12rem 0; text-align:right;">$7.85</td>
    </tr>`;
}

function buildPreviewTransactionReferenceRow() {
  return `<tr>
    <td colspan="2" style="padding:0.22rem 0; text-align:right;">0244123456 - Ama Mensah</td>
  </tr>`;
}

function buildPreviewCommentsBlock() {
  return `<div style="margin-top:0.95rem; text-align:center;">
    <div style="font-size:0.78rem; line-height:1.55; color:#44403c;">0244123456 - Ama Mensah</div>
  </div>`;
}

function buildPreviewTokens(): Record<string, TemplateTokenValue> {
  return {
    RETAIL_ORG_NAME: "",
    COMPANY_LOGO_HTML:
      '<div style="margin-bottom:10px; text-align:center;"><div style="display:inline-flex; align-items:center; justify-content:center; min-width:132px; padding:10px 14px; border-radius:16px; background:linear-gradient(135deg,#dbeafe,#eff6ff); color:#1d4ed8; font-size:0.86rem; font-weight:700;">Flash ERP</div></div>',
    STORE_NAME: "Airport Branch",
    STORE_CODE: "airport-branch",
    STORE_ADDRESS: "12 Airport Road",
    STORE_ADDRESS_LINE_1: "12 Airport Road",
    STORE_ADDRESS_LINE_2: "East Legon",
    STORE_PHONE: "0244123456",
    STORE_CONTACT: documentTemplateRawHtml(
      renderTemplateStoreContactHtml({
        addressLine1: "12 Airport Road",
        addressLine2: "East Legon",
        phone: "0244123456"
      })
    ),
    TERMINAL_CODE: "POS-01",
    RECEIPT_TITLE: "Sales Receipt",
    RECEIPT_NO: "SAL-2026-004281",
    PURCHASE_ORDER_NO: "PO-2026-00142",
    RECEIPT_DATE_TIME: "Apr 12, 2026, 4:42 PM",
    STATUS: "Committed",
    TRANSACTION_TYPE: "Sale",
    SOURCE_RECEIPT_NO: "",
    SHIFT_NO: "SHIFT-042",
    CASHIER: "CASH-07",
    OPERATOR: "CASH-07",
    SUPPLIER_NAME: "Global Supplier Ltd",
    SUPPLIER_NO: "SUP-0007",
    LOCATION_NAME: "Airport Branch Receiving",
    LOCATION_CODE: "AIRPORT-RECEIVING",
    CUSTOMER_NAME: "Walk-in customer",
    CUSTOMER_NO: "CUST-0001",
    ENTRY_NO: "AR-2026-00017",
    PAYMENT_METHOD: "Bank Deposit",
    PAYMENT_REFERENCE: "DEP-983871",
    AMOUNT: "$150.00",
    REMAINING_BALANCE: "$42.75",
    ITEM_TABLE: documentTemplateRawHtml(buildPreviewItemTable()),
    PAYMENT_TABLE: documentTemplateRawHtml(buildPreviewPaymentTable()),
    SUBTOTAL: "$157.00",
    DISCOUNT: "$0.00",
    TAX: "$7.85",
    TAX_ROW: documentTemplateRawHtml(buildPreviewTaxRow()),
    SHIPPING: "$12.00",
    FREIGHT: "$0.00",
    OTHER_CHARGES: "$3.50",
    TOTAL: "$164.85",
    TOTAL_ORDERED_QTY: "12",
    TOTAL_RECEIVED_QTY: "10",
    PAID: "$170.00",
    CHANGE: "$5.15",
    NOTES: "Thank you for shopping with Flash ERP.",
    TRANSACTION_REFERENCE: "0244123456 - Ama Mensah",
    TRANSACTION_REFERENCE_ROW: documentTemplateRawHtml(buildPreviewTransactionReferenceRow()),
    TRANSACTION_REFERENCE_BLOCK: documentTemplateRawHtml(
      '<div style="margin-top:0.8rem; border-top:1px dashed #d6d3d1; padding-top:0.7rem; font-size:0.77rem; line-height:1.55; color:#44403c;"><div>0244123456 - Ama Mensah</div></div>'
    ),
    ADDITIONAL_DETAILS: "",
    ADDITIONAL_DETAILS_BLOCK: documentTemplateRawHtml(""),
    COMMENTS_BLOCK: documentTemplateRawHtml(buildPreviewCommentsBlock()),
    RECEIPT_HEADER: "Airport Branch\nOpen daily • Call 0200-000-000",
    RECEIPT_FOOTER: "Goods sold can be returned with the original receipt.\nPlease keep this thermal slip safely."
  };
}

export function renderThermalReceiptTemplatePreview(templateHtml: string) {
  return renderDocumentTemplateHtml(templateHtml, buildPreviewTokens());
}
