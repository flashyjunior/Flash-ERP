import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

function requireFile(relativePath: string) {
  const absolutePath = path.join(workspaceRoot, relativePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Online-store desktop parity gate is missing ${relativePath}.`);
  }

  return readFileSync(absolutePath, "utf8");
}

function requireIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
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
const onlineRepository = requireFile("apps/enterprise-web/src/server/repositories/online-store.repository.ts");
const onlineWorkspace = requireFile("apps/enterprise-web/src/components/enterprise/online-store-workspace.tsx");
const onlineSpec = requireFile("tests/e2e/online-store-parity.spec.ts");
const playwrightConfig = requireFile("playwright.config.ts");
const parityLedger = requireFile("docs/16-online-store-desktop-parity-ledger.md");

requireScript(rootPackage, "acceptance:online-store-parity");

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

for (const route of [
  "apps/enterprise-web/src/app/api/online-store/sales/route.ts",
  "apps/enterprise-web/src/app/api/online-store/held-sales/route.ts",
  "apps/enterprise-web/src/app/api/online-store/sales-orders/route.ts",
  "apps/enterprise-web/src/app/api/online-store/sales-orders/[orderId]/cancel/route.ts",
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
