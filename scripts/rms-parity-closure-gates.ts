import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

function requireFile(relativePath: string) {
  const absolutePath = path.join(workspaceRoot, relativePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Parity closure gate is missing ${relativePath}.`);
  }

  return readFileSync(absolutePath, "utf8");
}

function requireIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`Parity closure gate failed: ${label}`);
  }
}

function requireScript(packageSource: string, scriptName: string, packageLabel: string) {
  const parsed = JSON.parse(packageSource) as {
    scripts?: Record<string, string>;
  };

  if (!parsed.scripts?.[scriptName]) {
    throw new Error(`${packageLabel} must expose script ${scriptName}.`);
  }
}

const rootPackage = requireFile("package.json");
const mobilePackage = requireFile("apps/mobile/package.json");
const checklist = requireFile("docs/08-ivend-parity-checklist.md");
const acceptanceMatrix = requireFile("docs/11-ivend-parity-acceptance-matrix.md");
const certificationPlan = requireFile("docs/12-production-certification-and-soak-plan.md");
const hardwareMatrix = requireFile("docs/13-desktop-hardware-certification-matrix.md");
const uatEvidenceLog = requireFile("docs/14-uat-evidence-log.md");
const productionHardeningPack = requireFile("docs/15-production-hardening-execution-pack.md");
const onlineStoreParityLedger = requireFile("docs/16-online-store-desktop-parity-ledger.md");
const authSession = requireFile("apps/enterprise-web/src/server/auth/enterprise-session.ts");
const securityRepository = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-security.repository.ts"
);
const securityWorkspace = requireFile(
  "apps/enterprise-web/src/components/enterprise/enterprise-security-workspace.tsx"
);
const securityPanel = requireFile(
  "apps/enterprise-web/src/components/enterprise/enterprise-security-panel.tsx"
);
const settingsRepository = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-settings.repository.ts"
);
const settingsWorkspace = requireFile(
  "apps/enterprise-web/src/components/enterprise/enterprise-settings-workspace.tsx"
);
const desktopSoakGate = requireFile("scripts/desktop-soak-gate.ts");
const syncHardeningGate = requireFile("scripts/sync-hardening-gates.ts");
const desktopStabilityGate = requireFile("scripts/desktop-stability-gates.ts");
const syncChaosGate = requireFile("scripts/sync-chaos-reconciliation-gate.ts");
const installedSoakGate = requireFile("scripts/installed-desktop-soak-evidence-gate.ts");
const securityProviderGate = requireFile("scripts/security-provider-certification-gate.ts");
const hardwareExecutionGate = requireFile("scripts/hardware-execution-evidence-gate.ts");
const functionalUatGate = requireFile("scripts/functional-uat-certification-gate.ts");
const databaseReadinessGate = requireFile("scripts/database-readiness-gate.ts");
const onlineStoreParityGate = requireFile("scripts/online-store-desktop-parity-gate.ts");
const databaseReadinessModule = requireFile(
  "apps/enterprise-web/src/server/readiness/enterprise-database-readiness.ts"
);
const financeRepository = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-finance.repository.ts"
);
const financeWorkspace = requireFile(
  "apps/enterprise-web/src/components/enterprise/enterprise-finance-workspace.tsx"
);
const predictiveRepository = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-predictive-purchasing.repository.ts"
);
const integrationQueries = requireFile(
  "apps/enterprise-web/src/server/integrations/integration-queries.ts"
);
const integrationOpenApi = requireFile("apps/enterprise-web/src/server/integrations/openapi.ts");

for (const scriptName of [
  "acceptance:rms",
  "smoke:desktop",
  "soak:desktop",
  "cert:hardware",
  "acceptance:parity",
  "acceptance:online-store-parity",
  "acceptance:sync-hardening",
  "acceptance:desktop-stability",
  "acceptance:sync-chaos",
  "cert:installed-soak",
  "cert:security-providers",
  "cert:hardware-execution",
  "cert:database-readiness",
  "acceptance:functional-uat",
  "acceptance:production-hardening",
  "acceptance:e2e",
  "e2e:browser",
  "e2e:electron",
  "e2e:certification"
]) {
  requireScript(rootPackage, scriptName, "Root package.json");
}

requireScript(mobilePackage, "typecheck", "Mobile package.json");

for (const route of [
  "apps/enterprise-web/src/app/api/settings/ldap/validate/route.ts",
  "apps/enterprise-web/src/app/api/settings/smtp/validate/route.ts",
  "apps/enterprise-web/src/app/api/settings/sms/validate/route.ts",
  "apps/enterprise-web/src/app/api/auth/mfa/verify/route.ts",
  "apps/enterprise-web/src/app/api/auth/step-up/route.ts",
  "apps/enterprise-web/src/app/api/setup/users/[userId]/unlock/route.ts"
]) {
  requireFile(route);
}

requireIncludes(acceptanceMatrix, "Omnichannel order flow is intentionally deferred", "matrix must preserve deferred omnichannel scope.");
requireIncludes(acceptanceMatrix, "Security users", "matrix must include security user acceptance.");
requireIncludes(acceptanceMatrix, "External integrations", "matrix must include external integration acceptance.");
requireIncludes(acceptanceMatrix, "Store Desktop", "matrix must include desktop acceptance.");
requireIncludes(certificationPlan, "Desktop Soak", "certification plan must include desktop soak.");
requireIncludes(certificationPlan, "External Services", "certification plan must include external service validation.");
requireIncludes(certificationPlan, "Packaging And Hardware", "certification plan must include packaging and hardware.");
requireIncludes(certificationPlan, "Mobile Assessment", "certification plan must include mobile assessment.");
requireIncludes(hardwareMatrix, "Device Matrix", "hardware matrix must include device matrix.");
requireIncludes(uatEvidenceLog, "Live UAT Checklist", "UAT evidence log must include live checklist.");
requireIncludes(uatEvidenceLog, "npm run e2e:electron", "UAT evidence log must include Electron E2E evidence.");
requireIncludes(productionHardeningPack, "Slice 1: Sync Chaos And Reconciliation", "production hardening pack must include sync chaos slice.");
requireIncludes(productionHardeningPack, "Slice 2: Installed Desktop Soak", "production hardening pack must include installed soak slice.");
requireIncludes(productionHardeningPack, "Slice 3: Security Provider Certification", "production hardening pack must include security provider slice.");
requireIncludes(productionHardeningPack, "Slice 4: Hardware Execution", "production hardening pack must include hardware execution slice.");
requireIncludes(productionHardeningPack, "Slice 5: Functional UAT Scripts", "production hardening pack must include functional UAT slice.");

requireIncludes(securityRepository, "mfaMode", "password policy must expose MFA mode.");
requireIncludes(securityRepository, "stepUpForSensitiveActions", "password policy must expose step-up controls.");
requireIncludes(securityRepository, "accountUnlockRequiresAdmin", "password policy must expose admin unlock posture.");
requireIncludes(securityRepository, "unlockEnterpriseRetailUser", "security repository must expose account unlock workflow.");
requireIncludes(securityWorkspace, "MFA mode", "password policy UI must expose MFA mode.");
requireIncludes(securityWorkspace, "Step-up for sensitive actions", "password policy UI must expose step-up controls.");
requireIncludes(securityWorkspace, "Security alert email", "password policy UI must expose alert routing.");
requireIncludes(securityPanel, "Unlock account", "user grid must expose account unlock action.");
requireIncludes(authSession, "verifyEnterpriseMfaChallenge", "auth layer must verify MFA challenges.");
requireIncludes(authSession, "assertEnterpriseStepUp", "auth layer must expose step-up enforcement.");

requireIncludes(settingsRepository, "validateEnterpriseLdapSettings", "LDAP validation must exist.");
requireIncludes(settingsRepository, "validateEnterpriseSmtpSettings", "SMTP validation must exist.");
requireIncludes(settingsRepository, "validateEnterpriseSmsSettings", "SMS validation must exist.");
requireIncludes(settingsWorkspace, "/api/settings/ldap/validate", "settings UI must call LDAP validation.");
requireIncludes(settingsWorkspace, "/api/settings/smtp/validate", "settings UI must call SMTP validation.");
requireIncludes(settingsWorkspace, "/api/settings/sms/validate", "settings UI must call SMS validation.");

requireIncludes(desktopSoakGate, "does not automatically create a new shift", "desktop soak gate must guard shift close behavior.");
requireIncludes(desktopSoakGate, "logged-in seller", "desktop soak gate must guard seller attribution.");
requireIncludes(syncHardeningGate, "sync.downstream-acknowledgement.rejected", "sync hardening gate must cover rejected downstream ACKs.");
requireIncludes(syncHardeningGate, "next_retry_at", "sync hardening gate must cover durable retry windows.");
requireIncludes(desktopStabilityGate, "rendererReadyTimeoutMs", "desktop stability gate must cover black-screen recovery.");
requireIncludes(desktopStabilityGate, "withDesktopTimeout", "desktop stability gate must cover sign-in stalls.");
requireIncludes(desktopStabilityGate, "rendererHeartbeatRecoveryMs", "desktop stability gate must cover stale heartbeat recovery.");
requireIncludes(desktopStabilityGate, "rendererRecoveryCooldownMs", "desktop stability gate must cover recovery loop throttling.");
requireIncludes(syncChaosGate, "CH-09 business reconciliation", "sync chaos gate must cover business reconciliation.");
requireIncludes(syncChaosGate, "canonical fact count", "sync chaos gate must guard double-post evidence.");
requireIncludes(installedSoakGate, "cert:installed-soak", "installed soak gate must be wired.");
requireIncludes(installedSoakGate, "no lost local queue rows", "installed soak gate must guard local queue survival.");
requireIncludes(securityProviderGate, "endpoint owner approval", "security provider gate must require endpoint owner approval.");
requireIncludes(securityProviderGate, "critical-security-events", "security provider gate must cover alert escalation.");
requireIncludes(hardwareExecutionGate, "Approved, declined, voided, and offline tender handling", "hardware execution gate must cover payment terminal outcomes.");
requireIncludes(hardwareExecutionGate, "driver evidence", "hardware execution gate must require driver evidence.");
requireIncludes(functionalUatGate, "FU-01 sale to GL", "functional UAT gate must cover sale to GL.");
requireIncludes(functionalUatGate, "FU-08 security journey", "functional UAT gate must cover security journey.");
requireIncludes(databaseReadinessGate, "ENTERPRISE_DATABASE_SCHEMA_NOT_READY", "database readiness gate must guard schema drift.");
requireIncludes(databaseReadinessGate, "assertLiveDatabaseReadiness", "database readiness gate must verify the live database.");
requireIncludes(onlineStoreParityGate, "createOnlineStoreSale", "online-store parity gate must cover browser sale posting.");
requireIncludes(onlineStoreParityGate, "createOnlineStoreCorrection", "online-store parity gate must cover browser returns and exchanges.");
requireIncludes(onlineStoreParityGate, "createOnlineStoreGoodsReceipt", "online-store parity gate must cover browser inventory receiving.");
requireIncludes(onlineStoreParityGate, "recordOnlineStoreEod", "online-store parity gate must cover browser shift close and EOD.");
requireIncludes(databaseReadinessModule, "gatewayProvider", "database readiness module must check tender gateway columns.");
requireIncludes(databaseReadinessModule, "OperatingExpense", "database readiness module must check operating expenses table.");
requireIncludes(financeRepository, "GlAccount", "HQ finance repository must manage GL accounts.");
requireIncludes(financeRepository, "POS_SALE", "HQ finance repository must post POS sales journals.");
requireIncludes(financeRepository, "INVENTORY_COGS", "HQ finance repository must post inventory COGS journals.");
requireIncludes(financeWorkspace, "Trial balance", "HQ finance workspace must expose trial balance.");
requireIncludes(financeWorkspace, "Coverage", "HQ finance workspace must expose posting coverage.");
requireIncludes(predictiveRepository, "weighted-moving-average-v1", "predictive purchasing must expose the demand forecast model.");
requireIncludes(predictiveRepository, "demandConfidence", "predictive purchasing must expose confidence scoring.");
requireIncludes(integrationQueries, "getIntegrationInventoryLedger", "integration API must expose stock ledger rows.");
requireIncludes(integrationQueries, "getIntegrationPriceListRows", "integration API must expose customer-group pricing rows.");
requireIncludes(integrationQueries, "getIntegrationCustomers", "integration API must expose customer master rows.");
requireIncludes(integrationQueries, "getIntegrationSuppliers", "integration API must expose supplier master rows.");
requireIncludes(integrationQueries, "getIntegrationTenderMethods", "integration API must expose tender gateway rows.");
requireIncludes(integrationQueries, "getIntegrationSalesTransactions", "integration API must expose sales transactions.");
requireIncludes(integrationQueries, "getIntegrationPurchaseOrders", "integration API must expose purchase orders.");
requireIncludes(integrationQueries, "getIntegrationOperatingExpenses", "integration API must expose operating expenses.");
requireIncludes(integrationQueries, "getIntegrationGlJournal", "integration API must expose GL journal export.");
requireIncludes(integrationOpenApi, "/api/integrations/v1/finance/gl-journal", "OpenAPI spec must document GL journal export.");
requireIncludes(integrationOpenApi, "/api/integrations/v1/catalog/prices", "OpenAPI spec must document price export.");
requireIncludes(integrationOpenApi, "/api/integrations/v1/master/customers", "OpenAPI spec must document customer export.");
requireIncludes(integrationOpenApi, "/api/integrations/v1/master/suppliers", "OpenAPI spec must document supplier export.");
requireIncludes(integrationOpenApi, "/api/integrations/v1/master/tender-methods", "OpenAPI spec must document tender gateway export.");
requireIncludes(integrationOpenApi, "/api/integrations/v1/sales/transactions", "OpenAPI spec must document sales transaction export.");
requireIncludes(integrationOpenApi, "/api/integrations/v1/purchases/purchase-orders", "OpenAPI spec must document purchase order export.");
requireIncludes(integrationOpenApi, "/api/integrations/v1/finance/operating-expenses", "OpenAPI spec must document operating expense import/export.");
requireIncludes(integrationOpenApi, "/api/system/database-readiness", "OpenAPI spec must document database readiness diagnostics.");
requireIncludes(checklist, "docs/11-ivend-parity-acceptance-matrix.md", "checklist must link acceptance matrix.");
requireIncludes(checklist, "docs/12-production-certification-and-soak-plan.md", "checklist must link certification plan.");
requireIncludes(checklist, "npm run acceptance:parity", "checklist must name parity gate.");
requireIncludes(checklist, "npm run soak:desktop", "checklist must name desktop soak gate.");
requireIncludes(checklist, "npm run acceptance:e2e", "checklist must name E2E gate.");
requireIncludes(checklist, "npm run cert:hardware", "checklist must name hardware gate.");
requireIncludes(checklist, "docs/14-uat-evidence-log.md", "checklist must link UAT evidence log.");
requireIncludes(onlineStoreParityLedger, "Desktop Is The Source Of Truth", "online-store parity ledger must preserve desktop baseline.");
requireIncludes(onlineStoreParityLedger, "Functional Parity Areas", "online-store parity ledger must list functional parity areas.");
requireIncludes(onlineStoreParityLedger, "Explicit Browser Exceptions", "online-store parity ledger must list browser exceptions.");
requireIncludes(onlineStoreParityLedger, "npm run acceptance:online-store-parity", "online-store parity ledger must name parity gate.");

console.log("Flash ERP parity closure gates passed.");
