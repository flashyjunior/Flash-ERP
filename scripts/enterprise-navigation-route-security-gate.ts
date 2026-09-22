import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  enterpriseNavigationSections,
  type EnterpriseNavigationMenuItem
} from "../apps/enterprise-web/src/lib/navigation/enterprise-navigation";

type RouteExpectation = {
  file: string;
  permissions: readonly string[];
  any?: boolean;
  additionalMarkers?: readonly string[];
};

const repoRoot = process.cwd();
const appRoot = "apps/enterprise-web/src/app";
const excludedPrefixes = ["/finance", "/fuel-operations", "/online-store/fuel"];
const excludedRoutes = new Set(["/settings/fuel-operations"]);

function normalizeHref(href: string) {
  return href.split(/[?#]/, 1)[0] || "/";
}

function isScopedRoute(href: string) {
  const route = normalizeHref(href);
  return (
    !excludedRoutes.has(route) &&
    !excludedPrefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))
  );
}

function read(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

function simplePage(route: string, permissions: readonly string[]): RouteExpectation {
  return {
    file: route === "/" ? `${appRoot}/page.tsx` : `${appRoot}${route}/page.tsx`,
    permissions,
    additionalMarkers: ["requireEnterprisePermission"]
  };
}

const dynamicPageExpectations: Record<string, RouteExpectation> = {
  "/master/customers": {
    file: `${appRoot}/master/[view]/page.tsx`,
    permissions: ["master.customer.manage"]
  },
  "/master/suppliers": {
    file: `${appRoot}/master/[view]/page.tsx`,
    permissions: ["master.supplier.manage"]
  },
  "/master/tax": {
    file: `${appRoot}/master/[view]/page.tsx`,
    permissions: ["master.tax.manage"]
  },
  "/master/tenders": {
    file: `${appRoot}/master/[view]/page.tsx`,
    permissions: ["master.tender.manage"]
  },
  "/master/banks": {
    file: `${appRoot}/master/[view]/page.tsx`,
    permissions: ["master.bank.manage"]
  },
  "/master/departments": {
    file: `${appRoot}/master/[view]/page.tsx`,
    permissions: ["master.department.manage"]
  },
  "/master/categories": {
    file: `${appRoot}/master/[view]/page.tsx`,
    permissions: ["master.category.manage"]
  },
  "/master/uom": {
    file: `${appRoot}/master/[view]/page.tsx`,
    permissions: ["master.product.manage"]
  },
  "/master/loyalty": {
    file: `${appRoot}/master/[view]/page.tsx`,
    permissions: ["master.loyalty.manage"]
  },
  "/master/promotions": {
    file: `${appRoot}/master/[view]/page.tsx`,
    permissions: ["master.promotion.manage"]
  },
  "/settings/company": {
    file: `${appRoot}/settings/[view]/page.tsx`,
    permissions: ["settings.company.manage"]
  },
  "/settings/ldap": {
    file: `${appRoot}/settings/[view]/page.tsx`,
    permissions: ["settings.ldap.manage"]
  },
  "/settings/smtp": {
    file: `${appRoot}/settings/[view]/page.tsx`,
    permissions: ["settings.smtp.manage"]
  },
  "/settings/sms": {
    file: `${appRoot}/settings/[view]/page.tsx`,
    permissions: ["settings.sms.manage"]
  },
  "/settings/inventory-catalogs": {
    file: `${appRoot}/settings/[view]/page.tsx`,
    permissions: ["master.product.manage"]
  },
  "/settings/leave-types": {
    file: `${appRoot}/settings/[view]/page.tsx`,
    permissions: ["hr.leave.manage"]
  },
  "/settings/licenses": {
    file: `${appRoot}/settings/[view]/page.tsx`,
    permissions: ["settings.license.manage"]
  },
  "/settings/receipt-templates": {
    file: `${appRoot}/settings/[view]/page.tsx`,
    permissions: ["settings.receipt-template.manage"]
  },
  "/settings/retail-users": {
    file: `${appRoot}/settings/[view]/page.tsx`,
    permissions: ["settings.retail-user.manage"]
  },
  "/security/users": {
    file: `${appRoot}/security/[view]/page.tsx`,
    permissions: ["security.user.manage"]
  },
  "/security/roles-privileges": {
    file: `${appRoot}/security/[view]/page.tsx`,
    permissions: ["security.role.manage", "security.privilege.manage"],
    any: true
  },
  "/security/audit-logs": {
    file: `${appRoot}/security/[view]/page.tsx`,
    permissions: ["security.audit-log.view"]
  },
  "/security/online-users": {
    file: `${appRoot}/security/[view]/page.tsx`,
    permissions: ["security.online-user.view"]
  },
  "/security/password-policy": {
    file: `${appRoot}/security/[view]/page.tsx`,
    permissions: ["security.password-policy.manage"]
  },
  "/security/security-logs": {
    file: `${appRoot}/security/[view]/page.tsx`,
    permissions: ["security.log.view"]
  },
  "/security/data-purge": {
    file: `${appRoot}/security/[view]/page.tsx`,
    permissions: ["security.data-purge.execute"]
  }
};

const specialPageExpectations: Record<string, RouteExpectation> = {
  "/online-store": {
    file: `${appRoot}/online-store/page.tsx`,
    permissions: ["pos.sale.process"],
    additionalMarkers: ["requireEnterpriseSession", "session.isOnlineStoreUser"]
  },
  "/reports": {
    file: `${appRoot}/reports/page.tsx`,
    permissions: ["operations.dashboard.view", "hr.view"],
    any: true,
    additionalMarkers: ["requireEnterprisePermission"]
  }
};

const navigationItems: EnterpriseNavigationMenuItem[] = enterpriseNavigationSections.flatMap(
  (section) => {
    if (section.groups) {
      return section.groups.flatMap((group) => [...group.items]);
    }
    if (section.items) {
      return [...section.items];
    }
    return [
      {
        key: section.key,
        label: section.label,
        href: section.href,
        requiredPermissions: section.requiredPermissions
      }
    ];
  }
);

const scopedItems = navigationItems.filter((item) => isScopedRoute(item.href));
const seenRoutes = new Set<string>();

for (const item of scopedItems) {
  const route = normalizeHref(item.href);
  assert(!seenRoutes.has(route), `Duplicate scoped navigation destination: ${route}`);
  seenRoutes.add(route);

  const expectation =
    dynamicPageExpectations[route] ??
    specialPageExpectations[route] ??
    simplePage(route, item.requiredPermissions);

  assert.deepEqual(
    [...expectation.permissions].sort(),
    [...item.requiredPermissions].sort(),
    `${route} route guard expectation has drifted from its navigation permission`
  );

  const source = read(expectation.file);
  for (const permission of expectation.permissions) {
    assert(
      source.includes(`"${permission}"`),
      `${route} does not reference navigation permission ${permission} in ${expectation.file}`
    );
  }
  for (const marker of expectation.additionalMarkers ?? ["requireEnterprisePermission"]) {
    assert(source.includes(marker), `${route} is missing ${marker} in ${expectation.file}`);
  }
  if (expectation.file.includes("/[view]/")) {
    const view = route.slice(route.lastIndexOf("/") + 1);
    const escapedView = view.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const viewKey = /^[A-Za-z_$][\w$]*$/.test(view) ? `(?:${escapedView}|"${escapedView}")` : `"${escapedView}"`;
    const permissionPattern = expectation.permissions
      .map((permission) => `"${permission.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`)
      .join("[\\s\\S]*?");
    assert(
      new RegExp(`${viewKey}\\s*:\\s*(?:\\[\\s*)?${permissionPattern}`).test(source),
      `${route} is not mapped to its navigation permission in ${expectation.file}`
    );
  } else if (
    expectation.permissions.length === 1 &&
    (expectation.additionalMarkers ?? ["requireEnterprisePermission"]).includes(
      "requireEnterprisePermission"
    )
  ) {
    const permission = expectation.permissions[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert(
      new RegExp(`requireEnterprisePermission\\(\\s*\\[\\s*"${permission}"\\s*\\]`).test(source),
      `${route} does not call requireEnterprisePermission with its navigation permission`
    );
  }
  if (expectation.any) {
    assert(
      source.includes("any: true"),
      `${route} must preserve any-of permission semantics in ${expectation.file}`
    );
  }
  if (
    !expectation.permissions.includes("operations.dashboard.view") &&
    route !== "/online-store" &&
    source.includes("operations.dashboard.view")
  ) {
    assert.fail(`${route} uses operations.dashboard.view despite having a narrower permission`);
  }
}

const guardedDrillDowns: readonly RouteExpectation[] = [
  simplePage("/catalog/products/[productCode]", ["master.product.manage"]),
  simplePage("/stores/[storeCode]", ["master.store.manage"]),
  simplePage("/inventory/locations/[locationCode]", ["inventory.view"]),
  simplePage("/sync/nodes/[nodeCode]", ["sync.monitor"]),
  simplePage("/human-resources/reports", ["hr.view"]),
  simplePage("/human-resources/payroll/payslips/[payrollRunEmployeeId]", ["hr.payroll.view"]),
  simplePage("/pos/transactions/[transactionNo]", ["operations.dashboard.view"]),
  simplePage("/pos/sales-orders/[orderNo]", ["operations.dashboard.view"]),
  simplePage("/pos/exceptions/[eventId]", ["operations.dashboard.view"]),
  simplePage("/operations/inventory/[entryId]", ["operations.dashboard.view"]),
  {
    file: `${appRoot}/online-store/ecommerce/page.tsx`,
    permissions: ["ecommerce.console.access"],
    additionalMarkers: ["requireOnlineStoreStaff"]
  }
];

for (const expectation of guardedDrillDowns) {
  const source = read(expectation.file);
  for (const permission of expectation.permissions) {
    assert(
      source.includes(`"${permission}"`) || source.includes("requireOnlineStoreStaff"),
      `${expectation.file} does not enforce ${permission}`
    );
  }
  for (const marker of expectation.additionalMarkers ?? []) {
    assert(source.includes(marker), `${expectation.file} is missing ${marker}`);
  }
}

const onlineStoreSource = read(`${appRoot}/online-store/page.tsx`);
assert(
  onlineStoreSource.includes('requestedWorkspace === "ecommerce"') &&
    onlineStoreSource.includes("requireOnlineStoreStaff"),
  "The Online POS ecommerce query-string entry must enforce the staff-console guard server-side"
);
const ecommerceRepositorySource = read(
  "apps/enterprise-web/src/server/ecommerce/ecommerce.repository.ts"
);
const ecommerceStaffGuardSource = ecommerceRepositorySource.slice(
  ecommerceRepositorySource.indexOf("export async function requireOnlineStoreStaff"),
  ecommerceRepositorySource.indexOf(
    "export async function getOnlineStoreEcommerceWorkspace",
    ecommerceRepositorySource.indexOf("export async function requireOnlineStoreStaff")
  )
);
assert(
  ecommerceStaffGuardSource.includes('permissionCodes.includes("ecommerce.console.access")'),
  "requireOnlineStoreStaff must retain the ecommerce.console.access permission check"
);

// Index-only routes are safe redirects because each target is one of the guarded destinations above.
const redirectEntrypoints = [
  [`${appRoot}/master/page.tsx`, "/master/customers"],
  [`${appRoot}/setup/page.tsx`, "/master/customers"],
  [`${appRoot}/inventory/page.tsx`, "/inventory/products"],
  [`${appRoot}/purchases/page.tsx`, "/purchases/purchase-orders"],
  [`${appRoot}/settings/page.tsx`, "/settings/company"],
  [`${appRoot}/security/page.tsx`, "/security/users"]
] as const;

for (const [file, target] of redirectEntrypoints) {
  assert(seenRoutes.has(target), `${file} redirect target ${target} is not a guarded navigation route`);
  assert(read(file).includes(`redirect("${target}")`), `${file} must remain an index-only redirect to ${target}`);
}

console.log(
  `Enterprise navigation route security gate passed: ${seenRoutes.size} menu destinations, ` +
    `${guardedDrillDowns.length} drill-downs, and ${redirectEntrypoints.length} guarded redirects audited.`
);
