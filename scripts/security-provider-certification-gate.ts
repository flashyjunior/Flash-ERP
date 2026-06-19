import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

function requireFile(relativePath: string) {
  const absolutePath = path.join(workspaceRoot, relativePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Security provider certification gate is missing ${relativePath}.`);
  }

  return readFileSync(absolutePath, "utf8");
}

function requireIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`Security provider certification gate failed: ${label}`);
  }
}

const rootPackage = JSON.parse(requireFile("package.json")) as {
  scripts?: Record<string, string>;
};
const authSession = requireFile("apps/enterprise-web/src/server/auth/enterprise-session.ts");
const mfaDelivery = requireFile("apps/enterprise-web/src/server/services/enterprise-mfa-delivery.ts");
const settingsRepository = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-settings.repository.ts"
);
const securityRepository = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-security.repository.ts"
);
const alertsRepository = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-alerts.repository.ts"
);
const securityWorkspace = requireFile(
  "apps/enterprise-web/src/components/enterprise/enterprise-security-workspace.tsx"
);
const settingsWorkspace = requireFile(
  "apps/enterprise-web/src/components/enterprise/enterprise-settings-workspace.tsx"
);
const ldapRoute = requireFile("apps/enterprise-web/src/app/api/settings/ldap/validate/route.ts");
const smtpRoute = requireFile("apps/enterprise-web/src/app/api/settings/smtp/validate/route.ts");
const smsRoute = requireFile("apps/enterprise-web/src/app/api/settings/sms/validate/route.ts");
const mfaRoute = requireFile("apps/enterprise-web/src/app/api/auth/mfa/verify/route.ts");
const stepUpRoute = requireFile("apps/enterprise-web/src/app/api/auth/step-up/route.ts");
const hardeningPack = requireFile("docs/15-production-hardening-execution-pack.md");
const certificationPlan = requireFile("docs/12-production-certification-and-soak-plan.md");
const uatEvidence = requireFile("docs/14-uat-evidence-log.md");

if (!rootPackage.scripts?.["cert:security-providers"]) {
  throw new Error("Root package.json must expose cert:security-providers.");
}

requireIncludes(settingsRepository, "validateEnterpriseLdapSettings", "LDAP validation must exist.");
requireIncludes(settingsRepository, "validateEnterpriseSmtpSettings", "SMTP validation must exist.");
requireIncludes(settingsRepository, "validateEnterpriseSmsSettings", "SMS validation must exist.");
requireIncludes(ldapRoute, "validateEnterpriseLdapSettings", "LDAP route must call repository validation.");
requireIncludes(smtpRoute, "validateEnterpriseSmtpSettings", "SMTP route must call repository validation.");
requireIncludes(smsRoute, "validateEnterpriseSmsSettings", "SMS route must call repository validation.");
requireIncludes(settingsWorkspace, "/api/settings/ldap/validate", "settings UI must expose LDAP validation action.");
requireIncludes(settingsWorkspace, "/api/settings/smtp/validate", "settings UI must expose SMTP validation action.");
requireIncludes(settingsWorkspace, "/api/settings/sms/validate", "settings UI must expose SMS validation action.");
requireIncludes(mfaDelivery, "nodemailer.createTransport", "MFA delivery must support SMTP delivery.");
requireIncludes(mfaDelivery, "fetch(", "MFA delivery must support HTTP SMS provider delivery.");
requireIncludes(mfaDelivery, "mfa.delivery", "MFA delivery must write provider evidence.");
requireIncludes(authSession, "deliverEnterpriseMfaCode", "sign-in must route MFA through delivery service.");
requireIncludes(authSession, "verifyEnterpriseMfaChallenge", "MFA challenge verification must exist.");
requireIncludes(authSession, "createEnterpriseStepUpVerification", "step-up issuance must exist.");
requireIncludes(authSession, "assertEnterpriseStepUp", "step-up enforcement hook must exist.");
requireIncludes(mfaRoute, "verifyEnterpriseMfaChallenge", "MFA verify route must call verifier.");
requireIncludes(stepUpRoute, "createEnterpriseStepUpVerification", "step-up route must call verifier.");
requireIncludes(securityRepository, "alertOnAccountLockout", "security policy must support lockout alerting.");
requireIncludes(securityRepository, "criticalAlertEscalationMinutes", "security policy must support escalation timing.");
requireIncludes(securityRepository, "securityAlertEmail", "security policy must capture escalation owner.");
requireIncludes(securityRepository, "unlockEnterpriseRetailUser", "admin unlock workflow must exist.");
requireIncludes(alertsRepository, "critical-security-events", "HQ alert snapshot must include critical security events.");
requireIncludes(alertsRepository, "locked-enterprise-accounts", "HQ alert snapshot must include locked accounts.");
requireIncludes(securityWorkspace, "Step-up for sensitive actions", "security UI must expose step-up controls.");
requireIncludes(securityWorkspace, "Security alert email", "security UI must expose alert routing.");
requireIncludes(hardeningPack, "Slice 3: Security Provider Certification", "hardening pack must include provider certification slice.");
requireIncludes(hardeningPack, "endpoint owner approval", "provider certification must require endpoint owner approval.");
requireIncludes(certificationPlan, "Validate the MFA code delivery path", "certification plan must require MFA delivery sign-off.");
requireIncludes(uatEvidence, "Security provider certification", "UAT log must include security provider evidence row.");

console.log("Security provider certification gate passed.");
