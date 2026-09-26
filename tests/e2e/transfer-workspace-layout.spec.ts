import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const workspaceRoot = process.cwd();
const evidenceRoot = path.join(workspaceRoot, ".e2e", "evidence");
const packageName = JSON.parse(
  readFileSync(path.join(workspaceRoot, "package.json"), "utf8"),
) as { name?: string };
const isFlashErp = packageName.name?.includes("flash-erp") === true;

mkdirSync(evidenceRoot, { recursive: true });

function readStyles(relativePath: string) {
  return readFileSync(path.join(workspaceRoot, relativePath), "utf8").replace(
    /^@import[^\n]+\n/,
    "",
  );
}

function transferMarkup(surface: "web" | "desktop", activeTab: "header" | "details" = "header") {
  const actionHeadings = isFlashErp && surface === "web"
    ? "<span>View</span><span>Process</span><span>Feedback</span><span>Print</span>"
    : "<span>View</span><span>Receive</span><span>Print</span>";
  const actionCells = isFlashErp && surface === "web"
    ? "<button>V</button><button>P</button><button>F</button><button>R</button>"
    : "<button>V</button><button>R</button><button>P</button>";

  return `
    <main class="${surface === "web" ? "rms-online-desktop" : ""}">
      <section class="rms-panel rms-stock-request-panel">
        <div class="rms-stock-toolbar">
          <div class="rms-filter-row rms-document-filter">
            <input placeholder="Transfer, source, item, destination" />
            <select><option>All statuses</option></select>
          </div>
          <button class="rms-button is-primary">Create new</button>
        </div>
        <div class="rms-table rms-stock-request-table">
          <div class="rms-table-head">
            <span>Transfer</span><span>Source</span><span>Destination</span><span>Status</span>
            <span>Requested</span><span>Outstanding</span>${actionHeadings}
          </div>
          <div class="rms-table-row">
            <strong>TRF-LAYOUT-001</strong><span>North Shop</span><span>Main Shop</span>
            <span>REQUESTED</span><strong>12</strong><span>12</span>${actionCells}
          </div>
        </div>
      </section>
      <div class="rms-modal-backdrop">
        <section class="rms-dialog rms-wide-dialog rms-stock-request-dialog rms-transfer-entry-dialog">
          <div class="rms-panel-title rms-transfer-dialog-header">
            <div><span>Stock request</span><h2>New transfer</h2></div>
            <button class="rms-icon-button rms-dialog-close" aria-label="Close transfer dialog">X</button>
          </div>
          <div class="rms-transfer-mode-switch">
            <button class="is-active">Request stock</button><button>Direct transfer out</button>
          </div>
          <div class="rms-transfer-step-tabs">
            <button class="${activeTab === "header" ? "is-active" : ""}">Header</button><button class="${activeTab === "details" ? "is-active" : ""}">Items <span>0</span></button>
          </div>
          <div class="rms-transfer-dialog-body">
            ${activeTab === "header" ? `
              <div class="rms-form-grid rms-transfer-header-grid">
                <label><span>Source store</span><select><option>North Shop</option></select></label>
                <label><span>Source location</span><select><option>North Sales Floor</option></select></label>
                <label><span>Receive into</span><select><option>Main Sales Floor</option></select></label>
                <label><span>Required date</span><input type="date" value="2026-09-26" /></label>
                <label><span>Reference</span><input value="Customer order" /></label>
                <label class="rms-transfer-note-field"><span>Note</span><input value="Priority replenishment" /></label>
              </div>
            ` : `
              <div class="rms-transfer-detail-pane">
                <div class="rms-form-grid rms-transfer-line-entry ${isFlashErp ? "is-uom" : "is-simple"}">
                  <label class="rms-transfer-product-field">
                    <span>Product</span>
                    <input aria-label="Search transfer products" placeholder="Search name, code, or SKU" value="pixel" />
                    <select aria-label="Transfer product results"><option>Select matching item</option><option>Google Pixel 8 · PIXEL-8</option><option>Google Pixel 8 Pro · PIXEL-8-PRO</option></select>
                  </label>
                  ${isFlashErp ? "<label><span>Unit</span><select><option>Each (EA)</option></select></label>" : ""}
                  <label><span>Quantity</span><input type="number" value="1" /></label>
                  <button class="rms-button">Add line</button>
                </div>
                <div class="rms-table rms-stock-request-line-table"><p>Search and select a product to add the first line.</p></div>
              </div>
            `}
          </div>
          <div class="${surface === "web" ? "rms-dialog-actions rms-transfer-dialog-actions" : "rms-total-strip rms-transfer-summary-footer"}">
            ${surface === "web" ? "<button class=\"rms-button\">Cancel</button>" : "<div class=\"rms-stat\"><span>Line count</span><strong>0</strong></div><div class=\"rms-stat\"><span>Request qty</span><strong>0</strong></div><div class=\"rms-stat\"><span>Date required</span><strong>26/09/2026</strong></div>"}
            <button class="rms-button is-primary">Save request</button>
          </div>
        </section>
      </div>
    </main>
  `;
}

async function verifySurface(
  page: Page,
  surface: "web" | "desktop",
  cssPath: string,
  expectedTableColumns: number,
) {
  const css = readStyles(cssPath);

  await test.step(`${surface} desktop layout`, async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(`<style>${css}
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      .rms-online-desktop { width: 100vw; height: 100vh; grid-template-columns: minmax(0, 1fr); }
      .rms-stock-request-panel { min-width: 0; }
    </style>${transferMarkup(surface)}`);
    const measurements = await page.locator(".rms-stock-request-dialog").evaluate((dialog) => {
      const bounds = dialog.getBoundingClientRect();
      const header = dialog.querySelector(".rms-transfer-header-grid");
      const tableHead = document.querySelector(".rms-stock-request-table .rms-table-head");
      if (!header || !tableHead) throw new Error("Transfer layout fixture is incomplete.");
      return {
        width: bounds.width,
        height: bounds.height,
        headerColumns: getComputedStyle(header).gridTemplateColumns.split(" ").filter(Boolean).length,
        tableColumns: getComputedStyle(tableHead).gridTemplateColumns.split(" ").filter(Boolean).length,
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(measurements.width).toBeLessThanOrEqual(922);
    expect(measurements.height).toBeLessThan(800);
    expect(measurements.headerColumns).toBe(2);
    expect(measurements.tableColumns).toBe(expectedTableColumns);
    expect(measurements.pageOverflow).toBe(false);
    await page.screenshot({
      path: path.join(evidenceRoot, `transfer-dialog-${surface}-desktop.png`),
      fullPage: false,
    });
  });

  await test.step(`${surface} mobile layout`, async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(`<style>${css}
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      .rms-online-desktop { width: 100vw; height: 100vh; grid-template-columns: minmax(0, 1fr); }
      .rms-stock-request-panel { min-width: 0; }
    </style>${transferMarkup(surface)}`);
    const measurements = await page.locator(".rms-stock-request-dialog").evaluate((dialog) => {
      const bounds = dialog.getBoundingClientRect();
      const header = dialog.querySelector(".rms-transfer-header-grid");
      if (!header) throw new Error("Transfer header grid is missing.");
      return {
        width: bounds.width,
        height: bounds.height,
        headerColumns: getComputedStyle(header).gridTemplateColumns.split(" ").filter(Boolean).length,
        dialogOverflow: dialog.scrollWidth > dialog.clientWidth,
      };
    });
    expect(measurements.width).toBeLessThan(390);
    expect(measurements.height).toBeLessThanOrEqual(828);
    expect(measurements.headerColumns).toBe(1);
    expect(measurements.dialogOverflow).toBe(false);
    await page.screenshot({
      path: path.join(evidenceRoot, `transfer-dialog-${surface}-mobile.png`),
      fullPage: false,
    });
  });

  await test.step(`${surface} searchable product layout`, async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(`<style>${css}
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      .rms-online-desktop { width: 100vw; height: 100vh; grid-template-columns: minmax(0, 1fr); }
      .rms-stock-request-panel { min-width: 0; }
    </style>${transferMarkup(surface, "details")}`);
    const searchInput = page.getByLabel("Search transfer products");
    const resultSelect = page.getByLabel("Transfer product results");
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute("placeholder", /Search/);
    await expect(resultSelect.locator("option")).toHaveCount(3);
    await expect(page.locator(".rms-transfer-product-field")).toHaveCSS("display", "grid");
    await page.screenshot({
      path: path.join(evidenceRoot, `transfer-dialog-${surface}-product-search.png`),
      fullPage: false,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(`<style>${css}
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      .rms-online-desktop { width: 100vw; height: 100vh; grid-template-columns: minmax(0, 1fr); }
      .rms-stock-request-panel { min-width: 0; }
    </style>${transferMarkup(surface, "details")}`);
    const mobileMeasurements = await page.locator(".rms-stock-request-dialog").evaluate((dialog) => ({
      width: dialog.getBoundingClientRect().width,
      overflow: dialog.scrollWidth > dialog.clientWidth,
    }));
    expect(mobileMeasurements.width).toBeLessThan(390);
    expect(mobileMeasurements.overflow).toBe(false);
    await expect(page.getByLabel("Search transfer products")).toBeVisible();
    await page.screenshot({
      path: path.join(evidenceRoot, `transfer-dialog-${surface}-product-search-mobile.png`),
      fullPage: false,
    });
  });
}

test("transfer workspace remains compact and responsive", async ({ page }) => {
  await verifySurface(
    page,
    "web",
    "apps/enterprise-web/src/app/globals.css",
    isFlashErp ? 10 : 9,
  );
  await verifySurface(
    page,
    "desktop",
    "apps/store-desktop/src/renderer/modern-styles.css",
    9,
  );
});
