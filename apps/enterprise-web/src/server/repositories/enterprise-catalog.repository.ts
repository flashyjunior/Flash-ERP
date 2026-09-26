import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import {
  readDocumentNumberFormats,
  type DocumentNumberFormatSettings,
} from "@/server/repositories/enterprise-settings.repository";
import { ensureProductVariantSalesOrderDepositSchemaCompatibility } from "@/server/repositories/schema-compatibility.repository";
import {
  buildEnterprisePageInfo,
  normalizeEnterprisePageInput,
  type EnterprisePageInfo,
  type EnterprisePageInput,
} from "@/server/performance/enterprise-pagination";
import {
  CustomerType,
  ProductType,
  RecordStatus,
  SyncEventStatus,
  SyncNodeType
} from "@flash-erp/domain";


const queueStatuses: SyncEventStatus[] = [
  SyncEventStatus.PENDING,
  SyncEventStatus.IN_FLIGHT,
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

function normalizeCustomerType(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();

  if (!normalized) {
    return null;
  }

  if (Object.values(CustomerType).includes(normalized as CustomerType)) {
    return normalized as CustomerType;
  }

  throw new Error(`Flash ERP does not recognize customer type "${value}".`);
}

function slugifyPriceListPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type EnterpriseContext = {
  id: string;
  code: string;
  name: string;
  retailOrgId: string;
  retailOrg: {
    name: string;
    baseCurrencyCode: string;
    companySettingsJson: Prisma.JsonValue | null;
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
          companySettingsJson: true,
        },
      },
    },
  });
}

export function buildNextEnterpriseProductCode(
  format: DocumentNumberFormatSettings["productCode"],
  existingCodes: string[],
) {
  const prefix = format.prefix.trim().toUpperCase();
  const separator = prefix.endsWith("-") ? "" : "-";
  const codePrefix = `${prefix}${separator}`;
  const escapedPrefix = codePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedPrefix}(\\d+)$`, "i");
  const highestSequence = existingCodes.reduce((highest, code) => {
    const match = pattern.exec(code.trim());
    const sequence = match ? Number(match[1]) : 0;
    return Number.isSafeInteger(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);

  return `${codePrefix}${String(highestSequence + 1).padStart(format.digits, "0")}`;
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

function normalizeProductCode(value: string | null | undefined) {
  return normalizeRequiredText(value, "product code")
    .toUpperCase()
    .replace(/\s+/g, "-");
}

function normalizeCatalogCode(value: string | null | undefined) {
  return normalizeRequiredText(value, "catalog code")
    .toUpperCase()
    .replace(/\s+/g, "-");
}

function normalizeUomCode(value: string | null | undefined) {
  return normalizeRequiredText(value, "unit code")
    .toUpperCase()
    .replace(/\s+/g, "-");
}

function normalizeOptionalDate(
  value: string | null | undefined,
  fieldLabel: string,
) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Flash ERP could not parse ${fieldLabel}.`);
  }

  return parsed;
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

  for (const value of source) {
    if (typeof value !== "string") {
      continue;
    }

    const nextValue = value.trim().toUpperCase().replace(/\s+/g, "-");

    if (!nextValue || seen.has(nextValue)) {
      continue;
    }

    seen.add(nextValue);
    normalized.push(nextValue);
  }

  return normalized;
}

function normalizeStoreCodeList(values: unknown) {
  const source =
    typeof values === "string"
      ? values.split(/[,\n]+/)
      : Array.isArray(values)
        ? values
        : [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of source) {
    if (typeof value !== "string") {
      continue;
    }

    const nextValue = value.trim().toLowerCase().replace(/\s+/g, "-");

    if (!nextValue || seen.has(nextValue)) {
      continue;
    }

    seen.add(nextValue);
    normalized.push(nextValue);
  }

  return normalized;
}

function normalizeInventoryCatalogProducts(
  products: unknown,
  fallbackProductCodes: unknown,
) {
  const seen = new Set<string>();
  const normalized: Array<{ productCode: string; sortOrder: number }> = [];
  const source = Array.isArray(products) && products.length > 0 ? products : null;

  if (source) {
    for (const [index, entry] of source.entries()) {
      const rawProductCode =
        typeof entry === "string"
          ? entry
          : entry && typeof entry === "object" && "productCode" in entry
            ? (entry as { productCode?: unknown }).productCode
            : null;

      if (typeof rawProductCode !== "string") {
        continue;
      }

      const productCode = rawProductCode.trim().toUpperCase().replace(/\s+/g, "-");

      if (!productCode || seen.has(productCode)) {
        continue;
      }

      const rawSortOrder =
        entry && typeof entry === "object" && "sortOrder" in entry
          ? (entry as { sortOrder?: unknown }).sortOrder
          : null;
      const parsedSortOrder =
        typeof rawSortOrder === "number"
          ? rawSortOrder
          : typeof rawSortOrder === "string"
            ? Number(rawSortOrder)
            : Number.NaN;
      const sortOrder =
        Number.isFinite(parsedSortOrder) && parsedSortOrder > 0
          ? Math.trunc(parsedSortOrder)
          : index + 1;

      seen.add(productCode);
      normalized.push({ productCode, sortOrder });
    }

    return normalized;
  }

  return normalizeCodeList(fallbackProductCodes).map((productCode, index) => ({
    productCode,
    sortOrder: index + 1,
  }));
}

function normalizeSku(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.toUpperCase().replace(/\s+/g, "-") : null;
}

function normalizeMatrixCode(value: string | null | undefined, fieldLabel: string) {
  return normalizeRequiredText(value, fieldLabel)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeBarcode(value: string | null | undefined) {
  const normalized = normalizeRequiredText(value, "barcode");
  return normalized.replace(/\s+/g, "").toUpperCase();
}

function normalizeBarcodeType(value: string | null | undefined) {
  return normalizeOptionalText(value)?.toUpperCase() ?? "EAN13";
}

function normalizeMoney(
  value: number | null | undefined,
  fieldLabel: string,
  allowZero = false,
) {
  const normalized = Number(Number(value).toFixed(2));

  if (
    !Number.isFinite(normalized) ||
    (!allowZero && normalized <= 0) ||
    normalized < 0
  ) {
    throw new Error(
      allowZero
        ? `Flash ERP needs ${fieldLabel} to be zero or greater.`
        : `Flash ERP needs ${fieldLabel} to be greater than zero.`,
    );
  }

  return normalized;
}

function normalizeOptionalMoney(
  value: number | null | undefined,
  fieldLabel: string,
) {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeMoney(value, fieldLabel, true);
}

function normalizeOptionalQuantity(
  value: number | null | undefined,
  fieldLabel: string,
) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = Number(Number(value).toFixed(3));

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`Flash ERP needs ${fieldLabel} to be zero or greater.`);
  }

  return normalized;
}

function normalizeOptionalInteger(
  value: number | null | undefined,
  fieldLabel: string,
) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = Math.trunc(Number(value));

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`Flash ERP needs ${fieldLabel} to be zero or greater.`);
  }

  return normalized;
}

function normalizePositiveDecimal(
  value: number | null | undefined,
  fieldLabel: string,
) {
  const normalized = Number(Number(value).toFixed(6));

  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error(`Flash ERP needs ${fieldLabel} to be greater than zero.`);
  }

  return normalized;
}

function normalizeNonNegativeInteger(
  value: number | null | undefined,
  fieldLabel: string,
) {
  const normalized = Math.trunc(Number(value ?? 0));

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`Flash ERP needs ${fieldLabel} to be zero or greater.`);
  }

  return normalized;
}

function normalizeProductType(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? ProductType.STOCK;

  if (Object.values(ProductType).includes(normalized as ProductType)) {
    return normalized as ProductType;
  }

  throw new Error(
    "Flash ERP only supports STOCK, MATRIX, SERVICE, BUNDLE, DIGITAL, or VOUCHER products.",
  );
}

function normalizeProductStatus(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";

  if (
    normalized === RecordStatus.ACTIVE ||
    normalized === RecordStatus.INACTIVE ||
    normalized === RecordStatus.ARCHIVED
  ) {
    return normalized;
  }

  throw new Error(
    "Flash ERP only supports ACTIVE, INACTIVE, or ARCHIVED for catalog status.",
  );
}

function toCatalogMutationError(error: unknown, fallbackMessage: string) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    const target = Array.isArray(error.meta?.target)
      ? error.meta?.target.join(",")
      : String(error.meta?.target ?? "");

    if (target.includes("retailOrgId") && target.includes("code")) {
      return new Error(
        "That product code already exists in Flash ERP enterprise.",
      );
    }

    if (target.includes("sku")) {
      return new Error(
        "That SKU is already assigned to another product in Flash ERP.",
      );
    }

    if (target === "code" || target.includes("Barcode")) {
      return new Error("That barcode is already assigned inside Flash ERP.");
    }
  }

  return error instanceof Error ? error : new Error(fallbackMessage);
}

type CatalogDepartmentOption = {
  code: string;
  name: string;
};

type CatalogCategoryOption = {
  code: string;
  name: string;
  departmentCode: string;
  departmentName: string;
};

function normalizeHierarchyCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

async function getActiveProductHierarchy(retailOrgId: string): Promise<{
  departments: CatalogDepartmentOption[];
  categories: CatalogCategoryOption[];
}> {
  const [departments, categories] = await Promise.all([
    prisma.productDepartment.findMany({
      where: {
        retailOrgId,
        status: RecordStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
      },
    }),
    prisma.productCategory.findMany({
      where: {
        retailOrgId,
        status: RecordStatus.ACTIVE,
        deletedAt: null,
        department: {
          status: RecordStatus.ACTIVE,
          deletedAt: null,
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
        department: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    }),
  ]);

  return {
    departments: departments.map((department) => ({
      code: department.code,
      name: department.name,
    })),
    categories: categories.map((category) => ({
      code: category.code,
      name: category.name,
      departmentCode: category.department.code,
      departmentName: category.department.name,
    })),
  };
}

async function resolveProductHierarchySelection(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  input: {
    department: string | null;
    category: string | null;
  },
) {
  const departmentInput = normalizeOptionalText(input.department);
  const categoryInput = normalizeOptionalText(input.category);
  const normalizedDepartmentCode = departmentInput
    ? normalizeHierarchyCode(departmentInput)
    : null;
  const normalizedCategoryCode = categoryInput
    ? normalizeHierarchyCode(categoryInput)
    : null;

  if (!departmentInput) {
    throw new Error(
      "Flash ERP needs a preset department selected for this product.",
    );
  }

  if (!categoryInput) {
    throw new Error(
      "Flash ERP needs a preset category selected for this product.",
    );
  }

  const department = await tx.productDepartment.findFirst({
    where: {
      retailOrgId,
      status: RecordStatus.ACTIVE,
      deletedAt: null,
      OR: [
        { code: normalizedDepartmentCode ?? undefined },
        { name: departmentInput },
      ],
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });

  if (!department) {
    throw new Error(
      `Flash ERP could not find active department "${departmentInput}".`,
    );
  }

  const category = await tx.productCategory.findFirst({
    where: {
      retailOrgId,
      status: RecordStatus.ACTIVE,
      deletedAt: null,
      departmentId: department.id,
      OR: [
        { code: normalizedCategoryCode ?? undefined },
        { name: categoryInput },
      ],
      department: {
        status: RecordStatus.ACTIVE,
        deletedAt: null,
      },
    },
    select: {
      code: true,
      name: true,
      departmentId: true,
      department: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  });

  if (!category) {
    throw new Error(
      `Flash ERP could not find active category "${categoryInput}" under ${department.name}.`,
    );
  }

  return {
    departmentCode: category?.department.code ?? department?.code ?? null,
    categoryCode: category?.code ?? null,
  };
}

async function resolveProductUomSelection(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  input: {
    unitOfMeasure: string | null | undefined;
    uomScheduleCode?: string | null;
    productType: ProductType;
  },
) {
  const requestedUnitCode = normalizeUomCode(input.unitOfMeasure ?? "EA");
  const scheduleCode =
    normalizeOptionalText(input.uomScheduleCode)?.toUpperCase() ?? null;

  let unit = await tx.unitOfMeasure.findFirst({
    where: {
      retailOrgId,
      code: requestedUnitCode,
      status: RecordStatus.ACTIVE,
      deletedAt: null,
    },
    select: {
      id: true,
      code: true,
    },
  });

  if (!unit) {
    if (requestedUnitCode !== "EA") {
      throw new Error(
        `Flash ERP could not find active unit of measure "${requestedUnitCode}". Create it before linking products.`,
      );
    }

    unit = await tx.unitOfMeasure.create({
      data: {
        retailOrgId,
        code: "EA",
        name: "Each",
        description: "Single retail unit",
        decimalPrecision: 0,
        allowFractionalSale: false,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
      },
    });
  }

  let schedule = scheduleCode
    ? await tx.unitOfMeasureSchedule.findFirst({
        where: {
          retailOrgId,
          code: scheduleCode,
          status: RecordStatus.ACTIVE,
          deletedAt: null,
        },
        select: {
          id: true,
          code: true,
          baseUnitOfMeasure: {
            select: {
              code: true,
            },
          },
        },
      })
    : await tx.unitOfMeasureSchedule.findFirst({
        where: {
          retailOrgId,
          status: RecordStatus.ACTIVE,
          deletedAt: null,
          isDefaultForStock: input.productType === ProductType.STOCK,
        },
        orderBy: [{ isDefaultForStock: "desc" }, { name: "asc" }],
        select: {
          id: true,
          code: true,
          baseUnitOfMeasure: {
            select: {
              code: true,
            },
          },
        },
      });

  if (scheduleCode && !schedule) {
    throw new Error(
      `Flash ERP could not find active UOM schedule "${scheduleCode}".`,
    );
  }

  if (!schedule && input.productType === ProductType.STOCK) {
    schedule = await tx.unitOfMeasureSchedule.create({
      data: {
        retailOrgId,
        code: `${unit.code}-STOCK`,
        name: `${unit.code} stock schedule`,
        description: `Default ${unit.code} stock-item schedule.`,
        baseUnitOfMeasureId: unit.id,
        isDefaultForStock: true,
        status: RecordStatus.ACTIVE,
        lines: {
          create: {
            unitOfMeasureId: unit.id,
            conversionFactor: 1,
            isBaseUnit: true,
            allowSale: true,
            allowPurchase: true,
          },
        },
      },
      select: {
        id: true,
        code: true,
        baseUnitOfMeasure: {
          select: {
            code: true,
          },
        },
      },
    });
  }

  if (schedule && schedule.baseUnitOfMeasure.code !== unit.code) {
    throw new Error(
      `Flash ERP UOM schedule "${schedule.code}" uses ${schedule.baseUnitOfMeasure.code} as its base unit, so it cannot be linked to product unit ${unit.code}.`,
    );
  }

  return {
    unitCode: unit.code,
    unitId: unit.id,
    scheduleId: schedule?.id ?? null,
    scheduleCode: schedule?.code ?? null,
  };
}

export type EnterpriseCatalogWorkspaceData = {
  currencyCode: string;
  suggestedProductCode: string;
  availableDepartments: CatalogDepartmentOption[];
  availableCategories: CatalogCategoryOption[];
  availableTaxProfiles: Array<{
    code: string;
    name: string;
    ratePercent: number;
    isTaxInclusive: boolean;
  }>;
  availableStores: Array<{
    storeCode: string;
    storeName: string;
    region: string | null;
    storeGroupLabel: string;
  }>;
  productPage: EnterprisePageInfo;
  unitOfMeasureRows: Array<{
    uomCode: string;
    name: string;
    description: string | null;
    decimalPrecision: number;
    allowFractionalSale: boolean;
    status: string;
  }>;
  uomScheduleRows: Array<{
    scheduleCode: string;
    name: string;
    description: string | null;
    baseUnitCode: string;
    isDefaultForStock: boolean;
    status: string;
    lineCount: number;
    productCount: number;
    lines: Array<{
      uomCode: string;
      uomName: string;
      conversionFactor: number;
      isBaseUnit: boolean;
      allowSale: boolean;
      allowPurchase: boolean;
    }>;
  }>;
  inventoryCatalogRows: Array<{
    catalogCode: string;
    name: string;
    description: string | null;
    status: string;
    effectiveFrom: string | null;
    effectiveUntil: string | null;
    productCount: number;
    storeCount: number;
    storeSummary: string;
    productSummary: string;
    productLinks: Array<{
      productCode: string;
      productName: string;
      sortOrder: number;
    }>;
    storeLinks: Array<{
      storeCode: string;
      storeName: string;
    }>;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  metrics: {
    activeProducts: number;
    barcodeCoverage: number;
    defaultPriceCoverage: number;
    productsInOperations: number;
    activeCatalogs: number;
    licensedStoresLinked: number;
    uomSchedules: number;
  };
  productRows: Array<{
    productCode: string;
    sku: string | null;
    name: string;
    status: string;
    baseUnitPrice: number;
    baseCostPrice: number | null;
    unitOfMeasure: string;
    uomScheduleCode: string | null;
    barcodeCount: number;
    defaultPrice: number | null;
    priceListCount: number;
    salesLineCount: number;
    inventoryMovementCount: number;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  postureMessages: string[];
  priorities: string[];
  statusMessage: string;
  refreshedAt: string;
};

export function buildUnavailableEnterpriseCatalogWorkspace(
  reason: string,
  input?: EnterprisePageInput,
): EnterpriseCatalogWorkspaceData {
  const productPage = normalizeEnterprisePageInput(input);

  return {
    currencyCode: "USD",
    suggestedProductCode: "PRD-00001",
    availableDepartments: [],
    availableCategories: [],
    availableTaxProfiles: [],
    availableStores: [],
    productPage: buildEnterprisePageInfo(productPage, 0),
    unitOfMeasureRows: [],
    uomScheduleRows: [],
    inventoryCatalogRows: [],
    metrics: {
      activeProducts: 0,
      barcodeCoverage: 0,
      defaultPriceCoverage: 0,
      productsInOperations: 0,
      activeCatalogs: 0,
      licensedStoresLinked: 0,
      uomSchedules: 0,
    },
    productRows: [],
    postureMessages: [
      "Catalog master data will appear here once Flash ERP can read the enterprise database.",
      "This workspace is intended to connect products, barcodes, pricing, and downstream publication posture.",
    ],
    priorities: [
      "Start the configured SQL Server service and apply the enterprise schema.",
      "Run the Flash ERP seed script to provision the sample catalog and default price list.",
      "Refresh this page once the enterprise node is available.",
    ],
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
  };
}

type EnterpriseCatalogWorkspaceLoadOptions = {
  includeAllProducts?: boolean;
};

export async function getEnterpriseCatalogWorkspace(
  input?: EnterprisePageInput,
  options?: EnterpriseCatalogWorkspaceLoadOptions,
): Promise<EnterpriseCatalogWorkspaceData> {
  await ensureProductVariantSalesOrderDepositSchemaCompatibility();

  const enterpriseNode = await getEnterpriseContext();

  if (!enterpriseNode) {
    return buildUnavailableEnterpriseCatalogWorkspace(
      "No primary enterprise node is available yet, so Flash ERP cannot read catalog data.",
      input,
    );
  }

  const productPage = normalizeEnterprisePageInput(input);
  const includeAllProducts = options?.includeAllProducts === true;
  const productBaseWhere: Prisma.ProductWhereInput = {
    retailOrgId: enterpriseNode.retailOrgId,
    deletedAt: null,
  };
  const productListWhere: Prisma.ProductWhereInput = {
    ...productBaseWhere,
    ...(productPage.search
      ? {
          OR: [
            { code: { contains: productPage.search } },
            { sku: { contains: productPage.search } },
            { name: { contains: productPage.search } },
            { status: { contains: productPage.search } },
          ],
        }
      : {}),
  };

  const [
    products,
    productTotal,
    activeProducts,
    barcodeCoverage,
    defaultPriceCoverage,
    productsInOperations,
    productCodesForNumbering,
    downstreamCatalogQueue,
    availableTaxProfiles,
    hierarchy,
    stores,
    unitOfMeasures,
    uomSchedules,
    inventoryCatalogs,
  ] = await Promise.all([
    prisma.product.findMany({
      where: productListWhere,
      orderBy: [{ name: "asc" }, { code: "asc" }],
      ...(includeAllProducts
        ? {}
        : {
            skip: productPage.skip,
            take: productPage.pageSize,
          }),
      select: {
        code: true,
        sku: true,
        name: true,
        status: true,
        baseUnitPrice: true,
        baseCostPrice: true,
        unitOfMeasure: true,
        uomSchedule: {
          select: {
            code: true,
          },
        },
        updatedAt: true,
        _count: {
          select: {
            barcodes: true,
            priceListEntries: true,
            posTransactionLines: true,
            inventoryLedgerEntries: true,
          },
        },
        priceListEntries: {
          where: {
            priceList: {
              isDefault: true,
            },
          },
          take: 1,
          select: {
            unitPrice: true,
          },
        },
      },
    }),
    prisma.product.count({ where: productListWhere }),
    prisma.product.count({
      where: { ...productBaseWhere, status: RecordStatus.ACTIVE },
    }),
    prisma.product.count({
      where: { ...productBaseWhere, barcodes: { some: {} } },
    }),
    prisma.product.count({
      where: {
        ...productBaseWhere,
        priceListEntries: { some: { priceList: { isDefault: true } } },
      },
    }),
    prisma.product.count({
      where: {
        ...productBaseWhere,
        OR: [
          { posTransactionLines: { some: {} } },
          { inventoryLedgerEntries: { some: {} } },
        ],
      },
    }),
    prisma.product.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
      },
      select: {
        code: true,
      },
    }),
    prisma.syncOutboxEvent.count({
      where: {
        syncNodeId: enterpriseNode.id,
        aggregateType: {
          in: ["product", "barcode", "priceList", "priceListEntry"],
        },
        status: {
          in: queueStatuses,
        },
      },
    }),
    prisma.taxProfile.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null,
        status: RecordStatus.ACTIVE,
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
        ratePercent: true,
        isTaxInclusive: true,
      },
    }),
    getActiveProductHierarchy(enterpriseNode.retailOrgId),
    prisma.store.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: RecordStatus.ACTIVE,
      },
      orderBy: [{ region: "asc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
        region: true,
        storeGroupCode: true,
        storeGroupName: true,
        licenseStatus: true,
      },
    }),
    prisma.unitOfMeasure.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null,
      },
      orderBy: [{ code: "asc" }],
      select: {
        code: true,
        name: true,
        description: true,
        decimalPrecision: true,
        allowFractionalSale: true,
        status: true,
      },
    }),
    prisma.unitOfMeasureSchedule.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null,
      },
      orderBy: [{ isDefaultForStock: "desc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
        description: true,
        isDefaultForStock: true,
        status: true,
        baseUnitOfMeasure: {
          select: {
            code: true,
          },
        },
        lines: {
          orderBy: [{ isBaseUnit: "desc" }, { sortOrder: "asc" }],
          select: {
            conversionFactor: true,
            isBaseUnit: true,
            allowSale: true,
            allowPurchase: true,
            unitOfMeasure: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            products: true,
            lines: true,
          },
        },
      },
    }),
    prisma.inventoryCatalog.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null,
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
        description: true,
        status: true,
        effectiveFrom: true,
        effectiveUntil: true,
        updatedAt: true,
        products: {
          orderBy: [{ sortOrder: "asc" }, { product: { name: "asc" } }],
          select: {
            sortOrder: true,
            product: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
        stores: {
          orderBy: [{ store: { name: "asc" } }],
          select: {
            store: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            products: true,
            stores: true,
          },
        },
      },
    }),
  ]);

  const productRows = products.map((product) => ({
    productCode: product.code,
    sku: product.sku,
    name: product.name,
    status: product.status,
    baseUnitPrice: Number(product.baseUnitPrice),
    baseCostPrice:
      product.baseCostPrice === null ? null : Number(product.baseCostPrice),
    unitOfMeasure: product.unitOfMeasure,
    uomScheduleCode: product.uomSchedule?.code ?? null,
    barcodeCount: product._count.barcodes,
    defaultPrice: product.priceListEntries[0]
      ? Number(product.priceListEntries[0].unitPrice)
      : null,
    priceListCount: product._count.priceListEntries,
    salesLineCount: product._count.posTransactionLines,
    inventoryMovementCount: product._count.inventoryLedgerEntries,
    updatedAt: product.updatedAt.toISOString(),
    updatedAtLabel: formatRelativeTime(product.updatedAt),
  }));

  const activeCatalogs = inventoryCatalogs.filter(
    (catalog) => catalog.status === RecordStatus.ACTIVE,
  ).length;
  const licensedStoresLinked = stores.filter(
    (store) =>
      store.licenseStatus === "LICENSED" || store.licenseStatus === "TRIAL",
  ).length;

  const priorities: string[] = [];

  if (barcodeCoverage < activeProducts) {
    priorities.push(
      `${activeProducts - barcodeCoverage} active product(s) are still missing barcode coverage. Fill those gaps before widening scanner-driven rollout.`,
    );
  }

  if (defaultPriceCoverage < activeProducts) {
    priorities.push(
      `${activeProducts - defaultPriceCoverage} active product(s) are missing default sell pricing. Review the price list before stores depend on those items.`,
    );
  }

  if (downstreamCatalogQueue > 0) {
    priorities.push(
      `${downstreamCatalogQueue} catalog publication packet(s) are still queued for store delivery. Review sync posture before assuming master-data rollout is complete.`,
    );
  }

  if (priorities.length === 0) {
    priorities.push(
      "Catalog coverage looks healthy. The next strong move is adding enterprise edit actions and supplier-linked assortment planning.",
    );
  }

  return {
    currencyCode: enterpriseNode.retailOrg.baseCurrencyCode,
    suggestedProductCode: buildNextEnterpriseProductCode(
      readDocumentNumberFormats(enterpriseNode.retailOrg.companySettingsJson).productCode,
      productCodesForNumbering.map((product) => product.code),
    ),
    availableDepartments: hierarchy.departments,
    availableCategories: hierarchy.categories,
    availableTaxProfiles: availableTaxProfiles.map((profile) => ({
      code: profile.code,
      name: profile.name,
      ratePercent: Number(profile.ratePercent),
      isTaxInclusive: profile.isTaxInclusive,
    })),
    availableStores: stores.map((store) => ({
      storeCode: store.code,
      storeName: store.name,
      region: store.region,
      storeGroupLabel:
        store.storeGroupName ??
        store.storeGroupCode ??
        store.region ??
        "Ungrouped",
    })),
    productPage: includeAllProducts
      ? {
          page: 1,
          pageSize: products.length || productPage.pageSize,
          search: productPage.search,
          totalRows: productTotal,
          totalPages: productTotal === 0 ? 0 : 1,
        }
      : buildEnterprisePageInfo(productPage, productTotal),
    unitOfMeasureRows: unitOfMeasures.map((unit) => ({
      uomCode: unit.code,
      name: unit.name,
      description: unit.description,
      decimalPrecision: unit.decimalPrecision,
      allowFractionalSale: unit.allowFractionalSale,
      status: unit.status,
    })),
    uomScheduleRows: uomSchedules.map((schedule) => ({
      scheduleCode: schedule.code,
      name: schedule.name,
      description: schedule.description,
      baseUnitCode: schedule.baseUnitOfMeasure.code,
      isDefaultForStock: schedule.isDefaultForStock,
      status: schedule.status,
      lineCount: schedule._count.lines,
      productCount: schedule._count.products,
      lines: schedule.lines.map((line) => ({
        uomCode: line.unitOfMeasure.code,
        uomName: line.unitOfMeasure.name,
        conversionFactor: Number(line.conversionFactor),
        isBaseUnit: line.isBaseUnit,
        allowSale: line.allowSale,
        allowPurchase: line.allowPurchase,
      })),
    })),
    inventoryCatalogRows: inventoryCatalogs.map((catalog) => ({
      catalogCode: catalog.code,
      name: catalog.name,
      description: catalog.description,
      status: catalog.status,
      effectiveFrom: toIsoString(catalog.effectiveFrom),
      effectiveUntil: toIsoString(catalog.effectiveUntil),
      productCount: catalog._count.products,
      storeCount: catalog._count.stores,
      storeSummary:
        catalog._count.stores === 0
          ? "No shops linked"
          : catalog.stores
              .slice(0, 4)
              .map((link) => link.store.name)
              .join(", ") +
            (catalog._count.stores > catalog.stores.length
              ? ` +${catalog._count.stores - catalog.stores.length} more`
              : ""),
      productSummary:
        catalog._count.products === 0
          ? "No products linked"
          : catalog.products
              .slice(0, 4)
              .map((link) => link.product.name)
              .join(", ") +
            (catalog._count.products > catalog.products.length
              ? ` +${catalog._count.products - catalog.products.length} more`
              : ""),
      productLinks: catalog.products.map((link) => ({
        productCode: link.product.code,
        productName: link.product.name,
        sortOrder: link.sortOrder,
      })),
      storeLinks: catalog.stores.map((link) => ({
        storeCode: link.store.code,
        storeName: link.store.name,
      })),
      updatedAt: catalog.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(catalog.updatedAt),
    })),
    metrics: {
      activeProducts,
      barcodeCoverage,
      defaultPriceCoverage,
      productsInOperations,
      activeCatalogs,
      licensedStoresLinked,
      uomSchedules: uomSchedules.length,
    },
    productRows,
    postureMessages: [
      `${activeProducts} active product(s) are currently visible in Flash ERP enterprise.`,
      `${barcodeCoverage} product(s) have barcode coverage and ${defaultPriceCoverage} product(s) are covered by the default sell price list.`,
      downstreamCatalogQueue > 0
        ? `${downstreamCatalogQueue} downstream catalog packet(s) are still queued for store delivery.`
        : "No downstream catalog publication backlog is currently queued in enterprise.",
    ],
    priorities,
    statusMessage: `Live Flash ERP catalog workspace from ${enterpriseNode.name} in ${enterpriseNode.retailOrg.name}. Use this workspace to move between master data, pricing coverage, and downstream publication posture.`,
    refreshedAt: new Date().toISOString(),
  };
}

export async function getEnterpriseInventoryCatalogWorkspace(): Promise<EnterpriseCatalogWorkspaceData> {
  return getEnterpriseCatalogWorkspace(undefined, { includeAllProducts: true });
}

export type EnterpriseProductDetailData = {
  currencyCode: string;
  product: {
    id: string;
    code: string;
    sku: string | null;
    name: string;
    shortName: string | null;
    description: string | null;
    productType: string;
    department: string | null;
    category: string | null;
    subcategory: string | null;
    brand: string | null;
    seasonCode: string | null;
    unitOfMeasure: string;
    uomScheduleCode: string | null;
    packSize: string | null;
    countryOfOrigin: string | null;
    primaryImageUrl: string | null;
    notes: string | null;
    taxable: boolean;
    trackInventory: boolean;
    trackExpiry: boolean;
    isSerialized: boolean;
    trackSize: boolean;
    trackColor: boolean;
    allowPriceOverride: boolean;
    mustEnterPriceAtPos: boolean;
    minStockLevel: number | null;
    reorderPoint: number | null;
    reorderQuantity: number | null;
    safetyStockLevel: number | null;
    shelfLifeDays: number | null;
    weightKg: number | null;
    volumeLitres: number | null;
    status: string;
    baseUnitPrice: number;
    baseCostPrice: number | null;
    recordVersion: number;
    createdAt: string;
    createdAtLabel: string;
    updatedAt: string;
    updatedAtLabel: string;
  };
  barcodes: Array<{
    code: string;
    barcodeType: string;
  }>;
  taxProfile: {
    code: string;
    name: string;
    ratePercent: number;
    isTaxInclusive: boolean;
  } | null;
  supplierRows: Array<{
    supplierNo: string;
    supplierName: string;
    contactName: string | null;
    supplierSku: string | null;
    supplierProductName: string | null;
    packCostPrice: number | null;
    leadTimeDays: number | null;
    minimumOrderQuantity: number | null;
    isPrimary: boolean;
  }>;
  availableTaxProfiles: Array<{
    code: string;
    name: string;
    ratePercent: number;
    isDefault: boolean;
  }>;
  availableDepartments: CatalogDepartmentOption[];
  availableCategories: CatalogCategoryOption[];
  availableUnitsOfMeasure: Array<{
    uomCode: string;
    name: string;
    decimalPrecision: number;
    allowFractionalSale: boolean;
  }>;
  availableUomSchedules: Array<{
    scheduleCode: string;
    name: string;
    baseUnitCode: string;
    isDefaultForStock: boolean;
  }>;
  availableMatrixAttributes: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    sortOrder: number;
    values: Array<{
      id: string;
      code: string;
      label: string;
      status: string;
      sortOrder: number;
    }>;
  }>;
  availableSuppliers: Array<{
    supplierNo: string;
    name: string;
  }>;
  priceRows: Array<{
    priceListCode: string;
    priceListName: string;
    currencyCode: string;
    unitPrice: number;
    isDefault: boolean;
    customerType: string | null;
    loyaltyTier: string | null;
    status: string;
  }>;
  matrixAttributes: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    sortOrder: number;
    values: Array<{
      id: string;
      code: string;
      label: string;
      status: string;
      sortOrder: number;
    }>;
  }>;
  matrixVariants: Array<{
    id: string;
    code: string;
    sku: string | null;
    displayName: string | null;
    unitPrice: number;
    costPrice: number | null;
    quantityOnHand: number;
    barcode: string | null;
    status: string;
    sortOrder: number;
    attributeValues: Array<{
      attributeCode: string;
      attributeName: string;
      valueCode: string;
      valueLabel: string;
      sortOrder: number;
    }>;
  }>;
  recentInventoryRows: Array<{
    entryId: string;
    movementType: string;
    quantity: number;
    occurredAt: string;
    occurredAtLabel: string;
    storeName: string | null;
    storeCode: string | null;
    externalReference: string | null;
  }>;
  recentSalesRows: Array<{
    transactionNo: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    completedAt: string | null;
    completedAtLabel: string;
    storeName: string;
    storeCode: string;
  }>;
  syncPackets: Array<{
    eventId: string;
    eventType: string;
    status: string;
    targetNodeCode: string | null;
    createdAt: string;
    createdAtLabel: string;
    acknowledgedAt: string | null;
    acknowledgedAtLabel: string;
  }>;
  postureMessages: string[];
  statusMessage: string;
  refreshedAt: string;
};

export async function getEnterpriseProductDetail(
  productCode: string,
): Promise<EnterpriseProductDetailData | null> {
  await ensureProductVariantSalesOrderDepositSchemaCompatibility();

  const enterpriseNode = await getEnterpriseContext();

  if (!enterpriseNode) {
    return null;
  }

  const product = await prisma.product.findFirst({
    where: {
      retailOrgId: enterpriseNode.retailOrgId,
      code: productCode,
      deletedAt: null,
    },
    select: {
      id: true,
      code: true,
      sku: true,
      name: true,
      shortName: true,
      description: true,
      productType: true,
      department: true,
      category: true,
      subcategory: true,
      brand: true,
      seasonCode: true,
      unitOfMeasure: true,
      uomSchedule: {
        select: {
          code: true,
        },
      },
      packSize: true,
      countryOfOrigin: true,
      primaryImageUrl: true,
      notes: true,
      taxable: true,
      trackInventory: true,
      trackExpiry: true,
      isSerialized: true,
      trackSize: true,
      trackColor: true,
      allowPriceOverride: true,
      mustEnterPriceAtPos: true,
      minStockLevel: true,
      reorderPoint: true,
      reorderQuantity: true,
      safetyStockLevel: true,
      shelfLifeDays: true,
      weightKg: true,
      volumeLitres: true,
      status: true,
      baseUnitPrice: true,
      baseCostPrice: true,
      recordVersion: true,
      createdAt: true,
      updatedAt: true,
      taxProfile: {
        select: {
          code: true,
          name: true,
          ratePercent: true,
          isTaxInclusive: true,
        },
      },
      supplierLinks: {
        orderBy: [{ isPrimary: "desc" }, { supplier: { name: "asc" } }],
        select: {
          supplierSku: true,
          supplierProductName: true,
          packCostPrice: true,
          leadTimeDays: true,
          minimumOrderQuantity: true,
          isPrimary: true,
          supplier: {
            select: {
              supplierNo: true,
              name: true,
              contactName: true,
            },
          },
        },
      },
      barcodes: {
        orderBy: {
          code: "asc",
        },
        select: {
          id: true,
          code: true,
          barcodeType: true,
        },
      },
      priceListEntries: {
        orderBy: [
          {
            priceList: {
              isDefault: "desc",
            },
          },
          {
            priceList: {
              name: "asc",
            },
          },
        ],
        select: {
          id: true,
          unitPrice: true,
          priceList: {
            select: {
              code: true,
              name: true,
              currencyCode: true,
              isDefault: true,
              customerType: true,
              loyaltyTier: true,
              status: true,
            },
          },
        },
      },
      matrixAttributes: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          sortOrder: true,
          attribute: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              sortOrder: true,
              values: {
                orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
                select: {
                  id: true,
                  code: true,
                  label: true,
                  status: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      },
      matrixVariants: {
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        select: {
          id: true,
          code: true,
          sku: true,
          displayName: true,
          unitPrice: true,
          costPrice: true,
          quantityOnHand: true,
          barcode: true,
          status: true,
          sortOrder: true,
          values: {
            orderBy: [{ sortOrder: "asc" }],
            select: {
              sortOrder: true,
              valueLabelSnapshot: true,
              attribute: {
                select: {
                  code: true,
                  name: true,
                },
              },
              attributeValue: {
                select: {
                  code: true,
                  label: true,
                },
              },
            },
          },
        },
      },
      inventoryLedgerEntries: {
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: 8,
        select: {
          id: true,
          movementType: true,
          quantity: true,
          occurredAt: true,
          externalReference: true,
          store: {
            select: {
              name: true,
              code: true,
            },
          },
        },
      },
      posTransactionLines: {
        orderBy: [
          {
            posTransaction: {
              completedAt: "desc",
            },
          },
          {
            createdAt: "desc",
          },
        ],
        take: 8,
        select: {
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          posTransaction: {
            select: {
              transactionNo: true,
              completedAt: true,
              createdAt: true,
              store: {
                select: {
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!product) {
    return null;
  }

  const [
    availableTaxProfiles,
    availableSuppliers,
    hierarchy,
    availableUnitsOfMeasure,
    availableUomSchedules,
    availableMatrixAttributes,
  ] =
    await Promise.all([
      prisma.taxProfile.findMany({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          status: RecordStatus.ACTIVE,
          deletedAt: null,
        },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: {
          code: true,
          name: true,
          ratePercent: true,
          isDefault: true,
        },
      }),
      prisma.supplier.findMany({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          status: RecordStatus.ACTIVE,
          deletedAt: null,
        },
        orderBy: {
          name: "asc",
        },
        select: {
          supplierNo: true,
          name: true,
        },
      }),
      getActiveProductHierarchy(enterpriseNode.retailOrgId),
      prisma.unitOfMeasure.findMany({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          status: RecordStatus.ACTIVE,
          deletedAt: null,
        },
        orderBy: [{ name: "asc" }, { code: "asc" }],
        select: {
          code: true,
          name: true,
          decimalPrecision: true,
          allowFractionalSale: true,
        },
      }),
      prisma.unitOfMeasureSchedule.findMany({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          status: RecordStatus.ACTIVE,
          deletedAt: null,
        },
        orderBy: [{ isDefaultForStock: "desc" }, { name: "asc" }],
        select: {
          code: true,
          name: true,
          isDefaultForStock: true,
          baseUnitOfMeasure: {
            select: {
              code: true,
            },
          },
        },
      }),
      prisma.productAttributeDefinition.findMany({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          status: RecordStatus.ACTIVE,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          sortOrder: true,
          values: {
            where: {
              status: RecordStatus.ACTIVE,
            },
            orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
            select: {
              id: true,
              code: true,
              label: true,
              status: true,
              sortOrder: true,
            },
          },
        },
      }),
    ]);

  const syncFilters: Prisma.SyncOutboxEventWhereInput[] = [
    {
      aggregateType: "product",
      aggregateId: product.id,
    },
  ];

  if (product.barcodes.length > 0) {
    syncFilters.push({
      aggregateType: "barcode",
      aggregateId: {
        in: product.barcodes.map((barcode) => barcode.id),
      },
    });
  }

  if (product.priceListEntries.length > 0) {
    syncFilters.push({
      aggregateType: "priceList",
      aggregateId: {
        in: product.priceListEntries.map((entry) => entry.id),
      },
    });
  }

  if (product.matrixVariants.length > 0) {
    syncFilters.push({
      aggregateType: "productMatrixVariant",
      aggregateId: {
        in: product.matrixVariants.map((variant) => variant.id),
      },
    });
  }

  const syncPackets = await prisma.syncOutboxEvent.findMany({
    where: {
      syncNodeId: enterpriseNode.id,
      OR: syncFilters,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 8,
    select: {
      id: true,
      eventType: true,
      status: true,
      targetNodeCode: true,
      createdAt: true,
      acknowledgedAt: true,
    },
  });

  const activePriceRows = product.priceListEntries.filter(
    (entry) => entry.priceList.status === RecordStatus.ACTIVE,
  );

  const postureMessages = [
    product.barcodes.length > 0
      ? `${product.barcodes.length} barcode(s) are currently attached to this product.`
      : "This product does not have barcode coverage yet.",
    product.taxable
      ? product.taxProfile
        ? `${product.taxProfile.name} is attached as the active tax profile for this product.`
        : "This product is taxable but no enterprise tax profile is attached yet."
      : "This product is currently marked non-taxable in enterprise.",
    product.supplierLinks.length > 0
      ? `${product.supplierLinks.length} supplier link(s) are currently attached, including ${product.supplierLinks.some((link) => link.isPrimary) ? "a primary supplier" : "no primary supplier yet"}.`
      : "No supplier links are attached to this product yet.",
    activePriceRows.length > 0
      ? `${activePriceRows.length} active price list entry(ies) are available for this product, including ${activePriceRows.some((entry) => entry.priceList.isDefault) ? "the default sell price" : "no default sell price"}.`
      : "No active price list entries are currently attached to this product.",
    product.productType === ProductType.MATRIX
      ? product.matrixVariants.length > 0
        ? `${product.matrixVariants.length} matrix combination(s) are configured for this style.`
        : "This matrix product does not have sellable combinations yet."
      : "This product is not using matrix combinations.",
    product.inventoryLedgerEntries.length > 0 ||
    product.posTransactionLines.length > 0
      ? `This product is already active in canonical retail operations with ${product.inventoryLedgerEntries.length} recent stock movement(s) and ${product.posTransactionLines.length} recent sale line(s).`
      : "This product has not yet appeared in recent canonical store operations.",
  ];

  if (syncPackets.some((packet) => queueStatuses.includes(packet.status))) {
    postureMessages.push(
      "At least one downstream product, barcode, or pricing publication packet is still queued for store delivery.",
    );
  }

  return {
    currencyCode: enterpriseNode.retailOrg.baseCurrencyCode,
    product: {
      id: product.id,
      code: product.code,
      sku: product.sku,
      name: product.name,
      shortName: product.shortName,
      description: product.description,
      productType: product.productType,
      department: product.department,
      category: product.category,
      subcategory: product.subcategory,
      brand: product.brand,
      seasonCode: product.seasonCode,
      unitOfMeasure: product.unitOfMeasure,
      uomScheduleCode: product.uomSchedule?.code ?? null,
      packSize: product.packSize,
      countryOfOrigin: product.countryOfOrigin,
      primaryImageUrl: product.primaryImageUrl,
      notes: product.notes,
      taxable: product.taxable,
      trackInventory: product.trackInventory,
      trackExpiry: product.trackExpiry,
      isSerialized: product.isSerialized,
      trackSize: product.trackSize,
      trackColor: product.trackColor,
      allowPriceOverride: product.allowPriceOverride,
      mustEnterPriceAtPos: product.mustEnterPriceAtPos,
      minStockLevel:
        product.minStockLevel === null ? null : Number(product.minStockLevel),
      reorderPoint:
        product.reorderPoint === null ? null : Number(product.reorderPoint),
      reorderQuantity:
        product.reorderQuantity === null
          ? null
          : Number(product.reorderQuantity),
      safetyStockLevel:
        product.safetyStockLevel === null
          ? null
          : Number(product.safetyStockLevel),
      shelfLifeDays: product.shelfLifeDays,
      weightKg: product.weightKg === null ? null : Number(product.weightKg),
      volumeLitres:
        product.volumeLitres === null ? null : Number(product.volumeLitres),
      status: product.status,
      baseUnitPrice: Number(product.baseUnitPrice),
      baseCostPrice:
        product.baseCostPrice === null ? null : Number(product.baseCostPrice),
      recordVersion: product.recordVersion,
      createdAt: product.createdAt.toISOString(),
      createdAtLabel: formatRelativeTime(product.createdAt),
      updatedAt: product.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(product.updatedAt),
    },
    barcodes: product.barcodes.map((barcode) => ({
      code: barcode.code,
      barcodeType: barcode.barcodeType,
    })),
    taxProfile: product.taxProfile
      ? {
          code: product.taxProfile.code,
          name: product.taxProfile.name,
          ratePercent: Number(product.taxProfile.ratePercent),
          isTaxInclusive: product.taxProfile.isTaxInclusive,
        }
      : null,
    supplierRows: product.supplierLinks.map((link) => ({
      supplierNo: link.supplier.supplierNo,
      supplierName: link.supplier.name,
      contactName: link.supplier.contactName,
      supplierSku: link.supplierSku,
      supplierProductName: link.supplierProductName,
      packCostPrice:
        link.packCostPrice === null ? null : Number(link.packCostPrice),
      leadTimeDays: link.leadTimeDays,
      minimumOrderQuantity:
        link.minimumOrderQuantity === null
          ? null
          : Number(link.minimumOrderQuantity),
      isPrimary: link.isPrimary,
    })),
    availableTaxProfiles: availableTaxProfiles.map((profile) => ({
      code: profile.code,
      name: profile.name,
      ratePercent: Number(profile.ratePercent),
      isDefault: profile.isDefault,
    })),
    availableDepartments: hierarchy.departments,
    availableCategories: hierarchy.categories,
    availableUnitsOfMeasure: availableUnitsOfMeasure.map((unit) => ({
      uomCode: unit.code,
      name: unit.name,
      decimalPrecision: unit.decimalPrecision,
      allowFractionalSale: unit.allowFractionalSale,
    })),
    availableUomSchedules: availableUomSchedules.map((schedule) => ({
      scheduleCode: schedule.code,
      name: schedule.name,
      baseUnitCode: schedule.baseUnitOfMeasure.code,
      isDefaultForStock: schedule.isDefaultForStock,
    })),
    availableMatrixAttributes: availableMatrixAttributes.map((attribute) => ({
      id: attribute.id,
      code: attribute.code,
      name: attribute.name,
      status: attribute.status,
      sortOrder: attribute.sortOrder,
      values: attribute.values.map((value) => ({
        id: value.id,
        code: value.code,
        label: value.label,
        status: value.status,
        sortOrder: value.sortOrder,
      })),
    })),
    availableSuppliers: availableSuppliers.map((supplier) => ({
      supplierNo: supplier.supplierNo,
      name: supplier.name,
    })),
    priceRows: product.priceListEntries.map((entry) => ({
      priceListCode: entry.priceList.code,
      priceListName: entry.priceList.name,
      currencyCode: entry.priceList.currencyCode,
      unitPrice: Number(entry.unitPrice),
      isDefault: entry.priceList.isDefault,
      customerType: entry.priceList.customerType,
      loyaltyTier: entry.priceList.loyaltyTier,
      status: entry.priceList.status,
    })),
    matrixAttributes: product.matrixAttributes.map((link) => ({
      id: link.attribute.id,
      code: link.attribute.code,
      name: link.attribute.name,
      status: link.attribute.status,
      sortOrder: link.sortOrder,
      values: link.attribute.values.map((value) => ({
        id: value.id,
        code: value.code,
        label: value.label,
        status: value.status,
        sortOrder: value.sortOrder,
      })),
    })),
    matrixVariants: product.matrixVariants.map((variant) => ({
      id: variant.id,
      code: variant.code,
      sku: variant.sku,
      displayName: variant.displayName,
      unitPrice: Number(variant.unitPrice),
      costPrice: variant.costPrice === null ? null : Number(variant.costPrice),
      quantityOnHand: Number(variant.quantityOnHand),
      barcode: variant.barcode,
      status: variant.status,
      sortOrder: variant.sortOrder,
      attributeValues: variant.values.map((value) => ({
        attributeCode: value.attribute.code,
        attributeName: value.attribute.name,
        valueCode: value.attributeValue.code,
        valueLabel: value.valueLabelSnapshot || value.attributeValue.label,
        sortOrder: value.sortOrder,
      })),
    })),
    recentInventoryRows: product.inventoryLedgerEntries.map((entry) => ({
      entryId: entry.id,
      movementType: entry.movementType,
      quantity: Number(entry.quantity),
      occurredAt: entry.occurredAt.toISOString(),
      occurredAtLabel: formatRelativeTime(entry.occurredAt),
      storeName: entry.store?.name ?? null,
      storeCode: entry.store?.code ?? null,
      externalReference: entry.externalReference,
    })),
    recentSalesRows: product.posTransactionLines.map((line) => {
      const completedAt =
        line.posTransaction.completedAt ?? line.posTransaction.createdAt;

      return {
        transactionNo: line.posTransaction.transactionNo,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        lineTotal: Number(line.lineTotal),
        completedAt: toIsoString(completedAt),
        completedAtLabel: formatRelativeTime(completedAt),
        storeName: line.posTransaction.store.name,
        storeCode: line.posTransaction.store.code,
      };
    }),
    syncPackets: syncPackets.map((packet) => ({
      eventId: packet.id,
      eventType: packet.eventType,
      status: packet.status,
      targetNodeCode: packet.targetNodeCode,
      createdAt: packet.createdAt.toISOString(),
      createdAtLabel: formatRelativeTime(packet.createdAt),
      acknowledgedAt: toIsoString(packet.acknowledgedAt),
      acknowledgedAtLabel: formatRelativeTime(packet.acknowledgedAt),
    })),
    postureMessages,
    statusMessage: `Flash ERP enterprise is showing catalog detail for ${product.name}. Use this workspace to inspect pricing coverage, downstream publication posture, and canonical retail usage from one place.`,
    refreshedAt: new Date().toISOString(),
  };
}

export type UpdateEnterpriseProductPricingRequest = {
  unitPrice: number;
  priceScope?: "DEFAULT" | "CUSTOMER_TYPE" | "LOYALTY_TIER";
  customerType?: string | null;
  loyaltyTier?: string | null;
};

export type UpdateEnterpriseProductPricingResponse = {
  productCode: string;
  unitPrice: number;
  priceListCode: string;
  priceListName: string;
  priceScope: "DEFAULT" | "CUSTOMER_TYPE" | "LOYALTY_TIER";
  message: string;
  serverProcessedAt: string;
};

export type UpsertEnterpriseProductMatrixRequest = {
  attributes: Array<{
    code?: string | null;
    name: string;
    values: Array<{
      code?: string | null;
      label: string;
    }>;
  }>;
  variants: Array<{
    code: string;
    sku?: string | null;
    displayName?: string | null;
    unitPrice: number;
    costPrice?: number | null;
    quantityOnHand?: number | null;
    barcode?: string | null;
    status?: string | null;
    attributeValues: Record<string, string>;
  }>;
};

export type UpsertEnterpriseProductMatrixResponse = {
  productCode: string;
  attributeCount: number;
  variantCount: number;
  message: string;
  serverProcessedAt: string;
};

export type CreateEnterpriseProductRequest = {
  productCode?: string;
  name: string;
  sku?: string | null;
  shortName?: string | null;
  description?: string | null;
  productType?: string | null;
  department?: string | null;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  seasonCode?: string | null;
  unitOfMeasure?: string | null;
  uomScheduleCode?: string | null;
  packSize?: string | null;
  countryOfOrigin?: string | null;
  primaryImageUrl?: string | null;
  notes?: string | null;
  taxable?: boolean;
  taxProfileCode?: string | null;
  trackInventory?: boolean;
  trackExpiry?: boolean;
  isSerialized?: boolean;
  trackSize?: boolean;
  trackColor?: boolean;
  allowPriceOverride?: boolean;
  mustEnterPriceAtPos?: boolean;
  minStockLevel?: number | null;
  reorderPoint?: number | null;
  reorderQuantity?: number | null;
  safetyStockLevel?: number | null;
  shelfLifeDays?: number | null;
  weightKg?: number | null;
  volumeLitres?: number | null;
  baseUnitPrice: number;
  baseCostPrice?: number | null;
  barcode?: string | null;
  barcodeType?: string | null;
};

export type CreateEnterpriseProductResponse = {
  productCode: string;
  unitPrice: number;
  defaultPriceListCode: string;
  barcodeCreated: boolean;
  message: string;
  serverProcessedAt: string;
};

export type UpdateEnterpriseProductProfileRequest = {
  name: string;
  sku?: string | null;
  shortName?: string | null;
  description?: string | null;
  productType?: string | null;
  department?: string | null;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  seasonCode?: string | null;
  unitOfMeasure?: string | null;
  uomScheduleCode?: string | null;
  packSize?: string | null;
  countryOfOrigin?: string | null;
  primaryImageUrl?: string | null;
  notes?: string | null;
  taxable?: boolean;
  taxProfileCode?: string | null;
  trackInventory?: boolean;
  trackExpiry?: boolean;
  isSerialized?: boolean;
  trackSize?: boolean;
  trackColor?: boolean;
  allowPriceOverride?: boolean;
  mustEnterPriceAtPos?: boolean;
  minStockLevel?: number | null;
  reorderPoint?: number | null;
  reorderQuantity?: number | null;
  safetyStockLevel?: number | null;
  shelfLifeDays?: number | null;
  weightKg?: number | null;
  volumeLitres?: number | null;
  baseCostPrice?: number | null;
  status: string;
};

export type UpdateEnterpriseProductProfileResponse = {
  productCode: string;
  status: string;
  message: string;
  serverProcessedAt: string;
};

export type AddEnterpriseProductBarcodeRequest = {
  barcode: string;
  barcodeType?: string | null;
};

export type AddEnterpriseProductBarcodeResponse = {
  productCode: string;
  barcode: string;
  barcodeType: string;
  message: string;
  serverProcessedAt: string;
};

export type LinkEnterpriseProductSupplierRequest = {
  supplierNo: string;
  supplierSku?: string | null;
  supplierProductName?: string | null;
  packCostPrice?: number | null;
  leadTimeDays?: number | null;
  minimumOrderQuantity?: number | null;
  isPrimary?: boolean;
};

export type LinkEnterpriseProductSupplierResponse = {
  productCode: string;
  supplierNo: string;
  supplierName: string;
  message: string;
  serverProcessedAt: string;
};

export type UpsertInventoryCatalogRequest = {
  catalogCode: string;
  name: string;
  description?: string | null;
  status?: string | null;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  products?: unknown;
  productCodes?: unknown;
  storeCodes?: unknown;
};

export type UpsertInventoryCatalogResponse = {
  catalogCode: string;
  status: string;
  productCount: number;
  storeCount: number;
  message: string;
  serverProcessedAt: string;
};

export type UpsertUnitOfMeasureRequest = {
  uomCode: string;
  name: string;
  description?: string | null;
  decimalPrecision?: number | null;
  allowFractionalSale?: boolean | null;
  status?: string | null;
};

export type UpsertUnitOfMeasureResponse = {
  uomCode: string;
  status: string;
  message: string;
  serverProcessedAt: string;
};

export type UpsertUnitOfMeasureScheduleRequest = {
  scheduleCode: string;
  name: string;
  description?: string | null;
  baseUomCode: string;
  isDefaultForStock?: boolean | null;
  status?: string | null;
  lines?: Array<{
    uomCode?: string | null;
    conversionFactor?: number | null;
    isBaseUnit?: boolean | null;
    allowSale?: boolean | null;
    allowPurchase?: boolean | null;
  }>;
};

export type UpsertUnitOfMeasureScheduleResponse = {
  scheduleCode: string;
  status: string;
  lineCount: number;
  message: string;
  serverProcessedAt: string;
};

export async function upsertInventoryCatalog(
  input: UpsertInventoryCatalogRequest,
): Promise<UpsertInventoryCatalogResponse> {
  const catalogCode = normalizeCatalogCode(input.catalogCode);
  const name = normalizeRequiredText(input.name, "catalog name");
  const description = normalizeOptionalText(input.description);
  const status = normalizeProductStatus(input.status ?? RecordStatus.ACTIVE);
  const effectiveFrom = normalizeOptionalDate(
    input.effectiveFrom,
    "catalog effective-from date",
  );
  const effectiveUntil = normalizeOptionalDate(
    input.effectiveUntil,
    "catalog effective-until date",
  );
  const catalogProducts = normalizeInventoryCatalogProducts(
    input.products,
    input.productCodes,
  );
  const productCodes = catalogProducts.map((product) => product.productCode);
  const productSortOrderByCode = new Map(
    catalogProducts.map((product) => [product.productCode, product.sortOrder]),
  );
  const storeCodes = normalizeStoreCodeList(input.storeCodes);

  if (
    effectiveFrom &&
    effectiveUntil &&
    effectiveUntil.getTime() < effectiveFrom.getTime()
  ) {
    throw new Error(
      "Flash ERP needs the catalog effective-until date after effective-from.",
    );
  }

  if (productCodes.length === 0) {
    throw new Error(
      "Flash ERP needs at least one product linked to an inventory catalog.",
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
          code: true,
        },
      });

      if (!enterpriseNode) {
        throw new Error(
          "No primary enterprise node is available for catalog updates.",
        );
      }

      const products = await tx.product.findMany({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: {
            in: productCodes,
          },
          deletedAt: null,
        },
        select: {
          id: true,
          code: true,
        },
      });
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
              },
            })
          : [];

      const foundProductCodes = new Set(
        products.map((product) => product.code),
      );
      const missingProductCodes = productCodes.filter(
        (code) => !foundProductCodes.has(code),
      );

      if (missingProductCodes.length > 0) {
        throw new Error(
          `Flash ERP could not find product(s) ${missingProductCodes.join(", ")} for this catalog.`,
        );
      }

      const foundStoreCodes = new Set(stores.map((store) => store.code));
      const missingStoreCodes = storeCodes.filter(
        (code) => !foundStoreCodes.has(code),
      );

      if (missingStoreCodes.length > 0) {
        throw new Error(
          `Flash ERP could not find shop(s) ${missingStoreCodes.join(", ")} for this catalog.`,
        );
      }

      const catalog = await tx.inventoryCatalog.upsert({
        where: {
          retailOrgId_code: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: catalogCode,
          },
        },
        create: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: catalogCode,
          name,
          description,
          status,
          effectiveFrom,
          effectiveUntil,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code,
        },
        update: {
          name,
          description,
          status,
          effectiveFrom,
          effectiveUntil,
          recordVersion: {
            increment: 1,
          },
          lastModifiedByNodeCode: enterpriseNode.code,
        },
        select: {
          id: true,
          code: true,
        },
      });

      await tx.inventoryCatalogProduct.deleteMany({
        where: {
          catalogId: catalog.id,
        },
      });
      await tx.inventoryCatalogStore.deleteMany({
        where: {
          catalogId: catalog.id,
        },
      });

      if (products.length > 0) {
        const orderedProducts = [...products].sort((left, right) => {
          const leftSortOrder =
            productSortOrderByCode.get(left.code) ?? Number.MAX_SAFE_INTEGER;
          const rightSortOrder =
            productSortOrderByCode.get(right.code) ?? Number.MAX_SAFE_INTEGER;

          return leftSortOrder === rightSortOrder
            ? left.code.localeCompare(right.code)
            : leftSortOrder - rightSortOrder;
        });

        await tx.inventoryCatalogProduct.createMany({
          data: orderedProducts.map((product, index) => ({
            id: randomUUID(),
            retailOrgId: enterpriseNode.retailOrgId,
            catalogId: catalog.id,
            productId: product.id,
            sortOrder: productSortOrderByCode.get(product.code) ?? index + 1,
          })),
        });
      }

      if (stores.length > 0) {
        await tx.inventoryCatalogStore.createMany({
          data: stores.map((store) => ({
            id: randomUUID(),
            retailOrgId: enterpriseNode.retailOrgId,
            catalogId: catalog.id,
            storeId: store.id,
          })),
        });
      }

      return {
        catalogCode: catalog.code,
        status,
        productCount: products.length,
        storeCount: stores.length,
        message:
          stores.length > 0
            ? `Flash ERP saved catalog ${catalog.code}, linked ${products.length} product(s), and assigned it to ${stores.length} shop(s). The next shop pull will receive only the linked assortment.`
            : `Flash ERP saved catalog ${catalog.code} with ${products.length} product(s). Link shops before expecting downstream publication.`,
        serverProcessedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    throw toCatalogMutationError(
      error,
      "Flash ERP could not save that inventory catalog.",
    );
  }
}

export async function upsertUnitOfMeasure(
  input: UpsertUnitOfMeasureRequest,
): Promise<UpsertUnitOfMeasureResponse> {
  const uomCode = normalizeUomCode(input.uomCode);
  const name = normalizeRequiredText(input.name, "unit name");
  const description = normalizeOptionalText(input.description);
  const decimalPrecision = Math.min(
    6,
    normalizeNonNegativeInteger(input.decimalPrecision, "decimal precision"),
  );
  const allowFractionalSale = input.allowFractionalSale ?? decimalPrecision > 0;
  const status = normalizeProductStatus(input.status ?? RecordStatus.ACTIVE);

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
          code: true,
        },
      });

      if (!enterpriseNode) {
        throw new Error(
          "No primary enterprise node is available for UOM updates.",
        );
      }

      const unit = await tx.unitOfMeasure.upsert({
        where: {
          retailOrgId_code: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: uomCode,
          },
        },
        create: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: uomCode,
          name,
          description,
          decimalPrecision,
          allowFractionalSale,
          status,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code,
        },
        update: {
          name,
          description,
          decimalPrecision,
          allowFractionalSale,
          status,
          recordVersion: {
            increment: 1,
          },
          lastModifiedByNodeCode: enterpriseNode.code,
        },
        select: {
          code: true,
        },
      });

      return {
        uomCode: unit.code,
        status,
        message: `Flash ERP saved unit ${unit.code}. UOM changes will be published to stores through the next master-data sync.`,
        serverProcessedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    throw toCatalogMutationError(
      error,
      "Flash ERP could not save that unit of measure.",
    );
  }
}

export async function upsertUnitOfMeasureSchedule(
  input: UpsertUnitOfMeasureScheduleRequest,
): Promise<UpsertUnitOfMeasureScheduleResponse> {
  const scheduleCode = normalizeCatalogCode(input.scheduleCode);
  const name = normalizeRequiredText(input.name, "UOM schedule name");
  const description = normalizeOptionalText(input.description);
  const baseUomCode = normalizeUomCode(input.baseUomCode);
  const isDefaultForStock = input.isDefaultForStock ?? false;
  const status = normalizeProductStatus(input.status ?? RecordStatus.ACTIVE);
  const requestedLines = input.lines ?? [];
  const normalizedLines = requestedLines
    .map((line) => ({
      uomCode: line.uomCode ? normalizeUomCode(line.uomCode) : "",
      conversionFactor: normalizePositiveDecimal(
        line.conversionFactor ?? 1,
        "conversion factor",
      ),
      isBaseUnit: line.isBaseUnit ?? false,
      allowSale: line.allowSale ?? true,
      allowPurchase: line.allowPurchase ?? true,
    }))
    .filter((line) => line.uomCode.length > 0);
  const hasBaseLine = normalizedLines.some(
    (line) => line.uomCode === baseUomCode,
  );
  const lines = hasBaseLine
    ? normalizedLines.map((line) =>
        line.uomCode === baseUomCode
          ? { ...line, conversionFactor: 1, isBaseUnit: true }
          : { ...line, isBaseUnit: false },
      )
    : [
        {
          uomCode: baseUomCode,
          conversionFactor: 1,
          isBaseUnit: true,
          allowSale: true,
          allowPurchase: true,
        },
        ...normalizedLines.map((line) => ({ ...line, isBaseUnit: false })),
      ];

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
          code: true,
        },
      });

      if (!enterpriseNode) {
        throw new Error(
          "No primary enterprise node is available for UOM schedule updates.",
        );
      }

      const units = await tx.unitOfMeasure.findMany({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: {
            in: [...new Set(lines.map((line) => line.uomCode))],
          },
          deletedAt: null,
        },
        select: {
          id: true,
          code: true,
        },
      });
      const unitsByCode = new Map(units.map((unit) => [unit.code, unit]));
      const missingUnits = lines
        .map((line) => line.uomCode)
        .filter(
          (code, index, codes) =>
            codes.indexOf(code) === index && !unitsByCode.has(code),
        );

      if (missingUnits.length > 0) {
        throw new Error(
          `Flash ERP could not find unit(s) ${missingUnits.join(", ")}. Create base units before building the schedule.`,
        );
      }

      const baseUnit = unitsByCode.get(baseUomCode);

      if (!baseUnit) {
        throw new Error(`Flash ERP could not find base unit "${baseUomCode}".`);
      }

      const schedule = await tx.unitOfMeasureSchedule.upsert({
        where: {
          retailOrgId_code: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: scheduleCode,
          },
        },
        create: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: scheduleCode,
          name,
          description,
          baseUnitOfMeasureId: baseUnit.id,
          isDefaultForStock,
          status,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code,
        },
        update: {
          name,
          description,
          baseUnitOfMeasureId: baseUnit.id,
          isDefaultForStock,
          status,
          recordVersion: {
            increment: 1,
          },
          lastModifiedByNodeCode: enterpriseNode.code,
        },
        select: {
          id: true,
          code: true,
        },
      });

      await tx.unitOfMeasureScheduleLine.deleteMany({
        where: {
          scheduleId: schedule.id,
        },
      });

      await tx.unitOfMeasureScheduleLine.createMany({
        data: lines.map((line, index) => {
          const unit = unitsByCode.get(line.uomCode);

          if (!unit) {
            throw new Error(`Flash ERP could not find unit "${line.uomCode}".`);
          }

          return {
            id: randomUUID(),
            scheduleId: schedule.id,
            unitOfMeasureId: unit.id,
            conversionFactor: line.conversionFactor,
            isBaseUnit: line.isBaseUnit,
            allowSale: line.allowSale,
            allowPurchase: line.allowPurchase,
            sortOrder: index,
          };
        }),
      });

      if (isDefaultForStock) {
        await tx.unitOfMeasureSchedule.updateMany({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            id: {
              not: schedule.id,
            },
          },
          data: {
            isDefaultForStock: false,
          },
        });
      }

      return {
        scheduleCode: schedule.code,
        status,
        lineCount: lines.length,
        message: `Flash ERP saved UOM schedule ${schedule.code} with ${lines.length} conversion line(s). Stock products can now use it as their schedule.`,
        serverProcessedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    throw toCatalogMutationError(
      error,
      "Flash ERP could not save that UOM schedule.",
    );
  }
}

function normalizeMatrixAttributes(input: UpsertEnterpriseProductMatrixRequest["attributes"]) {
  const seenAttributes = new Set<string>();

  return input.map((attribute, index) => {
    const name = normalizeRequiredText(attribute.name, "matrix attribute name");
    const code = normalizeMatrixCode(attribute.code ?? name, "matrix attribute code");

    if (seenAttributes.has(code)) {
      throw new Error(`Matrix attribute "${name}" is duplicated.`);
    }

    seenAttributes.add(code);

    const seenValues = new Set<string>();
    const values = attribute.values.map((value, valueIndex) => {
      const label = normalizeRequiredText(value.label, `${name} value`);
      const valueCode = normalizeMatrixCode(value.code ?? label, `${name} value code`);

      if (seenValues.has(valueCode)) {
        throw new Error(`Matrix attribute "${name}" has duplicate value "${label}".`);
      }

      seenValues.add(valueCode);

      return {
        code: valueCode,
        label,
        sortOrder: valueIndex,
      };
    });

    if (values.length === 0) {
      throw new Error(`Matrix attribute "${name}" needs at least one value.`);
    }

    return {
      code,
      name,
      values,
      sortOrder: index,
    };
  });
}

function normalizeMatrixVariants(
  input: UpsertEnterpriseProductMatrixRequest["variants"],
  attributes: ReturnType<typeof normalizeMatrixAttributes>,
) {
  const attributeAliases = new Map<
    string,
    ReturnType<typeof normalizeMatrixAttributes>[number]
  >();

  for (const attribute of attributes) {
    attributeAliases.set(attribute.code, attribute);
    attributeAliases.set(normalizeMatrixCode(attribute.name, "matrix attribute alias"), attribute);
  }

  const seenVariants = new Set<string>();

  return input.map((variant, index) => {
    const code = normalizeMatrixCode(variant.code, "matrix variant code");

    if (seenVariants.has(code)) {
      throw new Error(`Matrix variant "${code}" is duplicated.`);
    }

    seenVariants.add(code);

    const rawAttributeValues = variant.attributeValues ?? {};
    const normalizedAttributeValues = new Map<string, string>();

    for (const [key, value] of Object.entries(rawAttributeValues)) {
      const attribute = attributeAliases.get(normalizeMatrixCode(key, "matrix attribute key"));

      if (attribute) {
        normalizedAttributeValues.set(attribute.code, value);
      }
    }

    const valueSelections = attributes.map((attribute) => {
      const rawValue = normalizedAttributeValues.get(attribute.code);
      const valueCode = normalizeMatrixCode(
        rawValue,
        `${attribute.name} value for ${code}`,
      );
      const value = attribute.values.find((candidate) => candidate.code === valueCode);

      if (!value) {
        throw new Error(
          `Matrix variant "${code}" uses unknown ${attribute.name} value "${rawValue ?? ""}".`,
        );
      }

      return {
        attributeCode: attribute.code,
        valueCode: value.code,
      };
    });

    return {
      code,
      sku: normalizeSku(variant.sku ?? variant.code),
      displayName: normalizeOptionalText(variant.displayName),
      unitPrice: normalizeMoney(variant.unitPrice, `${code} unit price`),
      costPrice: normalizeOptionalMoney(variant.costPrice, `${code} cost price`),
      quantityOnHand: normalizeOptionalQuantity(
        variant.quantityOnHand ?? 0,
        `${code} stock`,
      ) ?? 0,
      barcode: normalizeOptionalText(variant.barcode)
        ? normalizeBarcode(variant.barcode)
        : null,
      status: normalizeProductStatus(variant.status ?? RecordStatus.ACTIVE),
      valueSelections,
      sortOrder: index,
    };
  });
}

export async function upsertEnterpriseProductMatrix(
  productCode: string,
  input: UpsertEnterpriseProductMatrixRequest,
): Promise<UpsertEnterpriseProductMatrixResponse> {
  await ensureProductVariantSalesOrderDepositSchemaCompatibility();

  const normalizedCode = normalizeProductCode(productCode);
  const attributes = normalizeMatrixAttributes(Array.isArray(input.attributes) ? input.attributes : []);

  if (attributes.length === 0) {
    throw new Error("Flash ERP needs at least one matrix attribute.");
  }

  const variants = normalizeMatrixVariants(Array.isArray(input.variants) ? input.variants : [], attributes);

  if (variants.length === 0) {
    throw new Error("Flash ERP needs at least one matrix combination.");
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
          code: true,
        },
      });

      if (!enterpriseNode) {
        throw new Error(
          "No primary enterprise node is available for matrix product updates.",
        );
      }

      const product = await tx.product.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: normalizedCode,
          deletedAt: null,
        },
        select: {
          id: true,
          code: true,
          name: true,
          baseUnitPrice: true,
        },
      });

      if (!product) {
        throw new Error(`Flash ERP could not find product "${normalizedCode}".`);
      }

      const attributeRecords: Array<{ id: string; code: string; name: string }> = [];
      const valueRecordsByAttributeCode = new Map<
        string,
        Map<string, { id: string; label: string }>
      >();

      for (const attribute of attributes) {
        const attributeRecord = await tx.productAttributeDefinition.upsert({
          where: {
            retailOrgId_code: {
              retailOrgId: enterpriseNode.retailOrgId,
              code: attribute.code,
            },
          },
          update: {
            name: attribute.name,
            status: RecordStatus.ACTIVE,
            sortOrder: attribute.sortOrder,
          },
          create: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: attribute.code,
            name: attribute.name,
            status: RecordStatus.ACTIVE,
            sortOrder: attribute.sortOrder,
          },
          select: {
            id: true,
            code: true,
            name: true,
          },
        });
        const valueRecords = new Map<string, { id: string; label: string }>();

        for (const value of attribute.values) {
          const valueRecord = await tx.productAttributeValue.upsert({
            where: {
              attributeId_code: {
                attributeId: attributeRecord.id,
                code: value.code,
              },
            },
            update: {
              label: value.label,
              status: RecordStatus.ACTIVE,
              sortOrder: value.sortOrder,
            },
            create: {
              attributeId: attributeRecord.id,
              code: value.code,
              label: value.label,
              status: RecordStatus.ACTIVE,
              sortOrder: value.sortOrder,
            },
            select: {
              id: true,
              code: true,
              label: true,
            },
          });

          valueRecords.set(valueRecord.code, {
            id: valueRecord.id,
            label: valueRecord.label,
          });
        }

        await tx.productMatrixAttribute.upsert({
          where: {
            productId_attributeId: {
              productId: product.id,
              attributeId: attributeRecord.id,
            },
          },
          update: {
            isRequired: true,
            sortOrder: attribute.sortOrder,
          },
          create: {
            productId: product.id,
            attributeId: attributeRecord.id,
            isRequired: true,
            sortOrder: attribute.sortOrder,
          },
        });

        attributeRecords.push(attributeRecord);
        valueRecordsByAttributeCode.set(attributeRecord.code, valueRecords);
      }

      const existingVariants = await tx.productMatrixVariant.findMany({
        where: {
          productId: product.id,
        },
        select: {
          id: true,
        },
      });
      const existingVariantIds = existingVariants.map((variant) => variant.id);

      await tx.barcode.deleteMany({
        where: {
          productId: product.id,
          productVariantId: {
            not: null,
          },
        },
      });

      if (existingVariantIds.length > 0) {
        await tx.productMatrixVariantValue.deleteMany({
          where: {
            variantId: {
              in: existingVariantIds,
            },
          },
        });
      }

      await tx.productMatrixVariant.deleteMany({
        where: {
          productId: product.id,
        },
      });
      await tx.productMatrixAttribute.deleteMany({
        where: {
          productId: product.id,
          attributeId: {
            notIn: attributeRecords.map((attribute) => attribute.id),
          },
        },
      });

      for (const variant of variants) {
        const labels = variant.valueSelections.map((selection) => {
          const value = valueRecordsByAttributeCode
            .get(selection.attributeCode)
            ?.get(selection.valueCode);

          if (!value) {
            throw new Error(
              `Flash ERP could not resolve matrix value "${selection.valueCode}" for ${variant.code}.`,
            );
          }

          return value.label;
        });
        const variantRecord = await tx.productMatrixVariant.create({
          data: {
            retailOrgId: enterpriseNode.retailOrgId,
            productId: product.id,
            code: variant.code,
            sku: variant.sku,
            displayName: variant.displayName ?? labels.join(" / "),
            unitPrice: variant.unitPrice,
            costPrice: variant.costPrice,
            quantityOnHand: variant.quantityOnHand,
            barcode: variant.barcode,
            status: variant.status,
            sortOrder: variant.sortOrder,
          },
          select: {
            id: true,
          },
        });

        await tx.productMatrixVariantValue.createMany({
          data: variant.valueSelections.map((selection, index) => {
            const attribute = attributeRecords.find(
              (candidate) => candidate.code === selection.attributeCode,
            );
            const value = valueRecordsByAttributeCode
              .get(selection.attributeCode)
              ?.get(selection.valueCode);

            if (!attribute || !value) {
              throw new Error(
                `Flash ERP could not resolve matrix values for ${variant.code}.`,
              );
            }

            return {
              id: randomUUID(),
              variantId: variantRecord.id,
              attributeId: attribute.id,
              attributeValueId: value.id,
              valueLabelSnapshot: value.label,
              sortOrder: index,
            };
          }),
        });

        if (variant.barcode) {
          await tx.barcode.create({
            data: {
              productId: product.id,
              productVariantId: variantRecord.id,
              code: variant.barcode,
              barcodeType: "CODE128",
            },
          });
        }
      }

      const lowestVariantPrice = Math.min(...variants.map((variant) => variant.unitPrice));
      const defaultPriceList = await tx.priceList.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          isDefault: true,
          status: RecordStatus.ACTIVE,
        },
        select: {
          id: true,
        },
      });

      await tx.product.update({
        where: {
          id: product.id,
        },
        data: {
          productType: ProductType.MATRIX,
          trackInventory: true,
          baseUnitPrice: lowestVariantPrice,
          recordVersion: {
            increment: 1,
          },
          lastModifiedByNodeCode: enterpriseNode.code,
        },
      });

      if (defaultPriceList) {
        await tx.priceListEntry.upsert({
          where: {
            priceListId_productId: {
              priceListId: defaultPriceList.id,
              productId: product.id,
            },
          },
          update: {
            unitPrice: lowestVariantPrice,
          },
          create: {
            priceListId: defaultPriceList.id,
            productId: product.id,
            unitPrice: lowestVariantPrice,
          },
        });
      }

      return {
        productCode: product.code,
        attributeCount: attributes.length,
        variantCount: variants.length,
        message: `Flash ERP saved ${variants.length} matrix combination(s) for ${product.name}.`,
        serverProcessedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    throw toCatalogMutationError(
      error,
      "Flash ERP could not save the product matrix.",
    );
  }
}

export async function createEnterpriseProduct(
  input: CreateEnterpriseProductRequest,
): Promise<CreateEnterpriseProductResponse> {
  await ensureProductVariantSalesOrderDepositSchemaCompatibility();

  const requestedProductCode = input.productCode?.trim() ?? "";
  const name = normalizeRequiredText(input.name, "product name");
  const sku = normalizeSku(input.sku);
  const shortName = normalizeOptionalText(input.shortName);
  const description = normalizeOptionalText(input.description);
  const productType = normalizeProductType(input.productType);
  const departmentInput = normalizeOptionalText(input.department);
  const categoryInput = normalizeOptionalText(input.category);
  const subcategory = normalizeOptionalText(input.subcategory);
  const brand = normalizeOptionalText(input.brand);
  const seasonCode = normalizeOptionalText(input.seasonCode);
  const requestedUnitOfMeasure = input.unitOfMeasure ?? "EA";
  const requestedUomScheduleCode = input.uomScheduleCode ?? null;
  const packSize = normalizeOptionalText(input.packSize);
  const countryOfOrigin = normalizeOptionalText(input.countryOfOrigin);
  const primaryImageUrl = normalizeOptionalText(input.primaryImageUrl);
  const notes = normalizeOptionalText(input.notes);
  const taxable = input.taxable ?? true;
  const taxProfileCode =
    normalizeOptionalText(input.taxProfileCode)?.toUpperCase() ?? null;
  const trackInventory = input.trackInventory ?? true;
  const trackExpiry = input.trackExpiry ?? false;
  const isSerialized = input.isSerialized ?? false;
  const trackSize = input.trackSize ?? false;
  const trackColor = input.trackColor ?? false;
  const allowPriceOverride = input.allowPriceOverride ?? false;
  const mustEnterPriceAtPos = input.mustEnterPriceAtPos ?? false;
  const minStockLevel = normalizeOptionalQuantity(
    input.minStockLevel,
    "minimum stock level",
  );
  const reorderPoint = normalizeOptionalQuantity(
    input.reorderPoint,
    "reorder point",
  );
  const reorderQuantity = normalizeOptionalQuantity(
    input.reorderQuantity,
    "reorder quantity",
  );
  const safetyStockLevel = normalizeOptionalQuantity(
    input.safetyStockLevel,
    "safety stock level",
  );
  const shelfLifeDays = normalizeOptionalInteger(
    input.shelfLifeDays,
    "shelf life days",
  );
  const weightKg = normalizeOptionalQuantity(input.weightKg, "weight");
  const volumeLitres = normalizeOptionalQuantity(input.volumeLitres, "volume");
  const baseUnitPrice = normalizeMoney(input.baseUnitPrice, "base unit price");
  const baseCostPrice = normalizeOptionalMoney(
    input.baseCostPrice,
    "base cost price",
  );
  const barcode = normalizeOptionalText(input.barcode)
    ? normalizeBarcode(input.barcode)
    : null;
  const barcodeType = barcode ? normalizeBarcodeType(input.barcodeType) : null;

  if (isSerialized && !trackInventory) {
    throw new Error(
      "Serialized products must keep inventory tracking enabled in Flash ERP.",
    );
  }

  if (trackExpiry && !trackInventory) {
    throw new Error(
      "Expiry-controlled products must keep inventory tracking enabled in Flash ERP.",
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
          code: true,
          retailOrg: {
            select: {
              companySettingsJson: true,
            },
          },
        },
      });

      if (!enterpriseNode) {
        throw new Error(
          "No primary enterprise node is available for catalog updates.",
        );
      }

      const productCode = requestedProductCode
        ? normalizeProductCode(requestedProductCode)
        : buildNextEnterpriseProductCode(
            readDocumentNumberFormats(enterpriseNode.retailOrg.companySettingsJson).productCode,
            (
              await tx.product.findMany({
                where: {
                  retailOrgId: enterpriseNode.retailOrgId,
                },
                select: {
                  code: true,
                },
              })
            ).map((product) => product.code),
          );

      const defaultPriceList = await tx.priceList.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          isDefault: true,
          status: RecordStatus.ACTIVE,
        },
        select: {
          id: true,
          code: true,
        },
      });

      if (!defaultPriceList) {
        throw new Error(
          "Flash ERP could not find an active default price list.",
        );
      }

      const hierarchy = await resolveProductHierarchySelection(
        tx,
        enterpriseNode.retailOrgId,
        {
          department: departmentInput,
          category: categoryInput,
        },
      );
      const uomSelection = await resolveProductUomSelection(
        tx,
        enterpriseNode.retailOrgId,
        {
          unitOfMeasure: requestedUnitOfMeasure,
          uomScheduleCode: requestedUomScheduleCode,
          productType,
        },
      );

      const taxProfile =
        taxable && taxProfileCode
          ? await tx.taxProfile.findFirst({
              where: {
                retailOrgId: enterpriseNode.retailOrgId,
                code: taxProfileCode,
                status: RecordStatus.ACTIVE,
                deletedAt: null,
              },
              select: {
                id: true,
              },
            })
          : null;

      if (taxable && taxProfileCode && !taxProfile) {
        throw new Error(
          `Flash ERP could not find tax profile "${taxProfileCode}".`,
        );
      }

      const product = await tx.product.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          taxProfileId: taxable ? (taxProfile?.id ?? null) : null,
          code: productCode,
          sku,
          name,
          shortName,
          description,
          productType,
          department: hierarchy.departmentCode,
          category: hierarchy.categoryCode,
          subcategory,
          brand,
          seasonCode,
          unitOfMeasure: uomSelection.unitCode,
          baseUnitOfMeasureId: uomSelection.unitId,
          uomScheduleId: uomSelection.scheduleId,
          packSize,
          countryOfOrigin,
          primaryImageUrl,
          notes,
          taxable,
          trackInventory,
          trackExpiry,
          isSerialized,
          trackSize,
          trackColor,
          allowPriceOverride,
          mustEnterPriceAtPos,
          minStockLevel,
          reorderPoint,
          reorderQuantity,
          safetyStockLevel,
          shelfLifeDays,
          weightKg,
          volumeLitres,
          baseUnitPrice,
          baseCostPrice,
          status: RecordStatus.ACTIVE,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code,
        },
        select: {
          id: true,
          code: true,
          name: true,
        },
      });

      await tx.priceListEntry.create({
        data: {
          priceListId: defaultPriceList.id,
          productId: product.id,
          unitPrice: baseUnitPrice,
        },
      });

      if (barcode && barcodeType) {
        await tx.barcode.create({
          data: {
            productId: product.id,
            code: barcode,
            barcodeType,
          },
        });
      }

      return {
        productCode: product.code,
        unitPrice: baseUnitPrice,
        defaultPriceListCode: defaultPriceList.code,
        barcodeCreated: Boolean(barcode),
        message: barcode
          ? `Flash ERP created ${product.name} with default pricing and its first barcode. The next store pull will publish the new catalog, barcode, and pricing packets automatically.`
          : `Flash ERP created ${product.name} with default pricing. The next store pull will publish the new catalog and pricing packets automatically.`,
        serverProcessedAt: new Date().toISOString(),
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    throw toCatalogMutationError(
      error,
      "Flash ERP could not create the enterprise product.",
    );
  }
}

export async function updateEnterpriseProductProfile(
  productCode: string,
  input: UpdateEnterpriseProductProfileRequest,
): Promise<UpdateEnterpriseProductProfileResponse> {
  await ensureProductVariantSalesOrderDepositSchemaCompatibility();

  const normalizedCode = normalizeProductCode(productCode);
  const name = normalizeRequiredText(input.name, "product name");
  const sku = normalizeSku(input.sku);
  const shortName = normalizeOptionalText(input.shortName);
  const description = normalizeOptionalText(input.description);
  const productType = normalizeProductType(input.productType);
  const departmentInput = normalizeOptionalText(input.department);
  const categoryInput = normalizeOptionalText(input.category);
  const subcategory = normalizeOptionalText(input.subcategory);
  const brand = normalizeOptionalText(input.brand);
  const seasonCode = normalizeOptionalText(input.seasonCode);
  const requestedUnitOfMeasure = input.unitOfMeasure ?? "EA";
  const requestedUomScheduleCode = input.uomScheduleCode ?? null;
  const packSize = normalizeOptionalText(input.packSize);
  const countryOfOrigin = normalizeOptionalText(input.countryOfOrigin);
  const primaryImageUrl = normalizeOptionalText(input.primaryImageUrl);
  const notes = normalizeOptionalText(input.notes);
  const taxable = input.taxable ?? true;
  const taxProfileCode =
    normalizeOptionalText(input.taxProfileCode)?.toUpperCase() ?? null;
  const trackInventory = input.trackInventory ?? true;
  const trackExpiry = input.trackExpiry ?? false;
  const isSerialized = input.isSerialized ?? false;
  const trackSize = input.trackSize ?? false;
  const trackColor = input.trackColor ?? false;
  const allowPriceOverride = input.allowPriceOverride ?? false;
  const mustEnterPriceAtPos = input.mustEnterPriceAtPos ?? false;
  const minStockLevel = normalizeOptionalQuantity(
    input.minStockLevel,
    "minimum stock level",
  );
  const reorderPoint = normalizeOptionalQuantity(
    input.reorderPoint,
    "reorder point",
  );
  const reorderQuantity = normalizeOptionalQuantity(
    input.reorderQuantity,
    "reorder quantity",
  );
  const safetyStockLevel = normalizeOptionalQuantity(
    input.safetyStockLevel,
    "safety stock level",
  );
  const shelfLifeDays = normalizeOptionalInteger(
    input.shelfLifeDays,
    "shelf life days",
  );
  const weightKg = normalizeOptionalQuantity(input.weightKg, "weight");
  const volumeLitres = normalizeOptionalQuantity(input.volumeLitres, "volume");
  const baseCostPrice = normalizeOptionalMoney(
    input.baseCostPrice,
    "base cost price",
  );
  const status = normalizeProductStatus(input.status);

  if (isSerialized && !trackInventory) {
    throw new Error(
      "Serialized products must keep inventory tracking enabled in Flash ERP.",
    );
  }


  if (trackExpiry && !trackInventory) {
    throw new Error(
      "Expiry-controlled products must keep inventory tracking enabled in Flash ERP.",
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
          code: true,
        },
      });

      if (!enterpriseNode) {
        throw new Error(
          "No primary enterprise node is available for catalog updates.",
        );
      }

      const product = await tx.product.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: normalizedCode,
          deletedAt: null,
        },
        select: {
          id: true,
          code: true,
          name: true,
          sku: true,
          shortName: true,
          description: true,
          productType: true,
          department: true,
          category: true,
          subcategory: true,
          brand: true,
          seasonCode: true,
          unitOfMeasure: true,
          baseUnitOfMeasureId: true,
          uomScheduleId: true,
          packSize: true,
          countryOfOrigin: true,
          primaryImageUrl: true,
          notes: true,
          taxable: true,
          trackInventory: true,
          trackExpiry: true,
          isSerialized: true,
          trackSize: true,
          trackColor: true,
          allowPriceOverride: true,
          mustEnterPriceAtPos: true,
          minStockLevel: true,
          reorderPoint: true,
          reorderQuantity: true,
          safetyStockLevel: true,
          shelfLifeDays: true,
          weightKg: true,
          volumeLitres: true,
          baseCostPrice: true,
          taxProfile: {
            select: {
              code: true,
            },
          },
          status: true,
        },
      });

      if (!product) {
        throw new Error(
          `Flash ERP could not find product "${normalizedCode}".`,
        );
      }

      const hierarchy = await resolveProductHierarchySelection(
        tx,
        enterpriseNode.retailOrgId,
        {
          department: departmentInput,
          category: categoryInput,
        },
      );
      const uomSelection = await resolveProductUomSelection(
        tx,
        enterpriseNode.retailOrgId,
        {
          unitOfMeasure: requestedUnitOfMeasure,
          uomScheduleCode: requestedUomScheduleCode,
          productType,
        },
      );

      const currentBaseCostPrice =
        product.baseCostPrice === null ? null : Number(product.baseCostPrice);
      const currentMinStockLevel =
        product.minStockLevel === null ? null : Number(product.minStockLevel);
      const currentReorderPoint =
        product.reorderPoint === null ? null : Number(product.reorderPoint);
      const currentReorderQuantity =
        product.reorderQuantity === null
          ? null
          : Number(product.reorderQuantity);
      const currentSafetyStockLevel =
        product.safetyStockLevel === null
          ? null
          : Number(product.safetyStockLevel);
      const currentWeightKg =
        product.weightKg === null ? null : Number(product.weightKg);
      const currentVolumeLitres =
        product.volumeLitres === null ? null : Number(product.volumeLitres);

      const taxProfile =
        taxable && taxProfileCode
          ? await tx.taxProfile.findFirst({
              where: {
                retailOrgId: enterpriseNode.retailOrgId,
                code: taxProfileCode,
                status: RecordStatus.ACTIVE,
                deletedAt: null,
              },
              select: {
                id: true,
                code: true,
              },
            })
          : null;

      if (taxable && taxProfileCode && !taxProfile) {
        throw new Error(
          `Flash ERP could not find tax profile "${taxProfileCode}".`,
        );
      }

      if (
        product.name === name &&
        product.sku === sku &&
        product.shortName === shortName &&
        product.description === description &&
        product.productType === productType &&
        product.department === hierarchy.departmentCode &&
        product.category === hierarchy.categoryCode &&
        product.subcategory === subcategory &&
        product.brand === brand &&
        product.seasonCode === seasonCode &&
        product.unitOfMeasure === uomSelection.unitCode &&
        product.baseUnitOfMeasureId === uomSelection.unitId &&
        product.uomScheduleId === uomSelection.scheduleId &&
        product.packSize === packSize &&
        product.countryOfOrigin === countryOfOrigin &&
        product.primaryImageUrl === primaryImageUrl &&
        product.notes === notes &&
        product.taxable === taxable &&
        (product.taxProfile?.code ?? null) ===
          (taxable ? taxProfileCode : null) &&
        product.trackInventory === trackInventory &&
        product.trackExpiry === trackExpiry &&
        product.isSerialized === isSerialized &&
        product.trackSize === trackSize &&
        product.trackColor === trackColor &&
        product.allowPriceOverride === allowPriceOverride &&
        product.mustEnterPriceAtPos === mustEnterPriceAtPos &&
        currentMinStockLevel === minStockLevel &&
        currentReorderPoint === reorderPoint &&
        currentReorderQuantity === reorderQuantity &&
        currentSafetyStockLevel === safetyStockLevel &&
        product.shelfLifeDays === shelfLifeDays &&
        currentWeightKg === weightKg &&
        currentVolumeLitres === volumeLitres &&
        currentBaseCostPrice === baseCostPrice &&
        product.status === status
      ) {
        return {
          productCode: product.code,
          status,
          message: `${product.name} is already aligned with that profile in Flash ERP enterprise.`,
          serverProcessedAt: new Date().toISOString(),
        };
      }

      const updatedProduct = await tx.product.update({
        where: {
          id: product.id,
        },
        data: {
          name,
          sku,
          shortName,
          description,
          productType,
          department: hierarchy.departmentCode,
          category: hierarchy.categoryCode,
          subcategory,
          brand,
          seasonCode,
          unitOfMeasure: uomSelection.unitCode,
          baseUnitOfMeasureId: uomSelection.unitId,
          uomScheduleId: uomSelection.scheduleId,
          packSize,
          countryOfOrigin,
          primaryImageUrl,
          notes,
          taxable,
          taxProfileId: taxable ? (taxProfile?.id ?? null) : null,
          trackInventory,
          trackExpiry,
          isSerialized,
          trackSize,
          trackColor,
          allowPriceOverride,
          mustEnterPriceAtPos,
          minStockLevel,
          reorderPoint,
          reorderQuantity,
          safetyStockLevel,
          shelfLifeDays,
          weightKg,
          volumeLitres,
          baseCostPrice,
          status,
          recordVersion: {
            increment: 1,
          },
          lastModifiedByNodeCode: enterpriseNode.code,
        },
        select: {
          code: true,
          name: true,
          status: true,
        },
      });

      return {
        productCode: updatedProduct.code,
        status: updatedProduct.status,
        message: `Flash ERP updated ${updatedProduct.name}. The next store pull will publish the catalog profile delta automatically.`,
        serverProcessedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    throw toCatalogMutationError(
      error,
      "Flash ERP could not update the enterprise product profile.",
    );
  }
}

export async function addEnterpriseProductBarcode(
  productCode: string,
  input: AddEnterpriseProductBarcodeRequest,
): Promise<AddEnterpriseProductBarcodeResponse> {
  const normalizedCode = normalizeProductCode(productCode);
  const barcode = normalizeBarcode(input.barcode);
  const barcodeType = normalizeBarcodeType(input.barcodeType);

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
          "No primary enterprise node is available for catalog updates.",
        );
      }

      const product = await tx.product.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: normalizedCode,
          deletedAt: null,
        },
        select: {
          id: true,
          code: true,
          name: true,
        },
      });

      if (!product) {
        throw new Error(
          `Flash ERP could not find product "${normalizedCode}".`,
        );
      }

      const existingBarcode = await tx.barcode.findUnique({
        where: {
          code: barcode,
        },
        select: {
          productId: true,
          barcodeType: true,
        },
      });

      if (existingBarcode?.productId === product.id) {
        return {
          productCode: product.code,
          barcode,
          barcodeType: existingBarcode.barcodeType,
          message: `${barcode} is already attached to ${product.name} in Flash ERP enterprise.`,
          serverProcessedAt: new Date().toISOString(),
        };
      }

      await tx.barcode.create({
        data: {
          productId: product.id,
          code: barcode,
          barcodeType,
        },
      });

      return {
        productCode: product.code,
        barcode,
        barcodeType,
        message: `Flash ERP attached barcode ${barcode} to ${product.name}. The next store pull will publish the scanner delta automatically.`,
        serverProcessedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    throw toCatalogMutationError(
      error,
      "Flash ERP could not attach that barcode.",
    );
  }
}

export async function linkEnterpriseProductSupplier(
  productCode: string,
  input: LinkEnterpriseProductSupplierRequest,
): Promise<LinkEnterpriseProductSupplierResponse> {
  const normalizedCode = normalizeProductCode(productCode);
  const supplierNo = normalizeRequiredText(
    input.supplierNo,
    "supplier number",
  ).toUpperCase();
  const supplierSku = normalizeOptionalText(input.supplierSku);
  const supplierProductName = normalizeOptionalText(input.supplierProductName);
  const packCostPrice = normalizeOptionalMoney(
    input.packCostPrice,
    "pack cost price",
  );
  const leadTimeDays = normalizeOptionalInteger(
    input.leadTimeDays,
    "lead time days",
  );
  const minimumOrderQuantity = normalizeOptionalQuantity(
    input.minimumOrderQuantity,
    "minimum order quantity",
  );
  const isPrimary = input.isPrimary ?? false;

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
          code: true,
        },
      });

      if (!enterpriseNode) {
        throw new Error(
          "No primary enterprise node is available for catalog updates.",
        );
      }

      const [product, supplier] = await Promise.all([
        tx.product.findFirst({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: normalizedCode,
            deletedAt: null,
          },
          select: {
            id: true,
            code: true,
            name: true,
          },
        }),
        tx.supplier.findFirst({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            supplierNo,
            deletedAt: null,
          },
          select: {
            id: true,
            supplierNo: true,
            name: true,
          },
        }),
      ]);

      if (!product) {
        throw new Error(
          `Flash ERP could not find product "${normalizedCode}".`,
        );
      }

      if (!supplier) {
        throw new Error(`Flash ERP could not find supplier "${supplierNo}".`);
      }

      const existingLink = await tx.productSupplier.findUnique({
        where: {
          productId_supplierId: {
            productId: product.id,
            supplierId: supplier.id,
          },
        },
        select: {
          id: true,
          supplierSku: true,
          supplierProductName: true,
          packCostPrice: true,
          leadTimeDays: true,
          minimumOrderQuantity: true,
          isPrimary: true,
        },
      });

      const currentPackCostPrice =
        existingLink?.packCostPrice === null ||
        existingLink?.packCostPrice === undefined
          ? null
          : Number(existingLink.packCostPrice);
      const currentMinimumOrderQuantity =
        existingLink?.minimumOrderQuantity === null ||
        existingLink?.minimumOrderQuantity === undefined
          ? null
          : Number(existingLink.minimumOrderQuantity);

      if (
        existingLink &&
        existingLink.supplierSku === supplierSku &&
        existingLink.supplierProductName === supplierProductName &&
        currentPackCostPrice === packCostPrice &&
        existingLink.leadTimeDays === leadTimeDays &&
        currentMinimumOrderQuantity === minimumOrderQuantity &&
        existingLink.isPrimary === isPrimary
      ) {
        return {
          productCode: product.code,
          supplierNo: supplier.supplierNo,
          supplierName: supplier.name,
          message: `${supplier.name} is already aligned to ${product.name} in Flash ERP enterprise.`,
          serverProcessedAt: new Date().toISOString(),
        };
      }

      if (isPrimary) {
        await tx.productSupplier.updateMany({
          where: {
            productId: product.id,
            isPrimary: true,
          },
          data: {
            isPrimary: false,
          },
        });
      }

      await tx.productSupplier.upsert({
        where: {
          productId_supplierId: {
            productId: product.id,
            supplierId: supplier.id,
          },
        },
        update: {
          supplierSku,
          supplierProductName,
          packCostPrice,
          leadTimeDays,
          minimumOrderQuantity,
          isPrimary,
        },
        create: {
          productId: product.id,
          supplierId: supplier.id,
          supplierSku,
          supplierProductName,
          packCostPrice,
          leadTimeDays,
          minimumOrderQuantity,
          isPrimary,
        },
      });

      await tx.product.update({
        where: {
          id: product.id,
        },
        data: {
          recordVersion: {
            increment: 1,
          },
          lastModifiedByNodeCode: enterpriseNode.code,
        },
      });

      return {
        productCode: product.code,
        supplierNo: supplier.supplierNo,
        supplierName: supplier.name,
        message: `Flash ERP linked ${supplier.name} to ${product.name}. The next store pull will publish the product master delta automatically.`,
        serverProcessedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    throw toCatalogMutationError(
      error,
      "Flash ERP could not link that supplier.",
    );
  }
}

export async function updateEnterpriseProductPricing(
  productCode: string,
  input: UpdateEnterpriseProductPricingRequest,
): Promise<UpdateEnterpriseProductPricingResponse> {
  const normalizedUnitPrice = Number(Number(input.unitPrice).toFixed(2));
  const requestedScope =
    input.priceScope ??
    (normalizeOptionalText(input.loyaltyTier)
      ? "LOYALTY_TIER"
      : normalizeOptionalText(input.customerType)
        ? "CUSTOMER_TYPE"
        : "DEFAULT");
  const priceScope =
    requestedScope === "CUSTOMER_TYPE" || requestedScope === "LOYALTY_TIER"
      ? requestedScope
      : "DEFAULT";

  if (!Number.isFinite(normalizedUnitPrice) || normalizedUnitPrice <= 0) {
    throw new Error("Flash ERP needs a valid unit price greater than zero.");
  }

  const customerType =
    priceScope === "CUSTOMER_TYPE" || priceScope === "LOYALTY_TIER"
      ? normalizeCustomerType(input.customerType)
      : null;
  const loyaltyTier =
    priceScope === "LOYALTY_TIER"
      ? normalizeOptionalText(input.loyaltyTier)
      : null;

  if (priceScope === "CUSTOMER_TYPE" && !customerType) {
    throw new Error("Choose the customer type that should receive this price.");
  }

  if (priceScope === "LOYALTY_TIER" && !loyaltyTier) {
    throw new Error("Enter the loyalty tier that should receive this price.");
  }

  return prisma.$transaction(async (tx) => {
    const enterpriseNode = await tx.syncNode.findFirst({
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
            baseCurrencyCode: true,
          },
        },
      },
    });

    if (!enterpriseNode) {
      throw new Error(
        "No primary enterprise node is available for catalog updates.",
      );
    }

    const product = await tx.product.findFirst({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        code: productCode,
        deletedAt: null,
      },
      select: {
        id: true,
        code: true,
        name: true,
        baseUnitPrice: true,
        recordVersion: true,
      },
    });

    if (!product) {
      throw new Error(`Flash ERP could not find product "${productCode}".`);
    }

    const defaultPriceList = await tx.priceList.findFirst({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        isDefault: true,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        currencyCode: true,
      },
    });

    if (!defaultPriceList) {
      throw new Error("Flash ERP could not find an active default price list.");
    }

    if (priceScope !== "DEFAULT") {
      const profileSlug =
        priceScope === "LOYALTY_TIER"
          ? slugifyPriceListPart(loyaltyTier ?? "")
          : slugifyPriceListPart(customerType ?? "");
      const profileCode =
        priceScope === "LOYALTY_TIER"
          ? `tier-${profileSlug}`
          : `profile-${profileSlug}`;

      if (!profileSlug) {
        throw new Error(
          "Flash ERP needs a valid customer profile price-list code.",
        );
      }

      const profileName =
        priceScope === "LOYALTY_TIER"
          ? `${loyaltyTier} tier sell price`
          : `${customerType} customer sell price`;
      const priceList = await tx.priceList.upsert({
        where: {
          retailOrgId_code: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: profileCode,
          },
        },
        update: {
          name: profileName,
          currencyCode:
            defaultPriceList.currencyCode ||
            enterpriseNode.retailOrg.baseCurrencyCode,
          isDefault: false,
          customerType,
          loyaltyTier,
          status: RecordStatus.ACTIVE,
        },
        create: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: profileCode,
          name: profileName,
          currencyCode:
            defaultPriceList.currencyCode ||
            enterpriseNode.retailOrg.baseCurrencyCode,
          isDefault: false,
          customerType,
          loyaltyTier,
          status: RecordStatus.ACTIVE,
        },
        select: {
          id: true,
          code: true,
          name: true,
        },
      });
      const existingProfileEntry = await tx.priceListEntry.findUnique({
        where: {
          priceListId_productId: {
            priceListId: priceList.id,
            productId: product.id,
          },
        },
        select: {
          id: true,
          unitPrice: true,
        },
      });

      if (
        existingProfileEntry &&
        Number(existingProfileEntry.unitPrice) === normalizedUnitPrice
      ) {
        return {
          productCode: product.code,
          unitPrice: normalizedUnitPrice,
          priceListCode: priceList.code,
          priceListName: priceList.name,
          priceScope,
          message: `${product.name} is already priced at ${normalizedUnitPrice.toFixed(2)} for ${priceList.name}.`,
          serverProcessedAt: new Date().toISOString(),
        };
      }

      if (existingProfileEntry) {
        await tx.priceListEntry.update({
          where: {
            id: existingProfileEntry.id,
          },
          data: {
            unitPrice: normalizedUnitPrice,
          },
        });
      } else {
        await tx.priceListEntry.create({
          data: {
            priceListId: priceList.id,
            productId: product.id,
            unitPrice: normalizedUnitPrice,
          },
        });
      }

      return {
        productCode: product.code,
        unitPrice: normalizedUnitPrice,
        priceListCode: priceList.code,
        priceListName: priceList.name,
        priceScope,
        message: `Flash ERP set ${product.name} to ${normalizedUnitPrice.toFixed(2)} for ${priceList.name}. The next store pull will publish the profile pricing delta automatically.`,
        serverProcessedAt: new Date().toISOString(),
      };
    }

    const existingEntry = await tx.priceListEntry.findUnique({
      where: {
        priceListId_productId: {
          priceListId: defaultPriceList.id,
          productId: product.id,
        },
      },
      select: {
        id: true,
        unitPrice: true,
      },
    });

    const currentBaseUnitPrice = Number(product.baseUnitPrice);
    const currentDefaultUnitPrice = existingEntry
      ? Number(existingEntry.unitPrice)
      : null;

    if (
      currentBaseUnitPrice === normalizedUnitPrice &&
      currentDefaultUnitPrice === normalizedUnitPrice
    ) {
      return {
        productCode: product.code,
        unitPrice: normalizedUnitPrice,
        priceListCode: defaultPriceList.code,
        priceListName: defaultPriceList.name,
        priceScope,
        message: `${product.name} is already priced at ${normalizedUnitPrice.toFixed(2)} in the enterprise master catalog.`,
        serverProcessedAt: new Date().toISOString(),
      };
    }

    await tx.product.update({
      where: {
        id: product.id,
      },
      data: {
        baseUnitPrice: normalizedUnitPrice,
        recordVersion: {
          increment: 1,
        },
        lastModifiedByNodeCode: enterpriseNode.code,
      },
    });

    if (existingEntry) {
      await tx.priceListEntry.update({
        where: {
          id: existingEntry.id,
        },
        data: {
          unitPrice: normalizedUnitPrice,
        },
      });
    } else {
      await tx.priceListEntry.create({
        data: {
          priceListId: defaultPriceList.id,
          productId: product.id,
          unitPrice: normalizedUnitPrice,
        },
      });
    }

    return {
      productCode: product.code,
      unitPrice: normalizedUnitPrice,
      priceListCode: defaultPriceList.code,
      priceListName: defaultPriceList.name,
      priceScope,
      message: `Flash ERP updated ${product.name} to ${normalizedUnitPrice.toFixed(2)} in enterprise. The next store pull will publish the catalog and pricing delta automatically.`,
      serverProcessedAt: new Date().toISOString(),
    };
  });
}
