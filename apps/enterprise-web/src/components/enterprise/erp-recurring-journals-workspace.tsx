"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  CalendarDays,
  ListChecks,
  Plus,
  Repeat2,
  Save,
  Scale,
  Send,
  type LucideIcon
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import type {
  ErpRecurringJournalMutationResponse,
  ErpRecurringJournalsWorkspaceData,
  UpsertErpRecurringJournalTemplateRequest
} from "@/server/repositories/erp-recurring-journals.repository";

type TemplateRow = ErpRecurringJournalsWorkspaceData["templateRows"][number];
type TemplateLineRow = ErpRecurringJournalsWorkspaceData["templateLineRows"][number];
type DraftRow = ErpRecurringJournalsWorkspaceData["draftRows"][number];
type DraftLineRow = ErpRecurringJournalsWorkspaceData["draftLineRows"][number];

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

function dateOnly(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
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

function emptyTemplateDraft(accountCode = "", workspace?: ErpRecurringJournalsWorkspaceData) {
  const runDate = workspace?.defaultRunDate ?? new Date().toISOString().slice(0, 10);

  return {
    templateCode: "",
    name: "",
    description: "",
    frequency: "MONTHLY",
    startDate: runDate,
    endDate: "",
    nextRunDate: runDate,
    sourceReference: "",
    journalType: "RECURRING",
    status: "ACTIVE",
    lines: [
      { accountCode, debitAmount: "", creditAmount: "", memo: "" },
      { accountCode, debitAmount: "", creditAmount: "", memo: "" }
    ]
  } satisfies UpsertErpRecurringJournalTemplateRequest;
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
    value === "ACTIVE" || value === "DRAFT"
      ? "bg-emerald-100 text-emerald-700"
      : value === "CONVERTED"
        ? "bg-indigo-100 text-indigo-700"
        : value === "INACTIVE"
          ? "bg-stone-200 text-stone-700"
          : "bg-amber-100 text-amber-700";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {formatEnumLabel(value)}
    </span>
  );
}

function MutationNotice({ state }: { state: MutationState }) {
  if (state.status === "idle") {
    return null;
  }

  return (
    <p
      className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
        state.status === "error"
          ? "bg-rose-100 text-rose-700"
          : state.status === "success"
            ? "bg-emerald-100 text-emerald-700"
            : "bg-sky-100 text-sky-700"
      }`}
    >
      {state.message}
    </p>
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

export function ErpRecurringJournalsWorkspace({
  workspace
}: {
  workspace: ErpRecurringJournalsWorkspaceData;
}) {
  const router = useRouter();
  const defaultAccountCode = workspace.accountOptions[0]?.accountCode ?? "";
  const [mutationState, setMutationState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [templateDraft, setTemplateDraft] =
    useState<UpsertErpRecurringJournalTemplateRequest>(
      emptyTemplateDraft(defaultAccountCode, workspace)
    );
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        currency: workspace.currencyCode || "USD",
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        style: "currency"
      }),
    [workspace.currencyCode]
  );
  const accountOptions = useMemo(
    () => [
      { label: "Select account", value: "" },
      ...workspace.accountOptions.map((account) => ({
        label: account.label,
        value: account.accountCode
      }))
    ],
    [workspace.accountOptions]
  );

  function updateLine(
    index: number,
    patch: NonNullable<UpsertErpRecurringJournalTemplateRequest["lines"]>[number]
  ) {
    setTemplateDraft((current) => ({
      ...current,
      lines: (current.lines ?? []).map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line
      )
    }));
  }

  function openNewTemplateDialog() {
    setTemplateDraft(emptyTemplateDraft(defaultAccountCode, workspace));
    setMutationState({ status: "idle", message: "" });
    setIsTemplateDialogOpen(true);
  }

  function openEditTemplateDialog(row: TemplateRow) {
    const lines = workspace.templateLineRows
      .filter((line) => line.templateId === row.templateId)
      .sort((left, right) => left.lineNo - right.lineNo)
      .map((line) => ({
        accountCode: line.accountCode,
        debitAmount: line.debitAmount,
        creditAmount: line.creditAmount,
        memo: line.memo ?? ""
      }));

    setTemplateDraft({
      templateId: row.templateId,
      templateCode: row.templateCode,
      name: row.name,
      description: row.description ?? "",
      frequency: row.frequency,
      startDate: dateOnly(row.startDate),
      endDate: dateOnly(row.endDate),
      nextRunDate: dateOnly(row.nextRunDate),
      sourceReference: row.sourceReference ?? "",
      journalType: row.journalType,
      status: row.status,
      lines: lines.length >= 2 ? lines : emptyTemplateDraft(defaultAccountCode, workspace).lines
    });
    setMutationState({ status: "idle", message: "" });
    setIsTemplateDialogOpen(true);
  }

  async function submitTemplate() {
    setMutationState({ status: "submitting", message: "Saving recurring journal..." });

    try {
      const response = await fetch("/api/finance/recurring-journals/templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(templateDraft)
      });
      const payload = (await response.json()) as Partial<ErpRecurringJournalMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save the recurring journal template.");
      }

      setMutationState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the recurring journal template."
      });
      setIsTemplateDialogOpen(false);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save the recurring journal template."
      });
    }
  }

  async function postJson(endpoint: string, message: string, body: Record<string, unknown> = {}) {
    setMutationState({ status: "submitting", message });

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const payload = (await response.json()) as Partial<ErpRecurringJournalMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not complete the recurring journal action.");
      }

      setMutationState({
        status: "success",
        message: payload.message ?? "Recurring journal action completed."
      });
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not complete the recurring journal action."
      });
    }
  }

  const templateColumns = useMemo<ColumnDef<TemplateRow>[]>(
    () => [
      {
        accessorKey: "templateCode",
        header: "Template"
      },
      {
        accessorKey: "name",
        header: "Name"
      },
      {
        accessorKey: "frequency",
        header: "Frequency",
        cell: ({ row }) => formatEnumLabel(row.original.frequency)
      },
      {
        accessorKey: "nextRunDate",
        header: "Next Run",
        cell: ({ row }) => formatDate(row.original.nextRunDate)
      },
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
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit template",
                onSelect: () => openEditTemplateDialog(row.original),
                tone: "primary"
              },
              {
                disabled: row.original.status !== "ACTIVE" || mutationState.status === "submitting",
                label: "Generate draft",
                onSelect: () =>
                  postJson(
                    `/api/finance/recurring-journals/templates/${row.original.templateId}/generate`,
                    `Generating ${row.original.templateCode}...`,
                    {
                      postingDate: dateOnly(row.original.nextRunDate),
                      runDate: dateOnly(row.original.nextRunDate)
                    }
                  ),
                tone: "primary"
              }
            ]}
          />
        )
      }
    ],
    [currencyFormatter, mutationState.status]
  );
  const templateLineColumns = useMemo<ColumnDef<TemplateLineRow>[]>(
    () => [
      { accessorKey: "templateCode", header: "Template" },
      { accessorKey: "lineNo", header: "Line" },
      { accessorKey: "accountCode", header: "Account" },
      { accessorKey: "accountName", header: "Name" },
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
      { accessorKey: "memo", header: "Memo" }
    ],
    [currencyFormatter]
  );
  const draftColumns = useMemo<ColumnDef<DraftRow>[]>(
    () => [
      { accessorKey: "batchNo", header: "Draft" },
      { accessorKey: "templateCode", header: "Template" },
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
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                disabled: row.original.status !== "DRAFT" || mutationState.status === "submitting",
                label: "Post draft",
                onSelect: () =>
                  postJson(
                    `/api/finance/recurring-journals/drafts/${row.original.journalBatchId}/post`,
                    `Posting ${row.original.batchNo}...`,
                    {
                      postingDate: dateOnly(row.original.postingDate)
                    }
                  ),
                tone: "primary"
              }
            ]}
          />
        )
      }
    ],
    [currencyFormatter, mutationState.status]
  );
  const draftLineColumns = useMemo<ColumnDef<DraftLineRow>[]>(
    () => [
      { accessorKey: "batchNo", header: "Draft" },
      { accessorKey: "lineNo", header: "Line" },
      { accessorKey: "accountCode", header: "Account" },
      { accessorKey: "accountName", header: "Name" },
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
      { accessorKey: "memo", header: "Memo" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      }
    ],
    [currencyFormatter]
  );

  return (
    <EnterpriseShell
      activeSection="finance"
      description={workspace.statusMessage}
      eyebrow="Flash ERP Finance"
      heading="Recurring Journals"
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            hint={`${numberFormatter.format(workspace.metrics.activeTemplates)} active template(s).`}
            icon={Repeat2}
            label="Templates"
            value={numberFormatter.format(workspace.metrics.templates)}
          />
          <MetricCard
            hint="Templates at or before their next-run date."
            icon={CalendarDays}
            label="Due"
            value={numberFormatter.format(workspace.metrics.dueTemplates)}
          />
          <MetricCard
            hint="Generated batches waiting for review and posting."
            icon={ListChecks}
            label="Drafts"
            value={numberFormatter.format(workspace.metrics.draftBatches)}
          />
          <MetricCard
            hint="Draft recurring batches already converted into posted journals."
            icon={Scale}
            label="Converted"
            value={numberFormatter.format(workspace.metrics.convertedBatches)}
          />
        </section>

        <MutationNotice state={mutationState} />

        <SharedDataGrid
          columns={templateColumns}
          data={workspace.templateRows}
          emptyLabel="No recurring journal templates have been created yet."
          exportFileName="flash-erp-recurring-journal-templates"
          initialPageSize={10}
          searchPlaceholder="Search recurring templates"
          toolbarActions={
            <div className="flex flex-wrap gap-2">
              <ActionDialog
                open={isTemplateDialogOpen}
                onOpenChange={setIsTemplateDialogOpen}
                title="Recurring journal template"
                description="Maintain reusable balanced journal lines and next-run schedule."
                triggerIcon={Plus}
                triggerLabel="New Template"
                widthClassName="max-w-5xl"
              >
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-3">
                    <DialogTextInput
                      disabled={Boolean(templateDraft.templateId)}
                      label="Template code"
                      onChange={(value) => setTemplateDraft((current) => ({ ...current, templateCode: value }))}
                      value={templateDraft.templateCode ?? ""}
                    />
                    <DialogTextInput
                      label="Name"
                      onChange={(value) => setTemplateDraft((current) => ({ ...current, name: value }))}
                      value={templateDraft.name ?? ""}
                    />
                    <DialogSelect
                      label="Frequency"
                      onChange={(value) => setTemplateDraft((current) => ({ ...current, frequency: value }))}
                      options={[
                        { label: "Weekly", value: "WEEKLY" },
                        { label: "Monthly", value: "MONTHLY" },
                        { label: "Quarterly", value: "QUARTERLY" },
                        { label: "Semi Annual", value: "SEMI_ANNUAL" },
                        { label: "Annual", value: "ANNUAL" }
                      ]}
                      value={templateDraft.frequency ?? "MONTHLY"}
                    />
                    <DialogTextInput
                      label="Start date"
                      onChange={(value) => setTemplateDraft((current) => ({ ...current, startDate: value }))}
                      type="date"
                      value={templateDraft.startDate ?? workspace.defaultRunDate}
                    />
                    <DialogTextInput
                      label="End date"
                      onChange={(value) => setTemplateDraft((current) => ({ ...current, endDate: value }))}
                      type="date"
                      value={templateDraft.endDate ?? ""}
                    />
                    <DialogTextInput
                      label="Next run"
                      onChange={(value) => setTemplateDraft((current) => ({ ...current, nextRunDate: value }))}
                      type="date"
                      value={templateDraft.nextRunDate ?? workspace.defaultRunDate}
                    />
                    <DialogSelect
                      label="Journal type"
                      onChange={(value) => setTemplateDraft((current) => ({ ...current, journalType: value }))}
                      options={[
                        { label: "Recurring", value: "RECURRING" },
                        { label: "Adjusting", value: "ADJUSTING" }
                      ]}
                      value={templateDraft.journalType ?? "RECURRING"}
                    />
                    <DialogTextInput
                      label="Source reference"
                      onChange={(value) =>
                        setTemplateDraft((current) => ({ ...current, sourceReference: value }))
                      }
                      value={templateDraft.sourceReference ?? ""}
                    />
                    <DialogSelect
                      label="Status"
                      onChange={(value) => setTemplateDraft((current) => ({ ...current, status: value }))}
                      options={[
                        { label: "Active", value: "ACTIVE" },
                        { label: "Inactive", value: "INACTIVE" },
                        { label: "Archived", value: "ARCHIVED" }
                      ]}
                      value={templateDraft.status ?? "ACTIVE"}
                    />
                  </div>
                  <DialogTextArea
                    label="Description"
                    onChange={(value) => setTemplateDraft((current) => ({ ...current, description: value }))}
                    value={templateDraft.description ?? ""}
                  />
                  <div className="space-y-3">
                    {(templateDraft.lines ?? []).map((line, index) => (
                      <div
                        className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,1fr)_auto]"
                        key={index}
                      >
                        <DialogSelect
                          label="Account"
                          onChange={(value) => updateLine(index, { accountCode: value })}
                          options={accountOptions}
                          value={line.accountCode ?? ""}
                        />
                        <DialogTextInput
                          label="Debit"
                          min="0"
                          onChange={(value) => updateLine(index, { debitAmount: value })}
                          step="0.01"
                          type="number"
                          value={line.debitAmount ?? ""}
                        />
                        <DialogTextInput
                          label="Credit"
                          min="0"
                          onChange={(value) => updateLine(index, { creditAmount: value })}
                          step="0.01"
                          type="number"
                          value={line.creditAmount ?? ""}
                        />
                        <DialogTextInput
                          label="Memo"
                          onChange={(value) => updateLine(index, { memo: value })}
                          value={line.memo ?? ""}
                        />
                        <div className="flex items-end">
                          <button
                            className="inline-flex h-11 items-center justify-center rounded-xl border border-stone-200 px-3 text-sm font-semibold text-stone-700 disabled:opacity-40"
                            disabled={(templateDraft.lines ?? []).length <= 2}
                            onClick={() =>
                              setTemplateDraft((current) => ({
                                ...current,
                                lines: (current.lines ?? []).filter((_, lineIndex) => lineIndex !== index)
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
                      setTemplateDraft((current) => ({
                        ...current,
                        lines: [
                          ...(current.lines ?? []),
                          {
                            accountCode: defaultAccountCode,
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
                  <div className="flex flex-wrap justify-end gap-3 border-t border-stone-200 pt-4">
                    <button
                      className="rounded-full border border-stone-300 px-5 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400"
                      onClick={() => setIsTemplateDialogOpen(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={mutationState.status === "submitting"}
                      onClick={() => void submitTemplate()}
                      type="button"
                    >
                      <Save className="h-4 w-4" />
                      Save
                    </button>
                  </div>
                </div>
              </ActionDialog>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-[var(--brand)] hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={mutationState.status === "submitting"}
                onClick={() =>
                  postJson("/api/finance/recurring-journals/generate-due", "Generating due journals...", {
                    dueDate: workspace.defaultRunDate
                  })
                }
                type="button"
              >
                <Repeat2 className="h-4 w-4" />
                Generate Due
              </button>
            </div>
          }
        />

        <SharedDataGrid
          columns={templateLineColumns}
          data={workspace.templateLineRows}
          emptyLabel="No recurring journal template lines found."
          exportFileName="flash-erp-recurring-journal-lines"
          initialPageSize={10}
          searchPlaceholder="Search template lines"
        />

        <SharedDataGrid
          columns={draftColumns}
          data={workspace.draftRows}
          emptyLabel="No recurring journal drafts are waiting for review."
          exportFileName="flash-erp-recurring-journal-drafts"
          initialPageSize={10}
          searchPlaceholder="Search generated drafts"
        />

        <SharedDataGrid
          columns={draftLineColumns}
          data={workspace.draftLineRows}
          emptyLabel="No recurring draft lines found."
          exportFileName="flash-erp-recurring-journal-draft-lines"
          initialPageSize={10}
          searchPlaceholder="Search draft lines"
          toolbarActions={
            <span className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700">
              <Send className="h-4 w-4 text-[var(--brand)]" />
              Drafts post through the shared GL engine
            </span>
          }
        />
      </div>
    </EnterpriseShell>
  );
}
