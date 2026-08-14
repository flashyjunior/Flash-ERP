import { expect, test } from "@playwright/test";

const loginId = process.env.FLASH_ERP_E2E_ENTERPRISE_LOGIN;
const password = process.env.FLASH_ERP_E2E_ENTERPRISE_PASSWORD;

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.getByPlaceholder("Enter your username or email").fill(loginId ?? "");
  await page.getByPlaceholder("Enter your password").fill(password ?? "");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in(?:\?|$)/);
}

test.describe("enterprise capacity hydration", () => {
  test.describe.configure({ timeout: 240_000 });
  test.skip(!loginId || !password, "Capacity hydration requires an explicit temporary test user.");

  test("heavy authenticated workspaces hydrate without browser errors", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await signIn(page);

    const workspaces = [
      {
        path: "/",
        heading: "Dashboard",
        ready: () => page.getByRole("heading", { name: "Recent all-shop revenue", exact: true })
      },
      {
        path: "/catalog",
        heading: "Catalog",
        ready: () => page.getByPlaceholder("Search products by code, SKU, or name")
      },
      {
        path: "/inventory/products",
        heading: "Products",
        ready: () => page.getByPlaceholder("Search stocked products by code, SKU, name, or status")
      },
      {
        path: "/purchases/purchase-orders",
        heading: "Purchase Orders",
        ready: () => page.getByPlaceholder("Search PO, supplier, receiving shop, status, or reference")
      },
      {
        path: "/finance",
        heading: "Finance",
        ready: () => page.getByPlaceholder("Search journal, source, reference, description, or status")
      },
      {
        path: "/reports",
        heading: "Reports",
        ready: () => page.getByRole("button", { name: /Executive management summary/ })
      }
    ];

    for (const workspace of workspaces) {
      await page.goto(workspace.path);
      await expect(page.getByRole("heading", { name: workspace.heading, exact: true })).toBeVisible();
      await expect(workspace.ready()).toBeVisible();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    }

    await page.getByText("Executive management summary", { exact: true }).click();
    await expect(page).toHaveURL(/\/reports\?report=managementSummary/);
    await expect(
      page.getByRole("heading", { name: "Executive management summary", exact: true })
    ).toBeVisible();
    await expect(page.getByPlaceholder("Search metrics, groups, status, or basis")).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("finance lists use URL-backed server pagination and search", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await signIn(page);

    await page.goto("/finance?jp=2&jps=25");
    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();
    await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
    await expect(page.getByText(/25 of \d+ visible/)).toBeVisible();

    const journalSearch = page.getByPlaceholder(
      "Search journal, source, reference, description, or status"
    );
    await journalSearch.fill("POS_SALE");
    await expect(page).toHaveURL(/(?:\?|&)jq=POS_SALE(?:&|$)/);
    await expect(page).not.toHaveURL(/(?:\?|&)jp=2(?:&|$)/);
    await page.goBack();
    await expect(page).toHaveURL(/(?:\?|&)jp=2(?:&|$)/);

    await page.goto("/finance?lp=2&lps=25");
    await page.getByRole("tab", { name: "Lines", exact: true }).click();
    await expect(page.getByPlaceholder("Search journal, account, shop, or memo")).toBeVisible();
    await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();

    await page.getByRole("tab", { name: /Expenses/ }).click();
    const expenseSearch = page.getByPlaceholder(
      "Search expense, category, shop, supplier, reference, or status"
    );
    await expenseSearch.fill("POSTED");
    await expect(page).toHaveURL(/(?:\?|&)eq=POSTED(?:&|$)/);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("catalog, inventory, and purchase orders use URL-backed server search", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await signIn(page);

    const workspaces = [
      {
        path: "/catalog",
        placeholder: "Search products by code, SKU, or name"
      },
      {
        path: "/inventory/products",
        placeholder: "Search stocked products by code, SKU, name, or status"
      },
      {
        path: "/purchases/purchase-orders",
        placeholder: "Search PO, supplier, receiving shop, status, or reference"
      }
    ];

    for (const workspace of workspaces) {
      await page.goto(workspace.path);
      const search = page.getByPlaceholder(workspace.placeholder);
      await expect(search).toBeVisible();
      await search.fill("ACTIVE");
      await expect(page).toHaveURL(/(?:\?|&)q=ACTIVE(?:&|$)/);
      await expect(page.getByText(/\d+ of \d+ visible/)).toBeVisible();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    }

    expect(pageErrors).toEqual([]);
  });
});
