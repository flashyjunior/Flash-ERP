import { expect, test, type Page } from "@playwright/test";

const enterpriseBaseUrl = process.env.FLASH_ERP_E2E_ENTERPRISE_BASE_URL;
const loginId = process.env.FLASH_ERP_E2E_ENTERPRISE_LOGIN;
const password = process.env.FLASH_ERP_E2E_ENTERPRISE_PASSWORD;
const explicitMfaCode = process.env.FLASH_ERP_E2E_MFA_CODE;

async function completeEnterpriseSignIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByPlaceholder("Enter your username or email").fill(loginId ?? "");
  await page.getByPlaceholder("Enter your password").fill(password ?? "");
  await page.getByRole("button", { name: /^Sign in$/ }).click();

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

  await expect(page).not.toHaveURL(/\/sign-in(?:\?|$)/);
}

test.describe("enterprise browser certification", () => {
  test.skip(
    !enterpriseBaseUrl || !loginId || !password,
    "Set FLASH_ERP_E2E_ENTERPRISE_BASE_URL, FLASH_ERP_E2E_ENTERPRISE_LOGIN, and FLASH_ERP_E2E_ENTERPRISE_PASSWORD to run enterprise E2E certification."
  );

  test("sign-in -> MFA -> dashboard", async ({ page }) => {
    await completeEnterpriseSignIn(page);
    await expect(page.locator("body")).toContainText(/Flash ERP|Overview|Dashboard/i);
  });

  test("security policy step-up can save through the protected route", async ({ page }) => {
    await completeEnterpriseSignIn(page);
    await page.goto("/security/password-policy");
    await expect(page.locator("body")).toContainText(/Password policy|MFA mode/i);
    await page.getByLabel("Step-up password").fill(password ?? "");
    await page.getByRole("button", { name: /Save password policy/i }).click();
    await expect(page.locator("body")).toContainText(/saved|updated|Flash ERP/i);
  });
});
