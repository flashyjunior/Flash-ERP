import crypto from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_TRIAL_SUPPORT_EMAIL,
  TRIAL_SUPPORT_ROLE_CODE,
  TRIAL_SUPPORT_ROLE_NAME,
  trialSupportLoginId,
} from "../packages/domain/src/trial-support.js";
import {
  RecordStatus,
  SecurityLogKind,
  SecurityLogSeverity,
  SyncNodeType,
  UserAccountStatus,
} from "../packages/domain/src/prisma-enums.js";
import { securityPermissionCatalog } from "../packages/domain/src/security-permissions.js";
import dotenv from "dotenv";
import sql from "mssql";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";

import { deriveTrialSupportPassword } from "./trial-support-credentials-core";
import { createTrialOwnerActivationToken } from "../apps/enterprise-web/src/server/trials/trial-owner-token";
import {
  provisionTrialSampleData,
  TrialSampleDataError,
} from "../apps/enterprise-web/src/server/trials/trial-sample-data";
import {
  mssqlConnectionString,
  parseSqlServerUrl,
  prismaSqlServerUrl,
} from "./trial-sqlserver-url";

if (!process.env.DATABASE_URL)
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });

type ProvisionRequest = {
  version: number;
  requestId: string;
  requestNo: string;
  provisioningRequestKey: string;
  trialDays: number;
  owner: { name: string; email: string; phone?: string | null };
  business: {
    name: string;
    type: string;
    countryCode: string;
    city?: string | null;
    branchCount: number;
    employeeCountRange: string;
    preferredSlug?: string | null;
  };
};

type ExtensionRequest = {
  version: number;
  requestId: string;
  provisioningRequestKey: string;
  days: number;
  actorRef: string;
};

type WorkspaceAllocation = {
  slug: string;
  databaseName: string;
  port: number;
  baseUrl: string;
  runtimeDirectory: string;
  configPath: string;
};

type TrialStorefrontInput = {
  companyName: string;
  email: string;
  phone?: string | null;
  workspaceSlug: string;
};

const onlineStoreSupervisorPermissionCodes = [
  "pos.shift.open",
  "pos.shift.close",
  "pos.sale.process",
  "pos.return.process",
  "pos.exchange.process",
  "pos.receipt.search",
  "pos.receipt.reprint",
  "pos.customer.attach",
  "pos.customer.account.collect",
  "pos.loyalty.redeem",
  "pos.layaway.create",
  "pos.layaway.payment.receive",
  "pos.layaway.fulfil",
  "pos.override.no-receipt-return",
  "pos.override.discount",
  "pos.override.price",
  "inventory.view",
  "inventory.adjust",
  "inventory.count.submit",
  "inventory.count.commit",
  "inventory.transfer.request",
  "inventory.transfer.issue",
  "inventory.transfer.receive",
  "inventory.grn.receive",
  "inventory.supplier-return.manage",
  "fuel.station.view",
  "fuel.tank.manage",
  "fuel.dip.capture",
  "fuel.meter-reading.capture",
  "fuel.supplier-receipt.capture",
  "fuel.reconciliation.manage",
  "pos.layaway.cancel-refund",
  "pos.layaway.reservation.release",
  "pos.layaway.policy.override",
  "ecommerce.console.access",
] as const;

const root = process.cwd();
const controlUrl = process.env.DATABASE_URL?.trim();
if (!controlUrl)
  throw new Error("DATABASE_URL is required by the trial provisioner worker.");

const control = new PrismaClient({ adapter: new PrismaMssql(controlUrl) });

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required by the trial provisioner.`);
  return value;
}

function parsePositiveInteger(name: string, fallback: number) {
  const value = Number.parseInt(
    process.env[name]?.trim() || String(fallback),
    10,
  );
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer.`);
  return value;
}

function assertProvisioningEnabled() {
  if (process.env.FLASH_ERP_TRIAL_PROVISIONER_ENABLED !== "true") {
    throw new Error(
      "Trial provisioning is disabled. Set FLASH_ERP_TRIAL_PROVISIONER_ENABLED=true explicitly.",
    );
  }
  if (process.env.NODE_ENV === "production" && process.platform !== "win32") {
    throw new Error(
      "Production trial provisioning currently requires the governed Windows task host.",
    );
  }
}

function childDatabaseUrl(databaseName: string) {
  return prismaSqlServerUrl({
    ...parseSqlServerUrl(requiredEnvironment("FLASH_ERP_TRIAL_SQL_ADMIN_URL")),
    database: databaseName,
  });
}

function safeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

function workspaceSlug(
  preferred: string | null | undefined,
  companyName: string,
  requestId: string,
) {
  const base = safeSlug(preferred || companyName) || "flash-erp-trial";
  const suffix =
    requestId
      .replace(/[^a-f0-9]/gi, "")
      .slice(-8)
      .toLowerCase() || crypto.randomBytes(4).toString("hex");
  return `${base.slice(0, 70 - suffix.length)}-${suffix}`;
}

function trialStorefrontSettings(input: TrialStorefrontInput) {
  return {
    storeMode: "ONLINE_DIRECT",
    salesEnabled: true,
    ecommerceEnabled: true,
    ecommerceSlug: input.workspaceSlug,
    ecommerceDisplayName: input.companyName,
    ecommerceSupportEmail: input.email.toLowerCase(),
    ecommerceSupportPhone: input.phone || null,
    status: RecordStatus.ACTIVE,
  };
}

function databaseNameForSlug(slug: string) {
  const prefix =
    process.env.FLASH_ERP_TRIAL_DATABASE_PREFIX?.trim() || "flash_erp_trial_";
  if (!/^[a-z][a-z0-9_]{2,47}_$/.test(prefix)) {
    throw new Error(
      "FLASH_ERP_TRIAL_DATABASE_PREFIX must be a conservative lowercase SQL identifier prefix ending in an underscore.",
    );
  }
  const name = `${prefix}${slug.replace(/-/g, "_")}`.slice(0, 128);
  if (!/^[a-z][a-z0-9_]+$/.test(name))
    throw new Error("The derived trial database name is unsafe.");
  return name;
}

function containedPath(parent: string, child: string) {
  const parentPath = path.resolve(parent);
  const childPath = path.resolve(child);
  const relative = path.relative(parentPath, childPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Trial runtime path must be a child of ${parentPath}.`);
  }
  return childPath;
}

function publicBaseUrl(slug: string, port: number) {
  const template = requiredEnvironment("FLASH_ERP_TRIAL_PUBLIC_URL_TEMPLATE");
  const value = template
    .replaceAll("{slug}", slug)
    .replaceAll("{port}", String(port));
  if (value.includes("{"))
    throw new Error(
      "The trial public URL template contains an unknown placeholder.",
    );
  const parsed = new URL(value);
  if (
    process.env.NODE_ENV === "production" &&
    parsed.protocol !== "https:" &&
    process.env.FLASH_ERP_TRIAL_ALLOW_INSECURE_URLS !== "true"
  ) {
    throw new Error("Production trial workspace URLs must use HTTPS.");
  }
  return parsed.toString().replace(/\/$/, "");
}

async function allocateWorkspace(
  request: ProvisionRequest,
): Promise<WorkspaceAllocation> {
  const existing = await control.trialSignupRequest.findUnique({
    where: { id: request.requestId },
  });
  if (
    !existing ||
    existing.provisioningRequestKey !== request.provisioningRequestKey
  ) {
    throw new Error(
      "The trial control-plane request does not match the signed provisioning request.",
    );
  }

  const startPort = parsePositiveInteger("FLASH_ERP_TRIAL_PORT_START", 3100);
  const endPort = parsePositiveInteger("FLASH_ERP_TRIAL_PORT_END", 3199);
  if (endPort < startPort || endPort - startPort > 999) {
    throw new Error("The trial port range is invalid or too broad.");
  }
  const usedPorts = new Set(
    (
      await control.trialSignupRequest.findMany({
        where: { workspacePort: { not: null }, id: { not: request.requestId } },
        select: { workspacePort: true },
      })
    ).flatMap((row) => (row.workspacePort ? [row.workspacePort] : [])),
  );
  let port = existing.workspacePort;
  if (!port) {
    for (let candidate = startPort; candidate <= endPort; candidate += 1) {
      if (!usedPorts.has(candidate)) {
        port = candidate;
        break;
      }
    }
  }
  if (!port)
    throw new Error(
      "No trial runtime port is available in the configured range.",
    );

  const slug =
    existing.workspaceSlug ||
    workspaceSlug(
      request.business.preferredSlug,
      request.business.name,
      request.requestId,
    );
  const databaseName =
    existing.workspaceDatabaseName || databaseNameForSlug(slug);
  const runtimeRoot = path.resolve(
    requiredEnvironment("FLASH_ERP_TRIAL_RUNTIME_ROOT"),
  );
  const runtimeDirectory = containedPath(
    runtimeRoot,
    path.join(runtimeRoot, slug),
  );
  return {
    slug,
    databaseName,
    port,
    baseUrl: publicBaseUrl(slug, port),
    runtimeDirectory,
    configPath: containedPath(
      runtimeDirectory,
      path.join(runtimeDirectory, "config", "workspace.env"),
    ),
  };
}

async function ensureDatabase(databaseName: string) {
  const admin = parseSqlServerUrl(
    requiredEnvironment("FLASH_ERP_TRIAL_SQL_ADMIN_URL"),
  );
  const pool = await new sql.ConnectionPool(
    mssqlConnectionString({ ...admin, database: "master" }),
  ).connect();
  try {
    const result = await pool
      .request()
      .input("databaseName", databaseName)
      .query<{ exists: number }>(
        "SELECT CASE WHEN DB_ID(@databaseName) IS NULL THEN 0 ELSE 1 END AS [exists]",
      );
    if (result.recordset[0]?.exists !== 1) {
      await pool
        .request()
        .query(`CREATE DATABASE [${databaseName.replace(/]/g, "]]")}]`);
    }
  } finally {
    await pool.close();
  }
}

function runCommand(
  executable: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv } = {},
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: root,
      env: { ...process.env, ...options.env },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Child process failed with exit code ${code}: ${output.slice(-2000)}`,
          ),
        );
    });
  });
}

async function applyMigrations(databaseUrl: string) {
  const prismaCli = path.join(
    root,
    "node_modules",
    "prisma",
    "build",
    "index.js",
  );
  const schema = path.join(root, "prisma", "schema.prisma");
  if (!existsSync(prismaCli) || !existsSync(schema)) {
    throw new Error(
      "The release does not contain the Prisma CLI and schema required for trial provisioning.",
    );
  }
  await runCommand(
    process.execPath,
    [prismaCli, "migrate", "deploy", "--schema", schema],
    {
      env: { DATABASE_URL: databaseUrl },
    },
  );
}

function workspaceSecret(requestId: string, purpose: string) {
  return crypto
    .createHmac(
      "sha256",
      requiredEnvironment("FLASH_ERP_TRIAL_PROVISIONER_SECRET"),
    )
    .update(`${purpose}:${requestId}`)
    .digest("base64url");
}

function trialSupportEmail(): string {
  return (
    process.env.FLASH_ERP_TRIAL_SUPPORT_EMAIL?.trim() ||
    DEFAULT_TRIAL_SUPPORT_EMAIL
  );
}

/**
 * Ensure the per-trial Flash support account exists in a workspace database.
 *
 * The account (loginId `support.{slug}`) lets Flash ERP staff sign into a
 * trial workspace to assist the customer with setup. Its password is derived
 * deterministically from the provisioner secret, so it can be recomputed by
 * staff at any time (see scripts/trial-workspace-support-credentials.ts).
 * Returns true when the account was missing or repaired.
 */
async function ensureTrialSupportAccount(
  workspace: PrismaClient,
  input: {
    requestId: string;
    slug: string;
    storeId: string;
    nodeCode: string;
    retailOrgId: string;
  },
): Promise<boolean> {
  const supportLoginId = trialSupportLoginId(input.slug);
  const existing = await workspace.retailUser.findFirst({
    where: {
      retailOrgId: input.retailOrgId,
      loginId: supportLoginId,
      deletedAt: null,
    },
    select: {
      id: true,
      userRoles: {
        select: {
          role: { select: { code: true, status: true } },
        },
      },
    },
  });

  const role = await workspace.role.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: input.retailOrgId,
        code: TRIAL_SUPPORT_ROLE_CODE,
      },
    },
    update: {
      name: TRIAL_SUPPORT_ROLE_NAME,
      description:
        "Dedicated Flash ERP onboarding access for this trial workspace.",
      status: RecordStatus.ACTIVE,
    },
    create: {
      retailOrgId: input.retailOrgId,
      code: TRIAL_SUPPORT_ROLE_CODE,
      name: TRIAL_SUPPORT_ROLE_NAME,
      description:
        "Dedicated Flash ERP onboarding access for this trial workspace.",
      status: RecordStatus.ACTIVE,
    },
  });

  const permissions = await workspace.permission.findMany({
    where: {
      code: { in: securityPermissionCatalog.map((entry) => entry.code) },
    },
    select: { id: true },
  });
  await workspace.rolePermission.deleteMany({ where: { roleId: role.id } });
  await workspace.rolePermission.createMany({
    data: permissions.map((permission) => ({
      roleId: role.id,
      permissionId: permission.id,
    })),
  });

  const passwordHash = await bcrypt.hash(
    deriveTrialSupportPassword(
      requiredEnvironment("FLASH_ERP_TRIAL_PROVISIONER_SECRET"),
      input.requestId,
    ),
    12,
  );

  let repaired = !existing;
  const user = existing
    ? await workspace.retailUser.update({
        where: { id: existing.id },
        data: {
          displayName: TRIAL_SUPPORT_ROLE_NAME,
          email: trialSupportEmail(),
          passwordHash,
          passwordUpdatedAt: new Date(),
          accountStatus: UserAccountStatus.ACTIVE,
          failedLoginAttempts: 0,
          lockedUntil: null,
          homeStoreId: input.storeId,
          deletedAt: null,
        },
        select: { id: true, loginId: true },
      })
    : await workspace.retailUser.create({
        data: {
          retailOrgId: input.retailOrgId,
          homeStoreId: input.storeId,
          loginId: supportLoginId,
          email: trialSupportEmail(),
          displayName: TRIAL_SUPPORT_ROLE_NAME,
          passwordHash,
          passwordUpdatedAt: new Date(),
          accountStatus: UserAccountStatus.ACTIVE,
          originNodeCode: input.nodeCode,
          lastModifiedByNodeCode: input.nodeCode,
        },
        select: { id: true, loginId: true },
      });

  const hasRole = existing?.userRoles.some(
    (assignment) =>
      assignment.role.code === TRIAL_SUPPORT_ROLE_CODE &&
      assignment.role.status === RecordStatus.ACTIVE,
  );
  if (!hasRole) {
    repaired = true;
    await workspace.retailUserRole.upsert({
      where: {
        retailUserId_roleId: {
          retailUserId: user.id,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        retailUserId: user.id,
        roleId: role.id,
      },
    });
  }

  await workspace.securityLog.create({
    data: {
      retailOrgId: input.retailOrgId,
      kind: SecurityLogKind.AUDIT,
      severity: SecurityLogSeverity.INFO,
      category: "TRIAL",
      action: repaired
        ? "TRIAL_SUPPORT_ACCOUNT_PROVISIONED"
        : "TRIAL_SUPPORT_ACCOUNT_RECONCILED",
      actorLabel: "Trial provisioner",
      targetType: "Retail user",
      targetRef: user.loginId,
      sourceNodeCode: input.nodeCode,
      message: `Flash support account ${user.loginId} ${
        repaired ? "was created" : "was verified"
      } in trial workspace ${input.slug}.`,
    },
  });

  return repaired;
}

async function bootstrapWorkspace(
  request: ProvisionRequest,
  allocation: WorkspaceAllocation,
  databaseUrl: string,
  startsAt: Date,
  expiresAt: Date,
) {
  const workspace = new PrismaClient({ adapter: new PrismaMssql(databaseUrl) });
  try {
    const orgCode = allocation.slug.replace(/-/g, "_").slice(0, 80);
    const currencyCode =
      process.env.FLASH_ERP_DEFAULT_CURRENCY?.trim() || "GHS";
    const timezone =
      process.env.FLASH_ERP_DEFAULT_TIMEZONE?.trim() || "Africa/Accra";
    const storefrontSettings = trialStorefrontSettings({
      companyName: request.business.name,
      email: request.owner.email,
      phone: request.owner.phone,
      workspaceSlug: allocation.slug,
    });
    const org = await workspace.retailOrg.upsert({
      where: { code: orgCode },
      update: {
        name: request.business.name,
        baseCurrencyCode: currencyCode,
        timezone,
        status: RecordStatus.ACTIVE,
      },
      create: {
        code: orgCode,
        name: request.business.name,
        baseCurrencyCode: currencyCode,
        timezone,
        status: RecordStatus.ACTIVE,
        passwordPolicyJson: JSON.stringify({
          minimumLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireDigit: true,
          requireSymbol: false,
          expiryDays: 90,
          historyCount: 4,
          maxFailedAttempts: 5,
          lockoutMinutes: 15,
          sessionTimeoutMinutes: 30,
          mfaMode: "DISABLED",
        }),
      },
    });
    const node = await workspace.syncNode.upsert({
      where: { code: "enterprise-primary" },
      update: {
        retailOrgId: org.id,
        name: `${request.business.name} Enterprise`,
        nodeType: SyncNodeType.ENTERPRISE,
        direction: "BIDIRECTIONAL",
        isPrimary: true,
        status: RecordStatus.ACTIVE,
        lastHeartbeatAt: new Date(),
      },
      create: {
        retailOrgId: org.id,
        code: "enterprise-primary",
        name: `${request.business.name} Enterprise`,
        nodeType: SyncNodeType.ENTERPRISE,
        direction: "BIDIRECTIONAL",
        isPrimary: true,
        status: RecordStatus.ACTIVE,
        lastHeartbeatAt: new Date(),
      },
    });
    const company = await workspace.erpCompany.upsert({
      where: { retailOrgId_code: { retailOrgId: org.id, code: "PRIMARY" } },
      update: {
        legalName: request.business.name,
        tradingName: request.business.name,
        status: "ACTIVE",
      },
      create: {
        retailOrgId: org.id,
        code: "PRIMARY",
        legalName: request.business.name,
        tradingName: request.business.name,
        baseCurrencyCode: currencyCode,
        timezone,
        email: request.owner.email.toLowerCase(),
        phone: request.owner.phone || null,
        city: request.business.city || null,
        countryCode: request.business.countryCode,
        isPrimary: true,
        status: "ACTIVE",
      },
    });
    void company;
    const store = await workspace.store.upsert({
      where: { retailOrgId_code: { retailOrgId: org.id, code: "MAIN" } },
      update: {
        name: `${request.business.name} Main Branch`,
        licensedUntil: expiresAt,
        licenseStatus: "TRIAL",
        ecommerceEnabled: false,
        ecommerceSlug: null,
        status: "ACTIVE",
      },
      create: {
        retailOrgId: org.id,
        code: "MAIN",
        name: `${request.business.name} Main Branch`,
        shortName: "Main",
        timezone,
        currencyCode,
        phone: request.owner.phone || null,
        email: request.owner.email.toLowerCase(),
        city: request.business.city || null,
        countryCode: request.business.countryCode,
        licenseStatus: "TRIAL",
        licenseKey: `TRIAL-${request.requestNo}`,
        licensedUntil: expiresAt,
        storeMode: "OFFLINE_FIRST",
        ecommerceEnabled: false,
        status: "ACTIVE",
        openedOn: startsAt,
      },
    });
    const onlineStore = await workspace.store.upsert({
      where: { retailOrgId_code: { retailOrgId: org.id, code: "ONLINE" } },
      update: {
        name: `${request.business.name} Online Store`,
        licensedUntil: expiresAt,
        licenseStatus: "TRIAL",
        ...storefrontSettings,
      },
      create: {
        retailOrgId: org.id,
        code: "ONLINE",
        name: `${request.business.name} Online Store`,
        shortName: "Online",
        timezone,
        currencyCode,
        phone: request.owner.phone || null,
        email: request.owner.email.toLowerCase(),
        city: request.business.city || null,
        countryCode: request.business.countryCode,
        licenseStatus: "TRIAL",
        licenseKey: `TRIAL-${request.requestNo}-ONLINE`,
        licensedUntil: expiresAt,
        ...storefrontSettings,
        openedOn: startsAt,
      },
    });
    const warehouse = await workspace.warehouse.upsert({
      where: { retailOrgId_code: { retailOrgId: org.id, code: "MAIN-WH" } },
      update: {
        storeId: store.id,
        licensedUntil: expiresAt,
        licenseStatus: "TRIAL",
        status: "ACTIVE",
      },
      create: {
        retailOrgId: org.id,
        storeId: store.id,
        code: "MAIN-WH",
        name: "Main Warehouse",
        licenseStatus: "TRIAL",
        licenseKey: `TRIAL-${request.requestNo}-WH`,
        licensedUntil: expiresAt,
        status: "ACTIVE",
      },
    });
    await workspace.inventoryLocation.upsert({
      where: { retailOrgId_code: { retailOrgId: org.id, code: "MAIN-SALES" } },
      update: {
        storeId: store.id,
        warehouseId: warehouse.id,
        status: "ACTIVE",
      },
      create: {
        retailOrgId: org.id,
        storeId: store.id,
        warehouseId: warehouse.id,
        code: "MAIN-SALES",
        name: "Main Sales Floor",
        locationType: "SALES_FLOOR",
        status: "ACTIVE",
        useForSalesDefault: true,
        useForSalesOrderDefault: true,
        useForReceivingDefault: true,
      },
    });
    const onlineWarehouse = await workspace.warehouse.upsert({
      where: { retailOrgId_code: { retailOrgId: org.id, code: "ONLINE-WH" } },
      update: {
        storeId: onlineStore.id,
        licensedUntil: expiresAt,
        licenseStatus: "TRIAL",
        status: "ACTIVE",
      },
      create: {
        retailOrgId: org.id,
        storeId: onlineStore.id,
        code: "ONLINE-WH",
        name: "Online Store Warehouse",
        licenseStatus: "TRIAL",
        licenseKey: `TRIAL-${request.requestNo}-ONLINE-WH`,
        licensedUntil: expiresAt,
        status: "ACTIVE",
      },
    });
    await workspace.inventoryLocation.upsert({
      where: {
        retailOrgId_code: { retailOrgId: org.id, code: "ONLINE-SALES" },
      },
      update: {
        storeId: onlineStore.id,
        warehouseId: onlineWarehouse.id,
        status: "ACTIVE",
      },
      create: {
        retailOrgId: org.id,
        storeId: onlineStore.id,
        warehouseId: onlineWarehouse.id,
        code: "ONLINE-SALES",
        name: "Online Store Sales Floor",
        locationType: "SALES_FLOOR",
        status: "ACTIVE",
        useForSalesDefault: true,
        useForSalesOrderDefault: true,
        useForReceivingDefault: true,
      },
    });
    await workspace.terminal.upsert({
      where: { storeId_code: { storeId: store.id, code: "POS-01" } },
      update: {
        licensedUntil: expiresAt,
        licenseStatus: "TRIAL",
        status: "ACTIVE",
      },
      create: {
        retailOrgId: org.id,
        storeId: store.id,
        code: "POS-01",
        name: "Main POS",
        licenseStatus: "TRIAL",
        licenseKey: `TRIAL-${request.requestNo}-POS`,
        licensedUntil: expiresAt,
        status: "ACTIVE",
      },
    });

    for (const permission of securityPermissionCatalog) {
      await workspace.permission.upsert({
        where: { code: permission.code },
        update: { name: permission.name, description: permission.description },
        create: {
          code: permission.code,
          name: permission.name,
          description: permission.description,
        },
      });
    }
    const role = await workspace.role.upsert({
      where: { retailOrgId_code: { retailOrgId: org.id, code: "HQ_ADMIN" } },
      update: {
        name: "Workspace Owner",
        description: "Full trial workspace administration.",
        status: "ACTIVE",
      },
      create: {
        retailOrgId: org.id,
        code: "HQ_ADMIN",
        name: "Workspace Owner",
        description: "Full trial workspace administration.",
        status: "ACTIVE",
      },
    });
    const permissions = await workspace.permission.findMany({
      where: {
        code: { in: securityPermissionCatalog.map((entry) => entry.code) },
      },
      select: { id: true },
    });
    await workspace.rolePermission.deleteMany({ where: { roleId: role.id } });
    await workspace.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
    });
    const onlineStoreRole = await workspace.role.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: org.id,
          code: "ONLINE_STORE_SUPERVISOR",
        },
      },
      update: {
        name: "Online Store Supervisor",
        description: "Browser POS supervisor role for the trial Online Store.",
        status: "ACTIVE",
      },
      create: {
        retailOrgId: org.id,
        code: "ONLINE_STORE_SUPERVISOR",
        name: "Online Store Supervisor",
        description: "Browser POS supervisor role for the trial Online Store.",
        status: "ACTIVE",
      },
    });
    const onlineStorePermissions = await workspace.permission.findMany({
      where: { code: { in: [...onlineStoreSupervisorPermissionCodes] } },
      select: { id: true, code: true },
    });
    if (
      onlineStorePermissions.length !==
      onlineStoreSupervisorPermissionCodes.length
    ) {
      const resolved = new Set(
        onlineStorePermissions.map((permission) => permission.code),
      );
      const missing = onlineStoreSupervisorPermissionCodes.filter(
        (code) => !resolved.has(code),
      );
      throw new Error(
        `Trial Online Store role is missing permission code(s): ${missing.join(", ")}.`,
      );
    }
    await workspace.rolePermission.deleteMany({
      where: { roleId: onlineStoreRole.id },
    });
    await workspace.rolePermission.createMany({
      data: onlineStorePermissions.map((permission) => ({
        roleId: onlineStoreRole.id,
        permissionId: permission.id,
      })),
    });
    const owner = await workspace.retailUser.upsert({
      where: {
        retailOrgId_loginId: {
          retailOrgId: org.id,
          loginId: request.owner.email.toLowerCase(),
        },
      },
      update: {
        displayName: request.owner.name,
        email: request.owner.email.toLowerCase(),
        homeStoreId: store.id,
        originNodeCode: node.code,
        lastModifiedByNodeCode: node.code,
        deletedAt: null,
      },
      create: {
        retailOrgId: org.id,
        homeStoreId: store.id,
        loginId: request.owner.email.toLowerCase(),
        email: request.owner.email.toLowerCase(),
        displayName: request.owner.name,
        passwordHash: null,
        accountStatus: UserAccountStatus.INVITED,
        originNodeCode: node.code,
        lastModifiedByNodeCode: node.code,
      },
    });
    await workspace.retailUserRole.upsert({
      where: {
        retailUserId_roleId: { retailUserId: owner.id, roleId: role.id },
      },
      update: {},
      create: { retailUserId: owner.id, roleId: role.id },
    });
    const onlineStoreLoginId = `online.${allocation.slug}`.toLowerCase();
    const onlineStoreOperator = await workspace.retailUser.upsert({
      where: {
        retailOrgId_loginId: {
          retailOrgId: org.id,
          loginId: onlineStoreLoginId,
        },
      },
      update: {
        displayName: `${request.owner.name} Online Store Operator`,
        email: request.owner.email.toLowerCase(),
        homeStoreId: onlineStore.id,
        originNodeCode: node.code,
        lastModifiedByNodeCode: node.code,
        deletedAt: null,
      },
      create: {
        retailOrgId: org.id,
        homeStoreId: onlineStore.id,
        loginId: onlineStoreLoginId,
        email: request.owner.email.toLowerCase(),
        displayName: `${request.owner.name} Online Store Operator`,
        passwordHash: null,
        accountStatus: UserAccountStatus.INVITED,
        originNodeCode: node.code,
        lastModifiedByNodeCode: node.code,
      },
    });
    await workspace.retailUserRole.upsert({
      where: {
        retailUserId_roleId: {
          retailUserId: onlineStoreOperator.id,
          roleId: onlineStoreRole.id,
        },
      },
      update: {},
      create: {
        retailUserId: onlineStoreOperator.id,
        roleId: onlineStoreRole.id,
      },
    });
    await ensureTrialSupportAccount(workspace, {
      requestId: request.requestId,
      slug: allocation.slug,
      storeId: store.id,
      nodeCode: node.code,
      retailOrgId: org.id,
    });
    const currentRuntime = await workspace.trialWorkspaceRuntime.findUnique({
      where: { id: request.requestId },
    });
    await workspace.trialWorkspaceRuntime.upsert({
      where: { id: request.requestId },
      update: {
        requestNo: request.requestNo,
        workspaceSlug: allocation.slug,
        companyName: request.business.name,
        ownerUserId: owner.id,
        trialStartsAt: startsAt,
        trialExpiresAt: expiresAt,
        status: currentRuntime?.status === "ACTIVE" ? "ACTIVE" : "PROVISIONING",
        lastLifecycleAt: new Date(),
      },
      create: {
        id: request.requestId,
        requestNo: request.requestNo,
        workspaceSlug: allocation.slug,
        companyName: request.business.name,
        ownerUserId: owner.id,
        status: "PROVISIONING",
        trialStartsAt: startsAt,
        trialExpiresAt: expiresAt,
        lastLifecycleAt: new Date(),
      },
    });
    await workspace.securityLog.create({
      data: {
        retailOrgId: org.id,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "TRIAL",
        action: "TRIAL_WORKSPACE_BOOTSTRAPPED",
        actorLabel: "Trial provisioner",
        targetType: "Trial workspace",
        targetRef: request.requestNo,
        sourceNodeCode: node.code,
        message: `Trial workspace ${request.requestNo} was bootstrapped with invited Enterprise owner, Online Store operator, and Flash support accounts.`,
      },
    });
    await provisionTrialSampleData({
      database: workspace,
      retailOrgId: org.id,
      userId: owner.id,
      actorLabel: "Trial provisioner",
      businessType: request.business.type,
    });
    const ownerActivationToken = createTrialOwnerActivationToken({
      requestId: request.requestId,
      retailOrgId: org.id,
      userId: owner.id,
      email: request.owner.email,
      exp: Math.min(expiresAt.getTime(), Date.now() + 48 * 60 * 60_000),
    });
    const onlineStoreActivationToken = createTrialOwnerActivationToken({
      requestId: request.requestId,
      retailOrgId: org.id,
      userId: onlineStoreOperator.id,
      email: request.owner.email,
      exp: Math.min(expiresAt.getTime(), Date.now() + 48 * 60 * 60_000),
    });
    return {
      owner,
      onlineStoreOperator,
      ownerActivationToken,
      onlineStoreActivationToken,
    };
  } finally {
    await workspace.$disconnect();
  }
}

async function reconcileWorkspaceStorefront(input: {
  requestId: string;
  requestNo: string;
  companyName: string;
  email: string;
  phone: string | null;
  countryCode: string;
  city: string | null;
  workspaceSlug: string;
  workspaceDatabaseName: string;
}) {
  const workspace = new PrismaClient({
    adapter: new PrismaMssql(childDatabaseUrl(input.workspaceDatabaseName)),
  });
  try {
    const runtime = await workspace.trialWorkspaceRuntime.findUnique({
      where: { id: input.requestId },
      select: { ownerUserId: true, trialStartsAt: true, trialExpiresAt: true },
    });
    if (!runtime)
      throw new Error(
        `Trial runtime ${input.requestNo} is missing from its workspace database.`,
      );

    const owner = await workspace.retailUser.findUnique({
      where: { id: runtime.ownerUserId },
      select: { retailOrgId: true },
    });
    if (!owner)
      throw new Error(
        `Trial owner ${runtime.ownerUserId} is missing from ${input.requestNo}.`,
      );

    const [
      org,
      mainStore,
      onlineStore,
      mainWarehouse,
      onlineWarehouse,
      mainLocation,
      onlineLocation,
      mainTerminal,
    ] = await Promise.all([
      workspace.retailOrg.findUnique({
        where: { id: owner.retailOrgId },
        select: { timezone: true, baseCurrencyCode: true },
      }),
      workspace.store.findUnique({
        where: {
          retailOrgId_code: { retailOrgId: owner.retailOrgId, code: "MAIN" },
        },
        select: {
          id: true,
          ecommerceEnabled: true,
          ecommerceSlug: true,
          status: true,
        },
      }),
      workspace.store.findUnique({
        where: {
          retailOrgId_code: { retailOrgId: owner.retailOrgId, code: "ONLINE" },
        },
        select: {
          id: true,
          storeMode: true,
          salesEnabled: true,
          ecommerceEnabled: true,
          ecommerceSlug: true,
          ecommerceDisplayName: true,
          ecommerceSupportEmail: true,
          ecommerceSupportPhone: true,
          status: true,
        },
      }),
      workspace.warehouse.findUnique({
        where: {
          retailOrgId_code: { retailOrgId: owner.retailOrgId, code: "MAIN-WH" },
        },
        select: { id: true, storeId: true, status: true },
      }),
      workspace.warehouse.findUnique({
        where: {
          retailOrgId_code: {
            retailOrgId: owner.retailOrgId,
            code: "ONLINE-WH",
          },
        },
        select: { id: true, storeId: true, status: true },
      }),
      workspace.inventoryLocation.findUnique({
        where: {
          retailOrgId_code: {
            retailOrgId: owner.retailOrgId,
            code: "MAIN-SALES",
          },
        },
        select: { storeId: true, warehouseId: true, status: true },
      }),
      workspace.inventoryLocation.findUnique({
        where: {
          retailOrgId_code: {
            retailOrgId: owner.retailOrgId,
            code: "ONLINE-SALES",
          },
        },
        select: { storeId: true, warehouseId: true, status: true },
      }),
      workspace.terminal.findFirst({
        where: { retailOrgId: owner.retailOrgId, code: "POS-01" },
        select: { storeId: true, status: true },
      }),
    ]);
    if (!org)
      throw new Error(
        `Trial organisation ${owner.retailOrgId} is missing from ${input.requestNo}.`,
      );

    const storefrontSettings = trialStorefrontSettings({
      companyName: input.companyName,
      email: input.email,
      phone: input.phone,
      workspaceSlug: input.workspaceSlug,
    });
    const needsRepair =
      !mainStore ||
      mainStore.ecommerceEnabled ||
      mainStore.ecommerceSlug !== null ||
      mainStore.status !== RecordStatus.ACTIVE ||
      !onlineStore ||
      onlineStore.storeMode !== storefrontSettings.storeMode ||
      !onlineStore.salesEnabled ||
      !onlineStore.ecommerceEnabled ||
      onlineStore.ecommerceSlug !== storefrontSettings.ecommerceSlug ||
      onlineStore.ecommerceDisplayName !==
        storefrontSettings.ecommerceDisplayName ||
      onlineStore.ecommerceSupportEmail !==
        storefrontSettings.ecommerceSupportEmail ||
      onlineStore.ecommerceSupportPhone !==
        storefrontSettings.ecommerceSupportPhone ||
      onlineStore.status !== storefrontSettings.status ||
      !mainWarehouse ||
      mainWarehouse.storeId !== mainStore?.id ||
      mainWarehouse.status !== RecordStatus.ACTIVE ||
      !onlineWarehouse ||
      onlineWarehouse.storeId !== onlineStore?.id ||
      onlineWarehouse.status !== RecordStatus.ACTIVE ||
      !mainLocation ||
      mainLocation.storeId !== mainStore?.id ||
      mainLocation.warehouseId !== mainWarehouse?.id ||
      mainLocation.status !== RecordStatus.ACTIVE ||
      !onlineLocation ||
      onlineLocation.storeId !== onlineStore?.id ||
      onlineLocation.warehouseId !== onlineWarehouse?.id ||
      onlineLocation.status !== RecordStatus.ACTIVE ||
      !mainTerminal ||
      mainTerminal.storeId !== mainStore?.id ||
      mainTerminal.status !== RecordStatus.ACTIVE;
    if (!needsRepair) return false;

    await workspace.$transaction(async (tx) => {
      const repairedMainStore = await tx.store.upsert({
        where: {
          retailOrgId_code: { retailOrgId: owner.retailOrgId, code: "MAIN" },
        },
        update: {
          name: `${input.companyName} Main Branch`,
          licensedUntil: runtime.trialExpiresAt,
          licenseStatus: "TRIAL",
          ecommerceEnabled: false,
          ecommerceSlug: null,
          status: RecordStatus.ACTIVE,
        },
        create: {
          retailOrgId: owner.retailOrgId,
          code: "MAIN",
          name: `${input.companyName} Main Branch`,
          shortName: "Main",
          timezone: org.timezone,
          currencyCode: org.baseCurrencyCode,
          phone: input.phone,
          email: input.email.toLowerCase(),
          city: input.city,
          countryCode: input.countryCode,
          licenseStatus: "TRIAL",
          licenseKey: `TRIAL-${input.requestNo}`,
          licensedUntil: runtime.trialExpiresAt,
          storeMode: "OFFLINE_FIRST",
          ecommerceEnabled: false,
          status: RecordStatus.ACTIVE,
          openedOn: runtime.trialStartsAt,
        },
      });
      const repairedOnlineStore = await tx.store.upsert({
        where: {
          retailOrgId_code: { retailOrgId: owner.retailOrgId, code: "ONLINE" },
        },
        update: {
          name: `${input.companyName} Online Store`,
          licensedUntil: runtime.trialExpiresAt,
          licenseStatus: "TRIAL",
          ...storefrontSettings,
        },
        create: {
          retailOrgId: owner.retailOrgId,
          code: "ONLINE",
          name: `${input.companyName} Online Store`,
          shortName: "Online",
          timezone: org.timezone,
          currencyCode: org.baseCurrencyCode,
          phone: input.phone,
          email: input.email.toLowerCase(),
          city: input.city,
          countryCode: input.countryCode,
          licenseStatus: "TRIAL",
          licenseKey: `TRIAL-${input.requestNo}-ONLINE`,
          licensedUntil: runtime.trialExpiresAt,
          ...storefrontSettings,
          openedOn: runtime.trialStartsAt,
        },
      });
      const repairedMainWarehouse = await tx.warehouse.upsert({
        where: {
          retailOrgId_code: { retailOrgId: owner.retailOrgId, code: "MAIN-WH" },
        },
        update: {
          storeId: repairedMainStore.id,
          licensedUntil: runtime.trialExpiresAt,
          licenseStatus: "TRIAL",
          status: RecordStatus.ACTIVE,
        },
        create: {
          retailOrgId: owner.retailOrgId,
          storeId: repairedMainStore.id,
          code: "MAIN-WH",
          name: "Main Warehouse",
          licenseStatus: "TRIAL",
          licenseKey: `TRIAL-${input.requestNo}-WH`,
          licensedUntil: runtime.trialExpiresAt,
          status: RecordStatus.ACTIVE,
        },
      });
      const repairedOnlineWarehouse = await tx.warehouse.upsert({
        where: {
          retailOrgId_code: {
            retailOrgId: owner.retailOrgId,
            code: "ONLINE-WH",
          },
        },
        update: {
          storeId: repairedOnlineStore.id,
          licensedUntil: runtime.trialExpiresAt,
          licenseStatus: "TRIAL",
          status: RecordStatus.ACTIVE,
        },
        create: {
          retailOrgId: owner.retailOrgId,
          storeId: repairedOnlineStore.id,
          code: "ONLINE-WH",
          name: "Online Store Warehouse",
          licenseStatus: "TRIAL",
          licenseKey: `TRIAL-${input.requestNo}-ONLINE-WH`,
          licensedUntil: runtime.trialExpiresAt,
          status: RecordStatus.ACTIVE,
        },
      });
      await tx.inventoryLocation.upsert({
        where: {
          retailOrgId_code: {
            retailOrgId: owner.retailOrgId,
            code: "MAIN-SALES",
          },
        },
        update: {
          storeId: repairedMainStore.id,
          warehouseId: repairedMainWarehouse.id,
          status: RecordStatus.ACTIVE,
        },
        create: {
          retailOrgId: owner.retailOrgId,
          storeId: repairedMainStore.id,
          warehouseId: repairedMainWarehouse.id,
          code: "MAIN-SALES",
          name: "Main Sales Floor",
          locationType: "SALES_FLOOR",
          status: RecordStatus.ACTIVE,
          useForSalesDefault: true,
          useForSalesOrderDefault: true,
          useForReceivingDefault: true,
        },
      });
      await tx.inventoryLocation.upsert({
        where: {
          retailOrgId_code: {
            retailOrgId: owner.retailOrgId,
            code: "ONLINE-SALES",
          },
        },
        update: {
          storeId: repairedOnlineStore.id,
          warehouseId: repairedOnlineWarehouse.id,
          status: RecordStatus.ACTIVE,
        },
        create: {
          retailOrgId: owner.retailOrgId,
          storeId: repairedOnlineStore.id,
          warehouseId: repairedOnlineWarehouse.id,
          code: "ONLINE-SALES",
          name: "Online Store Sales Floor",
          locationType: "SALES_FLOOR",
          status: RecordStatus.ACTIVE,
          useForSalesDefault: true,
          useForSalesOrderDefault: true,
          useForReceivingDefault: true,
        },
      });
      await tx.terminal.upsert({
        where: {
          storeId_code: { storeId: repairedMainStore.id, code: "POS-01" },
        },
        update: {
          licensedUntil: runtime.trialExpiresAt,
          licenseStatus: "TRIAL",
          status: RecordStatus.ACTIVE,
        },
        create: {
          retailOrgId: owner.retailOrgId,
          storeId: repairedMainStore.id,
          code: "POS-01",
          name: "Main POS",
          licenseStatus: "TRIAL",
          licenseKey: `TRIAL-${input.requestNo}-POS`,
          licensedUntil: runtime.trialExpiresAt,
          status: RecordStatus.ACTIVE,
        },
      });
      await tx.retailUser.updateMany({
        where: { id: runtime.ownerUserId, homeStoreId: null },
        data: { homeStoreId: repairedMainStore.id },
      });
      await tx.retailUser.updateMany({
        where: {
          retailOrgId: owner.retailOrgId,
          loginId: `online.${input.workspaceSlug}`.toLowerCase(),
          homeStoreId: null,
        },
        data: { homeStoreId: repairedOnlineStore.id },
      });
      await tx.securityLog.create({
        data: {
          retailOrgId: owner.retailOrgId,
          kind: SecurityLogKind.AUDIT,
          severity: SecurityLogSeverity.INFO,
          category: "TRIAL",
          action: "TRIAL_STOREFRONT_RECONCILED",
          actorLabel: "Trial provisioner",
          targetType: "Online Store",
          targetRef: input.workspaceSlug,
          sourceNodeCode: "enterprise-primary",
          message: `Trial storefront ${input.workspaceSlug} restored its governed store structure and Online Store assignment.`,
        },
      });
    }, {
      maxWait: 60_000,
      timeout: 60_000,
    });
    return true;
  } finally {
    await workspace.$disconnect();
  }
}

async function reconcileWorkspaceSampleData(input: {
  requestId: string;
  requestNo: string;
  businessType: string;
  workspaceDatabaseName: string;
}) {
  const workspace = new PrismaClient({
    adapter: new PrismaMssql(childDatabaseUrl(input.workspaceDatabaseName)),
  });
  try {
    const runtime = await workspace.trialWorkspaceRuntime.findUnique({
      where: { id: input.requestId },
      select: { ownerUserId: true },
    });
    if (!runtime) {
      throw new Error(
        `Trial runtime ${input.requestNo} is missing from its workspace database.`,
      );
    }
    const owner = await workspace.retailUser.findUnique({
      where: { id: runtime.ownerUserId },
      select: { id: true, retailOrgId: true },
    });
    if (!owner) {
      throw new Error(
        `Trial owner ${runtime.ownerUserId} is missing from ${input.requestNo}.`,
      );
    }

    try {
      return await provisionTrialSampleData({
        database: workspace,
        retailOrgId: owner.retailOrgId,
        userId: owner.id,
        actorLabel: "Trial provisioner",
        businessType: input.businessType,
      });
    } catch (error) {
      if (
        error instanceof TrialSampleDataError &&
        error.code === "TRIAL_CATALOGUE_NOT_EMPTY"
      ) {
        return null;
      }
      throw error;
    }
  } finally {
    await workspace.$disconnect();
  }
}

function writeWorkspaceEnvironment(
  request: Pick<ProvisionRequest, "requestId"> & {
    business: Pick<ProvisionRequest["business"], "type">;
  },
  allocation: WorkspaceAllocation,
  databaseUrl: string,
) {
  mkdirSync(path.dirname(allocation.configPath), { recursive: true });
  const secureCookies = allocation.baseUrl.startsWith("https:");
  const values: Record<string, string> = {
    DATABASE_URL: databaseUrl,
    NODE_ENV: "production",
    HOST: process.env.FLASH_ERP_TRIAL_RUNTIME_HOST?.trim() || "127.0.0.1",
    PORT: String(allocation.port),
    FLASH_ERP_AUTH_SECRET: workspaceSecret(request.requestId, "auth"),
    FLASH_ERP_TRIAL_WORKSPACE_SECRET: workspaceSecret(
      request.requestId,
      "activation",
    ),
    FLASH_ERP_TRIAL_WORKSPACE_MODE: "true",
    FLASH_ERP_TRIAL_BUSINESS_TYPE: request.business.type,
    FLASH_ERP_TRIAL_CONTROL_PLANE_REQUEST_ID: request.requestId,
    FLASH_ERP_TRIAL_CONTROL_PLANE_URL:
      process.env.FLASH_ERP_TRIAL_CONTROL_PLANE_URL?.trim() ||
      "http://127.0.0.1:3000",
    FLASH_ERP_TRIAL_PROVISIONER_ENABLED: "false",
    FLASH_ERP_PUBLIC_TRIAL_SIGNUP_ENABLED: "false",
    FLASH_ERP_ENTERPRISE_APP_URL: allocation.baseUrl,
    FLASH_ERP_COOKIE_SECURE: String(secureCookies),
    FLASH_ERP_MFA_DELIVERY_MODE: "development",
    FLASH_ERP_DEFAULT_CURRENCY:
      process.env.FLASH_ERP_DEFAULT_CURRENCY?.trim() || "GHS",
    FLASH_ERP_DEFAULT_TIMEZONE:
      process.env.FLASH_ERP_DEFAULT_TIMEZONE?.trim() || "Africa/Accra",
    FLASH_ERP_SERVICE_LOG_PATH: path.join(
      allocation.runtimeDirectory,
      "logs",
      "enterprise-web.log",
    ),
  };
  const content = Object.entries(values)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n");
  writeFileSync(allocation.configPath, `${content}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function manageRuntime(
  action: "Ensure" | "Start" | "Stop",
  allocation: WorkspaceAllocation,
) {
  const mode =
    process.env.FLASH_ERP_TRIAL_INFRA_MODE?.trim().toUpperCase() ||
    "WINDOWS_TASKS";
  if (mode === "DISPOSABLE" && process.env.NODE_ENV !== "production") return;
  if (mode !== "WINDOWS_TASKS")
    throw new Error(
      "FLASH_ERP_TRIAL_INFRA_MODE must be WINDOWS_TASKS in production.",
    );
  const manager = path.join(
    root,
    "scripts",
    "manage-flash-erp-trial-workspace.ps1",
  );
  await runCommand("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    manager,
    "-Action",
    action,
    "-WorkspaceSlug",
    allocation.slug,
    "-ConfigPath",
    allocation.configPath,
    "-Port",
    String(allocation.port),
    "-ReleaseRoot",
    root,
    "-RuntimeRoot",
    path.dirname(allocation.runtimeDirectory),
    "-NodePath",
    process.execPath,
    "-TaskPrefix",
    process.env.FLASH_ERP_TRIAL_TASK_PREFIX?.trim() || "FlashERPTrial-",
  ]);
}

async function waitForRuntime(port: number) {
  if (
    process.env.FLASH_ERP_TRIAL_INFRA_MODE?.trim().toUpperCase() ===
      "DISPOSABLE" &&
    process.env.NODE_ENV !== "production"
  )
    return;
  const deadline = Date.now() + 180_000;
  const url = `http://127.0.0.1:${port}/api/system/live`;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // Keep waiting through startup and migration warmup.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(
    `Trial runtime did not become live on port ${port} within 180 seconds.`,
  );
}

function escapeEmailHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type TrialActivationAccount = {
  loginId: string;
  activationUrl: string;
};

async function sendActivationEmail(
  request: ProvisionRequest,
  accounts: {
    enterprise: TrialActivationAccount;
    onlineStore?: TrialActivationAccount;
  },
) {
  const expose =
    process.env.NODE_ENV !== "production" &&
    process.env.FLASH_ERP_TRIAL_EXPOSE_ACTIVATION === "true";
  if (expose) {
    process.stdout.write(
      `Development trial activation URL: ${accounts.enterprise.activationUrl}\n`,
    );
    if (accounts.onlineStore) {
      process.stdout.write(
        `Development Online Store activation URL: ${accounts.onlineStore.activationUrl}\n`,
      );
    }
    return new Date();
  }

  const context = await control.syncNode.findFirst({
    where: { nodeType: "ENTERPRISE", isPrimary: true, status: "ACTIVE" },
    select: { retailOrg: { select: { smtpSettingsJson: true } } },
  });
  let settings: Record<string, unknown> = {};
  try {
    settings = context?.retailOrg.smtpSettingsJson
      ? JSON.parse(context.retailOrg.smtpSettingsJson)
      : {};
  } catch {
    settings = {};
  }
  if (settings.enabled !== true || !settings.host || !settings.fromAddress) {
    throw new Error(
      "SMTP must be enabled before trial owner activation links can be delivered.",
    );
  }
  const transporter = nodemailer.createTransport({
    host: String(settings.host),
    port: Number(settings.port) || 587,
    secure: settings.secureConnection === true,
    auth:
      settings.username && settings.passwordMask
        ? {
            user: String(settings.username),
            pass: String(settings.passwordMask),
          }
        : undefined,
  });
  const fromName = String(settings.fromName || "Flash ERP").replace(/"/g, "'");
  const ownerName = request.owner.name.trim();
  const safeOwnerName = escapeEmailHtml(ownerName);
  const safeBusinessName = escapeEmailHtml(request.business.name.trim());
  const safeEnterpriseLoginId = escapeEmailHtml(accounts.enterprise.loginId);
  const safeEnterpriseActivationUrl = escapeEmailHtml(
    accounts.enterprise.activationUrl,
  );
  const safeOnlineStoreLoginId = accounts.onlineStore
    ? escapeEmailHtml(accounts.onlineStore.loginId)
    : null;
  const safeOnlineStoreActivationUrl = accounts.onlineStore
    ? escapeEmailHtml(accounts.onlineStore.activationUrl)
    : null;
  const onlineStoreText = accounts.onlineStore
    ? [
        "",
        "Online Store operator account",
        `Login ID: ${accounts.onlineStore.loginId}`,
        "Create a separate Online Store password:",
        accounts.onlineStore.activationUrl,
      ]
    : [];
  const onlineStoreHtml =
    safeOnlineStoreLoginId && safeOnlineStoreActivationUrl
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0 0;background:#f0fdf4;border:1px solid #bbf7d0;">
                  <tr>
                    <td style="padding:18px;">
                      <div style="font-size:11px;font-weight:700;color:#047857;text-transform:uppercase;">Online Store operator</div>
                      <div style="margin-top:8px;font-size:12px;color:#64748b;">Login ID</div>
                      <div style="margin-top:4px;font-size:16px;font-weight:700;color:#0f172a;word-break:break-all;">${safeOnlineStoreLoginId}</div>
                      <p style="margin:12px 0 16px;font-size:13px;line-height:1.55;color:#475569;">Use this account for browser POS and Online Store operations. Create a different password for this account.</p>
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td bgcolor="#047857" style="border-radius:6px;">
                            <a href="${safeOnlineStoreActivationUrl}" style="display:inline-block;padding:13px 18px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Set Online Store password</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>`
      : "";
  await transporter.sendMail({
    from: `"${fromName}" <${String(settings.fromAddress)}>`,
    to: request.owner.email,
    replyTo: settings.replyToAddress
      ? String(settings.replyToAddress)
      : undefined,
    subject: "Activate your Flash ERP trial workspace",
    text: [
      `Hello ${ownerName},`,
      "",
      `Your isolated Flash ERP workspace for ${request.business.name} is ready.`,
      "",
      "Enterprise owner account",
      `Login ID: ${accounts.enterprise.loginId}`,
      "Create your Enterprise owner password:",
      accounts.enterprise.activationUrl,
      ...onlineStoreText,
      "",
      "These secure activation links expire in 48 hours or when the trial ends, whichever comes first.",
      "If you did not request this trial, you can ignore this email.",
    ].join("\n"),
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f1f5f9;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Flash ERP trial workspace is ready.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #dbe3ee;">
            <tr>
              <td style="padding:22px 32px;background:#111827;color:#ffffff;">
                <div style="font-size:20px;font-weight:700;">Flash ERP</div>
                <div style="margin-top:4px;font-size:12px;color:#a7f3d0;">14-day isolated trial workspace</div>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 32px 30px;">
                <div style="font-size:12px;font-weight:700;color:#047857;text-transform:uppercase;">Workspace ready</div>
                <h1 style="margin:10px 0 14px;font-size:26px;line-height:1.25;color:#0f172a;">Activate your trial accounts</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#475569;">Hello ${safeOwnerName}, your isolated Flash ERP workspace for <strong style="color:#0f172a;">${safeBusinessName}</strong> is ready.</p>
                <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#475569;">The Enterprise and Online Store accounts are separate. Set a password for each account you intend to use; passwords are never sent by email.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 0;background:#f8fafc;border:1px solid #dbe3ee;">
                  <tr>
                    <td style="padding:18px;">
                      <div style="font-size:11px;font-weight:700;color:#6d28d9;text-transform:uppercase;">Enterprise owner</div>
                      <div style="margin-top:8px;font-size:12px;color:#64748b;">Login ID</div>
                      <div style="margin-top:4px;font-size:16px;font-weight:700;color:#0f172a;word-break:break-all;">${safeEnterpriseLoginId}</div>
                      <p style="margin:12px 0 16px;font-size:13px;line-height:1.55;color:#475569;">Use this account for HQ administration, configuration, reporting and oversight.</p>
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td bgcolor="#6d28d9" style="border-radius:6px;">
                            <a href="${safeEnterpriseActivationUrl}" style="display:inline-block;padding:13px 18px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Set Enterprise password</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                ${onlineStoreHtml}
                <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#64748b;">These secure links expire in 48 hours or when the trial ends, whichever comes first. If a button does not open, use the matching address from the plain-text part of this email. If you did not request this trial, you can ignore this message.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  });
  return new Date();
}

async function callback(payload: Record<string, unknown>) {
  const url = new URL(
    "/api/trials/provisioning-callback",
    requiredEnvironment("FLASH_ERP_TRIAL_CONTROL_PLANE_URL"),
  );
  const body = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac(
      "sha256",
      requiredEnvironment("FLASH_ERP_TRIAL_PROVISIONER_SECRET"),
    )
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-flash-timestamp": timestamp,
      "x-flash-signature": signature,
    },
    body,
    cache: "no-store",
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(
      result?.message ||
        `Trial control-plane callback returned HTTP ${response.status}.`,
    );
  }
}

async function provision(request: ProvisionRequest) {
  assertProvisioningEnabled();
  if (
    request.version !== 1 ||
    request.trialDays !== 14 ||
    !request.requestId ||
    !request.provisioningRequestKey
  ) {
    throw new Error("The trial provisioning request is invalid.");
  }
  const existing = await control.trialSignupRequest.findUnique({
    where: { id: request.requestId },
  });
  if (
    !existing ||
    existing.provisioningRequestKey !== request.provisioningRequestKey
  ) {
    throw new Error(
      "The trial provisioning request does not exist in the control plane.",
    );
  }
  if (existing.status === "ACTIVE" && existing.workspaceDatabaseName) return;

  const allocation = await allocateWorkspace(request);
  const startsAt = existing.trialStartsAt || new Date();
  const expiresAt = new Date(startsAt.getTime() + 14 * 24 * 60 * 60_000);
  const operationId = `trial:${request.requestNo}`;
  await control.$transaction(async (tx) => {
    await tx.trialSignupRequest.update({
      where: { id: request.requestId },
      data: {
        status: "PROVISIONING",
        provisionerReference: operationId,
        workspaceSlug: allocation.slug,
        workspaceDatabaseName: allocation.databaseName,
        workspacePort: allocation.port,
        ownerLoginId: request.owner.email.toLowerCase(),
        lastLifecycleAt: new Date(),
        failureCode: null,
        failureMessage: null,
      },
    });
    await tx.trialLifecycleEvent.create({
      data: {
        trialSignupRequestId: request.requestId,
        eventType: "WORKSPACE_ALLOCATED",
        outcome: "SUCCEEDED",
        actorType: "PROVISIONER",
        actorRef: operationId,
        previousStatus: existing.status,
        newStatus: "PROVISIONING",
        newExpiresAt: expiresAt,
        detailsJson: JSON.stringify({
          workspaceSlug: allocation.slug,
          databaseName: allocation.databaseName,
          port: allocation.port,
        }),
      },
    });
  });

  try {
    await ensureDatabase(allocation.databaseName);
    const databaseUrl = childDatabaseUrl(allocation.databaseName);
    await applyMigrations(databaseUrl);
    process.env.FLASH_ERP_TRIAL_WORKSPACE_SECRET = workspaceSecret(
      request.requestId,
      "activation",
    );
    const bootstrap = await bootstrapWorkspace(
      request,
      allocation,
      databaseUrl,
      startsAt,
      expiresAt,
    );
    writeWorkspaceEnvironment(request, allocation, databaseUrl);
    await manageRuntime("Ensure", allocation);
    await waitForRuntime(allocation.port);
    const activationSentAt = await sendActivationEmail(request, {
      enterprise: {
        loginId: bootstrap.owner.loginId,
        activationUrl: `${allocation.baseUrl}/trial/activate?token=${encodeURIComponent(bootstrap.ownerActivationToken)}`,
      },
      onlineStore: {
        loginId: bootstrap.onlineStoreOperator.loginId,
        activationUrl: `${allocation.baseUrl}/trial/activate?token=${encodeURIComponent(bootstrap.onlineStoreActivationToken)}`,
      },
    });
    const workspace = new PrismaClient({
      adapter: new PrismaMssql(databaseUrl),
    });
    try {
      await workspace.trialWorkspaceRuntime.update({
        where: { id: request.requestId },
        data: {
          status: "ACTIVE",
          expiredAt: null,
          lastLifecycleAt: new Date(),
        },
      });
    } finally {
      await workspace.$disconnect();
    }
    await callback({
      requestId: request.requestId,
      provisioningRequestKey: request.provisioningRequestKey,
      status: "ACTIVE",
      lifecycleAction: "PROVISIONED",
      provisionerReference: operationId,
      workspaceUrl: allocation.baseUrl,
      onlineStoreUrl: `${allocation.baseUrl}/online-store`,
      storefrontUrl: `${allocation.baseUrl}/shop/${allocation.slug}`,
      trialStartsAt: startsAt.toISOString(),
      trialExpiresAt: expiresAt.toISOString(),
      workspaceSlug: allocation.slug,
      workspaceDatabaseName: allocation.databaseName,
      workspacePort: allocation.port,
      ownerLoginId: request.owner.email.toLowerCase(),
      activationSentAt: activationSentAt.toISOString(),
    });
  } catch (error) {
    await callback({
      requestId: request.requestId,
      provisioningRequestKey: request.provisioningRequestKey,
      status: "FAILED",
      lifecycleAction: "PROVISIONED",
      provisionerReference: operationId,
      failureCode: "WORKSPACE_PROVISIONING_FAILED",
      failureMessage:
        error instanceof Error
          ? error.message.slice(0, 1000)
          : "Workspace provisioning failed.",
    }).catch(() => undefined);
    throw error;
  }
}

async function recoverPendingProvisioning() {
  assertProvisioningEnabled();
  const pending = await control.trialSignupRequest.findMany({
    where: {
      verifiedAt: { not: null },
      status: { in: ["AWAITING_PROVISIONER", "PROVISIONING"] },
    },
    orderBy: { createdAt: "asc" },
    take: 25,
  });

  const failures: string[] = [];
  for (const row of pending) {
    try {
      await provision({
        version: 1,
        requestId: row.id,
        requestNo: row.requestNo,
        provisioningRequestKey: row.provisioningRequestKey,
        trialDays: 14,
        owner: {
          name: row.contactName,
          email: row.email,
          phone: row.phone,
        },
        business: {
          name: row.companyName,
          type: row.businessType,
          countryCode: row.countryCode,
          city: row.city,
          branchCount: row.branchCount,
          employeeCountRange: row.employeeCountRange,
          preferredSlug: row.preferredSlug,
        },
      });
    } catch (error) {
      failures.push(
        `${row.requestNo}: ${error instanceof Error ? error.message.slice(0, 300) : "recovery failed"}`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Trial provisioning recovery completed with failures: ${failures.join(" | ")}`,
    );
  }
}

async function recoverFailedProvisioning() {
  assertProvisioningEnabled();
  const failed = await control.trialSignupRequest.findMany({
    where: {
      verifiedAt: { not: null },
      status: "FAILED",
      failureCode: "WORKSPACE_PROVISIONING_FAILED",
      workspaceUrl: null,
    },
    orderBy: { createdAt: "asc" },
    take: 25,
  });

  const failures: string[] = [];
  for (const row of failed) {
    try {
      await provision({
        version: 1,
        requestId: row.id,
        requestNo: row.requestNo,
        provisioningRequestKey: row.provisioningRequestKey,
        trialDays: 14,
        owner: {
          name: row.contactName,
          email: row.email,
          phone: row.phone,
        },
        business: {
          name: row.companyName,
          type: row.businessType,
          countryCode: row.countryCode,
          city: row.city,
          branchCount: row.branchCount,
          employeeCountRange: row.employeeCountRange,
          preferredSlug: row.preferredSlug,
        },
      });
    } catch (error) {
      failures.push(
        `${row.requestNo}: ${error instanceof Error ? error.message.slice(0, 300) : "recovery failed"}`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Failed trial provisioning recovery completed with failures: ${failures.join(" | ")}`,
    );
  }
}

async function reconcileWorkspaceSupportUser(input: {
  requestId: string;
  requestNo: string;
  workspaceSlug: string;
  workspaceDatabaseName: string;
}) {
  const workspace = new PrismaClient({
    adapter: new PrismaMssql(childDatabaseUrl(input.workspaceDatabaseName)),
  });
  try {
    const runtime = await workspace.trialWorkspaceRuntime.findUnique({
      where: { id: input.requestId },
      select: { ownerUserId: true },
    });
    if (!runtime) {
      throw new Error(
        `Trial runtime ${input.requestNo} is missing from its workspace database.`,
      );
    }
    const owner = await workspace.retailUser.findUnique({
      where: { id: runtime.ownerUserId },
      select: { retailOrgId: true },
    });
    if (!owner) {
      throw new Error(
        `Trial owner ${runtime.ownerUserId} is missing from ${input.requestNo}.`,
      );
    }
    const [node, mainStore] = await Promise.all([
      workspace.syncNode.findFirst({
        where: {
          retailOrgId: owner.retailOrgId,
          nodeType: SyncNodeType.ENTERPRISE,
          isPrimary: true,
        },
        select: { code: true },
      }),
      workspace.store.findUnique({
        where: {
          retailOrgId_code: {
            retailOrgId: owner.retailOrgId,
            code: "MAIN",
          },
        },
        select: { id: true },
      }),
    ]);
    if (!node || !mainStore) {
      throw new Error(
        `Trial workspace ${input.requestNo} is missing its enterprise node or main store.`,
      );
    }
    return await ensureTrialSupportAccount(workspace, {
      requestId: input.requestId,
      slug: input.workspaceSlug,
      storeId: mainStore.id,
      nodeCode: node.code,
      retailOrgId: owner.retailOrgId,
    });
  } finally {
    await workspace.$disconnect();
  }
}

async function reconcileActiveWorkspaces() {
  assertProvisioningEnabled();
  const active = await control.trialSignupRequest.findMany({
    where: {
      status: "ACTIVE",
      trialExpiresAt: { gt: new Date() },
      workspaceSlug: { not: null },
      workspaceDatabaseName: { not: null },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      requestNo: true,
      companyName: true,
      email: true,
      phone: true,
      businessType: true,
      countryCode: true,
      city: true,
      workspaceSlug: true,
      workspaceDatabaseName: true,
      workspacePort: true,
    },
  });

  const failures: string[] = [];
  for (const row of active) {
    if (!row.workspaceSlug || !row.workspaceDatabaseName || !row.workspacePort)
      continue;
    try {
      const databaseUrl = childDatabaseUrl(row.workspaceDatabaseName);
      await applyMigrations(databaseUrl);
      const repaired = await reconcileWorkspaceStorefront({
        requestId: row.id,
        requestNo: row.requestNo,
        companyName: row.companyName,
        email: row.email,
        phone: row.phone,
        countryCode: row.countryCode,
        city: row.city,
        workspaceSlug: row.workspaceSlug,
        workspaceDatabaseName: row.workspaceDatabaseName,
      });
      if (repaired) {
        await control.trialLifecycleEvent.create({
          data: {
            trialSignupRequestId: row.id,
            eventType: "STOREFRONT_RECONCILED",
            outcome: "SUCCEEDED",
            actorType: "PROVISIONER",
            actorRef: `trial:${row.requestNo}`,
            previousStatus: "ACTIVE",
            newStatus: "ACTIVE",
            detailsJson: JSON.stringify({ workspaceSlug: row.workspaceSlug }),
          },
        });
      }
      const sampleData = await reconcileWorkspaceSampleData({
        requestId: row.id,
        requestNo: row.requestNo,
        businessType: row.businessType,
        workspaceDatabaseName: row.workspaceDatabaseName,
      });
      if (sampleData && sampleData.createdProductCount > 0) {
        await control.trialLifecycleEvent.create({
          data: {
            trialSignupRequestId: row.id,
            eventType: "SAMPLE_DATA_RECONCILED",
            outcome: "SUCCEEDED",
            actorType: "PROVISIONER",
            actorRef: `trial:${row.requestNo}`,
            previousStatus: "ACTIVE",
            newStatus: "ACTIVE",
            detailsJson: JSON.stringify({
              workspaceSlug: row.workspaceSlug,
              businessType: sampleData.businessType,
              productCount: sampleData.productCount,
            }),
          },
        });
      }
      const supportAccountRepaired = await reconcileWorkspaceSupportUser({
        requestId: row.id,
        requestNo: row.requestNo,
        workspaceSlug: row.workspaceSlug,
        workspaceDatabaseName: row.workspaceDatabaseName,
      });
      if (supportAccountRepaired) {
        await control.trialLifecycleEvent.create({
          data: {
            trialSignupRequestId: row.id,
            eventType: "SUPPORT_ACCOUNT_RECONCILED",
            outcome: "SUCCEEDED",
            actorType: "PROVISIONER",
            actorRef: `trial:${row.requestNo}`,
            previousStatus: "ACTIVE",
            newStatus: "ACTIVE",
            detailsJson: JSON.stringify({ workspaceSlug: row.workspaceSlug }),
          },
        });
      }
      const allocation = allocationFromRow({
        workspaceSlug: row.workspaceSlug,
        workspaceDatabaseName: row.workspaceDatabaseName,
        workspacePort: row.workspacePort,
      });
      writeWorkspaceEnvironment(
        {
          requestId: row.id,
          business: { type: row.businessType },
        },
        allocation,
        childDatabaseUrl(row.workspaceDatabaseName),
      );
      await manageRuntime("Ensure", allocation);
      await waitForRuntime(allocation.port);
      await control.trialLifecycleEvent.create({
        data: {
          trialSignupRequestId: row.id,
          eventType: "RUNTIME_REFRESHED",
          outcome: "SUCCEEDED",
          actorType: "PROVISIONER",
          actorRef: `trial:${row.requestNo}`,
          previousStatus: "ACTIVE",
          newStatus: "ACTIVE",
          detailsJson: JSON.stringify({
            workspaceSlug: row.workspaceSlug,
            port: row.workspacePort,
          }),
        },
      });
    } catch (error) {
      failures.push(
        `${row.requestNo}: ${error instanceof Error ? error.message.slice(0, 300) : "storefront reconciliation failed"}`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Active trial storefront reconciliation completed with failures: ${failures.join(" | ")}`,
    );
  }
}

async function expireChild(request: {
  id: string;
  requestNo: string;
  workspaceSlug: string;
  workspaceDatabaseName: string;
  trialExpiresAt: Date;
}) {
  const databaseUrl = childDatabaseUrl(request.workspaceDatabaseName);
  const workspace = new PrismaClient({ adapter: new PrismaMssql(databaseUrl) });
  try {
    const now = new Date();
    await workspace.$transaction(async (tx) => {
      await tx.trialWorkspaceRuntime.update({
        where: { id: request.id },
        data: { status: "EXPIRED", expiredAt: now, lastLifecycleAt: now },
      });
      await tx.retailUserSession.updateMany({
        where: { revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.retailUser.updateMany({
        where: {
          loginId: trialSupportLoginId(request.workspaceSlug),
          accountStatus: UserAccountStatus.ACTIVE,
          deletedAt: null,
        },
        data: {
          accountStatus: UserAccountStatus.DISABLED,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await tx.store.updateMany({
        where: { licenseStatus: "TRIAL" },
        data: { licenseStatus: "EXPIRED" },
      });
      await tx.warehouse.updateMany({
        where: { licenseStatus: "TRIAL" },
        data: { licenseStatus: "EXPIRED" },
      });
      await tx.terminal.updateMany({
        where: { licenseStatus: "TRIAL" },
        data: { licenseStatus: "EXPIRED" },
      });
    }, {
      maxWait: 60_000,
      timeout: 60_000,
    });
  } finally {
    await workspace.$disconnect();
  }
}

function allocationFromRow(row: {
  workspaceSlug: string;
  workspaceDatabaseName: string;
  workspacePort: number;
}) {
  const runtimeRoot = path.resolve(
    requiredEnvironment("FLASH_ERP_TRIAL_RUNTIME_ROOT"),
  );
  const runtimeDirectory = containedPath(
    runtimeRoot,
    path.join(runtimeRoot, row.workspaceSlug),
  );
  return {
    slug: row.workspaceSlug,
    databaseName: row.workspaceDatabaseName,
    port: row.workspacePort,
    baseUrl: publicBaseUrl(row.workspaceSlug, row.workspacePort),
    runtimeDirectory,
    configPath: containedPath(
      runtimeDirectory,
      path.join(runtimeDirectory, "config", "workspace.env"),
    ),
  };
}

async function sweepExpired() {
  assertProvisioningEnabled();
  const due = await control.trialSignupRequest.findMany({
    where: {
      status: "ACTIVE",
      trialExpiresAt: { lte: new Date() },
      workspaceSlug: { not: null },
      workspaceDatabaseName: { not: null },
      workspacePort: { not: null },
    },
  });
  for (const row of due) {
    if (
      !row.workspaceSlug ||
      !row.workspaceDatabaseName ||
      !row.workspacePort ||
      !row.trialExpiresAt
    )
      continue;
    const allocation = allocationFromRow({
      workspaceSlug: row.workspaceSlug,
      workspaceDatabaseName: row.workspaceDatabaseName,
      workspacePort: row.workspacePort,
    });
    await expireChild({
      id: row.id,
      requestNo: row.requestNo,
      workspaceSlug: row.workspaceSlug,
      workspaceDatabaseName: row.workspaceDatabaseName,
      trialExpiresAt: row.trialExpiresAt,
    });
    await manageRuntime("Stop", allocation);
    await callback({
      requestId: row.id,
      provisioningRequestKey: row.provisioningRequestKey,
      status: "EXPIRED",
      lifecycleAction: "EXPIRED",
      provisionerReference:
        row.provisionerReference || `trial:${row.requestNo}`,
    });
  }
}

async function extendTrial(input: ExtensionRequest) {
  assertProvisioningEnabled();
  if (
    input.version !== 1 ||
    !Number.isInteger(input.days) ||
    input.days < 1 ||
    input.days > 90
  ) {
    throw new Error("The trial extension request is invalid.");
  }
  const row = await control.trialSignupRequest.findUnique({
    where: { id: input.requestId },
  });
  if (
    !row ||
    row.provisioningRequestKey !== input.provisioningRequestKey ||
    !["ACTIVE", "EXPIRED"].includes(row.status) ||
    !row.workspaceSlug ||
    !row.workspaceDatabaseName ||
    !row.workspacePort ||
    !row.trialExpiresAt ||
    !row.trialStartsAt
  ) {
    throw new Error(
      "The trial extension target is not a complete provisioned workspace.",
    );
  }
  const allocation = allocationFromRow({
    workspaceSlug: row.workspaceSlug,
    workspaceDatabaseName: row.workspaceDatabaseName,
    workspacePort: row.workspacePort,
  });
  const previousExpiry = row.trialExpiresAt;
  const base = Math.max(Date.now(), previousExpiry.getTime());
  const nextExpiry = new Date(base + input.days * 24 * 60 * 60_000);
  const databaseUrl = childDatabaseUrl(row.workspaceDatabaseName);
  const workspace = new PrismaClient({ adapter: new PrismaMssql(databaseUrl) });
  let activationSentAt: Date | null = null;
  try {
    const runtime = await workspace.trialWorkspaceRuntime.findUniqueOrThrow({
      where: { id: row.id },
    });
    await workspace.$transaction(async (tx) => {
      await tx.trialWorkspaceRuntime.update({
        where: { id: row.id },
        data: {
          status: "ACTIVE",
          trialExpiresAt: nextExpiry,
          expiredAt: null,
          extensionCount: { increment: 1 },
          lastLifecycleAt: new Date(),
        },
      });
      await tx.store.updateMany({
        data: { licenseStatus: "TRIAL", licensedUntil: nextExpiry },
      });
      await tx.warehouse.updateMany({
        data: { licenseStatus: "TRIAL", licensedUntil: nextExpiry },
      });
      await tx.terminal.updateMany({
        data: { licenseStatus: "TRIAL", licensedUntil: nextExpiry },
      });
    }, {
      maxWait: 60_000,
      timeout: 60_000,
    });
    await manageRuntime("Start", allocation);
    await waitForRuntime(allocation.port);
    // Re-activate (or create) the Flash support account so staff access
    // resumes together with the extended trial.
    await reconcileWorkspaceSupportUser({
      requestId: row.id,
      requestNo: row.requestNo,
      workspaceSlug: row.workspaceSlug,
      workspaceDatabaseName: row.workspaceDatabaseName,
    });

    if (!runtime.activatedAt) {
      const owner = await workspace.retailUser.findUniqueOrThrow({
        where: { id: runtime.ownerUserId },
      });
      const onlineStoreOperator = await workspace.retailUser.findFirst({
        where: {
          retailOrgId: owner.retailOrgId,
          accountStatus: UserAccountStatus.INVITED,
          homeStore: {
            storeMode: "ONLINE_DIRECT",
            status: RecordStatus.ACTIVE,
          },
          userRoles: {
            some: {
              role: {
                code: "ONLINE_STORE_SUPERVISOR",
                status: RecordStatus.ACTIVE,
              },
            },
          },
          deletedAt: null,
        },
      });
      process.env.FLASH_ERP_TRIAL_WORKSPACE_SECRET = workspaceSecret(
        row.id,
        "activation",
      );
      const ownerToken = createTrialOwnerActivationToken({
        requestId: row.id,
        retailOrgId: owner.retailOrgId,
        userId: owner.id,
        email: owner.email || owner.loginId,
        exp: Math.min(nextExpiry.getTime(), Date.now() + 48 * 60 * 60_000),
      });
      const onlineStoreToken = onlineStoreOperator
        ? createTrialOwnerActivationToken({
            requestId: row.id,
            retailOrgId: onlineStoreOperator.retailOrgId,
            userId: onlineStoreOperator.id,
            email: onlineStoreOperator.email || row.email,
            exp: Math.min(nextExpiry.getTime(), Date.now() + 48 * 60 * 60_000),
          })
        : null;
      activationSentAt = await sendActivationEmail(
        {
          version: 1,
          requestId: row.id,
          requestNo: row.requestNo,
          provisioningRequestKey: row.provisioningRequestKey,
          trialDays: 14,
          owner: {
            name: row.contactName,
            email: row.email,
            phone: row.phone,
          },
          business: {
            name: row.companyName,
            type: row.businessType,
            countryCode: row.countryCode,
            city: row.city,
            branchCount: row.branchCount,
            employeeCountRange: row.employeeCountRange,
            preferredSlug: row.preferredSlug,
          },
        },
        {
          enterprise: {
            loginId: owner.loginId,
            activationUrl: `${allocation.baseUrl}/trial/activate?token=${encodeURIComponent(ownerToken)}`,
          },
          onlineStore:
            onlineStoreOperator && onlineStoreToken
              ? {
                  loginId: onlineStoreOperator.loginId,
                  activationUrl: `${allocation.baseUrl}/trial/activate?token=${encodeURIComponent(onlineStoreToken)}`,
                }
              : undefined,
        },
      );
    }
  } finally {
    await workspace.$disconnect();
  }
  await callback({
    requestId: row.id,
    provisioningRequestKey: row.provisioningRequestKey,
    status: "ACTIVE",
    lifecycleAction: "EXTENDED",
    provisionerReference: row.provisionerReference || `trial:${row.requestNo}`,
    workspaceUrl: row.workspaceUrl || allocation.baseUrl,
    onlineStoreUrl: row.onlineStoreUrl || `${allocation.baseUrl}/online-store`,
    storefrontUrl:
      row.storefrontUrl || `${allocation.baseUrl}/shop/${allocation.slug}`,
    trialStartsAt: row.trialStartsAt.toISOString(),
    trialExpiresAt: nextExpiry.toISOString(),
    workspaceSlug: allocation.slug,
    workspaceDatabaseName: allocation.databaseName,
    workspacePort: allocation.port,
    ownerLoginId: row.ownerLoginId || row.email,
    activationSentAt: activationSentAt?.toISOString(),
  });
}

async function readStandardInput() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const command = process.argv[2]?.trim().toLowerCase();
  if (command === "module-smoke") {
    if (process.env.FLASH_ERP_TRIAL_PROVISIONER_MODULE_SMOKE !== "true") {
      throw new Error("The trial provisioner module smoke is disabled.");
    }
    process.stdout.write("TRIAL_PROVISIONER_MODULE_RESOLUTION=OK\n");
    return;
  }
  if (command === "sweep") return sweepExpired();
  if (command === "recover") return recoverPendingProvisioning();
  if (command === "recover-failed") return recoverFailedProvisioning();
  if (command === "reconcile-active") return reconcileActiveWorkspaces();
  const raw = await readStandardInput();
  if (!raw)
    throw new Error(
      "The trial provisioner worker expected a JSON request on standard input.",
    );
  if (command === "provision")
    return provision(JSON.parse(raw) as ProvisionRequest);
  if (command === "extend")
    return extendTrial(JSON.parse(raw) as ExtensionRequest);
  throw new Error(
    "Use provision, recover, recover-failed, reconcile-active, extend, or sweep with the trial provisioner worker.",
  );
}

main()
  .then(async () => {
    await control.$disconnect();
  })
  .catch(async (error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    );
    await control.$disconnect().catch(() => undefined);
    process.exit(1);
  });
