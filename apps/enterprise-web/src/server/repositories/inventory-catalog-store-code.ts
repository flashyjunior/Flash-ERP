export type InventoryCatalogStoreIdentity = {
  id: string;
  code: string;
};

function storeCodeLookupKey(value: string) {
  return value.trim().toUpperCase();
}

export function normalizeInventoryCatalogStoreCodes(values: unknown) {
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

    const code = value.trim().replace(/\s+/g, "-");
    const lookupKey = storeCodeLookupKey(code);

    if (!code || seen.has(lookupKey)) {
      continue;
    }

    seen.add(lookupKey);
    normalized.push(code);
  }

  return normalized;
}

export function resolveInventoryCatalogStores<
  TStore extends InventoryCatalogStoreIdentity,
>(requestedCodes: readonly string[], availableStores: readonly TStore[]) {
  const storeByLookupKey = new Map<string, TStore>();

  for (const store of availableStores) {
    const lookupKey = storeCodeLookupKey(store.code);
    const existing = storeByLookupKey.get(lookupKey);

    if (existing && existing.code !== store.code) {
      throw new Error(
        `Flash ERP found conflicting shop codes ${existing.code} and ${store.code}.`,
      );
    }

    storeByLookupKey.set(lookupKey, store);
  }

  const stores: TStore[] = [];
  const missingStoreCodes: string[] = [];

  for (const requestedCode of requestedCodes) {
    const store = storeByLookupKey.get(storeCodeLookupKey(requestedCode));

    if (store) {
      stores.push(store);
    } else {
      missingStoreCodes.push(requestedCode);
    }
  }

  return { stores, missingStoreCodes };
}
