import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

function requireFile(relativePath: string) {
  const absolutePath = path.join(workspaceRoot, relativePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Functional UAT gate is missing ${relativePath}.`);
  }

  return readFileSync(absolutePath, "utf8");
}

function requireIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`Functional UAT gate failed: ${label}`);
  }
}

const rootPackage = JSON.parse(requireFile("package.json")) as {
  scripts?: Record<string, string>;
};
const desktopRuntime = requireFile("apps/store-desktop/src/shared/desktop-runtime.ts");
const modernRenderer = requireFile("apps/store-desktop/src/renderer/modern-app.tsx");
const enterprisePos = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-pos.repository.ts"
);
const enterpriseInventory = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-inventory.repository.ts"
);
const enterpriseFinance = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-finance.repository.ts"
);
const enterpriseSetup = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-setup.repository.ts"
);
const e2eSpec = requireFile("tests/e2e/store-desktop.spec.ts");
const hardeningPack = requireFile("docs/15-production-hardening-execution-pack.md");
const uatEvidence = requireFile("docs/14-uat-evidence-log.md");
const acceptanceMatrix = requireFile("docs/11-ivend-parity-acceptance-matrix.md");
const certificationPlan = requireFile("docs/12-production-certification-and-soak-plan.md");

if (!rootPackage.scripts?.["acceptance:functional-uat"]) {
  throw new Error("Root package.json must expose acceptance:functional-uat.");
}

for (const workflow of [
  "openShift",
  "closeActiveShift",
  "checkoutActiveBasket",
  "startReturnFromReceipt",
  "startExchangeFromReceipt",
  "recordEodReconciliation",
  "recordBankingDeposit",
  "receivePurchaseOrder",
  "recordSupplierReturn",
  "saveStockCountSessionDraft",
  "submitStockCountSession",
  "commitStockCountSession",
  "saveInterStoreTransferRequestDraft",
  "submitInterStoreTransferRequestDraft",
  "issueInterStoreTransfer",
  "receiveInterStoreTransfer",
  "runSyncCycle"
]) {
  requireIncludes(desktopRuntime, workflow, `desktop runtime must expose ${workflow}.`);
}

for (const workflow of [
  "openShift",
  "closeShift",
  "checkoutBasket",
  "printReceipt",
  "printShiftReport",
  "recordEodReconciliation",
  "recordBankingDeposit",
  "receivePurchaseOrder",
  "recordSupplierReturn",
  "saveStockCountSessionDraft",
  "commitStockCountSession",
  "runSyncCycle"
]) {
  requireIncludes(modernRenderer, workflow, `modern renderer must wire ${workflow}.`);
}

requireIncludes(e2eSpec, "desktop sign-in -> open shift -> sale -> close shift -> sync", "Electron E2E spec must cover core trading path.");
requireIncludes(enterprisePos, "stock movements", "HQ POS detail must expose stock movement reconciliation.");
requireIncludes(enterpriseInventory, "Goods receipt", "HQ inventory must expose receiving reconciliation.");
requireIncludes(enterpriseInventory, "Stock count session", "HQ inventory must expose stock count reconciliation.");
requireIncludes(enterpriseFinance, "POS_SALE", "HQ finance must post sale source rows.");
requireIncludes(enterpriseFinance, "INVENTORY_RECEIPT", "HQ finance must post receipt source rows.");
requireIncludes(enterpriseFinance, "OPERATING_EXPENSE", "HQ finance must include expense source rows.");
requireIncludes(enterpriseSetup, "publish", "HQ setup must publish settings/master data to stores.");
requireIncludes(hardeningPack, "Slice 5: Functional UAT Scripts", "hardening pack must include functional UAT slice.");
requireIncludes(hardeningPack, "FU-01 sale to GL", "functional UAT must include sale to GL script.");
requireIncludes(hardeningPack, "FU-08 security journey", "functional UAT must include security journey script.");
requireIncludes(uatEvidence, "Functional UAT script execution", "UAT log must include functional script execution row.");
requireIncludes(uatEvidence, "FU-01 sale to GL", "UAT log must list the sale to GL script.");
requireIncludes(acceptanceMatrix, "Cross-System Scenarios", "acceptance matrix must keep cross-system scenario coverage.");
requireIncludes(certificationPlan, "Functional UAT must run", "certification plan must require scenario-based UAT.");

console.log("Functional UAT certification gate passed.");
