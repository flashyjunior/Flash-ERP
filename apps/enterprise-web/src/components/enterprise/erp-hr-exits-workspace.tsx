"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Clock3, LogOut, PackageCheck, Plus, Wallet } from "lucide-react";
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
  formatHrEnum,
  type HrMutationState
} from "@/components/enterprise/erp-hr-ui";
import type {
  ErpEmployeeExitMutationResponse,
  ErpEmployeeExitsWorkspaceData,
  UpsertErpEmployeeExitRequest
} from "@/server/repositories/erp-hr-exits.repository";

type ExitRow = ErpEmployeeExitsWorkspaceData["exitRows"][number];

const checklistOptions = [
  { label: "Not started", value: "NOT_STARTED" },
  { label: "In progress", value: "IN_PROGRESS" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Waived", value: "WAIVED" }
];

export function ErpHrExitsWorkspace({
  workspace,
  canManage
}: {
  workspace: ErpEmployeeExitsWorkspaceData;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<UpsertErpEmployeeExitRequest>({});
  const [pendingAction, setPendingAction] = useState<{
    actionType: "FINALIZE" | "REOPEN";
    row: ExitRow;
  } | null>(null);
  const [mutationState, setMutationState] = useState<HrMutationState>({
    status: "idle",
    message: ""
  });
  const employeeOptions = useMemo(
    () => [
      { label: "Select employee", value: "" },
      ...workspace.employeeOptions
        .filter((employee) => !employee.hasExitRecord || employee.employeeId === draft.employeeId)
        .map((employee) => ({
          label: `${employee.employeeNo} - ${employee.displayName} / ${employee.departmentName}`,
          value: employee.employeeId
        }))
    ],
    [draft.employeeId, workspace.employeeOptions]
  );

  function startNew() {
    setMutationState({ status: "idle", message: "" });
    const today = new Date().toISOString().slice(0, 10);
    setDraft({
      employeeId:
        workspace.employeeOptions.find((employee) => !employee.hasExitRecord && employee.status === "ACTIVE")
          ?.employeeId ?? "",
      exitType: "RESIGNATION",
      noticeDate: today,
      resignationDate: today,
      terminationDate: "",
      lastWorkingDate: today,
      exitReason: "",
      note: "",
      finalSettlementStatus: "NOT_STARTED",
      assetReturnStatus: "NOT_STARTED"
    });
  }

  async function post(endpoint: string, payload: object) {
    setMutationState({ status: "submitting", message: "Saving employee exit..." });
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = (await response.json()) as Partial<ErpEmployeeExitMutationResponse> & {
        message?: string;
      };
      if (!response.ok) throw new Error(body.message ?? "Flash ERP could not save the employee exit.");
      setMutationState({ status: "success", message: body.message ?? "Employee exit saved." });
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not save the employee exit."
      });
    }
  }

  function action(row: ExitRow, actionType: "FINALIZE" | "REOPEN") {
    setMutationState({ status: "idle", message: "" });
    setPendingAction({ actionType, row });
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;

    await post("/api/human-resources/exits/actions", {
      exitId: pendingAction.row.exitId,
      action: pendingAction.actionType
    });
    setPendingAction(null);
  }

  const columns = useMemo<ColumnDef<ExitRow>[]>(
    () => [
      { accessorKey: "exitNo", header: "Exit" },
      { accessorKey: "employeeNo", header: "Employee ID" },
      { accessorKey: "employeeName", header: "Employee" },
      { accessorKey: "departmentName", header: "Department" },
      {
        accessorKey: "exitType",
        header: "Type",
        cell: ({ row }) => formatHrEnum(row.original.exitType)
      },
      { accessorKey: "lastWorkingDate", header: "Last Working Date" },
      { accessorKey: "exitReason", header: "Reason" },
      {
        accessorKey: "finalSettlementStatus",
        header: "Settlement",
        cell: ({ row }) => <HrStatusBadge value={row.original.finalSettlementStatus} />
      },
      {
        accessorKey: "assetReturnStatus",
        header: "Assets",
        cell: ({ row }) => <HrStatusBadge value={row.original.assetReturnStatus} />
      },
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
          return (
            <GridRowActions
              actions={
                row.original.status === "DRAFT"
                  ? [
                      {
                        label: "Edit exit",
                        tone: "primary",
                        onSelect: () => {
                          setMutationState({ status: "idle", message: "" });
                          setDraft({ ...row.original });
                          setOpen(true);
                        }
                      },
                      {
                        label: "Finalize exit",
                        tone: "danger",
                        onSelect: () => void action(row.original, "FINALIZE")
                      }
                    ]
                  : [
                      {
                        label: "Reopen for correction",
                        onSelect: () => void action(row.original, "REOPEN")
                      }
                    ]
              }
            />
          );
        }
      }
    ],
    [canManage]
  );

  const dialog = (
    <ActionDialog
      description="Record resignation or termination details and offboarding checklist status."
      hideTrigger={!canManage}
      onOpenChange={(next) => {
        if (next && !open) startNew();
        setOpen(next);
      }}
      open={open}
      title={draft.exitId ? "Employee Exit" : "New Employee Exit"}
      triggerClassName="rounded-xl"
      triggerIcon={Plus}
      triggerLabel="New Exit"
      widthClassName="max-w-3xl"
    >
      <div className="space-y-4">
        <HrMutationNotice state={mutationState} />
        <div className="grid gap-4 md:grid-cols-2">
          <HrFieldSelect
            disabled={Boolean(draft.exitId)}
            label="Employee"
            onChange={(value) => setDraft((current) => ({ ...current, employeeId: value }))}
            options={employeeOptions}
            value={draft.employeeId}
          />
          <HrFieldSelect
            label="Exit type"
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                exitType: value,
                resignationDate: value === "RESIGNATION" ? current.resignationDate : "",
                terminationDate: value === "TERMINATION" ? current.terminationDate : ""
              }))
            }
            options={[
              { label: "Resignation", value: "RESIGNATION" },
              { label: "Termination", value: "TERMINATION" }
            ]}
            value={draft.exitType}
          />
          <HrFieldInput
            label="Notice date"
            onChange={(value) => setDraft((current) => ({ ...current, noticeDate: value }))}
            type="date"
            value={draft.noticeDate as string | null}
          />
          {draft.exitType === "TERMINATION" ? (
            <HrFieldInput
              label="Termination date"
              onChange={(value) => setDraft((current) => ({ ...current, terminationDate: value }))}
              type="date"
              value={draft.terminationDate as string | null}
            />
          ) : (
            <HrFieldInput
              label="Resignation date"
              onChange={(value) => setDraft((current) => ({ ...current, resignationDate: value }))}
              type="date"
              value={draft.resignationDate as string | null}
            />
          )}
          <HrFieldInput
            label="Last working date"
            onChange={(value) => setDraft((current) => ({ ...current, lastWorkingDate: value }))}
            type="date"
            value={draft.lastWorkingDate as string | null}
          />
          <HrFieldSelect
            label="Final settlement"
            onChange={(value) =>
              setDraft((current) => ({ ...current, finalSettlementStatus: value }))
            }
            options={checklistOptions}
            value={draft.finalSettlementStatus}
          />
          <HrFieldSelect
            label="Asset return"
            onChange={(value) => setDraft((current) => ({ ...current, assetReturnStatus: value }))}
            options={checklistOptions}
            value={draft.assetReturnStatus}
          />
        </div>
        <HrFieldTextArea
          label="Exit reason"
          onChange={(value) => setDraft((current) => ({ ...current, exitReason: value }))}
          value={draft.exitReason}
        />
        <HrFieldTextArea
          label="Note"
          onChange={(value) => setDraft((current) => ({ ...current, note: value }))}
          value={draft.note}
        />
        <HrDialogFooter
          isSubmitting={mutationState.status === "submitting"}
          onCancel={() => setOpen(false)}
          onSave={() => void post("/api/human-resources/exits", draft)}
        />
      </div>
    </ActionDialog>
  );

  return (
    <EnterpriseShell
      activeSection="human-resources"
      description={workspace.statusMessage}
      eyebrow="Flash ERP Human Resources"
      heading="Employee Exits"
    >
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HrMetric icon={Clock3} label="Draft Exits" value={workspace.metrics.draftExits} />
          <HrMetric icon={LogOut} label="Finalized" value={workspace.metrics.finalizedExits} />
          <HrMetric icon={Wallet} label="Settlement Pending" value={workspace.metrics.incompleteSettlements} />
          <HrMetric icon={PackageCheck} label="Asset Return Pending" value={workspace.metrics.outstandingAssets} />
        </section>
        <HrMutationNotice state={mutationState} />
        <SharedDataGrid
          columns={columns}
          data={workspace.exitRows}
          emptyLabel="No employee exits found."
          exportFileName="flash-erp-employee-exits"
          initialPageSize={20}
          searchPlaceholder="Search employee exits"
          toolbarActions={dialog}
        />
        <ConfirmationDialog
          confirmLabel={pendingAction?.actionType === "FINALIZE" ? "Finalize exit" : "Reopen exit"}
          description={
            pendingAction ? (
              <span>
                {pendingAction.actionType === "FINALIZE"
                  ? `This will change ${pendingAction.row.employeeName}'s employee status and lock the exit record.`
                  : `This will restore ${pendingAction.row.employeeName}'s previous employee status for correction.`}
              </span>
            ) : null
          }
          isSubmitting={mutationState.status === "submitting"}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void confirmPendingAction()}
          open={Boolean(pendingAction)}
          title={
            pendingAction
              ? `${pendingAction.actionType === "FINALIZE" ? "Finalize" : "Reopen"} ${pendingAction.row.exitNo}`
              : "Confirm exit action"
          }
          tone={pendingAction?.actionType === "FINALIZE" ? "danger" : "warning"}
        />
      </div>
    </EnterpriseShell>
  );
}
