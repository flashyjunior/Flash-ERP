import { expect, test, type Page } from "@playwright/test";

const enterpriseBaseUrl = process.env.FLASH_ERP_E2E_ENTERPRISE_BASE_URL;
const loginId = process.env.FLASH_ERP_E2E_ONLINE_STORE_LOGIN;
const password = process.env.FLASH_ERP_E2E_ONLINE_STORE_PASSWORD;
const explicitMfaCode = process.env.FLASH_ERP_E2E_MFA_CODE;
const saleProductName = process.env.FLASH_ERP_E2E_ONLINE_STORE_PRODUCT_NAME ?? "Flash Water 75cl";
const exchangeProductName = process.env.FLASH_ERP_E2E_ONLINE_STORE_EXCHANGE_PRODUCT_NAME ?? "Flash Cola 50cl";
const accountCustomerQuery =
  process.env.FLASH_ERP_E2E_ONLINE_STORE_ACCOUNT_CUSTOMER ?? "Mensah Family Shop";

function parseMoneyText(value: string) {
  const normalized = value.replace(/[^0-9.-]+/g, "");
  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : 0;
}

async function closePopups(page: Page) {
  page.on("popup", async (popup) => {
    await popup.close().catch(() => undefined);
  });
}

async function completeOnlineStoreSignIn(
  page: Page,
  options: { dismissInventoryAlert?: boolean } = {}
) {
  await closePopups(page);
  await page.goto("/online-store");

  const passwordInput = page.locator('input[type="password"]').first();
  const signInVisible = await passwordInput.isVisible({ timeout: 10_000 }).catch(() => false);

  if (signInVisible) {
    await page
      .locator('input[name="loginId"], input[autocomplete="username"], input:not([type="hidden"]):not([type="password"])')
      .first()
      .fill(loginId ?? "");
    await passwordInput.fill(password ?? "");
    await page.getByRole("button", { name: /^Sign in$/ }).click();
  }

  const mfaInput = page.getByPlaceholder("000000");
  const mfaRequested = await mfaInput.isVisible({ timeout: 10_000 }).catch(() => false);

  if (mfaRequested) {
    const visibleCopy = await page.locator("body").innerText();
    const developmentCode = visibleCopy.match(/Development code:\s*(\d{6})/)?.[1] ?? null;
    const mfaCode = explicitMfaCode ?? developmentCode;

    test.skip(
      !mfaCode,
      "MFA was requested but no FLASH_ERP_E2E_MFA_CODE or development code was available."
    );

    await mfaInput.fill(mfaCode ?? "");
    await page.getByRole("button", { name: /Verify MFA/i }).click();
  }

  await page.waitForURL(/\/online-store(?:\?|$)/, { timeout: 60_000 });
  await expect(page).toHaveURL(/\/online-store(?:\?|$)/);
  await expect(page.locator(".rms-online-desktop")).toBeVisible();

  const inventoryAlert = page.locator(".rms-online-inventory-alert-dialog");
  if (
    options.dismissInventoryAlert !== false &&
    (await inventoryAlert.isVisible({ timeout: 2_000 }).catch(() => false))
  ) {
    await inventoryAlert.getByRole("button", { name: "Dismiss" }).click();
    await expect(inventoryAlert).toBeHidden();
  }
}

async function openWorkspace(page: Page, label: string) {
  await page
    .getByRole("navigation", { name: "Desktop workspaces" })
    .getByRole("button", { name: new RegExp(`^${label}$`, "i") })
    .click();
}

async function closeActiveDrawer(page: Page) {
  const drawer = page.locator(".rms-receipt-drawer:visible, .rms-report-drawer:visible").last();

  if (await drawer.isVisible().catch(() => false)) {
    await drawer.getByRole("button", { name: "Close" }).click();
    await expect(drawer).toBeHidden();
  }
}

async function ensureOpenShift(page: Page) {
  await openWorkspace(page, "POS");
  const openShiftButton = page.getByRole("button", { name: "Open shift" });

  if (await openShiftButton.isVisible().catch(() => false)) {
    await page.locator(".rms-action-input").fill("100");
    await openShiftButton.click();
    await expect(page.locator("body")).toContainText(/opened|open on this terminal|WEB-\d{8}-/i);
  }
}

async function addProductToBasket(page: Page, productName = saleProductName, quantity = 1) {
  await openWorkspace(page, "POS");
  await closeActiveDrawer(page);
  await page.locator(".rms-scan-strip input").first().fill(productName);
  await page.locator(".rms-scan-strip .rms-qty-input").fill(String(quantity));
  await page.locator(".rms-customer-suggestions.is-product button").filter({ hasText: productName }).first().click();
  await expect(page.locator(".rms-cart-table .rms-table-row").filter({ hasText: productName }).first()).toBeVisible();
}

async function currentSaleTotal(page: Page) {
  const totalText = await page.locator(".rms-pos-cart .rms-total-strip.is-sale-totals .rms-stat.is-good strong").innerText();

  return parseMoneyText(totalText).toFixed(2);
}

async function fillPrimaryPaymentAmount(page: Page, amount: string) {
  const paymentRow = page.locator(".rms-pos-cart .rms-payment-row").first();
  const tenderSelect = paymentRow.locator("select").first();
  const cashTenderValue = await tenderSelect.evaluate((select) => {
    const option = Array.from((select as HTMLSelectElement).options).find((candidate) =>
      /^Cash(?:\s|$)/i.test(candidate.textContent?.trim() ?? "")
    );

    return option?.value ?? "";
  });

  if (cashTenderValue) {
    await tenderSelect.selectOption(cashTenderValue);
  }

  await paymentRow.locator("input[type='number']").fill(amount);
}

async function payCurrentBasket(page: Page) {
  const total = await currentSaleTotal(page);

  await fillPrimaryPaymentAmount(page, total);
  await page.getByRole("button", { name: /^(Pay|Fulfil order)$/ }).click();
  await expect(page.locator(".rms-pos-cart")).toContainText(/completed|Posted|fulfilled/i, {
    timeout: 60_000
  });

  const message = await page.locator(".rms-pos-cart .rms-inline-message").last().innerText();
  const receiptNo = message.match(/[A-Z]+-[A-Z0-9-]+-\d+/)?.[0] ?? message.match(/[A-Z0-9-]{8,}/)?.[0] ?? null;

  expect(receiptNo, `Could not parse receipt number from checkout message: ${message}`).toBeTruthy();

  return receiptNo as string;
}

async function completeSale(page: Page, productName = saleProductName) {
  await addProductToBasket(page, productName);

  return payCurrentBasket(page);
}

async function completeHeldSaleRecall(page: Page) {
  await addProductToBasket(page, saleProductName);
  await page.getByRole("button", { name: "Hold sale" }).click();
  await expect(page.locator(".rms-pos-cart")).toContainText(/held/i);
  const heldDrawer = page.locator(".rms-receipt-drawer").filter({ hasText: "Recall baskets" }).first();

  if (!(await heldDrawer.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Recall held" }).click({ timeout: 5_000 }).catch(async (error) => {
      if (!(await heldDrawer.isVisible().catch(() => false))) {
        throw error;
      }
    });
  }

  await expect(heldDrawer).toBeVisible();
  await heldDrawer.locator(".rms-list-row").first().getByRole("button", { name: "Resume" }).click();
  await expect(page.locator(".rms-cart-table .rms-table-row").filter({ hasText: saleProductName }).first()).toBeVisible();

  return payCurrentBasket(page);
}

async function recordAccountPayment(page: Page) {
  await openWorkspace(page, "POS");
  await page.getByRole("button", { name: "Account pay" }).click();
  await page.locator(".rms-receipt-drawer input").first().fill(accountCustomerQuery);
  const customerRow = page.locator(".rms-account-customer").first();

  await expect(customerRow).toBeVisible();
  await customerRow.click();
  await page.locator(".rms-account-form input[type='number']").fill("1.00");
  await page.locator(".rms-account-form label").filter({ hasText: /^Reference$/ }).locator("input").fill(`PW-${Date.now()}`);
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.locator(".rms-account-form")).toContainText(/recorded|collected|remaining receivable/i, {
    timeout: 60_000
  });
}

async function openCorrection(page: Page, receiptNo: string, action: "Return" | "Exchange") {
  await openWorkspace(page, "Reversals");
  await page.locator(".rms-reversal-grid .rms-filter-row input").fill(receiptNo);
  const row = page.locator(".rms-mini-row").filter({ hasText: receiptNo }).first();

  await expect(row).toBeVisible();
  await row.getByRole("button", { name: action }).click();
  await expect(page.locator(".rms-correction-form")).toBeVisible();
}

async function completeReturn(page: Page, receiptNo: string) {
  await openCorrection(page, receiptNo, "Return");
  await page.locator(".rms-correction-form .rms-report-table input[type='number']").first().fill("1");
  const settlement = parseMoneyText(await page.locator(".rms-correction-form .rms-payment-summary strong").innerText()).toFixed(2);

  await page.locator(".rms-correction-form .rms-payment-row input[type='number']").first().fill(settlement);
  await page.getByRole("button", { name: "Complete Correction" }).click();
  await expect(page.locator(".rms-workspace")).toContainText(/completed|corrected|posted/i, {
    timeout: 60_000
  });
}

async function completeExchange(page: Page, receiptNo: string) {
  await openCorrection(page, receiptNo, "Exchange");
  await page.locator(".rms-correction-form .rms-report-table input[type='number']").first().fill("1");
  const replacementSelect = page.locator(".rms-correction-form .rms-manager-form select").first();
  const exchangeOption = await replacementSelect.evaluate((select, productName) => {
    const options = Array.from((select as HTMLSelectElement).options);
    const match = options.find((option) => option.textContent?.includes(String(productName))) ?? options.find((option) => option.value);

    return match?.value ?? "";
  }, exchangeProductName);

  test.skip(!exchangeOption, `No exchange replacement product matched ${exchangeProductName}.`);

  await replacementSelect.selectOption(exchangeOption);
  await page.locator(".rms-correction-form .rms-manager-form input[type='number']").fill("1");
  const settlement = parseMoneyText(await page.locator(".rms-correction-form .rms-payment-summary strong").innerText()).toFixed(2);
  const paymentInput = page.locator(".rms-correction-form .rms-payment-row input[type='number']").first();

  if (Number(settlement) > 0) {
    await paymentInput.fill(settlement);
  }

  await page.getByRole("button", { name: "Complete Correction" }).click();
  await expect(page.locator(".rms-workspace")).toContainText(/completed|corrected|posted/i, {
    timeout: 60_000
  });
}

async function postStockCountAdjustment(page: Page) {
  await openWorkspace(page, "Inventory");
  await page.getByRole("button", { name: "COUNTS" }).click();
  await page.getByRole("button", { name: "COUNT SHEET" }).click();
  const productSelect = page.locator(".rms-count-line-entry select").first();

  await productSelect.selectOption({ index: 1 });
  const systemQuantity = parseMoneyText(await page.locator(".rms-count-line-entry input[readonly]").inputValue());
  await page.locator(".rms-count-line-entry input[type='number']").fill((systemQuantity + 1).toFixed(3));
  await page.getByRole("button", { name: "Save line" }).click();
  await expect(page.locator(".rms-inventory-browser")).toContainText(/Saved|stock count/i);

  await page.locator(".rms-count-history-table .rms-table-row").first().getByRole("button", { name: "Commit" }).click();
  const confirmCommitButton = page.getByRole("button", {
    name: "Commit stock count",
    exact: true
  });

  await expect(confirmCommitButton).toBeVisible();
  await confirmCommitButton.click();
  await expect(page.locator(".rms-inventory-browser")).toContainText(/Committed|posted/i, {
    timeout: 60_000
  });
}

async function closeShiftRecordBankingAndReopen(page: Page) {
  await openWorkspace(page, "Manager");
  await page.getByRole("button", { name: "EOD", exact: true }).click();
  await page.getByRole("button", { name: /Close shift|Close shift \/ Record EOD/ }).click();
  const dialog = page.locator(".rms-modal-backdrop .rms-dialog");
  await expect(dialog).toBeVisible();
  const expectedCash = parseMoneyText(
    await dialog.getByText("Expected", { exact: true }).locator("..").locator("strong").innerText()
  );
  expect(expectedCash).toBeGreaterThan(0);
  await dialog.getByRole("spinbutton", { name: "Closing cash amount", exact: true }).fill(expectedCash.toFixed(2));
  const eodResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/online-store/eod") && response.request().method() === "POST"
  );
  await dialog.getByRole("button", { name: "Close shift" }).click();
  const eodHttpResponse = await eodResponse;
  const eodPayload = (await eodHttpResponse.json()) as {
    message?: string;
    reconciliationNo?: string;
  };
  expect(eodHttpResponse.ok(), eodPayload.message).toBeTruthy();
  expect(eodPayload.reconciliationNo).toBeTruthy();
  await expect(page.locator(".rms-workspace")).toContainText(/Recorded|closed/i);

  await page.getByRole("button", { name: "BANKING", exact: true }).click();
  const eodSelect = page.getByRole("combobox", { name: "EOD", exact: true });
  await expect
    .poll(async () => eodSelect.locator("option").allTextContents(), { timeout: 30_000 })
    .toEqual(expect.arrayContaining([expect.stringContaining(eodPayload.reconciliationNo!)]));
  const reconciliationId = await eodSelect.evaluate((select, reconciliationNo) => {
    const option = Array.from((select as HTMLSelectElement).options).find((candidate) =>
      candidate.textContent?.includes(String(reconciliationNo))
    );

    return option?.value ?? "";
  }, eodPayload.reconciliationNo);
  expect(reconciliationId).toBeTruthy();
  await eodSelect.selectOption(reconciliationId);
  const bankingAmount = Number(await page.getByRole("spinbutton", { name: "Amount", exact: true }).inputValue());
  expect(bankingAmount).toBeGreaterThan(0);
  const bankingResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/online-store/banking") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Record Banking" }).click();
  const bankingHttpResponse = await bankingResponse;
  const bankingPayload = (await bankingHttpResponse.json()) as {
    depositNo?: string;
    message?: string;
  };
  expect(bankingHttpResponse.ok(), bankingPayload.message).toBeTruthy();
  expect(bankingPayload.depositNo).toBeTruthy();
  await expect(page.locator(".rms-workspace")).toContainText(/Recorded|deposit|banked/i);

  await page.getByRole("button", { name: "SHIFT", exact: true }).click();
  const openShiftButton = page.getByRole("button", { name: "Open shift" });
  if (await openShiftButton.isVisible().catch(() => false)) {
    await page.locator(".rms-manager-grid input[type='number']").first().fill("100");
    await openShiftButton.click();
    await expect(page.locator(".rms-workspace")).toContainText(/opened/i);
  }
}

async function onlineStoreReport(page: Page, reportId: "sales" | "inventory", productQuery?: string) {
  return page.evaluate(
    async ({ reportId, productQuery }) => {
      const response = await fetch("/api/online-store/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reportId,
          scope: "STORE",
          productQuery: productQuery ?? null,
          limit: 100
        })
      });
      const payload = (await response.json()) as {
        message?: string;
        reports?: {
          summary?: {
            netSalesAmount?: number;
          };
          inventoryRows?: Array<{
            productCode: string;
            quantityOnHand: number;
          }>;
        };
      };

      if (!response.ok || !payload.reports) {
        throw new Error(payload.message ?? `Flash ERP could not load the ${reportId} report.`);
      }

      return payload.reports;
    },
    { reportId, productQuery }
  );
}

async function onlineInventoryQuantity(page: Page, productCode: string) {
  const report = await onlineStoreReport(page, "inventory", productCode);

  return (report.inventoryRows ?? [])
    .filter((row) => row.productCode === productCode)
    .reduce((sum, row) => sum + Number(row.quantityOnHand), 0);
}

test.describe("online store desktop parity", () => {
  test.skip(
    !enterpriseBaseUrl || !loginId || !password,
    "Set FLASH_ERP_E2E_ENTERPRISE_BASE_URL, FLASH_ERP_E2E_ONLINE_STORE_LOGIN, and FLASH_ERP_E2E_ONLINE_STORE_PASSWORD to run online-store parity certification."
  );

  test("branding logo, collapsed menu icons, and top products match desktop shell expectations", async ({
    page
  }) => {
    await completeOnlineStoreSignIn(page);

    const shellLogo = page.locator(".rms-sidebar-brand .rms-logo").first();
    await expect(shellLogo).toBeVisible();
    await expect(shellLogo).toHaveClass(/has-image/);
    await expect(shellLogo.locator("img")).toBeVisible();

    await page.locator(".rms-sidebar-toggle").click();
    await expect(page.locator(".rms-online-desktop")).toHaveClass(/is-sidebar-collapsed/);
    await expect(shellLogo).toBeVisible();
    await expect(shellLogo.locator("img")).toBeVisible();
    await expect(page.locator(".rms-nav .rms-nav-icon").first()).toBeVisible();
    expect(await page.locator(".rms-nav button:visible").count()).toBeGreaterThan(0);
    expect(await page.locator(".rms-nav-label:visible").count()).toBe(0);
    expect(await page.locator(".rms-nav-abbrev:visible").count()).toBe(0);

    await expect(page.getByRole("heading", { name: "Top products" })).toBeVisible();
    const rankedTopProduct = page.locator(".rms-top-product-feature .rms-top-product-rank");

    if (await rankedTopProduct.count()) {
      await expect(rankedTopProduct).toHaveText("1");
      expect(
        await page.locator(".rms-top-product-list .rms-top-product-rank:visible, .rms-top-product-list b:visible").count()
      ).toBe(0);
    } else {
      await expect(page.locator(".rms-top-product-feature")).toContainText(
        /None|No sales yet|No product sales in scope/i
      );
    }
  });

  test("inventory startup alerts use full grids and export real Excel workbooks", async ({ page }) => {
    test.setTimeout(180_000);
    await completeOnlineStoreSignIn(page, { dismissInventoryAlert: false });

    const alert = page.locator(".rms-online-inventory-alert-dialog");
    const alertVisible = await alert.isVisible({ timeout: 3_000 }).catch(() => false);

    test.skip(!alertVisible, "The assigned store has no enabled low-stock or expiring-batch startup alerts.");
    await expect(alert).toBeVisible();
    const geometry = await alert.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const tabs = Array.from(element.querySelectorAll<HTMLElement>(".rms-inventory-alert-tabs button"));

      return {
        width: rect.width,
        height: rect.height,
        tabWidths: tabs.map((tab) => tab.getBoundingClientRect().width),
        tabHeights: tabs.map((tab) => tab.getBoundingClientRect().height)
      };
    });

    expect(geometry.width).toBeGreaterThan(1000);
    expect(geometry.height).toBeGreaterThan(600);
    expect(Math.min(...geometry.tabWidths)).toBeGreaterThan(400);
    expect(Math.min(...geometry.tabHeights)).toBeGreaterThanOrEqual(46);
    await expect(alert.getByRole("button", { name: /Export Excel/ })).toBeVisible();
    await page.screenshot({
      path: ".e2e/evidence/online-store-inventory-startup-alert-desktop.png"
    });

    await page.evaluate(() => {
      const captureWindow = window as typeof window & {
        __rmsOnlineExcelDownloads?: Array<{ fileName: string; signature: number[] }>;
      };
      const originalClick = HTMLAnchorElement.prototype.click;

      captureWindow.__rmsOnlineExcelDownloads = [];
      HTMLAnchorElement.prototype.click = function click() {
        if (this.download.endsWith(".xlsx")) {
          const fileName = this.download;
          void fetch(this.href)
            .then((response) => response.arrayBuffer())
            .then((buffer) => {
              captureWindow.__rmsOnlineExcelDownloads?.push({
                fileName,
                signature: Array.from(new Uint8Array(buffer).slice(0, 4))
              });
            });
          return;
        }

        originalClick.call(this);
      };
    });

    let expectedDownloads = 0;
    for (const tabName of [/Expiring batches/, /Low stock/]) {
      await alert.getByRole("tab", { name: tabName }).click();
      const exportButton = alert.getByRole("button", { name: /Export Excel/ });

      if (!(await exportButton.isDisabled())) {
        expectedDownloads += 1;
        await exportButton.click();
        await expect.poll(() => page.evaluate(() => (
          window as typeof window & { __rmsOnlineExcelDownloads?: unknown[] }
        ).__rmsOnlineExcelDownloads?.length ?? 0)).toBe(expectedDownloads);
      }
    }

    expect(expectedDownloads).toBeGreaterThan(0);
    const downloads = await page.evaluate(() => (
      window as typeof window & {
        __rmsOnlineExcelDownloads?: Array<{ fileName: string; signature: number[] }>;
      }
    ).__rmsOnlineExcelDownloads ?? []);
    for (const download of downloads) {
      expect(download.fileName).toMatch(/^flash-erp-(?:expiring-batches|low-stock)-\d{4}-\d{2}-\d{2}\.xlsx$/);
      expect(download.signature.slice(0, 2)).toEqual([0x50, 0x4b]);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileGeometry = await alert.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const tabs = Array.from(element.querySelectorAll<HTMLElement>(".rms-inventory-alert-tabs button"));

      return {
        width: rect.width,
        height: rect.height,
        tabWidths: tabs.map((tab) => tab.getBoundingClientRect().width)
      };
    });
    expect(mobileGeometry.width).toBeLessThanOrEqual(390);
    expect(mobileGeometry.height).toBeLessThanOrEqual(844);
    expect(Math.min(...mobileGeometry.tabWidths)).toBeGreaterThan(150);
    await page.screenshot({
      path: ".e2e/evidence/online-store-inventory-startup-alert-mobile.png"
    });
  });

  test("purchase order receipt dialog remains usable on desktop and mobile", async ({ page }) => {
    test.setTimeout(180_000);
    await completeOnlineStoreSignIn(page);
    await openWorkspace(page, "Inventory");
    await page.getByRole("button", { name: "RECEIVING" }).click();

    const receiveButtons = page.locator('.rms-receiving-header-table button[aria-label^="Receive "]:not([disabled])');
    const receiveButtonCount = await receiveButtons.count();
    const openButtons = receiveButtonCount > 0
      ? receiveButtons
      : page.locator('.rms-receiving-header-table button[aria-label^="View "]');
    const openButtonCount = await openButtons.count();

    test.skip(openButtonCount === 0, "The assigned store has no purchase order to inspect.");
    await openButtons.first().click();

    const dialog = page.locator(".rms-po-document-line-table").locator("..");
    await expect(dialog).toBeVisible();
    const desktopGeometry = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const lineTable = element.querySelector<HTMLElement>(".rms-po-document-line-table");

      return {
        width: rect.width,
        height: rect.height,
        tableClientWidth: lineTable?.clientWidth ?? 0,
        tableScrollWidth: lineTable?.scrollWidth ?? 0
      };
    });
    expect(desktopGeometry.width).toBeGreaterThan(1100);
    expect(desktopGeometry.height).toBeGreaterThan(400);
    expect(desktopGeometry.tableScrollWidth).toBeLessThanOrEqual(desktopGeometry.tableClientWidth + 1);
    await page.screenshot({ path: ".e2e/evidence/online-store-purchase-order-dialog-desktop.png" });

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileGeometry = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const header = element.querySelector<HTMLElement>(".rms-panel-title");
      const lineTable = element.querySelector<HTMLElement>(".rms-po-document-line-table");

      return {
        top: rect.top,
        width: rect.width,
        height: rect.height,
        headerTop: header?.getBoundingClientRect().top ?? -1,
        tableClientWidth: lineTable?.clientWidth ?? 0,
        tableScrollWidth: lineTable?.scrollWidth ?? 0
      };
    });
    expect(mobileGeometry.top).toBeGreaterThanOrEqual(0);
    expect(mobileGeometry.headerTop).toBeGreaterThanOrEqual(mobileGeometry.top);
    expect(mobileGeometry.width).toBeLessThanOrEqual(390);
    expect(mobileGeometry.height).toBeLessThanOrEqual(844);
    expect(mobileGeometry.tableScrollWidth).toBeLessThanOrEqual(mobileGeometry.tableClientWidth + 1);
    await page.screenshot({ path: ".e2e/evidence/online-store-purchase-order-dialog-mobile.png" });
  });

  test("core desktop operation surfaces are exposed in browser mode", async ({ page }) => {
    await completeOnlineStoreSignIn(page);

    await openWorkspace(page, "POS");
    for (const label of [
      "Sale mode",
      "Sales order mode",
      "Hold sale",
      "Pending orders",
      "Account pay",
      "Recall held",
      "Receipts",
      "X report",
      "Close shift"
    ]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
    await expect(page.locator(".rms-pos-actions .is-save-order")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save order", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Sales order mode", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save order", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sale mode", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save order", exact: true })).toHaveCount(0);

    await openWorkspace(page, "Inventory");
    for (const label of ["STOCK", "RECEIVING", "TRANSFERS", "COUNTS"]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
    await expect(page.getByRole("tab", { name: "Inventory browser" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Batch register" })).toBeVisible();
    await page.getByRole("tab", { name: "Batch register" }).click();
    await expect(page.locator(".rms-inventory-batch-table")).toBeVisible();
    await page.getByRole("button", { name: "RECEIVING" }).click();
    for (const label of ["Purchase orders", "Goods receipts", "Supplier returns"]) {
      await expect(page.getByRole("tab", { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Purchase orders" })).toBeVisible();
    await page.getByRole("tab", { name: "Goods receipts", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Recent GRNs" })).toBeVisible();
    await page.getByRole("tab", { name: "Supplier returns", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Return against GRN" })).toBeVisible();
    await page.getByRole("button", { name: "TRANSFERS" }).click();
    await expect(page.getByRole("button", { name: "Create new" })).toBeVisible();
    await page.getByRole("button", { name: "COUNTS" }).click();
    await page.getByRole("button", { name: "COUNT SHEET" }).click();
    await expect(page.getByRole("button", { name: "Save line" })).toBeVisible();

    await openWorkspace(page, "Manager");
    for (const label of ["SHIFT", "EOD", "BANKING", "SUMMARY"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "EOD", exact: true }).click();
    await expect(page.getByRole("button", { name: /Close shift|Close shift \/ Record EOD/ })).toBeVisible();
    await page.getByRole("button", { name: "BANKING", exact: true }).click();
    await expect(page.getByRole("button", { name: "Record Banking" })).toBeVisible();

    await openWorkspace(page, "Reversals");
    await expect(page.getByRole("heading", { name: "Correction search" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Select receipt|RETURN|EXCHANGE/ })).toBeVisible();

    await openWorkspace(page, "Reports");
    await expect(page.getByRole("button", { name: "Apply" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();

    await openWorkspace(page, "Settings");
    await page.getByRole("tab", { name: "Options", exact: true }).click();
    await expect(page.getByText("Expiry alert lead days", { exact: true })).toBeVisible();
    await expect(page.getByText("Critical expiry days", { exact: true })).toBeVisible();
  });

  test("POS rows remain readable and expiry-controlled items expose batch choice", async ({ page }) => {
    test.setTimeout(180_000);
    await completeOnlineStoreSignIn(page);
    await ensureOpenShift(page);
    await openWorkspace(page, "Inventory");
    await page.getByRole("tab", { name: "Batch register", exact: true }).click();

    const batchRows = page.locator(
      ".rms-inventory-batch-table.rms-stock-section-grid .rms-table-row",
    );
    const batchRowCount = await batchRows.count();
    test.skip(batchRowCount === 0, "The assigned store has no saleable expiry batch.");

    const firstBatchRow = batchRows.first();
    const productCode = (await firstBatchRow.locator("small").innerText()).trim();
    const batchNo = (
      await firstBatchRow.locator(":scope > strong").first().innerText()
    ).trim();

    await openWorkspace(page, "POS");
    await closeActiveDrawer(page);
    const clearScreenButton = page.getByRole("button", {
      name: "Clear screen",
      exact: true,
    });

    if (await clearScreenButton.isEnabled()) {
      await clearScreenButton.click();
    }
    await expect(
      page.locator(".rms-pos-cart .rms-loyalty-strip"),
    ).toHaveCount(0);

    const emptyCheckoutGeometry = await page.locator(".rms-pos-cart").evaluate(
      (panel) => {
        const panelRect = panel.getBoundingClientRect();
        const cartRect = panel
          .querySelector<HTMLElement>(".rms-cart-table")!
          .getBoundingClientRect();
        const dockRect = panel
          .querySelector<HTMLElement>(".rms-checkout-dock")!
          .getBoundingClientRect();

        return {
          bottomGap: panelRect.bottom - dockRect.bottom,
          cartDockGap: dockRect.top - cartRect.bottom,
          cartHeight: cartRect.height,
        };
      },
    );
    expect(emptyCheckoutGeometry.bottomGap).toBeGreaterThanOrEqual(0);
    expect(emptyCheckoutGeometry.bottomGap).toBeLessThanOrEqual(12);
    expect(emptyCheckoutGeometry.cartDockGap).toBeGreaterThanOrEqual(-1);
    expect(emptyCheckoutGeometry.cartHeight).toBeGreaterThan(160);

    const scanInput = page.locator(".rms-scan-strip input").first();
    await scanInput.fill(productCode);
    const productSuggestion = page
      .locator(".rms-customer-suggestions.is-product button")
      .filter({ hasText: productCode });
    await expect(productSuggestion).toHaveCount(1);
    await productSuggestion.click();

    const batchDialog = page.locator(".rms-item-dialog.is-batch-selection");
    await expect(batchDialog).toBeVisible();
    await expect(batchDialog.getByText("Automatic FEFO", { exact: true })).toBeVisible();
    const selectedBatchChoice = batchDialog
      .locator(".rms-batch-choice")
      .filter({ hasText: batchNo });
    await expect(selectedBatchChoice).toHaveCount(1);
    await selectedBatchChoice.getByRole("radio").check();
    await expect(selectedBatchChoice.getByRole("radio")).toBeChecked();
    await batchDialog
      .getByRole("button", { name: "Add item", exact: true })
      .click();

    const expiryLine = page
      .locator(".rms-cart-table .rms-table-row")
      .filter({ hasText: productCode });
    await expect(expiryLine).toContainText(`Batch ${batchNo}`);
    await addProductToBasket(page, saleProductName);
    await addProductToBasket(page, exchangeProductName);

    const desktopGeometry = await page.locator(".rms-cart-table").evaluate(
      (table) => {
        const rows = Array.from(
          table.querySelectorAll<HTMLElement>(".rms-table-row"),
        );
        const rowRects = rows.map((row) => row.getBoundingClientRect());
        const panelRect = table.parentElement!.getBoundingClientRect();
        const dockRect = table.parentElement!
          .querySelector<HTMLElement>(".rms-checkout-dock")!
          .getBoundingClientRect();
        const tableRect = table.getBoundingClientRect();

        return {
          clientWidth: table.clientWidth,
          scrollWidth: table.scrollWidth,
          rowHeights: rowRects.map((rect) => rect.height),
          rowBackgrounds: rows.map(
            (row) => window.getComputedStyle(row).backgroundColor,
          ),
          rowGaps: rowRects.slice(1).map((rect, index) =>
            rect.top - rowRects[index]!.bottom,
          ),
          rowContentOverflows: rows.map(
            (row) => row.scrollHeight - row.clientHeight,
          ),
          dockBottomGap: panelRect.bottom - dockRect.bottom,
          cartDockGap: dockRect.top - tableRect.bottom,
        };
      },
    );
    expect(desktopGeometry.scrollWidth).toBeLessThanOrEqual(
      desktopGeometry.clientWidth + 1,
    );
    expect(Math.min(...desktopGeometry.rowHeights)).toBeGreaterThanOrEqual(62);
    expect(Math.max(...desktopGeometry.rowHeights)).toBeLessThanOrEqual(68);
    expect(new Set(desktopGeometry.rowBackgrounds).size).toBeGreaterThan(1);
    expect(
      desktopGeometry.rowBackgrounds.every(
        (color, index, colors) => index === 0 || color !== colors[index - 1],
      ),
    ).toBe(true);
    expect(Math.min(...desktopGeometry.rowGaps)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...desktopGeometry.rowContentOverflows)).toBeLessThanOrEqual(1);
    expect(desktopGeometry.dockBottomGap).toBeLessThanOrEqual(12);
    expect(desktopGeometry.cartDockGap).toBeGreaterThanOrEqual(-1);
    const salePaymentRemove = page
      .locator(".rms-payment-row .rms-payment-remove-button")
      .first();
    await expect(salePaymentRemove).toHaveAttribute("title", "Remove payment");
    await expect(salePaymentRemove.locator("svg")).toBeVisible();
    await expect(salePaymentRemove).toHaveText("");
    await page.screenshot({
      path: ".e2e/evidence/online-store-pos-batch-cart-desktop.png",
    });

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileGeometry = await page.locator(".rms-cart-table").evaluate(
      (table) => {
        const rows = Array.from(
          table.querySelectorAll<HTMLElement>(".rms-table-row"),
        );
        const rowRects = rows.map((row) => row.getBoundingClientRect());

        return {
          clientWidth: table.clientWidth,
          scrollWidth: table.scrollWidth,
          rowHeights: rowRects.map((rect) => rect.height),
          rowGaps: rowRects.slice(1).map((rect, index) =>
            rect.top - rowRects[index]!.bottom,
          ),
        };
      },
    );
    expect(mobileGeometry.scrollWidth).toBeLessThanOrEqual(
      mobileGeometry.clientWidth + 1,
    );
    expect(Math.min(...mobileGeometry.rowHeights)).toBeGreaterThanOrEqual(94);
    expect(Math.min(...mobileGeometry.rowGaps)).toBeGreaterThanOrEqual(-1);
    await page.screenshot({
      path: ".e2e/evidence/online-store-pos-batch-cart-mobile.png",
    });

    await clearScreenButton.click();
    await page.getByRole("button", { name: "Sales order mode", exact: true }).click();
    const orderPaymentRemove = page
      .locator(".rms-payment-row .rms-payment-remove-button")
      .first();
    await expect(orderPaymentRemove).toHaveAttribute("title", "Remove payment");
    await expect(orderPaymentRemove.locator("svg")).toBeVisible();
    await expect(orderPaymentRemove).toHaveText("");
  });

  test.describe.serial("online store transactional desktop parity", () => {
    test("sale, hold recall, account payment, correction, inventory, EOD, and banking post successfully", async ({
      page
    }) => {
      test.setTimeout(300_000);
      await completeOnlineStoreSignIn(page);
      await ensureOpenShift(page);

      const netSalesBefore = Number((await onlineStoreReport(page, "sales")).summary?.netSalesAmount ?? 0);
      const saleReceiptNo = await completeSale(page);
      const netSalesAfterSale = Number((await onlineStoreReport(page, "sales")).summary?.netSalesAmount ?? 0);
      const heldSaleReceiptNo = await completeHeldSaleRecall(page);
      const netSalesAfterHeldSale = Number((await onlineStoreReport(page, "sales")).summary?.netSalesAmount ?? 0);

      await recordAccountPayment(page);
      await completeReturn(page, saleReceiptNo);
      const netSalesAfterReturn = Number((await onlineStoreReport(page, "sales")).summary?.netSalesAmount ?? 0);
      expect(netSalesAfterSale).toBeGreaterThan(netSalesBefore);
      expect(netSalesAfterReturn).toBeCloseTo(
        netSalesAfterHeldSale - (netSalesAfterSale - netSalesBefore),
        2
      );
      await completeExchange(page, heldSaleReceiptNo);
      await postStockCountAdjustment(page);
      await closeShiftRecordBankingAndReopen(page);
    });

    test("partial-deposit sales order, fulfilment, purchase receipt, and GRN remain balanced", async ({
      page
    }) => {
      test.setTimeout(300_000);
      await completeOnlineStoreSignIn(page);
      await ensureOpenShift(page);

      const inventoryBefore = await onlineInventoryQuantity(page, "FLASH-WATER-75CL");

      await page.getByRole("button", { name: "Sales order mode", exact: true }).click();
      await addProductToBasket(page, saleProductName, 3);
      const customerInput = page.getByPlaceholder("Start typing customer name, no, phone, or email");
      await customerInput.fill(accountCustomerQuery);
      await page
        .locator(".rms-customer-suggestions:not(.is-product) button")
        .filter({ hasText: accountCustomerQuery })
        .first()
        .click();
      await fillPrimaryPaymentAmount(page, "1.00");

      const saveOrderResponse = page.waitForResponse(
        (response) => response.url().includes("/api/online-store/sales-orders") && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: "Save order", exact: true }).click();
      const savedOrderHttpResponse = await saveOrderResponse;
      const savedOrderPayload = (await savedOrderHttpResponse.json()) as {
        message?: string;
        salesOrder?: {
          orderId: string;
          orderNo: string;
          status: string;
          totalAmount: number;
          depositAmount: number;
          balanceAmount: number;
          lines: Array<{ productCode: string; quantity: number }>;
        };
      };

      expect(savedOrderHttpResponse.ok(), savedOrderPayload.message).toBeTruthy();
      expect(savedOrderPayload.salesOrder).toBeTruthy();
      const savedOrder = savedOrderPayload.salesOrder!;
      expect(savedOrder.status).toBe("OPEN");
      expect(savedOrder.depositAmount).toBeCloseTo(1, 2);
      expect(savedOrder.balanceAmount).toBeCloseTo(savedOrder.totalAmount - 1, 2);
      expect(savedOrder.lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ productCode: "FLASH-WATER-75CL", quantity: 3 })
        ])
      );
      expect(await onlineInventoryQuantity(page, "FLASH-WATER-75CL")).toBeCloseTo(inventoryBefore, 3);

      const orderDrawer = page.locator(".rms-receipt-drawer").filter({ hasText: "Fulfilment" });
      const savedOrderRow = orderDrawer.locator(".rms-list-row").filter({ hasText: savedOrder.orderNo }).first();
      await expect(savedOrderRow).toContainText("OPEN");
      await savedOrderRow.getByRole("button", { name: "Fulfil", exact: true }).click();
      await expect(page.locator(".rms-cart-table .rms-table-row").filter({ hasText: saleProductName })).toBeVisible();
      expect(
        Number(await page.locator(".rms-pos-cart .rms-payment-row input[type='number']").first().inputValue())
      ).toBeCloseTo(savedOrder.balanceAmount, 2);

      const fulfilResponse = page.waitForResponse(
        (response) => response.url().endsWith("/api/online-store/sales") && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: "Fulfil order", exact: true }).click();
      const fulfilledHttpResponse = await fulfilResponse;
      const fulfilledPayload = (await fulfilledHttpResponse.json()) as {
        message?: string;
        transactionNo?: string;
      };
      expect(fulfilledHttpResponse.ok(), fulfilledPayload.message).toBeTruthy();
      expect(fulfilledPayload.transactionNo).toBeTruthy();
      expect(await onlineInventoryQuantity(page, "FLASH-WATER-75CL")).toBeCloseTo(inventoryBefore - 3, 3);

      await page.getByRole("button", { name: "Pending orders", exact: true }).click();
      const fulfilledOrderRow = page
        .locator(".rms-receipt-drawer .rms-list-row")
        .filter({ hasText: savedOrder.orderNo })
        .first();
      await expect(fulfilledOrderRow).toContainText("FULFILLED");
      await closeActiveDrawer(page);

      await openWorkspace(page, "Inventory");
      await page.getByRole("button", { name: "RECEIVING", exact: true }).click();
      await page.getByRole("button", { name: "Create PO", exact: true }).click();
      const purchaseOrderDialog = page.locator(".rms-modal-backdrop .rms-dialog").filter({ hasText: "New purchase order" });
      await purchaseOrderDialog.getByText("Supplier", { exact: true }).locator("..").locator("select").selectOption({ index: 1 });
      await purchaseOrderDialog.getByText("Receiving location", { exact: true }).locator("..").locator("select").selectOption({ index: 1 });
      await purchaseOrderDialog.getByText("Reference", { exact: true }).locator("..").locator("input").fill(`E2E-PO-${Date.now()}`);
      await purchaseOrderDialog.getByPlaceholder("Name, code, or SKU").fill(saleProductName);
      await purchaseOrderDialog.getByText("Product", { exact: true }).locator("..").locator("select").selectOption({ index: 1 });
      await purchaseOrderDialog.getByText("Quantity", { exact: true }).locator("..").locator("input").fill("5");
      await purchaseOrderDialog.getByRole("button", { name: "Add line", exact: true }).click();
      await expect(purchaseOrderDialog.locator(".rms-stock-request-line-table")).toContainText(saleProductName);

      const createPurchaseOrderResponse = page.waitForResponse(
        (response) => response.url().includes("/api/inventory/locations/") && response.url().endsWith("/purchase-orders") && response.request().method() === "POST"
      );
      await purchaseOrderDialog.getByRole("button", { name: "Create and commit", exact: true }).click();
      const purchaseOrderHttpResponse = await createPurchaseOrderResponse;
      const purchaseOrderPayload = (await purchaseOrderHttpResponse.json()) as {
        error?: string;
        message?: string;
        purchaseOrderNo?: string;
        status?: string;
      };
      expect(purchaseOrderHttpResponse.ok(), purchaseOrderPayload.error ?? purchaseOrderPayload.message).toBeTruthy();
      expect(purchaseOrderPayload.purchaseOrderNo).toBeTruthy();
      expect(purchaseOrderPayload.status).toBe("COMMITTED");
      const purchaseOrderNo = purchaseOrderPayload.purchaseOrderNo!;

      const documentFilter = page.getByPlaceholder("PO, GRN, supplier, location, product");
      await expect(documentFilter).toBeVisible();
      await documentFilter.fill(purchaseOrderNo);
      const purchaseOrderRow = page.locator(".rms-receiving-header-table .rms-table-row").filter({ hasText: purchaseOrderNo }).first();
      await expect(purchaseOrderRow).toContainText("5");
      await purchaseOrderRow.getByRole("button", { name: `Receive ${purchaseOrderNo}` }).click();
      const receiveDialog = page.locator(".rms-modal-backdrop .rms-dialog").filter({ hasText: purchaseOrderNo });
      await expect(receiveDialog).toBeVisible();

      const receiveResponse = page.waitForResponse(
        (response) => response.url().endsWith("/api/online-store/goods-receipts") && response.request().method() === "POST"
      );
      await receiveDialog.getByRole("button", { name: "Receive all", exact: true }).click();
      const receiptHttpResponse = await receiveResponse;
      const receiptPayload = (await receiptHttpResponse.json()) as {
        message?: string;
        receiptNo?: string;
      };
      expect(receiptHttpResponse.ok(), receiptPayload.message).toBeTruthy();
      expect(receiptPayload.receiptNo).toBeTruthy();
      await receiveDialog.getByRole("button", { name: "Close", exact: true }).click();

      await page.getByRole("tab", { name: "Goods receipts", exact: true }).click();
      const goodsReceiptTable = page.locator(".rms-grn-header-table");
      await expect(goodsReceiptTable).toContainText(receiptPayload.receiptNo!, { timeout: 60_000 });
      const goodsReceiptRow = goodsReceiptTable
        .locator(".rms-table-row")
        .filter({ hasText: receiptPayload.receiptNo! })
        .first();
      await expect(goodsReceiptRow).toBeVisible();
      await expect(goodsReceiptRow).toContainText(purchaseOrderNo);
      await expect(goodsReceiptRow).toContainText("5");
      expect(await onlineInventoryQuantity(page, "FLASH-WATER-75CL")).toBeCloseTo(inventoryBefore + 2, 3);
    });
  });
});
