import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

function requireFile(relativePath: string) {
  const absolutePath = path.join(workspaceRoot, relativePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`E2E certification gate is missing ${relativePath}.`);
  }

  return readFileSync(absolutePath, "utf8");
}

function requireIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`E2E certification gate failed: ${label}`);
  }
}

const signInClient = requireFile("apps/enterprise-web/src/app/sign-in/sign-in-client.tsx");
const authSession = requireFile("apps/enterprise-web/src/server/auth/enterprise-session.ts");
const signInRoute = requireFile("apps/enterprise-web/src/app/api/auth/sign-in/route.ts");
const mfaRoute = requireFile("apps/enterprise-web/src/app/api/auth/mfa/verify/route.ts");
const stepUpRoute = requireFile("apps/enterprise-web/src/app/api/auth/step-up/route.ts");
const passwordPolicyRoute = requireFile("apps/enterprise-web/src/app/api/security/password-policy/route.ts");
const alertsRepository = requireFile("apps/enterprise-web/src/server/repositories/enterprise-alerts.repository.ts");
const desktopRenderer = requireFile("apps/store-desktop/src/renderer/app.tsx");
const modernDesktopRenderer = requireFile("apps/store-desktop/src/renderer/modern-app.tsx");
const desktopRuntime = requireFile("apps/store-desktop/src/shared/desktop-runtime.ts");
const rootPackage = requireFile("package.json");
const playwrightConfig = requireFile("playwright.config.ts");
const enterpriseBrowserSpec = requireFile("tests/e2e/enterprise-auth.spec.ts");
const onlineStoreParitySpec = requireFile("tests/e2e/online-store-parity.spec.ts");
const storeDesktopSpec = requireFile("tests/e2e/store-desktop.spec.ts");
const acceptanceMatrix = requireFile("docs/11-ivend-parity-acceptance-matrix.md");
const certificationPlan = requireFile("docs/12-production-certification-and-soak-plan.md");
const parsedRootPackage = JSON.parse(rootPackage) as { scripts?: Record<string, string> };

requireIncludes(authSession, "verifyEnterpriseMfaChallenge", "MFA challenge verification must exist.");
requireIncludes(authSession, "createEnterpriseStepUpVerification", "step-up verification must exist.");
requireIncludes(authSession, "assertEnterpriseStepUp", "sensitive action enforcement hook must exist.");
requireIncludes(signInRoute, "requiresMfa", "sign-in route must return MFA challenge state.");
requireIncludes(mfaRoute, "verifyEnterpriseMfaChallenge", "MFA verify route must call MFA verifier.");
requireIncludes(stepUpRoute, "createEnterpriseStepUpVerification", "step-up route must call verifier.");
requireIncludes(signInClient, "Verify MFA", "sign-in UI must expose MFA verification state.");
requireIncludes(signInClient, "one-time-code", "sign-in UI must use one-time-code autocomplete.");
requireIncludes(passwordPolicyRoute, "assertEnterpriseStepUp", "password policy route must require step-up.");
requireIncludes(alertsRepository, "critical-security-events", "HQ alerts must include critical security escalation.");
requireIncludes(alertsRepository, "locked-enterprise-accounts", "HQ alerts must include account lockout signal.");
requireIncludes(desktopRenderer, "openShift", "desktop renderer must expose shift open journey.");
requireIncludes(desktopRenderer, "closeActiveShift", "desktop renderer must expose shift close journey.");
requireIncludes(desktopRenderer, "checkoutBasket", "desktop renderer must expose checkout journey.");
requireIncludes(modernDesktopRenderer, "openShift", "modern desktop renderer must expose shift open journey.");
requireIncludes(modernDesktopRenderer, "closeShift", "modern desktop renderer must expose shift close journey.");
requireIncludes(modernDesktopRenderer, "checkoutBasket", "modern desktop renderer must expose checkout journey.");
requireIncludes(desktopRuntime, "runSyncCycle", "desktop runtime must expose sync journey.");
requireIncludes(
  parsedRootPackage.scripts?.["e2e:certification"] ?? "",
  "playwright test",
  "root package must expose real Playwright E2E certification."
);
requireIncludes(playwrightConfig, "enterprise-browser", "Playwright config must define enterprise browser project.");
requireIncludes(playwrightConfig, "online-store-parity", "Playwright config must include online-store parity spec.");
requireIncludes(playwrightConfig, "store-electron", "Playwright config must define store Electron project.");
requireIncludes(enterpriseBrowserSpec, "sign-in -> MFA -> dashboard", "enterprise Playwright spec must cover sign-in and MFA.");
requireIncludes(enterpriseBrowserSpec, "security policy step-up", "enterprise Playwright spec must cover step-up.");
requireIncludes(onlineStoreParitySpec, "online store desktop parity", "online-store Playwright spec must cover desktop parity.");
requireIncludes(
  onlineStoreParitySpec,
  "FLASH_ERP_E2E_ONLINE_STORE_LOGIN",
  "online-store Playwright spec must require online-store credentials."
);
requireIncludes(storeDesktopSpec, "desktop sign-in -> open shift -> sale -> close shift -> sync", "Electron Playwright spec must cover desktop trading flow.");
requireIncludes(acceptanceMatrix, "MFA", "acceptance matrix must mention MFA scope.");
requireIncludes(certificationPlan, "MFA", "certification plan must mention MFA certification.");
requireIncludes(certificationPlan, "npm run e2e:certification", "certification plan must include live Playwright command.");

console.log("Flash ERP E2E certification gates passed.");
