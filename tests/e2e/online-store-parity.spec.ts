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

async function completeOnlineStoreSignIn(page: Page) {
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

  await expect(page).toHaveURL(/\/online-store(?:\?|$)/);
  await expect(page.locator(".rms-online-desktop")).toBeVisible();
}

async function openWorkspace(page: Page, label: string) {
  await page.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).click();
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

async function addProductToBasket(page: Page, productName = saleProductName) {
  await openWorkspace(page, "POS");
  await closeActiveDrawer(page);
  await page.locator(".rms-scan-strip input").first().fill(productName);
  await page.locator(".rms-customer-suggestions.is-product button").filter({ hasText: productName }).first().click();
  await expect(page.locator(".rms-cart-table .rms-table-row").filter({ hasText: productName }).first()).toBeVisible();
}

async function currentSaleTotal(page: Page) {
  const totalText = await page.locator(".rms-pos-cart .rms-total-strip.is-sale-totals .rms-stat.is-good strong").innerText();

  return parseMoneyText(totalText).toFixed(2);
}

async function fillPrimaryPaymentAmount(page: Page, amount: string) {
  await page.locator(".rms-pos-cart .rms-payment-row input[type='number']").first().fill(amount);
}

async function payCurrentBasket(page: Page) {
  const total = await currentSaleTotal(page);

  await fillPrimaryPaymentAmount(page, total);
  await page.getByRole("button", { name: /^(Pay|Fulfil order)$/ }).click();
  await expect(page.locator(".rms-pos-cart")).toContainText(/completed|Posted|fulfilled/i);

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
  await expect(page.locator(".rms-account-form")).toContainText(/recorded|collected|remaining receivable/i);
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
  await expect(page.locator(".rms-workspace")).toContainText(/completed|corrected|posted/i);
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
  await expect(page.locator(".rms-workspace")).toContainText(/completed|corrected|posted/i);
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

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.locator(".rms-count-history-table .rms-table-row").first().getByRole("button", { name: "Commit" }).click();
  await expect(page.locator(".rms-inventory-browser")).toContainText(/Committed|posted/i);
}

async function closeShiftRecordBankingAndReopen(page: Page) {
  await openWorkspace(page, "Manager");
  await page.getByRole("button", { name: "EOD", exact: true }).click();
  await page.getByRole("button", { name: /Close shift|Close shift \/ Record EOD/ }).click();
  const dialog = page.locator(".rms-modal-backdrop .rms-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close shift" }).click();
  await expect(page.locator(".rms-workspace")).toContainText(/Recorded|closed/i);

  await page.getByRole("button", { name: "BANKING", exact: true }).click();
  await page.getByRole("button", { name: "Record Banking" }).click();
  await expect(page.locator(".rms-workspace")).toContainText(/Recorded|deposit|banked/i);

  await page.getByRole("button", { name: "SHIFT", exact: true }).click();
  const openShiftButton = page.getByRole("button", { name: "Open shift" });
  if (await openShiftButton.isVisible().catch(() => false)) {
    await page.locator(".rms-manager-grid input[type='number']").first().fill("100");
    await openShiftButton.click();
    await expect(page.locator(".rms-workspace")).toContainText(/opened/i);
  }
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
    await expect(page.locator(".rms-top-product-feature .rms-top-product-rank")).toHaveText("1");
    expect(
      await page.locator(".rms-top-product-list .rms-top-product-rank:visible, .rms-top-product-list b:visible").count()
    ).toBe(0);
  });

  test("core desktop operation surfaces are exposed in browser mode", async ({ page }) => {
    await completeOnlineStoreSignIn(page);

    await openWorkspace(page, "POS");
    for (const label of [
      "Sale mode",
      "Sales order mode",
      "Hold sale",
      "Save order",
      "Pending orders",
      "Account pay",
      "Recall held",
      "Receipts",
      "X report",
      "Close shift"
    ]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }

    await openWorkspace(page, "Inventory");
    for (const label of ["STOCK", "RECEIVING", "TRANSFERS", "COUNTS"]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
    await page.getByRole("button", { name: "RECEIVING" }).click();
    await expect(page.getByRole("heading", { name: "Purchase orders" })).toBeVisible();
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
  });

  test.describe.serial("online store transactional desktop parity", () => {
    test("sale, hold recall, account payment, correction, inventory, EOD, and banking post successfully", async ({
      page
    }) => {
      await completeOnlineStoreSignIn(page);
      await ensureOpenShift(page);

      const saleReceiptNo = await completeSale(page);
      const heldSaleReceiptNo = await completeHeldSaleRecall(page);

      await recordAccountPayment(page);
      await completeReturn(page, saleReceiptNo);
      await completeExchange(page, heldSaleReceiptNo);
      await postStockCountAdjustment(page);
      await closeShiftRecordBankingAndReopen(page);
    });
  });
});
