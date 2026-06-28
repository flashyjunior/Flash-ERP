"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Banknote, Building2, Plus, Trash2, UserCheck, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import {
  HrDialogFooter,
  HrCheckbox,
  HrFieldInput,
  HrFieldSelect,
  HrFieldTextArea,
  HrMetric,
  HrMutationNotice,
  HrStatusBadge,
  type HrMutationState
} from "@/components/enterprise/erp-hr-ui";
import type {
  ErpEmployeeMutationResponse,
  ErpEmployeesWorkspaceData,
  UpsertErpEmployeeCompensationRequest,
  UpsertErpEmployeeRequest
} from "@/server/repositories/erp-hr-employees.repository";

type EmployeeRow = ErpEmployeesWorkspaceData["employeeRows"][number];
type EmployeeDialogTab = "personal" | "employment" | "payroll";
type PayItemDraft = NonNullable<UpsertErpEmployeeCompensationRequest["payItems"]>[number];

const today = new Date().toISOString().slice(0, 10);

export function ErpHrEmployeesWorkspace({ workspace, canManageDocuments }: { workspace: ErpEmployeesWorkspaceData; canManageDocuments: boolean }) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState<EmployeeDialogTab>("personal");
  const [readOnly, setReadOnly] = useState(false);
  const [employeeDraft, setEmployeeDraft] = useState<UpsertErpEmployeeRequest>({});
  const [compensationDraft, setCompensationDraft] =
    useState<UpsertErpEmployeeCompensationRequest>({});
  const [mutationState, setMutationState] = useState<HrMutationState>({ status: "idle", message: "" });

  const departmentOptions = useMemo(() => [
    { label: "Select department", value: "" },
    ...workspace.departmentOptions.map((row) => ({ label: `${row.code} - ${row.name}${row.status === "ACTIVE" ? "" : " (Inactive)"}`, value: row.departmentId }))
  ], [workspace.departmentOptions]);
  const positionOptions = useMemo(() => [
    { label: "Select position", value: "" },
    ...workspace.positionOptions
      .filter((row) => !employeeDraft.departmentId || row.departmentId === employeeDraft.departmentId)
      .map((row) => ({ label: `${row.code} - ${row.title}${row.status === "ACTIVE" ? "" : " (Inactive)"}`, value: row.positionId }))
  ], [employeeDraft.departmentId, workspace.positionOptions]);
  const categoryOptions = useMemo(() => [
    { label: "Select category", value: "" },
    ...workspace.employeeCategoryOptions.map((row) => ({ label: `${row.code} - ${row.name}`, value: row.employeeCategoryId }))
  ], [workspace.employeeCategoryOptions]);
  const storeOptions = useMemo(() => [
    { label: "No primary shop", value: "" },
    ...workspace.storeOptions.map((row) => ({ label: `${row.code} - ${row.name}`, value: row.storeId }))
  ], [workspace.storeOptions]);
  const userOptions = useMemo(() => [
    { label: "No application login", value: "" },
    ...workspace.userOptions.map((row) => ({ label: `${row.displayName} (${row.loginId})`, value: row.retailUserId }))
  ], [workspace.userOptions]);
  const managerOptions = useMemo(() => [
    { label: "No reporting manager", value: "" },
    ...workspace.employeeRows
      .filter((row) => row.status === "ACTIVE" && row.employeeId !== employeeDraft.employeeId)
      .map((row) => ({ label: `${row.employeeNo} - ${row.displayName}`, value: row.employeeId }))
  ], [employeeDraft.employeeId, workspace.employeeRows]);
  const currencyOptions = useMemo(() => workspace.currencyOptions.map((row) => ({ label: `${row.code} - ${row.name}`, value: row.code })), [workspace.currencyOptions]);

  function newEmployee() {
    setReadOnly(false);
    setDialogTab("personal");
    setMutationState({ status: "idle", message: "" });
    const department = workspace.departmentOptions.find((row) => row.status === "ACTIVE");
    const position = workspace.positionOptions.find((row) => row.status === "ACTIVE" && row.departmentId === department?.departmentId);
    setEmployeeDraft({
      firstName: "",
      middleName: "",
      lastName: "",
      displayName: "",
      gender: "UNDISCLOSED",
      departmentId: department?.departmentId ?? "",
      positionId: position?.positionId ?? "",
      employeeCategoryId: workspace.employeeCategoryOptions.find((row) => row.status === "ACTIVE")?.employeeCategoryId ?? "",
      employmentDate: today,
      salaryType: "SALARIED",
      status: "ACTIVE",
      countryCode: "GH"
    });
    setCompensationDraft({
      basicSalary: 0,
      currencyCode: workspace.currencyOptions[0]?.code ?? workspace.currencyCode,
      paymentFrequency: "MONTHLY",
      taxResidency: "RESIDENT",
      monthlyTaxRelief: 0,
      pensionStatus: "CONTRIBUTING",
      status: "ACTIVE",
      payItems: []
    });
  }

  function openEmployee(row: EmployeeRow) {
    setReadOnly(!workspace.canManageEmployees);
    setDialogTab("personal");
    setMutationState({ status: "idle", message: "" });
    setEmployeeDraft({
      employeeId: row.employeeId,
      retailUserId: row.retailUserId,
      primaryStoreId: row.primaryStoreId,
      departmentId: row.departmentId,
      positionId: row.positionId,
      employeeCategoryId: row.employeeCategoryId,
      reportingManagerId: row.reportingManagerId,
      headDepartmentId: row.headDepartmentId,
      firstName: row.firstName,
      middleName: row.middleName,
      lastName: row.lastName,
      displayName: row.displayName,
      gender: row.gender,
      dateOfBirth: row.dateOfBirth,
      phone: row.phone,
      email: row.email,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      region: row.region,
      countryCode: row.countryCode,
      emergencyContactName: row.emergencyContactName,
      emergencyContactPhone: row.emergencyContactPhone,
      emergencyContactRelation: row.emergencyContactRelation,
      employmentDate: row.employmentDate,
      salaryType: row.salaryType,
      status: row.status
    });
    setCompensationDraft({
      employeeId: row.employeeId,
      basicSalary: row.basicSalary ?? 0,
      currencyCode: row.currencyCode ?? workspace.currencyCode,
      paymentFrequency: row.paymentFrequency ?? "MONTHLY",
      taxResidency: row.taxResidency ?? "RESIDENT",
      monthlyTaxRelief: row.monthlyTaxRelief ?? 0,
      pensionStatus: row.pensionStatus ?? "CONTRIBUTING",
      tier2TrusteeName: row.tier2TrusteeName,
      tier2MemberNo: row.tier2MemberNo,
      taxId: row.taxId,
      ssnitId: row.ssnitId,
      bankName: row.bankName,
      bankBranch: row.bankBranch,
      bankAccountName: row.bankAccountName,
      bankAccountNo: row.bankAccountNo,
      status: "ACTIVE",
      payItems: row.payItems.map((item) => ({ ...item }))
    });
    setIsDialogOpen(true);
  }

  async function postJson(endpoint: string, payload: object) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json()) as Partial<ErpEmployeeMutationResponse> & { message?: string };
    if (!response.ok) throw new Error(body.message ?? "Flash ERP could not save the employee record.");
    return body as ErpEmployeeMutationResponse;
  }

  async function saveEmployee() {
    setMutationState({ status: "submitting", message: "Saving employee record..." });
    try {
      let employeeId = employeeDraft.employeeId ?? null;
      let employeeNo = "";
      if (workspace.canManageEmployees) {
        const result = await postJson("/api/human-resources/employees", employeeDraft);
        employeeId = result.employeeId;
        employeeNo = result.employeeNo;
      }
      if (workspace.canManageCompensation && employeeId) {
        const result = await postJson("/api/human-resources/employees/compensation", {
          ...compensationDraft,
          employeeId
        });
        employeeNo ||= result.employeeNo;
      }
      if (!employeeId) throw new Error("Flash ERP needs employee-maintenance permission to create this record.");
      setMutationState({ status: "success", message: `Flash ERP saved employee ${employeeNo}.` });
      setIsDialogOpen(false);
      router.refresh();
    } catch (error) {
      setMutationState({ status: "error", message: error instanceof Error ? error.message : "Flash ERP could not save the employee." });
    }
  }

  function updatePayItem(index: number, patch: Partial<PayItemDraft>) {
    setCompensationDraft((current) => ({
      ...current,
      payItems: (current.payItems ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)
    }));
  }

  const columns = useMemo<ColumnDef<EmployeeRow>[]>(() => [
    { accessorKey: "employeeNo", header: "Employee ID" },
    { accessorKey: "displayName", header: "Employee" },
    { id: "department", header: "Department", cell: ({ row }) => `${row.original.departmentCode} - ${row.original.departmentName}` },
    { accessorKey: "positionTitle", header: "Job Title" },
    { accessorKey: "employeeCategoryName", header: "Category" },
    { id: "shop", header: "Primary Shop", cell: ({ row }) => row.original.storeName ?? "Not assigned" },
    { id: "manager", header: "Manager", cell: ({ row }) => row.original.reportingManagerName ?? "Not assigned" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <HrStatusBadge value={row.original.status} /> },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => <GridRowActions actions={[
        { label: workspace.canManageEmployees ? "Edit employee" : "View employee", tone: "primary", onSelect: () => openEmployee(row.original) },
        ...(canManageDocuments ? [{ label: "Open HR documents", onSelect: () => router.push(`/human-resources/documents?employeeId=${encodeURIComponent(row.original.employeeId)}`) }] : [])
      ]} />
    }
  ], [canManageDocuments, router, workspace.canManageEmployees]);

  const dialog = (
    <ActionDialog
      description="Maintain the staff record, reporting assignment, optional login, and protected payroll setup."
      onOpenChange={(open) => { if (open && !isDialogOpen) newEmployee(); setIsDialogOpen(open); }}
      open={isDialogOpen}
      title={employeeDraft.employeeId ? `${employeeDraft.displayName ?? "Employee"} / ${workspace.employeeRows.find((row) => row.employeeId === employeeDraft.employeeId)?.employeeNo ?? ""}` : "New employee"}
      triggerIcon={Plus}
      triggerLabel="New Employee"
      triggerClassName="rounded-xl"
      widthClassName="max-w-5xl"
      hideTrigger={!workspace.canManageEmployees}
    >
      <div className="space-y-4">
        <HrMutationNotice state={mutationState} />
        <div className="flex flex-wrap gap-1 rounded-xl border border-stone-200 bg-stone-100 p-1">
          {(["personal", "employment", ...(workspace.canViewCompensation ? ["payroll"] : [])] as EmployeeDialogTab[]).map((tab) => (
            <button className={`rounded px-3 py-2 text-sm font-semibold ${dialogTab === tab ? "bg-white text-stone-950 shadow-sm" : "text-stone-600"}`} key={tab} onClick={() => setDialogTab(tab)} type="button">
              {tab === "personal" ? "Personal" : tab === "employment" ? "Employment" : "Payroll Setup"}
            </button>
          ))}
        </div>

        {dialogTab === "personal" ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <HrFieldInput disabled={readOnly} label="First name" onChange={(value) => setEmployeeDraft((current) => ({ ...current, firstName: value }))} value={employeeDraft.firstName} />
              <HrFieldInput disabled={readOnly} label="Middle name" onChange={(value) => setEmployeeDraft((current) => ({ ...current, middleName: value }))} value={employeeDraft.middleName} />
              <HrFieldInput disabled={readOnly} label="Last name" onChange={(value) => setEmployeeDraft((current) => ({ ...current, lastName: value }))} value={employeeDraft.lastName} />
              <HrFieldInput disabled={readOnly} label="Display name" onChange={(value) => setEmployeeDraft((current) => ({ ...current, displayName: value }))} value={employeeDraft.displayName} />
              <HrFieldSelect disabled={readOnly} label="Gender" onChange={(value) => setEmployeeDraft((current) => ({ ...current, gender: value }))} options={[{ label: "Undisclosed", value: "UNDISCLOSED" }, { label: "Female", value: "FEMALE" }, { label: "Male", value: "MALE" }, { label: "Other", value: "OTHER" }]} value={employeeDraft.gender} />
              <HrFieldInput disabled={readOnly} label="Date of birth" onChange={(value) => setEmployeeDraft((current) => ({ ...current, dateOfBirth: value }))} type="date" value={employeeDraft.dateOfBirth as string | null} />
              <HrFieldInput disabled={readOnly} label="Phone" onChange={(value) => setEmployeeDraft((current) => ({ ...current, phone: value }))} type="tel" value={employeeDraft.phone} />
              <HrFieldInput disabled={readOnly} label="Email" onChange={(value) => setEmployeeDraft((current) => ({ ...current, email: value }))} type="email" value={employeeDraft.email} />
              <HrFieldInput disabled={readOnly} label="Country" onChange={(value) => setEmployeeDraft((current) => ({ ...current, countryCode: value }))} value={employeeDraft.countryCode} />
              <HrFieldInput disabled={readOnly} label="Address line 1" onChange={(value) => setEmployeeDraft((current) => ({ ...current, addressLine1: value }))} value={employeeDraft.addressLine1} />
              <HrFieldInput disabled={readOnly} label="Address line 2" onChange={(value) => setEmployeeDraft((current) => ({ ...current, addressLine2: value }))} value={employeeDraft.addressLine2} />
              <HrFieldInput disabled={readOnly} label="City" onChange={(value) => setEmployeeDraft((current) => ({ ...current, city: value }))} value={employeeDraft.city} />
              <HrFieldInput disabled={readOnly} label="Region" onChange={(value) => setEmployeeDraft((current) => ({ ...current, region: value }))} value={employeeDraft.region} />
            </div>
            <div className="border-t border-stone-200 pt-4">
              <h3 className="mb-3 text-sm font-semibold text-stone-950">Emergency contact</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <HrFieldInput disabled={readOnly} label="Contact name" onChange={(value) => setEmployeeDraft((current) => ({ ...current, emergencyContactName: value }))} value={employeeDraft.emergencyContactName} />
                <HrFieldInput disabled={readOnly} label="Contact phone" onChange={(value) => setEmployeeDraft((current) => ({ ...current, emergencyContactPhone: value }))} type="tel" value={employeeDraft.emergencyContactPhone} />
                <HrFieldInput disabled={readOnly} label="Relationship" onChange={(value) => setEmployeeDraft((current) => ({ ...current, emergencyContactRelation: value }))} value={employeeDraft.emergencyContactRelation} />
              </div>
            </div>
          </div>
        ) : null}

        {dialogTab === "employment" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <HrFieldSelect disabled={readOnly} label="Department" onChange={(value) => setEmployeeDraft((current) => ({ ...current, departmentId: value, positionId: "" }))} options={departmentOptions} value={employeeDraft.departmentId} />
            <HrFieldSelect disabled={readOnly} label="Position / job title" onChange={(value) => setEmployeeDraft((current) => ({ ...current, positionId: value }))} options={positionOptions} value={employeeDraft.positionId} />
            <HrFieldSelect disabled={readOnly} label="Employee category" onChange={(value) => setEmployeeDraft((current) => ({ ...current, employeeCategoryId: value }))} options={categoryOptions} value={employeeDraft.employeeCategoryId} />
            <HrFieldSelect disabled={readOnly} label="Reporting manager" onChange={(value) => setEmployeeDraft((current) => ({ ...current, reportingManagerId: value || null }))} options={managerOptions} value={employeeDraft.reportingManagerId} />
            <HrFieldSelect disabled={readOnly} label="Primary shop / site" onChange={(value) => setEmployeeDraft((current) => ({ ...current, primaryStoreId: value || null }))} options={storeOptions} value={employeeDraft.primaryStoreId} />
            <HrFieldSelect disabled={readOnly} label="Application login" onChange={(value) => setEmployeeDraft((current) => ({ ...current, retailUserId: value || null }))} options={userOptions} value={employeeDraft.retailUserId} />
            <HrFieldInput disabled={readOnly} label="Employment date" onChange={(value) => setEmployeeDraft((current) => ({ ...current, employmentDate: value }))} type="date" value={employeeDraft.employmentDate as string | null} />
            <HrFieldSelect disabled={readOnly} label="Salary type" onChange={(value) => setEmployeeDraft((current) => ({ ...current, salaryType: value }))} options={[{ label: "Salaried", value: "SALARIED" }, { label: "Hourly", value: "HOURLY" }, { label: "Daily", value: "DAILY" }]} value={employeeDraft.salaryType} />
            <HrFieldSelect disabled={readOnly} label="Employment status" onChange={(value) => setEmployeeDraft((current) => ({ ...current, status: value }))} options={[{ label: "Active", value: "ACTIVE" }, { label: "Inactive", value: "INACTIVE" }, { label: "Resigned", value: "RESIGNED" }, { label: "Terminated", value: "TERMINATED" }]} value={employeeDraft.status} />
            <HrFieldSelect disabled={readOnly} label="Department headed" onChange={(value) => setEmployeeDraft((current) => ({ ...current, headDepartmentId: value || null }))} options={[{ label: "Not a department head", value: "" }, ...departmentOptions.slice(1)]} value={employeeDraft.headDepartmentId} />
          </div>
        ) : null}

        {dialogTab === "payroll" && workspace.canViewCompensation ? (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <HrFieldInput disabled={!workspace.canManageCompensation} label="Basic salary" onChange={(value) => setCompensationDraft((current) => ({ ...current, basicSalary: value }))} step="0.01" type="number" value={compensationDraft.basicSalary} />
              <HrFieldSelect disabled={!workspace.canManageCompensation} label="Currency" onChange={(value) => setCompensationDraft((current) => ({ ...current, currencyCode: value }))} options={currencyOptions} value={compensationDraft.currencyCode} />
              <HrFieldSelect disabled={!workspace.canManageCompensation} label="Payment frequency" onChange={(value) => setCompensationDraft((current) => ({ ...current, paymentFrequency: value }))} options={[{ label: "Monthly", value: "MONTHLY" }, { label: "Biweekly", value: "BIWEEKLY" }, { label: "Weekly", value: "WEEKLY" }, { label: "Daily", value: "DAILY" }]} value={compensationDraft.paymentFrequency} />
              <HrFieldSelect disabled={!workspace.canManageCompensation} label="Tax residency" onChange={(value) => setCompensationDraft((current) => ({ ...current, taxResidency: value }))} options={[{ label: "Resident", value: "RESIDENT" }, { label: "Non-resident", value: "NON_RESIDENT" }]} value={compensationDraft.taxResidency} />
              <HrFieldInput disabled={!workspace.canManageCompensation} label="Monthly tax relief" onChange={(value) => setCompensationDraft((current) => ({ ...current, monthlyTaxRelief: value }))} step="0.01" type="number" value={compensationDraft.monthlyTaxRelief} />
              <HrFieldSelect disabled={!workspace.canManageCompensation} label="Pension status" onChange={(value) => setCompensationDraft((current) => ({ ...current, pensionStatus: value }))} options={[{ label: "Contributing", value: "CONTRIBUTING" }, { label: "Exempt", value: "EXEMPT" }]} value={compensationDraft.pensionStatus} />
              <HrFieldInput disabled={!workspace.canManageCompensation} label="Tax ID" onChange={(value) => setCompensationDraft((current) => ({ ...current, taxId: value }))} value={compensationDraft.taxId} />
              <HrFieldInput disabled={!workspace.canManageCompensation} label="SSNIT ID" onChange={(value) => setCompensationDraft((current) => ({ ...current, ssnitId: value }))} value={compensationDraft.ssnitId} />
              <HrFieldInput disabled={!workspace.canManageCompensation} label="Tier-2 trustee" onChange={(value) => setCompensationDraft((current) => ({ ...current, tier2TrusteeName: value }))} value={compensationDraft.tier2TrusteeName} />
              <HrFieldInput disabled={!workspace.canManageCompensation} label="Tier-2 member no." onChange={(value) => setCompensationDraft((current) => ({ ...current, tier2MemberNo: value }))} value={compensationDraft.tier2MemberNo} />
              <HrFieldInput disabled={!workspace.canManageCompensation} label="Bank name" onChange={(value) => setCompensationDraft((current) => ({ ...current, bankName: value }))} value={compensationDraft.bankName} />
              <HrFieldInput disabled={!workspace.canManageCompensation} label="Bank branch" onChange={(value) => setCompensationDraft((current) => ({ ...current, bankBranch: value }))} value={compensationDraft.bankBranch} />
              <HrFieldInput disabled={!workspace.canManageCompensation} label="Account name" onChange={(value) => setCompensationDraft((current) => ({ ...current, bankAccountName: value }))} value={compensationDraft.bankAccountName} />
              <HrFieldInput disabled={!workspace.canManageCompensation} label="Account number" onChange={(value) => setCompensationDraft((current) => ({ ...current, bankAccountNo: value }))} value={compensationDraft.bankAccountNo} />
            </div>
            <div className="border-t border-stone-200 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-950">Recurring allowances and deductions</h3>
                {workspace.canManageCompensation ? <button className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold" onClick={() => setCompensationDraft((current) => ({ ...current, payItems: [...(current.payItems ?? []), { componentType: "ALLOWANCE", code: "", name: "", calculationType: "FIXED", amount: 0, percentage: 0, isTaxable: true, isPensionable: false, status: "ACTIVE" }] }))} type="button"><Plus className="h-4 w-4" />Add item</button> : null}
              </div>
              <div className="space-y-3">
                {(compensationDraft.payItems ?? []).map((item, index) => (
                  <div className="grid gap-3 border-b border-stone-200 pb-3 md:grid-cols-[130px_110px_minmax(150px,1fr)_125px_110px_95px_105px_40px]" key={`${item.componentType}-${item.code}-${index}`}>
                    <HrFieldSelect disabled={!workspace.canManageCompensation} label="Type" onChange={(value) => updatePayItem(index, { componentType: value })} options={[{ label: "Allowance", value: "ALLOWANCE" }, { label: "Deduction", value: "DEDUCTION" }]} value={item.componentType} />
                    <HrFieldInput disabled={!workspace.canManageCompensation || Boolean((item as { payItemId?: string }).payItemId)} label="Code" onChange={(value) => updatePayItem(index, { code: value })} value={item.code} />
                    <HrFieldInput disabled={!workspace.canManageCompensation} label="Name" onChange={(value) => updatePayItem(index, { name: value })} value={item.name} />
                    <HrFieldSelect disabled={!workspace.canManageCompensation} label="Calculation" onChange={(value) => updatePayItem(index, { calculationType: value })} options={[{ label: "Fixed", value: "FIXED" }, { label: "Percentage", value: "PERCENTAGE" }]} value={item.calculationType} />
                    <HrFieldInput disabled={!workspace.canManageCompensation} label={item.calculationType === "PERCENTAGE" ? "Percent" : "Amount"} onChange={(value) => updatePayItem(index, item.calculationType === "PERCENTAGE" ? { percentage: value } : { amount: value })} step="0.01" type="number" value={item.calculationType === "PERCENTAGE" ? item.percentage : item.amount} />
                    <div className="flex items-end pb-2"><HrCheckbox checked={item.componentType === "ALLOWANCE" && item.isTaxable !== false} disabled={!workspace.canManageCompensation || item.componentType !== "ALLOWANCE"} label="Taxable" onChange={(checked) => updatePayItem(index, { isTaxable: checked })} /></div>
                    <div className="flex items-end pb-2"><HrCheckbox checked={item.componentType === "ALLOWANCE" && item.isPensionable === true} disabled={!workspace.canManageCompensation || item.componentType !== "ALLOWANCE"} label="Pensionable" onChange={(checked) => updatePayItem(index, { isPensionable: checked })} /></div>
                    <button aria-label="Remove pay item" className="mt-7 flex h-9 w-9 items-center justify-center rounded-lg text-rose-700 hover:bg-rose-50 disabled:opacity-40" disabled={!workspace.canManageCompensation} onClick={() => setCompensationDraft((current) => ({ ...current, payItems: (current.payItems ?? []).filter((_, itemIndex) => itemIndex !== index) }))} type="button"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {!readOnly && (workspace.canManageEmployees || workspace.canManageCompensation) ? <HrDialogFooter isSubmitting={mutationState.status === "submitting"} onCancel={() => setIsDialogOpen(false)} onSave={saveEmployee} /> : <div className="flex justify-end border-t border-stone-200 pt-4"><button className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold" onClick={() => setIsDialogOpen(false)} type="button">Close</button></div>}
      </div>
    </ActionDialog>
  );

  return (
    <EnterpriseShell activeSection="human-resources" description={workspace.statusMessage} eyebrow="Flash ERP Human Resources" heading="Employees">
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HrMetric icon={UsersRound} label="Active Employees" value={workspace.metrics.activeEmployees} />
          <HrMetric icon={Building2} label="Departments" value={workspace.metrics.departmentsRepresented} />
          <HrMetric icon={UserCheck} label="Shop Assigned" value={workspace.metrics.shopAssignedEmployees} />
          <HrMetric icon={Banknote} label="Linked Logins" value={workspace.metrics.linkedLoginUsers} />
        </section>
        <HrMutationNotice state={mutationState} />
        <SharedDataGrid columns={columns} data={workspace.employeeRows} emptyLabel="No employees have been registered." exportFileName="flash-erp-employees" initialPageSize={15} searchPlaceholder="Search employees" toolbarActions={dialog} />
      </div>
    </EnterpriseShell>
  );
}
