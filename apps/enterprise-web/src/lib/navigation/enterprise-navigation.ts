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
  { key: "licenses", label: "Licensing", href: "/settings/licenses" },
  { key: "receipt-templates", label: "Receipt Templates", href: "/settings/receipt-templates" },
  { key: "retail-users", label: "Retail Users", href: "/settings/retail-users" }
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
