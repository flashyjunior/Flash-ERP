import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import ts from "typescript";

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const approvedHelpers = new Set([
  "assertEnterprisePermission",
  "assertEnterpriseOrOnlineStorePermission"
]);
const apiRoot = resolve("apps/enterprise-web/src/app/api");
const routeRoots = ["setup", "inventory", "stores"].map((directory) =>
  resolve(apiRoot, directory)
);
// Store sync is intentionally excluded because it needs the separate
// machine-to-machine authentication design, not an interactive Enterprise session.
const outOfScopePrefixes = ["stores/sync/"] as const;

type RoutePolicy = {
  helper: "assertEnterprisePermission" | "assertEnterpriseOrOnlineStorePermission";
  enterprisePermissions: string[];
  onlineStorePermissions?: string[];
  any?: boolean;
};

type MutationHandler = {
  body: ts.Block;
  method: string;
};

const setupPermissions: Record<string, string> = {
  "bank-accounts": "master.bank.manage",
  "bank-branches": "master.bank.manage",
  banks: "master.bank.manage",
  categories: "master.category.manage",
  customers: "master.customer.manage",
  departments: "master.department.manage",
  "loyalty-policy": "master.loyalty.manage",
  promotions: "master.promotion.manage",
  "receipt-templates": "settings.receipt-template.manage",
  roles: "security.role.manage",
  suppliers: "master.supplier.manage",
  "tax-profiles": "master.tax.manage",
  "tender-methods": "master.tender.manage",
  users: "security.user.manage"
};

function collectRouteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return collectRouteFiles(entryPath);
    }
    return entry.isFile() && entry.name === "route.ts" ? [entryPath] : [];
  });
}

function normalizeRoutePath(filePath: string) {
  return relative(apiRoot, filePath).split(sep).join("/");
}

function enterpriseOnly(permission: string): RoutePolicy {
  return {
    helper: "assertEnterprisePermission",
    enterprisePermissions: [permission]
  };
}

function resolvePolicy(routePath: string): RoutePolicy {
  const segments = routePath.split("/");

  if (segments[0] === "setup") {
    const permission = setupPermissions[segments[1]];
    assert.ok(permission, `No setup authorization policy exists for ${routePath}.`);
    return enterpriseOnly(permission);
  }

  if (segments[0] === "stores") {
    if (routePath === "stores/licenses/renew/route.ts") {
      return enterpriseOnly("settings.license.manage");
    }
    return enterpriseOnly("master.store.manage");
  }

  assert.equal(segments[0], "inventory", `No authorization policy exists for ${routePath}.`);

  if (routePath === "inventory/inter-store-transfers/[transferBatchNo]/stock-confirm/route.ts") {
    return {
      helper: "assertEnterprisePermission",
      enterprisePermissions: ["inventory.transfer.issue", "inventory.transfer.receive"],
      any: true
    };
  }

  if (routePath.startsWith("inventory/inter-store-transfers/")) {
    return enterpriseOnly("inventory.transfer.request");
  }

  if (routePath.startsWith("inventory/locations/")) {
    const operation = segments[3];
    if (operation === "adjustment-task") {
      return enterpriseOnly("inventory.adjust");
    }
    if (operation === "count-variance-task") {
      return enterpriseOnly("inventory.count.commit");
    }
    if (operation === "goods-receipt") {
      return enterpriseOnly("inventory.grn.receive");
    }
    if (operation === "inter-store-transfers" || operation === "transfer-task") {
      return enterpriseOnly("inventory.transfer.request");
    }
    if (operation === "purchase-orders") {
      return {
        helper: "assertEnterpriseOrOnlineStorePermission",
        enterprisePermissions: ["inventory.purchase-order.manage"],
        onlineStorePermissions: ["inventory.grn.receive"]
      };
    }
  }

  if (routePath.startsWith("inventory/purchase-orders/")) {
    return enterpriseOnly(
      segments[3] === "goods-receipt"
        ? "inventory.grn.receive"
        : "inventory.purchase-order.manage"
    );
  }

  if (
    routePath.startsWith("inventory/supplier-claims/") ||
    routePath.startsWith("inventory/supplier-returns/")
  ) {
    return enterpriseOnly("inventory.supplier-return.manage");
  }

  assert.fail(`No inventory authorization policy exists for ${routePath}.`);
}

function isExported(node: ts.Node) {
  return Boolean(
    ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function collectMutationHandlers(sourceFile: ts.SourceFile): MutationHandler[] {
  const handlers: MutationHandler[] = [];

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      statement.body &&
      isExported(statement) &&
      mutationMethods.has(statement.name.text)
    ) {
      handlers.push({ method: statement.name.text, body: statement.body });
      continue;
    }

    if (!ts.isVariableStatement(statement) || !isExported(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        !mutationMethods.has(declaration.name.text) ||
        !declaration.initializer ||
        (!ts.isArrowFunction(declaration.initializer) &&
          !ts.isFunctionExpression(declaration.initializer)) ||
        !ts.isBlock(declaration.initializer.body)
      ) {
        continue;
      }

      handlers.push({ method: declaration.name.text, body: declaration.initializer.body });
    }
  }

  return handlers;
}

function collectCalls(node: ts.Node, predicate: (call: ts.CallExpression) => boolean) {
  const calls: ts.CallExpression[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child) && predicate(child)) {
      calls.push(child);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return calls;
}

function callName(call: ts.CallExpression) {
  return ts.isIdentifier(call.expression) ? call.expression.text : null;
}

function stringArray(argument: ts.Expression | undefined) {
  assert.ok(argument && ts.isArrayLiteralExpression(argument), "Permission arguments must be arrays.");
  return argument.elements.map((element) => {
    assert.ok(ts.isStringLiteral(element), "Permission arrays must contain string literals only.");
    return element.text;
  });
}

function hasAnyTrue(argument: ts.Expression | undefined) {
  if (!argument || !ts.isObjectLiteralExpression(argument)) {
    return false;
  }

  return argument.properties.some(
    (property) =>
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === "any" &&
      property.initializer.kind === ts.SyntaxKind.TrueKeyword
  );
}

const auditedHandlers: string[] = [];

for (const filePath of routeRoots.flatMap(collectRouteFiles).sort()) {
  const routePath = normalizeRoutePath(filePath);
  if (outOfScopePrefixes.some((prefix) => routePath.startsWith(prefix))) {
    continue;
  }

  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const handlers = collectMutationHandlers(sourceFile);
  if (handlers.length === 0) {
    continue;
  }

  const policy = resolvePolicy(routePath);

  for (const handler of handlers) {
    const owner = `${handler.method} ${routePath}`;
    const authorizationCalls = collectCalls(handler.body, (call) => {
      const name = callName(call);
      return name !== null && approvedHelpers.has(name);
    }).sort((left, right) => left.getStart(sourceFile) - right.getStart(sourceFile));

    assert.ok(authorizationCalls.length > 0, `${owner} has no approved authorization helper.`);
    const authorizationCall = authorizationCalls[0];
    assert.equal(callName(authorizationCall), policy.helper, `${owner} uses the wrong auth boundary.`);
    assert.ok(ts.isAwaitExpression(authorizationCall.parent), `${owner} must await authorization.`);
    assert.deepEqual(
      stringArray(authorizationCall.arguments[0]),
      policy.enterprisePermissions,
      `${owner} uses the wrong Enterprise permission.`
    );

    if (policy.helper === "assertEnterpriseOrOnlineStorePermission") {
      assert.deepEqual(
        stringArray(authorizationCall.arguments[1]),
        policy.onlineStorePermissions,
        `${owner} uses the wrong Online POS permission.`
      );
    }

    const optionsArgument =
      policy.helper === "assertEnterpriseOrOnlineStorePermission"
        ? authorizationCall.arguments[2]
        : authorizationCall.arguments[1];
    assert.equal(
      hasAnyTrue(optionsArgument),
      policy.any === true,
      `${owner} has the wrong any/all permission policy.`
    );

    const bodyParseCalls = collectCalls(handler.body, (call) => {
      if (!ts.isPropertyAccessExpression(call.expression)) {
        return false;
      }
      return call.expression.name.text === "json" || call.expression.name.text === "formData";
    });
    for (const bodyParseCall of bodyParseCalls) {
      assert.ok(
        authorizationCall.getStart(sourceFile) < bodyParseCall.getStart(sourceFile),
        `${owner} parses the request body before authorization.`
      );
    }

    assert.match(
      source,
      /error\s+instanceof\s+EnterpriseAuthError\s*\?\s*error\.status/,
      `${owner} must preserve 401/403 in its existing JSON error response.`
    );
    auditedHandlers.push(owner);
  }
}

assert.ok(auditedHandlers.length > 0, "No Enterprise mutation handlers were audited.");

console.log(
  `Enterprise mutation route auth gate passed for ${auditedHandlers.length} handlers:\n${auditedHandlers
    .map((handler) => `- ${handler}`)
    .join("\n")}`
);
