import { prisma } from "@/lib/db/prisma";
import {
  activeStatus,
  dateInputValue,
  getHrContext,
  getPrimaryHrCompany
} from "@/server/repositories/erp-hr-shared";

export type ErpHrReportingAccess = {
  includeCompensationAudit: boolean;
  includeDocuments: boolean;
  includeVisitors: boolean;
};

export type ErpHrReportingWorkspaceData = {
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  defaultDateFrom: string;
  defaultDateTo: string;
  departmentOptions: Array<{ value: string; label: string }>;
  siteOptions: Array<{ value: string; label: string }>;
  metrics: {
    activeHeadcount: number;
    presentToday: number;
    absentToday: number;
    lateToday: number;
    pendingLeave: number;
    expiringDocuments: number;
    incompleteExits: number;
    visitorsOnPremises: number;
  };
  employeeRows: Array<{
    employeeId: string;
    employeeNo: string;
    employeeName: string;
    departmentId: string;
    departmentCode: string;
    departmentName: string;
    position: string;
    category: string;
    siteId: string | null;
    siteCode: string | null;
    employmentDate: string;
    status: string;
    payrollReady: boolean;
  }>;
  attendanceRows: Array<{
    attendanceId: string;
    employeeNo: string;
    employeeName: string;
    departmentId: string;
    departmentName: string;
    siteId: string | null;
    siteCode: string | null;
    workDate: string;
    status: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    lateMinutes: number;
    overtimeHours: number;
  }>;
  leaveBalanceRows: Array<{
    entitlementId: string;
    employeeNo: string;
    employeeName: string;
    departmentId: string;
    departmentName: string;
    siteId: string | null;
    siteCode: string | null;
    leaveType: string;
    leaveYear: number;
    allocatedDays: number;
    usedDays: number;
    pendingDays: number;
    availableDays: number;
  }>;
  leaveHistoryRows: Array<{
    leaveRequestId: string;
    requestNo: string;
    employeeNo: string;
    employeeName: string;
    departmentId: string;
    departmentName: string;
    siteId: string | null;
    siteCode: string | null;
    leaveType: string;
    startDate: string;
    endDate: string;
    requestedDays: number;
    status: string;
    approverName: string | null;
  }>;
  documentRows: Array<{
    documentId: string;
    documentNo: string;
    employeeNo: string;
    employeeName: string;
    departmentId: string;
    departmentName: string;
    siteId: string | null;
    siteCode: string | null;
    documentType: string;
    title: string;
    issueDate: string | null;
    expiryDate: string | null;
    expiryState: string;
    status: string;
  }>;
  exitRows: Array<{
    exitId: string;
    exitNo: string;
    employeeNo: string;
    employeeName: string;
    departmentId: string;
    departmentName: string;
    siteId: string | null;
    siteCode: string | null;
    exitType: string;
    lastWorkingDate: string;
    settlementStatus: string;
    assetReturnStatus: string;
    status: string;
  }>;
  visitorRows: Array<{
    visitId: string;
    visitorNo: string;
    visitorName: string;
    organization: string | null;
    departmentId: string | null;
    departmentName: string | null;
    hostEmployee: string | null;
    expectedAt: string | null;
    checkInAt: string | null;
    checkOutAt: string | null;
    status: string;
  }>;
  auditRows: Array<{
    auditKey: string;
    activityDate: string;
    area: string;
    subject: string;
    action: string;
    actor: string | null;
    detail: string;
  }>;
};

function startOfUtcDay(value = new Date()) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function defaultStartDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
}

function emptyWorkspace(reason: string): ErpHrReportingWorkspaceData {
  return {
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    defaultDateFrom: dateInputValue(defaultStartDate()) ?? "",
    defaultDateTo: dateInputValue(new Date()) ?? "",
    departmentOptions: [],
    siteOptions: [],
    metrics: {
      activeHeadcount: 0,
      presentToday: 0,
      absentToday: 0,
      lateToday: 0,
      pendingLeave: 0,
      expiringDocuments: 0,
      incompleteExits: 0,
      visitorsOnPremises: 0
    },
    employeeRows: [],
    attendanceRows: [],
    leaveBalanceRows: [],
    leaveHistoryRows: [],
    documentRows: [],
    exitRows: [],
    visitorRows: [],
    auditRows: []
  };
}

export function buildUnavailableErpHrReportingWorkspace(reason: string) {
  return emptyWorkspace(reason);
}

export async function getErpHrReportingWorkspace(
  access: ErpHrReportingAccess
): Promise<ErpHrReportingWorkspaceData> {
  const context = await getHrContext();

  if (!context) {
    return emptyWorkspace("Flash ERP enterprise context is not configured yet.");
  }

  const company = await getPrimaryHrCompany(prisma, context);

  if (!company) {
    return emptyWorkspace("Create the primary Finance company before opening HR reports.");
  }

  const today = startOfUtcDay();
  const tomorrow = addUtcDays(today, 1);
  const reportStart = defaultStartDate();
  const expiryCutoff = addUtcDays(today, 60);
  const [departments, stores, employees, attendance, entitlements, leaveRequests, documents, exits, visitors, attendanceChanges, visitorLogs, payrollProfiles, payItems] =
    await Promise.all([
      prisma.erpHrDepartment.findMany({
        where: { companyId: company.id },
        orderBy: [{ name: "asc" }]
      }),
      prisma.store.findMany({
        where: { retailOrgId: context.retailOrgId, status: "ACTIVE" },
        orderBy: [{ name: "asc" }]
      }),
      prisma.erpEmployee.findMany({
        where: { companyId: company.id },
        include: {
          department: true,
          position: true,
          employeeCategory: true,
          primaryStore: true,
          payrollProfile: { select: { id: true, status: true } }
        },
        orderBy: [{ displayName: "asc" }]
      }),
      prisma.erpEmployeeAttendance.findMany({
        where: { companyId: company.id, workDate: { gte: reportStart } },
        include: { employee: true, department: true, store: true },
        orderBy: [{ workDate: "desc" }, { employee: { displayName: "asc" } }],
        take: 3000
      }),
      prisma.erpEmployeeLeaveEntitlement.findMany({
        where: { companyId: company.id },
        include: { employee: { include: { department: true, primaryStore: true } }, leaveType: true },
        orderBy: [{ leaveYear: "desc" }, { employee: { displayName: "asc" } }],
        take: 2000
      }),
      prisma.erpLeaveRequest.findMany({
        where: { companyId: company.id, startDate: { gte: reportStart } },
        include: {
          employee: { include: { department: true, primaryStore: true } },
          leaveType: true,
          approverEmployee: true
        },
        orderBy: [{ startDate: "desc" }],
        take: 2000
      }),
      access.includeDocuments
        ? prisma.erpHrDocument.findMany({
            where: { companyId: company.id, status: { not: "DELETED" } },
            include: { employee: { include: { department: true, primaryStore: true } } },
            orderBy: [{ expiryDate: "asc" }, { uploadedAt: "desc" }],
            take: 2000
          })
        : Promise.resolve([]),
      prisma.erpEmployeeExit.findMany({
        where: { companyId: company.id },
        include: { employee: { include: { department: true, primaryStore: true } } },
        orderBy: [{ lastWorkingDate: "desc" }],
        take: 1000
      }),
      access.includeVisitors
        ? prisma.erpVisitorVisit.findMany({
            where: { companyId: company.id, createdAt: { gte: reportStart } },
            include: { hostDepartment: true, hostEmployee: true },
            orderBy: [{ createdAt: "desc" }],
            take: 3000
          })
        : Promise.resolve([]),
      prisma.erpAttendanceChangeLog.findMany({
        where: { companyId: company.id, changedAt: { gte: reportStart } },
        include: { attendance: { include: { employee: true } } },
        orderBy: [{ changedAt: "desc" }],
        take: 500
      }),
      access.includeVisitors
        ? prisma.erpVisitorStatusLog.findMany({
            where: { companyId: company.id, changedAt: { gte: reportStart } },
            include: { visitorVisit: true },
            orderBy: [{ changedAt: "desc" }],
            take: 500
          })
        : Promise.resolve([]),
      access.includeCompensationAudit
        ? prisma.erpEmployeePayrollProfile.findMany({
            where: { companyId: company.id },
            include: { employee: true },
            orderBy: [{ updatedAt: "desc" }],
            take: 500
          })
        : Promise.resolve([]),
      access.includeCompensationAudit
        ? prisma.erpEmployeePayItem.findMany({
            where: { companyId: company.id },
            include: { employee: true },
            orderBy: [{ updatedAt: "desc" }],
            take: 500
          })
        : Promise.resolve([])
    ]);

  const employeeRows = employees.map((employee) => ({
    employeeId: employee.id,
    employeeNo: employee.employeeNo,
    employeeName: employee.displayName,
    departmentId: employee.departmentId,
    departmentCode: employee.department.code,
    departmentName: employee.department.name,
    position: employee.position.title,
    category: employee.employeeCategory.name,
    siteId: employee.primaryStoreId,
    siteCode: employee.primaryStore?.code ?? null,
    employmentDate: employee.employmentDate.toISOString(),
    status: employee.status,
    payrollReady: employee.payrollProfile?.status === activeStatus
  }));
  const attendanceRows = attendance.map((row) => ({
    attendanceId: row.id,
    employeeNo: row.employee.employeeNo,
    employeeName: row.employee.displayName,
    departmentId: row.departmentId,
    departmentName: row.department.name,
    siteId: row.storeId,
    siteCode: row.store?.code ?? null,
    workDate: row.workDate.toISOString(),
    status: row.attendanceStatus,
    checkInAt: row.checkInAt?.toISOString() ?? null,
    checkOutAt: row.checkOutAt?.toISOString() ?? null,
    lateMinutes: row.lateMinutes,
    overtimeHours: Number(row.overtimeHours)
  }));
  const leaveBalanceRows = entitlements.map((row) => {
    const availableDays =
      Number(row.openingDays) +
      Number(row.allocatedDays) +
      Number(row.adjustedDays) -
      Number(row.usedDays) -
      Number(row.pendingDays);
    return {
      entitlementId: row.id,
      employeeNo: row.employee.employeeNo,
      employeeName: row.employee.displayName,
      departmentId: row.employee.departmentId,
      departmentName: row.employee.department.name,
      siteId: row.employee.primaryStoreId,
      siteCode: row.employee.primaryStore?.code ?? null,
      leaveType: row.leaveType.name,
      leaveYear: row.leaveYear,
      allocatedDays: Number(row.allocatedDays),
      usedDays: Number(row.usedDays),
      pendingDays: Number(row.pendingDays),
      availableDays
    };
  });
  const documentRows = documents.map((row) => {
    const expiryState = !row.expiryDate
      ? "NO_EXPIRY"
      : row.expiryDate < today
        ? "EXPIRED"
        : row.expiryDate <= expiryCutoff
          ? "EXPIRING"
          : "VALID";
    return {
      documentId: row.id,
      documentNo: row.documentNo,
      employeeNo: row.employee.employeeNo,
      employeeName: row.employee.displayName,
      departmentId: row.employee.departmentId,
      departmentName: row.employee.department.name,
      siteId: row.employee.primaryStoreId,
      siteCode: row.employee.primaryStore?.code ?? null,
      documentType: row.documentType,
      title: row.title,
      issueDate: row.issueDate?.toISOString() ?? null,
      expiryDate: row.expiryDate?.toISOString() ?? null,
      expiryState,
      status: row.status
    };
  });
  const auditRows = [
    ...attendanceChanges.map((row) => ({
      auditKey: `ATTENDANCE-${row.id}`,
      activityDate: row.changedAt.toISOString(),
      area: "ATTENDANCE",
      subject: `${row.attendance.employee.employeeNo} - ${row.attendance.employee.displayName}`,
      action: row.action,
      actor: row.changedBy,
      detail: `Attendance correction for ${dateInputValue(row.attendance.workDate) ?? "work date"}.`
    })),
    ...visitorLogs.map((row) => ({
      auditKey: `VISITOR-${row.id}`,
      activityDate: row.changedAt.toISOString(),
      area: "VISITOR",
      subject: `${row.visitorVisit.visitorNo} - ${row.visitorVisit.visitorName}`,
      action: `${row.previousStatus ?? "NEW"} -> ${row.newStatus}`,
      actor: row.changedBy,
      detail: row.note ?? "Visitor status transition."
    })),
    ...documents.flatMap((row) => [
      {
        auditKey: `DOCUMENT-UPLOAD-${row.id}`,
        activityDate: row.uploadedAt.toISOString(),
        area: "HR_DOCUMENT",
        subject: `${row.employee.employeeNo} - ${row.title}`,
        action: "UPLOADED",
        actor: row.uploadedBy,
        detail: `${row.documentType} ${row.documentNo}`
      },
      ...(row.deletedAt
        ? [
            {
              auditKey: `DOCUMENT-ARCHIVE-${row.id}`,
              activityDate: row.deletedAt.toISOString(),
              area: "HR_DOCUMENT",
              subject: `${row.employee.employeeNo} - ${row.title}`,
              action: "ARCHIVED",
              actor: row.deletedBy,
              detail: `${row.documentType} ${row.documentNo}`
            }
          ]
        : [])
    ]),
    ...payrollProfiles.map((row) => ({
      auditKey: `PAYROLL-PROFILE-${row.id}`,
      activityDate: row.updatedAt.toISOString(),
      area: "COMPENSATION",
      subject: `${row.employee.employeeNo} - ${row.employee.displayName}`,
      action: "PAYROLL_PROFILE_UPDATED",
      actor: row.updatedBy,
      detail: "Protected payroll profile changed."
    })),
    ...payItems.map((row) => ({
      auditKey: `PAY-ITEM-${row.id}`,
      activityDate: row.updatedAt.toISOString(),
      area: "COMPENSATION",
      subject: `${row.employee.employeeNo} - ${row.employee.displayName}`,
      action: `${row.componentType}_UPDATED`,
      actor: row.updatedBy,
      detail: `${row.code} - ${row.name}`
    }))
  ].sort((a, b) => b.activityDate.localeCompare(a.activityDate));

  return {
    companyName: company.tradingName ?? company.legalName,
    statusMessage: "HR reporting is ready.",
    refreshedAt: new Date().toISOString(),
    defaultDateFrom: dateInputValue(reportStart) ?? "",
    defaultDateTo: dateInputValue(new Date()) ?? "",
    departmentOptions: departments.map((row) => ({ value: row.id, label: `${row.code} - ${row.name}` })),
    siteOptions: stores.map((row) => ({ value: row.id, label: `${row.code} - ${row.name}` })),
    metrics: {
      activeHeadcount: employees.filter((row) => row.status === activeStatus).length,
      presentToday: attendance.filter(
        (row) => row.workDate >= today && row.workDate < tomorrow && row.attendanceStatus === "PRESENT"
      ).length,
      absentToday: attendance.filter(
        (row) => row.workDate >= today && row.workDate < tomorrow && row.attendanceStatus === "ABSENT"
      ).length,
      lateToday: attendance.filter(
        (row) => row.workDate >= today && row.workDate < tomorrow && row.attendanceStatus === "LATE"
      ).length,
      pendingLeave: leaveRequests.filter((row) => ["DRAFT", "SUBMITTED"].includes(row.status)).length,
      expiringDocuments: documentRows.filter((row) => ["EXPIRED", "EXPIRING"].includes(row.expiryState)).length,
      incompleteExits: exits.filter(
        (row) =>
          row.status !== "FINALIZED" ||
          !["COMPLETED", "WAIVED"].includes(row.finalSettlementStatus) ||
          !["COMPLETED", "WAIVED"].includes(row.assetReturnStatus)
      ).length,
      visitorsOnPremises: visitors.filter((row) => row.status === "CHECKED_IN").length
    },
    employeeRows,
    attendanceRows,
    leaveBalanceRows,
    leaveHistoryRows: leaveRequests.map((row) => ({
      leaveRequestId: row.id,
      requestNo: row.requestNo,
      employeeNo: row.employee.employeeNo,
      employeeName: row.employee.displayName,
      departmentId: row.employee.departmentId,
      departmentName: row.employee.department.name,
      siteId: row.employee.primaryStoreId,
      siteCode: row.employee.primaryStore?.code ?? null,
      leaveType: row.leaveType.name,
      startDate: row.startDate.toISOString(),
      endDate: row.endDate.toISOString(),
      requestedDays: Number(row.requestedDays),
      status: row.status,
      approverName: row.approverEmployee?.displayName ?? null
    })),
    documentRows,
    exitRows: exits.map((row) => ({
      exitId: row.id,
      exitNo: row.exitNo,
      employeeNo: row.employee.employeeNo,
      employeeName: row.employee.displayName,
      departmentId: row.employee.departmentId,
      departmentName: row.employee.department.name,
      siteId: row.employee.primaryStoreId,
      siteCode: row.employee.primaryStore?.code ?? null,
      exitType: row.exitType,
      lastWorkingDate: row.lastWorkingDate.toISOString(),
      settlementStatus: row.finalSettlementStatus,
      assetReturnStatus: row.assetReturnStatus,
      status: row.status
    })),
    visitorRows: visitors.map((row) => ({
      visitId: row.id,
      visitorNo: row.visitorNo,
      visitorName: row.visitorName,
      organization: row.organization,
      departmentId: row.hostDepartmentId,
      departmentName: row.hostDepartment?.name ?? null,
      hostEmployee: row.hostEmployee?.displayName ?? null,
      expectedAt: row.expectedAt?.toISOString() ?? null,
      checkInAt: row.checkInAt?.toISOString() ?? null,
      checkOutAt: row.checkOutAt?.toISOString() ?? null,
      status: row.status
    })),
    auditRows
  };
}
