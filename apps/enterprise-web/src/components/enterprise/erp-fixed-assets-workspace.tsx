"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  ArrowRightLeft,
  BadgeDollarSign,
  Building2,
  Calculator,
  FileText,
  Landmark,
  ListChecks,
  PackageCheck,
  Plus,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import type {
  CreateErpFixedAssetDepreciationRequest,
  CreateErpFixedAssetDisposalRequest,
  ErpFixedAssetsMutationResponse,
  ErpFixedAssetsWorkspaceData,
  PostErpFixedAssetTransactionRequest,
  TransferErpFixedAssetRequest,
  UpsertErpFixedAssetClassRequest,
  UpsertErpFixedAssetRequest
} from "@/server/repositories/erp-fixed-assets.repository";

type AssetClassRow = ErpFixedAssetsWorkspaceData["assetClassRows"][number];
type AssetRow = ErpFixedAssetsWorkspaceData["assetRows"][number];
type BookRow = ErpFixedAssetsWorkspaceData["bookRows"][number];
type TransactionRow = ErpFixedAssetsWorkspaceData["transactionRows"][number];
type FixedAssetMutationBody =
  | UpsertErpFixedAssetClassRequest
  | UpsertErpFixedAssetRequest
  | CreateErpFixedAssetDepreciationRequest
  | TransferErpFixedAssetRequest
  | CreateErpFixedAssetDisposalRequest
  | PostErpFixedAssetTransactionRequest;

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

function formatEnumLabel(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateOnly(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function MetricCard({
  hint,
  icon: Icon,
  label,
  value
}: {
  hint: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <article className="glass-panel rounded-[1.15rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">{label}</p>
          <p className="mt-2 text-[1.35rem] font-semibold text-stone-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-600">{hint}</p>
    </article>
  );
}

function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "ACTIVE" || value === "POSTED"
      ? "bg-emerald-100 text-emerald-700"
      : value === "DRAFT"
        ? "bg-sky-100 text-sky-700"
        : value === "RETIRED" || value === "INACTIVE"
          ? "bg-amber-100 text-amber-700"
          : "bg-stone-200 text-stone-700";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {formatEnumLabel(value)}
    </span>
  );
}

function DialogTextInput({
  disabled = false,
  label,
  min,
  onChange,
  step,
  type = "text",
  value
}: {
  disabled?: boolean;
  label: string;
  min?: string;
  onChange: (value: string) => void;
  step?: string;
  type?: "date" | "number" | "text";
  value: string | number | null | undefined;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <input
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)] disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
        disabled={disabled}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        step={step}
        type={type}
        value={value ?? ""}
      />
    </label>
  );
}

function DialogTextArea({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  value: string | null | undefined;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <textarea
        className="min-h-24 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
        onChange={(event) => onChange(event.target.value)}
        value={value ?? ""}
      />
    </label>
  );
}

function DialogSelect({
  disabled = false,
  label,
  onChange,
  options,
  value
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string | null | undefined;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <select
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)] disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value ?? ""}
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

function MutationMessage({ state }: { state: MutationState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
        state.status === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {state.message}
    </div>
  );
}

function emptyClassDraft(): UpsertErpFixedAssetClassRequest {
  return {
    code: "",
    name: "",
    description: "",
    assetType: "TANGIBLE",
    depreciationMethod: "STRAIGHT_LINE",
    defaultUsefulLifeMonths: 60,
    defaultResidualValue: 0,
    acquisitionAccountCode: "1500",
    accumulatedDepreciationAccountCode: "1590",
    depreciationExpenseAccountCode: "6100",
    gainOnDisposalAccountCode: "7010",
    lossOnDisposalAccountCode: "8010",
    status: "ACTIVE"
  };
}

function classDraftFromRow(row: AssetClassRow): UpsertErpFixedAssetClassRequest {
  return {
    fixedAssetClassId: row.fixedAssetClassId,
    code: row.code,
    name: row.name,
    description: row.description ?? "",
    assetType: row.assetType,
    depreciationMethod: row.depreciationMethod,
    defaultUsefulLifeMonths: row.defaultUsefulLifeMonths,
    defaultResidualValue: row.defaultResidualValue,
    acquisitionAccountCode: row.acquisitionAccountCode,
    accumulatedDepreciationAccountCode: row.accumulatedDepreciationAccountCode,
    depreciationExpenseAccountCode: row.depreciationExpenseAccountCode,
    gainOnDisposalAccountCode: row.gainOnDisposalAccountCode,
    lossOnDisposalAccountCode: row.lossOnDisposalAccountCode,
    status: row.status
  };
}

function emptyAssetDraft(workspace: ErpFixedAssetsWorkspaceData): UpsertErpFixedAssetRequest {
  const assetClass = workspace.assetClassRows[0];

  return {
    assetClassCode: assetClass?.code ?? "",
    name: "",
    description: "",
    serialNo: "",
    modelNo: "",
    manufacturer: "",
    locationCode: "",
    custodianName: "",
    acquisitionDate: workspace.defaultAcquisitionDate || today(),
    inServiceDate: "",
    depreciationStartDate: "",
    currencyCode: workspace.currencyCode,
    acquisitionCost: "",
    residualValue: assetClass?.defaultResidualValue ?? 0,
    accumulatedDepreciation: 0,
    usefulLifeMonths: assetClass?.defaultUsefulLifeMonths ?? 60,
    depreciationMethod: assetClass?.depreciationMethod ?? "STRAIGHT_LINE",
    status: "ACTIVE"
  };
}

function assetDraftFromRow(row: AssetRow): UpsertErpFixedAssetRequest {
  return {
    fixedAssetId: row.fixedAssetId,
    assetClassCode: row.assetClassCode,
    name: row.name,
    description: row.description ?? "",
    serialNo: row.serialNo ?? "",
    modelNo: row.modelNo ?? "",
    manufacturer: row.manufacturer ?? "",
    locationCode: row.locationCode ?? "",
    custodianName: row.custodianName ?? "",
    acquisitionDate: dateOnly(row.acquisitionDate),
    inServiceDate: dateOnly(row.inServiceDate),
    depreciationStartDate: dateOnly(row.depreciationStartDate),
    currencyCode: row.currencyCode,
    acquisitionCost: row.acquisitionCost,
    residualValue: row.residualValue,
    accumulatedDepreciation: row.accumulatedDepreciation,
    usefulLifeMonths: row.usefulLifeMonths,
    depreciationMethod: row.depreciationMethod,
    status: row.status
  };
}

function firstActiveAsset(workspace: ErpFixedAssetsWorkspaceData) {
  return workspace.assetRows.find((asset) => asset.status === "ACTIVE") ?? workspace.assetRows[0];
}

function emptyDepreciationDraft(
  workspace: ErpFixedAssetsWorkspaceData,
  row?: AssetRow
): CreateErpFixedAssetDepreciationRequest {
  const asset = row ?? firstActiveAsset(workspace);

  return {
    fixedAssetId: asset?.fixedAssetId ?? "",
    bookCode: "COMPANY",
    postingDate: today(),
    amount: "",
    memo: ""
  };
}

function emptyTransferDraft(
  workspace: ErpFixedAssetsWorkspaceData,
  row?: AssetRow
): TransferErpFixedAssetRequest {
  const asset = row ?? firstActiveAsset(workspace);

  return {
    fixedAssetId: asset?.fixedAssetId ?? "",
    transferDate: today(),
    toLocationCode: asset?.locationCode ?? "",
    toCustodianName: asset?.custodianName ?? "",
    memo: ""
  };
}

function emptyDisposalDraft(
  workspace: ErpFixedAssetsWorkspaceData,
  row?: AssetRow
): CreateErpFixedAssetDisposalRequest {
  const asset = row ?? firstActiveAsset(workspace);
  const proceedsAccount =
    workspace.accountOptions.find((account) => account.accountCode === "1000") ??
    workspace.accountOptions.find((account) => account.accountType === "ASSET") ??
    workspace.accountOptions[0];

  return {
    fixedAssetId: asset?.fixedAssetId ?? "",
    bookCode: "COMPANY",
    postingDate: today(),
    proceedsAmount: 0,
    proceedsAccountCode: proceedsAccount?.accountCode ?? "1000",
    memo: ""
  };
}

const classFilter: FilterFn<AssetClassRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return (
    !query ||
    [
      row.original.code,
      row.original.name,
      row.original.assetType,
      row.original.depreciationMethod,
      row.original.acquisitionAccountCode,
      row.original.status
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
};

const assetFilter: FilterFn<AssetRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return (
    !query ||
    [
      row.original.assetNo,
      row.original.name,
      row.original.assetClassCode,
      row.original.serialNo ?? "",
      row.original.locationCode ?? "",
      row.original.custodianName ?? "",
      row.original.status
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
};

const bookFilter: FilterFn<BookRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return (
    !query ||
    [row.original.assetNo, row.original.assetName, row.original.bookCode, row.original.status]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
};

const transactionFilter: FilterFn<TransactionRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return (
    !query ||
    [
      row.original.transactionNo,
      row.original.assetNo,
      row.original.assetName,
      row.original.transactionType,
      row.original.sourceReference ?? "",
      row.original.journalNo ?? "",
      row.original.status
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
};

export function ErpFixedAssetsWorkspace({
  workspace
}: {
  workspace: ErpFixedAssetsWorkspaceData;
}) {
  const router = useRouter();
  const [isClassOpen, setIsClassOpen] = useState(false);
  const [isAssetOpen, setIsAssetOpen] = useState(false);
  const [isDepreciationOpen, setIsDepreciationOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isDisposalOpen, setIsDisposalOpen] = useState(false);
  const [classDraft, setClassDraft] = useState<UpsertErpFixedAssetClassRequest>(() =>
    emptyClassDraft()
  );
  const [assetDraft, setAssetDraft] = useState<UpsertErpFixedAssetRequest>(() =>
    emptyAssetDraft(workspace)
  );
  const [depreciationDraft, setDepreciationDraft] =
    useState<CreateErpFixedAssetDepreciationRequest>(() => emptyDepreciationDraft(workspace));
  const [transferDraft, setTransferDraft] = useState<TransferErpFixedAssetRequest>(() =>
    emptyTransferDraft(workspace)
  );
  const [disposalDraft, setDisposalDraft] = useState<CreateErpFixedAssetDisposalRequest>(() =>
    emptyDisposalDraft(workspace)
  );
  const [mutationState, setMutationState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: workspace.currencyCode
      }),
    [workspace.currencyCode]
  );
  const accountOptions = useMemo(
    () =>
      workspace.accountOptions.map((account) => ({
        value: account.accountCode,
        label: account.label
      })),
    [workspace.accountOptions]
  );
  const assetOptions = useMemo(
    () =>
      workspace.assetRows
        .filter((asset) => asset.status === "ACTIVE")
        .map((asset) => ({
          value: asset.fixedAssetId,
          label: `${asset.assetNo} - ${asset.name}`
        })),
    [workspace.assetRows]
  );
  const bookOptions = useMemo(() => {
    const codes = Array.from(new Set(workspace.bookRows.map((book) => book.bookCode)));

    return (codes.length > 0 ? codes : ["COMPANY"]).map((bookCode) => ({
      value: bookCode,
      label: bookCode
    }));
  }, [workspace.bookRows]);
  const assetClassOptions = useMemo(
    () =>
      workspace.assetClassRows
        .filter((assetClass) => assetClass.status === "ACTIVE")
        .map((assetClass) => ({
          value: assetClass.code,
          label: `${assetClass.code} - ${assetClass.name}`
        })),
    [workspace.assetClassRows]
  );
  const methodOptions = [
    { value: "STRAIGHT_LINE", label: "Straight line" },
    { value: "NO_DEPRECIATION", label: "No depreciation" }
  ];
  const classStatusOptions = [
    { value: "ACTIVE", label: "Active" },
    { value: "INACTIVE", label: "Inactive" }
  ];
  const assetStatusOptions = [
    { value: "ACTIVE", label: "Active" },
    { value: "DRAFT", label: "Draft" },
    { value: "INACTIVE", label: "Inactive" },
    { value: "RETIRED", label: "Retired" }
  ];
  const classColumns = useMemo<ColumnDef<AssetClassRow>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Class",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.code}</p>
            <p className="truncate text-xs text-stone-500">{row.original.name}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "assetType",
        header: "Type",
        cell: ({ row }) => formatEnumLabel(row.original.assetType)
      },
      {
        accessorKey: "defaultUsefulLifeMonths",
        header: "Life",
        cell: ({ row }) => `${numberFormatter.format(row.original.defaultUsefulLifeMonths)} mo`
      },
      {
        accessorKey: "acquisitionAccountCode",
        header: "Asset"
      },
      {
        accessorKey: "accumulatedDepreciationAccountCode",
        header: "Accum."
      },
      {
        accessorKey: "depreciationExpenseAccountCode",
        header: "Expense"
      },
      {
        accessorKey: "assetCount",
        header: "Assets",
        cell: ({ row }) => numberFormatter.format(row.original.assetCount)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit",
                onSelect: () => {
                  setClassDraft(classDraftFromRow(row.original));
                  setMutationState({ status: "idle", message: "" });
                  setIsClassOpen(true);
                }
              }
            ]}
          />
        )
      }
    ],
    []
  );
  const assetColumns = useMemo<ColumnDef<AssetRow>[]>(
    () => [
      {
        accessorKey: "assetNo",
        header: "Asset",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.assetNo}</p>
            <p className="truncate text-xs text-stone-500">{row.original.name}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "assetClassCode",
        header: "Class"
      },
      {
        accessorKey: "acquisitionDate",
        header: "Acquired",
        cell: ({ row }) => formatDate(row.original.acquisitionDate)
      },
      {
        accessorKey: "acquisitionCost",
        header: "Cost",
        cell: ({ row }) => currencyFormatter.format(row.original.acquisitionCost)
      },
      {
        accessorKey: "netBookValue",
        header: "NBV",
        cell: ({ row }) => currencyFormatter.format(row.original.netBookValue)
      },
      {
        accessorKey: "locationCode",
        header: "Location",
        cell: ({ row }) => row.original.locationCode ?? "Not set"
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit",
                onSelect: () => {
                  setAssetDraft(assetDraftFromRow(row.original));
                  setMutationState({ status: "idle", message: "" });
                  setIsAssetOpen(true);
                }
              },
              {
                label: "Depreciate",
                onSelect: () => {
                  setDepreciationDraft(emptyDepreciationDraft(workspace, row.original));
                  setMutationState({ status: "idle", message: "" });
                  setIsDepreciationOpen(true);
                }
              },
              {
                label: "Transfer",
                onSelect: () => {
                  setTransferDraft(emptyTransferDraft(workspace, row.original));
                  setMutationState({ status: "idle", message: "" });
                  setIsTransferOpen(true);
                }
              },
              {
                label: "Dispose",
                onSelect: () => {
                  setDisposalDraft(emptyDisposalDraft(workspace, row.original));
                  setMutationState({ status: "idle", message: "" });
                  setIsDisposalOpen(true);
                }
              }
            ]}
          />
        )
      }
    ],
    [currencyFormatter]
  );
  const bookColumns = useMemo<ColumnDef<BookRow>[]>(
    () => [
      {
        accessorKey: "assetNo",
        header: "Asset",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.assetNo}</p>
            <p className="truncate text-xs text-stone-500">{row.original.assetName}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "bookCode",
        header: "Book"
      },
      {
        accessorKey: "depreciationMethod",
        header: "Method",
        cell: ({ row }) => formatEnumLabel(row.original.depreciationMethod)
      },
      {
        accessorKey: "usefulLifeMonths",
        header: "Life",
        cell: ({ row }) => `${numberFormatter.format(row.original.usefulLifeMonths)} mo`
      },
      {
        accessorKey: "accumulatedDepreciation",
        header: "Accum.",
        cell: ({ row }) => currencyFormatter.format(row.original.accumulatedDepreciation)
      },
      {
        accessorKey: "netBookValue",
        header: "NBV",
        cell: ({ row }) => currencyFormatter.format(row.original.netBookValue)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      }
    ],
    [currencyFormatter]
  );
  const transactionColumns = useMemo<ColumnDef<TransactionRow>[]>(
    () => [
      {
        accessorKey: "transactionNo",
        header: "Transaction",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.transactionNo}</p>
            <p className="truncate text-xs text-stone-500">{formatEnumLabel(row.original.transactionType)}</p>
            <p className="truncate text-xs text-stone-400">{row.original.bookCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "assetNo",
        header: "Asset"
      },
      {
        accessorKey: "transactionDate",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.transactionDate)
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => currencyFormatter.format(row.original.amount)
      },
      {
        id: "detail",
        header: "Detail",
        cell: ({ row }) => {
          if (row.original.transactionType === "TRANSFER") {
            return `${row.original.fromLocationCode ?? "Unassigned"} -> ${
              row.original.toLocationCode ?? "Unassigned"
            }`;
          }

          if (row.original.transactionType === "DISPOSAL") {
            return (
              <div className="min-w-0">
                <p className="truncate">Proceeds {currencyFormatter.format(row.original.proceedsAmount)}</p>
                <p className="truncate text-xs text-stone-500">
                  Gain/loss {currencyFormatter.format(row.original.gainLossAmount)}
                </p>
              </div>
            );
          }

          if (row.original.transactionType === "DEPRECIATION") {
            return `Accum. ${currencyFormatter.format(row.original.accumulatedDepreciationAmount)}`;
          }

          return row.original.sourceReference ?? "Not set";
        }
      },
      {
        accessorKey: "journalNo",
        header: "Journal",
        cell: ({ row }) =>
          row.original.journalEntryId ? (
            <Link
              className="font-semibold text-[var(--brand)] transition hover:text-[var(--brand-deep)]"
              href={`/finance/journal-inquiry/${row.original.journalEntryId}`}
            >
              {row.original.journalNo ?? "Open"}
            </Link>
          ) : (
            "Not posted"
          )
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.status === "DRAFT" &&
          ["DEPRECIATION", "DISPOSAL"].includes(row.original.transactionType) ? (
            <GridRowActions
              actions={[
                {
                  label: "Post",
                  onSelect: () =>
                    submitMutation(
                      "/api/finance/fixed-assets/transactions/post",
                      {
                        fixedAssetTransactionId: row.original.fixedAssetTransactionId
                      },
                      "Flash ERP could not post the fixed asset transaction.",
                      () => undefined
                    )
                }
              ]}
            />
          ) : null
      }
    ],
    [currencyFormatter]
  );

  function updateClassDraft(next: Partial<UpsertErpFixedAssetClassRequest>) {
    setClassDraft((current) => ({
      ...current,
      ...next
    }));
  }

  function updateAssetDraft(next: Partial<UpsertErpFixedAssetRequest>) {
    setAssetDraft((current) => ({
      ...current,
      ...next
    }));
  }

  function updateDepreciationDraft(next: Partial<CreateErpFixedAssetDepreciationRequest>) {
    setDepreciationDraft((current) => ({
      ...current,
      ...next
    }));
  }

  function updateTransferDraft(next: Partial<TransferErpFixedAssetRequest>) {
    setTransferDraft((current) => ({
      ...current,
      ...next
    }));
  }

  function updateDisposalDraft(next: Partial<CreateErpFixedAssetDisposalRequest>) {
    setDisposalDraft((current) => ({
      ...current,
      ...next
    }));
  }

  function applyAssetClassDefaults(assetClassCode: string) {
    const assetClass = workspace.assetClassRows.find((row) => row.code === assetClassCode);

    updateAssetDraft({
      assetClassCode,
      residualValue: assetClass?.defaultResidualValue ?? assetDraft.residualValue,
      usefulLifeMonths: assetClass?.defaultUsefulLifeMonths ?? assetDraft.usefulLifeMonths,
      depreciationMethod: assetClass?.depreciationMethod ?? assetDraft.depreciationMethod
    });
  }

  async function submitMutation(
    url: string,
    body: FixedAssetMutationBody,
    fallbackMessage: string,
    onSuccess: () => void
  ) {
    setMutationState({ status: "submitting", message: "" });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const payload = (await response.json()) as Partial<ErpFixedAssetsMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? fallbackMessage);
      }

      setMutationState({
        status: "success",
        message: payload.message ?? fallbackMessage
      });
      onSuccess();
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message: error instanceof Error ? error.message : fallbackMessage
      });
    }
  }

  return (
    <EnterpriseShell
      activeSection="finance"
      description="Maintain asset classes, registers, depreciation books, transfers, and disposal posting proposals."
      eyebrow="Flash ERP Finance"
      heading="Fixed assets"
    >
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            hint="Active asset classes with GL control setup."
            icon={Building2}
            label="Classes"
            value={numberFormatter.format(workspace.metrics.assetClasses)}
          />
          <MetricCard
            hint="Active assets in the company register."
            icon={PackageCheck}
            label="Assets"
            value={numberFormatter.format(workspace.metrics.activeAssets)}
          />
          <MetricCard
            hint="Gross acquisition cost in the register."
            icon={Landmark}
            label="Cost"
            value={currencyFormatter.format(workspace.metrics.acquisitionCost)}
          />
          <MetricCard
            hint="Book value after captured depreciation."
            icon={FileText}
            label="Net book"
            value={currencyFormatter.format(workspace.metrics.netBookValue)}
          />
        </div>

        <MutationMessage state={mutationState} />

        <SharedDataGrid
          columns={classColumns}
          data={workspace.assetClassRows}
          emptyLabel="No fixed asset classes have been configured yet."
          exportFileName="flash-erp-fixed-asset-classes"
          globalFilterFn={classFilter}
          initialPageSize={10}
          searchPlaceholder="Search asset classes"
          toolbarActions={
            <>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-[var(--brand)] hover:text-stone-950"
                onClick={() => {
                  setClassDraft(emptyClassDraft());
                  setMutationState({ status: "idle", message: "" });
                  setIsClassOpen(true);
                }}
                type="button"
              >
                <Plus className="h-4 w-4" />
                New Class
              </button>
              <ActionDialog
                description="Maintain asset class defaults and GL control accounts."
                hideTrigger
                open={isClassOpen}
                onOpenChange={(open) => {
                  setIsClassOpen(open);
                  setMutationState({ status: "idle", message: "" });
                }}
                title="Fixed asset class"
                triggerLabel="Fixed Asset Class"
                widthClassName="max-w-5xl"
              >
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <DialogTextInput
                      disabled={Boolean(classDraft.fixedAssetClassId)}
                      label="Code"
                      onChange={(value) => updateClassDraft({ code: value })}
                      value={classDraft.code}
                    />
                    <DialogTextInput
                      label="Name"
                      onChange={(value) => updateClassDraft({ name: value })}
                      value={classDraft.name}
                    />
                    <DialogTextInput
                      label="Asset type"
                      onChange={(value) => updateClassDraft({ assetType: value })}
                      value={classDraft.assetType}
                    />
                    <DialogSelect
                      label="Depreciation method"
                      onChange={(value) => updateClassDraft({ depreciationMethod: value })}
                      options={methodOptions}
                      value={classDraft.depreciationMethod}
                    />
                    <DialogTextInput
                      label="Default useful life"
                      min="1"
                      onChange={(value) => updateClassDraft({ defaultUsefulLifeMonths: value })}
                      type="number"
                      value={classDraft.defaultUsefulLifeMonths}
                    />
                    <DialogTextInput
                      label="Default residual value"
                      min="0"
                      onChange={(value) => updateClassDraft({ defaultResidualValue: value })}
                      step="0.01"
                      type="number"
                      value={classDraft.defaultResidualValue}
                    />
                    <DialogSelect
                      label="Acquisition account"
                      onChange={(value) => updateClassDraft({ acquisitionAccountCode: value })}
                      options={accountOptions}
                      value={classDraft.acquisitionAccountCode}
                    />
                    <DialogSelect
                      label="Accumulated depreciation"
                      onChange={(value) =>
                        updateClassDraft({ accumulatedDepreciationAccountCode: value })
                      }
                      options={accountOptions}
                      value={classDraft.accumulatedDepreciationAccountCode}
                    />
                    <DialogSelect
                      label="Depreciation expense"
                      onChange={(value) =>
                        updateClassDraft({ depreciationExpenseAccountCode: value })
                      }
                      options={accountOptions}
                      value={classDraft.depreciationExpenseAccountCode}
                    />
                    <DialogSelect
                      label="Gain account"
                      onChange={(value) => updateClassDraft({ gainOnDisposalAccountCode: value })}
                      options={accountOptions}
                      value={classDraft.gainOnDisposalAccountCode}
                    />
                    <DialogSelect
                      label="Loss account"
                      onChange={(value) => updateClassDraft({ lossOnDisposalAccountCode: value })}
                      options={accountOptions}
                      value={classDraft.lossOnDisposalAccountCode}
                    />
                    <DialogSelect
                      label="Status"
                      onChange={(value) => updateClassDraft({ status: value })}
                      options={classStatusOptions}
                      value={classDraft.status}
                    />
                  </div>
                  <DialogTextArea
                    label="Description"
                    onChange={(value) => updateClassDraft({ description: value })}
                    value={classDraft.description}
                  />
                  <div className="flex flex-wrap justify-end gap-3">
                    <button
                      className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                      onClick={() => setIsClassOpen(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={mutationState.status === "submitting"}
                      onClick={() =>
                        submitMutation(
                          "/api/finance/fixed-assets/classes",
                          classDraft,
                          "Flash ERP could not save the fixed asset class.",
                          () => setIsClassOpen(false)
                        )
                      }
                      type="button"
                    >
                      <ListChecks className="h-4 w-4" />
                      Save Class
                    </button>
                  </div>
                </div>
              </ActionDialog>
              <ActionDialog
                description="Create a reviewable depreciation proposal from the asset book."
                hideTrigger
                open={isDepreciationOpen}
                onOpenChange={(open) => {
                  setIsDepreciationOpen(open);
                  setMutationState({ status: "idle", message: "" });
                }}
                title="Depreciation proposal"
                triggerLabel="Depreciation Proposal"
                widthClassName="max-w-4xl"
              >
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    <DialogSelect
                      label="Asset"
                      onChange={(value) => updateDepreciationDraft({ fixedAssetId: value })}
                      options={assetOptions}
                      value={depreciationDraft.fixedAssetId}
                    />
                    <DialogSelect
                      label="Book"
                      onChange={(value) => updateDepreciationDraft({ bookCode: value })}
                      options={bookOptions}
                      value={depreciationDraft.bookCode}
                    />
                    <DialogTextInput
                      label="Depreciation date"
                      onChange={(value) => updateDepreciationDraft({ postingDate: value })}
                      type="date"
                      value={depreciationDraft.postingDate}
                    />
                    <DialogTextInput
                      label="Amount override"
                      min="0"
                      onChange={(value) => updateDepreciationDraft({ amount: value })}
                      step="0.01"
                      type="number"
                      value={depreciationDraft.amount}
                    />
                  </div>
                  <DialogTextArea
                    label="Memo"
                    onChange={(value) => updateDepreciationDraft({ memo: value })}
                    value={depreciationDraft.memo}
                  />
                  <div className="flex flex-wrap justify-end gap-3">
                    <button
                      className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                      onClick={() => setIsDepreciationOpen(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={mutationState.status === "submitting"}
                      onClick={() =>
                        submitMutation(
                          "/api/finance/fixed-assets/depreciation",
                          depreciationDraft,
                          "Flash ERP could not prepare the depreciation proposal.",
                          () => setIsDepreciationOpen(false)
                        )
                      }
                      type="button"
                    >
                      <Calculator className="h-4 w-4" />
                      Prepare Proposal
                    </button>
                  </div>
                </div>
              </ActionDialog>
              <ActionDialog
                description="Record a location or custodian transfer without creating GL entries."
                hideTrigger
                open={isTransferOpen}
                onOpenChange={(open) => {
                  setIsTransferOpen(open);
                  setMutationState({ status: "idle", message: "" });
                }}
                title="Asset transfer"
                triggerLabel="Asset Transfer"
                widthClassName="max-w-4xl"
              >
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    <DialogSelect
                      label="Asset"
                      onChange={(value) => updateTransferDraft({ fixedAssetId: value })}
                      options={assetOptions}
                      value={transferDraft.fixedAssetId}
                    />
                    <DialogTextInput
                      label="Transfer date"
                      onChange={(value) => updateTransferDraft({ transferDate: value })}
                      type="date"
                      value={transferDraft.transferDate}
                    />
                    <DialogTextInput
                      label="New location"
                      onChange={(value) => updateTransferDraft({ toLocationCode: value })}
                      value={transferDraft.toLocationCode}
                    />
                    <DialogTextInput
                      label="New custodian"
                      onChange={(value) => updateTransferDraft({ toCustodianName: value })}
                      value={transferDraft.toCustodianName}
                    />
                  </div>
                  <DialogTextArea
                    label="Memo"
                    onChange={(value) => updateTransferDraft({ memo: value })}
                    value={transferDraft.memo}
                  />
                  <div className="flex flex-wrap justify-end gap-3">
                    <button
                      className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                      onClick={() => setIsTransferOpen(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={mutationState.status === "submitting"}
                      onClick={() =>
                        submitMutation(
                          "/api/finance/fixed-assets/transfers",
                          transferDraft,
                          "Flash ERP could not record the fixed asset transfer.",
                          () => setIsTransferOpen(false)
                        )
                      }
                      type="button"
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                      Record Transfer
                    </button>
                  </div>
                </div>
              </ActionDialog>
              <ActionDialog
                description="Prepare a disposal proposal with proceeds and gain/loss accounting."
                hideTrigger
                open={isDisposalOpen}
                onOpenChange={(open) => {
                  setIsDisposalOpen(open);
                  setMutationState({ status: "idle", message: "" });
                }}
                title="Disposal proposal"
                triggerLabel="Disposal Proposal"
                widthClassName="max-w-4xl"
              >
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    <DialogSelect
                      label="Asset"
                      onChange={(value) => updateDisposalDraft({ fixedAssetId: value })}
                      options={assetOptions}
                      value={disposalDraft.fixedAssetId}
                    />
                    <DialogSelect
                      label="Book"
                      onChange={(value) => updateDisposalDraft({ bookCode: value })}
                      options={bookOptions}
                      value={disposalDraft.bookCode}
                    />
                    <DialogTextInput
                      label="Disposal date"
                      onChange={(value) => updateDisposalDraft({ postingDate: value })}
                      type="date"
                      value={disposalDraft.postingDate}
                    />
                    <DialogTextInput
                      label="Proceeds"
                      min="0"
                      onChange={(value) => updateDisposalDraft({ proceedsAmount: value })}
                      step="0.01"
                      type="number"
                      value={disposalDraft.proceedsAmount}
                    />
                    <DialogSelect
                      label="Proceeds account"
                      onChange={(value) => updateDisposalDraft({ proceedsAccountCode: value })}
                      options={accountOptions}
                      value={disposalDraft.proceedsAccountCode}
                    />
                  </div>
                  <DialogTextArea
                    label="Memo"
                    onChange={(value) => updateDisposalDraft({ memo: value })}
                    value={disposalDraft.memo}
                  />
                  <div className="flex flex-wrap justify-end gap-3">
                    <button
                      className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                      onClick={() => setIsDisposalOpen(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={mutationState.status === "submitting"}
                      onClick={() =>
                        submitMutation(
                          "/api/finance/fixed-assets/disposals",
                          disposalDraft,
                          "Flash ERP could not prepare the disposal proposal.",
                          () => setIsDisposalOpen(false)
                        )
                      }
                      type="button"
                    >
                      <BadgeDollarSign className="h-4 w-4" />
                      Prepare Disposal
                    </button>
                  </div>
                </div>
              </ActionDialog>
            </>
          }
        />

        <SharedDataGrid
          columns={assetColumns}
          data={workspace.assetRows}
          emptyLabel="No fixed assets have been registered yet."
          exportFileName="flash-erp-fixed-assets"
          globalFilterFn={assetFilter}
          initialPageSize={20}
          searchPlaceholder="Search assets"
          toolbarActions={
            <>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-[var(--brand)] hover:text-stone-950"
                onClick={() => {
                  setAssetDraft(emptyAssetDraft(workspace));
                  setMutationState({ status: "idle", message: "" });
                  setIsAssetOpen(true);
                }}
                type="button"
              >
                <Plus className="h-4 w-4" />
                New Asset
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-[var(--brand)] hover:text-stone-950"
                onClick={() => {
                  setDepreciationDraft(emptyDepreciationDraft(workspace));
                  setMutationState({ status: "idle", message: "" });
                  setIsDepreciationOpen(true);
                }}
                type="button"
              >
                <Calculator className="h-4 w-4" />
                Depreciation
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-[var(--brand)] hover:text-stone-950"
                onClick={() => {
                  setTransferDraft(emptyTransferDraft(workspace));
                  setMutationState({ status: "idle", message: "" });
                  setIsTransferOpen(true);
                }}
                type="button"
              >
                <ArrowRightLeft className="h-4 w-4" />
                Transfer
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-[var(--brand)] hover:text-stone-950"
                onClick={() => {
                  setDisposalDraft(emptyDisposalDraft(workspace));
                  setMutationState({ status: "idle", message: "" });
                  setIsDisposalOpen(true);
                }}
                type="button"
              >
                <BadgeDollarSign className="h-4 w-4" />
                Disposal
              </button>
              <ActionDialog
                description="Register asset master data and create the initial company book."
                hideTrigger
                open={isAssetOpen}
                onOpenChange={(open) => {
                  setIsAssetOpen(open);
                  setMutationState({ status: "idle", message: "" });
                }}
                title="Fixed asset"
                triggerLabel="Fixed Asset"
                widthClassName="max-w-6xl"
              >
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <DialogSelect
                      label="Asset class"
                      onChange={applyAssetClassDefaults}
                      options={assetClassOptions}
                      value={assetDraft.assetClassCode}
                    />
                    <DialogTextInput
                      label="Asset name"
                      onChange={(value) => updateAssetDraft({ name: value })}
                      value={assetDraft.name}
                    />
                    <DialogTextInput
                      label="Acquisition date"
                      onChange={(value) => updateAssetDraft({ acquisitionDate: value })}
                      type="date"
                      value={assetDraft.acquisitionDate}
                    />
                    <DialogTextInput
                      label="In-service date"
                      onChange={(value) => updateAssetDraft({ inServiceDate: value })}
                      type="date"
                      value={assetDraft.inServiceDate}
                    />
                    <DialogTextInput
                      label="Depreciation start"
                      onChange={(value) => updateAssetDraft({ depreciationStartDate: value })}
                      type="date"
                      value={assetDraft.depreciationStartDate}
                    />
                    <DialogTextInput
                      label="Currency"
                      onChange={(value) => updateAssetDraft({ currencyCode: value })}
                      value={assetDraft.currencyCode}
                    />
                    <DialogTextInput
                      label="Acquisition cost"
                      min="0"
                      onChange={(value) => updateAssetDraft({ acquisitionCost: value })}
                      step="0.01"
                      type="number"
                      value={assetDraft.acquisitionCost}
                    />
                    <DialogTextInput
                      label="Residual value"
                      min="0"
                      onChange={(value) => updateAssetDraft({ residualValue: value })}
                      step="0.01"
                      type="number"
                      value={assetDraft.residualValue}
                    />
                    <DialogTextInput
                      label="Accumulated depreciation"
                      min="0"
                      onChange={(value) => updateAssetDraft({ accumulatedDepreciation: value })}
                      step="0.01"
                      type="number"
                      value={assetDraft.accumulatedDepreciation}
                    />
                    <DialogTextInput
                      label="Useful life"
                      min="1"
                      onChange={(value) => updateAssetDraft({ usefulLifeMonths: value })}
                      type="number"
                      value={assetDraft.usefulLifeMonths}
                    />
                    <DialogSelect
                      label="Depreciation method"
                      onChange={(value) => updateAssetDraft({ depreciationMethod: value })}
                      options={methodOptions}
                      value={assetDraft.depreciationMethod}
                    />
                    <DialogSelect
                      label="Status"
                      onChange={(value) => updateAssetDraft({ status: value })}
                      options={assetStatusOptions}
                      value={assetDraft.status}
                    />
                    <DialogTextInput
                      label="Serial no"
                      onChange={(value) => updateAssetDraft({ serialNo: value })}
                      value={assetDraft.serialNo}
                    />
                    <DialogTextInput
                      label="Model no"
                      onChange={(value) => updateAssetDraft({ modelNo: value })}
                      value={assetDraft.modelNo}
                    />
                    <DialogTextInput
                      label="Manufacturer"
                      onChange={(value) => updateAssetDraft({ manufacturer: value })}
                      value={assetDraft.manufacturer}
                    />
                    <DialogTextInput
                      label="Location"
                      onChange={(value) => updateAssetDraft({ locationCode: value })}
                      value={assetDraft.locationCode}
                    />
                    <DialogTextInput
                      label="Custodian"
                      onChange={(value) => updateAssetDraft({ custodianName: value })}
                      value={assetDraft.custodianName}
                    />
                  </div>
                  <DialogTextArea
                    label="Description"
                    onChange={(value) => updateAssetDraft({ description: value })}
                    value={assetDraft.description}
                  />
                  <div className="flex flex-wrap justify-end gap-3">
                    <button
                      className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                      onClick={() => setIsAssetOpen(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={mutationState.status === "submitting"}
                      onClick={() =>
                        submitMutation(
                          "/api/finance/fixed-assets/assets",
                          assetDraft,
                          "Flash ERP could not save the fixed asset.",
                          () => setIsAssetOpen(false)
                        )
                      }
                      type="button"
                    >
                      <PackageCheck className="h-4 w-4" />
                      Save Asset
                    </button>
                  </div>
                </div>
              </ActionDialog>
            </>
          }
        />

        <SharedDataGrid
          columns={bookColumns}
          data={workspace.bookRows}
          emptyLabel="No depreciation books have been created yet."
          exportFileName="flash-erp-fixed-asset-books"
          globalFilterFn={bookFilter}
          initialPageSize={20}
          searchPlaceholder="Search books"
        />

        <SharedDataGrid
          columns={transactionColumns}
          data={workspace.transactionRows}
          emptyLabel="No fixed asset posting contracts have been created yet."
          exportFileName="flash-erp-fixed-asset-transactions"
          globalFilterFn={transactionFilter}
          initialPageSize={20}
          searchPlaceholder="Search transactions"
        />
      </div>
    </EnterpriseShell>
  );
}
