import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

function requireFile(relativePath: string) {
  const absolutePath = path.join(workspaceRoot, relativePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Installed desktop soak gate is missing ${relativePath}.`);
  }

  return readFileSync(absolutePath, "utf8");
}

function requireIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`Installed desktop soak gate failed: ${label}`);
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
const modernRenderer = requireFile("apps/store-desktop/src/renderer/modern-app.tsx");
const desktopRuntime = requireFile("apps/store-desktop/src/shared/desktop-runtime.ts");
const desktopStabilityGate = requireFile("scripts/desktop-stability-gates.ts");
const soakGate = requireFile("scripts/desktop-soak-gate.ts");
const deploymentDoc = requireFile("docs/10-store-desktop-production-deployment.md");
const certificationPlan = requireFile("docs/12-production-certification-and-soak-plan.md");
const hardeningPack = requireFile("docs/15-production-hardening-execution-pack.md");
const uatEvidence = requireFile("docs/14-uat-evidence-log.md");

if (!rootPackage.scripts?.["cert:installed-soak"]) {
  throw new Error("Root package.json must expose cert:installed-soak.");
}

for (const scriptName of ["dist:win", "publish:win", "smoke", "typecheck"]) {
  if (!desktopPackage.scripts?.[scriptName]) {
    throw new Error(`Desktop package must expose ${scriptName}.`);
  }
}

requireIncludes(builderConfig, "perMachine", "installed soak must use the per-machine Windows package.");
requireIncludes(mainSource, "getDesktopSupportLogPath", "installed runtime must expose durable support log path.");
requireIncludes(mainSource, "desktop-window-state.json", "installed runtime must persist window bounds.");
requireIncludes(mainSource, "rendererReadyTimeoutMs", "installed runtime must recover black-screen startup.");
requireIncludes(mainSource, "rendererHeartbeatRecoveryMs", "installed runtime must recover stale renderers.");
requireIncludes(mainSource, "rendererRecoveryCooldownMs", "installed runtime must throttle recovery loops.");
requireIncludes(mainSource, "runSyncCycleFromTray", "installed runtime must expose tray sync.");
requireIncludes(preloadSource, "notifyRendererReady", "preload must report renderer readiness.");
requireIncludes(preloadSource, "reportRendererHeartbeat", "preload must report renderer heartbeat.");
requireIncludes(preloadSource, "recoverDesktopWindow", "preload must expose manual recovery.");
requireIncludes(desktopRuntime, "StoreDesktopWindowStatus", "desktop runtime contract must expose watchdog status.");
requireIncludes(desktopRuntime, "lastManualSyncAt", "desktop runtime contract must expose sync posture.");
requireIncludes(modernRenderer, "withDesktopTimeout", "renderer must release stalled sign-in actions.");
requireIncludes(modernRenderer, "recoverDesktopWindow", "renderer must expose recover action.");
requireIncludes(modernRenderer, "Renderer watchdog", "renderer must surface watchdog evidence.");
requireIncludes(desktopStabilityGate, "rendererReadyTimeoutMs", "desktop stability gate must guard black-screen recovery.");
requireIncludes(soakGate, "full trading-day simulation", "desktop soak gate must guard trading-day requirements.");
requireIncludes(deploymentDoc, "clean Windows user profile", "deployment doc must require clean profile install.");
requireIncludes(certificationPlan, "installed Windows package", "certification plan must require installed app soak.");
requireIncludes(hardeningPack, "Slice 2: Installed Desktop Soak", "hardening pack must include installed soak slice.");
requireIncludes(hardeningPack, "no lost local queue rows", "hardening pack must define local queue pass criteria.");
requireIncludes(uatEvidence, "Installed desktop soak execution", "UAT log must include installed soak evidence row.");

console.log("Installed desktop soak evidence gate passed.");
