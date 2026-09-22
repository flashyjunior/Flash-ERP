import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@prisma/client";
import { securityPermissionCatalog, trialSupportLoginId } from "@flash-erp/domain";
import dotenv from "dotenv";
import sql from "mssql";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

if (process.env.FLASH_ERP_TRIAL_DISPOSABLE_TEST !== "true") {
  throw new Error(
    "Set FLASH_ERP_TRIAL_DISPOSABLE_TEST=true to create and remove an isolated local SQL Server trial fixture.",
  );
}
const controlUrl = process.env.DATABASE_URL?.trim();
const provisionerSecret =
  process.env.FLASH_ERP_TRIAL_PROVISIONER_SECRET?.trim();
if (!controlUrl || !provisionerSecret) {
  throw new Error(
    "DATABASE_URL and FLASH_ERP_TRIAL_PROVISIONER_SECRET are required.",
  );
}
const datasourceUrl = controlUrl;
const signingSecret = provisionerSecret;

type SqlConnection = {
  server: string;
  database: string;
  user: string;
  password: string;
  encrypt: string;
  trustServerCertificate: string;
};

function parseSqlServerUrl(value: string): SqlConnection {
  const body = value
    .trim()
    .replace(/^"|"$/g, "")
    .replace(/^sqlserver:\/\//i, "");
  const [server, ...parts] = body.split(";");
  const values = new Map<string, string>();
  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator > 0)
      values.set(
        part.slice(0, separator).trim().toLowerCase(),
        part.slice(separator + 1),
      );
  }
  return {
    server,
    database: values.get("database") || values.get("initial catalog") || "",
    user:
      values.get("user") || values.get("user id") || values.get("uid") || "",
    password: values.get("password") || values.get("pwd") || "",
    encrypt: values.get("encrypt") || "false",
    trustServerCertificate: values.get("trustservercertificate") || "true",
  };
}

function prismaUrl(connection: SqlConnection) {
  return [
    `sqlserver://${connection.server}`,
    `database=${connection.database}`,
    connection.user ? `user=${connection.user}` : "",
    connection.password ? `password=${connection.password}` : "",
    `encrypt=${connection.encrypt}`,
    `trustServerCertificate=${connection.trustServerCertificate}`,
  ]
    .filter(Boolean)
    .join(";");
}

function mssqlUrl(connection: SqlConnection) {
  return [
    `Server=${connection.server}`,
    `Database=${connection.database}`,
    connection.user ? `User Id=${connection.user}` : "",
    connection.password ? `Password=${connection.password}` : "",
    `Encrypt=${connection.encrypt}`,
    `TrustServerCertificate=${connection.trustServerCertificate}`,
  ]
    .filter(Boolean)
    .join(";");
}

function runWorker(
  command:
    | "provision"
    | "sweep"
    | "extend"
    | "convert"
    | "set-public-url"
    | "reconcile-active",
  body = "",
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        path.join(
          process.cwd(),
          "scripts",
          "trial-workspace-provisioner-worker.ts",
        ),
        command,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: "development",
          FLASH_ERP_TRIAL_PROVISIONER_ENABLED: "true",
          FLASH_ERP_TRIAL_SQL_ADMIN_URL: datasourceUrl,
          FLASH_ERP_TRIAL_DATABASE_PREFIX: "flash_erp_trial_gate_",
          FLASH_ERP_TRIAL_RUNTIME_ROOT: runtimeRoot,
          FLASH_ERP_TRIAL_PORT_START: "3198",
          FLASH_ERP_TRIAL_PORT_END: "3199",
          FLASH_ERP_TRIAL_PUBLIC_URL_TEMPLATE: "http://127.0.0.1:{port}",
          FLASH_ERP_TRIAL_ALLOW_INSECURE_URLS: "true",
          FLASH_ERP_TRIAL_EXPOSE_ACTIVATION: "true",
          FLASH_ERP_TRIAL_INFRA_MODE: "DISPOSABLE",
          FLASH_ERP_TRIAL_CONTROL_PLANE_URL:
            process.env.FLASH_ERP_TRIAL_DISPOSABLE_CONTROL_URL?.trim() ||
            "http://127.0.0.1:3010",
        },
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(output);
      else
        reject(
          new Error(
            `Disposable trial worker failed with exit code ${code}: ${output.slice(-3000)}`,
          ),
        );
    });
    child.stdin.end(body);
  });
}

function activateAccount(
  databaseUrl: string,
  requestId: string,
  token: string,
  password: string,
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
        "--tsconfig=apps/enterprise-web/tsconfig.json",
        path.join(
          process.cwd(),
          "scripts",
          "trial-owner-activation-test-worker.ts",
        ),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          FLASH_ERP_TRIAL_WORKSPACE_MODE: "true",
          FLASH_ERP_TRIAL_WORKSPACE_SECRET: crypto
            .createHmac("sha256", signingSecret)
            .update(`activation:${requestId}`)
            .digest("base64url"),
        },
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(output);
      else
        reject(
          new Error(
            `Trial owner activation failed with exit code ${code}: ${output.slice(-2000)}`,
          ),
        );
    });
    child.stdin.end(JSON.stringify({ token, password }));
  });
}

function createSampleData(
  databaseUrl: string,
  input: { retailOrgId: string; userId: string; actorLabel: string },
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
        "--tsconfig=apps/enterprise-web/tsconfig.json",
        path.join(process.cwd(), "scripts", "trial-sample-data-test-worker.ts"),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          NODE_ENV: "development",
          FLASH_ERP_TRIAL_WORKSPACE_MODE: "true",
          FLASH_ERP_TRIAL_BUSINESS_TYPE: "RETAIL",
          FLASH_ERP_TRIAL_SAMPLE_DATA_TEST: "true",
        },
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(output);
      else
        reject(
          new Error(
            `Trial sample-data worker failed with exit code ${code}: ${output.slice(-3000)}`,
          ),
        );
    });
    child.stdin.end(JSON.stringify(input));
  });
}

const testId = crypto.randomUUID();
const suffix = testId.replace(/-/g, "").slice(-8);
const requestNo = `TRIAL-GATE-${suffix.toUpperCase()}`;
const runtimeRoot = path.join(os.tmpdir(), "flash-erp-trial-lifecycle", suffix);
const control = new PrismaClient({ adapter: new PrismaMssql(datasourceUrl) });
let childDatabaseName = "";

async function dropFixtureDatabase() {
  if (!/^flash_erp_trial_gate_[a-z0-9_]+$/.test(childDatabaseName)) return;
  const admin = parseSqlServerUrl(datasourceUrl);
  const pool = await new sql.ConnectionPool(
    mssqlUrl({ ...admin, database: "master" }),
  ).connect();
  try {
    await pool
      .request()
      .query(
        `IF DB_ID(N'${childDatabaseName}') IS NOT NULL BEGIN ALTER DATABASE [${childDatabaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${childDatabaseName}]; END`,
      );
  } finally {
    await pool.close();
  }
}

async function main() {
  await control.trialSignupRequest.create({
    data: {
      id: testId,
      requestNo,
      companyName: "Disposable Trial Gate",
      contactName: "Trial Gate Owner",
      email: `trial-gate-${suffix}@example.test`,
      emailNormalized: `trial-gate-${suffix}@example.test`,
      phone: "+233200000001",
      countryCode: "GH",
      city: "Accra",
      businessType: "RETAIL",
      branchCount: 1,
      employeeCountRange: "1_5",
      preferredSlug: `trial-gate-${suffix}`,
      status: "VERIFIED",
      verifiedAt: new Date(),
      provisioningRequestKey: `flash-erp-trial:${testId}`,
      marketingConsent: false,
      termsAcceptedAt: new Date(),
    },
  });
  const payload = {
    version: 1,
    requestId: testId,
    requestNo,
    provisioningRequestKey: `flash-erp-trial:${testId}`,
    trialDays: 14,
    owner: {
      name: "Trial Gate Owner",
      email: `trial-gate-${suffix}@example.test`,
      phone: "+233200000001",
    },
    business: {
      name: "Disposable Trial Gate",
      type: "RETAIL",
      countryCode: "GH",
      city: "Accra",
      branchCount: 1,
      employeeCountRange: "1_5",
      preferredSlug: `trial-gate-${suffix}`,
    },
    products: [
      "HQ_ENTERPRISE",
      "ONLINE_STORE",
      "ECOMMERCE_STOREFRONT",
      "STORE_DESKTOP",
    ],
  };
  const provisionOutput = await runWorker("provision", JSON.stringify(payload));
  assert.match(provisionOutput, /Development trial activation URL:/);
  const activationUrl = provisionOutput.match(
    /Development trial activation URL:\s*(\S+)/,
  )?.[1];
  assert.ok(
    activationUrl,
    "The disposable provisioner must expose its gated activation URL.",
  );
  const onlineStoreActivationUrl = provisionOutput.match(
    /Development Online Store activation URL:\s*(\S+)/,
  )?.[1];
  assert.ok(
    onlineStoreActivationUrl,
    "The disposable provisioner must expose its gated Online Store activation URL.",
  );

  let request = await control.trialSignupRequest.findUniqueOrThrow({
    where: { id: testId },
  });
  assert.equal(request.status, "ACTIVE");
  assert.ok(request.workspaceDatabaseName);
  assert.ok(request.workspacePort);
  assert.ok(request.workspaceSlug);
  const customWorkspaceUrl = `https://trial-gate-${suffix}.example.test`;
  await runWorker(
    "set-public-url",
    JSON.stringify({
      version: 1,
      workspaceSlug: request.workspaceSlug,
      baseUrl: customWorkspaceUrl,
      actorRef: "trial-lifecycle-gate",
    }),
  );
  request = await control.trialSignupRequest.findUniqueOrThrow({
    where: { id: testId },
  });
  assert.equal(request.workspaceUrl, customWorkspaceUrl);
  assert.equal(request.onlineStoreUrl, `${customWorkspaceUrl}/online-store`);
  assert.equal(
    request.storefrontUrl,
    `${customWorkspaceUrl}/shop/${request.workspaceSlug}`,
  );
  assert.equal(
    await control.trialLifecycleEvent.count({
      where: {
        trialSignupRequestId: testId,
        eventType: "PUBLIC_URL_CHANGED",
        outcome: "SUCCEEDED",
      },
    }),
    1,
  );
  const workspaceEnvironment = readFileSync(
    path.join(runtimeRoot, request.workspaceSlug || "", "config", "workspace.env"),
    "utf8",
  );
  assert.ok(
    workspaceEnvironment.includes(
      `FLASH_ERP_ENTERPRISE_APP_URL=${JSON.stringify(customWorkspaceUrl)}`,
    ),
    "The custom workspace URL must be written into the isolated runtime environment.",
  );
  assert.match(workspaceEnvironment, /FLASH_ERP_COOKIE_SECURE="true"/);
  childDatabaseName = request.workspaceDatabaseName || "";
  const childUrl = prismaUrl({
    ...parseSqlServerUrl(datasourceUrl),
    database: childDatabaseName,
  });
  const activationToken = new URL(activationUrl).searchParams.get("token");
  assert.ok(activationToken);
  const onlineStoreActivationToken = new URL(
    onlineStoreActivationUrl,
  ).searchParams.get("token");
  assert.ok(onlineStoreActivationToken);
  assert.match(
    await activateAccount(
      childUrl,
      testId,
      activationToken,
      "FlashTrialOwner9",
    ),
    /Enterprise owner account is active/i,
  );
  assert.match(
    await activateAccount(
      childUrl,
      testId,
      onlineStoreActivationToken,
      "FlashTrialOnline9",
    ),
    /Online Store operator account is active/i,
  );
  const workspace = new PrismaClient({ adapter: new PrismaMssql(childUrl) });
  try {
    const runtime = await workspace.trialWorkspaceRuntime.findUniqueOrThrow({
      where: { id: testId },
    });
    assert.equal(runtime.status, "ACTIVE");
    assert.equal(
      Math.round(
        (runtime.trialExpiresAt.getTime() - runtime.trialStartsAt.getTime()) /
          86_400_000,
      ),
      14,
    );
    const owner = await workspace.retailUser.findUniqueOrThrow({
      where: { id: runtime.ownerUserId },
    });
    assert.equal(owner.accountStatus, "ACTIVE");
    assert.ok(owner.passwordHash);
    const onlineStoreOperator = await workspace.retailUser.findFirstOrThrow({
      where: {
        homeStore: { storeMode: "ONLINE_DIRECT", status: "ACTIVE" },
        userRoles: {
          some: { role: { code: "ONLINE_STORE_SUPERVISOR", status: "ACTIVE" } },
        },
      },
      include: { homeStore: true, userRoles: { include: { role: true } } },
    });
    assert.equal(onlineStoreOperator.accountStatus, "ACTIVE");
    assert.equal(onlineStoreOperator.homeStore?.storeMode, "ONLINE_DIRECT");
    assert.ok(onlineStoreOperator.passwordHash);
    assert.notEqual(onlineStoreOperator.passwordHash, owner.passwordHash);
    const publicStorefront = await workspace.store.findFirstOrThrow({
      where: { retailOrgId: owner.retailOrgId, code: "ONLINE" },
    });
    assert.equal(publicStorefront.ecommerceEnabled, true);
    assert.equal(publicStorefront.ecommerceSlug, request.workspaceSlug);
    assert.equal(publicStorefront.ecommerceDisplayName, request.companyName);
    const mainStore = await workspace.store.findFirstOrThrow({
      where: { retailOrgId: owner.retailOrgId, code: "MAIN" },
    });
    assert.equal(mainStore.ecommerceEnabled, false);
    assert.equal(mainStore.ecommerceSlug, null);

    const seededProduct = await workspace.product.findFirstOrThrow({
      where: { retailOrgId: owner.retailOrgId, code: "TRIAL-001" },
    });
    assert.equal(
      await workspace.product.count({
        where: { retailOrgId: owner.retailOrgId, code: { startsWith: "TRIAL-" } },
      }),
      20,
      "Provisioning must create the business-type starter catalogue before activation.",
    );
    assert.equal(
      await workspace.inventoryLedgerEntry.count({
        where: {
          retailOrgId: owner.retailOrgId,
          referenceType: "trial-sample-opening",
        },
      }),
      40,
      "Provisioning must create one deterministic opening row per product and location.",
    );
    const editedSampleName = `${seededProduct.name} - owner edited`;
    await workspace.product.update({
      where: { id: seededProduct.id },
      data: { name: editedSampleName },
    });

    await workspace.store.update({
      where: { id: mainStore.id },
      data: { ecommerceEnabled: true, ecommerceSlug: request.workspaceSlug },
    });
    const mainWarehouse = await workspace.warehouse.findUniqueOrThrow({
      where: {
        retailOrgId_code: { retailOrgId: owner.retailOrgId, code: "MAIN-WH" },
      },
    });
    const onlineWarehouse = await workspace.warehouse.findUniqueOrThrow({
      where: {
        retailOrgId_code: { retailOrgId: owner.retailOrgId, code: "ONLINE-WH" },
      },
    });
    const onlineLocation = await workspace.inventoryLocation.findUniqueOrThrow({
      where: {
        retailOrgId_code: {
          retailOrgId: owner.retailOrgId,
          code: "ONLINE-SALES",
        },
      },
    });
    await workspace.inventoryLocation.update({
      where: { id: onlineLocation.id },
      data: { storeId: mainStore.id, warehouseId: mainWarehouse.id },
    });
    await workspace.warehouse.update({
      where: { id: onlineWarehouse.id },
      data: { storeId: mainStore.id },
    });
    await workspace.store.update({
      where: { id: publicStorefront.id },
      data: { ecommerceEnabled: false, ecommerceSlug: null },
    });
    await runWorker("reconcile-active");
    const reconciledMainStore = await workspace.store.findUniqueOrThrow({
      where: { id: mainStore.id },
    });
    const reconciledPublicStorefront = await workspace.store.findUniqueOrThrow({
      where: {
        retailOrgId_code: { retailOrgId: owner.retailOrgId, code: "ONLINE" },
      },
    });
    assert.equal(reconciledMainStore.ecommerceEnabled, false);
    assert.equal(reconciledMainStore.ecommerceSlug, null);
    assert.equal(reconciledPublicStorefront.storeMode, "ONLINE_DIRECT");
    assert.equal(reconciledPublicStorefront.ecommerceEnabled, true);
    assert.equal(
      reconciledPublicStorefront.ecommerceSlug,
      request.workspaceSlug,
    );
    const reconciledOnlineWarehouse =
      await workspace.warehouse.findUniqueOrThrow({
        where: {
          retailOrgId_code: {
            retailOrgId: owner.retailOrgId,
            code: "ONLINE-WH",
          },
        },
      });
    assert.equal(
      reconciledOnlineWarehouse.storeId,
      reconciledPublicStorefront.id,
    );
    const reconciledOnlineLocation =
      await workspace.inventoryLocation.findUniqueOrThrow({
        where: {
          retailOrgId_code: {
            retailOrgId: owner.retailOrgId,
            code: "ONLINE-SALES",
          },
        },
      });
    assert.equal(
      reconciledOnlineLocation.storeId,
      reconciledPublicStorefront.id,
    );
    assert.equal(
      reconciledOnlineLocation.warehouseId,
      reconciledOnlineWarehouse.id,
    );
    const reconciledOnlineStoreOperator =
      await workspace.retailUser.findUniqueOrThrow({
        where: { id: onlineStoreOperator.id },
      });
    assert.equal(
      reconciledOnlineStoreOperator.homeStoreId,
      reconciledPublicStorefront.id,
    );
    assert.equal(
      (
        await workspace.product.findUniqueOrThrow({
          where: { id: seededProduct.id },
        })
      ).name,
      editedSampleName,
      "Idempotent reconciliation must preserve trial-user product edits.",
    );
    assert.match(
      await createSampleData(childUrl, {
        retailOrgId: owner.retailOrgId,
        userId: owner.id,
        actorLabel: owner.displayName,
      }),
      /"createdProductCount":0/,
    );
    assert.equal(
      await workspace.product.count({
        where: { retailOrgId: owner.retailOrgId, code: { startsWith: "TRIAL-" } },
      }),
      20,
    );
    assert.equal(
      await workspace.inventoryLedgerEntry.count({
        where: {
          retailOrgId: owner.retailOrgId,
          referenceType: "trial-sample-opening",
        },
      }),
      40,
    );
    assert.equal(
      await workspace.inventoryCatalogProduct.count({
        where: {
          retailOrgId: owner.retailOrgId,
          catalog: { code: "TRIAL-STARTER" },
        },
      }),
      20,
    );
    assert.equal(
      await workspace.storeProductSellingUnit.count({
        where: {
          retailOrgId: owner.retailOrgId,
          configurationKey: { startsWith: "trial-sample:" },
        },
      }),
      40,
    );
    assert.equal(
      await workspace.ecommerceFulfillmentLocation.count({
        where: {
          retailOrgId: owner.retailOrgId,
          storefrontStoreId: reconciledPublicStorefront.id,
          status: "ACTIVE",
        },
      }),
      2,
    );
    const runtimeRefreshEvent = await control.trialLifecycleEvent.findFirst({
      where: {
        trialSignupRequestId: request.id,
        eventType: "RUNTIME_REFRESHED",
        outcome: "SUCCEEDED",
      },
    });
    assert.ok(runtimeRefreshEvent);
    const ownerPermissionCount = await workspace.rolePermission.count({
      where: { role: { code: "HQ_ADMIN" } },
    });
    assert.equal(ownerPermissionCount, securityPermissionCatalog.length);
    assert.equal(
      await workspace.store.count({ where: { licenseStatus: "TRIAL" } }),
      2,
    );
    assert.equal(
      await workspace.warehouse.count({ where: { licenseStatus: "TRIAL" } }),
      2,
    );
    assert.equal(
      await workspace.terminal.count({ where: { licenseStatus: "TRIAL" } }),
      1,
    );
    await workspace.retailUserSession.create({
      data: {
        retailOrgId: owner.retailOrgId,
        retailUserId: owner.id,
        tokenHash: crypto
          .createHash("sha256")
          .update(`trial-session:${testId}`)
          .digest("hex"),
        expiresAt: new Date(Date.now() + 60 * 60_000),
        ipAddress: "127.0.0.1",
        userAgent: "trial-lifecycle-gate",
      },
    });

    const expiredAt = new Date(Date.now() - 60_000);
    await workspace.trialWorkspaceRuntime.update({
      where: { id: testId },
      data: { trialExpiresAt: expiredAt },
    });
    await control.trialSignupRequest.update({
      where: { id: testId },
      data: { trialExpiresAt: expiredAt },
    });
  } finally {
    await workspace.$disconnect();
  }

  await runWorker("sweep");
  request = await control.trialSignupRequest.findUniqueOrThrow({
    where: { id: testId },
  });
  assert.equal(request.status, "EXPIRED");
  {
    const expiredWorkspace = new PrismaClient({
      adapter: new PrismaMssql(childUrl),
    });
    try {
      assert.equal(
        (
          await expiredWorkspace.trialWorkspaceRuntime.findUniqueOrThrow({
            where: { id: testId },
          })
        ).status,
        "EXPIRED",
      );
      assert.equal(
        await expiredWorkspace.retailUserSession.count({
          where: { revokedAt: { not: null } },
        }),
        1,
      );
      assert.equal(
        await expiredWorkspace.store.count({
          where: { licenseStatus: "EXPIRED" },
        }),
        2,
      );
      assert.equal(
        await expiredWorkspace.warehouse.count({
          where: { licenseStatus: "EXPIRED" },
        }),
        2,
      );
    } finally {
      await expiredWorkspace.$disconnect();
    }
  }

  await runWorker(
    "extend",
    JSON.stringify({
      version: 1,
      requestId: testId,
      provisioningRequestKey: `flash-erp-trial:${testId}`,
      days: 7,
      actorRef: "trial-lifecycle-gate",
    }),
  );
  request = await control.trialSignupRequest.findUniqueOrThrow({
    where: { id: testId },
  });
  assert.equal(request.status, "ACTIVE");
  assert.equal(request.extensionCount, 1);
  assert.ok(
    request.trialExpiresAt && request.trialExpiresAt.getTime() > Date.now(),
  );
  {
    const extendedWorkspace = new PrismaClient({
      adapter: new PrismaMssql(childUrl),
    });
    try {
      const runtime =
        await extendedWorkspace.trialWorkspaceRuntime.findUniqueOrThrow({
          where: { id: testId },
        });
      assert.equal(runtime.status, "ACTIVE");
      assert.equal(runtime.extensionCount, 1);
      assert.equal(
        await extendedWorkspace.store.count({
          where: { licenseStatus: "TRIAL" },
        }),
        2,
      );
      assert.equal(
        await extendedWorkspace.warehouse.count({
          where: { licenseStatus: "TRIAL" },
        }),
        2,
      );
      assert.equal(
        await extendedWorkspace.retailUserSession.count({
          where: { revokedAt: { not: null } },
        }),
        1,
      );

      const owner = await extendedWorkspace.retailUser.findUniqueOrThrow({
        where: { id: runtime.ownerUserId },
      });
      const support = await extendedWorkspace.retailUser.findFirstOrThrow({
        where: {
          retailOrgId: owner.retailOrgId,
          loginId: trialSupportLoginId(request.workspaceSlug || ""),
          deletedAt: null,
        },
      });
      await extendedWorkspace.retailUserSession.createMany({
        data: [
          {
            retailOrgId: owner.retailOrgId,
            retailUserId: owner.id,
            tokenHash: crypto.createHash("sha256").update(`paid-owner:${testId}`).digest("hex"),
            expiresAt: new Date(Date.now() + 60 * 60_000),
          },
          {
            retailOrgId: owner.retailOrgId,
            retailUserId: support.id,
            tokenHash: crypto.createHash("sha256").update(`paid-support:${testId}`).digest("hex"),
            expiresAt: new Date(Date.now() + 60 * 60_000),
          },
        ],
      });
    } finally {
      await extendedWorkspace.$disconnect();
    }
  }

  const originalDatabaseName = request.workspaceDatabaseName;
  const originalWorkspaceSlug = request.workspaceSlug;
  const licensedUntil = new Date(Date.now() + 365 * 24 * 60 * 60_000);
  await control.trialSignupRequest.update({
    where: { id: testId },
    data: {
      status: "CONVERTING",
      convertedBy: "trial-lifecycle-gate",
      subscriptionPlanCode: "RETAIL-ANNUAL",
      subscriptionReference: `SUB-${suffix.toUpperCase()}`,
      subscriptionLicensedUntil: licensedUntil,
      retainSupportAccess: false,
      supportAccessExpiresAt: null,
      supportApprovalReference: null,
      lastLifecycleAt: new Date(),
    },
  });
  await control.trialLifecycleEvent.create({
    data: {
      trialSignupRequestId: testId,
      eventType: "CONVERSION_QUEUED",
      outcome: "IN_PROGRESS",
      actorType: "STAFF",
      actorRef: "trial-lifecycle-gate",
      previousStatus: "ACTIVE",
      newStatus: "CONVERTING",
      detailsJson: JSON.stringify({
        planCode: "RETAIL-ANNUAL",
        subscriptionReference: `SUB-${suffix.toUpperCase()}`,
        licensedUntil: licensedUntil.toISOString(),
        retainSupportAccess: false,
        supportAccessExpiresAt: null,
        supportApprovalReference: null,
      }),
    },
  });
  const conversionPayload = {
    version: 1,
    requestId: testId,
    provisioningRequestKey: `flash-erp-trial:${testId}`,
    planCode: "RETAIL-ANNUAL",
    subscriptionReference: `SUB-${suffix.toUpperCase()}`,
    licensedUntil: licensedUntil.toISOString(),
    retainSupportAccess: false,
    supportAccessExpiresAt: null,
    supportApprovalReference: null,
    actorRef: "trial-lifecycle-gate",
  };
  await runWorker("convert", JSON.stringify(conversionPayload));
  request = await control.trialSignupRequest.findUniqueOrThrow({
    where: { id: testId },
  });
  assert.equal(request.status, "CONVERTED");
  assert.equal(request.workspaceDatabaseName, originalDatabaseName);
  assert.equal(request.workspaceSlug, originalWorkspaceSlug);
  assert.equal(request.subscriptionPlanCode, conversionPayload.planCode);
  assert.equal(request.subscriptionReference, conversionPayload.subscriptionReference);
  assert.equal(request.subscriptionLicensedUntil?.getTime(), licensedUntil.getTime());
  assert.equal(request.retainSupportAccess, false);
  assert.equal(request.supportAccessExpiresAt, null);
  assert.equal(request.supportApprovalReference, null);
  assert.ok(request.convertedAt);
  assert.equal(request.convertedBy, conversionPayload.actorRef);

  {
    const convertedWorkspace = new PrismaClient({ adapter: new PrismaMssql(childUrl) });
    try {
      const runtime = await convertedWorkspace.trialWorkspaceRuntime.findUniqueOrThrow({
        where: { id: testId },
      });
      assert.equal(runtime.status, "CONVERTED");
      assert.equal(runtime.subscriptionPlanCode, conversionPayload.planCode);
      assert.equal(runtime.subscriptionReference, conversionPayload.subscriptionReference);
      assert.equal(runtime.subscriptionLicensedUntil?.getTime(), licensedUntil.getTime());
      assert.equal(runtime.retainSupportAccess, false);
      assert.equal(runtime.supportAccessExpiresAt, null);
      assert.equal(runtime.supportApprovalReference, null);
      assert.equal(
        await convertedWorkspace.store.count({ where: { licenseStatus: "LICENSED" } }),
        2,
      );
      assert.equal(
        await convertedWorkspace.warehouse.count({ where: { licenseStatus: "LICENSED" } }),
        2,
      );
      assert.equal(
        await convertedWorkspace.terminal.count({ where: { licenseStatus: "LICENSED" } }),
        1,
      );
      const owner = await convertedWorkspace.retailUser.findUniqueOrThrow({
        where: { id: runtime.ownerUserId },
      });
      const licensedStore = await convertedWorkspace.store.findFirstOrThrow({
        where: { retailOrgId: owner.retailOrgId, licenseStatus: "LICENSED" },
      });
      assert.match(licensedStore.licenseKey || "", /^PAID-[A-F0-9]{32}$/);
      assert.notEqual(licensedStore.licenseKey, conversionPayload.subscriptionReference);
      assert.equal(
        await convertedWorkspace.licenseEvent.count({
          where: {
            retailOrgId: owner.retailOrgId,
            action: "TRIAL_CONVERTED_TO_PAID",
            scope: "STORE",
          },
        }),
        2,
      );
      assert.equal(
        await convertedWorkspace.licenseEvent.count({
          where: {
            retailOrgId: owner.retailOrgId,
            action: "TRIAL_CONVERTED_TO_PAID",
            scope: "TERMINAL",
          },
        }),
        1,
      );
      const support = await convertedWorkspace.retailUser.findFirstOrThrow({
        where: {
          retailOrgId: owner.retailOrgId,
          loginId: trialSupportLoginId(request.workspaceSlug || ""),
        },
      });
      assert.equal(support.accountStatus, "DISABLED");
      assert.equal(
        await convertedWorkspace.retailUserRole.count({
          where: { retailUserId: support.id },
        }),
        0,
        "Disabled converted support must not retain any tenant role assignment.",
      );
      const supportGrantCount = await convertedWorkspace.rolePermission.count({
        where: {
          role: {
            retailOrgId: owner.retailOrgId,
            code: "FLASH_SUPPORT",
          },
        },
      });
      assert.equal(
        supportGrantCount,
        securityPermissionCatalog.length,
        "The Flash support role must retain the complete permission catalog even when its user assignment is disabled.",
      );
      assert.equal(
        await convertedWorkspace.retailUserSession.count({
          where: { retailUserId: support.id, revokedAt: { not: null } },
        }),
        1,
      );
      assert.equal(
        await convertedWorkspace.retailUserSession.count({
          where: {
            retailUserId: owner.id,
            tokenHash: crypto.createHash("sha256").update(`paid-owner:${testId}`).digest("hex"),
            revokedAt: null,
          },
        }),
        1,
        "Conversion must not revoke the customer's active session when disabling support access.",
      );
    } finally {
      await convertedWorkspace.$disconnect();
    }
  }

  const convertedEventCount = await control.trialLifecycleEvent.count({
    where: { trialSignupRequestId: testId, eventType: "CONVERTED", outcome: "SUCCEEDED" },
  });
  await runWorker("convert", JSON.stringify(conversionPayload));
  assert.equal(
    await control.trialLifecycleEvent.count({
      where: { trialSignupRequestId: testId, eventType: "CONVERTED", outcome: "SUCCEEDED" },
    }),
    convertedEventCount,
    "Replaying the same conversion must not duplicate the completed control-plane audit event.",
  );
  await assert.rejects(
    runWorker(
      "convert",
      JSON.stringify({ ...conversionPayload, subscriptionReference: "SUB-CONFLICT" }),
    ),
    /different subscription metadata/i,
  );
  await runWorker("sweep");
  assert.equal(
    (await control.trialSignupRequest.findUniqueOrThrow({ where: { id: testId } })).status,
    "CONVERTED",
    "The expiry sweep must not regress a converted workspace.",
  );
  await assert.rejects(
    createSampleData(childUrl, {
      retailOrgId: "converted-workspace",
      userId: "converted-workspace",
      actorLabel: "Converted workspace",
    }),
    /trial is not active/i,
  );
  const events = await control.trialLifecycleEvent.findMany({
    where: { trialSignupRequestId: testId },
    select: { eventType: true, outcome: true },
  });
  assert.ok(
    events.some(
      (event) =>
        event.eventType === "PROVISIONED" && event.outcome === "SUCCEEDED",
    ),
  );
  assert.ok(
    events.some(
      (event) => event.eventType === "CONVERTED" && event.outcome === "SUCCEEDED",
    ),
  );
  assert.ok(
    events.some(
      (event) => event.eventType === "EXPIRED" && event.outcome === "SUCCEEDED",
    ),
  );
  assert.ok(
    events.some(
      (event) =>
        event.eventType === "EXTENDED" && event.outcome === "SUCCEEDED",
    ),
  );
  assert.ok(
    events.some(
      (event) =>
        event.eventType === "STOREFRONT_RECONCILED" &&
        event.outcome === "SUCCEEDED",
    ),
  );

  console.log(
    "Disposable SQL Server trial provisioning, expiry, extension, and paid-conversion acceptance passed.",
  );
}

main()
  .finally(async () => {
    const fixture = await control.trialSignupRequest.findUnique({
      where: { id: testId },
      select: { workspaceDatabaseName: true },
    });
    childDatabaseName = fixture?.workspaceDatabaseName || childDatabaseName;
    await dropFixtureDatabase();
    await control.trialSignupRequest.deleteMany({ where: { id: testId } });
    await control.$disconnect();
    const safeRoot = path.resolve(os.tmpdir(), "flash-erp-trial-lifecycle");
    const resolvedRuntime = path.resolve(runtimeRoot);
    if (resolvedRuntime.startsWith(`${safeRoot}${path.sep}`)) {
      rmSync(resolvedRuntime, { recursive: true, force: true });
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
