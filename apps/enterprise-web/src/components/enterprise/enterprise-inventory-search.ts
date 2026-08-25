function normalizeInventorySearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchesInventorySearchTerms(
  values: Array<string | null | undefined>,
  rawQuery: string,
) {
  const terms = normalizeInventorySearchText(rawQuery).split(" ").filter(Boolean);

  if (terms.length === 0) {
    return true;
  }

  const searchableText = normalizeInventorySearchText(values.filter(Boolean).join(" "));
  return terms.every((term) => searchableText.includes(term));
}
