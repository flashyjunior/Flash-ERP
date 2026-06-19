import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appDir, "..", "..");
const scopedNodeModules = path.join(appDir, "node_modules", "@flash-erp");

const workspacePackages = ["domain", "sync-core"];

function assertInside(parent, target) {
  const relative = path.relative(parent, target);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to stage outside ${parent}: ${target}`);
  }
}

mkdirSync(scopedNodeModules, { recursive: true });

for (const packageName of workspacePackages) {
  const sourceDir = path.join(repoRoot, "packages", packageName);
  const sourceDistDir = path.join(sourceDir, "dist");
  const sourcePackageJson = path.join(sourceDir, "package.json");
  const targetDir = path.join(scopedNodeModules, packageName);

  if (!existsSync(sourceDistDir)) {
    throw new Error(`Build ${packageName} before packaging. Missing ${sourceDistDir}`);
  }

  assertInside(scopedNodeModules, targetDir);
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  cpSync(sourcePackageJson, path.join(targetDir, "package.json"));
  cpSync(sourceDistDir, path.join(targetDir, "dist"), { recursive: true });
}

console.log(`Staged ${workspacePackages.length} Flash ERP workspace package(s) for desktop packaging.`);
