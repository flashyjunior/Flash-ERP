import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function appendNodeOption(existing, option) {
  if (!existing?.trim()) {
    return option;
  }

  return `${existing.trim()} ${option}`;
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const memoryMb = parsePositiveInteger(process.env.FLASH_ERP_NEXT_BUILD_MEMORY_MB, 1024);
const workerCount = parsePositiveInteger(process.env.FLASH_ERP_NEXT_BUILD_CPUS, 1);
const existingNodeOptions = process.env.NODE_OPTIONS ?? "";
const nodeOptions = /\b--max-old-space-size(?:=|\s+)/.test(existingNodeOptions)
  ? existingNodeOptions
  : appendNodeOption(existingNodeOptions, `--max-old-space-size=${memoryMb}`);

const env = {
  ...process.env,
  FLASH_ERP_DEPLOY_BUILD: "1",
  FLASH_ERP_NEXT_BUILD_CPUS: String(workerCount),
  NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED || "1",
  NODE_OPTIONS: nodeOptions,
};

const nextBuildDirectory = path.resolve("apps/enterprise-web/.next");
console.log(`[deploy-build] Removing stale Next output from ${nextBuildDirectory}.`);
rmSync(nextBuildDirectory, { recursive: true, force: true });

console.log(
  `[deploy-build] Building enterprise web with ${workerCount} Next worker(s) and Node heap cap ${memoryMb} MB.`,
);

const result = spawnSync(npmCommand, ["--workspace", "@flash-erp/enterprise-web", "run", "build"], {
  env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (result.signal) {
  console.error(`[deploy-build] Enterprise build stopped by signal ${result.signal}.`);
  process.exit(1);
}

process.exit(result.status ?? 0);
