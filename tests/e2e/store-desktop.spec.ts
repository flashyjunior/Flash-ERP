import { _electron as electron, expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
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
    activeShift: { expectedCashAmount: number } | null;
    recentClosedShifts: Array<{ shiftNo: string }>;
  }>;
  signInOperator: (input: { loginId: string; password: string }) => Promise<{ message: string }>;
  openShift: (input: { cashierCode: string; openingFloatAmount: number }) => Promise<{ message: string }>;
  captureScannedSale: (input: { lookupValue: string; quantity: number }) => Promise<{ message: string }>;
  closeActiveShift: (input: { declaredCashAmount: number }) => Promise<{ message: string }>;
  startSyncCycle?: (input: {
    trigger: "tray";
    snapshotMode: "status";
    drainDownstream?: boolean;
  }) => Promise<{
    accepted: boolean;
    status: "started" | "busy" | "unavailable";
    trigger: string;
    message: string;
    startedAt: string | null;
  }>;
  runSyncCycle: (input: { trigger: "tray" }) => Promise<{ message: string }>;
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
      /Store Desktop isolated sync worker process exited\./
    );
    expect(completionLog).toMatch(/Store Desktop isolated sync worker process started\./);
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
      /Store Desktop isolated sync worker process exited\./,
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
