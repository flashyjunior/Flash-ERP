import { spawnSync } from "node:child_process";
import { realpathSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = realpathSync.native(path.resolve(scriptDirectory, ".."));
const enterpriseWebDirectory = realpathSync.native(
  path.join(repositoryRoot, "apps/enterprise-web"),
);
const nodeExecutable = realpathSync.native(process.execPath);
const prismaCliPath = path.join(
  repositoryRoot,
  "node_modules/prisma/build/index.js",
);
const nextCliPath = path.join(repositoryRoot, "node_modules/next/dist/bin/next");
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
  INIT_CWD: repositoryRoot,
  NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED || "1",
  NODE_OPTIONS: nodeOptions,
  PWD: repositoryRoot,
  PROJECT_CWD: repositoryRoot,
  npm_config_local_prefix: repositoryRoot,
};

process.chdir(repositoryRoot);
console.log(`[deploy-build] Canonical repository root: ${repositoryRoot}.`);

const nextBuildDirectory = path.join(enterpriseWebDirectory, ".next");
console.log(`[deploy-build] Removing stale Next output from ${nextBuildDirectory}.`);
rmSync(nextBuildDirectory, { recursive: true, force: true });

console.log(
  `[deploy-build] Building enterprise web with Webpack, ${workerCount} Next worker(s), and Node heap cap ${memoryMb} MB.`,
);

const prismaResult = spawnSync(
  nodeExecutable,
  [
    prismaCliPath,
    "generate",
    "--schema",
    path.join(repositoryRoot, "prisma/schema.prisma"),
  ],
  { cwd: enterpriseWebDirectory, env, stdio: "inherit" },
);

if (prismaResult.error) {
  console.error(prismaResult.error);
  process.exit(1);
}

if (prismaResult.signal || prismaResult.status !== 0) {
  console.error(
    prismaResult.signal
      ? `[deploy-build] Prisma generation stopped by signal ${prismaResult.signal}.`
      : `[deploy-build] Prisma generation failed with exit code ${prismaResult.status}.`,
  );
  process.exit(prismaResult.status ?? 1);
}

const result = spawnSync(nodeExecutable, [nextCliPath, "build", "--webpack"], {
  cwd: enterpriseWebDirectory,
  env,
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
