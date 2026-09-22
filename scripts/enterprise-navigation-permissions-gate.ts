import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  enterpriseNavigationSections,
  filterEnterpriseNavigationSections,
  type EnterpriseNavigationMenuItem
} from "../apps/enterprise-web/src/lib/navigation/enterprise-navigation.ts";
import { securityPermissionCatalog } from "../packages/domain/src/security-permissions.ts";
import { securityPermissionCatalog as runtimeSecurityPermissionCatalog } from "../packages/domain/src/security-permissions.js";

const permissionCodes = new Set(securityPermissionCatalog.map((permission) => permission.code));
const seenSectionKeys = new Set<string>();
const seenRoutes = new Set<string>();
const navigationPermissionCodes = new Set<string>();

assert.deepEqual(
  runtimeSecurityPermissionCatalog,
  securityPermissionCatalog,
  "The runtime JavaScript permission catalogue must match its TypeScript source."
);

function sectionItems(section: (typeof enterpriseNavigationSections)[number]) {
  return section.groups
    ? section.groups.flatMap((group) => group.items)
    : [...(section.items ?? [])];
}

function assertPermissionCoverage(
  owner: string,
  requiredPermissions: readonly string[]
) {
  assert.ok(requiredPermissions.length > 0, `${owner} has no explicit permission requirement.`);

  for (const permissionCode of requiredPermissions) {
    assert.ok(
      permissionCodes.has(permissionCode),
      `${owner} references missing permission catalogue entry ${permissionCode}.`
    );
    navigationPermissionCodes.add(permissionCode);
  }
}

for (const section of enterpriseNavigationSections) {
  assert.ok(!seenSectionKeys.has(section.key), `Duplicate navigation section key ${section.key}.`);
  seenSectionKeys.add(section.key);
  assert.ok(section.href.startsWith("/"), `${section.key} has an invalid landing route.`);
  assertPermissionCoverage(`Section ${section.key}`, section.requiredPermissions);

  const items = sectionItems(section);
  if (section.items || section.groups) {
    assert.ok(items.length > 0, `Section ${section.key} declares an empty child menu.`);
  }

  for (const item of items) {
    const routeIdentity = `${section.audience}:${item.href}`;
    assert.ok(!seenRoutes.has(routeIdentity), `Duplicate menu route ${routeIdentity}.`);
    seenRoutes.add(routeIdentity);
    assert.ok(item.href.startsWith("/"), `${section.key}/${item.key} has an invalid route.`);
    assertPermissionCoverage(`Menu item ${section.key}/${item.key}`, item.requiredPermissions);

    for (const permissionCode of item.requiredPermissions) {
      assert.ok(
        section.requiredPermissions.includes(permissionCode),
        `Section ${section.key} does not declare child permission ${permissionCode}.`
      );
    }
  }
}

const licensesItem = enterpriseNavigationSections
  .flatMap(sectionItems)
  .find((item: EnterpriseNavigationMenuItem) => item.href === "/settings/licenses");
assert.deepEqual(
  licensesItem?.requiredPermissions,
  ["settings.license.manage"],
  "Licensing must use only settings.license.manage."
);

const dataPurgeItem = enterpriseNavigationSections
  .flatMap(sectionItems)
  .find((item: EnterpriseNavigationMenuItem) => item.href === "/security/data-purge");
assert.deepEqual(
  dataPurgeItem?.requiredPermissions,
  ["security.data-purge.execute"],
  "Data Purge must retain its dedicated sensitive permission."
);

assert.deepEqual(
  filterEnterpriseNavigationSections("enterprise", new Set()),
  [],
  "A session without direct permissions must not receive Enterprise navigation."
);

const customerOnlyNavigation = filterEnterpriseNavigationSections(
  "enterprise",
  new Set(["master.customer.manage"])
);
assert.deepEqual(
  customerOnlyNavigation.map((section) => section.key),
  ["master"],
  "A narrowly privileged user must see only the authorized parent."
);
assert.deepEqual(
  sectionItems(customerOnlyNavigation[0]).map((item) => item.href),
  ["/master/customers"],
  "Unauthorized sibling routes must not be rendered."
);

for (const permissionCode of navigationPermissionCodes) {
  const filtered = [
    ...filterEnterpriseNavigationSections("enterprise", new Set([permissionCode])),
    ...filterEnterpriseNavigationSections("online-store", new Set([permissionCode]))
  ];

  for (const section of filtered) {
    if (section.items || section.groups) {
      assert.ok(
        sectionItems(section).length > 0,
        `Permission ${permissionCode} exposed empty parent ${section.key}.`
      );
    }
  }
}

const migrationPaths = [
  resolve("prisma/migrations-sqlserver/20260922030000_navigation_permission_coverage/migration.sql"),
  resolve("prisma/migrations-sqlserver/20260922040000_finance_fuel_permissions/migration.sql")
];
const migrationSql = migrationPaths
  .map((migrationPath) => readFileSync(migrationPath, "utf8"))
  .join("\n");
const firstGrantOffset = migrationSql.indexOf("INSERT INTO [dbo].[RolePermission]");
const permissionMergeOffset = migrationSql.indexOf("MERGE [dbo].[Permission]");

assert.ok(permissionMergeOffset >= 0, "Permission seed migration must upsert Permission rows.");
assert.ok(
  firstGrantOffset > permissionMergeOffset,
  "Permission rows must be inserted or updated before role grants."
);

for (const permissionCode of navigationPermissionCodes) {
  assert.ok(
    migrationSql.includes(`N'${permissionCode}'`),
    `Permission seed migration omits navigation permission ${permissionCode}.`
  );
}

assert.match(migrationSql, /\[role\]\.\[code\] = N'HQ_ADMIN'/);
assert.match(migrationSql, /\[permission\]\.\[code\] = N'settings\.license\.manage'/);
assert.match(migrationSql, /\[role\]\.\[code\] = N'FLASH_SUPPORT'/);
assert.ok(
  !migrationSql.includes("STORE_MANAGER"),
  "The navigation migration must not broaden Licensing or Security to store roles."
);

console.log(
  `Enterprise navigation permission gate passed for ${enterpriseNavigationSections.length} sections, ${seenRoutes.size} child routes, and ${navigationPermissionCodes.size} permission codes.`
);
