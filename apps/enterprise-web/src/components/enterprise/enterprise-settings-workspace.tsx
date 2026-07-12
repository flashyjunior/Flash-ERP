"use client";

import { Building2, ShieldCheck, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";

import { ImageUploadField } from "@/components/enterprise/image-upload-field";
import { EnterpriseReceiptTemplatePanel } from "@/components/enterprise/enterprise-receipt-template-panel";
import { EnterpriseSecurityPanel } from "@/components/enterprise/enterprise-security-panel";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import {
  enterpriseSettingsPageMeta,
  type EnterpriseSettingsView
} from "@/lib/navigation/enterprise-navigation";
import type { EnterpriseSecurityWorkspaceData } from "@/server/repositories/enterprise-security.repository";
import type { FuelOperationsSettingsWorkspaceData } from "@/server/repositories/erp-fuel-operations.repository";
import type { EnterpriseSettingsWorkspaceData } from "@/server/repositories/enterprise-settings.repository";
import type { EnterpriseSetupWorkspaceData } from "@/server/repositories/enterprise-setup.repository";

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

type IntegrationValidationResponse = {
  status?: "READY" | "NOT_CONFIGURED" | "FAILED";
  message?: string;
  checks?: Array<{
    label: string;
    status: "PASS" | "WARN" | "FAIL";
    message: string;
  }>;
};

type CompanySettingsTab =
  | "details"
  | "numbering"
  | "stock"
  | "sizes"
  | "discounts"
  | "sales-orders"
  | "options"
  | "sms";

function MetricCard({
  label,
  value,
  icon: Icon
}: {
  label: string;
  value: string;
  icon: typeof Store;
}) {
  return (
    <article className="glass-panel rounded-[1.05rem] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            {label}
          </p>
          <p className="mt-1.5 text-[1.35rem] font-semibold text-stone-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] text-white shadow-[0_12px_24px_rgba(29,78,216,0.24)]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </article>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled = false
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: "text" | "number" | "email";
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1 text-[13px] text-stone-700">
      <span className="block text-[12px] font-semibold leading-none text-stone-900">{label}</span>
      <input
        className="h-8 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-[13px] outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)] disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1 text-[13px] text-stone-700">
      <span className="block text-[12px] font-semibold leading-none text-stone-900">{label}</span>
      <select
        className="h-8 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-[13px] outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)] disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
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

function TextArea({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1 text-[13px] text-stone-700">
      <span className="block text-[12px] font-semibold leading-none text-stone-900">{label}</span>
      <textarea
        className="min-h-24 w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[13px] outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function Check({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[13px] text-stone-700">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      {label}
    </label>
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

async function saveSection(
  url: string,
  payload: unknown,
  setState: (state: MutationState) => void,
  onComplete: () => void,
  fallbackError: string
) {
  setState({ status: "submitting", message: "" });

  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      throw new Error(data.message ?? fallbackError);
    }

    setState({ status: "success", message: data.message ?? "Flash ERP saved the settings." });
    startTransition(() => {
      window.setTimeout(onComplete, 700);
    });
  } catch (error) {
    setState({
      status: "error",
      message: error instanceof Error ? error.message : fallbackError
    });
  }
}

async function validateSection(
  url: string,
  payload: unknown,
  setState: (state: MutationState) => void,
  fallbackError: string
) {
  setState({ status: "submitting", message: "" });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...(payload && typeof payload === "object" ? payload : {}),
        attemptNetwork: true
      })
    });
    const data = (await response.json()) as IntegrationValidationResponse;
    const priorityChecks =
      data.checks?.filter((check) => check.status === "FAIL" || check.status === "WARN") ?? [];
    const detail = priorityChecks
      .slice(0, 2)
      .map((check) => `${check.label}: ${check.message}`)
      .join(" ");
    const message = [data.message ?? fallbackError, detail].filter(Boolean).join(" ");

    if (!response.ok || data.status !== "READY") {
      throw new Error(message);
    }

    setState({
      status: "success",
      message
    });
  } catch (error) {
    setState({
      status: "error",
      message: error instanceof Error ? error.message : fallbackError
    });
  }
}

type SettingsFormCardProps = {
  title: string;
  actionLabel: string;
  actionToneClassName: string;
  mutationState: MutationState;
  onSave: () => void;
  secondaryActionLabel?: string;
  secondaryMutationState?: MutationState;
  onSecondaryAction?: () => void;
  children: React.ReactNode;
};

function SettingsFormCard({
  title,
  actionLabel,
  actionToneClassName,
  mutationState,
  onSave,
  secondaryActionLabel,
  secondaryMutationState,
  onSecondaryAction,
  children
}: SettingsFormCardProps) {
  const isSecondarySubmitting = secondaryMutationState?.status === "submitting";

  return (
    <article className="glass-panel rounded-[1.05rem] p-2.5">
      <p className="text-[11px] font-semibold uppercase leading-none tracking-[0.24em] text-stone-500">
        {title}
      </p>
      <div className="mt-2 space-y-2">{children}</div>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {secondaryActionLabel && onSecondaryAction ? (
          <button
            className="inline-flex h-9 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950 disabled:opacity-50"
            disabled={mutationState.status === "submitting" || isSecondarySubmitting}
            onClick={onSecondaryAction}
            type="button"
          >
            {isSecondarySubmitting ? "Validating..." : secondaryActionLabel}
          </button>
        ) : null}
        <button
          className={`inline-flex h-9 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white shadow-[0_14px_26px_rgba(29,78,216,0.18)] transition hover:brightness-[1.03] ${actionToneClassName}`}
          disabled={mutationState.status === "submitting" || isSecondarySubmitting}
          onClick={onSave}
          type="button"
        >
          {mutationState.status === "submitting" ? "Saving..." : actionLabel}
        </button>
      </div>
      <div className="mt-2">
        <Feedback state={mutationState} />
        {secondaryMutationState ? <Feedback state={secondaryMutationState} /> : null}
      </div>
    </article>
  );
}

function resolveSettingsView(value: string | undefined): EnterpriseSettingsView {
  switch (value) {
    case "ldap":
    case "smtp":
    case "sms":
    case "receipt-templates":
    case "retail-users":
    case "options":
      return value;
    default:
      return "company";
  }
}

function formatToggleState(value: boolean, enabledLabel = "Enabled", disabledLabel = "Disabled") {
  return value ? enabledLabel : disabledLabel;
}

const documentNumberFormatFields = [
  ["purchaseOrder", "Purchase orders"],
  ["goodsReceipt", "GRN"],
  ["transferIn", "Transfer in"],
  ["transferOut", "Transfer out"],
  ["stockCount", "Stock count"],
  ["storeReceipt", "Store receipt"]
] as const;

const companySettingsTabs: Array<{ key: CompanySettingsTab; label: string }> = [
  { key: "details", label: "Company details" },
  { key: "numbering", label: "Document numbering" },
  { key: "stock", label: "Stock control" },
  { key: "sizes", label: "Product sizes" },
  { key: "discounts", label: "POS discounts" },
  { key: "sales-orders", label: "Sales orders" },
  { key: "options", label: "Options" },
  { key: "sms", label: "Sale SMS" }
];
const saleSmsTemplatePlaceholders = [
  "{shopName}",
  "{transactionNo}",
  "{currencyCode}",
  "{totalAmount}",
  "{customerFirstName}"
];
const fuelReceiptPaperOptions = [
  { label: "Thermal slip", value: "THERMAL" },
  { label: "A4 receipt", value: "A4" }
];
const stockUpdateModeOptions = [
  {
    label: "Auto update stock after receipt/transfer",
    value: "AUTO"
  },
  {
    label: "Hold receipt/transfer stock for HQ confirmation",
    value: "HQ_CONFIRM"
  }
];

export function EnterpriseSettingsWorkspace({
  workspace,
  setupWorkspace,
  securityWorkspace,
  fuelOperationsSettingsWorkspace,
  initialView,
  view
}: {
  workspace: EnterpriseSettingsWorkspaceData;
  setupWorkspace?: EnterpriseSetupWorkspaceData;
  securityWorkspace?: EnterpriseSecurityWorkspaceData;
  fuelOperationsSettingsWorkspace?: FuelOperationsSettingsWorkspaceData;
  initialView?: string;
  view?: EnterpriseSettingsView;
}) {
  const router = useRouter();
  const forcedView = view ?? resolveSettingsView(initialView);
  const [companyDraft, setCompanyDraft] = useState(workspace.companyProfile);
  const [ldapDraft, setLdapDraft] = useState(workspace.ldapSettings);
  const [smtpDraft, setSmtpDraft] = useState(workspace.smtpSettings);
  const [smsDraft, setSmsDraft] = useState(workspace.smsSettings);
  const [optionsDraft, setOptionsDraft] = useState(workspace.optionsSettings);
  const [fuelOperationsDraft, setFuelOperationsDraft] = useState(
    fuelOperationsSettingsWorkspace?.fuelSettings ?? {
      defaultSaleSourceSiteId: "",
      defaultDispatchSiteId: "",
      saleReceiptPaperKind: "THERMAL",
      deliveryReceiptPaperKind: "THERMAL",
      salesOrderReceiptPaperKind: "A4"
    }
  );
  const [newProductSize, setNewProductSize] = useState("");
  const [newPosDiscountRate, setNewPosDiscountRate] = useState("");
  const [companyTab, setCompanyTab] = useState<CompanySettingsTab>("details");
  const [companyState, setCompanyState] = useState<MutationState>({ status: "idle", message: "" });
  const [ldapState, setLdapState] = useState<MutationState>({ status: "idle", message: "" });
  const [smtpState, setSmtpState] = useState<MutationState>({ status: "idle", message: "" });
  const [smsState, setSmsState] = useState<MutationState>({ status: "idle", message: "" });
  const [ldapValidationState, setLdapValidationState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [smtpValidationState, setSmtpValidationState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [smsValidationState, setSmsValidationState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [optionsState, setOptionsState] = useState<MutationState>({ status: "idle", message: "" });
  const [fuelOperationsState, setFuelOperationsState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const selectedView = forcedView;
  const pageMeta = enterpriseSettingsPageMeta[selectedView];
  const defaultReceiptTemplate =
    setupWorkspace?.receiptTemplateRows.find((template) => template.isDefault) ?? null;
  const fuelSiteOptions = [
    { label: "Not set", value: "" },
    ...(fuelOperationsSettingsWorkspace?.siteOptions.map((site) => ({
      label: site.label,
      value: site.operatingSiteId
    })) ?? [])
  ];
  const companyCurrencyOptions =
    workspace.currencyOptions.length > 0
      ? workspace.currencyOptions.map((currency) => ({
          label: currency.label,
          value: currency.currencyCode
        }))
      : [
          {
            label: workspace.companyProfile.baseCurrencyCode,
            value: workspace.companyProfile.baseCurrencyCode
          }
        ];

  useEffect(() => {
    setCompanyDraft(workspace.companyProfile);
    setLdapDraft(workspace.ldapSettings);
    setSmtpDraft(workspace.smtpSettings);
    setSmsDraft(workspace.smsSettings);
    setOptionsDraft(workspace.optionsSettings);
    setFuelOperationsDraft(
      fuelOperationsSettingsWorkspace?.fuelSettings ?? {
        defaultSaleSourceSiteId: "",
        defaultDispatchSiteId: "",
        saleReceiptPaperKind: "THERMAL",
        deliveryReceiptPaperKind: "THERMAL",
        salesOrderReceiptPaperKind: "A4"
      }
    );
  }, [fuelOperationsSettingsWorkspace?.refreshedAt, workspace.refreshedAt]);

  const summaryCards = (() => {
    switch (selectedView) {
      case "company":
        return [
          {
            icon: Store,
            label: "Active stores",
            value: String(workspace.metrics.activeStores)
          },
          {
            icon: Building2,
            label: "Base currency",
            value: workspace.companyProfile.baseCurrencyCode
          },
          {
            icon: ShieldCheck,
            label: "Stock control",
            value: workspace.companyProfile.stockUpdateMode === "HQ_CONFIRM" ? "HQ confirm" : "Auto"
          }
        ];
      case "ldap":
        return [
          {
            icon: ShieldCheck,
            label: "Directory access",
            value: formatToggleState(ldapDraft.enabled)
          },
          {
            icon: Store,
            label: "User sync",
            value: formatToggleState(ldapDraft.syncEnabled)
          },
          {
            icon: Building2,
            label: "TLS posture",
            value: formatToggleState(ldapDraft.startTls, "StartTLS", "Plain bind")
          }
        ];
      case "smtp":
        return [
          {
            icon: ShieldCheck,
            label: "Mail delivery",
            value: formatToggleState(smtpDraft.enabled)
          },
          {
            icon: Building2,
            label: "SMTP host",
            value: smtpDraft.host || "Not configured"
          },
          {
            icon: Store,
            label: "Transport",
            value: formatToggleState(smtpDraft.secureConnection, "Secure", "Standard")
          }
        ];
      case "sms":
        return [
          {
            icon: ShieldCheck,
            label: "SMS delivery",
            value: formatToggleState(smsDraft.enabled)
          },
          {
            icon: Building2,
            label: "Provider",
            value: smsDraft.providerName || "Not configured"
          },
          {
            icon: Store,
            label: "Reports",
            value: formatToggleState(smsDraft.deliveryReportEnabled)
          }
        ];
      case "fuel-operations":
        return [
          {
            icon: Store,
            label: "Default sale source",
            value:
              fuelOperationsSettingsWorkspace?.siteOptions.find(
                (site) => site.operatingSiteId === fuelOperationsDraft.defaultSaleSourceSiteId
              )?.code ?? "Not set"
          },
          {
            icon: Building2,
            label: "Dispatch site",
            value:
              fuelOperationsSettingsWorkspace?.siteOptions.find(
                (site) => site.operatingSiteId === fuelOperationsDraft.defaultDispatchSiteId
              )?.code ?? "Not set"
          },
          {
            icon: ShieldCheck,
            label: "Sale receipt",
            value: fuelOperationsDraft.saleReceiptPaperKind === "A4" ? "A4" : "Thermal"
          }
        ];
      case "receipt-templates":
        return [
          {
            icon: Building2,
            label: "Active templates",
            value: String(workspace.metrics.activeReceiptTemplates)
          },
          {
            icon: Store,
            label: "Default template",
            value: defaultReceiptTemplate?.name ?? "Not set"
          },
          {
            icon: ShieldCheck,
            label: "Active stores",
            value: String(workspace.metrics.activeStores)
          }
        ];
      case "retail-users":
        return [
          {
            icon: ShieldCheck,
            label: "Active users",
            value: String(securityWorkspace?.metrics.activeUsers ?? 0)
          },
          {
            icon: Store,
            label: "Cashier-ready",
            value: String(securityWorkspace?.metrics.cashierEligibleUsers ?? 0)
          },
          {
            icon: Building2,
            label: "Supervisor-ready",
            value: String(securityWorkspace?.metrics.supervisorEligibleUsers ?? 0)
          }
        ];
      case "options":
        return [
          {
            icon: Store,
            label: "Offline sales",
            value: formatToggleState(optionsDraft.allowOfflineSales)
          },
          {
            icon: ShieldCheck,
            label: "Negative inventory",
            value: formatToggleState(optionsDraft.allowNegativeInventory, "Allowed", "Blocked")
          },
          {
            icon: Building2,
            label: "Receipt search days",
            value: String(optionsDraft.defaultReceiptSearchDays)
          },
          {
            icon: ShieldCheck,
            label: "Critical startup",
            value: formatToggleState(optionsDraft.showCriticalStocksOnStartup, "Shown", "Hidden")
          }
        ];
      default:
        return [
          {
            icon: Store,
            label: "Active stores",
            value: String(workspace.metrics.activeStores)
          }
        ];
    }
  })();

  const pageStatusMessage =
    selectedView === "receipt-templates"
      ? setupWorkspace?.statusMessage ??
        "Receipt template information is temporarily unavailable in enterprise settings."
      : selectedView === "fuel-operations"
        ? fuelOperationsSettingsWorkspace?.statusMessage ??
          "Fuel Operations settings are temporarily unavailable in enterprise settings."
      : selectedView === "retail-users"
        ? securityWorkspace?.statusMessage ??
          "Retail user information is temporarily unavailable in enterprise settings."
        : workspace.statusMessage;

  const renderSettingsContent = (currentView: EnterpriseSettingsView) => {
    switch (currentView) {
      case "company":
        return (
          <>
            <section className="flex flex-wrap gap-1.5 rounded-[1.05rem] border border-stone-200 bg-white/88 p-1.5">
              {companySettingsTabs.map((tab) => (
                <button
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${
                    companyTab === tab.key
                      ? "bg-[var(--brand)] text-white"
                      : "text-stone-700 hover:bg-stone-100"
                  }`}
                  key={tab.key}
                  onClick={() => setCompanyTab(tab.key)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </section>

            {companyTab === "details" ? (
              <SettingsFormCard
                actionLabel="Save company"
                actionToneClassName="bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))]"
                mutationState={companyState}
                onSave={() =>
                  void saveSection(
                    "/api/settings/company-profile",
                    companyDraft,
                    setCompanyState,
                    () => router.refresh(),
                    "Flash ERP could not update the company profile."
                  )
                }
                title="Company details"
              >
                <div className="grid items-start gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,20rem)]">
                  <div className="grid auto-rows-min content-start gap-x-2 gap-y-2 md:grid-cols-2">
                    <Field
                      disabled
                      label="Company code"
                      onChange={(value) =>
                        setCompanyDraft((current) => ({ ...current, companyCode: value }))
                      }
                      value={companyDraft.companyCode}
                    />
                    <Field
                      label="Legal name"
                      onChange={(value) =>
                        setCompanyDraft((current) => ({ ...current, legalName: value }))
                      }
                      value={companyDraft.legalName}
                    />
                    <Field
                      label="Trading name"
                      onChange={(value) =>
                        setCompanyDraft((current) => ({ ...current, tradingName: value }))
                      }
                      value={companyDraft.tradingName}
                    />
                    <Field
                      label="Company email"
                      onChange={(value) =>
                        setCompanyDraft((current) => ({ ...current, email: value }))
                      }
                      type="email"
                      value={companyDraft.email}
                    />
                    <Field
                      label="Phone"
                      onChange={(value) =>
                        setCompanyDraft((current) => ({ ...current, phone: value }))
                      }
                      value={companyDraft.phone}
                    />
                    <Field
                      label="Website"
                      onChange={(value) =>
                        setCompanyDraft((current) => ({ ...current, website: value }))
                      }
                      value={companyDraft.website}
                    />
                    <Field
                      label="Tax registration"
                      onChange={(value) =>
                        setCompanyDraft((current) => ({ ...current, taxRegistrationNo: value }))
                      }
                      value={companyDraft.taxRegistrationNo}
                    />
                    <SelectField
                      label="Base currency"
                      onChange={(value) =>
                        setCompanyDraft((current) => ({ ...current, baseCurrencyCode: value }))
                      }
                      options={companyCurrencyOptions}
                      value={companyDraft.baseCurrencyCode}
                    />
                    <Field
                      label="Timezone"
                      onChange={(value) =>
                        setCompanyDraft((current) => ({ ...current, timezone: value }))
                      }
                      value={companyDraft.timezone}
                    />
                    <Field
                      label="Country code"
                      onChange={(value) =>
                        setCompanyDraft((current) => ({ ...current, countryCode: value }))
                      }
                      value={companyDraft.countryCode}
                    />
                    <Field
                      label="Address line 1"
                      onChange={(value) =>
                        setCompanyDraft((current) => ({ ...current, addressLine1: value }))
                      }
                      value={companyDraft.addressLine1}
                    />
                    <Field
                      label="Address line 2"
                      onChange={(value) =>
                        setCompanyDraft((current) => ({ ...current, addressLine2: value }))
                      }
                      value={companyDraft.addressLine2}
                    />
                    <Field
                      label="City"
                      onChange={(value) =>
                        setCompanyDraft((current) => ({ ...current, city: value }))
                      }
                      value={companyDraft.city}
                    />
                    <Field
                      label="Region"
                      onChange={(value) =>
                        setCompanyDraft((current) => ({ ...current, region: value }))
                      }
                      value={companyDraft.region}
                    />
                    <Field
                      label="Postal code"
                      onChange={(value) =>
                        setCompanyDraft((current) => ({ ...current, postalCode: value }))
                      }
                      value={companyDraft.postalCode}
                    />
                  </div>
                  <aside className="self-start space-y-2 rounded-xl border border-stone-200 bg-white/72 p-2.5">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                        Brand media
                      </p>
                      <h3 className="mt-0.5 text-sm font-semibold text-stone-950">
                        Login and receipt assets
                      </h3>
                    </div>
                    <ImageUploadField
                      emptyDetail="Used on receipts and login cards."
                      emptyTitle="No company logo selected"
                      label="Company logo"
                      layout="stacked"
                      onChange={(value: string) =>
                        setCompanyDraft((current) => ({ ...current, companyLogoUrl: value }))
                      }
                      placeholder="Upload or paste logo URL"
                      uploadEndpoint="/api/settings/company-logo"
                      uploadSubjectLabel="company logo"
                      value={companyDraft.companyLogoUrl}
                    />
                    <ImageUploadField
                      emptyDetail="Used behind the store desktop login screen."
                      emptyTitle="No login background selected"
                      label="Login background"
                      layout="stacked"
                      onChange={(value: string) =>
                        setCompanyDraft((current) => ({
                          ...current,
                          loginBackgroundImageUrl: value
                        }))
                      }
                      placeholder="Upload or paste background URL"
                      uploadEndpoint="/api/settings/login-background"
                      uploadSubjectLabel="login background"
                      value={companyDraft.loginBackgroundImageUrl}
                    />
                  </aside>
                </div>
              </SettingsFormCard>
            ) : null}

            {companyTab === "stock" ? (
              <SettingsFormCard
                actionLabel="Save stock control"
                actionToneClassName="bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))]"
                mutationState={companyState}
                onSave={() =>
                  void saveSection(
                    "/api/settings/company-profile",
                    companyDraft,
                    setCompanyState,
                    () => router.refresh(),
                    "Flash ERP could not update the stock-control setting."
                  )
                }
                title="Stock control"
              >
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <SelectField
                    label="Receipt and transfer stock updates"
                    onChange={(value) =>
                      setCompanyDraft((current) => ({
                        ...current,
                        stockUpdateMode: value
                      }))
                    }
                    options={stockUpdateModeOptions}
                    value={companyDraft.stockUpdateMode ?? "AUTO"}
                  />
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
                    POS sales keep updating stock immediately. This setting controls purchase
                    receipts, transfer issues, and transfer receipts unless a store overrides it.
                  </div>
                </div>
              </SettingsFormCard>
            ) : null}

            {companyTab === "numbering" ? (
              <SettingsFormCard
                actionLabel="Save numbering"
                actionToneClassName="bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))]"
                mutationState={companyState}
                onSave={() =>
                  void saveSection(
                    "/api/settings/company-profile",
                    companyDraft,
                    setCompanyState,
                    () => router.refresh(),
                    "Flash ERP could not update the document numbering."
                  )
                }
                title="Document numbering"
              >
                <div className="grid gap-2 xl:grid-cols-2">
                  {documentNumberFormatFields.map(([key, label]) => {
                    const format = companyDraft.documentNumberFormats[key];

                    return (
                      <div className="rounded-xl border border-stone-200 bg-white p-2.5" key={key}>
                        <p className="text-sm font-semibold text-stone-950">{label}</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]">
                          <Field
                            label="Prefix"
                            onChange={(value) =>
                              setCompanyDraft((current) => ({
                                ...current,
                                documentNumberFormats: {
                                  ...current.documentNumberFormats,
                                  [key]: {
                                    ...current.documentNumberFormats[key],
                                    prefix: value
                                  }
                                }
                              }))
                            }
                            value={format.prefix}
                          />
                          <Field
                            label="Digits"
                            onChange={(value) =>
                              setCompanyDraft((current) => ({
                                ...current,
                                documentNumberFormats: {
                                  ...current.documentNumberFormats,
                                  [key]: {
                                    ...current.documentNumberFormats[key],
                                    digits: Number(value)
                                  }
                                }
                              }))
                            }
                            type="number"
                            value={format.digits}
                          />
                        </div>
                        <div className="mt-2">
                          <Check
                            checked={format.includeStoreCode}
                            label="Include shop/location code"
                            onChange={(value) =>
                              setCompanyDraft((current) => ({
                                ...current,
                                documentNumberFormats: {
                                  ...current.documentNumberFormats,
                                  [key]: {
                                    ...current.documentNumberFormats[key],
                                    includeStoreCode: value
                                  }
                                }
                              }))
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SettingsFormCard>
            ) : null}

            {companyTab === "sizes" ? (
              <SettingsFormCard
                actionLabel="Save sizes"
                actionToneClassName="bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))]"
                mutationState={companyState}
                onSave={() =>
                  void saveSection(
                    "/api/settings/company-profile",
                    companyDraft,
                    setCompanyState,
                    () => router.refresh(),
                    "Flash ERP could not update the product sizes."
                  )
                }
                title="Product sizes"
              >
                <div className="grid gap-3">
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                    <Field
                      label="Size"
                      onChange={setNewProductSize}
                      value={newProductSize}
                    />
                    <button
                      className="h-8 self-end rounded-lg bg-stone-950 px-3 text-[13px] font-semibold text-white"
                      onClick={() => {
                        const nextSize = newProductSize.trim().slice(0, 24);

                        if (!nextSize) {
                          return;
                        }

                        setCompanyDraft((current) => {
                          const existing = current.productSizes ?? [];
                          const exists = existing.some(
                            (size) => size.toUpperCase() === nextSize.toUpperCase()
                          );

                          return exists
                            ? current
                            : { ...current, productSizes: [...existing, nextSize] };
                        });
                        setNewProductSize("");
                      }}
                      type="button"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(companyDraft.productSizes ?? []).length ? (
                      companyDraft.productSizes.map((size) => (
                        <span
                          className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 text-[13px] font-semibold text-stone-800"
                          key={size}
                        >
                          {size}
                          <button
                            className="text-stone-400 transition hover:text-rose-600"
                            onClick={() =>
                              setCompanyDraft((current) => ({
                                ...current,
                                productSizes: (current.productSizes ?? []).filter(
                                  (currentSize) => currentSize !== size
                                )
                              }))
                            }
                            type="button"
                          >
                            x
                          </button>
                        </span>
                      ))
                    ) : (
                      <p className="rounded-xl border border-dashed border-stone-300 bg-white/70 px-3 py-2 text-sm text-stone-500">
                        No product sizes have been defined.
                      </p>
                    )}
                  </div>
                </div>
              </SettingsFormCard>
            ) : null}

            {companyTab === "discounts" ? (
              <SettingsFormCard
                actionLabel="Save discounts"
                actionToneClassName="bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))]"
                mutationState={companyState}
                onSave={() =>
                  void saveSection(
                    "/api/settings/company-profile",
                    companyDraft,
                    setCompanyState,
                    () => router.refresh(),
                    "Flash ERP could not update the POS discount rates."
                  )
                }
                title="POS discount rates"
              >
                <div className="grid gap-3">
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                    <Field
                      label="Discount rate (%)"
                      onChange={setNewPosDiscountRate}
                      type="number"
                      value={newPosDiscountRate}
                    />
                    <button
                      className="h-8 self-end rounded-lg bg-stone-950 px-3 text-[13px] font-semibold text-white"
                      onClick={() => {
                        const parsedRate = Number(newPosDiscountRate);

                        if (!Number.isFinite(parsedRate) || parsedRate <= 0 || parsedRate > 100) {
                          return;
                        }

                        const nextRate = Number(parsedRate.toFixed(2));

                        setCompanyDraft((current) => {
                          const existing = current.posDiscountRates ?? [];
                          const exists = existing.some((rate) => Number(rate).toFixed(2) === nextRate.toFixed(2));

                          return exists
                            ? current
                            : { ...current, posDiscountRates: [...existing, nextRate] };
                        });
                        setNewPosDiscountRate("");
                      }}
                      type="button"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(companyDraft.posDiscountRates ?? []).length ? (
                      [...(companyDraft.posDiscountRates ?? [])]
                        .sort((left, right) => left - right)
                        .map((rate) => (
                          <span
                            className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 text-[13px] font-semibold text-stone-800"
                            key={rate.toFixed(2)}
                          >
                            {Number.isInteger(rate) ? rate.toFixed(0) : rate.toFixed(2)}%
                            <button
                              className="text-stone-400 transition hover:text-rose-600"
                              onClick={() =>
                                setCompanyDraft((current) => ({
                                  ...current,
                                  posDiscountRates: (current.posDiscountRates ?? []).filter(
                                    (currentRate) => currentRate.toFixed(2) !== rate.toFixed(2)
                                  )
                                }))
                              }
                              type="button"
                            >
                              x
                            </button>
                          </span>
                        ))
                    ) : (
                      <p className="rounded-xl border border-dashed border-stone-300 bg-white/70 px-3 py-2 text-sm text-stone-500">
                        No POS discount rates have been defined.
                      </p>
                    )}
                  </div>
                </div>
              </SettingsFormCard>
            ) : null}

            {companyTab === "sales-orders" ? (
              <SettingsFormCard
                actionLabel="Save routing"
                actionToneClassName="bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))]"
                mutationState={companyState}
                onSave={() =>
                  void saveSection(
                    "/api/settings/company-profile",
                    companyDraft,
                    setCompanyState,
                    () => router.refresh(),
                    "Flash ERP could not update the sales order routing."
                  )
                }
                title="Sales order routing"
              >
                <div className="grid gap-3">
                  <label className="grid gap-1 text-[13px] text-stone-700">
                    <span className="block text-[12px] font-semibold leading-none text-stone-900">
                      Fulfilment shop
                    </span>
                    <select
                      className="h-8 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-[13px] outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                      onChange={(event) =>
                        setCompanyDraft((current) => ({
                          ...current,
                          salesOrderFulfilmentStoreId: event.target.value
                        }))
                      }
                      value={companyDraft.salesOrderFulfilmentStoreId ?? ""}
                    >
                      <option value="">No central fulfilment shop</option>
                      {workspace.storeOptions.map((store) => (
                        <option key={store.storeId} value={store.storeId}>
                          {store.storeName} ({store.storeCode})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </SettingsFormCard>
            ) : null}

            {companyTab === "options" ? (
              <SettingsFormCard
                actionLabel="Save options"
                actionToneClassName="bg-[linear-gradient(135deg,#047857,#065f46)]"
                mutationState={optionsState}
                onSave={() =>
                  void saveSection(
                    "/api/settings/options",
                    optionsDraft,
                    setOptionsState,
                    () => router.refresh(),
                    "Flash ERP could not update the options."
                  )
                }
                title="Options"
              >
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  <Check
                    checked={optionsDraft.allowNegativeInventory}
                    label="Allow negative inventory"
                    onChange={(value) =>
                      setOptionsDraft((current) => ({ ...current, allowNegativeInventory: value }))
                    }
                  />
                  <Check
                    checked={optionsDraft.allowOfflineSales}
                    label="Allow offline sales"
                    onChange={(value) =>
                      setOptionsDraft((current) => ({ ...current, allowOfflineSales: value }))
                    }
                  />
                  <Check
                    checked={optionsDraft.autoPrintReceipts}
                    label="Auto-print receipts"
                    onChange={(value) =>
                      setOptionsDraft((current) => ({ ...current, autoPrintReceipts: value }))
                    }
                  />
                  <Check
                    checked={optionsDraft.enforceSerializedScanAtPos}
                    label="Enforce serialized scan"
                    onChange={(value) =>
                      setOptionsDraft((current) => ({
                        ...current,
                        enforceSerializedScanAtPos: value
                      }))
                    }
                  />
                  <Check
                    checked={optionsDraft.requireCustomerForCreditSales}
                    label="Require customer for credit sales"
                    onChange={(value) =>
                      setOptionsDraft((current) => ({
                        ...current,
                        requireCustomerForCreditSales: value
                      }))
                    }
                  />
                  <Check
                    checked={optionsDraft.requireSupervisorForReceiptlessReturn}
                    label="Require supervisor for receipt-less return"
                    onChange={(value) =>
                      setOptionsDraft((current) => ({
                        ...current,
                        requireSupervisorForReceiptlessReturn: value
                      }))
                    }
                  />
                  <Check
                    checked={optionsDraft.showCriticalStocksOnStartup}
                    label="Show critical stocks on startup"
                    onChange={(value) =>
                      setOptionsDraft((current) => ({
                        ...current,
                        showCriticalStocksOnStartup: value
                      }))
                    }
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <Field
                    label="Default receipt search days"
                    onChange={(value) =>
                      setOptionsDraft((current) => ({
                        ...current,
                        defaultReceiptSearchDays: Number(value) || 0
                      }))
                    }
                    type="number"
                    value={optionsDraft.defaultReceiptSearchDays}
                  />
                  <Field
                    label="Shift float prompt amount"
                    onChange={(value) =>
                      setOptionsDraft((current) => ({
                        ...current,
                        shiftFloatPromptAmount: Number(value) || 0
                      }))
                    }
                    type="number"
                    value={optionsDraft.shiftFloatPromptAmount}
                  />
                </div>
              </SettingsFormCard>
            ) : null}

            {companyTab === "sms" ? (
              <SettingsFormCard
                actionLabel="Save SMS"
                actionToneClassName="bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))]"
                mutationState={smsState}
                onSave={() =>
                  void saveSection(
                    "/api/settings/sms",
                    smsDraft,
                    setSmsState,
                    () => router.refresh(),
                    "Flash ERP could not update the SMS settings."
                  )
                }
                title="Sale SMS"
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <Check
                    checked={smsDraft.enabled}
                    label="Enable SMS"
                    onChange={(value) => setSmsDraft((current) => ({ ...current, enabled: value }))}
                  />
                  <Check
                    checked={smsDraft.saleSmsEnabled}
                    label="Send SMS for every sale"
                    onChange={(value) =>
                      setSmsDraft((current) => ({ ...current, saleSmsEnabled: value }))
                    }
                  />
                  <Check
                    checked={smsDraft.deliveryReportEnabled}
                    label="Delivery reports"
                    onChange={(value) =>
                      setSmsDraft((current) => ({ ...current, deliveryReportEnabled: value }))
                    }
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Provider"
                    onChange={(value) =>
                      setSmsDraft((current) => ({ ...current, providerName: value }))
                    }
                    value={smsDraft.providerName}
                  />
                  <Field
                    label="Sender ID"
                    onChange={(value) =>
                      setSmsDraft((current) => ({ ...current, senderId: value }))
                    }
                    value={smsDraft.senderId}
                  />
                  <Field
                    label="mNotify URL"
                    onChange={(value) =>
                      setSmsDraft((current) => ({ ...current, apiBaseUrl: value }))
                    }
                    value={smsDraft.apiBaseUrl}
                  />
                  <Field
                    label="API key"
                    onChange={(value) =>
                      setSmsDraft((current) => ({ ...current, apiKeyMask: value }))
                    }
                    value={smsDraft.apiKeyMask}
                  />
                  <Field
                    label="Default country code"
                    onChange={(value) =>
                      setSmsDraft((current) => ({ ...current, defaultCountryCode: value }))
                    }
                    value={smsDraft.defaultCountryCode}
                  />
                </div>
                <TextArea
                  label="Sale SMS template"
                  onChange={(value) =>
                    setSmsDraft((current) => ({ ...current, saleSmsTemplate: value }))
                  }
                  placeholder="Hi {customerFirstName}, thank you for shopping at {shopName}. Receipt {transactionNo}. Total {currencyCode} {totalAmount}."
                  value={smsDraft.saleSmsTemplate}
                />
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-stone-600">
                  {saleSmsTemplatePlaceholders.map((placeholder) => (
                    <span
                      className="rounded-full border border-stone-200 bg-stone-50 px-2 py-1"
                      key={placeholder}
                    >
                      {placeholder}
                    </span>
                  ))}
                  <span className="basis-full text-[12px] font-normal leading-5 text-stone-500">
                    {"{customerFirstName}"} uses the first word from the POS Details box.
                  </span>
                </div>
              </SettingsFormCard>
            ) : null}
          </>
        );
      case "ldap":
        return (
          <SettingsFormCard
            actionLabel="Save LDAP"
            actionToneClassName="bg-[linear-gradient(135deg,#0f766e,#115e59)]"
            mutationState={ldapState}
            onSecondaryAction={() =>
              void validateSection(
                "/api/settings/ldap/validate",
                ldapDraft,
                setLdapValidationState,
                "Flash ERP could not validate the LDAP settings."
              )
            }
            onSave={() =>
              void saveSection(
                "/api/settings/ldap",
                ldapDraft,
                setLdapState,
                () => router.refresh(),
                "Flash ERP could not update the LDAP settings."
              )
            }
            secondaryActionLabel="Validate LDAP"
            secondaryMutationState={ldapValidationState}
            title="LDAP"
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Check
                checked={ldapDraft.enabled}
                label="Enable LDAP"
                onChange={(value) => setLdapDraft((current) => ({ ...current, enabled: value }))}
              />
              <Check
                checked={ldapDraft.syncEnabled}
                label="Enable user sync"
                onChange={(value) =>
                  setLdapDraft((current) => ({ ...current, syncEnabled: value }))
                }
              />
              <Check
                checked={ldapDraft.startTls}
                label="Use StartTLS"
                onChange={(value) => setLdapDraft((current) => ({ ...current, startTls: value }))}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Server URL"
                onChange={(value) =>
                  setLdapDraft((current) => ({ ...current, serverUrl: value }))
                }
                value={ldapDraft.serverUrl}
              />
              <Field
                label="Base DN"
                onChange={(value) => setLdapDraft((current) => ({ ...current, baseDn: value }))}
                value={ldapDraft.baseDn}
              />
              <Field
                label="Bind DN"
                onChange={(value) => setLdapDraft((current) => ({ ...current, bindDn: value }))}
                value={ldapDraft.bindDn}
              />
              <Field
                label="Bind password"
                onChange={(value) =>
                  setLdapDraft((current) => ({ ...current, bindPasswordMask: value }))
                }
                value={ldapDraft.bindPasswordMask}
              />
              <Field
                label="User search base"
                onChange={(value) =>
                  setLdapDraft((current) => ({ ...current, userSearchBase: value }))
                }
                value={ldapDraft.userSearchBase}
              />
              <Field
                label="User search filter"
                onChange={(value) =>
                  setLdapDraft((current) => ({ ...current, userSearchFilter: value }))
                }
                value={ldapDraft.userSearchFilter}
              />
            </div>
          </SettingsFormCard>
        );
      case "smtp":
        return (
          <SettingsFormCard
            actionLabel="Save SMTP"
            actionToneClassName="bg-[linear-gradient(135deg,#b45309,#92400e)]"
            mutationState={smtpState}
            onSecondaryAction={() =>
              void validateSection(
                "/api/settings/smtp/validate",
                smtpDraft,
                setSmtpValidationState,
                "Flash ERP could not validate the SMTP settings."
              )
            }
            onSave={() =>
              void saveSection(
                "/api/settings/smtp",
                smtpDraft,
                setSmtpState,
                () => router.refresh(),
                "Flash ERP could not update the SMTP settings."
              )
            }
            secondaryActionLabel="Validate SMTP"
            secondaryMutationState={smtpValidationState}
            title="SMTP"
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Check
                checked={smtpDraft.enabled}
                label="Enable SMTP"
                onChange={(value) => setSmtpDraft((current) => ({ ...current, enabled: value }))}
              />
              <Check
                checked={smtpDraft.secureConnection}
                label="Secure connection"
                onChange={(value) =>
                  setSmtpDraft((current) => ({ ...current, secureConnection: value }))
                }
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Host"
                onChange={(value) => setSmtpDraft((current) => ({ ...current, host: value }))}
                value={smtpDraft.host}
              />
              <Field
                label="Port"
                onChange={(value) =>
                  setSmtpDraft((current) => ({ ...current, port: Number(value) || 0 }))
                }
                type="number"
                value={smtpDraft.port}
              />
              <Field
                label="Username"
                onChange={(value) =>
                  setSmtpDraft((current) => ({ ...current, username: value }))
                }
                value={smtpDraft.username}
              />
              <Field
                label="Password"
                onChange={(value) =>
                  setSmtpDraft((current) => ({ ...current, passwordMask: value }))
                }
                value={smtpDraft.passwordMask}
              />
              <Field
                label="From name"
                onChange={(value) =>
                  setSmtpDraft((current) => ({ ...current, fromName: value }))
                }
                value={smtpDraft.fromName}
              />
              <Field
                label="From address"
                onChange={(value) =>
                  setSmtpDraft((current) => ({ ...current, fromAddress: value }))
                }
                value={smtpDraft.fromAddress}
              />
              <Field
                label="Reply-to address"
                onChange={(value) =>
                  setSmtpDraft((current) => ({ ...current, replyToAddress: value }))
                }
                value={smtpDraft.replyToAddress}
              />
            </div>
          </SettingsFormCard>
        );
      case "sms":
        return (
          <SettingsFormCard
            actionLabel="Save SMS"
            actionToneClassName="bg-[linear-gradient(135deg,#7c3aed,#6d28d9)]"
            mutationState={smsState}
            onSecondaryAction={() =>
              void validateSection(
                "/api/settings/sms/validate",
                smsDraft,
                setSmsValidationState,
                "Flash ERP could not validate the SMS settings."
              )
            }
            onSave={() =>
              void saveSection(
                "/api/settings/sms",
                smsDraft,
                setSmsState,
                () => router.refresh(),
                "Flash ERP could not update the SMS settings."
              )
            }
            secondaryActionLabel="Validate SMS"
            secondaryMutationState={smsValidationState}
            title="SMS"
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Check
                checked={smsDraft.enabled}
                label="Enable SMS"
                onChange={(value) => setSmsDraft((current) => ({ ...current, enabled: value }))}
              />
              <Check
                checked={smsDraft.deliveryReportEnabled}
                label="Delivery reports"
                onChange={(value) =>
                  setSmsDraft((current) => ({ ...current, deliveryReportEnabled: value }))
                }
              />
              <Check
                checked={smsDraft.saleSmsEnabled}
                label="Send SMS for every sale"
                onChange={(value) =>
                  setSmsDraft((current) => ({ ...current, saleSmsEnabled: value }))
                }
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Provider"
                onChange={(value) =>
                  setSmsDraft((current) => ({ ...current, providerName: value }))
                }
                value={smsDraft.providerName}
              />
              <Field
                label="Sender ID"
                onChange={(value) =>
                  setSmsDraft((current) => ({ ...current, senderId: value }))
                }
                value={smsDraft.senderId}
              />
              <Field
                label="API base URL"
                onChange={(value) =>
                  setSmsDraft((current) => ({ ...current, apiBaseUrl: value }))
                }
                value={smsDraft.apiBaseUrl}
              />
              <Field
                label="Username"
                onChange={(value) =>
                  setSmsDraft((current) => ({ ...current, username: value }))
                }
                value={smsDraft.username}
              />
              <Field
                label="API key"
                onChange={(value) =>
                  setSmsDraft((current) => ({ ...current, apiKeyMask: value }))
                }
                value={smsDraft.apiKeyMask}
              />
              <Field
                label="Default country code"
                onChange={(value) =>
                  setSmsDraft((current) => ({ ...current, defaultCountryCode: value }))
                }
                value={smsDraft.defaultCountryCode}
              />
            </div>
          </SettingsFormCard>
        );
      case "receipt-templates":
        return setupWorkspace ? (
          <EnterpriseReceiptTemplatePanel templates={setupWorkspace.receiptTemplateRows} />
        ) : (
          <section className="glass-panel rounded-[1.35rem] p-5">
            <p className="text-sm leading-6 text-stone-600">
              Receipt template information is temporarily unavailable. Refresh the page after the
              setup workspace finishes loading.
            </p>
          </section>
        );
      case "fuel-operations":
        return (
          <SettingsFormCard
            actionLabel="Save fuel settings"
            actionToneClassName="bg-[linear-gradient(135deg,#0f766e,#115e59)]"
            mutationState={fuelOperationsState}
            onSave={() =>
              void saveSection(
                "/api/settings/fuel-operations",
                fuelOperationsDraft,
                setFuelOperationsState,
                () => router.refresh(),
                "Flash ERP could not update Fuel Operations settings."
              )
            }
            title="Fuel Operations defaults"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <SelectField
                disabled={!fuelSiteOptions.length}
                label="Default fuel sale source"
                onChange={(value) =>
                  setFuelOperationsDraft((current) => ({
                    ...current,
                    defaultSaleSourceSiteId: value || null
                  }))
                }
                options={fuelSiteOptions}
                value={fuelOperationsDraft.defaultSaleSourceSiteId ?? ""}
              />
              <SelectField
                disabled={!fuelSiteOptions.length}
                label="Default delivery dispatch site"
                onChange={(value) =>
                  setFuelOperationsDraft((current) => ({
                    ...current,
                    defaultDispatchSiteId: value || null
                  }))
                }
                options={fuelSiteOptions}
                value={fuelOperationsDraft.defaultDispatchSiteId ?? ""}
              />
              <SelectField
                label="Fuel sale receipt"
                onChange={(value) =>
                  setFuelOperationsDraft((current) => ({
                    ...current,
                    saleReceiptPaperKind: value
                  }))
                }
                options={fuelReceiptPaperOptions}
                value={fuelOperationsDraft.saleReceiptPaperKind ?? "THERMAL"}
              />
              <SelectField
                label="Station delivery receipt"
                onChange={(value) =>
                  setFuelOperationsDraft((current) => ({
                    ...current,
                    deliveryReceiptPaperKind: value
                  }))
                }
                options={fuelReceiptPaperOptions}
                value={fuelOperationsDraft.deliveryReceiptPaperKind ?? "THERMAL"}
              />
              <SelectField
                label="Sales order receipt"
                onChange={(value) =>
                  setFuelOperationsDraft((current) => ({
                    ...current,
                    salesOrderReceiptPaperKind: value
                  }))
                }
                options={fuelReceiptPaperOptions}
                value={fuelOperationsDraft.salesOrderReceiptPaperKind ?? "A4"}
              />
            </div>
          </SettingsFormCard>
        );
      case "retail-users":
        return securityWorkspace ? (
          <EnterpriseSecurityPanel mode="users" workspace={securityWorkspace} />
        ) : (
          <section className="glass-panel rounded-[1.35rem] p-5">
            <p className="text-sm leading-6 text-stone-600">
              Retail user information is temporarily unavailable. Refresh the page after the
              security workspace finishes loading.
            </p>
          </section>
        );
      case "options":
        return (
          <SettingsFormCard
            actionLabel="Save options"
            actionToneClassName="bg-[linear-gradient(135deg,#047857,#065f46)]"
            mutationState={optionsState}
            onSave={() =>
              void saveSection(
                "/api/settings/options",
                optionsDraft,
                setOptionsState,
                () => router.refresh(),
                "Flash ERP could not update the options."
              )
            }
            title="Options"
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Check
                checked={optionsDraft.allowNegativeInventory}
                label="Allow negative inventory"
                onChange={(value) =>
                  setOptionsDraft((current) => ({ ...current, allowNegativeInventory: value }))
                }
              />
              <Check
                checked={optionsDraft.allowOfflineSales}
                label="Allow offline sales"
                onChange={(value) =>
                  setOptionsDraft((current) => ({ ...current, allowOfflineSales: value }))
                }
              />
              <Check
                checked={optionsDraft.autoPrintReceipts}
                label="Auto-print receipts"
                onChange={(value) =>
                  setOptionsDraft((current) => ({ ...current, autoPrintReceipts: value }))
                }
              />
              <Check
                checked={optionsDraft.enforceSerializedScanAtPos}
                label="Enforce serialized scan"
                onChange={(value) =>
                  setOptionsDraft((current) => ({
                    ...current,
                    enforceSerializedScanAtPos: value
                  }))
                }
              />
              <Check
                checked={optionsDraft.requireCustomerForCreditSales}
                label="Require customer for credit sales"
                onChange={(value) =>
                  setOptionsDraft((current) => ({
                    ...current,
                    requireCustomerForCreditSales: value
                  }))
                }
              />
              <Check
                checked={optionsDraft.requireSupervisorForReceiptlessReturn}
                label="Require supervisor for receipt-less return"
                onChange={(value) =>
                  setOptionsDraft((current) => ({
                    ...current,
                    requireSupervisorForReceiptlessReturn: value
                  }))
                }
              />
              <Check
                checked={optionsDraft.showCriticalStocksOnStartup}
                label="Show critical stocks on startup"
                onChange={(value) =>
                  setOptionsDraft((current) => ({
                    ...current,
                    showCriticalStocksOnStartup: value
                  }))
                }
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Default receipt search days"
                onChange={(value) =>
                  setOptionsDraft((current) => ({
                    ...current,
                    defaultReceiptSearchDays: Number(value) || 0
                  }))
                }
                type="number"
                value={optionsDraft.defaultReceiptSearchDays}
              />
              <Field
                label="Shift float prompt amount"
                onChange={(value) =>
                  setOptionsDraft((current) => ({
                    ...current,
                    shiftFloatPromptAmount: Number(value) || 0
                  }))
                }
                type="number"
                value={optionsDraft.shiftFloatPromptAmount}
              />
            </div>
          </SettingsFormCard>
        );
      default:
        return null;
    }
  };

  return (
    <EnterpriseShell
      activeSection="settings"
      description={pageMeta.description}
      eyebrow="Flash ERP enterprise"
      heading={pageMeta.heading}
    >
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((card) => (
          <MetricCard icon={card.icon} key={card.label} label={card.label} value={card.value} />
        ))}
      </section>

      {renderSettingsContent(selectedView)}

      <section className="glass-panel rounded-[1.4rem] p-5">
        <p className="text-sm leading-6 text-stone-600">{pageStatusMessage}</p>
      </section>
    </EnterpriseShell>
  );
}
