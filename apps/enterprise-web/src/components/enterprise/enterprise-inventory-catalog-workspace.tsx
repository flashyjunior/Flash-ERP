"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import { ClipboardList, Grid2X2Check, ListOrdered, Plus, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import type { EnterpriseCatalogWorkspaceData } from "@/server/repositories/enterprise-catalog.repository";

type InventoryCatalogRow = EnterpriseCatalogWorkspaceData["inventoryCatalogRows"][number];
type ProductRow = EnterpriseCatalogWorkspaceData["productRows"][number];

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

type ProductSelectionState = Record<
  string,
  {
    selected: boolean;
    sortOrder: string;
  }
>;

type StoreSelectionState = Record<string, boolean>;

const numberFormatter = new Intl.NumberFormat("en-US");

const catalogFilter: FilterFn<InventoryCatalogRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.catalogCode,
    row.original.name,
    row.original.status,
    row.original.storeSummary,
    row.original.productSummary
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const productFilter: FilterFn<ProductRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.productCode,
    row.original.sku ?? "",
    row.original.name,
    row.original.status,
    row.original.unitOfMeasure
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

function buildProductSelection(
  products: ProductRow[],
  catalog?: InventoryCatalogRow | null
): ProductSelectionState {
  const linkedProducts = new Map(
    (catalog?.productLinks ?? []).map((link) => [link.productCode, link.sortOrder] as const)
  );

  return Object.fromEntries(
    products.map((product, index) => [
      product.productCode,
      {
        selected: linkedProducts.has(product.productCode),
        sortOrder: String(linkedProducts.get(product.productCode) ?? index + 1)
      }
    ])
  ) as ProductSelectionState;
}

function buildStoreSelection(
  stores: EnterpriseCatalogWorkspaceData["availableStores"],
  catalog?: InventoryCatalogRow | null
): StoreSelectionState {
  const linkedStores = new Set((catalog?.storeLinks ?? []).map((link) => link.storeCode));

  return Object.fromEntries(
    stores.map((store) => [store.storeCode, linkedStores.has(store.storeCode)])
  ) as StoreSelectionState;
}

function getLicenseTone(status: string) {
  return status === "ACTIVE"
    ? "bg-emerald-100 text-emerald-700"
    : status === "ARCHIVED"
      ? "bg-stone-100 text-stone-600"
      : "bg-amber-100 text-amber-700";
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint
}: {
  icon: typeof Store;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article className="glass-panel rounded-[1.05rem] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
            {label}
          </p>
          <p className="mt-1.5 text-[1.35rem] font-semibold text-stone-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] text-white shadow-[0_12px_24px_rgba(29,78,216,0.22)]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-2 text-[13px] leading-5 text-stone-600">{hint}</p>
    </article>
  );
}

function Feedback({ state }: { state: MutationState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={`rounded-xl border px-3 py-2 text-sm leading-5 ${
        state.status === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {state.message}
    </div>
  );
}

export function EnterpriseInventoryCatalogWorkspace({
  workspace
}: {
  workspace: EnterpriseCatalogWorkspaceData;
}) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCatalogCode, setEditingCatalogCode] = useState<string | null>(null);
  const [catalogCode, setCatalogCode] = useState("");
  const [catalogName, setCatalogName] = useState("");
  const [catalogDescription, setCatalogDescription] = useState("");
  const [catalogStatus, setCatalogStatus] = useState("ACTIVE");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [storeQuery, setStoreQuery] = useState("");
  const [productSelection, setProductSelection] = useState<ProductSelectionState>(() =>
    buildProductSelection(workspace.productRows)
  );
  const [storeSelection, setStoreSelection] = useState<StoreSelectionState>(() =>
    buildStoreSelection(workspace.availableStores)
  );
  const [saveState, setSaveState] = useState<MutationState>({
    status: "idle",
    message: ""
  });

  const selectedProducts = useMemo(
    () =>
      workspace.productRows
        .filter((product) => productSelection[product.productCode]?.selected)
        .map((product) => ({
          ...product,
          sortOrder: Number(productSelection[product.productCode]?.sortOrder || 0)
        }))
        .sort((left, right) =>
          left.sortOrder === right.sortOrder
            ? left.name.localeCompare(right.name)
            : left.sortOrder - right.sortOrder
        ),
    [productSelection, workspace.productRows]
  );
  const selectedStoreCodes = useMemo(
    () =>
      workspace.availableStores
        .filter((store) => storeSelection[store.storeCode])
        .map((store) => store.storeCode),
    [storeSelection, workspace.availableStores]
  );
  const filteredProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();

    if (!query) {
      return workspace.productRows;
    }

    return workspace.productRows.filter((product) =>
      [product.productCode, product.sku ?? "", product.name].join(" ").toLowerCase().includes(query)
    );
  }, [productQuery, workspace.productRows]);
  const filteredStores = useMemo(() => {
    const query = storeQuery.trim().toLowerCase();

    if (!query) {
      return workspace.availableStores;
    }

    return workspace.availableStores.filter((store) =>
      [store.storeCode, store.storeName, store.region ?? "", store.storeGroupLabel]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [storeQuery, workspace.availableStores]);
  const storesByGroup = useMemo(() => {
    const grouped = new Map<string, typeof workspace.availableStores>();

    for (const store of filteredStores) {
      const group = store.storeGroupLabel || store.region || "Ungrouped";
      grouped.set(group, [...(grouped.get(group) ?? []), store]);
    }

    return [...grouped.entries()];
  }, [filteredStores]);
  const catalogMembershipByProductCode = useMemo(() => {
    const memberships = new Map<string, string[]>();

    for (const catalog of workspace.inventoryCatalogRows) {
      for (const product of catalog.productLinks) {
        memberships.set(product.productCode, [
          ...(memberships.get(product.productCode) ?? []),
          catalog.name
        ]);
      }
    }

    return memberships;
  }, [workspace.inventoryCatalogRows]);

  const catalogColumns = useMemo<ColumnDef<InventoryCatalogRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Catalog",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.name}</p>
            <p className="truncate text-xs text-stone-500">{row.original.catalogCode}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "productCount",
        header: "Products",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium text-stone-800">
              {numberFormatter.format(row.original.productCount)} of {numberFormatter.format(workspace.productRows.length)} linked
            </p>
            <p className="truncate text-xs text-stone-500">{row.original.productSummary}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "storeCount",
        header: "Shops",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium text-stone-800">
              {numberFormatter.format(row.original.storeCount)}
            </p>
            <p className="truncate text-xs text-stone-500">{row.original.storeSummary}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getLicenseTone(
              row.original.status
            )}`}
          >
            {row.original.status}
          </span>
        )
      },
      {
        accessorKey: "updatedAtLabel",
        header: "Updated",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-stone-800">
              {row.original.updatedAtLabel}
            </p>
            <p className="truncate text-xs text-stone-500">
              {new Date(row.original.updatedAt).toLocaleString()}
            </p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit catalog",
                onSelect: () => openCatalogDialog(row.original),
                tone: "primary"
              }
            ]}
          />
        )
      }
    ],
    [workspace.productRows.length]
  );
  const productColumns = useMemo<ColumnDef<ProductRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium text-stone-900">{row.original.name}</p>
            <p className="text-xs text-stone-500">
              {row.original.productCode}{row.original.sku ? ` · ${row.original.sku}` : ""}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getLicenseTone(row.original.status)}`}>
            {row.original.status}
          </span>
        )
      },
      {
        accessorKey: "unitOfMeasure",
        header: "UOM"
      },
      {
        accessorKey: "defaultPrice",
        header: "Default price",
        cell: ({ row }) => row.original.defaultPrice === null
          ? "Not set"
          : numberFormatter.format(row.original.defaultPrice)
      },
      {
        id: "catalogs",
        header: "Catalog membership",
        cell: ({ row }) => {
          const memberships = catalogMembershipByProductCode.get(row.original.productCode) ?? [];

          return memberships.length ? memberships.join(", ") : "Not linked";
        },
        meta: { disableTruncate: true }
      }
    ],
    [catalogMembershipByProductCode]
  );

  function openCatalogDialog(catalog?: InventoryCatalogRow | null) {
    setEditingCatalogCode(catalog?.catalogCode ?? null);
    setCatalogCode(catalog?.catalogCode ?? "");
    setCatalogName(catalog?.name ?? "");
    setCatalogDescription(catalog?.description ?? "");
    setCatalogStatus(catalog?.status ?? "ACTIVE");
    setEffectiveFrom(catalog?.effectiveFrom ? catalog.effectiveFrom.slice(0, 10) : "");
    setEffectiveUntil(catalog?.effectiveUntil ? catalog.effectiveUntil.slice(0, 10) : "");
    setProductSelection(buildProductSelection(workspace.productRows, catalog));
    setStoreSelection(buildStoreSelection(workspace.availableStores, catalog));
    setProductQuery("");
    setStoreQuery("");
    setSaveState({ status: "idle", message: "" });
    setIsDialogOpen(true);
  }

  function setProductChecked(productCode: string, selected: boolean) {
    setProductSelection((current) => ({
      ...current,
      [productCode]: {
        selected,
        sortOrder: current[productCode]?.sortOrder ?? "1"
      }
    }));
  }

  function setProductSortOrder(productCode: string, sortOrder: string) {
    setProductSelection((current) => ({
      ...current,
      [productCode]: {
        selected: current[productCode]?.selected ?? true,
        sortOrder
      }
    }));
  }

  async function handleSaveCatalog() {
    const catalogProducts = selectedProducts.map((product, index) => {
      const parsedSortOrder = Math.trunc(Number(product.sortOrder));

      return {
        productCode: product.productCode,
        sortOrder: Number.isFinite(parsedSortOrder) && parsedSortOrder > 0 ? parsedSortOrder : index + 1
      };
    });
    const productCodes = catalogProducts.map((product) => product.productCode);

    if (productCodes.length === 0) {
      setSaveState({
        status: "error",
        message: "Select at least one product before saving the inventory catalog."
      });
      return;
    }

    setSaveState({
      status: "submitting",
      message: ""
    });

    try {
      const response = await fetch("/api/catalog/inventory-catalogs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          catalogCode,
          name: catalogName,
          description: catalogDescription.trim() ? catalogDescription : null,
          status: catalogStatus,
          effectiveFrom: effectiveFrom || null,
          effectiveUntil: effectiveUntil || null,
          products: catalogProducts,
          productCodes,
          storeCodes: selectedStoreCodes
        })
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save that inventory catalog.");
      }

      setSaveState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the inventory catalog."
      });
      startTransition(() => {
        window.setTimeout(() => {
          setIsDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setSaveState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save that inventory catalog."
      });
    }
  }

  return (
    <EnterpriseShell
      activeSection="settings"
      description="Build HQ-controlled product assortments, set their screen order, and assign them to shops for downstream sync."
      eyebrow="Flash ERP enterprise"
      heading="Inventory Catalogs"
    >
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[color:var(--brand)]"
            onClick={() => openCatalogDialog()}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Create catalog
          </button>
        </div>
        <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-700">
          Last refresh {new Date(workspace.refreshedAt).toLocaleString()}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          hint="HQ inventory catalogs available for controlled shop publication."
          icon={ClipboardList}
          label="Catalogs"
          value={numberFormatter.format(workspace.inventoryCatalogRows.length)}
        />
        <MetricCard
          hint="Active catalogs currently eligible for shop sync."
          icon={Grid2X2Check}
          label="Active"
          value={numberFormatter.format(workspace.metrics.activeCatalogs)}
        />
        <MetricCard
          hint="Products available to be selected into one or more catalogs."
          icon={ListOrdered}
          label="Products"
          value={numberFormatter.format(workspace.productRows.length)}
        />
        <MetricCard
          hint="Shops available for catalog assignment."
          icon={Store}
          label="Shops"
          value={numberFormatter.format(workspace.availableStores.length)}
        />
      </section>

      <SharedDataGrid
        columns={catalogColumns}
        data={workspace.inventoryCatalogRows}
        emptyLabel="No inventory catalogs are registered yet."
        exportFileName="flash-erp-inventory-catalogs"
        globalFilterFn={catalogFilter}
        searchPlaceholder="Search catalogs by product, shop, status, or code"
        toolbarActions={
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[color:var(--brand)]"
            onClick={() => openCatalogDialog()}
            type="button"
          >
            <Plus className="h-4 w-4" />
            New catalog
          </button>
        }
      />

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-950">All products</h2>
          <p className="text-sm text-stone-600">
            Every non-deleted product in this business, including products not yet linked to a catalog.
          </p>
        </div>
        <SharedDataGrid
          columns={productColumns}
          data={workspace.productRows}
          emptyLabel="No products are registered for this business."
          exportFileName="flash-erp-inventory-catalog-products"
          globalFilterFn={productFilter}
          initialPageSize={50}
          pageSizeOptions={[25, 50, 100, 250, 500]}
          searchPlaceholder="Search all products by name, code, SKU, status, or UOM"
        />
      </div>

      <section className="glass-panel rounded-[1.25rem] p-4">
        <p className="text-sm leading-6 text-stone-600">{workspace.statusMessage}</p>
      </section>

      <ActionDialog
        description="Select catalog products, set their display order, then select the shop nodes that should receive this assortment."
        hideTrigger
        onOpenChange={setIsDialogOpen}
        open={isDialogOpen}
        title={editingCatalogCode ? `Edit ${editingCatalogCode}` : "Create inventory catalog"}
        triggerLabel="Inventory catalog"
        widthClassName="max-w-6xl"
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-[13px] text-stone-700">
              <span className="font-semibold text-stone-900">Catalog code</span>
              <input
                className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                disabled={Boolean(editingCatalogCode)}
                onChange={(event) => setCatalogCode(event.target.value)}
                value={catalogCode}
              />
            </label>
            <label className="grid gap-1 text-[13px] text-stone-700">
              <span className="font-semibold text-stone-900">Catalog name</span>
              <input
                className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                onChange={(event) => setCatalogName(event.target.value)}
                value={catalogName}
              />
            </label>
            <label className="grid gap-1 text-[13px] text-stone-700">
              <span className="font-semibold text-stone-900">Status</span>
              <select
                className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                onChange={(event) => setCatalogStatus(event.target.value)}
                value={catalogStatus}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <label className="grid gap-1 text-[13px] text-stone-700">
              <span className="font-semibold text-stone-900">Effective from</span>
              <input
                className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                onChange={(event) => setEffectiveFrom(event.target.value)}
                type="date"
                value={effectiveFrom}
              />
            </label>
            <label className="grid gap-1 text-[13px] text-stone-700">
              <span className="font-semibold text-stone-900">Effective until</span>
              <input
                className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                onChange={(event) => setEffectiveUntil(event.target.value)}
                type="date"
                value={effectiveUntil}
              />
            </label>
            <label className="grid gap-1 text-[13px] text-stone-700 md:col-span-2 xl:col-span-3">
              <span className="font-semibold text-stone-900">Description</span>
              <input
                className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                onChange={(event) => setCatalogDescription(event.target.value)}
                value={catalogDescription}
              />
            </label>
          </div>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)]">
            <div className="rounded-xl border border-stone-200 bg-white/90 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-stone-950">Products and order</p>
                  <p className="text-xs text-stone-500">
                    {selectedProducts.length} selected for this catalog
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="h-9 min-w-52 rounded-lg border border-stone-200 bg-white px-2.5 text-sm outline-none transition focus:border-[var(--brand)]"
                    onChange={(event) => setProductQuery(event.target.value)}
                    placeholder="Filter products"
                    value={productQuery}
                  />
                  <button
                    className="rounded-lg border border-stone-200 px-3 text-sm font-semibold text-stone-700"
                    onClick={() =>
                      setProductSelection(
                        Object.fromEntries(
                          workspace.productRows.map((product, index) => [
                            product.productCode,
                            { selected: true, sortOrder: String(index + 1) }
                          ])
                        ) as ProductSelectionState
                      )
                    }
                    type="button"
                  >
                    Select all
                  </button>
                  <button
                    className="rounded-lg border border-stone-200 px-3 text-sm font-semibold text-stone-700"
                    onClick={() => setProductSelection(buildProductSelection(workspace.productRows))}
                    type="button"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="mt-3 max-h-[26rem] overflow-auto rounded-lg border border-stone-200">
                <table className="min-w-full divide-y divide-stone-200 text-sm">
                  <thead className="sticky top-0 bg-stone-50 text-left text-[11px] uppercase tracking-[0.16em] text-stone-500">
                    <tr>
                      <th className="w-12 px-3 py-2">Use</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="w-28 px-3 py-2">Sort</th>
                      <th className="w-24 px-3 py-2">UOM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 bg-white">
                    {filteredProducts.map((product) => {
                      const selection = productSelection[product.productCode] ?? {
                        selected: false,
                        sortOrder: "1"
                      };

                      return (
                        <tr key={product.productCode}>
                          <td className="px-3 py-2">
                            <input
                              checked={selection.selected}
                              onChange={(event) =>
                                setProductChecked(product.productCode, event.target.checked)
                              }
                              type="checkbox"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-stone-900">{product.name}</p>
                            <p className="text-xs text-stone-500">
                              {product.productCode}
                              {product.sku ? ` • ${product.sku}` : ""}
                            </p>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className="h-8 w-20 rounded-lg border border-stone-200 px-2 text-sm outline-none focus:border-[var(--brand)]"
                              disabled={!selection.selected}
                              min="1"
                              onChange={(event) =>
                                setProductSortOrder(product.productCode, event.target.value)
                              }
                              type="number"
                              value={selection.sortOrder}
                            />
                          </td>
                          <td className="px-3 py-2 text-xs font-semibold text-stone-600">
                            {product.unitOfMeasure}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-stone-200 bg-white/90 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-stone-950">Apply to shops</p>
                  <p className="text-xs text-stone-500">
                    {selectedStoreCodes.length} shop node(s) selected
                  </p>
                </div>
                <input
                  className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 text-sm outline-none transition focus:border-[var(--brand)]"
                  onChange={(event) => setStoreQuery(event.target.value)}
                  placeholder="Filter shops"
                  value={storeQuery}
                />
              </div>
              <div className="mt-3 max-h-[26rem] space-y-3 overflow-auto pr-1">
                {storesByGroup.map(([group, stores]) => (
                  <div className="rounded-lg border border-stone-200 bg-stone-50/70 p-2" key={group}>
                    <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                      {group}
                    </p>
                    <div className="mt-1 space-y-1">
                      {stores.map((store) => (
                        <label
                          className="flex items-start gap-2 rounded-lg bg-white px-2 py-2 text-sm text-stone-700"
                          key={store.storeCode}
                        >
                          <input
                            checked={storeSelection[store.storeCode] ?? false}
                            className="mt-1"
                            onChange={(event) =>
                              setStoreSelection((current) => ({
                                ...current,
                                [store.storeCode]: event.target.checked
                              }))
                            }
                            type="checkbox"
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-stone-900">
                              {store.storeName}
                            </span>
                            <span className="block truncate text-xs text-stone-500">
                              {store.storeCode}
                              {store.region ? ` • ${store.region}` : ""}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-600">
              {selectedProducts.length} product(s), {selectedStoreCodes.length} shop node(s)
            </div>
            <div className="flex gap-2">
              <button
                className="inline-flex h-9 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:border-stone-400"
                disabled={saveState.status === "submitting"}
                onClick={() => setIsDialogOpen(false)}
                type="button"
              >
                Close
              </button>
              <button
                className="inline-flex h-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-4 text-sm font-semibold text-white shadow-[0_14px_26px_rgba(29,78,216,0.18)] transition hover:brightness-[1.03] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={
                  saveState.status === "submitting" ||
                  !catalogCode.trim() ||
                  !catalogName.trim() ||
                  selectedProducts.length === 0
                }
                onClick={() => void handleSaveCatalog()}
                type="button"
              >
                {saveState.status === "submitting" ? "Saving..." : "Save catalog"}
              </button>
            </div>
          </div>
          <Feedback state={saveState} />
        </div>
      </ActionDialog>
    </EnterpriseShell>
  );
}
