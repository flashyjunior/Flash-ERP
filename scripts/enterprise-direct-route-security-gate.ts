import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");
}

function requireIncludes(relativePath: string, expected: readonly string[]) {
  const source = read(relativePath);

  for (const value of expected) {
    assert.ok(
      source.includes(value),
      `${relativePath} must contain ${JSON.stringify(value)}.`,
    );
  }

  return source;
}

for (const relativePath of [
  "apps/enterprise-web/src/app/fuel-operations/page.tsx",
  "apps/enterprise-web/src/app/fuel-operations/_fuel-page.tsx",
] as const) {
  requireIncludes(relativePath, [
    "requireEnterprisePermission",
    'await requireEnterprisePermission(["fuel.hq.view"]);',
  ]);
}

requireIncludes("apps/enterprise-web/src/app/online-store/page.tsx", [
  "requireEnterpriseSession",
  "session.isOnlineStoreUser",
  '"pos.sale.process"',
  'redirect("/unauthorized")',
]);

const onlineFuelPage = requireIncludes(
  "apps/enterprise-web/src/app/online-store/fuel/_fuel-page.tsx",
  [
    "requireEnterpriseSession",
    "if (!session.isOnlineStoreUser)",
    'redirect("/unauthorized")',
    "onlineStoreFuelViewPermissions[view].every",
  ],
);

assert.ok(
  !onlineFuelPage.includes(": [...onlineStoreFuelViews]"),
  "Online POS fuel routes must not grant every fuel view to a non-store session.",
);

console.log("Enterprise direct-route security gate passed.");
