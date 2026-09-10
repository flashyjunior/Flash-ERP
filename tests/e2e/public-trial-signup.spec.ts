import { expect, test } from "@playwright/test";

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "reference", width: 942, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 }
] as const;

const expectedWhatsAppNumber = (process.env.FLASH_ERP_E2E_TRIAL_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");

for (const viewport of viewports) {
  test(`public trial signup presents the complete platform on ${viewport.name}`, async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });
    page.on("pageerror", (error) => runtimeErrors.push(error.message));

    await page.setViewportSize(viewport);
    await page.goto("/signup", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { level: 1, name: "Flash ERP" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "HR, payroll & people operations" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Manufacturing/ })).toBeVisible();
    await expect(page.getByText("Manufacturing", { exact: true }).first()).toBeVisible();
    const previewManufacturing = page.getByTestId("enterprise-preview-manufacturing");
    await expect(previewManufacturing).toBeVisible();
    await expect(previewManufacturing.locator("svg")).toBeVisible();
    expect(
      await previewManufacturing.locator("svg").evaluate((icon) => {
        const bounds = icon.getBoundingClientRect();
        return bounds.width >= 14 && bounds.height >= 14;
      })
    ).toBe(true);
    expect(
      await previewManufacturing.evaluate((row) => row.scrollWidth <= row.clientWidth)
    ).toBe(true);
    await expect(page.getByText("Coming soon", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Offline continuity flow" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Offline-first Store Desktop" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create your trial workspace" })).toBeVisible();
    await expect(page.getByLabel("Work email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue to email verification" })).toBeEnabled();

    const heroImage = page.getByAltText("A Ghanaian retail operations manager working in a connected shop and stockroom");
    await expect(heroImage).toBeVisible();
    expect(await heroImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    if (viewport.width > 860) {
      expect(await heroImage.evaluate((image) => getComputedStyle(image).objectPosition)).toBe("52% 18%");
      expect(
        await page.locator("section[aria-labelledby='trial-hero-title']").evaluate((hero) => hero.getBoundingClientRect().height)
      ).toBeGreaterThanOrEqual(404);
    }

    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth).toBeLessThanOrEqual(viewportWidth);

    if (viewport.width >= 942) {
      const navigation = page.getByRole("navigation", { name: "Trial page navigation" });
      const stickyHeader = page.locator("header");
      const platformLink = navigation.getByRole("link", { name: "Platform", exact: true });
      const trialLink = navigation.getByRole("link", { name: "14-day trial", exact: true });

      await expect(navigation).toBeVisible();
      expect(await platformLink.evaluate((link) => Number.parseFloat(getComputedStyle(link).fontSize))).toBeGreaterThanOrEqual(16);
      expect(await trialLink.evaluate((link) => getComputedStyle(link).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");

      await platformLink.focus();
      expect(await platformLink.evaluate((link) => getComputedStyle(link).outlineStyle)).not.toBe("none");
      await platformLink.click();
      await expect(page).toHaveURL(/#platform$/);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
      expect(Math.abs(await stickyHeader.evaluate((header) => header.getBoundingClientRect().top))).toBeLessThanOrEqual(1);
      expect(await stickyHeader.evaluate((header) => getComputedStyle(header).position)).toBe("sticky");
      expect(await stickyHeader.evaluate((header) => getComputedStyle(header).backgroundColor)).toBe("rgb(255, 255, 255)");
      expect(
        await stickyHeader.evaluate((header) => {
          const bounds = header.getBoundingClientRect();
          const topmost = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
          return Boolean(topmost && (topmost === header || header.contains(topmost)));
        })
      ).toBe(true);
      if (viewport.name === "desktop") {
        await page.screenshot({ path: "artifacts/trial-signup-fixed-header-desktop.png" });
      }
      await page.evaluate(() => window.scrollTo(0, 0));
    }

    if (viewport.name === "desktop") {
      const platformLayout = page.locator("#platform > div").first();
      const platformBox = await platformLayout.boundingBox();
      expect(platformBox).not.toBeNull();
      expect(platformBox!.width / viewportWidth).toBeGreaterThanOrEqual(0.8);
      expect(platformBox!.width / viewportWidth).toBeLessThanOrEqual(0.84);
    }

    const formShell = page.locator("#trial form").locator("..");
    const formBox = await formShell.boundingBox();
    const fullNameBox = await page.getByLabel("Your full name").boundingBox();
    const businessNameBox = await page.getByLabel("Business name").boundingBox();
    expect(formBox).not.toBeNull();
    expect(fullNameBox).not.toBeNull();
    expect(businessNameBox).not.toBeNull();

    if (viewport.width > 640) {
      expect(formBox!.width).toBeGreaterThanOrEqual(559);
      expect(formBox!.width).toBeLessThanOrEqual(561);
      expect(Math.abs(fullNameBox!.y - businessNameBox!.y)).toBeLessThan(2);
    } else {
      expect(formBox!.width).toBeLessThanOrEqual(viewportWidth - 32);
      expect(businessNameBox!.y).toBeGreaterThan(fullNameBox!.y + 45);
    }

    expect(fullNameBox!.height).toBeGreaterThanOrEqual(44);
    expect(fullNameBox!.height).toBeLessThanOrEqual(46);

    if (expectedWhatsAppNumber) {
      const whatsappLink = page.getByTestId("trial-whatsapp-link");
      await expect(whatsappLink).toBeVisible();
      await expect(whatsappLink).toHaveAttribute(
        "href",
        new RegExp(`^https://wa\\.me/${expectedWhatsAppNumber}\\?text=`)
      );
      await expect(whatsappLink.locator("svg")).toBeVisible();
    }

    expect(runtimeErrors).toEqual([]);

    await page.screenshot({
      path: `artifacts/trial-signup-${viewport.name}.png`,
      fullPage: true
    });
    await page.locator("#trial").screenshot({
      path: `artifacts/trial-signup-form-${viewport.name}.png`
    });
  });
}
