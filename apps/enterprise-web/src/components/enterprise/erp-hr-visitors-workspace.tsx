"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { BadgeCheck, Clock3, LogIn, LogOut, Plus, UserRoundCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import { ConfirmationDialog } from "@/components/dialogs/confirmation-dialog";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import {
  HrDialogFooter,
  HrFieldInput,
  HrFieldSelect,
  HrFieldTextArea,
  HrMetric,
  HrMutationNotice,
  HrStatusBadge,
  type HrMutationState
} from "@/components/enterprise/erp-hr-ui";
import type {
  ErpVisitorMutationResponse,
  ErpVisitorWorkspaceData,
  UpsertErpVisitorVisitRequest
} from "@/server/repositories/erp-hr-visitors.repository";

type VisitorRow = ErpVisitorWorkspaceData["visitorRows"][number];

const visitorDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function datetimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formatVisitorDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return visitorDateTimeFormatter.format(date);
}

function formatVisitDuration(checkInAt: string | null, checkOutAt: string | null) {
  if (!checkInAt || !checkOutAt) return "";
  const checkIn = new Date(checkInAt).getTime();
  const checkOut = new Date(checkOutAt).getTime();
  if (!Number.isFinite(checkIn) || !Number.isFinite(checkOut) || checkOut < checkIn) return "";

  const totalMinutes = Math.round((checkOut - checkIn) / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  return [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    minutes || (!days && !hours) ? `${minutes}m` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

export function ErpHrVisitorsWorkspace({
  workspace,
  canManage
}: {
  workspace: ErpVisitorWorkspaceData;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<UpsertErpVisitorVisitRequest>({});
  const [pendingAction, setPendingAction] = useState<{
    actionType: "CHECK_IN" | "CHECK_OUT" | "CANCEL";
    row: VisitorRow;
  } | null>(null);
  const [filters, setFilters] = useState({ status: "", departmentId: "" });
  const [mutationState, setMutationState] = useState<HrMutationState>({
    status: "idle",
    message: ""
  });
  const departmentOptions = useMemo(
    () => [
      { label: "Select host department", value: "" },
      ...workspace.departmentOptions.map((department) => ({
        label: `${department.code} - ${department.name}`,
        value: department.departmentId
      }))
    ],
    [workspace.departmentOptions]
  );
  const employeeOptions = useMemo(
    () => [
      { label: "Select host employee", value: "" },
      ...workspace.employeeOptions
        .filter(
          (employee) => !draft.hostDepartmentId || employee.departmentId === draft.hostDepartmentId
        )
        .map((employee) => ({
          label: `${employee.employeeNo} - ${employee.displayName} / ${employee.departmentName}`,
          value: employee.employeeId
        }))
    ],
    [draft.hostDepartmentId, workspace.employeeOptions]
  );
  const filteredRows = useMemo(
    () =>
      workspace.visitorRows.filter((row) => {
        if (filters.status && row.status !== filters.status) return false;
        if (filters.departmentId && row.hostDepartmentId !== filters.departmentId) return false;
        return true;
      }),
    [filters, workspace.visitorRows]
  );
  const draftStatus = (draft as Partial<Pick<VisitorRow, "status">>).status;
  const isCheckedOutDraft = draftStatus === "CHECKED_OUT";
  const isReadOnlyDraft = !canManage || isCheckedOutDraft;

  function startNew() {
    setMutationState({ status: "idle", message: "" });
    setDraft({
      visitorName: "",
      phone: "",
      organization: "",
      idType: "NATIONAL_ID",
      idNumber: "",
      purpose: "",
      hostDepartmentId: "",
      hostEmployeeId: "",
      expectedAt: datetimeLocal(new Date().toISOString()),
      passNo: ""
    });
  }

  function openVisitor(row: VisitorRow) {
    setMutationState({ status: "idle", message: "" });
    setDraft({ ...row, expectedAt: datetimeLocal(row.expectedAt) });
    setOpen(true);
  }

  async function post(endpoint: string, payload: object) {
    setMutationState({ status: "submitting", message: "Saving visitor record..." });
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = (await response.json()) as Partial<ErpVisitorMutationResponse> & {
        message?: string;
      };
      if (!response.ok) throw new Error(body.message ?? "Flash ERP could not save the visitor record.");
      setMutationState({ status: "success", message: body.message ?? "Visitor record saved." });
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not save the visitor record."
      });
    }
  }

  function action(row: VisitorRow, actionType: "CHECK_IN" | "CHECK_OUT" | "CANCEL") {
    setMutationState({ status: "idle", message: "" });
    setPendingAction({ actionType, row });
  }

  async function confirmPendingAction(note: string) {
    if (!pendingAction) return;

    await post("/api/human-resources/visitors/actions", {
      visitorVisitId: pendingAction.row.visitorVisitId,
      action: pendingAction.actionType,
      note
    });
    setPendingAction(null);
  }

  const columns = useMemo<ColumnDef<VisitorRow>[]>(
    () => [
      { accessorKey: "visitorNo", header: "Visit" },
      { accessorKey: "visitorName", header: "Visitor" },
      { accessorKey: "phone", header: "Phone" },
      { accessorKey: "organization", header: "Organization" },
      {
        id: "host",
        header: "Host",
        cell: ({ row }) => row.original.hostEmployeeName ?? row.original.hostDepartmentName ?? "-"
      },
      { accessorKey: "hostDepartmentName", header: "Department" },
      {
        accessorKey: "expectedAt",
        header: "Expected",
        cell: ({ row }) => formatVisitorDateTime(row.original.expectedAt)
      },
      {
        accessorKey: "checkInAt",
        header: "Check In",
        cell: ({ row }) => formatVisitorDateTime(row.original.checkInAt)
      },
      {
        accessorKey: "checkOutAt",
        header: "Check Out",
        cell: ({ row }) => formatVisitorDateTime(row.original.checkOutAt)
      },
      {
        id: "duration",
        header: "Duration",
        cell: ({ row }) => formatVisitDuration(row.original.checkInAt, row.original.checkOutAt)
      },
      { accessorKey: "passNo", header: "Pass" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <HrStatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          if (!canManage) return null;
          const actions = [] as Array<{
            label: string;
            tone?: "default" | "primary" | "danger";
            onSelect: () => void;
          }>;
          if (row.original.status === "REGISTERED") {
            actions.push({
              label: "Edit registration",
              onSelect: () => openVisitor(row.original)
            });
            actions.push({
              label: "Check in",
              tone: "primary",
              onSelect: () => void action(row.original, "CHECK_IN")
            });
            actions.push({
              label: "Cancel visit",
              tone: "danger",
              onSelect: () => void action(row.original, "CANCEL")
            });
          }
          if (row.original.status === "CHECKED_IN") {
            actions.push({
              label: "Check out",
              tone: "primary",
              onSelect: () => void action(row.original, "CHECK_OUT")
            });
          }
          if (row.original.status === "CHECKED_OUT") {
            actions.push({
              label: "View registration",
              onSelect: () => openVisitor(row.original)
            });
          }
          return actions.length ? <GridRowActions actions={actions} /> : null;
        }
      }
    ],
    [canManage]
  );

  const dialog = (
    <ActionDialog
      description="Register the visitor, visit purpose, host, identity, and expected arrival."
      hideTrigger={!canManage}
      onOpenChange={(next) => {
        if (next && !open) startNew();
        setOpen(next);
      }}
      open={open}
      title={
        draft.visitorVisitId
          ? isCheckedOutDraft
            ? "Visitor Registration (Read-only)"
            : "Visitor Registration"
          : "New Visitor"
      }
      triggerClassName="rounded-xl"
      triggerIcon={Plus}
      triggerLabel="Register Visitor"
      widthClassName="max-w-3xl"
    >
      <div className="space-y-4">
        <HrMutationNotice state={mutationState} />
        <div className="grid gap-4 md:grid-cols-2">
          <HrFieldInput
            disabled={isReadOnlyDraft}
            label="Visitor name"
            onChange={(value) => setDraft((current) => ({ ...current, visitorName: value }))}
            value={draft.visitorName}
          />
          <HrFieldInput
            disabled={isReadOnlyDraft}
            label="Phone number"
            onChange={(value) => setDraft((current) => ({ ...current, phone: value }))}
            value={draft.phone}
          />
          <HrFieldInput
            disabled={isReadOnlyDraft}
            label="Company / organization"
            onChange={(value) => setDraft((current) => ({ ...current, organization: value }))}
            value={draft.organization}
          />
          <HrFieldSelect
            disabled={isReadOnlyDraft}
            label="ID type"
            onChange={(value) => setDraft((current) => ({ ...current, idType: value }))}
            options={[
              { label: "National ID", value: "NATIONAL_ID" },
              { label: "Passport", value: "PASSPORT" },
              { label: "Driver licence", value: "DRIVER_LICENCE" },
              { label: "Other", value: "OTHER" }
            ]}
            value={draft.idType}
          />
          <HrFieldInput
            disabled={isReadOnlyDraft}
            label="ID number"
            onChange={(value) => setDraft((current) => ({ ...current, idNumber: value }))}
            value={draft.idNumber}
          />
          <HrFieldSelect
            disabled={isReadOnlyDraft}
            label="Host department"
            onChange={(value) =>
              setDraft((current) => ({ ...current, hostDepartmentId: value, hostEmployeeId: "" }))
            }
            options={departmentOptions}
            value={draft.hostDepartmentId}
          />
          <HrFieldSelect
            disabled={isReadOnlyDraft}
            label="Person visiting"
            onChange={(value) => setDraft((current) => ({ ...current, hostEmployeeId: value }))}
            options={employeeOptions}
            value={draft.hostEmployeeId}
          />
          <HrFieldInput
            disabled={isReadOnlyDraft}
            label="Expected date and time"
            onChange={(value) => setDraft((current) => ({ ...current, expectedAt: value }))}
            type="datetime-local"
            value={draft.expectedAt as string | null}
          />
          <HrFieldInput
            disabled={isReadOnlyDraft}
            label="Visitor pass number"
            onChange={(value) => setDraft((current) => ({ ...current, passNo: value }))}
            value={draft.passNo}
          />
        </div>
        <HrFieldTextArea
          disabled={isReadOnlyDraft}
          label="Purpose of visit"
          onChange={(value) => setDraft((current) => ({ ...current, purpose: value }))}
          value={draft.purpose}
        />
        {isReadOnlyDraft ? (
          <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
            <button
              className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
              onClick={() => setOpen(false)}
              type="button"
            >
              Close
            </button>
          </div>
        ) : (
          <HrDialogFooter
            isSubmitting={mutationState.status === "submitting"}
            onCancel={() => setOpen(false)}
            onSave={() => void post("/api/human-resources/visitors", draft)}
          />
        )}
      </div>
    </ActionDialog>
  );

  return (
    <EnterpriseShell
      activeSection="human-resources"
      description={workspace.statusMessage}
      eyebrow="Flash ERP Human Resources"
      heading="Visitor Register"
    >
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HrMetric icon={UserRoundCheck} label="On Premises" value={workspace.metrics.onPremises} />
          <HrMetric icon={Clock3} label="Expected Today" value={workspace.metrics.expectedToday} />
          <HrMetric icon={LogOut} label="Checked Out Today" value={workspace.metrics.checkedOutToday} />
          <HrMetric icon={BadgeCheck} label="Overdue Checkouts" value={workspace.metrics.overdueCheckouts} />
        </section>
        <HrMutationNotice state={mutationState} />
        <section className="grid gap-3 border-y border-slate-200 bg-slate-50/60 px-4 py-3 md:grid-cols-2">
          <HrFieldSelect
            label="Visitor status"
            onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
            options={[
              { label: "All statuses", value: "" },
              { label: "Registered", value: "REGISTERED" },
              { label: "Checked in", value: "CHECKED_IN" },
              { label: "Checked out", value: "CHECKED_OUT" },
              { label: "Cancelled", value: "CANCELLED" }
            ]}
            value={filters.status}
          />
          <HrFieldSelect
            label="Host department"
            onChange={(value) => setFilters((current) => ({ ...current, departmentId: value }))}
            options={[{ label: "All departments", value: "" }, ...departmentOptions.slice(1)]}
            value={filters.departmentId}
          />
        </section>
        <SharedDataGrid
          columns={columns}
          data={filteredRows}
          emptyLabel="No visitor visits match the selected filters."
          exportFileName="flash-erp-visitor-register"
          initialPageSize={20}
          onRowSelect={openVisitor}
          searchPlaceholder="Search visitor register"
          toolbarActions={dialog}
        />
        <ConfirmationDialog
          confirmLabel={
            pendingAction?.actionType === "CHECK_IN"
              ? "Check in"
              : pendingAction?.actionType === "CHECK_OUT"
                ? "Check out"
                : "Cancel visit"
          }
          description={
            pendingAction ? (
              <span>
                {pendingAction.actionType === "CHECK_IN"
                  ? "Confirm that this visitor has arrived and should be marked on premises."
                  : pendingAction.actionType === "CHECK_OUT"
                    ? "Confirm that this visitor has left the premises."
                    : "Cancel this visitor registration and keep the cancellation reason for audit."}
              </span>
            ) : null
          }
          isSubmitting={mutationState.status === "submitting"}
          noteLabel={pendingAction?.actionType === "CANCEL" ? "Cancellation reason" : undefined}
          notePlaceholder="Reason for cancelling this visit"
          noteRequired={pendingAction?.actionType === "CANCEL"}
          onCancel={() => setPendingAction(null)}
          onConfirm={(note) => void confirmPendingAction(note)}
          open={Boolean(pendingAction)}
          title={
            pendingAction
              ? `${pendingAction.actionType === "CHECK_IN" ? "Check in" : pendingAction.actionType === "CHECK_OUT" ? "Check out" : "Cancel"} ${pendingAction.row.visitorNo}`
              : "Confirm visitor action"
          }
          tone={pendingAction?.actionType === "CANCEL" ? "danger" : "success"}
        />
      </div>
    </EnterpriseShell>
  );
}
