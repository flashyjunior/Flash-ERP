import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");
const requireText = (source: string, value: string, message: string) =>
  assert.ok(source.includes(value), message);

const deployer = read("scripts/deploy-flash-erp-vps-from-git.ps1");
const launcher = read("Deploy-FlashERP-VPS.cmd");

for (const contract of [
  "git status --porcelain --untracked-files=no",
  "git pull --ff-only $Remote $Branch",
  "Relaunching the current deployment script after the Git update",
  "node_modules\\.flash-erp-package-lock.sha256",
  "npm.cmd ci",
  "acceptance:trial-lifecycle",
  "acceptance:enterprise-authorization",
  "acceptance:sales-order-collections",
  "acceptance:online-store-parity",
  "acceptance:transfer-requests",
  "acceptance:transfer-publication",
  "npm.cmd run build:deploy",
  "package-flash-erp-vps-release.ps1",
  ".sha256.txt",
  "manifest.deploymentScript",
  "FlashRMSHQ",
  "reconciliation.status",
  "api/system/database-readiness",
  "FlashERPEdge",
]) {
  requireText(deployer, contract, `The one-command deployer must retain ${contract}.`);
}

requireText(
  launcher,
  "scripts\\deploy-flash-erp-vps-from-git.ps1",
  "The stable launcher must invoke the governed PowerShell entrypoint.",
);
assert.ok(
  !deployer.includes("password="),
  "The one-command deployer must not contain a database password.",
);

console.log("Flash ERP one-command VPS deployment contract passed.");
