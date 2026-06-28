"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, CalendarDays, CheckCircle2, Plus, UsersRound } from "lucide-react";
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
  formatHrEnum,
  type HrMutationState
} from "@/components/enterprise/erp-hr-ui";
import type {
  CreateErpLeaveRequestRequest,
  ErpLeaveMutationResponse,
  ErpLeaveWorkspaceData,
  UpsertErpLeaveEntitlementRequest
} from "@/server/repositories/erp-hr-leave.repository";

type LeaveTab = "requests" | "balances";
type RequestRow = ErpLeaveWorkspaceData["requestRows"][number];
type EntitlementRow = ErpLeaveWorkspaceData["entitlementRows"][number];

export function ErpHrLeaveWorkspace({ workspace, canManage }: { workspace: ErpLeaveWorkspaceData; canManage: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<LeaveTab>("requests");
  const [requestOpen, setRequestOpen] = useState(false);
  const [entitlementOpen, setEntitlementOpen] = useState(false);
  const [requestDraft, setRequestDraft] = useState<CreateErpLeaveRequestRequest>({});
  const [entitlementDraft, setEntitlementDraft] = useState<UpsertErpLeaveEntitlementRequest>({});
  const [mutationState, setMutationState] = useState<HrMutationState>({ status: "idle", message: "" });

  const employeeOptions = useMemo(() => [{ label: "Select employee", value: "" }, ...workspace.employeeOptions.map((row) => ({ label: `${row.employeeNo} - ${row.displayName} / ${row.departmentName}`, value: row.employeeId }))], [workspace.employeeOptions]);
  const leaveTypeOptions = useMemo(() => [{ label: "Select leave type", value: "" }, ...workspace.leaveTypeRows.filter((row) => row.status === "ACTIVE").map((row) => ({ label: `${row.code} - ${row.name}`, value: row.leaveTypeId }))], [workspace.leaveTypeRows]);

  async function post(endpoint: string, payload: object) {
    setMutationState({ status: "submitting", message: "Saving leave record..." });
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await response.json()) as Partial<ErpLeaveMutationResponse> & { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Flash ERP could not save the leave record.");
      setMutationState({ status: "success", message: body.message ?? "Leave record saved." });
      setRequestOpen(false);
      setEntitlementOpen(false);
      router.refresh();
    } catch (error) {
      setMutationState({ status: "error", message: error instanceof Error ? error.message : "Flash ERP could not save the leave record." });
    }
  }

  async function decide(row: RequestRow, action: "SUBMIT" | "APPROVE" | "REJECT" | "CANCEL") {
    const note = window.prompt(`${formatHrEnum(action)} ${row.requestNo}. Enter an optional note:`) ?? null;
    if (note === null) return;
    if (!window.confirm(`Confirm ${action.toLowerCase()} for leave request ${row.requestNo}?`)) return;
    await post("/api/human-resources/leave/requests/decision", { leaveRequestId: row.leaveRequestId, action, note });
  }

  function newRequest() {
    setMutationState({ status: "idle", message: "" });
    const startDate = new Date().toISOString().slice(0, 10);
    setRequestDraft({ employeeId: workspace.employeeOptions[0]?.employeeId ?? "", leaveTypeId: workspace.leaveTypeRows.find((row) => row.status === "ACTIVE")?.leaveTypeId ?? "", startDate, endDate: startDate, status: "SUBMITTED", reason: "" });
  }

  function newEntitlement() {
    setMutationState({ status: "idle", message: "" });
    const leaveType = workspace.leaveTypeRows.find((row) => row.status === "ACTIVE");
    setEntitlementDraft({ employeeId: workspace.employeeOptions[0]?.employeeId ?? "", leaveTypeId: leaveType?.leaveTypeId ?? "", leaveYear: workspace.currentYear, openingDays: 0, allocatedDays: leaveType?.defaultDays ?? 0, adjustedDays: 0, status: "ACTIVE" });
  }

  const requestColumns = useMemo<ColumnDef<RequestRow>[]>(() => [
    { accessorKey: "requestNo", header: "Request" },
    { accessorKey: "employeeName", header: "Employee" },
    { accessorKey: "departmentName", header: "Department" },
    { accessorKey: "leaveTypeName", header: "Leave Type" },
    { accessorKey: "startDate", header: "From" },
    { accessorKey: "endDate", header: "To" },
    { accessorKey: "requestedDays", header: "Days" },
    { id: "approver", header: "Approver", cell: ({ row }) => row.original.approverName ?? "HR approval" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <HrStatusBadge value={row.original.status} /> },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const actions = [] as Array<{ label: string; onSelect: () => void; tone?: "default" | "primary" | "danger" }>;
        if (canManage && row.original.status === "DRAFT") actions.push({ label: "Submit", tone: "primary", onSelect: () => void decide(row.original, "SUBMIT") });
        if (canManage && row.original.status === "SUBMITTED") {
          actions.push({ label: "Approve", tone: "primary", onSelect: () => void decide(row.original, "APPROVE") });
          actions.push({ label: "Reject", tone: "danger", onSelect: () => void decide(row.original, "REJECT") });
        }
        if (canManage && ["DRAFT", "SUBMITTED", "APPROVED"].includes(row.original.status)) actions.push({ label: "Cancel", tone: "danger", onSelect: () => void decide(row.original, "CANCEL") });
        return actions.length ? <GridRowActions actions={actions} /> : null;
      }
    }
  ], [canManage]);

  const entitlementColumns = useMemo<ColumnDef<EntitlementRow>[]>(() => [
    { accessorKey: "employeeName", header: "Employee" },
    { accessorKey: "departmentName", header: "Department" },
    { accessorKey: "leaveTypeName", header: "Leave Type" },
    { accessorKey: "leaveYear", header: "Year" },
    { accessorKey: "allocatedDays", header: "Allocated" },
    { accessorKey: "pendingDays", header: "Pending" },
    { accessorKey: "usedDays", header: "Used" },
    { accessorKey: "availableDays", header: "Available" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <HrStatusBadge value={row.original.status} /> },
    { id: "actions", header: "", cell: ({ row }) => canManage ? <GridRowActions actions={[{ label: "Edit entitlement", tone: "primary", onSelect: () => { setMutationState({ status: "idle", message: "" }); setEntitlementDraft({ ...row.original }); setEntitlementOpen(true); } }]} /> : null }
  ], [canManage]);

  const requestDialog = <ActionDialog description="Create a draft or submit a day-based leave request." onOpenChange={(next) => { if (next && !requestOpen) newRequest(); setRequestOpen(next); }} open={requestOpen} title="Leave request" triggerIcon={Plus} triggerLabel="New Request" triggerClassName="rounded-xl" widthClassName="max-w-2xl" hideTrigger={!canManage}>
    <div className="space-y-4">
      <HrMutationNotice state={mutationState} />
      <div className="grid gap-4 md:grid-cols-2">
        <HrFieldSelect label="Employee" onChange={(value) => setRequestDraft((current) => ({ ...current, employeeId: value }))} options={employeeOptions} value={requestDraft.employeeId} />
        <HrFieldSelect label="Leave type" onChange={(value) => setRequestDraft((current) => ({ ...current, leaveTypeId: value }))} options={leaveTypeOptions} value={requestDraft.leaveTypeId} />
        <HrFieldInput label="Start date" onChange={(value) => setRequestDraft((current) => ({ ...current, startDate: value }))} type="date" value={requestDraft.startDate as string | null} />
        <HrFieldInput label="End date" onChange={(value) => setRequestDraft((current) => ({ ...current, endDate: value }))} type="date" value={requestDraft.endDate as string | null} />
        <HrFieldSelect label="Save as" onChange={(value) => setRequestDraft((current) => ({ ...current, status: value }))} options={[{ label: "Submit for approval", value: "SUBMITTED" }, { label: "Draft", value: "DRAFT" }]} value={requestDraft.status} />
      </div>
      <HrFieldTextArea label="Reason" onChange={(value) => setRequestDraft((current) => ({ ...current, reason: value }))} value={requestDraft.reason} />
      <HrDialogFooter isSubmitting={mutationState.status === "submitting"} onCancel={() => setRequestOpen(false)} onSave={() => void post("/api/human-resources/leave/requests", requestDraft)} />
    </div>
  </ActionDialog>;

  const entitlementDialog = <ActionDialog description="Maintain annual opening, allocated, and adjusted leave balances." onOpenChange={(next) => { if (next && !entitlementOpen) newEntitlement(); setEntitlementOpen(next); }} open={entitlementOpen} title="Leave entitlement" triggerIcon={Plus} triggerLabel="New Entitlement" triggerClassName="rounded-xl" widthClassName="max-w-2xl" hideTrigger={!canManage}>
    <div className="space-y-4">
      <HrMutationNotice state={mutationState} />
      <div className="grid gap-4 md:grid-cols-2">
        <HrFieldSelect disabled={Boolean(entitlementDraft.entitlementId)} label="Employee" onChange={(value) => setEntitlementDraft((current) => ({ ...current, employeeId: value }))} options={employeeOptions} value={entitlementDraft.employeeId} />
        <HrFieldSelect disabled={Boolean(entitlementDraft.entitlementId)} label="Leave type" onChange={(value) => setEntitlementDraft((current) => ({ ...current, leaveTypeId: value, allocatedDays: workspace.leaveTypeRows.find((row) => row.leaveTypeId === value)?.defaultDays ?? 0 }))} options={leaveTypeOptions} value={entitlementDraft.leaveTypeId} />
        <HrFieldInput disabled={Boolean(entitlementDraft.entitlementId)} label="Leave year" onChange={(value) => setEntitlementDraft((current) => ({ ...current, leaveYear: value }))} type="number" value={entitlementDraft.leaveYear} />
        <HrFieldInput label="Opening days" onChange={(value) => setEntitlementDraft((current) => ({ ...current, openingDays: value }))} step="0.5" type="number" value={entitlementDraft.openingDays} />
        <HrFieldInput label="Allocated days" onChange={(value) => setEntitlementDraft((current) => ({ ...current, allocatedDays: value }))} step="0.5" type="number" value={entitlementDraft.allocatedDays} />
        <HrFieldInput label="Adjustment" onChange={(value) => setEntitlementDraft((current) => ({ ...current, adjustedDays: value }))} step="0.5" type="number" value={entitlementDraft.adjustedDays} />
        <HrFieldSelect label="Status" onChange={(value) => setEntitlementDraft((current) => ({ ...current, status: value }))} options={[{ label: "Active", value: "ACTIVE" }, { label: "Inactive", value: "INACTIVE" }]} value={entitlementDraft.status} />
      </div>
      <HrDialogFooter isSubmitting={mutationState.status === "submitting"} onCancel={() => setEntitlementOpen(false)} onSave={() => void post("/api/human-resources/leave/entitlements", entitlementDraft)} />
    </div>
  </ActionDialog>;

  return (
    <EnterpriseShell activeSection="human-resources" description={workspace.statusMessage} eyebrow="Flash ERP Human Resources" heading="Leave Management">
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HrMetric icon={CalendarClock} label="Pending Requests" value={workspace.metrics.pendingRequests} />
          <HrMetric icon={CheckCircle2} label="Approved Requests" value={workspace.metrics.approvedRequests} />
          <HrMetric icon={UsersRound} label="Employees With Balances" value={workspace.metrics.employeesWithBalances} />
          <HrMetric icon={CalendarDays} label="Available Days" value={workspace.metrics.availableDays.toFixed(2)} />
        </section>
        <HrMutationNotice state={mutationState} />
        <div className="flex gap-1 rounded-xl border border-stone-200 bg-stone-100 p-1">
          {(["requests", "balances"] as LeaveTab[]).map((value) => <button className={`rounded px-3 py-2 text-sm font-semibold ${tab === value ? "bg-white text-stone-950 shadow-sm" : "text-stone-600"}`} key={value} onClick={() => setTab(value)} type="button">{value === "requests" ? "Requests" : "Leave Balances"}</button>)}
        </div>
        {tab === "requests" ? <SharedDataGrid columns={requestColumns} data={workspace.requestRows} emptyLabel="No leave requests found." exportFileName="flash-erp-leave-requests" initialPageSize={15} searchPlaceholder="Search leave requests" toolbarActions={requestDialog} /> : null}
        {tab === "balances" ? <SharedDataGrid columns={entitlementColumns} data={workspace.entitlementRows} emptyLabel="No leave balances found." exportFileName="flash-erp-leave-balances" initialPageSize={15} searchPlaceholder="Search leave balances" toolbarActions={entitlementDialog} /> : null}
      </div>
    </EnterpriseShell>
  );
}
