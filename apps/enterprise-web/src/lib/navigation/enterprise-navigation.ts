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
  | "security-logs"
  | "data-purge";

export type EnterpriseNavigationPermissionRequirement = readonly [string, ...string[]];

export type EnterpriseNavigationMenuItem = {
  key: string;
  label: string;
  href: string;
  requiredPermissions: EnterpriseNavigationPermissionRequirement;
};

export type EnterpriseNavigationMenuGroup = {
  key: string;
  label: string;
  items: readonly EnterpriseNavigationMenuItem[];
};

export const enterpriseMasterMenuItems = [
  {
    key: "customers",
    label: "Customers",
    href: "/master/customers",
    requiredPermissions: ["master.customer.manage"]
  },
  {
    key: "suppliers",
    label: "Suppliers",
    href: "/master/suppliers",
    requiredPermissions: ["master.supplier.manage"]
  },
  { key: "tax", label: "Tax", href: "/master/tax", requiredPermissions: ["master.tax.manage"] },
  {
    key: "tenders",
    label: "Tenders",
    href: "/master/tenders",
    requiredPermissions: ["master.tender.manage"]
  },
  {
    key: "banks",
    label: "Banks",
    href: "/master/banks",
    requiredPermissions: ["master.bank.manage"]
  },
  {
    key: "departments",
    label: "Departments",
    href: "/master/departments",
    requiredPermissions: ["master.department.manage"]
  },
  {
    key: "categories",
    label: "Categories",
    href: "/master/categories",
    requiredPermissions: ["master.category.manage"]
  },
  {
    key: "products",
    label: "Products",
    href: "/catalog",
    requiredPermissions: ["master.product.manage"]
  },
  {
    key: "uom",
    label: "UOM",
    href: "/master/uom",
    requiredPermissions: ["master.product.manage"]
  },
  {
    key: "stores",
    label: "Stores",
    href: "/stores",
    requiredPermissions: ["master.store.manage"]
  },
  {
    key: "loyalty",
    label: "Loyalty",
    href: "/master/loyalty",
    requiredPermissions: ["master.loyalty.manage"]
  },
  {
    key: "promotions",
    label: "Promotions",
    href: "/master/promotions",
    requiredPermissions: ["master.promotion.manage"]
  }
] as const;

export const enterpriseSettingsMenuItems = [
  {
    key: "company",
    label: "Company",
    href: "/settings/company",
    requiredPermissions: ["settings.company.manage"]
  },
  {
    key: "ldap",
    label: "LDAP",
    href: "/settings/ldap",
    requiredPermissions: ["settings.ldap.manage"]
  },
  {
    key: "smtp",
    label: "SMTP",
    href: "/settings/smtp",
    requiredPermissions: ["settings.smtp.manage"]
  },
  {
    key: "sms",
    label: "SMS",
    href: "/settings/sms",
    requiredPermissions: ["settings.sms.manage"]
  },
  {
    key: "inventory-catalogs",
    label: "Inventory Catalogs",
    href: "/settings/inventory-catalogs",
    requiredPermissions: ["master.product.manage"]
  },
  {
    key: "fuel-operations",
    label: "Fuel Operations",
    href: "/settings/fuel-operations",
    requiredPermissions: ["fuel.hq.manage"]
  },
  {
    key: "leave-types",
    label: "Leave Types",
    href: "/settings/leave-types",
    requiredPermissions: ["hr.leave.manage"]
  },
  {
    key: "licenses",
    label: "Licensing",
    href: "/settings/licenses",
    requiredPermissions: ["settings.license.manage"]
  },
  {
    key: "receipt-templates",
    label: "Receipt Templates",
    href: "/settings/receipt-templates",
    requiredPermissions: ["settings.receipt-template.manage"]
  },
] as const;

export const enterpriseFinanceSettingsMenuItems = [
  {
    key: "foundation",
    label: "Finance Overview",
    href: "/finance/foundation",
    requiredPermissions: ["finance.setup.manage"]
  },
  {
    key: "fiscal-calendar",
    label: "Fiscal Calendar",
    href: "/finance/fiscal-calendar",
    requiredPermissions: ["finance.setup.manage"]
  },
  {
    key: "multi-currency",
    label: "Multi Currency",
    href: "/finance/multi-currency",
    requiredPermissions: ["finance.setup.manage"]
  },
  {
    key: "chart-of-accounts",
    label: "Chart of Accounts",
    href: "/finance/chart-of-accounts",
    requiredPermissions: ["finance.setup.manage"]
  },
  {
    key: "posting-setup",
    label: "Posting Setup",
    href: "/finance/posting-setup",
    requiredPermissions: ["finance.setup.manage"]
  },
  {
    key: "party-profiles",
    label: "Party Profiles",
    href: "/finance/party-profiles",
    requiredPermissions: ["finance.setup.manage"]
  },
  {
    key: "document-numbering",
    label: "Document Numbering",
    href: "/finance/document-numbering",
    requiredPermissions: ["finance.setup.manage"]
  },
  {
    key: "operating-foundation",
    label: "Operating Foundation",
    href: "/finance/operating-foundation",
    requiredPermissions: ["finance.setup.manage"]
  }
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
    items: [
      {
        key: "sync",
        label: "Sync",
        href: "/sync",
        requiredPermissions: ["sync.monitor"]
      }
    ]
  }
] as const;

export const enterpriseOnlineStoreMenuItems = [
  {
    key: "online-store-pos",
    label: "POS",
    href: "/online-store",
    requiredPermissions: ["pos.sale.process"]
  }
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
  {
    key: "products",
    label: "Products",
    href: "/inventory/products",
    requiredPermissions: ["inventory.view"]
  },
  {
    key: "shop-prices",
    label: "Shop Prices",
    href: "/inventory/shop-prices",
    requiredPermissions: ["master.product.manage"]
  },
  {
    key: "stock-by-shop",
    label: "Item Dynamic",
    href: "/inventory/stock-by-shop",
    requiredPermissions: ["inventory.view"]
  },
  {
    key: "transfers",
    label: "Transfers",
    href: "/inventory/transfers",
    requiredPermissions: ["inventory.view"]
  },
  {
    key: "in-transit",
    label: "In-Transit",
    href: "/inventory/in-transit",
    requiredPermissions: ["inventory.view"]
  },
  {
    key: "stock-count",
    label: "Stock Count",
    href: "/inventory/stock-count",
    requiredPermissions: ["inventory.view"]
  }
] as const;

export const enterprisePurchasesMenuItems = [
  {
    key: "purchase-orders",
    label: "Purchase orders",
    href: "/purchases/purchase-orders",
    requiredPermissions: ["inventory.view"]
  },
  {
    key: "goods-receipt",
    label: "Goods Receipt",
    href: "/purchases/goods-receipt",
    requiredPermissions: ["inventory.view"]
  },
  {
    key: "predictive-review",
    label: "Predictive Review",
    href: "/purchases/predictive-review",
    requiredPermissions: ["inventory.view"]
  }
] as const;

export const enterpriseFuelOperationsMenuItems = [
  {
    key: "fuel-overview",
    label: "Fuel Overview",
    href: "/fuel-operations",
    requiredPermissions: ["fuel.hq.view"]
  },
  {
    key: "fuel-tanks",
    label: "Tank Management",
    href: "/fuel-operations/tanks",
    requiredPermissions: ["fuel.hq.view"]
  },
  {
    key: "fuel-pumps",
    label: "Pumps & Nozzles",
    href: "/fuel-operations/pumps",
    requiredPermissions: ["fuel.hq.view"]
  },
  {
    key: "fuel-dips",
    label: "Tank Dips",
    href: "/fuel-operations/dips",
    requiredPermissions: ["fuel.hq.view"]
  },
  {
    key: "fuel-meter-readings",
    label: "Meter Readings",
    href: "/fuel-operations/meter-readings",
    requiredPermissions: ["fuel.hq.view"]
  },
  {
    key: "fuel-stations",
    label: "Filling Stations",
    href: "/fuel-operations/stations",
    requiredPermissions: ["fuel.hq.view"]
  },
  {
    key: "fuel-deliveries",
    label: "Fuel Deliveries",
    href: "/fuel-operations/deliveries",
    requiredPermissions: ["fuel.hq.view"]
  },
  {
    key: "fuel-supplier-receipts",
    label: "Supplier Receipts",
    href: "/fuel-operations/supplier-receipts",
    requiredPermissions: ["fuel.hq.view"]
  },
  {
    key: "fuel-reconciliation",
    label: "Reconciliation",
    href: "/fuel-operations#reconciliation",
    requiredPermissions: ["fuel.hq.view"]
  }
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
      {
        key: "ledger",
        label: "Ledger Overview",
        href: "/finance",
        requiredPermissions: ["finance.view"]
      },
      {
        key: "financial-statements",
        label: "Financial Statements",
        href: "/finance/financial-statements",
        requiredPermissions: ["finance.view"]
      },
      {
        key: "trial-balance",
        label: "Trial Balance",
        href: "/finance/trial-balance",
        requiredPermissions: ["finance.view"]
      },
      {
        key: "account-activity",
        label: "Account Activity",
        href: "/finance/account-activity",
        requiredPermissions: ["finance.view"]
      },
      {
        key: "journal-inquiry",
        label: "Journal Inquiry",
        href: "/finance/journal-inquiry",
        requiredPermissions: ["finance.view"]
      },
      {
        key: "journals",
        label: "Manual Journals",
        href: "/finance/journals",
        requiredPermissions: ["finance.manage"]
      },
      {
        key: "recurring-journals",
        label: "Recurring Journals",
        href: "/finance/recurring-journals",
        requiredPermissions: ["finance.manage"]
      }
    ]
  },
  {
    key: "receivables-payables",
    label: "Receivables & Payables",
    items: [
      {
        key: "operational-documents",
        label: "Source Documents",
        href: "/finance/operational-documents",
        requiredPermissions: ["finance.manage"]
      },
      {
        key: "ar-ap-documents",
        label: "AR/AP Documents",
        href: "/finance/ar-ap-documents",
        requiredPermissions: ["finance.manage"]
      },
      {
        key: "ar-ap-settlements",
        label: "Receipts & Payments",
        href: "/finance/ar-ap-settlements",
        requiredPermissions: ["finance.manage"]
      }
    ]
  },
  {
    key: "banking",
    label: "Banking",
    items: [
      {
        key: "cashbook",
        label: "Cashbook",
        href: "/finance/cashbook",
        requiredPermissions: ["finance.manage"]
      },
      {
        key: "bank-reconciliation",
        label: "Bank Reconciliation",
        href: "/finance/bank-reconciliation",
        requiredPermissions: ["finance.manage"]
      }
    ]
  },
  {
    key: "fixed-assets",
    label: "Fixed Assets",
    items: [
      {
        key: "fixed-assets",
        label: "Asset Register",
        href: "/finance/fixed-assets",
        requiredPermissions: ["finance.manage"]
      }
    ]
  },
  {
    key: "planning-payroll",
    label: "Planning & Payroll",
    items: [
      {
        key: "budgets",
        label: "Budgets",
        href: "/finance/budgets",
        requiredPermissions: ["finance.manage"]
      },
      {
        key: "payroll-gl",
        label: "Payroll GL",
        href: "/finance/payroll-gl",
        requiredPermissions: ["finance.manage"]
      }
    ]
  },
  {
    key: "finance-operations",
    label: "POS & Operations",
    items: [
      {
        key: "pos",
        label: "POS",
        href: "/pos",
        requiredPermissions: ["operations.dashboard.view"]
      },
      {
        key: "operations",
        label: "Operations",
        href: "/operations",
        requiredPermissions: ["operations.dashboard.view"]
      }
    ]
  }
] as const;

export const enterpriseFinanceMenuItems = enterpriseFinanceMenuGroups.flatMap((group) => group.items);

export const enterpriseSecurityMenuItems = [
  {
    key: "users",
    label: "Users",
    href: "/security/users",
    requiredPermissions: ["security.user.manage"]
  },
  {
    key: "retail-users",
    label: "Retail Users",
    href: "/settings/retail-users",
    requiredPermissions: ["settings.retail-user.manage"]
  },
  {
    key: "roles-privileges",
    label: "Roles & Privileges",
    href: "/security/roles-privileges",
    requiredPermissions: ["security.role.manage", "security.privilege.manage"]
  },
  {
    key: "audit-logs",
    label: "Audit Logs",
    href: "/security/audit-logs",
    requiredPermissions: ["security.audit-log.view"]
  },
  {
    key: "online-users",
    label: "Online Users",
    href: "/security/online-users",
    requiredPermissions: ["security.online-user.view"]
  },
  {
    key: "password-policy",
    label: "Password Policy",
    href: "/security/password-policy",
    requiredPermissions: ["security.password-policy.manage"]
  },
  {
    key: "security-logs",
    label: "Security Logs",
    href: "/security/security-logs",
    requiredPermissions: ["security.log.view"]
  },
  {
    key: "data-purge",
    label: "Data Purge",
    href: "/security/data-purge",
    requiredPermissions: ["security.data-purge.execute"]
  },
] as const;

export type EnterpriseNavigationAudience = "enterprise" | "online-store";

export type EnterpriseNavigationSection = {
  key: string;
  label: string;
  href: string;
  audience: EnterpriseNavigationAudience;
  requiredPermissions: EnterpriseNavigationPermissionRequirement;
  items?: readonly EnterpriseNavigationMenuItem[];
  groups?: readonly EnterpriseNavigationMenuGroup[];
};

// This catalogue controls menu visibility; page and API authorization remain separate server guards.
export const enterpriseNavigationSections: readonly EnterpriseNavigationSection[] = [
  {
    key: "overview",
    label: "Dashboard",
    href: "/",
    audience: "enterprise",
    requiredPermissions: ["operations.dashboard.view"]
  },
  {
    key: "online-store",
    label: "Online POS",
    href: "/online-store",
    audience: "online-store",
    requiredPermissions: ["pos.sale.process"],
    items: enterpriseOnlineStoreMenuItems
  },
  {
    key: "online-fuel-management",
    label: "Fuel Management",
    href: "/online-store/fuel",
    audience: "online-store",
    requiredPermissions: [
      "fuel.station.view",
      "fuel.tank.manage",
      "fuel.dip.capture",
      "fuel.meter-reading.capture",
      "fuel.supplier-receipt.capture",
      "fuel.reconciliation.manage"
    ],
    items: enterpriseOnlineFuelMenuItems
  },
  {
    key: "master",
    label: "Master",
    href: "/master/customers",
    audience: "enterprise",
    requiredPermissions: [
      "master.customer.manage",
      "master.supplier.manage",
      "master.tax.manage",
      "master.tender.manage",
      "master.bank.manage",
      "master.department.manage",
      "master.category.manage",
      "master.product.manage",
      "master.store.manage",
      "master.loyalty.manage",
      "master.promotion.manage"
    ],
    items: enterpriseMasterMenuItems
  },
  {
    key: "inventory",
    label: "Inventory",
    href: "/inventory/products",
    audience: "enterprise",
    requiredPermissions: ["inventory.view", "master.product.manage"],
    items: enterpriseInventoryMenuItems
  },
  {
    key: "purchases",
    label: "Purchases",
    href: "/purchases/purchase-orders",
    audience: "enterprise",
    requiredPermissions: ["inventory.view"],
    items: enterprisePurchasesMenuItems
  },
  {
    key: "fuel-operations",
    label: "Fuel",
    href: "/fuel-operations",
    audience: "enterprise",
    requiredPermissions: ["fuel.hq.view", "fuel.hq.manage"],
    items: enterpriseFuelOperationsMenuItems
  },
  {
    key: "human-resources",
    label: "Human Resources",
    href: "/human-resources",
    audience: "enterprise",
    requiredPermissions: [
      "hr.view",
      "hr.document.manage",
      "hr.visitor.view",
      "hr.payroll.view",
      "hr.employee-finance.view"
    ],
    items: enterpriseHumanResourcesMenuItems
  },
  {
    key: "finance",
    label: "Finance",
    href: "/finance",
    audience: "enterprise",
    requiredPermissions: [
      "finance.view",
      "finance.manage",
      "finance.post",
      "finance.approve",
      "finance.setup.manage",
      "operations.dashboard.view"
    ],
    groups: enterpriseFinanceMenuGroups
  },
  {
    key: "settings",
    label: "Settings",
    href: "/settings/company",
    audience: "enterprise",
    requiredPermissions: [
      "settings.company.manage",
      "settings.ldap.manage",
      "settings.smtp.manage",
      "settings.sms.manage",
      "settings.license.manage",
      "settings.receipt-template.manage",
      "settings.retail-user.manage",
      "finance.setup.manage",
      "fuel.hq.manage",
      "master.product.manage",
      "hr.leave.manage",
      "operations.dashboard.view",
      "sync.monitor"
    ],
    groups: enterpriseSettingsMenuGroups
  },
  {
    key: "security",
    label: "Security",
    href: "/security/users",
    audience: "enterprise",
    requiredPermissions: [
      "security.user.manage",
      "security.role.manage",
      "security.privilege.manage",
      "security.audit-log.view",
      "security.online-user.view",
      "security.password-policy.manage",
      "security.log.view",
      "security.data-purge.execute",
      "settings.retail-user.manage"
    ],
    items: enterpriseSecurityMenuItems
  },
  {
    key: "reports",
    label: "Reports",
    href: "/reports",
    audience: "enterprise",
    requiredPermissions: ["operations.dashboard.view", "hr.view"]
  }
];

export function hasEnterpriseNavigationPermission(
  requiredPermissions: readonly string[],
  grantedPermissions: ReadonlySet<string>
) {
  return requiredPermissions.some((permissionCode) => grantedPermissions.has(permissionCode));
}

export function filterEnterpriseNavigationSections(
  audience: EnterpriseNavigationAudience,
  grantedPermissions: ReadonlySet<string>
) {
  return enterpriseNavigationSections.flatMap((section) => {
    if (
      section.audience !== audience ||
      !hasEnterpriseNavigationPermission(section.requiredPermissions, grantedPermissions)
    ) {
      return [];
    }

    if (section.groups) {
      const groups = section.groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            hasEnterpriseNavigationPermission(item.requiredPermissions, grantedPermissions)
          )
        }))
        .filter((group) => group.items.length > 0);
      const firstAuthorizedItem = groups[0]?.items[0];

      if (!firstAuthorizedItem) {
        return [];
      }

      const configuredLandingItem = groups
        .flatMap((group) => group.items)
        .find((item) => item.href === section.href);

      return [
        {
          ...section,
          href: configuredLandingItem?.href ?? firstAuthorizedItem.href,
          groups
        }
      ];
    }

    if (section.items) {
      const items = section.items.filter((item) =>
        hasEnterpriseNavigationPermission(item.requiredPermissions, grantedPermissions)
      );

      if (items.length === 0) {
        return [];
      }

      const configuredLandingItem = items.find((item) => item.href === section.href);

      return [
        {
          ...section,
          href: configuredLandingItem?.href ?? items[0].href,
          items
        }
      ];
    }

    return [section];
  });
}

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
  },
  "data-purge": {
    label: "Data Purge",
    heading: "Data Purge",
    description:
      "Irreversibly delete transactional history and selected master data for this organisation.",
    href: "/security/data-purge"
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
