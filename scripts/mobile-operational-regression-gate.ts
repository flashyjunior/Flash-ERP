import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { canOpenMobileRoute } from "../apps/mobile/lib/mobile-access";
import type { MobileUserSession } from "../apps/mobile/lib/mobile-api";

const root = process.cwd();
const read = (file: string) => readFile(path.join(root, file), "utf8");
const session = (permissions: string[], homeStoreCode: string | null = "SHOP-01") => ({
  sessionId: "test", userId: "user", loginId: "tester", displayName: "Tester",
  accountStatus: "ACTIVE", homeStoreCode, homeStoreName: homeStoreCode ? "Test Shop" : null,
  roleCodes: [], permissionCodes: permissions, expiresAt: new Date(Date.now() + 60_000).toISOString()
}) satisfies MobileUserSession;

assert.equal(canOpenMobileRoute(session(["pos.sell"]), "cart"), true);
assert.equal(canOpenMobileRoute(session(["inventory.view"]), "cart"), false);
assert.equal(canOpenMobileRoute(session(["pos.sell"], null), "cart"), false);
assert.equal(canOpenMobileRoute(session(["pos.refund"]), "returns"), true);
assert.equal(canOpenMobileRoute(session([]), "returns"), false);
assert.equal(canOpenMobileRoute(session(["hr.leave.manage"]), "account"), true);

async function main() {
const [cart, api, outbox, login, selfService, receipt, catalogRoute, tenderRoute] = await Promise.all([
  read("apps/mobile/app/cart.tsx"), read("apps/mobile/lib/mobile-api.ts"),
  read("apps/mobile/app/outbox.tsx"), read("apps/mobile/app/login.tsx"),
  read("apps/mobile/app/self-service.tsx"), read("apps/mobile/app/receipt.tsx"),
  read("apps/enterprise-web/src/app/api/catalog/products/route.ts"),
  read("apps/enterprise-web/src/app/api/online-store/tender-methods/route.ts")
]);
assert.match(cart, /sourceTransactionId: recalledTransactionId \?\? saleIdempotencyKey\.current/);
assert.match(cart, /selectedTender\.requiresReference/);
assert.match(cart, /splitPayments\.map/);
assert.match(api, /pruneProducts\(validProductCodes\)/);
assert.match(api, /uploadExpenseReceipt/);
assert.match(outbox, /Math\.max\(insets\.bottom, 16\)/);
assert.match(login, />Login</);
assert.match(selfService, /requiresAttachment/);
assert.match(receipt, /Print\.printAsync/);
assert.match(catalogRoute, /storeProductSellingUnits/);
assert.match(tenderRoute, /requiresReference: true/);
console.log("Mobile operational regression gate passed.");

}

void main();
