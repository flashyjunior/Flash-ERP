type CatalogPolicyRecord = Record<string, unknown>;

export type StoreProductCatalogScope = {
  productIds: string[];
  productCodes: string[];
  departmentCodes: string[];
  categoryCodes: string[];
};

export type StoreProductCatalogSource = {
  catalogPolicyJson: unknown;
  inventoryCatalogLinks: Array<{
    catalog: {
      products: Array<{
        product: {
          id: string;
          code: string;
        };
      }>;
    };
  }>;
};

function normalizeCodes(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
}

function readCatalogPolicy(value: unknown): CatalogPolicyRecord | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as CatalogPolicyRecord)
        : null;
    } catch {
      return null;
    }
  }

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as CatalogPolicyRecord)
    : null;
}

function scopeOrNull(scope: StoreProductCatalogScope) {
  return scope.productCodes.length > 0 ||
    scope.productIds.length > 0 ||
    scope.departmentCodes.length > 0 ||
    scope.categoryCodes.length > 0
    ? scope
    : null;
}

export function resolveStoreProductCatalogScope(
  source: StoreProductCatalogSource,
): StoreProductCatalogScope | null {
  if (source.inventoryCatalogLinks.length > 0) {
    return scopeOrNull({
      productIds: [
        ...new Set(
          source.inventoryCatalogLinks.flatMap((link) =>
            link.catalog.products.map((productLink) => productLink.product.id),
          ),
        ),
      ],
      productCodes: normalizeCodes(
        source.inventoryCatalogLinks.flatMap((link) =>
          link.catalog.products.map((productLink) => productLink.product.code),
        ),
      ),
      departmentCodes: [],
      categoryCodes: [],
    });
  }

  const legacyPolicy = readCatalogPolicy(source.catalogPolicyJson);

  return legacyPolicy
    ? scopeOrNull({
        productIds: [],
        productCodes: normalizeCodes(legacyPolicy.productCodes),
        departmentCodes: normalizeCodes(legacyPolicy.departmentCodes),
        categoryCodes: normalizeCodes(legacyPolicy.categoryCodes),
      })
    : null;
}
