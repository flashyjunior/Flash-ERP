"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { BadgeCheck, Clock3, LogIn, LogOut, Plus, UserRoundCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
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

function datetimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
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

  async function action(row: VisitorRow, actionType: "CHECK_IN" | "CHECK_OUT" | "CANCEL") {
    let note = "";
    if (actionType === "CANCEL") {
      const response = window.prompt(`Enter the cancellation reason for ${row.visitorNo}:`);
      if (response === null) return;
      note = response;
    }
    if (!window.confirm(`${actionType === "CHECK_IN" ? "Check in" : actionType === "CHECK_OUT" ? "Check out" : "Cancel"} visitor ${row.visitorNo}?`)) {
      return;
    }
    await post("/api/human-resources/visitors/actions", {
      visitorVisitId: row.visitorVisitId,
      action: actionType,
      note
    });
  }

  const columns = useMemo<ColumnDef<VisitorRow>[]>(
    () => [
      { accessorKey: "visitorNo", header: "Visit" },
      { accessorKey: "visitorName", header: "Visitor" },
      { accessorKey: "phone", header: "Phone" },
      { accessorKey: "organization", header: "Organization" },
      { accessorKey: "purpose", header: "Purpose" },
      {
        id: "host",
        header: "Host",
        cell: ({ row }) => row.original.hostEmployeeName ?? row.original.hostDepartmentName ?? "-"
      },
      { accessorKey: "hostDepartmentName", header: "Department" },
      {
        accessorKey: "expectedAt",
        header: "Expected",
        cell: ({ row }) =>
          row.original.expectedAt ? new Date(row.original.expectedAt).toLocaleString() : "-"
      },
      {
        accessorKey: "checkInAt",
        header: "Check In",
        cell: ({ row }) =>
          row.original.checkInAt ? new Date(row.original.checkInAt).toLocaleString() : "-"
      },
      {
        accessorKey: "checkOutAt",
        header: "Check Out",
        cell: ({ row }) =>
          row.original.checkOutAt ? new Date(row.original.checkOutAt).toLocaleString() : "-"
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
              onSelect: () => {
                setMutationState({ status: "idle", message: "" });
                setDraft({ ...row.original, expectedAt: datetimeLocal(row.original.expectedAt) });
                setOpen(true);
              }
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
      title={draft.visitorVisitId ? "Visitor Registration" : "New Visitor"}
      triggerClassName="rounded-xl"
      triggerIcon={Plus}
      triggerLabel="Register Visitor"
      widthClassName="max-w-3xl"
    >
      <div className="space-y-4">
        <HrMutationNotice state={mutationState} />
        <div className="grid gap-4 md:grid-cols-2">
          <HrFieldInput
            label="Visitor name"
            onChange={(value) => setDraft((current) => ({ ...current, visitorName: value }))}
            value={draft.visitorName}
          />
          <HrFieldInput
            label="Phone number"
            onChange={(value) => setDraft((current) => ({ ...current, phone: value }))}
            value={draft.phone}
          />
          <HrFieldInput
            label="Company / organization"
            onChange={(value) => setDraft((current) => ({ ...current, organization: value }))}
            value={draft.organization}
          />
          <HrFieldSelect
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
            label="ID number"
            onChange={(value) => setDraft((current) => ({ ...current, idNumber: value }))}
            value={draft.idNumber}
          />
          <HrFieldSelect
            label="Host department"
            onChange={(value) =>
              setDraft((current) => ({ ...current, hostDepartmentId: value, hostEmployeeId: "" }))
            }
            options={departmentOptions}
            value={draft.hostDepartmentId}
          />
          <HrFieldSelect
            label="Person visiting"
            onChange={(value) => setDraft((current) => ({ ...current, hostEmployeeId: value }))}
            options={employeeOptions}
            value={draft.hostEmployeeId}
          />
          <HrFieldInput
            label="Expected date and time"
            onChange={(value) => setDraft((current) => ({ ...current, expectedAt: value }))}
            type="datetime-local"
            value={draft.expectedAt as string | null}
          />
          <HrFieldInput
            label="Visitor pass number"
            onChange={(value) => setDraft((current) => ({ ...current, passNo: value }))}
            value={draft.passNo}
          />
        </div>
        <HrFieldTextArea
          label="Purpose of visit"
          onChange={(value) => setDraft((current) => ({ ...current, purpose: value }))}
          value={draft.purpose}
        />
        <HrDialogFooter
          isSubmitting={mutationState.status === "submitting"}
          onCancel={() => setOpen(false)}
          onSave={() => void post("/api/human-resources/visitors", draft)}
        />
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
          searchPlaceholder="Search visitor register"
          toolbarActions={dialog}
        />
      </div>
    </EnterpriseShell>
  );
}
