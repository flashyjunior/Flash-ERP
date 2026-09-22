import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  createTrialOwnerActivationToken,
  readTrialOwnerActivationToken,
} from "../apps/enterprise-web/src/server/trials/trial-owner-token";
import {
  mssqlConnectionString,
  parseSqlServerUrl,
  prismaSqlServerUrl,
} from "./trial-sqlserver-url";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");
const requireIncludes = (source: string, value: string, message: string) => {
  assert.ok(source.includes(value), message);
};

const schema = read("prisma/schema.prisma");
const migration = read(
  "prisma/migrations-sqlserver/20260827010000_trial_workspace_lifecycle/migration.sql",
);
const conversionMigration = read(
  "prisma/migrations-sqlserver/20260922020000_trial_paid_conversion/migration.sql",
);
const supportFullAccessMigration = read(
  "prisma/migrations-sqlserver/20260922050000_flash_support_full_access/migration.sql",
);
const worker = read("scripts/trial-workspace-provisioner-worker.ts");
const service = read("scripts/run-trial-provisioner-service.mjs");
const runtime = read("scripts/run-trial-workspace-service.mjs");
const manager = read("scripts/manage-flash-erp-trial-workspace.ps1");
const auth = read("apps/enterprise-web/src/server/auth/enterprise-session.ts");
const access = read(
  "apps/enterprise-web/src/server/trials/trial-workspace-access.ts",
);
const activation = read(
  "apps/enterprise-web/src/server/trials/trial-owner-activation.ts",
);
const activationPage = read(
  "apps/enterprise-web/src/app/trial/activate/page.tsx",
);
const activationRoute = read(
  "apps/enterprise-web/src/app/api/trials/activate/route.ts",
);
const signInPage = read(
  "apps/enterprise-web/src/app/sign-in/sign-in-client.tsx",
);
const callback = read("apps/enterprise-web/src/server/trials/trial-signup.ts");
const extensionRoute = read(
  "apps/enterprise-web/src/app/api/trials/admin/[requestId]/extend/route.ts",
);
const conversionRoute = read(
  "apps/enterprise-web/src/app/api/trials/admin/[requestId]/convert/route.ts",
);
const lifecycle = read(
  "apps/enterprise-web/src/server/trials/trial-lifecycle.ts",
);
const sampleData = read(
  "apps/enterprise-web/src/server/trials/trial-sample-data.ts",
);
const readiness = read(
  "apps/enterprise-web/src/server/readiness/enterprise-database-readiness.ts",
);
const readinessGate = read("scripts/database-readiness-gate.ts");
const envExample = read(".env.example");
const passwordResetRelay = read(
  "apps/enterprise-web/src/server/trials/trial-password-reset-relay.ts",
);
const deployer = read("scripts/deploy-flash-erp-vps-release.ps1");
const packager = read("scripts/package-flash-erp-vps-release.ps1");
const packageSmoke = read("scripts/smoke-flash-erp-vps-release-package.ps1");

for (const model of ["TrialLifecycleEvent", "TrialWorkspaceRuntime"]) {
  requireIncludes(
    schema,
    `model ${model}`,
    `${model} must be persisted by Prisma.`,
  );
}
for (const table of ["trial_lifecycle_event", "trial_workspace_runtime"]) {
  requireIncludes(
    migration,
    `OBJECT_ID(N'[dbo].[${table}]'`,
    `${table} migration must be idempotent.`,
  );
}
for (const column of [
  "convertedAt",
  "convertedBy",
  "subscriptionPlanCode",
  "subscriptionReference",
  "subscriptionLicensedUntil",
  "retainSupportAccess",
  "supportAccessExpiresAt",
  "supportApprovalReference",
]) {
  requireIncludes(schema, column, `Trial conversion schema must persist ${column}.`);
  requireIncludes(
    conversionMigration,
    `N'${column}'`,
    `Trial conversion migration must add ${column} idempotently.`,
  );
}
for (const key of [
  "FLASH_ERP_TRIAL_PROVISIONER_ENABLED",
  "FLASH_ERP_TRIAL_SQL_ADMIN_URL",
  "FLASH_ERP_TRIAL_RUNTIME_ROOT",
  "FLASH_ERP_TRIAL_PUBLIC_URL_TEMPLATE",
  "FLASH_ERP_TRIAL_PORT_START",
  "FLASH_ERP_TRIAL_PORT_END",
]) {
  requireIncludes(envExample, key, `${key} must be documented.`);
}

requireIncludes(
  worker,
  "CREATE DATABASE",
  "Provisioning must create a dedicated SQL Server database.",
);
requireIncludes(
  worker,
  '"migrate", "deploy"',
  "Each child database must receive governed migrations.",
);
requireIncludes(
  worker,
  "securityPermissionCatalog",
  "The owner role must receive the complete permission catalog.",
);
requireIncludes(
  worker,
  "UserAccountStatus.INVITED",
  "The owner must start as an invited account.",
);
requireIncludes(
  worker,
  "workspaceDatabaseName",
  "The control plane must retain the child database identity.",
);
requireIncludes(
  worker,
  "recoverPendingProvisioning",
  "Verified handoffs must recover after a provisioner restart.",
);
requireIncludes(
  worker,
  'status: { in: ["AWAITING_PROVISIONER", "PROVISIONING"] }',
  "Recovery must cover queued and interrupted provisioning.",
);
requireIncludes(
  worker,
  'failureCode: "WORKSPACE_PROVISIONING_FAILED"',
  "A failed provisioning handoff must be recoverable after correction.",
);
requireIncludes(
  worker,
  'manageRuntime("Stop"',
  "The expiry sweep must stop the isolated runtime.",
);
requireIncludes(
  worker,
  'lifecycleAction: "EXTENDED"',
  "The provisioner must implement trial extension.",
);
requireIncludes(
  worker,
  'command === "convert"',
  "The provisioner worker must expose paid conversion.",
);
requireIncludes(
  worker,
  'command === "set-public-url"',
  "The provisioner worker must expose a governed custom-domain operation.",
);
requireIncludes(
  worker,
  "workspaceUrl: row.workspaceUrl",
  "Runtime reconciliation must preserve a workspace-specific public URL.",
);
requireIncludes(
  worker,
  'eventType: "PUBLIC_URL_CHANGED"',
  "Custom-domain changes must be recorded in the trial lifecycle audit.",
);
requireIncludes(
  worker,
  'writeWorkspaceEnvironment(\n    {\n      requestId: row.id',
  "A custom-domain change must rewrite the isolated runtime environment.",
);
requireIncludes(
  worker,
  'status: "CONVERTED"',
  "Paid conversion must persist the child runtime conversion state.",
);
requireIncludes(
  worker,
  'licenseStatus: "LICENSED"',
  "Paid conversion must license stores, warehouses, and terminals.",
);
requireIncludes(
  worker,
  'const paidLicenseKey = `PAID-${crypto',
  "Paid conversion must derive an opaque stable license key.",
);
requireIncludes(
  worker,
  "tx.licenseEvent.createMany",
  "Paid conversion must retain Store and Terminal license history.",
);
requireIncludes(
  worker,
  "retailUserSession.updateMany",
  "Paid conversion must be able to revoke retained support sessions selectively.",
);
requireIncludes(
  worker,
  "const trialSupportPermissionCodes = securityPermissionCatalog.map(",
  "Trial support must derive full access from the authoritative permission catalog.",
);
for (const fullAccessPermission of [
  "security.data-purge.execute",
  "security.user.manage",
  "security.role.manage",
  "security.privilege.manage",
  "finance.manage",
  "finance.post",
  "finance.approve",
  "finance.setup.manage",
  "fuel.hq.manage",
]) {
  requireIncludes(
    read("packages/domain/src/security-permissions.ts"),
    `code: "${fullAccessPermission}"`,
    `The full Flash support catalog must include ${fullAccessPermission}.`,
  );
}
requireIncludes(
  supportFullAccessMigration,
  "CROSS JOIN [dbo].[Permission] AS [permission]",
  "Existing Flash support roles must receive every persisted permission.",
);
requireIncludes(
  supportFullAccessMigration,
  "[role].[code] = N'FLASH_SUPPORT'",
  "The full-access migration must target only the Flash support role.",
);
requireIncludes(
  worker,
  "permissionCodes: trialSupportPermissionCodes",
  "Converted support reconciliation must retain the same full permission set.",
);
requireIncludes(
  worker,
  "reconcilePaidConversions",
  "Governed reconciliation must repair partial paid conversions.",
);
requireIncludes(
  worker,
  "FLASH_ERP_TRIAL_EXPOSE_ACTIVATION",
  "Activation links may only be exposed behind the local UAT gate.",
);
requireIncludes(
  worker,
  "html: `<!doctype html>",
  "Activation email must include an HTML alternative.",
);
requireIncludes(
  worker,
  "Set Enterprise password",
  "Activation email must include an Enterprise action button.",
);
requireIncludes(
  worker,
  "Set Online Store password",
  "Activation email must include an Online Store action button.",
);
requireIncludes(
  worker,
  "Login ID",
  "Activation email must identify both account login IDs.",
);
requireIncludes(
  worker,
  'storeMode: "ONLINE_DIRECT"',
  "Trial bootstrap must create an eligible Online Store branch.",
);
requireIncludes(
  worker,
  "trialStorefrontSettings",
  "Trial bootstrap must centralize the public Online Store contract.",
);
requireIncludes(
  worker,
  "ecommerceEnabled: true",
  "The trial Online Store must be publicly enabled.",
);
requireIncludes(
  worker,
  "ecommerceSlug: input.workspaceSlug",
  "The public storefront must use the allocated workspace slug.",
);
requireIncludes(
  worker,
  "reconcileActiveWorkspaces",
  "Existing active trial storefronts must be repairable after deployment.",
);
requireIncludes(
  worker,
  "const databaseUrl = childDatabaseUrl(row.workspaceDatabaseName);\n      await applyMigrations(databaseUrl);",
  "Active trial reconciliation must apply current migrations before repairing and restarting a workspace.",
);
requireIncludes(
  worker,
  "const repairedOnlineStore = await tx.store.upsert",
  "Active trial reconciliation must recreate a missing legacy Online Store branch.",
);
requireIncludes(
  worker,
  "const repairedOnlineWarehouse = await tx.warehouse.upsert",
  "Active trial reconciliation must recreate the Online Store warehouse.",
);
requireIncludes(
  worker,
  'code: "ONLINE-SALES"',
  "Active trial reconciliation must recreate the Online Store inventory location.",
);
requireIncludes(
  worker,
  'command === "reconcile-active"',
  "The provisioner worker must expose active storefront reconciliation.",
);
requireIncludes(
  worker,
  'code: "ONLINE_STORE_SUPERVISOR"',
  "Trial bootstrap must grant the Online Store login role.",
);
requireIncludes(
  worker,
  "onlineStoreActivationToken",
  "Trial bootstrap must issue a separate Online Store activation token.",
);
requireIncludes(
  service,
  'const host = "127.0.0.1"',
  "The provisioner listener must remain loopback-only.",
);
requireIncludes(
  service,
  "verifyRequest",
  "Provisioner commands must verify their signature.",
);
requireIncludes(
  service,
  'enqueue("recover")',
  "The provisioner service must schedule persisted handoff recovery.",
);
requireIncludes(
  service,
  'enqueue("recover-failed")',
  "Startup must retry recoverable failed provisioning once.",
);
requireIncludes(
  service,
  'enqueue("reconcile-active")',
  "Startup must reconcile active trial storefront ownership.",
);
requireIncludes(
  service,
  '"/convert"',
  "The signed provisioner service must expose the conversion endpoint.",
);
requireIncludes(
  service,
  'reconciliation.status = "succeeded"',
  "Provisioner health must retain successful active-workspace reconciliation evidence.",
);
requireIncludes(
  service,
  "scheduleReconciliationRetry();",
  "The provisioner must schedule an active-workspace retry after a startup reconciliation failure.",
);
requireIncludes(
  service,
  'enqueue("reconcile-active");\n  }, 60_000)',
  "Failed active-workspace reconciliation must retry after a bounded delay.",
);
requireIncludes(
  worker,
  'await manageRuntime("Ensure", allocation)',
  "Active trial reconciliation must refresh each isolated runtime from the corrected release.",
);
requireIncludes(
  worker,
  'eventType: "RUNTIME_REFRESHED"',
  "Active trial runtime refresh must leave control-plane lifecycle evidence.",
);
requireIncludes(
  worker,
  "FLASH_ERP_TRIAL_CONTROL_PLANE_URL:",
  "New child workspace environments must retain the internal control-plane URL.",
);
requireIncludes(
  passwordResetRelay,
  "deliverTrialPasswordResetFromWorkspace",
  "Trial workspaces must have an authenticated control-plane password-reset relay.",
);
requireIncludes(
  deployer,
  'Stop-ManagedProcessByScript -InstallRoot $installRoot -ScriptName "run-trial-provisioner-service.mjs"',
  "Deployment must stop an orphaned prior provisioner before starting the new release.",
);
requireIncludes(
  deployer,
  "Wait-ForTrialProvisioner",
  "Deployment must verify that the new release owns the trial provisioner.",
);
requireIncludes(
  deployer,
  '[string]$health.reconciliation.status -ne "succeeded"',
  "Deployment must wait for active trial migration and runtime refresh, not only provisioner liveness.",
);
for (const provisionerRuntimeFile of [
  "trial-support.ts",
  "trial-support-credentials-core.ts",
  "trial-sample-data.ts",
  "trial-sample-catalog.ts",
]) {
  requireIncludes(
    packager,
    provisionerRuntimeFile,
    `The VPS package must carry trial provisioner dependency ${provisionerRuntimeFile}.`,
  );
}
requireIncludes(
  deployer,
  'requiredTrialProvisionerFiles',
  "Deployment must validate the complete trial provisioner runtime-file contract.",
);
requireIncludes(
  packageSmoke,
  "PACKAGED_TRIAL_PROVISIONER_MODULE_RESOLUTION=OK",
  "Release packaging must execute a no-write trial provisioner module-resolution smoke.",
);
requireIncludes(
  worker,
  'process.env.FLASH_ERP_TRIAL_PROVISIONER_MODULE_SMOKE !== "true"',
  "The no-write provisioner module smoke must remain explicitly gated.",
);
requireIncludes(
  runtime,
  "FLASH_ERP_TRIAL_WORKSPACE_MODE",
  "Child runtimes must require their trial marker.",
);
requireIncludes(
  manager,
  "Assert-ChildPath",
  "Trial runtime paths must be containment checked.",
);
requireIncludes(
  manager,
  "New-ScheduledTaskPrincipal",
  "Each trial must receive a managed scheduled task.",
);
requireIncludes(
  manager,
  "public\\uploads",
  "Each copied runtime must own a physical uploads directory.",
);
requireIncludes(
  auth,
  "assertTrialWorkspaceAvailable",
  "Enterprise sign-in must enforce the trial runtime license.",
);
requireIncludes(
  access,
  "retailUserSession.updateMany",
  "Expiry must revoke active sessions.",
);
requireIncludes(
  access,
  'licenseStatus: "EXPIRED"',
  "Expiry must revoke trial store licenses.",
);
requireIncludes(
  access,
  'runtime.status === "CONVERTED"',
  "Converted workspaces must bypass the old trial expiry date.",
);
requireIncludes(
  access,
  "runtime.subscriptionLicensedUntil.getTime() <= now.getTime()",
  "Converted workspaces must enforce a finite paid licence expiry.",
);
requireIncludes(
  access,
  '"SUBSCRIPTION_EXPIRED"',
  "Paid licence expiry must be distinguishable from trial expiry.",
);
requireIncludes(
  auth,
  "This Flash ERP subscription has expired. Contact Flash Code Solutions to renew access.",
  "Converted customers must receive a subscription-renewal message when paid access expires.",
);
requireIncludes(
  auth,
  "This Flash ERP trial has expired. Contact Flash Code Solutions to extend access.",
  "Trial customers must retain the trial-expiry message.",
);
requireIncludes(
  access,
  "enforceConvertedSupportAccess",
  "Converted support access must be revoked during sign-in and session checks after approval expiry.",
);
requireIncludes(
  activation,
  'accountStatus: "ACTIVE"',
  "Activation must grant the verified owner account access.",
);
requireIncludes(
  activation,
  "getTrialOwnerActivationContext",
  "Activation must expose the signed owner login context.",
);
requireIncludes(
  activation,
  "loginId: user.loginId",
  "Activation completion must return the owner login ID.",
);
requireIncludes(
  activation,
  'accountType === "ENTERPRISE"',
  "Activation must distinguish Enterprise and Online Store accounts.",
);
requireIncludes(
  activation,
  'landingPath: accountType === "ENTERPRISE" ? "/" : "/online-store"',
  "Activation must route each account to its own workspace.",
);
requireIncludes(
  activationRoute,
  "export async function GET",
  "The activation page must resolve its signed login context.",
);
requireIncludes(
  activationPage,
  "LoginIdField",
  "The activation flow must display the owner login ID.",
);
requireIncludes(
  activationPage,
  "Copy login ID",
  "The activation flow must let the owner copy the login ID.",
);
requireIncludes(
  signInPage,
  'searchParams.get("loginId")',
  "Activation must be able to prefill the sign-in login ID.",
);
requireIncludes(
  callback,
  'status === "EXPIRED"',
  "The control plane must accept signed expiry completion.",
);
requireIncludes(
  callback,
  'status === "CONVERTED"',
  "The control plane must accept signed paid-conversion completion.",
);
requireIncludes(
  callback,
  'request.status === "CONVERTED" && status !== "CONVERTED"',
  "A stale callback must not regress a converted workspace.",
);
requireIncludes(
  callback,
  'lifecycleAction === "EXTENDED"',
  "The control plane must govern extension callbacks.",
);
requireIncludes(
  extensionRoute,
  'assertEnterprisePermission(["settings.license.manage"])',
  "Only authorized staff may extend a trial.",
);
requireIncludes(
  conversionRoute,
  'assertEnterprisePermission(["settings.license.manage"])',
  "Only licensing staff may convert a trial.",
);
requireIncludes(
  conversionRoute,
  'assertEnterpriseStepUp("converting a trial workspace to a paid subscription", {\n      force: true',
  "Trial conversion must always require step-up verification.",
);
for (const contractField of [
  "planCode",
  "subscriptionReference",
  "licensedUntil",
  "retainSupportAccess",
  "supportAccessExpiresAt",
  "supportApprovalReference",
]) {
  requireIncludes(
    conversionRoute,
    contractField,
    `The conversion API must accept ${contractField}.`,
  );
}
requireIncludes(
  lifecycle,
  'status: "CONVERTING"',
  "Conversion must claim the control request before enqueueing the worker.",
);
requireIncludes(
  lifecycle,
  "current.retainSupportAccess !== input.retainSupportAccess",
  "Conversion replay must compare the persisted support-access contract.",
);
requireIncludes(
  lifecycle,
  "current.supportApprovalReference !== supportApprovalReference",
  "Conversion replay must compare the support approval contract.",
);
requireIncludes(
  passwordResetRelay,
  '["ACTIVE", "CONVERTED"].includes(trial.status)',
  "Converted workspaces must retain control-plane password-reset delivery.",
);
requireIncludes(
  passwordResetRelay,
  "trial.subscriptionLicensedUntil.getTime() <= now.getTime()",
  "Expired paid subscriptions must not receive password-reset or MFA delivery.",
);
requireIncludes(
  activation,
  "runtime.subscriptionLicensedUntil.getTime() <= Date.now()",
  "Expired paid subscriptions must not accept an owner activation token.",
);
requireIncludes(
  sampleData,
  'permittedRuntimeStatuses: ["ACTIVE"]',
  "Manual sample-data creation must remain limited to active trials.",
);
for (const source of [readiness, readinessGate]) {
  requireIncludes(
    source,
    "20260922020000_trial_paid_conversion",
    "Database readiness must require the paid-conversion migration.",
  );
  requireIncludes(
    source,
    "subscriptionLicensedUntil",
    "Database readiness must require the conversion columns.",
  );
}

process.env.FLASH_ERP_TRIAL_WORKSPACE_SECRET = "trial-lifecycle-gate-secret";
const token = createTrialOwnerActivationToken({
  requestId: "request-1",
  retailOrgId: "org-1",
  userId: "user-1",
  email: "Owner@Example.test",
  exp: Date.now() + 60_000,
});
const decoded = readTrialOwnerActivationToken(token);
assert.equal(decoded.requestId, "request-1");
assert.equal(decoded.email, "owner@example.test");
assert.throws(
  () => readTrialOwnerActivationToken(`${token.slice(0, -1)}x`),
  /invalid/,
  "A modified activation token must be rejected.",
);

const expired = createTrialOwnerActivationToken({
  requestId: "request-2",
  retailOrgId: "org-2",
  userId: "user-2",
  email: "expired@example.test",
  exp: Date.now() - 1,
});
assert.throws(() => readTrialOwnerActivationToken(expired), /expired/);

const explicitPort = parseSqlServerUrl(
  "sqlserver://localhost:1433;database=control;user=trial;password=secret;encrypt=true;trustServerCertificate=true",
);
assert.equal(explicitPort.server, "localhost");
assert.equal(explicitPort.port, 1433);
assert.match(
  mssqlConnectionString({ ...explicitPort, database: "master" }),
  /^Server=localhost,1433;Database=master;/,
  "The mssql administrative connection must use SQL Server's host,port syntax.",
);
assert.match(
  prismaSqlServerUrl({ ...explicitPort, database: "child" }),
  /^sqlserver:\/\/localhost:1433;database=child;/,
  "The Prisma child URL must retain host:port syntax.",
);

const namedInstance = parseSqlServerUrl(
  "sqlserver://localhost\\sql2017;database=control;encrypt=false;trustServerCertificate=true",
);
assert.equal(namedInstance.server, "localhost\\sql2017");
assert.equal(namedInstance.port, undefined);

console.log("Flash ERP isolated trial workspace lifecycle acceptance passed.");
