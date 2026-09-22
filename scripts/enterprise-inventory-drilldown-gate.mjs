import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const missingFiles = [];

function read(relativePath) {
  const filePath = path.join(repositoryRoot, relativePath);

  if (!fs.existsSync(filePath)) {
    // Reported as a failed check below rather than thrown, so one missing file
    // still leaves the rest of the contract visible.
    missingFiles.push(relativePath);
    return "";
  }

  return fs.readFileSync(filePath, "utf8");
}

const checks = [];

function check(label, condition) {
  checks.push({ label, passed: Boolean(condition) });
}

const inventoryRepository = read(
  "apps/enterprise-web/src/server/repositories/enterprise-inventory.repository.ts"
);
const inventoryWorkspace = read(
  "apps/enterprise-web/src/components/enterprise/enterprise-inventory-workspace.tsx"
);
const serialDetailRoute = read("apps/enterprise-web/src/app/api/inventory/serial-detail/route.ts");
const posWorkspace = read(
  "apps/enterprise-web/src/components/enterprise/online-store-workspace.tsx"
);
const desktopApp = read("apps/store-desktop/src/renderer/modern-app.tsx");
const enterpriseReportingRepository = read(
  "apps/enterprise-web/src/server/repositories/enterprise-reporting.repository.ts"
);
const enterpriseReportingDashboard = read(
  "apps/enterprise-web/src/components/enterprise/enterprise-reporting-dashboard.tsx"
);
const onlineStoreRepository = read(
  "apps/enterprise-web/src/server/repositories/online-store.repository.ts"
);
const desktopRuntime = read("apps/store-desktop/src/shared/desktop-runtime.ts");
const desktopReportProviders = [
  "apps/store-desktop/src/main/offline/local-store-service.ts",
  "apps/store-desktop/src/main/mssql/mssql-store-service.ts",
  "apps/store-desktop/src/main/postgres/postgres-store-service.ts",
].map(read);
const purgeScopes = read("apps/enterprise-web/src/lib/security/data-purge-scopes.ts");
const purgeWorkspace = read(
  "apps/enterprise-web/src/components/enterprise/enterprise-security-workspace.tsx"
);
const purgeRepository = read(
  "apps/enterprise-web/src/server/repositories/enterprise-data-purge.repository.ts"
);
const dataPurgePermissionMigration = read(
  "prisma/migrations-sqlserver/20260922010000_data_purge_hq_admin_access/migration.sql"
);
const inventoryRows = `${inventoryRepository}\n${inventoryWorkspace}`;

check(
  "inventory repository exposes on-demand serial and batch detail",
  inventoryRepository.includes("export async function getEnterpriseInventorySerialDetail")
);
check(
  "detail is scoped to the primary enterprise node instead of a single store",
  /getEnterpriseInventorySerialDetail\([\s\S]*?retailOrgId: enterpriseNode\.retailOrgId/.test(
    inventoryRepository
  )
);
check(
  "detail query covers both serial units and batch/expiry rows",
  inventoryRepository.includes("prisma.inventorySerialUnit.findMany") &&
    inventoryRepository.includes("prisma.inventoryBatch.findMany")
);
check(
  "detail exposes truncation totals",
  inventoryRepository.includes("serialUnitTotal") && inventoryRepository.includes("batchTotal")
);
check(
  "inventory rows carry the tracking flags the drill-down needs",
  inventoryRows.includes("isSerialized") && inventoryRows.includes("trackExpiry")
);
check(
  "serial detail route requires inventory.view and reports failures with a message",
  serialDetailRoute.includes('assertEnterprisePermission(["inventory.view"])') &&
    serialDetailRoute.includes("message:")
);
check(
  "enterprise inventory workspace opens the drill-down from product and stock rows",
  inventoryWorkspace.includes("onRowSelect={(row) => {") &&
    (inventoryWorkspace.match(/openInventoryDrillDown\(\{/g) ?? []).length >= 2
);
check(
  "untracked rows keep their existing deep links instead of dead-clicking",
  inventoryWorkspace.includes("router.push(productCatalogHref(row.productCode))") &&
    inventoryWorkspace.includes("router.push(inventoryLocationHref(row.locationCode))")
);
check(
  "drill-down defaults to serials for serialized items and batches otherwise",
  inventoryWorkspace.includes('setInventoryDrillDownTab(target.isSerialized ? "serials" : "batches")') &&
    inventoryWorkspace.includes('setInventoryDrillDownSerialStatus("AVAILABLE")')
);
check(
  "drill-down surfaces read failures instead of showing an empty list",
  inventoryWorkspace.includes("inventoryDrillDownError") &&
    inventoryWorkspace.includes("retryInventoryDrillDown")
);
check(
  "existing catalogue and location deep links stay reachable inside drill-down rows",
  inventoryWorkspace.includes("Open catalog") && inventoryWorkspace.includes("Open location")
);
check(
  "Online POS inventory browser keeps its row drill-down",
  posWorkspace.includes("setInventoryDrillDown({") &&
    posWorkspace.includes("inventoryDrillDownSerialRows") &&
    posWorkspace.includes("inventoryDrillDownBatchRows")
);
check(
  "store desktop inventory browser keeps its row drill-down",
  desktopApp.includes("openInventoryDrillDown(item)") &&
    desktopApp.includes("renderInventoryDrillDownDialog()") &&
    desktopApp.includes("props.browseProductSerialUnits")
);
check(
  "store desktop drill-down reports registry failures instead of swallowing them",
  desktopApp.includes("inventoryDrillDownError")
);
check(
  "HQ reporting derives sold serial and batch rows from immutable sale snapshots",
  enterpriseReportingRepository.includes("soldInventoryTraceRows") &&
    enterpriseReportingRepository.includes("serialNumbersSnapshot") &&
    enterpriseReportingRepository.includes("batchAllocationsSnapshot")
);
check(
  "HQ reporting exposes the sold serials and batches drill-down",
  enterpriseReportingDashboard.includes('id: "soldInventoryTrace"') &&
    enterpriseReportingDashboard.includes("Sold serials and batches")
);
check(
  "Online POS reporting exposes sold serial and batch snapshots",
    onlineStoreRepository.includes("serialBatchRows") &&
    onlineStoreRepository.includes("serialNumbersSnapshot") &&
    onlineStoreRepository.includes("batchAllocationsSnapshot") &&
    posWorkspace.includes('activeReport === "serialsBatches"')
);
check(
  "Store Desktop report contract and navigation expose sold serials and batches",
  desktopRuntime.includes("serialBatchRows: StoreSerialBatchSalesReportRow[]") &&
    desktopApp.includes('reportKind: "serials-batches"') &&
    desktopApp.includes("report.serialBatchRows.map")
);
check(
  "Store Desktop inventory users can open the sold serial and batch report",
  /item\.id === "report-inventory"\s*\|\|\s*item\.id === "report-serials-batches"[\s\S]*?hasInventoryVisibility/.test(
    desktopApp
  )
);
check(
  "all Store Desktop database providers derive the report from sale snapshots",
  desktopReportProviders.every(
    (provider) =>
      provider.includes("mappedSerialBatchRows") &&
      provider.includes("readSerializedLineNumbers(row.serial_numbers_json)") &&
      provider.includes("readInventoryBatchAllocations(row.batch_allocations_json)") &&
      provider.includes("serialBatchRows: mappedSerialBatchRows")
  )
);
check(
  "security presents one explicit transactional purge checkbox",
  purgeWorkspace.includes("Clear all transactional data") &&
    purgeWorkspace.includes("toggleTransactionalPurge") &&
    purgeScopes.includes("transactionalPurgeScopeKeys")
);
check(
  "the server rejects master-data purge unless transactional cleanup is selected",
  purgeRepository.includes("const requested = new Set<EnterpriseDataPurgeScopeKey>()") &&
    purgeRepository.includes("selectedMasterScope && missingTransactionalScope")
);
check(
  "SQL Server deployment grants the data purge permission to existing HQ admins",
  dataPurgePermissionMigration.includes("security.data-purge.execute") &&
    dataPurgePermissionMigration.includes("HQ_ADMIN") &&
    dataPurgePermissionMigration.includes("NOT EXISTS")
);

for (const relativePath of missingFiles) {
  check(`expected file is present: ${relativePath}`, false);
}

const failures = checks.filter((entry) => !entry.passed);

for (const entry of checks) {
  process.stdout.write(`${entry.passed ? "PASS" : "FAIL"} ${entry.label}\n`);
}
process.stdout.write(
  `Inventory drill-down gate: ${checks.length - failures.length}/${checks.length} checks passed.\n`
);

if (failures.length > 0) {
  process.exitCode = 1;
}
