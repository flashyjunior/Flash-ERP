import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

function requireFile(relativePath: string) {
  const absolutePath = path.join(workspaceRoot, relativePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Desktop soak gate is missing ${relativePath}.`);
  }

  return readFileSync(absolutePath, "utf8");
}

function requireIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`Desktop soak gate failed: ${label}`);
  }
}

const rootPackage = JSON.parse(requireFile("package.json")) as {
  scripts?: Record<string, string>;
};
const desktopPackage = JSON.parse(requireFile("apps/store-desktop/package.json")) as {
  scripts?: Record<string, string>;
};
const builderConfig = requireFile("apps/store-desktop/electron-builder.config.cjs");
const mainSource = requireFile("apps/store-desktop/electron/main.ts");
const preloadSource = requireFile("apps/store-desktop/electron/preload.ts");
const rendererSource = requireFile("apps/store-desktop/src/renderer/app.tsx");
const modernRendererSource = requireFile("apps/store-desktop/src/renderer/modern-app.tsx");
const desktopRuntimeSource = requireFile("apps/store-desktop/src/shared/desktop-runtime.ts");
const desktopStabilityGate = requireFile("scripts/desktop-stability-gates.ts");
const deploymentDoc = requireFile("docs/10-store-desktop-production-deployment.md");
const soakDoc = requireFile("docs/12-production-certification-and-soak-plan.md");

for (const scriptName of ["smoke:desktop", "soak:desktop", "acceptance:parity"]) {
  if (!rootPackage.scripts?.[scriptName]) {
    throw new Error(`Root package.json must expose ${scriptName}.`);
  }
}

for (const scriptName of ["dist:win", "publish:win", "smoke", "typecheck"]) {
  if (!desktopPackage.scripts?.[scriptName]) {
    throw new Error(`Desktop package must expose ${scriptName}.`);
  }
}

requireIncludes(builderConfig, "perMachine", "Windows installer must remain per-machine.");
requireIncludes(builderConfig, "nsis", "Windows NSIS installer must be configured.");
requireIncludes(mainSource, "FLASH_ERP_DESKTOP_UPDATE_URL", "desktop runtime config must carry update feed URL.");
requireIncludes(mainSource, "getDesktopSupportLogPath", "main process support log path must be exposed.");
requireIncludes(mainSource, "unresponsive", "renderer unresponsive events must be logged.");
requireIncludes(mainSource, "recoverDesktopWindow", "renderer recovery must be wired.");
requireIncludes(mainSource, "desktop-window-state.json", "window bounds must persist across restarts.");
requireIncludes(mainSource, "flash-erp:run-sync-cycle", "manual sync IPC must be registered.");
requireIncludes(mainSource, "runSyncCycleFromTray", "tray sync action must be wired.");
requireIncludes(mainSource, "autoUpdater", "desktop updater must be wired.");
requireIncludes(preloadSource, "runSyncCycle", "preload must expose manual sync.");
requireIncludes(preloadSource, "reportRendererHeartbeat", "preload must expose renderer heartbeat.");
requireIncludes(desktopRuntimeSource, "lastManualSyncAt", "desktop runtime must track manual sync posture.");
requireIncludes(desktopRuntimeSource, "StoreDesktopWindowStatus", "desktop runtime must expose window health.");
requireIncludes(rendererSource, "closeActiveShift", "renderer must keep explicit shift close workflow.");
requireIncludes(rendererSource, "openShift", "renderer must keep manual shift open workflow.");
requireIncludes(modernRendererSource, "withDesktopTimeout", "modern renderer must guard sign-in stalls.");
requireIncludes(desktopStabilityGate, "rendererReadyTimeoutMs", "desktop stability gate must guard black-screen recovery.");
requireIncludes(deploymentDoc, "clean Windows user profile", "deployment doc must require clean profile install testing.");
requireIncludes(deploymentDoc, "Check updates", "deployment doc must cover manual update checks.");
requireIncludes(soakDoc, "full trading-day simulation", "soak plan must define a trading-day soak.");
requireIncludes(soakDoc, "does not automatically create a new shift", "soak plan must guard the shift-close regression.");
requireIncludes(soakDoc, "logged-in seller", "soak plan must guard the seller-attribution regression.");

console.log("Desktop soak gate passed.");
