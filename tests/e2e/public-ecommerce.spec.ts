import crypto from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import "dotenv/config";

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
    await page.goto(`/shop/${encodeURIComponent(storeCode ?? "")}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByPlaceholder("Search products, brands and categories")).toBeVisible();
    await expect(page.locator("article").filter({ has: page.getByRole("heading", { level: 3 }) })).not.toHaveCount(0);

    const hero = page.locator("section").filter({ has: page.getByRole("heading", { level: 1 }) }).locator("img").first();
    await expect(hero).toBeVisible();
    expect(await hero.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

    for (const viewport of [
      { name: "mobile", width: 390, height: 844 },
      { name: "tablet", width: 820, height: 1180 },
      { name: "desktop", width: 1440, height: 1000 }
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expect(page.getByPlaceholder("Search products, brands and categories")).toBeVisible();
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(horizontalOverflow, `${viewport.name} has horizontal page overflow`).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: testInfo.outputPath(`storefront-${viewport.name}.png`),
        fullPage: false
      });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("heading", { level: 3 }).first().click();
    await expect(page).toHaveURL(/\/shop\/[^/]+\/products\/[^/]+$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /on WhatsApp$/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /on WhatsApp$/ }).locator("svg")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Description", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Specifications", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Reviews/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("product-details-mobile.png"), fullPage: false });
  });

  test("advertises an eligible promotion before checkout", async ({ page }, testInfo) => {
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
    }
  });

  test("quotes bonus-buy totals and navigates the product gallery", async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
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
        galleryImageUrls: string[];
        promotion: null | { code: string };
      }>;
    };
    const product = catalog.products.find((candidate) => candidate.code === "FLASH-COLA-50CL");
    expect(product).toBeTruthy();
    expect(product?.promotion?.code).toBe("FLASH-COLA-BUY2GET1");

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
    expect(quote).toMatchObject({
      subtotalAmount: 7.5,
      discountAmount: 2.5,
      totalAmount: 5
    });
    expect(quote.lines[0]?.appliedPromotionCode).toBe("FLASH-COLA-BUY2GET1");

    await page.goto(
      `/shop/${encodeURIComponent(storeCode ?? "")}/products/FLASH-COLA-50CL`
    );
    await expect(page.getByRole("heading", { level: 1, name: product?.name })).toBeVisible();

    if ((product?.galleryImageUrls.length ?? 0) > 1) {
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
    }).format(5);
    const addButton = page.getByRole("button", { name: `Add · ${formattedTotal}` });
    await expect(addButton).toBeVisible();
    await addButton.click();
    await page.getByRole("button", { name: "Open cart" }).click();
    await expect(page.getByText("Promotion savings", { exact: true })).toBeVisible();
    await expect(page.getByText(formattedTotal, { exact: true }).last()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("bonus-buy-cart-and-gallery.png"), fullPage: false });
    expect(pageErrors).toEqual([]);
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
    const createdOrder = (await orderResponse.json()) as { orderNo: string; status: string };
    expect(createdOrder.orderNo).toMatch(/^SO-/);
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
            lines: { select: { productCodeSnapshot: true } }
          }
        }
      }
    });
    createdEcommerceOrderId = ecommerceOrder.id;
    createdSalesOrderId = ecommerceOrder.salesOrderId;
    expect(ecommerceOrder.status).toBe("PLACED");
    expect(Number(ecommerceOrder.deliveryFeeAmount)).toBe(0);
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
      orders: Array<{ orderNo: string; lines: Array<{ productName: string }> }>;
    };
    const savedOrder = orders.orders.find((order) => order.orderNo === createdOrder.orderNo);
    expect(savedOrder?.lines).toHaveLength(1);
    expect(savedOrder?.lines[0]?.productName).toBe(orderProduct.name);

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
