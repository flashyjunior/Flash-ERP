import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

function requireFile(relativePath: string) {
  const absolutePath = path.join(workspaceRoot, relativePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Hardware certification gate is missing ${relativePath}.`);
  }

  return readFileSync(absolutePath, "utf8");
}

function requireIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`Hardware certification gate failed: ${label}`);
  }
}

const mainSource = requireFile("apps/store-desktop/electron/main.ts");
const preloadSource = requireFile("apps/store-desktop/electron/preload.ts");
const runtimeSource = requireFile("apps/store-desktop/src/shared/desktop-runtime.ts");
const rendererSource = requireFile("apps/store-desktop/src/renderer/app.tsx");
const deploymentDoc = requireFile("docs/10-store-desktop-production-deployment.md");
const hardwareMatrix = requireFile("docs/13-desktop-hardware-certification-matrix.md");

requireIncludes(mainSource, "listReceiptPrinters", "main process must list receipt printers.");
requireIncludes(mainSource, "printThermalTestSlip", "main process must print a thermal test slip.");
requireIncludes(mainSource, "kickCashDrawer", "main process must expose cash drawer kick.");
requireIncludes(mainSource, "openShiftReportPrintWindow", "main process must print shift reports.");
requireIncludes(preloadSource, "listReceiptPrinters", "preload must expose printer listing.");
requireIncludes(preloadSource, "printThermalTestSlip", "preload must expose test slip printing.");
requireIncludes(preloadSource, "kickCashDrawer", "preload must expose cash drawer kick.");
requireIncludes(runtimeSource, "StoreReceiptPrinterSettingsInput", "runtime contract must include printer settings.");
requireIncludes(runtimeSource, "StoreCashDrawerKickRequest", "runtime contract must include cash drawer request.");
requireIncludes(rendererSource, "scanQuery", "renderer must keep barcode scanner workflow state.");
requireIncludes(rendererSource, "printThermalTestSlip", "renderer must expose hardware test printing.");
requireIncludes(rendererSource, "kickCashDrawer", "renderer must expose drawer test action.");
requireIncludes(deploymentDoc, "Receipt printer", "deployment doc must include peripheral readiness.");
requireIncludes(hardwareMatrix, "Barcode scanner", "hardware matrix must include barcode scanner certification.");
requireIncludes(hardwareMatrix, "Payment terminal", "hardware matrix must include payment terminal certification.");
requireIncludes(hardwareMatrix, "npm run cert:hardware", "hardware matrix must name the repo gate.");

console.log("Desktop hardware certification gate passed.");
