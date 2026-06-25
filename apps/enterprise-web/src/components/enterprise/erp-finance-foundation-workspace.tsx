"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  Building2,
  CalendarDays,
  Hash,
  Landmark,
  ListPlus,
  Plus,
  Save,
  UsersRound,
  Warehouse,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type {
  ErpFinanceFoundationMutationResponse,
  ErpFinanceFoundationWorkspaceData,
  PostManualJournalBatchRequest,
  UpdateErpAccountingSettingsRequest,
  UpdateErpDocumentSequenceRequest,
  UpsertErpArApPostingProfileRequest,
  UpsertErpCurrencyRequest,
  UpsertErpGlAccountRequest,
  UpsertErpPartyAccountingProfileRequest
} from "@/server/repositories/erp-finance-foundation.repository";

type CompanyRow = ErpFinanceFoundationWorkspaceData["companyRows"][number];
type CurrencyRow = ErpFinanceFoundationWorkspaceData["currencyRows"][number];
type FiscalPeriodRow = ErpFinanceFoundationWorkspaceData["fiscalPeriodRows"][number];
type AccountRow = ErpFinanceFoundationWorkspaceData["accountRows"][number];
type ArApPostingProfileRow = ErpFinanceFoundationWorkspaceData["arApPostingProfileRows"][number];
type PartyAccountingProfileRow = ErpFinanceFoundationWorkspaceData["partyAccountingProfileRows"][number];
type DocumentSequenceRow = ErpFinanceFoundationWorkspaceData["documentSequenceRows"][number];
type JournalBatchRow = ErpFinanceFoundationWorkspaceData["journalBatchRows"][number];
type JournalRow = ErpFinanceFoundationWorkspaceData["journalRows"][number];
type ProductProfileRow = ErpFinanceFoundationWorkspaceData["productProfileRows"][number];
type OperatingSiteRow = ErpFinanceFoundationWorkspaceData["operatingSiteRows"][number];
type StorageUnitRow = ErpFinanceFoundationWorkspaceData["storageUnitRows"][number];

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

export type ErpFinanceFoundationView =
  | "overview"
  | "company"
  | "currencies"
  | "controls"
  | "parties"
  | "numbering"
  | "accounts"
  | "journals"
  | "operations";

type FoundationViewMeta = {
  description: string;
  heading: string;
  href: string;
  label: string;
  summary: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

const foundationViewMeta: Record<ErpFinanceFoundationView, FoundationViewMeta> = {
  overview: {
    description: "Monitor the finance setup baseline and open focused setup pages.",
    heading: "Finance foundation",
    href: "/finance/foundation",
    label: "Overview",
    summary: "Finance setup baseline across company, GL, posting, parties, numbering, and journals."
  },
  company: {
    description: "Maintain company, fiscal year, and period setup.",
    heading: "Fiscal calendar",
    href: "/finance/fiscal-calendar",
    label: "Fiscal Calendar",
    summary: "Companies, fiscal years, and fiscal periods."
  },
  currencies: {
    description: "Maintain active currencies, base currency, and exchange rates.",
    heading: "Multi currency",
    href: "/finance/multi-currency",
    label: "Multi Currency",
    summary: "Active currencies, base currency, symbols, decimals, and exchange rates."
  },
  controls: {
    description: "Maintain GL controls and AR/AP posting profiles.",
    heading: "Posting setup",
    href: "/finance/posting-setup",
    label: "Posting Setup",
    summary: "Control accounts and AR/AP posting profiles."
  },
  parties: {
    description: "Maintain accounting rules around customer and supplier masters.",
    heading: "Party profiles",
    href: "/finance/party-profiles",
    label: "Party Profiles",
    summary: "Customer and supplier accounting profiles."
  },
  numbering: {
    description: "Maintain company document numbering by fiscal year.",
    heading: "Document numbering",
    href: "/finance/document-numbering",
    label: "Document Numbering",
    summary: "Company document numbering by fiscal year."
  },
  accounts: {
    description: "Maintain the chart of accounts for the primary company.",
    heading: "Chart of accounts",
    href: "/finance/chart-of-accounts",
    label: "Chart of Accounts",
    summary: "Chart of accounts for the primary company."
  },
  journals: {
    description: "Post manual journals and review reversal activity.",
    heading: "Journals",
    href: "/finance/journals",
    label: "Journals",
    summary: "Manual journal batches and reversals."
  },
  operations: {
    description: "Review generic product, operating site, and storage foundations.",
    heading: "Operating foundation",
    href: "/finance/operating-foundation",
    label: "Operating Foundation",
    summary: "Product profiles, operating sites, and storage units."
  }
};

const setupOverviewViews: Exclude<ErpFinanceFoundationView, "overview">[] = [
  "company",
  "currencies",
  "accounts",
  "controls",
  "parties",
  "numbering",
  "journals",
  "operations"
];

const accountTypeOptions = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "COST_OF_SALES",
  "EXPENSE"
].map((value) => ({ value, label: value }));

const normalBalanceOptions = ["DEBIT", "CREDIT"].map((value) => ({ value, label: value }));
const postingProfileTypeOptions = ["CUSTOMER", "SUPPLIER"].map((value) => ({
  value,
  label: formatEnumLabel(value)
}));
const creditStatusOptions = ["ACTIVE", "CASH_ONLY", "HOLD", "BLOCKED"].map((value) => ({
  value,
  label: formatEnumLabel(value)
}));
const deliveryModeOptions = ["EMAIL", "PRINT", "PORTAL"].map((value) => ({
  value,
  label: formatEnumLabel(value)
}));
const resetPolicyOptions = ["FISCAL_YEAR", "MANUAL"].map((value) => ({
  value,
  label: formatEnumLabel(value)
}));
const statusOptions = ["ACTIVE", "INACTIVE", "ARCHIVED"].map((value) => ({
  value,
  label: value
}));
const postingProfileAccountFields: Array<{
  label: string;
  field: keyof UpsertErpArApPostingProfileRequest;
}> = [
  { label: "AR control", field: "receivablesControlAccountCode" },
  { label: "AP control", field: "payablesControlAccountCode" },
  { label: "Customer advance", field: "customerAdvanceAccountCode" },
  { label: "Supplier advance", field: "supplierAdvanceAccountCode" },
  { label: "Withholding tax", field: "withholdingTaxAccountCode" },
  { label: "Customer discount", field: "customerDiscountAccountCode" },
  { label: "Supplier discount", field: "supplierDiscountAccountCode" },
  { label: "Write-off", field: "writeOffAccountCode" },
  { label: "Exchange gain", field: "exchangeGainAccountCode" },
  { label: "Exchange loss", field: "exchangeLossAccountCode" }
];

function emptyAccount(): UpsertErpGlAccountRequest {
  return {
    accountCode: "",
    name: "",
    accountType: "ASSET",
    normalBalance: "DEBIT",
    accountGroup: "",
    externalCode: "",
    description: "",
    isControlAccount: false,
    allowManualPosting: true,
    sortOrder: 0,
    status: "ACTIVE"
  };
}

function emptyPostingProfile(profileType = "CUSTOMER"): UpsertErpArApPostingProfileRequest {
  return {
    profileCode: "",
    name: "",
    profileType,
    description: "",
    receivablesControlAccountCode: "",
    payablesControlAccountCode: "",
    customerAdvanceAccountCode: "",
    supplierAdvanceAccountCode: "",
    withholdingTaxAccountCode: "",
    customerDiscountAccountCode: "",
    supplierDiscountAccountCode: "",
    writeOffAccountCode: "",
    exchangeGainAccountCode: "",
    exchangeLossAccountCode: "",
    isDefault: false,
    status: "ACTIVE"
  };
}

function emptyPartyProfile(
  partyType = "CUSTOMER",
  partyNo = ""
): UpsertErpPartyAccountingProfileRequest {
  return {
    partyType,
    partyNo,
    postingProfileCode: "",
    taxProfileCode: "",
    creditTermsCode: "",
    paymentTermsCode: "",
    creditLimitAmount: "",
    creditStatus: "ACTIVE",
    allowCredit: false,
    statementDeliveryMode: "EMAIL",
    invoiceDeliveryMode: "EMAIL",
    status: "ACTIVE"
  };
}

function emptyDocumentSequence(): UpdateErpDocumentSequenceRequest {
  return {
    documentType: "",
    prefix: "",
    suffix: "",
    nextSequence: 1,
    paddingLength: 6,
    resetPolicy: "FISCAL_YEAR",
    status: "ACTIVE"
  };
}

function emptyCurrency(): UpsertErpCurrencyRequest {
  return {
    currencyCode: "",
    name: "",
    symbol: "",
    decimalPlaces: 2,
    exchangeRateToBase: 1,
    isBaseCurrency: false,
    status: "ACTIVE"
  };
}

function emptyJournalDraft(accountCode = ""): PostManualJournalBatchRequest {
  return {
    batchNo: "",
    journalType: "GENERAL",
    postingDate: new Date().toISOString().slice(0, 10),
    description: "",
    lines: [
      { accountCode, debitAmount: "", creditAmount: "", memo: "" },
      { accountCode, debitAmount: "", creditAmount: "", memo: "" }
    ]
  };
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function MetricCard({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <article className="glass-panel rounded-[1.15rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">{label}</p>
          <p className="mt-2 text-[1.45rem] font-semibold text-stone-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "ACTIVE" || value === "OPEN" || value === "POSTED"
      ? "bg-emerald-100 text-emerald-700"
      : value === "DRAFT"
        ? "bg-sky-100 text-sky-700"
        : value === "CLOSED" || value === "INACTIVE"
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
  placeholder,
  step,
  type = "text",
  value
}: {
  disabled?: boolean;
  label: string;
  min?: string;
  onChange: (value: string) => void;
  placeholder?: string;
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
        placeholder={placeholder}
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
    <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-700">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      {label}
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

function makeSimpleFilter<TData>(): FilterFn<TData> {
  return (row, _columnId, filterValue) => {
    const query = String(filterValue ?? "").trim().toLowerCase();

    return !query || JSON.stringify(row.original).toLowerCase().includes(query);
  };
}

function getFoundationViewBadge(
  view: ErpFinanceFoundationView,
  workspace: ErpFinanceFoundationWorkspaceData
) {
  switch (view) {
    case "company":
      return numberFormatter.format(workspace.metrics.fiscalPeriods);
    case "currencies":
      return numberFormatter.format(workspace.metrics.currencies);
    case "controls":
      return numberFormatter.format(workspace.metrics.postingProfiles);
    case "parties":
      return numberFormatter.format(workspace.metrics.partyProfiles);
    case "numbering":
      return numberFormatter.format(workspace.metrics.documentSequences);
    case "accounts":
      return numberFormatter.format(workspace.metrics.glAccounts);
    case "journals":
      return numberFormatter.format(workspace.metrics.postedJournals);
    case "operations":
      return numberFormatter.format(workspace.metrics.productProfiles);
    case "overview":
    default:
      return null;
  }
}

export function ErpFinanceFoundationWorkspace({
  view = "overview",
  workspace
}: {
  view?: ErpFinanceFoundationView;
  workspace: ErpFinanceFoundationWorkspaceData;
}) {
  const router = useRouter();
  const activeView = foundationViewMeta[view] ? view : "overview";
  const activeViewMeta = foundationViewMeta[activeView];
  const [settingsDraft, setSettingsDraft] = useState<UpdateErpAccountingSettingsRequest>(
    workspace.accountingSettings
  );
  const [postingProfileDraft, setPostingProfileDraft] =
    useState<UpsertErpArApPostingProfileRequest>(emptyPostingProfile());
  const [partyProfileDraft, setPartyProfileDraft] =
    useState<UpsertErpPartyAccountingProfileRequest>(emptyPartyProfile());
  const [documentSequenceDraft, setDocumentSequenceDraft] =
    useState<UpdateErpDocumentSequenceRequest>(emptyDocumentSequence());
  const [currencyDraft, setCurrencyDraft] = useState<UpsertErpCurrencyRequest>(emptyCurrency());
  const [accountDraft, setAccountDraft] = useState<UpsertErpGlAccountRequest>(emptyAccount());
  const [journalDraft, setJournalDraft] = useState<PostManualJournalBatchRequest>(
    emptyJournalDraft(workspace.accountOptions[0]?.accountCode ?? "")
  );
  const [editingPostingProfileCode, setEditingPostingProfileCode] = useState<string | null>(null);
  const [editingPartyProfileKey, setEditingPartyProfileKey] = useState<string | null>(null);
  const [editingDocumentType, setEditingDocumentType] = useState<string | null>(null);
  const [editingCurrencyCode, setEditingCurrencyCode] = useState<string | null>(null);
  const [editingAccountCode, setEditingAccountCode] = useState<string | null>(null);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isPostingProfileDialogOpen, setIsPostingProfileDialogOpen] = useState(false);
  const [isPartyProfileDialogOpen, setIsPartyProfileDialogOpen] = useState(false);
  const [isDocumentSequenceDialogOpen, setIsDocumentSequenceDialogOpen] = useState(false);
  const [isCurrencyDialogOpen, setIsCurrencyDialogOpen] = useState(false);
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
  const [isJournalDialogOpen, setIsJournalDialogOpen] = useState(false);
  const [settingsState, setSettingsState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [accountState, setAccountState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [postingProfileState, setPostingProfileState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [partyProfileState, setPartyProfileState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [documentSequenceState, setDocumentSequenceState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [currencyState, setCurrencyState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [journalState, setJournalState] = useState<MutationState>({
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
  const accountSelectOptions = useMemo(
    () => [
      { value: "", label: "Select account" },
      ...workspace.accountOptions.map((option) => ({
        value: option.accountCode,
        label: option.label
      }))
    ],
    [workspace.accountOptions]
  );
  const currencySelectOptions = useMemo(
    () => [
      { value: "", label: "Select currency" },
      ...workspace.currencyRows
        .filter((currency) => currency.status === "ACTIVE")
        .map((currency) => ({
          value: currency.currencyCode,
          label: `${currency.currencyCode} - ${currency.name}`
        }))
    ],
    [workspace.currencyRows]
  );
  const partySelectOptions = useMemo(
    () => [
      { value: "", label: "Select party" },
      ...workspace.partyOptions
        .filter((option) => option.partyType === partyProfileDraft.partyType)
        .map((option) => ({
          value: option.partyNo,
          label: option.label
        }))
    ],
    [partyProfileDraft.partyType, workspace.partyOptions]
  );
  const postingProfileSelectOptions = useMemo(
    () => [
      { value: "", label: "Default posting profile" },
      ...workspace.postingProfileOptions
        .filter((option) => option.profileType === partyProfileDraft.partyType)
        .map((option) => ({
          value: option.profileCode,
          label: option.label
        }))
    ],
    [partyProfileDraft.partyType, workspace.postingProfileOptions]
  );
  const taxProfileSelectOptions = useMemo(
    () => [
      { value: "", label: "No tax profile" },
      ...workspace.taxProfileOptions.map((option) => ({
        value: option.taxProfileCode,
        label: option.label
      }))
    ],
    [workspace.taxProfileOptions]
  );
  const companyFilter = useMemo(() => makeSimpleFilter<CompanyRow>(), []);
  const currencyFilter = useMemo(() => makeSimpleFilter<CurrencyRow>(), []);
  const fiscalPeriodFilter = useMemo(() => makeSimpleFilter<FiscalPeriodRow>(), []);
  const accountFilter = useMemo(() => makeSimpleFilter<AccountRow>(), []);
  const postingProfileFilter = useMemo(() => makeSimpleFilter<ArApPostingProfileRow>(), []);
  const partyProfileFilter = useMemo(() => makeSimpleFilter<PartyAccountingProfileRow>(), []);
  const documentSequenceFilter = useMemo(() => makeSimpleFilter<DocumentSequenceRow>(), []);
  const journalBatchFilter = useMemo(() => makeSimpleFilter<JournalBatchRow>(), []);
  const journalFilter = useMemo(() => makeSimpleFilter<JournalRow>(), []);
  const productProfileFilter = useMemo(() => makeSimpleFilter<ProductProfileRow>(), []);
  const operatingSiteFilter = useMemo(() => makeSimpleFilter<OperatingSiteRow>(), []);
  const storageUnitFilter = useMemo(() => makeSimpleFilter<StorageUnitRow>(), []);
  const foundationTabs = useMemo(
    () => [
      {
        value: activeView,
        label: activeViewMeta.label,
        badge: getFoundationViewBadge(activeView, workspace) ?? undefined
      }
    ],
    [activeView, activeViewMeta.label, workspace]
  );
  const foundationSummaries = useMemo(
    () => ({
      [activeView]: activeViewMeta.summary
    }),
    [activeView, activeViewMeta.summary]
  );
  const showControlAction = activeView === "overview" || activeView === "controls";
  const showCurrencyAction = activeView === "overview" || activeView === "currencies";
  const showAccountAction = activeView === "overview" || activeView === "accounts";
  const showJournalAction = activeView === "overview" || activeView === "journals";
  const showHeaderActions =
    showControlAction || showCurrencyAction || showAccountAction || showJournalAction;

  useEffect(() => {
    setSettingsDraft(workspace.accountingSettings);
  }, [workspace.accountingSettings, workspace.refreshedAt]);

  function refreshAfterSuccess(close: () => void) {
    startTransition(() => {
      window.setTimeout(() => {
        close();
        router.refresh();
      }, 700);
    });
  }

  async function saveSettings() {
    setSettingsState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/finance/foundation/accounting-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(settingsDraft)
      });
      const payload = (await response.json()) as Partial<ErpFinanceFoundationMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save the accounting settings.");
      }

      setSettingsState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the accounting settings."
      });
      refreshAfterSuccess(() => setIsSettingsDialogOpen(false));
    } catch (error) {
      setSettingsState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save the accounting settings."
      });
    }
  }

  async function savePostingProfile() {
    setPostingProfileState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/finance/foundation/posting-profiles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(postingProfileDraft)
      });
      const payload = (await response.json()) as Partial<ErpFinanceFoundationMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save the posting profile.");
      }

      setPostingProfileState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the posting profile."
      });
      refreshAfterSuccess(() => setIsPostingProfileDialogOpen(false));
    } catch (error) {
      setPostingProfileState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save the posting profile."
      });
    }
  }

  async function savePartyProfile() {
    setPartyProfileState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/finance/foundation/party-profiles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(partyProfileDraft)
      });
      const payload = (await response.json()) as Partial<ErpFinanceFoundationMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save the party profile.");
      }

      setPartyProfileState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the party profile."
      });
      refreshAfterSuccess(() => setIsPartyProfileDialogOpen(false));
    } catch (error) {
      setPartyProfileState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save the party profile."
      });
    }
  }

  async function saveDocumentSequence() {
    setDocumentSequenceState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/finance/foundation/document-sequences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(documentSequenceDraft)
      });
      const payload = (await response.json()) as Partial<ErpFinanceFoundationMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save the document numbering setup.");
      }

      setDocumentSequenceState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the document numbering setup."
      });
      refreshAfterSuccess(() => setIsDocumentSequenceDialogOpen(false));
    } catch (error) {
      setDocumentSequenceState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save the document numbering setup."
      });
    }
  }

  async function saveAccount() {
    setAccountState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/finance/foundation/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(accountDraft)
      });
      const payload = (await response.json()) as Partial<ErpFinanceFoundationMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save the GL account.");
      }

      setAccountState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the GL account."
      });
      refreshAfterSuccess(() => setIsAccountDialogOpen(false));
    } catch (error) {
      setAccountState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not save the GL account."
      });
    }
  }

  async function saveCurrency() {
    setCurrencyState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/finance/foundation/currencies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(currencyDraft)
      });
      const payload = (await response.json()) as Partial<ErpFinanceFoundationMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save the currency setup.");
      }

      setCurrencyState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the currency setup."
      });
      refreshAfterSuccess(() => setIsCurrencyDialogOpen(false));
    } catch (error) {
      setCurrencyState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save the currency setup."
      });
    }
  }

  async function postJournal() {
    setJournalState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/finance/foundation/journal-batches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(journalDraft)
      });
      const payload = (await response.json()) as Partial<ErpFinanceFoundationMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not post the journal batch.");
      }

      setJournalState({
        status: "success",
        message: payload.message ?? "Flash ERP posted the journal batch."
      });
      refreshAfterSuccess(() => setIsJournalDialogOpen(false));
    } catch (error) {
      setJournalState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not post the journal batch."
      });
    }
  }

  async function reverseJournal(journalEntryId: string) {
    const reason = window.prompt("Reversal reason");

    if (reason === null) {
      return;
    }

    try {
      const response = await fetch(
        `/api/finance/foundation/journals/${encodeURIComponent(journalEntryId)}/reverse`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ reason })
        }
      );
      const payload = (await response.json()) as Partial<ErpFinanceFoundationMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not reverse that journal.");
      }

      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Flash ERP could not reverse that journal.");
    }
  }

  function openNewAccountDialog() {
    setEditingAccountCode(null);
    setAccountDraft(emptyAccount());
    setAccountState({ status: "idle", message: "" });
    setIsAccountDialogOpen(true);
  }

  function openNewCurrencyDialog() {
    setEditingCurrencyCode(null);
    setCurrencyDraft(emptyCurrency());
    setCurrencyState({ status: "idle", message: "" });
    setIsCurrencyDialogOpen(true);
  }

  function openNewPostingProfileDialog(profileType = "CUSTOMER") {
    setEditingPostingProfileCode(null);
    setPostingProfileDraft({
      ...emptyPostingProfile(profileType),
      receivablesControlAccountCode:
        profileType === "CUSTOMER" ? workspace.accountingSettings.arControlAccountCode : "",
      payablesControlAccountCode:
        profileType === "SUPPLIER" ? workspace.accountingSettings.apControlAccountCode : "",
      withholdingTaxAccountCode: workspace.accountingSettings.taxControlAccountCode
    });
    setPostingProfileState({ status: "idle", message: "" });
    setIsPostingProfileDialogOpen(true);
  }

  function openNewPartyProfileDialog(profileType = "CUSTOMER") {
    const party =
      workspace.partyOptions.find((option) => option.partyType === profileType) ??
      workspace.partyOptions[0];
    const resolvedPartyType = party?.partyType ?? profileType;
    const postingProfile = workspace.postingProfileOptions.find(
      (option) => option.profileType === resolvedPartyType
    );

    setEditingPartyProfileKey(null);
    setPartyProfileDraft({
      ...emptyPartyProfile(resolvedPartyType, party?.partyNo ?? ""),
      postingProfileCode: postingProfile?.profileCode ?? ""
    });
    setPartyProfileState({ status: "idle", message: "" });
    setIsPartyProfileDialogOpen(true);
  }

  function openEditPostingProfileDialog(profile: ArApPostingProfileRow) {
    setEditingPostingProfileCode(profile.profileCode);
    setPostingProfileDraft({
      profileCode: profile.profileCode,
      name: profile.name,
      profileType: profile.profileType,
      description: profile.description ?? "",
      receivablesControlAccountCode: profile.receivablesControlAccountCode,
      payablesControlAccountCode: profile.payablesControlAccountCode,
      customerAdvanceAccountCode: profile.customerAdvanceAccountCode,
      supplierAdvanceAccountCode: profile.supplierAdvanceAccountCode,
      withholdingTaxAccountCode: profile.withholdingTaxAccountCode,
      customerDiscountAccountCode: profile.customerDiscountAccountCode,
      supplierDiscountAccountCode: profile.supplierDiscountAccountCode,
      writeOffAccountCode: profile.writeOffAccountCode,
      exchangeGainAccountCode: profile.exchangeGainAccountCode,
      exchangeLossAccountCode: profile.exchangeLossAccountCode,
      isDefault: profile.isDefault,
      status: profile.status
    });
    setPostingProfileState({ status: "idle", message: "" });
    setIsPostingProfileDialogOpen(true);
  }

  function openEditPartyProfileDialog(profile: PartyAccountingProfileRow) {
    setEditingPartyProfileKey(`${profile.partyType}:${profile.partyNo}`);
    setPartyProfileDraft({
      partyType: profile.partyType,
      partyNo: profile.partyNo,
      postingProfileCode: profile.postingProfileCode,
      taxProfileCode: profile.taxProfileCode,
      creditTermsCode: profile.creditTermsCode,
      paymentTermsCode: profile.paymentTermsCode,
      creditLimitAmount: profile.creditLimitAmount ?? "",
      creditStatus: profile.creditStatus,
      allowCredit: profile.allowCredit,
      statementDeliveryMode: profile.statementDeliveryMode,
      invoiceDeliveryMode: profile.invoiceDeliveryMode,
      status: profile.status
    });
    setPartyProfileState({ status: "idle", message: "" });
    setIsPartyProfileDialogOpen(true);
  }

  function openEditDocumentSequenceDialog(sequence: DocumentSequenceRow) {
    setEditingDocumentType(sequence.documentType);
    setDocumentSequenceDraft({
      documentType: sequence.documentType,
      prefix: sequence.prefix,
      suffix: sequence.suffix,
      nextSequence: sequence.nextSequence,
      paddingLength: sequence.paddingLength,
      resetPolicy: sequence.resetPolicy,
      status: sequence.status
    });
    setDocumentSequenceState({ status: "idle", message: "" });
    setIsDocumentSequenceDialogOpen(true);
  }

  function openEditCurrencyDialog(currency: CurrencyRow) {
    setEditingCurrencyCode(currency.currencyCode);
    setCurrencyDraft({
      currencyCode: currency.currencyCode,
      name: currency.name,
      symbol: currency.symbol ?? "",
      decimalPlaces: currency.decimalPlaces,
      exchangeRateToBase: currency.exchangeRateToBase,
      isBaseCurrency: currency.isBaseCurrency,
      status: currency.status
    });
    setCurrencyState({ status: "idle", message: "" });
    setIsCurrencyDialogOpen(true);
  }

  function openEditAccountDialog(account: AccountRow) {
    setEditingAccountCode(account.accountCode);
    setAccountDraft({
      accountCode: account.accountCode,
      name: account.accountName,
      accountType: account.accountType,
      normalBalance: account.normalBalance,
      accountGroup: account.accountGroup ?? "",
      externalCode: account.externalCode ?? "",
      description: account.description ?? "",
      isControlAccount: account.isControlAccount,
      allowManualPosting: account.allowManualPosting,
      sortOrder: account.sortOrder,
      status: account.status
    });
    setAccountState({ status: "idle", message: "" });
    setIsAccountDialogOpen(true);
  }

  function updateJournalLine(
    index: number,
    patch: Partial<PostManualJournalBatchRequest["lines"][number]>
  ) {
    setJournalDraft((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line
      )
    }));
  }

  const companyColumns = useMemo<ColumnDef<CompanyRow>[]>(
    () => [
      {
        accessorKey: "legalName",
        header: "Company",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.legalName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.companyCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      { accessorKey: "baseCurrencyCode", header: "Currency" },
      { accessorKey: "timezone", header: "Timezone" },
      {
        accessorKey: "isPrimary",
        header: "Primary",
        cell: ({ row }) => (row.original.isPrimary ? "Yes" : "No")
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      }
    ],
    []
  );
  const currencyColumns = useMemo<ColumnDef<CurrencyRow>[]>(
    () => [
      { accessorKey: "currencyCode", header: "Currency" },
      { accessorKey: "name", header: "Name" },
      { accessorKey: "symbol", header: "Symbol" },
      { accessorKey: "decimalPlaces", header: "Decimals" },
      {
        accessorKey: "exchangeRateToBase",
        header: "Rate",
        cell: ({ row }) => numberFormatter.format(row.original.exchangeRateToBase)
      },
      {
        accessorKey: "isBaseCurrency",
        header: "Base",
        cell: ({ row }) => (row.original.isBaseCurrency ? "Yes" : "No")
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit currency",
                onSelect: () => openEditCurrencyDialog(row.original)
              }
            ]}
            label={`Actions for ${row.original.currencyCode}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );
  const fiscalColumns = useMemo<ColumnDef<FiscalPeriodRow>[]>(
    () => [
      { accessorKey: "periodCode", header: "Period" },
      { accessorKey: "fiscalYearCode", header: "Year" },
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "startsOn",
        header: "Start",
        cell: ({ row }) => formatDate(row.original.startsOn)
      },
      {
        accessorKey: "endsOn",
        header: "End",
        cell: ({ row }) => formatDate(row.original.endsOn)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      }
    ],
    []
  );
  const accountColumns = useMemo<ColumnDef<AccountRow>[]>(
    () => [
      {
        accessorKey: "accountCode",
        header: "Account",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.accountCode}</p>
            <p className="truncate text-xs text-stone-500">{row.original.accountName}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      { accessorKey: "accountType", header: "Type", cell: ({ row }) => formatEnumLabel(row.original.accountType) },
      { accessorKey: "normalBalance", header: "Normal", cell: ({ row }) => formatEnumLabel(row.original.normalBalance) },
      { accessorKey: "accountGroup", header: "Group" },
      {
        accessorKey: "isControlAccount",
        header: "Control",
        cell: ({ row }) => (row.original.isControlAccount ? "Yes" : "No")
      },
      {
        accessorKey: "allowManualPosting",
        header: "Manual",
        cell: ({ row }) => (row.original.allowManualPosting ? "Yes" : "No")
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit account",
                onSelect: () => openEditAccountDialog(row.original)
              }
            ]}
            label={`Actions for ${row.original.accountCode}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );
  const postingProfileColumns = useMemo<ColumnDef<ArApPostingProfileRow>[]>(
    () => [
      {
        accessorKey: "profileCode",
        header: "Profile",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.profileCode}</p>
            <p className="truncate text-xs text-stone-500">{row.original.name}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "profileType",
        header: "Type",
        cell: ({ row }) => formatEnumLabel(row.original.profileType)
      },
      {
        id: "controlAccounts",
        header: "Control",
        cell: ({ row }) =>
          [
            row.original.receivablesControlAccountCode
              ? `AR ${row.original.receivablesControlAccountCode}`
              : "",
            row.original.payablesControlAccountCode ? `AP ${row.original.payablesControlAccountCode}` : ""
          ]
            .filter(Boolean)
            .join(" / ") || "Not mapped"
      },
      {
        id: "advanceAccounts",
        header: "Advances",
        cell: ({ row }) =>
          [
            row.original.customerAdvanceAccountCode
              ? `Customer ${row.original.customerAdvanceAccountCode}`
              : "",
            row.original.supplierAdvanceAccountCode
              ? `Supplier ${row.original.supplierAdvanceAccountCode}`
              : ""
          ]
            .filter(Boolean)
            .join(" / ") || "Not mapped"
      },
      {
        id: "adjustmentAccounts",
        header: "Adjustments",
        cell: ({ row }) =>
          [
            row.original.withholdingTaxAccountCode ? `WHT ${row.original.withholdingTaxAccountCode}` : "",
            row.original.customerDiscountAccountCode
              ? `Cust disc ${row.original.customerDiscountAccountCode}`
              : "",
            row.original.supplierDiscountAccountCode
              ? `Supp disc ${row.original.supplierDiscountAccountCode}`
              : "",
            row.original.writeOffAccountCode ? `Write-off ${row.original.writeOffAccountCode}` : ""
          ]
            .filter(Boolean)
            .join(" / ") || "Not mapped"
      },
      {
        id: "fxAccounts",
        header: "FX",
        cell: ({ row }) =>
          [
            row.original.exchangeGainAccountCode ? `Gain ${row.original.exchangeGainAccountCode}` : "",
            row.original.exchangeLossAccountCode ? `Loss ${row.original.exchangeLossAccountCode}` : ""
          ]
            .filter(Boolean)
            .join(" / ") || "Not mapped"
      },
      {
        accessorKey: "isDefault",
        header: "Default",
        cell: ({ row }) => (row.original.isDefault ? "Yes" : "No")
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit profile",
                onSelect: () => openEditPostingProfileDialog(row.original)
              }
            ]}
            label={`Actions for ${row.original.profileCode}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );
  const partyProfileColumns = useMemo<ColumnDef<PartyAccountingProfileRow>[]>(
    () => [
      {
        accessorKey: "partyNo",
        header: "Party",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.partyName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.partyNo} / {formatEnumLabel(row.original.partyType)}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "postingProfileCode",
        header: "Posting",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.postingProfileCode || "Default"}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.postingProfileName ?? "Company default"}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "taxProfileCode",
        header: "Tax",
        cell: ({ row }) =>
          row.original.taxProfileCode
            ? `${row.original.taxProfileCode} ${row.original.taxProfileName ?? ""}`.trim()
            : "Not set"
      },
      {
        id: "terms",
        header: "Terms",
        cell: ({ row }) =>
          [
            row.original.creditTermsCode ? `Credit ${row.original.creditTermsCode}` : "",
            row.original.paymentTermsCode ? `Pay ${row.original.paymentTermsCode}` : ""
          ]
            .filter(Boolean)
            .join(" / ") || "Not set"
      },
      {
        accessorKey: "creditLimitAmount",
        header: "Limit",
        cell: ({ row }) =>
          row.original.creditLimitAmount === null
            ? "Not set"
            : currencyFormatter.format(row.original.creditLimitAmount)
      },
      {
        accessorKey: "creditStatus",
        header: "Credit",
        cell: ({ row }) => <StatusBadge value={row.original.creditStatus} />
      },
      {
        accessorKey: "allowCredit",
        header: "Allowed",
        cell: ({ row }) => (row.original.allowCredit ? "Yes" : "No")
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit party profile",
                onSelect: () => openEditPartyProfileDialog(row.original)
              }
            ]}
            label={`Actions for ${row.original.partyNo}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter]
  );
  const documentSequenceColumns = useMemo<ColumnDef<DocumentSequenceRow>[]>(
    () => [
      {
        accessorKey: "documentType",
        header: "Document",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {formatEnumLabel(row.original.documentType)}
            </p>
            <p className="truncate text-xs text-stone-500">{row.original.documentType}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      { accessorKey: "fiscalYearCode", header: "Fiscal year" },
      {
        id: "pattern",
        header: "Pattern",
        cell: ({ row }) =>
          `${row.original.prefix}-${String(row.original.nextSequence).padStart(
            row.original.paddingLength,
            "0"
          )}${row.original.suffix ? `-${row.original.suffix}` : ""}`
      },
      { accessorKey: "nextSequence", header: "Next" },
      { accessorKey: "paddingLength", header: "Padding" },
      {
        accessorKey: "resetPolicy",
        header: "Reset",
        cell: ({ row }) => formatEnumLabel(row.original.resetPolicy)
      },
      {
        accessorKey: "lastIssuedNo",
        header: "Last issued",
        cell: ({ row }) => row.original.lastIssuedNo ?? "None"
      },
      {
        accessorKey: "lastIssuedAt",
        header: "Issued at",
        cell: ({ row }) => (row.original.lastIssuedAt ? formatDate(row.original.lastIssuedAt) : "None")
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit numbering",
                onSelect: () => openEditDocumentSequenceDialog(row.original)
              }
            ]}
            label={`Actions for ${row.original.documentType}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );
  const journalBatchColumns = useMemo<ColumnDef<JournalBatchRow>[]>(
    () => [
      { accessorKey: "batchNo", header: "Batch" },
      { accessorKey: "sourceType", header: "Source", cell: ({ row }) => formatEnumLabel(row.original.sourceType) },
      {
        accessorKey: "postingDate",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.postingDate)
      },
      { accessorKey: "description", header: "Description" },
      {
        accessorKey: "totalDebit",
        header: "Debit",
        cell: ({ row }) => currencyFormatter.format(row.original.totalDebit)
      },
      {
        accessorKey: "totalCredit",
        header: "Credit",
        cell: ({ row }) => currencyFormatter.format(row.original.totalCredit)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      }
    ],
    [currencyFormatter]
  );
  const journalColumns = useMemo<ColumnDef<JournalRow>[]>(
    () => [
      {
        accessorKey: "journalNo",
        header: "Journal",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.journalNo}</p>
            <p className="truncate text-xs text-stone-500">{formatEnumLabel(row.original.journalType)}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "postingDate",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.postingDate)
      },
      { accessorKey: "periodCode", header: "Period" },
      { accessorKey: "description", header: "Description" },
      {
        accessorKey: "debitAmount",
        header: "Debit",
        cell: ({ row }) => currencyFormatter.format(row.original.debitAmount)
      },
      {
        accessorKey: "creditAmount",
        header: "Credit",
        cell: ({ row }) => currencyFormatter.format(row.original.creditAmount)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Reverse journal",
                disabled:
                  row.original.hasReversal || row.original.sourceType === "JOURNAL_REVERSAL",
                onSelect: () => void reverseJournal(row.original.journalEntryId),
                tone: "danger"
              }
            ]}
            label={`Actions for ${row.original.journalNo}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    [currencyFormatter]
  );
  const productProfileColumns = useMemo<ColumnDef<ProductProfileRow>[]>(
    () => [
      {
        accessorKey: "productCode",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.productCode}</p>
            <p className="truncate text-xs text-stone-500">{row.original.name}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      { accessorKey: "productFamily", header: "Family" },
      { accessorKey: "variantName", header: "Variant" },
      { accessorKey: "defaultUomCode", header: "UOM" },
      { accessorKey: "trackingMode", header: "Tracking" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      }
    ],
    []
  );
  const operatingSiteColumns = useMemo<ColumnDef<OperatingSiteRow>[]>(
    () => [
      {
        accessorKey: "siteCode",
        header: "Site",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.siteCode}</p>
            <p className="truncate text-xs text-stone-500">{row.original.name}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      { accessorKey: "siteType", header: "Type" },
      { accessorKey: "city", header: "City" },
      { accessorKey: "region", header: "Region" },
      { accessorKey: "storageUnitCount", header: "Storage" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      }
    ],
    []
  );
  const storageUnitColumns = useMemo<ColumnDef<StorageUnitRow>[]>(
    () => [
      {
        accessorKey: "storageUnitCode",
        header: "Storage",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.storageUnitCode}</p>
            <p className="truncate text-xs text-stone-500">{row.original.name}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      { accessorKey: "siteName", header: "Site" },
      { accessorKey: "productName", header: "Product" },
      {
        accessorKey: "capacityQuantity",
        header: "Capacity",
        cell: ({ row }) => `${numberFormatter.format(row.original.capacityQuantity)} ${row.original.uomCode}`
      },
      {
        accessorKey: "safeCapacityQuantity",
        header: "Safe capacity",
        cell: ({ row }) =>
          row.original.safeCapacityQuantity === null
            ? "Not set"
            : `${numberFormatter.format(row.original.safeCapacityQuantity)} ${row.original.uomCode}`
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      }
    ],
    []
  );

  return (
    <EnterpriseShell
      activeSection="finance"
      description={activeViewMeta.description}
      eyebrow="Flash ERP finance"
      heading={activeViewMeta.heading}
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-9">
        <MetricCard icon={Building2} label="Companies" value={numberFormatter.format(workspace.metrics.companies)} />
        <MetricCard icon={CalendarDays} label="Periods" value={numberFormatter.format(workspace.metrics.fiscalPeriods)} />
        <MetricCard icon={Landmark} label="Accounts" value={numberFormatter.format(workspace.metrics.glAccounts)} />
        <MetricCard icon={ListPlus} label="Journals" value={numberFormatter.format(workspace.metrics.postedJournals)} />
        <MetricCard icon={Landmark} label="Profiles" value={numberFormatter.format(workspace.metrics.postingProfiles)} />
        <MetricCard icon={UsersRound} label="Parties" value={numberFormatter.format(workspace.metrics.partyProfiles)} />
        <MetricCard icon={Hash} label="Numbering" value={numberFormatter.format(workspace.metrics.documentSequences)} />
        <MetricCard icon={Warehouse} label="Products" value={numberFormatter.format(workspace.metrics.productProfiles)} />
        <MetricCard icon={Warehouse} label="Storage" value={numberFormatter.format(workspace.metrics.storageUnits)} />
      </section>

      <div className="mt-4 rounded-[1.15rem] border border-stone-200/80 bg-white/90 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-stone-900">{workspace.statusMessage}</p>
            <p className="mt-1 text-sm text-stone-500">
              {workspace.companyName} uses {workspace.accountingSettings.baseCurrencyCode} with journal prefix {workspace.accountingSettings.journalNumberPrefix}.
            </p>
          </div>
          {showHeaderActions ? (
            <div className="flex flex-wrap gap-2">
              {showControlAction ? (
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-[var(--brand)] hover:text-stone-950"
                  onClick={() => {
                    setSettingsState({ status: "idle", message: "" });
                    setIsSettingsDialogOpen(true);
                  }}
                  type="button"
                >
                  <Save className="h-4 w-4" />
                  Controls
                </button>
              ) : null}
              {showCurrencyAction ? (
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-[var(--brand)] hover:text-stone-950"
                  onClick={openNewCurrencyDialog}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  Currency
                </button>
              ) : null}
              {showAccountAction ? (
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-[var(--brand)] hover:text-stone-950"
                  onClick={openNewAccountDialog}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  Account
                </button>
              ) : null}
              {showJournalAction ? (
                <button
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-[1.03]"
                  onClick={() => {
                    setJournalDraft(emptyJournalDraft(workspace.accountOptions[0]?.accountCode ?? ""));
                    setJournalState({ status: "idle", message: "" });
                    setIsJournalDialogOpen(true);
                  }}
                  type="button"
                >
                  <ListPlus className="h-4 w-4" />
                  Journal
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <WorkspaceTabs
        ariaLabel="Finance foundation views"
        defaultValue={activeView}
        summaries={foundationSummaries}
        tabs={foundationTabs}
      >
        <WorkspaceTabsContent value="overview">
          <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {setupOverviewViews.map((setupView) => {
              const setupMeta = foundationViewMeta[setupView];
              const badge = getFoundationViewBadge(setupView, workspace);

              return (
                <Link
                  className="rounded-[1.15rem] border border-stone-200/80 bg-white/90 p-4 transition hover:border-[var(--brand)] hover:shadow-[0_14px_36px_rgba(38,38,38,0.08)]"
                  href={setupMeta.href}
                  key={setupView}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-stone-950">
                        {setupMeta.label}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-stone-500">{setupMeta.summary}</p>
                    </div>
                    {badge ? (
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                        {badge}
                      </span>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="company">
          <div className="space-y-4">
            <SharedDataGrid
              columns={companyColumns}
              data={workspace.companyRows}
              emptyLabel="No companies are available yet."
              exportFileName="flash-erp-companies"
              globalFilterFn={companyFilter}
              initialPageSize={10}
              searchPlaceholder="Search companies"
            />
            <SharedDataGrid
              columns={fiscalColumns}
              data={workspace.fiscalPeriodRows}
              emptyLabel="No fiscal periods are available yet."
              exportFileName="flash-erp-fiscal-periods"
              globalFilterFn={fiscalPeriodFilter}
              initialPageSize={12}
              pageSizeOptions={[12, 24, 36]}
              searchPlaceholder="Search fiscal periods"
            />
          </div>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="currencies">
          <SharedDataGrid
            columns={currencyColumns}
            data={workspace.currencyRows}
            emptyLabel="No currencies are available yet."
            exportFileName="flash-erp-currencies"
            globalFilterFn={currencyFilter}
            initialPageSize={25}
            pageSizeOptions={[25, 50, 100]}
            searchPlaceholder="Search currencies"
            toolbarActions={
              <button
                className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
                onClick={openNewCurrencyDialog}
                type="button"
              >
                <Plus className="h-4 w-4" />
                Currency
              </button>
            }
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="controls">
          <div className="space-y-4">
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[
                ["Retained earnings", workspace.accountingSettings.retainedEarningsAccountCode],
                ["Accounts receivable", workspace.accountingSettings.arControlAccountCode],
                ["Accounts payable", workspace.accountingSettings.apControlAccountCode],
                ["Cash and bank", workspace.accountingSettings.cashControlAccountCode],
                ["Inventory", workspace.accountingSettings.inventoryControlAccountCode],
                ["Tax payable", workspace.accountingSettings.taxControlAccountCode]
              ].map(([label, value]) => (
                <div className="rounded-[1.15rem] border border-stone-200/80 bg-white/90 p-4" key={label}>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">{label}</p>
                  <p className="mt-2 text-lg font-semibold text-stone-950">{value || "Not mapped"}</p>
                </div>
              ))}
            </section>
            <SharedDataGrid
              columns={postingProfileColumns}
              data={workspace.arApPostingProfileRows}
              emptyLabel="No AR/AP posting profiles are available yet."
              exportFileName="flash-erp-ar-ap-posting-profiles"
              globalFilterFn={postingProfileFilter}
              initialPageSize={10}
              searchPlaceholder="Search posting profiles"
              toolbarActions={
                <button
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
                  onClick={() => openNewPostingProfileDialog()}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  Profile
                </button>
              }
            />
          </div>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="parties">
          <SharedDataGrid
            columns={partyProfileColumns}
            data={workspace.partyAccountingProfileRows}
            emptyLabel="No customer or supplier accounting profiles are available yet."
            exportFileName="flash-erp-party-accounting-profiles"
            globalFilterFn={partyProfileFilter}
            initialPageSize={25}
            pageSizeOptions={[25, 50, 100]}
            searchPlaceholder="Search party profiles"
            toolbarActions={
              <button
                className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
                disabled={workspace.partyOptions.length === 0}
                onClick={() => openNewPartyProfileDialog()}
                type="button"
              >
                <Plus className="h-4 w-4" />
                Party profile
              </button>
            }
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="numbering">
          <SharedDataGrid
            columns={documentSequenceColumns}
            data={workspace.documentSequenceRows}
            emptyLabel="No document numbering sequences are available yet."
            exportFileName="flash-erp-document-sequences"
            globalFilterFn={documentSequenceFilter}
            initialPageSize={25}
            pageSizeOptions={[25, 50, 100]}
            searchPlaceholder="Search numbering"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="accounts">
          <SharedDataGrid
            columns={accountColumns}
            data={workspace.accountRows}
            emptyLabel="No GL accounts are available yet."
            exportFileName="flash-erp-chart-of-accounts"
            globalFilterFn={accountFilter}
            initialPageSize={25}
            pageSizeOptions={[25, 50, 100]}
            searchPlaceholder="Search accounts"
            toolbarActions={
              <button
                className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
                onClick={openNewAccountDialog}
                type="button"
              >
                <Plus className="h-4 w-4" />
                Account
              </button>
            }
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="journals">
          <div className="space-y-4">
            <SharedDataGrid
              columns={journalBatchColumns}
              data={workspace.journalBatchRows}
              emptyLabel="No journal batches are posted yet."
              exportFileName="flash-erp-journal-batches"
              globalFilterFn={journalBatchFilter}
              initialPageSize={10}
              searchPlaceholder="Search batches"
              toolbarActions={
                <button
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
                  onClick={() => {
                    setJournalDraft(emptyJournalDraft(workspace.accountOptions[0]?.accountCode ?? ""));
                    setJournalState({ status: "idle", message: "" });
                    setIsJournalDialogOpen(true);
                  }}
                  type="button"
                >
                  <ListPlus className="h-4 w-4" />
                  Journal
                </button>
              }
            />
            <SharedDataGrid
              columns={journalColumns}
              data={workspace.journalRows}
              emptyLabel="No manual journals are posted yet."
              exportFileName="flash-erp-manual-journals"
              globalFilterFn={journalFilter}
              initialPageSize={25}
              pageSizeOptions={[25, 50, 100]}
              searchPlaceholder="Search journals"
            />
          </div>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="operations">
          <div className="space-y-4">
            <SharedDataGrid
              columns={productProfileColumns}
              data={workspace.productProfileRows}
              emptyLabel="No product profiles are available yet."
              exportFileName="flash-erp-product-profiles"
              globalFilterFn={productProfileFilter}
              initialPageSize={10}
              searchPlaceholder="Search product profiles"
            />
            <div className="grid gap-4 xl:grid-cols-2">
              <SharedDataGrid
                columns={operatingSiteColumns}
                data={workspace.operatingSiteRows}
                emptyLabel="No operating sites are available yet."
                exportFileName="flash-erp-operating-sites"
                globalFilterFn={operatingSiteFilter}
                initialPageSize={10}
                searchPlaceholder="Search operating sites"
              />
              <SharedDataGrid
                columns={storageUnitColumns}
                data={workspace.storageUnitRows}
                emptyLabel="No storage units are available yet."
                exportFileName="flash-erp-storage-units"
                globalFilterFn={storageUnitFilter}
                initialPageSize={10}
                searchPlaceholder="Search storage units"
              />
            </div>
          </div>
        </WorkspaceTabsContent>
      </WorkspaceTabs>

      <ActionDialog
        description="Update fiscal defaults and GL control mappings."
        hideTrigger
        onOpenChange={setIsSettingsDialogOpen}
        open={isSettingsDialogOpen}
        title="Accounting controls"
        triggerLabel=""
        widthClassName="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <DialogTextInput
              label="Fiscal year start month"
              min="1"
              onChange={(value) =>
                setSettingsDraft((current) => ({
                  ...current,
                  fiscalYearStartMonth: Number(value)
                }))
              }
              type="number"
              value={settingsDraft.fiscalYearStartMonth ?? 1}
            />
            <DialogTextInput
              label="Journal prefix"
              onChange={(value) =>
                setSettingsDraft((current) => ({ ...current, journalNumberPrefix: value }))
              }
              value={settingsDraft.journalNumberPrefix ?? "GL"}
            />
            <DialogSelect
              label="Functional currency"
              onChange={(value) =>
                setSettingsDraft((current) => ({ ...current, baseCurrencyCode: value }))
              }
              options={currencySelectOptions}
              value={settingsDraft.baseCurrencyCode ?? workspace.accountingSettings.baseCurrencyCode}
            />
            {[
              ["Retained earnings", "retainedEarningsAccountCode"],
              ["AR control", "arControlAccountCode"],
              ["AP control", "apControlAccountCode"],
              ["Cash control", "cashControlAccountCode"],
              ["Inventory control", "inventoryControlAccountCode"],
              ["Tax control", "taxControlAccountCode"]
            ].map(([label, field]) => (
              <DialogSelect
                key={field}
                label={label}
                onChange={(value) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    [field]: value
                  }))
                }
                options={accountSelectOptions}
                value={settingsDraft[field as keyof UpdateErpAccountingSettingsRequest] as string}
              />
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700"
              disabled={settingsState.status === "submitting"}
              onClick={() => setIsSettingsDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white"
              disabled={settingsState.status === "submitting"}
              onClick={() => void saveSettings()}
              type="button"
            >
              <Save className="h-4 w-4" />
              {settingsState.status === "submitting" ? "Saving..." : "Save controls"}
            </button>
          </div>
          <MutationMessage state={settingsState} />
        </div>
      </ActionDialog>

      <ActionDialog
        description="Maintain the AR/AP control-account profile used by customer and supplier posting rules."
        hideTrigger
        onOpenChange={setIsPostingProfileDialogOpen}
        open={isPostingProfileDialogOpen}
        title={editingPostingProfileCode ? "Edit posting profile" : "Create posting profile"}
        triggerLabel=""
        widthClassName="max-w-5xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <DialogTextInput
              disabled={Boolean(editingPostingProfileCode)}
              label="Profile code"
              onChange={(value) =>
                setPostingProfileDraft((current) => ({ ...current, profileCode: value }))
              }
              value={postingProfileDraft.profileCode}
            />
            <DialogTextInput
              label="Profile name"
              onChange={(value) =>
                setPostingProfileDraft((current) => ({ ...current, name: value }))
              }
              value={postingProfileDraft.name}
            />
            <DialogSelect
              label="Profile type"
              onChange={(value) =>
                setPostingProfileDraft((current) => ({ ...current, profileType: value }))
              }
              options={postingProfileTypeOptions}
              value={postingProfileDraft.profileType}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {postingProfileAccountFields.map(({ field, label }) => (
              <DialogSelect
                key={field}
                label={label}
                onChange={(value) =>
                  setPostingProfileDraft((current) => ({
                    ...current,
                    [field]: value
                  }))
                }
                options={accountSelectOptions}
                value={postingProfileDraft[field] as string}
              />
            ))}
          </div>
          <DialogTextArea
            label="Description"
            onChange={(value) =>
              setPostingProfileDraft((current) => ({ ...current, description: value }))
            }
            value={postingProfileDraft.description ?? ""}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <DialogCheckbox
              checked={Boolean(postingProfileDraft.isDefault)}
              label="Default profile for this type"
              onChange={(value) =>
                setPostingProfileDraft((current) => ({ ...current, isDefault: value }))
              }
            />
            <DialogSelect
              label="Status"
              onChange={(value) =>
                setPostingProfileDraft((current) => ({ ...current, status: value }))
              }
              options={statusOptions}
              value={postingProfileDraft.status ?? "ACTIVE"}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700"
              disabled={postingProfileState.status === "submitting"}
              onClick={() => setIsPostingProfileDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white"
              disabled={
                postingProfileState.status === "submitting" ||
                !postingProfileDraft.profileCode.trim() ||
                !postingProfileDraft.name.trim()
              }
              onClick={() => void savePostingProfile()}
              type="button"
            >
              <Save className="h-4 w-4" />
              {postingProfileState.status === "submitting" ? "Saving..." : "Save profile"}
            </button>
          </div>
          <MutationMessage state={postingProfileState} />
        </div>
      </ActionDialog>

      <ActionDialog
        description="Maintain customer and supplier accounting setup."
        hideTrigger
        onOpenChange={setIsPartyProfileDialogOpen}
        open={isPartyProfileDialogOpen}
        title={editingPartyProfileKey ? "Edit party profile" : "Create party profile"}
        triggerLabel=""
        widthClassName="max-w-5xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <DialogSelect
              disabled={Boolean(editingPartyProfileKey)}
              label="Party type"
              onChange={(value) => {
                const party = workspace.partyOptions.find((option) => option.partyType === value);
                const postingProfile = workspace.postingProfileOptions.find(
                  (option) => option.profileType === value
                );

                setPartyProfileDraft((current) => ({
                  ...current,
                  partyType: value,
                  partyNo: party?.partyNo ?? "",
                  postingProfileCode: postingProfile?.profileCode ?? ""
                }));
              }}
              options={postingProfileTypeOptions}
              value={partyProfileDraft.partyType}
            />
            <DialogSelect
              disabled={Boolean(editingPartyProfileKey)}
              label="Party"
              onChange={(value) =>
                setPartyProfileDraft((current) => ({
                  ...current,
                  partyNo: value
                }))
              }
              options={partySelectOptions}
              value={partyProfileDraft.partyNo}
            />
            <DialogSelect
              label="Posting profile"
              onChange={(value) =>
                setPartyProfileDraft((current) => ({
                  ...current,
                  postingProfileCode: value
                }))
              }
              options={postingProfileSelectOptions}
              value={partyProfileDraft.postingProfileCode ?? ""}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <DialogSelect
              label="Tax profile"
              onChange={(value) =>
                setPartyProfileDraft((current) => ({
                  ...current,
                  taxProfileCode: value
                }))
              }
              options={taxProfileSelectOptions}
              value={partyProfileDraft.taxProfileCode ?? ""}
            />
            <DialogTextInput
              label="Credit terms"
              onChange={(value) =>
                setPartyProfileDraft((current) => ({ ...current, creditTermsCode: value }))
              }
              value={partyProfileDraft.creditTermsCode ?? ""}
            />
            <DialogTextInput
              label="Payment terms"
              onChange={(value) =>
                setPartyProfileDraft((current) => ({ ...current, paymentTermsCode: value }))
              }
              value={partyProfileDraft.paymentTermsCode ?? ""}
            />
            <DialogTextInput
              label="Credit limit"
              min="0"
              onChange={(value) =>
                setPartyProfileDraft((current) => ({ ...current, creditLimitAmount: value }))
              }
              step="0.01"
              type="number"
              value={partyProfileDraft.creditLimitAmount ?? ""}
            />
            <DialogSelect
              label="Credit status"
              onChange={(value) =>
                setPartyProfileDraft((current) => ({ ...current, creditStatus: value }))
              }
              options={creditStatusOptions}
              value={partyProfileDraft.creditStatus ?? "ACTIVE"}
            />
            <DialogSelect
              label="Status"
              onChange={(value) =>
                setPartyProfileDraft((current) => ({ ...current, status: value }))
              }
              options={statusOptions}
              value={partyProfileDraft.status ?? "ACTIVE"}
            />
            <DialogSelect
              label="Statement delivery"
              onChange={(value) =>
                setPartyProfileDraft((current) => ({
                  ...current,
                  statementDeliveryMode: value
                }))
              }
              options={deliveryModeOptions}
              value={partyProfileDraft.statementDeliveryMode ?? "EMAIL"}
            />
            <DialogSelect
              label="Invoice delivery"
              onChange={(value) =>
                setPartyProfileDraft((current) => ({
                  ...current,
                  invoiceDeliveryMode: value
                }))
              }
              options={deliveryModeOptions}
              value={partyProfileDraft.invoiceDeliveryMode ?? "EMAIL"}
            />
            <DialogCheckbox
              checked={Boolean(partyProfileDraft.allowCredit)}
              label="Allow credit"
              onChange={(value) =>
                setPartyProfileDraft((current) => ({ ...current, allowCredit: value }))
              }
            />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700"
              disabled={partyProfileState.status === "submitting"}
              onClick={() => setIsPartyProfileDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white"
              disabled={
                partyProfileState.status === "submitting" ||
                !partyProfileDraft.partyType.trim() ||
                !partyProfileDraft.partyNo.trim()
              }
              onClick={() => void savePartyProfile()}
              type="button"
            >
              <Save className="h-4 w-4" />
              {partyProfileState.status === "submitting" ? "Saving..." : "Save party profile"}
            </button>
          </div>
          <MutationMessage state={partyProfileState} />
        </div>
      </ActionDialog>

      <ActionDialog
        description="Maintain document number prefixes and next numbers."
        hideTrigger
        onOpenChange={setIsDocumentSequenceDialogOpen}
        open={isDocumentSequenceDialogOpen}
        title={editingDocumentType ? `Edit ${formatEnumLabel(editingDocumentType)}` : "Edit numbering"}
        triggerLabel=""
        widthClassName="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <DialogTextInput
              disabled
              label="Document type"
              onChange={() => undefined}
              value={documentSequenceDraft.documentType}
            />
            <DialogTextInput
              label="Prefix"
              onChange={(value) =>
                setDocumentSequenceDraft((current) => ({ ...current, prefix: value }))
              }
              value={documentSequenceDraft.prefix}
            />
            <DialogTextInput
              label="Suffix"
              onChange={(value) =>
                setDocumentSequenceDraft((current) => ({ ...current, suffix: value }))
              }
              value={documentSequenceDraft.suffix ?? ""}
            />
            <DialogTextInput
              label="Next number"
              min="1"
              onChange={(value) =>
                setDocumentSequenceDraft((current) => ({ ...current, nextSequence: value }))
              }
              type="number"
              value={documentSequenceDraft.nextSequence ?? 1}
            />
            <DialogTextInput
              label="Padding"
              min="1"
              onChange={(value) =>
                setDocumentSequenceDraft((current) => ({ ...current, paddingLength: value }))
              }
              type="number"
              value={documentSequenceDraft.paddingLength ?? 6}
            />
            <DialogSelect
              label="Reset policy"
              onChange={(value) =>
                setDocumentSequenceDraft((current) => ({ ...current, resetPolicy: value }))
              }
              options={resetPolicyOptions}
              value={documentSequenceDraft.resetPolicy ?? "FISCAL_YEAR"}
            />
            <DialogSelect
              label="Status"
              onChange={(value) =>
                setDocumentSequenceDraft((current) => ({ ...current, status: value }))
              }
              options={statusOptions}
              value={documentSequenceDraft.status ?? "ACTIVE"}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700"
              disabled={documentSequenceState.status === "submitting"}
              onClick={() => setIsDocumentSequenceDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white"
              disabled={
                documentSequenceState.status === "submitting" ||
                !documentSequenceDraft.documentType.trim() ||
                !documentSequenceDraft.prefix.trim()
              }
              onClick={() => void saveDocumentSequence()}
              type="button"
            >
              <Save className="h-4 w-4" />
              {documentSequenceState.status === "submitting" ? "Saving..." : "Save numbering"}
            </button>
          </div>
          <MutationMessage state={documentSequenceState} />
        </div>
      </ActionDialog>

      <ActionDialog
        description="Create or update a configured ERP currency."
        hideTrigger
        onOpenChange={setIsCurrencyDialogOpen}
        open={isCurrencyDialogOpen}
        title={editingCurrencyCode ? "Edit currency" : "Create currency"}
        triggerLabel=""
        widthClassName="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <DialogTextInput
              disabled={Boolean(editingCurrencyCode)}
              label="Currency code"
              onChange={(value) =>
                setCurrencyDraft((current) => ({ ...current, currencyCode: value }))
              }
              value={currencyDraft.currencyCode}
            />
            <DialogTextInput
              label="Currency name"
              onChange={(value) => setCurrencyDraft((current) => ({ ...current, name: value }))}
              value={currencyDraft.name}
            />
            <DialogTextInput
              label="Symbol"
              onChange={(value) => setCurrencyDraft((current) => ({ ...current, symbol: value }))}
              value={currencyDraft.symbol ?? ""}
            />
            <DialogTextInput
              label="Decimal places"
              min="0"
              onChange={(value) =>
                setCurrencyDraft((current) => ({ ...current, decimalPlaces: Number(value) }))
              }
              type="number"
              value={currencyDraft.decimalPlaces ?? 2}
            />
            <DialogTextInput
              disabled={Boolean(currencyDraft.isBaseCurrency)}
              label="Exchange rate to base"
              min="0.000001"
              onChange={(value) =>
                setCurrencyDraft((current) => ({ ...current, exchangeRateToBase: value }))
              }
              step="0.000001"
              type="number"
              value={currencyDraft.isBaseCurrency ? 1 : currencyDraft.exchangeRateToBase ?? 1}
            />
            <DialogSelect
              label="Status"
              onChange={(value) => setCurrencyDraft((current) => ({ ...current, status: value }))}
              options={statusOptions}
              value={currencyDraft.status ?? "ACTIVE"}
            />
          </div>
          <DialogCheckbox
            checked={Boolean(currencyDraft.isBaseCurrency)}
            label="Base currency"
            onChange={(value) =>
              setCurrencyDraft((current) => ({
                ...current,
                exchangeRateToBase: value ? 1 : current.exchangeRateToBase,
                isBaseCurrency: value
              }))
            }
          />
          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700"
              disabled={currencyState.status === "submitting"}
              onClick={() => setIsCurrencyDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white"
              disabled={
                currencyState.status === "submitting" ||
                !currencyDraft.currencyCode.trim() ||
                !currencyDraft.name.trim()
              }
              onClick={() => void saveCurrency()}
              type="button"
            >
              <Save className="h-4 w-4" />
              {currencyState.status === "submitting" ? "Saving..." : "Save currency"}
            </button>
          </div>
          <MutationMessage state={currencyState} />
        </div>
      </ActionDialog>

      <ActionDialog
        description="Create or update a chart-of-accounts row."
        hideTrigger
        onOpenChange={setIsAccountDialogOpen}
        open={isAccountDialogOpen}
        title={editingAccountCode ? "Edit GL account" : "Create GL account"}
        triggerLabel=""
        widthClassName="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <DialogTextInput
              disabled={Boolean(editingAccountCode)}
              label="Account code"
              onChange={(value) => setAccountDraft((current) => ({ ...current, accountCode: value }))}
              value={accountDraft.accountCode}
            />
            <DialogTextInput
              label="Account name"
              onChange={(value) => setAccountDraft((current) => ({ ...current, name: value }))}
              value={accountDraft.name}
            />
            <DialogSelect
              label="Account type"
              onChange={(value) => setAccountDraft((current) => ({ ...current, accountType: value }))}
              options={accountTypeOptions}
              value={accountDraft.accountType}
            />
            <DialogSelect
              label="Normal balance"
              onChange={(value) =>
                setAccountDraft((current) => ({ ...current, normalBalance: value }))
              }
              options={normalBalanceOptions}
              value={accountDraft.normalBalance}
            />
            <DialogTextInput
              label="Account group"
              onChange={(value) =>
                setAccountDraft((current) => ({ ...current, accountGroup: value }))
              }
              value={accountDraft.accountGroup ?? ""}
            />
            <DialogTextInput
              label="External code"
              onChange={(value) =>
                setAccountDraft((current) => ({ ...current, externalCode: value }))
              }
              value={accountDraft.externalCode ?? ""}
            />
            <DialogTextInput
              label="Sort order"
              min="0"
              onChange={(value) =>
                setAccountDraft((current) => ({ ...current, sortOrder: Number(value) }))
              }
              type="number"
              value={accountDraft.sortOrder ?? 0}
            />
            <DialogSelect
              label="Status"
              onChange={(value) => setAccountDraft((current) => ({ ...current, status: value }))}
              options={statusOptions}
              value={accountDraft.status ?? "ACTIVE"}
            />
            <div className="md:col-span-2">
              <DialogTextArea
                label="Description"
                onChange={(value) =>
                  setAccountDraft((current) => ({ ...current, description: value }))
                }
                value={accountDraft.description ?? ""}
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <DialogCheckbox
              checked={Boolean(accountDraft.isControlAccount)}
              label="Control account"
              onChange={(value) =>
                setAccountDraft((current) => ({ ...current, isControlAccount: value }))
              }
            />
            <DialogCheckbox
              checked={Boolean(accountDraft.allowManualPosting)}
              label="Allow manual posting"
              onChange={(value) =>
                setAccountDraft((current) => ({ ...current, allowManualPosting: value }))
              }
            />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700"
              disabled={accountState.status === "submitting"}
              onClick={() => setIsAccountDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white"
              disabled={
                accountState.status === "submitting" ||
                !accountDraft.accountCode.trim() ||
                !accountDraft.name.trim()
              }
              onClick={() => void saveAccount()}
              type="button"
            >
              <Save className="h-4 w-4" />
              {accountState.status === "submitting" ? "Saving..." : "Save account"}
            </button>
          </div>
          <MutationMessage state={accountState} />
        </div>
      </ActionDialog>

      <ActionDialog
        description="Post a balanced manual journal batch."
        hideTrigger
        onOpenChange={setIsJournalDialogOpen}
        open={isJournalDialogOpen}
        title="Post manual journal"
        triggerLabel=""
        widthClassName="max-w-5xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <DialogTextInput
              label="Batch number"
              onChange={(value) => setJournalDraft((current) => ({ ...current, batchNo: value }))}
              placeholder="Auto"
              value={journalDraft.batchNo ?? ""}
            />
            <DialogSelect
              label="Journal type"
              onChange={(value) =>
                setJournalDraft((current) => ({ ...current, journalType: value }))
              }
              options={[
                { label: "General", value: "GENERAL" },
                { label: "Adjusting", value: "ADJUSTING" }
              ]}
              value={journalDraft.journalType ?? "GENERAL"}
            />
            <DialogTextInput
              label="Posting date"
              onChange={(value) =>
                setJournalDraft((current) => ({ ...current, postingDate: value }))
              }
              type="date"
              value={journalDraft.postingDate}
            />
            <DialogTextInput
              label="Description"
              onChange={(value) =>
                setJournalDraft((current) => ({ ...current, description: value }))
              }
              value={journalDraft.description}
            />
          </div>
          <div className="space-y-3">
            {journalDraft.lines.map((line, index) => (
              <div className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,1fr)_auto]" key={index}>
                <DialogSelect
                  label="Account"
                  onChange={(value) => updateJournalLine(index, { accountCode: value })}
                  options={accountSelectOptions}
                  value={line.accountCode}
                />
                <DialogTextInput
                  label="Debit"
                  min="0"
                  onChange={(value) => updateJournalLine(index, { debitAmount: value })}
                  step="0.01"
                  type="number"
                  value={line.debitAmount ?? ""}
                />
                <DialogTextInput
                  label="Credit"
                  min="0"
                  onChange={(value) => updateJournalLine(index, { creditAmount: value })}
                  step="0.01"
                  type="number"
                  value={line.creditAmount ?? ""}
                />
                <DialogTextInput
                  label="Memo"
                  onChange={(value) => updateJournalLine(index, { memo: value })}
                  value={line.memo ?? ""}
                />
                <div className="flex items-end">
                  <button
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-stone-200 px-3 text-sm font-semibold text-stone-700 disabled:opacity-40"
                    disabled={journalDraft.lines.length <= 2}
                    onClick={() =>
                      setJournalDraft((current) => ({
                        ...current,
                        lines: current.lines.filter((_, lineIndex) => lineIndex !== index)
                      }))
                    }
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800"
            onClick={() =>
              setJournalDraft((current) => ({
                ...current,
                lines: [
                  ...current.lines,
                  {
                    accountCode: workspace.accountOptions[0]?.accountCode ?? "",
                    debitAmount: "",
                    creditAmount: "",
                    memo: ""
                  }
                ]
              }))
            }
            type="button"
          >
            <Plus className="h-4 w-4" />
            Line
          </button>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700"
              disabled={journalState.status === "submitting"}
              onClick={() => setIsJournalDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white"
              disabled={journalState.status === "submitting" || !journalDraft.description.trim()}
              onClick={() => void postJournal()}
              type="button"
            >
              <ListPlus className="h-4 w-4" />
              {journalState.status === "submitting" ? "Posting..." : "Post journal"}
            </button>
          </div>
          <MutationMessage state={journalState} />
        </div>
      </ActionDialog>
    </EnterpriseShell>
  );
}
