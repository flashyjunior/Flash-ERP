"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  BriefcaseBusiness,
  Building2,
  GitBranch,
  Plus,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import type {
  ErpHrOrganizationMutationResponse,
  ErpHrOrganizationWorkspaceData,
  UpsertErpEmployeeCategoryRequest,
  UpsertErpHrDepartmentRequest,
  UpsertErpHrPositionRequest
} from "@/server/repositories/erp-hr-organization.repository";

type DepartmentRow = ErpHrOrganizationWorkspaceData["departmentRows"][number];
type PositionRow = ErpHrOrganizationWorkspaceData["positionRows"][number];
type EmployeeCategoryRow = ErpHrOrganizationWorkspaceData["employeeCategoryRows"][number];
type OrganizationTab = "departments" | "positions" | "categories";
type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};
type OrganizationMutationPayload =
  | UpsertErpHrDepartmentRequest
  | UpsertErpHrPositionRequest
  | UpsertErpEmployeeCategoryRequest;

const emptyDepartmentDraft: UpsertErpHrDepartmentRequest = {
  code: "",
  name: "",
  description: "",
  status: "ACTIVE"
};

const emptyPositionDraft: UpsertErpHrPositionRequest = {
  departmentId: "",
  reportsToPositionId: null,
  code: "",
  title: "",
  description: "",
  status: "ACTIVE"
};

const emptyCategoryDraft: UpsertErpEmployeeCategoryRequest = {
  code: "",
  name: "",
  description: "",
  status: "ACTIVE"
};

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

function StatusBadge({ value }: { value: string }) {
  const active = value === "ACTIVE";

  return (
    <span
      className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${
        active ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-700"
      }`}
    >
      {formatEnumLabel(value)}
    </span>
  );
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <div className="flex min-h-20 items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3">
      <div>
        <p className="text-xs font-semibold uppercase text-stone-500">{label}</p>
        <p className="mt-1 text-xl font-semibold text-stone-950">{value.toLocaleString()}</p>
      </div>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 text-stone-700">
        <Icon className="h-5 w-5" />
      </div>
    </div>
  );
}

function FieldInput({
  disabled = false,
  label,
  onChange,
  placeholder,
  value
}: {
  disabled?: boolean;
  label: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  value: string | null | undefined;
}) {
  return (
    <label className="space-y-1.5 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <input
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500"
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        value={value ?? ""}
      />
    </label>
  );
}

function FieldSelect({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string | null | undefined;
}) {
  return (
    <label className="space-y-1.5 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <select
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-sky-100"
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

function FieldTextArea({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  value: string | null | undefined;
}) {
  return (
    <label className="space-y-1.5 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <textarea
        className="min-h-20 w-full resize-y rounded-xl border border-stone-300 bg-white px-3 py-2.5 outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-sky-100"
        onChange={(event) => onChange(event.target.value)}
        value={value ?? ""}
      />
    </label>
  );
}

function MutationNotice({ state }: { state: MutationState }) {
  if (state.status === "idle") {
    return null;
  }

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${
        state.status === "error"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : state.status === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-sky-200 bg-sky-50 text-sky-800"
      }`}
    >
      {state.message}
    </div>
  );
}

function DialogFooter({
  isSubmitting,
  onCancel,
  onSave
}: {
  isSubmitting: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
      <button
        className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
        onClick={onCancel}
        type="button"
      >
        Cancel
      </button>
      <button
        className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
        onClick={onSave}
        type="button"
      >
        {isSubmitting ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

export function ErpHrOrganizationWorkspace({
  workspace
}: {
  workspace: ErpHrOrganizationWorkspaceData;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<OrganizationTab>("departments");
  const [mutationState, setMutationState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [departmentDraft, setDepartmentDraft] =
    useState<UpsertErpHrDepartmentRequest>(emptyDepartmentDraft);
  const [positionDraft, setPositionDraft] =
    useState<UpsertErpHrPositionRequest>(emptyPositionDraft);
  const [categoryDraft, setCategoryDraft] =
    useState<UpsertErpEmployeeCategoryRequest>(emptyCategoryDraft);
  const [isDepartmentDialogOpen, setIsDepartmentDialogOpen] = useState(false);
  const [isPositionDialogOpen, setIsPositionDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);

  const departmentOptions = useMemo(
    () => [
      { label: "Select department", value: "" },
      ...workspace.departmentRows.map((department) => ({
        label: `${department.code} - ${department.name}${
          department.status === "ACTIVE" ? "" : " (Inactive)"
        }`,
        value: department.departmentId
      }))
    ],
    [workspace.departmentRows]
  );
  const reportsToOptions = useMemo(
    () => [
      { label: "No parent position", value: "" },
      ...workspace.positionRows
        .filter(
          (position) =>
            position.status === "ACTIVE" && position.positionId !== positionDraft.positionId
        )
        .map((position) => ({
          label: `${position.code} - ${position.title}`,
          value: position.positionId
        }))
    ],
    [positionDraft.positionId, workspace.positionRows]
  );
  const employeeOptions = useMemo(
    () => [
      { label: "No department head", value: "" },
      ...workspace.employeeOptions.map((employee) => ({
        label: `${employee.employeeNo} - ${employee.displayName}`,
        value: employee.employeeId
      }))
    ],
    [workspace.employeeOptions]
  );

  async function submitMutation(
    endpoint: string,
    payload: OrganizationMutationPayload,
    onSuccess: () => void
  ) {
    setMutationState({
      status: "submitting",
      message: "Saving organization setup..."
    });

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const body = (await response.json()) as Partial<ErpHrOrganizationMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(body.message ?? "Flash ERP could not save the HR organization record.");
      }

      setMutationState({
        status: "success",
        message: body.message ?? "Saved."
      });
      onSuccess();
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save the HR organization record."
      });
    }
  }

  function beginNewDepartment() {
    setMutationState({ status: "idle", message: "" });
    setDepartmentDraft({ ...emptyDepartmentDraft });
  }

  function beginNewPosition() {
    setMutationState({ status: "idle", message: "" });
    setPositionDraft({
      ...emptyPositionDraft,
      departmentId:
        workspace.departmentRows.find((department) => department.status === "ACTIVE")
          ?.departmentId ?? ""
    });
  }

  function beginNewCategory() {
    setMutationState({ status: "idle", message: "" });
    setCategoryDraft({ ...emptyCategoryDraft });
  }

  const departmentColumns = useMemo<ColumnDef<DepartmentRow>[]>(
    () => [
      { accessorKey: "code", header: "Department" },
      { accessorKey: "name", header: "Name" },
      {
        id: "head",
        header: "Department Head",
        cell: ({ row }) => row.original.headEmployeeName ?? "Not assigned"
      },
      {
        id: "financeDimension",
        header: "Finance Dimension",
        cell: ({ row }) => `DEPARTMENT:${row.original.financeDimensionCode}`
      },
      {
        accessorKey: "activePositionCount",
        header: "Active Positions"
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
                label: "Edit department",
                tone: "primary",
                onSelect: () => {
                  setMutationState({ status: "idle", message: "" });
                  setDepartmentDraft({
                    departmentId: row.original.departmentId,
                    code: row.original.code,
                    name: row.original.name,
                    description: row.original.description ?? "",
                    headEmployeeId: row.original.headEmployeeId,
                    status: row.original.status
                  });
                  setIsDepartmentDialogOpen(true);
                }
              }
            ]}
          />
        )
      }
    ],
    []
  );

  const positionColumns = useMemo<ColumnDef<PositionRow>[]>(
    () => [
      { accessorKey: "code", header: "Position" },
      { accessorKey: "title", header: "Job Title" },
      {
        id: "department",
        header: "Department",
        cell: ({ row }) => `${row.original.departmentCode} - ${row.original.departmentName}`
      },
      {
        id: "reportsTo",
        header: "Reports To",
        cell: ({ row }) =>
          row.original.reportsToPositionCode
            ? `${row.original.reportsToPositionCode} - ${row.original.reportsToPositionTitle}`
            : "Top level"
      },
      { accessorKey: "directReportCount", header: "Direct Reports" },
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
                label: "Edit position",
                tone: "primary",
                onSelect: () => {
                  setMutationState({ status: "idle", message: "" });
                  setPositionDraft({
                    positionId: row.original.positionId,
                    departmentId: row.original.departmentId,
                    reportsToPositionId: row.original.reportsToPositionId,
                    code: row.original.code,
                    title: row.original.title,
                    description: row.original.description ?? "",
                    status: row.original.status
                  });
                  setIsPositionDialogOpen(true);
                }
              }
            ]}
          />
        )
      }
    ],
    []
  );

  const categoryColumns = useMemo<ColumnDef<EmployeeCategoryRow>[]>(
    () => [
      { accessorKey: "code", header: "Category" },
      { accessorKey: "name", header: "Name" },
      { accessorKey: "description", header: "Description" },
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
                label: "Edit category",
                tone: "primary",
                onSelect: () => {
                  setMutationState({ status: "idle", message: "" });
                  setCategoryDraft({
                    employeeCategoryId: row.original.employeeCategoryId,
                    code: row.original.code,
                    name: row.original.name,
                    description: row.original.description ?? "",
                    status: row.original.status
                  });
                  setIsCategoryDialogOpen(true);
                }
              }
            ]}
          />
        )
      }
    ],
    []
  );

  const departmentDialog = (
    <ActionDialog
      description="Maintain the HR department and its synchronized Finance department dimension."
      onOpenChange={(open) => {
        if (open && !isDepartmentDialogOpen) {
          beginNewDepartment();
        }
        setIsDepartmentDialogOpen(open);
      }}
      open={isDepartmentDialogOpen}
      title="HR department"
      triggerIcon={Plus}
      triggerLabel="New Department"
      triggerClassName="rounded-xl"
      widthClassName="max-w-2xl"
    >
      <div className="space-y-4">
        <MutationNotice state={mutationState} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldInput
            disabled={Boolean(departmentDraft.departmentId)}
            label="Department code"
            onChange={(value) =>
              setDepartmentDraft((current) => ({ ...current, code: value }))
            }
            value={departmentDraft.code}
          />
          <FieldInput
            label="Department name"
            onChange={(value) =>
              setDepartmentDraft((current) => ({ ...current, name: value }))
            }
            value={departmentDraft.name}
          />
          <FieldSelect
            label="Status"
            onChange={(value) =>
              setDepartmentDraft((current) => ({ ...current, status: value }))
            }
            options={[
              { label: "Active", value: "ACTIVE" },
              { label: "Inactive", value: "INACTIVE" }
            ]}
            value={departmentDraft.status}
          />
          <FieldSelect
            label="Department head"
            onChange={(value) =>
              setDepartmentDraft((current) => ({
                ...current,
                headEmployeeId: value || null
              }))
            }
            options={employeeOptions}
            value={departmentDraft.headEmployeeId}
          />
        </div>
        <FieldTextArea
          label="Description"
          onChange={(value) =>
            setDepartmentDraft((current) => ({ ...current, description: value }))
          }
          value={departmentDraft.description}
        />
        <DialogFooter
          isSubmitting={mutationState.status === "submitting"}
          onCancel={() => setIsDepartmentDialogOpen(false)}
          onSave={() =>
            submitMutation("/api/human-resources/departments", departmentDraft, () =>
              setIsDepartmentDialogOpen(false)
            )
          }
        />
      </div>
    </ActionDialog>
  );

  const positionDialog = (
    <ActionDialog
      description="Maintain job titles, department ownership, and the position reporting structure."
      onOpenChange={(open) => {
        if (open && !isPositionDialogOpen) {
          beginNewPosition();
        }
        setIsPositionDialogOpen(open);
      }}
      open={isPositionDialogOpen}
      title="Job position"
      triggerIcon={Plus}
      triggerLabel="New Position"
      triggerClassName="rounded-xl"
      widthClassName="max-w-2xl"
    >
      <div className="space-y-4">
        <MutationNotice state={mutationState} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldInput
            disabled={Boolean(positionDraft.positionId)}
            label="Position code"
            onChange={(value) => setPositionDraft((current) => ({ ...current, code: value }))}
            value={positionDraft.code}
          />
          <FieldInput
            label="Job title"
            onChange={(value) => setPositionDraft((current) => ({ ...current, title: value }))}
            value={positionDraft.title}
          />
          <FieldSelect
            label="Department"
            onChange={(value) =>
              setPositionDraft((current) => ({ ...current, departmentId: value }))
            }
            options={departmentOptions}
            value={positionDraft.departmentId}
          />
          <FieldSelect
            label="Reports to position"
            onChange={(value) =>
              setPositionDraft((current) => ({
                ...current,
                reportsToPositionId: value || null
              }))
            }
            options={reportsToOptions}
            value={positionDraft.reportsToPositionId}
          />
          <FieldSelect
            label="Status"
            onChange={(value) =>
              setPositionDraft((current) => ({ ...current, status: value }))
            }
            options={[
              { label: "Active", value: "ACTIVE" },
              { label: "Inactive", value: "INACTIVE" }
            ]}
            value={positionDraft.status}
          />
        </div>
        <FieldTextArea
          label="Description"
          onChange={(value) =>
            setPositionDraft((current) => ({ ...current, description: value }))
          }
          value={positionDraft.description}
        />
        <DialogFooter
          isSubmitting={mutationState.status === "submitting"}
          onCancel={() => setIsPositionDialogOpen(false)}
          onSave={() =>
            submitMutation("/api/human-resources/positions", positionDraft, () =>
              setIsPositionDialogOpen(false)
            )
          }
        />
      </div>
    </ActionDialog>
  );

  const categoryDialog = (
    <ActionDialog
      description="Maintain the employment categories used by employee records."
      onOpenChange={(open) => {
        if (open && !isCategoryDialogOpen) {
          beginNewCategory();
        }
        setIsCategoryDialogOpen(open);
      }}
      open={isCategoryDialogOpen}
      title="Employee category"
      triggerIcon={Plus}
      triggerLabel="New Category"
      triggerClassName="rounded-xl"
      widthClassName="max-w-2xl"
    >
      <div className="space-y-4">
        <MutationNotice state={mutationState} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldInput
            disabled={Boolean(categoryDraft.employeeCategoryId)}
            label="Category code"
            onChange={(value) => setCategoryDraft((current) => ({ ...current, code: value }))}
            value={categoryDraft.code}
          />
          <FieldInput
            label="Category name"
            onChange={(value) => setCategoryDraft((current) => ({ ...current, name: value }))}
            value={categoryDraft.name}
          />
          <FieldSelect
            label="Status"
            onChange={(value) =>
              setCategoryDraft((current) => ({ ...current, status: value }))
            }
            options={[
              { label: "Active", value: "ACTIVE" },
              { label: "Inactive", value: "INACTIVE" }
            ]}
            value={categoryDraft.status}
          />
        </div>
        <FieldTextArea
          label="Description"
          onChange={(value) =>
            setCategoryDraft((current) => ({ ...current, description: value }))
          }
          value={categoryDraft.description}
        />
        <DialogFooter
          isSubmitting={mutationState.status === "submitting"}
          onCancel={() => setIsCategoryDialogOpen(false)}
          onSave={() =>
            submitMutation("/api/human-resources/employee-categories", categoryDraft, () =>
              setIsCategoryDialogOpen(false)
            )
          }
        />
      </div>
    </ActionDialog>
  );

  return (
    <EnterpriseShell
      activeSection="human-resources"
      description={workspace.statusMessage}
      eyebrow="Flash ERP Human Resources"
      heading="Departments & Positions"
    >
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={Building2}
            label="Active Departments"
            value={workspace.metrics.activeDepartments}
          />
          <Metric
            icon={BriefcaseBusiness}
            label="Active Positions"
            value={workspace.metrics.activePositions}
          />
          <Metric
            icon={UsersRound}
            label="Employee Categories"
            value={workspace.metrics.activeEmployeeCategories}
          />
          <Metric
            icon={GitBranch}
            label="Finance Mappings"
            value={workspace.metrics.mappedDepartments}
          />
        </section>

        <MutationNotice state={mutationState} />

        <div className="flex flex-wrap gap-1 rounded-xl border border-stone-200 bg-stone-100 p-1">
          {(
            [
              ["departments", "Departments", Building2],
              ["positions", "Positions", BriefcaseBusiness],
              ["categories", "Employee Categories", UsersRound]
            ] as Array<[OrganizationTab, string, LucideIcon]>
          ).map(([tab, label, Icon]) => (
            <button
              className={`inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-semibold transition ${
                activeTab === tab
                  ? "bg-white text-stone-950 shadow-sm"
                  : "text-stone-600 hover:text-stone-950"
              }`}
              key={tab}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === "departments" ? (
          <SharedDataGrid
            columns={departmentColumns}
            data={workspace.departmentRows}
            emptyLabel="No HR departments have been configured."
            exportFileName="flash-erp-hr-departments"
            initialPageSize={10}
            searchPlaceholder="Search departments"
            toolbarActions={departmentDialog}
          />
        ) : null}

        {activeTab === "positions" ? (
          <SharedDataGrid
            columns={positionColumns}
            data={workspace.positionRows}
            emptyLabel="No HR positions have been configured."
            exportFileName="flash-erp-hr-positions"
            initialPageSize={10}
            searchPlaceholder="Search positions"
            toolbarActions={positionDialog}
          />
        ) : null}

        {activeTab === "categories" ? (
          <SharedDataGrid
            columns={categoryColumns}
            data={workspace.employeeCategoryRows}
            emptyLabel="No employee categories have been configured."
            exportFileName="flash-erp-employee-categories"
            initialPageSize={10}
            searchPlaceholder="Search employee categories"
            toolbarActions={categoryDialog}
          />
        ) : null}
      </div>
    </EnterpriseShell>
  );
}
