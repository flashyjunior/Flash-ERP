import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

function requireFile(relativePath: string) {
  const absolutePath = path.join(workspaceRoot, relativePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Desktop stability gate is missing ${relativePath}.`);
  }

  return readFileSync(absolutePath, "utf8");
}

function requireIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`Desktop stability gate failed: ${label}`);
  }
}

const runtimeTypes = requireFile("apps/store-desktop/src/shared/desktop-runtime.ts");
const mainProcess = requireFile("apps/store-desktop/electron/main.ts");
const preload = requireFile("apps/store-desktop/electron/preload.ts");
const renderer = requireFile("apps/store-desktop/src/renderer/modern-app.tsx");
const soakDoc = requireFile("docs/12-production-certification-and-soak-plan.md");
const parityChecklist = requireFile("docs/08-ivend-parity-checklist.md");

requireIncludes(runtimeTypes, "StoreDesktopWindowStatus", "runtime contract must expose window health.");
requireIncludes(runtimeTypes, "watchdogState", "runtime contract must expose watchdog state.");
requireIncludes(runtimeTypes, "heartbeatAgeMs", "runtime contract must expose heartbeat age.");
requireIncludes(runtimeTypes, "readyTimeoutCount", "runtime contract must expose ready timeout count.");
requireIncludes(runtimeTypes, "getDesktopWindowStatus", "runtime API must expose window status.");
requireIncludes(runtimeTypes, "recoverDesktopWindow", "runtime API must expose manual window recovery.");
requireIncludes(runtimeTypes, "notifyRendererReady", "runtime API must expose renderer-ready reporting.");
requireIncludes(runtimeTypes, "reportRendererHeartbeat", "runtime API must expose renderer heartbeat reporting.");

requireIncludes(mainProcess, "desktop-window-state.json", "main process must persist window state.");
requireIncludes(mainProcess, "sanitizeWindowBounds", "main process must sanitize restored bounds.");
requireIncludes(mainProcess, "rendererReadyTimeoutMs", "main process must detect black-screen startup.");
requireIncludes(mainProcess, "rendererHeartbeatRecoveryMs", "main process must recover stale renderer heartbeats.");
requireIncludes(mainProcess, "rendererRecoveryCooldownMs", "main process must throttle repeated recovery attempts.");
requireIncludes(mainProcess, "startRendererWatchdog", "main process must run renderer heartbeat watchdog.");
requireIncludes(mainProcess, "renderer-unresponsive", "main process must recover unresponsive renderers.");
requireIncludes(mainProcess, "render-process-gone", "main process must recover crashed renderers.");
requireIncludes(mainProcess, "desktopWindowRecoveryInFlight", "main process must track in-flight recovery.");
requireIncludes(mainProcess, "flash-erp:get-desktop-window-status", "main process must expose window status IPC.");
requireIncludes(mainProcess, "flash-erp:recover-desktop-window", "main process must expose recovery IPC.");

requireIncludes(preload, "notifyRendererReady", "preload must expose renderer-ready IPC.");
requireIncludes(preload, "reportRendererHeartbeat", "preload must expose renderer heartbeat IPC.");
requireIncludes(preload, "recoverDesktopWindow", "preload must expose manual recovery.");

requireIncludes(renderer, "withDesktopTimeout", "renderer must timeout stalled sign-in/unlock calls.");
requireIncludes(renderer, "Sync snapshot refresh", "renderer must timeout stalled snapshot refreshes.");
requireIncludes(renderer, "loginIdInputRef", "renderer must restore sign-in input focus.");
requireIncludes(renderer, "notifyRendererReady", "renderer must report ready state.");
requireIncludes(renderer, "reportRendererHeartbeat", "renderer must send heartbeats.");
requireIncludes(renderer, "Renderer watchdog", "runtime UI must expose watchdog status.");
requireIncludes(renderer, "stale heartbeats", "runtime UI must show stale heartbeat diagnostics.");
requireIncludes(renderer, "Recover", "runtime UI must expose manual recovery.");

requireIncludes(soakDoc, "renderer watchdog", "soak plan must include renderer watchdog evidence.");
requireIncludes(soakDoc, "stale heartbeat", "soak plan must include stale heartbeat evidence.");
requireIncludes(soakDoc, "sign-in stall", "soak plan must include sign-in stall evidence.");
requireIncludes(parityChecklist, "Desktop stability hardening", "parity checklist must track desktop stability hardening.");

console.log("Desktop stability gate passed.");
