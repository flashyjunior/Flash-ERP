/**
 * Shared metadata describing what the enterprise data purge can delete.
 *
 * Lives outside the repository so the Security workspace client component can
 * render the checkbox list without pulling the Prisma client into the browser
 * bundle.
 */

export type EnterpriseDataPurgeScopeKey =
  | "pos-transactions"
  | "sales-orders"
  | "purchasing"
  | "transfers-counts"
  | "inventory-stock"
  | "cash-banking"
  | "ecommerce-orders"
  | "sync-queues"
  | "finance-journals"
  | "customers"
  | "suppliers"
  | "products"
  | "categories"
  | "departments"
  | "pricing"
  | "promotions"
  | "units-of-measure"
  | "tax-profiles"
  | "tender-methods"
  | "inventory-locations"
  | "ecommerce-accounts";

export type EnterpriseDataPurgeScope = {
  key: EnterpriseDataPurgeScopeKey;
  label: string;
  description: string;
  group: "Transactional" | "Master data";
  /** Transactional scopes are always included and cannot be unticked. */
  alwaysIncluded: boolean;
  /** Scope keys that must also be selected before this one can run. */
  requires: EnterpriseDataPurgeScopeKey[];
};

export const enterpriseDataPurgeScopes: EnterpriseDataPurgeScope[] = [
  {
    key: "pos-transactions",
    label: "POS transactions & shifts",
    description:
      "Sales, returns, exchanges, held baskets, payments, shifts, and saved transaction references.",
    group: "Transactional",
    alwaysIncluded: true,
    requires: []
  },
  {
    key: "sales-orders",
    label: "Sales orders & layaways",
    description: "Sales orders, layaways, order lines, and their stock reservations.",
    group: "Transactional",
    alwaysIncluded: true,
    requires: []
  },
  {
    key: "purchasing",
    label: "Purchasing & receiving",
    description: "Purchase orders, goods receipts, supplier returns, and supplier claims.",
    group: "Transactional",
    alwaysIncluded: true,
    requires: []
  },
  {
    key: "transfers-counts",
    label: "Transfers & stock counts",
    description: "Inter-store transfer requests and stock count sessions.",
    group: "Transactional",
    alwaysIncluded: true,
    requires: []
  },
  {
    key: "inventory-stock",
    label: "Stock balances, serials & batches",
    description:
      "Inventory ledger entries (Item Dynamic stock), serial units, and batch/expiry records.",
    group: "Transactional",
    alwaysIncluded: true,
    requires: []
  },
  {
    key: "cash-banking",
    label: "Cash, banking & expenses",
    description:
      "EOD reconciliations, banking deposits, operating expenses, and customer account ledgers.",
    group: "Transactional",
    alwaysIncluded: true,
    requires: []
  },
  {
    key: "ecommerce-orders",
    label: "Ecommerce orders",
    description:
      "Storefront orders, fulfilments, payments, refund requests, reviews, and status history.",
    group: "Transactional",
    alwaysIncluded: true,
    requires: []
  },
  {
    key: "sync-queues",
    label: "Sync queues",
    description: "Outbox, inbound, checkpoint, and operator-action sync records for every node.",
    group: "Transactional",
    alwaysIncluded: true,
    requires: []
  },
  {
    key: "finance-journals",
    label: "Finance journals",
    description: "General-ledger journal batches, entries, and lines.",
    group: "Transactional",
    alwaysIncluded: true,
    requires: []
  },
  {
    key: "products",
    label: "Products",
    description:
      "Product records with their barcodes, matrix variants, selling units, shop prices, and supplier links.",
    group: "Master data",
    alwaysIncluded: false,
    requires: []
  },
  {
    key: "categories",
    label: "Product categories",
    description: "Category master records. Requires products to be purged as well.",
    group: "Master data",
    alwaysIncluded: false,
    requires: ["products"]
  },
  {
    key: "departments",
    label: "Product departments",
    description: "Department master records. Requires products to be purged as well.",
    group: "Master data",
    alwaysIncluded: false,
    requires: ["products"]
  },
  {
    key: "pricing",
    label: "Price lists & catalogues",
    description: "Price lists, price list entries, and inventory catalogue assignments.",
    group: "Master data",
    alwaysIncluded: false,
    requires: []
  },
  {
    key: "customers",
    label: "Customers",
    description: "Customer master records, loyalty balances, and their account ledgers.",
    group: "Master data",
    alwaysIncluded: false,
    requires: []
  },
  {
    key: "suppliers",
    label: "Suppliers",
    description: "Supplier master records and product-supplier links.",
    group: "Master data",
    alwaysIncluded: false,
    requires: []
  },
  {
    key: "promotions",
    label: "Promotions & gift certificates",
    description: "Promotion campaigns and issued gift certificates.",
    group: "Master data",
    alwaysIncluded: false,
    requires: []
  },
  {
    key: "units-of-measure",
    label: "Units of measure",
    description:
      "Unit-of-measure records and conversion schedules. Requires products to be purged as well.",
    group: "Master data",
    alwaysIncluded: false,
    requires: ["products"]
  },
  {
    key: "tax-profiles",
    label: "Tax profiles",
    description: "Tax profile master records. Requires products to be purged as well.",
    group: "Master data",
    alwaysIncluded: false,
    requires: ["products"]
  },
  {
    key: "tender-methods",
    label: "Tender methods",
    description: "Payment tender method master records and their ecommerce mappings.",
    group: "Master data",
    alwaysIncluded: false,
    requires: []
  },
  {
    key: "inventory-locations",
    label: "Inventory locations & warehouses",
    description:
      "Stock location topology and warehouse records. Shops and terminals are kept.",
    group: "Master data",
    alwaysIncluded: false,
    requires: []
  },
  {
    key: "ecommerce-accounts",
    label: "Ecommerce shopper accounts",
    description:
      "Storefront shopper logins, saved addresses, sessions, and one-time-password challenges.",
    group: "Master data",
    alwaysIncluded: false,
    requires: []
  }
];


export const enterpriseDataPurgeConfirmationText = "PURGE";

export const alwaysIncludedPurgeScopeKeys = enterpriseDataPurgeScopes
  .filter((scope) => scope.alwaysIncluded)
  .map((scope) => scope.key);

export const enterpriseDataPurgeScopeByKey = new Map(
  enterpriseDataPurgeScopes.map((scope) => [scope.key, scope] as const)
);

export type EnterpriseDataPurgeRequest = {
  scopes?: string[] | null;
  confirmationText?: string | null;
};

export type EnterpriseDataPurgeResponse = {
  message: string;
  scopes: EnterpriseDataPurgeScopeKey[];
  deletedCounts: Array<{ model: string; count: number }>;
  totalDeleted: number;
  serverProcessedAt: string;
};
