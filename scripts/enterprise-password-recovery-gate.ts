import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function requireText(source: string, expected: string, message: string) {
  assert.ok(source.includes(expected), message);
}

const session = read("apps/enterprise-web/src/server/auth/enterprise-session.ts");
const delivery = read("apps/enterprise-web/src/server/services/enterprise-mfa-delivery.ts");
const forgotPage = read("apps/enterprise-web/src/app/forgot-password/page.tsx");
const resetPage = read("apps/enterprise-web/src/app/reset-password/page.tsx");
const forgotRoute = read("apps/enterprise-web/src/app/api/auth/forgot-password/route.ts");
const resetRoute = read("apps/enterprise-web/src/app/api/auth/reset-password/route.ts");
const signIn = read("apps/enterprise-web/src/app/sign-in/sign-in-client.tsx");
const proxy = read("apps/enterprise-web/src/proxy.ts");
const trialRelay = read("apps/enterprise-web/src/server/trials/trial-password-reset-relay.ts");
const trialRelayRoute = read(
  "apps/enterprise-web/src/app/api/trials/password-reset-delivery/route.ts"
);

requireText(
  session,
  '"If Flash ERP recognizes that account, password recovery instructions are now available."',
  "Enterprise recovery must retain a generic anti-enumeration response."
);
requireText(
  session,
  "const users = await prisma.retailUser.findMany",
  "Enterprise recovery must evaluate every staff account matching a shared email."
);
requireText(
  session,
  "const targets = loginMatch",
  "An exact Login ID must select only the requested staff account."
);
requireText(
  session,
  "deliverEnterprisePasswordResetLink",
  "Production recovery must deliver reset links through the Enterprise delivery service."
);
requireText(
  session,
  "passwordResetTokenLifetimeMinutes = 20",
  "Password reset tokens must retain the bounded 20-minute lifetime."
);
requireText(
  session,
  "validatePasswordAgainstPolicy(normalizedPassword, passwordPolicy)",
  "Reset passwords must satisfy the active Enterprise password policy."
);
requireText(
  session,
  "isInvitedTrialPasswordRecoveryAccount",
  "Trial invitation recovery must share the governed password-reset path."
);
requireText(
  session,
  'process.env.FLASH_ERP_TRIAL_WORKSPACE_MODE === "true"',
  "Invitation recovery must remain isolated to trial workspaces."
);
requireText(
  session,
  'user.accountStatus === "INVITED"',
  "Trial invitation recovery must accept only invited accounts without credentials."
);
requireText(
  session,
  'accountStatus: activatesInvitedTrialAccount ? "ACTIVE" : user.accountStatus',
  "A completed trial invitation recovery must activate the recovered account."
);
requireText(
  session,
  "await tx.trialWorkspaceRuntime.updateMany",
  "Enterprise-owner recovery must record trial workspace activation."
);
requireText(
  session,
  "await tx.retailUserSession.updateMany",
  "A completed reset must revoke the account's active sessions."
);

requireText(
  delivery,
  "export async function deliverEnterprisePasswordResetLink",
  "The Enterprise delivery service must expose password-reset delivery."
);
requireText(delivery, "nodemailer.createTransport", "Password recovery must use configured SMTP.");
requireText(delivery, "await transporter.sendMail", "Password recovery must send the email.");
requireText(delivery, "Reset password</a>", "Password recovery email must contain an action button.");
requireText(delivery, "Login ID", "Password recovery email must identify the exact staff account.");
requireText(
  delivery,
  "auth.password-reset.delivery.failed",
  "Password-reset delivery failures must be auditable."
);
requireText(
  delivery,
  'process.env.FLASH_ERP_TRIAL_WORKSPACE_MODE === "true"',
  "Trial workspaces must relay password-reset email through the control plane."
);
requireText(
  delivery,
  'createHmac("sha256", workspaceSecret)',
  "Trial password-reset relay requests must be signed with the workspace secret."
);
requireText(
  trialRelay,
  '.update(`activation:${requestId}`)',
  "The control plane must derive the workspace-specific signing secret."
);
requireText(
  trialRelay,
  "parsedResetLink.origin !== workspaceUrl.origin",
  "The relay must reject reset links outside the isolated workspace origin."
);
requireText(
  trialRelay,
  "email !== trial.emailNormalized.toLowerCase()",
  "The relay must reject recipients outside the registered trial owner email."
);
requireText(
  trialRelay,
  'eventType: "PASSWORD_RESET_EMAIL_DELIVERED"',
  "Successful trial reset delivery must create lifecycle evidence."
);
requireText(
  trialRelayRoute,
  "deliverTrialPasswordResetFromWorkspace",
  "The internal trial relay route must use the verified delivery service."
);

requireText(forgotPage, "/api/auth/forgot-password", "Forgot-password UI must call its API route.");
requireText(
  forgotPage,
  "When several staff accounts share one email address",
  "Forgot-password UI must explain shared-email account recovery."
);
requireText(resetPage, "/api/auth/reset-password", "Reset UI must call its API route.");
requireText(forgotRoute, "requestEnterprisePasswordReset", "Forgot route must use Enterprise auth.");
requireText(resetRoute, "resetEnterprisePassword", "Reset route must use Enterprise auth.");
requireText(signIn, 'href="/forgot-password"', "Enterprise sign-in must expose password recovery.");
requireText(
  proxy,
  'scope: "hq-password-recovery"',
  "Enterprise password recovery must remain rate limited."
);
requireText(
  proxy,
  'scope: "trial-password-reset-delivery"',
  "The internal trial password-reset relay must remain rate limited."
);

console.log("Enterprise password recovery acceptance passed.");
