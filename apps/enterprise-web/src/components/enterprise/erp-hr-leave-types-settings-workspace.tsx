"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { CalendarRange, CheckCircle2, FileCheck2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import {
  HrCheckbox,
  HrDialogFooter,
  HrFieldInput,
  HrFieldSelect,
  HrFieldTextArea,
  HrMetric,
  HrMutationNotice,
  HrStatusBadge,
  formatHrEnum,
  type HrMutationState
} from "@/components/enterprise/erp-hr-ui";
import type {
  ErpLeaveMutationResponse,
  ErpLeaveTypesSettingsWorkspaceData,
  UpsertErpLeaveTypeRequest
} from "@/server/repositories/erp-hr-leave.repository";

type LeaveTypeRow = ErpLeaveTypesSettingsWorkspaceData["leaveTypeRows"][number];

export function ErpHrLeaveTypesSettingsWorkspace({
  workspace
}: {
  workspace: ErpLeaveTypesSettingsWorkspaceData;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<UpsertErpLeaveTypeRequest>({});
  const [mutationState, setMutationState] = useState<HrMutationState>({
    status: "idle",
    message: ""
  });

  function startNew() {
    setMutationState({ status: "idle", message: "" });
    setDraft({
      code: "",
      name: "",
      description: "",
      defaultDays: 0,
      isPaid: true,
      requiresAttachment: false,
      genderEligibility: "ALL",
      status: "ACTIVE"
    });
  }

  async function save() {
    setMutationState({ status: "submitting", message: "Saving leave type..." });
    try {
      const response = await fetch("/api/human-resources/leave/types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      });
      const body = (await response.json()) as Partial<ErpLeaveMutationResponse> & {
        message?: string;
      };
      if (!response.ok) throw new Error(body.message ?? "Flash ERP could not save the leave type.");
      setMutationState({ status: "success", message: body.message ?? "Leave type saved." });
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not save the leave type."
      });
    }
  }

  const columns = useMemo<ColumnDef<LeaveTypeRow>[]>(
    () => [
      { accessorKey: "code", header: "Leave Type" },
      { accessorKey: "name", header: "Name" },
      { accessorKey: "defaultDays", header: "Default Days" },
      { accessorKey: "isPaid", header: "Paid", cell: ({ row }) => (row.original.isPaid ? "Yes" : "No") },
      {
        accessorKey: "requiresAttachment",
        header: "Attachment",
        cell: ({ row }) => (row.original.requiresAttachment ? "Required" : "Optional")
      },
      {
        accessorKey: "genderEligibility",
        header: "Eligibility",
        cell: ({ row }) => formatHrEnum(row.original.genderEligibility)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <HrStatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit leave type",
                tone: "primary",
                onSelect: () => {
                  setMutationState({ status: "idle", message: "" });
                  setDraft({ ...row.original });
                  setOpen(true);
                }
              }
            ]}
          />
        )
      }
    ],
    []
  );

  const dialog = (
    <ActionDialog
      description="Maintain reusable leave types and default annual entitlements."
      onOpenChange={(next) => {
        if (next && !open) startNew();
        setOpen(next);
      }}
      open={open}
      title="Leave Type"
      triggerClassName="rounded-xl"
      triggerIcon={Plus}
      triggerLabel="New Leave Type"
      widthClassName="max-w-2xl"
    >
      <div className="space-y-4">
        <HrMutationNotice state={mutationState} />
        <div className="grid gap-4 md:grid-cols-2">
          <HrFieldInput
            disabled={Boolean(draft.leaveTypeId)}
            label="Code"
            onChange={(value) => setDraft((current) => ({ ...current, code: value }))}
            value={draft.code}
          />
          <HrFieldInput
            label="Name"
            onChange={(value) => setDraft((current) => ({ ...current, name: value }))}
            value={draft.name}
          />
          <HrFieldInput
            label="Default days"
            onChange={(value) => setDraft((current) => ({ ...current, defaultDays: value }))}
            step="0.5"
            type="number"
            value={draft.defaultDays}
          />
          <HrFieldSelect
            label="Gender eligibility"
            onChange={(value) =>
              setDraft((current) => ({ ...current, genderEligibility: value }))
            }
            options={[
              { label: "All", value: "ALL" },
              { label: "Female", value: "FEMALE" },
              { label: "Male", value: "MALE" }
            ]}
            value={draft.genderEligibility}
          />
          <HrFieldSelect
            label="Status"
            onChange={(value) => setDraft((current) => ({ ...current, status: value }))}
            options={[
              { label: "Active", value: "ACTIVE" },
              { label: "Inactive", value: "INACTIVE" }
            ]}
            value={draft.status}
          />
        </div>
        <div className="flex gap-5">
          <HrCheckbox
            checked={draft.isPaid !== false}
            label="Paid leave"
            onChange={(checked) => setDraft((current) => ({ ...current, isPaid: checked }))}
          />
          <HrCheckbox
            checked={draft.requiresAttachment === true}
            label="Requires attachment"
            onChange={(checked) =>
              setDraft((current) => ({ ...current, requiresAttachment: checked }))
            }
          />
        </div>
        <HrFieldTextArea
          label="Description"
          onChange={(value) => setDraft((current) => ({ ...current, description: value }))}
          value={draft.description}
        />
        <HrDialogFooter
          isSubmitting={mutationState.status === "submitting"}
          onCancel={() => setOpen(false)}
          onSave={() => void save()}
        />
      </div>
    </ActionDialog>
  );

  const activeRows = workspace.leaveTypeRows.filter((row) => row.status === "ACTIVE");
  return (
    <EnterpriseShell
      activeSection="settings"
      description={workspace.statusMessage}
      eyebrow="Flash ERP Settings"
      heading="Leave Types"
    >
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-3">
          <HrMetric icon={CalendarRange} label="Leave Types" value={workspace.leaveTypeRows.length} />
          <HrMetric icon={CheckCircle2} label="Active" value={activeRows.length} />
          <HrMetric
            icon={FileCheck2}
            label="Attachment Required"
            value={activeRows.filter((row) => row.requiresAttachment).length}
          />
        </section>
        <HrMutationNotice state={mutationState} />
        <SharedDataGrid
          columns={columns}
          data={workspace.leaveTypeRows}
          emptyLabel="No leave types found."
          exportFileName="flash-erp-leave-types"
          initialPageSize={15}
          searchPlaceholder="Search leave types"
          toolbarActions={dialog}
        />
      </div>
    </EnterpriseShell>
  );
}
