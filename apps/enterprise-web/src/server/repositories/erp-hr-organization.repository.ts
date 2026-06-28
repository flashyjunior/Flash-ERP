import { type Prisma } from "@prisma/client";

import { RecordStatus, SyncNodeType } from "@flash-erp/domain";
import { prisma } from "@/lib/db/prisma";

type HrOrganizationContext = {
  retailOrgId: string;
  retailOrg: {
    code: string;
    name: string;
  };
};

type HrOrganizationCompany = {
  id: string;
  code: string;
  legalName: string;
  tradingName: string | null;
};

export type UpsertErpHrDepartmentRequest = {
  departmentId?: string | null;
  code?: string | null;
  name?: string | null;
  description?: string | null;
  headEmployeeId?: string | null;
  status?: string | null;
};

export type UpsertErpHrPositionRequest = {
  positionId?: string | null;
  departmentId?: string | null;
  reportsToPositionId?: string | null;
  code?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
};

export type UpsertErpEmployeeCategoryRequest = {
  employeeCategoryId?: string | null;
  code?: string | null;
  name?: string | null;
  description?: string | null;
  status?: string | null;
};

export type ErpHrOrganizationMutationResponse = {
  message: string;
  departmentId?: string;
  positionId?: string;
  employeeCategoryId?: string;
  serverProcessedAt: string;
};

export type ErpHrOrganizationWorkspaceData = {
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  employeeOptions: Array<{
    employeeId: string;
    employeeNo: string;
    displayName: string;
  }>;
  departmentRows: Array<{
    departmentId: string;
    code: string;
    name: string;
    description: string | null;
    headEmployeeId: string | null;
    headEmployeeName: string | null;
    financeDimensionId: string;
    financeDimensionCode: string;
    financeDimensionName: string;
    financeDimensionStatus: string;
    positionCount: number;
    activePositionCount: number;
    status: string;
    updatedAt: string;
  }>;
  positionRows: Array<{
    positionId: string;
    departmentId: string;
    departmentCode: string;
    departmentName: string;
    reportsToPositionId: string | null;
    reportsToPositionCode: string | null;
    reportsToPositionTitle: string | null;
    code: string;
    title: string;
    description: string | null;
    directReportCount: number;
    status: string;
    updatedAt: string;
  }>;
  employeeCategoryRows: Array<{
    employeeCategoryId: string;
    code: string;
    name: string;
    description: string | null;
    status: string;
    updatedAt: string;
  }>;
  metrics: {
    activeDepartments: number;
    activePositions: number;
    activeEmployeeCategories: number;
    mappedDepartments: number;
  };
};

const activeStatus = RecordStatus.ACTIVE;
const hrEmployeeCategorySeeds = [
  {
    code: "PERMANENT",
    name: "Permanent",
    description: "Employees engaged on an ongoing permanent basis."
  },
  {
    code: "CONTRACT",
    name: "Contract",
    description: "Employees engaged under a fixed-term employment contract."
  },
  {
    code: "CASUAL",
    name: "Casual",
    description: "Employees engaged for casual, temporary, or daily-rated work."
  },
  {
    code: "INTERN",
    name: "Intern",
    description: "Employees engaged under an internship or attachment arrangement."
  }
];

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function normalizeRequiredText(value: string | null | undefined, label: string) {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    throw new Error(`Flash ERP needs a ${label}.`);
  }

  return normalized;
}

function normalizeCode(value: string | null | undefined, label: string) {
  const normalized = normalizeRequiredText(value, label)
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase()
    .slice(0, 40);

  if (!normalized) {
    throw new Error(`Flash ERP needs a valid ${label}.`);
  }

  return normalized;
}

function normalizeStatus(value: string | null | undefined) {
  const normalized = normalizeCode(value ?? activeStatus, "status");

  if (![activeStatus, "INACTIVE"].includes(normalized)) {
    throw new Error("Flash ERP status must be Active or Inactive.");
  }

  return normalized;
}

async function getHrOrganizationContext(
  tx: Prisma.TransactionClient = prisma
): Promise<HrOrganizationContext | null> {
  const enterpriseNode = await tx.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: activeStatus
    },
    select: {
      retailOrgId: true,
      retailOrg: {
        select: {
          code: true,
          name: true
        }
      }
    }
  });

  if (!enterpriseNode) {
    return null;
  }

  return {
    retailOrgId: enterpriseNode.retailOrgId,
    retailOrg: enterpriseNode.retailOrg
  };
}

async function getPrimaryCompany(
  tx: Prisma.TransactionClient,
  context: HrOrganizationContext
): Promise<HrOrganizationCompany | null> {
  return tx.erpCompany.findFirst({
    where: {
      retailOrgId: context.retailOrgId,
      status: activeStatus
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      legalName: true,
      tradingName: true
    }
  });
}

async function ensureHrOrganizationFoundation(
  tx: Prisma.TransactionClient,
  context: HrOrganizationContext,
  company: HrOrganizationCompany
) {
  for (const category of hrEmployeeCategorySeeds) {
    await tx.erpEmployeeCategory.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: category.code
        }
      },
      update: {},
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        ...category,
        status: activeStatus,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      }
    });
  }

  const fiscalYear = await tx.erpFiscalYear.findFirst({
    where: {
      companyId: company.id,
      status: {
        not: "CLOSED"
      }
    },
    orderBy: [{ startsOn: "desc" }, { code: "desc" }],
    select: {
      id: true
    }
  });

  if (!fiscalYear) {
    return;
  }

  for (const sequence of [
    { documentType: "HR_EMPLOYEE", prefix: "EMP" },
    { documentType: "HR_VISITOR", prefix: "VIS" }
  ]) {
    await tx.erpDocumentSequence.upsert({
      where: {
        companyId_documentType_fiscalYearId: {
          companyId: company.id,
          documentType: sequence.documentType,
          fiscalYearId: fiscalYear.id
        }
      },
      update: {
        prefix: sequence.prefix,
        resetPolicy: "NEVER",
        status: activeStatus
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        fiscalYearId: fiscalYear.id,
        documentType: sequence.documentType,
        prefix: sequence.prefix,
        nextSequence: 1,
        paddingLength: 6,
        resetPolicy: "NEVER",
        status: activeStatus
      }
    });
  }
}

export function buildUnavailableErpHrOrganizationWorkspace(
  reason: string
): ErpHrOrganizationWorkspaceData {
  return {
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    employeeOptions: [],
    departmentRows: [],
    positionRows: [],
    employeeCategoryRows: [],
    metrics: {
      activeDepartments: 0,
      activePositions: 0,
      activeEmployeeCategories: 0,
      mappedDepartments: 0
    }
  };
}

export async function getErpHrOrganizationWorkspace(): Promise<ErpHrOrganizationWorkspaceData> {
  const context = await getHrOrganizationContext();

  if (!context) {
    return buildUnavailableErpHrOrganizationWorkspace(
      "Flash ERP enterprise organization is not configured yet."
    );
  }

  const company = await getPrimaryCompany(prisma, context);

  if (!company) {
    return buildUnavailableErpHrOrganizationWorkspace(
      "Create a company in Finance foundation before configuring Human Resources."
    );
  }

  await prisma.$transaction((tx) => ensureHrOrganizationFoundation(tx, context, company));

  const [departments, positions, employeeCategories, employees] = await Promise.all([
    prisma.erpHrDepartment.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ code: "asc" }],
      include: {
        financeDimension: true,
        headEmployee: true,
        positions: {
          select: {
            status: true
          }
        }
      }
    }),
    prisma.erpHrPosition.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ department: { code: "asc" } }, { code: "asc" }],
      include: {
        department: true,
        reportsToPosition: true,
        _count: {
          select: {
            directReports: true
          }
        }
      }
    }),
    prisma.erpEmployeeCategory.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ code: "asc" }]
    }),
    prisma.erpEmployee.findMany({
      where: {
        companyId: company.id,
        status: activeStatus
      },
      orderBy: [{ displayName: "asc" }],
      select: {
        id: true,
        employeeNo: true,
        displayName: true
      }
    })
  ]);

  return {
    companyName: company.tradingName ?? company.legalName,
    statusMessage: `Organization setup for ${company.tradingName ?? company.legalName}.`,
    refreshedAt: new Date().toISOString(),
    employeeOptions: employees.map((employee) => ({
      employeeId: employee.id,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName
    })),
    departmentRows: departments.map((department) => ({
      departmentId: department.id,
      code: department.code,
      name: department.name,
      description: department.description,
      headEmployeeId: department.headEmployeeId,
      headEmployeeName: department.headEmployee?.displayName ?? null,
      financeDimensionId: department.financeDimensionId,
      financeDimensionCode: department.financeDimension.code,
      financeDimensionName: department.financeDimension.name,
      financeDimensionStatus: department.financeDimension.status,
      positionCount: department.positions.length,
      activePositionCount: department.positions.filter((position) => position.status === activeStatus)
        .length,
      status: department.status,
      updatedAt: department.updatedAt.toISOString()
    })),
    positionRows: positions.map((position) => ({
      positionId: position.id,
      departmentId: position.departmentId,
      departmentCode: position.department.code,
      departmentName: position.department.name,
      reportsToPositionId: position.reportsToPositionId,
      reportsToPositionCode: position.reportsToPosition?.code ?? null,
      reportsToPositionTitle: position.reportsToPosition?.title ?? null,
      code: position.code,
      title: position.title,
      description: position.description,
      directReportCount: position._count.directReports,
      status: position.status,
      updatedAt: position.updatedAt.toISOString()
    })),
    employeeCategoryRows: employeeCategories.map((category) => ({
      employeeCategoryId: category.id,
      code: category.code,
      name: category.name,
      description: category.description,
      status: category.status,
      updatedAt: category.updatedAt.toISOString()
    })),
    metrics: {
      activeDepartments: departments.filter((department) => department.status === activeStatus).length,
      activePositions: positions.filter((position) => position.status === activeStatus).length,
      activeEmployeeCategories: employeeCategories.filter(
        (category) => category.status === activeStatus
      ).length,
      mappedDepartments: departments.filter(
        (department) =>
          department.financeDimension.dimensionType === "DEPARTMENT" &&
          department.financeDimension.code === department.code
      ).length
    }
  };
}

export async function upsertErpHrDepartment(
  input: UpsertErpHrDepartmentRequest,
  actor: string
): Promise<ErpHrOrganizationMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getHrOrganizationContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise organization is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before configuring Human Resources.");
    }

    const departmentId = normalizeOptionalText(input.departmentId);
    const code = normalizeCode(input.code, "department code");
    const name = normalizeRequiredText(input.name, "department name");
    const description = normalizeOptionalText(input.description);
    const headEmployeeId = normalizeOptionalText(input.headEmployeeId);
    const status = normalizeStatus(input.status);
    const existing = departmentId
      ? await tx.erpHrDepartment.findFirst({
          where: {
            id: departmentId,
            companyId: company.id
          },
          include: {
            positions: {
              where: {
                status: activeStatus
              },
              select: {
                id: true
              }
            }
          }
        })
      : null;

    if (departmentId && !existing) {
      throw new Error("Flash ERP could not find the HR department to update.");
    }

    if (existing && existing.code !== code) {
      throw new Error("Flash ERP keeps department codes stable after creation.");
    }

    if (existing && status === "INACTIVE" && existing.positions.length > 0) {
      throw new Error("Deactivate this department's active positions before deactivating the department.");
    }

    if (headEmployeeId) {
      const headEmployee = await tx.erpEmployee.findFirst({
        where: {
          id: headEmployeeId,
          companyId: company.id,
          status: activeStatus
        }
      });

      if (!headEmployee) {
        throw new Error("Flash ERP needs an active employee in the same company as department head.");
      }
    }

    const duplicate = await tx.erpHrDepartment.findFirst({
      where: {
        companyId: company.id,
        code,
        ...(existing ? { id: { not: existing.id } } : {})
      },
      select: {
        id: true
      }
    });

    if (duplicate) {
      throw new Error(`Flash ERP already has HR department ${code}.`);
    }

    let financeDimensionId = existing?.financeDimensionId ?? null;

    if (financeDimensionId) {
      await tx.erpFinanceDimension.update({
        where: {
          id: financeDimensionId
        },
        data: {
          code,
          name,
          description,
          status
        }
      });
    } else {
      const dimension = await tx.erpFinanceDimension.upsert({
        where: {
          companyId_dimensionType_code: {
            companyId: company.id,
            dimensionType: "DEPARTMENT",
            code
          }
        },
        update: {
          name,
          description,
          status
        },
        create: {
          retailOrgId: context.retailOrgId,
          companyId: company.id,
          dimensionType: "DEPARTMENT",
          code,
          name,
          description,
          status
        }
      });
      const claimed = await tx.erpHrDepartment.findFirst({
        where: {
          financeDimensionId: dimension.id
        },
        select: {
          code: true
        }
      });

      if (claimed) {
        throw new Error(
          `Finance department dimension ${code} is already linked to HR department ${claimed.code}.`
        );
      }

      financeDimensionId = dimension.id;
    }

    const department = existing
      ? await tx.erpHrDepartment.update({
          where: {
            id: existing.id
          },
          data: {
            name,
            description,
            headEmployeeId,
            status,
            updatedBy: actor
          }
        })
      : await tx.erpHrDepartment.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            financeDimensionId,
            code,
            name,
            description,
            headEmployeeId,
            status,
            createdBy: actor,
            updatedBy: actor
          }
        });

    return {
      message: `Flash ERP saved HR department ${department.code}.`,
      departmentId: department.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

async function validateReportsToPosition(
  tx: Prisma.TransactionClient,
  companyId: string,
  positionId: string | null,
  reportsToPositionId: string | null
) {
  if (!reportsToPositionId) {
    return;
  }

  if (positionId && positionId === reportsToPositionId) {
    throw new Error("A position cannot report to itself.");
  }

  let currentId: string | null = reportsToPositionId;
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) {
      throw new Error("Flash ERP detected a circular position reporting structure.");
    }

    visited.add(currentId);
    const current: { id: string; reportsToPositionId: string | null; status: string } | null =
      await tx.erpHrPosition.findFirst({
        where: {
          id: currentId,
          companyId
        },
        select: {
          id: true,
          reportsToPositionId: true,
          status: true
        }
      });

    if (!current || current.status !== activeStatus) {
      throw new Error("Flash ERP needs an active reports-to position in the same company.");
    }

    if (positionId && current.id === positionId) {
      throw new Error("Flash ERP cannot save a circular position reporting structure.");
    }

    currentId = current.reportsToPositionId;
  }
}

export async function upsertErpHrPosition(
  input: UpsertErpHrPositionRequest,
  actor: string
): Promise<ErpHrOrganizationMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getHrOrganizationContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise organization is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before configuring Human Resources.");
    }

    const positionId = normalizeOptionalText(input.positionId);
    const departmentId = normalizeRequiredText(input.departmentId, "department");
    const reportsToPositionId = normalizeOptionalText(input.reportsToPositionId);
    const code = normalizeCode(input.code, "position code");
    const title = normalizeRequiredText(input.title, "position title");
    const description = normalizeOptionalText(input.description);
    const status = normalizeStatus(input.status);
    const existing = positionId
      ? await tx.erpHrPosition.findFirst({
          where: {
            id: positionId,
            companyId: company.id
          },
          include: {
            directReports: {
              where: {
                status: activeStatus
              },
              select: {
                id: true
              }
            }
          }
        })
      : null;

    if (positionId && !existing) {
      throw new Error("Flash ERP could not find the HR position to update.");
    }

    if (existing && existing.code !== code) {
      throw new Error("Flash ERP keeps position codes stable after creation.");
    }

    if (existing && status === "INACTIVE" && existing.directReports.length > 0) {
      throw new Error("Reassign this position's active direct reports before deactivating it.");
    }

    const department = await tx.erpHrDepartment.findFirst({
      where: {
        id: departmentId,
        companyId: company.id
      },
      select: {
        id: true,
        code: true,
        status: true
      }
    });

    if (!department || (status === activeStatus && department.status !== activeStatus)) {
      throw new Error("Flash ERP needs an active HR department for an active position.");
    }

    const duplicate = await tx.erpHrPosition.findFirst({
      where: {
        companyId: company.id,
        code,
        ...(existing ? { id: { not: existing.id } } : {})
      },
      select: {
        id: true
      }
    });

    if (duplicate) {
      throw new Error(`Flash ERP already has HR position ${code}.`);
    }

    await validateReportsToPosition(tx, company.id, existing?.id ?? null, reportsToPositionId);

    const position = existing
      ? await tx.erpHrPosition.update({
          where: {
            id: existing.id
          },
          data: {
            departmentId,
            reportsToPositionId,
            title,
            description,
            status,
            updatedBy: actor
          }
        })
      : await tx.erpHrPosition.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            departmentId,
            reportsToPositionId,
            code,
            title,
            description,
            status,
            createdBy: actor,
            updatedBy: actor
          }
        });

    return {
      message: `Flash ERP saved HR position ${position.code}.`,
      positionId: position.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function upsertErpEmployeeCategory(
  input: UpsertErpEmployeeCategoryRequest,
  actor: string
): Promise<ErpHrOrganizationMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getHrOrganizationContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise organization is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before configuring Human Resources.");
    }

    const employeeCategoryId = normalizeOptionalText(input.employeeCategoryId);
    const code = normalizeCode(input.code, "employee category code");
    const name = normalizeRequiredText(input.name, "employee category name");
    const description = normalizeOptionalText(input.description);
    const status = normalizeStatus(input.status);
    const existing = employeeCategoryId
      ? await tx.erpEmployeeCategory.findFirst({
          where: {
            id: employeeCategoryId,
            companyId: company.id
          }
        })
      : null;

    if (employeeCategoryId && !existing) {
      throw new Error("Flash ERP could not find the employee category to update.");
    }

    if (existing && existing.code !== code) {
      throw new Error("Flash ERP keeps employee category codes stable after creation.");
    }

    const duplicate = await tx.erpEmployeeCategory.findFirst({
      where: {
        companyId: company.id,
        code,
        ...(existing ? { id: { not: existing.id } } : {})
      },
      select: {
        id: true
      }
    });

    if (duplicate) {
      throw new Error(`Flash ERP already has employee category ${code}.`);
    }

    const category = existing
      ? await tx.erpEmployeeCategory.update({
          where: {
            id: existing.id
          },
          data: {
            name,
            description,
            status,
            updatedBy: actor
          }
        })
      : await tx.erpEmployeeCategory.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            code,
            name,
            description,
            status,
            createdBy: actor,
            updatedBy: actor
          }
        });

    return {
      message: `Flash ERP saved employee category ${category.code}.`,
      employeeCategoryId: category.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}
