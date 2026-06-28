import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  activeStatus,
  dateInputValue,
  getHrContext,
  getPrimaryHrCompany,
  normalizeChoice,
  normalizeCode,
  normalizeDateOnly,
  normalizeNonNegativeNumber,
  normalizeOptionalText,
  normalizeRequiredText
} from "@/server/repositories/erp-hr-shared";
import { reserveErpDocumentNumberInTransaction } from "@/server/services/erp-document-numbering";

export type UpsertErpLeaveTypeRequest = {
  leaveTypeId?: string | null;
  code?: string | null;
  name?: string | null;
  description?: string | null;
  defaultDays?: number | string | null;
  isPaid?: boolean | null;
  requiresAttachment?: boolean | null;
  genderEligibility?: string | null;
  status?: string | null;
};

export type UpsertErpLeaveEntitlementRequest = {
  entitlementId?: string | null;
  employeeId?: string | null;
  leaveTypeId?: string | null;
  leaveYear?: number | string | null;
  openingDays?: number | string | null;
  allocatedDays?: number | string | null;
  adjustedDays?: number | string | null;
  status?: string | null;
};

export type CreateErpLeaveRequestRequest = {
  employeeId?: string | null;
  leaveTypeId?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  reason?: string | null;
  status?: string | null;
};

export type DecideErpLeaveRequestRequest = {
  leaveRequestId?: string | null;
  action?: string | null;
  note?: string | null;
};

export type ErpLeaveMutationResponse = {
  message: string;
  leaveTypeId?: string;
  entitlementId?: string;
  leaveRequestId?: string;
  requestNo?: string;
  serverProcessedAt: string;
};

export type ErpLeaveWorkspaceData = {
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  currentYear: number;
  employeeOptions: Array<{
    employeeId: string;
    employeeNo: string;
    displayName: string;
    departmentName: string;
  }>;
  leaveTypeRows: Array<{
    leaveTypeId: string;
    code: string;
    name: string;
    description: string | null;
    defaultDays: number;
    isPaid: boolean;
    requiresAttachment: boolean;
    genderEligibility: string;
    status: string;
  }>;
  entitlementRows: Array<{
    entitlementId: string;
    employeeId: string;
    employeeNo: string;
    employeeName: string;
    departmentName: string;
    leaveTypeId: string;
    leaveTypeCode: string;
    leaveTypeName: string;
    leaveYear: number;
    openingDays: number;
    allocatedDays: number;
    adjustedDays: number;
    usedDays: number;
    pendingDays: number;
    availableDays: number;
    status: string;
  }>;
  requestRows: Array<{
    leaveRequestId: string;
    requestNo: string;
    employeeId: string;
    employeeNo: string;
    employeeName: string;
    departmentName: string;
    leaveTypeId: string;
    leaveTypeCode: string;
    leaveTypeName: string;
    approverEmployeeId: string | null;
    approverName: string | null;
    requestDate: string;
    startDate: string;
    endDate: string;
    requestedDays: number;
    reason: string | null;
    status: string;
    decisionBy: string | null;
    decisionAt: string | null;
    decisionNote: string | null;
    cancellationReason: string | null;
  }>;
  metrics: {
    pendingRequests: number;
    approvedRequests: number;
    employeesWithBalances: number;
    availableDays: number;
  };
};

export type ErpLeaveTypesSettingsWorkspaceData = {
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  leaveTypeRows: ErpLeaveWorkspaceData["leaveTypeRows"];
};

const defaultLeaveTypes = [
  {
    code: "ANNUAL",
    name: "Annual Leave",
    description: "Paid annual leave entitlement.",
    defaultDays: 20,
    isPaid: true,
    requiresAttachment: false,
    genderEligibility: "ALL"
  },
  {
    code: "SICK",
    name: "Sick Leave",
    description: "Leave for illness or medical recovery.",
    defaultDays: 10,
    isPaid: true,
    requiresAttachment: true,
    genderEligibility: "ALL"
  },
  {
    code: "MATERNITY",
    name: "Maternity Leave",
    description: "Maternity leave entitlement.",
    defaultDays: 84,
    isPaid: true,
    requiresAttachment: true,
    genderEligibility: "FEMALE"
  },
  {
    code: "PATERNITY",
    name: "Paternity Leave",
    description: "Paternity leave entitlement.",
    defaultDays: 5,
    isPaid: true,
    requiresAttachment: true,
    genderEligibility: "MALE"
  }
];

function roundDays(value: number) {
  return Number(value.toFixed(2));
}

function availableDays(value: {
  openingDays: unknown;
  allocatedDays: unknown;
  adjustedDays: unknown;
  usedDays: unknown;
  pendingDays: unknown;
}) {
  return roundDays(
    Number(value.openingDays) +
      Number(value.allocatedDays) +
      Number(value.adjustedDays) -
      Number(value.usedDays) -
      Number(value.pendingDays)
  );
}

function requestedCalendarDays(startDate: Date, endDate: Date) {
  const milliseconds = endDate.getTime() - startDate.getTime();
  return Math.floor(milliseconds / 86_400_000) + 1;
}

async function ensureLeaveFoundation(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  companyId: string
) {
  for (const type of defaultLeaveTypes) {
    await tx.erpLeaveType.upsert({
      where: { companyId_code: { companyId, code: type.code } },
      update: {},
      create: {
        retailOrgId,
        companyId,
        ...type,
        status: activeStatus,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      }
    });
  }
  const fiscalYear = await tx.erpFiscalYear.findFirst({
    where: { companyId, status: { not: "CLOSED" } },
    orderBy: [{ startsOn: "desc" }, { code: "desc" }],
    select: { id: true }
  });
  if (!fiscalYear) return;
  await tx.erpDocumentSequence.upsert({
    where: {
      companyId_documentType_fiscalYearId: {
        companyId,
        documentType: "HR_LEAVE",
        fiscalYearId: fiscalYear.id
      }
    },
    update: { prefix: "LV", resetPolicy: "FISCAL_YEAR", status: activeStatus },
    create: {
      retailOrgId,
      companyId,
      fiscalYearId: fiscalYear.id,
      documentType: "HR_LEAVE",
      prefix: "LV",
      nextSequence: 1,
      paddingLength: 6,
      resetPolicy: "FISCAL_YEAR",
      status: activeStatus
    }
  });
}

export function buildUnavailableErpLeaveWorkspace(reason: string): ErpLeaveWorkspaceData {
  return {
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    currentYear: new Date().getUTCFullYear(),
    employeeOptions: [],
    leaveTypeRows: [],
    entitlementRows: [],
    requestRows: [],
    metrics: {
      pendingRequests: 0,
      approvedRequests: 0,
      employeesWithBalances: 0,
      availableDays: 0
    }
  };
}

export function buildUnavailableErpLeaveTypesSettingsWorkspace(
  reason: string
): ErpLeaveTypesSettingsWorkspaceData {
  return {
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    leaveTypeRows: []
  };
}

export async function getErpLeaveTypesSettingsWorkspace(): Promise<ErpLeaveTypesSettingsWorkspaceData> {
  const context = await getHrContext();
  if (!context) {
    return buildUnavailableErpLeaveTypesSettingsWorkspace(
      "Flash ERP enterprise organization is not configured yet."
    );
  }
  const company = await getPrimaryHrCompany(prisma, context);
  if (!company) {
    return buildUnavailableErpLeaveTypesSettingsWorkspace(
      "Create a company before configuring leave types."
    );
  }
  await prisma.$transaction((tx) => ensureLeaveFoundation(tx, context.retailOrgId, company.id));
  const leaveTypes = await prisma.erpLeaveType.findMany({
    where: { companyId: company.id },
    orderBy: { code: "asc" }
  });
  return {
    companyName: company.tradingName ?? company.legalName,
    statusMessage: `Leave type settings for ${company.tradingName ?? company.legalName}.`,
    refreshedAt: new Date().toISOString(),
    leaveTypeRows: leaveTypes.map((type) => ({
      leaveTypeId: type.id,
      code: type.code,
      name: type.name,
      description: type.description,
      defaultDays: Number(type.defaultDays),
      isPaid: type.isPaid,
      requiresAttachment: type.requiresAttachment,
      genderEligibility: type.genderEligibility,
      status: type.status
    }))
  };
}

export async function getErpLeaveWorkspace(): Promise<ErpLeaveWorkspaceData> {
  const context = await getHrContext();
  if (!context) return buildUnavailableErpLeaveWorkspace("Flash ERP enterprise organization is not configured yet.");
  const company = await getPrimaryHrCompany(prisma, context);
  if (!company) return buildUnavailableErpLeaveWorkspace("Create a company before configuring leave.");
  await prisma.$transaction((tx) => ensureLeaveFoundation(tx, context.retailOrgId, company.id));
  const currentYear = new Date().getUTCFullYear();
  const [employees, leaveTypes, entitlements, requests] = await Promise.all([
    prisma.erpEmployee.findMany({
      where: { companyId: company.id, status: activeStatus },
      orderBy: { displayName: "asc" },
      include: { department: true }
    }),
    prisma.erpLeaveType.findMany({
      where: { companyId: company.id, status: { not: "DELETED" } },
      orderBy: { code: "asc" }
    }),
    prisma.erpEmployeeLeaveEntitlement.findMany({
      where: { companyId: company.id, leaveYear: { gte: currentYear - 1 } },
      orderBy: [{ leaveYear: "desc" }, { employee: { displayName: "asc" } }],
      include: { employee: { include: { department: true } }, leaveType: true }
    }),
    prisma.erpLeaveRequest.findMany({
      where: { companyId: company.id, requestDate: { gte: new Date(Date.UTC(currentYear - 1, 0, 1)) } },
      orderBy: [{ requestDate: "desc" }, { requestNo: "desc" }],
      include: {
        employee: { include: { department: true } },
        leaveType: true,
        approverEmployee: true
      },
      take: 1000
    })
  ]);
  const entitlementRows = entitlements.map((row) => ({
    entitlementId: row.id,
    employeeId: row.employeeId,
    employeeNo: row.employee.employeeNo,
    employeeName: row.employee.displayName,
    departmentName: row.employee.department.name,
    leaveTypeId: row.leaveTypeId,
    leaveTypeCode: row.leaveType.code,
    leaveTypeName: row.leaveType.name,
    leaveYear: row.leaveYear,
    openingDays: Number(row.openingDays),
    allocatedDays: Number(row.allocatedDays),
    adjustedDays: Number(row.adjustedDays),
    usedDays: Number(row.usedDays),
    pendingDays: Number(row.pendingDays),
    availableDays: availableDays(row),
    status: row.status
  }));

  return {
    companyName: company.tradingName ?? company.legalName,
    statusMessage: `Leave balances and requests for ${company.tradingName ?? company.legalName}.`,
    refreshedAt: new Date().toISOString(),
    currentYear,
    employeeOptions: employees.map((employee) => ({
      employeeId: employee.id,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName,
      departmentName: employee.department.name
    })),
    leaveTypeRows: leaveTypes.map((type) => ({
      leaveTypeId: type.id,
      code: type.code,
      name: type.name,
      description: type.description,
      defaultDays: Number(type.defaultDays),
      isPaid: type.isPaid,
      requiresAttachment: type.requiresAttachment,
      genderEligibility: type.genderEligibility,
      status: type.status
    })),
    entitlementRows,
    requestRows: requests.map((request) => ({
      leaveRequestId: request.id,
      requestNo: request.requestNo,
      employeeId: request.employeeId,
      employeeNo: request.employee.employeeNo,
      employeeName: request.employee.displayName,
      departmentName: request.employee.department.name,
      leaveTypeId: request.leaveTypeId,
      leaveTypeCode: request.leaveType.code,
      leaveTypeName: request.leaveType.name,
      approverEmployeeId: request.approverEmployeeId,
      approverName: request.approverEmployee?.displayName ?? null,
      requestDate: request.requestDate.toISOString(),
      startDate: dateInputValue(request.startDate) ?? "",
      endDate: dateInputValue(request.endDate) ?? "",
      requestedDays: Number(request.requestedDays),
      reason: request.reason,
      status: request.status,
      decisionBy: request.decisionBy,
      decisionAt: request.decisionAt?.toISOString() ?? null,
      decisionNote: request.decisionNote,
      cancellationReason: request.cancellationReason
    })),
    metrics: {
      pendingRequests: requests.filter((request) => request.status === "SUBMITTED").length,
      approvedRequests: requests.filter((request) => request.status === "APPROVED").length,
      employeesWithBalances: new Set(entitlements.map((row) => row.employeeId)).size,
      availableDays: roundDays(entitlementRows.reduce((sum, row) => sum + row.availableDays, 0))
    }
  };
}

export async function upsertErpLeaveType(
  input: UpsertErpLeaveTypeRequest,
  actor: string
): Promise<ErpLeaveMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getHrContext(tx);
    if (!context) throw new Error("Flash ERP enterprise organization is not configured yet.");
    const company = await getPrimaryHrCompany(tx, context);
    if (!company) throw new Error("Create a company before configuring leave.");
    const leaveTypeId = normalizeOptionalText(input.leaveTypeId);
    const code = normalizeCode(input.code, "leave type code");
    const existing = leaveTypeId
      ? await tx.erpLeaveType.findFirst({ where: { id: leaveTypeId, companyId: company.id } })
      : null;
    if (leaveTypeId && !existing) throw new Error("Flash ERP could not find the leave type to update.");
    if (existing && existing.code !== code) throw new Error("Flash ERP keeps leave type codes stable after creation.");
    const data = {
      name: normalizeRequiredText(input.name, "leave type name"),
      description: normalizeOptionalText(input.description),
      defaultDays: normalizeNonNegativeNumber(input.defaultDays, "default leave days"),
      isPaid: input.isPaid !== false,
      requiresAttachment: input.requiresAttachment === true,
      genderEligibility: normalizeChoice(input.genderEligibility, "gender eligibility", [
        "ALL",
        "FEMALE",
        "MALE"
      ], "ALL"),
      status: normalizeChoice(input.status, "leave type status", ["ACTIVE", "INACTIVE"], "ACTIVE"),
      updatedBy: actor
    };
    const type = existing
      ? await tx.erpLeaveType.update({ where: { id: existing.id }, data })
      : await tx.erpLeaveType.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            code,
            ...data,
            createdBy: actor
          }
        });
    return {
      message: `Flash ERP saved leave type ${type.code}.`,
      leaveTypeId: type.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function upsertErpLeaveEntitlement(
  input: UpsertErpLeaveEntitlementRequest,
  actor: string
): Promise<ErpLeaveMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getHrContext(tx);
    if (!context) throw new Error("Flash ERP enterprise organization is not configured yet.");
    const company = await getPrimaryHrCompany(tx, context);
    if (!company) throw new Error("Create a company before configuring leave.");
    const employeeId = normalizeRequiredText(input.employeeId, "employee");
    const leaveTypeId = normalizeRequiredText(input.leaveTypeId, "leave type");
    const leaveYear = Math.trunc(Number(input.leaveYear ?? new Date().getUTCFullYear()));
    if (leaveYear < 2000 || leaveYear > 2200) throw new Error("Flash ERP needs a valid leave year.");
    const [employee, leaveType] = await Promise.all([
      tx.erpEmployee.findFirst({ where: { id: employeeId, companyId: company.id, status: activeStatus } }),
      tx.erpLeaveType.findFirst({ where: { id: leaveTypeId, companyId: company.id, status: activeStatus } })
    ]);
    if (!employee) throw new Error("Flash ERP needs an active employee for leave entitlement.");
    if (!leaveType) throw new Error("Flash ERP needs an active leave type for entitlement.");
    const existing = await tx.erpEmployeeLeaveEntitlement.findUnique({
      where: { employeeId_leaveTypeId_leaveYear: { employeeId, leaveTypeId, leaveYear } }
    });
    const entitlementId = normalizeOptionalText(input.entitlementId);
    if (entitlementId && existing?.id !== entitlementId) {
      throw new Error("Flash ERP could not find the leave entitlement to update.");
    }
    const entitlement = await tx.erpEmployeeLeaveEntitlement.upsert({
      where: { employeeId_leaveTypeId_leaveYear: { employeeId, leaveTypeId, leaveYear } },
      update: {
        openingDays: normalizeNonNegativeNumber(input.openingDays, "opening leave days"),
        allocatedDays: normalizeNonNegativeNumber(input.allocatedDays, "allocated leave days"),
        adjustedDays: Number(input.adjustedDays ?? 0),
        status: normalizeChoice(input.status, "entitlement status", ["ACTIVE", "INACTIVE"], "ACTIVE"),
        updatedBy: actor
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        employeeId,
        leaveTypeId,
        leaveYear,
        openingDays: normalizeNonNegativeNumber(input.openingDays, "opening leave days"),
        allocatedDays: normalizeNonNegativeNumber(
          input.allocatedDays ?? Number(leaveType.defaultDays),
          "allocated leave days"
        ),
        adjustedDays: Number(input.adjustedDays ?? 0),
        status: normalizeChoice(input.status, "entitlement status", ["ACTIVE", "INACTIVE"], "ACTIVE"),
        createdBy: actor,
        updatedBy: actor
      }
    });
    return {
      message: `Flash ERP saved ${leaveType.code} entitlement for ${employee.employeeNo}.`,
      entitlementId: entitlement.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

async function getOrCreateEntitlement(
  tx: Prisma.TransactionClient,
  input: {
    retailOrgId: string;
    companyId: string;
    employeeId: string;
    leaveTypeId: string;
    leaveYear: number;
    defaultDays: number;
    actor: string;
  }
) {
  return tx.erpEmployeeLeaveEntitlement.upsert({
    where: {
      employeeId_leaveTypeId_leaveYear: {
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        leaveYear: input.leaveYear
      }
    },
    update: {},
    create: {
      retailOrgId: input.retailOrgId,
      companyId: input.companyId,
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      leaveYear: input.leaveYear,
      allocatedDays: input.defaultDays,
      status: activeStatus,
      createdBy: input.actor,
      updatedBy: input.actor
    }
  });
}

export async function createErpLeaveRequest(
  input: CreateErpLeaveRequestRequest,
  actor: string
): Promise<ErpLeaveMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getHrContext(tx);
    if (!context) throw new Error("Flash ERP enterprise organization is not configured yet.");
    const company = await getPrimaryHrCompany(tx, context);
    if (!company) throw new Error("Create a company before requesting leave.");
    await ensureLeaveFoundation(tx, context.retailOrgId, company.id);
    const employeeId = normalizeRequiredText(input.employeeId, "employee");
    const leaveTypeId = normalizeRequiredText(input.leaveTypeId, "leave type");
    const startDate = normalizeDateOnly(input.startDate, "leave start date");
    const endDate = normalizeDateOnly(input.endDate, "leave end date");
    if (endDate < startDate) throw new Error("Flash ERP leave end date cannot precede the start date.");
    if (startDate.getUTCFullYear() !== endDate.getUTCFullYear()) {
      throw new Error("Basic HR leave requests must stay within one leave year.");
    }
    const requestedDays = requestedCalendarDays(startDate, endDate);
    const status = normalizeChoice(input.status, "leave request status", ["DRAFT", "SUBMITTED"], "SUBMITTED");
    const [employee, leaveType, overlap] = await Promise.all([
      tx.erpEmployee.findFirst({ where: { id: employeeId, companyId: company.id, status: activeStatus } }),
      tx.erpLeaveType.findFirst({ where: { id: leaveTypeId, companyId: company.id, status: activeStatus } }),
      tx.erpLeaveRequest.findFirst({
        where: {
          companyId: company.id,
          employeeId,
          status: { in: ["SUBMITTED", "APPROVED"] },
          startDate: { lte: endDate },
          endDate: { gte: startDate }
        }
      })
    ]);
    if (!employee) throw new Error("Flash ERP needs an active employee for a leave request.");
    if (!leaveType) throw new Error("Flash ERP needs an active leave type for a leave request.");
    if (overlap) throw new Error(`Leave request ${overlap.requestNo} overlaps the selected dates.`);
    if (
      leaveType.genderEligibility !== "ALL" &&
      employee.gender !== leaveType.genderEligibility
    ) {
      throw new Error(`${leaveType.name} is not available for this employee's configured gender.`);
    }
    const entitlement = await getOrCreateEntitlement(tx, {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      employeeId,
      leaveTypeId,
      leaveYear: startDate.getUTCFullYear(),
      defaultDays: Number(leaveType.defaultDays),
      actor
    });
    if (status === "SUBMITTED" && availableDays(entitlement) < requestedDays) {
      throw new Error(
        `Flash ERP leave balance is ${availableDays(entitlement)} day(s), below the ${requestedDays} day(s) requested.`
      );
    }
    const reserved = await reserveErpDocumentNumberInTransaction(tx, {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      documentType: "HR_LEAVE"
    });
    const request = await tx.erpLeaveRequest.create({
      data: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        requestNo: reserved.documentNo,
        employeeId,
        leaveTypeId,
        approverEmployeeId: employee.reportingManagerId,
        startDate,
        endDate,
        requestedDays,
        reason: normalizeOptionalText(input.reason),
        status,
        createdBy: actor,
        updatedBy: actor
      }
    });
    if (status === "SUBMITTED") {
      await tx.erpEmployeeLeaveEntitlement.update({
        where: { id: entitlement.id },
        data: { pendingDays: { increment: requestedDays }, updatedBy: actor }
      });
    }
    return {
      message: `Flash ERP saved leave request ${request.requestNo}.`,
      leaveRequestId: request.id,
      requestNo: request.requestNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function decideErpLeaveRequest(
  input: DecideErpLeaveRequestRequest,
  actor: string
): Promise<ErpLeaveMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getHrContext(tx);
    if (!context) throw new Error("Flash ERP enterprise organization is not configured yet.");
    const company = await getPrimaryHrCompany(tx, context);
    if (!company) throw new Error("Create a company before deciding leave.");
    const leaveRequestId = normalizeRequiredText(input.leaveRequestId, "leave request");
    const action = normalizeChoice(input.action, "leave action", [
      "SUBMIT",
      "APPROVE",
      "REJECT",
      "CANCEL"
    ]);
    const request = await tx.erpLeaveRequest.findFirst({
      where: { id: leaveRequestId, companyId: company.id },
      include: { leaveType: true, employee: true }
    });
    if (!request) throw new Error("Flash ERP could not find the leave request.");
    const entitlement = await getOrCreateEntitlement(tx, {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      employeeId: request.employeeId,
      leaveTypeId: request.leaveTypeId,
      leaveYear: request.startDate.getUTCFullYear(),
      defaultDays: Number(request.leaveType.defaultDays),
      actor
    });
    const days = Number(request.requestedDays);
    const note = normalizeOptionalText(input.note);

    if (action === "SUBMIT") {
      if (request.status !== "DRAFT") throw new Error("Only draft leave requests can be submitted.");
      if (availableDays(entitlement) < days) {
        throw new Error(`Flash ERP leave balance is ${availableDays(entitlement)} day(s).`);
      }
      await tx.erpEmployeeLeaveEntitlement.update({
        where: { id: entitlement.id },
        data: { pendingDays: { increment: days }, updatedBy: actor }
      });
      await tx.erpLeaveRequest.update({
        where: { id: request.id },
        data: { status: "SUBMITTED", updatedBy: actor }
      });
    } else if (action === "APPROVE") {
      if (request.status !== "SUBMITTED") throw new Error("Only submitted leave requests can be approved.");
      await tx.erpEmployeeLeaveEntitlement.update({
        where: { id: entitlement.id },
        data: {
          pendingDays: { decrement: days },
          usedDays: { increment: days },
          updatedBy: actor
        }
      });
      await tx.erpLeaveRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", decisionBy: actor, decisionAt: new Date(), decisionNote: note, updatedBy: actor }
      });
    } else if (action === "REJECT") {
      if (request.status !== "SUBMITTED") throw new Error("Only submitted leave requests can be rejected.");
      await tx.erpEmployeeLeaveEntitlement.update({
        where: { id: entitlement.id },
        data: { pendingDays: { decrement: days }, updatedBy: actor }
      });
      await tx.erpLeaveRequest.update({
        where: { id: request.id },
        data: { status: "REJECTED", decisionBy: actor, decisionAt: new Date(), decisionNote: note, updatedBy: actor }
      });
    } else {
      if (!["DRAFT", "SUBMITTED", "APPROVED"].includes(request.status)) {
        throw new Error("This leave request can no longer be cancelled.");
      }
      if (request.status === "SUBMITTED") {
        await tx.erpEmployeeLeaveEntitlement.update({
          where: { id: entitlement.id },
          data: { pendingDays: { decrement: days }, updatedBy: actor }
        });
      } else if (request.status === "APPROVED") {
        await tx.erpEmployeeLeaveEntitlement.update({
          where: { id: entitlement.id },
          data: { usedDays: { decrement: days }, updatedBy: actor }
        });
      }
      await tx.erpLeaveRequest.update({
        where: { id: request.id },
        data: {
          status: "CANCELLED",
          cancelledBy: actor,
          cancelledAt: new Date(),
          cancellationReason: note,
          updatedBy: actor
        }
      });
    }
    const actionLabel = {
      SUBMIT: "submitted",
      APPROVE: "approved",
      REJECT: "rejected",
      CANCEL: "cancelled"
    }[action];
    return {
      message: `Flash ERP ${actionLabel} leave request ${request.requestNo}.`,
      leaveRequestId: request.id,
      requestNo: request.requestNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}
