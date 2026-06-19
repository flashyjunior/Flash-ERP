"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import { Layers3, Plus, Ruler, Scale3D } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type { EnterpriseCatalogWorkspaceData } from "@/server/repositories/enterprise-catalog.repository";

type UnitRow = EnterpriseCatalogWorkspaceData["unitOfMeasureRows"][number];
type ScheduleRow = EnterpriseCatalogWorkspaceData["uomScheduleRows"][number];

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

type ScheduleLineDraft = {
  rowKey: string;
  uomCode: string;
  conversionFactor: string;
  allowSale: boolean;
  allowPurchase: boolean;
};

const numberFormatter = new Intl.NumberFormat("en-US");

const unitFilter: FilterFn<UnitRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return Object.values(row.original).join(" ").toLowerCase().includes(query);
};

const scheduleFilter: FilterFn<ScheduleRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.scheduleCode,
    row.original.name,
    row.original.baseUnitCode,
    row.original.status,
    row.original.lines.map((line) => line.uomCode).join(" ")
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

function MetricCard({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Ruler;
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

function buildScheduleLines(schedule?: ScheduleRow | null, defaultUnit = "EA"): ScheduleLineDraft[] {
  const lines =
    schedule?.lines.map((line, index) => ({
      rowKey: `${line.uomCode}-${index}`,
      uomCode: line.uomCode,
      conversionFactor: String(line.conversionFactor),
      allowSale: line.allowSale,
      allowPurchase: line.allowPurchase
    })) ?? [];

  return lines.length > 0
    ? lines
    : [
        {
          rowKey: `${defaultUnit}-base`,
          uomCode: defaultUnit,
          conversionFactor: "1",
          allowSale: true,
          allowPurchase: true
        }
      ];
}

export function EnterpriseUomWorkspace({
  workspace
}: {
  workspace: EnterpriseCatalogWorkspaceData;
}) {
  const router = useRouter();
  const [isUnitDialogOpen, setIsUnitDialogOpen] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [editingUnitCode, setEditingUnitCode] = useState<string | null>(null);
  const [editingScheduleCode, setEditingScheduleCode] = useState<string | null>(null);
  const [uomCode, setUomCode] = useState("");
  const [uomName, setUomName] = useState("");
  const [uomDescription, setUomDescription] = useState("");
  const [decimalPrecision, setDecimalPrecision] = useState("0");
  const [allowFractionalSale, setAllowFractionalSale] = useState(false);
  const [uomStatus, setUomStatus] = useState("ACTIVE");
  const [unitState, setUnitState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [scheduleCode, setScheduleCode] = useState("");
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleDescription, setScheduleDescription] = useState("");
  const [baseUomCode, setBaseUomCode] = useState(workspace.unitOfMeasureRows[0]?.uomCode ?? "EA");
  const [isDefaultForStock, setIsDefaultForStock] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState("ACTIVE");
  const [scheduleLines, setScheduleLines] = useState<ScheduleLineDraft[]>(() =>
    buildScheduleLines(null, workspace.unitOfMeasureRows[0]?.uomCode ?? "EA")
  );
  const [scheduleState, setScheduleState] = useState<MutationState>({
    status: "idle",
    message: ""
  });

  const unitColumns = useMemo<ColumnDef<UnitRow>[]>(
    () => [
      {
        accessorKey: "uomCode",
        header: "Base unit",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.uomCode}</p>
            <p className="truncate text-xs text-stone-500">{row.original.name}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "decimalPrecision",
        header: "Precision",
        cell: ({ row }) => row.original.decimalPrecision
      },
      {
        accessorKey: "allowFractionalSale",
        header: "Fractional sale",
        cell: ({ row }) => (row.original.allowFractionalSale ? "Allowed" : "Whole units")
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => row.original.status
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit unit",
                onSelect: () => openUnitDialog(row.original),
                tone: "primary"
              }
            ]}
          />
        )
      }
    ],
    []
  );
  const scheduleColumns = useMemo<ColumnDef<ScheduleRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Schedule",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.name}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.scheduleCode} • base {row.original.baseUnitCode}
            </p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "lineCount",
        header: "Lines",
        cell: ({ row }) => numberFormatter.format(row.original.lineCount)
      },
      {
        accessorKey: "productCount",
        header: "Products",
        cell: ({ row }) => numberFormatter.format(row.original.productCount)
      },
      {
        accessorKey: "isDefaultForStock",
        header: "Default",
        cell: ({ row }) => (row.original.isDefaultForStock ? "Stock default" : "Optional")
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => row.original.status
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit schedule",
                onSelect: () => openScheduleDialog(row.original),
                tone: "primary"
              }
            ]}
          />
        )
      }
    ],
    []
  );

  function openUnitDialog(unit?: UnitRow | null) {
    setEditingUnitCode(unit?.uomCode ?? null);
    setUomCode(unit?.uomCode ?? "");
    setUomName(unit?.name ?? "");
    setUomDescription(unit?.description ?? "");
    setDecimalPrecision(String(unit?.decimalPrecision ?? 0));
    setAllowFractionalSale(unit?.allowFractionalSale ?? false);
    setUomStatus(unit?.status ?? "ACTIVE");
    setUnitState({ status: "idle", message: "" });
    setIsUnitDialogOpen(true);
  }

  function openScheduleDialog(schedule?: ScheduleRow | null) {
    const defaultUnit = workspace.unitOfMeasureRows[0]?.uomCode ?? "EA";
    setEditingScheduleCode(schedule?.scheduleCode ?? null);
    setScheduleCode(schedule?.scheduleCode ?? `${defaultUnit}-STOCK`);
    setScheduleName(schedule?.name ?? `${defaultUnit} stock schedule`);
    setScheduleDescription(schedule?.description ?? "");
    setBaseUomCode(schedule?.baseUnitCode ?? defaultUnit);
    setIsDefaultForStock(schedule?.isDefaultForStock ?? workspace.uomScheduleRows.length === 0);
    setScheduleStatus(schedule?.status ?? "ACTIVE");
    setScheduleLines(buildScheduleLines(schedule, defaultUnit));
    setScheduleState({ status: "idle", message: "" });
    setIsScheduleDialogOpen(true);
  }

  async function handleSaveUnit() {
    setUnitState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/catalog/uom", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          uomCode,
          name: uomName,
          description: uomDescription.trim() ? uomDescription : null,
          decimalPrecision: Number(decimalPrecision),
          allowFractionalSale,
          status: uomStatus
        })
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save that unit of measure.");
      }

      setUnitState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the unit of measure."
      });
      startTransition(() => {
        window.setTimeout(() => {
          setIsUnitDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setUnitState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save that unit of measure."
      });
    }
  }

  async function handleSaveSchedule() {
    const lines = scheduleLines
      .filter((line) => line.uomCode.trim())
      .map((line) => ({
        uomCode: line.uomCode,
        conversionFactor: Number(line.conversionFactor || 1),
        isBaseUnit: line.uomCode === baseUomCode,
        allowSale: line.allowSale,
        allowPurchase: line.allowPurchase
      }));
    const duplicateUomCode = lines.find(
      (line, index) => lines.findIndex((candidate) => candidate.uomCode === line.uomCode) !== index
    )?.uomCode;

    if (duplicateUomCode) {
      setScheduleState({
        status: "error",
        message: `Remove the duplicate ${duplicateUomCode} conversion line before saving this UOM schedule.`
      });
      return;
    }

    setScheduleState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/catalog/uom-schedules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          scheduleCode,
          name: scheduleName,
          description: scheduleDescription.trim() ? scheduleDescription : null,
          baseUomCode,
          isDefaultForStock,
          status: scheduleStatus,
          lines
        })
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save that UOM schedule.");
      }

      setScheduleState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the UOM schedule."
      });
      startTransition(() => {
        window.setTimeout(() => {
          setIsScheduleDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setScheduleState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save that UOM schedule."
      });
    }
  }

  return (
    <EnterpriseShell
      activeSection="master"
      eyebrow="Flash ERP enterprise"
      heading="Unit"
    >
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[color:var(--brand)]"
            onClick={() => openUnitDialog()}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Create base unit
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 transition hover:border-amber-300"
            onClick={() => openScheduleDialog()}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Create schedule
          </button>
        </div>
        <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-700">
          Last refresh {new Date(workspace.refreshedAt).toLocaleString()}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          hint="Base units available for product, pack, purchase, and sale conversions."
          icon={Ruler}
          label="Base units"
          value={numberFormatter.format(workspace.unitOfMeasureRows.length)}
        />
        <MetricCard
          hint="Unit schedules that can be linked to stock products."
          icon={Layers3}
          label="Schedules"
          value={numberFormatter.format(workspace.uomScheduleRows.length)}
        />
        <MetricCard
          hint="Schedules currently marked as the default for stock items."
          icon={Scale3D}
          label="Stock default"
          value={numberFormatter.format(
            workspace.uomScheduleRows.filter((schedule) => schedule.isDefaultForStock).length
          )}
        />
        <MetricCard
          hint="Products currently linked to a UOM schedule."
          icon={Layers3}
          label="Linked products"
          value={numberFormatter.format(
            workspace.productRows.filter((product) => product.uomScheduleCode).length
          )}
        />
      </section>

      <WorkspaceTabs
        ariaLabel="Unit of measure workspace views"
        defaultValue="units"
        tabs={[
          { value: "units", label: "Base units" },
          { value: "schedules", label: "UOM schedules" }
        ]}
      >
        <WorkspaceTabsContent value="units">
          <SharedDataGrid
            columns={unitColumns}
            data={workspace.unitOfMeasureRows}
            emptyLabel="No units of measure are registered yet."
            exportFileName="flash-erp-units-of-measure"
            globalFilterFn={unitFilter}
            searchPlaceholder="Search base units"
            toolbarActions={
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[color:var(--brand)]"
                onClick={() => openUnitDialog()}
                type="button"
              >
                <Plus className="h-4 w-4" />
                New unit
              </button>
            }
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="schedules">
          <SharedDataGrid
            columns={scheduleColumns}
            data={workspace.uomScheduleRows}
            emptyLabel="No UOM schedules are registered yet."
            exportFileName="flash-erp-uom-schedules"
            globalFilterFn={scheduleFilter}
            searchPlaceholder="Search schedules"
            toolbarActions={
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 transition hover:border-amber-300"
                onClick={() => openScheduleDialog()}
                type="button"
              >
                <Plus className="h-4 w-4" />
                New schedule
              </button>
            }
          />
        </WorkspaceTabsContent>
      </WorkspaceTabs>

      <ActionDialog
        description="Create or update a base unit such as EA, KG, litre, pack, or carton."
        hideTrigger
        onOpenChange={setIsUnitDialogOpen}
        open={isUnitDialogOpen}
        title={editingUnitCode ? `Edit ${editingUnitCode}` : "Create base unit"}
        triggerLabel="Create unit"
        widthClassName="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-[13px] text-stone-700">
              <span className="font-semibold text-stone-900">Unit code</span>
              <input
                className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                disabled={Boolean(editingUnitCode)}
                onChange={(event) => setUomCode(event.target.value)}
                value={uomCode}
              />
            </label>
            <label className="grid gap-1 text-[13px] text-stone-700">
              <span className="font-semibold text-stone-900">Name</span>
              <input
                className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                onChange={(event) => setUomName(event.target.value)}
                value={uomName}
              />
            </label>
            <label className="grid gap-1 text-[13px] text-stone-700">
              <span className="font-semibold text-stone-900">Decimal precision</span>
              <input
                className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                min="0"
                onChange={(event) => setDecimalPrecision(event.target.value)}
                type="number"
                value={decimalPrecision}
              />
            </label>
            <label className="grid gap-1 text-[13px] text-stone-700">
              <span className="font-semibold text-stone-900">Status</span>
              <select
                className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                onChange={(event) => setUomStatus(event.target.value)}
                value={uomStatus}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <label className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700">
              <input
                checked={allowFractionalSale}
                onChange={(event) => setAllowFractionalSale(event.target.checked)}
                type="checkbox"
              />
              Allow fractional sale
            </label>
            <label className="grid gap-1 text-[13px] text-stone-700 md:col-span-2">
              <span className="font-semibold text-stone-900">Description</span>
              <input
                className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                onChange={(event) => setUomDescription(event.target.value)}
                value={uomDescription}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="inline-flex h-9 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700"
              disabled={unitState.status === "submitting"}
              onClick={() => setIsUnitDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex h-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-4 text-sm font-semibold text-white disabled:opacity-60"
              disabled={unitState.status === "submitting" || !uomCode.trim() || !uomName.trim()}
              onClick={() => void handleSaveUnit()}
              type="button"
            >
              {unitState.status === "submitting" ? "Saving..." : "Save unit"}
            </button>
          </div>
          <Feedback state={unitState} />
        </div>
      </ActionDialog>

      <ActionDialog
        description="Create or update a unit schedule that defines the base unit plus pack, carton, sale, and purchase conversions."
        hideTrigger
        onOpenChange={setIsScheduleDialogOpen}
        open={isScheduleDialogOpen}
        title={editingScheduleCode ? `Edit ${editingScheduleCode}` : "Create UOM schedule"}
        triggerLabel="Create schedule"
        widthClassName="max-w-5xl"
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-[13px] text-stone-700">
              <span className="font-semibold text-stone-900">Schedule code</span>
              <input
                className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                disabled={Boolean(editingScheduleCode)}
                onChange={(event) => setScheduleCode(event.target.value)}
                value={scheduleCode}
              />
            </label>
            <label className="grid gap-1 text-[13px] text-stone-700">
              <span className="font-semibold text-stone-900">Schedule name</span>
              <input
                className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                onChange={(event) => setScheduleName(event.target.value)}
                value={scheduleName}
              />
            </label>
            <label className="grid gap-1 text-[13px] text-stone-700">
              <span className="font-semibold text-stone-900">Base unit</span>
              <select
                className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                onChange={(event) => setBaseUomCode(event.target.value)}
                value={baseUomCode}
              >
                {workspace.unitOfMeasureRows.length === 0 ? <option value="EA">EA</option> : null}
                {workspace.unitOfMeasureRows.map((unit) => (
                  <option key={unit.uomCode} value={unit.uomCode}>
                    {unit.name} ({unit.uomCode})
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[13px] text-stone-700">
              <span className="font-semibold text-stone-900">Status</span>
              <select
                className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                onChange={(event) => setScheduleStatus(event.target.value)}
                value={scheduleStatus}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <label className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700">
              <input
                checked={isDefaultForStock}
                onChange={(event) => setIsDefaultForStock(event.target.checked)}
                type="checkbox"
              />
              Default for all stock items
            </label>
            <label className="grid gap-1 text-[13px] text-stone-700 md:col-span-2 xl:col-span-3">
              <span className="font-semibold text-stone-900">Description</span>
              <input
                className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                onChange={(event) => setScheduleDescription(event.target.value)}
                value={scheduleDescription}
              />
            </label>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white/90 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-stone-950">Conversion lines</p>
                <p className="text-xs text-stone-500">The base unit is forced to conversion 1.</p>
              </div>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700"
                onClick={() =>
                  setScheduleLines((current) => [
                    ...current,
                    {
                      rowKey: `line-${Date.now()}`,
                      uomCode: workspace.unitOfMeasureRows[0]?.uomCode ?? baseUomCode,
                      conversionFactor: "1",
                      allowSale: true,
                      allowPurchase: true
                    }
                  ])
                }
                type="button"
              >
                <Plus className="h-4 w-4" />
                Add line
              </button>
            </div>
            <div className="mt-3 overflow-auto rounded-lg border border-stone-200">
              <table className="min-w-full divide-y divide-stone-200 text-sm">
                <thead className="bg-stone-50 text-left text-[11px] uppercase tracking-[0.16em] text-stone-500">
                  <tr>
                    <th className="px-3 py-2">Unit</th>
                    <th className="w-40 px-3 py-2">Factor</th>
                    <th className="w-28 px-3 py-2">Sale</th>
                    <th className="w-32 px-3 py-2">Purchase</th>
                    <th className="w-20 px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 bg-white">
                  {scheduleLines.map((line, index) => {
                    const isBase = line.uomCode === baseUomCode;

                    return (
                      <tr key={line.rowKey}>
                        <td className="px-3 py-2">
                          <select
                            className="h-8 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm outline-none focus:border-[var(--brand)]"
                            onChange={(event) =>
                              setScheduleLines((current) =>
                                current.map((entry) =>
                                  entry.rowKey === line.rowKey
                                    ? { ...entry, uomCode: event.target.value }
                                    : entry
                                )
                              )
                            }
                            value={line.uomCode}
                          >
                            {workspace.unitOfMeasureRows.length === 0 ? (
                              <option value="EA">EA</option>
                            ) : null}
                            {workspace.unitOfMeasureRows.map((unit) => (
                              <option key={unit.uomCode} value={unit.uomCode}>
                                {unit.name} ({unit.uomCode})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="h-8 w-28 rounded-lg border border-stone-200 px-2 text-sm outline-none focus:border-[var(--brand)]"
                            disabled={isBase}
                            min="0.000001"
                            onChange={(event) =>
                              setScheduleLines((current) =>
                                current.map((entry) =>
                                  entry.rowKey === line.rowKey
                                    ? { ...entry, conversionFactor: event.target.value }
                                    : entry
                                )
                              )
                            }
                            step="0.000001"
                            type="number"
                            value={isBase ? "1" : line.conversionFactor}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            checked={line.allowSale}
                            onChange={(event) =>
                              setScheduleLines((current) =>
                                current.map((entry) =>
                                  entry.rowKey === line.rowKey
                                    ? { ...entry, allowSale: event.target.checked }
                                    : entry
                                )
                              )
                            }
                            type="checkbox"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            checked={line.allowPurchase}
                            onChange={(event) =>
                              setScheduleLines((current) =>
                                current.map((entry) =>
                                  entry.rowKey === line.rowKey
                                    ? { ...entry, allowPurchase: event.target.checked }
                                    : entry
                                )
                              )
                            }
                            type="checkbox"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            className="rounded-lg border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-600 disabled:opacity-40"
                            disabled={scheduleLines.length === 1 || isBase || index === 0}
                            onClick={() =>
                              setScheduleLines((current) =>
                                current.filter((entry) => entry.rowKey !== line.rowKey)
                              )
                            }
                            type="button"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              className="inline-flex h-9 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700"
              disabled={scheduleState.status === "submitting"}
              onClick={() => setIsScheduleDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex h-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-4 text-sm font-semibold text-white disabled:opacity-60"
              disabled={
                scheduleState.status === "submitting" ||
                !scheduleCode.trim() ||
                !scheduleName.trim() ||
                !baseUomCode.trim()
              }
              onClick={() => void handleSaveSchedule()}
              type="button"
            >
              {scheduleState.status === "submitting" ? "Saving..." : "Save schedule"}
            </button>
          </div>
          <Feedback state={scheduleState} />
        </div>
      </ActionDialog>
    </EnterpriseShell>
  );
}
