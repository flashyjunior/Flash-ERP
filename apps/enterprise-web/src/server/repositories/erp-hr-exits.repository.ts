import { prisma } from "@/lib/db/prisma";
import { reserveHrDocumentNumber } from "@/server/repositories/erp-hr-numbering";
import {
  activeStatus,
  dateInputValue,
  getHrContext,
  getPrimaryHrCompany,
  normalizeChoice,
  normalizeDateOnly,
  normalizeOptionalDate,
  normalizeOptionalText,
  normalizeRequiredText
} from "@/server/repositories/erp-hr-shared";

export type UpsertErpEmployeeExitRequest = {
  exitId?: string | null;
  employeeId?: string | null;
  exitType?: string | null;
  noticeDate?: string | Date | null;
  resignationDate?: string | Date | null;
  terminationDate?: string | Date | null;
  lastWorkingDate?: string | Date | null;
  exitReason?: string | null;
  note?: string | null;
  finalSettlementStatus?: string | null;
  assetReturnStatus?: string | null;
};

export type ErpEmployeeExitActionRequest = {
  exitId?: string | null;
  action?: string | null;
};

export type ErpEmployeeExitMutationResponse = {
  message: string;
  exitId: string;
  exitNo: string;
  serverProcessedAt: string;
};

export type ErpEmployeeExitsWorkspaceData = {
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  employeeOptions: Array<{
    employeeId: string;
    employeeNo: string;
    displayName: string;
    departmentName: string;
    employmentDate: string;
    status: string;
    hasExitRecord: boolean;
  }>;
  exitRows: Array<{
    exitId: string;
    exitNo: string;
    employeeId: string;
    employeeNo: string;
    employeeName: string;
    departmentName: string;
    exitType: string;
    noticeDate: string | null;
    resignationDate: string | null;
    terminationDate: string | null;
    lastWorkingDate: string;
    exitReason: string;
    note: string | null;
    finalSettlementStatus: string;
    assetReturnStatus: string;
    status: string;
    confirmedBy: string | null;
    confirmedAt: string | null;
    updatedAt: string;
  }>;
  metrics: {
    draftExits: number;
    finalizedExits: number;
    incompleteSettlements: number;
    outstandingAssets: number;
  };
};

export function buildUnavailableErpEmployeeExitsWorkspace(
  reason: string
): ErpEmployeeExitsWorkspaceData {
  return {
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    employeeOptions: [],
    exitRows: [],
    metrics: {
      draftExits: 0,
      finalizedExits: 0,
      incompleteSettlements: 0,
      outstandingAssets: 0
    }
  };
}

export async function getErpEmployeeExitsWorkspace(): Promise<ErpEmployeeExitsWorkspaceData> {
  const context = await getHrContext();
  if (!context) {
    return buildUnavailableErpEmployeeExitsWorkspace(
      "Flash ERP enterprise organization is not configured yet."
    );
  }
  const company = await getPrimaryHrCompany(prisma, context);
  if (!company) {
    return buildUnavailableErpEmployeeExitsWorkspace(
      "Create a company before maintaining employee exits."
    );
  }

  const [employees, exits] = await Promise.all([
    prisma.erpEmployee.findMany({
      where: { companyId: company.id, status: { not: "DELETED" } },
      orderBy: [{ status: "asc" }, { displayName: "asc" }],
      include: { department: true, exitRecord: { select: { id: true } } }
    }),
    prisma.erpEmployeeExit.findMany({
      where: { companyId: company.id },
      orderBy: [{ status: "asc" }, { lastWorkingDate: "desc" }],
      include: { employee: { include: { department: true } } }
    })
  ]);

  return {
    companyName: company.tradingName ?? company.legalName,
    statusMessage: `Employee exit records for ${company.tradingName ?? company.legalName}.`,
    refreshedAt: new Date().toISOString(),
    employeeOptions: employees.map((employee) => ({
      employeeId: employee.id,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName,
      departmentName: employee.department.name,
      employmentDate: dateInputValue(employee.employmentDate) ?? "",
      status: employee.status,
      hasExitRecord: Boolean(employee.exitRecord)
    })),
    exitRows: exits.map((exit) => ({
      exitId: exit.id,
      exitNo: exit.exitNo,
      employeeId: exit.employeeId,
      employeeNo: exit.employee.employeeNo,
      employeeName: exit.employee.displayName,
      departmentName: exit.employee.department.name,
      exitType: exit.exitType,
      noticeDate: dateInputValue(exit.noticeDate),
      resignationDate: dateInputValue(exit.resignationDate),
      terminationDate: dateInputValue(exit.terminationDate),
      lastWorkingDate: dateInputValue(exit.lastWorkingDate) ?? "",
      exitReason: exit.exitReason,
      note: exit.note,
      finalSettlementStatus: exit.finalSettlementStatus,
      assetReturnStatus: exit.assetReturnStatus,
      status: exit.status,
      confirmedBy: exit.confirmedBy,
      confirmedAt: exit.confirmedAt?.toISOString() ?? null,
      updatedAt: exit.updatedAt.toISOString()
    })),
    metrics: {
      draftExits: exits.filter((exit) => exit.status === "DRAFT").length,
      finalizedExits: exits.filter((exit) => exit.status === "FINALIZED").length,
      incompleteSettlements: exits.filter(
        (exit) => !["COMPLETED", "WAIVED"].includes(exit.finalSettlementStatus)
      ).length,
      outstandingAssets: exits.filter(
        (exit) => !["COMPLETED", "WAIVED"].includes(exit.assetReturnStatus)
      ).length
    }
  };
}

export async function upsertErpEmployeeExit(
  input: UpsertErpEmployeeExitRequest,
  actor: string
): Promise<ErpEmployeeExitMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getHrContext(tx);
    if (!context) throw new Error("Flash ERP enterprise organization is not configured yet.");
    const company = await getPrimaryHrCompany(tx, context);
    if (!company) throw new Error("Create a company before maintaining employee exits.");

    const exitId = normalizeOptionalText(input.exitId);
    const employeeId = normalizeRequiredText(input.employeeId, "employee");
    const [existing, employee, employeeExit] = await Promise.all([
      exitId
        ? tx.erpEmployeeExit.findFirst({ where: { id: exitId, companyId: company.id } })
        : Promise.resolve(null),
      tx.erpEmployee.findFirst({ where: { id: employeeId, companyId: company.id } }),
      tx.erpEmployeeExit.findUnique({ where: { employeeId } })
    ]);
    if (exitId && !existing) throw new Error("Flash ERP could not find the employee exit record.");
    if (!employee) throw new Error("Flash ERP could not find the selected employee.");
    if (existing?.status === "FINALIZED") {
      throw new Error("Reopen this finalized exit before making corrections.");
    }
    if (employeeExit && employeeExit.id !== existing?.id) {
      throw new Error(`Employee ${employee.employeeNo} already has exit record ${employeeExit.exitNo}.`);
    }

    const exitType = normalizeChoice(input.exitType, "exit type", [
      "RESIGNATION",
      "TERMINATION"
    ]);
    const noticeDate = normalizeOptionalDate(input.noticeDate, "notice date");
    const resignationDate = normalizeOptionalDate(input.resignationDate, "resignation date");
    const terminationDate = normalizeOptionalDate(input.terminationDate, "termination date");
    const lastWorkingDate = normalizeDateOnly(input.lastWorkingDate, "last working date");
    if (lastWorkingDate < employee.employmentDate) {
      throw new Error("Flash ERP last working date cannot precede the employment date.");
    }
    if (exitType === "RESIGNATION" && !resignationDate) {
      throw new Error("Flash ERP needs a resignation date for a resignation exit.");
    }
    if (exitType === "TERMINATION" && !terminationDate) {
      throw new Error("Flash ERP needs a termination date for a termination exit.");
    }
    const effectiveDate = exitType === "RESIGNATION" ? resignationDate : terminationDate;
    if (effectiveDate && effectiveDate > lastWorkingDate) {
      throw new Error("Flash ERP exit date cannot be after the last working date.");
    }
    if (noticeDate && noticeDate > lastWorkingDate) {
      throw new Error("Flash ERP notice date cannot be after the last working date.");
    }

    const checklistStatuses = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "WAIVED"];
    const finalSettlementStatus = normalizeChoice(
      input.finalSettlementStatus,
      "final settlement status",
      checklistStatuses,
      "NOT_STARTED"
    );
    const assetReturnStatus = normalizeChoice(
      input.assetReturnStatus,
      "asset return status",
      checklistStatuses,
      "NOT_STARTED"
    );

    let exitNo = existing?.exitNo ?? null;
    if (!exitNo) {
      exitNo = (
        await reserveHrDocumentNumber(tx, {
          context,
          company,
          documentType: "HR_EXIT",
          prefix: "EXT"
        })
      ).documentNo;
    }

    const data = {
      employeeId,
      exitType,
      noticeDate,
      resignationDate: exitType === "RESIGNATION" ? resignationDate : null,
      terminationDate: exitType === "TERMINATION" ? terminationDate : null,
      lastWorkingDate,
      exitReason: normalizeRequiredText(input.exitReason, "exit reason"),
      note: normalizeOptionalText(input.note),
      finalSettlementStatus,
      assetReturnStatus,
      updatedBy: actor
    };

    const exit = existing
      ? await tx.erpEmployeeExit.update({ where: { id: existing.id }, data })
      : await tx.erpEmployeeExit.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            exitNo,
            status: "DRAFT",
            previousEmployeeStatus: employee.status,
            createdBy: actor,
            ...data
          }
        });

    return {
      message: `Flash ERP saved employee exit ${exit.exitNo}.`,
      exitId: exit.id,
      exitNo: exit.exitNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function actionErpEmployeeExit(
  input: ErpEmployeeExitActionRequest,
  actor: string
): Promise<ErpEmployeeExitMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getHrContext(tx);
    if (!context) throw new Error("Flash ERP enterprise organization is not configured yet.");
    const company = await getPrimaryHrCompany(tx, context);
    if (!company) throw new Error("Create a company before maintaining employee exits.");
    const exitId = normalizeRequiredText(input.exitId, "employee exit");
    const action = normalizeChoice(input.action, "exit action", ["FINALIZE", "REOPEN"]);
    const exit = await tx.erpEmployeeExit.findFirst({
      where: { id: exitId, companyId: company.id },
      include: { employee: true }
    });
    if (!exit) throw new Error("Flash ERP could not find the employee exit record.");

    if (action === "FINALIZE") {
      if (exit.status !== "DRAFT") throw new Error("Only draft employee exits can be finalized.");
      await tx.erpEmployeeExit.update({
        where: { id: exit.id },
        data: {
          status: "FINALIZED",
          confirmedBy: actor,
          confirmedAt: new Date(),
          updatedBy: actor
        }
      });
      await tx.erpEmployee.update({
        where: { id: exit.employeeId },
        data: {
          status: exit.exitType === "RESIGNATION" ? "RESIGNED" : "TERMINATED",
          updatedBy: actor
        }
      });
    } else {
      if (exit.status !== "FINALIZED") throw new Error("Only finalized exits can be reopened.");
      await tx.erpEmployeeExit.update({
        where: { id: exit.id },
        data: {
          status: "DRAFT",
          confirmedBy: null,
          confirmedAt: null,
          reopenedBy: actor,
          reopenedAt: new Date(),
          updatedBy: actor
        }
      });
      await tx.erpEmployee.update({
        where: { id: exit.employeeId },
        data: { status: exit.previousEmployeeStatus || activeStatus, updatedBy: actor }
      });
    }

    return {
      message: `Flash ERP ${action === "FINALIZE" ? "finalized" : "reopened"} employee exit ${exit.exitNo}.`,
      exitId: exit.id,
      exitNo: exit.exitNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}
