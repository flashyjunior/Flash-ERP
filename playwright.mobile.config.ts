import { defineConfig, devices } from "@playwright/test";

// Exercises the actual Expo screens/router/API/storage. HTTP responses are
// deterministic fixtures: these tests never contact or mutate production ERP.
export default defineConfig({
  testDir: "./tests/mobile",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report/mobile" }]],
  use: {
    ...devices["Pixel 7"],
    browserName: "chromium",
    baseURL: "http://127.0.0.1:8081",
    launchOptions: {
      executablePath: process.env.FLASH_ERP_E2E_BROWSER_EXECUTABLE_PATH || undefined,
    },
    // Traces are opt-in. With Expo's dev server, retaining a trace makes the
    // test that owns it stall until the 45s test timeout, because Playwright's
    // trace recorder never settles on the multi-megabyte Metro bundle response
    // (measured: ~3s per failing test without tracing, ~48s with it). A red gate
    // therefore used to take ~25 minutes and buried the real error under
    // "Test timeout exceeded" noise. Re-run with FLASH_ERP_MOBILE_TRACE=1 when
    // you need step-by-step evidence; the (slower) trace is then kept for
    // failing tests only.
    trace: process.env.FLASH_ERP_MOBILE_TRACE === "1" ? "retain-on-failure" : "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm --workspace @flash-erp/mobile run web -- --host lan --port 8081",
    url: "http://127.0.0.1:8081",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { EXPO_OFFLINE: "1", EXPO_NO_TELEMETRY: "1" },
  },
});
