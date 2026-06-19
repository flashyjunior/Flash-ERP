import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

function requireFile(relativePath: string) {
  const absolutePath = path.join(workspaceRoot, relativePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Hardware execution gate is missing ${relativePath}.`);
  }

  return readFileSync(absolutePath, "utf8");
}

function requireIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`Hardware execution gate failed: ${label}`);
  }
}

const rootPackage = JSON.parse(requireFile("package.json")) as {
  scripts?: Record<string, string>;
};
const mainSource = requireFile("apps/store-desktop/electron/main.ts");
const preloadSource = requireFile("apps/store-desktop/electron/preload.ts");
const runtimeSource = requireFile("apps/store-desktop/src/shared/desktop-runtime.ts");
const classicRenderer = requireFile("apps/store-desktop/src/renderer/app.tsx");
const modernRenderer = requireFile("apps/store-desktop/src/renderer/modern-app.tsx");
const hardwareGate = requireFile("scripts/desktop-hardware-certification-gate.ts");
const hardwareMatrix = requireFile("docs/13-desktop-hardware-certification-matrix.md");
const deploymentDoc = requireFile("docs/10-store-desktop-production-deployment.md");
const hardeningPack = requireFile("docs/15-production-hardening-execution-pack.md");
const uatEvidence = requireFile("docs/14-uat-evidence-log.md");

if (!rootPackage.scripts?.["cert:hardware-execution"]) {
  throw new Error("Root package.json must expose cert:hardware-execution.");
}

for (const [source, label] of [
  [mainSource, "main process"],
  [preloadSource, "preload bridge"],
  [runtimeSource, "desktop runtime"]
] as const) {
  requireIncludes(source, "listReceiptPrinters", `${label} must expose printer listing.`);
  requireIncludes(source, "printThermalTestSlip", `${label} must expose thermal test slips.`);
  requireIncludes(source, "kickCashDrawer", `${label} must expose cash drawer kicks.`);
}

requireIncludes(mainSource, "openReceiptPrintWindow", "main process must print receipts.");
requireIncludes(mainSource, "openShiftReportPrintWindow", "main process must print X/Z shift reports.");
requireIncludes(preloadSource, "printReceipt", "preload must expose receipt printing.");
requireIncludes(preloadSource, "printShiftReport", "preload must expose shift report printing.");
requireIncludes(runtimeSource, "gatewayProvider", "runtime must expose payment gateway metadata for tender certification.");
requireIncludes(runtimeSource, "gatewayStatus", "runtime must expose gateway readiness posture.");
requireIncludes(classicRenderer, "scannerKeepFocus", "classic renderer must guard scanner focus.");
requireIncludes(classicRenderer, "scannerSubmitMode", "classic renderer must expose scanner workflow modes.");
requireIncludes(modernRenderer, "scanQuery", "modern renderer must expose scanner lane.");
requireIncludes(modernRenderer, "printReceipt", "modern renderer must expose receipt print/reprint.");
requireIncludes(modernRenderer, "printShiftReport", "modern renderer must expose X/Z print workflow.");
requireIncludes(hardwareGate, "Payment terminal", "existing hardware gate must keep payment terminal scope.");
requireIncludes(hardwareMatrix, "Device model", "hardware matrix must require actual device model evidence.");
requireIncludes(hardwareMatrix, "driver version", "hardware matrix must require driver evidence.");
requireIncludes(hardwareMatrix, "after every desktop version upgrade", "hardware matrix must require regression checks.");
requireIncludes(deploymentDoc, "Receipt printer", "deployment doc must cover receipt printers.");
requireIncludes(hardeningPack, "Slice 4: Hardware Execution", "hardening pack must include hardware execution slice.");
requireIncludes(hardeningPack, "Approved, declined, voided, and offline tender handling", "hardware pack must cover payment terminal outcomes.");
requireIncludes(uatEvidence, "Hardware execution sign-off", "UAT log must include hardware execution evidence row.");

console.log("Hardware execution evidence gate passed.");
