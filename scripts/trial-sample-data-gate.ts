import fs from "node:fs";
import path from "node:path";

import {
  trialBusinessTypes,
  trialSampleCatalog,
} from "../apps/enterprise-web/src/server/trials/trial-sample-catalog";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function requireIncludes(source: string, expected: string, message: string) {
  if (!source.includes(expected)) throw new Error(message);
}

for (const businessType of trialBusinessTypes) {
  const products = trialSampleCatalog(businessType);
  if (products.length !== 20) {
    throw new Error(`${businessType} must provide exactly 20 sample products.`);
  }
  if (new Set(products.map((product) => product.code)).size !== products.length) {
    throw new Error(`${businessType} sample product codes must be unique.`);
  }
  if (new Set(products.map((product) => product.barcode)).size !== products.length) {
    throw new Error(`${businessType} sample barcodes must be unique.`);
  }
  if (new Set(products.map((product) => product.name)).size !== products.length) {
    throw new Error(`${businessType} sample product names must be unique.`);
  }
  if (new Set(products.map((product) => product.category)).size < 4) {
    throw new Error(`${businessType} sample data must span at least four categories.`);
  }
  if (
    products.some(
      (product) =>
        product.price <= 0 ||
        product.cost < 0 ||
        product.cost >= product.price ||
        product.stock <= 0,
    )
  ) {
    throw new Error(`${businessType} sample prices, costs, and stock must be realistic.`);
  }
}

const service = read("apps/enterprise-web/src/server/trials/trial-sample-data.ts");
const route = read("apps/enterprise-web/src/app/api/trials/sample-data/route.ts");
const enterprisePage = read("apps/enterprise-web/src/app/page.tsx");
const enterpriseDashboard = read(
  "apps/enterprise-web/src/components/enterprise/enterprise-overview-dashboard.tsx",
);
const onlineStorePage = read("apps/enterprise-web/src/app/online-store/page.tsx");
const onlineStoreWorkspace = read(
  "apps/enterprise-web/src/components/enterprise/online-store-workspace.tsx",
);
const provisioner = read("scripts/trial-workspace-provisioner-worker.ts");

requireIncludes(
  service,
  'FLASH_ERP_TRIAL_WORKSPACE_MODE === "true"',
  "Sample data must be restricted to isolated trial workspaces.",
);
requireIncludes(
  service,
  "productCount > 0",
  "Sample data must not alter a user-owned catalogue.",
);
requireIncludes(
  service,
  "inventoryLedgerEntry.upsert",
  "Opening stock must use an idempotent ledger identity.",
);
requireIncludes(
  service,
  "ecommerceFulfillmentLocation.upsert",
  "Sample products must receive governed ecommerce fulfilment locations.",
);
requireIncludes(
  service,
  "inventoryCatalogProduct.upsert",
  "Sample products must be linked to the trial inventory catalogue.",
);
requireIncludes(
  service,
  "storeProductSellingUnit.upsert",
  "Sample products must be sellable in Main and Online Store.",
);
requireIncludes(
  route,
  "assertEnterpriseOrOnlineStorePermission",
  "Both authenticated trial surfaces must use the same governed API.",
);
requireIncludes(
  enterprisePage,
  "trialSampleDataEnabled",
  "Enterprise must receive the trial-only sample-data capability.",
);
requireIncludes(
  enterpriseDashboard,
  "Create sample data",
  "Enterprise must expose the sample-data action.",
);
requireIncludes(
  enterpriseDashboard,
  "masterCounts.products === 0",
  "Enterprise must hide the action after products exist.",
);
requireIncludes(
  onlineStorePage,
  "trialSampleDataEnabled",
  "Online Store must receive the trial-only sample-data capability.",
);
requireIncludes(
  onlineStoreWorkspace,
  "Create sample data",
  "Online Store must expose the sample-data action.",
);
requireIncludes(
  onlineStoreWorkspace,
  "workspace.products.length === 0",
  "Online Store must hide the action after products exist.",
);
requireIncludes(
  provisioner,
  "FLASH_ERP_TRIAL_BUSINESS_TYPE",
  "The child runtime must retain the signup business type.",
);
requireIncludes(
  provisioner,
  "businessType: true",
  "Active trial reconciliation must reload the signup business type.",
);
requireIncludes(
  provisioner,
  "await provisionTrialSampleData({",
  "Fresh trial provisioning must create the business-type sample catalogue.",
);
requireIncludes(
  provisioner,
  "businessType: request.business.type",
  "Fresh trial sample data must use the verified signup business type.",
);
requireIncludes(
  provisioner,
  "reconcileWorkspaceSampleData",
  "Existing active trials must receive the same idempotent sample-data reconciliation.",
);
requireIncludes(
  provisioner,
  "businessType: row.businessType",
  "Existing trial reconciliation must use the persisted signup business type.",
);

console.log("Flash ERP trial sample-data acceptance passed.");
