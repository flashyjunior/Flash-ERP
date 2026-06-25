"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  Award,
  Boxes,
  HandCoins,
  Landmark,
  Percent,
  ShieldCheck,
  SlidersHorizontal,
  Store
} from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useState, type ReactNode } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import {
  enterpriseMasterPageMeta,
  type EnterpriseMasterView
} from "@/lib/navigation/enterprise-navigation";
import type {
  BankBranchMutationResponse,
  CreateProductCategoryRequest,
  CreateProductDepartmentRequest,
  CreateBankBranchRequest,
  CreateBankRequest,
  CreateBankAccountRequest,
  CreateTenderMethodRequest,
  CreateTaxProfileRequest,
  EnterpriseSetupWorkspaceData,
  BankMutationResponse,
  BankAccountMutationResponse,
  LoyaltyPolicyMutationResponse,
  ProductCategoryMutationResponse,
  ProductDepartmentMutationResponse,
  TenderMethodMutationResponse,
  TaxProfileMutationResponse,
  UpdateEnterpriseLoyaltyPolicyRequest
} from "@/server/repositories/enterprise-setup.repository";

type DepartmentRow = EnterpriseSetupWorkspaceData["departmentRows"][number];
type CategoryRow = EnterpriseSetupWorkspaceData["categoryRows"][number];
type TaxRow = EnterpriseSetupWorkspaceData["taxRows"][number];
type TenderRow = EnterpriseSetupWorkspaceData["tenderRows"][number];
type BankRow = EnterpriseSetupWorkspaceData["bankRows"][number];
type BankBranchRow = EnterpriseSetupWorkspaceData["bankBranchRows"][number];
type BankAccountRow = EnterpriseSetupWorkspaceData["bankAccountRows"][number];
type SetupMasterView = Extract<
  EnterpriseMasterView,
  "departments" | "categories" | "tax" | "tenders" | "banks" | "loyalty"
>;
type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

function MetricCard({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Store;
  label: string;
  value: string;
}) {
  return (
    <article className="glass-panel rounded-[1.3rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            {label}
          </p>
          <p className="mt-2 text-[1.45rem] font-semibold text-stone-950">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] text-white shadow-[0_14px_30px_rgba(29,78,216,0.28)]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
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

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {value}
    </span>
  );
}

function shouldShowWorkspaceNotice(statusMessage: string) {
  return /^Unable\b|^No primary\b/i.test(statusMessage);
}

function renderTimestamp(value: string, label: string) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-stone-800">{label}</p>
      <p className="mt-0.5 truncate text-xs text-stone-500">{new Date(value).toLocaleString()}</p>
    </div>
  );
}

function DialogTextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  step,
  disabled = false
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number";
  min?: string;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <input
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)] disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
        disabled={disabled}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        step={step}
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
        className="min-h-28 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
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
  options: Array<{
    label: string;
    value: string;
  }>;
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

const recordStatusOptions = [
  { value: "ACTIVE", label: "ACTIVE" },
  { value: "INACTIVE", label: "INACTIVE" },
  { value: "ARCHIVED", label: "ARCHIVED" }
];

const paymentMethodOptions = [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "MOBILE_MONEY",
  "STORE_CREDIT",
  "GIFT_CARD",
  "OTHER"
].map((value) => ({
  value,
  label: value
}));

const gatewayProviderOptions = [
  { value: "", label: "No gateway" },
  { value: "PAYSTACK", label: "Paystack" },
  { value: "FLUTTERWAVE", label: "Flutterwave" },
  { value: "OTHER", label: "Other" }
];

const gatewayModeOptions = [
  { value: "", label: "Not set" },
  { value: "TEST", label: "Test" },
  { value: "LIVE", label: "Live" }
];

const emptyDepartment = (): CreateProductDepartmentRequest => ({
  departmentCode: "",
  name: "",
  description: "",
  sortOrder: 0,
  status: "ACTIVE"
});

const emptyCategory = (): CreateProductCategoryRequest => ({
  categoryCode: "",
  departmentCode: "",
  name: "",
  description: "",
  sortOrder: 0,
  status: "ACTIVE"
});

const emptyTax = (): CreateTaxProfileRequest => ({
  taxProfileCode: "",
  name: "",
  description: "",
  ratePercent: 0,
  isDefault: false,
  isTaxInclusive: false,
  status: "ACTIVE"
});

const emptyTender = (): CreateTenderMethodRequest => ({
  tenderMethodCode: "",
  name: "",
  paymentMethod: "CASH",
  cashbookAccountId: "",
  gatewayProvider: null,
  gatewayMode: null,
  gatewayMerchantId: "",
  gatewayPublicKey: "",
  gatewayCallbackUrl: "",
  gatewayActive: false,
  description: "",
  requiresReference: false,
  allowChange: false,
  allowRefund: true,
  allowOpenCashDrawer: false,
  sortOrder: 0,
  status: "ACTIVE"
});

const emptyBank = (): CreateBankRequest => ({
  bankCode: "",
  name: "",
  description: "",
  status: "ACTIVE"
});

const emptyBankBranch = (bankCode = ""): CreateBankBranchRequest => ({
  branchCode: "",
  bankCode,
  name: "",
  addressLine1: "",
  status: "ACTIVE"
});

const emptyBankAccount = (currencyCode: string): CreateBankAccountRequest => ({
  bankCode: "",
  bankName: "",
  branchCode: "",
  branchName: "",
  addressLine1: "",
  accountNumber: "",
  accountName: "",
  currencyCode,
  status: "ACTIVE"
});

const buildLoyaltyDraft = (
  loyaltyPolicy: EnterpriseSetupWorkspaceData["loyaltyPolicy"]
): UpdateEnterpriseLoyaltyPolicyRequest => ({
  loyaltyProgramEnabled: loyaltyPolicy.loyaltyProgramEnabled,
  loyaltyPointsPerCurrencyUnit: loyaltyPolicy.loyaltyPointsPerCurrencyUnit,
  loyaltyRedemptionEnabled: loyaltyPolicy.loyaltyRedemptionEnabled,
  loyaltyRedemptionPointsStep: loyaltyPolicy.loyaltyRedemptionPointsStep,
  loyaltyRedemptionValueAmount: loyaltyPolicy.loyaltyRedemptionValueAmount,
  loyaltyMinimumRedeemPoints: loyaltyPolicy.loyaltyMinimumRedeemPoints,
  loyaltyMaximumRedeemPercentOfSale: loyaltyPolicy.loyaltyMaximumRedeemPercentOfSale
});

const tenderBooleanFields: Array<{
  field: keyof Pick<
    CreateTenderMethodRequest,
    "requiresReference" | "allowChange" | "allowRefund" | "allowOpenCashDrawer"
  >;
  label: string;
}> = [
  { field: "requiresReference", label: "Require reference" },
  { field: "allowChange", label: "Allow change" },
  { field: "allowRefund", label: "Allow refunds" },
  { field: "allowOpenCashDrawer", label: "Open cash drawer" }
];

export function EnterpriseSetupWorkspace({
  embedded = false,
  workspace,
  view
}: {
  embedded?: boolean;
  workspace: EnterpriseSetupWorkspaceData;
  view: SetupMasterView;
}) {
  const router = useRouter();
  const [departmentDraft, setDepartmentDraft] =
    useState<CreateProductDepartmentRequest>(emptyDepartment());
  const [categoryDraft, setCategoryDraft] = useState<CreateProductCategoryRequest>(emptyCategory());
  const [taxDraft, setTaxDraft] = useState<CreateTaxProfileRequest>(emptyTax());
  const [tenderDraft, setTenderDraft] = useState<CreateTenderMethodRequest>(emptyTender());
  const [bankSetupDraft, setBankSetupDraft] = useState<CreateBankRequest>(emptyBank());
  const [branchDraft, setBranchDraft] = useState<CreateBankBranchRequest>(
    emptyBankBranch(workspace.bankRows[0]?.bankCode ?? "")
  );
  const [bankDraft, setBankDraft] = useState<CreateBankAccountRequest>(
    emptyBankAccount(workspace.currencyCode)
  );
  const [loyaltyDraft, setLoyaltyDraft] = useState<UpdateEnterpriseLoyaltyPolicyRequest>(
    buildLoyaltyDraft(workspace.loyaltyPolicy)
  );
  const [editingDepartmentCode, setEditingDepartmentCode] = useState<string | null>(null);
  const [editingCategoryCode, setEditingCategoryCode] = useState<string | null>(null);
  const [editingTaxCode, setEditingTaxCode] = useState<string | null>(null);
  const [editingTenderCode, setEditingTenderCode] = useState<string | null>(null);
  const [editingBankCode, setEditingBankCode] = useState<string | null>(null);
  const [editingBranchCode, setEditingBranchCode] = useState<string | null>(null);
  const [editingBankAccountId, setEditingBankAccountId] = useState<string | null>(null);
  const [isDepartmentDialogOpen, setIsDepartmentDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isTaxDialogOpen, setIsTaxDialogOpen] = useState(false);
  const [isTenderDialogOpen, setIsTenderDialogOpen] = useState(false);
  const [isBankSetupDialogOpen, setIsBankSetupDialogOpen] = useState(false);
  const [isBranchDialogOpen, setIsBranchDialogOpen] = useState(false);
  const [isBankDialogOpen, setIsBankDialogOpen] = useState(false);
  const [departmentState, setDepartmentState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [categoryState, setCategoryState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [taxState, setTaxState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [tenderState, setTenderState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [bankSetupState, setBankSetupState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [branchState, setBranchState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [bankState, setBankState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [loyaltyState, setLoyaltyState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [statusFilter, setStatusFilter] = useState("ALL");
  const cashbookAccountOptions = [
    { label: "Not mapped", value: "" },
    ...workspace.cashbookAccountOptions.map((account) => ({
      label: account.label,
      value: account.cashbookAccountId
    }))
  ];

  useEffect(() => {
    setLoyaltyDraft(buildLoyaltyDraft(workspace.loyaltyPolicy));
    setLoyaltyState({ status: "idle", message: "" });
    if (!editingBankAccountId) {
      setBankDraft((current) => ({
        ...current,
        currencyCode: current.currencyCode || workspace.currencyCode
      }));
    }
    if (!editingBranchCode) {
      setBranchDraft((current) => ({
        ...current,
        bankCode: current.bankCode || workspace.bankRows[0]?.bankCode || ""
      }));
    }
  }, [
    editingBankAccountId,
    editingBranchCode,
    workspace.bankRows,
    workspace.currencyCode,
    workspace.loyaltyPolicy,
    workspace.refreshedAt
  ]);


  const departmentSelectOptions = useMemo(
    () => [
      { value: "", label: "Select department" },
      ...workspace.availableDepartments.map((department) => ({
        value: department.departmentCode,
        label: `${department.name} (${department.departmentCode})`
      }))
    ],
    [workspace.availableDepartments]
  );
  const bankSelectOptions = useMemo(
    () => [
      { value: "", label: "Select bank" },
      ...workspace.bankRows
        .filter((bank) => bank.status === "ACTIVE")
        .map((bank) => ({
          value: bank.bankCode,
          label: `${bank.name} (${bank.bankCode})`
        }))
    ],
    [workspace.bankRows]
  );
  const branchSelectOptions = useMemo(
    () => [
      { value: "", label: "Select branch" },
      ...workspace.bankBranchRows
        .filter((branch) => branch.status === "ACTIVE")
        .map((branch) => ({
          value: branch.branchCode,
          label: `${branch.bankName} / ${branch.name} (${branch.branchCode})`
        }))
    ],
    [workspace.bankBranchRows]
  );
  const selectedView = view;
  const pageMeta = enterpriseMasterPageMeta[selectedView];
  const statusFilterControl = (
    <label className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700">
      <span>Status</span>
      <select
        className="bg-transparent text-sm font-semibold outline-none"
        onChange={(event) => setStatusFilter(event.target.value)}
        value={statusFilter}
      >
        <option value="ALL">All</option>
        <option value="ACTIVE">Active</option>
        <option value="INACTIVE">Inactive</option>
        <option value="ARCHIVED">Archived</option>
      </select>
    </label>
  );
  const filterByStatus = <T extends { status: string }>(rows: T[]) =>
    statusFilter === "ALL" ? rows : rows.filter((row) => row.status === statusFilter);
  const viewMetrics = useMemo(() => {
    switch (selectedView) {
      case "departments":
        return [
          {
            icon: Boxes,
            label: "Active departments",
            value: String(workspace.metrics.activeProductDepartments)
          },
          {
            icon: Store,
            label: "Active categories",
            value: String(workspace.metrics.activeProductCategories)
          }
        ];
      case "categories":
        return [
          {
            icon: Store,
            label: "Active categories",
            value: String(workspace.metrics.activeProductCategories)
          },
          {
            icon: Boxes,
            label: "Departments",
            value: String(workspace.metrics.activeProductDepartments)
          }
        ];
      case "tax":
        return [
          {
            icon: Percent,
            label: "Active tax profiles",
            value: String(workspace.metrics.activeTaxProfiles)
          },
          {
            icon: ShieldCheck,
            label: "Default profiles",
            value: String(workspace.taxRows.filter((row) => row.isDefault).length)
          },
          {
            icon: SlidersHorizontal,
            label: "Inclusive profiles",
            value: String(workspace.taxRows.filter((row) => row.isTaxInclusive).length)
          }
        ];
      case "tenders":
        return [
          {
            icon: HandCoins,
            label: "Active tenders",
            value: String(workspace.metrics.activeTenderMethods)
          },
          {
            icon: ShieldCheck,
            label: "Reference required",
            value: String(workspace.metrics.referenceRequiredTenderMethods)
          },
          {
            icon: SlidersHorizontal,
            label: "Change enabled",
            value: String(workspace.metrics.changeEnabledTenderMethods)
          }
        ];
      case "banks":
        return [
          {
            icon: Landmark,
            label: "Active accounts",
            value: String(workspace.metrics.activeBankAccounts)
          },
          {
            icon: Store,
            label: "Banks",
            value: String(new Set(workspace.bankAccountRows.map((row) => row.bankCode)).size)
          },
          {
            icon: ShieldCheck,
            label: "Branches",
            value: String(new Set(workspace.bankAccountRows.map((row) => row.branchCode)).size)
          }
        ];
      case "loyalty":
        return [
          {
            icon: Award,
            label: "Points per unit",
            value: workspace.loyaltyPolicy.loyaltyPointsPerCurrencyUnit.toFixed(2)
          },
          {
            icon: HandCoins,
            label: "Redemption",
            value: workspace.loyaltyPolicy.loyaltyRedemptionEnabled ? "Enabled" : "Disabled"
          },
          {
            icon: Percent,
            label: "Redeem cap",
            value: `${workspace.loyaltyPolicy.loyaltyMaximumRedeemPercentOfSale.toFixed(2)}%`
          }
        ];
      default:
        return [];
    }
  }, [selectedView, workspace]);

  const departmentColumns = useMemo<ColumnDef<DepartmentRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Department",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.name}</p>
            <p className="truncate text-xs text-stone-500">{row.original.departmentCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "categoryCount",
        header: "Categories",
        cell: ({ row }) =>
          `${row.original.activeCategoryCount} active / ${row.original.categoryCount} total`
      },
      {
        accessorKey: "sortOrder",
        header: "Sort"
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
        cell: ({ row }) => renderTimestamp(row.original.updatedAt, row.original.updatedAtLabel),
        meta: { disableTruncate: true }
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit department",
                onSelect: () => {
                  setEditingDepartmentCode(row.original.departmentCode);
                  setDepartmentDraft({
                    departmentCode: row.original.departmentCode,
                    name: row.original.name,
                    description: row.original.description ?? "",
                    sortOrder: row.original.sortOrder,
                    status: row.original.status
                  });
                  setDepartmentState({ status: "idle", message: "" });
                  setIsDepartmentDialogOpen(true);
                }
              }
            ]}
            label={`Actions for ${row.original.departmentCode}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const categoryColumns = useMemo<ColumnDef<CategoryRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Category",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.name}</p>
            <p className="truncate text-xs text-stone-500">{row.original.categoryCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "departmentName",
        header: "Department",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-stone-800">
              {row.original.departmentName}
            </p>
            <p className="truncate text-xs text-stone-500">{row.original.departmentCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "sortOrder",
        header: "Sort"
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
        cell: ({ row }) => renderTimestamp(row.original.updatedAt, row.original.updatedAtLabel),
        meta: { disableTruncate: true }
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit category",
                onSelect: () => {
                  setEditingCategoryCode(row.original.categoryCode);
                  setCategoryDraft({
                    categoryCode: row.original.categoryCode,
                    departmentCode: row.original.departmentCode,
                    name: row.original.name,
                    description: row.original.description ?? "",
                    sortOrder: row.original.sortOrder,
                    status: row.original.status
                  });
                  setCategoryState({ status: "idle", message: "" });
                  setIsCategoryDialogOpen(true);
                }
              }
            ]}
            label={`Actions for ${row.original.categoryCode}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const taxColumns = useMemo<ColumnDef<TaxRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Tax profile",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.name}</p>
            <p className="truncate text-xs text-stone-500">{row.original.taxProfileCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "ratePercent",
        header: "Rate",
        cell: ({ row }) => `${row.original.ratePercent.toFixed(2)}%`
      },
      {
        accessorKey: "isTaxInclusive",
        header: "Mode",
        cell: ({ row }) => (row.original.isTaxInclusive ? "Inclusive" : "Exclusive")
      },
      {
        accessorKey: "isDefault",
        header: "Default",
        cell: ({ row }) => (row.original.isDefault ? "Default" : "Optional")
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
        cell: ({ row }) => renderTimestamp(row.original.updatedAt, row.original.updatedAtLabel),
        meta: { disableTruncate: true }
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit tax profile",
                onSelect: () => {
                  setEditingTaxCode(row.original.taxProfileCode);
                  setTaxDraft({
                    taxProfileCode: row.original.taxProfileCode,
                    name: row.original.name,
                    description: "",
                    ratePercent: row.original.ratePercent,
                    isDefault: row.original.isDefault,
                    isTaxInclusive: row.original.isTaxInclusive,
                    status: row.original.status
                  });
                  setTaxState({ status: "idle", message: "" });
                  setIsTaxDialogOpen(true);
                }
              }
            ]}
            label={`Actions for ${row.original.taxProfileCode}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const tenderColumns = useMemo<ColumnDef<TenderRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Tender method",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.name}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.tenderMethodCode} • {row.original.paymentMethod}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "requiresReference",
        header: "Reference",
        cell: ({ row }) => (row.original.requiresReference ? "Required" : "Optional")
      },
      {
        accessorKey: "cashbookAccountCode",
        header: "Finance account",
        cell: ({ row }) =>
          row.original.cashbookAccountCode
            ? `${row.original.cashbookAccountCode} / GL ${row.original.glAccountCode ?? "Not mapped"}`
            : "Not mapped"
      },
      {
        accessorKey: "gatewayProvider",
        header: "Gateway",
        cell: ({ row }) =>
          row.original.gatewayProvider
            ? `${row.original.gatewayProvider}${row.original.gatewayActive ? " / active" : " / off"}`
            : "None"
      },
      {
        accessorKey: "allowChange",
        header: "Change",
        cell: ({ row }) => (row.original.allowChange ? "Allowed" : "Blocked")
      },
      {
        accessorKey: "allowRefund",
        header: "Refunds",
        cell: ({ row }) => (row.original.allowRefund ? "Allowed" : "Blocked")
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
        cell: ({ row }) => renderTimestamp(row.original.updatedAt, row.original.updatedAtLabel),
        meta: { disableTruncate: true }
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit tender method",
                onSelect: () => {
                  setEditingTenderCode(row.original.tenderMethodCode);
                  setTenderDraft({
                    tenderMethodCode: row.original.tenderMethodCode,
                    name: row.original.name,
                    paymentMethod: row.original.paymentMethod,
                    cashbookAccountId: row.original.cashbookAccountId ?? "",
                    gatewayProvider: row.original.gatewayProvider,
                    gatewayMode: row.original.gatewayMode,
                    gatewayMerchantId: row.original.gatewayMerchantId ?? "",
                    gatewayPublicKey: row.original.gatewayPublicKey ?? "",
                    gatewayCallbackUrl: row.original.gatewayCallbackUrl ?? "",
                    gatewayActive: row.original.gatewayActive,
                    description: "",
                    requiresReference: row.original.requiresReference,
                    allowChange: row.original.allowChange,
                    allowRefund: row.original.allowRefund,
                    allowOpenCashDrawer: row.original.allowOpenCashDrawer,
                    sortOrder: row.original.sortOrder,
                    status: row.original.status
                  });
                  setTenderState({ status: "idle", message: "" });
                  setIsTenderDialogOpen(true);
                }
              }
            ]}
            label={`Actions for ${row.original.tenderMethodCode}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const bankMasterColumns = useMemo<ColumnDef<BankRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Bank",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.name}</p>
            <p className="truncate text-xs text-stone-500">{row.original.bankCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "branchCount",
        header: "Branches",
        cell: ({ row }) => row.original.branchCount,
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "accountCount",
        header: "Accounts",
        cell: ({ row }) => row.original.accountCount,
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
        meta: { disableTruncate: true }
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit bank",
                onSelect: () => {
                  setEditingBankCode(row.original.bankCode);
                  setBankSetupDraft({
                    bankCode: row.original.bankCode,
                    name: row.original.name,
                    description: row.original.description ?? "",
                    status: row.original.status
                  });
                  setBankSetupState({ status: "idle", message: "" });
                  setIsBankSetupDialogOpen(true);
                }
              }
            ]}
            label={`Actions for ${row.original.bankCode}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const branchColumns = useMemo<ColumnDef<BankBranchRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Branch",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.name}</p>
            <p className="truncate text-xs text-stone-500">{row.original.branchCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "bankName",
        header: "Bank",
        cell: ({ row }) => `${row.original.bankName} (${row.original.bankCode})`,
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "accountNumber",
        header: "Account",
        cell: ({ row }) => row.original.accountNumber ?? "Not linked",
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
        meta: { disableTruncate: true }
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit branch",
                onSelect: () => {
                  setEditingBranchCode(row.original.branchCode);
                  setBranchDraft({
                    branchCode: row.original.branchCode,
                    bankCode: row.original.bankCode,
                    name: row.original.name,
                    addressLine1: row.original.addressLine1 ?? "",
                    status: row.original.status
                  });
                  setBranchState({ status: "idle", message: "" });
                  setIsBranchDialogOpen(true);
                }
              }
            ]}
            label={`Actions for ${row.original.branchCode}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const bankColumns = useMemo<ColumnDef<BankAccountRow>[]>(
    () => [
      {
        accessorKey: "bankName",
        header: "Bank",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.bankName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.bankCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "branchName",
        header: "Branch",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-stone-800">{row.original.branchName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.branchCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "accountNumber",
        header: "Account",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.accountNumber}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.accountName} • {row.original.currencyCode}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
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
        cell: ({ row }) => renderTimestamp(row.original.updatedAt, row.original.updatedAtLabel),
        meta: { disableTruncate: true }
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit account",
                onSelect: () => {
                  setEditingBankAccountId(row.original.bankAccountId);
                  setBankDraft({
                    bankCode: row.original.bankCode,
                    bankName: row.original.bankName,
                    branchCode: row.original.branchCode,
                    branchName: row.original.branchName,
                    addressLine1: row.original.addressLine1 ?? "",
                    accountNumber: row.original.accountNumber,
                    accountName: row.original.accountName,
                    currencyCode: row.original.currencyCode,
                    status: row.original.status
                  });
                  setBankState({ status: "idle", message: "" });
                  setIsBankDialogOpen(true);
                }
              }
            ]}
            label={`Actions for ${row.original.accountNumber}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  async function saveDepartment() {
    setDepartmentState({ status: "submitting", message: "" });

    try {
      const response = await fetch(
        editingDepartmentCode
          ? `/api/setup/departments/${encodeURIComponent(editingDepartmentCode)}`
          : "/api/setup/departments",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(departmentDraft)
        }
      );
      const payload = (await response.json()) as Partial<ProductDepartmentMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save that department.");
      }

      setDepartmentState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the department."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsDepartmentDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setDepartmentState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save that department."
      });
    }
  }

  async function saveCategory() {
    setCategoryState({ status: "submitting", message: "" });

    try {
      const response = await fetch(
        editingCategoryCode
          ? `/api/setup/categories/${encodeURIComponent(editingCategoryCode)}`
          : "/api/setup/categories",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(categoryDraft)
        }
      );
      const payload = (await response.json()) as Partial<ProductCategoryMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save that category.");
      }

      setCategoryState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the category."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsCategoryDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setCategoryState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not save that category."
      });
    }
  }

  async function saveTaxProfile() {
    setTaxState({ status: "submitting", message: "" });

    try {
      const response = await fetch(
        editingTaxCode
          ? `/api/setup/tax-profiles/${encodeURIComponent(editingTaxCode)}`
          : "/api/setup/tax-profiles",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(taxDraft)
        }
      );
      const payload = (await response.json()) as Partial<TaxProfileMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save that tax profile.");
      }

      setTaxState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the tax profile."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsTaxDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setTaxState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save that tax profile."
      });
    }
  }

  async function saveTenderMethod() {
    setTenderState({ status: "submitting", message: "" });

    try {
      const response = await fetch(
        editingTenderCode
          ? `/api/setup/tender-methods/${encodeURIComponent(editingTenderCode)}`
          : "/api/setup/tender-methods",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(tenderDraft)
        }
      );
      const payload = (await response.json()) as Partial<TenderMethodMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save that tender method.");
      }

      setTenderState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the tender method."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsTenderDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setTenderState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save that tender method."
      });
    }
  }

  async function saveBank() {
    setBankSetupState({ status: "submitting", message: "" });

    try {
      const response = await fetch(
        editingBankCode
          ? `/api/setup/banks/${encodeURIComponent(editingBankCode)}`
          : "/api/setup/banks",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(bankSetupDraft)
        }
      );
      const payload = (await response.json()) as Partial<BankMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save that bank.");
      }

      setBankSetupState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the bank."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsBankSetupDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setBankSetupState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not save that bank."
      });
    }
  }

  async function saveBankBranch() {
    setBranchState({ status: "submitting", message: "" });

    try {
      const response = await fetch(
        editingBranchCode
          ? `/api/setup/bank-branches/${encodeURIComponent(editingBranchCode)}`
          : "/api/setup/bank-branches",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(branchDraft)
        }
      );
      const payload = (await response.json()) as Partial<BankBranchMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save that bank branch.");
      }

      setBranchState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the bank branch."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsBranchDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setBranchState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save that bank branch."
      });
    }
  }

  async function saveBankAccount() {
    setBankState({ status: "submitting", message: "" });

    try {
      const response = await fetch(
        editingBankAccountId
          ? `/api/setup/bank-accounts/${encodeURIComponent(editingBankAccountId)}`
          : "/api/setup/bank-accounts",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(bankDraft)
        }
      );
      const payload = (await response.json()) as Partial<BankAccountMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save that bank account.");
      }

      setBankState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the bank account."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsBankDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setBankState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save that bank account."
      });
    }
  }

  async function saveLoyaltyPolicy() {
    setLoyaltyState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/setup/loyalty-policy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(loyaltyDraft)
      });
      const payload = (await response.json()) as Partial<LoyaltyPolicyMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save the loyalty policy.");
      }

      setLoyaltyState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the loyalty policy."
      });

      startTransition(() => {
        window.setTimeout(() => {
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setLoyaltyState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save the loyalty policy."
      });
    }
  }

  const renderActiveView = (currentView: SetupMasterView) => {
    switch (currentView) {
      case "departments":
        return (
          <SharedDataGrid
            columns={departmentColumns}
            data={filterByStatus(workspace.departmentRows)}
            emptyLabel="No departments yet."
            exportFileName="flash-erp-product-departments"
            searchPlaceholder="Search departments"
            toolbarFilters={statusFilterControl}
            toolbarActions={
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[var(--brand)]"
                onClick={() => {
                  setEditingDepartmentCode(null);
                  setDepartmentDraft(emptyDepartment());
                  setDepartmentState({ status: "idle", message: "" });
                  setIsDepartmentDialogOpen(true);
                }}
                type="button"
              >
                <Boxes className="h-4 w-4" />
                Create department
              </button>
            }
          />
        );
      case "categories":
        return (
          <SharedDataGrid
            columns={categoryColumns}
            data={filterByStatus(workspace.categoryRows)}
            emptyLabel="No categories yet."
            exportFileName="flash-erp-product-categories"
            searchPlaceholder="Search categories"
            toolbarFilters={statusFilterControl}
            toolbarActions={
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[var(--brand)]"
                onClick={() => {
                  setEditingCategoryCode(null);
                  setCategoryDraft({
                    ...emptyCategory(),
                    departmentCode: workspace.availableDepartments[0]?.departmentCode ?? ""
                  });
                  setCategoryState({ status: "idle", message: "" });
                  setIsCategoryDialogOpen(true);
                }}
                type="button"
              >
                <Award className="h-4 w-4" />
                Create category
              </button>
            }
          />
        );
      case "tax":
        return (
          <SharedDataGrid
            columns={taxColumns}
            data={filterByStatus(workspace.taxRows)}
            emptyLabel="No tax profiles yet."
            exportFileName="flash-erp-tax-profiles"
            searchPlaceholder="Search tax profiles"
            toolbarFilters={statusFilterControl}
            toolbarActions={
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[var(--brand)]"
                onClick={() => {
                  setEditingTaxCode(null);
                  setTaxDraft(emptyTax());
                  setTaxState({ status: "idle", message: "" });
                  setIsTaxDialogOpen(true);
                }}
                type="button"
              >
                <Percent className="h-4 w-4" />
                Create tax profile
              </button>
            }
          />
        );
      case "tenders":
        return (
          <SharedDataGrid
            columns={tenderColumns}
            data={filterByStatus(workspace.tenderRows)}
            emptyLabel="No tender methods yet."
            exportFileName="flash-erp-tender-methods"
            searchPlaceholder="Search tender methods"
            toolbarFilters={statusFilterControl}
            toolbarActions={
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[var(--brand)]"
                onClick={() => {
                  setEditingTenderCode(null);
                  setTenderDraft(emptyTender());
                  setTenderState({ status: "idle", message: "" });
                  setIsTenderDialogOpen(true);
                }}
                type="button"
              >
                <HandCoins className="h-4 w-4" />
                Create tender method
              </button>
            }
          />
        );
      case "banks":
        return (
          <div className="grid gap-4">
            <section className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Banks</p>
                  <h3 className="text-lg font-semibold text-stone-950">Bank master</h3>
                </div>
              </div>
              <SharedDataGrid
                columns={bankMasterColumns}
                data={filterByStatus(workspace.bankRows)}
                emptyLabel="No banks yet."
                exportFileName="flash-erp-banks"
                searchPlaceholder="Search banks"
                toolbarFilters={statusFilterControl}
                toolbarActions={
                  <button
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[var(--brand)]"
                    onClick={() => {
                      setEditingBankCode(null);
                      setBankSetupDraft(emptyBank());
                      setBankSetupState({ status: "idle", message: "" });
                      setIsBankSetupDialogOpen(true);
                    }}
                    type="button"
                  >
                    <Landmark className="h-4 w-4" />
                    Create bank
                  </button>
                }
              />
            </section>
            <section className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Branches</p>
                  <h3 className="text-lg font-semibold text-stone-950">Branches linked to banks</h3>
                </div>
              </div>
              <SharedDataGrid
                columns={branchColumns}
                data={filterByStatus(workspace.bankBranchRows)}
                emptyLabel="No bank branches yet."
                exportFileName="flash-erp-bank-branches"
                searchPlaceholder="Search branches or banks"
                toolbarFilters={statusFilterControl}
                toolbarActions={
                  <button
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[var(--brand)]"
                    onClick={() => {
                      setEditingBranchCode(null);
                      setBranchDraft(emptyBankBranch(workspace.bankRows[0]?.bankCode ?? ""));
                      setBranchState({ status: "idle", message: "" });
                      setIsBranchDialogOpen(true);
                    }}
                    type="button"
                  >
                    <Landmark className="h-4 w-4" />
                    Create branch
                  </button>
                }
              />
            </section>
            <section className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Account numbers</p>
                  <h3 className="text-lg font-semibold text-stone-950">One account number per branch</h3>
                </div>
              </div>
              <SharedDataGrid
                columns={bankColumns}
                data={filterByStatus(workspace.bankAccountRows)}
                emptyLabel="No bank accounts yet."
                exportFileName="flash-erp-bank-accounts"
                searchPlaceholder="Search banks, branches, or account numbers"
                toolbarFilters={statusFilterControl}
                toolbarActions={
                  <button
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[var(--brand)]"
                    onClick={() => {
                      setEditingBankAccountId(null);
                      const branch = workspace.bankBranchRows.find((row) => !row.accountNumber) ?? workspace.bankBranchRows[0];
                      setBankDraft({
                        ...emptyBankAccount(workspace.currencyCode),
                        bankCode: branch?.bankCode ?? "",
                        bankName: branch?.bankName ?? "",
                        branchCode: branch?.branchCode ?? "",
                        branchName: branch?.name ?? "",
                        addressLine1: branch?.addressLine1 ?? ""
                      });
                      setBankState({ status: "idle", message: "" });
                      setIsBankDialogOpen(true);
                    }}
                    type="button"
                  >
                    <Landmark className="h-4 w-4" />
                    Create account
                  </button>
                }
              />
            </section>
          </div>
        );
      case "loyalty":
        return (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.9fr)]">
            <article className="glass-panel rounded-[1.35rem] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                    Loyalty rules
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-stone-950">Points and redemption</h3>
                </div>
                <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-700">
                  {workspace.loyaltyPolicy.loyaltyProgramEnabled ? "Program live" : "Program paused"}
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <DialogCheckbox
                  checked={loyaltyDraft.loyaltyProgramEnabled ?? true}
                  label="Enable loyalty program"
                  onChange={(nextValue) =>
                    setLoyaltyDraft((current) => ({
                      ...current,
                      loyaltyProgramEnabled: nextValue
                    }))
                  }
                />
                <DialogCheckbox
                  checked={loyaltyDraft.loyaltyRedemptionEnabled ?? false}
                  label="Enable POS redemption"
                  onChange={(nextValue) =>
                    setLoyaltyDraft((current) => ({
                      ...current,
                      loyaltyRedemptionEnabled: nextValue
                    }))
                  }
                />
                <DialogTextInput
                  label="Points per currency unit"
                  min="0"
                  onChange={(value) =>
                    setLoyaltyDraft((current) => ({
                      ...current,
                      loyaltyPointsPerCurrencyUnit: value.trim() ? Number(value) : 0
                    }))
                  }
                  step="0.0001"
                  type="number"
                  value={loyaltyDraft.loyaltyPointsPerCurrencyUnit ?? 1}
                />
                <DialogTextInput
                  label="Redeem points step"
                  min="1"
                  onChange={(value) =>
                    setLoyaltyDraft((current) => ({
                      ...current,
                      loyaltyRedemptionPointsStep: value.trim() ? Number(value) : 1
                    }))
                  }
                  step="1"
                  type="number"
                  value={loyaltyDraft.loyaltyRedemptionPointsStep ?? 100}
                />
                <DialogTextInput
                  label="Redeem value amount"
                  min="0"
                  onChange={(value) =>
                    setLoyaltyDraft((current) => ({
                      ...current,
                      loyaltyRedemptionValueAmount: value.trim() ? Number(value) : 0
                    }))
                  }
                  step="0.01"
                  type="number"
                  value={loyaltyDraft.loyaltyRedemptionValueAmount ?? 1}
                />
                <DialogTextInput
                  label="Minimum redeemable points"
                  min="1"
                  onChange={(value) =>
                    setLoyaltyDraft((current) => ({
                      ...current,
                      loyaltyMinimumRedeemPoints: value.trim() ? Number(value) : 1
                    }))
                  }
                  step="1"
                  type="number"
                  value={loyaltyDraft.loyaltyMinimumRedeemPoints ?? 100}
                />
                <div className="md:col-span-2">
                  <DialogTextInput
                    label="Maximum redeem percent of sale"
                    min="0"
                    onChange={(value) =>
                      setLoyaltyDraft((current) => ({
                        ...current,
                        loyaltyMaximumRedeemPercentOfSale: value.trim() ? Number(value) : 0
                      }))
                    }
                    step="0.01"
                    type="number"
                    value={loyaltyDraft.loyaltyMaximumRedeemPercentOfSale ?? 100}
                  />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                  disabled={loyaltyState.status === "submitting"}
                  onClick={() => {
                    setLoyaltyDraft(buildLoyaltyDraft(workspace.loyaltyPolicy));
                    setLoyaltyState({ status: "idle", message: "" });
                  }}
                  type="button"
                >
                  Reset
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#0f766e,#115e59)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(15,118,110,0.22)] transition hover:brightness-[1.03]"
                  disabled={loyaltyState.status === "submitting"}
                  onClick={() => void saveLoyaltyPolicy()}
                  type="button"
                >
                  {loyaltyState.status === "submitting" ? "Saving..." : "Save loyalty policy"}
                </button>
              </div>

              {loyaltyState.message ? (
                <div
                  className={`mt-4 rounded-2xl border px-4 py-3 text-sm leading-6 ${
                    loyaltyState.status === "error"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {loyaltyState.message}
                </div>
              ) : null}
            </article>

            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Summary
              </p>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-3 text-sm leading-6 text-stone-700">
                  Earn rate:{" "}
                  <strong>{Number(loyaltyDraft.loyaltyPointsPerCurrencyUnit ?? 0).toFixed(2)}</strong>{" "}
                  point(s) per currency unit.
                </div>
                <div className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-3 text-sm leading-6 text-stone-700">
                  Redemption:{" "}
                  <strong>{loyaltyDraft.loyaltyRedemptionEnabled ? "enabled" : "disabled"}</strong>
                  {loyaltyDraft.loyaltyRedemptionEnabled
                    ? ` in ${loyaltyDraft.loyaltyRedemptionPointsStep ?? 0}-point steps worth ${workspace.currencyCode} ${Number(loyaltyDraft.loyaltyRedemptionValueAmount ?? 0).toFixed(2)}.`
                    : "."}
                </div>
                <div className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-3 text-sm leading-6 text-stone-700">
                  Minimum redeem:{" "}
                  <strong>{loyaltyDraft.loyaltyMinimumRedeemPoints ?? 0} points</strong>, capped at{" "}
                  <strong>
                    {Number(loyaltyDraft.loyaltyMaximumRedeemPercentOfSale ?? 0).toFixed(2)}%
                  </strong>{" "}
                  of the sale.
                </div>
              </div>
            </article>
          </div>
        );
      default:
        return null;
    }
  };

  const ShellFrame = ({ children }: { children: ReactNode }) =>
    embedded ? (
      <div className="space-y-4">{children}</div>
    ) : (
      <EnterpriseShell activeSection="master" eyebrow="Flash ERP enterprise" heading={pageMeta.heading}>
        {children}
      </EnterpriseShell>
    );

  return (
    <ShellFrame>
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-[color:var(--brand)]/15 bg-[color:rgba(37,99,235,0.06)] px-4 py-2 text-sm font-medium text-[color:var(--brand-deep)]">
            {pageMeta.label}
          </div>
        </div>

        <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-700">
          Last refresh {new Date(workspace.refreshedAt).toLocaleString()}
        </div>
      </section>

      {viewMetrics.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {viewMetrics.map((metric) => (
            <MetricCard
              icon={metric.icon}
              key={metric.label}
              label={metric.label}
              value={metric.value}
            />
          ))}
        </section>
      ) : null}

      {renderActiveView(selectedView)}

      <ActionDialog
        description="Create or update departments."
        onOpenChange={setIsDepartmentDialogOpen}
        open={isDepartmentDialogOpen}
        title={editingDepartmentCode ? "Edit department" : "Create department"}
        hideTrigger
        triggerLabel=""
        widthClassName="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <DialogTextInput
              disabled={Boolean(editingDepartmentCode)}
              label="Department code"
              onChange={(value) =>
                setDepartmentDraft((current) => ({ ...current, departmentCode: value }))
              }
              placeholder="GROCERY"
              value={departmentDraft.departmentCode}
            />
            <DialogTextInput
              label="Department name"
              onChange={(value) => setDepartmentDraft((current) => ({ ...current, name: value }))}
              placeholder="Grocery"
              value={departmentDraft.name}
            />
            <DialogTextInput
              label="Sort order"
              min="0"
              onChange={(value) =>
                setDepartmentDraft((current) => ({
                  ...current,
                  sortOrder: value.trim() ? Number(value) : 0
                }))
              }
              type="number"
              value={departmentDraft.sortOrder ?? 0}
            />
            <DialogSelect
              label="Status"
              onChange={(value) => setDepartmentDraft((current) => ({ ...current, status: value }))}
              options={recordStatusOptions}
              value={departmentDraft.status ?? "ACTIVE"}
            />
            <div className="md:col-span-2">
              <DialogTextArea
                label="Description"
                onChange={(value) =>
                  setDepartmentDraft((current) => ({ ...current, description: value }))
                }
                value={departmentDraft.description ?? ""}
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              disabled={departmentState.status === "submitting"}
              onClick={() => setIsDepartmentDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
              disabled={
                departmentState.status === "submitting" ||
                !departmentDraft.departmentCode.trim() ||
                !departmentDraft.name.trim()
              }
              onClick={() => void saveDepartment()}
              type="button"
            >
              {departmentState.status === "submitting" ? "Saving..." : "Save department"}
            </button>
          </div>

          {departmentState.message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                departmentState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {departmentState.message}
            </div>
          ) : null}
        </div>
      </ActionDialog>

      <ActionDialog
        description="Create or update categories."
        onOpenChange={setIsCategoryDialogOpen}
        open={isCategoryDialogOpen}
        title={editingCategoryCode ? "Edit category" : "Create category"}
        hideTrigger
        triggerLabel=""
        widthClassName="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <DialogTextInput
              disabled={Boolean(editingCategoryCode)}
              label="Category code"
              onChange={(value) =>
                setCategoryDraft((current) => ({ ...current, categoryCode: value }))
              }
              placeholder="SOFT-DRINKS"
              value={categoryDraft.categoryCode}
            />
            <DialogTextInput
              label="Category name"
              onChange={(value) => setCategoryDraft((current) => ({ ...current, name: value }))}
              placeholder="Soft Drinks"
              value={categoryDraft.name}
            />
            <DialogSelect
              disabled={workspace.availableDepartments.length === 0}
              label="Department"
              onChange={(value) =>
                setCategoryDraft((current) => ({ ...current, departmentCode: value }))
              }
              options={departmentSelectOptions}
              value={categoryDraft.departmentCode}
            />
            <DialogTextInput
              label="Sort order"
              min="0"
              onChange={(value) =>
                setCategoryDraft((current) => ({
                  ...current,
                  sortOrder: value.trim() ? Number(value) : 0
                }))
              }
              type="number"
              value={categoryDraft.sortOrder ?? 0}
            />
            <DialogSelect
              label="Status"
              onChange={(value) => setCategoryDraft((current) => ({ ...current, status: value }))}
              options={recordStatusOptions}
              value={categoryDraft.status ?? "ACTIVE"}
            />
            <div className="md:col-span-2">
              <DialogTextArea
                label="Description"
                onChange={(value) =>
                  setCategoryDraft((current) => ({ ...current, description: value }))
                }
                value={categoryDraft.description ?? ""}
              />
            </div>
          </div>

          {workspace.availableDepartments.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              Create a department first, then categories can be attached under it.
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              disabled={categoryState.status === "submitting"}
              onClick={() => setIsCategoryDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#0284c7,#0369a1)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(3,105,161,0.22)] transition hover:brightness-[1.03]"
              disabled={
                categoryState.status === "submitting" ||
                !categoryDraft.categoryCode.trim() ||
                !categoryDraft.name.trim() ||
                !categoryDraft.departmentCode.trim()
              }
              onClick={() => void saveCategory()}
              type="button"
            >
              {categoryState.status === "submitting" ? "Saving..." : "Save category"}
            </button>
          </div>

          {categoryState.message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                categoryState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {categoryState.message}
            </div>
          ) : null}
        </div>
      </ActionDialog>

      <ActionDialog
        description="Create or update tax profiles."
        onOpenChange={setIsTaxDialogOpen}
        open={isTaxDialogOpen}
        title={editingTaxCode ? "Edit tax profile" : "Create tax profile"}
        hideTrigger
        triggerLabel=""
        widthClassName="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <DialogTextInput
              disabled={Boolean(editingTaxCode)}
              label="Tax profile code"
              onChange={(value) => setTaxDraft((current) => ({ ...current, taxProfileCode: value }))}
              placeholder="VAT-STD"
              value={taxDraft.taxProfileCode}
            />
            <DialogTextInput
              label="Tax profile name"
              onChange={(value) => setTaxDraft((current) => ({ ...current, name: value }))}
              placeholder="Standard VAT"
              value={taxDraft.name}
            />
            <DialogTextInput
              label="Rate percent"
              min="0"
              onChange={(value) =>
                setTaxDraft((current) => ({
                  ...current,
                  ratePercent: value.trim() ? Number(value) : 0
                }))
              }
              step="0.01"
              type="number"
              value={taxDraft.ratePercent}
            />
            <DialogSelect
              label="Status"
              onChange={(value) => setTaxDraft((current) => ({ ...current, status: value }))}
              options={recordStatusOptions}
              value={taxDraft.status ?? "ACTIVE"}
            />
            <div className="md:col-span-2">
              <DialogTextArea
                label="Description"
                onChange={(value) => setTaxDraft((current) => ({ ...current, description: value }))}
                value={taxDraft.description ?? ""}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <DialogCheckbox
              checked={taxDraft.isDefault ?? false}
              label="Default tax profile"
              onChange={(nextValue) =>
                setTaxDraft((current) => ({ ...current, isDefault: nextValue }))
              }
            />
            <DialogCheckbox
              checked={taxDraft.isTaxInclusive ?? false}
              label="Tax inclusive pricing"
              onChange={(nextValue) =>
                setTaxDraft((current) => ({ ...current, isTaxInclusive: nextValue }))
              }
            />
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              disabled={taxState.status === "submitting"}
              onClick={() => setIsTaxDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#d97706,#b45309)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(180,83,9,0.22)] transition hover:brightness-[1.03]"
              disabled={
                taxState.status === "submitting" ||
                !taxDraft.taxProfileCode.trim() ||
                !taxDraft.name.trim()
              }
              onClick={() => void saveTaxProfile()}
              type="button"
            >
              {taxState.status === "submitting" ? "Saving..." : "Save tax profile"}
            </button>
          </div>

          {taxState.message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                taxState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {taxState.message}
            </div>
          ) : null}
        </div>
      </ActionDialog>

      <ActionDialog
        description="Create or update tender methods."
        onOpenChange={setIsTenderDialogOpen}
        open={isTenderDialogOpen}
        title={editingTenderCode ? "Edit tender method" : "Create tender method"}
        hideTrigger
        triggerLabel=""
        widthClassName="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <DialogTextInput
              disabled={Boolean(editingTenderCode)}
              label="Tender method code"
              onChange={(value) =>
                setTenderDraft((current) => ({ ...current, tenderMethodCode: value }))
              }
              placeholder="CASH"
              value={tenderDraft.tenderMethodCode}
            />
            <DialogTextInput
              label="Tender name"
              onChange={(value) => setTenderDraft((current) => ({ ...current, name: value }))}
              placeholder="Cash"
              value={tenderDraft.name}
            />
            <DialogSelect
              label="Payment method family"
              onChange={(value) =>
                setTenderDraft((current) => ({ ...current, paymentMethod: value }))
              }
              options={paymentMethodOptions}
              value={tenderDraft.paymentMethod}
            />
            <DialogSelect
              label="Finance cashbook account"
              onChange={(value) =>
                setTenderDraft((current) => ({ ...current, cashbookAccountId: value || null }))
              }
              options={cashbookAccountOptions}
              value={tenderDraft.cashbookAccountId ?? ""}
            />
            <DialogTextInput
              label="Sort order"
              min="0"
              onChange={(value) =>
                setTenderDraft((current) => ({
                  ...current,
                  sortOrder: value.trim() ? Number(value) : 0
                }))
              }
              type="number"
              value={tenderDraft.sortOrder ?? 0}
            />
            <DialogSelect
              label="Status"
              onChange={(value) => setTenderDraft((current) => ({ ...current, status: value }))}
              options={recordStatusOptions}
              value={tenderDraft.status ?? "ACTIVE"}
            />
            <DialogSelect
              label="Payment gateway"
              onChange={(value) =>
                setTenderDraft((current) => ({
                  ...current,
                  gatewayProvider: value || null,
                  gatewayActive: value ? current.gatewayActive : false
                }))
              }
              options={gatewayProviderOptions}
              value={tenderDraft.gatewayProvider ?? ""}
            />
            <DialogSelect
              label="Gateway mode"
              onChange={(value) =>
                setTenderDraft((current) => ({ ...current, gatewayMode: value || null }))
              }
              options={gatewayModeOptions}
              value={tenderDraft.gatewayMode ?? ""}
            />
            <DialogTextInput
              label="Gateway merchant ID"
              onChange={(value) =>
                setTenderDraft((current) => ({ ...current, gatewayMerchantId: value }))
              }
              placeholder="Merchant/subaccount ID"
              value={tenderDraft.gatewayMerchantId ?? ""}
            />
            <DialogTextInput
              label="Public key"
              onChange={(value) =>
                setTenderDraft((current) => ({ ...current, gatewayPublicKey: value }))
              }
              placeholder="pk_test..."
              value={tenderDraft.gatewayPublicKey ?? ""}
            />
            <DialogTextInput
              label="Callback URL"
              onChange={(value) =>
                setTenderDraft((current) => ({ ...current, gatewayCallbackUrl: value }))
              }
              placeholder="https://..."
              value={tenderDraft.gatewayCallbackUrl ?? ""}
            />
            <DialogCheckbox
              checked={Boolean(tenderDraft.gatewayActive)}
              label="Gateway active"
              onChange={(nextValue) =>
                setTenderDraft((current) => ({ ...current, gatewayActive: nextValue }))
              }
            />
            <div className="md:col-span-2">
              <DialogTextArea
                label="Description"
                onChange={(value) =>
                  setTenderDraft((current) => ({ ...current, description: value }))
                }
                value={tenderDraft.description ?? ""}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {tenderBooleanFields.map(({ field, label }) => (
              <DialogCheckbox
                checked={Boolean(tenderDraft[field])}
                key={field}
                label={label}
                onChange={(nextValue) =>
                  setTenderDraft((current) => ({
                    ...current,
                    [field]: nextValue
                  }))
                }
              />
            ))}
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              disabled={tenderState.status === "submitting"}
              onClick={() => setIsTenderDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#059669,#047857)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(4,120,87,0.22)] transition hover:brightness-[1.03]"
              disabled={
                tenderState.status === "submitting" ||
                !tenderDraft.tenderMethodCode.trim() ||
                !tenderDraft.name.trim()
              }
              onClick={() => void saveTenderMethod()}
              type="button"
            >
              {tenderState.status === "submitting" ? "Saving..." : "Save tender method"}
            </button>
          </div>

          {tenderState.message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                tenderState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {tenderState.message}
            </div>
          ) : null}
        </div>
      </ActionDialog>

      <ActionDialog
        description="Create or update banks before branches and account numbers are linked to them."
        onOpenChange={setIsBankSetupDialogOpen}
        open={isBankSetupDialogOpen}
        title={editingBankCode ? "Edit bank" : "Create bank"}
        hideTrigger
        triggerLabel=""
        widthClassName="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <DialogTextInput
              label="Bank code"
              onChange={(value) => setBankSetupDraft((current) => ({ ...current, bankCode: value }))}
              placeholder="GCB"
              value={bankSetupDraft.bankCode}
            />
            <DialogTextInput
              label="Bank name"
              onChange={(value) => setBankSetupDraft((current) => ({ ...current, name: value }))}
              placeholder="GCB Bank"
              value={bankSetupDraft.name}
            />
            <DialogSelect
              label="Status"
              onChange={(value) => setBankSetupDraft((current) => ({ ...current, status: value }))}
              options={recordStatusOptions}
              value={bankSetupDraft.status ?? "ACTIVE"}
            />
            <DialogTextInput
              label="Description"
              onChange={(value) => setBankSetupDraft((current) => ({ ...current, description: value }))}
              placeholder="Optional"
              value={bankSetupDraft.description ?? ""}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              disabled={bankSetupState.status === "submitting"}
              onClick={() => setIsBankSetupDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800"
              disabled={
                bankSetupState.status === "submitting" ||
                !bankSetupDraft.bankCode.trim() ||
                !bankSetupDraft.name.trim()
              }
              onClick={() => void saveBank()}
              type="button"
            >
              {bankSetupState.status === "submitting" ? "Saving..." : "Save bank"}
            </button>
          </div>
          {bankSetupState.message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                bankSetupState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {bankSetupState.message}
            </div>
          ) : null}
        </div>
      </ActionDialog>

      <ActionDialog
        description="Create or update branches by selecting an existing bank first."
        onOpenChange={setIsBranchDialogOpen}
        open={isBranchDialogOpen}
        title={editingBranchCode ? "Edit branch" : "Create branch"}
        hideTrigger
        triggerLabel=""
        widthClassName="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <DialogSelect
              label="Bank"
              onChange={(value) => setBranchDraft((current) => ({ ...current, bankCode: value }))}
              options={bankSelectOptions}
              value={branchDraft.bankCode}
            />
            <DialogTextInput
              label="Branch code"
              onChange={(value) => setBranchDraft((current) => ({ ...current, branchCode: value }))}
              placeholder="ACCRA-CENTRAL"
              value={branchDraft.branchCode}
            />
            <DialogTextInput
              label="Branch name"
              onChange={(value) => setBranchDraft((current) => ({ ...current, name: value }))}
              placeholder="Accra Central"
              value={branchDraft.name}
            />
            <DialogSelect
              label="Status"
              onChange={(value) => setBranchDraft((current) => ({ ...current, status: value }))}
              options={recordStatusOptions}
              value={branchDraft.status ?? "ACTIVE"}
            />
            <div className="md:col-span-2">
              <DialogTextInput
                label="Branch address"
                onChange={(value) => setBranchDraft((current) => ({ ...current, addressLine1: value }))}
                placeholder="Optional branch address"
                value={branchDraft.addressLine1 ?? ""}
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              disabled={branchState.status === "submitting"}
              onClick={() => setIsBranchDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800"
              disabled={
                branchState.status === "submitting" ||
                !branchDraft.bankCode.trim() ||
                !branchDraft.branchCode.trim() ||
                !branchDraft.name.trim()
              }
              onClick={() => void saveBankBranch()}
              type="button"
            >
              {branchState.status === "submitting" ? "Saving..." : "Save branch"}
            </button>
          </div>
          {branchState.message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                branchState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {branchState.message}
            </div>
          ) : null}
        </div>
      </ActionDialog>

      <ActionDialog
        description="Create or update the bank, branch, and account-number combinations stores can use."
        onOpenChange={setIsBankDialogOpen}
        open={isBankDialogOpen}
        title={editingBankAccountId ? "Edit bank account" : "Create bank account"}
        hideTrigger
        triggerLabel=""
        widthClassName="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <DialogSelect
              label="Branch"
              onChange={(value) => {
                const branch = workspace.bankBranchRows.find((row) => row.branchCode === value);

                setBankDraft((current) => ({
                  ...current,
                  bankCode: branch?.bankCode ?? "",
                  bankName: branch?.bankName ?? "",
                  branchCode: branch?.branchCode ?? "",
                  branchName: branch?.name ?? "",
                  addressLine1: branch?.addressLine1 ?? ""
                }));
              }}
              options={branchSelectOptions}
              value={bankDraft.branchCode}
            />
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
              <span className="block font-semibold text-stone-900">Bank</span>
              {bankDraft.bankName ? `${bankDraft.bankName} (${bankDraft.bankCode})` : "Select branch"}
            </div>
            <DialogTextInput
              label="Account number"
              onChange={(value) =>
                setBankDraft((current) => ({ ...current, accountNumber: value }))
              }
              placeholder="0123456789"
              value={bankDraft.accountNumber}
            />
            <DialogTextInput
              label="Account name"
              onChange={(value) => setBankDraft((current) => ({ ...current, accountName: value }))}
              placeholder="Flash Retail Collections"
              value={bankDraft.accountName}
            />
            <DialogTextInput
              label="Currency"
              onChange={(value) =>
                setBankDraft((current) => ({ ...current, currencyCode: value }))
              }
              placeholder={workspace.currencyCode}
              value={bankDraft.currencyCode ?? workspace.currencyCode}
            />
            <DialogSelect
              label="Status"
              onChange={(value) => setBankDraft((current) => ({ ...current, status: value }))}
              options={recordStatusOptions}
              value={bankDraft.status ?? "ACTIVE"}
            />
            <div className="md:col-span-2">
              <DialogTextInput
                label="Branch address"
                onChange={(value) =>
                  setBankDraft((current) => ({ ...current, addressLine1: value }))
                }
                placeholder="Optional branch address"
                value={bankDraft.addressLine1 ?? ""}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm leading-6 text-indigo-900">
            Flash ERP links one account number to one branch. A bank can have many branches, but each branch can publish only one account number to stores.
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              disabled={bankState.status === "submitting"}
              onClick={() => setIsBankDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#4f46e5,#3730a3)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(55,48,163,0.22)] transition hover:brightness-[1.03]"
              disabled={
                bankState.status === "submitting" ||
                !bankDraft.bankCode.trim() ||
                !bankDraft.bankName.trim() ||
                !bankDraft.branchCode.trim() ||
                !bankDraft.branchName.trim() ||
                !bankDraft.accountNumber.trim() ||
                !bankDraft.accountName.trim()
              }
              onClick={() => void saveBankAccount()}
              type="button"
            >
              {bankState.status === "submitting" ? "Saving..." : "Save bank account"}
            </button>
          </div>

          {bankState.message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                bankState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {bankState.message}
            </div>
          ) : null}
        </div>
      </ActionDialog>

      {shouldShowWorkspaceNotice(workspace.statusMessage) ? (
        <section className="glass-panel rounded-[1.4rem] border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm leading-6 text-amber-900">{workspace.statusMessage}</p>
        </section>
      ) : null}
    </ShellFrame>
  );
}
