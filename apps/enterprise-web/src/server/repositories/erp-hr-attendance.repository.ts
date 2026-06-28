import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  activeStatus,
  dateInputValue,
  getHrContext,
  getPrimaryHrCompany,
  normalizeChoice,
  normalizeDateOnly,
  normalizeNonNegativeNumber,
  normalizeOptionalDate,
  normalizeOptionalText,
  normalizeRequiredText,
  type HrCompany,
  type HrContext
} from "@/server/repositories/erp-hr-shared";

export type UpsertErpEmployeeAttendanceRequest = {
  attendanceId?: string | null;
  employeeId?: string | null;
  workDate?: string | Date | null;
  attendanceStatus?: string | null;
  checkInAt?: string | Date | null;
  checkOutAt?: string | Date | null;
  lateMinutes?: number | string | null;
  overtimeHours?: number | string | null;
  note?: string | null;
};

export type ErpAttendanceBatchQuery = {
  workDate?: string | Date | null;
  departmentId?: string | null;
  positionId?: string | null;
  storeId?: string | null;
};

export type SaveErpAttendanceBatchRequest = {
  workDate?: string | Date | null;
  rows?: Array<{
    employeeId?: string | null;
    present?: boolean | null;
    attendanceStatus?: string | null;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    lateMinutes?: number | string | null;
    overtimeHours?: number | string | null;
    note?: string | null;
  }> | null;
};

export type ErpAttendanceBatchRow = {
  attendanceId: string | null;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  departmentId: string;
  departmentName: string;
  positionId: string;
  positionTitle: string;
  storeId: string | null;
  storeName: string | null;
  attendanceStatus: string;
  present: boolean;
  checkInTime: string;
  checkOutTime: string;
  lateMinutes: number;
  overtimeHours: number;
  workHours: number | null;
  note: string;
  hasExistingRecord: boolean;
  updatedAt: string | null;
};

export type ErpAttendanceBatchData = {
  workDate: string;
  departmentId: string | null;
  positionId: string | null;
  storeId: string | null;
  rows: ErpAttendanceBatchRow[];
  loadedAt: string;
};

export type ErpAttendanceMutationResponse = {
  message: string;
  attendanceId: string;
  serverProcessedAt: string;
};

export type ErpAttendanceBatchMutationResponse = {
  message: string;
  savedCount: number;
  unchangedCount: number;
  serverProcessedAt: string;
};

export type ErpAttendanceWorkspaceData = {
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  employeeOptions: Array<{
    employeeId: string;
    employeeNo: string;
    displayName: string;
    departmentId: string;
    departmentName: string;
    positionId: string;
    positionTitle: string;
    storeId: string | null;
    storeName: string | null;
  }>;
  departmentOptions: Array<{ departmentId: string; code: string; name: string }>;
  positionOptions: Array<{
    positionId: string;
    departmentId: string;
    code: string;
    title: string;
  }>;
  storeOptions: Array<{ storeId: string; code: string; name: string }>;
  initialBatch: ErpAttendanceBatchData;
  attendanceRows: Array<{
    attendanceId: string;
    employeeId: string;
    employeeNo: string;
    employeeName: string;
    departmentCode: string;
    departmentName: string;
    positionTitle: string;
    storeCode: string | null;
    storeName: string | null;
    workDate: string;
    attendanceStatus: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    lateMinutes: number;
    overtimeHours: number;
    note: string | null;
    entrySource: string;
    changeCount: number;
    updatedBy: string | null;
    updatedAt: string;
  }>;
  metrics: {
    todayRecords: number;
    todayPresent: number;
    todayLate: number;
    todayAbsent: number;
    periodOvertimeHours: number;
  };
};

function emptyBatch(workDate = new Date().toISOString().slice(0, 10)): ErpAttendanceBatchData {
  return {
    workDate,
    departmentId: null,
    positionId: null,
    storeId: null,
    rows: [],
    loadedAt: new Date().toISOString()
  };
}

export function buildUnavailableErpAttendanceWorkspace(
  reason: string
): ErpAttendanceWorkspaceData {
  return {
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    employeeOptions: [],
    departmentOptions: [],
    positionOptions: [],
    storeOptions: [],
    initialBatch: emptyBatch(),
    attendanceRows: [],
    metrics: {
      todayRecords: 0,
      todayPresent: 0,
      todayLate: 0,
      todayAbsent: 0,
      periodOvertimeHours: 0
    }
  };
}

function timeInputValue(value: Date | null | undefined) {
  return value ? value.toISOString().slice(11, 16) : "";
}

function workHours(checkInAt: Date | null, checkOutAt: Date | null) {
  if (!checkInAt || !checkOutAt || checkOutAt < checkInAt) return null;
  return Number(((checkOutAt.getTime() - checkInAt.getTime()) / 3_600_000).toFixed(2));
}

async function loadAttendanceBatch(
  tx: Prisma.TransactionClient,
  company: HrCompany,
  query: ErpAttendanceBatchQuery
): Promise<ErpAttendanceBatchData> {
  const workDate = normalizeDateOnly(query.workDate ?? new Date(), "work date");
  const departmentId = normalizeOptionalText(query.departmentId);
  const positionId = normalizeOptionalText(query.positionId);
  const storeId = normalizeOptionalText(query.storeId);
  const employees = await tx.erpEmployee.findMany({
    where: {
      companyId: company.id,
      status: activeStatus,
      ...(departmentId ? { departmentId } : {}),
      ...(positionId ? { positionId } : {}),
      ...(storeId ? { primaryStoreId: storeId } : {})
    },
    orderBy: [{ department: { name: "asc" } }, { displayName: "asc" }],
    include: { department: true, position: true, primaryStore: true }
  });
  const attendance = employees.length
    ? await tx.erpEmployeeAttendance.findMany({
        where: {
          companyId: company.id,
          workDate,
          employeeId: { in: employees.map((employee) => employee.id) }
        }
      })
    : [];
  const attendanceByEmployee = new Map(attendance.map((row) => [row.employeeId, row] as const));

  return {
    workDate: dateInputValue(workDate) ?? "",
    departmentId,
    positionId,
    storeId,
    loadedAt: new Date().toISOString(),
    rows: employees.map((employee) => {
      const row = attendanceByEmployee.get(employee.id) ?? null;
      return {
        attendanceId: row?.id ?? null,
        employeeId: employee.id,
        employeeNo: employee.employeeNo,
        employeeName: employee.displayName,
        departmentId: employee.departmentId,
        departmentName: employee.department.name,
        positionId: employee.positionId,
        positionTitle: employee.position.title,
        storeId: employee.primaryStoreId,
        storeName: employee.primaryStore?.name ?? null,
        attendanceStatus: row?.attendanceStatus ?? "ABSENT",
        present: row ? ["PRESENT", "LATE"].includes(row.attendanceStatus) : false,
        checkInTime: timeInputValue(row?.checkInAt),
        checkOutTime: timeInputValue(row?.checkOutAt),
        lateMinutes: row?.lateMinutes ?? 0,
        overtimeHours: Number(row?.overtimeHours ?? 0),
        workHours: workHours(row?.checkInAt ?? null, row?.checkOutAt ?? null),
        note: row?.note ?? "",
        hasExistingRecord: Boolean(row),
        updatedAt: row?.updatedAt.toISOString() ?? null
      };
    })
  };
}

export async function getErpAttendanceBatch(
  query: ErpAttendanceBatchQuery
): Promise<ErpAttendanceBatchData> {
  const context = await getHrContext();
  if (!context) throw new Error("Flash ERP enterprise organization is not configured yet.");
  const company = await getPrimaryHrCompany(prisma, context);
  if (!company) throw new Error("Create a company before recording attendance.");
  return loadAttendanceBatch(prisma, company, query);
}

export async function getErpAttendanceWorkspace(): Promise<ErpAttendanceWorkspaceData> {
  const context = await getHrContext();
  if (!context) {
    return buildUnavailableErpAttendanceWorkspace(
      "Flash ERP enterprise organization is not configured yet."
    );
  }
  const company = await getPrimaryHrCompany(prisma, context);
  if (!company) {
    return buildUnavailableErpAttendanceWorkspace("Create a company before recording attendance.");
  }

  const periodStart = new Date();
  periodStart.setUTCDate(periodStart.getUTCDate() - 45);
  const today = normalizeDateOnly(new Date(), "today");
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const [employees, departments, positions, stores, attendance, initialBatch] =
    await Promise.all([
      prisma.erpEmployee.findMany({
        where: { companyId: company.id, status: activeStatus },
        orderBy: [{ displayName: "asc" }],
        include: { department: true, position: true, primaryStore: true }
      }),
      prisma.erpHrDepartment.findMany({
        where: { companyId: company.id, status: activeStatus },
        orderBy: { name: "asc" }
      }),
      prisma.erpHrPosition.findMany({
        where: { companyId: company.id, status: activeStatus },
        orderBy: [{ department: { name: "asc" } }, { title: "asc" }]
      }),
      prisma.store.findMany({
        where: { retailOrgId: context.retailOrgId, status: activeStatus },
        orderBy: { name: "asc" }
      }),
      prisma.erpEmployeeAttendance.findMany({
        where: { companyId: company.id, workDate: { gte: periodStart } },
        orderBy: [{ workDate: "desc" }, { employee: { displayName: "asc" } }],
        include: {
          employee: { include: { position: true } },
          department: true,
          store: true,
          _count: { select: { changeLogs: true } }
        },
        take: 1000
      }),
      loadAttendanceBatch(prisma, company, { workDate: today })
    ]);
  const todayRows = attendance.filter(
    (row) => row.workDate >= today && row.workDate < tomorrow
  );

  return {
    companyName: company.tradingName ?? company.legalName,
    statusMessage: `Batch attendance for ${company.tradingName ?? company.legalName}.`,
    refreshedAt: new Date().toISOString(),
    employeeOptions: employees.map((employee) => ({
      employeeId: employee.id,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName,
      departmentId: employee.departmentId,
      departmentName: employee.department.name,
      positionId: employee.positionId,
      positionTitle: employee.position.title,
      storeId: employee.primaryStoreId,
      storeName: employee.primaryStore?.name ?? null
    })),
    departmentOptions: departments.map((department) => ({
      departmentId: department.id,
      code: department.code,
      name: department.name
    })),
    positionOptions: positions.map((position) => ({
      positionId: position.id,
      departmentId: position.departmentId,
      code: position.code,
      title: position.title
    })),
    storeOptions: stores.map((store) => ({
      storeId: store.id,
      code: store.code,
      name: store.name
    })),
    initialBatch,
    attendanceRows: attendance.map((row) => ({
      attendanceId: row.id,
      employeeId: row.employeeId,
      employeeNo: row.employee.employeeNo,
      employeeName: row.employee.displayName,
      departmentCode: row.department.code,
      departmentName: row.department.name,
      positionTitle: row.employee.position.title,
      storeCode: row.store?.code ?? null,
      storeName: row.store?.name ?? null,
      workDate: dateInputValue(row.workDate) ?? "",
      attendanceStatus: row.attendanceStatus,
      checkInAt: row.checkInAt?.toISOString() ?? null,
      checkOutAt: row.checkOutAt?.toISOString() ?? null,
      lateMinutes: row.lateMinutes,
      overtimeHours: Number(row.overtimeHours),
      note: row.note,
      entrySource: row.entrySource,
      changeCount: row._count.changeLogs,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt.toISOString()
    })),
    metrics: {
      todayRecords: todayRows.length,
      todayPresent: todayRows.filter((row) =>
        ["PRESENT", "LATE"].includes(row.attendanceStatus)
      ).length,
      todayLate: todayRows.filter((row) => row.attendanceStatus === "LATE").length,
      todayAbsent: todayRows.filter((row) => row.attendanceStatus === "ABSENT").length,
      periodOvertimeHours: Number(
        attendance.reduce((sum, row) => sum + Number(row.overtimeHours), 0).toFixed(2)
      )
    }
  };
}

function attendanceSnapshot(value: {
  employeeId: string;
  departmentId: string;
  storeId: string | null;
  workDate: Date;
  attendanceStatus: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  lateMinutes: number;
  overtimeHours: unknown;
  note: string | null;
  entrySource: string;
}) {
  return JSON.stringify({
    employeeId: value.employeeId,
    departmentId: value.departmentId,
    storeId: value.storeId,
    workDate: value.workDate.toISOString(),
    attendanceStatus: value.attendanceStatus,
    checkInAt: value.checkInAt?.toISOString() ?? null,
    checkOutAt: value.checkOutAt?.toISOString() ?? null,
    lateMinutes: value.lateMinutes,
    overtimeHours: Number(value.overtimeHours),
    note: value.note,
    entrySource: value.entrySource
  });
}

function dateTimeFromWorkDate(workDate: Date, value: string | null | undefined, label: string) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
    throw new Error(`Flash ERP needs a valid ${label} in HH:mm format.`);
  }
  const [hour, minute] = normalized.split(":").map(Number);
  return new Date(
    Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), hour, minute)
  );
}

async function saveAttendance(
  tx: Prisma.TransactionClient,
  context: HrContext,
  company: HrCompany,
  input: UpsertErpEmployeeAttendanceRequest,
  actor: string,
  existingOverride?: Awaited<ReturnType<typeof tx.erpEmployeeAttendance.findFirst>> | null
) {
  const attendanceId = normalizeOptionalText(input.attendanceId);
  const employeeId = normalizeRequiredText(input.employeeId, "employee");
  const workDate = normalizeDateOnly(input.workDate, "work date");
  const attendanceStatus = normalizeChoice(input.attendanceStatus, "attendance status", [
    "PRESENT",
    "LATE",
    "ABSENT",
    "LEAVE",
    "OFF_DAY"
  ], "PRESENT");
  let checkInAt = normalizeOptionalDate(input.checkInAt, "check-in time");
  let checkOutAt = normalizeOptionalDate(input.checkOutAt, "check-out time");
  let lateMinutes = Math.trunc(normalizeNonNegativeNumber(input.lateMinutes, "late minutes"));
  const overtimeHours = normalizeNonNegativeNumber(input.overtimeHours, "overtime hours");
  if (["ABSENT", "LEAVE", "OFF_DAY"].includes(attendanceStatus)) {
    checkInAt = null;
    checkOutAt = null;
    lateMinutes = 0;
  }
  if (attendanceStatus === "LATE" && !checkInAt) {
    throw new Error("Flash ERP needs a check-in time for a late arrival.");
  }
  if (checkInAt && checkOutAt && checkOutAt < checkInAt) {
    throw new Error("Flash ERP check-out time cannot be earlier than check-in time.");
  }
  const employee = await tx.erpEmployee.findFirst({
    where: { id: employeeId, companyId: company.id, status: activeStatus }
  });
  if (!employee) throw new Error("Flash ERP needs an active employee for attendance entry.");
  const existing =
    existingOverride !== undefined
      ? existingOverride
      : attendanceId
        ? await tx.erpEmployeeAttendance.findFirst({
            where: { id: attendanceId, companyId: company.id }
          })
        : await tx.erpEmployeeAttendance.findFirst({
            where: { companyId: company.id, employeeId, workDate }
          });
  if (attendanceId && !existing) {
    throw new Error("Flash ERP could not find the attendance record to correct.");
  }
  const data = {
    employeeId,
    departmentId: employee.departmentId,
    storeId: employee.primaryStoreId,
    workDate,
    attendanceStatus,
    checkInAt,
    checkOutAt,
    lateMinutes,
    overtimeHours,
    note: normalizeOptionalText(input.note),
    entrySource: "MANUAL",
    updatedBy: actor
  };
  const nextSnapshot = attendanceSnapshot(data);
  if (existing && attendanceSnapshot(existing) === nextSnapshot) {
    return { attendance: existing, changed: false, employeeNo: employee.employeeNo };
  }
  const attendance = existing
    ? await tx.erpEmployeeAttendance.update({ where: { id: existing.id }, data })
    : await tx.erpEmployeeAttendance.create({
        data: {
          retailOrgId: context.retailOrgId,
          companyId: company.id,
          ...data,
          createdBy: actor
        }
      });
  await tx.erpAttendanceChangeLog.create({
    data: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      attendanceId: attendance.id,
      action: existing ? "UPDATE" : "CREATE",
      previousSnapshot: existing ? attendanceSnapshot(existing) : null,
      newSnapshot: attendanceSnapshot(attendance),
      changedBy: actor
    }
  });
  return { attendance, changed: true, employeeNo: employee.employeeNo };
}

export async function upsertErpEmployeeAttendance(
  input: UpsertErpEmployeeAttendanceRequest,
  actor: string
): Promise<ErpAttendanceMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getHrContext(tx);
    if (!context) throw new Error("Flash ERP enterprise organization is not configured yet.");
    const company = await getPrimaryHrCompany(tx, context);
    if (!company) throw new Error("Create a company before recording attendance.");
    const result = await saveAttendance(tx, context, company, input, actor);
    return {
      message: `Flash ERP saved attendance for ${result.employeeNo} on ${dateInputValue(result.attendance.workDate)}.`,
      attendanceId: result.attendance.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function saveErpEmployeeAttendanceBatch(
  input: SaveErpAttendanceBatchRequest,
  actor: string
): Promise<ErpAttendanceBatchMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getHrContext(tx);
    if (!context) throw new Error("Flash ERP enterprise organization is not configured yet.");
    const company = await getPrimaryHrCompany(tx, context);
    if (!company) throw new Error("Create a company before recording attendance.");
    const workDate = normalizeDateOnly(input.workDate, "work date");
    const rows = input.rows ?? [];
    if (!rows.length) throw new Error("Flash ERP needs at least one employee attendance row.");
    if (rows.length > 500) throw new Error("Flash ERP batch attendance is limited to 500 employees.");

    const employeeIds = rows.map((row) => normalizeRequiredText(row.employeeId, "employee"));
    if (new Set(employeeIds).size !== employeeIds.length) {
      throw new Error("Flash ERP attendance batch contains duplicate employees.");
    }
    const existingRows = await tx.erpEmployeeAttendance.findMany({
      where: { companyId: company.id, workDate, employeeId: { in: employeeIds } }
    });
    const existingByEmployee = new Map(existingRows.map((row) => [row.employeeId, row] as const));
    let savedCount = 0;
    let unchangedCount = 0;

    for (const row of rows) {
      const employeeId = normalizeRequiredText(row.employeeId, "employee");
      const existing = existingByEmployee.get(employeeId) ?? null;
      const present = row.present === true;
      const lateMinutes = present
        ? Math.trunc(normalizeNonNegativeNumber(row.lateMinutes, "late minutes"))
        : 0;
      const preservedSpecialStatus = ["LEAVE", "OFF_DAY"].includes(
        normalizeOptionalText(row.attendanceStatus) ?? ""
      )
        ? normalizeOptionalText(row.attendanceStatus)
        : null;
      const attendanceStatus = present
        ? lateMinutes > 0
          ? "LATE"
          : "PRESENT"
        : preservedSpecialStatus ?? "ABSENT";
      let checkInAt = present
        ? dateTimeFromWorkDate(workDate, row.checkInTime, "check-in time")
        : null;
      let checkOutAt = present
        ? dateTimeFromWorkDate(workDate, row.checkOutTime, "check-out time")
        : null;
      if (checkInAt && checkOutAt && checkOutAt < checkInAt) {
        checkOutAt = new Date(checkOutAt);
        checkOutAt.setUTCDate(checkOutAt.getUTCDate() + 1);
      }
      const result = await saveAttendance(
        tx,
        context,
        company,
        {
          attendanceId: existing?.id,
          employeeId,
          workDate,
          attendanceStatus,
          checkInAt,
          checkOutAt,
          lateMinutes,
          overtimeHours: row.overtimeHours,
          note: row.note
        },
        actor,
        existing
      );
      if (result.changed) savedCount += 1;
      else unchangedCount += 1;
    }

    return {
      message: `Flash ERP saved ${savedCount} attendance row(s); ${unchangedCount} unchanged.`,
      savedCount,
      unchangedCount,
      serverProcessedAt: new Date().toISOString()
    };
  });
}
