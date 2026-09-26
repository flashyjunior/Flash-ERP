import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

function requireFile(relativePath: string) {
  const absolutePath = path.join(workspaceRoot, relativePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Online-store desktop parity gate is missing ${relativePath}.`);
  }

  return readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n");
}

function requireIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`Online-store desktop parity gate failed: ${label}`);
  }
}

function requireExcludes(source: string, needle: string, label: string) {
  if (source.includes(needle)) {
    throw new Error(`Online-store desktop parity gate failed: ${label}`);
  }
}

function requireScript(packageSource: string, scriptName: string) {
  const parsed = JSON.parse(packageSource) as { scripts?: Record<string, string> };

  if (!parsed.scripts?.[scriptName]) {
    throw new Error(`Root package.json must expose script ${scriptName}.`);
  }
}

const rootPackage = requireFile("package.json");
const desktopRuntime = requireFile("apps/store-desktop/src/shared/desktop-runtime.ts");
const desktopRenderer = requireFile("apps/store-desktop/src/renderer/modern-app.tsx");
const desktopMain = requireFile("apps/store-desktop/electron/main.ts");
const desktopSqliteService = requireFile("apps/store-desktop/src/main/offline/local-store-service.ts");
const desktopPostgresService = requireFile("apps/store-desktop/src/main/postgres/postgres-store-service.ts");
const desktopMssqlService = requireFile("apps/store-desktop/src/main/mssql/mssql-store-service.ts");

for (const [provider, source] of [
  ["SQLite", desktopSqliteService],
  ["PostgreSQL", desktopPostgresService],
  ["SQL Server", desktopMssqlService],
] as const) {
  requireIncludes(
    source,
    "const hasDepositPaymentRows =",
    `${provider} sales orders must accept multiple deposit payments.`,
  );
  requireIncludes(
    source,
    "payments: preparedDepositPayments.payments.map",
    `${provider} sales-order sync payloads must preserve each deposit payment.`,
  );
}
const onlineRepository = requireFile("apps/enterprise-web/src/server/repositories/online-store.repository.ts");
const enterprisePosRepository = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-pos.repository.ts"
);
const onlineWorkspace = requireFile("apps/enterprise-web/src/components/enterprise/online-store-workspace.tsx");
const onlineStyles = requireFile("apps/enterprise-web/src/app/globals.css");
const enterpriseSecurityPanel = requireFile(
  "apps/enterprise-web/src/components/enterprise/enterprise-security-panel.tsx"
);
const enterpriseInventoryCatalogWorkspace = requireFile(
  "apps/enterprise-web/src/components/enterprise/enterprise-inventory-catalog-workspace.tsx"
);
const enterpriseCatalogRepository = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-catalog.repository.ts"
);
const enterpriseSettingsPage = requireFile(
  "apps/enterprise-web/src/app/settings/[view]/page.tsx"
);
const onlineSalesOrderRoute = requireFile(
  "apps/enterprise-web/src/app/api/online-store/sales-orders/route.ts"
);
const enterpriseStoresRepository = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-stores.repository.ts"
);
const enterpriseStoreDetail = requireFile(
  "apps/enterprise-web/src/components/enterprise/enterprise-store-detail.tsx"
);
const terminalUpdateRoute = requireFile(
  "apps/enterprise-web/src/app/api/stores/[storeCode]/terminals/[terminalCode]/route.ts"
);
const onlineSpec = requireFile("tests/e2e/online-store-parity.spec.ts");
const playwrightConfig = requireFile("playwright.config.ts");
const parityLedger = requireFile("docs/16-online-store-desktop-parity-ledger.md");

requireScript(rootPackage, "acceptance:online-store-parity");

requireIncludes(
  onlineWorkspace,
  "reportResultsById[activeReport]",
  "online reports must keep result data isolated by report."
);
requireIncludes(
  onlineWorkspace,
  'acceptsParameter("customerQuery")',
  "online report requests must submit only parameters declared by the active report."
);
requireIncludes(
  onlineWorkspace,
  "selectReport(definition.reportId)",
  "online report navigation must restore each report's own criteria and result."
);
requireIncludes(
  onlineRepository,
  "Math.min(criteria.limit * 10, 1000)",
  "cashier-scoped sales-order reconciliation must scan beyond the display limit before attribution filtering."
);
requireIncludes(
  onlineRepository,
  ".slice(0, criteria.limit)",
  "sales-order reconciliation must apply its display limit after cashier attribution filtering."
);
requireIncludes(
  onlineStyles,
  ".rms-order-collections-table .rms-table-row",
  "sales-order reconciliation must define a dedicated six-column table layout."
);
requireIncludes(
  onlineStyles,
  "flex-direction: column;",
  "report detail content must flow vertically without a message row consuming the workspace."
);
requireIncludes(
  enterpriseSecurityPanel,
  "allowPasswordReveal",
  "HQ user password setup must expose the password visibility control."
);
requireIncludes(
  enterpriseSecurityPanel,
  'aria-label={isPasswordVisible ? "Hide password" : "Show password"}',
  "the HQ password visibility control must remain accessible."
);
requireIncludes(
  enterpriseInventoryCatalogWorkspace,
  "Every non-deleted product in this business",
  "inventory catalogs must expose the complete business product master for audit."
);
requireIncludes(
  enterpriseInventoryCatalogWorkspace,
  "of {numberFormatter.format(workspace.productRows.length)} linked",
  "inventory catalog counts must distinguish linked products from all available products."
);
requireIncludes(
  enterpriseCatalogRepository,
  "return getEnterpriseCatalogWorkspace(undefined, { includeAllProducts: true });",
  "the inventory-catalog editor loader must request the complete product master."
);
requireIncludes(
  enterpriseCatalogRepository,
  "...(includeAllProducts",
  "the catalog repository must bypass product paging only for the inventory-catalog editor."
);
requireIncludes(
  enterpriseSettingsPage,
  "getEnterpriseInventoryCatalogWorkspace()",
  "inventory-catalog settings must use the complete-product loader instead of the default product page."
);

requireIncludes(
  onlineRepository,
  "totalAmount: signedTransactionAmount({",
  "online sales rows must present returns with a negative sales value."
);
requireExcludes(
  onlineRepository,
  "const reportNetSalesAmount = toMoney(reportTransactions.reduce((sum, transaction) => sum + Number(transaction.totalAmount), 0));",
  "online report summaries must not add positive return receipts to net sales."
);
requireIncludes(
  desktopRenderer,
  "const tenderChartRows = tenderBreakdown.filter((tender) => tender.amount > 0);",
  "desktop tender charts must use the positive remainder after sale and return tenders net off."
);
requireExcludes(
  desktopRenderer,
  "Math.abs(tender.netAmount)",
  "desktop tender summaries must not turn return tenders into positive collections."
);
requireExcludes(
  desktopRenderer,
  "Math.min(0, transaction.totalAmount)",
  "desktop refund cards must recognize positive stored return totals."
);
requireIncludes(
  desktopMain,
  "snapshot.recentClosedShifts[0] ?? snapshot.activeShift ?? null",
  "desktop Z reports must prefer the shift that was just closed."
);
requireIncludes(
  onlineRepository,
  "shift: closedShift",
  "online EOD must return the authoritative server-side closed-shift totals."
);
requireIncludes(
  onlineWorkspace,
  "const closedShift = payload.shift ?? null;",
  "online Z reports must print the authoritative shift returned by EOD."
);
requireIncludes(
  onlineRepository,
  "approving Online POS sales-order price overrides",
  "online sales-order price changes must use the manager price-override permission."
);
requireIncludes(
  onlineSalesOrderRoute,
  "managerOverride: body?.managerOverride ?? null",
  "online sales-order routes must forward manager approval credentials."
);
requireIncludes(
  onlineWorkspace,
  "managerOverride: buildManagerOverridePayload()",
  "online sales-order UI must submit the manager approval payload."
);
requireIncludes(
  enterpriseStoresRepository,
  "export async function updateEnterpriseStoreTerminal(",
  "HQ must update a terminal in place when its shop code was configured incorrectly."
);
requireIncludes(
  enterpriseStoresRepository,
  "Its node binding, licence, and sync history were preserved",
  "terminal code correction must preserve the existing terminal identity."
);
requireIncludes(
  enterpriseStoreDetail,
  "Align this HQ terminal code with the code configured at the shop.",
  "the store workspace must expose terminal-code correction guidance."
);
requireIncludes(
  terminalUpdateRoute,
  'assertEnterprisePermission(["master.store.manage"])',
  "terminal correction must remain protected by store-management permission."
);

for (const desktopAnchor of [
  "StoreSyncSnapshot",
  "companyLogoUrl",
  "loginBackgroundImageUrl",
  "checkoutActiveBasket",
  "parkActiveBasket",
  "resumeParkedBasket",
  "recordCustomerAccountPayment",
  "createSalesOrderFromActiveBasket",
  "resumeSalesOrder",
  "cancelSalesOrder",
  "recordEodReconciliation",
  "recordBankingDeposit",
  "startReturnFromReceipt",
  "startExchangeFromReceipt",
  "receivePurchaseOrder",
  "recordSupplierReturn",
  "saveStockCountSessionDraft",
  "commitStockCountSession",
  "issueInterStoreTransfer",
  "receiveInterStoreTransfer",
  "browseStoreReports",
  "printReceipt",
  "printAccountPaymentReceipt",
  "printShiftReport",
  "kickCashDrawer"
]) {
  requireIncludes(desktopRuntime, desktopAnchor, `desktop runtime must retain ${desktopAnchor}.`);
}

for (const desktopUiAnchor of [
  "Close shift",
  "Recall held",
  "Pending orders",
  "Account pay",
  "Returns",
  "Exchanges",
  "Supplier return",
  "Inter-store transfer",
  "Stock count"
]) {
  requireIncludes(desktopRenderer, desktopUiAnchor, `desktop UI baseline must retain ${desktopUiAnchor}.`);
}

requireIncludes(
  desktopRuntime,
  "deferInventoryValidationForSalesOrder?: boolean | null",
  "desktop runtime must expose deferred inventory validation for sales-order basket lines."
);
requireIncludes(
  desktopRenderer,
  'sellableOnly: saleMode !== "SALES_ORDER"',
  "desktop sales-order mode must browse the full active catalog."
);
requireIncludes(
  desktopRenderer,
  'deferInventoryValidationForSalesOrder: saleMode !== "SALE"',
  "desktop sales-order and layaway basket edits must defer inventory validation."
);
requireIncludes(
  desktopRenderer,
  `lineId: line.lineId,
        quantity: line.quantity,
        deferInventoryValidationForSalesOrder: saleMode !== "SALE",
        serialNumbers: line.serialNumbers,
        overrideDiscountAmount: discountAmount`,
  "desktop sales-order line discounts must not trigger inventory validation."
);
requireIncludes(
  desktopRenderer,
  'runtime.startSyncCycle && input.trigger !== "manual"',
  "manual desktop sync must execute immediately instead of waiting for a detached cycle."
);
requireIncludes(
  desktopRenderer,
  'setSnapshot(result.snapshot)',
  "manual desktop sync must refresh the signed-in renderer snapshot."
);

for (const [serviceName, serviceSource] of [
  ["SQLite", desktopSqliteService],
  ["PostgreSQL", desktopPostgresService],
  ["SQL Server", desktopMssqlService]
] as const) {
  requireIncludes(
    serviceSource,
    "input.deferInventoryValidationForSalesOrder === true",
    `${serviceName} basket service must recognize sales-order inventory deferral.`
  );
  requireIncludes(
    serviceSource,
    "!deferInventoryValidation",
    `${serviceName} basket service must retain normal sale inventory validation.`
  );
}

requireIncludes(
  desktopMssqlService,
  "queueMissingSalesOrderLineSnapshots",
  "SQL Server desktop sync must repair legacy sales-order events that omitted line snapshots."
);
requireIncludes(
  desktopMssqlService,
  "lines: this.toSalesOrderPayloadLines(lines)",
  "SQL Server sales-order lifecycle events must retain complete line snapshots."
);
requireIncludes(
  desktopMssqlService,
  "N':detail-repair'",
  "SQL Server sales-order line repair events must use a deterministic idempotency key."
);
requireIncludes(
  enterprisePosRepository,
  "getSalesOrderPayloadLines(syncTrail)",
  "HQ sales-order details must recover lines from retained inbound sync payloads."
);

for (const onlineRepositoryAnchor of [
  "readOnlineStoreBranding",
  "companyLogoUrl: optionalText(companySettings.companyLogoUrl)",
  "applyAutomaticPromotions",
  "calculateLoyaltyRedemption",
  "deriveCustomerAccountPostingEffect",
  "mustEnterPriceAtPos",
  "requiresReference",
  "requiresBankAccount",
  "allowChange",
  "creditLimitAmount",
  "taxInclusive",
  "managerApproval",
  "createOnlineStoreSale",
  "createOnlineStoreHeldSale",
  "createOnlineStoreSalesOrder",
  "cancelOnlineStoreSalesOrder",
  "recordOnlineStoreAccountPayment",
  "createOnlineStoreCorrection",
  "openOnlineStoreShift",
  "recordOnlineStoreEod",
  "recordOnlineStoreBanking",
  "createOnlineStoreGoodsReceipt",
  "createOnlineStoreSupplierReturn",
  "createOnlineStoreStockCount",
  "commitOnlineStoreStockCount",
  "createOnlineStoreTransferRequest",
  "processOnlineStoreTransfer",
  "browseOnlineStoreReports",
  "unlockOnlineStoreScreen",
  "normalizeSerialNumbers"
]) {
  requireIncludes(
    onlineRepository,
    onlineRepositoryAnchor,
    `online-store repository must retain ${onlineRepositoryAnchor}.`
  );
}

for (const directTransferAnchor of [
  'direction === "DIRECT_OUT"',
  '"inventory.transfer.issue"',
  "direct inter-store transfer out"
]) {
  requireIncludes(
    onlineRepository,
    directTransferAnchor,
    `online-store repository must retain direct transfer-out behavior: ${directTransferAnchor}.`
  );
}

for (const onlineUiAnchor of [
  "workspace.branding.companyLogoUrl",
  "rms-nav-icon",
  "holdSale",
  "resumeHeldSale",
  "saveSalesOrder",
  "cancelSalesOrder",
  "recordAccountPayment",
  "submitCorrection",
  "openShift",
  "recordEod",
  "recordBanking",
  "postGoodsReceipt",
  "postSupplierReturn",
  "postTransferRequest",
  "processTransferAction",
  "postStockCount",
  "Print X report",
  "Close shift",
  "Recall held",
  "Pending orders",
  "Account pay",
  "rms-top-product-feature"
]) {
  requireIncludes(onlineWorkspace, onlineUiAnchor, `online-store UI must retain ${onlineUiAnchor}.`);
}

for (const directTransferUiAnchor of ["Direct transfer out", "direction: transferCreationMode"]) {
  requireIncludes(
    onlineWorkspace,
    directTransferUiAnchor,
    `online-store workspace must retain direct transfer-out control: ${directTransferUiAnchor}.`
  );
}

requireIncludes(
  onlineRepository,
  "const catalogProducts = mappedProducts.map",
  "online-store workspace must retain the full active catalog."
);
requireIncludes(
  onlineRepository,
  "products: catalogProducts",
  "online-store workspace must return the full active catalog for order mode."
);
requireIncludes(
  onlineWorkspace,
  "? workspace.products",
  "online-store sales-order mode must expose the full active catalog."
);
requireIncludes(
  onlineWorkspace,
  ": workspace.products.filter(isSellableCatalogProduct)",
  "online-store normal sale mode must remain stock-filtered."
);
requireIncludes(
  onlineWorkspace,
  'saleMode === "SALE" &&',
  "online-store sales orders and layaways must defer matrix stock validation until fulfilment."
);
for (const layawayAnchor of [
  'type SaleMode = "SALE" | "SALES_ORDER" | "LAYAWAY"',
  "activateLayawayMode",
  "layawayMinimumDepositAmount",
  "openLayawayAction",
  'kind === "PAYMENT"',
  'kind === "RELEASE"',
  'kind === "EXPIRE"',
  "Payment history"
]) {
  requireIncludes(
    onlineWorkspace,
    layawayAnchor,
    `online-store Layaway UI must retain ${layawayAnchor}.`
  );
}
requireIncludes(
  onlineRepository,
  'by: ["productId", "productVariantId"]',
  "online-store fulfilment must validate the exact matrix variant stock position."
);
requireIncludes(
  onlineRepository,
  "productVariantCodeSnapshot: line.productVariant?.code ?? null",
  "online-store sales orders must retain their selected matrix variant."
);
const onlineSalesOrderStart = onlineRepository.indexOf(
  "export async function createOnlineStoreSalesOrder("
);
const onlineSalesOrderEnd = onlineRepository.indexOf(
  "export async function cancelOnlineStoreSalesOrder(",
  onlineSalesOrderStart
);
const onlineSalesOrderSource = onlineRepository.slice(onlineSalesOrderStart, onlineSalesOrderEnd);
requireExcludes(
  onlineSalesOrderSource,
  "assertOnlineStoreSaleStockAvailable(",
  "online-store sales-order creation must not validate stock before fulfilment."
);

for (const route of [
  "apps/enterprise-web/src/app/api/online-store/sales/route.ts",
  "apps/enterprise-web/src/app/api/online-store/held-sales/route.ts",
  "apps/enterprise-web/src/app/api/online-store/sales-orders/route.ts",
  "apps/enterprise-web/src/app/api/online-store/sales-orders/[orderId]/cancel/route.ts",
  "apps/enterprise-web/src/app/api/online-store/sales-orders/[orderId]/payments/route.ts",
  "apps/enterprise-web/src/app/api/online-store/sales-orders/[orderId]/release/route.ts",
  "apps/enterprise-web/src/app/api/online-store/sales-orders/[orderId]/expire/route.ts",
  "apps/enterprise-web/src/app/api/online-store/account-payments/route.ts",
  "apps/enterprise-web/src/app/api/online-store/corrections/route.ts",
  "apps/enterprise-web/src/app/api/online-store/shifts/open/route.ts",
  "apps/enterprise-web/src/app/api/online-store/eod/route.ts",
  "apps/enterprise-web/src/app/api/online-store/banking/route.ts",
  "apps/enterprise-web/src/app/api/online-store/goods-receipts/route.ts",
  "apps/enterprise-web/src/app/api/online-store/supplier-returns/route.ts",
  "apps/enterprise-web/src/app/api/online-store/stock-counts/route.ts",
  "apps/enterprise-web/src/app/api/online-store/stock-counts/[sessionId]/commit/route.ts",
  "apps/enterprise-web/src/app/api/online-store/transfers/route.ts",
  "apps/enterprise-web/src/app/api/online-store/transfers/[transferId]/issue/route.ts",
  "apps/enterprise-web/src/app/api/online-store/transfers/[transferId]/receive/route.ts",
  "apps/enterprise-web/src/app/api/online-store/reports/route.ts",
  "apps/enterprise-web/src/app/api/online-store/unlock/route.ts"
]) {
  requireFile(route);
}

for (const certificationAnchor of [
  "online store desktop parity",
  "FLASH_ERP_E2E_ONLINE_STORE_LOGIN",
  "branding logo, collapsed menu icons, and top products match desktop shell expectations",
  "core desktop operation surfaces are exposed in browser mode",
  "sale, hold recall, account payment, correction, inventory, EOD, and banking post successfully"
]) {
  requireIncludes(onlineSpec, certificationAnchor, `online-store E2E spec must retain ${certificationAnchor}.`);
}

requireIncludes(playwrightConfig, "online-store-parity", "Playwright browser project must include online-store parity spec.");

for (const ledgerAnchor of [
  "Desktop Is The Source Of Truth",
  "Functional Parity Areas",
  "Explicit Browser Exceptions",
  "Certification Rule",
  "acceptance:online-store-parity",
  "FLASH_ERP_E2E_ONLINE_STORE_LOGIN"
]) {
  requireIncludes(parityLedger, ledgerAnchor, `online-store parity ledger must retain ${ledgerAnchor}.`);
}

console.log("Flash ERP online-store desktop parity gate passed.");
