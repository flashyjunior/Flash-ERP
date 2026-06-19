"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import { BadgeDollarSign, Save, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import type { EnterpriseStorePricingWorkspaceData } from "@/server/repositories/enterprise-store-pricing.repository";

type PriceRow = EnterpriseStorePricingWorkspaceData["priceRows"][number];
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

export function EnterpriseStorePricingWorkspace({
  workspace
}: {
  workspace: EnterpriseStorePricingWorkspaceData;
}) {
  const router = useRouter();
  const firstTarget = workspace.targets[0] ?? null;
  const [targetId, setTargetId] = useState(firstTarget?.targetId ?? "");
  const [unitPrice, setUnitPrice] = useState(
    firstTarget ? firstTarget.baseUnitPrice.toFixed(2) : ""
  );
  const [selectedStoreCodes, setSelectedStoreCodes] = useState<string[]>(
    workspace.stores.map((store) => store.storeCode)
  );
  const [state, setState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({ status: "idle", message: "" });
  const selectedTarget =
    workspace.targets.find((target) => target.targetId === targetId) ?? firstTarget;

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
            <label className="grid gap-2 text-sm font-semibold text-stone-700">
              Product
              <select
                className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                onChange={(event) => {
                  const nextTargetId = event.target.value;
                  const nextTarget = workspace.targets.find(
                    (target) => target.targetId === nextTargetId
                  );

                  setTargetId(nextTargetId);
                  setUnitPrice(nextTarget ? nextTarget.baseUnitPrice.toFixed(2) : "");
                }}
                value={targetId}
              >
                {workspace.targets.map((target) => (
                  <option key={target.targetId} value={target.targetId}>
                    {targetLabel(target)}
                  </option>
                ))}
              </select>
            </label>

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
    </EnterpriseShell>
  );
}
