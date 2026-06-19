import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appDir, "..", "..");
const appNodeModules = path.join(appDir, "node_modules");
const rootNodeModules = path.join(repoRoot, "node_modules");
const targetNodeModules = path.join(appDir, "sync-runtime-node_modules");

const seedPackages = ["@flash-erp/domain", "@flash-erp/sync-core", "bcryptjs", "dotenv", "mssql", "pg"];
const copiedBySource = new Set();
const queued = seedPackages.map((packageName) => ({ packageName, fromDir: appDir }));

function assertInside(parent, target) {
  const relative = path.relative(parent, target);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to stage outside ${parent}: ${target}`);
  }
}

function readPackageJson(packageJsonPath) {
  return JSON.parse(readFileSync(packageJsonPath, "utf8"));
}

function getPackagePathParts(packageName) {
  return packageName.startsWith("@") ? packageName.split("/") : [packageName];
}

function resolvePackageJson(packageName, fromDir = appDir) {
  let currentDir = fromDir;
  const packagePathParts = getPackagePathParts(packageName);

  while (true) {
    const candidate = path.join(currentDir, "node_modules", ...packagePathParts, "package.json");

    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  const error = new Error(`Cannot resolve ${packageName} from ${fromDir}`);
  error.code = "MODULE_NOT_FOUND";
  throw error;
}

function getPackageRelativePath(packageDir) {
  const sourceRoots = [appNodeModules, rootNodeModules];

  for (const sourceRoot of sourceRoots) {
    const relative = path.relative(sourceRoot, packageDir);

    if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
      return relative;
    }
  }

  throw new Error(`Cannot determine node_modules-relative path for ${packageDir}`);
}

function enqueueDependencyNames(packageJson, fromDir) {
  for (const dependencyGroup of [packageJson.dependencies, packageJson.optionalDependencies]) {
    for (const dependencyName of Object.keys(dependencyGroup ?? {})) {
      queued.push({ packageName: dependencyName, fromDir });
    }
  }
}

rmSync(targetNodeModules, { recursive: true, force: true });
mkdirSync(targetNodeModules, { recursive: true });

while (queued.length > 0) {
  const { packageName, fromDir } = queued.shift();

  let packageJsonPath;
  try {
    packageJsonPath = resolvePackageJson(packageName, fromDir);
  } catch (error) {
    if (error?.code === "MODULE_NOT_FOUND") {
      continue;
    }

    throw error;
  }

  const packageDir = path.dirname(packageJsonPath);
  const realSourceKey = path.resolve(packageDir).toLowerCase();

  if (copiedBySource.has(realSourceKey)) {
    continue;
  }

  copiedBySource.add(realSourceKey);

  const relativePackagePath = getPackageRelativePath(packageDir);
  const targetDir = path.join(targetNodeModules, relativePackagePath);

  assertInside(targetNodeModules, targetDir);
  mkdirSync(path.dirname(targetDir), { recursive: true });
  cpSync(packageDir, targetDir, {
    recursive: true,
    filter(source) {
      return !source.includes(`${path.sep}.bin${path.sep}`);
    }
  });

  const stagedPackageJsonPath = path.join(targetDir, "package.json");

  if (existsSync(stagedPackageJsonPath)) {
    enqueueDependencyNames(readPackageJson(stagedPackageJsonPath), packageDir);
  }
}

console.log(`Staged ${copiedBySource.size} sync runtime package(s).`);
