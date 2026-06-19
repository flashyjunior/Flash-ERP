"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { BadgePercent, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";

import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import type {
  CreateEnterprisePromotionRequest,
  EnterprisePromotionMutationResponse,
  EnterprisePromotionWorkspaceData
} from "@/server/repositories/enterprise-promotions.repository";

type PromotionRow = EnterprisePromotionWorkspaceData["promotionRows"][number];
type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

const statusOptions = [
  { value: "ACTIVE", label: "ACTIVE" },
  { value: "INACTIVE", label: "INACTIVE" },
  { value: "ARCHIVED", label: "ARCHIVED" }
];

const discountTypeOptions = [
  { value: "PERCENT", label: "PERCENT" },
  { value: "AMOUNT", label: "AMOUNT" },
  { value: "FIXED_PRICE", label: "FIXED_PRICE" }
];

const scopeOptions = [
  { value: "ALL_ITEMS", label: "ALL_ITEMS" },
  { value: "DEPARTMENT", label: "DEPARTMENT" },
  { value: "CATEGORY", label: "CATEGORY" },
  { value: "PRODUCT", label: "PRODUCT" }
];

const emptyPromotion = (): CreateEnterprisePromotionRequest => ({
  promotionCode: "",
  name: "",
  description: "",
  discountType: "PERCENT",
  targetScope: "ALL_ITEMS",
  discountValue: 0,
  minimumBasketAmount: null,
  minimumLineQuantity: null,
  buyQuantity: null,
  rewardQuantity: null,
  targetDepartmentCode: "",
  targetCategoryCode: "",
  targetProductCode: "",
  eligibleStoreCodes: [],
  eligibleCustomerTypes: [],
  eligibleLoyaltyTiers: [],
  activeDaysOfWeek: [],
  activeFromMinutes: null,
  activeToMinutes: null,
  couponRequired: false,
  couponCode: "",
  allowWithLoyalty: true,
  applyOncePerBasket: false,
  priority: 0,
  startAt: null,
  endAt: null,
  status: "ACTIVE"
});

function MetricCard({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-[1.15rem] border border-stone-200 bg-white/90 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-stone-950">{value}</p>
    </article>
  );
}

function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "ACTIVE"
      ? "bg-emerald-100 text-emerald-700"
      : value === "INACTIVE"
        ? "bg-amber-100 text-amber-700"
        : "bg-stone-200 text-stone-700";

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{value}</span>;
}

function shouldShowWorkspaceNotice(statusMessage: string) {
  return /^Unable\b|^No primary\b/i.test(statusMessage);
}

function DialogTextInput({
  label,
  value,
  onChange,
  type = "text",
  disabled = false
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: "text" | "number" | "datetime-local";
  disabled?: boolean;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <input
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)] disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function DialogTextArea({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <textarea
        className="min-h-24 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function DialogSelect({
  label,
  value,
  onChange,
  options,
  disabled = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <select
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)] disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DialogCheckbox({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (nextValue: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      {label}
    </label>
  );
}

function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.slice(0, 16);
}

function splitListValue(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function joinListValue(value: string[] | string | null | undefined) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return value ?? "";
}

export function EnterprisePromotionPanel({
  workspace
}: {
  workspace: EnterprisePromotionWorkspaceData;
}) {
  const router = useRouter();
  const [promotionDraft, setPromotionDraft] = useState<CreateEnterprisePromotionRequest>(emptyPromotion());
  const [editingPromotionCode, setEditingPromotionCode] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [mutationState, setMutationState] = useState<MutationState>({ status: "idle", message: "" });

  const departmentOptions = useMemo(
    () => [
      { value: "", label: "Select department" },
      ...workspace.availableDepartments.map((department) => ({
        value: department.departmentCode,
        label: `${department.name} (${department.departmentCode})`
      }))
    ],
    [workspace.availableDepartments]
  );

  const categoryOptions = useMemo(
    () => [
      { value: "", label: "Select category" },
      ...workspace.availableCategories.map((category) => ({
        value: category.categoryCode,
        label: `${category.name} (${category.categoryCode})`
      }))
    ],
    [workspace.availableCategories]
  );

  const productOptions = useMemo(
    () => [
      { value: "", label: "Select product" },
      ...workspace.availableProducts.map((product) => ({
        value: product.productCode,
        label: `${product.name} (${product.productCode})`
      }))
    ],
    [workspace.availableProducts]
  );

  const promotionColumns = useMemo<ColumnDef<PromotionRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Promotion",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.name}</p>
            <p className="truncate text-xs text-stone-500">{row.original.promotionCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "discountType",
        header: "Rule",
        cell: ({ row }) => `${row.original.discountType} • ${row.original.discountValue.toFixed(2)}`
      },
      {
        accessorKey: "targetScope",
        header: "Target",
        cell: ({ row }) =>
          row.original.targetScope === "DEPARTMENT"
            ? `${row.original.targetScope} • ${row.original.targetDepartmentCode ?? "N/A"}`
            : row.original.targetScope === "CATEGORY"
              ? `${row.original.targetScope} • ${row.original.targetCategoryCode ?? "N/A"}`
              : row.original.targetScope === "PRODUCT"
                ? `${row.original.targetScope} • ${row.original.targetProductCode ?? "N/A"}`
                : row.original.targetScope
      },
      {
        id: "eligibility",
        header: "Eligibility",
        cell: ({ row }) => {
          const labels = [
            row.original.eligibleStoreCodes?.length
              ? `${row.original.eligibleStoreCodes.length} shop(s)`
              : null,
            row.original.eligibleCustomerTypes?.length
              ? row.original.eligibleCustomerTypes.join(", ")
              : null,
            row.original.eligibleLoyaltyTiers?.length
              ? row.original.eligibleLoyaltyTiers.join(", ")
              : null,
            row.original.couponRequired ? "Coupon" : null
          ].filter(Boolean);

          return labels.length > 0 ? labels.join(" • ") : "All eligible";
        }
      },
      {
        accessorKey: "priority",
        header: "Priority"
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "updatedAtLabel",
        header: "Updated",
        cell: ({ row }) => row.original.updatedAtLabel
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit promotion",
                onSelect: () => {
                  setEditingPromotionCode(row.original.promotionCode);
                  setPromotionDraft({
                    promotionCode: row.original.promotionCode,
                    name: row.original.name,
                    description: row.original.description ?? "",
                    discountType: row.original.discountType,
                    targetScope: row.original.targetScope,
                    discountValue: row.original.discountValue,
                    minimumBasketAmount: row.original.minimumBasketAmount,
                    minimumLineQuantity: row.original.minimumLineQuantity,
                    buyQuantity: row.original.buyQuantity,
                    rewardQuantity: row.original.rewardQuantity,
                    targetDepartmentCode: row.original.targetDepartmentCode ?? "",
                    targetCategoryCode: row.original.targetCategoryCode ?? "",
                    targetProductCode: row.original.targetProductCode ?? "",
                    eligibleStoreCodes: row.original.eligibleStoreCodes ?? [],
                    eligibleCustomerTypes: row.original.eligibleCustomerTypes ?? [],
                    eligibleLoyaltyTiers: row.original.eligibleLoyaltyTiers ?? [],
                    activeDaysOfWeek: row.original.activeDaysOfWeek ?? [],
                    activeFromMinutes: row.original.activeFromMinutes,
                    activeToMinutes: row.original.activeToMinutes,
                    couponRequired: row.original.couponRequired,
                    couponCode: row.original.couponCode ?? "",
                    allowWithLoyalty: row.original.allowWithLoyalty,
                    applyOncePerBasket: row.original.applyOncePerBasket,
                    priority: row.original.priority,
                    startAt: toDateTimeLocalValue(row.original.startAt),
                    endAt: toDateTimeLocalValue(row.original.endAt),
                    status: row.original.status
                  });
                  setMutationState({ status: "idle", message: "" });
                  setIsDialogOpen(true);
                }
              }
            ]}
            label={`Actions for ${row.original.promotionCode}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  async function savePromotion() {
    setMutationState({ status: "submitting", message: "" });

    try {
      const response = await fetch(
        editingPromotionCode
          ? `/api/setup/promotions/${encodeURIComponent(editingPromotionCode)}`
          : "/api/setup/promotions",
        {
          method: editingPromotionCode ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(promotionDraft)
        }
      );
      const payload = (await response.json()) as Partial<EnterprisePromotionMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save that promotion right now.");
      }

      setMutationState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the promotion."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setMutationState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save that promotion."
      });
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Active promotions"
          value={String(workspace.metrics.activePromotions)}
        />
        <MetricCard
          label="Scheduled"
          value={String(workspace.metrics.scheduledPromotions)}
        />
        <MetricCard
          label="Scoped"
          value={String(workspace.metrics.scopedPromotions)}
        />
      </section>

      <SharedDataGrid
        columns={promotionColumns}
        data={workspace.promotionRows}
        emptyLabel="No promotions yet."
        exportFileName="flash-erp-promotions"
        searchPlaceholder="Search promotions"
        toolbarActions={
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[var(--brand)]"
            onClick={() => {
              setEditingPromotionCode(null);
              setPromotionDraft(emptyPromotion());
              setMutationState({ status: "idle", message: "" });
              setIsDialogOpen(true);
            }}
            type="button"
          >
            <Sparkles className="h-4 w-4" />
            Create promotion
          </button>
        }
      />

      {shouldShowWorkspaceNotice(workspace.statusMessage) ? (
        <section className="glass-panel rounded-[1.35rem] border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm leading-6 text-amber-900">{workspace.statusMessage}</p>
        </section>
      ) : null}

      <ActionDialog
        description="Create or update promotion rules."
        onOpenChange={setIsDialogOpen}
        open={isDialogOpen}
        title={editingPromotionCode ? "Edit promotion" : "Create promotion"}
        hideTrigger
        triggerLabel=""
        widthClassName="max-w-6xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <DialogTextInput
              disabled={Boolean(editingPromotionCode)}
              label="Promotion code"
              onChange={(value) =>
                setPromotionDraft((current) => ({ ...current, promotionCode: value }))
              }
              value={promotionDraft.promotionCode}
            />
            <DialogTextInput
              label="Promotion name"
              onChange={(value) => setPromotionDraft((current) => ({ ...current, name: value }))}
              value={promotionDraft.name}
            />
            <DialogSelect
              label="Status"
              onChange={(value) => setPromotionDraft((current) => ({ ...current, status: value }))}
              options={statusOptions}
              value={promotionDraft.status ?? "ACTIVE"}
            />
            <DialogSelect
              label="Discount type"
              onChange={(value) =>
                setPromotionDraft((current) => ({ ...current, discountType: value }))
              }
              options={discountTypeOptions}
              value={promotionDraft.discountType}
            />
            <DialogSelect
              label="Target scope"
              onChange={(value) =>
                setPromotionDraft((current) => ({
                  ...current,
                  targetScope: value,
                  targetDepartmentCode: value === "DEPARTMENT" ? current.targetDepartmentCode : "",
                  targetCategoryCode: value === "CATEGORY" ? current.targetCategoryCode : "",
                  targetProductCode: value === "PRODUCT" ? current.targetProductCode : ""
                }))
              }
              options={scopeOptions}
              value={promotionDraft.targetScope}
            />
            <DialogTextInput
              label="Discount value"
              onChange={(value) =>
                setPromotionDraft((current) => ({
                  ...current,
                  discountValue: Number(value) || 0
                }))
              }
              type="number"
              value={promotionDraft.discountValue}
            />
            <DialogTextInput
              label="Minimum basket amount"
              onChange={(value) =>
                setPromotionDraft((current) => ({
                  ...current,
                  minimumBasketAmount: value.trim() ? Number(value) : null
                }))
              }
              type="number"
              value={promotionDraft.minimumBasketAmount ?? ""}
            />
            <DialogTextInput
              label="Minimum line quantity"
              onChange={(value) =>
                setPromotionDraft((current) => ({
                  ...current,
                  minimumLineQuantity: value.trim() ? Number(value) : null
                }))
              }
              type="number"
              value={promotionDraft.minimumLineQuantity ?? ""}
            />
            <DialogTextInput
              label="Buy quantity"
              onChange={(value) =>
                setPromotionDraft((current) => ({
                  ...current,
                  buyQuantity: value.trim() ? Number(value) : null
                }))
              }
              type="number"
              value={promotionDraft.buyQuantity ?? ""}
            />
            <DialogTextInput
              label="Reward quantity"
              onChange={(value) =>
                setPromotionDraft((current) => ({
                  ...current,
                  rewardQuantity: value.trim() ? Number(value) : null
                }))
              }
              type="number"
              value={promotionDraft.rewardQuantity ?? ""}
            />
            <DialogTextInput
              label="Priority"
              onChange={(value) =>
                setPromotionDraft((current) => ({
                  ...current,
                  priority: Number(value) || 0
                }))
              }
              type="number"
              value={promotionDraft.priority ?? 0}
            />
            <DialogTextInput
              label="Start at"
              onChange={(value) => setPromotionDraft((current) => ({ ...current, startAt: value }))}
              type="datetime-local"
              value={promotionDraft.startAt ?? ""}
            />
            <DialogTextInput
              label="End at"
              onChange={(value) => setPromotionDraft((current) => ({ ...current, endAt: value }))}
              type="datetime-local"
              value={promotionDraft.endAt ?? ""}
            />
            <DialogTextInput
              label="Eligible shop codes"
              onChange={(value) =>
                setPromotionDraft((current) => ({
                  ...current,
                  eligibleStoreCodes: splitListValue(value)
                }))
              }
              value={joinListValue(promotionDraft.eligibleStoreCodes)}
            />
            <DialogTextInput
              label="Customer types"
              onChange={(value) =>
                setPromotionDraft((current) => ({
                  ...current,
                  eligibleCustomerTypes: splitListValue(value)
                }))
              }
              value={joinListValue(promotionDraft.eligibleCustomerTypes)}
            />
            <DialogTextInput
              label="Loyalty tiers"
              onChange={(value) =>
                setPromotionDraft((current) => ({
                  ...current,
                  eligibleLoyaltyTiers: splitListValue(value)
                }))
              }
              value={joinListValue(promotionDraft.eligibleLoyaltyTiers)}
            />
            <DialogTextInput
              label="Active weekdays"
              onChange={(value) =>
                setPromotionDraft((current) => ({
                  ...current,
                  activeDaysOfWeek: splitListValue(value)
                }))
              }
              value={joinListValue(promotionDraft.activeDaysOfWeek)}
            />
            <DialogTextInput
              label="Active from minute"
              onChange={(value) =>
                setPromotionDraft((current) => ({
                  ...current,
                  activeFromMinutes: value.trim() ? Number(value) : null
                }))
              }
              type="number"
              value={promotionDraft.activeFromMinutes ?? ""}
            />
            <DialogTextInput
              label="Active to minute"
              onChange={(value) =>
                setPromotionDraft((current) => ({
                  ...current,
                  activeToMinutes: value.trim() ? Number(value) : null
                }))
              }
              type="number"
              value={promotionDraft.activeToMinutes ?? ""}
            />
            <DialogTextInput
              label="Coupon code"
              onChange={(value) =>
                setPromotionDraft((current) => ({ ...current, couponCode: value }))
              }
              value={promotionDraft.couponCode ?? ""}
            />
            <div className="md:col-span-2 xl:col-span-3">
              <DialogTextArea
                label="Description"
                onChange={(value) =>
                  setPromotionDraft((current) => ({ ...current, description: value }))
                }
                value={promotionDraft.description ?? ""}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <DialogSelect
              disabled={promotionDraft.targetScope !== "DEPARTMENT"}
              label="Target department"
              onChange={(value) =>
                setPromotionDraft((current) => ({ ...current, targetDepartmentCode: value }))
              }
              options={departmentOptions}
              value={promotionDraft.targetDepartmentCode ?? ""}
            />
            <DialogSelect
              disabled={promotionDraft.targetScope !== "CATEGORY"}
              label="Target category"
              onChange={(value) =>
                setPromotionDraft((current) => ({ ...current, targetCategoryCode: value }))
              }
              options={categoryOptions}
              value={promotionDraft.targetCategoryCode ?? ""}
            />
            <DialogSelect
              disabled={promotionDraft.targetScope !== "PRODUCT"}
              label="Target product"
              onChange={(value) =>
                setPromotionDraft((current) => ({ ...current, targetProductCode: value }))
              }
              options={productOptions}
              value={promotionDraft.targetProductCode ?? ""}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <DialogCheckbox
              checked={promotionDraft.allowWithLoyalty ?? true}
              label="Allow with loyalty redemption"
              onChange={(nextValue) =>
                setPromotionDraft((current) => ({ ...current, allowWithLoyalty: nextValue }))
              }
            />
            <DialogCheckbox
              checked={promotionDraft.applyOncePerBasket ?? false}
              label="Apply once per basket"
              onChange={(nextValue) =>
                setPromotionDraft((current) => ({ ...current, applyOncePerBasket: nextValue }))
              }
            />
            <DialogCheckbox
              checked={promotionDraft.couponRequired ?? false}
              label="Require coupon code"
              onChange={(nextValue) =>
                setPromotionDraft((current) => ({ ...current, couponRequired: nextValue }))
              }
            />
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              disabled={mutationState.status === "submitting"}
              onClick={() => setIsDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
              disabled={
                mutationState.status === "submitting" ||
                !promotionDraft.promotionCode.trim() ||
                !promotionDraft.name.trim()
              }
              onClick={() => void savePromotion()}
              type="button"
            >
              {mutationState.status === "submitting" ? "Saving..." : "Save promotion"}
            </button>
          </div>

          {mutationState.message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                mutationState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {mutationState.message}
            </div>
          ) : null}
        </div>
      </ActionDialog>
    </div>
  );
}
