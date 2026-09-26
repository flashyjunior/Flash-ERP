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
const localSchemaSource = requireFile(
  "apps/store-desktop/src/main/offline/local-store-schema.ts",
);
const postgresSchemaSource = requireFile(
  "apps/store-desktop/src/main/postgres/store-postgres-schema.sql",
);
const mssqlSchemaSource = requireFile(
  "apps/store-desktop/src/main/mssql/store-mssql-schema.sql",
);
const companyLogoUploadSource = requireFile(
  "apps/enterprise-web/src/app/api/settings/company-logo/route.ts",
);
const loginBackgroundUploadSource = requireFile(
  "apps/enterprise-web/src/app/api/settings/login-background/route.ts",
);
const companyMediaStorageSource = requireFile(
  "apps/enterprise-web/src/server/files/company-media-storage.ts",
);
const companyMediaRouteSource = requireFile(
  "apps/enterprise-web/src/app/api/media/company/[fileName]/route.ts",
);

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
requireIncludes(
  mainSource,
  "supportLogPath: getDesktopSupportLogPath()",
  "desktop setup response includes the exact support log path",
);
requireIncludes(
  rendererSource,
  "Support log file",
  "desktop setup displays the support log path",
);
requireIncludes(
  rendererSource,
  "rms-login-background-image",
  "login branding uses an image layer that supports large synced backgrounds",
);
requireIncludes(
  companyLogoUploadSource,
  "buildCompanyMediaUrl",
  "HQ stores company logos behind the durable company-media route",
);
requireIncludes(
  loginBackgroundUploadSource,
  "buildCompanyMediaUrl",
  "HQ stores login backgrounds behind the durable company-media route",
);
requireIncludes(
  companyMediaStorageSource,
  "FLASH_ERP_PUBLIC_MEDIA_ROOT",
  "company media supports an explicit deployment-stable storage root",
);
requireIncludes(
  companyMediaStorageSource,
  '"shared", "public-media"',
  "versioned VPS releases default company media into shared storage",
);
requireIncludes(
  companyMediaStorageSource,
  '"login-backgrounds"',
  "company media reads legacy login-background folders during upgrade",
);
requireIncludes(
  companyMediaRouteSource,
  "readCompanyMediaFile",
  "the public sign-in page can stream saved company media without authentication",
);
requireIncludes(mainSource, "FLASH_ERP_DESKTOP_UPDATE_URL", "runtime config stores update feed URL");
requireIncludes(
  builderConfig,
  "https://flashcodesolutions.com.gh/rms-update/erp/",
  "packager keeps the production desktop update feed",
);
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
requireIncludes(
  runtimeSource,
  "resolveInventoryTransferUom",
  "desktop transfer requests convert entered UOM quantities to base quantities",
);
requireIncludes(
  rendererSource,
  'className="rms-dialog rms-wide-dialog rms-stock-request-dialog"',
  "stock request uses the full-size document dialog",
);
requireIncludes(
  rendererStyles,
  ".rms-stock-request-dialog > .rms-workspace-tabs",
  "stock request tabs retain normal control height",
);
requireIncludes(
  rendererStyles,
  "grid-template-rows: auto minmax(0, 1fr) auto",
  "desktop sidebar reserves a scrollable navigation track",
);
requireIncludes(
  rendererStyles,
  "scrollbar-gutter: stable",
  "desktop navigation exposes a stable vertical scrollbar",
);

for (const [schemaSource, provider] of [
  [localSchemaSource, "SQLite"],
  [postgresSchemaSource, "PostgreSQL"],
  [mssqlSchemaSource, "SQL Server"],
] as const) {
  requireIncludes(
    schemaSource,
    "requested_unit_of_measure",
    `${provider} transfer schema stores the requested UOM`,
  );
  requireIncludes(
    schemaSource,
    "uom_conversion_factor",
    `${provider} transfer schema stores the base-unit conversion`,
  );
}

console.log("Desktop smoke check passed.");
