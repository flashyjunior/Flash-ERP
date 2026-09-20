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
const [cart, api, outbox, login, selfService, receipt, scanner, account, receiptStore, catalogRoute, tenderRoute] = await Promise.all([
  read("apps/mobile/app/cart.tsx"), read("apps/mobile/lib/mobile-api.ts"),
  read("apps/mobile/app/outbox.tsx"), read("apps/mobile/app/login.tsx"),
  read("apps/mobile/app/self-service.tsx"), read("apps/mobile/app/receipt.tsx"),
  read("apps/mobile/app/scanner.tsx"), read("apps/mobile/app/account.tsx"),
  read("apps/mobile/lib/mobile-receipt-store.ts"),
  read("apps/enterprise-web/src/app/api/catalog/products/route.ts"),
  read("apps/enterprise-web/src/app/api/online-store/tender-methods/route.ts")
]);
// Regression guard: the mobile cart must NEVER send an invented
// sourceTransactionId (the old `MOBILE-...` idempotency key made HQ look for a
// parked basket by that id and reject every fresh sale). Only a real recalled
// (parked) transaction id may be sent.
assert.match(cart, /sourceTransactionId: recalledTransactionId \|\| undefined/);
assert.doesNotMatch(cart, /sourceTransactionId: recalledTransactionId \?\? saleIdempotencyKey/);
assert.match(cart, /selectedTender\.requiresReference/);
assert.match(cart, /splitPayments\.map/);
// Completed sales persist their receipt (file-backed, no SecureStore size cap)
// so the receipt can be printed or re-printed later.
assert.match(cart, /mobileReceiptStore\.saveLastReceipt\(receipt\)/);
// Tender methods flow into rows of three tappable tiles (up to six tenders).
assert.match(cart, /tenderMethodGroup[\s\S]{0,160}flexWrap: "wrap"/);
assert.match(cart, /tenderBtn[\s\S]{0,120}flexBasis: "31\.5%"/);
// Inventory page auto-loads a paginated grid and live-filters while typing;
// HQ only returns ACTIVE products so inactive items never reach the grid or POS.
assert.match(scanner, /fetchInventoryPage\(\{ query: text, page, limit: GRID_PAGE_SIZE \}\)/);
assert.match(scanner, /loadGridPage\("", 1, false, searchSeq\.current\)/);
assert.match(scanner, /setTimeout\(\(\) => \{[\s\S]{0,200}searchSeq\.current \+= 1;[\s\S]{0,80}loadGridPage\(text, 1, false, searchSeq\.current\)/);
assert.match(scanner, /gridHasMore/);
assert.match(api, /fetchInventoryPage/);
assert.match(api, /pruneProducts\(validProductCodes\)/);
assert.match(api, /uploadExpenseReceipt/);
assert.match(outbox, /Math\.max\(insets\.bottom, 16\)/);
// The HQ server host is a first-run step: hidden after configuration and
// editable from My Account.
assert.match(login, /hasSavedServerUrl/);
assert.match(login, /serverConfigured === false/);
assert.match(account, /handleTestServer/);
assert.match(account, /Enterprise server/);
// Diagnostics (error log) sheet keeps its buttons out of the bottom safe zone.
assert.match(account, /diagModal, \{ paddingBottom: Math\.max\(insets\.bottom, 12\) \+ 12 \}/);
// Receipt printing is best-effort after completion: failures surface inline
// and never block or undo the completed sale.
assert.match(receipt, /Print\.printAsync/);
assert.match(receipt, /mobileReceiptStore[\s\S]{0,200}loadLastReceipt/);
assert.match(receipt, /setPrintState\(\{ printing: false, error: error\?\.message/);
assert.match(receiptStore, /flash-erp-last-receipt\.json/);
// Expense receipt photos survive the camera flow with visible feedback.
assert.match(selfService, /requiresAttachment/);
assert.match(selfService, /captureExpenseReceipt/);
assert.match(selfService, /preserveEvidenceFile\(assetUri, "expense"\)/);
assert.match(catalogRoute, /storeProductSellingUnits/);
assert.match(catalogRoute, /status: "ACTIVE" as const/);
assert.match(tenderRoute, /requiresReference: true/);
console.log("Mobile operational regression gate passed.");

}

void main();
