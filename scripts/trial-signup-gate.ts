import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function requireIncludes(source: string, expected: string, message: string) {
  if (!source.includes(expected)) throw new Error(message);
}

const page = read("apps/enterprise-web/src/app/signup/signup-client.tsx");
const serverPage = read("apps/enterprise-web/src/app/signup/page.tsx");
const styles = read("apps/enterprise-web/src/app/signup/signup.module.css");
const envExample = read(".env.example");
const enterpriseHost = read("scripts/start-enterprise-web.mjs");
const service = read("apps/enterprise-web/src/server/trials/trial-signup.ts");
const proxy = read("apps/enterprise-web/src/proxy.ts");
const schema = read("prisma/schema.prisma");
const migration = read(
  "prisma/migrations-sqlserver/20260826010000_public_trial_signup/migration.sql"
);
const callbackRoute = read(
  "apps/enterprise-web/src/app/api/trials/provisioning-callback/route.ts"
);
const statusRoute = read("apps/enterprise-web/src/app/api/trials/status/route.ts");
const hero = path.join(
  root,
  "apps/enterprise-web/public/images/flash-erp-trial-hero.png"
);

for (const expected of [
  "Sales, POS & customer accounts",
  "Inventory & product control",
  "Manufacturing",
  "Purchasing & suppliers",
  "Finance & accounting",
  "HR, payroll & people operations",
  "Ecommerce & fulfilment",
  "Fuel operations",
  "Offline-first Store Desktop",
  "Security & audit",
  "Sync, integrations & APIs"
]) {
  requireIncludes(page, expected, `Public trial page must present ${expected}.`);
}

requireIncludes(page, "14-day trial", "Trial duration must be visible to the customer.");
requireIncludes(page, "Isolated trial workspace", "Data isolation must be part of the trial promise.");
requireIncludes(page, "/api/trials/verify", "The page must verify the applicant's email.");
requireIncludes(page, "flash-erp-trial-status-token", "Provisioning status must survive a refresh.");
requireIncludes(styles, "@media (max-width: 640px)", "The trial page must have a mobile layout.");
requireIncludes(styles, "prefers-reduced-motion", "The trial page must respect reduced motion.");
requireIncludes(styles, "position: sticky", "The trial navigation must remain visible without leaving normal page flow.");
requireIncludes(page, "WhatsAppLogo", "The trial page must use the WhatsApp brand mark.");
requireIncludes(page, "https://wa.me/", "WhatsApp support must use the official click-to-chat URL.");
requireIncludes(serverPage, "FLASH_ERP_WHATSAPP_NUMBER", "The WhatsApp number must come from server environment configuration.");
requireIncludes(envExample, "FLASH_ERP_WHATSAPP_NUMBER", "The WhatsApp number must be documented in the environment example.");
requireIncludes(enterpriseHost, 'path.join(repositoryRoot, ".env")', "The Enterprise Web host must load the repository environment file.");

requireIncludes(service, "FLASH_ERP_TRIAL_PROVISIONER_URL", "Provisioning must use the isolated workspace service.");
requireIncludes(service, "createHmac", "Provisioning requests and callbacks must be signed.");
requireIncludes(service, "idempotency-key", "Provisioning must carry an idempotency key.");
requireIncludes(service, "FLASH_ERP_TRIAL_TURNSTILE_SECRET", "Public signup must support bot verification.");
requireIncludes(service, "TRIAL_DAYS = 14", "The backend must govern the 14-day duration.");
requireIncludes(service, 'request.status === "ACTIVE"', "A stale callback must not downgrade an active trial.");
requireIncludes(service, "startsAt.getTime() + TRIAL_DAYS", "Flash ERP must calculate the governed trial expiry.");
requireIncludes(callbackRoute, "request.text()", "Callback signatures must cover the raw request body.");
requireIncludes(statusRoute, "request.json()", "Status tokens must be sent in a request body, not a URL.");
requireIncludes(proxy, 'scope: "trial-signup"', "Trial signup must be rate limited.");
requireIncludes(proxy, 'scope: "trial-verify"', "Trial verification must be rate limited.");
requireIncludes(proxy, 'scope: "trial-status"', "Trial status polling must be rate limited.");

requireIncludes(schema, "model TrialSignupRequest", "Trial requests must be persisted.");
requireIncludes(migration, "IF OBJECT_ID", "The SQL Server migration must be idempotent.");
requireIncludes(migration, "provisioningRequestKey", "The migration must persist provisioning idempotency.");
requireIncludes(migration, "[id] NVARCHAR(100)", "The SQL Server primary key must fit its index limit.");
requireIncludes(migration, "[provisioningRequestKey] NVARCHAR(200)", "The idempotency key must fit its unique index.");

if (!fs.existsSync(hero) || fs.statSync(hero).size < 100_000) {
  throw new Error("The project must contain the production trial hero image.");
}

for (const [name, source] of Object.entries({ page, styles, service, proxy, schema, migration })) {
  if (/[^\x00-\x7F]/.test(source)) {
    throw new Error(`${name} contains unexpected non-ASCII characters.`);
  }
}

console.log("Flash ERP public trial signup acceptance passed.");
