import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type AdminRoutePolicy = {
  route: string;
  mutationCall: string;
  paramsRead: string;
  bodyRead: string;
  requiresSessionOperator: boolean;
};

const adminRoutes: AdminRoutePolicy[] = [
  {
    route: "policy/route.ts",
    mutationCall: "updateEnterpriseSyncNodePolicy(",
    paramsRead: "await params",
    bodyRead: "request.json(",
    requiresSessionOperator: false
  },
  {
    route: "replay/route.ts",
    mutationCall: "replayStoreNodeDownstream(",
    paramsRead: "await params",
    bodyRead: "request.text(",
    requiresSessionOperator: true
  },
  {
    route: "events/[eventId]/replay/route.ts",
    mutationCall: "replayStoreNodeDownstreamEvent(",
    paramsRead: "await params",
    bodyRead: "request.text(",
    requiresSessionOperator: true
  },
  {
    route: "inbound/[eventId]/reprocess/route.ts",
    mutationCall: "reprocessStoreInboundEvent(",
    paramsRead: "await params",
    bodyRead: "request.text(",
    requiresSessionOperator: true
  },
  {
    route: "inbound/[eventId]/request-resend/route.ts",
    mutationCall: "requestStoreInboundEventResend(",
    paramsRead: "await params",
    bodyRead: "request.text(",
    requiresSessionOperator: true
  },
  {
    route: "database-instructions/route.ts",
    mutationCall: "requestStoreDatabaseInstruction(",
    paramsRead: "await context.params",
    bodyRead: "request.json(",
    requiresSessionOperator: true
  }
];

// These endpoints are Store Desktop machine traffic. They deliberately do not use
// an interactive Enterprise session and remain deferred to signed node identity.
const deferredMachineRoutes = [
  "push/route.ts",
  "pull/route.ts",
  "inventory-lookup/route.ts",
  "inter-store-stock-request/route.ts"
] as const;

const routeRoot = resolve(
  "apps/enterprise-web/src/app/api/sync/store-nodes/[nodeCode]"
);
const authCall = 'await assertEnterprisePermission(["sync.monitor"])';

function readRoute(relativePath: string) {
  return readFileSync(resolve(routeRoot, relativePath), "utf8").replace(/\r\n/g, "\n");
}

for (const policy of adminRoutes) {
  const source = readRoute(policy.route);
  const authorizationIndex = source.indexOf(authCall);

  assert.ok(
    authorizationIndex >= 0,
    `${policy.route} must require the sync.monitor Enterprise permission.`
  );
  assert.match(
    source,
    /error\s+instanceof\s+EnterpriseAuthError\s*\?\s*error\.status/,
    `${policy.route} must preserve Enterprise authentication 401/403 statuses.`
  );

  for (const protectedOperation of [
    policy.paramsRead,
    policy.bodyRead,
    policy.mutationCall
  ]) {
    const operationIndex = source.indexOf(protectedOperation);
    assert.ok(operationIndex >= 0, `${policy.route} must contain ${protectedOperation}.`);
    assert.ok(
      authorizationIndex < operationIndex,
      `${policy.route} must authenticate before ${protectedOperation}.`
    );
  }

  if (policy.requiresSessionOperator) {
    assert.match(
      source,
      /operatorName:\s*session\.displayName\s*\|\|\s*session\.loginId/,
      `${policy.route} must derive operatorName from the authenticated session.`
    );
  }
}

for (const route of deferredMachineRoutes) {
  const source = readRoute(route);
  assert.ok(
    !source.includes("assertEnterprisePermission"),
    `${route} is machine traffic and must not be protected by an interactive Enterprise session.`
  );
}

console.log(
  `Enterprise sync admin auth gate passed for ${adminRoutes.length} human-admin routes.\n` +
    `Deferred machine routes (signed node identity rollout): ${deferredMachineRoutes.join(", ")}`
);
