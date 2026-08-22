export type StorefrontCatalogProduct = {
  department?: string | null;
  category?: string | null;
  subcategory?: string | null;
};

export type StorefrontCatalogSelection =
  | { level: "ALL" }
  | { level: "DEPARTMENT"; department: string }
  | { level: "CATEGORY"; department: string; category: string }
  | { level: "SUBCATEGORY"; department: string; category: string; subcategory: string };

export type StorefrontSubcategoryNode = {
  name: string;
  count: number;
};

export type StorefrontCategoryNode = {
  name: string;
  count: number;
  subcategories: StorefrontSubcategoryNode[];
};

export type StorefrontDepartmentNode = {
  name: string;
  count: number;
  categories: StorefrontCategoryNode[];
};

const UNCATEGORIZED_LABEL = "Other";

function normalizeCatalogValue(value: string | null | undefined) {
  return value?.trim() || UNCATEGORIZED_LABEL;
}

export function buildStorefrontCategoryTree(
  products: StorefrontCatalogProduct[],
): StorefrontDepartmentNode[] {
  const departments = new Map<
    string,
    { count: number; categories: Map<string, { count: number; subcategories: Map<string, number> }> }
  >();

  for (const product of products) {
    const departmentName = normalizeCatalogValue(product.department);
    const categoryName = normalizeCatalogValue(product.category);
    const subcategoryName = normalizeCatalogValue(product.subcategory);
    const department = departments.get(departmentName) ?? {
      count: 0,
      categories: new Map(),
    };
    const category = department.categories.get(categoryName) ?? {
      count: 0,
      subcategories: new Map(),
    };

    department.count += 1;
    category.count += 1;
    category.subcategories.set(
      subcategoryName,
      (category.subcategories.get(subcategoryName) ?? 0) + 1,
    );
    department.categories.set(categoryName, category);
    departments.set(departmentName, department);
  }

  return [...departments.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([departmentName, department]) => ({
      name: departmentName,
      count: department.count,
      categories: [...department.categories.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([categoryName, category]) => ({
          name: categoryName,
          count: category.count,
          subcategories: [...category.subcategories.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([subcategoryName, count]) => ({ name: subcategoryName, count })),
        })),
    }));
}

export function productMatchesStorefrontSelection(
  product: StorefrontCatalogProduct,
  selection: StorefrontCatalogSelection,
) {
  if (selection.level === "ALL") return true;

  if (normalizeCatalogValue(product.department) !== selection.department) return false;
  if (selection.level === "DEPARTMENT") return true;

  if (normalizeCatalogValue(product.category) !== selection.category) return false;
  if (selection.level === "CATEGORY") return true;

  return normalizeCatalogValue(product.subcategory) === selection.subcategory;
}

export function getStorefrontSelectionLabel(selection: StorefrontCatalogSelection) {
  if (selection.level === "ALL") return "Shop";
  if (selection.level === "DEPARTMENT") return selection.department;
  if (selection.level === "CATEGORY") return selection.category;
  return selection.subcategory;
}
