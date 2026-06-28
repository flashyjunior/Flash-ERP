export type EnterpriseMasterView =
  | "customers"
  | "suppliers"
  | "tax"
  | "tenders"
  | "banks"
  | "departments"
  | "categories"
  | "uom"
  | "loyalty"
  | "promotions";

export type EnterpriseSettingsView =
  | "company"
  | "ldap"
  | "smtp"
  | "sms"
  | "inventory-catalogs"
  | "fuel-operations"
  | "leave-types"
  | "shop-prices"
  | "licenses"
  | "receipt-templates"
  | "retail-users"
  | "options";

export type EnterpriseSecurityView =
  | "users"
  | "roles-privileges"
  | "audit-logs"
  | "online-users"
  | "password-policy"
  | "security-logs";

export type EnterpriseNavigationMenuItem = {
  key: string;
  label: string;
  href: string;
  requiredPermissions?: readonly string[];
};

export type EnterpriseNavigationMenuGroup = {
  key: string;
  label: string;
  items: readonly EnterpriseNavigationMenuItem[];
};

export const enterpriseMasterMenuItems = [
  { key: "customers", label: "Customers", href: "/master/customers" },
  { key: "suppliers", label: "Suppliers", href: "/master/suppliers" },
  { key: "tax", label: "Tax", href: "/master/tax" },
  { key: "tenders", label: "Tenders", href: "/master/tenders" },
  { key: "banks", label: "Banks", href: "/master/banks" },
  { key: "departments", label: "Departments", href: "/master/departments" },
  { key: "categories", label: "Categories", href: "/master/categories" },
  { key: "products", label: "Products", href: "/catalog" },
  { key: "uom", label: "UOM", href: "/master/uom" },
  { key: "stores", label: "Stores", href: "/stores" },
  { key: "loyalty", label: "Loyalty", href: "/master/loyalty" },
  { key: "promotions", label: "Promotions", href: "/master/promotions" }
] as const;

export const enterpriseSettingsMenuItems = [
  { key: "company", label: "Company", href: "/settings/company" },
  { key: "ldap", label: "LDAP", href: "/settings/ldap" },
  { key: "smtp", label: "SMTP", href: "/settings/smtp" },
  { key: "sms", label: "SMS", href: "/settings/sms" },
  { key: "inventory-catalogs", label: "Inventory Catalogs", href: "/settings/inventory-catalogs" },
  { key: "fuel-operations", label: "Fuel Operations", href: "/settings/fuel-operations" },
  { key: "leave-types", label: "Leave Types", href: "/settings/leave-types" },
  { key: "licenses", label: "Licensing", href: "/settings/licenses" },
  { key: "receipt-templates", label: "Receipt Templates", href: "/settings/receipt-templates" },
  { key: "retail-users", label: "Retail Users", href: "/settings/retail-users" }
] as const;

export const enterpriseFinanceSettingsMenuItems = [
  { key: "foundation", label: "Finance Overview", href: "/finance/foundation" },
  { key: "fiscal-calendar", label: "Fiscal Calendar", href: "/finance/fiscal-calendar" },
  { key: "multi-currency", label: "Multi Currency", href: "/finance/multi-currency" },
  { key: "chart-of-accounts", label: "Chart of Accounts", href: "/finance/chart-of-accounts" },
  { key: "posting-setup", label: "Posting Setup", href: "/finance/posting-setup" },
  { key: "party-profiles", label: "Party Profiles", href: "/finance/party-profiles" },
  { key: "document-numbering", label: "Document Numbering", href: "/finance/document-numbering" },
  { key: "operating-foundation", label: "Operating Foundation", href: "/finance/operating-foundation" }
] as const;

export const enterpriseSettingsMenuGroups: readonly EnterpriseNavigationMenuGroup[] = [
  {
    key: "organization",
    label: "Organization Settings",
    items: enterpriseSettingsMenuItems
  },
  {
    key: "finance",
    label: "Finance Settings",
    items: enterpriseFinanceSettingsMenuItems
  },
  {
    key: "system",
    label: "System",
    items: [{ key: "sync", label: "Sync", href: "/sync" }]
  }
] as const;

export const enterpriseOnlineStoreMenuItems = [
  { key: "online-store-pos", label: "POS", href: "/online-store" }
] as const;

export const enterpriseOnlineFuelMenuItems = [
  {
    key: "online-fuel-overview",
    label: "Fuel Overview",
    href: "/online-store/fuel",
    requiredPermissions: ["fuel.station.view"]
  },
  {
    key: "online-fuel-tanks",
    label: "Tank Management",
    href: "/online-store/fuel/tanks",
    requiredPermissions: ["fuel.tank.manage"]
  },
  {
    key: "online-fuel-dips",
    label: "Tank Dips",
    href: "/online-store/fuel/dips",
    requiredPermissions: ["fuel.dip.capture"]
  },
  {
    key: "online-fuel-meter-readings",
    label: "Meter Readings",
    href: "/online-store/fuel/meter-readings",
    requiredPermissions: ["fuel.meter-reading.capture"]
  },
  {
    key: "online-fuel-supplier-receipts",
    label: "Supplier Receipts",
    href: "/online-store/fuel/supplier-receipts",
    requiredPermissions: ["fuel.supplier-receipt.capture"]
  },
  {
    key: "online-fuel-reconciliation",
    label: "Reconciliation",
    href: "/online-store/fuel/reconciliation",
    requiredPermissions: ["fuel.reconciliation.manage"]
  }
] as const;

export const enterpriseInventoryMenuItems = [
  { key: "products", label: "Products", href: "/inventory/products" },
  { key: "shop-prices", label: "Shop Prices", href: "/inventory/shop-prices" },
  { key: "stock-by-shop", label: "Item Dynamic", href: "/inventory/stock-by-shop" },
  { key: "transfers", label: "Transfers", href: "/inventory/transfers" },
  { key: "in-transit", label: "In-Transit", href: "/inventory/in-transit" },
  { key: "stock-count", label: "Stock Count", href: "/inventory/stock-count" }
] as const;

export const enterprisePurchasesMenuItems = [
  { key: "purchase-orders", label: "Purchase orders", href: "/purchases/purchase-orders" },
  { key: "goods-receipt", label: "Goods Receipt", href: "/purchases/goods-receipt" },
  { key: "predictive-review", label: "Predictive Review", href: "/purchases/predictive-review" }
] as const;

export const enterpriseFuelOperationsMenuItems = [
  { key: "fuel-overview", label: "Fuel Overview", href: "/fuel-operations" },
  { key: "fuel-tanks", label: "Tank Management", href: "/fuel-operations/tanks" },
  { key: "fuel-pumps", label: "Pumps & Nozzles", href: "/fuel-operations/pumps" },
  { key: "fuel-dips", label: "Tank Dips", href: "/fuel-operations/dips" },
  { key: "fuel-meter-readings", label: "Meter Readings", href: "/fuel-operations/meter-readings" },
  { key: "fuel-stations", label: "Filling Stations", href: "/fuel-operations/stations" },
  { key: "fuel-deliveries", label: "Fuel Deliveries", href: "/fuel-operations/deliveries" },
  { key: "fuel-supplier-receipts", label: "Supplier Receipts", href: "/fuel-operations/supplier-receipts" },
  { key: "fuel-reconciliation", label: "Reconciliation", href: "/fuel-operations#reconciliation" }
] as const;

export const enterpriseHumanResourcesMenuItems = [
  {
    key: "hr-overview",
    label: "Overview",
    href: "/human-resources",
    requiredPermissions: ["hr.view"]
  },
  {
    key: "hr-employees",
    label: "Employees",
    href: "/human-resources/employees",
    requiredPermissions: ["hr.view"]
  },
  {
    key: "hr-organization",
    label: "Departments & Positions",
    href: "/human-resources/organization",
    requiredPermissions: ["hr.view"]
  },
  {
    key: "hr-attendance",
    label: "Attendance",
    href: "/human-resources/attendance",
    requiredPermissions: ["hr.view"]
  },
  {
    key: "hr-leave",
    label: "Leave Management",
    href: "/human-resources/leave",
    requiredPermissions: ["hr.view"]
  },
  {
    key: "hr-documents",
    label: "HR Documents",
    href: "/human-resources/documents",
    requiredPermissions: ["hr.document.manage"]
  },
  {
    key: "hr-exits",
    label: "Employee Exits",
    href: "/human-resources/exits",
    requiredPermissions: ["hr.view"]
  },
  {
    key: "hr-visitors",
    label: "Visitor Register",
    href: "/human-resources/visitors",
    requiredPermissions: ["hr.visitor.view"]
  },
  {
    key: "hr-payroll",
    label: "Payroll",
    href: "/human-resources/payroll",
    requiredPermissions: ["hr.payroll.view"]
  },
  {
    key: "hr-benefits",
    label: "Benefits",
    href: "/human-resources/benefits",
    requiredPermissions: ["hr.view"]
  },
  {
    key: "hr-loans",
    label: "Loans & Advances",
    href: "/human-resources/loans",
    requiredPermissions: ["hr.employee-finance.view"]
  },
  {
    key: "hr-expense-claims",
    label: "Expense Claims",
    href: "/human-resources/expense-claims",
    requiredPermissions: ["hr.employee-finance.view"]
  },
  {
    key: "hr-travel",
    label: "Travel",
    href: "/human-resources/travel",
    requiredPermissions: ["hr.employee-finance.view"]
  }
] as const;

export const enterpriseFinanceMenuGroups: readonly EnterpriseNavigationMenuGroup[] = [
  {
    key: "general-ledger",
    label: "General Ledger",
    items: [
      { key: "ledger", label: "Ledger Overview", href: "/finance" },
      { key: "financial-statements", label: "Financial Statements", href: "/finance/financial-statements" },
      { key: "trial-balance", label: "Trial Balance", href: "/finance/trial-balance" },
      { key: "account-activity", label: "Account Activity", href: "/finance/account-activity" },
      { key: "journal-inquiry", label: "Journal Inquiry", href: "/finance/journal-inquiry" },
      { key: "journals", label: "Manual Journals", href: "/finance/journals" },
      { key: "recurring-journals", label: "Recurring Journals", href: "/finance/recurring-journals" }
    ]
  },
  {
    key: "receivables-payables",
    label: "Receivables & Payables",
    items: [
      { key: "operational-documents", label: "Source Documents", href: "/finance/operational-documents" },
      { key: "ar-ap-documents", label: "AR/AP Documents", href: "/finance/ar-ap-documents" },
      { key: "ar-ap-settlements", label: "Receipts & Payments", href: "/finance/ar-ap-settlements" }
    ]
  },
  {
    key: "banking",
    label: "Banking",
    items: [
      { key: "cashbook", label: "Cashbook", href: "/finance/cashbook" },
      { key: "bank-reconciliation", label: "Bank Reconciliation", href: "/finance/bank-reconciliation" }
    ]
  },
  {
    key: "fixed-assets",
    label: "Fixed Assets",
    items: [{ key: "fixed-assets", label: "Asset Register", href: "/finance/fixed-assets" }]
  },
  {
    key: "planning-payroll",
    label: "Planning & Payroll",
    items: [
      { key: "budgets", label: "Budgets", href: "/finance/budgets" },
      { key: "payroll-gl", label: "Payroll GL", href: "/finance/payroll-gl" }
    ]
  },
  {
    key: "finance-operations",
    label: "POS & Operations",
    items: [
      { key: "pos", label: "POS", href: "/pos" },
      { key: "operations", label: "Operations", href: "/operations" }
    ]
  }
] as const;

export const enterpriseFinanceMenuItems = enterpriseFinanceMenuGroups.flatMap((group) => group.items);

export const enterpriseSecurityMenuItems = [
  { key: "users", label: "Users", href: "/security/users" },
  {
    key: "roles-privileges",
    label: "Roles & Privileges",
    href: "/security/roles-privileges"
  },
  { key: "audit-logs", label: "Audit Logs", href: "/security/audit-logs" },
  { key: "online-users", label: "Online Users", href: "/security/online-users" },
  { key: "password-policy", label: "Password Policy", href: "/security/password-policy" },
  { key: "security-logs", label: "Security Logs", href: "/security/security-logs" }
] as const;

export const enterpriseMasterPageMeta: Record<
  EnterpriseMasterView,
  {
    label: string;
    heading: string;
    description: string;
    href: string;
  }
> = {
  customers: {
    label: "Customers",
    heading: "Customers",
    description: "Manage customer master records, balances, and loyalty settings.",
    href: "/master/customers"
  },
  suppliers: {
    label: "Suppliers",
    heading: "Suppliers",
    description: "Manage supplier master records and purchasing contacts.",
    href: "/master/suppliers"
  },
  tax: {
    label: "Tax",
    heading: "Tax",
    description: "Manage tax profiles used across products and stores.",
    href: "/master/tax"
  },
  tenders: {
    label: "Tenders",
    heading: "Tenders",
    description: "Manage tender methods and payment behavior.",
    href: "/master/tenders"
  },
  banks: {
    label: "Banks",
    heading: "Banks",
    description: "Manage bank, branch, and account-number combinations used by stores.",
    href: "/master/banks"
  },
  departments: {
    label: "Departments",
    heading: "Departments",
    description: "Manage top-level product departments.",
    href: "/master/departments"
  },
  categories: {
    label: "Categories",
    heading: "Categories",
    description: "Manage product categories under departments.",
    href: "/master/categories"
  },
  uom: {
    label: "UOM",
    heading: "Unit of Measure",
    description: "Manage units and schedules used by products.",
    href: "/master/uom"
  },
  loyalty: {
    label: "Loyalty",
    heading: "Loyalty",
    description: "Manage loyalty earning and redemption rules.",
    href: "/master/loyalty"
  },
  promotions: {
    label: "Promotions",
    heading: "Promotions",
    description: "Manage promotion rules published to stores.",
    href: "/master/promotions"
  }
};

export const enterpriseSettingsPageMeta: Record<
  EnterpriseSettingsView,
  {
    label: string;
    heading: string;
    description: string;
    href: string;
  }
> = {
  company: {
    label: "Company",
    heading: "Company",
    description:
      "Maintain company identity, legal registration, contact details, and enterprise profile data.",
    href: "/settings/company"
  },
  ldap: {
    label: "LDAP",
    heading: "LDAP",
    description:
      "Configure LDAP connectivity, bind credentials, directory search rules, and user synchronization posture.",
    href: "/settings/ldap"
  },
  smtp: {
    label: "SMTP",
    heading: "SMTP",
    description:
      "Configure SMTP host, credentials, and sender settings for enterprise email delivery.",
    href: "/settings/smtp"
  },
  sms: {
    label: "SMS",
    heading: "SMS",
    description:
      "Control SMS provider credentials, sender IDs, and delivery reporting for outbound text messaging.",
    href: "/settings/sms"
  },
  "inventory-catalogs": {
    label: "Inventory Catalogs",
    heading: "Inventory Catalogs",
    description:
      "Create shop-specific inventory catalogs, control product order, and publish assortments to stores.",
    href: "/settings/inventory-catalogs"
  },
  "fuel-operations": {
    label: "Fuel Operations",
    heading: "Fuel Operations",
    description:
      "Configure default Fuel Operations source and dispatch sites used by sale and delivery entry.",
    href: "/settings/fuel-operations"
  },
  "leave-types": {
    label: "Leave Types",
    heading: "Leave Types",
    description:
      "Maintain leave categories, standard entitlements, attachment rules, and eligibility settings.",
    href: "/settings/leave-types"
  },
  "shop-prices": {
    label: "Shop Prices",
    heading: "Shop Prices",
    description:
      "Maintain product and variant sell-price overrides for each shop.",
    href: "/settings/shop-prices"
  },
  licenses: {
    label: "Licensing",
    heading: "Licensing",
    description:
      "License shop nodes and terminals from HQ, renew expiry dates, and prepare keys for downstream sync.",
    href: "/settings/licenses"
  },
  "receipt-templates": {
    label: "Receipt Templates",
    heading: "Receipt Templates",
    description:
      "Design and manage the thermal receipt templates that stores use at checkout.",
    href: "/settings/receipt-templates"
  },
  "retail-users": {
    label: "Retail Users",
    heading: "Retail Users",
    description:
      "Manage retail operator profiles, role assignments, and store-facing sign-in readiness.",
    href: "/settings/retail-users"
  },
  options: {
    label: "Options",
    heading: "Options",
    description:
      "Control enterprise-wide operational defaults that shape POS, inventory, receipts, and offline behavior.",
    href: "/settings/options"
  }
};

export const enterpriseSecurityPageMeta: Record<
  EnterpriseSecurityView,
  {
    label: string;
    heading: string;
    description: string;
    href: string;
  }
> = {
  users: {
    label: "Users",
    heading: "Users",
    description:
      "Manage centrally controlled retail users, role assignments, and sign-in readiness.",
    href: "/security/users"
  },
  "roles-privileges": {
    label: "Roles & Privileges",
    heading: "Roles & Privileges",
    description:
      "Compose granular security roles and privilege sets so access remains explicit and auditable.",
    href: "/security/roles-privileges"
  },
  "audit-logs": {
    label: "Audit Logs",
    heading: "Audit Logs",
    description:
      "Review administrative audit activity for security, settings, and enterprise control changes.",
    href: "/security/audit-logs"
  },
  "online-users": {
    label: "Online Users",
    heading: "Online Users",
    description:
      "Review operators currently active through open shifts, connected terminals, and store lanes.",
    href: "/security/online-users"
  },
  "password-policy": {
    label: "Password Policy",
    heading: "Password Policy",
    description:
      "Maintain enterprise password complexity, history, lockout, and session timeout rules.",
    href: "/security/password-policy"
  },
  "security-logs": {
    label: "Security Logs",
    heading: "Security Logs",
    description:
      "Review security warnings, alerts, recovery events, and policy-sensitive security activity.",
    href: "/security/security-logs"
  }
};

export function isEnterpriseMasterView(value: string): value is EnterpriseMasterView {
  return Object.prototype.hasOwnProperty.call(enterpriseMasterPageMeta, value);
}

export function isEnterpriseSettingsView(value: string): value is EnterpriseSettingsView {
  return Object.prototype.hasOwnProperty.call(enterpriseSettingsPageMeta, value);
}

export function isEnterpriseSecurityView(value: string): value is EnterpriseSecurityView {
  return Object.prototype.hasOwnProperty.call(enterpriseSecurityPageMeta, value);
}
