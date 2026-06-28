import { prisma } from "@/lib/db/prisma";
import { reserveHrDocumentNumber } from "@/server/repositories/erp-hr-numbering";
import {
  activeStatus,
  getHrContext,
  getPrimaryHrCompany,
  normalizeChoice,
  normalizeOptionalDate,
  normalizeOptionalText,
  normalizeRequiredText
} from "@/server/repositories/erp-hr-shared";

export type UpsertErpVisitorVisitRequest = {
  visitorVisitId?: string | null;
  visitorName?: string | null;
  phone?: string | null;
  organization?: string | null;
  idType?: string | null;
  idNumber?: string | null;
  purpose?: string | null;
  hostEmployeeId?: string | null;
  hostDepartmentId?: string | null;
  expectedAt?: string | Date | null;
  passNo?: string | null;
};

export type ErpVisitorVisitActionRequest = {
  visitorVisitId?: string | null;
  action?: string | null;
  note?: string | null;
};

export type ErpVisitorMutationResponse = {
  message: string;
  visitorVisitId: string;
  visitorNo: string;
  serverProcessedAt: string;
};

export type ErpVisitorWorkspaceData = {
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  departmentOptions: Array<{ departmentId: string; code: string; name: string }>;
  employeeOptions: Array<{
    employeeId: string;
    employeeNo: string;
    displayName: string;
    departmentId: string;
    departmentName: string;
  }>;
  visitorRows: Array<{
    visitorVisitId: string;
    visitorNo: string;
    visitorName: string;
    phone: string | null;
    organization: string | null;
    idType: string | null;
    idNumber: string | null;
    purpose: string;
    hostEmployeeId: string | null;
    hostEmployeeName: string | null;
    hostDepartmentId: string | null;
    hostDepartmentName: string | null;
    expectedAt: string | null;
    checkInAt: string | null;
    checkOutAt: string | null;
    passNo: string | null;
    status: string;
    registeredBy: string;
    statusChangeCount: number;
    updatedAt: string;
  }>;
  metrics: {
    onPremises: number;
    expectedToday: number;
    checkedOutToday: number;
    overdueCheckouts: number;
  };
};

export function buildUnavailableErpVisitorWorkspace(reason: string): ErpVisitorWorkspaceData {
  return {
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    departmentOptions: [],
    employeeOptions: [],
    visitorRows: [],
    metrics: { onPremises: 0, expectedToday: 0, checkedOutToday: 0, overdueCheckouts: 0 }
  };
}

export async function getErpVisitorWorkspace(): Promise<ErpVisitorWorkspaceData> {
  const context = await getHrContext();
  if (!context) {
    return buildUnavailableErpVisitorWorkspace(
      "Flash ERP enterprise organization is not configured yet."
    );
  }
  const company = await getPrimaryHrCompany(prisma, context);
  if (!company) {
    return buildUnavailableErpVisitorWorkspace(
      "Create a company before maintaining the visitor register."
    );
  }

  const historyStart = new Date();
  historyStart.setUTCDate(historyStart.getUTCDate() - 180);
  const [departments, employees, visitors] = await Promise.all([
    prisma.erpHrDepartment.findMany({
      where: { companyId: company.id, status: activeStatus },
      orderBy: { name: "asc" }
    }),
    prisma.erpEmployee.findMany({
      where: { companyId: company.id, status: activeStatus },
      orderBy: { displayName: "asc" },
      include: { department: true }
    }),
    prisma.erpVisitorVisit.findMany({
      where: {
        companyId: company.id,
        OR: [
          { status: { in: ["REGISTERED", "CHECKED_IN"] } },
          { updatedAt: { gte: historyStart } }
        ]
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        hostEmployee: true,
        hostDepartment: true,
        _count: { select: { statusLogs: true } }
      }
    })
  ]);

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(todayStart);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const overdueCutoff = new Date(now.getTime() - 12 * 60 * 60 * 1000);

  return {
    companyName: company.tradingName ?? company.legalName,
    statusMessage: `Visitor register for ${company.tradingName ?? company.legalName}.`,
    refreshedAt: new Date().toISOString(),
    departmentOptions: departments.map((department) => ({
      departmentId: department.id,
      code: department.code,
      name: department.name
    })),
    employeeOptions: employees.map((employee) => ({
      employeeId: employee.id,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName,
      departmentId: employee.departmentId,
      departmentName: employee.department.name
    })),
    visitorRows: visitors.map((visitor) => ({
      visitorVisitId: visitor.id,
      visitorNo: visitor.visitorNo,
      visitorName: visitor.visitorName,
      phone: visitor.phone,
      organization: visitor.organization,
      idType: visitor.idType,
      idNumber: visitor.idNumber,
      purpose: visitor.purpose,
      hostEmployeeId: visitor.hostEmployeeId,
      hostEmployeeName: visitor.hostEmployee?.displayName ?? null,
      hostDepartmentId: visitor.hostDepartmentId,
      hostDepartmentName: visitor.hostDepartment?.name ?? null,
      expectedAt: visitor.expectedAt?.toISOString() ?? null,
      checkInAt: visitor.checkInAt?.toISOString() ?? null,
      checkOutAt: visitor.checkOutAt?.toISOString() ?? null,
      passNo: visitor.passNo,
      status: visitor.status,
      registeredBy: visitor.registeredBy,
      statusChangeCount: visitor._count.statusLogs,
      updatedAt: visitor.updatedAt.toISOString()
    })),
    metrics: {
      onPremises: visitors.filter((visitor) => visitor.status === "CHECKED_IN").length,
      expectedToday: visitors.filter(
        (visitor) =>
          visitor.status === "REGISTERED" &&
          visitor.expectedAt &&
          visitor.expectedAt >= todayStart &&
          visitor.expectedAt < tomorrow
      ).length,
      checkedOutToday: visitors.filter(
        (visitor) =>
          visitor.status === "CHECKED_OUT" &&
          visitor.checkOutAt &&
          visitor.checkOutAt >= todayStart &&
          visitor.checkOutAt < tomorrow
      ).length,
      overdueCheckouts: visitors.filter(
        (visitor) =>
          visitor.status === "CHECKED_IN" &&
          visitor.checkInAt &&
          visitor.checkInAt < overdueCutoff
      ).length
    }
  };
}

export async function upsertErpVisitorVisit(
  input: UpsertErpVisitorVisitRequest,
  actor: string
): Promise<ErpVisitorMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getHrContext(tx);
    if (!context) throw new Error("Flash ERP enterprise organization is not configured yet.");
    const company = await getPrimaryHrCompany(tx, context);
    if (!company) throw new Error("Create a company before maintaining the visitor register.");

    const visitorVisitId = normalizeOptionalText(input.visitorVisitId);
    const existing = visitorVisitId
      ? await tx.erpVisitorVisit.findFirst({ where: { id: visitorVisitId, companyId: company.id } })
      : null;
    if (visitorVisitId && !existing) throw new Error("Flash ERP could not find the visitor visit.");
    if (existing && existing.status !== "REGISTERED") {
      throw new Error("Only registered visits can be edited before check-in.");
    }

    const hostEmployeeId = normalizeOptionalText(input.hostEmployeeId);
    const hostDepartmentId = normalizeOptionalText(input.hostDepartmentId);
    if (!hostEmployeeId && !hostDepartmentId) {
      throw new Error("Flash ERP needs a host employee or host department.");
    }
    const [hostEmployee, hostDepartment] = await Promise.all([
      hostEmployeeId
        ? tx.erpEmployee.findFirst({
            where: { id: hostEmployeeId, companyId: company.id, status: activeStatus }
          })
        : Promise.resolve(null),
      hostDepartmentId
        ? tx.erpHrDepartment.findFirst({
            where: { id: hostDepartmentId, companyId: company.id, status: activeStatus }
          })
        : Promise.resolve(null)
    ]);
    if (hostEmployeeId && !hostEmployee) {
      throw new Error("Flash ERP could not find the active host employee.");
    }
    if (hostDepartmentId && !hostDepartment) {
      throw new Error("Flash ERP could not find the active host department.");
    }

    let visitorNo = existing?.visitorNo ?? null;
    if (!visitorNo) {
      visitorNo = (
        await reserveHrDocumentNumber(tx, {
          context,
          company,
          documentType: "HR_VISITOR",
          prefix: "VIS"
        })
      ).documentNo;
    }

    const data = {
      visitorName: normalizeRequiredText(input.visitorName, "visitor name"),
      phone: normalizeOptionalText(input.phone),
      organization: normalizeOptionalText(input.organization),
      idType: normalizeOptionalText(input.idType),
      idNumber: normalizeOptionalText(input.idNumber),
      purpose: normalizeRequiredText(input.purpose, "purpose of visit"),
      hostEmployeeId,
      hostDepartmentId: hostDepartmentId ?? hostEmployee?.departmentId ?? null,
      expectedAt: normalizeOptionalDate(input.expectedAt, "expected visit time"),
      passNo: normalizeOptionalText(input.passNo)
    };

    const visitor = existing
      ? await tx.erpVisitorVisit.update({ where: { id: existing.id }, data })
      : await tx.erpVisitorVisit.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            visitorNo,
            status: "REGISTERED",
            registeredBy: actor,
            ...data
          }
        });

    if (!existing) {
      await tx.erpVisitorStatusLog.create({
        data: {
          retailOrgId: context.retailOrgId,
          companyId: company.id,
          visitorVisitId: visitor.id,
          action: "REGISTER",
          previousStatus: null,
          newStatus: "REGISTERED",
          changedBy: actor
        }
      });
    }

    return {
      message: `Flash ERP saved visitor ${visitor.visitorNo}.`,
      visitorVisitId: visitor.id,
      visitorNo: visitor.visitorNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function actionErpVisitorVisit(
  input: ErpVisitorVisitActionRequest,
  actor: string
): Promise<ErpVisitorMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getHrContext(tx);
    if (!context) throw new Error("Flash ERP enterprise organization is not configured yet.");
    const company = await getPrimaryHrCompany(tx, context);
    if (!company) throw new Error("Create a company before maintaining the visitor register.");
    const visitorVisitId = normalizeRequiredText(input.visitorVisitId, "visitor visit");
    const action = normalizeChoice(input.action, "visitor action", [
      "CHECK_IN",
      "CHECK_OUT",
      "CANCEL"
    ]);
    const visitor = await tx.erpVisitorVisit.findFirst({
      where: { id: visitorVisitId, companyId: company.id }
    });
    if (!visitor) throw new Error("Flash ERP could not find the visitor visit.");

    const now = new Date();
    const note = normalizeOptionalText(input.note);
    let newStatus: string;
    const data: Record<string, string | Date | null> = {};
    if (action === "CHECK_IN") {
      if (visitor.status !== "REGISTERED") {
        throw new Error("Only registered visitors can be checked in.");
      }
      newStatus = "CHECKED_IN";
      data.checkInAt = now;
      data.checkInBy = actor;
    } else if (action === "CHECK_OUT") {
      if (visitor.status !== "CHECKED_IN") {
        throw new Error("Only checked-in visitors can be checked out.");
      }
      newStatus = "CHECKED_OUT";
      data.checkOutAt = now;
      data.checkOutBy = actor;
    } else {
      if (visitor.status !== "REGISTERED") {
        throw new Error("Only registered visits can be cancelled.");
      }
      if (!note) throw new Error("Flash ERP needs a cancellation reason.");
      newStatus = "CANCELLED";
      data.cancelledAt = now;
      data.cancelledBy = actor;
      data.cancellationReason = note;
    }
    data.status = newStatus;

    await tx.erpVisitorVisit.update({ where: { id: visitor.id }, data });
    await tx.erpVisitorStatusLog.create({
      data: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        visitorVisitId: visitor.id,
        action,
        previousStatus: visitor.status,
        newStatus,
        note,
        changedBy: actor
      }
    });

    return {
      message: `Flash ERP ${action === "CHECK_IN" ? "checked in" : action === "CHECK_OUT" ? "checked out" : "cancelled"} visitor ${visitor.visitorNo}.`,
      visitorVisitId: visitor.id,
      visitorNo: visitor.visitorNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}
