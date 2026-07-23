import { _electron as electron, expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const desktopEntry = path.resolve(
  process.env.FLASH_ERP_E2E_DESKTOP_ENTRY ??
    "apps/store-desktop/dist-electron/electron/bootstrap.js"
);
const cashierLogin = process.env.FLASH_ERP_E2E_DESKTOP_CASHIER_LOGIN;
const cashierPassword = process.env.FLASH_ERP_E2E_DESKTOP_CASHIER_PASSWORD;
const supervisorLogin = process.env.FLASH_ERP_E2E_DESKTOP_SUPERVISOR_LOGIN;
const supervisorPassword = process.env.FLASH_ERP_E2E_DESKTOP_SUPERVISOR_PASSWORD;
const scannedLookup = process.env.FLASH_ERP_E2E_DESKTOP_LOOKUP ?? "1000000000001";

type DesktopRuntime = {
  getContext: () => {
    storeRuntimeRole: "embedded" | "store-server" | "terminal-client";
    storeDatabaseProvider: "sqlite" | "postgres" | "mssql";
    terminalCode: string | null;
    storeServerUrl: string | null;
  };
  getStoreRuntimeStatus: () => Promise<{
    role: "embedded" | "store-server" | "terminal-client";
    databaseProvider: "sqlite" | "postgres" | "mssql";
    connected: boolean;
    localServerUrl: string | null;
    message: string;
    serverHealth: { databasePath: string | null } | null;
  }>;
  getDesktopWindowStatus: () => Promise<{ supportLogPath: string }>;
  getSyncSnapshot: () => Promise<{
    activeOperatorSession: { loginId: string; displayName: string } | null;
    activeBasket: {
      transactionId: string;
      lines: Array<{ lineId: string; productCode: string }>;
    } | null;
    activeShift: { expectedCashAmount: number } | null;
    recentClosedShifts: Array<{ shiftNo: string }>;
    salesOrders: Array<{
      orderId: string;
      orderNo: string;
      sourceTransactionId: string;
      itemCount: number;
      depositAmount: number;
      balanceAmount: number;
      status: string;
    }>;
  }>;
  bootstrapStandaloneAdmin: (input: {
    loginId: string;
    displayName: string;
    password: string;
  }) => Promise<{ message: string }>;
  signInOperator: (input: { loginId: string; password: string }) => Promise<{ message: string }>;
  signOutOperator: () => Promise<{ message: string }>;
  saveStandaloneProduct: (input: {
    productCode: string;
    productName: string;
    unitPrice: number;
    quantityOnHand: number;
    trackInventory: boolean;
  }) => Promise<{ message: string }>;
  saveStandaloneTenderMethod: (input: {
    tenderMethodCode: string;
    tenderMethodName: string;
    paymentMethod: "CASH";
    allowChange: boolean;
  }) => Promise<{ message: string }>;
  saveStandaloneCustomer: (input: {
    customerNo: string;
    fullName: string;
    customerType: string;
  }) => Promise<{ message: string }>;
  browseCatalogItems: (input: {
    query: string;
    sellableOnly: boolean;
  }) => Promise<Array<{ productCode: string; quantityOnHand: number }>>;
  openShift: (input: { cashierCode: string; openingFloatAmount: number }) => Promise<{ message: string }>;
  addItemToBasket: (input: {
    lookupValue: string;
    quantity: number;
    deferInventoryValidationForSalesOrder?: boolean;
  }) => Promise<{ message: string }>;
  updateBasketLine: (input: {
    lineId: string;
    quantity: number;
    deferInventoryValidationForSalesOrder?: boolean;
  }) => Promise<{ message: string }>;
  attachCustomerToActiveBasket: (input: { customerId: string }) => Promise<{ message: string }>;
  createSalesOrderFromActiveBasket: (input: {
    operatorName: string;
    depositAmount: number;
    depositTenderMethodCode: string;
    depositReference: string;
  }) => Promise<{ message: string; salesOrderNo?: string | null }>;
  resumeSalesOrder: (orderId: string) => Promise<{ message: string }>;
  discardActiveBasket: () => Promise<{ message: string }>;
  checkoutActiveBasket: (input: {
    payments: Array<{
      method: "CASH";
      tenderMethodCode: string;
      tenderMethodName: string;
      amount: number;
      reference: null;
    }>;
  }) => Promise<{ message: string }>;
  captureScannedSale: (input: { lookupValue: string; quantity: number }) => Promise<{ message: string }>;
  closeActiveShift: (input: { declaredCashAmount: number }) => Promise<{ message: string }>;
  startSyncCycle?: (input: {
    trigger: "manual" | "scheduled" | "tray";
    snapshotMode: "full" | "status";
    drainDownstream?: boolean;
  }) => Promise<{
    accepted: boolean;
    status: "started" | "busy" | "unavailable";
    trigger: string;
    message: string;
    startedAt: string | null;
  }>;
  onSyncCycleStatus?: (listener: (status: {
    traceId: string;
    trigger: "manual" | "scheduled" | "tray" | "startup";
    status: "completed" | "failed";
    message: string;
  }) => void) => () => void;
  runSyncCycle: (input: {
    trigger: "manual" | "scheduled" | "tray";
    snapshotMode?: "full" | "status";
  }) => Promise<{ message: string }>;
};

declare global {
  interface Window {
    desktopRuntime?: DesktopRuntime;
  }
}

function createElectronLaunchEnv(overrides: NodeJS.ProcessEnv) {
  const env = {
    ...process.env,
    ...overrides
  };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function findFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function startEmptySyncServer(port: number) {
  const syncPolicy = {
    autoSyncEnabled: true,
    intervalMinutes: 15,
    activeFromMinutes: 0,
    activeToMinutes: 24 * 60,
    jitterSeconds: 0,
    backoffBaseSeconds: 30,
    backoffMaxSeconds: 300,
    nextScheduledSyncAt: null,
    lastManualSyncAt: null,
    lastAutoSyncAt: null
  };
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      let payload: Record<string, unknown> = {};

      try {
        payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
      } catch {
        response.writeHead(400).end();
        return;
      }

      const now = new Date().toISOString();
      let result: Record<string, unknown>;

      if (request.url?.endsWith("/pull")) {
        result = {
          batch: {
            direction: "downstream",
            sourceNodeCode: "enterprise-hq",
            targetNodeCode: String(payload.sourceNodeCode ?? "store-node"),
            cursor: payload.cursor ?? null,
            sentAt: now,
            events: []
          },
          serverCheckpoint: null,
          serverReceivedAt: now,
          serverProcessedAt: now,
          syncPolicy
        };
      } else if (request.url?.endsWith("/push")) {
        result = {
          acceptedEventIds: [],
          duplicateEventIds: [],
          rejected: [],
          acknowledgedDownstreamEventIds: Array.isArray(payload.acknowledgedDownstreamEventIds)
            ? payload.acknowledgedDownstreamEventIds
            : [],
          serverReceivedAt: now,
          serverProcessedAt: now,
          syncPolicy
        };
      } else {
        response.writeHead(404).end();
        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(result));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  return server;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitForSupportLog(logPath: string, pattern: RegExp, timeoutMs = 30_000) {
  const startedAt = Date.now();
  let content = "";

  while (Date.now() - startedAt < timeoutMs) {
    if (existsSync(logPath)) {
      content = readFileSync(logPath, "utf8");

      if (pattern.test(content)) {
        return content;
      }
    }

    await wait(250);
  }

  throw new Error(
    `Timed out waiting for ${pattern} in ${logPath}. Last log tail:\n${content
      .split(/\r?\n/)
      .slice(-40)
      .join("\n")}`
  );
}

async function waitForSupportLogCount(
  logPath: string,
  pattern: RegExp,
  minimumCount: number,
  timeoutMs = 30_000
) {
  const startedAt = Date.now();
  let content = "";

  while (Date.now() - startedAt < timeoutMs) {
    if (existsSync(logPath)) {
      content = readFileSync(logPath, "utf8");
      const matches = content.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`));

      if ((matches?.length ?? 0) >= minimumCount) {
        return content;
      }
    }

    await wait(250);
  }

  throw new Error(
    `Timed out waiting for ${minimumCount} occurrence(s) of ${pattern} in ${logPath}. Last log tail:\n${content
      .split(/\r?\n/)
      .slice(-40)
      .join("\n")}`
  );
}

function readLatestStoreServerPid(logPath: string) {
  const content = readFileSync(logPath, "utf8");
  const matches = [
    ...content.matchAll(/local store server process started[\s\S]*?"pid":\s*(\d+)/g)
  ];
  const last = matches[matches.length - 1];

  return last ? Number(last[1]) : null;
}

test("desktop renderer starts detached sync through the local store-server process", async () => {
  test.skip(
    !existsSync(desktopEntry),
    "Run npm --workspace @flash-erp/store-desktop run build before Electron E2E certification."
  );

  const proofRoot = path.resolve(".e2e", "store-desktop-ipc-proof", String(Date.now()));
  const electronUserDataPath = path.join(proofRoot, "electron-profile");
  const storeDataPath = path.join(proofRoot, "store-data");
  const databasePath = path.join(storeDataPath, "store-ipc-proof.sqlite");
  const port = await findFreePort();
  mkdirSync(electronUserDataPath, { recursive: true });
  mkdirSync(storeDataPath, { recursive: true });

  const app = await electron.launch({
    args: [desktopEntry, `--user-data-dir=${electronUserDataPath}`],
    env: createElectronLaunchEnv({
      FLASH_ERP_DESKTOP_USE_DIST: "1",
      FLASH_ERP_STORE_DEPLOYMENT_MODE: "STANDALONE",
      FLASH_ERP_STORE_RUNTIME_ROLE: "embedded",
      FLASH_ERP_STORE_DATABASE_PROVIDER: "sqlite",
      FLASH_ERP_STORE_DATABASE_URL: "",
      FLASH_ERP_STORE_DB_PATH: databasePath,
      FLASH_ERP_STORE_USER_DATA_PATH: storeDataPath,
      FLASH_ERP_STORE_TERMINAL_CODE: "ipc-proof-01",
      FLASH_ERP_STORE_TERMINAL_NAME: "IPC Proof Terminal",
      FLASH_ERP_STORE_SERVER_ENABLED: "1",
      FLASH_ERP_STORE_SERVER_HOST: "127.0.0.1",
      FLASH_ERP_STORE_SERVER_PORT: String(port),
      FLASH_ERP_STORE_SERVER_TIMEOUT_MS: "2500",
      FLASH_ERP_STORE_SERVER_URL: "",
      FLASH_ERP_STORE_SYNC_BASE_URL: ""
    })
  });
  const child = app.process();

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
    await page.waitForFunction(
      () => Boolean(window.desktopRuntime?.startSyncCycle),
      undefined,
      { timeout: 30_000 }
    );

    const startProof = await page.evaluate(async () => {
      const runtime = window.desktopRuntime;

      if (!runtime?.startSyncCycle) {
        throw new Error("Desktop runtime did not expose startSyncCycle.");
      }

      const context = runtime.getContext();
      const statusBefore = await runtime.getStoreRuntimeStatus();
      const startedAt = performance.now();
      const ack = await runtime.startSyncCycle({
        trigger: "tray",
        snapshotMode: "status",
        drainDownstream: false
      });

      return {
        context,
        statusBefore: {
          role: statusBefore.role,
          databaseProvider: statusBefore.databaseProvider,
          connected: statusBefore.connected,
          localServerUrl: statusBefore.localServerUrl,
          message: statusBefore.message,
          databasePath: statusBefore.serverHealth?.databasePath ?? null
        },
        ack,
        ackElapsedMs: Math.round(performance.now() - startedAt)
      };
    });

    expect(startProof.context.storeRuntimeRole).toBe("embedded");
    expect(startProof.statusBefore.connected).toBe(true);
    expect(startProof.statusBefore.localServerUrl).toBe(`http://127.0.0.1:${port}`);
    expect(path.normalize(startProof.statusBefore.databasePath ?? "")).toBe(path.normalize(databasePath));
    expect(startProof.ack.accepted).toBe(true);
    expect(startProof.ack.status).toBe("started");
    expect(startProof.ackElapsedMs).toBeLessThan(8_000);

    const windowStatus = await page.evaluate(async () =>
      window.desktopRuntime?.getDesktopWindowStatus()
    );
    const supportLogPath = windowStatus?.supportLogPath;

    expect(supportLogPath).toBeTruthy();
    const completionLog = await waitForSupportLog(
      supportLogPath ?? "",
      /Store Desktop isolated sync worker process settled\./
    );
    expect(completionLog).toMatch(/Store Desktop isolated sync worker launch requested\./);
    expect(completionLog).not.toMatch(/sync-cycle-page-\d+-completed/);

    const statusAfter = await page.evaluate(async () =>
      window.desktopRuntime?.getStoreRuntimeStatus()
    );
    expect(statusAfter?.connected).toBe(true);
    expect(statusAfter?.localServerUrl).toBe(`http://127.0.0.1:${port}`);

    const storeServerPid = readLatestStoreServerPid(supportLogPath ?? "");
    if (!storeServerPid) {
      throw new Error("Could not find the local store-server process id in the support log.");
    }

    process.kill(storeServerPid, "SIGTERM");
    await waitForSupportLog(
      supportLogPath ?? "",
      /local store server process exited/
    );

    const recoveryStart = await page.evaluate(async () => {
      const runtime = window.desktopRuntime;

      if (!runtime?.startSyncCycle) {
        throw new Error("Desktop runtime did not expose startSyncCycle.");
      }

      return runtime.startSyncCycle({
        trigger: "tray",
        snapshotMode: "status",
        drainDownstream: false
      });
    });

    expect(recoveryStart.accepted).toBe(true);
    await waitForSupportLogCount(
      supportLogPath ?? "",
      /Store Desktop isolated sync worker process settled\./,
      2
    );
    await page.evaluate(async () => window.desktopRuntime?.getSyncSnapshot());
    await waitForSupportLog(
      supportLogPath ?? "",
      /Store Desktop local store server request retrying after recovery\./
    );

    const statusAfterRecovery = await page.evaluate(async () =>
      window.desktopRuntime?.getStoreRuntimeStatus()
    );
    expect(statusAfterRecovery?.connected).toBe(true);
    expect(statusAfterRecovery?.localServerUrl).toBe(`http://127.0.0.1:${port}`);
  } finally {
    await app.close().catch(() => undefined);

    if (child.exitCode === null && !child.killed) {
      child.kill("SIGTERM");
    }
  }
});

test("manual and scheduled sync preserve the signed-in desktop operator", async () => {
  test.skip(
    !existsSync(desktopEntry),
    "Run npm --workspace @flash-erp/store-desktop run build before Electron E2E certification."
  );

  const proofRoot = path.resolve(".e2e", "store-desktop-sync-session", String(Date.now()));
  const setupUserDataPath = path.join(proofRoot, "setup-electron-profile");
  const electronUserDataPath = path.join(proofRoot, "hq-electron-profile");
  const storeDataPath = path.join(proofRoot, "store-data");
  const databasePath = path.join(storeDataPath, "store-sync-session.sqlite");
  const setupPort = await findFreePort();
  const storePort = await findFreePort();
  const syncPort = await findFreePort();
  const loginId = "sync.admin";
  const displayName = "Sync Session Admin";
  const password = "SyncSession123!";
  mkdirSync(setupUserDataPath, { recursive: true });
  mkdirSync(electronUserDataPath, { recursive: true });
  mkdirSync(storeDataPath, { recursive: true });

  const baseStoreEnv = {
    FLASH_ERP_DESKTOP_USE_DIST: "1",
    FLASH_ERP_STORE_RUNTIME_ROLE: "embedded",
    FLASH_ERP_STORE_DATABASE_PROVIDER: "sqlite",
    FLASH_ERP_STORE_DATABASE_URL: "",
    FLASH_ERP_STORE_DB_PATH: databasePath,
    FLASH_ERP_STORE_USER_DATA_PATH: storeDataPath,
    FLASH_ERP_STORE_TERMINAL_CODE: "sync-session-01",
    FLASH_ERP_STORE_TERMINAL_NAME: "Sync Session Terminal",
    FLASH_ERP_STORE_SERVER_ENABLED: "1",
    FLASH_ERP_STORE_SERVER_HOST: "127.0.0.1",
    FLASH_ERP_STORE_SERVER_TIMEOUT_MS: "2500",
    FLASH_ERP_STORE_SERVER_URL: ""
  };
  const setupApp = await electron.launch({
    args: [desktopEntry, `--user-data-dir=${setupUserDataPath}`],
    env: createElectronLaunchEnv({
      ...baseStoreEnv,
      FLASH_ERP_STORE_DEPLOYMENT_MODE: "STANDALONE",
      FLASH_ERP_STORE_SERVER_PORT: String(setupPort),
      FLASH_ERP_STORE_SYNC_BASE_URL: ""
    })
  });

  try {
    const setupPage = await setupApp.firstWindow();
    await setupPage.waitForLoadState("domcontentloaded", { timeout: 30_000 });
    await setupPage.waitForFunction(
      () => Boolean(window.desktopRuntime?.bootstrapStandaloneAdmin),
      undefined,
      { timeout: 30_000 }
    );
    await setupPage.evaluate(
      async ({ nextLoginId, nextDisplayName, nextPassword }) => {
        const runtime = window.desktopRuntime;
        if (!runtime) throw new Error("Desktop runtime was unavailable during setup.");
        await runtime.bootstrapStandaloneAdmin({
          loginId: nextLoginId,
          displayName: nextDisplayName,
          password: nextPassword
        });
      },
      { nextLoginId: loginId, nextDisplayName: displayName, nextPassword: password }
    );
  } finally {
    await setupApp.close().catch(() => undefined);
  }

  const syncServer = await startEmptySyncServer(syncPort);
  const app = await electron.launch({
    args: [desktopEntry, `--user-data-dir=${electronUserDataPath}`],
    env: createElectronLaunchEnv({
      ...baseStoreEnv,
      FLASH_ERP_STORE_DEPLOYMENT_MODE: "HQ_MANAGED",
      FLASH_ERP_STORE_SERVER_PORT: String(storePort),
      FLASH_ERP_STORE_SYNC_BASE_URL: `http://127.0.0.1:${syncPort}`
    })
  });

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
    await page.getByPlaceholder("Enter your username").fill(loginId);
    await page.getByPlaceholder("Enter your password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".rms-desktop")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".rms-sidebar-status strong")).toHaveText(displayName);

    const navigation = page.getByRole("navigation", { name: "Desktop workspaces" });
    await navigation.getByRole("button", { name: "Sync", exact: true }).click();
    await page.getByRole("tab", { name: "Queues", exact: true }).click();
    await page.getByRole("button", { name: "Run sync", exact: true }).click();
    await expect(page.locator(".rms-sync-toast").last()).toContainText(
      "reached enterprise successfully",
      { timeout: 30_000 }
    );
    await expect(page.locator(".rms-sidebar-status strong")).toHaveText(displayName);

    const scheduledStatus = await page.evaluate(async () => {
      const runtime = window.desktopRuntime;
      if (!runtime?.startSyncCycle || !runtime.onSyncCycleStatus) {
        throw new Error("Detached sync status APIs were unavailable.");
      }

      return new Promise<{ status: string; trigger: string }>(async (resolve, reject) => {
        let unsubscribe: (() => void) | undefined;
        const timeout = window.setTimeout(() => {
          unsubscribe?.();
          reject(new Error("Scheduled sync did not report completion."));
        }, 30_000);
        unsubscribe = runtime.onSyncCycleStatus?.((status) => {
          if (status.trigger !== "scheduled") return;
          window.clearTimeout(timeout);
          unsubscribe?.();
          resolve({ status: status.status, trigger: status.trigger });
        });
        const result = await runtime.startSyncCycle?.({
          trigger: "scheduled",
          snapshotMode: "status",
          drainDownstream: false
        });
        if (!result?.accepted) {
          window.clearTimeout(timeout);
          unsubscribe?.();
          reject(new Error(result?.message ?? "Scheduled sync was not accepted."));
        }
      });
    });

    expect(scheduledStatus).toEqual({ status: "completed", trigger: "scheduled" });
    await expect(page.locator(".rms-desktop")).toBeVisible();
    await expect(page.locator(".rms-sidebar-status strong")).toHaveText(displayName);
    await expect(page.getByText("Welcome Back", { exact: true })).toHaveCount(0);
    const snapshot = await page.evaluate(async () => window.desktopRuntime?.getSyncSnapshot());
    expect(snapshot?.activeOperatorSession?.loginId).toBe(loginId.toUpperCase());
  } finally {
    await app.close().catch(() => undefined);
    await new Promise<void>((resolve) => syncServer.close(() => resolve()));
  }
});

test("zero-stock sales orders retain their lines and remain locked until fulfilment", async () => {
  test.skip(
    !existsSync(desktopEntry),
    "Run npm --workspace @flash-erp/store-desktop run build before Electron E2E certification."
  );

  const proofRoot = path.resolve(".e2e", "store-desktop-zero-stock-order", String(Date.now()));
  const electronUserDataPath = path.join(proofRoot, "electron-profile");
  const storeDataPath = path.join(proofRoot, "store-data");
  const databasePath = path.join(storeDataPath, "zero-stock-order.sqlite");
  const storePort = await findFreePort();
  const loginId = "order.admin";
  const displayName = "Order Mode Admin";
  const password = "OrderMode123!";
  const productCode = "ORDER-ZERO-001";
  const customerId = "standalone-customer-order-customer";
  mkdirSync(electronUserDataPath, { recursive: true });
  mkdirSync(storeDataPath, { recursive: true });

  const app = await electron.launch({
    args: [desktopEntry, `--user-data-dir=${electronUserDataPath}`],
    env: createElectronLaunchEnv({
      FLASH_ERP_DESKTOP_USE_DIST: "1",
      FLASH_ERP_STORE_DEPLOYMENT_MODE: "STANDALONE",
      FLASH_ERP_STORE_RUNTIME_ROLE: "embedded",
      FLASH_ERP_STORE_DATABASE_PROVIDER: "sqlite",
      FLASH_ERP_STORE_DATABASE_URL: "",
      FLASH_ERP_STORE_DB_PATH: databasePath,
      FLASH_ERP_STORE_USER_DATA_PATH: storeDataPath,
      FLASH_ERP_STORE_TERMINAL_CODE: "order-mode-01",
      FLASH_ERP_STORE_TERMINAL_NAME: "Order Mode Terminal",
      FLASH_ERP_STORE_SERVER_ENABLED: "1",
      FLASH_ERP_STORE_SERVER_HOST: "127.0.0.1",
      FLASH_ERP_STORE_SERVER_PORT: String(storePort),
      FLASH_ERP_STORE_SERVER_TIMEOUT_MS: "2500",
      FLASH_ERP_STORE_SERVER_URL: "",
      FLASH_ERP_STORE_SYNC_BASE_URL: ""
    })
  });

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
    await page.waitForFunction(
      () => Boolean(window.desktopRuntime?.bootstrapStandaloneAdmin),
      undefined,
      { timeout: 30_000 }
    );

    await page.evaluate(
      async ({ nextLoginId, nextDisplayName, nextPassword }) => {
        const runtime = window.desktopRuntime;
        if (!runtime) throw new Error("Desktop runtime was unavailable during order setup.");
        await runtime.bootstrapStandaloneAdmin({
          loginId: nextLoginId,
          displayName: nextDisplayName,
          password: nextPassword
        });
        await runtime.signInOperator({ loginId: nextLoginId, password: nextPassword });
        await runtime.saveStandaloneTenderMethod({
          tenderMethodCode: "CASH",
          tenderMethodName: "Cash",
          paymentMethod: "CASH",
          allowChange: true
        });
        await runtime.saveStandaloneCustomer({
          customerNo: "ORDER-CUSTOMER",
          fullName: "Order Customer",
          customerType: "OTHER"
        });
        await runtime.saveStandaloneProduct({
          productCode: "ORDER-ZERO-001",
          productName: "Zero Stock Order Product",
          unitPrice: 25,
          quantityOnHand: 0,
          trackInventory: true
        });
        await runtime.openShift({ cashierCode: nextLoginId, openingFloatAmount: 0 });
      },
      { nextLoginId: loginId, nextDisplayName: displayName, nextPassword: password }
    );

    const catalogProof = await page.evaluate(async (code) => {
      const runtime = window.desktopRuntime;
      if (!runtime) throw new Error("Desktop runtime was unavailable during catalog verification.");
      return {
        orderCatalog: await runtime.browseCatalogItems({ query: code, sellableOnly: false }),
        saleCatalog: await runtime.browseCatalogItems({ query: code, sellableOnly: true })
      };
    }, productCode);
    expect(catalogProof.orderCatalog.map((product) => product.productCode)).toContain(productCode);
    expect(catalogProof.saleCatalog.map((product) => product.productCode)).not.toContain(productCode);

    const normalSaleError = await page.evaluate(async (code) => {
      try {
        await window.desktopRuntime?.addItemToBasket({ lookupValue: code, quantity: 1 });
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }, productCode);
    expect(normalSaleError).toMatch(/Only 0(?:\.000)? unit\(s\)/);

    const createdOrder = await page.evaluate(
      async ({ code, nextCustomerId }) => {
        const runtime = window.desktopRuntime;
        if (!runtime) throw new Error("Desktop runtime was unavailable during order creation.");
        await runtime.addItemToBasket({
          lookupValue: code,
          quantity: 1,
          deferInventoryValidationForSalesOrder: true
        });
        const orderBasket = (await runtime.getSyncSnapshot()).activeBasket;
        const orderLine = orderBasket?.lines.find((line) => line.productCode === code);

        if (!orderLine) {
          throw new Error("The zero-stock sales-order line was not available for editing.");
        }

        await runtime.updateBasketLine({
          lineId: orderLine.lineId,
          quantity: orderLine.quantity,
          deferInventoryValidationForSalesOrder: true,
          serialNumbers: orderLine.serialNumbers,
          overrideDiscountAmount: 0,
          configuredDiscountRate: null
        });
        await runtime.attachCustomerToActiveBasket({ customerId: nextCustomerId });
        await runtime.createSalesOrderFromActiveBasket({
          operatorName: "Order Mode Admin",
          depositAmount: 5,
          depositTenderMethodCode: "CASH",
          depositReference: "DEP-001"
        });
        return runtime.getSyncSnapshot();
      },
      { code: productCode, nextCustomerId: customerId }
    );
    const order = createdOrder.salesOrders.find((candidate) => candidate.status === "OPEN");
    expect(order).toMatchObject({ itemCount: 1, depositAmount: 5, balanceAmount: 20 });
    expect(createdOrder.activeBasket).toBeNull();
    if (!order) throw new Error("The sales order was not created.");

    await app.evaluate(
      async (_electron, { nextDatabasePath, nextProductCode }) => {
        const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
        const database = new DatabaseSync(nextDatabasePath);
        database
          .prepare(
            "UPDATE product_snapshot SET catalog_membership_active = 0 WHERE product_code = ?"
          )
          .run(nextProductCode);
        database.close();
      },
      { nextDatabasePath: databasePath, nextProductCode: productCode }
    );

    const fulfilmentProof = await page.evaluate(async ({ orderId, nextLoginId, nextPassword }) => {
      const runtime = window.desktopRuntime;
      if (!runtime) throw new Error("Desktop runtime was unavailable during fulfilment verification.");
      await runtime.resumeSalesOrder(orderId);
      const resumed = await runtime.getSyncSnapshot();
      const line = resumed.activeBasket?.lines[0];
      let editError: string | null = null;
      try {
        if (line) await runtime.updateBasketLine({ lineId: line.lineId, quantity: 2 });
      } catch (error) {
        editError = error instanceof Error ? error.message : String(error);
      }
      await runtime.discardActiveBasket();
      const afterExit = await runtime.getSyncSnapshot();
      await runtime.resumeSalesOrder(orderId);
      await runtime.signOutOperator();
      await runtime.signInOperator({ loginId: nextLoginId, password: nextPassword });
      const afterRelogin = await runtime.getSyncSnapshot();
      return { resumed, editError, afterExit, afterRelogin };
    }, { orderId: order.orderId, nextLoginId: loginId, nextPassword: password });
    expect(fulfilmentProof.resumed.activeBasket?.lines.map((line) => line.productCode)).toEqual([
      productCode
    ]);
    expect(fulfilmentProof.editError).toMatch(/locked for fulfilment/i);
    expect(fulfilmentProof.afterExit.activeBasket).toBeNull();
    expect(fulfilmentProof.afterExit.salesOrders.find((candidate) => candidate.orderId === order.orderId))
      .toMatchObject({ itemCount: 1, depositAmount: 5, balanceAmount: 20, status: "OPEN" });
    expect(fulfilmentProof.afterRelogin.activeOperatorSession?.loginId).toBe(loginId.toUpperCase());
    expect(fulfilmentProof.afterRelogin.activeBasket?.lines.map((line) => line.productCode)).toEqual([
      productCode
    ]);

    const checkoutError = await page.evaluate(async () => {
      try {
        await window.desktopRuntime?.checkoutActiveBasket({
          payments: [{
            method: "CASH",
            tenderMethodCode: "CASH",
            tenderMethodName: "Cash",
            amount: 20,
            reference: null
          }]
        });
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    });
    expect(checkoutError).toMatch(
      /requires 1\.000 available unit\(s\).*only 0\.000 unit\(s\) are available/i
    );
  } finally {
    await app.close().catch(() => undefined);
  }
});

test("desktop sign-in -> open shift -> sale -> close shift -> sync", async () => {
  test.skip(
    !existsSync(desktopEntry) ||
      !cashierLogin ||
      !cashierPassword ||
      !supervisorLogin ||
      !supervisorPassword,
    "Run npm --workspace @flash-erp/store-desktop run build, then set FLASH_ERP_E2E_DESKTOP_* cashier and supervisor credentials to run Electron E2E certification."
  );

  const userDataPath = path.resolve(
    process.env.FLASH_ERP_E2E_STORE_USER_DATA_PATH ?? ".e2e/store-desktop"
  );
  const electronUserDataPath = path.join(userDataPath, "electron-profile");
  const databasePath = path.join(userDataPath, "store-e2e.sqlite");
  mkdirSync(userDataPath, { recursive: true });
  mkdirSync(electronUserDataPath, { recursive: true });

  const app = await electron.launch({
    args: [desktopEntry, `--user-data-dir=${electronUserDataPath}`],
    env: createElectronLaunchEnv({
      FLASH_ERP_DESKTOP_USE_DIST: "1",
      FLASH_ERP_STORE_USER_DATA_PATH: userDataPath,
      FLASH_ERP_STORE_DB_PATH: databasePath,
      FLASH_ERP_STORE_TERMINAL_CODE: process.env.FLASH_ERP_E2E_STORE_TERMINAL_CODE ?? "e2e-01"
    })
  });

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(() => Boolean(window.desktopRuntime));

    await page.evaluate(
      async ({ loginId, password }) => {
        await window.desktopRuntime?.signInOperator({ loginId, password });
      },
      { loginId: cashierLogin ?? "", password: cashierPassword ?? "" }
    );

    await page.evaluate(
      async ({ loginId }) => {
        const snapshot = await window.desktopRuntime?.getSyncSnapshot();

        if (!snapshot?.activeShift) {
          await window.desktopRuntime?.openShift({ cashierCode: loginId, openingFloatAmount: 100 });
        }
      },
      { loginId: cashierLogin ?? "" }
    );

    const saleMessage = await page.evaluate(async ({ lookupValue }) => {
      const result = await window.desktopRuntime?.captureScannedSale({ lookupValue, quantity: 1 });
      return result?.message ?? "";
    }, { lookupValue: scannedLookup });

    expect(saleMessage).toMatch(/captured|queued/i);

    await page.evaluate(
      async ({ loginId, password }) => {
        await window.desktopRuntime?.signInOperator({ loginId, password });
      },
      { loginId: supervisorLogin ?? "", password: supervisorPassword ?? "" }
    );

    const closeMessage = await page.evaluate(async () => {
      const snapshot = await window.desktopRuntime?.getSyncSnapshot();
      const declaredCashAmount = snapshot?.activeShift?.expectedCashAmount ?? 0;
      const result = await window.desktopRuntime?.closeActiveShift({ declaredCashAmount });
      return result?.message ?? "";
    });

    expect(closeMessage).toMatch(/closed|Z report|shift/i);

    const syncMessage = await page.evaluate(async () => {
      const result = await window.desktopRuntime?.runSyncCycle({ trigger: "tray" });
      return result?.message ?? "";
    });

    expect(syncMessage).toMatch(/sync|enterprise|worker|idle/i);
  } finally {
    await app.close();
  }
});
