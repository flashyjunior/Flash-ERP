"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  BadgeDollarSign,
  Check,
  ChevronDown,
  PackageOpen,
  Save,
  Search,
  Store
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import type { EnterpriseStorePricingWorkspaceData } from "@/server/repositories/enterprise-store-pricing.repository";

type PriceRow = EnterpriseStorePricingWorkspaceData["priceRows"][number];
type SellingUnitRow = EnterpriseStorePricingWorkspaceData["sellingUnitRows"][number];
type TargetRow = EnterpriseStorePricingWorkspaceData["targets"][number];

const numberFormatter = new Intl.NumberFormat("en-US");

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    currencyDisplay: "narrowSymbol"
  }).format(value);
}

function targetLabel(target: TargetRow) {
  return target.productVariantCode
    ? `${target.productName} / ${target.productVariantName ?? target.productVariantCode}`
    : target.productName;
}

function ProductTargetCombobox({
  targets,
  value,
  onChange
}: {
  targets: TargetRow[];
  value: string;
  onChange: (targetId: string) => void;
}) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedTarget = targets.find((target) => target.targetId === value) ?? null;
  const filteredTargets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return targets;

    return targets.filter((target) =>
      [
        target.productName,
        target.productCode,
        target.productType,
        target.productVariantName,
        target.productVariantCode,
        targetLabel(target)
      ]
        .filter(Boolean)
        .some((candidate) => String(candidate).toLowerCase().includes(normalizedQuery))
    );
  }, [query, targets]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function openPicker() {
    if (targets.length === 0) return;
    setIsOpen(true);
    setQuery("");
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function chooseTarget(targetId: string) {
    onChange(targetId);
    setIsOpen(false);
    setQuery("");
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-left text-sm outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)] disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400"
        disabled={targets.length === 0}
        onClick={() => (isOpen ? setIsOpen(false) : openPicker())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker();
          }
        }}
        type="button"
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold text-stone-900">
            {selectedTarget ? targetLabel(selectedTarget) : "Choose a product"}
          </span>
          {selectedTarget ? (
            <span className="block truncate text-xs font-normal text-stone-500">
              {[selectedTarget.productCode, selectedTarget.productVariantCode]
                .filter(Boolean)
                .join(" / ")}
            </span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-stone-500 transition ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen ? (
        <div className="absolute z-40 mt-2 w-full min-w-[18rem] overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-stone-200 px-3 py-2">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-stone-400" />
            <input
              aria-activedescendant={
                filteredTargets[activeIndex]
                  ? `${listboxId}-option-${activeIndex}`
                  : undefined
              }
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-expanded="true"
              aria-label="Search products"
              className="min-w-0 flex-1 bg-transparent py-1 text-sm text-stone-900 outline-none placeholder:text-stone-400"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setIsOpen(false);
                  setQuery("");
                  return;
                }

                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((current) =>
                    Math.min(current + 1, Math.max(filteredTargets.length - 1, 0))
                  );
                  return;
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((current) => Math.max(current - 1, 0));
                  return;
                }

                if (event.key === "Enter" && filteredTargets[activeIndex]) {
                  event.preventDefault();
                  chooseTarget(filteredTargets[activeIndex].targetId);
                }
              }}
              placeholder="Search name, code, or matrix option"
              ref={searchInputRef}
              role="combobox"
              value={query}
            />
          </div>

          <div className="max-h-72 overflow-y-auto p-1" id={listboxId} role="listbox">
            {filteredTargets.length > 0 ? (
              filteredTargets.map((target, index) => {
                const isSelected = target.targetId === value;
                const isActive = index === activeIndex;

                return (
                  <button
                    aria-selected={isSelected}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition ${
                      isActive ? "bg-stone-100" : "hover:bg-stone-50"
                    }`}
                    id={`${listboxId}-option-${index}`}
                    key={target.targetId}
                    onClick={() => chooseTarget(target.targetId)}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-stone-900">
                        {targetLabel(target)}
                      </span>
                      <span className="block truncate text-xs text-stone-500">
                        {[target.productCode, target.productVariantCode, target.productType]
                          .filter(Boolean)
                          .join(" / ")}
                      </span>
                    </span>
                    {isSelected ? (
                      <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : null}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-6 text-center text-sm text-stone-500">
                No products match that search.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const priceFilter: FilterFn<PriceRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  const original = row.original;
  return [
    original.productCode,
    original.productName,
    original.productVariantCode,
    original.productVariantName,
    original.storeCode,
    original.storeName,
    original.status
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
};

const sellingUnitFilter: FilterFn<SellingUnitRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) return true;

  const original = row.original;
  return [
    original.productCode,
    original.productName,
    original.productVariantCode,
    original.productVariantName,
    original.storeCode,
    original.storeName,
    original.unitOfMeasureCode,
    original.unitOfMeasureName,
    original.barcode,
    original.status
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
};

export function EnterpriseStorePricingWorkspace({
  workspace
}: {
  workspace: EnterpriseStorePricingWorkspaceData;
}) {
  const router = useRouter();
  const firstTarget = workspace.targets[0] ?? null;
  const firstSellingUnit = firstTarget?.sellingUnitOptions[0] ?? null;
  const [workspaceMode, setWorkspaceMode] = useState<"prices" | "selling-units">(
    "prices"
  );
  const [targetId, setTargetId] = useState(firstTarget?.targetId ?? "");
  const [unitPrice, setUnitPrice] = useState(
    firstTarget ? firstTarget.baseUnitPrice.toFixed(2) : ""
  );
  const [selectedStoreCodes, setSelectedStoreCodes] = useState<string[]>(
    workspace.stores.map((store) => store.storeCode)
  );
  const [sellingUnitCode, setSellingUnitCode] = useState(
    firstSellingUnit?.unitOfMeasureCode ?? ""
  );
  const [sellingUnitPrice, setSellingUnitPrice] = useState(
    firstTarget ? firstTarget.baseUnitPrice.toFixed(2) : ""
  );
  const [sellingUnitBarcode, setSellingUnitBarcode] = useState("");
  const [sellingUnitDefault, setSellingUnitDefault] = useState(false);
  const [state, setState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({ status: "idle", message: "" });
  const selectedTarget =
    workspace.targets.find((target) => target.targetId === targetId) ?? firstTarget;
  const selectedSellingUnit = selectedTarget?.sellingUnitOptions.find(
    (unit) => unit.unitOfMeasureCode === sellingUnitCode
  );

  function selectTarget(nextTargetId: string) {
    const nextTarget = workspace.targets.find((target) => target.targetId === nextTargetId);

    setTargetId(nextTargetId);
    setUnitPrice(nextTarget ? nextTarget.baseUnitPrice.toFixed(2) : "");
    setSellingUnitCode(nextTarget?.sellingUnitOptions[0]?.unitOfMeasureCode ?? "");
    setSellingUnitPrice(nextTarget ? nextTarget.baseUnitPrice.toFixed(2) : "");
    setSellingUnitBarcode("");
    setSellingUnitDefault(false);
  }

  const priceColumns = useMemo<ColumnDef<PriceRow>[]>(
    () => [
      {
        accessorKey: "productName",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-semibold text-stone-950">{row.original.productName}</p>
            <p className="truncate text-xs text-stone-500">
              {[row.original.productCode, row.original.productVariantName ?? row.original.productVariantCode]
                .filter(Boolean)
                .join(" / ")}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "storeName",
        header: "Shop",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-semibold text-stone-900">{row.original.storeName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.storeCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "unitPrice",
        header: "Shop price",
        cell: ({ row }) => formatMoney(row.original.unitPrice, workspace.currencyCode)
      },
      {
        accessorKey: "baseUnitPrice",
        header: "Base price",
        cell: ({ row }) => formatMoney(row.original.baseUnitPrice, workspace.currencyCode)
      },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ row }) => new Date(row.original.updatedAt).toLocaleString()
      },
      {
        id: "actions",
        header: "",
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Remove price",
                tone: "danger",
                onSelect: () => void removePrice(row.original.priceId)
              }
            ]}
          />
        )
      }
    ],
    [workspace.currencyCode]
  );

  const sellingUnitColumns = useMemo<ColumnDef<SellingUnitRow>[]>(
    () => [
      {
        accessorKey: "productName",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-semibold text-stone-950">{row.original.productName}</p>
            <p className="truncate text-xs text-stone-500">
              {[row.original.productCode, row.original.productVariantName ?? row.original.productVariantCode]
                .filter(Boolean)
                .join(" / ")}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "storeName",
        header: "Shop",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-semibold text-stone-900">{row.original.storeName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.storeCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "unitOfMeasureCode",
        header: "Selling unit",
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-stone-900">
              {row.original.unitOfMeasureCode} / {row.original.unitOfMeasureName}
              {row.original.isDefault ? " / Default" : ""}
            </p>
            <p className="text-xs text-stone-500">
              1 {row.original.unitOfMeasureCode} = {row.original.conversionFactor}{" "}
              {row.original.baseUnitOfMeasure}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "unitPrice",
        header: "Selling price",
        cell: ({ row }) => formatMoney(row.original.unitPrice, workspace.currencyCode)
      },
      {
        accessorKey: "barcode",
        header: "Barcode",
        cell: ({ row }) => row.original.barcode ?? "-"
      },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ row }) => new Date(row.original.updatedAt).toLocaleString()
      },
      {
        id: "actions",
        header: "",
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Remove selling unit",
                tone: "danger",
                onSelect: () => void removeSellingUnit(row.original.sellingUnitId)
              }
            ]}
          />
        )
      }
    ],
    [workspace.currencyCode]
  );

  async function savePrices() {
    setState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/catalog/store-prices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          targetId,
          unitPrice: Number(unitPrice),
          storeCodes: selectedStoreCodes
        })
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save those shop prices.");
      }

      setState({
        status: "success",
        message: payload.message ?? "Flash ERP saved those shop prices."
      });
      router.refresh();
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save those shop prices."
      });
    }
  }

  async function removePrice(priceId: string) {
    setState({ status: "submitting", message: "" });

    try {
      const response = await fetch(`/api/catalog/store-prices/${encodeURIComponent(priceId)}`, {
        method: "DELETE"
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not remove that shop price.");
      }

      setState({
        status: "success",
        message: payload.message ?? "Flash ERP removed that shop price."
      });
      router.refresh();
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not remove that shop price."
      });
    }
  }

  async function saveSellingUnits() {
    setState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/catalog/store-selling-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId,
          unitOfMeasureCode: sellingUnitCode,
          unitPrice: Number(sellingUnitPrice),
          barcode: sellingUnitBarcode,
          isDefault: sellingUnitDefault,
          storeCodes: selectedStoreCodes
        })
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save that selling unit.");
      }

      setState({
        status: "success",
        message: payload.message ?? "Flash ERP saved that selling unit."
      });
      setSellingUnitBarcode("");
      router.refresh();
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save that selling unit."
      });
    }
  }

  async function removeSellingUnit(sellingUnitId: string) {
    setState({ status: "submitting", message: "" });

    try {
      const response = await fetch(
        `/api/catalog/store-selling-units/${encodeURIComponent(sellingUnitId)}`,
        { method: "DELETE" }
      );
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not remove that selling unit.");
      }

      setState({
        status: "success",
        message: payload.message ?? "Flash ERP removed that selling unit."
      });
      router.refresh();
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not remove that selling unit."
      });
    }
  }

  function toggleStore(storeCode: string) {
    setSelectedStoreCodes((current) =>
      current.includes(storeCode)
        ? current.filter((code) => code !== storeCode)
        : [...current, storeCode]
    );
  }

  return (
    <EnterpriseShell
      activeSection="inventory"
      description="Maintain shop-level sell prices that override the enterprise default price at online and desktop POS."
      eyebrow="Inventory"
      heading="Shop Prices"
    >
      <div
        aria-label="Shop price configuration"
        className="mb-4 inline-flex w-fit gap-1 rounded-lg border border-stone-200 bg-white p-1"
        role="tablist"
      >
        <button
          aria-selected={workspaceMode === "prices"}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ${
            workspaceMode === "prices"
              ? "bg-stone-900 text-white"
              : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
          }`}
          onClick={() => {
            setWorkspaceMode("prices");
            setState({ status: "idle", message: "" });
          }}
          role="tab"
          type="button"
        >
          <BadgeDollarSign className="h-4 w-4" />
          Price overrides
        </button>
        <button
          aria-selected={workspaceMode === "selling-units"}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ${
            workspaceMode === "selling-units"
              ? "bg-stone-900 text-white"
              : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
          }`}
          onClick={() => {
            setWorkspaceMode("selling-units");
            setState({ status: "idle", message: "" });
          }}
          role="tab"
          type="button"
        >
          <PackageOpen className="h-4 w-4" />
          Selling units
        </button>
      </div>

      {workspaceMode === "prices" ? (
      <section className="grid gap-4 xl:grid-cols-[minmax(24rem,0.8fr)_minmax(0,1.2fr)]">
        <form
          className="glass-panel h-fit rounded-[1.35rem] p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void savePrices();
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Price control
              </p>
              <h2 className="mt-2 text-xl font-semibold text-stone-950">Apply shop price</h2>
            </div>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <BadgeDollarSign className="h-5 w-5" />
            </span>
          </div>

          <div className="mt-5 grid gap-4">
            <div className="grid gap-2 text-sm font-semibold text-stone-700">
              <span>Product</span>
              <ProductTargetCombobox
                onChange={selectTarget}
                targets={workspace.targets}
                value={targetId}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-stone-700">
                Unit price
                <input
                  className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                  min="0.01"
                  onChange={(event) => setUnitPrice(event.target.value)}
                  step="0.01"
                  type="number"
                  value={unitPrice}
                />
              </label>
              <div className="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Base price
                </p>
                <p className="mt-1 text-sm font-semibold text-stone-950">
                  {selectedTarget
                    ? formatMoney(selectedTarget.baseUnitPrice, workspace.currencyCode)
                    : formatMoney(0, workspace.currencyCode)}
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-stone-700">Shops</p>
                <button
                  className="text-xs font-semibold text-[var(--brand)] transition hover:text-[var(--brand-deep)]"
                  onClick={() =>
                    setSelectedStoreCodes(
                      selectedStoreCodes.length === workspace.stores.length
                        ? []
                        : workspace.stores.map((store) => store.storeCode)
                    )
                  }
                  type="button"
                >
                  {selectedStoreCodes.length === workspace.stores.length ? "Clear" : "Select all"}
                </button>
              </div>
              <div className="grid max-h-72 gap-2 overflow-y-auto rounded-[1rem] border border-stone-200 bg-white p-2">
                {workspace.stores.map((store) => (
                  <label
                    className="flex items-center justify-between gap-3 rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-2 text-sm text-stone-700"
                    key={store.storeCode}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-stone-900">
                        {store.storeName}
                      </span>
                      <span className="block truncate text-xs text-stone-500">
                        {store.storeCode} / {store.storeMode}
                      </span>
                    </span>
                    <input
                      checked={selectedStoreCodes.includes(store.storeCode)}
                      className="h-4 w-4 shrink-0"
                      onChange={() => toggleStore(store.storeCode)}
                      type="checkbox"
                    />
                  </label>
                ))}
              </div>
            </div>

            {state.message ? (
              <div
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                  state.status === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {state.message}
              </div>
            ) : null}

            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                state.status === "submitting" ||
                !targetId ||
                selectedStoreCodes.length === 0 ||
                Number(unitPrice) <= 0
              }
              type="submit"
            >
              <Save className="h-4 w-4" />
              Save prices
            </button>
          </div>
        </form>

        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-3">
            {[
              ["Targets", numberFormatter.format(workspace.metrics.targets)],
              ["Shops", numberFormatter.format(workspace.metrics.stores)],
              ["Overrides", numberFormatter.format(workspace.metrics.activeOverrides)]
            ].map(([label, value]) => (
              <article className="glass-panel rounded-[1.1rem] p-4" key={label}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                    {label}
                  </p>
                  <Store className="h-4 w-4 text-stone-400" />
                </div>
                <p className="mt-3 text-2xl font-semibold text-stone-950">{value}</p>
              </article>
            ))}
          </section>

          <SharedDataGrid
            columns={priceColumns}
            data={workspace.priceRows}
            emptyLabel="No shop-specific prices are active."
            exportFileName="flash-erp-shop-prices"
            globalFilterFn={priceFilter}
            searchPlaceholder="Search shop prices"
          />
        </div>
      </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-[minmax(25rem,0.82fr)_minmax(0,1.18fr)]">
          <form
            className="glass-panel h-fit rounded-lg p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void saveSellingUnits();
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Store selling unit
                </p>
                <h2 className="mt-2 text-xl font-semibold text-stone-950">
                  Configure product UOM
                </h2>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <PackageOpen className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-2 text-sm font-semibold text-stone-700">
                <span>Product</span>
                <ProductTargetCombobox
                  onChange={selectTarget}
                  targets={workspace.targets}
                  value={targetId}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-stone-700">
                  Selling unit
                  <select
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--brand)]"
                    disabled={!selectedTarget?.sellingUnitOptions.length}
                    onChange={(event) => setSellingUnitCode(event.target.value)}
                    value={sellingUnitCode}
                  >
                    {selectedTarget?.sellingUnitOptions.map((unit) => (
                      <option key={unit.unitOfMeasureId} value={unit.unitOfMeasureCode}>
                        {unit.unitOfMeasureCode} / {unit.unitOfMeasureName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-stone-700">
                  Selling price
                  <input
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--brand)]"
                    min="0.01"
                    onChange={(event) => setSellingUnitPrice(event.target.value)}
                    step="0.01"
                    type="number"
                    value={sellingUnitPrice}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="grid gap-2 text-sm font-semibold text-stone-700">
                  Barcode (optional)
                  <input
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--brand)]"
                    maxLength={450}
                    onChange={(event) => setSellingUnitBarcode(event.target.value)}
                    placeholder="Scan or enter package barcode"
                    value={sellingUnitBarcode}
                  />
                </label>
                <label className="flex min-h-11 items-center gap-2 self-end rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700">
                  <input
                    checked={sellingUnitDefault}
                    className="h-4 w-4"
                    onChange={(event) => setSellingUnitDefault(event.target.checked)}
                    type="checkbox"
                  />
                  Default at POS
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase text-stone-500">Conversion</p>
                  <p className="mt-1 font-semibold text-stone-950">
                    1 {selectedSellingUnit?.unitOfMeasureCode ?? "-"} ={" "}
                    {selectedSellingUnit?.conversionFactor ?? 0}{" "}
                    {selectedTarget?.baseUnitOfMeasure ?? "base unit(s)"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-stone-500">Quantity</p>
                  <p className="mt-1 font-semibold text-stone-950">
                    {selectedSellingUnit?.allowFractionalSale
                      ? `Up to ${selectedSellingUnit.decimalPrecision} decimals`
                      : "Whole units"}
                  </p>
                </div>
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-stone-700">Shops</p>
                  <button
                    className="text-xs font-semibold text-[var(--brand)] transition hover:text-[var(--brand-deep)]"
                    onClick={() =>
                      setSelectedStoreCodes(
                        selectedStoreCodes.length === workspace.stores.length
                          ? []
                          : workspace.stores.map((store) => store.storeCode)
                      )
                    }
                    type="button"
                  >
                    {selectedStoreCodes.length === workspace.stores.length
                      ? "Clear"
                      : "Select all"}
                  </button>
                </div>
                <div className="grid max-h-64 gap-2 overflow-y-auto rounded-lg border border-stone-200 bg-white p-2">
                  {workspace.stores.map((store) => (
                    <label
                      className="flex items-center justify-between gap-3 rounded-md border border-stone-100 bg-stone-50 px-3 py-2 text-sm text-stone-700"
                      key={store.storeCode}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-stone-900">
                          {store.storeName}
                        </span>
                        <span className="block truncate text-xs text-stone-500">
                          {store.storeCode} / {store.storeMode}
                        </span>
                      </span>
                      <input
                        checked={selectedStoreCodes.includes(store.storeCode)}
                        className="h-4 w-4 shrink-0"
                        onChange={() => toggleStore(store.storeCode)}
                        type="checkbox"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {state.message ? (
                <div
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                    state.status === "error"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {state.message}
                </div>
              ) : null}

              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-[1.03] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  state.status === "submitting" ||
                  !targetId ||
                  !sellingUnitCode ||
                  selectedStoreCodes.length === 0 ||
                  Number(sellingUnitPrice) <= 0
                }
                type="submit"
              >
                <Save className="h-4 w-4" />
                Save selling unit
              </button>
            </div>
          </form>

          <div className="space-y-4">
            <section className="grid gap-3 sm:grid-cols-3">
              {[
                ["Products", numberFormatter.format(workspace.metrics.targets)],
                ["Shops", numberFormatter.format(workspace.metrics.stores)],
                ["Selling units", numberFormatter.format(workspace.metrics.activeSellingUnits)]
              ].map(([label, value]) => (
                <article className="glass-panel rounded-lg p-4" key={label}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase text-stone-500">{label}</p>
                    <PackageOpen className="h-4 w-4 text-stone-400" />
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-stone-950">{value}</p>
                </article>
              ))}
            </section>

            <SharedDataGrid
              columns={sellingUnitColumns}
              data={workspace.sellingUnitRows}
              emptyLabel="No shop selling units are configured. Base-unit sales remain active."
              exportFileName="flash-erp-shop-selling-units"
              globalFilterFn={sellingUnitFilter}
              searchPlaceholder="Search selling units"
            />
          </div>
        </section>
      )}
    </EnterpriseShell>
  );
}
