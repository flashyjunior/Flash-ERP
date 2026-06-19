import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");

function requireFile(relativePath: string) {
  const absolutePath = path.join(workspaceRoot, relativePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Missing required desktop file: ${relativePath}`);
  }

  return readFileSync(absolutePath, "utf8");
}

function requireIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`Desktop smoke check failed: ${label}`);
  }
}

const desktopPackage = JSON.parse(requireFile("apps/store-desktop/package.json")) as {
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};
const mainSource = requireFile("apps/store-desktop/electron/main.ts");
const builderConfig = requireFile("apps/store-desktop/electron-builder.config.cjs");
const preloadSource = requireFile("apps/store-desktop/electron/preload.ts");
const rendererSource = requireFile(
  "apps/store-desktop/src/renderer/modern-app.tsx",
);
const rendererStyles = requireFile(
  "apps/store-desktop/src/renderer/modern-styles.css",
);
const runtimeSource = requireFile("apps/store-desktop/src/shared/desktop-runtime.ts");
const serviceSource = requireFile("apps/store-desktop/src/main/offline/local-store-service.ts");

for (const dependency of ["electron-updater", "pg", "@flash-erp/sync-core"]) {
  if (!desktopPackage.dependencies?.[dependency]) {
    throw new Error(`Desktop package must declare runtime dependency ${dependency}.`);
  }
}

for (const scriptName of ["build", "preview", "dist:win", "smoke"]) {
  if (!desktopPackage.scripts?.[scriptName]) {
    throw new Error(`Desktop package is missing script ${scriptName}.`);
  }
}

requireIncludes(mainSource, "getDesktopSupportLogPath", "main process exposes support log diagnostics");
requireIncludes(mainSource, "FLASH_ERP_DESKTOP_UPDATE_URL", "runtime config stores update feed URL");
requireIncludes(builderConfig, "updates.flashcodesolutions.com", "packager keeps first-run update metadata");
requireIncludes(mainSource, "runtime status unavailable", "runtime status fails soft");
requireIncludes(mainSource, "flash-erp:get-store-runtime-status", "runtime status IPC is registered");
requireIncludes(preloadSource, "getStoreRuntimeStatus", "preload exposes runtime status");
requireIncludes(
  rendererSource,
  'className="rms-typeahead rms-reference-typeahead"',
  "transaction reference suggestions use a positioned typeahead container",
);
requireIncludes(
  rendererSource,
  "Searching saved references...",
  "transaction reference lookup exposes visible search feedback",
);
requireIncludes(
  rendererStyles,
  ".rms-reference-typeahead",
  "transaction reference typeahead styling is present",
);
requireIncludes(
  rendererSource,
  "!line.hasManualDiscountOverride || line.discountAmount <= 0",
  "configured POS discount selection survives without a promotion label",
);
requireIncludes(runtimeSource, "runSyncCycle", "desktop runtime contract exposes manual sync");
requireIncludes(serviceSource, "promotion_snapshot", "offline schema keeps promotion snapshots");
requireIncludes(serviceSource, "eligible_store_codes_json", "advanced promotion eligibility syncs locally");

console.log("Desktop smoke check passed.");
