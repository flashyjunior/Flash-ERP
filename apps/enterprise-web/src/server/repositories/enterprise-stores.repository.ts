import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readJsonObject, serializeJsonField } from "./json-field";

import { prisma } from "@/lib/db/prisma";
import {
  ensureEnterpriseStarterReceiptTemplate,
  resolveStoreReceiptTemplateSelection,
} from "@/server/repositories/receipt-template-support";
import { ensureInventoryLocationSalesOrderSchemaCompatibility } from "@/server/repositories/schema-compatibility.repository";
import {
  LocationType,
  PosTransactionStatus,
  RecordStatus,
  SyncEventStatus,
  SyncNodeType
} from "@flash-erp/domain";


const escalatedStatuses: SyncEventStatus[] = [
  SyncEventStatus.FAILED,
  SyncEventStatus.DEAD_LETTER,
];

function formatRelativeTime(value: Date | null) {
  if (!value) {
    return "Not yet";
  }

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - value.getTime()) / 60_000),
  );

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function toIsoString(value: Date | null) {
  return value?.toISOString() ?? null;
}

function latestDate(...values: Array<Date | null | undefined>) {
  return (
    values
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null
  );
}

function normalizeRequiredText(
  value: string | null | undefined,
  fieldLabel: string,
) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    throw new Error(`Flash ERP needs a ${fieldLabel}.`);
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeStoreCode(value: string | null | undefined) {
  return normalizeRequiredText(value, "store code")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function normalizeCode(value: string | null | undefined, fieldLabel: string) {
  return normalizeRequiredText(value, fieldLabel)
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function normalizeOptionalCode(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";

  return normalized.length > 0
    ? normalized.toLowerCase().replace(/\s+/g, "-")
    : null;
}

function normalizeRecordStatus(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? RecordStatus.ACTIVE;

  if (
    normalized === RecordStatus.ACTIVE ||
    normalized === RecordStatus.INACTIVE ||
    normalized === RecordStatus.ARCHIVED
  ) {
    return normalized;
  }

  throw new Error(
    "Flash ERP only supports ACTIVE, INACTIVE, or ARCHIVED for store status.",
  );
}

function normalizeStoreMode(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase().replace(/[\s-]+/g, "_") ?? "OFFLINE_FIRST";

  if (normalized === "OFFLINE_FIRST" || normalized === "ONLINE_DIRECT") {
    return normalized;
  }

  throw new Error("Flash ERP only supports OFFLINE_FIRST or ONLINE_DIRECT store modes.");
}

function formatStoreMode(value: string | null | undefined) {
  return normalizeStoreMode(value) === "ONLINE_DIRECT" ? "Online store" : "Offline-first";
}

function getStoreModeDescription(value: string | null | undefined) {
  return normalizeStoreMode(value) === "ONLINE_DIRECT"
    ? "Browser POS writes directly to the enterprise SQL Server database; sync is not used for store activity."
    : "Store Desktop captures activity locally and syncs with HQ when connectivity is available.";
}

function normalizeLicenseStatus(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "LICENSED";

  if (
    normalized === "LICENSED" ||
    normalized === "UNLICENSED" ||
    normalized === "SUSPENDED" ||
    normalized === "EXPIRED" ||
    normalized === "TRIAL"
  ) {
    return normalized;
  }

  throw new Error(
    "Flash ERP only supports LICENSED, TRIAL, SUSPENDED, EXPIRED, or UNLICENSED license status.",
  );
}

function normalizeCodeList(values: unknown) {
  const source =
    typeof values === "string"
      ? values.split(/[,\n]+/)
      : Array.isArray(values)
        ? values
        : [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawValue of source) {
    if (typeof rawValue !== "string") {
      continue;
    }

    const nextValue = rawValue.trim();
    const duplicateKey = nextValue.toUpperCase();

    if (!nextValue || seen.has(duplicateKey)) {
      continue;
    }

    seen.add(duplicateKey);
    normalized.push(nextValue);
  }

  return normalized;
}

function normalizeIdList(values: unknown) {
  const source =
    typeof values === "string"
      ? values.split(/[,\n]+/)
      : Array.isArray(values)
        ? values
        : [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawValue of source) {
    if (typeof rawValue !== "string") {
      continue;
    }

    const nextValue = rawValue.trim();

    if (!nextValue || seen.has(nextValue)) {
      continue;
    }

    seen.add(nextValue);
    normalized.push(nextValue);
  }

  return normalized;
}

function normalizeLicenseKeyMap(
  values: unknown,
  normalizeKey: (value: string) => string,
) {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return new Map<string, string>();
  }

  const entries = Object.entries(values as Record<string, unknown>);
  const normalized = new Map<string, string>();

  for (const [rawKey, rawValue] of entries) {
    if (typeof rawValue !== "string") {
      continue;
    }

    const key = normalizeKey(rawKey);
    const licenseKey = normalizeOptionalText(rawValue);

    if (key && licenseKey) {
      normalized.set(key, licenseKey);
    }
  }

  return normalized;
}

function normalizeCatalogPolicyJson(input: {
  catalogDepartmentCodes?: unknown;
  catalogCategoryCodes?: unknown;
  catalogProductCodes?: unknown;
}): string | null {
  const departmentCodes = normalizeCodeList(input.catalogDepartmentCodes);
  const categoryCodes = normalizeCodeList(input.catalogCategoryCodes);
  const productCodes = normalizeCodeList(input.catalogProductCodes);

  if (
    departmentCodes.length === 0 &&
    categoryCodes.length === 0 &&
    productCodes.length === 0
  ) {
    return null;
  }

  return serializeJsonField({
    departmentCodes: departmentCodes.length > 0 ? departmentCodes : null,
    categoryCodes: categoryCodes.length > 0 ? categoryCodes : null,
    productCodes: productCodes.length > 0 ? productCodes : null,
  });
}

function readCatalogPolicy(value: Prisma.JsonValue | null | undefined) {
  const record = readJsonObject(value);

  if (Object.keys(record).length === 0) {
    return null;
  }

  const readCodes = (key: string) => {
    const values = normalizeCodeList(record[key]);
    return values.length > 0 ? values : null;
  };

  return {
    departmentCodes: readCodes("departmentCodes"),
    categoryCodes: readCodes("categoryCodes"),
    productCodes: readCodes("productCodes"),
  };
}

function catalogPolicyAllowsProduct(
  policy: ReturnType<typeof readCatalogPolicy>,
  product: {
    code: string;
    department: string | null;
    category: string | null;
  },
) {
  if (!policy) {
    return true;
  }

  const productCode = product.code.trim().toUpperCase();
  const departmentCode = product.department?.trim().toUpperCase() ?? "";
  const categoryCode = product.category?.trim().toUpperCase() ?? "";
  const productCodes = new Set(
    (policy.productCodes ?? []).map((code) => code.trim().toUpperCase()),
  );
  const departmentCodes = new Set(
    (policy.departmentCodes ?? []).map((code) => code.trim().toUpperCase()),
  );
  const categoryCodes = new Set(
    (policy.categoryCodes ?? []).map((code) => code.trim().toUpperCase()),
  );

  return (
    productCodes.has(productCode) ||
    (departmentCode.length > 0 && departmentCodes.has(departmentCode)) ||
    (categoryCode.length > 0 && categoryCodes.has(categoryCode)) ||
    (productCodes.size === 0 &&
      departmentCodes.size === 0 &&
      categoryCodes.size === 0)
  );
}

async function seedDefaultStoreProductPricesForStore(
  tx: Prisma.TransactionClient,
  input: {
    retailOrgId: string;
    storeId: string;
    catalogPolicyJson: Prisma.JsonValue | null | undefined;
  },
) {
  const defaultPriceList = await tx.priceList.findFirst({
    where: {
      retailOrgId: input.retailOrgId,
      isDefault: true,
      status: RecordStatus.ACTIVE,
    },
    select: {
      entries: {
        where: {
          product: {
            status: RecordStatus.ACTIVE,
          },
        },
        select: {
          unitPrice: true,
          product: {
            select: {
              id: true,
              code: true,
              department: true,
              category: true,
            },
          },
        },
      },
    },
  });

  if (!defaultPriceList) {
    return 0;
  }

  const policy = readCatalogPolicy(input.catalogPolicyJson);
  const priceEntries = defaultPriceList.entries.filter((entry) =>
    catalogPolicyAllowsProduct(policy, entry.product),
  );

  if (priceEntries.length === 0) {
    return 0;
  }

  const existingPrices = await tx.storeProductPrice.findMany({
    where: {
      retailOrgId: input.retailOrgId,
      storeId: input.storeId,
      productVariantId: null,
      productId: {
        in: priceEntries.map((entry) => entry.product.id),
      },
    },
    select: {
      id: true,
      productId: true,
      status: true,
    },
  });
  const existingPriceByProductId = new Map(
    existingPrices.map((price) => [price.productId, price] as const),
  );
  let seededCount = 0;

  for (const priceEntry of priceEntries) {
    const existingPrice = existingPriceByProductId.get(priceEntry.product.id);

    if (existingPrice?.status === RecordStatus.ACTIVE) {
      continue;
    }

    if (existingPrice) {
      await tx.storeProductPrice.update({
        where: {
          id: existingPrice.id,
        },
        data: {
          unitPrice: priceEntry.unitPrice,
          status: RecordStatus.ACTIVE,
        },
      });
    } else {
      await tx.storeProductPrice.create({
        data: {
          retailOrgId: input.retailOrgId,
          storeId: input.storeId,
          productId: priceEntry.product.id,
          productVariantId: null,
          unitPrice: priceEntry.unitPrice,
          status: RecordStatus.ACTIVE,
        },
      });
    }

    seededCount += 1;
  }

  return seededCount;
}

function formatCatalogPolicySummary(
  value: Prisma.JsonValue | null | undefined,
) {
  const policy = readCatalogPolicy(value);

  if (!policy) {
    return "All active catalog items";
  }

  const parts = [
    policy.departmentCodes
      ? `${policy.departmentCodes.length} department(s)`
      : null,
    policy.categoryCodes ? `${policy.categoryCodes.length} category(s)` : null,
    policy.productCodes
      ? `${policy.productCodes.length} product override(s)`
      : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(", ") : "All active catalog items";
}

function formatInventoryCatalogSummary(
  catalogLinks: Array<{
    catalog: {
      code: string;
      name: string;
      status: RecordStatus;
      _count: {
        products: number;
      };
    };
  }>,
) {
  const activeCatalogLinks = catalogLinks.filter(
    (link) => link.catalog.status === RecordStatus.ACTIVE,
  );

  if (activeCatalogLinks.length === 0) {
    return "All active catalog items";
  }

  const totalProducts = activeCatalogLinks.reduce(
    (total, link) => total + link.catalog._count.products,
    0,
  );
  const names = activeCatalogLinks
    .slice(0, 3)
    .map((link) => link.catalog.name)
    .join(", ");
  const remaining = activeCatalogLinks.length - 3;

  return `${activeCatalogLinks.length} catalog(s), ${totalProducts} linked product(s): ${names}${
    remaining > 0 ? ` +${remaining} more` : ""
  }`;
}

function generateLicenseKey(scope: "STORE" | "TERMINAL", code: string) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `FLASH-${scope}-${code.toUpperCase()}-${datePart}-${randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;
}

function normalizeOptionalDate(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Flash ERP could not parse that store opening date.");
  }

  return parsed;
}

function normalizeLocationType(value: string | null | undefined) {
  const normalized =
    value?.trim().toUpperCase().replace(/[\s-]+/g, "_") ??
    LocationType.STORE_FLOOR;
  const legacyLocationTypes: Record<string, LocationType> = {
    STORE: LocationType.STORE_FLOOR,
  };
  const aliased = legacyLocationTypes[normalized] ?? normalized;

  if (Object.values(LocationType).includes(aliased as LocationType)) {
    return aliased as LocationType;
  }

  throw new Error("Flash ERP does not recognize that inventory location type.");
}

type StoreOperatingCapabilities = {
  salesEnabled: boolean;
  warehouseEnabled: boolean;
};

function resolveStoreOperatingCapabilities(
  input: {
    salesEnabled?: boolean | null;
    warehouseEnabled?: boolean | null;
  },
  defaults: StoreOperatingCapabilities = {
    salesEnabled: true,
    warehouseEnabled: true,
  },
): StoreOperatingCapabilities {
  const capabilities = {
    salesEnabled:
      typeof input.salesEnabled === "boolean"
        ? input.salesEnabled
        : defaults.salesEnabled,
    warehouseEnabled:
      typeof input.warehouseEnabled === "boolean"
        ? input.warehouseEnabled
        : defaults.warehouseEnabled,
  };

  if (!capabilities.salesEnabled && !capabilities.warehouseEnabled) {
    throw new Error(
      "Flash ERP needs each site to support at least one operating capability: sales, warehouse, or both.",
    );
  }

  return capabilities;
}

async function ensureOnlineDirectStoreInventoryLocation(
  tx: Prisma.TransactionClient,
  input: {
    retailOrgId: string;
    storeId: string;
    storeCode: string;
    storeName: string;
    storeMode: string;
    capabilities: StoreOperatingCapabilities;
  },
) {
  if (normalizeStoreMode(input.storeMode) !== "ONLINE_DIRECT") {
    return false;
  }

  const activeLocations = await tx.inventoryLocation.findMany({
    where: {
      retailOrgId: input.retailOrgId,
      storeId: input.storeId,
      status: RecordStatus.ACTIVE,
    },
    orderBy: [{ createdAt: "asc" }, { code: "asc" }],
    select: {
      id: true,
      useForSalesDefault: true,
      useForSalesOrderDefault: true,
      useForReceivingDefault: true,
    },
  });

  if (activeLocations.length > 0) {
    const firstLocation = activeLocations[0];

    if (!input.capabilities.salesEnabled) {
      await tx.inventoryLocation.updateMany({
        where: {
          retailOrgId: input.retailOrgId,
          storeId: input.storeId,
        },
        data: {
          useForSalesDefault: false,
          useForSalesOrderDefault: false,
        },
      });
    } else if (!activeLocations.some((location) => location.useForSalesDefault)) {
      await tx.inventoryLocation.update({
        where: {
          id: firstLocation.id,
        },
        data: {
          useForSalesDefault: true,
        },
      });
    }

    if (
      input.capabilities.salesEnabled &&
      !activeLocations.some((location) => location.useForSalesOrderDefault)
    ) {
      await tx.inventoryLocation.update({
        where: {
          id: firstLocation.id,
        },
        data: {
          useForSalesOrderDefault: true,
        },
      });
    }

    if (!input.capabilities.warehouseEnabled) {
      await tx.inventoryLocation.updateMany({
        where: {
          retailOrgId: input.retailOrgId,
          storeId: input.storeId,
        },
        data: {
          useForReceivingDefault: false,
        },
      });
    } else if (!activeLocations.some((location) => location.useForReceivingDefault)) {
      await tx.inventoryLocation.update({
        where: {
          id: firstLocation.id,
        },
        data: {
          useForReceivingDefault: true,
        },
      });
    }

    return false;
  }

  const warehouseCode = normalizeCode(`${input.storeCode}-wh`, "warehouse code");
  const locationCode = normalizeCode(`${input.storeCode}-loc`, "inventory location code");
  const existingWarehouse = await tx.warehouse.findFirst({
    where: {
      retailOrgId: input.retailOrgId,
      code: warehouseCode,
    },
    select: {
      id: true,
      storeId: true,
    },
  });

  if (existingWarehouse?.storeId && existingWarehouse.storeId !== input.storeId) {
    throw new Error(
      `Flash ERP cannot attach warehouse "${warehouseCode}" because it belongs to another store.`,
    );
  }

  const warehouse = existingWarehouse
    ? await tx.warehouse.update({
        where: {
          id: existingWarehouse.id,
        },
        data: {
          storeId: input.storeId,
          status: RecordStatus.ACTIVE,
        },
        select: {
          id: true,
        },
      })
    : await tx.warehouse.create({
        data: {
          retailOrgId: input.retailOrgId,
          storeId: input.storeId,
          code: warehouseCode,
          name: `${input.storeName} Warehouse`,
          status: RecordStatus.ACTIVE,
        },
        select: {
          id: true,
        },
      });

  await tx.inventoryLocation.create({
    data: {
      retailOrgId: input.retailOrgId,
      storeId: input.storeId,
      warehouseId: warehouse.id,
      code: locationCode,
      name: `${input.storeName} Sales and Transfer Location`,
      locationType:
        !input.capabilities.salesEnabled && input.capabilities.warehouseEnabled
          ? LocationType.WAREHOUSE
          : LocationType.STORE_FLOOR,
      useForSalesDefault: input.capabilities.salesEnabled,
      useForSalesOrderDefault: input.capabilities.salesEnabled,
      useForReceivingDefault: input.capabilities.warehouseEnabled,
      status: RecordStatus.ACTIVE,
    },
  });

  return true;
}

function formatStoreOperatingMode(capabilities: StoreOperatingCapabilities) {
  if (capabilities.salesEnabled && capabilities.warehouseEnabled) {
    return "Hybrid";
  }

  return capabilities.salesEnabled ? "Sales only" : "Warehouse only";
}

function toStoreMutationError(error: unknown, fallbackMessage: string) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    const target = Array.isArray(error.meta?.target)
      ? error.meta.target.join(",")
      : String(error.meta?.target ?? "");

    if (target.includes("retailOrgId") && target.includes("code")) {
      return new Error(
        "That store or related setup code already exists in Flash ERP enterprise.",
      );
    }

    if (target.includes("storeId") && target.includes("code")) {
      return new Error(
        "That terminal code is already assigned inside this store.",
      );
    }
  }

  return error instanceof Error ? error : new Error(fallbackMessage);
}

type EnterpriseContext = {
  id: string;
  code: string;
  name: string;
  retailOrgId: string;
  retailOrg: {
    name: string;
    baseCurrencyCode: string;
  };
};

async function getEnterpriseContext(): Promise<EnterpriseContext | null> {
  return prisma.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE,
    },
    select: {
      id: true,
      code: true,
      name: true,
      retailOrgId: true,
      retailOrg: {
        select: {
          name: true,
          baseCurrencyCode: true,
        },
      },
    },
  });
}

export type EnterpriseStoresWorkspaceData = {
  metrics: {
    activeStores: number;
    desktopNodes: number;
    terminals: number;
    inventoryLocations: number;
  };
  storeRows: Array<{
    storeName: string;
    storeCode: string;
    storeGroupCode: string | null;
    storeGroupName: string | null;
    storeGroupType: string | null;
    storeGroupLabel: string;
    licenseStatus: string;
    licenseKey: string | null;
    licensedUntil: string | null;
    touchModeEnabled: boolean;
    catalogPolicySummary: string;
    timezone: string;
    currencyCode: string;
    salesEnabled: boolean;
    warehouseEnabled: boolean;
    storeMode: string;
    storeModeLabel: string;
    storeModeDescription: string;
    operatingModeLabel: string;
    terminalCount: number;
    warehouseCount: number;
    locationCount: number;
    nodeCount: number;
    postedTransactions: number;
    stockMovements: number;
    projectionIssues: number;
    lastSyncAt: string | null;
    lastSyncAtLabel: string;
  }>;
  terminalLicenseRows: Array<{
    terminalId: string;
    terminalCode: string;
    terminalName: string;
    storeCode: string;
    storeName: string;
    licenseStatus: string;
    licenseKey: string | null;
    licensedUntil: string | null;
    lastHeartbeatAt: string | null;
    lastHeartbeatAtLabel: string;
  }>;
  coverageMessages: string[];
  priorities: string[];
  statusMessage: string;
  refreshedAt: string;
};

export type ProvisionEnterpriseStoreRequest = {
  storeCode: string;
  storeName: string;
  shortName?: string | null;
  timezone: string;
  currencyCode: string;
  salesEnabled?: boolean | null;
  warehouseEnabled?: boolean | null;
  storeMode?: string | null;
  phone?: string | null;
  email?: string | null;
  managerName?: string | null;
  location?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  storeGroupCode?: string | null;
  storeGroupName?: string | null;
  storeGroupType?: string | null;
  licenseStatus?: string | null;
  licenseKey?: string | null;
  licensedUntil?: string | null;
  touchModeEnabled?: boolean | null;
  catalogDepartmentCodes?: unknown;
  catalogCategoryCodes?: unknown;
  catalogProductCodes?: unknown;
  countryCode?: string | null;
  postalCode?: string | null;
  taxRegistrationNo?: string | null;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  salesReceiptTemplateCode?: string | null;
  salesReceiptTemplateHtml?: string | null;
  openedOn?: string | null;
  primaryWarehouseCode: string;
  primaryWarehouseName: string;
  primaryTerminalCode: string;
  primaryTerminalName: string;
  primaryNodeCode: string;
  primaryNodeName: string;
  primaryLocationCode: string;
  primaryLocationName: string;
  primaryLocationType?: string | null;
};

export type CreateEnterpriseStoreRequest = {
  storeCode: string;
  storeName: string;
  shortName?: string | null;
  timezone: string;
  currencyCode: string;
  salesEnabled?: boolean | null;
  warehouseEnabled?: boolean | null;
  storeMode?: string | null;
  status?: string | null;
  phone?: string | null;
  email?: string | null;
  managerName?: string | null;
  location?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  storeGroupCode?: string | null;
  storeGroupName?: string | null;
  storeGroupType?: string | null;
  licenseStatus?: string | null;
  licenseKey?: string | null;
  licensedUntil?: string | null;
  touchModeEnabled?: boolean | null;
  catalogDepartmentCodes?: unknown;
  catalogCategoryCodes?: unknown;
  catalogProductCodes?: unknown;
  countryCode?: string | null;
  postalCode?: string | null;
  taxRegistrationNo?: string | null;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  salesReceiptTemplateCode?: string | null;
  salesReceiptTemplateHtml?: string | null;
  openedOn?: string | null;
};

export type CreateEnterpriseStoreResponse = {
  storeCode: string;
  status: string;
  message: string;
  serverProcessedAt: string;
};

export type ProvisionEnterpriseStoreResponse = {
  storeCode: string;
  warehouseCode: string;
  terminalCode: string;
  nodeCode: string;
  locationCode: string;
  message: string;
  serverProcessedAt: string;
};

export type ProvisionEnterpriseStoreTopologyRequest = {
  primaryWarehouseCode: string;
  primaryWarehouseName: string;
  primaryTerminalCode: string;
  primaryTerminalName: string;
  primaryNodeCode: string;
  primaryNodeName: string;
  primaryLocationCode: string;
  primaryLocationName: string;
  primaryLocationType?: string | null;
};

export type UpdateEnterpriseStoreRequest = {
  storeName: string;
  shortName?: string | null;
  timezone: string;
  currencyCode: string;
  salesEnabled?: boolean | null;
  warehouseEnabled?: boolean | null;
  storeMode?: string | null;
  status: string;
  phone?: string | null;
  email?: string | null;
  managerName?: string | null;
  location?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  storeGroupCode?: string | null;
  storeGroupName?: string | null;
  storeGroupType?: string | null;
  licenseStatus?: string | null;
  licenseKey?: string | null;
  licensedUntil?: string | null;
  touchModeEnabled?: boolean | null;
  catalogDepartmentCodes?: unknown;
  catalogCategoryCodes?: unknown;
  catalogProductCodes?: unknown;
  countryCode?: string | null;
  postalCode?: string | null;
  taxRegistrationNo?: string | null;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  salesReceiptTemplateCode?: string | null;
  retainLegacyReceiptTemplate?: boolean | null;
  salesReceiptTemplateHtml?: string | null;
  openedOn?: string | null;
};

export type UpdateEnterpriseStoreResponse = {
  storeCode: string;
  status: string;
  message: string;
  serverProcessedAt: string;
};

export type RenewEnterpriseLicensesRequest = {
  storeCodes?: unknown;
  terminalCodes?: unknown;
  terminalIds?: unknown;
  includeAllTerminals?: boolean | null;
  licenseStatus?: string | null;
  licensedUntil?: string | null;
  licenseKey?: string | null;
  storeLicenseKeys?: unknown;
  terminalLicenseKeys?: unknown;
  operatorName?: string | null;
  note?: string | null;
};

export type RenewEnterpriseLicensesResponse = {
  storeCount: number;
  terminalCount: number;
  licensedUntil: string | null;
  message: string;
  serverProcessedAt: string;
};

export function buildUnavailableEnterpriseStoresWorkspace(
  reason: string,
): EnterpriseStoresWorkspaceData {
  return {
    metrics: {
      activeStores: 0,
      desktopNodes: 0,
      terminals: 0,
      inventoryLocations: 0,
    },
    storeRows: [],
    terminalLicenseRows: [],
    coverageMessages: [
      "Store topology and estate health will appear here once Flash ERP can read the enterprise database.",
      "This workspace is intended to connect store setup, node coverage, and canonical posting posture.",
    ],
    priorities: [
      "Start the configured SQL Server service and apply the enterprise schema.",
      "Run the Flash ERP seed script to provision the sample stores, terminals, and warehouses.",
      "Refresh this page once the enterprise node is available.",
    ],
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
  };
}

export async function getEnterpriseStoresWorkspace(): Promise<EnterpriseStoresWorkspaceData> {
  const enterpriseNode = await getEnterpriseContext();

  if (!enterpriseNode) {
    return buildUnavailableEnterpriseStoresWorkspace(
      "No primary enterprise node is available yet, so Flash ERP cannot read store topology.",
    );
  }

  const [
    stores,
    storeNodes,
    transactionGroups,
    inventoryGroups,
    exceptionGroups,
    terminalLicenseRecords,
  ] = await Promise.all([
    prisma.store.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: RecordStatus.ACTIVE,
      },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        code: true,
        name: true,
        region: true,
        storeGroupCode: true,
        storeGroupName: true,
        storeGroupType: true,
        licenseStatus: true,
        licenseKey: true,
        licensedUntil: true,
        touchModeEnabled: true,
        catalogPolicyJson: true,
        inventoryCatalogLinks: {
          where: {
            catalog: {
              deletedAt: null,
            },
          },
          select: {
            catalog: {
              select: {
                code: true,
                name: true,
                status: true,
                _count: {
                  select: {
                    products: true,
                  },
                },
              },
            },
          },
        },
        timezone: true,
        currencyCode: true,
        salesEnabled: true,
        warehouseEnabled: true,
        storeMode: true,
        _count: {
          select: {
            terminals: true,
            warehouses: true,
            inventoryLocations: true,
            syncNodes: true,
          },
        },
      },
    }),
    prisma.syncNode.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        nodeType: SyncNodeType.STORE_DESKTOP,
        status: RecordStatus.ACTIVE,
        storeId: {
          not: null,
        },
      },
      select: {
        storeId: true,
        lastHeartbeatAt: true,
        lastReportedLastSyncAt: true,
        lastTelemetryAt: true,
      },
    }),
    prisma.posTransaction.groupBy({
      by: ["storeId"],
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: PosTransactionStatus.COMPLETED,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.inventoryLedgerEntry.groupBy({
      by: ["storeId"],
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.syncInboundEvent.groupBy({
      by: ["sourceNodeCode"],
      where: {
        syncNodeId: enterpriseNode.id,
        status: {
          in: escalatedStatuses,
        },
      },
      _count: {
        _all: true,
      },
    }),
    prisma.terminal.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: RecordStatus.ACTIVE,
      },
      orderBy: [{ store: { name: "asc" } }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        licenseStatus: true,
        licenseKey: true,
        licensedUntil: true,
        lastHeartbeatAt: true,
        store: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    }),
  ]);

  const transactionCountByStoreId = new Map(
    transactionGroups.map(
      (group) => [group.storeId ?? "unassigned", group._count._all] as const,
    ),
  );
  const inventoryCountByStoreId = new Map(
    inventoryGroups.map(
      (group) => [group.storeId ?? "unassigned", group._count._all] as const,
    ),
  );
  const nodeRowsByStoreId = new Map<
    string,
    Array<{
      lastHeartbeatAt: Date | null;
      lastReportedLastSyncAt: Date | null;
      lastTelemetryAt: Date | null;
    }>
  >();

  for (const node of storeNodes) {
    if (!node.storeId) {
      continue;
    }

    const current = nodeRowsByStoreId.get(node.storeId) ?? [];
    current.push({
      lastHeartbeatAt: node.lastHeartbeatAt,
      lastReportedLastSyncAt: node.lastReportedLastSyncAt,
      lastTelemetryAt: node.lastTelemetryAt,
    });
    nodeRowsByStoreId.set(node.storeId, current);
  }

  const nodeCodesByStoreId = await prisma.syncNode.findMany({
    where: {
      retailOrgId: enterpriseNode.retailOrgId,
      nodeType: SyncNodeType.STORE_DESKTOP,
      status: RecordStatus.ACTIVE,
      storeId: {
        not: null,
      },
    },
    select: {
      storeId: true,
      code: true,
    },
  });

  const exceptionCountByStoreId = new Map<string, number>();
  const exceptionCountByNodeCode = new Map(
    exceptionGroups.map(
      (group) => [group.sourceNodeCode, group._count._all] as const,
    ),
  );

  for (const node of nodeCodesByStoreId) {
    if (!node.storeId) {
      continue;
    }

    exceptionCountByStoreId.set(
      node.storeId,
      (exceptionCountByStoreId.get(node.storeId) ?? 0) +
        (exceptionCountByNodeCode.get(node.code) ?? 0),
    );
  }

  const storeRows = stores
    .map((store) => {
      const nodeRows = nodeRowsByStoreId.get(store.id) ?? [];
      const lastSyncAt =
        nodeRows.length > 0
          ? latestDate(
              ...nodeRows.flatMap((node) => [
                node.lastHeartbeatAt,
                node.lastReportedLastSyncAt,
                node.lastTelemetryAt,
              ]),
            )
          : null;

      return {
        storeName: store.name,
        storeCode: store.code,
        storeGroupCode: store.storeGroupCode,
        storeGroupName: store.storeGroupName,
        storeGroupType: store.storeGroupType,
        storeGroupLabel:
          store.storeGroupName ??
          store.storeGroupCode ??
          store.region ??
          "Ungrouped",
        licenseStatus: store.licenseStatus,
        licenseKey: store.licenseKey,
        licensedUntil: toIsoString(store.licensedUntil),
        touchModeEnabled: store.touchModeEnabled,
        catalogPolicySummary:
          store.inventoryCatalogLinks.length > 0
            ? formatInventoryCatalogSummary(store.inventoryCatalogLinks)
            : formatCatalogPolicySummary(store.catalogPolicyJson),
        timezone: store.timezone,
        currencyCode: store.currencyCode,
        salesEnabled: store.salesEnabled,
        warehouseEnabled: store.warehouseEnabled,
        storeMode: store.storeMode,
        storeModeLabel: formatStoreMode(store.storeMode),
        storeModeDescription: getStoreModeDescription(store.storeMode),
        operatingModeLabel: formatStoreOperatingMode(store),
        terminalCount: store._count.terminals,
        warehouseCount: store._count.warehouses,
        locationCount: store._count.inventoryLocations,
        nodeCount: store._count.syncNodes,
        postedTransactions: transactionCountByStoreId.get(store.id) ?? 0,
        stockMovements: inventoryCountByStoreId.get(store.id) ?? 0,
        projectionIssues: exceptionCountByStoreId.get(store.id) ?? 0,
        lastSyncAt: toIsoString(lastSyncAt),
        lastSyncAtLabel: formatRelativeTime(lastSyncAt),
      };
    })
    .sort((left, right) => {
      if (right.projectionIssues !== left.projectionIssues) {
        return right.projectionIssues - left.projectionIssues;
      }

      if (right.postedTransactions !== left.postedTransactions) {
        return right.postedTransactions - left.postedTransactions;
      }

      return left.storeName.localeCompare(right.storeName);
    });

  const activeStores = storeRows.length;
  const desktopNodes = storeRows.reduce((sum, row) => sum + row.nodeCount, 0);
  const terminals = storeRows.reduce((sum, row) => sum + row.terminalCount, 0);
  const terminalLicenseRows = terminalLicenseRecords.map((terminal) => ({
    terminalId: terminal.id,
    terminalCode: terminal.code,
    terminalName: terminal.name,
    storeCode: terminal.store.code,
    storeName: terminal.store.name,
    licenseStatus: terminal.licenseStatus,
    licenseKey: terminal.licenseKey,
    licensedUntil: toIsoString(terminal.licensedUntil),
    lastHeartbeatAt: toIsoString(terminal.lastHeartbeatAt),
    lastHeartbeatAtLabel: formatRelativeTime(terminal.lastHeartbeatAt),
  }));
  const inventoryLocations = storeRows.reduce(
    (sum, row) => sum + row.locationCount,
    0,
  );
  const salesEnabledStores = storeRows.filter((row) => row.salesEnabled).length;
  const warehouseEnabledStores = storeRows.filter(
    (row) => row.warehouseEnabled,
  ).length;
  const hybridStores = storeRows.filter(
    (row) => row.salesEnabled && row.warehouseEnabled,
  ).length;
  const warehouseOnlyStores = storeRows.filter(
    (row) => row.warehouseEnabled && !row.salesEnabled,
  ).length;
  const onlineStores = storeRows.filter(
    (row) => row.storeMode === "ONLINE_DIRECT",
  ).length;
  const silentSalesStores = storeRows.filter(
    (row) => row.salesEnabled && row.postedTransactions === 0,
  ).length;

  const coverageMessages = [
    `${activeStores} active store profile(s), ${desktopNodes} desktop node(s), and ${terminals} terminal binding(s) are currently saved in Flash ERP enterprise.`,
    onlineStores > 0
      ? `${onlineStores} online store(s) write directly to the enterprise SQL Server database through the browser store workspace instead of using store sync.`
      : "No online-direct stores are configured yet; all active stores currently remain offline-first unless switched in store setup.",
    `${salesEnabledStores} sales-enabled site(s), ${warehouseEnabledStores} warehouse-enabled site(s), and ${hybridStores} hybrid site(s) are currently configured across the estate.`,
    `${inventoryLocations} inventory location(s) are registered across the estate, and ${storeRows.reduce((sum, row) => sum + row.stockMovements, 0)} canonical stock movement(s) have already landed in enterprise.`,
    silentSalesStores > 0
      ? `${silentSalesStores} sales-enabled site(s) have not posted canonical sales yet. Review their node health and local activity before rollout widens.${warehouseOnlyStores > 0 ? ` ${warehouseOnlyStores} warehouse-only site(s) are not expected to post POS sales.` : ""}`
      : warehouseOnlyStores > 0
        ? `${warehouseOnlyStores} warehouse-only site(s) are configured for receiving and transfer execution without POS sales expectations.`
        : "Every sales-enabled site has posted canonical sales or is ready for active rollout.",
  ];

  const priorities: string[] = [];

  const storesWithIssues = storeRows
    .filter((row) => row.projectionIssues > 0)
    .slice(0, 3);

  for (const row of storesWithIssues) {
    priorities.push(
      `${row.storeName} has ${row.projectionIssues} projection issue(s). Review that store's node and canonical movement history before more packets queue behind it.`,
    );
  }

  if (silentSalesStores > 0) {
    priorities.push(
      `${salesEnabledStores - silentSalesStores} of ${salesEnabledStores} sales-enabled store(s) have posted canonical sales so far. Focus rollout support on the silent sales sites next.`,
    );
  }

  if (priorities.length === 0) {
    priorities.push(
      "Store topology and canonical posting look healthy. The next strong move is enabling store-level admin actions and catalog coverage from this workspace.",
    );
  }

  return {
    metrics: {
      activeStores,
      desktopNodes,
      terminals,
      inventoryLocations,
    },
    storeRows,
    terminalLicenseRows,
    coverageMessages,
    priorities,
    statusMessage: `Live Flash ERP store estate from ${enterpriseNode.name} in ${enterpriseNode.retailOrg.name}. Use this workspace to move between store topology, node health, and canonical activity.`,
    refreshedAt: new Date().toISOString(),
  };
}

export async function createEnterpriseStore(
  input: CreateEnterpriseStoreRequest,
): Promise<CreateEnterpriseStoreResponse> {
  await ensureInventoryLocationSalesOrderSchemaCompatibility();

  const storeCode = normalizeStoreCode(input.storeCode);
  const storeName = normalizeRequiredText(input.storeName, "store name");
  const shortName = normalizeOptionalText(input.shortName);
  const timezone = normalizeRequiredText(input.timezone, "timezone");
  const currencyCode = normalizeRequiredText(
    input.currencyCode,
    "currency code",
  ).toUpperCase();
  const capabilities = resolveStoreOperatingCapabilities(input);
  const storeMode = normalizeStoreMode(input.storeMode);
  const status = normalizeRecordStatus(input.status);
  const phone = normalizeOptionalText(input.phone);
  const email = normalizeOptionalText(input.email);
  const managerName = normalizeOptionalText(input.managerName);
  const profileLocation = normalizeOptionalText(input.location);
  const addressLine1 = normalizeOptionalText(input.addressLine1);
  const addressLine2 = normalizeOptionalText(input.addressLine2);
  const city = normalizeOptionalText(input.city);
  const region = normalizeOptionalText(input.region);
  const storeGroupCode = normalizeOptionalCode(
    input.storeGroupCode ?? input.region,
  );
  const storeGroupName = normalizeOptionalText(
    input.storeGroupName ?? input.region,
  );
  const storeGroupType = normalizeOptionalText(
    input.storeGroupType ?? "REGION",
  );
  const licenseStatus = normalizeLicenseStatus(
    input.licenseStatus ?? "UNLICENSED",
  );
  const licenseKey = normalizeOptionalText(input.licenseKey);
  const licensedUntil = normalizeOptionalDate(input.licensedUntil);
  const touchModeEnabled = input.touchModeEnabled !== false;
  const catalogPolicyJson = normalizeCatalogPolicyJson(input);
  const countryCode =
    normalizeOptionalText(input.countryCode)?.toUpperCase() ?? null;
  const postalCode = normalizeOptionalText(input.postalCode);
  const taxRegistrationNo = normalizeOptionalText(input.taxRegistrationNo);
  const receiptHeader = normalizeOptionalText(input.receiptHeader);
  const receiptFooter = normalizeOptionalText(input.receiptFooter);
  const salesReceiptTemplateCode = normalizeOptionalCode(
    input.salesReceiptTemplateCode,
  );
  const salesReceiptTemplateHtml = normalizeOptionalText(
    input.salesReceiptTemplateHtml,
  );
  const openedOn = normalizeOptionalDate(input.openedOn);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await tx.syncNode.findFirst({
        where: {
          nodeType: SyncNodeType.ENTERPRISE,
          isPrimary: true,
          status: RecordStatus.ACTIVE,
        },
        select: {
          retailOrgId: true,
        },
      });

      if (!enterpriseNode) {
        throw new Error(
          "No primary enterprise node is available for store creation.",
        );
      }

      const useLegacyReceiptTemplate = Boolean(
        salesReceiptTemplateHtml && !salesReceiptTemplateCode,
      );
      const defaultReceiptTemplate = useLegacyReceiptTemplate
        ? null
        : await ensureEnterpriseStarterReceiptTemplate(
            tx,
            enterpriseNode.retailOrgId,
          );
      const selectedReceiptTemplate = salesReceiptTemplateCode
        ? await tx.receiptTemplate.findFirst({
            where: {
              retailOrgId: enterpriseNode.retailOrgId,
              code: salesReceiptTemplateCode,
            },
            select: {
              id: true,
            },
          })
        : defaultReceiptTemplate
          ? {
              id: defaultReceiptTemplate.id,
            }
          : null;

      if (salesReceiptTemplateCode && !selectedReceiptTemplate) {
        throw new Error(
          `Flash ERP could not find receipt template "${salesReceiptTemplateCode}" for this enterprise.`,
        );
      }

      const store = await tx.store.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: storeCode,
          name: storeName,
          shortName,
          timezone,
          currencyCode,
          salesEnabled: capabilities.salesEnabled,
          warehouseEnabled: capabilities.warehouseEnabled,
          storeMode,
          status,
          phone,
          email,
          managerName,
          location: profileLocation,
          addressLine1,
          addressLine2,
          city,
          region,
          storeGroupCode,
          storeGroupName,
          storeGroupType,
          licenseStatus,
          licenseKey,
          licensedUntil,
          touchModeEnabled,
          catalogPolicyJson,
          countryCode,
          postalCode,
          taxRegistrationNo,
          receiptHeader,
          receiptFooter,
          salesReceiptTemplateId: selectedReceiptTemplate?.id ?? null,
          salesReceiptTemplateHtml: useLegacyReceiptTemplate
            ? salesReceiptTemplateHtml
            : null,
          openedOn,
        },
        select: {
          id: true,
          code: true,
          name: true,
        },
      });

      const createdInventoryLocation = await ensureOnlineDirectStoreInventoryLocation(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        storeId: store.id,
        storeCode: store.code,
        storeName: store.name,
        storeMode,
        capabilities,
      });

      return {
        storeCode: store.code,
        status,
        message: createdInventoryLocation
          ? `Flash ERP saved ${store.name} with its online sales and transfer inventory location.`
          : `Flash ERP saved ${store.name}. You can now open the store workspace to add topology, terminals, nodes, inventory locations, and receipt settings when you are ready.`,
        serverProcessedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    throw toStoreMutationError(error, "Flash ERP could not create that store.");
  }
}

export async function provisionEnterpriseStore(
  input: ProvisionEnterpriseStoreRequest,
): Promise<ProvisionEnterpriseStoreResponse> {
  await ensureInventoryLocationSalesOrderSchemaCompatibility();

  const storeCode = normalizeStoreCode(input.storeCode);
  const storeName = normalizeRequiredText(input.storeName, "store name");
  const shortName = normalizeOptionalText(input.shortName);
  const timezone = normalizeRequiredText(input.timezone, "timezone");
  const currencyCode = normalizeRequiredText(
    input.currencyCode,
    "currency code",
  ).toUpperCase();
  const capabilities = resolveStoreOperatingCapabilities(input);
  const storeMode = normalizeStoreMode(input.storeMode);
  const phone = normalizeOptionalText(input.phone);
  const email = normalizeOptionalText(input.email);
  const managerName = normalizeOptionalText(input.managerName);
  const profileLocation = normalizeOptionalText(input.location);
  const addressLine1 = normalizeOptionalText(input.addressLine1);
  const addressLine2 = normalizeOptionalText(input.addressLine2);
  const city = normalizeOptionalText(input.city);
  const region = normalizeOptionalText(input.region);
  const storeGroupCode = normalizeOptionalCode(
    input.storeGroupCode ?? input.region,
  );
  const storeGroupName = normalizeOptionalText(
    input.storeGroupName ?? input.region,
  );
  const storeGroupType = normalizeOptionalText(
    input.storeGroupType ?? "REGION",
  );
  const licenseStatus = normalizeLicenseStatus(
    input.licenseStatus ?? "UNLICENSED",
  );
  const licenseKey = normalizeOptionalText(input.licenseKey);
  const licensedUntil = normalizeOptionalDate(input.licensedUntil);
  const touchModeEnabled = input.touchModeEnabled !== false;
  const catalogPolicyJson = normalizeCatalogPolicyJson(input);
  const countryCode =
    normalizeOptionalText(input.countryCode)?.toUpperCase() ?? null;
  const postalCode = normalizeOptionalText(input.postalCode);
  const taxRegistrationNo = normalizeOptionalText(input.taxRegistrationNo);
  const receiptHeader = normalizeOptionalText(input.receiptHeader);
  const receiptFooter = normalizeOptionalText(input.receiptFooter);
  const salesReceiptTemplateCode = normalizeOptionalCode(
    input.salesReceiptTemplateCode,
  );
  const salesReceiptTemplateHtml = normalizeOptionalText(
    input.salesReceiptTemplateHtml,
  );
  const openedOn = normalizeOptionalDate(input.openedOn);
  const warehouseCode = normalizeCode(
    input.primaryWarehouseCode,
    "primary warehouse code",
  );
  const warehouseName = normalizeRequiredText(
    input.primaryWarehouseName,
    "primary warehouse name",
  );
  const terminalCode = normalizeCode(
    input.primaryTerminalCode,
    "primary terminal code",
  );
  const terminalName = normalizeRequiredText(
    input.primaryTerminalName,
    "primary terminal name",
  );
  const nodeCode = normalizeCode(input.primaryNodeCode, "primary node code");
  const nodeName = normalizeRequiredText(
    input.primaryNodeName,
    "primary node name",
  );
  const locationCode = normalizeCode(
    input.primaryLocationCode,
    "primary location code",
  );
  const locationName = normalizeRequiredText(
    input.primaryLocationName,
    "primary location name",
  );
  const requestedLocationType = normalizeLocationType(
    input.primaryLocationType,
  );
  const locationType =
    !capabilities.salesEnabled &&
    capabilities.warehouseEnabled &&
    requestedLocationType === LocationType.STORE_FLOOR
      ? LocationType.WAREHOUSE
      : requestedLocationType;

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await tx.syncNode.findFirst({
        where: {
          nodeType: SyncNodeType.ENTERPRISE,
          isPrimary: true,
          status: RecordStatus.ACTIVE,
        },
        select: {
          id: true,
          code: true,
          retailOrgId: true,
        },
      });

      if (!enterpriseNode) {
        throw new Error(
          "No primary enterprise node is available for store provisioning.",
        );
      }

      const useLegacyReceiptTemplate = Boolean(
        salesReceiptTemplateHtml && !salesReceiptTemplateCode,
      );
      const defaultReceiptTemplate = useLegacyReceiptTemplate
        ? null
        : await ensureEnterpriseStarterReceiptTemplate(
            tx,
            enterpriseNode.retailOrgId,
          );
      const selectedReceiptTemplate = salesReceiptTemplateCode
        ? await tx.receiptTemplate.findFirst({
            where: {
              retailOrgId: enterpriseNode.retailOrgId,
              code: salesReceiptTemplateCode,
            },
            select: {
              id: true,
            },
          })
        : defaultReceiptTemplate
          ? {
              id: defaultReceiptTemplate.id,
            }
          : null;

      if (salesReceiptTemplateCode && !selectedReceiptTemplate) {
        throw new Error(
          `Flash ERP could not find receipt template "${salesReceiptTemplateCode}" for this enterprise.`,
        );
      }

      const store = await tx.store.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: storeCode,
          name: storeName,
          shortName,
          timezone,
          currencyCode,
          salesEnabled: capabilities.salesEnabled,
          warehouseEnabled: capabilities.warehouseEnabled,
          storeMode,
          phone,
          email,
          managerName,
          location: profileLocation,
          addressLine1,
          addressLine2,
          city,
          region,
          storeGroupCode,
          storeGroupName,
          storeGroupType,
          licenseStatus,
          licenseKey,
          licensedUntil,
          touchModeEnabled,
          catalogPolicyJson,
          countryCode,
          postalCode,
          taxRegistrationNo,
          receiptHeader,
          receiptFooter,
          salesReceiptTemplateId: selectedReceiptTemplate?.id ?? null,
          salesReceiptTemplateHtml: useLegacyReceiptTemplate
            ? salesReceiptTemplateHtml
            : null,
          openedOn,
        },
        select: {
          id: true,
          code: true,
          name: true,
        },
      });

      const warehouse = await tx.warehouse.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          storeId: store.id,
          code: warehouseCode,
          name: warehouseName,
        },
        select: {
          id: true,
          code: true,
        },
      });

      const terminal = await tx.terminal.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          storeId: store.id,
          code: terminalCode,
          name: terminalName,
          licenseStatus: "UNLICENSED",
          licenseKey: null,
        },
        select: {
          id: true,
          code: true,
        },
      });

      const syncNode = await tx.syncNode.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          storeId: store.id,
          terminalId: terminal.id,
          code: nodeCode,
          name: nodeName,
          nodeType: SyncNodeType.STORE_DESKTOP,
          direction: "BIDIRECTIONAL",
          isPrimary: true,
          status: RecordStatus.ACTIVE,
        },
        select: {
          id: true,
          code: true,
        },
      });

      const inventoryLocation = await tx.inventoryLocation.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          storeId: store.id,
          warehouseId: warehouse.id,
          code: locationCode,
          name: locationName,
          locationType,
          useForSalesDefault: capabilities.salesEnabled,
          useForSalesOrderDefault: capabilities.salesEnabled,
          useForReceivingDefault: capabilities.warehouseEnabled,
          status: RecordStatus.ACTIVE,
        },
        select: {
          code: true,
        },
      });

      await seedDefaultStoreProductPricesForStore(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        storeId: store.id,
        catalogPolicyJson,
      });

      await tx.syncInboxCheckpoint.upsert({
        where: {
          syncNodeId_remoteNodeCode: {
            syncNodeId: syncNode.id,
            remoteNodeCode: enterpriseNode.code,
          },
        },
        update: {},
        create: {
          syncNodeId: syncNode.id,
          remoteNodeCode: enterpriseNode.code,
        },
      });

      return {
        storeCode: store.code,
        warehouseCode: warehouse.code,
        terminalCode: terminal.code,
        nodeCode: syncNode.code,
        locationCode: inventoryLocation.code,
        message: `Flash ERP provisioned ${store.name} as a ${formatStoreOperatingMode(capabilities).toLowerCase()} site with its primary warehouse, terminal, node, and operating location. The store can now participate in enterprise sync.`,
        serverProcessedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    throw toStoreMutationError(
      error,
      "Flash ERP could not provision that store.",
    );
  }
}

export async function provisionEnterpriseStoreTopology(
  storeCodeInput: string,
  input: ProvisionEnterpriseStoreTopologyRequest,
): Promise<ProvisionEnterpriseStoreResponse> {
  await ensureInventoryLocationSalesOrderSchemaCompatibility();

  const storeCode = normalizeStoreCode(storeCodeInput);
  const warehouseCode = normalizeCode(
    input.primaryWarehouseCode,
    "primary warehouse code",
  );
  const warehouseName = normalizeRequiredText(
    input.primaryWarehouseName,
    "primary warehouse name",
  );
  const terminalCode = normalizeCode(
    input.primaryTerminalCode,
    "primary terminal code",
  );
  const terminalName = normalizeRequiredText(
    input.primaryTerminalName,
    "primary terminal name",
  );
  const nodeCode = normalizeCode(input.primaryNodeCode, "primary node code");
  const nodeName = normalizeRequiredText(
    input.primaryNodeName,
    "primary node name",
  );
  const locationCode = normalizeCode(
    input.primaryLocationCode,
    "primary location code",
  );
  const locationName = normalizeRequiredText(
    input.primaryLocationName,
    "primary location name",
  );
  const requestedLocationType = normalizeLocationType(
    input.primaryLocationType,
  );

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await tx.syncNode.findFirst({
        where: {
          nodeType: SyncNodeType.ENTERPRISE,
          isPrimary: true,
          status: RecordStatus.ACTIVE,
        },
        select: {
          id: true,
          code: true,
          retailOrgId: true,
        },
      });

      if (!enterpriseNode) {
        throw new Error(
          "No primary enterprise node is available for store provisioning.",
        );
      }

      const store = await tx.store.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: storeCode,
        },
        select: {
          id: true,
          code: true,
          name: true,
          salesEnabled: true,
          warehouseEnabled: true,
          catalogPolicyJson: true,
        },
      });

      if (!store) {
        throw new Error(
          `Flash ERP could not find store "${storeCode}". Save the store first.`,
        );
      }

      const capabilities = resolveStoreOperatingCapabilities(store);
      const locationType =
        !capabilities.salesEnabled &&
        capabilities.warehouseEnabled &&
        requestedLocationType === LocationType.STORE_FLOOR
          ? LocationType.WAREHOUSE
          : requestedLocationType;

      const existingWarehouse = await tx.warehouse.findUnique({
        where: {
          retailOrgId_code: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: warehouseCode,
          },
        },
        select: {
          id: true,
          code: true,
          storeId: true,
        },
      });

      if (
        existingWarehouse?.storeId &&
        existingWarehouse.storeId !== store.id
      ) {
        throw new Error(
          `Warehouse "${warehouseCode}" already belongs to another store.`,
        );
      }

      const warehouse = existingWarehouse
        ? await tx.warehouse.update({
            where: {
              id: existingWarehouse.id,
            },
            data: {
              storeId: store.id,
              name: warehouseName,
              status: RecordStatus.ACTIVE,
            },
            select: {
              id: true,
              code: true,
            },
          })
        : await tx.warehouse.create({
            data: {
              retailOrgId: enterpriseNode.retailOrgId,
              storeId: store.id,
              code: warehouseCode,
              name: warehouseName,
            },
            select: {
              id: true,
              code: true,
            },
          });

      const existingTerminal = await tx.terminal.findUnique({
        where: {
          storeId_code: {
            storeId: store.id,
            code: terminalCode,
          },
        },
        select: {
          id: true,
          code: true,
        },
      });

      const terminal = existingTerminal
        ? await tx.terminal.update({
            where: {
              id: existingTerminal.id,
            },
            data: {
              name: terminalName,
              status: RecordStatus.ACTIVE,
            },
            select: {
              id: true,
              code: true,
            },
          })
        : await tx.terminal.create({
            data: {
              retailOrgId: enterpriseNode.retailOrgId,
              storeId: store.id,
              code: terminalCode,
              name: terminalName,
              licenseStatus: "UNLICENSED",
              licenseKey: null,
            },
            select: {
              id: true,
              code: true,
            },
          });

      const existingSyncNode = await tx.syncNode.findUnique({
        where: {
          code: nodeCode,
        },
        select: {
          id: true,
          code: true,
          storeId: true,
        },
      });

      if (existingSyncNode?.storeId && existingSyncNode.storeId !== store.id) {
        throw new Error(
          `Sync node "${nodeCode}" already belongs to another store.`,
        );
      }

      const syncNode = existingSyncNode
        ? await tx.syncNode.update({
            where: {
              id: existingSyncNode.id,
            },
            data: {
              retailOrgId: enterpriseNode.retailOrgId,
              storeId: store.id,
              terminalId: terminal.id,
              name: nodeName,
              nodeType: SyncNodeType.STORE_DESKTOP,
              direction: "BIDIRECTIONAL",
              isPrimary: true,
              status: RecordStatus.ACTIVE,
            },
            select: {
              id: true,
              code: true,
            },
          })
        : await tx.syncNode.create({
            data: {
              retailOrgId: enterpriseNode.retailOrgId,
              storeId: store.id,
              terminalId: terminal.id,
              code: nodeCode,
              name: nodeName,
              nodeType: SyncNodeType.STORE_DESKTOP,
              direction: "BIDIRECTIONAL",
              isPrimary: true,
              status: RecordStatus.ACTIVE,
            },
            select: {
              id: true,
              code: true,
            },
          });

      await tx.syncNode.updateMany({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          storeId: store.id,
          nodeType: SyncNodeType.STORE_DESKTOP,
          id: {
            not: syncNode.id,
          },
          isPrimary: true,
        },
        data: {
          isPrimary: false,
        },
      });

      const existingLocation = await tx.inventoryLocation.findUnique({
        where: {
          retailOrgId_code: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: locationCode,
          },
        },
        select: {
          id: true,
          code: true,
          storeId: true,
        },
      });

      if (existingLocation?.storeId && existingLocation.storeId !== store.id) {
        throw new Error(
          `Inventory location "${locationCode}" already belongs to another store.`,
        );
      }

      const location = existingLocation
        ? await tx.inventoryLocation.update({
            where: {
              id: existingLocation.id,
            },
            data: {
              storeId: store.id,
              warehouseId: warehouse.id,
              name: locationName,
              locationType,
              useForSalesDefault: capabilities.salesEnabled,
              useForSalesOrderDefault: capabilities.salesEnabled,
              useForReceivingDefault: capabilities.warehouseEnabled,
              status: RecordStatus.ACTIVE,
            },
            select: {
              code: true,
            },
          })
        : await tx.inventoryLocation.create({
            data: {
              retailOrgId: enterpriseNode.retailOrgId,
              storeId: store.id,
              warehouseId: warehouse.id,
              code: locationCode,
              name: locationName,
              locationType,
              useForSalesDefault: capabilities.salesEnabled,
              useForSalesOrderDefault: capabilities.salesEnabled,
              useForReceivingDefault: capabilities.warehouseEnabled,
              status: RecordStatus.ACTIVE,
            },
            select: {
              code: true,
            },
          });

      await seedDefaultStoreProductPricesForStore(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        storeId: store.id,
        catalogPolicyJson: store.catalogPolicyJson,
      });

      await tx.syncInboxCheckpoint.upsert({
        where: {
          syncNodeId_remoteNodeCode: {
            syncNodeId: syncNode.id,
            remoteNodeCode: enterpriseNode.code,
          },
        },
        update: {},
        create: {
          syncNodeId: syncNode.id,
          remoteNodeCode: enterpriseNode.code,
        },
      });

      return {
        storeCode: store.code,
        warehouseCode: warehouse.code,
        terminalCode: terminal.code,
        nodeCode: syncNode.code,
        locationCode: location.code,
        message: `Flash ERP provisioned ${store.name} with its primary warehouse, terminal, node, and operating location. The store can now participate in enterprise sync.`,
        serverProcessedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    throw toStoreMutationError(
      error,
      "Flash ERP could not provision that store topology.",
    );
  }
}

export async function updateEnterpriseStore(
  storeCode: string,
  input: UpdateEnterpriseStoreRequest,
): Promise<UpdateEnterpriseStoreResponse> {
  await ensureInventoryLocationSalesOrderSchemaCompatibility();

  const normalizedStoreCode = normalizeStoreCode(storeCode);
  const storeName = normalizeRequiredText(input.storeName, "store name");
  const shortName = normalizeOptionalText(input.shortName);
  const timezone = normalizeRequiredText(input.timezone, "timezone");
  const currencyCode = normalizeRequiredText(
    input.currencyCode,
    "currency code",
  ).toUpperCase();
  const capabilities = resolveStoreOperatingCapabilities(input);
  const storeMode = normalizeStoreMode(input.storeMode);
  const status = normalizeRecordStatus(input.status);
  const phone = normalizeOptionalText(input.phone);
  const email = normalizeOptionalText(input.email);
  const managerName = normalizeOptionalText(input.managerName);
  const location = normalizeOptionalText(input.location);
  const addressLine1 = normalizeOptionalText(input.addressLine1);
  const addressLine2 = normalizeOptionalText(input.addressLine2);
  const city = normalizeOptionalText(input.city);
  const region = normalizeOptionalText(input.region);
  const storeGroupCode = normalizeOptionalCode(
    input.storeGroupCode ?? input.region,
  );
  const storeGroupName = normalizeOptionalText(
    input.storeGroupName ?? input.region,
  );
  const storeGroupType = normalizeOptionalText(
    input.storeGroupType ?? "REGION",
  );
  const licenseStatus =
    input.licenseStatus === undefined
      ? undefined
      : normalizeLicenseStatus(input.licenseStatus);
  const licenseKey =
    input.licenseKey === undefined
      ? undefined
      : normalizeOptionalText(input.licenseKey);
  const licensedUntil =
    input.licensedUntil === undefined
      ? undefined
      : normalizeOptionalDate(input.licensedUntil);
  const touchModeEnabled = input.touchModeEnabled !== false;
  const catalogPolicyJson = normalizeCatalogPolicyJson(input);
  const countryCode =
    normalizeOptionalText(input.countryCode)?.toUpperCase() ?? null;
  const postalCode = normalizeOptionalText(input.postalCode);
  const taxRegistrationNo = normalizeOptionalText(input.taxRegistrationNo);
  const receiptHeader = normalizeOptionalText(input.receiptHeader);
  const receiptFooter = normalizeOptionalText(input.receiptFooter);
  const salesReceiptTemplateCode = normalizeOptionalCode(
    input.salesReceiptTemplateCode,
  );
  const retainLegacyReceiptTemplate =
    input.retainLegacyReceiptTemplate === true;
  const salesReceiptTemplateHtml = normalizeOptionalText(
    input.salesReceiptTemplateHtml,
  );
  const openedOn = normalizeOptionalDate(input.openedOn);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await tx.syncNode.findFirst({
        where: {
          nodeType: SyncNodeType.ENTERPRISE,
          isPrimary: true,
          status: RecordStatus.ACTIVE,
        },
        select: {
          retailOrgId: true,
        },
      });

      if (!enterpriseNode) {
        throw new Error(
          "No primary enterprise node is available for store updates.",
        );
      }

      const store = await tx.store.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: normalizedStoreCode,
        },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          salesReceiptTemplateHtml: true,
        },
      });

      if (!store) {
        throw new Error(
          `Flash ERP could not find store "${normalizedStoreCode}".`,
        );
      }

      const useLegacyReceiptTemplate =
        retainLegacyReceiptTemplate ||
        Boolean(!salesReceiptTemplateCode && salesReceiptTemplateHtml);
      const selectedReceiptTemplate =
        !useLegacyReceiptTemplate && salesReceiptTemplateCode
          ? await tx.receiptTemplate.findFirst({
              where: {
                retailOrgId: enterpriseNode.retailOrgId,
                code: salesReceiptTemplateCode,
              },
              select: {
                id: true,
              },
            })
          : null;

      if (salesReceiptTemplateCode && !selectedReceiptTemplate) {
        throw new Error(
          `Flash ERP could not find receipt template "${salesReceiptTemplateCode}" for this enterprise.`,
        );
      }

      await tx.store.update({
        where: {
          id: store.id,
        },
        data: {
          name: storeName,
          shortName,
          timezone,
          currencyCode,
          salesEnabled: capabilities.salesEnabled,
          warehouseEnabled: capabilities.warehouseEnabled,
          storeMode,
          status,
          phone,
          email,
          managerName,
          location,
          addressLine1,
          addressLine2,
          city,
          region,
          storeGroupCode,
          storeGroupName,
          storeGroupType,
          ...(licenseStatus === undefined ? {} : { licenseStatus }),
          ...(licenseKey === undefined ? {} : { licenseKey }),
          ...(licensedUntil === undefined ? {} : { licensedUntil }),
          touchModeEnabled,
          catalogPolicyJson,
          countryCode,
          postalCode,
          taxRegistrationNo,
          receiptHeader,
          receiptFooter,
          salesReceiptTemplateId: selectedReceiptTemplate?.id ?? null,
          salesReceiptTemplateHtml: retainLegacyReceiptTemplate
            ? store.salesReceiptTemplateHtml
            : useLegacyReceiptTemplate
              ? salesReceiptTemplateHtml
              : null,
          openedOn,
        },
      });

      const activeLocations = await tx.inventoryLocation.findMany({
        where: {
          storeId: store.id,
          status: RecordStatus.ACTIVE,
        },
        orderBy: [{ createdAt: "asc" }, { code: "asc" }],
        select: {
          id: true,
          useForSalesDefault: true,
          useForSalesOrderDefault: true,
          useForReceivingDefault: true,
        },
      });

      if (!capabilities.salesEnabled) {
        await tx.inventoryLocation.updateMany({
          where: {
            storeId: store.id,
          },
          data: {
            useForSalesDefault: false,
            useForSalesOrderDefault: false,
          },
        });
      } else if (
        activeLocations.length > 0 &&
        !activeLocations.some((location) => location.useForSalesDefault)
      ) {
        await tx.inventoryLocation.update({
          where: {
            id: activeLocations[0].id,
          },
          data: {
            useForSalesDefault: true,
          },
        });
      }

      if (
        capabilities.salesEnabled &&
        activeLocations.length > 0 &&
        !activeLocations.some((location) => location.useForSalesOrderDefault)
      ) {
        await tx.inventoryLocation.update({
          where: {
            id: activeLocations[0].id,
          },
          data: {
            useForSalesOrderDefault: true,
          },
        });
      }

      if (!capabilities.warehouseEnabled) {
        await tx.inventoryLocation.updateMany({
          where: {
            storeId: store.id,
          },
          data: {
            useForReceivingDefault: false,
          },
        });
      } else if (
        activeLocations.length > 0 &&
        !activeLocations.some((location) => location.useForReceivingDefault)
      ) {
        await tx.inventoryLocation.update({
          where: {
            id: activeLocations[0].id,
          },
          data: {
            useForReceivingDefault: true,
          },
        });
      }

      const createdInventoryLocation = await ensureOnlineDirectStoreInventoryLocation(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        storeId: store.id,
        storeCode: store.code,
        storeName,
        storeMode,
        capabilities,
      });

      return {
        storeCode: store.code,
        status,
        message: createdInventoryLocation
          ? `Flash ERP updated ${storeName} and created its online sales and transfer inventory location.`
          : `Flash ERP updated ${storeName}. Enterprise store profile, operating mode, contact, and receipt details are now aligned.`,
        serverProcessedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    throw toStoreMutationError(error, "Flash ERP could not update that store.");
  }
}

export async function upsertEnterpriseStoreInventoryLocation(
  storeCode: string,
  input: {
    locationCode?: string | null;
    originalLocationCode?: string | null;
    locationName?: string | null;
    locationType?: string | null;
    warehouseCode?: string | null;
    status?: string | null;
    useForSalesDefault?: boolean | null;
    useForSalesOrderDefault?: boolean | null;
    useForReceivingDefault?: boolean | null;
  },
) {
  await ensureInventoryLocationSalesOrderSchemaCompatibility();

  const normalizedStoreCode = normalizeStoreCode(storeCode);
  const locationCode = normalizeCode(input.locationCode, "inventory location code");
  const originalLocationCode = input.originalLocationCode
    ? normalizeCode(input.originalLocationCode, "original inventory location code")
    : null;
  const locationName = normalizeRequiredText(input.locationName, "inventory location name");
  const locationType = normalizeLocationType(input.locationType);
  const warehouseCode = normalizeOptionalCode(input.warehouseCode);
  const status = normalizeRecordStatus(input.status);
  const useForSalesDefault = input.useForSalesDefault === true;
  const useForSalesOrderDefault = input.useForSalesOrderDefault === true;
  const useForReceivingDefault = input.useForReceivingDefault === true;

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await tx.syncNode.findFirst({
        where: {
          nodeType: SyncNodeType.ENTERPRISE_HQ,
          isPrimary: true,
          status: RecordStatus.ACTIVE,
        },
        select: {
          retailOrgId: true,
        },
      });

      if (!enterpriseNode) {
        throw new Error(
          "No primary enterprise node is available for inventory location setup.",
        );
      }

      const store = await tx.store.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: normalizedStoreCode,
          status: {
            not: RecordStatus.ARCHIVED,
          },
        },
        select: {
          id: true,
          code: true,
          name: true,
          salesEnabled: true,
          warehouseEnabled: true,
        },
      });

      if (!store) {
        throw new Error(`Flash ERP could not find store "${storeCode}".`);
      }

      if (!store.salesEnabled && (useForSalesDefault || useForSalesOrderDefault)) {
        throw new Error(
          `${store.name} is not enabled for POS sales, so it cannot carry sales defaults.`,
        );
      }

      if (!store.warehouseEnabled && useForReceivingDefault) {
        throw new Error(
          `${store.name} is not enabled for warehouse execution, so it cannot carry a receiving default.`,
        );
      }

      const warehouse = warehouseCode
        ? await tx.warehouse.findFirst({
            where: {
              retailOrgId: enterpriseNode.retailOrgId,
              storeId: store.id,
              code: warehouseCode,
            },
            select: {
              id: true,
            },
          })
        : null;

      if (warehouseCode && !warehouse) {
        throw new Error(
          `Flash ERP could not find warehouse "${warehouseCode}" for ${store.name}.`,
        );
      }

      const existingLocation = await tx.inventoryLocation.findUnique({
        where: {
          retailOrgId_code: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: originalLocationCode ?? locationCode,
          },
        },
        select: {
          id: true,
          storeId: true,
        },
      });

      if (originalLocationCode && !existingLocation) {
        throw new Error(
          `Flash ERP could not find inventory location "${originalLocationCode}" for ${store.name}.`,
        );
      }

      if (existingLocation?.storeId && existingLocation.storeId !== store.id) {
        throw new Error(
          `Inventory location "${originalLocationCode ?? locationCode}" already belongs to another store.`,
        );
      }

      if (originalLocationCode && originalLocationCode !== locationCode) {
        const locationCodeConflict = await tx.inventoryLocation.findUnique({
          where: {
            retailOrgId_code: {
              retailOrgId: enterpriseNode.retailOrgId,
              code: locationCode,
            },
          },
          select: {
            id: true,
          },
        });

        if (locationCodeConflict && locationCodeConflict.id !== existingLocation!.id) {
          throw new Error(
            `Inventory location "${locationCode}" already exists. Choose a different code before saving.`,
          );
        }
      }

      const defaultResetWhere = {
        retailOrgId: enterpriseNode.retailOrgId,
        storeId: store.id,
        ...(existingLocation ? { id: { not: existingLocation.id } } : {}),
      };

      if (useForSalesDefault) {
        await tx.inventoryLocation.updateMany({
          where: defaultResetWhere,
          data: {
            useForSalesDefault: false,
          },
        });
      }

      if (useForSalesOrderDefault) {
        await tx.inventoryLocation.updateMany({
          where: defaultResetWhere,
          data: {
            useForSalesOrderDefault: false,
          },
        });
      }

      if (useForReceivingDefault) {
        await tx.inventoryLocation.updateMany({
          where: defaultResetWhere,
          data: {
            useForReceivingDefault: false,
          },
        });
      }

      const location = existingLocation
        ? await tx.inventoryLocation.update({
            where: {
              id: existingLocation.id,
            },
            data: {
              storeId: store.id,
              warehouseId: warehouse?.id ?? null,
              code: locationCode,
              name: locationName,
              locationType,
              status,
              useForSalesDefault,
              useForSalesOrderDefault,
              useForReceivingDefault,
            },
            select: {
              code: true,
              name: true,
            },
          })
        : await tx.inventoryLocation.create({
            data: {
              retailOrgId: enterpriseNode.retailOrgId,
              storeId: store.id,
              warehouseId: warehouse?.id ?? null,
              code: locationCode,
              name: locationName,
              locationType,
              status,
              useForSalesDefault,
              useForSalesOrderDefault,
              useForReceivingDefault,
            },
            select: {
              code: true,
              name: true,
            },
          });

      return {
        storeCode: store.code,
        locationCode: location.code,
        locationName: location.name,
        message: `Flash ERP saved ${location.name} as an inventory location for ${store.name}.`,
        serverProcessedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    throw toStoreMutationError(
      error,
      "Flash ERP could not save that inventory location.",
    );
  }
}

export async function renewEnterpriseLicenses(
  input: RenewEnterpriseLicensesRequest,
): Promise<RenewEnterpriseLicensesResponse> {
  const storeCodes = normalizeCodeList(input.storeCodes).map((code) =>
    normalizeStoreCode(code),
  );
  const terminalCodes = normalizeCodeList(input.terminalCodes).map((code) =>
    normalizeCode(code, "terminal code"),
  );
  const terminalIds = normalizeIdList(input.terminalIds);
  const includeAllTerminals = input.includeAllTerminals ?? false;
  const licenseStatus = normalizeLicenseStatus(input.licenseStatus);
  const licenseNeedsKey = licenseStatus === "LICENSED" || licenseStatus === "TRIAL";
  const licensedUntil =
    normalizeOptionalDate(input.licensedUntil) ??
    (licenseNeedsKey
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      : null);
  const sharedLicenseKey = normalizeOptionalText(input.licenseKey);
  const storeLicenseKeys = normalizeLicenseKeyMap(input.storeLicenseKeys, (value) =>
    normalizeStoreCode(value),
  );
  const terminalLicenseKeys = normalizeLicenseKeyMap(input.terminalLicenseKeys, (value) =>
    value.trim(),
  );
  const operatorName =
    normalizeOptionalText(input.operatorName) ?? "Enterprise administrator";
  const note = normalizeOptionalText(input.note);

  if (
    storeCodes.length === 0 &&
    terminalCodes.length === 0 &&
    terminalIds.length === 0
  ) {
    throw new Error(
      "Flash ERP needs at least one shop or terminal selected for license renewal.",
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await tx.syncNode.findFirst({
        where: {
          nodeType: SyncNodeType.ENTERPRISE,
          isPrimary: true,
          status: RecordStatus.ACTIVE,
        },
        select: {
          retailOrgId: true,
        },
      });

      if (!enterpriseNode) {
        throw new Error(
          "No primary enterprise node is available for license renewal.",
        );
      }

      const stores =
        storeCodes.length > 0
          ? await tx.store.findMany({
              where: {
                retailOrgId: enterpriseNode.retailOrgId,
                code: {
                  in: storeCodes,
                },
              },
              select: {
                id: true,
                code: true,
                licenseStatus: true,
                licenseKey: true,
                licensedUntil: true,
              },
            })
          : [];
      const missingStoreCodes = storeCodes.filter(
        (code) => !stores.some((store) => store.code === code),
      );

      if (missingStoreCodes.length > 0) {
        throw new Error(
          `Flash ERP could not find shop(s) ${missingStoreCodes.join(", ")}.`,
        );
      }

      const terminalWhere: Prisma.TerminalWhereInput = {
        retailOrgId: enterpriseNode.retailOrgId,
      };

      if (includeAllTerminals && stores.length > 0) {
        terminalWhere.storeId = {
          in: stores.map((store) => store.id),
        };
      }

      if (terminalCodes.length > 0) {
        terminalWhere.OR = [
          ...(terminalWhere.OR ?? []),
          {
            code: {
              in: terminalCodes,
            },
          },
        ];
      }

      if (terminalIds.length > 0) {
        terminalWhere.OR = [
          ...(terminalWhere.OR ?? []),
          {
            id: {
              in: terminalIds,
            },
          },
        ];
      }

      const terminals =
        includeAllTerminals || terminalCodes.length > 0 || terminalIds.length > 0
          ? await tx.terminal.findMany({
              where: terminalWhere,
              select: {
                id: true,
                code: true,
                storeId: true,
                licenseStatus: true,
                licenseKey: true,
                licensedUntil: true,
              },
            })
          : [];
      const missingTerminalCodes = terminalCodes.filter(
        (code) => !terminals.some((terminal) => terminal.code === code),
      );

      if (missingTerminalCodes.length > 0) {
        throw new Error(
          `Flash ERP could not find terminal(s) ${missingTerminalCodes.join(", ")}.`,
        );
      }

      for (const store of stores) {
        const licenseKey =
          storeLicenseKeys.get(store.code) ??
          sharedLicenseKey ??
          (licenseNeedsKey ? generateLicenseKey("STORE", store.code) : null);
        await tx.store.update({
          where: {
            id: store.id,
          },
          data: {
            licenseStatus,
            licenseKey,
            licensedUntil,
          },
        });
        await tx.licenseEvent.create({
          data: {
            retailOrgId: enterpriseNode.retailOrgId,
            storeId: store.id,
            scope: "STORE",
            action: "RENEW",
            previousStatus: store.licenseStatus,
            newStatus: licenseStatus,
            previousLicensedUntil: store.licensedUntil,
            newLicensedUntil: licensedUntil,
            previousLicenseKey: store.licenseKey,
            newLicenseKey: licenseKey,
            operatorName,
            note,
          },
        });
      }

      for (const terminal of terminals) {
        const licenseKey =
          terminalLicenseKeys.get(terminal.id) ??
          terminalLicenseKeys.get(terminal.code) ??
          sharedLicenseKey ??
          (licenseNeedsKey
            ? generateLicenseKey("TERMINAL", terminal.code)
            : null);
        await tx.terminal.update({
          where: {
            id: terminal.id,
          },
          data: {
            licenseStatus,
            licenseKey,
            licensedUntil,
          },
        });
        await tx.licenseEvent.create({
          data: {
            retailOrgId: enterpriseNode.retailOrgId,
            storeId: terminal.storeId,
            terminalId: terminal.id,
            scope: "TERMINAL",
            action: "RENEW",
            previousStatus: terminal.licenseStatus,
            newStatus: licenseStatus,
            previousLicensedUntil: terminal.licensedUntil,
            newLicensedUntil: licensedUntil,
            previousLicenseKey: terminal.licenseKey,
            newLicenseKey: licenseKey,
            operatorName,
            note,
          },
        });
      }

      return {
        storeCount: stores.length,
        terminalCount: terminals.length,
        licensedUntil: toIsoString(licensedUntil),
        message: `Flash ERP renewed ${stores.length} shop license(s) and ${terminals.length} terminal license(s). The next downstream sync will carry the updated license keys and expiry dates.`,
        serverProcessedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    throw toStoreMutationError(
      error,
      "Flash ERP could not renew those licenses.",
    );
  }
}

export type EnterpriseStoreDetailData = {
  currencyCode: string;
  store: {
    id: string;
    code: string;
    name: string;
    shortName: string | null;
    timezone: string;
    currencyCode: string;
    salesEnabled: boolean;
    warehouseEnabled: boolean;
    storeMode: string;
    storeModeLabel: string;
    storeModeDescription: string;
    operatingModeLabel: string;
    phone: string | null;
    email: string | null;
    managerName: string | null;
    location: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
    storeGroupCode: string | null;
    storeGroupName: string | null;
    storeGroupType: string | null;
    licenseStatus: string;
    licenseKey: string | null;
    licensedUntil: string | null;
    touchModeEnabled: boolean;
    catalogPolicy: {
      departmentCodes: string[] | null;
      categoryCodes: string[] | null;
      productCodes: string[] | null;
    } | null;
    catalogPolicySummary: string;
    inventoryCatalogs: Array<{
      catalogCode: string;
      name: string;
      status: string;
      productCount: number;
    }>;
    countryCode: string | null;
    postalCode: string | null;
    taxRegistrationNo: string | null;
    receiptHeader: string | null;
    receiptFooter: string | null;
    receiptTemplateCode: string | null;
    receiptTemplateName: string | null;
    receiptTemplateMode: "default" | "linked" | "legacy";
    receiptTemplateSourceLabel: string;
    salesReceiptTemplateHtml: string | null;
    status: string;
    openedOn: string | null;
  };
  availableReceiptTemplates: Array<{
    receiptTemplateCode: string;
    name: string;
    isDefault: boolean;
    status: string;
    linkedStoreCount: number;
  }>;
  metrics: {
    terminals: number;
    warehouses: number;
    inventoryLocations: number;
    desktopNodes: number;
    postedTransactions: number;
    stockMovements: number;
    projectionIssues: number;
  };
  nodeRows: Array<{
    nodeCode: string;
    nodeName: string;
    terminalCode: string | null;
    health: string | null;
    upstreamQueued: number;
    downstreamQueued: number;
    deadLetter: number;
    lastSyncAt: string | null;
    lastSyncAtLabel: string;
  }>;
  terminalRows: Array<{
    terminalCode: string;
    terminalName: string;
    licenseStatus: string;
    licensedUntil: string | null;
    lastHeartbeatAt: string | null;
    lastHeartbeatAtLabel: string;
  }>;
  warehouseRows: Array<{
    warehouseCode: string;
    warehouseName: string;
    inventoryLocationCount: number;
  }>;
  locationRows: Array<{
    locationCode: string;
    locationName: string;
    locationType: string;
    status: string;
    warehouseCode: string | null;
    useForSalesDefault: boolean;
    useForSalesOrderDefault: boolean;
    useForReceivingDefault: boolean;
  }>;
  recentTransactions: Array<{
    transactionNo: string;
    totalAmount: number;
    completedAt: string | null;
    completedAtLabel: string;
  }>;
  recentInventoryRows: Array<{
    entryId: string;
    productCode: string;
    productName: string;
    movementType: string;
    quantity: number;
    occurredAt: string;
    occurredAtLabel: string;
  }>;
  postureMessages: string[];
  statusMessage: string;
  refreshedAt: string;
};

export async function getEnterpriseStoreDetail(
  storeCode: string,
): Promise<EnterpriseStoreDetailData | null> {
  await ensureInventoryLocationSalesOrderSchemaCompatibility();

  const enterpriseNode = await getEnterpriseContext();

  if (!enterpriseNode) {
    return null;
  }

  await ensureEnterpriseStarterReceiptTemplate(
    prisma,
    enterpriseNode.retailOrgId,
  );

  const topologyStore = await prisma.store.findFirst({
    where: {
      retailOrgId: enterpriseNode.retailOrgId,
      code: storeCode,
    },
    select: {
      id: true,
      code: true,
      name: true,
      storeMode: true,
      salesEnabled: true,
      warehouseEnabled: true,
    },
  });

  if (topologyStore?.storeMode === "ONLINE_DIRECT") {
    await prisma.$transaction((tx) =>
      ensureOnlineDirectStoreInventoryLocation(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        storeId: topologyStore.id,
        storeCode: topologyStore.code,
        storeName: topologyStore.name,
        storeMode: topologyStore.storeMode,
        capabilities: {
          salesEnabled: topologyStore.salesEnabled,
          warehouseEnabled: topologyStore.warehouseEnabled,
        },
      }),
    );
  }

  const store = await prisma.store.findFirst({
    where: {
      retailOrgId: enterpriseNode.retailOrgId,
      code: storeCode,
    },
    select: {
      id: true,
      code: true,
      name: true,
      shortName: true,
      timezone: true,
      currencyCode: true,
      salesEnabled: true,
      warehouseEnabled: true,
      storeMode: true,
      phone: true,
      email: true,
      managerName: true,
      location: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      region: true,
      storeGroupCode: true,
      storeGroupName: true,
      storeGroupType: true,
      licenseStatus: true,
      licenseKey: true,
      licensedUntil: true,
      touchModeEnabled: true,
      catalogPolicyJson: true,
      inventoryCatalogLinks: {
        where: {
          catalog: {
            deletedAt: null,
          },
        },
        orderBy: {
          catalog: {
            name: "asc",
          },
        },
        select: {
          catalog: {
            select: {
              code: true,
              name: true,
              status: true,
              _count: {
                select: {
                  products: true,
                },
              },
            },
          },
        },
      },
      countryCode: true,
      postalCode: true,
      taxRegistrationNo: true,
      receiptHeader: true,
      receiptFooter: true,
      salesReceiptTemplateHtml: true,
      salesReceiptTemplate: {
        select: {
          code: true,
          name: true,
          isDefault: true,
          templateHtml: true,
          updatedAt: true,
        },
      },
      status: true,
      openedOn: true,
      terminals: {
        orderBy: {
          code: "asc",
        },
        select: {
          code: true,
          name: true,
          licenseStatus: true,
          licensedUntil: true,
          lastHeartbeatAt: true,
        },
      },
      warehouses: {
        orderBy: {
          code: "asc",
        },
        select: {
          code: true,
          name: true,
          _count: {
            select: {
              inventoryLocations: true,
            },
          },
        },
      },
      inventoryLocations: {
        orderBy: {
          code: "asc",
        },
        select: {
          code: true,
          name: true,
          locationType: true,
          status: true,
          useForSalesDefault: true,
          useForSalesOrderDefault: true,
          useForReceivingDefault: true,
          warehouse: {
            select: {
              code: true,
            },
          },
        },
      },
      syncNodes: {
        where: {
          nodeType: SyncNodeType.STORE_DESKTOP,
          status: RecordStatus.ACTIVE,
        },
        orderBy: {
          code: "asc",
        },
        select: {
          id: true,
          code: true,
          name: true,
          lastHeartbeatAt: true,
          lastReportedHealth: true,
          lastReportedUpstreamQueued: true,
          lastReportedUpstreamInFlight: true,
          lastReportedDownstreamQueued: true,
          lastReportedDeadLetter: true,
          lastReportedLastSyncAt: true,
          terminal: {
            select: {
              code: true,
            },
          },
        },
      },
    },
  });

  if (!store) {
    return null;
  }

  const nodeCodes = store.syncNodes.map((node) => node.code);

  const [
    postedTransactions,
    stockMovements,
    projectionIssues,
    recentTransactions,
    recentInventoryRows,
    availableReceiptTemplates,
  ] = await Promise.all([
    prisma.posTransaction.count({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        storeId: store.id,
        status: PosTransactionStatus.COMPLETED,
      },
    }),
    prisma.inventoryLedgerEntry.count({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        storeId: store.id,
      },
    }),
    nodeCodes.length > 0
      ? prisma.syncInboundEvent.count({
          where: {
            syncNodeId: enterpriseNode.id,
            sourceNodeCode: {
              in: nodeCodes,
            },
            status: {
              in: escalatedStatuses,
            },
          },
        })
      : Promise.resolve(0),
    prisma.posTransaction.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        storeId: store.id,
        status: PosTransactionStatus.COMPLETED,
      },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      take: 6,
      select: {
        transactionNo: true,
        totalAmount: true,
        completedAt: true,
        createdAt: true,
      },
    }),
    prisma.inventoryLedgerEntry.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        storeId: store.id,
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 6,
      select: {
        id: true,
        movementType: true,
        quantity: true,
        occurredAt: true,
        product: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    }),
    prisma.receiptTemplate.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
        isDefault: true,
        status: true,
        _count: {
          select: {
            salesStores: true,
            accountStores: true,
          },
        },
      },
    }),
  ]);

  const receiptTemplateResolution = resolveStoreReceiptTemplateSelection({
    salesReceiptTemplateHtml: store.salesReceiptTemplateHtml,
    salesReceiptTemplate: store.salesReceiptTemplate,
  });

  return {
    currencyCode: enterpriseNode.retailOrg.baseCurrencyCode,
    store: {
      id: store.id,
      code: store.code,
      name: store.name,
      shortName: store.shortName,
      timezone: store.timezone,
      currencyCode: store.currencyCode,
      salesEnabled: store.salesEnabled,
      warehouseEnabled: store.warehouseEnabled,
      storeMode: store.storeMode,
      storeModeLabel: formatStoreMode(store.storeMode),
      storeModeDescription: getStoreModeDescription(store.storeMode),
      operatingModeLabel: formatStoreOperatingMode(store),
      phone: store.phone,
      email: store.email,
      managerName: store.managerName,
      location: store.location,
      addressLine1: store.addressLine1,
      addressLine2: store.addressLine2,
      city: store.city,
      region: store.region,
      storeGroupCode: store.storeGroupCode,
      storeGroupName: store.storeGroupName,
      storeGroupType: store.storeGroupType,
      licenseStatus: store.licenseStatus,
      licenseKey: store.licenseKey,
      licensedUntil: toIsoString(store.licensedUntil),
      touchModeEnabled: store.touchModeEnabled,
      catalogPolicy: readCatalogPolicy(store.catalogPolicyJson),
      catalogPolicySummary:
        store.inventoryCatalogLinks.length > 0
          ? formatInventoryCatalogSummary(store.inventoryCatalogLinks)
          : formatCatalogPolicySummary(store.catalogPolicyJson),
      inventoryCatalogs: store.inventoryCatalogLinks.map((link) => ({
        catalogCode: link.catalog.code,
        name: link.catalog.name,
        status: link.catalog.status,
        productCount: link.catalog._count.products,
      })),
      countryCode: store.countryCode,
      postalCode: store.postalCode,
      taxRegistrationNo: store.taxRegistrationNo,
      receiptHeader: store.receiptHeader,
      receiptFooter: store.receiptFooter,
      receiptTemplateCode: receiptTemplateResolution.code,
      receiptTemplateName: receiptTemplateResolution.name,
      receiptTemplateMode: receiptTemplateResolution.mode,
      receiptTemplateSourceLabel: receiptTemplateResolution.sourceLabel,
      salesReceiptTemplateHtml: receiptTemplateResolution.html,
      status: store.status,
      openedOn: toIsoString(store.openedOn),
    },
    availableReceiptTemplates: availableReceiptTemplates.map((template) => ({
      receiptTemplateCode: template.code,
      name: template.name,
      isDefault: template.isDefault,
      status: template.status,
      linkedStoreCount:
        template._count.salesStores + template._count.accountStores,
    })),
    metrics: {
      terminals: store.terminals.length,
      warehouses: store.warehouses.length,
      inventoryLocations: store.inventoryLocations.length,
      desktopNodes: store.syncNodes.length,
      postedTransactions,
      stockMovements,
      projectionIssues,
    },
    nodeRows: store.syncNodes.map((node) => {
      const lastSyncAt = latestDate(
        node.lastHeartbeatAt,
        node.lastReportedLastSyncAt,
      );

      return {
        nodeCode: node.code,
        nodeName: node.name,
        terminalCode: node.terminal?.code ?? null,
        health: node.lastReportedHealth,
        upstreamQueued:
          (node.lastReportedUpstreamQueued ?? 0) +
          (node.lastReportedUpstreamInFlight ?? 0),
        downstreamQueued: node.lastReportedDownstreamQueued ?? 0,
        deadLetter: node.lastReportedDeadLetter ?? 0,
        lastSyncAt: toIsoString(lastSyncAt),
        lastSyncAtLabel: formatRelativeTime(lastSyncAt),
      };
    }),
    terminalRows: store.terminals.map((terminal) => ({
      terminalCode: terminal.code,
      terminalName: terminal.name,
      licenseStatus: terminal.licenseStatus,
      licensedUntil: toIsoString(terminal.licensedUntil),
      lastHeartbeatAt: toIsoString(terminal.lastHeartbeatAt),
      lastHeartbeatAtLabel: formatRelativeTime(terminal.lastHeartbeatAt),
    })),
    warehouseRows: store.warehouses.map((warehouse) => ({
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
      inventoryLocationCount: warehouse._count.inventoryLocations,
    })),
    locationRows: store.inventoryLocations.map((location) => ({
      locationCode: location.code,
      locationName: location.name,
      locationType: location.locationType,
      status: location.status,
      warehouseCode: location.warehouse?.code ?? null,
      useForSalesDefault: location.useForSalesDefault,
      useForSalesOrderDefault: location.useForSalesOrderDefault,
      useForReceivingDefault: location.useForReceivingDefault,
    })),
    recentTransactions: recentTransactions.map((transaction) => {
      const completedAt = transaction.completedAt ?? transaction.createdAt;

      return {
        transactionNo: transaction.transactionNo,
        totalAmount: Number(transaction.totalAmount),
        completedAt: toIsoString(completedAt),
        completedAtLabel: formatRelativeTime(completedAt),
      };
    }),
    recentInventoryRows: recentInventoryRows.map((entry) => ({
      entryId: entry.id,
      productCode: entry.product.code,
      productName: entry.product.name,
      movementType: entry.movementType,
      quantity: Number(entry.quantity),
      occurredAt: entry.occurredAt.toISOString(),
      occurredAtLabel: formatRelativeTime(entry.occurredAt),
    })),
    postureMessages: [
      `${store.name} is operating as a ${formatStoreOperatingMode(store).toLowerCase()} site with ${store.syncNodes.length} active desktop node(s), ${store.terminals.length} terminal(s), and ${store.inventoryLocations.length} registered inventory location(s).`,
      store.salesEnabled
        ? "POS sales are enabled for this site, so enterprise expects canonical sales to arrive once rollout is live."
        : "POS sales are disabled for this site, so warehouse execution and stock-control sync are the primary expected workloads.",
      projectionIssues > 0
        ? `${projectionIssues} upstream projection issue(s) are currently attached to this store's desktop nodes.`
        : "No current upstream projection issues are attached to this store.",
      store.salesEnabled && postedTransactions > 0
        ? `${postedTransactions} canonical posted sale(s) and ${stockMovements} stock movement(s) are already visible in enterprise for this store.`
        : store.salesEnabled
          ? "This sales-enabled site has not posted canonical sales into enterprise yet."
          : `${stockMovements} stock movement(s) are already visible for this non-selling site.`,
    ],
    statusMessage: `Flash ERP enterprise is showing store detail for ${store.name}. Use this workspace to move between setup topology, node health, and canonical store activity.`,
    refreshedAt: new Date().toISOString(),
  };
}
