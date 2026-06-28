"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  CalendarCheck2,
  Clock3,
  FileClock,
  LogOut,
  UserCheck,
  Users,
  UserX
} from "lucide-react";
import { useMemo, useState } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { HrMetric, HrStatusBadge, formatHrEnum } from "@/components/enterprise/erp-hr-ui";
import type { ErpHrReportingWorkspaceData } from "@/server/repositories/erp-hr-reporting.repository";

type ReportTab =
  | "overview"
  | "employees"
  | "attendance"
  | "leave-balances"
  | "leave-history"
  | "documents"
  | "exits"
  | "visitors"
  | "audit";

type EmployeeRow = ErpHrReportingWorkspaceData["employeeRows"][number];
type AttendanceRow = ErpHrReportingWorkspaceData["attendanceRows"][number];
type LeaveBalanceRow = ErpHrReportingWorkspaceData["leaveBalanceRows"][number];
type LeaveHistoryRow = ErpHrReportingWorkspaceData["leaveHistoryRows"][number];
type DocumentRow = ErpHrReportingWorkspaceData["documentRows"][number];
type ExitRow = ErpHrReportingWorkspaceData["exitRows"][number];
type VisitorRow = ErpHrReportingWorkspaceData["visitorRows"][number];
type AuditRow = ErpHrReportingWorkspaceData["auditRows"][number];

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("en-GB") : "Not set";
}

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("en-GB") : "Not set";
}

const employeeColumns: ColumnDef<EmployeeRow>[] = [
  { accessorKey: "employeeNo", header: "Employee No." },
  { accessorKey: "employeeName", header: "Employee" },
  { accessorKey: "departmentName", header: "Department" },
  { accessorKey: "position", header: "Position" },
  { accessorKey: "category", header: "Category" },
  { accessorKey: "siteCode", header: "Site" },
  { accessorKey: "employmentDate", header: "Employed", cell: ({ row }) => formatDate(row.original.employmentDate) },
  { accessorKey: "payrollReady", header: "Payroll", cell: ({ row }) => (row.original.payrollReady ? "Ready" : "Incomplete") },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <HrStatusBadge value={row.original.status} /> }
];

const attendanceColumns: ColumnDef<AttendanceRow>[] = [
  { accessorKey: "workDate", header: "Date", cell: ({ row }) => formatDate(row.original.workDate) },
  { accessorKey: "employeeNo", header: "Employee No." },
  { accessorKey: "employeeName", header: "Employee" },
  { accessorKey: "departmentName", header: "Department" },
  { accessorKey: "siteCode", header: "Site" },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <HrStatusBadge value={row.original.status} /> },
  { accessorKey: "checkInAt", header: "Check in", cell: ({ row }) => formatDateTime(row.original.checkInAt) },
  { accessorKey: "checkOutAt", header: "Check out", cell: ({ row }) => formatDateTime(row.original.checkOutAt) },
  { accessorKey: "lateMinutes", header: "Late (min)" },
  { accessorKey: "overtimeHours", header: "Overtime", cell: ({ row }) => numberFormatter.format(row.original.overtimeHours) }
];

const leaveBalanceColumns: ColumnDef<LeaveBalanceRow>[] = [
  { accessorKey: "employeeNo", header: "Employee No." },
  { accessorKey: "employeeName", header: "Employee" },
  { accessorKey: "departmentName", header: "Department" },
  { accessorKey: "siteCode", header: "Site" },
  { accessorKey: "leaveType", header: "Leave type" },
  { accessorKey: "leaveYear", header: "Year" },
  { accessorKey: "allocatedDays", header: "Allocated" },
  { accessorKey: "usedDays", header: "Used" },
  { accessorKey: "pendingDays", header: "Pending" },
  { accessorKey: "availableDays", header: "Available" }
];

const leaveHistoryColumns: ColumnDef<LeaveHistoryRow>[] = [
  { accessorKey: "requestNo", header: "Request" },
  { accessorKey: "employeeName", header: "Employee" },
  { accessorKey: "departmentName", header: "Department" },
  { accessorKey: "siteCode", header: "Site" },
  { accessorKey: "leaveType", header: "Leave type" },
  { accessorKey: "startDate", header: "Start", cell: ({ row }) => formatDate(row.original.startDate) },
  { accessorKey: "endDate", header: "End", cell: ({ row }) => formatDate(row.original.endDate) },
  { accessorKey: "requestedDays", header: "Days" },
  { accessorKey: "approverName", header: "Approver" },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <HrStatusBadge value={row.original.status} /> }
];

const documentColumns: ColumnDef<DocumentRow>[] = [
  { accessorKey: "documentNo", header: "Document" },
  { accessorKey: "employeeName", header: "Employee" },
  { accessorKey: "departmentName", header: "Department" },
  { accessorKey: "documentType", header: "Type", cell: ({ row }) => formatHrEnum(row.original.documentType) },
  { accessorKey: "title", header: "Title" },
  { accessorKey: "expiryDate", header: "Expiry", cell: ({ row }) => formatDate(row.original.expiryDate) },
  { accessorKey: "expiryState", header: "Expiry state", cell: ({ row }) => <HrStatusBadge value={row.original.expiryState} /> }
];

const exitColumns: ColumnDef<ExitRow>[] = [
  { accessorKey: "exitNo", header: "Exit" },
  { accessorKey: "employeeName", header: "Employee" },
  { accessorKey: "departmentName", header: "Department" },
  { accessorKey: "siteCode", header: "Site" },
  { accessorKey: "exitType", header: "Type", cell: ({ row }) => formatHrEnum(row.original.exitType) },
  { accessorKey: "lastWorkingDate", header: "Last working date", cell: ({ row }) => formatDate(row.original.lastWorkingDate) },
  { accessorKey: "settlementStatus", header: "Settlement", cell: ({ row }) => formatHrEnum(row.original.settlementStatus) },
  { accessorKey: "assetReturnStatus", header: "Assets", cell: ({ row }) => formatHrEnum(row.original.assetReturnStatus) },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <HrStatusBadge value={row.original.status} /> }
];

const visitorColumns: ColumnDef<VisitorRow>[] = [
  { accessorKey: "visitorNo", header: "Visit" },
  { accessorKey: "visitorName", header: "Visitor" },
  { accessorKey: "organization", header: "Organization" },
  { accessorKey: "departmentName", header: "Host department" },
  { accessorKey: "hostEmployee", header: "Host employee" },
  { accessorKey: "expectedAt", header: "Expected", cell: ({ row }) => formatDateTime(row.original.expectedAt) },
  { accessorKey: "checkInAt", header: "Check in", cell: ({ row }) => formatDateTime(row.original.checkInAt) },
  { accessorKey: "checkOutAt", header: "Check out", cell: ({ row }) => formatDateTime(row.original.checkOutAt) },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <HrStatusBadge value={row.original.status} /> }
];

const auditColumns: ColumnDef<AuditRow>[] = [
  { accessorKey: "activityDate", header: "Date/time", cell: ({ row }) => formatDateTime(row.original.activityDate) },
  { accessorKey: "area", header: "Area", cell: ({ row }) => formatHrEnum(row.original.area) },
  { accessorKey: "subject", header: "Subject" },
  { accessorKey: "action", header: "Action", cell: ({ row }) => formatHrEnum(row.original.action) },
  { accessorKey: "actor", header: "Actor" },
  { accessorKey: "detail", header: "Detail" }
];

export function ErpHrReportingWorkspace({
  initialTab = "overview",
  workspace
}: {
  initialTab?: ReportTab;
  workspace: ErpHrReportingWorkspaceData;
}) {
  const [activeTab, setActiveTab] = useState<ReportTab>(initialTab);
  const [departmentId, setDepartmentId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [dateFrom, setDateFrom] = useState(workspace.defaultDateFrom);
  const [dateTo, setDateTo] = useState(workspace.defaultDateTo);
  const tabs = useMemo(
    () =>
      [
        ["overview", "Overview"],
        ["employees", "Employees"],
        ["attendance", "Attendance"],
        ["leave-balances", "Leave balances"],
        ["leave-history", "Leave history"],
        ...(workspace.documentRows.length > 0 ? [["documents", "Document expiry"]] : []),
        ["exits", "Employee exits"],
        ...(workspace.visitorRows.length > 0 ? [["visitors", "Visitor log"]] : []),
        ["audit", "Audit review"]
      ] as Array<[ReportTab, string]>,
    [workspace.documentRows.length, workspace.visitorRows.length]
  );
  const matchesOrg = (row: { departmentId?: string | null; siteId?: string | null }) =>
    (!departmentId || row.departmentId === departmentId) && (!siteId || row.siteId === siteId);
  const matchesDate = (value: string | null | undefined) => {
    if (!value) return true;
    const day = value.slice(0, 10);
    return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
  };
  const employeeRows = workspace.employeeRows.filter(matchesOrg);
  const attendanceRows = workspace.attendanceRows.filter((row) => matchesOrg(row) && matchesDate(row.workDate));
  const leaveBalanceRows = workspace.leaveBalanceRows.filter(matchesOrg);
  const leaveHistoryRows = workspace.leaveHistoryRows.filter((row) => matchesOrg(row) && matchesDate(row.startDate));
  const documentRows = workspace.documentRows.filter((row) => matchesOrg(row) && matchesDate(row.expiryDate));
  const exitRows = workspace.exitRows.filter((row) => matchesOrg(row) && matchesDate(row.lastWorkingDate));
  const visitorRows = workspace.visitorRows.filter((row) => (!departmentId || row.departmentId === departmentId) && matchesDate(row.expectedAt ?? row.checkInAt));
  const auditRows = workspace.auditRows.filter((row) => matchesDate(row.activityDate));

  return (
    <EnterpriseShell
      activeSection="human-resources"
      description="Company-scoped HR metrics, operational reports, exports, and protected audit review."
      eyebrow="Human Resources"
      heading={initialTab === "overview" ? "HR Overview" : "HR Reports"}
    >
      <div className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <HrMetric icon={Users} label="Active headcount" value={workspace.metrics.activeHeadcount} />
          <HrMetric icon={UserCheck} label="Present today" value={workspace.metrics.presentToday} />
          <HrMetric icon={UserX} label="Absent / late" value={workspace.metrics.absentToday + workspace.metrics.lateToday} />
          <HrMetric icon={CalendarCheck2} label="Pending leave" value={workspace.metrics.pendingLeave} />
          <HrMetric icon={FileClock} label="Document attention" value={workspace.metrics.expiringDocuments} />
          <HrMetric icon={LogOut} label="Incomplete exits" value={workspace.metrics.incompleteExits} />
          <HrMetric icon={Clock3} label="Visitors on premises" value={workspace.metrics.visitorsOnPremises} />
          <HrMetric icon={AlertTriangle} label="Payroll setup gaps" value={workspace.employeeRows.filter((row) => row.status === "ACTIVE" && !row.payrollReady).length} />
        </div>

        <div className="grid gap-3 border-y border-stone-200 py-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1.5 text-sm"><span className="font-semibold text-stone-800">From</span><input className="block h-10 w-full rounded-xl border border-stone-300 bg-white px-3" onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom} /></label>
          <label className="space-y-1.5 text-sm"><span className="font-semibold text-stone-800">To</span><input className="block h-10 w-full rounded-xl border border-stone-300 bg-white px-3" onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo} /></label>
          <label className="space-y-1.5 text-sm"><span className="font-semibold text-stone-800">Department</span><select className="block h-10 w-full rounded-xl border border-stone-300 bg-white px-3" onChange={(event) => setDepartmentId(event.target.value)} value={departmentId}><option value="">All departments</option>{workspace.departmentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="space-y-1.5 text-sm"><span className="font-semibold text-stone-800">Site</span><select className="block h-10 w-full rounded-xl border border-stone-300 bg-white px-3" onChange={(event) => setSiteId(event.target.value)} value={siteId}><option value="">All sites</option>{workspace.siteOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map(([key, label]) => <button className={`rounded-xl border px-3 py-2 text-sm font-semibold ${activeTab === key ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-stone-300 bg-white text-stone-700"}`} key={key} onClick={() => setActiveTab(key)} type="button">{label}</button>)}
        </div>

        {activeTab === "overview" ? <div className="grid gap-6 xl:grid-cols-2"><section><h2 className="mb-3 text-lg font-semibold">Employee posture</h2><SharedDataGrid columns={employeeColumns} data={employeeRows} emptyLabel="No employees match these filters." exportFileName="flash-erp-hr-employee-directory" initialPageSize={8} searchPlaceholder="Search employees" /></section><section><h2 className="mb-3 text-lg font-semibold">Attendance activity</h2><SharedDataGrid columns={attendanceColumns} data={attendanceRows} emptyLabel="No attendance matches these filters." exportFileName="flash-erp-hr-attendance-summary" initialPageSize={8} searchPlaceholder="Search attendance" /></section></div> : null}
        {activeTab === "employees" ? <SharedDataGrid columns={employeeColumns} data={employeeRows} emptyLabel="No employees match these filters." exportFileName="flash-erp-hr-employee-directory" searchPlaceholder="Search employees" /> : null}
        {activeTab === "attendance" ? <SharedDataGrid columns={attendanceColumns} data={attendanceRows} emptyLabel="No attendance matches these filters." exportFileName="flash-erp-hr-attendance-summary" searchPlaceholder="Search attendance" /> : null}
        {activeTab === "leave-balances" ? <SharedDataGrid columns={leaveBalanceColumns} data={leaveBalanceRows} emptyLabel="No leave balances match these filters." exportFileName="flash-erp-hr-leave-balances" searchPlaceholder="Search balances" /> : null}
        {activeTab === "leave-history" ? <SharedDataGrid columns={leaveHistoryColumns} data={leaveHistoryRows} emptyLabel="No leave requests match these filters." exportFileName="flash-erp-hr-leave-history" searchPlaceholder="Search leave history" /> : null}
        {activeTab === "documents" ? <SharedDataGrid columns={documentColumns} data={documentRows} emptyLabel="No document expiry records match these filters." exportFileName="flash-erp-hr-document-expiry" searchPlaceholder="Search documents" /> : null}
        {activeTab === "exits" ? <SharedDataGrid columns={exitColumns} data={exitRows} emptyLabel="No exits match these filters." exportFileName="flash-erp-hr-employee-exits" searchPlaceholder="Search exits" /> : null}
        {activeTab === "visitors" ? <SharedDataGrid columns={visitorColumns} data={visitorRows} emptyLabel="No visits match these filters." exportFileName="flash-erp-hr-visitor-log" searchPlaceholder="Search visits" /> : null}
        {activeTab === "audit" ? <SharedDataGrid columns={auditColumns} data={auditRows} emptyLabel="No HR audit activity matches these filters." exportFileName="flash-erp-hr-audit-review" searchPlaceholder="Search audit activity" /> : null}
      </div>
    </EnterpriseShell>
  );
}
