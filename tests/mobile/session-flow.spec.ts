import { test as base, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const session = {
  displayName: "Test Operator", loginId: "operator", accountStatus: "ACTIVE",
  homeStoreCode: "SHOP-01", homeStoreName: "Test Shop", homeStoreMode: "RETAIL",
  roleCodes: ["MANAGER"],
  permissionCodes: ["pos.sell", "pos.refund", "inventory.view", "inventory.count.submit", "inventory.grn.receive", "inventory.transfer.request", "fuel.station.view", "hr.leave.approve"],
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
};
const analytics = {
  salesTotal: 150, transactionCount: 2, averageBasket: 75, pendingApprovals: 0,
  trend: [{ date: "2026-09-19", total: 150 }], topProducts: [], generatedAt: new Date().toISOString(),
};

type Backend = {
  session: any; dashboard: any; loginStatus: number; sessionStatus: number; dashboardStatus: number;
  saleStatus: number; countStatus: number; offline: boolean; sessionDelay: number; requests: string[];
};
const test = base.extend<{ backend: Backend; runtimeErrors: string[] }>({
  runtimeErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (msg) => { if (msg.type() === "error" && msg.text().includes("[flash-erp:mobile]")) errors.push(msg.text().split("\n")[0]); });
    await use(errors);
    expect(errors, "No uncaught JS errors or fatal UI boundary errors").toEqual([]);
  }, { auto: true }],
  backend: [async ({ context, page }, use) => {
    const state: Backend = { session: structuredClone(session), dashboard: structuredClone(analytics), loginStatus: 200, sessionStatus: 200, dashboardStatus: 200, saleStatus: 200, countStatus: 200, offline: false, sessionDelay: 0, requests: [] };
    // Expo's web-only QR worker loads this at module import time. Supply the
    // same library locally so CDN availability cannot affect screen tests.
    await context.route("https://cdn.jsdelivr.net/npm/jsqr@1.2.0/dist/jsQR.min.js", (route) => route.fulfill({ contentType: "application/javascript", body: readFileSync("node_modules/jsqr/dist/jsQR.js") }));
    await context.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      state.requests.push(url.pathname);
      if (state.offline) return route.abort("internetdisconnected");
      let data: unknown; let status = 200;
      switch (url.pathname) {
        case "/api/auth/sign-in": status = state.loginStatus; data = status === 200 ? { token: "test-token", requiresMfa: false } : { message: "Invalid login ID or password." }; break;
        case "/api/auth/session":
          if (state.sessionDelay) await new Promise((resolve) => setTimeout(resolve, state.sessionDelay));
          status = route.request().headers().authorization === "Bearer test-token" ? state.sessionStatus : 401; data = status === 200 ? state.session : { message: "Your session has expired. Please sign in again." }; break;
        case "/api/auth/sign-out": data = { message: "Signed out." }; break;
        case "/api/mobile/dashboard": status = state.dashboardStatus; data = state.dashboard; break;
        case "/api/system/live": data = { service: "fixture" }; break;
        case "/api/auth/profile": data = { profile: { displayName: "Test Operator", email: "operator@example.invalid", loginId: "operator" } }; break;
        case "/api/online-store/tender-methods": data = { tenders: [{ id: "cash", code: "CASH", name: "Cash", paymentMethod: "CASH", requiresReference: false, allowChange: true, sortOrder: 1 }] }; break;
        case "/api/online-store/sales": status = state.saleStatus; data = status === 200 ? { receipt: {
          retailOrgName: "Test ERP", storeName: "Test Shop", transactionNo: "TEST-SALE-001", completedAt: new Date().toISOString(), cashierCode: "operator", currencyCode: "GHS", customerName: "Walk-in Customer",
          subtotalAmount: 10, discountAmount: 0, taxAmount: 0, totalAmount: 10, paidAmount: 10, changeAmount: 0,
          lines: [{ productCode: "TEST-01", productName: "Test Product", quantity: 1, sellingUnitOfMeasure: "EA", unitPrice: 10, lineTotal: 10 }], payments: [{ tenderMethodName: "Cash", method: "CASH", amount: 10, reference: null }]
        } } : { message: "Insufficient stock. Sale rejected." }; break;
        case "/api/online-store/stock-counts": status = state.countStatus; data = status === 200 ? { message: "Count accepted." } : { message: "Count rejected by HQ." }; break;
        case "/api/online-store/customers": data = { customers: [] }; break;
        case "/api/catalog/products": data = { data: [{ id: "product-1", productCode: "TEST-01", productName: "Test Product", barcode: "123456789", unitPrice: 10, quantityOnHand: 20, unitOfMeasure: "EA" }], total: 1 }; break;
        case "/api/human-resources/attendance": data = { attendance: [] }; break;
        case "/api/human-resources/expense-claims": data = { claims: [] }; break;
        case "/api/human-resources/leave/requests": data = { year: 2026, leaveTypes: [], requests: [] }; break;
        default: throw new Error(`Missing test HTTP fixture: ${route.request().method()} ${url.pathname}`);
      }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    });
    await page.addInitScript(() => { if (location.protocol === "http:") localStorage.setItem("flash_erp_server_url", location.origin); });
    await use(state);
    await context.unrouteAll({ behavior: "ignoreErrors" });
  }, { auto: true }],
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("e.g. hq.admin or cashier01").fill("operator");
  await page.getByPlaceholder("••••••••••••").fill("test-only-password");
  await page.getByText("Login", { exact: true }).click();
}
async function dashboard(page: Page) {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Test Operator", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("GHS 150.00", { exact: true }).filter({ visible: true })).toBeVisible();
}

test("fresh launch → login → dashboard → account → back → reload → logout", async ({ page, backend }) => {
  await page.goto("/");
  await expect(page.getByText("Operator Sign In", { exact: true })).toBeVisible();
  expect(backend.requests).not.toContain("/api/auth/session");
  await login(page);
  await dashboard(page);
  await page.getByText("My Account", { exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.locator('input[value="Test Operator"]')).toBeVisible();
  await page.goBack();
  await dashboard(page);
  await page.reload();
  await dashboard(page);
  await page.getByLabel("Sign out").click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  // With protected history removed, Back may leave the app altogether. It
  // must never restore an authenticated screen. Opening Home still needs login.
  await expect(page.getByText("Test Operator", { exact: true })).not.toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Operator Sign In", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("flash_erp_auth_token"))).toBeNull();
  await login(page);
  await dashboard(page);
});

test("invalid credentials stay on login with an error; retry succeeds", async ({ page, backend }) => {
  backend.loginStatus = 401;
  await login(page);
  await expect(page.getByText("Invalid login ID or password.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  backend.loginStatus = 200;
  await page.getByText("Login", { exact: true }).click();
  await dashboard(page);
});

test("slow session does not navigate until profile is saved", async ({ page, backend }) => {
  backend.sessionDelay = 1200;
  await login(page);
  await expect(page).toHaveURL(/\/login$/);
  await dashboard(page);
});

test("failed session fetch keeps login visible and allows retry", async ({ page, backend }) => {
  backend.sessionStatus = 500;
  await login(page);
  await expect(page.getByText(/session has expired/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  backend.sessionStatus = 200;
  await page.getByText("Login", { exact: true }).click();
  await dashboard(page);
});

test("dashboard service failure does not log out the operator", async ({ page, backend }) => {
  backend.dashboardStatus = 500;
  backend.dashboard = { message: "Dashboard unavailable" };
  await login(page);
  await expect(page.getByText("Test Operator", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("My Account", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("malformed analytics cannot crash dashboard", async ({ page, backend }) => {
  backend.dashboard = { salesTotal: "150.00", transactionCount: 2, averageBasket: "75.00" };
  await login(page);
  await expect(page.getByText("Test Operator", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("My Account", { exact: true })).toBeVisible();
});

test("offline restart restores cached operator without a login loop", async ({ page, backend }) => {
  await login(page);
  await dashboard(page);
  backend.offline = true;
  await page.reload();
  await expect(page.getByText("Test Operator", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("My Account", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("server-rejected session is not treated as an offline authenticated operator", async ({ page, backend }) => {
  await login(page);
  await dashboard(page);
  backend.sessionStatus = 401;
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/session.*(expired|sign in)/i)).toBeVisible();
});

test("corrupt stored profile cannot crash route guard", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => {
    localStorage.setItem("flash_erp_user_snapshot", JSON.stringify({ loginId: "operator", permissionCodes: [null] }));
    localStorage.setItem("flash_erp_auth_token", "test-token");
  });
  await page.goto("/approvals");
  await expect(page.getByText("Manager Approvals & KPIs", { exact: true })).not.toBeVisible();
  await expect(page.getByText("Operator Sign In", { exact: true })).toBeVisible();
});

test("shopless operator keeps HR/account access, not selling routes", async ({ page, backend }) => {
  backend.session.homeStoreCode = null;
  backend.session.homeStoreName = null;
  await login(page);
  await expect(page.getByText("My Account", { exact: true })).toBeVisible();
  await expect(page.getByText("Sales POS", { exact: true })).not.toBeVisible();
  await page.goto("/cart");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("My Account", { exact: true })).toBeVisible();
});

for (const [tile, route, heading] of [
  ["Stock & Barcode", "scanner", "Stock & Barcode Lookup"],
  ["Cycle Count", "stock-count", "Cycle Count & Audit"],
  ["Goods Receiving", "goods-receipt", "Goods Receiving (GRN)"],
  ["Transfers", "transfers", "Inter-Store Transfers"],
  ["Sales POS", "cart", "Assisted Selling & Cart"],
  ["Fuel Operations", "fuel-operations", "Fuel Station Operations"],
  ["HR & Attendance", "self-service", "HR & Employee Self-Service"],
  ["Approvals & KPIs", "approvals", "Manager Approvals & KPIs"],
  ["Returns", "returns", "Returns & Exchanges"],
  ["Outbox Queue (0)", "outbox", "Mobile Outbox Queue"],
]) {
  test(`dashboard → ${route} → back`, async ({ page }) => {
    await login(page);
    await dashboard(page);
    await page.getByText(tile, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${route}$`));
    await expect(page.getByText(heading, { exact: true })).toBeVisible();
    await page.goBack();
    await dashboard(page);
  });
}

async function addProductToCart(page: Page) {
  await login(page);
  await dashboard(page);
  await page.getByText("Stock & Barcode", { exact: true }).click();
  await page.getByPlaceholder("Scan or type barcode / SKU...").fill("TEST-01");
  await page.getByText("Lookup", { exact: true }).click();
  await expect(page.getByText("Test Product", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByText("Add to Sales POS", { exact: true }).click();
  await expect(page).toHaveURL(/\/cart/);
  await expect(page.getByText("Test Product", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByText("Take Payment (GHS 10.00)", { exact: true }).click();
  await expect(page.getByText("Cash", { exact: true })).toBeVisible();
}

test("manual product lookup → basket → cash payment → receipt → home", async ({ page, backend }) => {
  await addProductToCart(page);
  await page.getByText("Confirm Payment & Print Slip", { exact: true }).click();
  await expect(page).toHaveURL(/\/receipt$/);
  await expect(page.getByText("TEST-SALE-001", { exact: true })).toBeVisible();
  expect(backend.requests.filter((path) => path === "/api/online-store/sales")).toHaveLength(1);
  await page.getByText("Done", { exact: true }).click();
  await dashboard(page);
});

test("rejected sale stays in basket and does not become offline success", async ({ page, backend }) => {
  backend.saleStatus = 400;
  await addProductToCart(page);
  await page.getByText("Confirm Payment & Print Slip", { exact: true }).click();
  await expect(page.getByText("Insufficient stock. Sale rejected.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/cart/);
  expect(await page.evaluate(() => localStorage.getItem("flash_erp_last_receipt"))).toBeNull();
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem("flash_erp_pos_cart")))!)).toHaveLength(1);
});

test("rejected stock count is an error, not an offline queued success", async ({ page, backend }) => {
  backend.countStatus = 400;
  await login(page);
  await dashboard(page);
  await page.getByText("Cycle Count", { exact: true }).click();
  await page.getByPlaceholder("e.g. BEV-COLA-500").fill("TEST-01");
  await page.getByText("Commit Count", { exact: true }).click();
  await expect(page.getByText("Count rejected by HQ.", { exact: true })).toBeVisible();
  await page.goBack();
  await page.getByText("Outbox Queue (0)", { exact: true }).click();
  await expect(page.getByText("Mobile Outbox Queue", { exact: true })).toBeVisible();
});

test("network failure queues a stock count for later sync", async ({ page, backend }) => {
  await login(page);
  await dashboard(page);
  await page.getByText("Cycle Count", { exact: true }).click();
  await page.getByPlaceholder("e.g. BEV-COLA-500").fill("TEST-01");
  backend.offline = true;
  await page.getByText("Commit Count", { exact: true }).click();
  await expect(page.getByText("Count saved offline. Queued for automatic sync.", { exact: true })).toBeVisible();
  await page.goBack();
  // Re-open outbox directly because dashboard statistics may still reflect the
  // last refresh; the outbox itself must show the queued record.
  await page.getByText("Sync", { exact: true }).click();
  await expect(page.getByText("STOCK_COUNT", { exact: true })).toBeVisible();
});

test("approvals do not display fabricated transactions or success controls", async ({ page }) => {
  await login(page);
  await dashboard(page);
  await page.getByText("Approvals & KPIs", { exact: true }).click();
  await expect(page.getByText("Use Enterprise Web for approvals", { exact: true })).toBeVisible();
  await expect(page.getByText("Authorize", { exact: true })).not.toBeVisible();
  await expect(page.getByText("GHS 48,250", { exact: true })).not.toBeVisible();
});


test("receipt deep link with no saved receipt provides a way back", async ({ page }) => {
  await login(page);
  await dashboard(page);
  await page.goto("/receipt");
  await expect(page.getByText("No saved receipt is available.", { exact: true })).toBeVisible();
  await page.getByText("Back to dashboard", { exact: true }).click();
  await dashboard(page);
});
