import { defineConfig, devices } from "@playwright/test";

const browserExecutablePath =
  process.env.FLASH_ERP_E2E_BROWSER_EXECUTABLE_PATH?.trim() || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  workers: 1,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "enterprise-browser",
      testMatch: /(enterprise-auth|online-store-parity)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: browserExecutablePath
          ? { executablePath: browserExecutablePath }
          : undefined,
        baseURL:
          process.env.FLASH_ERP_E2E_ENTERPRISE_BASE_URL ??
          "http://127.0.0.1:3000",
      },
    },
    {
      name: "store-electron",
      testMatch: /store-desktop(?:-layout)?\.spec\.ts/,
    },
  ],
});
