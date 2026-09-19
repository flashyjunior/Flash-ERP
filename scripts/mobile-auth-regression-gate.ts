import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { canOpenMobileRoute } from "../apps/mobile/lib/mobile-access";
import type { mobileApi as MobileApi } from "../apps/mobile/lib/mobile-api";
import type { mobileStorage as MobileStorage } from "../apps/mobile/lib/mobile-storage";

// Execute the real mobile modules with only native IO replaced. No device, live
// server, credentials, or copies of the authentication implementation are needed.
function evaluate(source: string, mocks: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const exports: Record<string, any> = {};
  vm.runInNewContext(outputText, {
    exports, console, setTimeout, clearTimeout, AbortController,
    require: (name: string) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected runtime dependency: ${name}`);
      return mocks[name];
    },
    ...globals
  });
  return exports;
}
const source = (file: string) => readFileSync(path.resolve(file), "utf8");

// Use the server's actual snapshot builder so the login test follows its wire
// contract. In particular, the public snapshot does NOT contain userId/sessionId.
async function serverSnapshot() {
  const file = "apps/enterprise-web/src/server/auth/enterprise-session.ts";
  const ast = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true);
  const builder = ast.statements.find((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "getEnterpriseSessionSnapshot"
  );
  assert.ok(builder, "Server snapshot builder must exist");
  const module = evaluate(builder.getText(ast), {}, {
    getEnterpriseSession: async () => ({
      userId: "internal-user-id", sessionId: "internal-session-id",
      displayName: "Shop Operator", loginId: "operator", accountStatus: "ACTIVE",
      homeStoreCode: "SHOP-01", homeStoreName: "Test Shop", homeStoreMode: "RETAIL",
      isOnlineStoreUser: false, roleCodes: ["CASHIER"], permissionCodes: ["pos.sell", "inventory.view"],
      lastActiveAt: new Date(), lastLoginAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000)
    })
  });
  return module.getEnterpriseSessionSnapshot();
}

function harness(platform = "android") {
  const persisted = new Map<string, string>();
  const failures = { write: (_key: string, _value: string) => false, remove: false };
  const get = (key: string) => persisted.get(key) ?? null;
  const set = (key: string, value: string) => {
    if (failures.write(key, value)) throw new Error("Storage write unavailable");
    persisted.set(key, value);
  };
  const remove = (key: string) => {
    if (failures.remove) throw new Error("Storage delete unavailable");
    persisted.delete(key);
  };
  const storage = evaluate(source("apps/mobile/lib/mobile-storage.ts"), {
    "react-native": { Platform: { OS: platform } },
    "expo-secure-store": { getItemAsync: async (key: string) => get(key), setItemAsync: async (key: string, value: string) => set(key, value), deleteItemAsync: async (key: string) => remove(key) }
  }, { window: { localStorage: { getItem: get, setItem: set, removeItem: remove } } }).mobileStorage as typeof MobileStorage;
  const calls: Array<{ url: string; options: RequestInit }> = [];
  let respond: (url: string, options: RequestInit) => Promise<Response> = async () => { throw new Error("Network unavailable"); };
  const api = evaluate(source("apps/mobile/lib/mobile-api.ts"), {
    "./mobile-storage": { mobileStorage: storage },
    "./mobile-session": evaluate(source("apps/mobile/lib/mobile-session.ts"), {}),
    "./mobile-offline-db": { mobileOfflineDb: {} },
    "expo-file-system/legacy": {}
  }, {
    fetch: async (url: string, options: RequestInit) => {
      calls.push({ url, options });
      return respond(url, options);
    }
  }).mobileApi as typeof MobileApi;
  return { storage, api, persisted, failures, calls, respond: (handler: typeof respond) => { respond = handler; } };
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const credentials = { loginId: "operator", password: "test-only" };

async function main() {
  const snapshot = await serverSnapshot();
  assert.equal(snapshot.userId, undefined);
  assert.equal(snapshot.sessionId, undefined);

  // The regression: successful credentials + the current server snapshot must
  // produce a readable profile before the login screen navigates to dashboard.
  for (const wrapped of [false, true]) {
    const h = harness();
    h.respond(async (url) => url.endsWith("/sign-in")
      ? json({ token: "new-token", requiresMfa: false })
      : json(wrapped ? { session: snapshot } : snapshot));
    const result = await h.api.signIn(credentials);
    assert.equal(result.ok, true, result.error);
    const saved = await h.storage.getUserSnapshot<typeof snapshot>();
    assert.equal(saved?.loginId, "operator");
    assert.equal(canOpenMobileRoute(saved, "cart"), true);
    assert.equal(await h.storage.getAuthToken(), "new-token");
    assert.equal((h.calls[1].options.headers as Record<string, string>).Authorization, "Bearer new-token");
    assert.equal((await h.api.fetchSession()).ok, true, "Dashboard refresh must retain the session");
  }
  console.log("  ✔ Current bare server snapshot and wrapped snapshots survive login → dashboard.");

  const failures: Array<{ name: string; login?: unknown; session?: unknown; status?: number; offline?: boolean }> = [
    { name: "MFA challenge", login: { requiresMfa: true, challengeToken: "challenge" } },
    { name: "missing bearer token", login: { message: "OK" } },
    { name: "blank bearer token", login: { token: " " } },
    { name: "wrong token type", login: { token: {} } },
    { name: "null login body", login: null },
    { name: "session unauthorized", status: 401 },
    { name: "session forbidden", status: 403 },
    { name: "session server error", status: 500 },
    { name: "session network failure", offline: true },
    { name: "empty session", session: {} },
    { name: "null session", session: { session: null } },
    { name: "ID-only session", session: { userId: "old-user" } },
    { name: "malformed permissions", session: { ...snapshot, permissionCodes: [null] } },
    { name: "malformed role codes", session: { ...snapshot, roleCodes: {} } }
  ];
  for (const scenario of failures) {
    const h = harness();
    await h.storage.setUserSnapshot({ ...snapshot, loginId: "previous-operator" });
    await h.storage.setAuthToken("previous-token");
    h.respond(async (url) => {
      if (url.endsWith("/sign-in")) return json("login" in scenario ? scenario.login : { token: "new-token" });
      if (scenario.offline) throw new Error("Network unavailable");
      return json(scenario.session ?? { message: "Session unavailable" }, scenario.status ?? 200);
    });
    const result = await h.api.signIn(credentials);
    assert.equal(result.ok, false, `${scenario.name} must not navigate to dashboard`);
    assert.ok(result.error, `${scenario.name} must provide an error for the login screen`);
    assert.equal(await h.storage.getUserSnapshot(), null, `${scenario.name}: no stale profile`);
    assert.equal(await h.storage.getAuthToken(), null, `${scenario.name}: no partial token`);
    if ("login" in scenario) assert.equal(h.calls.length, 1, "Incomplete authentication must not fetch session");
  }
  console.log("  ✔ Incomplete/failed login stays on sign-in with an error, never a stale operator's profile.");

  const offline = harness();
  await offline.storage.setUserSnapshot(snapshot);
  await offline.storage.setAuthToken("offline-token");
  assert.equal((await offline.api.fetchSession()).isOffline, true, "Existing sessions still support offline reads");
  assert.equal((await offline.api.fetchSession({ allowCached: false })).ok, false, "Login cannot use offline fallback");
  console.log("  ✔ Existing offline sessions remain available; new login requires a fresh session.");

  for (const platform of ["android", "ios", "web"]) {
    const h = harness(platform);
    await h.storage.setUserSnapshot({ ...snapshot, loginId: "previous-operator" });
    h.failures.write = () => true;
    await h.storage.setUserSnapshot(snapshot);
    await h.storage.setAuthToken("memory-token");
    assert.equal((await h.storage.getUserSnapshot<typeof snapshot>())?.loginId, "operator", `${platform}: failed write must override old storage`);
    assert.equal(await h.storage.getAuthToken(), "memory-token", `${platform}: successful null read must not hide fallback`);
    h.failures.remove = true;
    await h.storage.clearAllSession();
    assert.equal(await h.storage.getUserSnapshot(), null, `${platform}: failed delete must not resurrect profile`);
    assert.equal(await h.storage.getAuthToken(), null);
    h.failures.write = () => false;
    await h.storage.setUserSnapshot(snapshot);
    assert.equal((await h.storage.getUserSnapshot<typeof snapshot>())?.loginId, "operator", `${platform}: storage recovery clears tombstone`);
  }
  console.log("  ✔ SecureStore/web storage fallbacks support read-after-write, logout, and recovery.");

  const large = harness();
  large.failures.write = (_key, value) => value.length > 2048;
  const largeSnapshot = { ...snapshot, permissionCodes: Array.from({ length: 200 }, (_, i) => `inventory.permission.${i}`) };
  large.respond(async (url) => json(url.endsWith("/sign-in") ? { token: "token" } : largeSnapshot));
  assert.equal((await large.api.signIn(credentials)).ok, true);
  assert.equal((await large.storage.getUserSnapshot<typeof largeSnapshot>())?.permissionCodes.length, 200);
  console.log("  ✔ Large permission snapshots remain readable if secure persistence rejects them.");
  for (const status of [401, 403]) {
    const h = harness();
    await h.storage.setAuthToken("revoked-token");
    await h.storage.setUserSnapshot(snapshot);
    h.respond(async () => json({ message: "Session revoked" }, status));
    assert.equal((await h.api.fetchSession()).ok, false);
    assert.equal(await h.storage.getUserSnapshot(), null);
    assert.equal(await h.storage.getAuthToken(), null);
  }
  console.log("  ✔ Revoked/rejected sessions are not treated as offline logins.");

  const delayed = harness();
  await delayed.storage.setAuthToken("old-token");
  await delayed.storage.setUserSnapshot(snapshot);
  let complete!: (response: Response) => void;
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => { started = resolve; });
  delayed.respond(async (url) => {
    if (url.endsWith("/sign-out")) return json({ message: "Signed out" });
    started();
    return new Promise<Response>((resolve) => { complete = resolve; });
  });
  const pendingSession = delayed.api.fetchSession();
  await startedPromise;
  await delayed.api.signOut();
  complete(json(snapshot));
  assert.equal((await pendingSession).ok, false);
  assert.equal(await delayed.storage.getUserSnapshot(), null);
  assert.equal(await delayed.storage.getAuthToken(), null);
  console.log("  ✔ A late dashboard response cannot restore a signed-out session.");

  for (const status of [400, 401, 403, 409, 422, 500]) {
    const h = harness();
    h.respond(async () => json({ message: "Sale rejected" }, status));
    const result = await h.api.submitSale({ lines: [] });
    assert.equal(result.ok, false, `HTTP ${status} must not become an offline success`);
    assert.equal(result.error, "Sale rejected");
    assert.equal(result.queuedMutationId, undefined);
  }
  console.log("  ✔ HTTP-rejected transactions are not reported as successful offline sales.");
  console.log("Mobile authentication regression gate passed.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
