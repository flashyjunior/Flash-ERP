import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath: string) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Missing capacity artifact: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

function requireIncludes(content: string, expected: string, message: string) {
  if (!content.includes(expected)) throw new Error(message);
}

const plan = read("docs/16-enterprise-capacity-and-performance-plan.md");
const cache = read("apps/enterprise-web/src/server/performance/enterprise-read-cache.ts");
const sharedCache = read("apps/enterprise-web/src/server/performance/enterprise-shared-cache.ts");
const distributedRateLimit = read("apps/enterprise-web/src/server/performance/enterprise-distributed-rate-limit.ts");
const runtime = read("apps/enterprise-web/src/server/performance/enterprise-runtime-capacity.ts");
const prisma = read("apps/enterprise-web/src/lib/db/prisma.ts");
const health = read("apps/enterprise-web/src/app/api/system/runtime-capacity/route.ts");
const warmup = read("apps/enterprise-web/src/app/api/system/warmup/route.ts");
const proxy = read("apps/enterprise-web/src/proxy.ts");
const loadRunner = read("scripts/enterprise-capacity-load-test.mjs");
const soakRunner = read("scripts/enterprise-capacity-soak-test.mjs");
const queryAudit = read("scripts/enterprise-query-budget-audit.ts");
const pagination = read("apps/enterprise-web/src/server/performance/enterprise-pagination.ts");
const dataGrid = read("apps/enterprise-web/src/components/data-grid/data-grid.tsx");
const capacityTestUser = read("scripts/enterprise-capacity-test-user.ts");
const authSession = read("apps/enterprise-web/src/server/auth/enterprise-session.ts");
const clusterLauncher = read("scripts/start-enterprise-web-cluster.mjs");
const productionServer = read("scripts/start-enterprise-web.mjs");
const ecommerceSchema = read("prisma/schema.prisma");
const ecommerceOrders = read("apps/enterprise-web/src/server/ecommerce/ecommerce.repository.ts");
const ecommercePayments = read("apps/enterprise-web/src/server/ecommerce/ecommerce-payments.ts");
const financeRepository = read("apps/enterprise-web/src/server/repositories/enterprise-finance.repository.ts");
const catalogRepository = read("apps/enterprise-web/src/server/repositories/enterprise-catalog.repository.ts");
const inventoryRepository = read("apps/enterprise-web/src/server/repositories/enterprise-inventory.repository.ts");
const purchasesRepository = read("apps/enterprise-web/src/server/repositories/enterprise-purchases.repository.ts");
const financePage = read("apps/enterprise-web/src/app/finance/page.tsx");
const reportsPage = read("apps/enterprise-web/src/app/reports/page.tsx");
const reportingDashboard = read("apps/enterprise-web/src/components/enterprise/enterprise-reporting-dashboard.tsx");
const overviewDashboard = read("apps/enterprise-web/src/components/enterprise/enterprise-overview-dashboard.tsx");
const clientWorkspaceBoundary = read("apps/enterprise-web/src/components/layouts/enterprise-client-workspace-boundary.tsx");
const writeGuardAudit = read("scripts/enterprise-write-guard-audit.ts");
const authenticatedReadEntryPoints = [
  "apps/enterprise-web/src/app/page.tsx",
  "apps/enterprise-web/src/app/api/search/route.ts",
  "apps/enterprise-web/src/app/api/alerts/route.ts",
  "apps/enterprise-web/src/app/catalog/page.tsx",
  "apps/enterprise-web/src/app/inventory/products/page.tsx",
  "apps/enterprise-web/src/app/purchases/purchase-orders/page.tsx",
  "apps/enterprise-web/src/app/finance/page.tsx",
  "apps/enterprise-web/src/app/reports/page.tsx",
  "apps/enterprise-web/src/app/security/[view]/page.tsx",
  "apps/enterprise-web/src/app/sync/page.tsx",
  "apps/enterprise-web/src/app/master/[view]/page.tsx",
  "apps/enterprise-web/src/app/online-store/page.tsx"
];

for (const workload of ["dashboard", "catalog", "inventory", "purchasing", "finance", "reporting", "security", "sync", "ecommerce"]) {
  requireIncludes(plan.toLowerCase(), workload, `Capacity plan must include ${workload}.`);
}
requireIncludes(cache, "staleWhileRevalidateMs", "Read cache must support bounded stale-while-revalidate.");
requireIncludes(cache, "existing?.pending", "Read cache must coalesce concurrent cache misses.");
if (cache.indexOf("existing?.value !== undefined && existing.staleUntil > now") > cache.indexOf("existing?.pending")) {
  throw new Error("Stale reads must remain non-blocking while a refresh is pending.");
}
requireIncludes(sharedCache, "FLASH_ERP_REDIS_URL", "Shared cache must support an explicit Redis endpoint.");
requireIncludes(sharedCache, "client.set(lockKey", "Shared cache misses must use a distributed load lock.");
requireIncludes(sharedCache, 'NX: true', "Shared cache load locks must be atomic.");
requireIncludes(sharedCache, ':invalidate', "Shared cache must publish cross-worker invalidations.");
requireIncludes(sharedCache, "generation:global", "Shared cache must support versioned invalidation.");
requireIncludes(distributedRateLimit, "client.eval(", "Rate limits must use an atomic Redis operation.");
requireIncludes(distributedRateLimit, "enforceLocal", "Rate limits must retain bounded local fallback protection.");
requireIncludes(distributedRateLimit, "hashIdentity", "Rate-limit keys must not retain raw client identities.");
requireIncludes(runtime, "TRANSACTIONAL_WRITE", "Runtime capacity must distinguish transactional writes.");
requireIncludes(runtime, "FLASH_ERP_CAPACITY_MAX_QUEUE", "Runtime capacity must bound queued requests.");
requireIncludes(
  authSession,
  "FLASH_ERP_SESSION_READ_CACHE_MS",
  "Enterprise session reads must coalesce short authenticated request bursts."
);
requireIncludes(
  authSession,
  "staleWhileRevalidateMs: 0",
  "Enterprise session reads must never serve stale-while-revalidate authorization state."
);
requireIncludes(prisma, "FLASH_ERP_DB_POOL_MAX", "Enterprise SQL pool maximum must be configurable.");
requireIncludes(prisma, "onPoolError", "Enterprise SQL pool errors must be observable.");
requireIncludes(prisma, 'client.$on("query"', "Enterprise SQL query duration must be observable.");
requireIncludes(runtime, "databaseSlowQueryCount", "Runtime capacity must count slow database queries.");
requireIncludes(health, "getEnterpriseRuntimeCapacitySnapshot", "Runtime capacity health endpoint must expose runtime metrics.");
requireIncludes(proxy, 'requestHeaders.set("x-request-id"', "All enterprise requests must receive a correlation ID.");
requireIncludes(proxy, "ENTERPRISE_RATE_LIMITED", "Sensitive enterprise endpoints must return an explicit rate-limit response.");
requireIncludes(proxy, 'response.headers.set("retry-after"', "Rate-limited clients must receive retry guidance.");
requireIncludes(loadRunner, 'method: "GET"', "The standard capacity runner must remain GET-only.");
requireIncludes(loadRunner, "FLASH_ERP_CAPACITY_HQ_PATHS", "Capacity runner must support authenticated HQ read routes.");
requireIncludes(loadRunner, "FLASH_ERP_CAPACITY_INCLUDE_PUBLIC", "Capacity runner must support focused HQ-only tests.");
requireIncludes(loadRunner, "FLASH_ERP_CAPACITY_MIXED_HQ", "Capacity runner must support simultaneous mixed HQ workloads.");
requireIncludes(health, "saturated", "Runtime capacity health must expose operation saturation.");
requireIncludes(clusterLauncher, "FLASH_ERP_WEB_WORKERS", "Enterprise deployment must support configurable web workers.");
requireIncludes(clusterLauncher, "cluster.disconnect", "Enterprise web workers must support graceful draining.");
requireIncludes(clusterLauncher, "beginWarmupWhenListening", "Enterprise workers must warm read models before traffic admission.");
requireIncludes(clusterLauncher, "broadcastReadiness(false)", "Worker replacement must close cluster readiness.");
requireIncludes(clusterLauncher, "warmedRuntimeIds.size < workerCount", "Every configured worker must complete startup warm-up.");
requireIncludes(productionServer, "ENTERPRISE_STARTING", "Cold Enterprise workers must reject ordinary traffic with retry guidance.");
requireIncludes(productionServer, 'requestPath === "/api/system/warmup"', "The internal warm-up route must remain reachable while readiness is closed.");
requireIncludes(warmup, "timingSafeEqual", "Startup warm-up must require a timing-safe internal token.");
requireIncludes(warmup, "getEnterpriseOperationsDashboard", "Startup warm-up must include the Enterprise dashboard.");
requireIncludes(warmup, "getEnterpriseFinanceWorkspace", "Startup warm-up must include Finance.");
requireIncludes(loadRunner, "workerDistribution", "Capacity evidence must prove worker traffic distribution.");
requireIncludes(loadRunner, "buildBalancedRouteSchedule", "Mixed-route tests must avoid route-to-worker pinning.");
requireIncludes(loadRunner, "routeShuffleSeed", "Mixed-route evidence must record its deterministic shuffle seed.");
requireIncludes(soakRunner, 'method: "GET"', "The standard soak runner must remain GET-only.");
requireIncludes(soakRunner, "FLASH_ERP_SOAK_USERS", "The soak runner must support configurable virtual users.");
requireIncludes(soakRunner, "FLASH_ERP_SOAK_RAMP_SECONDS", "The soak runner must ramp users into the workload.");
requireIncludes(soakRunner, "FLASH_ERP_SOAK_THINK_MIN_MS", "The soak runner must model user think time.");
requireIncludes(soakRunner, "workerDistribution", "Soak evidence must prove worker traffic distribution.");
requireIncludes(soakRunner, "runtimeSnapshot", "Soak evidence must include runtime health before and after the workload.");
requireIncludes(ecommerceSchema, "checkoutRequestKey", "Ecommerce checkout must persist an idempotency key.");
requireIncludes(ecommerceSchema, "initializationRequestKey", "Payment initialization must persist an idempotency key.");
requireIncludes(ecommerceOrders, "checkoutRequestHash", "Checkout retries must verify the original request payload.");
requireIncludes(ecommercePayments, "initializationRequestHash", "Payment retries must verify the original request payload.");
requireIncludes(writeGuardAudit, "TRANSACTIONAL_WRITE", "Mutation audit must detect the shared transactional guard.");
requireIncludes(writeGuardAudit, "POST", "Mutation audit must cover POST handlers.");
requireIncludes(writeGuardAudit, "PATCH", "Mutation audit must cover PATCH handlers.");
requireIncludes(writeGuardAudit, "DELETE", "Mutation audit must cover DELETE handlers.");
requireIncludes(productionServer, "FLASH_ERP_HTTP_WRITE_CONCURRENCY", "Production server must bound all HTTP mutations.");
requireIncludes(productionServer, '"apps", "enterprise-web"', "Production server must resolve the Enterprise build directory explicitly.");
requireIncludes(productionServer, "ENTERPRISE_WRITE_CAPACITY_BUSY", "Production server must identify write overload responses.");
requireIncludes(productionServer, '"retry-after": "2"', "Write overload responses must guide safe retries.");
requireIncludes(queryAudit, '"UNBOUNDED"', "Query-budget audit must classify unbounded queries.");
requireIncludes(queryAudit, "hasTake", "Query-budget audit must inspect direct row limits.");
requireIncludes(pagination, "[25, 50, 100]", "Enterprise list page sizes must remain explicitly bounded.");
requireIncludes(pagination, ".slice(0, 120)", "Enterprise list searches must remain length-bounded.");
requireIncludes(dataGrid, "manualPagination: Boolean(serverPagination)", "Enterprise grids must support server pagination.");
requireIncludes(catalogRepository, "skip: productPage.skip", "Catalog products must be server paged.");
requireIncludes(catalogRepository, "take: productPage.pageSize", "Catalog products must enforce the requested bounded page size.");
requireIncludes(inventoryRepository, "matchingProductRows.slice", "Inventory products must be paged before browser hydration.");
requireIncludes(purchasesRepository, "skip: purchaseOrderPage.skip", "Purchase orders must be server paged.");
requireIncludes(purchasesRepository, "take: purchaseOrderPage.pageSize", "Purchase orders must enforce the requested bounded page size.");
for (const pageField of ["journalPage", "journalLinePage", "expensePage"]) {
  requireIncludes(financeRepository, `skip: ${pageField}.skip`, `Finance ${pageField} must be server paged.`);
  requireIncludes(financeRepository, `take: ${pageField}.pageSize`, `Finance ${pageField} must enforce a bounded page size.`);
}
requireIncludes(financeRepository, "getPostedSourceIds", "Finance refresh must bulk-select posted sources.");
requireIncludes(
  financeRepository,
  "postedSourceIds.has(id)",
  "Finance refresh must remove posted sources before per-record reconciliation."
);
requireIncludes(
  financeRepository,
  "reconcileEnterpriseFinancePostings",
  "Legacy finance reconciliation must remain an explicit operation."
);
const financeReadBody = financeRepository.slice(
  financeRepository.indexOf("export async function getEnterpriseFinanceWorkspace")
);
if (financeReadBody.includes("materializeGlPostings({")) {
  throw new Error("The Finance workspace GET path must not materialize legacy postings.");
}
requireIncludes(financePage, "ttlMs: 30_000", "Finance reads must retain a multi-worker cache window.");
requireIncludes(reportsPage, "catalogOnly", "The Reports catalog must not eagerly execute every report.");
requireIncludes(reportsPage, "ttlMs: 60_000", "Executed report reads must retain a multi-worker cache window.");
requireIncludes(reportingDashboard, "router.push(`/reports?", "Opening a report must execute it on demand.");
requireIncludes(overviewDashboard, "chartsReady", "Dashboard charts must defer until client dimensions exist.");
requireIncludes(clientWorkspaceBoundary, "useEffect(() => setReady(true)", "Heavy workspaces must defer interactive grid rendering to the client.");
for (const entryPoint of [
  "apps/enterprise-web/src/app/page.tsx",
  "apps/enterprise-web/src/app/catalog/page.tsx",
  "apps/enterprise-web/src/app/inventory/products/page.tsx",
  "apps/enterprise-web/src/app/purchases/purchase-orders/page.tsx",
  "apps/enterprise-web/src/app/finance/page.tsx",
  "apps/enterprise-web/src/app/reports/page.tsx"
]) {
  requireIncludes(
    read(entryPoint),
    "EnterpriseClientWorkspaceBoundary",
    `${entryPoint} must not server-render its complete interactive grid workspace.`
  );
}
requireIncludes(capacityTestUser, 'action !== "provision" && action !== "disable"', "Capacity test users must require an explicit lifecycle action.");
requireIncludes(capacityTestUser, "passwordHash: null", "Capacity test cleanup must remove the temporary credential.");
requireIncludes(capacityTestUser, "retailUserSession.updateMany", "Capacity test cleanup must revoke active sessions.");
for (const entryPoint of authenticatedReadEntryPoints) {
  requireIncludes(
    read(entryPoint),
    "runEnterpriseOperation",
    `${entryPoint} must use the shared authenticated-read capacity guard.`
  );
  requireIncludes(
    read(entryPoint),
    '"AUTHENTICATED_READ"',
    `${entryPoint} must classify the guarded work as an authenticated read.`
  );
}

process.stdout.write("Enterprise capacity hardening gate passed.\n");
