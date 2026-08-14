import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray, type MessageBoxOptions } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import sql from "mssql";
import electronUpdater from "electron-updater";
import type { ProgressInfo, UpdateInfo } from "electron-updater";

import {
  getDesktopSupportLogPath,
  installDesktopSupportLogging,
  writeDesktopSupportLog
} from "./support-log.js";
import { LocalStoreService } from "../src/main/offline/local-store-service.js";
import { MssqlStoreService } from "../src/main/mssql/mssql-store-service.js";
import {
  normalizeStoreMssqlConnectionString,
  parseStoreMssqlConnectionString
} from "../src/main/mssql/store-mssql-adapter.js";
import { localStoreSchemaSql } from "../src/main/offline/local-store-schema.js";
import { PostgresStoreService } from "../src/main/postgres/postgres-store-service.js";
import {
  createDirectStoreServiceClient,
  createHttpStoreServiceClient,
  startStoreServiceServer,
  type StoreServiceClient,
  type StoreServiceRuntime,
  type StoreServiceServerHandle
} from "../src/main/store-service-bridge.js";
import { resolveStoreRuntimeConfig, type StoreRuntimeConfig } from "../src/main/store-runtime-config.js";
import type { StoreServiceMethod } from "../src/main/store-service-contract.js";
import { probeStoreDataEngineDescriptor } from "../src/main/store-data-engine.js";
import {
  buildAccountPaymentReceiptPrintWindowHtml,
  buildReceiptPrintWindowHtml
} from "../src/shared/receipt-printing.js";
import type {
  StoreBasketCheckoutRequest,
  StoreBasketCustomerAttachmentInput,
  StoreBasketItemRequest,
  StoreBasketLoyaltyRedemptionInput,
  StoreCashDrawerKickRequest,
  StoreCancelSalesOrderRequest,
  StoreAccountPaymentReceiptPrintRequest,
  StoreCustomerAccountPaymentRequest,
  StoreCatalogBrowseRequest,
  StoreCreateSalesOrderRequest,
  StoreCustomerSearchRequest,
  StoreBasketLineUpdateRequest,
  StoreInterStoreTransferBrowseRequest,
  StoreInterStoreTransferRequestDraftInput,
  StoreInterStoreTransferIssueRequest,
  StoreInterStoreTransferReceiveRequest,
  StoreInventoryBrowseRequest,
  StorePurchaseOrderBrowseRequest,
  StorePurchaseOrderReceiptRequest,
  StoreRecordBankingDepositRequest,
  StoreRecordEodReconciliationRequest,
  StoreReportBrowseRequest,
  StoreShiftCloseInput,
  StoreShiftOpenInput,
  StoreShiftReportPrintRequest,
  StoreShiftSummary,
  StoreServerHealth,
  StoreSyncActionResult,
  StoreSyncCycleStartResult,
  StoreSyncCycleStatusEvent,
  StoreSyncDiagnosticsExportInput,
  StoreSyncRunOptions,
  StoreSyncSnapshot,
  StoreRuntimeStatus,
  StoreReceiptSearchRequest,
  StoreReceiptPrinterDevice,
  StoreReceiptPrinterSettingsInput,
  StoreLocalReceiptLogoInput,
  StoreReceiptPrintRequest,
  StoreSalesOrderReceiptPrintRequest,
  StoreReceiptLineReturnRequest,
  StoreSerialRegistryBrowseRequest,
  StoreOperatorSignInInput,
  StoreDesktopConnectionConfig,
  StoreDesktopConnectionConfigResult,
  StoreDesktopUpdateStatus,
  StoreDesktopWindowStatus,
  StoreSupplierReturnCancellationAcknowledgementRequest,
  StoreSupplierReturnRequest,
  StoreStockCountSessionDraftInput,
  StoreSupervisorOverrideInput,
  StoreSellCaptureRequest
} from "../src/shared/desktop-runtime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDesktopAppVersion() {
  if (app.isPackaged) {
    return app.getVersion();
  }

  try {
    const packageJson = JSON.parse(
      readFileSync(path.resolve(__dirname, "..", "..", "package.json"), "utf8")
    ) as { version?: unknown };

    if (typeof packageJson.version === "string" && packageJson.version.trim()) {
      return packageJson.version.trim();
    }
  } catch {
    // Fall back to Electron's application metadata when the workspace manifest is unavailable.
  }

  return app.getVersion();
}

const desktopAppVersion = resolveDesktopAppVersion();
const { autoUpdater } = electronUpdater;
const { Pool } = pg;
installDesktopSupportLogging();
let localStoreService: LocalStoreService | null = null;
let storeServiceRuntime: (StoreServiceRuntime & {
  getSyncSnapshot: () => StoreSyncSnapshot | Promise<StoreSyncSnapshot>;
}) | null = null;
let storeClient: StoreServiceClient | null = null;
let storeServerHandle: StoreServiceServerHandle | null = null;
let storeServerProcess: ChildProcess | null = null;
let storeServerProcessUrl: string | null = null;
let storeServerProcessRestartInFlight: Promise<void> | null = null;
let storeRuntimeConfig: StoreRuntimeConfig | null = null;
let mainWindow: BrowserWindow | null = null;
let desktopTray: Tray | null = null;
let startupErrorMessage: string | null = null;
let desktopUpdaterConfigured = false;
let desktopUpdateCheckTimer: NodeJS.Timeout | null = null;
let lastDesktopUpdateCheckWasManual = false;
let isQuittingFromTray = false;
let hasShownTrayCloseNotification = false;
let rendererReadyAt: Date | null = null;
let lastRendererHeartbeatAt: Date | null = null;
let lastRendererWatchdogCheckAt: Date | null = null;
let lastRendererReadyTimeoutAt: Date | null = null;
let lastDesktopWindowRecoveryAt: Date | null = null;
let lastDesktopWindowRecoveryReason: string | null = null;
let desktopWindowRecoveryCount = 0;
let desktopWindowLoadFailureCount = 0;
let rendererReadyTimeoutCount = 0;
let staleRendererHeartbeatCount = 0;
let rendererHeartbeatCount = 0;
let lastDesktopWindowLoadFailure: string | null = null;
let desktopWindowRecoveryInFlight = false;
let rendererReadyTimer: NodeJS.Timeout | null = null;
let rendererWatchdogTimer: NodeJS.Timeout | null = null;
let unresponsiveRecoveryTimer: NodeJS.Timeout | null = null;
let windowStateSaveTimer: NodeJS.Timeout | null = null;
let detachedSyncCycleInFlight: Promise<void> | null = null;
let desktopStartupCompleted = false;
let pendingSecondInstanceFocus = false;
const runtimeStartedAt = new Date();
const shouldUseBuiltRenderer =
  app.isPackaged || process.env.FLASH_ERP_DESKTOP_USE_DIST === "1";
const desktopConnectionConfigEnvKeys = [
  "FLASH_ERP_STORE_DEPLOYMENT_MODE",
  "FLASH_ERP_STORE_RUNTIME_ROLE",
  "FLASH_ERP_STORE_DATABASE_PROVIDER",
  "FLASH_ERP_STORE_DATABASE_URL",
  "FLASH_ERP_STORE_DB_PATH",
  "FLASH_ERP_STORE_USER_DATA_PATH",
  "FLASH_ERP_STORE_NODE_CODE",
  "FLASH_ERP_STORE_TERMINAL_CODE",
  "FLASH_ERP_STORE_TERMINAL_NAME",
  "FLASH_ERP_STORE_SERVER_URL",
  "FLASH_ERP_STORE_SERVER_TOKEN",
  "FLASH_ERP_STORE_SERVER_ENABLED",
  "FLASH_ERP_STORE_SERVER_HOST",
  "FLASH_ERP_STORE_SERVER_PORT",
  "FLASH_ERP_STORE_SERVER_TIMEOUT_MS",
  "FLASH_ERP_STORE_SYNC_BASE_URL",
  "FLASH_ERP_DESKTOP_UPDATE_URL"
] as const;
const defaultDesktopUpdateFeedUrl =
  "https://updates.flashcodesolutions.com/flash-erp/store-desktop/";
const desktopUpdateCheckIntervalMs = 6 * 60 * 60 * 1000;
const rendererReadyTimeoutMs = 8_000;
const rendererHeartbeatWarningMs = 35_000;
const rendererHeartbeatRecoveryMs = 90_000;
const rendererRecoveryCooldownMs = 30_000;
const unresponsiveRecoveryMs = 12_000;
const localSyncCycleRequestTimeoutMs = readDesktopDurationMs(
  "FLASH_ERP_DESKTOP_SYNC_REQUEST_TIMEOUT_MS",
  30_000,
  10_000,
  60_000
);
const detachedSyncCycleWatchdogMs = readDesktopDurationMs(
  "FLASH_ERP_DESKTOP_SYNC_WATCHDOG_MS",
  localSyncCycleRequestTimeoutMs + 5_000,
  localSyncCycleRequestTimeoutMs + 1_000,
  90_000
);
const enterpriseSyncHttpTimeoutMs = readDesktopDurationMs(
  "FLASH_ERP_ENTERPRISE_SYNC_HTTP_TIMEOUT_MS",
  12_000,
  5_000,
  30_000
);
const enterpriseSyncPullLimit = readDesktopInteger(
  "FLASH_ERP_STORE_SYNC_PULL_LIMIT",
  5,
  1,
  5
);
const isolatedSyncWorkerTimeoutMs = Math.min(
  detachedSyncCycleWatchdogMs - 2_000,
  readDesktopDurationMs(
    "FLASH_ERP_DESKTOP_SYNC_WORKER_TIMEOUT_MS",
    25_000,
    5_000,
    85_000
  )
);
const defaultDetachedSyncDrainCycleLimit = 1;
const maxDetachedSyncDrainCycleLimit = 5;
const desktopWindowStateFileName = "desktop-window-state.json";
let desktopUpdateStatus: StoreDesktopUpdateStatus = {
  status: "idle",
  currentVersion: desktopAppVersion,
  availableVersion: null,
  message: "Desktop update checks are waiting for the app to finish starting.",
  feedUrl: null,
  checkedAt: null,
  downloadedAt: null,
  downloadPercent: null
};

type DesktopConnectionConfigEnvKey = (typeof desktopConnectionConfigEnvKeys)[number];
type DesktopConnectionConfigFile = Partial<Record<DesktopConnectionConfigEnvKey, string>>;
type DesktopWindowStateFile = {
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  maximized?: boolean;
};

function readDesktopDurationMs(
  envKey: string,
  fallback: number,
  min: number,
  max: number
) {
  const parsed = Number(process.env[envKey]);

  if (!Number.isInteger(parsed)) {
    return Math.min(max, Math.max(min, fallback));
  }

  return Math.min(max, Math.max(min, parsed));
}

function readDesktopInteger(
  envKey: string,
  fallback: number,
  min: number,
  max: number
) {
  const parsed = Number(process.env[envKey]);

  if (!Number.isInteger(parsed)) {
    return Math.min(max, Math.max(min, fallback));
  }

  return Math.min(max, Math.max(min, parsed));
}

function getDesktopUpdateFeedUrl() {
  const configuredUrl =
    readDesktopConnectionConfigFile().FLASH_ERP_DESKTOP_UPDATE_URL?.trim() ||
    process.env.FLASH_ERP_DESKTOP_UPDATE_URL?.trim() ||
    defaultDesktopUpdateFeedUrl;

  try {
    return normalizeDesktopHttpUrl(configuredUrl, "Desktop update feed URL");
  } catch (error) {
    console.error("Flash ERP desktop update feed URL is invalid.", error);
    return null;
  }
}

function isDesktopUpdaterEnabled() {
  return app.isPackaged || process.env.FLASH_ERP_DESKTOP_ENABLE_DEV_UPDATES === "1";
}

function getDesktopWindowStatePath() {
  return path.join(app.getPath("userData"), desktopWindowStateFileName);
}

function isUsableWindowBounds(value: unknown): value is NonNullable<DesktopWindowStateFile["bounds"]> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const bounds = value as Record<string, unknown>;
  return (
    typeof bounds.x === "number" &&
    typeof bounds.y === "number" &&
    typeof bounds.width === "number" &&
    typeof bounds.height === "number" &&
    bounds.width >= 900 &&
    bounds.height >= 640
  );
}

function sanitizeWindowBounds(bounds: NonNullable<DesktopWindowStateFile["bounds"]>) {
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;
  const width = Math.min(Math.max(Math.trunc(bounds.width), 980), workArea.width);
  const height = Math.min(Math.max(Math.trunc(bounds.height), 700), workArea.height);
  const x = Math.min(Math.max(Math.trunc(bounds.x), workArea.x), workArea.x + workArea.width - width);
  const y = Math.min(Math.max(Math.trunc(bounds.y), workArea.y), workArea.y + workArea.height - height);

  return { x, y, width, height };
}

function readDesktopWindowState(): DesktopWindowStateFile | null {
  try {
    const parsed = JSON.parse(readFileSync(getDesktopWindowStatePath(), "utf8")) as DesktopWindowStateFile;

    return {
      bounds: isUsableWindowBounds(parsed.bounds)
        ? sanitizeWindowBounds(parsed.bounds)
        : undefined,
      maximized: parsed.maximized === true
    };
  } catch {
    return null;
  }
}

function saveDesktopWindowState(window: BrowserWindow) {
  if (window.isDestroyed() || window.isFullScreen()) {
    return;
  }

  const state: DesktopWindowStateFile = {
    bounds: sanitizeWindowBounds(window.isMaximized() ? window.getNormalBounds() : window.getBounds()),
    maximized: window.isMaximized()
  };

  try {
    const windowStatePath = getDesktopWindowStatePath();
    mkdirSync(path.dirname(windowStatePath), { recursive: true });
    writeFileSync(windowStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  } catch (error) {
    console.warn("Flash ERP could not persist the desktop window state.", error);
  }
}

function scheduleDesktopWindowStateSave(window: BrowserWindow) {
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer);
  }

  windowStateSaveTimer = setTimeout(() => {
    windowStateSaveTimer = null;
    saveDesktopWindowState(window);
  }, 350);
}

function setDesktopUpdateStatus(patch: Partial<StoreDesktopUpdateStatus>) {
  desktopUpdateStatus = {
    ...desktopUpdateStatus,
    currentVersion: desktopAppVersion,
    feedUrl: getDesktopUpdateFeedUrl(),
    ...patch
  };

  mainWindow?.webContents.send("flash-erp:desktop-update-status", desktopUpdateStatus);
  return desktopUpdateStatus;
}

function getUpdateInfoVersion(info: UpdateInfo | null | undefined) {
  return typeof info?.version === "string" && info.version.trim()
    ? info.version.trim()
    : null;
}

function showDesktopMessageBox(options: MessageBoxOptions) {
  return mainWindow ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options);
}

async function promptToDownloadDesktopUpdate(info: UpdateInfo) {
  const availableVersion = getUpdateInfoVersion(info);
  const result = await showDesktopMessageBox({
    type: "info",
    buttons: ["Download now", "Later"],
    defaultId: 0,
    cancelId: 1,
    title: "Flash ERP update available",
    message: `Flash ERP Store Desktop ${availableVersion ?? "update"} is available.`,
    detail:
      "Download the update on this shop machine. You can keep selling while it downloads, then install it when prompted."
  });

  if (result.response === 0) {
    setDesktopUpdateStatus({
      status: "downloading",
      message: `Downloading Flash ERP Store Desktop ${availableVersion ?? "update"}...`,
      availableVersion,
      downloadPercent: 0
    });
    await autoUpdater.downloadUpdate();
  }
}

async function promptToInstallDesktopUpdate() {
  const result = await showDesktopMessageBox({
    type: "info",
    buttons: ["Install and restart", "Later"],
    defaultId: 0,
    cancelId: 1,
    title: "Flash ERP update ready",
    message: "Flash ERP Store Desktop has downloaded an update.",
    detail:
      "Install it when this till is not in the middle of a transaction. The app will restart to finish the update."
  });

  if (result.response === 0) {
    autoUpdater.quitAndInstall(false, true);
  }
}

function configureDesktopAutoUpdater() {
  if (desktopUpdaterConfigured) {
    return;
  }

  desktopUpdaterConfigured = true;

  if (!isDesktopUpdaterEnabled()) {
    setDesktopUpdateStatus({
      status: "disabled",
      message: "Desktop update checks run only in packaged builds.",
      feedUrl: getDesktopUpdateFeedUrl()
    });
    return;
  }

  const feedUrl = getDesktopUpdateFeedUrl();
  if (feedUrl) {
    autoUpdater.setFeedURL({ provider: "generic", url: feedUrl });
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    setDesktopUpdateStatus({
      status: "checking",
      message: "Checking for Flash ERP Store Desktop updates...",
      checkedAt: new Date().toISOString(),
      downloadPercent: null
    });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    const availableVersion = getUpdateInfoVersion(info);
    setDesktopUpdateStatus({
      status: "available",
      message: `Flash ERP Store Desktop ${availableVersion ?? "update"} is available.`,
      availableVersion,
      checkedAt: new Date().toISOString(),
      downloadPercent: null
    });
    lastDesktopUpdateCheckWasManual = false;
    void promptToDownloadDesktopUpdate(info).catch((error) => {
      console.error("Flash ERP desktop update download could not start.", error);
      setDesktopUpdateStatus({
        status: "error",
        message:
          error instanceof Error
            ? `Update download could not start: ${error.message}`
            : "Update download could not start."
      });
    });
  });

  autoUpdater.on("update-not-available", () => {
    setDesktopUpdateStatus({
      status: "not-available",
      message: "This shop machine is already on the latest Flash ERP Store Desktop version.",
      availableVersion: null,
      checkedAt: new Date().toISOString(),
      downloadPercent: null
    });

    if (lastDesktopUpdateCheckWasManual) {
      void showDesktopMessageBox({
        type: "info",
        buttons: ["OK"],
        title: "No update available",
        message: "This shop machine is already up to date."
      });
    }
    lastDesktopUpdateCheckWasManual = false;
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    setDesktopUpdateStatus({
      status: "downloading",
      message: `Downloading update (${Math.round(progress.percent)}%).`,
      downloadPercent: progress.percent
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    const availableVersion = getUpdateInfoVersion(info);
    setDesktopUpdateStatus({
      status: "downloaded",
      message: `Flash ERP Store Desktop ${availableVersion ?? "update"} is ready to install.`,
      availableVersion,
      downloadedAt: new Date().toISOString(),
      downloadPercent: 100
    });
    void promptToInstallDesktopUpdate();
  });

  autoUpdater.on("error", (error: Error) => {
    console.error("Flash ERP desktop updater failed.", error);
    setDesktopUpdateStatus({
      status: "error",
      message: error.message || "Desktop update check failed.",
      downloadPercent: null
    });
  });
}

async function checkForDesktopUpdate(manual = false) {
  configureDesktopAutoUpdater();

  if (!isDesktopUpdaterEnabled()) {
    return setDesktopUpdateStatus({
      status: "disabled",
      message: "Desktop update checks run only in packaged builds.",
      feedUrl: getDesktopUpdateFeedUrl()
    });
  }

  lastDesktopUpdateCheckWasManual = manual;

  try {
    setDesktopUpdateStatus({
      status: "checking",
      message: "Checking for Flash ERP Store Desktop updates...",
      checkedAt: new Date().toISOString(),
      downloadPercent: null
    });
    await autoUpdater.checkForUpdates();
    return desktopUpdateStatus;
  } catch (error) {
    lastDesktopUpdateCheckWasManual = false;
    return setDesktopUpdateStatus({
      status: "error",
      message:
        error instanceof Error
          ? `Desktop update check failed: ${error.message}`
          : "Desktop update check failed.",
      downloadPercent: null
    });
  }
}

function installDesktopUpdate() {
  if (desktopUpdateStatus.status !== "downloaded") {
    throw new Error("No downloaded Flash ERP Store Desktop update is ready to install.");
  }

  setDesktopUpdateStatus({
    message: "Installing Flash ERP Store Desktop update..."
  });
  autoUpdater.quitAndInstall(false, true);
  return desktopUpdateStatus;
}

function scheduleDesktopUpdateChecks() {
  configureDesktopAutoUpdater();

  if (!isDesktopUpdaterEnabled()) {
    return;
  }

  setTimeout(() => {
    void checkForDesktopUpdate(false);
  }, 60_000);
  desktopUpdateCheckTimer = setInterval(() => {
    void checkForDesktopUpdate(false);
  }, desktopUpdateCheckIntervalMs);
}

async function requireStoreClient() {
  if (
    !storeClient &&
    storeRuntimeConfig &&
    shouldUseLocalStoreServerProcess(storeRuntimeConfig)
  ) {
    try {
      await restartLocalStoreServerProcess("recover-missing-store-client");
      startupErrorMessage = null;
    } catch (error) {
      startupErrorMessage =
        error instanceof Error
          ? error.message
          : "Flash ERP could not recover local store services.";
    }
  }

  if (!storeClient) {
    throw new Error(
      startupErrorMessage ?? "Flash ERP store services are not available."
    );
  }

  return storeClient;
}

async function callStore<T>(method: StoreServiceMethod, args: unknown[] = []) {
  const client = await requireStoreClient();
  return (await client.call(method, args)) as T;
}

function normalizeSyncTrigger(input?: StoreSyncRunOptions): NonNullable<StoreSyncRunOptions["trigger"]> {
  if (
    input?.trigger === "scheduled" ||
    input?.trigger === "tray" ||
    input?.trigger === "startup"
  ) {
    return input.trigger;
  }

  return "manual";
}

function publishDetachedSyncStatus(event: StoreSyncCycleStatusEvent) {
  console.info("Store Desktop detached sync status recorded.", {
    traceId: event.traceId,
    trigger: event.trigger,
    status: event.status,
    elapsedMs: event.elapsedMs,
    message: event.message
  });

  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send("flash-erp:sync-cycle-status", {
      traceId: event.traceId,
      trigger: event.trigger,
      status: event.status,
      message: event.message,
      elapsedMs: event.elapsedMs,
      completedAt: event.completedAt
    } satisfies StoreSyncCycleStatusEvent);
  }
}

function syncResultHasPendingDownstream(result: StoreSyncActionResult) {
  return (
    result.downstreamLimitReached === true ||
    result.message.includes("More downstream packets")
  );
}

function readDetachedSyncDrainCycleLimit() {
  const configured = Number(process.env.FLASH_ERP_DESKTOP_DETACHED_SYNC_CYCLES);

  if (!Number.isFinite(configured) || configured <= 0) {
    return defaultDetachedSyncDrainCycleLimit;
  }

  return Math.max(
    1,
    Math.min(Math.trunc(configured), maxDetachedSyncDrainCycleLimit)
  );
}

function shouldRunSyncInIsolatedWorker(config: StoreRuntimeConfig) {
  const workerMode = process.env.FLASH_ERP_DESKTOP_SYNC_ISOLATED_WORKER?.trim();

  if (workerMode === "0") {
    return false;
  }

  return (
    config.role === "embedded" &&
    config.databaseProvider === "sqlite"
  );
}

function getSyncWorkerLogPath(traceId: string) {
  const logDirectory = path.join(app.getPath("userData"), "logs", "sync-workers");
  mkdirSync(logDirectory, { recursive: true });
  pruneSyncWorkerArtifacts(logDirectory);
  return path.join(logDirectory, `${traceId}.log`);
}

function pruneSyncWorkerArtifacts(logDirectory: string) {
  try {
    const groups = new Map<string, { files: string[]; newestAt: number }>();

    for (const entry of readdirSync(logDirectory, { withFileTypes: true })) {
      if (!entry.isFile()) {
        continue;
      }

      const match = entry.name.match(
        /^(store-detached-sync-[^.]+)\.(?:log|error\.log|pid|launcher\.log|launcher\.ps1)$/,
      );

      if (!match) {
        continue;
      }

      const absolutePath = path.join(logDirectory, entry.name);
      const modifiedAt = statSync(absolutePath).mtimeMs;
      const group = groups.get(match[1]) ?? { files: [], newestAt: 0 };
      group.files.push(absolutePath);
      group.newestAt = Math.max(group.newestAt, modifiedAt);
      groups.set(match[1], group);
    }

    const expiredGroups = [...groups.values()]
      .sort((left, right) => right.newestAt - left.newestAt)
      .slice(100);

    for (const group of expiredGroups) {
      for (const artifactPath of group.files) {
        rmSync(artifactPath, { force: true });
      }
    }
  } catch (error) {
    console.warn("Store Desktop could not prune old sync worker logs.", error);
  }
}

function quotePowerShellSingle(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteWindowsCommandLineArgument(value: string) {
  if (!/[ \t\n\v"]/.test(value)) {
    return value;
  }

  let quoted = '"';
  let backslashCount = 0;

  for (const character of value) {
    if (character === "\\") {
      backslashCount += 1;
      continue;
    }

    if (character === '"') {
      quoted += "\\".repeat(backslashCount * 2 + 1);
      quoted += character;
      backslashCount = 0;
      continue;
    }

    quoted += "\\".repeat(backslashCount);
    quoted += character;
    backslashCount = 0;
  }

  quoted += "\\".repeat(backslashCount * 2);
  quoted += '"';
  return quoted;
}

function buildWindowsCommandLineArgumentList(values: string[]) {
  return values.map(quoteWindowsCommandLineArgument).join(" ");
}

function buildPowerShellEnvAssignment(key: string, value: string | number | null | undefined) {
  return `$env:${key} = ${quotePowerShellSingle(value == null ? "" : String(value))}`;
}

function readTextFileIfExists(filePath: string) {
  try {
    return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  } catch {
    return "";
  }
}

function readWorkerPid(workerPidPath: string) {
  const parsed = Number(readTextFileIfExists(workerPidPath).trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function stopDetachedSyncWorker(workerPidPath: string) {
  const workerPid = readWorkerPid(workerPidPath);

  if (!workerPid) {
    return;
  }

  const killer = spawn("taskkill.exe", ["/PID", String(workerPid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true
  });
  killer.unref();
}

function attachSyncLauncherLogs(child: ChildProcess, traceId: string) {
  const writeChunk = (
    chunk: Buffer | string,
    write: (message: string) => void
  ) => {
    const lines = String(chunk)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length > 0) {
      write(lines.map((line) => `[sync-launcher:${traceId}] ${line}`).join("\n"));
    }
  };

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => writeChunk(chunk, (message) => console.info(message)));
  child.stderr?.on("data", (chunk) => writeChunk(chunk, (message) => console.error(message)));
}

function readIsolatedSyncWorkerTerminalState(input: {
  workerLogPath: string;
  workerErrorLogPath: string;
}): { status: "completed" | "failed"; message: string } | null {
  const output = readTextFileIfExists(input.workerLogPath);
  const errorOutput = readTextFileIfExists(input.workerErrorLogPath);
  const combinedOutput = `${output}\n${errorOutput}`;

  if (combinedOutput.includes("Store Desktop isolated sync worker completed.")) {
    return {
      status: "completed",
      message: "Flash ERP completed the isolated background sync cycle."
    };
  }

  if (combinedOutput.includes("Store Desktop isolated sync worker failed.")) {
    const failureMatch = errorOutput.match(
      /Store Desktop isolated sync worker failed\.\s+(?:Error:\s*)?([^\r\n]+)/
    );
    const failureMessage = failureMatch?.[1]?.trim();

    return {
      status: "failed",
      message:
        failureMessage ||
        `Flash ERP isolated sync worker failed. Check ${input.workerLogPath} and ${input.workerErrorLogPath} for details.`
    };
  }

  return null;
}

function startIsolatedDetachedSyncCycle(input: {
  syncInput: StoreSyncRunOptions;
  trigger: NonNullable<StoreSyncRunOptions["trigger"]>;
  traceId: string;
  startedAt: string;
}): StoreSyncCycleStartResult {
  const config = storeRuntimeConfig ?? resolveStoreRuntimeConfig();
  const entryPath = resolveStoreSyncWorkerEntryPath();
  const nodeRuntimePath = resolveSyncNodeRuntimePath();

  if (!existsSync(entryPath)) {
    return {
      accepted: false,
      status: "unavailable",
      trigger: input.trigger,
      message: `Flash ERP could not find the isolated sync worker at ${entryPath}. Rebuild the desktop and try again.`,
      startedAt: null
    };
  }

  if (!nodeRuntimePath) {
    return {
      accepted: false,
      status: "unavailable",
      trigger: input.trigger,
      message:
        "Flash ERP could not find the Node 24 sync runtime. Run npm install or set FLASH_ERP_DESKTOP_SYNC_NODE_PATH to a Node runtime that supports node:sqlite.",
      startedAt: null
    };
  }

  const workerLogPath = getSyncWorkerLogPath(input.traceId);
  const syncInput = {
    ...input.syncInput,
    drainDownstream: input.syncInput.drainDownstream === true,
    snapshotMode: input.syncInput.snapshotMode ?? "status"
  } satisfies StoreSyncRunOptions;
  const encodedInput = Buffer.from(JSON.stringify(syncInput), "utf8").toString("base64url");

  detachedSyncCycleInFlight = new Promise<void>((resolve) => {
    setImmediate(() => {
      const startedAtMs = Date.now();
      const cwd = resolveStoreServerProcessCwd();
      const workerErrorLogPath = workerLogPath.replace(/\.log$/i, ".error.log");
      const workerPidPath = workerLogPath.replace(/\.log$/i, ".pid");
      const launcherLogPath = workerLogPath.replace(/\.log$/i, ".launcher.log");
      const launcherScriptPath = workerLogPath.replace(/\.log$/i, ".launcher.ps1");
      let settled = false;
      let workerWatchdog: NodeJS.Timeout | null = null;
      let workerPoller: NodeJS.Timeout | null = null;

      const clearWorkerTimers = () => {
        if (workerWatchdog) {
          clearTimeout(workerWatchdog);
          workerWatchdog = null;
        }

        if (workerPoller) {
          clearInterval(workerPoller);
          workerPoller = null;
        }
      };

      const settleWorker = (event: StoreSyncCycleStatusEvent, logAsError: boolean) => {
        if (settled) {
          return;
        }

        settled = true;
        clearWorkerTimers();

        console[logAsError ? "error" : "info"]("Store Desktop isolated sync worker process settled.", {
          traceId: input.traceId,
          trigger: input.trigger,
          workerPid: readWorkerPid(workerPidPath),
          status: event.status,
          elapsedMs: event.elapsedMs,
          workerLogPath,
          workerErrorLogPath,
          launcherLogPath,
          message: event.message
        });
        publishDetachedSyncStatus(event);

        if (detachedSyncCycleInFlight) {
          detachedSyncCycleInFlight = null;
        }
        resolve();
      };

      try {
        const launcherScript = [
          "$ErrorActionPreference = 'Stop'",
          `$launcherLogPath = ${quotePowerShellSingle(launcherLogPath)}`,
          `Set-Content -LiteralPath $launcherLogPath -Value ${quotePowerShellSingle(`launcher starting ${input.traceId}`)}`,
          buildPowerShellEnvAssignment("ELECTRON_RUN_AS_NODE", "1"),
          buildPowerShellEnvAssignment("FLASH_ERP_STORE_SYNC_WORKER", "1"),
          buildPowerShellEnvAssignment("FLASH_ERP_STORE_DEPLOYMENT_MODE", config.deploymentMode),
          buildPowerShellEnvAssignment("FLASH_ERP_STORE_RUNTIME_ROLE", "embedded"),
          buildPowerShellEnvAssignment("FLASH_ERP_STORE_DATABASE_PROVIDER", config.databaseProvider),
          buildPowerShellEnvAssignment("FLASH_ERP_STORE_DB_PATH", config.databasePath),
          buildPowerShellEnvAssignment("FLASH_ERP_STORE_USER_DATA_PATH", config.userDataPath ?? app.getPath("userData")),
          buildPowerShellEnvAssignment("FLASH_ERP_STORE_NODE_CODE", config.nodeCode),
          buildPowerShellEnvAssignment("FLASH_ERP_STORE_TERMINAL_CODE", config.terminalContext.terminalCode),
          buildPowerShellEnvAssignment("FLASH_ERP_STORE_TERMINAL_NAME", config.terminalContext.clientName),
          buildPowerShellEnvAssignment("FLASH_ERP_STORE_SERVER_URL", config.storeServerUrl),
          buildPowerShellEnvAssignment("FLASH_ERP_STORE_SERVER_TOKEN", config.storeServerToken),
          buildPowerShellEnvAssignment("FLASH_ERP_STORE_SERVER_ENABLED", config.shouldStartStoreServer ? "1" : "0"),
          buildPowerShellEnvAssignment("FLASH_ERP_STORE_SERVER_HOST", config.storeServerHost),
          buildPowerShellEnvAssignment("FLASH_ERP_STORE_SERVER_PORT", config.storeServerPort),
          buildPowerShellEnvAssignment("FLASH_ERP_STORE_SERVER_TIMEOUT_MS", config.storeServerTimeoutMs),
          buildPowerShellEnvAssignment("FLASH_ERP_STORE_SYNC_BASE_URL", config.syncBaseUrl),
          buildPowerShellEnvAssignment("FLASH_ERP_STORE_SYNC_PULL_LIMIT", enterpriseSyncPullLimit),
          buildPowerShellEnvAssignment("FLASH_ERP_ENTERPRISE_SYNC_HTTP_TIMEOUT_MS", enterpriseSyncHttpTimeoutMs),
          buildPowerShellEnvAssignment("FLASH_ERP_DESKTOP_SYNC_WORKER_TIMEOUT_MS", isolatedSyncWorkerTimeoutMs),
          `$argumentList = ${quotePowerShellSingle(buildWindowsCommandLineArgumentList([
            entryPath,
            encodedInput
          ]))}`,
          `$process = Start-Process -FilePath ${quotePowerShellSingle(nodeRuntimePath)} -ArgumentList $argumentList -WorkingDirectory ${quotePowerShellSingle(cwd)} -WindowStyle Hidden -RedirectStandardOutput ${quotePowerShellSingle(workerLogPath)} -RedirectStandardError ${quotePowerShellSingle(workerErrorLogPath)} -PassThru`,
          `Set-Content -LiteralPath ${quotePowerShellSingle(workerPidPath)} -Value $process.Id`,
          `Add-Content -LiteralPath $launcherLogPath -Value ("worker started " + $process.Id)`
        ].join("\r\n");
        writeFileSync(launcherScriptPath, launcherScript, "utf8");

        const launcher = spawn("powershell.exe", [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          launcherScriptPath
        ], {
          cwd,
          env: {
            ...process.env,
            FLASH_ERP_STORE_SERVER_TOKEN: config.storeServerToken ?? ""
          },
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true
        });

        attachSyncLauncherLogs(launcher, input.traceId);
        launcher.once("close", () => {
          rmSync(launcherScriptPath, { force: true });
        });

        workerWatchdog = setTimeout(() => {
          const elapsedMs = Date.now() - startedAtMs;
          stopDetachedSyncWorker(workerPidPath);
          settleWorker(
            {
              traceId: input.traceId,
              trigger: input.trigger,
              status: "failed",
              message: `Flash ERP isolated sync worker did not finish within ${Math.round(detachedSyncCycleWatchdogMs / 1000)} seconds. The desktop released the sync request; check ${workerLogPath} for the last sync step.`,
              elapsedMs,
              completedAt: new Date().toISOString()
            },
            true
          );
        }, detachedSyncCycleWatchdogMs);

        workerPoller = setInterval(() => {
          const terminalState = readIsolatedSyncWorkerTerminalState({
            workerLogPath,
            workerErrorLogPath
          });

          if (!terminalState) {
            return;
          }

          settleWorker(
            {
              traceId: input.traceId,
              trigger: input.trigger,
              status: terminalState.status,
              message: terminalState.message,
              elapsedMs: Date.now() - startedAtMs,
              completedAt: new Date().toISOString()
            },
            terminalState.status === "failed"
          );
        }, 1000);

        console.info("Store Desktop isolated sync worker launch requested.", {
          traceId: input.traceId,
          trigger: input.trigger,
          launcherPid: launcher.pid ?? null,
          workerLogPath,
          workerErrorLogPath,
          workerPidPath,
          launcherLogPath,
          launcherScriptPath,
          entryPath,
          nodeRuntimePath,
          detachedLauncher: false,
          watchdogMs: detachedSyncCycleWatchdogMs
        });

        launcher.once("error", (error) => {
          const elapsedMs = Date.now() - startedAtMs;
          settleWorker(
            {
              traceId: input.traceId,
              trigger: input.trigger,
              status: "failed",
              message:
                error instanceof Error
                  ? error.message
                  : "Flash ERP could not start the isolated sync worker launcher.",
              elapsedMs,
              completedAt: new Date().toISOString()
            },
            true
          );
        });

        launcher.once("exit", (code) => {
          console.info("Store Desktop isolated sync worker launcher exited.", {
            traceId: input.traceId,
            trigger: input.trigger,
            code,
            workerPid: readWorkerPid(workerPidPath),
            launcherLogPath
          });

          if (code && !settled) {
            settleWorker(
              {
                traceId: input.traceId,
                trigger: input.trigger,
                status: "failed",
                message: `Flash ERP could not start the isolated sync worker launcher. PowerShell exited with code ${code}.`,
                elapsedMs: Date.now() - startedAtMs,
                completedAt: new Date().toISOString()
              },
              true
            );
          }
        });
      } catch (error) {
        const elapsedMs = Date.now() - startedAtMs;
        console.error("Store Desktop isolated sync worker launch failed.", {
          traceId: input.traceId,
          trigger: input.trigger,
          elapsedMs,
          workerLogPath,
          error
        });
        publishDetachedSyncStatus({
          traceId: input.traceId,
          trigger: input.trigger,
          status: "failed",
          message:
            error instanceof Error
              ? error.message
              : "Flash ERP could not launch the isolated sync worker.",
          elapsedMs,
          completedAt: new Date().toISOString()
        });

        if (detachedSyncCycleInFlight) {
          detachedSyncCycleInFlight = null;
        }
        resolve();
      }
    });
  });

  return {
    accepted: true,
    status: "started",
    trigger: input.trigger,
    message: "Flash ERP sync started in an isolated background worker.",
    startedAt: input.startedAt
  };
}

function startDetachedSyncCycle(input?: StoreSyncRunOptions): StoreSyncCycleStartResult {
  const trigger = normalizeSyncTrigger(input);

  if (!storeClient) {
    return {
      accepted: false,
      status: "unavailable",
      trigger,
      message:
        startupErrorMessage ??
        "Flash ERP store services are not available. Open Desktop setup, provision or repair the store database, then restart the desktop.",
      startedAt: null
    };
  }

  if (detachedSyncCycleInFlight) {
    return {
      accepted: false,
      status: "busy",
      trigger,
      message:
        "A store sync is already running. Flash ERP is keeping that existing sync cycle active.",
      startedAt: null
    };
  }

  const startedAt = new Date().toISOString();
  const traceId = createTraceId("store-detached-sync");
  const syncInput: StoreSyncRunOptions = {
    ...(input ?? {}),
    trigger,
    drainDownstream: input?.drainDownstream ?? false,
    snapshotMode: input?.snapshotMode ?? "status"
  };

  if (
    storeRuntimeConfig &&
    shouldRunSyncInIsolatedWorker(storeRuntimeConfig)
  ) {
    return startIsolatedDetachedSyncCycle({
      syncInput,
      trigger,
      traceId,
      startedAt
    });
  }

  detachedSyncCycleInFlight = new Promise<void>((resolve) => {
    setImmediate(() => {
      void (async () => {
        const startedAtMs = Date.now();

        console.info("Store Desktop detached sync started.", {
          traceId,
          trigger,
          snapshotMode: syncInput.snapshotMode,
          scheduledFor: syncInput.scheduledFor ?? null,
          drainDownstream: syncInput.drainDownstream === true,
          syncRequestTimeoutMs: localSyncCycleRequestTimeoutMs,
          watchdogMs: detachedSyncCycleWatchdogMs
        });

        try {
          const shouldDrainDownstream = syncInput.drainDownstream === true;
          const cycleLimit = shouldDrainDownstream
            ? readDetachedSyncDrainCycleLimit()
            : 1;
          let result: StoreSyncActionResult | null = null;
          let cycleCount = 0;
          let downstreamStillPending = false;

          for (let cycle = 0; cycle < cycleLimit; cycle += 1) {
            result = await withDetachedSyncWatchdog(
              callStore<StoreSyncActionResult>("runSyncCycle", [
                {
                  ...syncInput,
                  drainDownstream: shouldDrainDownstream
                }
              ]),
              detachedSyncCycleWatchdogMs
            );
            cycleCount = cycle + 1;
            downstreamStillPending = syncResultHasPendingDownstream(result);

            console.info("Store Desktop detached sync page completed.", {
              traceId,
              trigger,
              cycle: cycleCount,
              downstreamStillPending,
              upstreamProcessed: result.upstreamProcessed ?? null,
              downstreamApplied: result.downstreamApplied ?? null,
              downstreamPullPasses: result.downstreamPullPasses ?? null,
              latestCursor: result.latestCursor ?? null
            });

            if (!shouldDrainDownstream || !downstreamStillPending) {
              break;
            }
          }

          const elapsedMs = Date.now() - startedAtMs;
          const message =
            result?.message ??
            "Flash ERP completed the background sync cycle.";
          const summaryMessage =
            shouldDrainDownstream && cycleCount > 1
              ? downstreamStillPending
                ? `Flash ERP completed ${cycleCount} bounded sync cycle(s). More downstream packets may still be pending; run sync again to continue.`
                : `Flash ERP completed ${cycleCount} bounded sync cycle(s) and caught up the available downstream queue.`
              : message;

          console.info("Store Desktop detached sync completed.", {
            traceId,
            trigger,
            elapsedMs,
            drainCycles: cycleCount,
            downstreamStillPending,
            message: summaryMessage
          });
          publishDetachedSyncStatus({
            traceId,
            trigger,
            status: "completed",
            message: summaryMessage,
            elapsedMs,
            completedAt: new Date().toISOString()
          });
        } catch (error) {
          const elapsedMs = Date.now() - startedAtMs;
          if (isDetachedSyncTimeoutError(error)) {
            try {
              await restartLocalStoreServerProcess("recover-after-detached-sync-watchdog");
            } catch (restartError) {
              console.error("Store Desktop local store server restart failed after sync watchdog timeout.", {
                traceId,
                trigger,
                restartError
              });
            }
          }

          const message =
            error instanceof Error
              ? error.message
              : "Flash ERP could not complete the background sync cycle.";

          console.error("Store Desktop detached sync failed.", {
            traceId,
            trigger,
            elapsedMs,
            error
          });
          publishDetachedSyncStatus({
            traceId,
            trigger,
            status: "failed",
            message,
            elapsedMs,
            completedAt: new Date().toISOString()
          });
        } finally {
          if (detachedSyncCycleInFlight) {
            detachedSyncCycleInFlight = null;
          }
          resolve();
        }
      })();
    });
  });

  return {
    accepted: true,
    status: "started",
    trigger,
    message: "Flash ERP sync started in the background.",
    startedAt
  };
}

function createTraceId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function logDesktopLaunchStage(label: string, details?: Record<string, unknown>) {
  console.info(`Store Desktop launch: ${label}.`, details ?? {});
}

function summarizeSignInArgs(args: unknown[]) {
  const input = args[0] as { loginId?: unknown; password?: unknown; traceId?: unknown } | undefined;
  const loginId = typeof input?.loginId === "string" ? input.loginId.trim() : "";

  return {
    traceId: typeof input?.traceId === "string" ? input.traceId : null,
    loginId,
    loginIdLength: loginId.length,
    passwordLength: typeof input?.password === "string" ? input.password.length : null
  };
}

function registerStoreIpcHandler(
  channel: string,
  method: StoreServiceMethod,
  mapArgs: (...args: unknown[]) => unknown[] = (...args) => args
) {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    const mappedArgs = mapArgs(...args);
    const shouldTrace =
      method === "getSyncSnapshot" ||
      method === "getSyncStatusSnapshot" ||
      method === "signInOperator" ||
      method === "runSyncCycle";
    const startedAt = Date.now();
    const signInSummary =
      method === "signInOperator" ? summarizeSignInArgs(mappedArgs) : null;
    const traceId =
      signInSummary?.traceId ??
      (shouldTrace ? createTraceId(`store-ipc-${method}`) : null);
    let slowTimer: NodeJS.Timeout | null = null;

    if (shouldTrace) {
      slowTimer = setTimeout(() => {
        console.warn("Store Desktop IPC is still running.", {
          traceId,
          channel,
          method,
          elapsedMs: Date.now() - startedAt,
          ...(signInSummary ? { loginId: signInSummary.loginId } : {})
        });
      }, 5000);

      console.info("Store Desktop IPC started.", {
        traceId,
        channel,
        method,
        ...(signInSummary
          ? {
              loginId: signInSummary.loginId,
              loginIdLength: signInSummary.loginIdLength,
              passwordLength: signInSummary.passwordLength
            }
          : {})
      });
    }

    try {
      const result = await callStore(method, mappedArgs);

      if (shouldTrace) {
        console.info("Store Desktop IPC completed.", {
          traceId,
          channel,
          method,
          elapsedMs: Date.now() - startedAt,
          returnedSnapshot:
            typeof result === "object" &&
            result !== null &&
            "snapshot" in result
        });
      }

      return result;
    } catch (error) {
      if (shouldTrace) {
        console.error("Store Desktop IPC failed.", {
          traceId,
          channel,
          method,
          elapsedMs: Date.now() - startedAt,
          error
        });
      }
      throw error;
    } finally {
      if (slowTimer) {
        clearTimeout(slowTimer);
      }
    }
  });
}

async function fetchStoreServerHealth(
  url: string,
  input?: {
    serverToken?: string | null;
    terminalCode?: string | null;
    clientName?: string | null;
    timeoutMs?: number | null;
  }
): Promise<StoreServerHealth> {
  const controller = new AbortController();
  const timeoutMs = input?.timeoutMs ?? 2500;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;

    try {
      response = await fetch(`${url.replace(/\/+$/, "")}/health`, {
        headers: {
          ...(input?.serverToken ? { "x-flash-erp-store-token": input.serverToken } : {}),
          ...(input?.terminalCode ? { "x-flash-erp-terminal-code": input.terminalCode } : {}),
          ...(input?.clientName ? { "x-flash-erp-terminal-name": input.clientName } : {})
        },
        signal: controller.signal
      });
    } catch (error) {
      throw new Error(
        error instanceof Error && error.name === "AbortError"
          ? `Store server health check timed out after ${timeoutMs} ms.`
          : error instanceof Error
          ? error.message
          : "Store server health check failed."
      );
    }

    if (!response.ok) {
      let message = `Store server returned HTTP ${response.status}.`;

      try {
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: { message?: string };
        };

        if (payload.ok === false && payload.error?.message) {
          message = payload.error.message;
        }
      } catch {
        // Keep the HTTP-level message when the server did not return JSON.
      }

      throw new Error(message);
    }

    const payload = (await response.json()) as {
      ok?: boolean;
      data?: StoreServerHealth;
      error?: { message?: string };
    };

    if (payload.ok === false) {
      throw new Error(payload.error?.message ?? "Store server health check failed.");
    }

    if (!payload.data) {
      throw new Error("Store server returned an empty health response.");
    }

    return payload.data;
  } finally {
    clearTimeout(timeout);
  }
}

function getDatabaseSizeBytes(databasePath: string | null | undefined) {
  if (!databasePath) {
    return null;
  }

  try {
    const stats = statSync(databasePath);
    return stats.isFile() ? stats.size : null;
  } catch {
    return null;
  }
}

function buildStoreServerHealth(
  config: StoreRuntimeConfig,
  snapshot: StoreSyncSnapshot,
  role: StoreServerHealth["role"] = config.role
): StoreServerHealth {
  return {
    status: "ready",
    deploymentMode: config.deploymentMode,
    role,
    databaseProvider: config.databaseProvider,
    storeCode: snapshot.storeCode,
    storeName: snapshot.storeName,
    nodeCode: snapshot.nodeCode,
    terminalCode: snapshot.terminalCode,
    databasePath: snapshot.databasePath,
    databaseSizeBytes: getDatabaseSizeBytes(snapshot.databasePath),
    serviceStartedAt: runtimeStartedAt.toISOString(),
    uptimeSeconds: Math.max(0, Math.floor((Date.now() - runtimeStartedAt.getTime()) / 1000)),
    tokenRequired: Boolean(config.storeServerToken),
    connectedTerminals: snapshot.operationsMetrics.connectedTerminals,
    openShifts: snapshot.operationsMetrics.openShifts,
    upstreamQueued: snapshot.queueMetrics.upstreamQueued,
    downstreamQueued: snapshot.queueMetrics.downstreamQueued,
    deadLetter: snapshot.queueMetrics.deadLetter,
    generatedAt: new Date().toISOString()
  };
}

function shouldUseLocalStoreServerProcess(config: StoreRuntimeConfig) {
  return (
    config.role === "embedded" &&
    config.databaseProvider === "sqlite" &&
    config.shouldStartStoreServer
  );
}

function resolveLocalStoreServerUrl(config: StoreRuntimeConfig) {
  if (config.storeServerUrl) {
    return config.storeServerUrl.replace(/\/+$/, "");
  }

  const hostForUrl = config.storeServerHost === "0.0.0.0" ? "127.0.0.1" : config.storeServerHost;
  return `http://${hostForUrl}:${config.storeServerPort}`;
}

function resolveLocalStoreServerDatabasePath(config: StoreRuntimeConfig) {
  if (config.databaseProvider !== "sqlite") {
    return null;
  }

  if (config.databasePath) {
    return path.resolve(config.databasePath);
  }

  const userDataPath = config.userDataPath ?? app.getPath("userData");
  return path.join(path.resolve(userDataPath), "flash-erp-store", "flash-erp-store.sqlite");
}

function normalizeComparablePath(value: string) {
  return path.resolve(value).toLowerCase();
}

function assertLocalStoreServerDatabaseMatches(
  health: StoreServerHealth,
  config: StoreRuntimeConfig,
  serverUrl: string
) {
  const expectedDatabasePath = resolveLocalStoreServerDatabasePath(config);

  if (
    expectedDatabasePath &&
    health.databasePath &&
    normalizeComparablePath(health.databasePath) !== normalizeComparablePath(expectedDatabasePath)
  ) {
    throw new Error(
      `A store server is already running at ${serverUrl}, but it is using ${health.databasePath} instead of ${expectedDatabasePath}. Close the old store-server process and restart the desktop.`
    );
  }
}

let packagedSyncRuntimeRoot: string | null = null;

const packagedSyncRuntimeRequiredFiles = [
  path.join("dist-electron", "src", "main", "store-server-runtime.js"),
  path.join("dist-electron", "src", "main", "store-sync-worker-runtime.js"),
  path.join("dist-electron", "src", "main", "store-data-engine.js"),
  path.join("dist-electron", "src", "shared", "desktop-runtime.js"),
  path.join("node_modules", "@flash-erp", "domain", "package.json"),
  path.join("node_modules", "@flash-erp", "sync-core", "package.json"),
  path.join("node_modules", "bcryptjs", "package.json"),
  path.join("node_modules", "dotenv", "package.json"),
  path.join("node_modules", "mssql", "package.json"),
  path.join("node_modules", "pg", "package.json"),
  "package.json"
];

function assertInsideDirectory(parent: string, target: string) {
  const relative = path.relative(parent, target);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to use path outside ${parent}: ${target}`);
  }
}

function copyDirectoryRecursive(sourceDir: string, targetDir: string) {
  mkdirSync(targetDir, { recursive: true });

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      mkdirSync(path.dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
    }
  }
}

function findExistingPath(candidates: string[]) {
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function isPackagedSyncRuntimeComplete(runtimeRoot: string) {
  return packagedSyncRuntimeRequiredFiles.every((relativePath) =>
    existsSync(path.join(runtimeRoot, relativePath))
  );
}

function getPackagedSyncRuntimeStageRoot() {
  return path.join(app.getPath("userData"), "sync-runtime", app.getVersion());
}

function getPackagedSyncRuntimeSessionRoot(stageParent: string) {
  return path.join(
    stageParent,
    `${app.getVersion()}.session-${process.pid}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
  );
}

function removeDirectoryBestEffort(directoryPath: string) {
  try {
    rmSync(directoryPath, { recursive: true, force: true });
  } catch (error) {
    console.warn("Store Desktop could not remove stale sync runtime staging directory.", {
      directoryPath,
      error
    });
  }
}

function stagePackagedSyncRuntime(input: {
  runtimeRoot: string;
  sourceNodeModules: string;
  sourcePackageJson: string | null;
  sourceSrc: string;
}) {
  mkdirSync(input.runtimeRoot, { recursive: true });
  copyDirectoryRecursive(input.sourceSrc, path.join(input.runtimeRoot, "dist-electron", "src"));
  copyDirectoryRecursive(input.sourceNodeModules, path.join(input.runtimeRoot, "node_modules"));

  if (input.sourcePackageJson) {
    copyFileSync(input.sourcePackageJson, path.join(input.runtimeRoot, "package.json"));
  } else {
    writeFileSync(
      path.join(input.runtimeRoot, "package.json"),
      JSON.stringify({ name: "@flash-erp/store-desktop-sync-runtime", private: true, type: "module" }, null, 2),
      "utf8"
    );
  }
}

function ensurePackagedSyncRuntimeRoot() {
  if (!app.isPackaged) {
    return null;
  }

  if (packagedSyncRuntimeRoot && isPackagedSyncRuntimeComplete(packagedSyncRuntimeRoot)) {
    return packagedSyncRuntimeRoot;
  }

  const stagedRoot = getPackagedSyncRuntimeStageRoot();
  const stageParent = path.join(app.getPath("userData"), "sync-runtime");

  if (isPackagedSyncRuntimeComplete(stagedRoot)) {
    packagedSyncRuntimeRoot = stagedRoot;
    return stagedRoot;
  }

  assertInsideDirectory(stageParent, stagedRoot);
  mkdirSync(stageParent, { recursive: true });

  const packagedSourceRoot = process.resourcesPath;
  const sourceSrc = findExistingPath([
    path.join(packagedSourceRoot, "app.asar", "dist-electron", "src"),
    path.join(packagedSourceRoot, "sync-runtime", "dist-electron", "src"),
    path.join(packagedSourceRoot, "app.asar.unpacked", "sync-runtime", "dist-electron", "src"),
    path.join(packagedSourceRoot, "app.asar.unpacked", "dist-electron", "src")
  ]);
  const sourceNodeModules = findExistingPath([
    path.join(packagedSourceRoot, "sync-runtime", "node_modules"),
    path.join(packagedSourceRoot, "app.asar.unpacked", "sync-runtime", "node_modules"),
    path.join(packagedSourceRoot, "app.asar.unpacked", "node_modules")
  ]);
  const sourcePackageJson = findExistingPath([
    path.join(packagedSourceRoot, "sync-runtime", "package.json"),
    path.join(packagedSourceRoot, "app.asar", "package.json"),
    path.join(packagedSourceRoot, "app.asar.unpacked", "sync-runtime", "package.json"),
    path.join(packagedSourceRoot, "app.asar.unpacked", "package.json")
  ]);

  if (!sourceSrc) {
    throw new Error("Flash ERP could not find packaged sync source files to stage.");
  }

  if (!sourceNodeModules) {
    throw new Error("Flash ERP could not find packaged sync runtime dependencies to stage.");
  }

  const sessionRoot = getPackagedSyncRuntimeSessionRoot(stageParent);
  assertInsideDirectory(stageParent, sessionRoot);
  stagePackagedSyncRuntime({
    runtimeRoot: sessionRoot,
    sourceNodeModules,
    sourcePackageJson,
    sourceSrc
  });

  if (!isPackagedSyncRuntimeComplete(sessionRoot)) {
    throw new Error(`Flash ERP staged sync runtime is incomplete at ${sessionRoot}.`);
  }

  let runtimeRoot = sessionRoot;

  if (!existsSync(stagedRoot)) {
    try {
      renameSync(sessionRoot, stagedRoot);
      runtimeRoot = stagedRoot;
    } catch (error) {
      console.warn("Store Desktop could not promote staged sync runtime; using session runtime.", {
        runtimeRoot: sessionRoot,
        stagedRoot,
        error
      });
    }
  } else if (isPackagedSyncRuntimeComplete(stagedRoot)) {
    runtimeRoot = stagedRoot;
    removeDirectoryBestEffort(sessionRoot);
  } else {
    console.warn("Store Desktop packaged sync runtime is incomplete or locked; using session runtime.", {
      runtimeRoot: sessionRoot,
      stagedRoot
    });
  }

  packagedSyncRuntimeRoot = runtimeRoot;
  console.info("Store Desktop staged packaged sync runtime.", {
    runtimeRoot,
    sourceSrc,
    sourceNodeModules
  });

  return runtimeRoot;
}

function resolvePackagedNodeRuntimeEntryPath(fileNames: string | string[]) {
  const names = Array.isArray(fileNames) ? fileNames : [fileNames];
  const stagedRuntimeRoot = ensurePackagedSyncRuntimeRoot();
  const roots = [
    stagedRuntimeRoot ? path.join(stagedRuntimeRoot, "dist-electron", "src", "main") : null,
    path.join(process.resourcesPath, "sync-runtime", "dist-electron", "src", "main"),
    path.join(process.resourcesPath, "app.asar.unpacked", "sync-runtime", "dist-electron", "src", "main"),
    path.join(process.resourcesPath, "app.asar.unpacked", "dist-electron", "src", "main")
  ].filter((root): root is string => Boolean(root));
  const candidates = roots.flatMap((root) => names.map((name) => path.join(root, name)));

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function resolveStoreServerEntryPath() {
  if (app.isPackaged) {
    return resolvePackagedNodeRuntimeEntryPath(["store-server-runtime.js", "store-server-entry.js"]);
  }

  const candidates = [
    path.resolve(__dirname, "..", "src", "main", "store-server-entry.js"),
    path.resolve(__dirname, "..", "..", "dist-electron", "src", "main", "store-server-entry.js"),
    path.resolve(process.cwd(), "dist-electron", "src", "main", "store-server-entry.js"),
    path.resolve(
      process.cwd(),
      "apps",
      "store-desktop",
      "dist-electron",
      "src",
      "main",
      "store-server-entry.js"
    )
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function resolveStoreSyncWorkerEntryPath() {
  if (app.isPackaged) {
    return resolvePackagedNodeRuntimeEntryPath([
      "store-sync-worker-runtime.js",
      "store-sync-worker-entry.js",
      "store-server-runtime.js",
      "store-server-entry.js"
    ]);
  }

  const candidates = [
    path.resolve(__dirname, "..", "src", "main", "store-sync-worker-entry.js"),
    path.resolve(__dirname, "..", "..", "dist-electron", "src", "main", "store-sync-worker-entry.js"),
    path.resolve(process.cwd(), "dist-electron", "src", "main", "store-sync-worker-entry.js"),
    path.resolve(
      process.cwd(),
      "apps",
      "store-desktop",
      "dist-electron",
      "src",
      "main",
      "store-sync-worker-entry.js"
    )
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function resolveSyncNodeRuntimePath() {
  const configured = process.env.FLASH_ERP_DESKTOP_SYNC_NODE_PATH?.trim();
  const executableName = process.platform === "win32" ? "node.exe" : "node";
  const candidates = [
    configured ? path.resolve(configured) : null,
    app.isPackaged ? path.join(process.resourcesPath, "sync-node", executableName) : null,
    app.isPackaged
      ? path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "node", "bin", executableName)
      : null,
    app.isPackaged
      ? path.join(process.resourcesPath, "sync-runtime", "node_modules", "node", "bin", executableName)
      : null,
    app.isPackaged
      ? path.join(process.resourcesPath, "app.asar.unpacked", "sync-runtime", "node_modules", "node", "bin", executableName)
      : null,
    path.resolve(process.cwd(), "node_modules", "node", "bin", executableName),
    path.resolve(process.cwd(), "..", "..", "node_modules", "node", "bin", executableName),
    path.resolve(__dirname, "..", "..", "..", "..", "node_modules", "node", "bin", executableName)
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function resolveStoreServerProcessCwd() {
  const stagedSyncRuntimeRoot = app.isPackaged ? ensurePackagedSyncRuntimeRoot() : null;
  const packagedSyncRuntimeRoot = app.isPackaged
    ? path.join(process.resourcesPath, "sync-runtime")
    : null;
  const packagedUnpackedRoot = app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked")
    : null;
  const candidates = [
    stagedSyncRuntimeRoot,
    packagedSyncRuntimeRoot,
    packagedUnpackedRoot,
    path.resolve(__dirname, "..", ".."),
    path.resolve(process.cwd(), "apps", "store-desktop"),
    process.cwd()
  ].filter((candidate): candidate is string => Boolean(candidate));

  return (
    candidates.find((candidate) => existsSync(path.join(candidate, "package.json"))) ??
    candidates.find((candidate) => existsSync(candidate)) ??
    process.cwd()
  );
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createDetachedSyncTimeoutError(timeoutMs: number) {
  const error = new Error(
    `Flash ERP sync did not finish within ${Math.round(timeoutMs / 1000)} seconds. The desktop released the sync request and restarted the local sync service so the POS can stay usable.`
  );
  error.name = "DetachedSyncTimeoutError";
  return error;
}

function isDetachedSyncTimeoutError(error: unknown) {
  return error instanceof Error && error.name === "DetachedSyncTimeoutError";
}

function withDetachedSyncWatchdog<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutHandle: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(createDetachedSyncTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  });
}

function stopStoreServerProcess() {
  const child = storeServerProcess;
  storeServerProcess = null;
  storeServerProcessUrl = null;

  if (!child || child.killed || child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
}

async function stopStoreServerProcessForRestart() {
  const child = storeServerProcess;
  storeServerProcess = null;
  storeServerProcessUrl = null;

  if (!child || child.exitCode !== null) {
    return;
  }

  let hasExited = false;
  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => {
      hasExited = true;
      resolve();
    });
  });

  child.kill("SIGTERM");
  await Promise.race([exited, wait(1500)]);

  if (!hasExited) {
    console.warn("Store Desktop local store server did not exit after SIGTERM; forcing restart.", {
      pid: child.pid ?? null
    });
    child.kill("SIGKILL");
    await Promise.race([exited, wait(1000)]);
  }
}

function attachStoreServerProcessLogs(child: ChildProcess) {
  const writeChildLogChunk = (
    chunk: Buffer | string,
    write: (message: string) => void
  ) => {
    const lines = String(chunk)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `[store-server] ${line}`);

    if (lines.length > 0) {
      write(lines.join("\n"));
    }
  };

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => writeChildLogChunk(chunk, (message) => console.info(message)));
  child.stderr?.on("data", (chunk) => writeChildLogChunk(chunk, (message) => console.error(message)));
}

async function waitForStoreServerReady(
  url: string,
  config: StoreRuntimeConfig,
  child?: ChildProcess | null
) {
  const timeoutMs = Math.max(60_000, Math.min(120_000, config.storeServerTimeoutMs * 6));
  const requestTimeoutMs = Math.max(500, Math.min(2500, config.storeServerTimeoutMs));
  const startedAt = Date.now();
  let lastError: string | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    if (child && child.exitCode !== null) {
      throw new Error(
        `Flash ERP store server process exited before it became ready (exit code ${child?.exitCode ?? "unknown"}).`
      );
    }

    try {
      return await fetchStoreServerHealth(url, {
        serverToken: config.storeServerToken,
        terminalCode: config.terminalContext.terminalCode,
        clientName: config.terminalContext.clientName,
        timeoutMs: requestTimeoutMs
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await wait(250);
    }
  }

  throw new Error(
    `Flash ERP store server did not become ready at ${url} within ${timeoutMs} ms.${
      lastError ? ` Last health check error: ${lastError}` : ""
    }`
  );
}

async function ensureLocalStoreServerProcess(config: StoreRuntimeConfig) {
  const serverUrl = resolveLocalStoreServerUrl(config);

  try {
    const health = await fetchStoreServerHealth(serverUrl, {
      serverToken: config.storeServerToken,
      terminalCode: config.terminalContext.terminalCode,
      clientName: config.terminalContext.clientName,
      timeoutMs: Math.max(500, Math.min(2000, config.storeServerTimeoutMs))
    });
    assertLocalStoreServerDatabaseMatches(health, config, serverUrl);
    storeServerProcessUrl = serverUrl;
    logDesktopLaunchStage("local store server already ready", {
      serverUrl,
      databaseProvider: config.databaseProvider
    });
    return serverUrl;
  } catch {
    // Start our own process when nothing healthy is already listening there.
  }

  const entryPath = resolveStoreServerEntryPath();

  if (!existsSync(entryPath)) {
    throw new Error(`Flash ERP could not find the store server entry at ${entryPath}.`);
  }

  stopStoreServerProcess();

  const nodeRuntimePath = resolveSyncNodeRuntimePath();

  if (!nodeRuntimePath) {
    throw new Error(
      "Flash ERP could not find the Node 24 store-server runtime. Run npm install or set FLASH_ERP_DESKTOP_SYNC_NODE_PATH to a Node runtime that supports node:sqlite."
    );
  }

  const child = spawn(nodeRuntimePath, [entryPath], {
    cwd: resolveStoreServerProcessCwd(),
    env: {
      ...process.env,
      FLASH_ERP_STORE_DEPLOYMENT_MODE: config.deploymentMode,
      FLASH_ERP_STORE_RUNTIME_ROLE: "store-server",
      FLASH_ERP_STORE_DATABASE_PROVIDER: config.databaseProvider,
      FLASH_ERP_STORE_DB_PATH: config.databasePath ?? "",
      FLASH_ERP_STORE_NODE_CODE: config.nodeCode ?? "",
      FLASH_ERP_STORE_TERMINAL_CODE: config.terminalContext.terminalCode ?? "",
      FLASH_ERP_STORE_TERMINAL_NAME: config.terminalContext.clientName ?? "",
      FLASH_ERP_STORE_SERVER_URL: config.storeServerUrl ?? "",
      FLASH_ERP_STORE_SERVER_TOKEN: config.storeServerToken ?? "",
      FLASH_ERP_STORE_SERVER_ENABLED: config.shouldStartStoreServer ? "1" : "0",
      FLASH_ERP_STORE_SERVER_HOST: config.storeServerHost,
      FLASH_ERP_STORE_SERVER_PORT: String(config.storeServerPort),
      FLASH_ERP_STORE_SERVER_TIMEOUT_MS: String(config.storeServerTimeoutMs),
      FLASH_ERP_STORE_SYNC_BASE_URL: config.syncBaseUrl ?? "",
      FLASH_ERP_STORE_SYNC_PULL_LIMIT: String(enterpriseSyncPullLimit),
      FLASH_ERP_ENTERPRISE_SYNC_HTTP_TIMEOUT_MS: String(enterpriseSyncHttpTimeoutMs),
      FLASH_ERP_DESKTOP_SYNC_WORKER_TIMEOUT_MS: String(isolatedSyncWorkerTimeoutMs),
      FLASH_ERP_STORE_USER_DATA_PATH: config.userDataPath ?? app.getPath("userData")
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  storeServerProcess = child;
  storeServerProcessUrl = serverUrl;
  attachStoreServerProcessLogs(child);
  logDesktopLaunchStage("local store server process started", {
    serverUrl,
    entryPath,
    nodeRuntimePath,
    cwd: resolveStoreServerProcessCwd(),
    pid: child.pid ?? null
  });

  child.once("error", (error) => {
    console.error("Flash ERP store server process failed to start.", error);
  });
  child.once("exit", (code, signal) => {
    logDesktopLaunchStage("local store server process exited", {
      code,
      signal
    });

    if (storeServerProcess === child) {
      storeServerProcess = null;
      storeServerProcessUrl = null;
    }
  });

  const health = await waitForStoreServerReady(serverUrl, config, child);
  assertLocalStoreServerDatabaseMatches(health, config, serverUrl);
  return serverUrl;
}

function isStoreServerReachabilityError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return /timed out|could not reach|ECONNREFUSED|ECONNRESET|socket hang up|unreachable/i.test(
    message
  );
}

function isStoreServerTimeoutError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return /timed out|AbortError/i.test(message);
}

function createLocalStoreServerProcessClient(
  config: StoreRuntimeConfig,
  serverUrl: string
): StoreServiceClient {
  const resolveRequestTimeoutMs = (method: StoreServiceMethod) =>
    method === "runSyncCycle"
      ? localSyncCycleRequestTimeoutMs
      : config.storeServerTimeoutMs;
  const createClient = (url: string, requestTimeoutMs: number) =>
    createHttpStoreServiceClient({
      serverUrl: url,
      terminalContext: config.terminalContext,
      serverToken: config.storeServerToken,
      requestTimeoutMs
    });

  return {
    async call(method, args = []) {
      const requestTimeoutMs = resolveRequestTimeoutMs(method);
      const client = createClient(serverUrl, requestTimeoutMs);

      try {
        return await client.call(method, args);
      } catch (error) {
        if (!isStoreServerReachabilityError(error)) {
          throw error;
        }

        await restartLocalStoreServerProcess(`recover-after-${method}`);

        if (method === "runSyncCycle" && isStoreServerTimeoutError(error)) {
          throw error;
        }

        const retryUrl = storeServerProcessUrl ?? resolveLocalStoreServerUrl(config);
        console.info("Store Desktop local store server request retrying after recovery.", {
          method,
          retryUrl,
          originalError: error instanceof Error ? error.message : String(error)
        });
        return createClient(retryUrl, requestTimeoutMs).call(method, args);
      }
    }
  };
}

async function restartLocalStoreServerProcess(reason: string) {
  const config = storeRuntimeConfig;

  if (!config || !shouldUseLocalStoreServerProcess(config)) {
    return;
  }

  if (storeServerProcessRestartInFlight) {
    await storeServerProcessRestartInFlight;
    return;
  }

  storeServerProcessRestartInFlight = (async () => {
    logDesktopLaunchStage("local store server process restart requested", {
      reason,
      serverUrl: storeServerProcessUrl ?? resolveLocalStoreServerUrl(config)
    });
    await stopStoreServerProcessForRestart();
    const serverUrl = await ensureLocalStoreServerProcess(config);
    storeClient = createLocalStoreServerProcessClient(config, serverUrl);
    logDesktopLaunchStage("local store server process restart complete", {
      reason,
      serverUrl
    });
  })().finally(() => {
    storeServerProcessRestartInFlight = null;
  });

  await storeServerProcessRestartInFlight;
}

async function getStoreRuntimeStatus(): Promise<StoreRuntimeStatus> {
  const config = storeRuntimeConfig ?? resolveStoreRuntimeConfig();
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();
  const usesLocalStoreServerProcess = shouldUseLocalStoreServerProcess(config);
  if (usesLocalStoreServerProcess && storeServerProcessRestartInFlight) {
    logDesktopLaunchStage("runtime status waiting for local store server restart", {
      role: config.role,
      databaseProvider: config.databaseProvider
    });
    await storeServerProcessRestartInFlight.catch(() => undefined);
  }

  const localServerUrl = storeServerHandle?.url ?? storeServerProcessUrl ?? null;
  const statusStoreServerUrl =
    config.role === "terminal-client"
      ? config.storeServerUrl
      : usesLocalStoreServerProcess
      ? localServerUrl ?? resolveLocalStoreServerUrl(config)
      : null;

  logDesktopLaunchStage("runtime status check started", {
    role: config.role,
    databaseProvider: config.databaseProvider
  });

  if (!storeClient) {
    logDesktopLaunchStage("runtime status unavailable", {
      elapsedMs: Date.now() - startedAt,
      message: startupErrorMessage ?? "Store services are not available yet."
    });
    return {
      deploymentMode: config.deploymentMode,
      role: config.role,
      databaseProvider: config.databaseProvider,
      terminalCode: config.terminalContext.terminalCode ?? null,
      storeServerUrl: config.storeServerUrl,
      localServerUrl,
      syncBaseUrl: config.syncBaseUrl,
      connected: false,
      message: startupErrorMessage ?? "Store services are not available yet.",
      serverHealth: null,
      requestTimeoutMs: config.storeServerTimeoutMs,
      checkedAt
    };
  }

  if (config.role === "terminal-client" || usesLocalStoreServerProcess) {
    if (!statusStoreServerUrl) {
      logDesktopLaunchStage("runtime status missing store server url", {
        elapsedMs: Date.now() - startedAt
      });
      return {
        deploymentMode: config.deploymentMode,
        role: config.role,
        databaseProvider: config.databaseProvider,
        terminalCode: config.terminalContext.terminalCode ?? null,
        storeServerUrl: null,
        localServerUrl,
        syncBaseUrl: config.syncBaseUrl,
        connected: false,
        message:
          config.role === "terminal-client"
            ? "Terminal-client mode needs FLASH_ERP_STORE_SERVER_URL."
            : "Embedded SQLite store-server mode needs a local store server URL.",
        serverHealth: null,
        requestTimeoutMs: config.storeServerTimeoutMs,
        checkedAt
      };
    }

    try {
      const serverHealth = await fetchStoreServerHealth(statusStoreServerUrl, {
        serverToken: config.storeServerToken,
        terminalCode: config.terminalContext.terminalCode,
        clientName: config.terminalContext.clientName,
        timeoutMs: config.storeServerTimeoutMs
      });
      logDesktopLaunchStage("runtime status store server connected", {
        elapsedMs: Date.now() - startedAt
      });

      return {
        deploymentMode: config.deploymentMode,
        role: config.role,
        databaseProvider: config.databaseProvider,
        terminalCode: config.terminalContext.terminalCode ?? null,
        storeServerUrl: config.storeServerUrl ?? statusStoreServerUrl,
        localServerUrl: usesLocalStoreServerProcess ? statusStoreServerUrl : localServerUrl,
        syncBaseUrl: config.syncBaseUrl,
        connected: true,
        message: usesLocalStoreServerProcess
          ? `Local store server process is running at ${statusStoreServerUrl}.`
          : `Connected to store server ${statusStoreServerUrl}.`,
        serverHealth,
        requestTimeoutMs: config.storeServerTimeoutMs,
        checkedAt
      };
    } catch (error) {
      logDesktopLaunchStage("runtime status store server unreachable", {
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        deploymentMode: config.deploymentMode,
        role: config.role,
        databaseProvider: config.databaseProvider,
        terminalCode: config.terminalContext.terminalCode ?? null,
        storeServerUrl: config.storeServerUrl ?? statusStoreServerUrl,
        localServerUrl: usesLocalStoreServerProcess ? statusStoreServerUrl : localServerUrl,
        syncBaseUrl: config.syncBaseUrl,
        connected: false,
        message:
          error instanceof Error
            ? `Store server is unreachable: ${error.message}`
            : "Store server is unreachable.",
        serverHealth: null,
        requestTimeoutMs: config.storeServerTimeoutMs,
        checkedAt
      };
    }
  }

  logDesktopLaunchStage("runtime status local service ready", {
    elapsedMs: Date.now() - startedAt,
    role: config.role,
    databaseProvider: config.databaseProvider
  });

  return {
    deploymentMode: config.deploymentMode,
    role: config.role,
    databaseProvider: config.databaseProvider,
    terminalCode: config.terminalContext.terminalCode ?? null,
    storeServerUrl: config.storeServerUrl,
    localServerUrl,
    syncBaseUrl: config.syncBaseUrl,
    connected: true,
    message:
      config.role === "store-server"
        ? `Store server is running at ${localServerUrl ?? "local service"}.`
        : "Local desktop store service is running locally.",
    serverHealth: null,
    requestTimeoutMs: config.storeServerTimeoutMs,
    checkedAt
  };
}

function clearRendererReadyTimer() {
  if (rendererReadyTimer) {
    clearTimeout(rendererReadyTimer);
    rendererReadyTimer = null;
  }
}

function loadDesktopRenderer(window: BrowserWindow) {
  rendererReadyAt = null;
  lastRendererHeartbeatAt = null;
  clearRendererReadyTimer();

  if (!shouldUseBuiltRenderer) {
    logDesktopLaunchStage("loading dev renderer", {
      url: "http://127.0.0.1:5174"
    });
    return window.loadURL("http://127.0.0.1:5174");
  }

  const rendererPath = resolveBuiltRendererEntryPath();
  logDesktopLaunchStage("loading built renderer", { rendererPath });
  return window.loadFile(rendererPath);
}

function scheduleRendererReadyRecovery(window: BrowserWindow, reason: string) {
  clearRendererReadyTimer();
  logDesktopLaunchStage("renderer ready watchdog scheduled", {
    reason,
    timeoutMs: rendererReadyTimeoutMs
  });
  rendererReadyTimer = setTimeout(() => {
    if (window.isDestroyed() || rendererReadyAt) {
      return;
    }

    lastRendererReadyTimeoutAt = new Date();
    rendererReadyTimeoutCount += 1;
    void recoverDesktopWindow(`${reason}: renderer did not report ready`);
  }, rendererReadyTimeoutMs);
}

function markRendererReady(window: BrowserWindow) {
  if (window.isDestroyed()) {
    return;
  }

  const now = new Date();
  rendererReadyAt = now;
  lastRendererHeartbeatAt = now;
  clearRendererReadyTimer();
  logDesktopLaunchStage("renderer reported ready", {
    visible: window.isVisible(),
    minimized: window.isMinimized()
  });

  if (!window.isVisible()) {
    window.show();
  }

  if (window.isMinimized()) {
    window.restore();
  }

  window.focus();
}

function startRendererWatchdog() {
  if (rendererWatchdogTimer) {
    clearInterval(rendererWatchdogTimer);
  }

  rendererWatchdogTimer = setInterval(() => {
    const window = mainWindow;
    lastRendererWatchdogCheckAt = new Date();

    if (!window || window.isDestroyed() || !rendererReadyAt || !lastRendererHeartbeatAt) {
      return;
    }

    const heartbeatAgeMs = Date.now() - lastRendererHeartbeatAt.getTime();

    if (heartbeatAgeMs >= rendererHeartbeatWarningMs) {
      staleRendererHeartbeatCount += 1;
      console.warn("Store Desktop renderer heartbeat is stale.", {
        heartbeatAgeMs,
        lastRendererHeartbeatAt: lastRendererHeartbeatAt.toISOString()
      });
    }

    if (heartbeatAgeMs >= rendererHeartbeatRecoveryMs) {
      void recoverDesktopWindow("renderer-heartbeat-stale");
    }
  }, 15_000);
}

async function recoverDesktopWindow(reason = "operator-requested"): Promise<StoreDesktopWindowStatus> {
  const window = mainWindow;
  const now = new Date();
  const msSinceLastRecovery = lastDesktopWindowRecoveryAt
    ? now.getTime() - lastDesktopWindowRecoveryAt.getTime()
    : Number.POSITIVE_INFINITY;

  if (
    desktopWindowRecoveryInFlight ||
    (reason !== "operator-runtime-panel" && msSinceLastRecovery < rendererRecoveryCooldownMs)
  ) {
    console.warn("Flash ERP skipped duplicate desktop window recovery.", {
      reason,
      recoveryInFlight: desktopWindowRecoveryInFlight,
      msSinceLastRecovery
    });
    return getDesktopWindowStatus();
  }

  lastDesktopWindowRecoveryAt = now;
  lastDesktopWindowRecoveryReason = reason;
  desktopWindowRecoveryCount += 1;
  desktopWindowRecoveryInFlight = true;

  try {
    if (!window || window.isDestroyed()) {
      createWindow();
      return getDesktopWindowStatus();
    }

    console.warn("Flash ERP is recovering the desktop window.", {
      reason,
      recoveryCount: desktopWindowRecoveryCount
    });
    clearRendererReadyTimer();
    if (unresponsiveRecoveryTimer) {
      clearTimeout(unresponsiveRecoveryTimer);
      unresponsiveRecoveryTimer = null;
    }

    if (window.isMinimized()) {
      window.restore();
    }

    window.show();
    window.focus();
    await loadDesktopRenderer(window).catch((error) => {
      desktopWindowLoadFailureCount += 1;
      lastDesktopWindowLoadFailure =
        error instanceof Error ? error.message : "Renderer recovery load failed.";
      console.error("Flash ERP desktop window recovery load failed.", error);
    });

    return getDesktopWindowStatus();
  } finally {
    desktopWindowRecoveryInFlight = false;
  }
}

function getDesktopWindowStatus(): StoreDesktopWindowStatus {
  const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const heartbeatAgeMs = lastRendererHeartbeatAt
    ? Math.max(0, Date.now() - lastRendererHeartbeatAt.getTime())
    : null;
  const watchdogState: StoreDesktopWindowStatus["watchdogState"] = desktopWindowRecoveryInFlight
    ? "recovering"
    : !window
      ? "unavailable"
      : !rendererReadyAt
        ? "waiting"
        : heartbeatAgeMs !== null && heartbeatAgeMs >= rendererHeartbeatWarningMs
          ? "stale"
          : "healthy";

  return {
    ready: Boolean(rendererReadyAt),
    watchdogState,
    visible: window?.isVisible() ?? false,
    focused: window?.isFocused() ?? false,
    minimized: window?.isMinimized() ?? false,
    maximized: window?.isMaximized() ?? false,
    fullScreen: window?.isFullScreen() ?? false,
    bounds: window?.getBounds() ?? null,
    rendererReadyAt: rendererReadyAt?.toISOString() ?? null,
    lastRendererHeartbeatAt: lastRendererHeartbeatAt?.toISOString() ?? null,
    heartbeatAgeMs,
    lastWatchdogCheckAt: lastRendererWatchdogCheckAt?.toISOString() ?? null,
    lastReadyTimeoutAt: lastRendererReadyTimeoutAt?.toISOString() ?? null,
    readyTimeoutCount: rendererReadyTimeoutCount,
    staleHeartbeatCount: staleRendererHeartbeatCount,
    lastRecoveryAt: lastDesktopWindowRecoveryAt?.toISOString() ?? null,
    lastRecoveryReason: lastDesktopWindowRecoveryReason,
    recoveryInFlight: desktopWindowRecoveryInFlight,
    recoveryCount: desktopWindowRecoveryCount,
    loadFailureCount: desktopWindowLoadFailureCount,
    lastLoadFailure: lastDesktopWindowLoadFailure,
    supportLogPath: getDesktopSupportLogPath(),
    checkedAt: new Date().toISOString()
  };
}

for (const candidate of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", "..", ".env"),
  path.resolve(__dirname, "..", "..", "..", ".env")
]) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false });
    break;
  }
}

function getDesktopConnectionConfigPath() {
  return path.join(app.getPath("userData"), "store-runtime-config.json");
}

function readDesktopConnectionConfigFile(): DesktopConnectionConfigFile {
  const configPath = getDesktopConnectionConfigPath();

  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([key, value]) =>
          desktopConnectionConfigEnvKeys.includes(key as DesktopConnectionConfigEnvKey) &&
          typeof value === "string"
        )
    ) as DesktopConnectionConfigFile;
  } catch (error) {
    console.error("Flash ERP could not read desktop connection config.", error);
    return {};
  }
}

function applyDesktopConnectionConfigFile() {
  const configFile = readDesktopConnectionConfigFile();
  const appliedKeys: string[] = [];

  for (const key of desktopConnectionConfigEnvKeys) {
    const value = configFile[key]?.trim();

    if (value) {
      process.env[key] = value;
      appliedKeys.push(key);
    } else if (Object.prototype.hasOwnProperty.call(configFile, key)) {
      delete process.env[key];
      appliedKeys.push(key);
    }
  }

  if (appliedKeys.length > 0) {
    console.info("Store Desktop connection config file applied.", {
      configPath: getDesktopConnectionConfigPath(),
      appliedKeys,
      runtimeRole: process.env.FLASH_ERP_STORE_RUNTIME_ROLE ?? null,
      databaseProvider: process.env.FLASH_ERP_STORE_DATABASE_PROVIDER ?? null,
      storeServerEnabled: process.env.FLASH_ERP_STORE_SERVER_ENABLED ?? null
    });
  }
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDesktopHttpUrl(value: string, label: string) {
  const trimmed = value.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("invalid protocol");
    }

    return parsed.toString().replace(/\/+$/, "");
  } catch {
    throw new Error(`${label} must be a valid URL that starts with http:// or https://.`);
  }
}

function resolveDesktopEnterpriseSyncBaseUrl(inputSyncBaseUrl: string) {
  const existingConfig = readDesktopConnectionConfigFile();
  const candidates = [
    inputSyncBaseUrl,
    existingConfig.FLASH_ERP_STORE_SYNC_BASE_URL,
    process.env.FLASH_ERP_STORE_SYNC_BASE_URL,
    process.env.FLASH_ERP_ENTERPRISE_APP_URL
  ];

  for (const candidate of candidates) {
    const normalized = normalizeDesktopHttpUrl(candidate ?? "", "HQ sync URL");

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function buildDesktopConnectionConfigResult(
  restartRequired = false
): StoreDesktopConnectionConfigResult {
  const config = resolveStoreRuntimeConfig();

  return {
    config: {
      deploymentMode: config.deploymentMode,
      runtimeRole: config.role,
      databaseProvider: config.databaseProvider,
      nodeCode: config.nodeCode ?? "",
      terminalCode: config.terminalContext.terminalCode ?? "",
      terminalName: config.terminalContext.clientName ?? "",
      storeServerUrl: config.storeServerUrl ?? "",
      storeServerToken: config.storeServerToken ?? "",
      storeServerHost: config.storeServerHost,
      storeServerPort: config.storeServerPort,
      storeServerTimeoutMs: config.storeServerTimeoutMs,
      storeServerEnabled: config.shouldStartStoreServer,
      databaseUrl: process.env.FLASH_ERP_STORE_DATABASE_URL?.trim() ?? "",
      databasePath: config.databasePath ?? "",
      userDataPath: config.userDataPath ?? "",
      syncBaseUrl: config.syncBaseUrl ?? "",
      updateFeedUrl: getDesktopUpdateFeedUrl() ?? ""
    },
    configPath: getDesktopConnectionConfigPath(),
    supportLogPath: getDesktopSupportLogPath(),
    restartRequired
  };
}

function normalizeDesktopConnectionConfigInput(
  input: StoreDesktopConnectionConfig
): DesktopConnectionConfigFile {
  const deploymentMode =
    input.deploymentMode === "STANDALONE" ? "STANDALONE" : "ENTERPRISE_MANAGED";
  const runtimeRole =
    input.runtimeRole === "store-server" || input.runtimeRole === "terminal-client"
      ? input.runtimeRole
      : "embedded";
  const databaseProvider =
    input.databaseProvider === "mssql"
      ? "mssql"
      : input.databaseProvider === "postgres"
        ? "postgres"
        : "sqlite";
  const syncBaseUrl = resolveDesktopEnterpriseSyncBaseUrl(input.syncBaseUrl);
  const updateFeedUrl = normalizeDesktopHttpUrl(
    input.updateFeedUrl,
    "Desktop update feed URL"
  );

  if (!updateFeedUrl) {
    throw new Error("Enter the desktop update feed URL before saving the desktop setup.");
  }

  if (deploymentMode === "ENTERPRISE_MANAGED" && !syncBaseUrl) {
    throw new Error(
      "HQ Managed mode needs an HQ sync URL. Enter the HQ application URL, save, and restart the desktop before running upload/download sync."
    );
  }

  const nodeCode = input.nodeCode.trim();

  if (deploymentMode === "ENTERPRISE_MANAGED" && !nodeCode) {
    throw new Error(
      "HQ Managed mode needs a store node code. Register the desktop node in HQ, enter the same node code here, save, and restart before syncing sign-in data."
    );
  }

  const envFile: DesktopConnectionConfigFile = {
    FLASH_ERP_STORE_DEPLOYMENT_MODE: deploymentMode,
    FLASH_ERP_STORE_RUNTIME_ROLE: runtimeRole,
    FLASH_ERP_STORE_DATABASE_PROVIDER: databaseProvider,
    FLASH_ERP_STORE_DATABASE_URL: databaseProvider === "sqlite" ? "" : input.databaseUrl.trim(),
    FLASH_ERP_STORE_DB_PATH: databaseProvider === "sqlite" ? input.databasePath.trim() : "",
    FLASH_ERP_STORE_USER_DATA_PATH: databaseProvider === "sqlite" ? input.userDataPath.trim() : "",
    FLASH_ERP_STORE_NODE_CODE: nodeCode,
    FLASH_ERP_STORE_TERMINAL_CODE: input.terminalCode.trim(),
    FLASH_ERP_STORE_TERMINAL_NAME: input.terminalName.trim(),
    FLASH_ERP_STORE_SERVER_URL: input.storeServerUrl.trim(),
    FLASH_ERP_STORE_SERVER_TOKEN: input.storeServerToken.trim(),
    FLASH_ERP_STORE_SERVER_ENABLED: input.storeServerEnabled ? "1" : "0",
    FLASH_ERP_STORE_SERVER_HOST: input.storeServerHost.trim(),
    FLASH_ERP_STORE_SERVER_PORT: String(readPositiveInteger(String(input.storeServerPort), 4747)),
    FLASH_ERP_STORE_SERVER_TIMEOUT_MS: String(
      readPositiveInteger(String(input.storeServerTimeoutMs), 8000)
    ),
    FLASH_ERP_STORE_SYNC_BASE_URL: syncBaseUrl,
    FLASH_ERP_DESKTOP_UPDATE_URL: updateFeedUrl
  };

  return envFile;
}

function saveDesktopConnectionConfig(input: StoreDesktopConnectionConfig) {
  const configPath = getDesktopConnectionConfigPath();
  const envFile = normalizeDesktopConnectionConfigInput(input);

  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(envFile, null, 2)}\n`, "utf8");
  applyDesktopConnectionConfigFile();

  return {
    ...buildDesktopConnectionConfigResult(true),
    message: "Flash ERP saved the desktop connection settings. Restart the desktop to use them."
  };
}

function resolveStorePostgresSchemaPath() {
  for (const candidate of [
    path.resolve(__dirname, "..", "..", "src", "main", "postgres", "store-postgres-schema.sql"),
    path.resolve(__dirname, "..", "src", "main", "postgres", "store-postgres-schema.sql"),
    path.resolve(process.cwd(), "apps", "store-desktop", "src", "main", "postgres", "store-postgres-schema.sql")
  ]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Flash ERP could not find the store PostgreSQL schema file.");
}

function resolveStoreMssqlSchemaPath() {
  for (const candidate of [
    path.resolve(__dirname, "..", "..", "src", "main", "mssql", "store-mssql-schema.sql"),
    path.resolve(__dirname, "..", "src", "main", "mssql", "store-mssql-schema.sql"),
    path.resolve(process.cwd(), "apps", "store-desktop", "src", "main", "mssql", "store-mssql-schema.sql")
  ]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Flash ERP could not find the store SQL Server schema file.");
}

function resolveStoreSqliteDatabasePath(input: StoreDesktopConnectionConfig) {
  const explicitDatabasePath =
    input.databasePath.trim() || process.env.FLASH_ERP_STORE_DB_PATH?.trim() || "";

  if (explicitDatabasePath) {
    return path.resolve(explicitDatabasePath);
  }

  const userDataPath =
    input.userDataPath.trim() || process.env.FLASH_ERP_STORE_USER_DATA_PATH?.trim() || app.getPath("userData");

  return path.join(path.resolve(userDataPath), "flash-erp-store", "flash-erp-store.sqlite");
}

function removeStoreSqliteDatabaseFiles(databasePath: string) {
  for (const candidate of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (existsSync(candidate)) {
      rmSync(candidate, { force: true });
    }
  }
}

async function provisionStoreSqliteDatabase(input: StoreDesktopConnectionConfig) {
  const databasePath = resolveStoreSqliteDatabasePath(input);
  const isActiveLocalDatabase =
    localStoreService &&
    path.resolve(localStoreService.databasePath).toLowerCase() === path.resolve(databasePath).toLowerCase();

  if (isActiveLocalDatabase || storeServerProcess) {
    stopStoreServerProcess();
    await storeServerHandle?.close().catch(() => undefined);
    storeServerHandle = null;
    localStoreService?.close();
    localStoreService = null;
    storeServiceRuntime = null;
    storeClient = null;
    startupErrorMessage =
      "Flash ERP provisioned a fresh SQLite store database. Restart the desktop to reopen store services.";
  }

  mkdirSync(path.dirname(databasePath), { recursive: true });
  removeStoreSqliteDatabaseFiles(databasePath);

  const db = new DatabaseSync(databasePath);

  try {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(localStoreSchemaSql);
    db.exec("CREATE INDEX IF NOT EXISTS idx_sync_outbox_retry ON sync_outbox(status, next_retry_at, created_at)");
    const now = new Date().toISOString();
    const metadata = [
      ["deployment_mode", input.deploymentMode],
      ["terminal_code", input.terminalCode.trim()],
      ["node_code", input.nodeCode.trim()],
      ["initialized_at", now],
      ["seed_version", "flash-erp-store-v5"],
      ["provisioned_at", now]
    ].filter(([, value]) => String(value).trim() !== "");
    const statement = db.prepare(
      "INSERT INTO app_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    );

    for (const [key, value] of metadata) {
      statement.run(key, value);
    }
  } finally {
    db.close();
  }

  return {
    message:
      "Flash ERP provisioned a fresh SQLite store database. Restart the desktop, then continue with sync sign-in for HQ managed mode or standalone setup for standalone mode.",
    schemaReady: true
  };
}

function quotePostgresIdentifier(value: string) {
  if (!value.trim()) {
    throw new Error("PostgreSQL store database name cannot be empty.");
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function readPostgresDatabaseName(connectionString: string) {
  const url = new URL(connectionString);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, "")).trim();

  if (!databaseName) {
    throw new Error("Enter a PostgreSQL store database name before provisioning.");
  }

  return databaseName;
}

async function ensurePostgresDatabaseExists(connectionString: string, timeoutMs: number) {
  const databaseName = readPostgresDatabaseName(connectionString);
  const maintenanceUrl = new URL(connectionString);

  maintenanceUrl.pathname = "/postgres";
  maintenanceUrl.searchParams.delete("schema");

  const pool = new Pool({
    connectionString: maintenanceUrl.toString(),
    connectionTimeoutMillis: Math.max(500, timeoutMs),
    idleTimeoutMillis: 1000,
    max: 1
  });

  try {
    const exists = await pool.query<{ value: number }>(
      "SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) THEN 1 ELSE 0 END AS value",
      [databaseName]
    );

    if (Number(exists.rows[0]?.value ?? 0) !== 1) {
      await pool.query(`CREATE DATABASE ${quotePostgresIdentifier(databaseName)}`);
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function buildStoreMssqlConnectionString(input: ReturnType<typeof parseStoreMssqlConnectionString>) {
  return [
    `Server=${input.server}`,
    `Database=${input.database}`,
    input.user ? `User Id=${input.user}` : "",
    input.password ? `Password=${input.password}` : "",
    `Encrypt=${input.encrypt}`,
    `TrustServerCertificate=${input.trustServerCertificate}`
  ]
    .filter(Boolean)
    .join(";");
}

function quoteStoreMssqlDatabaseName(databaseName: string) {
  if (!databaseName.trim()) {
    throw new Error("SQL Server store database name cannot be empty.");
  }

  return `[${databaseName.replace(/]/g, "]]")}]`;
}

async function ensureMssqlDatabaseExists(connectionString: string) {
  const parsed = parseStoreMssqlConnectionString(connectionString);

  if (!parsed.database) {
    throw new Error("Enter a SQL Server store database name before provisioning.");
  }

  const masterConnectionString = buildStoreMssqlConnectionString({
    ...parsed,
    database: "master"
  });
  const pool = new sql.ConnectionPool(masterConnectionString);

  try {
    await pool.connect();
    const exists = await pool
      .request()
      .input("databaseName", sql.NVarChar(128), parsed.database)
      .query("SELECT CASE WHEN DB_ID(@databaseName) IS NULL THEN 0 ELSE 1 END AS [value]");

    if (exists.recordset[0]?.value !== 1) {
      await pool.request().query(`CREATE DATABASE ${quoteStoreMssqlDatabaseName(parsed.database)}`);
    }
  } finally {
    await pool.close().catch(() => undefined);
  }
}

async function provisionStoreDatabase(input: StoreDesktopConnectionConfig) {
  if (input.databaseProvider === "sqlite") {
    return provisionStoreSqliteDatabase(input);
  }

  const databaseUrl = input.databaseUrl.trim() || process.env.FLASH_ERP_STORE_DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("Enter a store database URL before provisioning the store database.");
  }

  if (input.databaseProvider === "mssql") {
    await ensureMssqlDatabaseExists(databaseUrl);
    const pool = new sql.ConnectionPool(normalizeStoreMssqlConnectionString(databaseUrl));

    try {
      await pool.connect();
      await pool.request().batch(readFileSync(resolveStoreMssqlSchemaPath(), "utf8"));
      const result = await pool.request().query<{ schema_version: string | null }>(
        "SELECT TOP (1) [value] AS [schema_version] FROM [dbo].[store_node_metadata] WHERE [key] = N'schema_version'"
      );
      const schemaReady = result.recordset[0]?.schema_version === "flash-erp-store-mssql-v1";

      return {
        provider: "mssql",
        schemaReady,
        message: schemaReady
          ? "Flash ERP provisioned the SQL Server store schema."
          : "Flash ERP reached SQL Server, but the store schema version could not be confirmed."
      };
    } finally {
      await pool.close().catch(() => undefined);
    }
  }

  await ensurePostgresDatabaseExists(databaseUrl, Math.max(500, Number(input.storeServerTimeoutMs) || 8000));

  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: Math.max(500, Number(input.storeServerTimeoutMs) || 8000),
    idleTimeoutMillis: 1000,
    max: 1
  });

  try {
    await pool.query(readFileSync(resolveStorePostgresSchemaPath(), "utf8"));
    const result = await pool.query<{ schema_version: string | null }>(
      "SELECT value AS schema_version FROM store_node_metadata WHERE key = 'schema_version' LIMIT 1"
    );
    const schemaReady = result.rows[0]?.schema_version === "flash-erp-store-postgres-v1";

    return {
      message: schemaReady
        ? "Flash ERP provisioned the shared store PostgreSQL database."
        : "Flash ERP ran the store database schema, but the schema marker was not confirmed.",
      schemaReady
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function resolveBuiltRendererEntryPath() {
  for (const candidate of [
    path.resolve(__dirname, "..", "..", "dist", "index.html"),
    path.resolve(__dirname, "..", "dist", "index.html")
  ]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Flash ERP could not find the built desktop renderer. Checked: ${[
      path.resolve(__dirname, "..", "..", "dist", "index.html"),
      path.resolve(__dirname, "..", "dist", "index.html")
    ].join(", ")}`
  );
}

function resolveDesktopAppIconPath() {
  for (const candidate of [
    path.resolve(__dirname, "..", "..", "build", "app-icon.png"),
    path.resolve(__dirname, "..", "build", "app-icon.png"),
    path.resolve(process.cwd(), "apps", "store-desktop", "build", "app-icon.png")
  ]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isMaximized()) {
    mainWindow.maximize();
  }

  mainWindow.show();
  mainWindow.focus();
}

function showTrayCloseNotification() {
  if (hasShownTrayCloseNotification) {
    return;
  }

  hasShownTrayCloseNotification = true;

  if (Notification.isSupported()) {
    new Notification({
      title: "Flash ERP is still running",
      body: "Use the tray icon to reopen Flash ERP, or right-click it and choose Quit to close the desktop app."
    }).show();
    return;
  }

  desktopTray?.displayBalloon({
    title: "Flash ERP is still running",
    content: "Use the tray icon to reopen Flash ERP, or right-click it and choose Quit to close the desktop app."
  });
}

function quitFromTray() {
  isQuittingFromTray = true;
  app.quit();
}

function checkForDesktopUpdatesFromTray() {
  showMainWindow();

  void checkForDesktopUpdate(true)
    .then((status) => {
      if (status.status !== "disabled" && status.status !== "error") {
        return;
      }

      void showDesktopMessageBox({
        type: status.status === "error" ? "error" : "info",
        buttons: ["OK"],
        title: status.status === "error" ? "Update check failed" : "Desktop updates",
        message: status.message
      });
    })
    .catch((error) => {
      console.error("Flash ERP tray update check failed.", error);
      void showDesktopMessageBox({
        type: "error",
        buttons: ["OK"],
        title: "Update check failed",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not check for desktop updates."
      });
    });
}

function runSyncCycleFromTray() {
  const result = startDetachedSyncCycle({
    trigger: "tray",
    drainDownstream: true,
    snapshotMode: "status"
  });

  if (!result.accepted) {
    console.warn("Flash ERP tray sync was not started.", result);
    void showDesktopMessageBox({
      type: result.status === "busy" ? "info" : "error",
      buttons: ["OK"],
      title: result.status === "busy" ? "Sync already running" : "Sync failed",
      message: result.message
    });
  }
}

function createTrayMenuIcon(kind: "open" | "update" | "sync" | "quit") {
  const iconDataUrls: Record<"open" | "update" | "sync" | "quit", string> = {
    open: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAK0lEQVR4nGNgGAUoQF7T/D8xeNSAQW0AHkOfkaSJYgOwOPsZMpts19AEAAAgK3n5QCJvGwAAAABJRU5ErkJggg==",
    update: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPUlEQVR4nGNgGAU4gbym+X80/AybOD7Nz/AY+AyrRlyaSZEf7gYQ1IysCJtCnAYga0LC6HGP1VCyXTN4AAClPEym/4xsNwAAAABJRU5ErkJggg==",
    sync: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVR4nGNgGAUEgbym+X95TfNntDcEqogQJs8lQ1wzIUw7F1DVkMENAP54MRQ8FlX3AAAAAElFTkSuQmCC",
    quit: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOUlEQVR4nGNgGAUYQF7T/D8W/IxUA7BqIMowQooIGkKMLXjVoEviCBPcYUN1F5BsAbVigfx0MPQAALQWQxWUDue4AAAAAElFTkSuQmCC"
  };
  const image = nativeImage.createFromDataURL(iconDataUrls[kind]);
  image.setTemplateImage(false);
  return image;
}

function ensureDesktopTray() {
  if (desktopTray && !desktopTray.isDestroyed()) {
    return desktopTray;
  }

  const iconPath = resolveDesktopAppIconPath();

  if (!iconPath) {
    return null;
  }

  desktopTray = new Tray(iconPath);
  desktopTray.setToolTip("Flash ERP Store Desktop");
  desktopTray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open Flash ERP",
        icon: createTrayMenuIcon("open"),
        click: showMainWindow
      },
      {
        label: "Check for updates",
        icon: createTrayMenuIcon("update"),
        click: checkForDesktopUpdatesFromTray
      },
      {
        label: "Sync now",
        icon: createTrayMenuIcon("sync"),
        click: runSyncCycleFromTray
      },
      {
        type: "separator"
      },
      {
        label: "Quit",
        icon: createTrayMenuIcon("quit"),
        click: quitFromTray
      }
    ])
  );
  desktopTray.on("click", showMainWindow);
  desktopTray.on("double-click", showMainWindow);

  return desktopTray;
}

function createWindow() {
  logDesktopLaunchStage("creating main window", {
    builtRenderer: shouldUseBuiltRenderer
  });
  const savedWindowState = readDesktopWindowState();
  const shouldMaximizeOnReveal = true;
  const window = new BrowserWindow({
    width: savedWindowState?.bounds?.width ?? 1480,
    height: savedWindowState?.bounds?.height ?? 940,
    x: savedWindowState?.bounds?.x,
    y: savedWindowState?.bounds?.y,
    minWidth: 980,
    minHeight: 700,
    resizable: true,
    maximizable: true,
    show: false,
    backgroundColor: "#09111f",
    autoHideMenuBar: true,
    icon: resolveDesktopAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  const revealWindow = () => {
    if (window.isDestroyed() || window.isVisible()) {
      return;
    }

    logDesktopLaunchStage("revealing main window", {
      maximize: shouldMaximizeOnReveal,
      rendererReady: Boolean(rendererReadyAt)
    });
    if (shouldMaximizeOnReveal) {
      window.maximize();
    }
    window.show();
    window.focus();
  };
  ensureDesktopTray();

  window.once("ready-to-show", () => {
    logDesktopLaunchStage("window ready-to-show", {
      rendererReady: Boolean(rendererReadyAt),
      visible: window.isVisible()
    });
    if (rendererReadyAt) {
      revealWindow();
    }
  });

  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame) {
        desktopWindowLoadFailureCount += 1;
        lastDesktopWindowLoadFailure = `${errorCode}: ${errorDescription} (${validatedURL})`;
      }
      console.error("Store Desktop failed to load window content.", {
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame
      });

      if (isMainFrame) {
        setTimeout(() => {
          if (!window.isDestroyed()) {
            void recoverDesktopWindow("renderer-load-failed");
          }
        }, 1500);
      }
    }
  );

  window.webContents.on(
    "render-process-gone",
    (_event, details) => {
      console.error("Store Desktop renderer process exited unexpectedly.", details);
      void recoverDesktopWindow(`renderer-process-gone:${details.reason}`);
    }
  );

  window.webContents.on("unresponsive", () => {
    console.error("Store Desktop window became unresponsive.");
    if (unresponsiveRecoveryTimer) {
      clearTimeout(unresponsiveRecoveryTimer);
    }
    unresponsiveRecoveryTimer = setTimeout(() => {
      unresponsiveRecoveryTimer = null;
      void recoverDesktopWindow("renderer-unresponsive");
    }, unresponsiveRecoveryMs);
  });

  window.webContents.on("responsive", () => {
    if (unresponsiveRecoveryTimer) {
      clearTimeout(unresponsiveRecoveryTimer);
      unresponsiveRecoveryTimer = null;
      console.info("Store Desktop renderer became responsive before recovery was needed.");
    }
  });

  window.webContents.on("did-finish-load", () => {
    logDesktopLaunchStage("renderer did-finish-load");
    scheduleRendererReadyRecovery(window, "renderer-load-complete");
  });

  const revealWindowFallback = setTimeout(() => {
    if (!window.isDestroyed() && !window.isVisible()) {
      console.warn("Store Desktop used the fallback window reveal path.");
      revealWindow();
    }
  }, 4500);

  window.webContents.on("console-message", (details) => {
    if (details.message.includes("Electron Security Warning")) {
      return;
    }

    if (details.message.startsWith("[flash-erp-desktop]")) {
      console.info("Store Desktop renderer console message.", {
        level: details.level,
        message: details.message,
        line: details.lineNumber,
        sourceId: details.sourceId
      });
      return;
    }

    if (details.level === "warning" || details.level === "error") {
      console.error("Store Desktop renderer console message.", {
        level: details.level,
        message: details.message,
        line: details.lineNumber,
        sourceId: details.sourceId
      });
    }
  });

  window.on("close", (event) => {
    if (isQuittingFromTray) {
      saveDesktopWindowState(window);
      return;
    }

    event.preventDefault();
    window.hide();
    showTrayCloseNotification();
  });

  window.on("resize", () => scheduleDesktopWindowStateSave(window));
  window.on("move", () => scheduleDesktopWindowStateSave(window));
  window.on("maximize", () => scheduleDesktopWindowStateSave(window));
  window.on("unmaximize", () => scheduleDesktopWindowStateSave(window));
  window.on("restore", () => scheduleDesktopWindowStateSave(window));

  window.on("closed", () => {
    clearTimeout(revealWindowFallback);
    clearRendererReadyTimer();
    if (unresponsiveRecoveryTimer) {
      clearTimeout(unresponsiveRecoveryTimer);
      unresponsiveRecoveryTimer = null;
    }
    if (windowStateSaveTimer) {
      clearTimeout(windowStateSaveTimer);
      windowStateSaveTimer = null;
    }
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  if (!shouldUseBuiltRenderer && process.env.FLASH_ERP_DESKTOP_OPEN_DEVTOOLS === "1") {
    window.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow = window;
  void loadDesktopRenderer(window);
}

function shouldOpenMainWindow() {
  return process.env.FLASH_ERP_STORE_HEADLESS !== "1" || Boolean(startupErrorMessage);
}

function focusExistingDesktopInstance() {
  console.info("Store Desktop second app instance requested; focusing the existing instance.");
  pendingSecondInstanceFocus = true;

  if (!shouldOpenMainWindow()) {
    return;
  }

  if (app.isReady()) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      pendingSecondInstanceFocus = false;
      showMainWindow();
    } else if (desktopStartupCompleted) {
      pendingSecondInstanceFocus = false;
      showMainWindow();
    }
    return;
  }

  app.once("ready", focusExistingDesktopInstance);
}

function getPrinterHostWindow() {
  return mainWindow ?? BrowserWindow.getAllWindows()[0] ?? null;
}

async function listReceiptPrinters(): Promise<StoreReceiptPrinterDevice[]> {
  const hostWindow = getPrinterHostWindow();

  if (!hostWindow) {
    throw new Error("Flash ERP could not find an active desktop window to inspect printers.");
  }

  const printers = await hostWindow.webContents.getPrintersAsync();
  return printers.map((printer) => {
    const printerMetadata = printer as typeof printer & {
      status?: number;
      isDefault?: boolean;
    };

    return {
      name: printer.name,
      displayName: printer.displayName || printer.name,
      description: printer.description || null,
      status: typeof printerMetadata.status === "number" ? printerMetadata.status : 0,
      isDefault: printerMetadata.isDefault === true
    };
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildThermalUtilitySlipHtml(input: {
  title: string;
  subtitle: string;
  retailOrgName: string;
  storeCode: string;
  storeName: string;
  terminalCode: string;
  operatorLabel: string;
  generatedAt: string;
  lines: Array<{
    label: string;
    value: string;
  }>;
  note?: string | null;
  footer?: string | null;
  actionLabel?: string | null;
  autoPrint?: boolean;
}) {
  const autoPrint = input.autoPrint === true;
  const renderedLines = input.lines
    .map(
      (line) => `<div class="utility-line">
        <span>${escapeHtml(line.label)}</span>
        <strong>${escapeHtml(line.value)}</strong>
      </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
    />
    <title>${escapeHtml(input.title)} • Flash ERP</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      @page {
        size: 80mm auto;
        margin: 4mm;
      }

      body {
        margin: 0;
        background: #ffffff;
        color: #111827;
        font-family: inherit;
      }

      .utility-sheet {
        width: 72mm;
        margin: 0 auto;
        padding: 2mm 0 4mm;
      }

      .utility-head {
        border-bottom: 1px dashed #94a3b8;
        padding-bottom: 3mm;
        text-align: center;
      }

      .utility-head strong {
        display: block;
        font-size: 16px;
        letter-spacing: 0.03em;
      }

      .utility-head span,
      .utility-copy,
      .utility-foot {
        color: #475569;
        font-size: 11px;
        line-height: 1.45;
      }

      .utility-title {
        margin-top: 3mm;
        font-size: 15px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .utility-subtitle {
        margin-top: 1mm;
        font-size: 11px;
      }

      .utility-copy {
        display: grid;
        gap: 1mm;
        margin-top: 3mm;
      }

      .utility-divider {
        border-top: 1px dashed #94a3b8;
        margin: 3mm 0;
      }

      .utility-line {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 3mm;
        padding: 1mm 0;
        font-size: 12px;
      }

      .utility-line span {
        color: #475569;
      }

      .utility-line strong {
        color: #0f172a;
        font-weight: 800;
        text-align: right;
      }

      .utility-note {
        margin-top: 3mm;
        padding-top: 3mm;
        border-top: 1px dashed #94a3b8;
        font-size: 11px;
        line-height: 1.45;
      }

      .utility-foot {
        margin-top: 4mm;
        border-top: 1px dashed #94a3b8;
        padding-top: 3mm;
        text-align: center;
      }

      .utility-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        width: 72mm;
        margin: 0 auto 4mm;
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        background: #f8fafc;
        padding: 8px 10px;
      }

      .utility-toolbar strong,
      .utility-toolbar span {
        display: block;
      }

      .utility-toolbar span {
        color: #64748b;
        font-size: 11px;
      }

      .utility-toolbar button {
        border: 1px solid #0f766e;
        border-radius: 8px;
        background: #0f766e;
        color: white;
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        padding: 8px 10px;
      }

      @media print {
        .print-hidden {
          display: none !important;
        }
      }
    </style>
  </head>
  <body>
    ${
      input.actionLabel
        ? `<div class="utility-toolbar print-hidden">
            <div>
              <strong>${escapeHtml(input.title)}</strong>
              <span>${escapeHtml(input.subtitle)}</span>
            </div>
            <button type="button" onclick="window.print()">${escapeHtml(input.actionLabel)}</button>
          </div>`
        : ""
    }
    <div class="utility-sheet">
      <div class="utility-head">
        <strong>${escapeHtml(input.retailOrgName)}</strong>
        <span>${escapeHtml(input.storeName)} (${escapeHtml(input.storeCode)})</span>
        <span>Terminal ${escapeHtml(input.terminalCode)}</span>
      </div>
      <div class="utility-title">${escapeHtml(input.title)}</div>
      <div class="utility-subtitle">${escapeHtml(input.subtitle)}</div>
      <div class="utility-copy">
        <span>Operator: ${escapeHtml(input.operatorLabel)}</span>
        <span>Generated: ${escapeHtml(input.generatedAt)}</span>
      </div>
      <div class="utility-divider"></div>
      ${renderedLines}
      ${
        input.note
          ? `<div class="utility-note"><strong>Note</strong><br />${escapeHtml(input.note)}</div>`
          : ""
      }
      <div class="utility-foot">
        ${escapeHtml(input.footer ?? "Flash ERP lane hardware utility slip")}
      </div>
    </div>
    <script>
      window.addEventListener("load", () => {
        if (${autoPrint ? "true" : "false"}) {
          window.setTimeout(() => window.print(), 260);
        }
      });
    </script>
  </body>
</html>`;
}

async function printHtmlDirectToPrinter(input: {
  printerName: string;
  html: string;
  failureMessage: string;
}) {
  const silentWindow = new BrowserWindow({
    width: 420,
    height: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    await silentWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(input.html)}`);
    await new Promise<void>((resolve, reject) => {
      silentWindow.webContents.print(
        {
          silent: true,
          deviceName: input.printerName,
          printBackground: true
        },
        (success, failureReason) => {
          if (success) {
            resolve();
            return;
          }

          reject(
            new Error(failureReason?.trim() || input.failureMessage)
          );
        }
      );
    });
  } finally {
    if (!silentWindow.isDestroyed()) {
      silentWindow.close();
    }
  }
}

async function printThermalTestSlip() {
  const slip = await callStore<{
    retailOrgName: string;
    storeCode: string;
    storeName: string;
    terminalCode: string;
    operatorLabel: string;
    selectedPrinterName: string;
    generatedAt: string;
  }>("prepareThermalTestSlip");
  const html = buildThermalUtilitySlipHtml({
    title: "Thermal test slip",
    subtitle: "Verifies the saved receipt printer route for this Flash ERP desktop node.",
    retailOrgName: slip.retailOrgName,
    storeCode: slip.storeCode,
    storeName: slip.storeName,
    terminalCode: slip.terminalCode,
    operatorLabel: slip.operatorLabel,
    generatedAt: slip.generatedAt,
    lines: [
      { label: "Printer", value: slip.selectedPrinterName },
      { label: "Purpose", value: "Thermal route verification" }
    ]
  });

  await printHtmlDirectToPrinter({
    printerName: slip.selectedPrinterName,
    html,
    failureMessage: `Flash ERP could not print the thermal test slip to ${slip.selectedPrinterName}.`
  });

  return {
    printerName: slip.selectedPrinterName,
    message: `Flash ERP printed a thermal test slip to ${slip.selectedPrinterName}.`
  };
}

async function kickCashDrawer(input?: StoreCashDrawerKickRequest) {
  const action = await callStore<{
    retailOrgName: string;
    storeCode: string;
    storeName: string;
    terminalCode: string;
    shiftNo: string;
    cashierCode: string;
    operatorLabel: string;
    selectedPrinterName: string;
    tenderMethodCode: string;
    tenderMethodName: string;
    reason: string | null;
    generatedAt: string;
  }>("prepareCashDrawerKick", [input]);
  const html = buildThermalUtilitySlipHtml({
    title: "Cash drawer trigger",
    subtitle:
      "If the attached printer is configured to pulse the drawer on print jobs, the drawer should open now.",
    retailOrgName: action.retailOrgName,
    storeCode: action.storeCode,
    storeName: action.storeName,
    terminalCode: action.terminalCode,
    operatorLabel: action.operatorLabel,
    generatedAt: action.generatedAt,
    lines: [
      { label: "Printer", value: action.selectedPrinterName },
      { label: "Shift", value: action.shiftNo },
      { label: "Cashier", value: action.cashierCode },
      {
        label: "Tender",
        value: `${action.tenderMethodName} (${action.tenderMethodCode})`
      }
    ],
    note: action.reason
  });

  await printHtmlDirectToPrinter({
    printerName: action.selectedPrinterName,
    html,
    failureMessage: `Flash ERP could not send the cash drawer trigger to ${action.selectedPrinterName}.`
  });

  return {
    printerName: action.selectedPrinterName,
    tenderMethodCode: action.tenderMethodCode,
    tenderMethodName: action.tenderMethodName,
    message: `Flash ERP sent the cash drawer trigger to ${action.selectedPrinterName} using ${action.tenderMethodName}.`
  };
}

function formatShiftReportMoney(value: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: currencyCode
    }).format(value);
  } catch {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: "GHS"
    }).format(value);
  }
}

function formatShiftReportDate(value: string | null) {
  if (!value) {
    return "Open";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(parsed);
}

async function openShiftReportPrintWindow(input: StoreShiftReportPrintRequest) {
  const snapshot = await callStore<StoreSyncSnapshot>("getSyncSnapshot");
  const session = snapshot.activeOperatorSession;

  if (!session) {
    throw new Error("Sign in before printing a shift report.");
  }

  if (input.reportType === "Z" && !session.capabilities.supervisorEligible) {
    throw new Error("Only a synced supervisor can print the Z report for shift closeout.");
  }

  if (
    input.reportType === "X" &&
    !(
      session.capabilities.cashierEligible ||
      session.capabilities.canProcessSale ||
      session.capabilities.canOpenShift
    )
  ) {
    throw new Error("This operator is not allowed to print an X report.");
  }

  const shift: StoreShiftSummary | null =
    input.reportType === "Z"
      ? snapshot.activeShift ?? snapshot.recentClosedShifts[0] ?? null
      : snapshot.activeShift ?? null;

  if (!shift) {
    throw new Error(
      input.reportType === "Z"
        ? "Flash ERP could not find a shift for the Z report."
        : "Open a cashier shift before printing an X report."
    );
  }

  const generatedAt = new Date().toISOString();
  const currencyCode = snapshot.receiptSettings.currencyCode;
  const title = `${input.reportType} Report`;
  const html = buildThermalUtilitySlipHtml({
    title,
    subtitle:
      input.reportType === "Z"
        ? "Supervisor closeout report"
        : "Cashier in-shift report",
    retailOrgName: snapshot.retailOrgName,
    storeCode: snapshot.storeCode,
    storeName: snapshot.storeName,
    terminalCode: snapshot.terminalCode,
    operatorLabel: `${session.displayName} (${session.loginId})`,
    generatedAt: formatShiftReportDate(generatedAt),
    actionLabel: `Print ${input.reportType}`,
    autoPrint: input.autoPrint,
    footer: `Flash ERP ${input.reportType} report`,
    lines: [
      { label: "Shift", value: shift.shiftNo },
      { label: "Status", value: shift.status },
      { label: "Cashier", value: shift.cashierCode },
      { label: "Opened", value: formatShiftReportDate(shift.openedAt) },
      { label: "Closed", value: formatShiftReportDate(shift.closedAt) },
      { label: "Opening float", value: formatShiftReportMoney(shift.openingFloatAmount, currencyCode) },
      { label: "Net sales", value: formatShiftReportMoney(shift.netSalesAmount, currencyCode) },
      { label: "Cash tender", value: formatShiftReportMoney(shift.cashTenderedAmount, currencyCode) },
      { label: "Non-cash tender", value: formatShiftReportMoney(shift.nonCashTenderedAmount, currencyCode) },
      { label: "Expected cash", value: formatShiftReportMoney(shift.expectedCashAmount, currencyCode) },
      {
        label: "Declared cash",
        value:
          shift.declaredCashAmount === null
            ? "Not declared"
            : formatShiftReportMoney(shift.declaredCashAmount, currencyCode)
      },
      {
        label: "Variance",
        value:
          shift.varianceAmount === null
            ? "Pending"
            : formatShiftReportMoney(shift.varianceAmount, currencyCode)
      },
      { label: "Transactions", value: String(shift.transactionCount) },
      { label: "Sales", value: String(shift.salesCount) },
      { label: "Returns", value: String(shift.returnCount) },
      { label: "Exchanges", value: String(shift.exchangeCount) }
    ]
  });
  const printerSettings = snapshot.receiptPrinterSettings;

  if (printerSettings.silentPrintEnabled && printerSettings.selectedPrinterName) {
    await printHtmlDirectToPrinter({
      printerName: printerSettings.selectedPrinterName,
      html,
      failureMessage: `Flash ERP could not print the ${input.reportType} report to ${printerSettings.selectedPrinterName}.`
    });

    return {
      reportType: input.reportType,
      shiftNo: shift.shiftNo,
      message: `Flash ERP sent the ${input.reportType} report for ${shift.shiftNo} to ${printerSettings.selectedPrinterName}.`
    };
  }

  const previewWindow = new BrowserWindow({
    width: 480,
    height: 760,
    minWidth: 420,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    title: `${shift.shiftNo} - ${input.reportType} report`,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  previewWindow.once("ready-to-show", () => {
    previewWindow.show();
    previewWindow.focus();
  });

  await previewWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);

  return {
    reportType: input.reportType,
    shiftNo: shift.shiftNo,
    message: `Flash ERP opened the ${input.reportType} report for ${shift.shiftNo}.`
  };
}

async function openPrintableReceiptDocumentWindow(
  receiptDocument: Parameters<typeof buildReceiptPrintWindowHtml>[0],
  input: {
  autoPrint?: boolean;
  }
) {
  const printerSettings = (await callStore<StoreSyncSnapshot>("getSyncSnapshot"))
    .receiptPrinterSettings;

  if (printerSettings.silentPrintEnabled && printerSettings.selectedPrinterName) {
    const silentWindow = new BrowserWindow({
      width: 420,
      height: 640,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: "#ffffff",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    const silentHtml = buildReceiptPrintWindowHtml(receiptDocument, {
      autoPrint: false
    });

    try {
      await silentWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(silentHtml)}`);
      await new Promise<void>((resolve, reject) => {
        silentWindow.webContents.print(
          {
            silent: true,
            deviceName: printerSettings.selectedPrinterName ?? undefined,
            printBackground: true
          },
          (success, failureReason) => {
            if (success) {
              resolve();
              return;
            }

            reject(
              new Error(
                failureReason?.trim() ||
                  `Flash ERP could not print to ${printerSettings.selectedPrinterName}.`
              )
            );
          }
        );
      });
      silentWindow.close();

      return {
        transactionNo: receiptDocument.transactionNo,
        message: `Flash ERP sent ${receiptDocument.transactionNo} directly to ${printerSettings.selectedPrinterName}.`
      };
    } catch (error) {
      silentWindow.close();

      if (input.autoPrint) {
        // Fall back to the interactive preview if silent print could not complete.
      } else {
        throw error;
      }
    }
  }

  const previewWindow = new BrowserWindow({
    width: 520,
    height: 860,
    minWidth: 420,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#e7ecf3",
    title: `${receiptDocument.transactionNo} • Thermal receipt`,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  previewWindow.once("ready-to-show", () => {
    previewWindow.show();
    previewWindow.focus();
  });

  const pageHtml = buildReceiptPrintWindowHtml(receiptDocument, {
    autoPrint: input.autoPrint
  });
  await previewWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(pageHtml)}`);

  return {
    transactionNo: receiptDocument.transactionNo,
    message: input.autoPrint
      ? `Flash ERP opened the thermal receipt for ${receiptDocument.transactionNo}.`
      : `Flash ERP opened the thermal receipt preview for ${receiptDocument.transactionNo}.`
  };
}

async function openReceiptPrintWindow(input: {
  transactionNo: string;
  autoPrint?: boolean;
}) {
  const receiptDocument = await callStore<Parameters<typeof buildReceiptPrintWindowHtml>[0]>(
    "getPrintableReceiptDocument",
    [input.transactionNo]
  );

  return openPrintableReceiptDocumentWindow(receiptDocument, {
    autoPrint: input.autoPrint
  });
}

async function openSalesOrderReceiptPrintWindow(input: {
  orderNo: string;
  autoPrint?: boolean;
}) {
  const receiptDocument = await callStore<Parameters<typeof buildReceiptPrintWindowHtml>[0]>(
    "getPrintableSalesOrderReceiptDocument",
    [input.orderNo]
  );
  const result = await openPrintableReceiptDocumentWindow(receiptDocument, {
    autoPrint: input.autoPrint
  });

  return {
    orderNo: receiptDocument.transactionNo,
    message: result.message
  };
}

async function openAccountPaymentReceiptPrintWindow(input: {
  entryNo: string;
  autoPrint?: boolean;
}) {
  const receiptDocument = await callStore<Parameters<typeof buildAccountPaymentReceiptPrintWindowHtml>[0]>(
    "getPrintableAccountPaymentReceiptDocument",
    [input.entryNo]
  );
  const printerSettings = (await callStore<StoreSyncSnapshot>("getSyncSnapshot"))
    .receiptPrinterSettings;

  if (printerSettings.silentPrintEnabled && printerSettings.selectedPrinterName) {
    const silentWindow = new BrowserWindow({
      width: 420,
      height: 640,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: "#ffffff",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    const silentHtml = buildAccountPaymentReceiptPrintWindowHtml(receiptDocument, {
      autoPrint: false
    });

    try {
      await silentWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(silentHtml)}`);
      await new Promise<void>((resolve, reject) => {
        silentWindow.webContents.print(
          {
            silent: true,
            deviceName: printerSettings.selectedPrinterName ?? undefined,
            printBackground: true
          },
          (success, failureReason) => {
            if (success) {
              resolve();
              return;
            }

            reject(
              new Error(
                failureReason?.trim() ||
                  `Flash ERP could not print to ${printerSettings.selectedPrinterName}.`
              )
            );
          }
        );
      });
      silentWindow.close();

      return {
        entryNo: receiptDocument.entryNo,
        message: `Flash ERP sent ${receiptDocument.entryNo} directly to ${printerSettings.selectedPrinterName}.`
      };
    } catch (error) {
      silentWindow.close();

      if (!input.autoPrint) {
        throw error;
      }
    }
  }

  const previewWindow = new BrowserWindow({
    width: 520,
    height: 860,
    minWidth: 420,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#e7ecf3",
    title: `${receiptDocument.entryNo} • Account payment receipt`,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  previewWindow.once("ready-to-show", () => {
    previewWindow.show();
    previewWindow.focus();
  });

  const pageHtml = buildAccountPaymentReceiptPrintWindowHtml(receiptDocument, {
    autoPrint: input.autoPrint
  });
  await previewWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(pageHtml)}`);

  return {
    entryNo: receiptDocument.entryNo,
    message: input.autoPrint
      ? `Flash ERP opened the account payment receipt for ${receiptDocument.entryNo}.`
      : `Flash ERP opened the account payment receipt preview for ${receiptDocument.entryNo}.`
  };
}

const desktopSingleInstanceLock = app.requestSingleInstanceLock();

if (!desktopSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", focusExistingDesktopInstance);

  app.whenReady().then(async () => {
  console.info(`Flash ERP desktop support log: ${getDesktopSupportLogPath()}`);
  logDesktopLaunchStage("electron app ready", {
    version: app.getVersion(),
    electronVersion: process.versions.electron
  });
  applyDesktopConnectionConfigFile();
  storeRuntimeConfig = resolveStoreRuntimeConfig();
  logDesktopLaunchStage("runtime config resolved", {
    role: storeRuntimeConfig.role,
    databaseProvider: storeRuntimeConfig.databaseProvider,
    deploymentMode: storeRuntimeConfig.deploymentMode,
    shouldStartStoreServer: storeRuntimeConfig.shouldStartStoreServer,
    storeServerUrl: storeRuntimeConfig.storeServerUrl
  });
  ipcMain.handle("rms:ping", async () => "pong");
  ipcMain.handle("flash-erp:get-store-runtime-status", async () => getStoreRuntimeStatus());
  ipcMain.handle("flash-erp:get-desktop-window-status", async () => getDesktopWindowStatus());
  ipcMain.handle("flash-erp:open-desktop-support-folder", async () => {
    const supportLogPath = getDesktopSupportLogPath();
    shell.showItemInFolder(supportLogPath);
    return supportLogPath;
  });
  ipcMain.handle(
    "flash-erp:export-sync-diagnostics",
    async (_event, input: StoreSyncDiagnosticsExportInput) => {
      const requestedFileName =
        typeof input?.fileName === "string" ? path.basename(input.fileName.trim()) : "";
      const safeFileName = requestedFileName.replace(/[^A-Za-z0-9._-]/g, "-");

      if (!safeFileName || !safeFileName.toLowerCase().endsWith(".json")) {
        throw new Error("Flash ERP needs a valid JSON diagnostics file name.");
      }

      if (
        !input.diagnostic ||
        typeof input.diagnostic !== "object" ||
        Array.isArray(input.diagnostic)
    ) {
        throw new Error("Flash ERP could not prepare the sync diagnostics export.");
      }

      const supportDirectory = path.dirname(getDesktopSupportLogPath());
      const outputPath = path.join(supportDirectory, safeFileName);
      mkdirSync(supportDirectory, { recursive: true });
      writeFileSync(outputPath, `${JSON.stringify(input.diagnostic, null, 2)}\n`, "utf8");
      writeDesktopSupportLog("info", "Sync diagnostics exported", {
        outputPath
      });
      return outputPath;
    }
  );
  ipcMain.handle("flash-erp:recover-desktop-window", async (_event, reason?: string | null) =>
    recoverDesktopWindow(reason?.trim() || "renderer-requested")
  );
  ipcMain.on("flash-erp:renderer-ready", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && window === mainWindow) {
      markRendererReady(window);
    } else {
      logDesktopLaunchStage("ignored renderer-ready from unknown window");
    }
  });
  ipcMain.on("flash-erp:renderer-heartbeat", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && window === mainWindow) {
      lastRendererHeartbeatAt = new Date();
      rendererHeartbeatCount += 1;
      if (rendererHeartbeatCount <= 3) {
        logDesktopLaunchStage("renderer heartbeat received", {
          count: rendererHeartbeatCount
        });
      }
    }
  });
  ipcMain.on("flash-erp:desktop-diagnostic", (_event, payload: unknown) => {
    const record =
      typeof payload === "object" && payload !== null
        ? (payload as {
            level?: unknown;
            label?: unknown;
            details?: unknown;
          })
        : {};
    const level =
      record.level === "warn" || record.level === "error" ? record.level : "info";
    const label =
      typeof record.label === "string" && record.label.trim()
        ? record.label.trim()
        : "renderer-diagnostic";

    writeDesktopSupportLog(level, `Renderer diagnostic: ${label}`, record.details ?? null);
  });
  ipcMain.handle("flash-erp:get-desktop-update-status", async () => desktopUpdateStatus);
  ipcMain.handle("flash-erp:check-for-desktop-update", async () => checkForDesktopUpdate(true));
  ipcMain.handle("flash-erp:install-desktop-update", async () => installDesktopUpdate());
  ipcMain.handle("flash-erp:get-desktop-connection-config", async () =>
    buildDesktopConnectionConfigResult(false)
  );
  ipcMain.handle(
    "flash-erp:save-desktop-connection-config",
    async (_event, input: StoreDesktopConnectionConfig) => saveDesktopConnectionConfig(input)
  );
  ipcMain.handle(
    "flash-erp:provision-store-database",
    async (_event, input: StoreDesktopConnectionConfig) => provisionStoreDatabase(input)
  );
  ipcMain.handle("flash-erp:restart-desktop", async () => {
    app.relaunch();
    app.exit(0);
  });

  try {
    logDesktopLaunchStage("store service startup started");
    const useLocalStoreServerProcess = shouldUseLocalStoreServerProcess(storeRuntimeConfig);

    if (storeRuntimeConfig.role === "terminal-client" || useLocalStoreServerProcess) {
      const serverUrl = useLocalStoreServerProcess
        ? await ensureLocalStoreServerProcess(storeRuntimeConfig)
        : storeRuntimeConfig.storeServerUrl;

      if (!serverUrl) {
        throw new Error(
          useLocalStoreServerProcess
            ? "Flash ERP could not resolve the local store server URL."
            : "FLASH_ERP_STORE_SERVER_URL is required when the desktop runs as a terminal client."
        );
      }

      storeClient = useLocalStoreServerProcess
        ? createLocalStoreServerProcessClient(storeRuntimeConfig, serverUrl)
        : createHttpStoreServiceClient({
            serverUrl,
            terminalContext: storeRuntimeConfig.terminalContext,
            serverToken: storeRuntimeConfig.storeServerToken,
            requestTimeoutMs: storeRuntimeConfig.storeServerTimeoutMs
          });
      logDesktopLaunchStage("http store client ready", {
        databaseProvider: storeRuntimeConfig.databaseProvider,
        role: storeRuntimeConfig.role,
        serverUrl,
        localStoreServerProcess: useLocalStoreServerProcess
      });
    } else {
      const dataEngine = await probeStoreDataEngineDescriptor({
        provider: storeRuntimeConfig.databaseProvider,
        timeoutMs: storeRuntimeConfig.storeServerTimeoutMs
      });

      if (!dataEngine.operational) {
        console.warn(dataEngine.message);
      }

      if (
        (storeRuntimeConfig.databaseProvider === "postgres" ||
          storeRuntimeConfig.databaseProvider === "mssql") &&
        !dataEngine.workflowAdapterReady
      ) {
        throw new Error(
          `${dataEngine.message} Provision the store ${storeRuntimeConfig.databaseProvider === "mssql" ? "SQL Server" : "PostgreSQL"} schema before starting shared store mode.`
        );
      }

      if (storeRuntimeConfig.databaseProvider === "mssql") {
        if (!dataEngine.connectionString) {
          throw new Error("FLASH_ERP_STORE_DATABASE_URL is required for SQL Server store mode.");
        }

        storeServiceRuntime = await MssqlStoreService.create({
          connectionString: dataEngine.connectionString,
          deploymentMode: storeRuntimeConfig.deploymentMode,
          syncBaseUrl: storeRuntimeConfig.syncBaseUrl,
          nodeCode: storeRuntimeConfig.nodeCode,
          terminalCode: storeRuntimeConfig.terminalContext.terminalCode,
          clientName: storeRuntimeConfig.terminalContext.clientName,
          connectionTimeoutMs: storeRuntimeConfig.storeServerTimeoutMs
        });
      } else if (storeRuntimeConfig.databaseProvider === "postgres") {
        if (!dataEngine.connectionString) {
          throw new Error("FLASH_ERP_STORE_DATABASE_URL is required for PostgreSQL store mode.");
        }

        storeServiceRuntime = await PostgresStoreService.create({
          connectionString: dataEngine.connectionString,
          deploymentMode: storeRuntimeConfig.deploymentMode,
          syncBaseUrl: storeRuntimeConfig.syncBaseUrl,
          nodeCode: storeRuntimeConfig.nodeCode,
          terminalCode: storeRuntimeConfig.terminalContext.terminalCode,
          clientName: storeRuntimeConfig.terminalContext.clientName,
          connectionTimeoutMs: storeRuntimeConfig.storeServerTimeoutMs
        });
      } else {
        localStoreService = new LocalStoreService(storeRuntimeConfig.userDataPath ?? app.getPath("userData"), {
          deploymentMode: storeRuntimeConfig.deploymentMode,
          syncBaseUrl: storeRuntimeConfig.syncBaseUrl,
          databasePath: storeRuntimeConfig.databasePath,
          nodeCode: storeRuntimeConfig.nodeCode,
          terminalCode: storeRuntimeConfig.terminalContext.terminalCode
        });
        storeServiceRuntime = localStoreService;
      }

      storeClient = createDirectStoreServiceClient(
        storeServiceRuntime,
        storeRuntimeConfig.terminalContext
      );
      logDesktopLaunchStage("direct store client ready", {
        databaseProvider: storeRuntimeConfig.databaseProvider,
        role: storeRuntimeConfig.role
      });

      if (storeRuntimeConfig.shouldStartStoreServer) {
        storeServerHandle = await startStoreServiceServer({
          service: storeServiceRuntime,
          host: storeRuntimeConfig.storeServerHost,
          port: storeRuntimeConfig.storeServerPort,
          serverToken: storeRuntimeConfig.storeServerToken,
          getHealth: async () => {
            const snapshot = await storeServiceRuntime!.getSyncSnapshot();
            return buildStoreServerHealth(storeRuntimeConfig!, snapshot, "store-server");
          }
        });
        console.info(`Flash ERP store service is listening at ${storeServerHandle.url}.`);
      }
    }
    logDesktopLaunchStage("store service startup complete");
  } catch (error) {
    startupErrorMessage =
      error instanceof Error
        ? error.message
        : "Flash ERP could not start store services.";
    console.error("Flash ERP store service startup failed.", error);
  }

  registerStoreIpcHandler("flash-erp:get-sync-snapshot", "getSyncSnapshot");
  registerStoreIpcHandler(
    "flash-erp:get-sync-status-snapshot",
    "getSyncStatusSnapshot"
  );
  registerStoreIpcHandler("flash-erp:bootstrap-standalone-admin", "bootstrapStandaloneAdmin");
  registerStoreIpcHandler("flash-erp:save-standalone-settings", "saveStandaloneSettings");
  registerStoreIpcHandler("flash-erp:save-standalone-department", "saveStandaloneDepartment");
  registerStoreIpcHandler("flash-erp:save-standalone-category", "saveStandaloneCategory");
  registerStoreIpcHandler("flash-erp:save-standalone-unit-of-measure", "saveStandaloneUnitOfMeasure");
  registerStoreIpcHandler("flash-erp:save-standalone-tax-profile", "saveStandaloneTaxProfile");
  registerStoreIpcHandler("flash-erp:save-standalone-tender-method", "saveStandaloneTenderMethod");
  registerStoreIpcHandler("flash-erp:save-standalone-location", "saveStandaloneLocation");
  registerStoreIpcHandler("flash-erp:save-standalone-bank-account", "saveStandaloneBankAccount");
  registerStoreIpcHandler("flash-erp:save-standalone-supplier", "saveStandaloneSupplier");
  registerStoreIpcHandler("flash-erp:save-standalone-price-list-entry", "saveStandalonePriceListEntry");
  registerStoreIpcHandler("flash-erp:save-standalone-promotion", "saveStandalonePromotion");
  registerStoreIpcHandler("flash-erp:save-standalone-product", "saveStandaloneProduct");
  registerStoreIpcHandler("flash-erp:save-standalone-password-policy", "saveStandalonePasswordPolicy");
  registerStoreIpcHandler("flash-erp:save-standalone-role", "saveStandaloneRole");
  registerStoreIpcHandler("flash-erp:save-standalone-user", "saveStandaloneUser");
  registerStoreIpcHandler("flash-erp:save-standalone-customer", "saveStandaloneCustomer");
  registerStoreIpcHandler("flash-erp:sign-in-operator", "signInOperator");
  registerStoreIpcHandler("flash-erp:sign-out-operator", "signOutOperator");
  registerStoreIpcHandler("flash-erp:lookup-catalog-item", "lookupCatalogItem");
  registerStoreIpcHandler("flash-erp:browse-catalog-items", "browseCatalogItems");
  registerStoreIpcHandler("flash-erp:browse-inventory-positions", "browseInventoryPositions");
  registerStoreIpcHandler("flash-erp:lookup-remote-store-inventory", "lookupRemoteStoreInventory");
  registerStoreIpcHandler("flash-erp:request-remote-inter-store-stock", "requestRemoteInterStoreStock");
  registerStoreIpcHandler("flash-erp:browse-serial-registry", "browseSerialRegistry");
  registerStoreIpcHandler("flash-erp:browse-purchase-orders", "browsePurchaseOrders");
  registerStoreIpcHandler("flash-erp:save-standalone-purchase-order", "saveStandalonePurchaseOrder");
  registerStoreIpcHandler("flash-erp:browse-inter-store-transfers", "browseInterStoreTransfers");
  registerStoreIpcHandler("flash-erp:search-customers", "searchCustomers");
  registerStoreIpcHandler("flash-erp:search-transaction-references", "searchTransactionReferences");
  registerStoreIpcHandler("flash-erp:browse-store-reports", "browseStoreReports");
  registerStoreIpcHandler("flash-erp:record-customer-account-payment", "recordCustomerAccountPayment");
  registerStoreIpcHandler("flash-erp:create-sales-order-from-active-basket", "createSalesOrderFromActiveBasket");
  registerStoreIpcHandler("flash-erp:resume-sales-order", "resumeSalesOrder");
  registerStoreIpcHandler("flash-erp:receive-layaway-payment", "receiveLayawayPayment");
  registerStoreIpcHandler("flash-erp:release-layaway-reservation", "releaseLayawayReservation");
  registerStoreIpcHandler("flash-erp:expire-layaway", "expireLayaway");
  registerStoreIpcHandler("flash-erp:cancel-sales-order", "cancelSalesOrder");
  registerStoreIpcHandler("flash-erp:record-eod-reconciliation", "recordEodReconciliation");
  registerStoreIpcHandler("flash-erp:record-banking-deposit", "recordBankingDeposit");
  registerStoreIpcHandler("flash-erp:save-store-expense-draft", "saveStoreExpenseDraft");
  registerStoreIpcHandler("flash-erp:confirm-store-expense", "confirmStoreExpense");
  registerStoreIpcHandler("flash-erp:attach-customer-to-active-basket", "attachCustomerToActiveBasket");
  registerStoreIpcHandler("flash-erp:set-active-basket-loyalty-redemption", "setActiveBasketLoyaltyRedemption");
  registerStoreIpcHandler("flash-erp:save-inter-store-transfer-request-draft", "saveInterStoreTransferRequestDraft");
  registerStoreIpcHandler("flash-erp:submit-inter-store-transfer-request-draft", "submitInterStoreTransferRequestDraft");
  registerStoreIpcHandler("flash-erp:save-stock-count-session-draft", "saveStockCountSessionDraft");
  registerStoreIpcHandler("flash-erp:submit-stock-count-session", "submitStockCountSession");
  registerStoreIpcHandler("flash-erp:commit-stock-count-session", "commitStockCountSession");
  registerStoreIpcHandler("flash-erp:open-shift", "openShift");
  registerStoreIpcHandler("flash-erp:close-active-shift", "closeActiveShift");
  registerStoreIpcHandler("flash-erp:search-receipts", "searchReceipts");
  registerStoreIpcHandler("flash-erp:lookup-receipt-for-correction", "lookupReceiptForCorrection");
  registerStoreIpcHandler("flash-erp:add-item-to-basket", "addItemToBasket");
  registerStoreIpcHandler("flash-erp:start-return-basket", "startReturnBasket");
  registerStoreIpcHandler("flash-erp:start-exchange-basket", "startExchangeBasket");
  registerStoreIpcHandler("flash-erp:start-return-from-receipt", "startReturnFromReceipt");
  registerStoreIpcHandler("flash-erp:start-exchange-from-receipt", "startExchangeFromReceipt");
  registerStoreIpcHandler("flash-erp:add-receipt-line-to-basket", "addReceiptLineToBasket");
  registerStoreIpcHandler("flash-erp:update-basket-line", "updateBasketLine");
  registerStoreIpcHandler("flash-erp:remove-basket-line", "removeBasketLine");
  registerStoreIpcHandler("flash-erp:discard-active-basket", "discardActiveBasket");
  registerStoreIpcHandler("flash-erp:checkout-active-basket", "checkoutActiveBasket");
  ipcMain.handle("flash-erp:list-receipt-printers", async () => listReceiptPrinters());
  ipcMain.handle(
    "flash-erp:save-receipt-printer-settings",
    async (_event, input: StoreReceiptPrinterSettingsInput) =>
      callStore("saveReceiptPrinterSettings", [input])
  );
  ipcMain.handle(
    "flash-erp:save-local-receipt-logo",
    async (_event, input: StoreLocalReceiptLogoInput) =>
      callStore("saveLocalReceiptLogo", [input])
  );
  ipcMain.handle("flash-erp:print-receipt", async (_event, input: StoreReceiptPrintRequest) => {
    await callStore("authorizeReceiptPrint", [{
      autoPrint: input.autoPrint
    }]);

    return openReceiptPrintWindow(input);
  });
  ipcMain.handle("flash-erp:print-sales-order-receipt", async (_event, input: StoreSalesOrderReceiptPrintRequest) => {
    await callStore("authorizeReceiptPrint", [{
      autoPrint: input.autoPrint
    }]);

    return openSalesOrderReceiptPrintWindow(input);
  });
  ipcMain.handle(
    "flash-erp:print-account-payment-receipt",
    async (_event, input: StoreAccountPaymentReceiptPrintRequest) =>
      openAccountPaymentReceiptPrintWindow(input)
  );
  ipcMain.handle(
    "flash-erp:print-shift-report",
    async (_event, input: StoreShiftReportPrintRequest) => openShiftReportPrintWindow(input)
  );
  ipcMain.handle("flash-erp:print-thermal-test-slip", async () => printThermalTestSlip());
  ipcMain.handle("flash-erp:kick-cash-drawer", async (_event, input?: StoreCashDrawerKickRequest) =>
    kickCashDrawer(input)
  );
  registerStoreIpcHandler("flash-erp:park-active-basket", "parkActiveBasket");
  registerStoreIpcHandler("flash-erp:resume-parked-basket", "resumeParkedBasket");
  registerStoreIpcHandler("flash-erp:capture-demo-sale", "captureDemoSale");
  registerStoreIpcHandler("flash-erp:capture-scanned-sale", "captureScannedSale");
  registerStoreIpcHandler("flash-erp:receive-purchase-order", "receivePurchaseOrder");
  registerStoreIpcHandler("flash-erp:record-supplier-return", "recordSupplierReturn");
  registerStoreIpcHandler("flash-erp:acknowledge-supplier-return-cancellation", "acknowledgeSupplierReturnCancellation");
  registerStoreIpcHandler("flash-erp:issue-inter-store-transfer", "issueInterStoreTransfer");
  registerStoreIpcHandler("flash-erp:receive-inter-store-transfer", "receiveInterStoreTransfer");
  ipcMain.handle("flash-erp:start-sync-cycle", async (_event, input?: StoreSyncRunOptions) =>
    startDetachedSyncCycle(input)
  );
  registerStoreIpcHandler("flash-erp:run-sync-cycle", "runSyncCycle");
  registerStoreIpcHandler("flash-erp:requeue-dead-letters", "requeueDeadLetters");
  registerStoreIpcHandler("flash-erp:complete-recovery-task", "completeRecoveryTask");

  if (shouldOpenMainWindow()) {
    createWindow();
  }
  scheduleDesktopUpdateChecks();
  startRendererWatchdog();
  desktopStartupCompleted = true;

  if (pendingSecondInstanceFocus && shouldOpenMainWindow()) {
    pendingSecondInstanceFocus = false;
    showMainWindow();
  }

  app.on("activate", () => {
    if (shouldOpenMainWindow()) {
      showMainWindow();
    }
  });
});
}

app.on("window-all-closed", () => {
  if (isQuittingFromTray && process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuittingFromTray = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    saveDesktopWindowState(mainWindow);
  }
  if (desktopUpdateCheckTimer) {
    clearInterval(desktopUpdateCheckTimer);
    desktopUpdateCheckTimer = null;
  }
  if (rendererWatchdogTimer) {
    clearInterval(rendererWatchdogTimer);
    rendererWatchdogTimer = null;
  }
  clearRendererReadyTimer();
  if (unresponsiveRecoveryTimer) {
    clearTimeout(unresponsiveRecoveryTimer);
    unresponsiveRecoveryTimer = null;
  }
  stopStoreServerProcess();
  void storeServerHandle?.close();
  storeServerHandle = null;
  storeClient = null;
  void Promise.resolve(storeServiceRuntime?.close?.());
  storeServiceRuntime = null;
  localStoreService = null;
});
