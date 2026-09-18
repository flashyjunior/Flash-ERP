import crypto from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import "dotenv/config";

import { formatStorefrontTaxonomyLabel } from "../../apps/enterprise-web/src/components/ecommerce/storefront-category-tree";
import { prisma } from "../../apps/enterprise-web/src/lib/db/prisma";

const storeCode = process.env.FLASH_ERP_E2E_ECOMMERCE_STORE;
const staffLogin = `ecommerce.qa.${crypto.randomBytes(5).toString("hex")}`;
const staffPassword = `Qa${crypto.randomBytes(12).toString("base64url")}9x`;
const securityAdminLogin = `ecommerce.security.qa.${crypto.randomBytes(5).toString("hex")}`;
const securityAdminPassword = `Qa${crypto.randomBytes(12).toString("base64url")}8z`;
const otpTestIp = `198.51.${crypto.randomInt(1, 255)}.${crypto.randomInt(1, 255)}`;
let staffUserId: string | null = null;
let staffReplacementUserId: string | null = null;
let securityAdminUserId: string | null = null;
let createdEcommerceOrderId: string | null = null;
let createdSalesOrderId: string | null = null;
let createdOrderNo: string | null = null;

async function completeStaffSignIn(page: Page, login = staffLogin, loginPassword = staffPassword) {
  await page.goto("/sign-in");
  await page.getByPlaceholder("Enter your username or email").fill(login);
  await page.getByPlaceholder("Enter your password").fill(loginPassword);
  const signInResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/sign-in") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /^Sign in$/ }).click();
  const signInResponse = await signInResponsePromise;
  expect(signInResponse.ok(), signInResponse.ok() ? undefined : await signInResponse.text()).toBeTruthy();

  const mfaInput = page.getByPlaceholder("000000");
  if (await mfaInput.isVisible({ timeout: 10_000 }).catch(() => false)) {
    const visibleCopy = await page.locator("main").innerText();
    const developmentCode = visibleCopy.match(/Development code:\s*(\d{6})/)?.[1] ?? null;
    test.skip(!developmentCode, "Development MFA code is not available for the temporary test user.");
    await mfaInput.fill(developmentCode ?? "");
    await page.getByRole("button", { name: /Verify MFA/i }).click();
  }

  await expect
    .poll(
      async () =>
        page.request
          .get("/api/auth/session")
          .then((response) => response.status())
          .catch(() => 0),
      { timeout: 30_000 }
    )
    .toBe(200);
}

async function dismissInventoryStartupAlert(page: Page) {
  const inventoryAlert = page.locator(".rms-inventory-alert-backdrop");
  const opened = await inventoryAlert
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);

  if (opened) {
    await inventoryAlert.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(inventoryAlert).toBeHidden();
  }
}

type PublicCatalogSnapshot = {
  store?: {
    heroImageUrls?: string[];
  };
  products?: Array<{
    code?: string;
    name?: string;
    department?: string | null;
    category?: string | null;
    subcategory?: string | null;
    availableQuantity?: number | null;
    variants?: Array<{ code?: string }>;
    promotion?: { code?: string } | null;
  }>;
  promotions?: Array<{ code?: string }>;
};

async function waitForPublicCatalog(
  page: Page,
  description: string,
  predicate: (catalog: PublicCatalogSnapshot) => boolean
) {
  await expect
    .poll(
      async () => {
        try {
          const response = await page.request.get(
            `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/catalog`
          );
          if (!response.ok()) return false;
          return predicate((await response.json()) as PublicCatalogSnapshot);
        } catch {
          return false;
        }
      },
      {
        message: `Waiting for ${description} to reach the public storefront catalog.`,
        timeout: 35_000,
        intervals: [250, 500, 1_000]
      }
    )
    .toBe(true);
}

test("keeps checkout-triggered customer sign-in above the mobile cart", async ({ page }, testInfo) => {
  test.skip(!storeCode, "Set FLASH_ERP_E2E_ECOMMERCE_STORE to an enabled public storefront.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/shop/${encodeURIComponent(storeCode ?? "")}`);

  const addToCartButton = page.getByRole("button", { name: /^Add .+ to cart$/ }).first();
  test.skip(
    await addToCartButton.count() === 0,
    "The storefront has no available simple product for checkout overlay acceptance.",
  );
  await addToCartButton.click();
  await page.getByRole("button", { name: "Open cart" }).click();
  const storefrontDrawer = page.getByTestId("storefront-drawer");
  await storefrontDrawer.getByRole("button", { name: "Checkout", exact: true }).click();

  const authDialog = page.getByRole("dialog");
  await expect(authDialog.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  const overlayStacking = await page.evaluate(() => ({
    auth: Number.parseInt(getComputedStyle(document.querySelector('[data-testid="storefront-auth-backdrop"]')!).zIndex, 10),
    drawer: Number.parseInt(getComputedStyle(document.querySelector('[data-testid="storefront-drawer"]')!).zIndex, 10),
  }));
  expect(overlayStacking.auth).toBeGreaterThan(overlayStacking.drawer);
  expect(await authDialog.evaluate((dialog) => {
    const bounds = dialog.getBoundingClientRect();
    const topmostElement = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    return topmostElement !== null && dialog.contains(topmostElement);
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("checkout-auth-mobile.png"), fullPage: false });
});

test.describe("public ecommerce extension", () => {
  test.skip(!storeCode, "Set FLASH_ERP_E2E_ECOMMERCE_STORE to an enabled public storefront.");

  test.beforeAll(async () => {
    if (!storeCode) return;
    const normalized = storeCode.trim();
    const store = await prisma.store.findFirstOrThrow({
      where: {
        OR: [
          { code: normalized.toUpperCase() },
          { ecommerceSlug: normalized.toLowerCase() }
        ]
      },
      select: { id: true, retailOrgId: true }
    });
    const role = await prisma.role.findFirstOrThrow({
      where: { retailOrgId: store.retailOrgId, code: "ONLINE_STORE_SUPERVISOR" },
      select: { id: true }
    });
    const replacementUser = await prisma.retailUser.findFirstOrThrow({
      where: {
        retailOrgId: store.retailOrgId,
        accountStatus: "ACTIVE",
        deletedAt: null
      },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    staffReplacementUserId = replacementUser.id;
    const user = await prisma.retailUser.create({
      data: {
        retailOrgId: store.retailOrgId,
        homeStoreId: store.id,
        loginId: staffLogin,
        email: `${staffLogin}@example.invalid`,
        displayName: "Ecommerce Workspace QA",
        passwordHash: await bcrypt.hash(staffPassword, 12),
        passwordUpdatedAt: new Date(),
        accountStatus: "ACTIVE",
        originNodeCode: "E2E",
        lastModifiedByNodeCode: "E2E",
        userRoles: { create: { roleId: role.id } }
      },
      select: { id: true }
    });
    staffUserId = user.id;
    const securityAdminRole = await prisma.role.findFirstOrThrow({
      where: { retailOrgId: store.retailOrgId, code: "HQ_ADMIN" },
      select: { id: true }
    });
    const securityAdmin = await prisma.retailUser.create({
      data: {
        retailOrgId: store.retailOrgId,
        loginId: securityAdminLogin,
        email: `${securityAdminLogin}@example.invalid`,
        displayName: "Ecommerce Privilege QA",
        passwordHash: await bcrypt.hash(securityAdminPassword, 12),
        passwordUpdatedAt: new Date(),
        accountStatus: "ACTIVE",
        originNodeCode: "E2E",
        lastModifiedByNodeCode: "E2E",
        userRoles: { create: { roleId: securityAdminRole.id } }
      },
      select: { id: true }
    });
    securityAdminUserId = securityAdmin.id;
  });

  test.afterAll(async () => {
    if (!staffUserId) return;
    await prisma.retailUserSession.deleteMany({ where: { retailUserId: staffUserId } });
    await prisma.retailUserRole.deleteMany({ where: { retailUserId: staffUserId } });
    if (
      staffReplacementUserId &&
      await prisma.posShift.count({ where: { cashierUserId: staffUserId } }) > 0
    ) {
      await prisma.posShift.updateMany({
        where: { cashierUserId: staffUserId },
        data: { cashierUserId: staffReplacementUserId }
      });
    }
    await prisma.retailUser.delete({ where: { id: staffUserId } });
    if (securityAdminUserId) {
      await prisma.retailUserSession.deleteMany({ where: { retailUserId: securityAdminUserId } });
      await prisma.retailUserRole.deleteMany({ where: { retailUserId: securityAdminUserId } });
      await prisma.retailUser.delete({ where: { id: securityAdminUserId } });
    }
  });

  test("renders a usable storefront across mobile, tablet, and desktop", async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await page.goto(`/shop/${encodeURIComponent(storeCode ?? "")}`);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByPlaceholder("Search products, brands and categories")).toBeVisible();
    await expect(page.locator("article").filter({ has: page.getByRole("heading", { level: 3 }) })).not.toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Product categories" })).toBeVisible();
    await expect(page.getByRole("button", { name: "All categories" })).toBeVisible();
    await expect(page.getByRole("button", { name: /All products/ })).toBeVisible();

    const providerResponse = await page.request.get(
      `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/auth/oauth/providers`
    );
    expect(providerResponse.ok(), await providerResponse.text()).toBeTruthy();
    const providerAvailability = (await providerResponse.json()) as {
      providers: Array<{ id: "google" | "facebook"; enabled: boolean }>;
    };
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const authDialog = page.getByRole("dialog");
    for (const provider of providerAvailability.providers) {
      const label = provider.id === "google" ? "Google" : "Facebook";
      const providerButton = authDialog.getByRole("button", { name: `Continue with ${label}` });
      await expect(providerButton).toBeVisible();
      if (provider.enabled) {
        await expect(providerButton).toBeEnabled();
      } else {
        await expect(providerButton).toBeDisabled();
      }
    }
    await authDialog.screenshot({ path: testInfo.outputPath("social-auth-options.png") });
    await authDialog.getByRole("button", { name: "Create a customer account" }).click();
    await expect(authDialog.getByRole("heading", { name: "Create account" })).toBeVisible();
    await expect(authDialog.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(authDialog.getByRole("button", { name: "Continue with Facebook" })).toBeVisible();
    await authDialog.screenshot({ path: testInfo.outputPath("social-signup-options.png") });
    await authDialog.getByTitle("Close").click();

    const searchInput = page.getByPlaceholder("Search products, brands and categories");
    const mediumFontSize = await searchInput.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    await page.getByRole("button", { name: "Use small text" }).click();
    const smallFontSize = await searchInput.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    await page.getByRole("button", { name: "Use medium text" }).click();
    const restoredMediumFontSize = await searchInput.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    await page.getByRole("button", { name: "Use large text" }).click();
    const largeFontSize = await searchInput.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(restoredMediumFontSize).toBeCloseTo(mediumFontSize, 1);
    expect(mediumFontSize / smallFontSize).toBeGreaterThanOrEqual(1.1);
    expect(largeFontSize / mediumFontSize).toBeGreaterThanOrEqual(1.2);
    await page.reload();
    await expect(page.getByRole("button", { name: "Use large text" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Use medium text" }).click();

    const catalogResponse = await page.request.get(
      `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/catalog`
    );
    expect(catalogResponse.ok(), await catalogResponse.text()).toBeTruthy();
    const catalog = (await catalogResponse.json()) as PublicCatalogSnapshot;
    const partialNameSearch = catalog.products
      ?.flatMap((product) => product.name.split(/\s+/).map((token) => ({ product, token })))
      .find(({ token }) => {
        if (token.length < 5) return false;
        const fragment = token.slice(1, Math.min(token.length, 5)).toLowerCase();
        return catalog.products?.filter((product) => product.name.toLowerCase().includes(fragment)).length === 1;
      });
    if (partialNameSearch) {
      const fragment = partialNameSearch.token
        .slice(1, Math.min(partialNameSearch.token.length, 5))
        .toLowerCase();
      await searchInput.fill(fragment[0] ?? fragment);
      await expect(page.locator('[aria-label="Search suggestions"]')).toBeVisible();
      await searchInput.fill(fragment);
      const productSuggestion = page
        .locator('[aria-label="Search suggestions"]')
        .getByRole("button", { name: `${partialNameSearch.product.name} Product`, exact: true });
      await expect(productSuggestion).toBeVisible();
      await productSuggestion.click();
      await expect(page).toHaveURL(/\/shop\/[^/]+\/search\?q=/, { timeout: 60_000 });
      await expect(page.getByTestId("storefront-search-results")).toContainText(
        partialNameSearch.product.name
      );
      await page.goto(`/shop/${encodeURIComponent(storeCode ?? "")}`);
    }

    const unavailableProduct = catalog.products?.find((product) => product.availableQuantity === 0);
    if (unavailableProduct) {
      await page.goto(
        `/shop/${encodeURIComponent(storeCode ?? "")}/search?q=${encodeURIComponent(unavailableProduct.name)}`
      );
      const unavailableCard = page.locator("article").filter({
        has: page.getByRole("heading", { level: 3, name: unavailableProduct.name, exact: true })
      });
      await expect(unavailableCard.getByTestId("out-of-stock-ribbon")).toHaveText("Out of stock");
      await page.goto(`/shop/${encodeURIComponent(storeCode ?? "")}`);
    }

    const departmentName = catalog.products
      ?.map((product) => product.department?.trim())
      .find((value): value is string => Boolean(value));
    if (departmentName) {
      const departmentDisplayName = formatStorefrontTaxonomyLabel(departmentName);
      const departmentCount = catalog.products?.filter(
        (product) => product.department?.trim() === departmentName
      ).length ?? 0;
      const escapedDepartmentName = departmentDisplayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const categoriesNavigation = page.getByRole("navigation", { name: "Product categories" });
      const departmentButton = categoriesNavigation.getByRole("button", {
        name: new RegExp(`^${escapedDepartmentName}\\s+${departmentCount}$`)
      });
      await expect(page.getByRole("region", { name: `${departmentDisplayName} categories` })).toHaveCount(0);
      await departmentButton.hover();
      await expect(page.getByRole("region", { name: `${departmentDisplayName} categories` })).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("category-mega-menu-desktop.png"),
        fullPage: false
      });
      await departmentButton.click();
      await expect(page.getByRole("region", { name: `${departmentDisplayName} categories` })).toHaveCount(0);
      await expect(page.getByRole("heading", {
        level: 2,
        name: `${departmentCount} product${departmentCount === 1 ? "" : "s"}`
      })).toBeVisible();
      await categoriesNavigation.getByRole("button", {
        name: `All products ${catalog.products?.length ?? 0}`
      }).click();
    }

    const searchCategory = catalog.products
      ?.map((product) => product.category?.trim())
      .find((value): value is string => Boolean(value));
    if (searchCategory) {
      const searchCategoryLabel = formatStorefrontTaxonomyLabel(searchCategory);
      const escapedSearchCategory = searchCategoryLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      await searchInput.fill(searchCategory);
      const suggestions = page.locator('[aria-label="Search suggestions"]');
      await expect(suggestions).toBeVisible();
      await suggestions.screenshot({ path: testInfo.outputPath("search-suggestions-desktop.png") });
      await suggestions.getByRole("button", {
        name: new RegExp(`^${escapedSearchCategory}\\s+Category$`)
      }).click();
      await expect(page).toHaveURL(/\/shop\/[^/]+\/search\?q=/, { timeout: 60_000 });
      await expect(page.getByTestId("storefront-search-results")).toBeVisible();
      await expect(page.getByRole("group", { name: "Categories" })).toBeVisible();
      await expect(page.getByRole("group", { name: "Price range" })).toBeVisible();
      await page.getByTestId("storefront-search-results").screenshot({
        path: testInfo.outputPath("search-results-desktop.png")
      });

      const resultCard = page.locator("article").filter({
        has: page.getByRole("heading", { level: 3 })
      }).first();
      const resultVisual = resultCard.getByRole("button", { name: /^View details for / }).locator("div").first();
      await expect(resultVisual).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await page.setViewportSize({ width: 390, height: 844 });
      const filterToggle = page.getByRole("button", { name: "Filters", exact: false });
      await expect(filterToggle).toBeVisible();
      await filterToggle.click();
      await expect(page.getByRole("group", { name: "Categories" })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
      ).toBeLessThanOrEqual(1);
      await page.getByTestId("storefront-search-results").screenshot({
        path: testInfo.outputPath("search-results-mobile.png")
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`/shop/${encodeURIComponent(storeCode ?? "")}`);
    }
    for (const imageUrl of catalog.store?.heroImageUrls ?? []) {
      const imageResponse = await page.request.get(imageUrl);
      expect(imageResponse.ok(), `Storefront banner is unavailable: ${imageUrl}`).toBeTruthy();
    }

    const simpleProduct = catalog.products?.find(
      (product) =>
        product.name &&
        (product.variants?.length ?? 0) <= 1 &&
        product.availableQuantity !== 0
    );
    test.skip(!simpleProduct?.name, "The storefront has no available simple product for direct-add acceptance.");
    const storefrontUrl = page.url();
    await page.getByRole("button", { name: `Add ${simpleProduct?.name} to cart` }).first().click();
    await expect(page).toHaveURL(storefrontUrl);
    await expect(page.getByText(`${simpleProduct?.name} added to cart`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Open cart" }).locator("b")).toHaveText("1");
    await expect(page.getByRole("button", { name: /1 item/ })).toHaveCount(0);

    const heroSection = page.locator('section[aria-label$=" offers"]');
    await expect(heroSection.getByText("Shop from anywhere")).toHaveCount(0);
    const hiddenHeroHeadingBox = await heroSection.locator("h1").boundingBox();
    expect(hiddenHeroHeadingBox?.width ?? 0).toBeLessThanOrEqual(1);
    expect(hiddenHeroHeadingBox?.height ?? 0).toBeLessThanOrEqual(1);
    const hero = heroSection.locator("img").first();
    await expect(hero).toBeVisible();
    expect(await hero.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

    for (const viewport of [
      { name: "mobile", width: 390, height: 844 },
      { name: "tablet", width: 820, height: 1180 },
      { name: "desktop", width: 1440, height: 1000 }
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.getByPlaceholder("Search products, brands and categories")).toBeVisible();
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(horizontalOverflow, `${viewport.name} has horizontal page overflow`).toBeLessThanOrEqual(1);
      if (viewport.name === "desktop") {
        const heroBox = await heroSection.boundingBox();
        const catalogBox = await page.getByTestId("storefront-catalog-section").boundingBox();
        expect(heroBox?.height ?? 0).toBeGreaterThanOrEqual(470);
        expect((await page.getByTestId("storefront-hero-layout").boundingBox())?.width ?? 0)
          .toBeGreaterThanOrEqual(viewport.width - 50);
        expect(Math.abs((catalogBox?.x ?? 0) - (heroBox?.x ?? 0)))
          .toBeLessThanOrEqual(1);
        expect(Math.abs(
          ((catalogBox?.x ?? 0) + (catalogBox?.width ?? 0)) -
          ((heroBox?.x ?? 0) + (heroBox?.width ?? 0))
        )).toBeLessThanOrEqual(1);
        const featuredSection = page.getByTestId("storefront-featured-section");
        if (await featuredSection.count()) {
          const featuredBox = await featuredSection.boundingBox();
          expect(Math.abs((featuredBox?.x ?? 0) - (heroBox?.x ?? 0)))
            .toBeLessThanOrEqual(1);
        }
      }
      await page.screenshot({
        path: testInfo.outputPath(`storefront-${viewport.name}.png`),
        fullPage: false
      });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const productCard = page.locator("article").filter({ has: page.getByRole("heading", { level: 3 }) }).first();
    const productHeading = productCard.getByRole("heading", { level: 3 });
    const productName = (await productHeading.innerText()).trim();
    await productCard.locator("strong").first().click();
    await expect(page).toHaveURL(/\/shop\/[^/]+\/products\/[^/]+$/, { timeout: 60_000 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).toContainText(productName);
    await expect(page.getByRole("link", { name: /on WhatsApp$/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /on WhatsApp$/ }).locator("svg")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Description", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Specifications", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Reviews/ })).toBeVisible();
    const productInformation = page.locator('aside[aria-label="Product information"]');
    await expect(productInformation.getByRole("heading", { name: "Product details" })).toBeVisible();
    await expect(productInformation.getByRole("heading", { name: "Secure checkout" })).toBeVisible();
    await expect(productInformation.getByRole("heading", { name: "Fulfilment" })).toBeVisible();
    const relatedProducts = page.getByRole("region", { name: "Related products" });
    await expect(relatedProducts.getByRole("heading", { name: "You may also like" })).toBeVisible();
    await expect(relatedProducts.locator("article")).not.toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("product-details-mobile.png"), fullPage: false });
    await page.getByTestId("product-detail-hero").screenshot({
      path: testInfo.outputPath("product-details-mobile-full.png")
    });
    await relatedProducts.screenshot({ path: testInfo.outputPath("related-products-mobile.png") });

    const galleryThumbnails = page.getByRole("button", { name: /^View product image / });
    await page.setViewportSize({ width: 1440, height: 1000 });
    if (await galleryThumbnails.count()) {
      const thumbnailBox = await galleryThumbnails.first().boundingBox();
      const mainImageBox = await page.getByRole("button", { name: `Open image viewer for ${productName}` }).boundingBox();
      expect(thumbnailBox?.x ?? Number.POSITIVE_INFINITY).toBeLessThan(mainImageBox?.x ?? 0);
    }
    const zoomTarget = page.getByRole("button", { name: `Open image viewer for ${productName}` });
    await zoomTarget.scrollIntoViewIfNeeded();
    const zoomTargetBox = await zoomTarget.boundingBox();
    const zoomImage = zoomTarget.locator("img");
    if (zoomTargetBox) {
      await page.mouse.move(
        zoomTargetBox.x + zoomTargetBox.width * 0.25,
        zoomTargetBox.y + zoomTargetBox.height * 0.35
      );
      const leftTransformOrigin = await zoomImage.evaluate(
        (element) => getComputedStyle(element).transformOrigin
      );
      expect(await zoomImage.evaluate((element) => getComputedStyle(element).transform)).not.toBe("none");
      await page.mouse.move(
        zoomTargetBox.x + zoomTargetBox.width * 0.75,
        zoomTargetBox.y + zoomTargetBox.height * 0.65
      );
      const rightTransformOrigin = await zoomImage.evaluate(
        (element) => getComputedStyle(element).transformOrigin
      );
      expect(rightTransformOrigin).not.toBe(leftTransformOrigin);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.getByTestId("product-detail-hero").screenshot({ path: testInfo.outputPath("product-details-desktop.png") });
    await relatedProducts.screenshot({ path: testInfo.outputPath("related-products-desktop.png") });
  });

  test("keeps alternate selling UOM price and base conversion through the storefront cart", async ({
    page
  }) => {
    test.setTimeout(900_000);
    const suffix = crypto.randomBytes(5).toString("hex").toUpperCase();
    const normalizedStoreCode = (storeCode ?? "").trim();
    const store = await prisma.store.findFirstOrThrow({
      where: {
        OR: [
          { code: normalizedStoreCode.toUpperCase() },
          { ecommerceSlug: normalizedStoreCode.toLowerCase() }
        ]
      },
      select: {
        id: true,
        code: true,
        retailOrgId: true,
        inventoryCatalogLinks: {
          where: { catalog: { status: "ACTIVE", deletedAt: null } },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { catalogId: true }
        }
      }
    });
    const baseUnitCode = `E${suffix.slice(0, 7)}`;
    const cartonUnitCode = `C${suffix.slice(0, 7)}`;
    const scheduleCode = `E2E-UOM-${suffix}`;
    const productCode = `E2E-UOM-PRODUCT-${suffix}`;
    let baseUnitId: string | null = null;
    let cartonUnitId: string | null = null;
    let scheduleId: string | null = null;
    let productId: string | null = null;
    let ecommerceOrderId: string | null = null;
    let salesOrderId: string | null = null;
    let sourceTransactionId: string | null = null;

    try {
      const baseUnit = await prisma.unitOfMeasure.create({
        data: {
          retailOrgId: store.retailOrgId,
          code: baseUnitCode,
          name: "Each QA",
          status: "ACTIVE",
          originNodeCode: "E2E",
          lastModifiedByNodeCode: "E2E"
        },
        select: { id: true }
      });
      baseUnitId = baseUnit.id;
      const cartonUnit = await prisma.unitOfMeasure.create({
        data: {
          retailOrgId: store.retailOrgId,
          code: cartonUnitCode,
          name: "Carton QA",
          status: "ACTIVE",
          originNodeCode: "E2E",
          lastModifiedByNodeCode: "E2E"
        },
        select: { id: true }
      });
      cartonUnitId = cartonUnit.id;
      const schedule = await prisma.unitOfMeasureSchedule.create({
        data: {
          retailOrgId: store.retailOrgId,
          code: scheduleCode,
          name: "Alternate UOM browser QA",
          baseUnitOfMeasureId: baseUnit.id,
          status: "ACTIVE",
          originNodeCode: "E2E",
          lastModifiedByNodeCode: "E2E",
          lines: {
            create: [{
              unitOfMeasureId: baseUnit.id,
              conversionFactor: 1,
              isBaseUnit: true,
              allowSale: true,
              allowPurchase: true,
              sortOrder: 0
            }, {
              unitOfMeasureId: cartonUnit.id,
              conversionFactor: 24,
              allowSale: true,
              allowPurchase: true,
              sortOrder: 1
            }]
          }
        },
        select: { id: true }
      });
      scheduleId = schedule.id;
      const product = await prisma.product.create({
        data: {
          retailOrgId: store.retailOrgId,
          baseUnitOfMeasureId: baseUnit.id,
          uomScheduleId: schedule.id,
          code: productCode,
          sku: productCode,
          name: "Alternate UOM Browser QA",
          productType: "STOCK",
          unitOfMeasure: baseUnitCode,
          baseUnitPrice: 2,
          taxable: false,
          trackInventory: true,
          ecommercePublished: true,
          ecommerceFeatured: false,
          status: "ACTIVE",
          originNodeCode: "E2E",
          lastModifiedByNodeCode: "E2E"
        },
        select: { id: true }
      });
      productId = product.id;
      const salesLocation = await prisma.inventoryLocation.findFirstOrThrow({
        where: {
          retailOrgId: store.retailOrgId,
          storeId: store.id,
          status: "ACTIVE"
        },
        orderBy: [
          { useForSalesOrderDefault: "desc" },
          { useForSalesDefault: "desc" },
          { createdAt: "asc" }
        ],
        select: { id: true, warehouseId: true }
      });
      await prisma.inventoryLedgerEntry.create({
        data: {
          retailOrgId: store.retailOrgId,
          storeId: store.id,
          warehouseId: salesLocation.warehouseId,
          inventoryLocationId: salesLocation.id,
          productId: product.id,
          movementType: "OPENING_BALANCE",
          quantity: 100,
          unitCost: 1,
          referenceType: "E2E_ALTERNATE_UOM",
          referenceId: product.id,
          externalReference: productCode,
          sourceNodeCode: "E2E",
          occurredAt: new Date()
        }
      });
      const catalogId = store.inventoryCatalogLinks[0]?.catalogId;
      if (catalogId) {
        await prisma.inventoryCatalogProduct.create({
          data: {
            retailOrgId: store.retailOrgId,
            catalogId,
            productId: product.id,
            sortOrder: 999_999
          }
        });
      }

      await completeStaffSignIn(page, securityAdminLogin, securityAdminPassword);
      for (const sellingUnit of [{
        unitOfMeasureCode: baseUnitCode,
        unitPrice: 2,
        isDefault: true
      }, {
        unitOfMeasureCode: cartonUnitCode,
        unitPrice: 48,
        isDefault: false
      }, {
        unitOfMeasureCode: cartonUnitCode,
        unitPrice: 49,
        isDefault: false
      }, {
        unitOfMeasureCode: cartonUnitCode,
        unitPrice: 48,
        isDefault: false
      }]) {
        const saveResponse = await page.request.post("/api/catalog/store-selling-units", {
          data: {
            targetId: productCode,
            ...sellingUnit,
            storeCodes: [store.code]
          }
        });
        expect(saveResponse.ok(), await saveResponse.text()).toBeTruthy();
      }
      const invalidUnitResponse = await page.request.post("/api/catalog/store-selling-units", {
        data: {
          targetId: productCode,
          unitOfMeasureCode: `INVALID-${suffix}`,
          unitPrice: 1,
          storeCodes: [store.code]
        }
      });
      expect(invalidUnitResponse.status()).toBe(400);
      await expect(invalidUnitResponse.json()).resolves.toMatchObject({
        message: expect.stringContaining("not an active sale unit")
      });

      await waitForPublicCatalog(page, "the alternate-UOM product", (catalog) =>
        catalog.products?.some((candidate) => candidate.code === productCode) ?? false
      );

      await page.goto(
        `/shop/${encodeURIComponent(storeCode ?? "")}/products/${encodeURIComponent(productCode)}`
      );
      await expect(page.getByRole("heading", { name: "Alternate UOM Browser QA", level: 1 })).toBeVisible();
      const sellingUnitGroup = page.locator('[aria-label="Selling unit"]');
      await expect(sellingUnitGroup).toBeVisible();
      await expect(sellingUnitGroup.getByRole("button")).toHaveCount(2);
      await sellingUnitGroup.getByRole("button", { name: /Carton QA/ }).click();

      const productPage = page.locator("article").filter({
        has: page.getByRole("heading", { name: "Alternate UOM Browser QA", level: 1 })
      });
      const addButton = productPage.getByRole("button", { name: /Add/ });
      await expect(addButton).toContainText("48.00");
      await addButton.click();
      await page.getByRole("button", { name: "Open cart" }).click();

      const cartLine = page.locator("article").filter({
        has: page.getByRole("button", { name: "Remove item" }),
        hasText: "Alternate UOM Browser QA"
      });
      await expect(cartLine).toHaveCount(1);
      await expect(cartLine).toContainText("Carton QA");
      await expect(cartLine).toContainText(`24 ${baseUnitCode}`);
      await expect(cartLine).toContainText("48.00");

      await page.goto("/inventory/shop-prices");
      await expect(page.getByRole("heading", { name: "Shop Prices", level: 1 })).toBeVisible();
      await page.getByRole("tab", { name: "Selling units" }).click();
      const sellingUnitSearch = page.getByPlaceholder("Search selling units");
      await sellingUnitSearch.fill(productCode);
      const sellingUnitRow = page.locator("tbody tr").filter({ hasText: productCode });
      await expect(sellingUnitRow).toHaveCount(2);
      await expect(sellingUnitRow.filter({ hasText: "Carton QA" })).toContainText(
        `1 ${cartonUnitCode} = 24 ${baseUnitCode}`
      );
      await expect(sellingUnitRow.filter({ hasText: "Carton QA" })).toContainText("48.00");

      await page.reload();
      await page.getByRole("tab", { name: "Selling units" }).click();
      await page.getByPlaceholder("Search selling units").fill(productCode);
      await expect(page.locator("tbody tr").filter({ hasText: productCode })).toHaveCount(2);
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 820, height: 1180 }
      ]) {
        await page.setViewportSize(viewport);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
          )
        ).toBeLessThanOrEqual(1);
      }

      await page.request.post("/api/auth/sign-out");
      const staffSignInResponse = await page.request.post("/api/auth/sign-in", {
        data: { loginId: staffLogin, password: staffPassword }
      });
      expect(staffSignInResponse.ok(), await staffSignInResponse.text()).toBeTruthy();
      await expect(staffSignInResponse.json()).resolves.toMatchObject({ requiresMfa: false });
      if (process.env.FLASH_ERP_E2E_SKIP_ONLINE_UOM_UI !== "true") {
        await page.goto("/online-store");
        await dismissInventoryStartupAlert(page);
        const onlineStoreNavigation = page.getByRole("navigation", {
          name: "Desktop workspaces"
        });
        await onlineStoreNavigation.getByRole("button", { name: "POS", exact: true }).click();
        await page.locator(".rms-scan-strip input").first().fill("Alternate UOM Browser QA");
        const productSuggestion = page
          .locator(".rms-customer-suggestions.is-product button")
          .filter({ hasText: productCode });
        await expect(productSuggestion).toHaveCount(1);
        await productSuggestion.click();

        const itemDialog = page.getByRole("dialog").filter({
          has: page.getByRole("heading", { name: "Alternate UOM Browser QA" })
        });
        await expect(itemDialog).toBeVisible();
        const sellingUnitSelect = itemDialog
          .locator("label")
          .filter({ hasText: "Selling unit" })
          .locator("select");
        await sellingUnitSelect.selectOption(cartonUnitCode);
        await expect(sellingUnitSelect).toHaveValue(cartonUnitCode);
        await expect(
          itemDialog.locator("label").filter({ hasText: "Unit price" }).locator('input[type="number"]')
        ).toHaveValue("48.00");
        await itemDialog.getByRole("button", { name: "Add item", exact: true }).click();

        const basketLine = page
          .locator(".rms-cart-table .rms-table-row")
          .filter({ hasText: "Alternate UOM Browser QA" });
        await expect(basketLine).toHaveCount(1);
        await expect(basketLine).toContainText(cartonUnitCode);
        await expect(basketLine).toContainText(`24 ${baseUnitCode}`);
      }

      const customerPhone = `+23324${String(Date.now()).slice(-7)}`;
      const customerPassword = `UomQa${Date.now()}Secure`;
      const customerOtpResponse = await page.request.post(
        `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/auth/request-otp`,
        {
          headers: {
            "x-forwarded-for": `203.0.${crypto.randomInt(1, 255)}.${crypto.randomInt(1, 255)}`
          },
          data: { identifier: customerPhone, purpose: "SIGN_UP" }
        }
      );
      expect(customerOtpResponse.ok(), await customerOtpResponse.text()).toBeTruthy();
      const customerOtp = (await customerOtpResponse.json()) as {
        challengeId: string;
        developmentCode?: string;
      };
      test.skip(
        !customerOtp.developmentCode,
        "Development OTP exposure is disabled for the alternate-UOM order test."
      );
      const customerSignupResponse = await page.request.post(
        `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/auth/verify-signup`,
        {
          data: {
            challengeId: customerOtp.challengeId,
            code: customerOtp.developmentCode,
            fullName: "Alternate UOM Ecommerce QA",
            password: customerPassword
          }
        }
      );
      expect(customerSignupResponse.ok(), await customerSignupResponse.text()).toBeTruthy();

      const catalogResponse = await page.request.get(
        `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/catalog`
      );
      expect(catalogResponse.ok(), await catalogResponse.text()).toBeTruthy();
      const catalog = (await catalogResponse.json()) as {
        store: {
          allowDelivery: boolean;
          payOnDeliveryEnabled: boolean;
        };
        paymentMethods: Array<{ code: string }>;
      };
      const paymentMethodCode = catalog.store.payOnDeliveryEnabled
        ? "PAY_ON_DELIVERY"
        : catalog.paymentMethods[0]?.code;
      expect(paymentMethodCode).toBeTruthy();
      const orderRequest = {
        lines: [{
          productId: product.id,
          quantity: 1,
          sellingUnitOfMeasure: cartonUnitCode
        }],
        delivery: {
          fulfilmentMethod: catalog.store.allowDelivery ? "DELIVERY" : "PICKUP",
          recipientName: "Alternate UOM Ecommerce QA",
          phone: customerPhone,
          ...(catalog.store.allowDelivery
            ? {
                addressLine1: "24 Alternate UOM Street",
                city: "Accra",
                region: "Greater Accra",
                countryCode: "GH"
              }
            : {})
        },
        paymentMethodCode,
        customerNote: "Alternate-UOM persisted-order acceptance"
      };

      const insufficientQuoteResponse = await page.request.post(
        `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/quote`,
        {
          data: {
            lines: [{
              productId: product.id,
              quantity: 5,
              sellingUnitOfMeasure: cartonUnitCode
            }]
          }
        }
      );
      expect(insufficientQuoteResponse.status()).toBe(409);
      await expect(insufficientQuoteResponse.json()).resolves.toMatchObject({
        message: expect.stringContaining("available")
      });

      const insufficientOrderResponse = await page.request.post(
        `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/orders`,
        {
          headers: { "idempotency-key": `e2e-uom-insufficient-${crypto.randomUUID()}` },
          data: {
            ...orderRequest,
            lines: [{
              productId: product.id,
              quantity: 5,
              sellingUnitOfMeasure: cartonUnitCode
            }]
          }
        }
      );
      expect(insufficientOrderResponse.status()).toBe(409);
      await expect(insufficientOrderResponse.json()).resolves.toMatchObject({
        message: expect.stringContaining("available")
      });

      const checkoutRequestKey = `e2e-uom-checkout-${crypto.randomUUID()}`;
      const createOrderResponse = await page.request.post(
        `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/orders`,
        {
          headers: { "idempotency-key": checkoutRequestKey },
          data: orderRequest
        }
      );
      expect(createOrderResponse.ok(), await createOrderResponse.text()).toBeTruthy();
      const createdOrder = (await createOrderResponse.json()) as {
        orderId: string;
        orderNo: string;
        totalAmount: number;
      };
      ecommerceOrderId = createdOrder.orderId;

      const replayResponse = await page.request.post(
        `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/orders`,
        {
          headers: { "idempotency-key": checkoutRequestKey },
          data: orderRequest
        }
      );
      expect(replayResponse.ok(), await replayResponse.text()).toBeTruthy();
      await expect(replayResponse.json()).resolves.toMatchObject({
        orderId: createdOrder.orderId,
        idempotentReplay: true
      });
      const changedUomReplayResponse = await page.request.post(
        `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/orders`,
        {
          headers: { "idempotency-key": checkoutRequestKey },
          data: {
            ...orderRequest,
            lines: [{
              productId: product.id,
              quantity: 1,
              sellingUnitOfMeasure: baseUnitCode
            }]
          }
        }
      );
      expect(changedUomReplayResponse.status()).toBe(409);

      const persistedOrder = await prisma.ecommerceOrder.findUniqueOrThrow({
        where: { id: createdOrder.orderId },
        select: {
          id: true,
          status: true,
          salesOrderId: true,
          salesOrder: {
            select: {
              sourceTransactionId: true,
              status: true,
              lines: {
                select: {
                  quantity: true,
                  sellingUnitOfMeasure: true,
                  baseUnitOfMeasure: true,
                  uomConversionFactor: true,
                  baseQuantity: true,
                  unitPrice: true
                }
              }
            }
          }
        }
      });
      salesOrderId = persistedOrder.salesOrderId;
      sourceTransactionId = persistedOrder.salesOrder.sourceTransactionId;
      expect(persistedOrder.status).toBe("PLACED");
      expect(persistedOrder.salesOrder.status).toBe("OPEN");
      expect(persistedOrder.salesOrder.lines).toHaveLength(1);
      expect({
        quantity: Number(persistedOrder.salesOrder.lines[0]?.quantity),
        sellingUnitOfMeasure: persistedOrder.salesOrder.lines[0]?.sellingUnitOfMeasure,
        baseUnitOfMeasure: persistedOrder.salesOrder.lines[0]?.baseUnitOfMeasure,
        uomConversionFactor: Number(persistedOrder.salesOrder.lines[0]?.uomConversionFactor),
        baseQuantity: Number(persistedOrder.salesOrder.lines[0]?.baseQuantity),
        unitPrice: Number(persistedOrder.salesOrder.lines[0]?.unitPrice)
      }).toEqual({
        quantity: 1,
        sellingUnitOfMeasure: cartonUnitCode,
        baseUnitOfMeasure: baseUnitCode,
        uomConversionFactor: 24,
        baseQuantity: 24,
        unitPrice: 48
      });
      const parkedLine = await prisma.posTransactionLine.findFirstOrThrow({
        where: { posTransactionId: persistedOrder.salesOrder.sourceTransactionId },
        select: {
          quantity: true,
          sellingUnitOfMeasure: true,
          baseUnitOfMeasure: true,
          uomConversionFactor: true,
          baseQuantity: true
        }
      });
      expect({
        quantity: Number(parkedLine.quantity),
        sellingUnitOfMeasure: parkedLine.sellingUnitOfMeasure,
        baseUnitOfMeasure: parkedLine.baseUnitOfMeasure,
        uomConversionFactor: Number(parkedLine.uomConversionFactor),
        baseQuantity: Number(parkedLine.baseQuantity)
      }).toEqual({
        quantity: 1,
        sellingUnitOfMeasure: cartonUnitCode,
        baseUnitOfMeasure: baseUnitCode,
        uomConversionFactor: 24,
        baseQuantity: 24
      });

      for (const status of ["CONFIRMED", "PROCESSING", "READY"]) {
        const statusResponse = await page.request.patch(
          `/api/online-store/ecommerce/orders/${encodeURIComponent(createdOrder.orderId)}`,
          { data: { status } }
        );
        expect(statusResponse.ok(), await statusResponse.text()).toBeTruthy();
      }

      const fulfilResponse = await page.request.post("/api/online-store/sales", {
        data: {
          salesOrderId: persistedOrder.salesOrderId,
          lines: [],
          payments: createdOrder.totalAmount > 0
            ? [{
                paymentMethod: "CASH",
                amount: createdOrder.totalAmount,
                reference: "E2E-UOM-ECOMMERCE-BALANCE"
              }]
            : []
        }
      });
      expect(fulfilResponse.ok(), await fulfilResponse.text()).toBeTruthy();
      const fulfilment = (await fulfilResponse.json()) as {
        totalAmount: number;
        receipt: {
          lines: Array<{
            productCode: string;
            quantity: number;
            sellingUnitOfMeasure: string;
            baseUnitOfMeasure: string;
            uomConversionFactor: number;
            baseQuantity: number;
          }>;
        };
      };
      const fulfilledReceiptLine = fulfilment.receipt.lines.find(
        (line) => line.productCode === productCode
      );
      expect(fulfilledReceiptLine).toMatchObject({
        quantity: 1,
        sellingUnitOfMeasure: cartonUnitCode,
        baseUnitOfMeasure: baseUnitCode,
        uomConversionFactor: 24,
        baseQuantity: 24
      });

      const fulfilledState = await prisma.ecommerceOrder.findUniqueOrThrow({
        where: { id: createdOrder.orderId },
        select: {
          status: true,
          statusEvents: { orderBy: { createdAt: "asc" }, select: { status: true } },
          salesOrder: {
            select: {
              sourceTransactionId: true,
              status: true,
              balanceAmount: true
            }
          }
        }
      });
      expect(fulfilledState.status).toBe("READY");
      expect(fulfilledState.statusEvents.map((event) => event.status)).toEqual([
        "PLACED",
        "CONFIRMED",
        "PROCESSING",
        "READY"
      ]);
      expect(fulfilledState.salesOrder.status).toBe("FULFILLED");
      expect(Number(fulfilledState.salesOrder.balanceAmount)).toBe(0);
      const fulfilledTransaction = await prisma.posTransaction.findUniqueOrThrow({
        where: { id: fulfilledState.salesOrder.sourceTransactionId },
        select: {
          status: true,
          lines: {
            select: {
              quantity: true,
              sellingUnitOfMeasure: true,
              baseUnitOfMeasure: true,
              uomConversionFactor: true,
              baseQuantity: true
            }
          }
        }
      });
      expect(fulfilledTransaction.status).toBe("COMPLETED");
      const fulfilledLine = fulfilledTransaction.lines[0];
      expect({
        quantity: Number(fulfilledLine?.quantity),
        sellingUnitOfMeasure: fulfilledLine?.sellingUnitOfMeasure,
        baseUnitOfMeasure: fulfilledLine?.baseUnitOfMeasure,
        uomConversionFactor: Number(fulfilledLine?.uomConversionFactor),
        baseQuantity: Number(fulfilledLine?.baseQuantity)
      }).toEqual({
        quantity: 1,
        sellingUnitOfMeasure: cartonUnitCode,
        baseUnitOfMeasure: baseUnitCode,
        uomConversionFactor: 24,
        baseQuantity: 24
      });
      const stockAfterFulfilment = await prisma.inventoryLedgerEntry.aggregate({
        where: {
          productId: product.id,
          inventoryLocationId: salesLocation.id
        },
        _sum: { quantity: true }
      });
      expect(Number(stockAfterFulfilment._sum.quantity)).toBe(76);
    } finally {
      if (ecommerceOrderId) {
        await prisma.ecommerceOrder.deleteMany({ where: { id: ecommerceOrderId } });
      }
      if (salesOrderId) {
        await prisma.salesOrder.deleteMany({ where: { id: salesOrderId } });
      }
      if (sourceTransactionId) {
        await prisma.customerAccountEntry.deleteMany({ where: { posTransactionId: sourceTransactionId } });
        await prisma.posTransaction.deleteMany({ where: { id: sourceTransactionId } });
      }
      if (productId) {
        await prisma.inventoryLedgerEntry.deleteMany({ where: { productId } });
        await prisma.storeProductSellingUnit.deleteMany({ where: { productId } });
        await prisma.product.delete({ where: { id: productId } });
      }
      if (scheduleId) {
        await prisma.unitOfMeasureSchedule.delete({ where: { id: scheduleId } });
      }
      if (cartonUnitId) {
        await prisma.unitOfMeasure.delete({ where: { id: cartonUnitId } });
      }
      if (baseUnitId) {
        await prisma.unitOfMeasure.delete({ where: { id: baseUnitId } });
      }
    }
  });

  test("advertises an eligible promotion before checkout", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const normalizedStoreCode = (storeCode ?? "").trim();
    const store = await prisma.store.findFirstOrThrow({
      where: {
        OR: [
          { code: normalizedStoreCode.toUpperCase() },
          { ecommerceSlug: normalizedStoreCode.toLowerCase() }
        ]
      },
      select: { id: true, code: true, retailOrgId: true }
    });
    const product = await prisma.product.findFirstOrThrow({
      where: {
        retailOrgId: store.retailOrgId,
        ecommercePublished: true,
        status: "ACTIVE",
        deletedAt: null,
        mustEnterPriceAtPos: false,
        primaryImageUrl: { not: null },
        ecommerceReviews: { some: { status: "PUBLISHED" } }
      },
      orderBy: { name: "asc" },
      select: {
        code: true,
        name: true,
        baseUnitPrice: true,
        storeProductPrices: {
          where: { storeId: store.id, status: "ACTIVE", productVariantId: null },
          take: 1,
          select: { unitPrice: true }
        }
      }
    });
    const unitPrice = Number(product.storeProductPrices[0]?.unitPrice ?? product.baseUnitPrice);
    const promotionCode = `E2E-STOREFRONT-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    const bonusPromotionCode = `E2E-STOREFRONT-BONUS-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    const storewidePromotionCode = `E2E-STOREFRONT-ALL-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    const activeDaysOfWeek = JSON.stringify([
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY"
    ]);

    await prisma.promotionCampaign.createMany({
      data: [{
        retailOrgId: store.retailOrgId,
        code: promotionCode,
        name: "Storefront promotion QA",
        description: "Visible before the customer places an order.",
        discountType: "PERCENT",
        targetScope: "PRODUCT",
        discountValue: 20,
        targetProductCode: product.code,
        eligibleStoreCodes: JSON.stringify([store.code]),
        activeDaysOfWeek,
        activeFromMinutes: 0,
        activeToMinutes: 1439,
        priority: -2_000_000_000,
        status: "ACTIVE",
        originNodeCode: "E2E",
        lastModifiedByNodeCode: "E2E"
      }, {
        retailOrgId: store.retailOrgId,
        code: bonusPromotionCode,
        name: "Buy 2 get 1 storefront QA",
        description: "Qualification wording must be visible.",
        discountType: "PERCENT",
        targetScope: "PRODUCT",
        discountValue: 100,
        minimumLineQuantity: 3,
        buyQuantity: 2,
        rewardQuantity: 1,
        targetProductCode: product.code,
        eligibleStoreCodes: JSON.stringify([store.code]),
        activeDaysOfWeek,
        activeFromMinutes: 0,
        activeToMinutes: 1439,
        priority: -2_000_000_001,
        status: "ACTIVE",
        originNodeCode: "E2E",
        lastModifiedByNodeCode: "E2E"
      }, {
        retailOrgId: store.retailOrgId,
        code: storewidePromotionCode,
        name: "Storewide promotion QA",
        description: "This offer applies across the whole storefront.",
        discountType: "PERCENT",
        targetScope: "ALL_ITEMS",
        discountValue: 5,
        eligibleStoreCodes: JSON.stringify([store.code]),
        activeDaysOfWeek,
        activeFromMinutes: 0,
        activeToMinutes: 1439,
        priority: -1_999_999_998,
        status: "ACTIVE",
        originNodeCode: "E2E",
        lastModifiedByNodeCode: "E2E"
      }]
    });

    try {
      await waitForPublicCatalog(page, "the storefront promotion fixtures", (catalog) => {
        const promotionCodes = new Set(catalog.promotions?.map((promotion) => promotion.code) ?? []);
        const promotedProduct = catalog.products?.find((candidate) => candidate.code === product.code);
        return promotionCodes.has(storewidePromotionCode) &&
          promotedProduct?.promotion?.code === bonusPromotionCode;
      });

      const catalogResponse = await page.request.get(
        `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/catalog`
      );
      expect(catalogResponse.ok(), await catalogResponse.text()).toBeTruthy();
      const catalog = (await catalogResponse.json()) as {
        promotions: Array<{ code: string; targetScope: string }>;
        products: Array<{
          id: string;
          code: string;
          promotion: null | {
            code: string;
            promotionalUnitPrice: number | null;
            targetScope: string;
            targetProductCode: string | null;
          };
        }>;
      };
      const promotedProduct = catalog.products.find((candidate) => candidate.code === product.code);
      expect(catalog.promotions).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: storewidePromotionCode, targetScope: "ALL_ITEMS" })
      ]));
      expect(promotedProduct?.promotion).toMatchObject({
        code: bonusPromotionCode,
        promotionalUnitPrice: null,
        targetScope: "PRODUCT",
        targetProductCode: product.code
      });

      const quoteResponse = await page.request.post(
        `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/quote`,
        { data: { lines: [{ productId: promotedProduct?.id, variantCode: null, quantity: 3 }] } }
      );
      expect(quoteResponse.ok(), await quoteResponse.text()).toBeTruthy();
      const quote = (await quoteResponse.json()) as {
        subtotalAmount: number;
        discountAmount: number;
        totalAmount: number;
        lines: Array<{ appliedPromotionCode: string | null }>;
      };
      expect(quote).toMatchObject({
        subtotalAmount: Number((unitPrice * 3).toFixed(2)),
        discountAmount: Number(unitPrice.toFixed(2)),
        totalAmount: Number((unitPrice * 2).toFixed(2))
      });
      expect(quote.lines[0]?.appliedPromotionCode).toBe(bonusPromotionCode);

      await page.goto(`/shop/${encodeURIComponent(storeCode ?? "")}`);
      const storewidePromotions = page.getByRole("region", { name: "Storewide promotions" });
      await expect(storewidePromotions).toBeVisible();
      await expect(storewidePromotions.getByText("This offer applies across the whole storefront.", { exact: true })).toBeVisible();
      await expect(storewidePromotions.getByText("Storewide: all products", { exact: false })).toBeVisible();
      await expect(storewidePromotions.getByText("Visible before the customer places an order.", { exact: true })).toHaveCount(0);
      await expect(storewidePromotions.getByText("Qualification wording must be visible.", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Buy 2, get 1 free", { exact: true })).not.toHaveCount(0);
      await expect(
        page.getByText("Buy 2 get 1 storefront QA · This product only", { exact: true }).first()
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("promotion-storefront-desktop.png"),
        fullPage: false
      });
      await page.getByRole("button", { name: `Preview image for ${product.name}` }).first().click();
      const catalogImageViewer = page.getByRole("dialog", {
        name: `${product.name} image viewer`
      });
      await expect(catalogImageViewer).toBeVisible();
      await catalogImageViewer.getByRole("button", { name: "Zoom image" }).first().click();
      await expect(catalogImageViewer.getByRole("button", { name: "Fit image to screen" }).first()).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("storefront-image-viewer-zoomed.png"),
        fullPage: false
      });
      await catalogImageViewer.getByRole("button", { name: "Close image viewer" }).click();
      await expect(catalogImageViewer).toBeHidden();
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: testInfo.outputPath("promotion-storefront-mobile.png"),
        fullPage: false
      });
      await storewidePromotions.getByRole("button", { name: "Close storewide promotions" }).click();
      await expect(storewidePromotions).toBeHidden();
      await page.goto(
        `/shop/${encodeURIComponent(storeCode ?? "")}/products/${encodeURIComponent(product.code)}`
      );
      await expect(page.getByText("Qualification wording must be visible.", { exact: true })).toBeVisible();
      await expect(
        page.getByText(
          "This product only | Add 3 to cart and pay for 2 | Every day, 12:00 AM-11:59 PM (Africa/Accra)",
          { exact: true }
        )
      ).toBeVisible();
      const expectedPromotionalTotal = new Intl.NumberFormat("en-GH", {
        style: "currency",
        currency: "GHS",
        maximumFractionDigits: 2
      }).format(unitPrice * 2);
      await page.getByRole("button", { name: "Increase quantity" }).click();
      await page.getByRole("button", { name: "Increase quantity" }).click();
      const addPromotedQuantity = page.getByRole("button", {
        name: `Add · ${expectedPromotionalTotal}`
      });
      await expect(addPromotedQuantity).toBeVisible();
      await addPromotedQuantity.click();
      await page.getByRole("button", { name: "Open cart" }).click();
      await expect(page.getByText("Promotion savings", { exact: true })).toBeVisible();
      await expect(page.getByText(`-${new Intl.NumberFormat("en-GH", {
        style: "currency",
        currency: "GHS",
        maximumFractionDigits: 2
      }).format(unitPrice)}`, { exact: true })).toBeVisible();
      await expect(page.getByText(expectedPromotionalTotal, { exact: true }).last()).toBeVisible();
      await page.locator('aside[aria-hidden="false"] button[title="Close"]').click();
      await page.getByRole("button", { name: `Open image viewer for ${product.name}` }).click();
      const productImageViewer = page.getByRole("dialog", {
        name: `${product.name} image viewer`
      });
      await expect(productImageViewer).toBeVisible();
      await expect(productImageViewer.getByRole("button", { name: "Zoom image" }).first()).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("product-image-viewer-mobile.png"),
        fullPage: false
      });
      await productImageViewer.getByRole("button", { name: "Close image viewer" }).click();
      await expect(productImageViewer).toBeHidden();
      await page.getByRole("tab", { name: /Reviews/ }).click();
      await expect(
        page.getByText(
          /^(?:Just now|\d+ (?:minute|hour|day|week|month|year)s? ago)$/
        ).first()
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("promotion-product-mobile.png"),
        fullPage: false
      });
      expect(pageErrors).toEqual([]);
    } finally {
      await prisma.promotionCampaign.deleteMany({
        where: {
          retailOrgId: store.retailOrgId,
          code: { in: [promotionCode, bonusPromotionCode, storewidePromotionCode] }
        }
      });
      await waitForPublicCatalog(page, "the promotion fixture cleanup", (catalog) => {
        const promotionCodes = new Set(catalog.promotions?.map((promotion) => promotion.code) ?? []);
        const visibleProductPromotion = catalog.products?.find(
          (candidate) => candidate.code === product.code
        )?.promotion?.code;
        return !promotionCodes.has(storewidePromotionCode) &&
          ![promotionCode, bonusPromotionCode].includes(visibleProductPromotion ?? "");
      });
    }
  });

  test("quotes bonus-buy totals and navigates the product gallery", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const normalizedStoreCode = (storeCode ?? "").trim();
    const store = await prisma.store.findFirstOrThrow({
      where: {
        OR: [
          { code: normalizedStoreCode.toUpperCase() },
          { ecommerceSlug: normalizedStoreCode.toLowerCase() }
        ]
      },
      select: { code: true, retailOrgId: true }
    });
    const promotionCode = `E2E-STOREFRONT-BONUS-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    const activeDaysOfWeek = JSON.stringify([
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY"
    ]);

    await prisma.promotionCampaign.create({
      data: {
        retailOrgId: store.retailOrgId,
        code: promotionCode,
        name: "Flash Cola bonus-buy storefront QA",
        description: "Gallery and bonus-buy checkout verification.",
        discountType: "PERCENT",
        targetScope: "PRODUCT",
        discountValue: 100,
        minimumLineQuantity: 3,
        buyQuantity: 2,
        rewardQuantity: 1,
        targetProductCode: "FLASH-COLA-50CL",
        eligibleStoreCodes: JSON.stringify([store.code]),
        activeDaysOfWeek,
        activeFromMinutes: 0,
        activeToMinutes: 1439,
        priority: -2_000_000_010,
        status: "ACTIVE",
        originNodeCode: "E2E",
        lastModifiedByNodeCode: "E2E"
      }
    });

    try {
      await waitForPublicCatalog(page, "the bonus-buy gallery fixture", (catalog) =>
        catalog.products?.some(
          (candidate) =>
            candidate.code === "FLASH-COLA-50CL" && candidate.promotion?.code === promotionCode
        ) ?? false
      );

      const catalogResponse = await page.request.get(
        `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/catalog`
      );
      expect(catalogResponse.ok(), await catalogResponse.text()).toBeTruthy();
      const catalog = (await catalogResponse.json()) as {
        store: { currencyCode: string };
        products: Array<{
          id: string;
          code: string;
          name: string;
          unitPrice: number;
          promotion: null | { code: string };
        }>;
      };
      const product = catalog.products.find((candidate) => candidate.code === "FLASH-COLA-50CL");
      expect(product).toBeTruthy();
      expect(product?.promotion?.code).toBe(promotionCode);
      expect(product).not.toHaveProperty("description");
      expect(product).not.toHaveProperty("galleryImageUrls");
      expect(product).not.toHaveProperty("reviews");

      const productDetailResponse = await page.request.get(
        `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/products/${encodeURIComponent(product?.code ?? "")}`,
      );
      expect(productDetailResponse.ok(), await productDetailResponse.text()).toBeTruthy();
      const productDetail = (await productDetailResponse.json()) as {
        id: string;
        code: string;
        galleryImageUrls: string[];
        specifications: Array<{ name: string; value: string }>;
        reviews: Array<{ id: string }>;
      };
      expect(productDetail).toMatchObject({ id: product?.id, code: product?.code });
      expect(Array.isArray(productDetail.galleryImageUrls)).toBe(true);
      expect(Array.isArray(productDetail.specifications)).toBe(true);
      expect(Array.isArray(productDetail.reviews)).toBe(true);

      const quoteResponse = await page.request.post(
        `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/quote`,
        { data: { lines: [{ productId: product?.id, variantCode: null, quantity: 3 }] } }
      );
      expect(quoteResponse.ok(), await quoteResponse.text()).toBeTruthy();
      const quote = (await quoteResponse.json()) as {
        subtotalAmount: number;
        discountAmount: number;
        totalAmount: number;
        lines: Array<{ appliedPromotionCode: string | null }>;
      };
      const expectedDiscount = Number(product!.unitPrice.toFixed(2));
      const expectedSubtotal = Number((product!.unitPrice * 3).toFixed(2));
      const expectedTotal = Number((product!.unitPrice * 2).toFixed(2));
      expect(quote).toMatchObject({
        subtotalAmount: expectedSubtotal,
        discountAmount: expectedDiscount,
        totalAmount: expectedTotal
      });
      expect(quote.lines[0]?.appliedPromotionCode).toBe(promotionCode);

      await page.goto(
        `/shop/${encodeURIComponent(storeCode ?? "")}/products/FLASH-COLA-50CL`
      );
      await expect(page.getByRole("heading", { level: 1, name: product?.name })).toBeVisible();

      if (productDetail.galleryImageUrls.length > 1) {
      const mainImage = page.getByRole("button", {
        name: `Open image viewer for ${product?.name}`
      }).locator("img");
      const firstImageUrl = await mainImage.getAttribute("src");
      await page.getByRole("button", { name: "Next product gallery image" }).click();
      await expect(mainImage).not.toHaveAttribute("src", firstImageUrl ?? "");
      await page.getByRole("button", { name: `Open image viewer for ${product?.name}` }).click();
      const viewer = page.getByRole("dialog", { name: `${product?.name} image viewer` });
      await expect(viewer.getByRole("button", { name: "Previous product image" })).toBeVisible();
      await expect(viewer.getByRole("button", { name: "Next product image" })).toBeVisible();
      const viewerImage = viewer.locator("img");
      const viewerImageUrl = await viewerImage.getAttribute("src");
      await viewer.getByRole("button", { name: "Next product image" }).click();
      await expect(viewerImage).not.toHaveAttribute("src", viewerImageUrl ?? "");
      await viewer.getByRole("button", { name: "Close image viewer" }).click();
      }

      await page.getByRole("button", { name: "Increase quantity" }).click();
      await page.getByRole("button", { name: "Increase quantity" }).click();
      const formattedTotal = new Intl.NumberFormat("en-GH", {
        style: "currency",
        currency: catalog.store.currencyCode,
        maximumFractionDigits: 2
      }).format(expectedTotal);
      const addButton = page.getByRole("button", { name: `Add · ${formattedTotal}` });
      await expect(addButton).toBeVisible();
      await addButton.click();
      await page.getByRole("button", { name: "Open cart" }).click();
      await expect(page.getByText("Promotion savings", { exact: true })).toBeVisible();
      await expect(page.getByText(formattedTotal, { exact: true }).last()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("bonus-buy-cart-and-gallery.png"), fullPage: false });
      expect(pageErrors).toEqual([]);
    } finally {
      await prisma.promotionCampaign.deleteMany({
        where: { retailOrgId: store.retailOrgId, code: promotionCode }
      });
      await waitForPublicCatalog(page, "the bonus-buy gallery fixture cleanup", (catalog) =>
        !catalog.products?.some(
          (candidate) =>
            candidate.code === "FLASH-COLA-50CL" && candidate.promotion?.code === promotionCode
        )
      );
    }
  });

  test("creates a verified customer and bridges checkout into a trackable sales order", async ({
    page
  }) => {
    const identifier = `+23320${String(Date.now()).slice(-7)}`;
    const password = `Qa${Date.now()}Secure`;
    const otpResponse = await page.request.post(
      `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/auth/request-otp`,
      {
        headers: { "x-forwarded-for": otpTestIp },
        data: { identifier, purpose: "SIGN_UP" }
      }
    );
    expect(otpResponse.ok()).toBeTruthy();
    const otp = (await otpResponse.json()) as {
      challengeId: string;
      developmentCode?: string;
    };
    expect(otp.challengeId).toBeTruthy();
    test.skip(!otp.developmentCode, "Development OTP exposure is disabled for this test server.");

    const signupResponse = await page.request.post(
      `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/auth/verify-signup`,
      {
        data: {
          challengeId: otp.challengeId,
          code: otp.developmentCode,
          fullName: "Ecommerce Browser QA",
          password
        }
      }
    );
    expect(signupResponse.ok()).toBeTruthy();

    const catalogResponse = await page.request.get(
      `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/catalog`
    );
    expect(catalogResponse.ok()).toBeTruthy();
    const catalog = (await catalogResponse.json()) as {
      store: { allowDelivery: boolean; payOnDeliveryEnabled: boolean };
      paymentMethods: Array<{ code: string }>;
      products: Array<{ id: string; name: string; availableQuantity: number | null }>;
    };
    expect(catalog.products.length).toBeGreaterThan(0);
    const orderProduct =
      catalog.products.find(
        (product) => product.availableQuantity === null || product.availableQuantity > 0
      ) ?? catalog.products[0]!;
    const paymentMethodCode = catalog.store.payOnDeliveryEnabled
      ? "PAY_ON_DELIVERY"
      : catalog.paymentMethods[0]?.code;
    expect(paymentMethodCode).toBeTruthy();

    const orderResponse = await page.request.post(
      `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/orders`,
      {
        headers: { "idempotency-key": `e2e-checkout-${crypto.randomUUID()}` },
        data: {
          lines: [{ productId: orderProduct.id, quantity: 1 }],
          delivery: {
            fulfilmentMethod: catalog.store.allowDelivery ? "DELIVERY" : "PICKUP",
            recipientName: "Ecommerce Browser QA",
            phone: identifier,
            ...(catalog.store.allowDelivery
              ? {
                  addressLine1: "C454 Kokomlemle",
                  city: "Accra",
                  region: "Greater Accra",
                  countryCode: "GH"
                }
              : {})
          },
          paymentMethodCode,
          customerNote: "Automated ecommerce bridge verification"
        }
      }
    );
    expect(orderResponse.ok(), await orderResponse.text()).toBeTruthy();
    const createdOrder = (await orderResponse.json()) as {
      orderNo: string;
      status: string;
      fulfillment: {
        storeCode: string;
        storeName: string;
        inventoryLocationCode: string;
        inventoryLocationName: string;
      };
    };
    expect(createdOrder.orderNo).toMatch(/^SO-/);
    expect(createdOrder.fulfillment.storeCode).toBeTruthy();
    expect(createdOrder.fulfillment.inventoryLocationCode).toBeTruthy();
    createdOrderNo = createdOrder.orderNo;
    const ecommerceOrder = await prisma.ecommerceOrder.findFirstOrThrow({
      where: { orderNo: createdOrder.orderNo },
      select: {
        id: true,
        salesOrderId: true,
        status: true,
        deliveryFeeAmount: true,
        salesOrder: {
          select: {
            storeId: true,
            lines: { select: { productCodeSnapshot: true } }
          }
        },
        fulfillments: {
          select: {
            storeId: true,
            storeCodeSnapshot: true,
            inventoryLocationCodeSnapshot: true,
            status: true,
          },
        },
      }
    });
    createdEcommerceOrderId = ecommerceOrder.id;
    createdSalesOrderId = ecommerceOrder.salesOrderId;
    expect(ecommerceOrder.status).toBe("PLACED");
    expect(Number(ecommerceOrder.deliveryFeeAmount)).toBe(0);
    expect(ecommerceOrder.fulfillments).toHaveLength(1);
    expect(ecommerceOrder.fulfillments[0]).toMatchObject({
      storeId: ecommerceOrder.salesOrder.storeId,
      storeCodeSnapshot: createdOrder.fulfillment.storeCode,
      inventoryLocationCodeSnapshot: createdOrder.fulfillment.inventoryLocationCode,
      status: "PLACED",
    });
    expect(ecommerceOrder.salesOrder.lines).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ productCodeSnapshot: "ECOM-DELIVERY" })])
    );
    const prematurelyVisibleOrder = await prisma.salesOrder.findFirst({
      where: {
        id: ecommerceOrder.salesOrderId,
        OR: [
          { ecommerceOrder: { is: null } },
          { ecommerceOrder: { is: { status: { not: "PLACED" } } } }
        ]
      },
      select: { id: true }
    });
    expect(prematurelyVisibleOrder).toBeNull();

    const ordersResponse = await page.request.get(
      `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/orders`
    );
    expect(ordersResponse.ok()).toBeTruthy();
    const orders = (await ordersResponse.json()) as {
      orders: Array<{
        orderNo: string;
        lines: Array<{ productName: string }>;
        fulfillment: { storeCode: string; inventoryLocationCode: string } | null;
      }>;
    };
    const savedOrder = orders.orders.find((order) => order.orderNo === createdOrder.orderNo);
    expect(savedOrder?.lines).toHaveLength(1);
    expect(savedOrder?.lines[0]?.productName).toBe(orderProduct.name);
    expect(savedOrder?.fulfillment).toMatchObject({
      storeCode: createdOrder.fulfillment.storeCode,
      inventoryLocationCode: createdOrder.fulfillment.inventoryLocationCode,
    });

    const sessionRefresh = page.waitForResponse(
      (response) =>
        response.url().toLowerCase().includes(
          `/api/ecommerce/${encodeURIComponent(storeCode ?? "").toLowerCase()}/auth/session`
        ) &&
        response.request().method() === "GET"
    );
    await page.goto(`/shop/${encodeURIComponent(storeCode ?? "")}`);
    await sessionRefresh;
    await page.getByTitle("My orders").click();
    await page.locator("aside").getByRole("button").filter({ hasText: createdOrder.orderNo }).click();
    const refreshOrderDetails = page.getByRole("button", { name: "Refresh order details" });
    await expect(refreshOrderDetails).toBeVisible();
    await refreshOrderDetails.click();
    await expect(page.getByText("Order placed", { exact: true })).toBeVisible();

    const resetOtpResponse = await page.request.post(
      `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/auth/request-otp`,
      {
        headers: { "x-forwarded-for": otpTestIp },
        data: { identifier, purpose: "PASSWORD_RESET" }
      }
    );
    expect(resetOtpResponse.ok()).toBeTruthy();
    const resetOtp = (await resetOtpResponse.json()) as {
      challengeId: string;
      developmentCode?: string;
    };
    test.skip(!resetOtp.developmentCode, "Development password-reset OTP is disabled.");
    const resetResponse = await page.request.post(
      `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/auth/reset-password`,
      {
        data: {
          challengeId: resetOtp.challengeId,
          code: resetOtp.developmentCode,
          password: `${password}Reset9`
        }
      }
    );
    expect(resetResponse.ok()).toBeTruthy();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failedSignIn = await page.request.post(
        `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/auth/sign-in`,
        { data: { identifier, password: "IncorrectPassword9" } }
      );
      expect(failedSignIn.status()).toBe(401);
    }
    const lockedSignIn = await page.request.post(
      `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/auth/sign-in`,
      { data: { identifier, password: `${password}Reset9` } }
    );
    expect(lockedSignIn.status()).toBe(429);

    const testIdentity = await prisma.ecommerceCustomerIdentity.findFirstOrThrow({
      where: { identifierNormalized: identifier },
      select: { customerAccountId: true }
    });
    await prisma.ecommerceCustomerAccount.update({
      where: { id: testIdentity.customerAccountId },
      data: { failedLoginAttempts: 0, lockedUntil: null }
    });
    const recoveredSignIn = await page.request.post(
      `/api/ecommerce/${encodeURIComponent(storeCode ?? "")}/auth/sign-in`,
      { data: { identifier, password: `${password}Reset9` } }
    );
    expect(recoveredSignIn.ok()).toBeTruthy();
  });

  test("opens the staff ecommerce order, catalog, and storefront workspaces", async ({
    page
  }, testInfo) => {
    test.setTimeout(300_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await completeStaffSignIn(page);
    await page.goto("/online-store");
    await dismissInventoryStartupAlert(page);
    const onlineStoreNavigation = page.getByRole("navigation", {
      name: "Desktop workspaces"
    });
    await expect(onlineStoreNavigation.getByRole("button", { name: "Ecommerce" })).toBeVisible();
    await onlineStoreNavigation.getByRole("button", { name: "Ecommerce" }).click();
    await expect(page).toHaveURL(/\/online-store\?workspace=ecommerce$/);
    await expect(page.getByRole("heading", { name: "Ecommerce", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Incoming orders", exact: true })).toBeVisible();
    await expect(onlineStoreNavigation.getByRole("button", { name: "POS", exact: true })).toBeVisible();

    await page.goto("/online-store/ecommerce");
    await expect(page).toHaveURL(/\/online-store\?workspace=ecommerce$/);
    await dismissInventoryStartupAlert(page);
    await expect(page.getByRole("navigation", { name: "Desktop workspaces" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Incoming orders", exact: true })).toBeVisible();
    if (createdEcommerceOrderId) {
      const acceptResponse = await page.request.patch(
        `/api/online-store/ecommerce/orders/${encodeURIComponent(createdEcommerceOrderId)}`,
        { data: { status: "CONFIRMED" } }
      );
      expect(acceptResponse.ok(), await acceptResponse.text()).toBeTruthy();
      const acceptedOrder = await prisma.salesOrder.findFirst({
        where: {
          id: createdSalesOrderId ?? undefined,
          ecommerceOrder: { is: { status: { not: "PLACED" } } }
        },
        select: { id: true }
      });
      expect(acceptedOrder?.id).toBe(createdSalesOrderId);

      for (const status of ["PROCESSING", "READY"]) {
        const statusResponse = await page.request.patch(
          `/api/online-store/ecommerce/orders/${encodeURIComponent(createdEcommerceOrderId)}`,
          { data: { status } }
        );
        expect(statusResponse.ok(), await statusResponse.text()).toBeTruthy();
      }

      if (createdOrderNo) {
        const orderRow = page.locator("tbody tr").filter({ hasText: createdOrderNo });
        await expect(orderRow).toContainText("Ready");
        await onlineStoreNavigation.getByRole("button", { name: "POS", exact: true }).click();
        await page.getByRole("button", { name: "Pending orders", exact: true }).click();
        const pendingOrderRow = page
          .locator(".rms-receipt-drawer .rms-list-row")
          .filter({ hasText: createdOrderNo });
        await expect(pendingOrderRow).toBeVisible();
        await expect(pendingOrderRow.getByRole("button", { name: "Fulfil", exact: true })).toBeEnabled();

        const orderForFulfilment = await prisma.salesOrder.findUniqueOrThrow({
          where: { id: createdSalesOrderId ?? "" },
          select: {
            retailOrgId: true,
            sourceTransactionId: true,
            depositAmount: true,
            store: { select: { code: true } },
            lines: {
              orderBy: { id: "asc" },
              take: 1,
              select: { id: true, discountAmount: true, lineTotal: true }
            }
          }
        });
        const sourceLine = await prisma.posTransactionLine.findFirstOrThrow({
          where: { posTransactionId: orderForFulfilment.sourceTransactionId },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            productCodeSnapshot: true,
            discountAmount: true,
            lineTotal: true
          }
        });
        const originalLineTotal = Number(sourceLine.lineTotal) + Number(sourceLine.discountAmount);
        expect(originalLineTotal).toBeGreaterThan(0);
        const regressionDiscount = originalLineTotal;
        const discountedLineTotal = 0;
        const salesOrderLine = orderForFulfilment.lines[0];
        if (!salesOrderLine) throw new Error("The ecommerce sales order has no saved line to fulfil.");
        const promotionSuffix = crypto.randomBytes(5).toString("hex").toUpperCase();
        const ineligibleBonusPromotionCode = `E2E-BUY2-${promotionSuffix}`;
        const regressionPromotionCode = `E2E-ZERO-${promotionSuffix}`;

        await prisma.$transaction([
          prisma.posTransactionLine.update({
            where: { id: sourceLine.id },
            data: {
              discountAmount: 0,
              lineTotal: originalLineTotal,
              appliedPromotionCodeSnapshot: null,
              appliedPromotionNameSnapshot: null
            }
          }),
          prisma.salesOrderLine.update({
            where: { id: salesOrderLine.id },
            data: {
              discountAmount: 0,
              lineTotal: originalLineTotal,
              appliedPromotionCode: null,
              appliedPromotionName: null
            }
          }),
          prisma.posTransaction.update({
            where: { id: orderForFulfilment.sourceTransactionId },
            data: { discountAmount: 0, totalAmount: originalLineTotal }
          }),
          prisma.salesOrder.update({
            where: { id: createdSalesOrderId ?? "" },
            data: {
              totalAmount: originalLineTotal,
              balanceAmount: Math.max(0, originalLineTotal - Number(orderForFulfilment.depositAmount))
            }
          })
        ]);
        await prisma.promotionCampaign.createMany({
          data: [
            {
              retailOrgId: orderForFulfilment.retailOrgId,
              code: ineligibleBonusPromotionCode,
              name: "Quantity-one must not receive Buy 2 Get 1",
              discountType: "PERCENT",
              targetScope: "PRODUCT",
              discountValue: 100,
              buyQuantity: 2,
              rewardQuantity: 1,
              targetProductCode: sourceLine.productCodeSnapshot,
              eligibleStoreCodes: JSON.stringify([orderForFulfilment.store.code]),
              priority: -1_000_001,
              status: "ACTIVE",
              originNodeCode: "E2E",
              lastModifiedByNodeCode: "E2E"
            },
            {
              retailOrgId: orderForFulfilment.retailOrgId,
              code: regressionPromotionCode,
              name: "Zero-value fulfilment regression",
              discountType: "PERCENT",
              targetScope: "PRODUCT",
              discountValue: 100,
              targetProductCode: sourceLine.productCodeSnapshot,
              eligibleStoreCodes: JSON.stringify([orderForFulfilment.store.code]),
              priority: -1_000_000,
              status: "ACTIVE",
              originNodeCode: "E2E",
              lastModifiedByNodeCode: "E2E"
            }
          ]
        });
        try {
          await page.reload();
          await dismissInventoryStartupAlert(page);
          await onlineStoreNavigation.getByRole("button", { name: "POS", exact: true }).click();
          await page.getByRole("button", { name: "Pending orders", exact: true }).click();
          const repricedPendingOrderRow = page
            .locator(".rms-receipt-drawer .rms-list-row")
            .filter({ hasText: createdOrderNo });
          await expect(repricedPendingOrderRow).toBeVisible();
          await repricedPendingOrderRow.getByRole("button", { name: "Fulfil", exact: true }).click();
          await expect(
            page.locator('.rms-payment-panel .rms-payment-row input[type="number"]').first()
          ).toHaveValue("0.00");

          const fulfilResponse = await page.request.post("/api/online-store/sales", {
            data: {
              salesOrderId: createdSalesOrderId,
              payments: []
            }
          });
          const fulfilPayload = (await fulfilResponse.json()) as { message?: string };
          expect(fulfilResponse.ok(), fulfilPayload.message).toBeTruthy();
        } finally {
          await prisma.promotionCampaign.deleteMany({
            where: {
              retailOrgId: orderForFulfilment.retailOrgId,
              code: { in: [ineligibleBonusPromotionCode, regressionPromotionCode] }
            }
          });
        }

        const fulfilledOrder = await prisma.salesOrder.findUniqueOrThrow({
          where: { id: createdSalesOrderId ?? "" },
          select: {
            status: true,
            totalAmount: true,
            balanceAmount: true,
            lines: {
              take: 1,
              select: {
                discountAmount: true,
                appliedPromotionCode: true
              }
            }
          }
        });
        expect(fulfilledOrder.status).toBe("FULFILLED");
        expect(Number(fulfilledOrder.totalAmount)).toBeCloseTo(discountedLineTotal, 2);
        expect(Number(fulfilledOrder.balanceAmount)).toBe(0);
        expect(Number(fulfilledOrder.lines[0]?.discountAmount ?? 0)).toBeCloseTo(regressionDiscount, 2);
        expect(fulfilledOrder.lines[0]?.appliedPromotionCode).toBe(regressionPromotionCode);

        await page.getByRole("button", { name: "Close", exact: true }).click();
        await onlineStoreNavigation.getByRole("button", { name: "Ecommerce" }).click();
        await expect(page.locator("tbody tr").filter({ hasText: createdOrderNo })).toContainText("Ready");
        await onlineStoreNavigation.getByRole("button", { name: "POS", exact: true }).click();
        await page.getByRole("button", { name: "Pending orders", exact: true }).click();
        await expect(
          page.locator(".rms-receipt-drawer .rms-list-row").filter({ hasText: createdOrderNo })
        ).toHaveCount(0);
        await page.getByRole("button", { name: "Close", exact: true }).click();
        await onlineStoreNavigation.getByRole("button", { name: "Ecommerce" }).click();
      }
    }
    await page.screenshot({ path: testInfo.outputPath("staff-orders-desktop.png"), fullPage: false });

    await page.getByRole("tab", { name: "Products", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Product visibility", exact: true })).toBeVisible();
    await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
    await page.getByRole("button", { name: /Edit ecommerce details for/ }).first().click();
    await expect(page.locator(".tox-edit-area iframe")).toBeVisible();
    await page.getByRole("button", { name: "Close product details", exact: true }).click();

    await page.getByRole("tab", { name: "Payments", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Payment options", exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Storefront", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save storefront", exact: true })).toBeVisible();
    const ecommerceScrollHost = page.locator(".rms-ecommerce-workspace");
    const scrollGeometry = await ecommerceScrollHost.evaluate((element) => {
      const host = element as HTMLElement;
      host.scrollTop = host.scrollHeight;
      return {
        clientHeight: host.clientHeight,
        scrollHeight: host.scrollHeight,
        scrollTop: host.scrollTop,
        overflowY: window.getComputedStyle(host).overflowY
      };
    });
    expect(scrollGeometry.overflowY).toMatch(/auto|scroll/);
    expect(scrollGeometry.scrollHeight).toBeGreaterThan(scrollGeometry.clientHeight);
    expect(scrollGeometry.scrollTop).toBeGreaterThan(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("staff-storefront-mobile.png"), fullPage: false });

    const workspaceResponse = await page.request.get("/api/online-store/ecommerce");
    expect(workspaceResponse.ok(), await workspaceResponse.text()).toBeTruthy();
    const staffWorkspace = (await workspaceResponse.json()) as {
      store: { code: string; ecommerceSlug: string | null };
      products: Array<{
        id: string;
        code: string;
        ecommercePublished: boolean;
        ecommerceDescription: string | null;
      }>;
    };
    const publishedProduct = staffWorkspace.products.find((product) => product.ecommercePublished);
    expect(publishedProduct).toBeTruthy();
    if (!publishedProduct) throw new Error("A published ecommerce product is required for this test.");
    const originalDescription = publishedProduct.ecommerceDescription;
    const richDescription =
      "<h3>Field-ready features</h3><p><strong>Reliable performance</strong> with <em>mobile ordering</em>.</p><ol><li>Choose the product</li><li>Track the order</li></ol>";

    try {
      const saveDescriptionResponse = await page.request.patch(
        `/api/online-store/ecommerce/products/${encodeURIComponent(publishedProduct.id)}`,
        { data: { ecommerceDescription: richDescription } }
      );
      expect(saveDescriptionResponse.ok(), await saveDescriptionResponse.text()).toBeTruthy();

      const savedWorkspaceResponse = await page.request.get("/api/online-store/ecommerce");
      const savedWorkspace = (await savedWorkspaceResponse.json()) as typeof staffWorkspace;
      expect(
        savedWorkspace.products.find((product) => product.id === publishedProduct.id)
          ?.ecommerceDescription
      ).toBe(richDescription);

      const publicStoreCode = staffWorkspace.store.ecommerceSlug || staffWorkspace.store.code;
      await page.goto(
        `/shop/${encodeURIComponent(publicStoreCode)}/products/${encodeURIComponent(publishedProduct.code)}`
      );
      await expect(page.getByRole("heading", { name: "Field-ready features" })).toBeVisible();
      await expect(page.getByText("Reliable performance", { exact: true })).toHaveCSS(
        "font-weight",
        /^(700|bold)$/
      );
      await expect(page.locator("ol li").filter({ hasText: "Choose the product" })).toBeVisible();
      await expect(page.locator("ol li").filter({ hasText: "Track the order" })).toBeVisible();
    } finally {
      await page.request.patch(
        `/api/online-store/ecommerce/products/${encodeURIComponent(publishedProduct.id)}`,
        { data: { ecommerceDescription: originalDescription } }
      );
    }
    expect(pageErrors.filter((message) => /error in input stream/i.test(message))).toEqual([]);
  });

  test("offers ecommerce Layaway only when configured and preserves the unpaid opening state", async ({
    page
  }) => {
    test.setTimeout(300_000);
    await completeStaffSignIn(page);
    await page.goto("/online-store?workspace=ecommerce");
    await dismissInventoryStartupAlert(page);
    await page.getByRole("tab", { name: "Payments", exact: true }).click();
    await expect(page.getByText("Offer Layaway online", { exact: true })).toBeVisible();
    const normalizedStoreCode = (storeCode ?? "").trim();
    const store = await prisma.store.findFirstOrThrow({
      where: {
        OR: [
          { code: normalizedStoreCode.toUpperCase() },
          { ecommerceSlug: normalizedStoreCode.toLowerCase() }
        ]
      },
      select: {
        id: true,
        code: true,
        retailOrgId: true,
        ecommerceLayawayEnabled: true,
        retailOrg: { select: { companySettingsJson: true } }
      }
    });
    const workspaceResponse = await page.request.get("/api/online-store/ecommerce");
    expect(workspaceResponse.ok(), await workspaceResponse.text()).toBeTruthy();
    const workspace = (await workspaceResponse.json()) as {
      paymentMethods: Array<{
        id: string;
        code: string;
        enabled: boolean;
        gatewayActive: boolean;
        gatewayStatus: string;
        sortOrder: number;
      }>;
    };
    let gatewayMethod = workspace.paymentMethods.find(
      (method) => method.gatewayActive && method.gatewayStatus === "READY"
    );
    let temporaryTenderMethodId: string | null = null;
    if (!gatewayMethod) {
      const temporaryTender = await prisma.tenderMethod.create({
        data: {
          retailOrgId: store.retailOrgId,
          code: `E2E-LAYAWAY-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
          name: "E2E Layaway gateway",
          paymentMethod: "MOBILE_MONEY",
          gatewayProvider: "PAYSTACK",
          gatewayMode: "TEST",
          gatewayPublicKey: "pk_test_ecommerce_layaway_qa",
          gatewaySecretMask: "sk_test_ecommerce_layaway_qa",
          gatewayActive: true,
          gatewayStatus: "READY",
          requiresReference: true,
          allowChange: false,
          status: "ACTIVE",
          originNodeCode: "E2E",
          lastModifiedByNodeCode: "E2E"
        },
        select: { id: true, code: true }
      });
      temporaryTenderMethodId = temporaryTender.id;
      gatewayMethod = {
        id: temporaryTender.id,
        code: temporaryTender.code,
        enabled: false,
        gatewayActive: true,
        gatewayStatus: "READY",
        sortOrder: 999
      };
    }
    const originalCompanySettings = store.retailOrg.companySettingsJson;
    const companySettings = (() => {
      try {
        return JSON.parse(originalCompanySettings ?? "{}") as Record<string, unknown>;
      } catch {
        return {} as Record<string, unknown>;
      }
    })();
    const originalMethod = gatewayMethod!;
    let ecommerceOrderId: string | null = null;
    let salesOrderId: string | null = null;
    let sourceTransactionId: string | null = null;
    let customerAccountId: string | null = null;
    let customerId: string | null = null;

    try {
      await prisma.retailOrg.update({
        where: { id: store.retailOrgId },
        data: {
          companySettingsJson: JSON.stringify({
            ...companySettings,
            layawaySettings: {
              enabled: true,
              reserveStockOnDeposit: true,
              minimumDepositPercent: 20,
              requireFullPaymentBeforeFulfilment: true,
              refundPaymentsOnCancellation: true,
              cancellationFeeType: "PERCENTAGE",
              cancellationFeeValue: 5
            }
          })
        }
      });
      const enableResponse = await page.request.patch(
        "/api/online-store/ecommerce/payment-methods",
        {
          data: {
            layawayEnabled: true,
            payOnDeliveryEnabled: true,
            methods: [{
              tenderMethodId: originalMethod.id,
              enabled: true,
              sortOrder: originalMethod.sortOrder
            }]
          }
        }
      );
      expect(enableResponse.ok(), await enableResponse.text()).toBeTruthy();

      const catalogResponse = await page.request.get(
        `/api/ecommerce/${encodeURIComponent(store.code)}/catalog`
      );
      expect(catalogResponse.ok(), await catalogResponse.text()).toBeTruthy();
      const catalog = (await catalogResponse.json()) as {
        store: {
          allowDelivery: boolean;
          layawayOffer: { enabled: boolean; minimumDepositPercent: number };
        };
        paymentMethods: Array<{ code: string }>;
        products: Array<{
          id: string;
          code: string;
          name: string;
          availableQuantity: number | null;
          unitPrice: number;
          variants: Array<{ id: string }>;
        }>;
      };
      expect(catalog.store.layawayOffer).toMatchObject({
        enabled: true,
        minimumDepositPercent: 20
      });
      const product = catalog.products.find(
        (candidate) =>
          candidate.variants.length === 0 &&
          (candidate.availableQuantity === null || candidate.availableQuantity > 0)
      );
      expect(product).toBeTruthy();

      const identifier = `+23324${String(Date.now()).slice(-7)}`;
      const otpResponse = await page.request.post(
        `/api/ecommerce/${encodeURIComponent(store.code)}/auth/request-otp`,
        {
          headers: { "x-forwarded-for": `203.0.113.${crypto.randomInt(1, 250)}` },
          data: { identifier, purpose: "SIGN_UP" }
        }
      );
      expect(otpResponse.ok(), await otpResponse.text()).toBeTruthy();
      const otp = (await otpResponse.json()) as { challengeId: string; developmentCode?: string };
      test.skip(!otp.developmentCode, "Development OTP exposure is required for ecommerce Layaway UAT.");
      const signupResponse = await page.request.post(
        `/api/ecommerce/${encodeURIComponent(store.code)}/auth/verify-signup`,
        {
          data: {
            challengeId: otp.challengeId,
            code: otp.developmentCode,
            fullName: "Ecommerce Layaway QA",
            password: `Qa${Date.now()}Layaway`
          }
        }
      );
      expect(signupResponse.ok(), await signupResponse.text()).toBeTruthy();

      const quoteResponse = await page.request.post(
        `/api/ecommerce/${encodeURIComponent(store.code)}/quote`,
        { data: { lines: [{ productId: product!.id, quantity: 1 }] } }
      );
      expect(quoteResponse.ok(), await quoteResponse.text()).toBeTruthy();
      const quote = (await quoteResponse.json()) as { totalAmount: number };
      test.skip(quote.totalAmount <= 0, "A positive ecommerce product total is required for Layaway UAT.");
      const minimumDeposit = Number((quote.totalAmount * 0.2).toFixed(2));

      await page.setViewportSize({ width: 390, height: 844 });
      const sessionRefresh = page.waitForResponse(
        (response) =>
          response.url().toLowerCase().includes(
            `/api/ecommerce/${encodeURIComponent(store.code).toLowerCase()}/auth/session`
          ) && response.request().method() === "GET"
      );
      await page.goto(
        `/shop/${encodeURIComponent(store.code)}/products/${encodeURIComponent(product!.code)}`
      );
      await sessionRefresh;
      const productPage = page.locator("article").filter({
        has: page.getByRole("heading", { name: product!.name, level: 1 })
      });
      await productPage.getByRole("button", { name: /Add/ }).click();
      await page.getByRole("button", { name: "Open cart" }).click();
      await page.getByRole("button", { name: /Checkout/ }).click();
      const layawayButton = page.getByRole("button", { name: "Layaway", exact: true });
      await expect(layawayButton).toBeVisible();
      await layawayButton.click();
      await expect(page.getByText("20% minimum deposit", { exact: true })).toBeVisible();
      const depositInput = page.getByLabel("Deposit to pay now");
      await expect(depositInput).toBeVisible();
      expect(Number(await depositInput.inputValue())).toBe(minimumDeposit);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
      ).toBeLessThanOrEqual(1);

      const delivery = {
        fulfilmentMethod: catalog.store.allowDelivery ? "DELIVERY" : "PICKUP",
        recipientName: "Ecommerce Layaway QA",
        phone: identifier,
        ...(catalog.store.allowDelivery
          ? { addressLine1: "15 Independence Avenue", city: "Accra", region: "Greater Accra" }
          : {})
      };
      const lowDepositResponse = await page.request.post(
        `/api/ecommerce/${encodeURIComponent(store.code)}/orders`,
        {
          headers: { "idempotency-key": `layaway-low-${crypto.randomUUID()}` },
          data: {
            lines: [{ productId: product!.id, quantity: 1 }],
            delivery,
            paymentMethodCode: originalMethod.code,
            orderType: "LAYAWAY",
            layawayDepositAmount: Math.max(0, minimumDeposit - 0.01)
          }
        }
      );
      expect(lowDepositResponse.status()).toBe(400);
      expect(await lowDepositResponse.text()).toContain("opening deposit");

      const orderResponse = await page.request.post(
        `/api/ecommerce/${encodeURIComponent(store.code)}/orders`,
        {
          headers: { "idempotency-key": `layaway-valid-${crypto.randomUUID()}` },
          data: {
            lines: [{ productId: product!.id, quantity: 1 }],
            delivery,
            paymentMethodCode: originalMethod.code,
            orderType: "LAYAWAY",
            layawayDepositAmount: minimumDeposit
          }
        }
      );
      expect(orderResponse.ok(), await orderResponse.text()).toBeTruthy();
      const created = (await orderResponse.json()) as {
        orderId: string;
        orderNo: string;
        orderType: string;
        paymentAmountDueNow: number;
      };
      expect(created).toMatchObject({
        orderType: "LAYAWAY",
        paymentAmountDueNow: minimumDeposit
      });
      const persisted = await prisma.ecommerceOrder.findUniqueOrThrow({
        where: { id: created.orderId },
        include: { salesOrder: true }
      });
      ecommerceOrderId = persisted.id;
      salesOrderId = persisted.salesOrderId;
      sourceTransactionId = persisted.salesOrder.sourceTransactionId;
      customerAccountId = persisted.customerAccountId;
      const customerAccount = await prisma.ecommerceCustomerAccount.findUniqueOrThrow({
        where: { id: persisted.customerAccountId },
        select: { customerId: true }
      });
      customerId = customerAccount.customerId;
      expect(persisted.salesOrder).toMatchObject({
        orderType: "LAYAWAY",
        reservationStatus: "NOT_APPLICABLE"
      });
      expect(Number(persisted.salesOrder.paidAmount)).toBe(0);
      expect(Number(persisted.layawayDepositAmount)).toBe(minimumDeposit);
      expect(JSON.parse(persisted.salesOrder.layawayPolicySnapshotJson ?? "{}")).toMatchObject({
        minimumDepositPercent: 20,
        reserveStockOnDeposit: true
      });

      const prematureAcceptance = await page.request.patch(
        `/api/online-store/ecommerce/orders/${encodeURIComponent(persisted.id)}`,
        { data: { status: "CONFIRMED" } }
      );
      expect(prematureAcceptance.status()).toBe(409);
      expect(await prematureAcceptance.text()).toContain("minimum opening deposit");

    } finally {
      if (ecommerceOrderId) {
        await prisma.ecommerceOrderStatusEvent.deleteMany({ where: { ecommerceOrderId } });
        await prisma.ecommerceRefundRequest.deleteMany({ where: { ecommerceOrderId } });
        await prisma.ecommercePayment.deleteMany({ where: { ecommerceOrderId } });
        await prisma.ecommerceOrder.deleteMany({ where: { id: ecommerceOrderId } });
      }
      if (salesOrderId) {
        await prisma.salesOrderInventoryReservation.deleteMany({ where: { salesOrderId } });
        await prisma.salesOrderLine.deleteMany({ where: { salesOrderId } });
        await prisma.salesOrder.deleteMany({ where: { id: salesOrderId } });
      }
      if (sourceTransactionId) {
        await prisma.posPayment.deleteMany({ where: { posTransactionId: sourceTransactionId } });
        await prisma.posTransactionLine.deleteMany({ where: { posTransactionId: sourceTransactionId } });
        await prisma.posTransaction.deleteMany({ where: { id: sourceTransactionId } });
      }
      if (customerAccountId) {
        await prisma.ecommerceCustomerSession.deleteMany({ where: { customerAccountId } });
        await prisma.ecommerceCustomerIdentity.deleteMany({ where: { customerAccountId } });
        await prisma.ecommerceCustomerAddress.deleteMany({ where: { customerAccountId } });
        await prisma.ecommerceCustomerAccount.deleteMany({ where: { id: customerAccountId } });
      }
      if (customerId) {
        await prisma.customer.deleteMany({ where: { id: customerId } });
      }
      await prisma.retailOrg.update({
        where: { id: store.retailOrgId },
        data: { companySettingsJson: originalCompanySettings }
      });
      await prisma.store.update({
        where: { id: store.id },
        data: { ecommerceLayawayEnabled: store.ecommerceLayawayEnabled }
      });
      await prisma.ecommerceStorePaymentMethod.updateMany({
        where: { storeId: store.id, tenderMethodId: originalMethod.id },
        data: { enabled: originalMethod.enabled, sortOrder: originalMethod.sortOrder }
      });
      if (temporaryTenderMethodId) {
        await prisma.ecommerceStorePaymentMethod.deleteMany({
          where: { storeId: store.id, tenderMethodId: temporaryTenderMethodId }
        });
        await prisma.tenderMethod.deleteMany({ where: { id: temporaryTenderMethodId } });
      }
    }
  });

  test("shows the ecommerce staff-console privilege in the role editor", async ({ page }) => {
    await completeStaffSignIn(page, securityAdminLogin, securityAdminPassword);
    await page.goto("/security/roles-privileges");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Create role", exact: true }).click();
    const roleDialog = page.getByRole("dialog");
    await expect(roleDialog).toBeVisible();
    await roleDialog.getByPlaceholder("Search privilege name, code, domain, group, or surface").fill("ecommerce");
    await expect(roleDialog.getByText("Access ecommerce staff console", { exact: true })).toBeVisible();
    await expect(roleDialog.getByText("ecommerce.console.access", { exact: true })).toBeVisible();
    await expect(roleDialog.getByRole("checkbox")).toHaveCount(1);
  });

  test("persists complete promotion edits through reload", async ({ page }) => {
    await completeStaffSignIn(page, securityAdminLogin, securityAdminPassword);
    const normalizedStoreCode = (storeCode ?? "").trim();
    const store = await prisma.store.findFirstOrThrow({
      where: {
        OR: [
          { code: normalizedStoreCode.toUpperCase() },
          { ecommerceSlug: normalizedStoreCode.toLowerCase() }
        ]
      },
      select: { code: true, retailOrgId: true }
    });
    const product = await prisma.product.findFirstOrThrow({
      where: { retailOrgId: store.retailOrgId, status: "ACTIVE", deletedAt: null },
      orderBy: { name: "asc" },
      select: { code: true }
    });
    const promotionCode = `E2E-PROMOTION-EDIT-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    const savedName = `Promotion edit QA ${promotionCode.slice(-5)}`;
    const initialPayload = {
      promotionCode,
      name: "Promotion create QA",
      description: "Initial complete promotion request.",
      discountType: "PERCENT",
      targetScope: "PRODUCT",
      discountValue: 25,
      minimumBasketAmount: 5,
      minimumLineQuantity: 2,
      buyQuantity: 1,
      rewardQuantity: 1,
      targetDepartmentCode: null,
      targetCategoryCode: null,
      targetProductCode: product.code,
      eligibleStoreCodes: [store.code],
      eligibleCustomerTypes: ["INDIVIDUAL"],
      eligibleLoyaltyTiers: ["Silver"],
      activeDaysOfWeek: ["TUESDAY"],
      activeFromMinutes: 540,
      activeToMinutes: 1020,
      couponRequired: true,
      couponCode: "CREATE-QA",
      allowWithLoyalty: false,
      applyOncePerBasket: true,
      priority: 0,
      startAt: null,
      endAt: null,
      status: "ACTIVE"
    };

    try {
      const createResponse = await page.request.post("/api/setup/promotions", {
        data: initialPayload
      });
      expect(createResponse.ok(), await createResponse.text()).toBeTruthy();

      const patchResponse = await page.request.patch(
        `/api/setup/promotions/${encodeURIComponent(promotionCode)}`,
        {
          data: {
            ...initialPayload,
            name: savedName,
            description: "Every editable promotion field survived the PATCH request.",
            discountValue: 100,
            minimumBasketAmount: 12.5,
            minimumLineQuantity: 3,
            buyQuantity: 2,
            rewardQuantity: 1,
            eligibleCustomerTypes: ["CORPORATE", "INDIVIDUAL"],
            eligibleLoyaltyTiers: ["Gold"],
            activeDaysOfWeek: ["MONDAY", "WEDNESDAY", "FRIDAY"],
            activeFromMinutes: 480,
            activeToMinutes: 1260,
            couponCode: "EDIT-QA"
          }
        }
      );
      expect(patchResponse.ok(), await patchResponse.text()).toBeTruthy();

      const saved = await prisma.promotionCampaign.findFirstOrThrow({
        where: { retailOrgId: store.retailOrgId, code: promotionCode },
        select: {
          name: true,
          description: true,
          discountValue: true,
          minimumBasketAmount: true,
          minimumLineQuantity: true,
          buyQuantity: true,
          rewardQuantity: true,
          eligibleStoreCodes: true,
          eligibleCustomerTypes: true,
          eligibleLoyaltyTiers: true,
          activeDaysOfWeek: true,
          activeFromMinutes: true,
          activeToMinutes: true,
          couponRequired: true,
          couponCode: true
        }
      });
      expect({
        ...saved,
        discountValue: Number(saved.discountValue),
        minimumBasketAmount: Number(saved.minimumBasketAmount),
        minimumLineQuantity: Number(saved.minimumLineQuantity),
        buyQuantity: Number(saved.buyQuantity),
        rewardQuantity: Number(saved.rewardQuantity)
      }).toMatchObject({
        name: savedName,
        description: "Every editable promotion field survived the PATCH request.",
        discountValue: 100,
        minimumBasketAmount: 12.5,
        minimumLineQuantity: 3,
        buyQuantity: 2,
        rewardQuantity: 1,
        eligibleStoreCodes: JSON.stringify([store.code.toUpperCase()]),
        eligibleCustomerTypes: JSON.stringify(["CORPORATE", "INDIVIDUAL"]),
        eligibleLoyaltyTiers: JSON.stringify(["Gold"]),
        activeDaysOfWeek: JSON.stringify(["MONDAY", "WEDNESDAY", "FRIDAY"]),
        activeFromMinutes: 480,
        activeToMinutes: 1260,
        couponRequired: true,
        couponCode: "EDIT-QA"
      });

      await page.goto("/master/promotions");
      await page.getByPlaceholder("Search promotions").fill(promotionCode);
      await expect(page.getByText(savedName, { exact: true })).toBeVisible();
      await page.reload();
      await page.getByPlaceholder("Search promotions").fill(promotionCode);
      await expect(page.getByText(savedName, { exact: true })).toBeVisible();
    } finally {
      await prisma.promotionCampaign.deleteMany({
        where: { retailOrgId: store.retailOrgId, code: promotionCode }
      });
    }
  });
});
