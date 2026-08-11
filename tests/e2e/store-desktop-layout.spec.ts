import { _electron as electron, expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const desktopEntry = path.resolve(
  process.env.FLASH_ERP_E2E_DESKTOP_ENTRY ??
    "apps/store-desktop/dist-electron/electron/bootstrap.js",
);

function createElectronLaunchEnv(overrides: NodeJS.ProcessEnv) {
  const env = { ...process.env, ...overrides };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function findFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

test("standalone master grids fill the workspace and forms remain usable", async () => {
  test.setTimeout(240_000);
  test.skip(
    !existsSync(desktopEntry),
    "Build Store Desktop before running its layout certification.",
  );

  const proofRoot = path.resolve(
    ".e2e",
    "store-desktop-layout",
    String(Date.now()),
  );
  const evidenceRoot = path.resolve(".e2e", "evidence");
  const electronUserDataPath = path.join(proofRoot, "electron-profile");
  const storeDataPath = path.join(proofRoot, "store-data");
  const databasePath = path.join(storeDataPath, "standalone-layout.sqlite");
  const storePort = await findFreePort();
  const loginId = "layout.admin";
  const password = "LayoutGate123!";
  const loginBackgroundImageUrl = `data:image/jpeg;base64,${readFileSync(
    path.resolve("apps/store-desktop/src/assets/retail-login-bg.jpg"),
  ).toString("base64")}`;
  mkdirSync(electronUserDataPath, { recursive: true });
  mkdirSync(storeDataPath, { recursive: true });
  mkdirSync(evidenceRoot, { recursive: true });

  const app = await electron.launch({
    args: [desktopEntry, `--user-data-dir=${electronUserDataPath}`],
    env: createElectronLaunchEnv({
      FLASH_ERP_DESKTOP_USE_DIST: "1",
      FLASH_ERP_STORE_DEPLOYMENT_MODE: "STANDALONE",
      FLASH_ERP_STORE_RUNTIME_ROLE: "embedded",
      FLASH_ERP_STORE_DATABASE_PROVIDER: "sqlite",
      FLASH_ERP_STORE_DATABASE_URL: "",
      FLASH_ERP_STORE_DB_PATH: databasePath,
      FLASH_ERP_STORE_USER_DATA_PATH: storeDataPath,
      FLASH_ERP_STORE_TERMINAL_CODE: "layout-gate-01",
      FLASH_ERP_STORE_TERMINAL_NAME: "Layout Gate Terminal",
      FLASH_ERP_STORE_SERVER_ENABLED: "1",
      FLASH_ERP_STORE_SERVER_HOST: "127.0.0.1",
      FLASH_ERP_STORE_SERVER_PORT: String(storePort),
      FLASH_ERP_STORE_SERVER_TIMEOUT_MS: "2500",
      FLASH_ERP_STORE_SERVER_URL: "",
      FLASH_ERP_STORE_SYNC_BASE_URL: "",
    }),
  });

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
    await page.waitForFunction(
      () => Boolean(window.desktopRuntime?.bootstrapStandaloneAdmin),
      undefined,
      { timeout: 30_000 },
    );
    await expect(
      page.getByRole("button", { name: "Change password", exact: true }),
    ).toHaveCount(0);

    await page.evaluate(
      async ({ nextLoginId, nextPassword }) => {
        await window.desktopRuntime?.bootstrapStandaloneAdmin({
          loginId: nextLoginId,
          displayName: "Layout Admin",
          password: nextPassword,
        });
      },
      { nextLoginId: loginId, nextPassword: password },
    );

    await page.getByPlaceholder("Enter your username").fill(loginId);
    await page.getByPlaceholder("Enter your password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".rms-desktop")).toBeVisible({ timeout: 30_000 });
    const runningVersion = await page.evaluate(async () => {
      const status = await window.desktopRuntime?.getDesktopUpdateStatus();
      return status?.currentVersion ?? null;
    });
    expect(runningVersion).toBeTruthy();
    await expect(
      page.getByLabel("Application version"),
    ).toHaveText(`Version ${runningVersion}`);
    const navigation = page.getByRole("navigation", {
      name: "Desktop workspaces",
    });
    async function resizeDesktopWindow(width: number, height: number) {
      const rendererUrl = page.url();
      await app.evaluate(
        async ({ BrowserWindow }, nextSize) => {
          const window = BrowserWindow.getAllWindows().find(
            (candidate) => candidate.webContents.getURL() === nextSize.rendererUrl,
          );

          if (!window) {
            return;
          }

          if (window.isMaximized()) {
            window.unmaximize();
            await new Promise<void>((resolve) => {
              if (!window.isMaximized()) {
                resolve();
                return;
              }

              window.once("unmaximize", () => resolve());
            });
          }

          window.setSize(nextSize.width, nextSize.height);
        },
        { width, height, rendererUrl },
      );
      await page.waitForFunction(
        (nextSize) =>
          window.innerWidth <= nextSize.width &&
          window.innerWidth >= nextSize.width - 80 &&
          window.innerHeight <= nextSize.height &&
          window.innerHeight >= nextSize.height - 100,
        { width, height },
        { timeout: 10_000 },
      );
    }

    await page.evaluate(async (nextLoginBackgroundImageUrl) => {
      const runtime = window.desktopRuntime;

      if (!runtime) {
        throw new Error(
          "Desktop runtime was unavailable during layout seeding.",
        );
      }

      for (let index = 1; index <= 42; index += 1) {
        const suffix = String(index).padStart(3, "0");
        await runtime.saveStandaloneProduct({
          productCode: `LAYOUT-${suffix}`,
          productName: `Layout Certification Product ${suffix}`,
          unitPrice: 25 + index,
          quantityOnHand: index,
          minStockLevel: index === 1 ? 5 : 0,
          trackInventory: true,
        });
      }

      await runtime.saveStandaloneProduct({
        productCode: "LAYOUT-EXPIRY",
        productName: "Layout Expiry Controlled Product",
        unitPrice: 45,
        quantityOnHand: 0,
        trackExpiry: true,
        trackInventory: true,
      });
      await runtime.saveStandaloneProduct({
        productCode: "LAYOUT-SERIAL",
        productName: "Layout Serialized Phone",
        unitPrice: 4500,
        quantityOnHand: 0,
        isSerialized: true,
        trackInventory: true,
      });
      await runtime.saveStandalonePurchaseOrder({
        purchaseOrderNo: "PO-LAYOUT-001",
        externalReference: "LAYOUT-CERT",
        lines: [
          {
            productCode: "LAYOUT-EXPIRY",
            orderedQuantity: 12,
            unitCost: 30,
          },
        ],
      });
      await runtime.saveStandalonePurchaseOrder({
        purchaseOrderNo: "PO-LAYOUT-EXPIRY",
        externalReference: "LAYOUT-EXPIRY-CERT",
        lines: [
          {
            productCode: "LAYOUT-EXPIRY",
            orderedQuantity: 12,
            unitCost: 30,
          },
        ],
      });
      await runtime.saveStandalonePurchaseOrder({
        purchaseOrderNo: "PO-LAYOUT-BATCH-002",
        externalReference: "LAYOUT-BATCH-CHOICE-CERT",
        lines: [
          {
            productCode: "LAYOUT-EXPIRY",
            orderedQuantity: 6,
            unitCost: 31,
          },
        ],
      });
      await runtime.saveStandalonePurchaseOrder({
        purchaseOrderNo: "PO-LAYOUT-SERIAL",
        externalReference: "LAYOUT-SERIAL-CERT",
        lines: [
          {
            productCode: "LAYOUT-SERIAL",
            orderedQuantity: 3,
            unitCost: 3600,
          },
        ],
      });
      const purchaseOrders = await runtime.browsePurchaseOrders({
        query: "PO-LAYOUT-EXPIRY",
        limit: 10,
      });
      const purchaseOrder = purchaseOrders.find(
        (row) => row.purchaseOrderNo === "PO-LAYOUT-EXPIRY",
      );
      const purchaseOrderLine = purchaseOrder?.lines[0];

      if (!purchaseOrder || !purchaseOrderLine) {
        throw new Error("Layout purchase order was not available for receipt.");
      }

      const expiryDate = new Date(Date.now() + 10 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      await runtime.receivePurchaseOrder({
        purchaseOrderId: purchaseOrder.purchaseOrderId,
        lines: [
          {
            purchaseOrderLineId: purchaseOrderLine.purchaseOrderLineId,
            quantity: 12,
            batchNo: "BATCH-LAYOUT-001",
            manufacturedAt: "2026-07-01",
            expiryDate,
          },
        ],
      });
      const secondBatchOrder = (
        await runtime.browsePurchaseOrders({
          query: "PO-LAYOUT-BATCH-002",
          limit: 10,
        })
      ).find((row) => row.purchaseOrderNo === "PO-LAYOUT-BATCH-002");
      const secondBatchLine = secondBatchOrder?.lines[0];

      if (!secondBatchOrder || !secondBatchLine) {
        throw new Error("Second layout batch purchase order was unavailable.");
      }

      await runtime.receivePurchaseOrder({
        purchaseOrderId: secondBatchOrder.purchaseOrderId,
        lines: [
          {
            purchaseOrderLineId: secondBatchLine.purchaseOrderLineId,
            quantity: 6,
            batchNo: "BATCH-LAYOUT-002",
            manufacturedAt: "2026-07-15",
            expiryDate: new Date(Date.now() + 40 * 86_400_000)
              .toISOString()
              .slice(0, 10),
          },
        ],
      });
      const serializedOrder = (
        await runtime.browsePurchaseOrders({
          query: "PO-LAYOUT-SERIAL",
          limit: 10,
        })
      ).find((row) => row.purchaseOrderNo === "PO-LAYOUT-SERIAL");
      const serializedLine = serializedOrder?.lines[0];

      if (!serializedOrder || !serializedLine) {
        throw new Error("Serialized layout purchase order was unavailable.");
      }

      await runtime.receivePurchaseOrder({
        purchaseOrderId: serializedOrder.purchaseOrderId,
        lines: [
          {
            purchaseOrderLineId: serializedLine.purchaseOrderLineId,
            quantity: 3,
            serialNumbers: [
              "LAYOUT-SERIAL-001",
              "LAYOUT-SERIAL-002",
              "LAYOUT-SERIAL-003",
            ],
          },
        ],
      });
      await runtime.saveStandaloneSettings({
        showCriticalStocksOnStartup: true,
        showExpiringBatchesOnStartup: true,
        expiryAlertLeadDays: 45,
        expiryCriticalDays: 14,
        loginBackgroundImageUrl: nextLoginBackgroundImageUrl,
      });
    }, loginBackgroundImageUrl);

    await resizeDesktopWindow(1440, 900);
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(page.locator(".rms-login-card")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: "Change password", exact: true }),
    ).toHaveCount(0);
    const loginBackground = page.locator(".rms-login-background-image");
    await expect(loginBackground).toBeVisible();
    await expect
      .poll(() =>
        loginBackground.evaluate((image: HTMLImageElement) => ({
          complete: image.complete,
          decoded: image.naturalWidth > 0,
          sourceLength: image.currentSrc.length,
        })),
      )
      .toEqual({
        complete: true,
        decoded: true,
        sourceLength: loginBackgroundImageUrl.length,
      });
    await page
      .getByRole("button", { name: "Configure terminal", exact: true })
      .click();
    const desktopSetupDialog = page.getByRole("dialog");
    await expect(desktopSetupDialog.getByText("Support log file")).toBeVisible();
    await expect(desktopSetupDialog).toContainText("main.log");
    await desktopSetupDialog
      .getByRole("button", { name: "Close", exact: true })
      .click();
    const reloginId = page.getByPlaceholder("Enter your username");
    const reloginPassword = page.getByPlaceholder("Enter your password");
    await reloginId.fill(loginId);
    await reloginPassword.fill(password);
    await expect(reloginId).toHaveValue(loginId);
    await expect(reloginPassword).toHaveValue(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    const inventoryAlert = page.locator(".rms-critical-stock-dialog");
    await expect(inventoryAlert).toBeVisible({ timeout: 30_000 });
    const expiringTab = inventoryAlert.getByRole("tab", {
      name: /Expiring batches/,
    });
    const lowStockTab = inventoryAlert.getByRole("tab", { name: /Low stock/ });
    await expect(expiringTab).toBeVisible();
    await expect(lowStockTab).toBeVisible();
    const alertGeometry = await inventoryAlert.evaluate((element) => {
      const tabs = [...element.querySelectorAll<HTMLElement>("[role='tab']")];
      const grid = element.querySelector<HTMLElement>(
        ".rms-inventory-alert-grid",
      );

      if (tabs.length !== 2 || !grid) {
        throw new Error("Inventory startup alert layout was incomplete.");
      }

      return {
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
        tabWidths: tabs.map((tab) => tab.getBoundingClientRect().width),
        tabHeights: tabs.map((tab) => tab.getBoundingClientRect().height),
        gridHeight: grid.getBoundingClientRect().height,
        gridClientWidth: grid.clientWidth,
        gridScrollWidth: grid.scrollWidth,
      };
    });
    expect(alertGeometry.width).toBeGreaterThan(1150);
    expect(alertGeometry.height).toBeGreaterThan(740);
    expect(Math.min(...alertGeometry.tabWidths)).toBeGreaterThan(500);
    expect(Math.min(...alertGeometry.tabHeights)).toBeGreaterThanOrEqual(46);
    expect(alertGeometry.gridHeight).toBeGreaterThan(500);
    expect(alertGeometry.gridScrollWidth).toBeLessThanOrEqual(
      alertGeometry.gridClientWidth + 1,
    );
    const expiringTable = inventoryAlert.getByRole("table", {
      name: "Expiring batches",
      exact: true,
    });
    await expect(expiringTable).toBeVisible();
    await expect(
      expiringTable.getByRole("columnheader", { name: "Batch", exact: true }),
    ).toBeVisible();
    await expect(
      expiringTable
        .getByRole("row")
        .filter({ hasText: "BATCH-LAYOUT-001" })
        .locator(".rms-inventory-alert-status.is-critical"),
    ).toBeVisible();
    await expect(
      expiringTable.getByRole("columnheader", {
        name: "Days remaining",
        exact: true,
      }),
    ).toBeVisible();
    await expect(inventoryAlert.getByText("BATCH-LAYOUT-001")).toBeVisible();
    await page.evaluate(() => {
      const exportWindow = window as typeof window & {
        __rmsCapturedExcelDownloads?: Array<{
          fileName: string;
          signature: string;
        }>;
      };
      const originalClick = HTMLAnchorElement.prototype.click;
      exportWindow.__rmsCapturedExcelDownloads = [];
      HTMLAnchorElement.prototype.click = function captureExcelDownload() {
        if (this.download.toLowerCase().endsWith(".xlsx")) {
          const fileName = this.download;
          void fetch(this.href)
            .then((response) => response.arrayBuffer())
            .then((content) => {
              const bytes = new Uint8Array(content);
              exportWindow.__rmsCapturedExcelDownloads?.push({
                fileName,
                signature: String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0),
              });
            });
          return;
        }

        return originalClick.call(this);
      };
    });
    await inventoryAlert
      .getByRole("button", { name: "Export Excel", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        (
          window as typeof window & {
            __rmsCapturedExcelDownloads?: unknown[];
          }
        ).__rmsCapturedExcelDownloads?.length === 1,
    );
    const expiringDownload = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __rmsCapturedExcelDownloads?: Array<{
              fileName: string;
              signature: string;
            }>;
          }
        ).__rmsCapturedExcelDownloads?.[0] ?? null,
    );
    expect(expiringDownload?.fileName).toMatch(
      /^flash-rms-expiring-batches-\d{4}-\d{2}-\d{2}\.xlsx$/,
    );
    expect(expiringDownload?.signature).toBe("PK");
    await page.screenshot({
      path: path.join(
        evidenceRoot,
        "standalone-expiring-batch-login-alert.png",
      ),
      fullPage: false,
    });
    await lowStockTab.click();
    const lowStockTable = inventoryAlert.getByRole("table", {
      name: "Low stock",
      exact: true,
    });
    await expect(lowStockTable).toBeVisible();
    await expect(
      lowStockTable.getByRole("columnheader", {
        name: "Alert floor",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      lowStockTable.getByRole("columnheader", {
        name: "Shortage",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      inventoryAlert.getByText("Layout Certification Product 001"),
    ).toBeVisible();
    await inventoryAlert
      .getByRole("button", { name: "Export Excel", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        (
          window as typeof window & {
            __rmsCapturedExcelDownloads?: unknown[];
          }
        ).__rmsCapturedExcelDownloads?.length === 2,
    );
    const lowStockDownload = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __rmsCapturedExcelDownloads?: Array<{
              fileName: string;
              signature: string;
            }>;
          }
        ).__rmsCapturedExcelDownloads?.[1] ?? null,
    );
    expect(lowStockDownload?.fileName).toMatch(
      /^flash-rms-low-stock-\d{4}-\d{2}-\d{2}\.xlsx$/,
    );
    expect(lowStockDownload?.signature).toBe("PK");
    await page.screenshot({
      path: path.join(evidenceRoot, "standalone-inventory-login-alert.png"),
      fullPage: false,
    });
    await inventoryAlert
      .getByRole("button", { name: "Dismiss", exact: true })
      .click();

    await navigation.getByRole("button", { name: "POS", exact: true }).click();
    const openShiftButton = page.getByRole("button", {
      name: "Open shift",
      exact: true,
    });

    if (await openShiftButton.isVisible().catch(() => false)) {
      await page.getByLabel("Opening float", { exact: true }).fill("100");
      await openShiftButton.click();
      await expect(openShiftButton).toHaveCount(0, { timeout: 30_000 });
      const rendererUrl = page.url();
      await app.evaluate(({ BrowserWindow }, mainWindowUrl) => {
        for (const candidate of BrowserWindow.getAllWindows()) {
          if (candidate.webContents.getURL() !== mainWindowUrl) {
            candidate.close();
          }
        }
      }, rendererUrl);
    }

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
          dockTop: dockRect.top,
          panelMidpoint: panelRect.top + panelRect.height / 2,
        };
      },
    );
    expect(emptyCheckoutGeometry.bottomGap).toBeGreaterThanOrEqual(0);
    expect(emptyCheckoutGeometry.bottomGap).toBeLessThanOrEqual(12);
    expect(emptyCheckoutGeometry.cartDockGap).toBeGreaterThanOrEqual(-1);
    expect(emptyCheckoutGeometry.cartHeight).toBeGreaterThan(180);
    expect(emptyCheckoutGeometry.dockTop).toBeGreaterThan(
      emptyCheckoutGeometry.panelMidpoint,
    );
    await expect(
      page.locator(".rms-pos-cart .rms-loyalty-strip"),
    ).toHaveCount(0);
    await expect(
      page.getByText(/No active promotion has synced to this store/i),
    ).toHaveCount(0);
    await expect(
      page.getByText(/has not enabled loyalty redemption yet/i),
    ).toHaveCount(0);
    await page.screenshot({
      path: path.join(evidenceRoot, "standalone-pos-empty-checkout-dock.png"),
      fullPage: false,
    });

    const scanInput = page.getByPlaceholder(
      "Scan barcode or type product code",
    );
    await scanInput.fill("LAYOUT-SERIAL");
    await page
      .locator(".rms-suggestion-row")
      .filter({ hasText: "Layout Serialized Phone" })
      .click();
    const serialDialog = page.locator(".rms-item-dialog.is-serialized");
    await expect(serialDialog).toBeVisible();
    const serialDialogGeometry = await serialDialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const serialGrid = element.querySelector<HTMLElement>(".rms-serial-grid");

      return {
        width: rect.width,
        height: rect.height,
        serialGridHeight: serialGrid?.getBoundingClientRect().height ?? 0,
      };
    });
    expect(serialDialogGeometry.width).toBeLessThanOrEqual(780);
    expect(serialDialogGeometry.height).toBeLessThan(760);
    expect(serialDialogGeometry.serialGridHeight).toBeLessThanOrEqual(192);
    await page.screenshot({
      path: path.join(evidenceRoot, "standalone-compact-serial-dialog.png"),
      fullPage: false,
    });
    await serialDialog
      .getByRole("button", { name: "Cancel", exact: true })
      .click();

    await scanInput.fill("LAYOUT-EXPIRY");
    await page
      .locator(".rms-suggestion-row")
      .filter({ hasText: "Layout Expiry Controlled Product" })
      .click();
    const batchDialog = page.locator(".rms-item-dialog.is-batch-selection");
    await expect(batchDialog).toBeVisible();
    await expect(batchDialog.getByText("Automatic FEFO", { exact: true })).toBeVisible();
    await expect(batchDialog.getByText("BATCH-LAYOUT-001", { exact: true })).toBeVisible();
    await expect(batchDialog.getByText("BATCH-LAYOUT-002", { exact: true })).toBeVisible();
    const secondBatchChoice = batchDialog
      .locator(".rms-batch-choice")
      .filter({ hasText: "BATCH-LAYOUT-002" });
    await secondBatchChoice.getByRole("radio").check();
    await expect(secondBatchChoice.getByRole("radio")).toBeChecked();
    await page.screenshot({
      path: path.join(evidenceRoot, "standalone-expiry-batch-picker.png"),
      fullPage: false,
    });
    await batchDialog
      .getByRole("button", { name: "Add item", exact: true })
      .click();
    const expiryCartRow = page
      .locator(".rms-cart-table .rms-table-row")
      .filter({ hasText: "Layout Expiry Controlled Product" });
    await expect(expiryCartRow).toContainText("Batch BATCH-LAYOUT-002");

    for (let index = 1; index <= 7; index += 1) {
      const suffix = String(index).padStart(3, "0");
      await scanInput.fill(`LAYOUT-${suffix}`);
      await scanInput.press("Enter");
      await expect(
        page
          .locator(".rms-cart-table .rms-table-row")
          .filter({
            has: page.getByText(`Layout Certification Product ${suffix}`, {
              exact: true,
            }),
          }),
      ).toBeVisible();
    }

    const cartRows = page.locator(".rms-cart-table .rms-table-row");
    await expect(cartRows).toHaveCount(8);
    const cartGeometry = await page.locator(".rms-cart-table").evaluate(
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
          clientHeight: table.clientHeight,
          scrollHeight: table.scrollHeight,
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
    expect(cartGeometry.scrollWidth).toBeLessThanOrEqual(
      cartGeometry.clientWidth + 1,
    );
    expect(cartGeometry.scrollHeight).toBeGreaterThan(cartGeometry.clientHeight);
    expect(Math.min(...cartGeometry.rowHeights)).toBeGreaterThanOrEqual(62);
    expect(Math.max(...cartGeometry.rowHeights)).toBeLessThanOrEqual(68);
    expect(new Set(cartGeometry.rowBackgrounds).size).toBeGreaterThan(1);
    expect(
      cartGeometry.rowBackgrounds.every(
        (color, index, colors) => index === 0 || color !== colors[index - 1],
      ),
    ).toBe(true);
    expect(Math.min(...cartGeometry.rowGaps)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...cartGeometry.rowContentOverflows)).toBeLessThanOrEqual(1);
    expect(cartGeometry.dockBottomGap).toBeLessThanOrEqual(12);
    expect(cartGeometry.cartDockGap).toBeGreaterThanOrEqual(-1);
    await page.screenshot({
      path: path.join(evidenceRoot, "standalone-pos-multi-item-cart.png"),
      fullPage: false,
    });
    const salePaymentRemove = page
      .locator(".rms-payment-row .rms-payment-remove-button")
      .first();
    await expect(salePaymentRemove).toHaveAttribute("title", "Remove payment");
    await expect(salePaymentRemove.locator("svg")).toBeVisible();
    await expect(salePaymentRemove).toHaveText("");
    await page
      .getByRole("button", { name: "Clear screen", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Sales order mode", exact: true })
      .click();
    const orderPaymentRemove = page
      .locator(".rms-payment-row .rms-payment-remove-button")
      .first();
    await expect(orderPaymentRemove).toHaveAttribute("title", "Remove payment");
    await expect(orderPaymentRemove.locator("svg")).toBeVisible();
    await expect(orderPaymentRemove).toHaveText("");

    await navigation
      .getByRole("button", { name: "Master", exact: true })
      .click();
    await navigation
      .getByRole("button", { name: "Shop", exact: true })
      .click();
    await expect(
      page.getByText("Login page background", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Upload background", { exact: true }),
    ).toBeVisible();
    await navigation
      .getByRole("button", { name: "Products", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Products", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".rms-standalone-grid-footer")).toContainText(
      "1-25 of",
    );

    await resizeDesktopWindow(1440, 900);
    await expect(page.locator(".rms-master-record-grid")).toBeVisible();
    const wideGeometry = await page.evaluate(() => {
      const workspace = document.querySelector(
        ".rms-standalone-setup-workspace",
      );
      const grid = document.querySelector(".rms-standalone-grid");
      const table = document.querySelector(".rms-master-record-grid");

      if (!workspace || !grid || !table) {
        throw new Error("Standalone product grid was not rendered.");
      }

      const workspaceRect = workspace.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      return {
        workspaceHeight: workspaceRect.height,
        gridHeight: gridRect.height,
        tableHeight: tableRect.height,
      };
    });
    expect(wideGeometry.gridHeight).toBeGreaterThan(
      wideGeometry.workspaceHeight * 0.78,
    );
    expect(wideGeometry.tableHeight).toBeGreaterThan(440);
    await page.screenshot({
      path: path.join(evidenceRoot, "standalone-products-1440x900.png"),
      fullPage: false,
    });

    await resizeDesktopWindow(1000, 720);
    await expect(page.locator(".rms-master-record-grid")).toBeVisible();
    const compactGeometry = await page.evaluate(() => {
      const workspace = document.querySelector(
        ".rms-standalone-setup-workspace",
      );
      const table = document.querySelector(".rms-master-record-grid");

      if (!workspace || !table) {
        throw new Error("Compact standalone product grid was not rendered.");
      }

      return {
        workspaceHeight: workspace.getBoundingClientRect().height,
        tableHeight: table.getBoundingClientRect().height,
        bodyWidth: document.body.getBoundingClientRect().width,
        viewportWidth: window.innerWidth,
      };
    });
    expect(compactGeometry.tableHeight).toBeGreaterThan(280);
    expect(compactGeometry.bodyWidth).toBeLessThanOrEqual(
      compactGeometry.viewportWidth,
    );
    await page.screenshot({
      path: path.join(evidenceRoot, "standalone-products-1000x720.png"),
      fullPage: false,
    });

    await page
      .getByRole("button", { name: "Add product", exact: true })
      .click();
    const productForm = page.locator(".rms-entry-dialog-form.is-open");
    await expect(productForm).toBeVisible();
    const productFormBounds = await productForm.boundingBox();
    expect(productFormBounds).not.toBeNull();
    expect(productFormBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(
      (productFormBounds?.x ?? 0) + (productFormBounds?.width ?? 0),
    ).toBeLessThanOrEqual(1000);
    expect(
      (productFormBounds?.y ?? 0) + (productFormBounds?.height ?? 0),
    ).toBeLessThanOrEqual(720);
    await page.screenshot({
      path: path.join(evidenceRoot, "standalone-product-form-1000x720.png"),
      fullPage: false,
    });
    await page.getByRole("button", { name: "Close form", exact: true }).click();

    await navigation
      .getByRole("button", { name: "Departments", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Departments",
        exact: true,
      }),
    ).toBeVisible();
    const departmentTableHeight = await page
      .locator(".rms-master-record-grid")
      .evaluate((element) => element.getBoundingClientRect().height);
    expect(departmentTableHeight).toBeGreaterThan(300);
    await page
      .getByRole("button", { name: "Add department", exact: true })
      .click();
    const departmentForm = page.locator(".rms-entry-dialog-department.is-open");
    await expect(departmentForm).toBeVisible();
    const departmentDialogStyle = await departmentForm.evaluate((element) => ({
      columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
      heading: getComputedStyle(element, "::before").content,
    }));
    expect(departmentDialogStyle.columns).toBe(2);
    expect(departmentDialogStyle.heading).toContain("Department");
    const departmentFormBounds = await departmentForm.boundingBox();
    const departmentSaveBounds = await departmentForm
      .getByRole("button", { name: "Save department", exact: true })
      .boundingBox();
    expect(departmentFormBounds).not.toBeNull();
    expect(departmentSaveBounds).not.toBeNull();
    expect(departmentSaveBounds?.x ?? 0).toBeGreaterThan(
      (departmentFormBounds?.x ?? 0) + (departmentFormBounds?.width ?? 0) / 2,
    );
    await page.screenshot({
      path: path.join(evidenceRoot, "standalone-department-form-1000x720.png"),
      fullPage: false,
    });
    await page.getByRole("button", { name: "Close form", exact: true }).click();

    await navigation
      .getByRole("button", { name: "Security", exact: true })
      .click();
    await navigation
      .getByRole("button", { name: "Users", exact: true })
      .click();
    await page.getByRole("button", { name: "Add user", exact: true }).click();
    const userForm = page.locator(".rms-security-user-form.is-open");
    await expect(userForm).toBeVisible();
    await expect(
      userForm.getByRole("heading", { name: "New user", exact: true }),
    ).toBeVisible();
    const newUserPassword = userForm.getByLabel("Password", { exact: true });
    const newUserPasswordConfirmation = userForm.getByLabel(
      "Confirm password",
      { exact: true },
    );
    await expect(newUserPassword).toBeVisible();
    await expect(newUserPasswordConfirmation).toBeVisible();
    await expect(
      userForm.getByText("Supervisor access", { exact: true }),
    ).toBeVisible();
    await expect(
      userForm.getByText(/Allows local setup administration/),
    ).toBeVisible();
    await userForm
      .getByLabel("Login ID", { exact: true })
      .fill("layout.cashier");
    await userForm
      .getByLabel("Display name", { exact: true })
      .fill("Layout Cashier");
    await newUserPassword.fill("LayoutUser123!");
    await newUserPasswordConfirmation.fill("Different123!");
    await expect(
      userForm.getByText("Password confirmation does not match.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      userForm.getByRole("button", { name: "Save user", exact: true }),
    ).toBeDisabled();
    await newUserPasswordConfirmation.fill("LayoutUser123!");
    await expect(
      userForm.getByRole("button", { name: "Save user", exact: true }),
    ).toBeEnabled();
    const supervisorAccess = userForm.getByRole("checkbox", {
      name: "Supervisor access",
      exact: true,
    });
    await supervisorAccess.check();
    await expect(supervisorAccess).toBeChecked();
    const userFormColumns = await userForm.evaluate(
      (element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").length,
    );
    expect(userFormColumns).toBe(2);
    const userFormBounds = await userForm.boundingBox();
    expect(userFormBounds?.width ?? 0).toBeGreaterThan(900);
    expect(userFormBounds?.height ?? 0).toBeGreaterThan(400);
    await page.screenshot({
      path: path.join(evidenceRoot, "standalone-user-form-1000x720.png"),
      fullPage: false,
    });
    await userForm
      .getByRole("button", { name: "Save user", exact: true })
      .click();
    await expect(userForm).toHaveCount(0);
    await expect(page.getByText("Layout Cashier", { exact: true })).toBeVisible(
      {
        timeout: 30_000,
      },
    );
    const savedSupervisor = await page.evaluate(async () => {
      const snapshot = await window.desktopRuntime?.getSyncSnapshot();
      const user = snapshot?.storeUsers.find(
        (candidate) => candidate.loginId.toLowerCase() === "layout.cashier",
      );

      return user
        ? {
            supervisorEligible: user.supervisorEligible,
            permissionCodes: user.permissionCodes,
          }
        : null;
    });
    expect(savedSupervisor?.supervisorEligible).toBe(true);
    expect(savedSupervisor?.permissionCodes).toContain("pos.override.discount");
    expect(savedSupervisor?.permissionCodes).toContain("inventory.adjust");
    await page
      .getByRole("button", { name: "Edit", exact: true })
      .first()
      .click();
    await expect(
      userForm.getByRole("heading", { name: "Edit user", exact: true }),
    ).toBeVisible();
    await expect(
      userForm.getByLabel("New password", { exact: true }),
    ).toHaveValue("");
    await expect(
      userForm.getByLabel("Confirm password", { exact: true }),
    ).toHaveValue("");
    await expect(
      userForm.getByText(
        "Leave both password fields blank to keep the current password.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close security form", exact: true })
      .click();
    await navigation
      .getByRole("button", { name: "Roles & Privileges", exact: true })
      .click();
    await page.getByRole("button", { name: "Add role", exact: true }).click();
    const roleForm = page.locator(".rms-security-role-form.is-open");
    await expect(roleForm).toBeVisible();
    await expect(
      roleForm.getByRole("heading", { name: "New role", exact: true }),
    ).toBeVisible();
    await expect(
      roleForm.getByText("Permissions", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(evidenceRoot, "standalone-role-form-1000x720.png"),
      fullPage: false,
    });
    await page
      .getByRole("button", { name: "Close security form", exact: true })
      .click();

    await navigation
      .getByRole("button", { name: "Inventory", exact: true })
      .click();
    await expect(
      page.getByRole("tab", { name: "Inventory browser", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Batch register", exact: true }),
    ).toBeVisible();
    await page
      .getByPlaceholder("Product, barcode, category")
      .fill("LAYOUT-EXPIRY");
    await page.locator(".rms-stock-workspace select").selectOption("");
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page
      .getByRole("tab", { name: "Batch register", exact: true })
      .click();
    await expect(page.getByText("BATCH-LAYOUT-001")).toBeVisible();
    await page.screenshot({
      path: path.join(evidenceRoot, "standalone-stock-batch-register.png"),
      fullPage: false,
    });

    await navigation
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await expect(
      page.getByText("Local settings", { exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Product sizes", exact: true }).click();
    await page.getByPlaceholder("Example: XL").fill("XXL");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page
      .getByRole("button", { name: "Save settings", exact: true })
      .click();
    await expect(
      page.locator(".rms-settings-token").filter({ hasText: "XXL" }),
    ).toBeVisible();
    await page
      .getByRole("tab", { name: "Express charges", exact: true })
      .click();
    await page.getByPlaceholder("Example: 10").fill("12.5");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page
      .getByRole("button", { name: "Save settings", exact: true })
      .click();
    await expect(
      page.locator(".rms-settings-token").filter({ hasText: "12.50%" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Options", exact: true }).click();
    await expect(page.getByText("Show low stocks on login")).toBeVisible();
    const expiryStartupOption = page
      .locator(".rms-settings-option-toggle")
      .filter({ hasText: "Show expiring batches on login" })
      .getByRole("checkbox");
    await expect(expiryStartupOption).toBeChecked();
    const expiryAlertLeadDays = page.getByLabel("Expiry alert lead days", {
      exact: true,
    });
    const expiryCriticalDays = page.getByLabel("Critical expiry days", {
      exact: true,
    });
    await expect(expiryAlertLeadDays).toHaveValue("45");
    await expect(expiryCriticalDays).toHaveValue("14");
    await expiryAlertLeadDays.fill("60");
    await expiryCriticalDays.fill("21");
    await expiryStartupOption.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(evidenceRoot, "standalone-local-pos-settings.png"),
      fullPage: false,
    });
    await expiryStartupOption.uncheck();
    await page
      .getByRole("button", { name: "Save options", exact: true })
      .click();

    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(page.locator(".rms-login-card")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByPlaceholder("Enter your username").fill(loginId);
    await page.getByPlaceholder("Enter your password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    const lowStockOnlyAlert = page.locator(".rms-critical-stock-dialog");
    await expect(lowStockOnlyAlert).toBeVisible({ timeout: 30_000 });
    await expect(
      lowStockOnlyAlert.getByRole("tab", { name: "Expiring batches (0)" }),
    ).toBeVisible();
    await expect(lowStockOnlyAlert.getByText("BATCH-LAYOUT-001")).toHaveCount(
      0,
    );
    await lowStockOnlyAlert
      .getByRole("button", { name: "Dismiss", exact: true })
      .click();

    await navigation
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await page.getByRole("tab", { name: "Options", exact: true }).click();
    await expect(
      page
        .locator(".rms-settings-option-toggle")
        .filter({ hasText: "Show expiring batches on login" })
        .getByRole("checkbox"),
    ).not.toBeChecked();

    await navigation
      .getByRole("button", { name: "Inventory", exact: true })
      .click();
    await page.getByRole("tab", { name: "Receiving", exact: true }).click();
    await expect(
      page.getByRole("tab", { name: "Purchase orders", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Goods receipts", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Supplier returns", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(evidenceRoot, "standalone-receiving-tabs-1000x720.png"),
      fullPage: false,
    });

    await page
      .getByRole("tab", { name: "Goods receipts", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Goods receipts", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".rms-receiving-header-table")).toHaveCount(0);
    await page.screenshot({
      path: path.join(evidenceRoot, "standalone-goods-receipts-1000x720.png"),
      fullPage: false,
    });
    await page
      .getByRole("tab", { name: "Supplier returns", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Supplier returns", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(evidenceRoot, "standalone-supplier-returns-1000x720.png"),
      fullPage: false,
    });
    await page
      .getByRole("tab", { name: "Purchase orders", exact: true })
      .click();
    await resizeDesktopWindow(1220, 840);
    await page
      .getByRole("button", { name: "View PO-LAYOUT-001", exact: true })
      .click();
    const purchaseOrderDialog = page.locator(
      ".rms-document-dialog:has(.rms-receiving-line-list)",
    );
    await expect(purchaseOrderDialog).toBeVisible();
    await expect(purchaseOrderDialog.getByText("Batch number")).toBeVisible();
    const purchaseDialogGeometry = await purchaseOrderDialog.evaluate(
      (element) => {
        const line = element.querySelector<HTMLElement>(
          ".rms-receiving-line-card",
        );
        const lineList = element.querySelector<HTMLElement>(
          ".rms-receiving-line-list",
        );
        const heading = element.querySelector<HTMLElement>(
          ".rms-receiving-line-heading",
        );
        const metrics = element.querySelector<HTMLElement>(
          ".rms-receiving-line-metrics",
        );
        const receiveEntry = element.querySelector<HTMLElement>(
          ".rms-receive-entry-grid",
        );
        const receiveButton =
          receiveEntry?.querySelector<HTMLButtonElement>("button");

        if (
          !line ||
          !lineList ||
          !heading ||
          !metrics ||
          !receiveEntry ||
          !receiveButton
        ) {
          throw new Error("Purchase-order receipt controls were not rendered.");
        }

        const lineRect = line.getBoundingClientRect();
        const receiveEntryRect = receiveEntry.getBoundingClientRect();
        const receiveButtonRect = receiveButton.getBoundingClientRect();
        return {
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight,
          lineClientWidth: line.clientWidth,
          lineScrollWidth: line.scrollWidth,
          listClientWidth: lineList.clientWidth,
          listScrollWidth: lineList.scrollWidth,
          receiveEntryTop: receiveEntryRect.top,
          summaryBottom: Math.max(
            heading.getBoundingClientRect().bottom,
            metrics.getBoundingClientRect().bottom,
          ),
          receiveButtonWidth: receiveButtonRect.width,
          receiveButtonRight: receiveButtonRect.right,
          lineRight: lineRect.right,
        };
      },
    );
    expect(purchaseDialogGeometry.clientWidth).toBeGreaterThan(900);
    expect(purchaseDialogGeometry.clientHeight).toBeGreaterThan(620);
    expect(purchaseDialogGeometry.scrollWidth).toBeLessThanOrEqual(
      purchaseDialogGeometry.clientWidth + 1,
    );
    expect(purchaseDialogGeometry.lineScrollWidth).toBeLessThanOrEqual(
      purchaseDialogGeometry.lineClientWidth + 1,
    );
    expect(purchaseDialogGeometry.listScrollWidth).toBeLessThanOrEqual(
      purchaseDialogGeometry.listClientWidth + 1,
    );
    expect(purchaseDialogGeometry.receiveEntryTop).toBeGreaterThan(
      purchaseDialogGeometry.summaryBottom,
    );
    expect(purchaseDialogGeometry.receiveButtonWidth).toBeGreaterThanOrEqual(
      140,
    );
    expect(purchaseDialogGeometry.receiveButtonRight).toBeLessThanOrEqual(
      purchaseDialogGeometry.lineRight,
    );
    await page.screenshot({
      path: path.join(
        evidenceRoot,
        "standalone-po-receive-dialog-1220x840.png",
      ),
      fullPage: false,
    });

    await resizeDesktopWindow(1000, 720);
    await expect(purchaseOrderDialog).toBeVisible();
    const compactPurchaseDialogGeometry = await purchaseOrderDialog.evaluate(
      (element) => {
        const line = element.querySelector<HTMLElement>(
          ".rms-receiving-line-card",
        );
        const lineList = element.querySelector<HTMLElement>(
          ".rms-receiving-line-list",
        );
        const receiveButton = element.querySelector<HTMLButtonElement>(
          ".rms-receive-entry-grid button",
        );

        if (!line || !lineList || !receiveButton) {
          throw new Error(
            "Compact purchase-order receipt controls were not rendered.",
          );
        }

        return {
          dialogClientWidth: element.clientWidth,
          dialogScrollWidth: element.scrollWidth,
          lineClientWidth: line.clientWidth,
          lineScrollWidth: line.scrollWidth,
          listClientWidth: lineList.clientWidth,
          listScrollWidth: lineList.scrollWidth,
          receiveButtonWidth: receiveButton.getBoundingClientRect().width,
        };
      },
    );
    expect(compactPurchaseDialogGeometry.dialogScrollWidth).toBeLessThanOrEqual(
      compactPurchaseDialogGeometry.dialogClientWidth + 1,
    );
    expect(compactPurchaseDialogGeometry.lineScrollWidth).toBeLessThanOrEqual(
      compactPurchaseDialogGeometry.lineClientWidth + 1,
    );
    expect(compactPurchaseDialogGeometry.listScrollWidth).toBeLessThanOrEqual(
      compactPurchaseDialogGeometry.listClientWidth + 1,
    );
    expect(
      compactPurchaseDialogGeometry.receiveButtonWidth,
    ).toBeGreaterThanOrEqual(140);
    await page.screenshot({
      path: path.join(
        evidenceRoot,
        "standalone-po-receive-dialog-1000x720.png",
      ),
      fullPage: false,
    });
  } finally {
    await app.close().catch(() => undefined);
  }
});
