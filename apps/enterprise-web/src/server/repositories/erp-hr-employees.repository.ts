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
  normalizeOptionalDate,
  normalizeOptionalText,
  normalizeRequiredText
} from "@/server/repositories/erp-hr-shared";
import { reserveErpDocumentNumberInTransaction } from "@/server/services/erp-document-numbering";

export type UpsertErpEmployeeRequest = {
  employeeId?: string | null;
  retailUserId?: string | null;
  primaryStoreId?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  employeeCategoryId?: string | null;
  reportingManagerId?: string | null;
  headDepartmentId?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | Date | null;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  countryCode?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  employmentDate?: string | Date | null;
  salaryType?: string | null;
  status?: string | null;
};

export type UpsertErpEmployeeCompensationRequest = {
  employeeId?: string | null;
  basicSalary?: number | string | null;
  currencyCode?: string | null;
  paymentFrequency?: string | null;
  taxResidency?: string | null;
  monthlyTaxRelief?: number | string | null;
  pensionStatus?: string | null;
  tier2TrusteeName?: string | null;
  tier2MemberNo?: string | null;
  taxId?: string | null;
  ssnitId?: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  bankAccountName?: string | null;
  bankAccountNo?: string | null;
  status?: string | null;
  payItems?: Array<{
    componentType?: string | null;
    code?: string | null;
    name?: string | null;
    calculationType?: string | null;
    amount?: number | string | null;
    percentage?: number | string | null;
    isTaxable?: boolean | null;
    isPensionable?: boolean | null;
    effectiveFrom?: string | Date | null;
    effectiveTo?: string | Date | null;
    status?: string | null;
  }> | null;
};

export type ErpEmployeeMutationResponse = {
  message: string;
  employeeId: string;
  employeeNo: string;
  serverProcessedAt: string;
};

export type ErpEmployeesWorkspaceData = {
  companyName: string;
  currencyCode: string;
  statusMessage: string;
  refreshedAt: string;
  canManageEmployees: boolean;
  canViewCompensation: boolean;
  canManageCompensation: boolean;
  departmentOptions: Array<{
    departmentId: string;
    code: string;
    name: string;
    status: string;
  }>;
  positionOptions: Array<{
    positionId: string;
    departmentId: string;
    code: string;
    title: string;
    status: string;
  }>;
  employeeCategoryOptions: Array<{
    employeeCategoryId: string;
    code: string;
    name: string;
    status: string;
  }>;
  storeOptions: Array<{
    storeId: string;
    code: string;
    name: string;
    status: string;
  }>;
  userOptions: Array<{
    retailUserId: string;
    loginId: string;
    displayName: string;
    accountStatus: string;
  }>;
  currencyOptions: Array<{
    code: string;
    name: string;
    symbol: string | null;
  }>;
  employeeRows: Array<{
    employeeId: string;
    employeeNo: string;
    retailUserId: string | null;
    userLoginId: string | null;
    primaryStoreId: string | null;
    storeCode: string | null;
    storeName: string | null;
    departmentId: string;
    departmentCode: string;
    departmentName: string;
    positionId: string;
    positionCode: string;
    positionTitle: string;
    employeeCategoryId: string;
    employeeCategoryCode: string;
    employeeCategoryName: string;
    reportingManagerId: string | null;
    reportingManagerName: string | null;
    headDepartmentId: string | null;
    headDepartmentName: string | null;
    firstName: string;
    middleName: string | null;
    lastName: string;
    displayName: string;
    gender: string | null;
    dateOfBirth: string | null;
    phone: string | null;
    email: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
    countryCode: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    emergencyContactRelation: string | null;
    employmentDate: string;
    salaryType: string;
    status: string;
    basicSalary: number | null;
    currencyCode: string | null;
    paymentFrequency: string | null;
    taxResidency: string | null;
    monthlyTaxRelief: number | null;
    pensionStatus: string | null;
    tier2TrusteeName: string | null;
    tier2MemberNo: string | null;
    taxId: string | null;
    ssnitId: string | null;
    bankName: string | null;
    bankBranch: string | null;
    bankAccountName: string | null;
    bankAccountNo: string | null;
    payItems: Array<{
      payItemId: string;
      componentType: string;
      code: string;
      name: string;
      calculationType: string;
      amount: number;
      percentage: number;
      isTaxable: boolean;
      isPensionable: boolean;
      effectiveFrom: string | null;
      effectiveTo: string | null;
      status: string;
    }>;
    updatedAt: string;
  }>;
  metrics: {
    activeEmployees: number;
    departmentsRepresented: number;
    shopAssignedEmployees: number;
    linkedLoginUsers: number;
  };
};

function unavailableWorkspace(reason: string): ErpEmployeesWorkspaceData {
  return {
    companyName: "Flash ERP",
    currencyCode: "GHS",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    canManageEmployees: false,
    canViewCompensation: false,
    canManageCompensation: false,
    departmentOptions: [],
    positionOptions: [],
    employeeCategoryOptions: [],
    storeOptions: [],
    userOptions: [],
    currencyOptions: [],
    employeeRows: [],
    metrics: {
      activeEmployees: 0,
      departmentsRepresented: 0,
      shopAssignedEmployees: 0,
      linkedLoginUsers: 0
    }
  };
}

export { unavailableWorkspace as buildUnavailableErpEmployeesWorkspace };

async function ensureEmployeeNumberSequence(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  companyId: string
) {
  const fiscalYear = await tx.erpFiscalYear.findFirst({
    where: {
      companyId,
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
    throw new Error("Create an open fiscal year before registering employees.");
  }

  await tx.erpDocumentSequence.upsert({
    where: {
      companyId_documentType_fiscalYearId: {
        companyId,
        documentType: "HR_EMPLOYEE",
        fiscalYearId: fiscalYear.id
      }
    },
    update: {
      prefix: "EMP",
      resetPolicy: "NEVER",
      status: activeStatus
    },
    create: {
      retailOrgId,
      companyId,
      fiscalYearId: fiscalYear.id,
      documentType: "HR_EMPLOYEE",
      prefix: "EMP",
      nextSequence: 1,
      paddingLength: 6,
      resetPolicy: "NEVER",
      status: activeStatus
    }
  });
}

export async function getErpEmployeesWorkspace(options: {
  includeCompensation: boolean;
  canManageEmployees: boolean;
  canManageCompensation: boolean;
}): Promise<ErpEmployeesWorkspaceData> {
  const context = await getHrContext();

  if (!context) {
    return unavailableWorkspace("Flash ERP enterprise organization is not configured yet.");
  }

  const company = await getPrimaryHrCompany(prisma, context);

  if (!company) {
    return unavailableWorkspace("Create a company before registering employees.");
  }

  const [departments, positions, categories, stores, users, currencies, employees] =
    await Promise.all([
      prisma.erpHrDepartment.findMany({
        where: { companyId: company.id, status: { not: "DELETED" } },
        orderBy: { code: "asc" }
      }),
      prisma.erpHrPosition.findMany({
        where: { companyId: company.id, status: { not: "DELETED" } },
        orderBy: [{ department: { code: "asc" } }, { code: "asc" }]
      }),
      prisma.erpEmployeeCategory.findMany({
        where: { companyId: company.id, status: { not: "DELETED" } },
        orderBy: { code: "asc" }
      }),
      prisma.store.findMany({
        where: { retailOrgId: context.retailOrgId, status: { not: "DELETED" } },
        orderBy: { code: "asc" }
      }),
      prisma.retailUser.findMany({
        where: { retailOrgId: context.retailOrgId, deletedAt: null },
        orderBy: [{ displayName: "asc" }, { loginId: "asc" }],
        select: {
          id: true,
          loginId: true,
          displayName: true,
          accountStatus: true
        }
      }),
      prisma.erpCurrency.findMany({
        where: { retailOrgId: context.retailOrgId, status: activeStatus },
        orderBy: [{ isBaseCurrency: "desc" }, { code: "asc" }]
      }),
      prisma.erpEmployee.findMany({
        where: { companyId: company.id, status: { not: "DELETED" } },
        orderBy: [{ status: "asc" }, { displayName: "asc" }],
        include: {
          retailUser: true,
          primaryStore: true,
          department: true,
          position: true,
          employeeCategory: true,
          reportingManager: true,
          headedDepartments: true,
          payrollProfile: options.includeCompensation,
          recurringPayItems: options.includeCompensation
            ? { orderBy: [{ componentType: "asc" }, { code: "asc" }] }
            : false
        }
      })
    ]);

  const activeEmployees = employees.filter((employee) => employee.status === activeStatus);

  return {
    companyName: company.tradingName ?? company.legalName,
    currencyCode: company.baseCurrencyCode || context.retailOrg.baseCurrencyCode,
    statusMessage: `Employee records for ${company.tradingName ?? company.legalName}.`,
    refreshedAt: new Date().toISOString(),
    canManageEmployees: options.canManageEmployees,
    canViewCompensation: options.includeCompensation,
    canManageCompensation: options.canManageCompensation,
    departmentOptions: departments.map((department) => ({
      departmentId: department.id,
      code: department.code,
      name: department.name,
      status: department.status
    })),
    positionOptions: positions.map((position) => ({
      positionId: position.id,
      departmentId: position.departmentId,
      code: position.code,
      title: position.title,
      status: position.status
    })),
    employeeCategoryOptions: categories.map((category) => ({
      employeeCategoryId: category.id,
      code: category.code,
      name: category.name,
      status: category.status
    })),
    storeOptions: stores.map((store) => ({
      storeId: store.id,
      code: store.code,
      name: store.name,
      status: store.status
    })),
    userOptions: users.map((user) => ({
      retailUserId: user.id,
      loginId: user.loginId,
      displayName: user.displayName,
      accountStatus: user.accountStatus
    })),
    currencyOptions: currencies.map((currency) => ({
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol
    })),
    employeeRows: employees.map((employee) => {
      const payrollProfile = options.includeCompensation ? employee.payrollProfile : null;
      const payItems = options.includeCompensation ? employee.recurringPayItems : [];
      const headedDepartment = employee.headedDepartments[0] ?? null;

      return {
        employeeId: employee.id,
        employeeNo: employee.employeeNo,
        retailUserId: employee.retailUserId,
        userLoginId: employee.retailUser?.loginId ?? null,
        primaryStoreId: employee.primaryStoreId,
        storeCode: employee.primaryStore?.code ?? null,
        storeName: employee.primaryStore?.name ?? null,
        departmentId: employee.departmentId,
        departmentCode: employee.department.code,
        departmentName: employee.department.name,
        positionId: employee.positionId,
        positionCode: employee.position.code,
        positionTitle: employee.position.title,
        employeeCategoryId: employee.employeeCategoryId,
        employeeCategoryCode: employee.employeeCategory.code,
        employeeCategoryName: employee.employeeCategory.name,
        reportingManagerId: employee.reportingManagerId,
        reportingManagerName: employee.reportingManager?.displayName ?? null,
        headDepartmentId: headedDepartment?.id ?? null,
        headDepartmentName: headedDepartment?.name ?? null,
        firstName: employee.firstName,
        middleName: employee.middleName,
        lastName: employee.lastName,
        displayName: employee.displayName,
        gender: employee.gender,
        dateOfBirth: dateInputValue(employee.dateOfBirth),
        phone: employee.phone,
        email: employee.email,
        addressLine1: employee.addressLine1,
        addressLine2: employee.addressLine2,
        city: employee.city,
        region: employee.region,
        countryCode: employee.countryCode,
        emergencyContactName: employee.emergencyContactName,
        emergencyContactPhone: employee.emergencyContactPhone,
        emergencyContactRelation: employee.emergencyContactRelation,
        employmentDate: dateInputValue(employee.employmentDate) ?? "",
        salaryType: employee.salaryType,
        status: employee.status,
        basicSalary: payrollProfile ? Number(payrollProfile.basicSalary) : null,
        currencyCode: payrollProfile?.currencyCode ?? null,
        paymentFrequency: payrollProfile?.paymentFrequency ?? null,
        taxResidency: payrollProfile?.taxResidency ?? null,
        monthlyTaxRelief: payrollProfile ? Number(payrollProfile.monthlyTaxRelief) : null,
        pensionStatus: payrollProfile?.pensionStatus ?? null,
        tier2TrusteeName: payrollProfile?.tier2TrusteeName ?? null,
        tier2MemberNo: payrollProfile?.tier2MemberNo ?? null,
        taxId: payrollProfile?.taxId ?? null,
        ssnitId: payrollProfile?.ssnitId ?? null,
        bankName: payrollProfile?.bankName ?? null,
        bankBranch: payrollProfile?.bankBranch ?? null,
        bankAccountName: payrollProfile?.bankAccountName ?? null,
        bankAccountNo: payrollProfile?.bankAccountNo ?? null,
        payItems: payItems.map((item) => ({
          payItemId: item.id,
          componentType: item.componentType,
          code: item.code,
          name: item.name,
          calculationType: item.calculationType,
          amount: Number(item.amount),
          percentage: Number(item.percentage),
          isTaxable: item.isTaxable,
          isPensionable: item.isPensionable,
          effectiveFrom: dateInputValue(item.effectiveFrom),
          effectiveTo: dateInputValue(item.effectiveTo),
          status: item.status
        })),
        updatedAt: employee.updatedAt.toISOString()
      };
    }),
    metrics: {
      activeEmployees: activeEmployees.length,
      departmentsRepresented: new Set(activeEmployees.map((employee) => employee.departmentId)).size,
      shopAssignedEmployees: activeEmployees.filter((employee) => employee.primaryStoreId).length,
      linkedLoginUsers: activeEmployees.filter((employee) => employee.retailUserId).length
    }
  };
}

async function validateReportingManager(
  tx: Prisma.TransactionClient,
  companyId: string,
  employeeId: string | null,
  reportingManagerId: string | null
) {
  if (!reportingManagerId) {
    return;
  }

  if (employeeId && employeeId === reportingManagerId) {
    throw new Error("An employee cannot report to themselves.");
  }

  let currentId: string | null = reportingManagerId;
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) {
      throw new Error("Flash ERP detected a circular employee reporting structure.");
    }

    visited.add(currentId);
    const current: { id: string; reportingManagerId: string | null; status: string } | null =
      await tx.erpEmployee.findFirst({
        where: { id: currentId, companyId },
        select: { id: true, reportingManagerId: true, status: true }
      });

    if (!current || current.status !== activeStatus) {
      throw new Error("Flash ERP needs an active reporting manager in the same company.");
    }

    if (employeeId && current.id === employeeId) {
      throw new Error("Flash ERP cannot save a circular employee reporting structure.");
    }

    currentId = current.reportingManagerId;
  }
}

export async function upsertErpEmployee(
  input: UpsertErpEmployeeRequest,
  actor: string
): Promise<ErpEmployeeMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getHrContext(tx);
    if (!context) throw new Error("Flash ERP enterprise organization is not configured yet.");
    const company = await getPrimaryHrCompany(tx, context);
    if (!company) throw new Error("Create a company before registering employees.");

    const employeeId = normalizeOptionalText(input.employeeId);
    const existing = employeeId
      ? await tx.erpEmployee.findFirst({ where: { id: employeeId, companyId: company.id } })
      : null;
    if (employeeId && !existing) throw new Error("Flash ERP could not find the employee to update.");

    const departmentId = normalizeRequiredText(input.departmentId, "department");
    const positionId = normalizeRequiredText(input.positionId, "position");
    const employeeCategoryId = normalizeRequiredText(
      input.employeeCategoryId,
      "employee category"
    );
    const reportingManagerId = normalizeOptionalText(input.reportingManagerId);
    const retailUserId = normalizeOptionalText(input.retailUserId);
    const primaryStoreId = normalizeOptionalText(input.primaryStoreId);
    const headDepartmentId = normalizeOptionalText(input.headDepartmentId);
    const firstName = normalizeRequiredText(input.firstName, "first name");
    const middleName = normalizeOptionalText(input.middleName);
    const lastName = normalizeRequiredText(input.lastName, "last name");
    const displayName =
      normalizeOptionalText(input.displayName) ?? [firstName, middleName, lastName].filter(Boolean).join(" ");
    const status = normalizeChoice(input.status, "employee status", [
      "ACTIVE",
      "INACTIVE",
      "RESIGNED",
      "TERMINATED"
    ], "ACTIVE");
    const salaryType = normalizeChoice(input.salaryType, "salary type", [
      "SALARIED",
      "HOURLY",
      "DAILY"
    ], "SALARIED");
    const gender = input.gender
      ? normalizeChoice(input.gender, "gender", ["FEMALE", "MALE", "OTHER", "UNDISCLOSED"])
      : null;
    const employmentDate = normalizeDateOnly(input.employmentDate, "employment date");
    const dateOfBirth = input.dateOfBirth
      ? normalizeDateOnly(input.dateOfBirth, "date of birth")
      : null;

    if (dateOfBirth && dateOfBirth >= employmentDate) {
      throw new Error("Flash ERP needs a date of birth earlier than the employment date.");
    }

    const [department, position, category] = await Promise.all([
      tx.erpHrDepartment.findFirst({ where: { id: departmentId, companyId: company.id } }),
      tx.erpHrPosition.findFirst({ where: { id: positionId, companyId: company.id } }),
      tx.erpEmployeeCategory.findFirst({
        where: { id: employeeCategoryId, companyId: company.id }
      })
    ]);
    if (!department || (status === activeStatus && department.status !== activeStatus)) {
      throw new Error("Flash ERP needs an active HR department for an active employee.");
    }
    if (
      !position ||
      position.departmentId !== department.id ||
      (status === activeStatus && position.status !== activeStatus)
    ) {
      throw new Error("Flash ERP needs an active position in the selected department.");
    }
    if (!category || (status === activeStatus && category.status !== activeStatus)) {
      throw new Error("Flash ERP needs an active employee category for an active employee.");
    }

    if (primaryStoreId) {
      const store = await tx.store.findFirst({
        where: { id: primaryStoreId, retailOrgId: context.retailOrgId, status: activeStatus }
      });
      if (!store) throw new Error("Flash ERP could not find the selected active primary shop.");
    }

    if (retailUserId) {
      const [user, linkedEmployee] = await Promise.all([
        tx.retailUser.findFirst({
          where: { id: retailUserId, retailOrgId: context.retailOrgId, deletedAt: null }
        }),
        tx.erpEmployee.findFirst({
          where: {
            companyId: company.id,
            retailUserId,
            ...(existing ? { id: { not: existing.id } } : {})
          }
        })
      ]);
      if (!user) throw new Error("Flash ERP could not find the selected application user.");
      if (linkedEmployee) throw new Error("That application user is already linked to another employee.");
    }

    await validateReportingManager(tx, company.id, existing?.id ?? null, reportingManagerId);
    if (headDepartmentId) {
      const headDepartment = await tx.erpHrDepartment.findFirst({
        where: { id: headDepartmentId, companyId: company.id, status: activeStatus }
      });
      if (!headDepartment) throw new Error("Flash ERP could not find the selected active department.");
    }

    let employeeNo = existing?.employeeNo ?? null;
    if (!employeeNo) {
      await ensureEmployeeNumberSequence(tx, context.retailOrgId, company.id);
      employeeNo = (
        await reserveErpDocumentNumberInTransaction(tx, {
          retailOrgId: context.retailOrgId,
          companyId: company.id,
          documentType: "HR_EMPLOYEE"
        })
      ).documentNo;
    }

    const data = {
      retailUserId,
      primaryStoreId,
      departmentId,
      positionId,
      employeeCategoryId,
      reportingManagerId,
      firstName,
      middleName,
      lastName,
      displayName,
      gender,
      dateOfBirth,
      phone: normalizeOptionalText(input.phone),
      email: normalizeOptionalText(input.email)?.toLowerCase() ?? null,
      addressLine1: normalizeOptionalText(input.addressLine1),
      addressLine2: normalizeOptionalText(input.addressLine2),
      city: normalizeOptionalText(input.city),
      region: normalizeOptionalText(input.region),
      countryCode: normalizeOptionalText(input.countryCode)?.toUpperCase() ?? null,
      emergencyContactName: normalizeOptionalText(input.emergencyContactName),
      emergencyContactPhone: normalizeOptionalText(input.emergencyContactPhone),
      emergencyContactRelation: normalizeOptionalText(input.emergencyContactRelation),
      employmentDate,
      salaryType,
      status,
      updatedBy: actor
    };

    const employee = existing
      ? await tx.erpEmployee.update({ where: { id: existing.id }, data })
      : await tx.erpEmployee.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            employeeNo,
            ...data,
            createdBy: actor
          }
        });

    await tx.erpHrDepartment.updateMany({
      where: {
        companyId: company.id,
        headEmployeeId: employee.id,
        ...(headDepartmentId ? { id: { not: headDepartmentId } } : {})
      },
      data: { headEmployeeId: null, updatedBy: actor }
    });
    if (headDepartmentId) {
      await tx.erpHrDepartment.update({
        where: { id: headDepartmentId },
        data: { headEmployeeId: employee.id, updatedBy: actor }
      });
    }

    return {
      message: `Flash ERP saved employee ${employee.employeeNo}.`,
      employeeId: employee.id,
      employeeNo: employee.employeeNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function upsertErpEmployeeCompensation(
  input: UpsertErpEmployeeCompensationRequest,
  actor: string
): Promise<ErpEmployeeMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getHrContext(tx);
    if (!context) throw new Error("Flash ERP enterprise organization is not configured yet.");
    const company = await getPrimaryHrCompany(tx, context);
    if (!company) throw new Error("Create a company before maintaining payroll setup.");
    const employeeId = normalizeRequiredText(input.employeeId, "employee");
    const employee = await tx.erpEmployee.findFirst({
      where: { id: employeeId, companyId: company.id }
    });
    if (!employee) throw new Error("Flash ERP could not find the employee payroll profile.");

    const currencyCode = normalizeCode(
      input.currencyCode ?? company.baseCurrencyCode,
      "payroll currency",
      10
    );
    const currency = await tx.erpCurrency.findFirst({
      where: { retailOrgId: context.retailOrgId, code: currencyCode, status: activeStatus }
    });
    if (!currency) throw new Error(`Flash ERP could not find active currency ${currencyCode}.`);
    const paymentFrequency = normalizeChoice(input.paymentFrequency, "payment frequency", [
      "MONTHLY",
      "BIWEEKLY",
      "WEEKLY",
      "DAILY"
    ], "MONTHLY");
    const profileStatus = normalizeChoice(input.status, "payroll profile status", [
      "ACTIVE",
      "INACTIVE"
    ], "ACTIVE");
    const taxResidency = normalizeChoice(
      input.taxResidency,
      "tax residency",
      ["RESIDENT", "NON_RESIDENT"],
      "RESIDENT"
    );
    const pensionStatus = normalizeChoice(
      input.pensionStatus,
      "pension status",
      ["CONTRIBUTING", "EXEMPT"],
      "CONTRIBUTING"
    );

    await tx.erpEmployeePayrollProfile.upsert({
      where: { employeeId: employee.id },
      update: {
        basicSalary: normalizeNonNegativeNumber(input.basicSalary, "basic salary"),
        currencyCode,
        paymentFrequency,
        taxResidency,
        monthlyTaxRelief: normalizeNonNegativeNumber(input.monthlyTaxRelief, "monthly tax relief"),
        pensionStatus,
        tier2TrusteeName: normalizeOptionalText(input.tier2TrusteeName),
        tier2MemberNo: normalizeOptionalText(input.tier2MemberNo),
        taxId: normalizeOptionalText(input.taxId),
        ssnitId: normalizeOptionalText(input.ssnitId),
        bankName: normalizeOptionalText(input.bankName),
        bankBranch: normalizeOptionalText(input.bankBranch),
        bankAccountName: normalizeOptionalText(input.bankAccountName),
        bankAccountNo: normalizeOptionalText(input.bankAccountNo),
        status: profileStatus,
        updatedBy: actor
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        employeeId: employee.id,
        basicSalary: normalizeNonNegativeNumber(input.basicSalary, "basic salary"),
        currencyCode,
        paymentFrequency,
        taxResidency,
        monthlyTaxRelief: normalizeNonNegativeNumber(input.monthlyTaxRelief, "monthly tax relief"),
        pensionStatus,
        tier2TrusteeName: normalizeOptionalText(input.tier2TrusteeName),
        tier2MemberNo: normalizeOptionalText(input.tier2MemberNo),
        taxId: normalizeOptionalText(input.taxId),
        ssnitId: normalizeOptionalText(input.ssnitId),
        bankName: normalizeOptionalText(input.bankName),
        bankBranch: normalizeOptionalText(input.bankBranch),
        bankAccountName: normalizeOptionalText(input.bankAccountName),
        bankAccountNo: normalizeOptionalText(input.bankAccountNo),
        status: profileStatus,
        createdBy: actor,
        updatedBy: actor
      }
    });

    const retainedKeys = new Set<string>();
    for (const item of input.payItems ?? []) {
      const componentType = normalizeChoice(item.componentType, "pay component type", [
        "ALLOWANCE",
        "DEDUCTION"
      ]);
      const code = normalizeCode(item.code, "pay item code");
      const calculationType = normalizeChoice(item.calculationType, "calculation type", [
        "FIXED",
        "PERCENTAGE"
      ], "FIXED");
      const status = normalizeChoice(item.status, "pay item status", ["ACTIVE", "INACTIVE"], "ACTIVE");
      const effectiveFrom = normalizeOptionalDate(item.effectiveFrom, "effective-from date");
      const effectiveTo = normalizeOptionalDate(item.effectiveTo, "effective-to date");
      if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
        throw new Error(`Flash ERP pay item ${code} ends before it starts.`);
      }
      const key = `${componentType}:${code}`;
      retainedKeys.add(key);
      await tx.erpEmployeePayItem.upsert({
        where: {
          employeeId_componentType_code: { employeeId: employee.id, componentType, code }
        },
        update: {
          name: normalizeRequiredText(item.name, "pay item name"),
          calculationType,
          amount: calculationType === "FIXED" ? normalizeNonNegativeNumber(item.amount, "pay item amount") : 0,
          percentage:
            calculationType === "PERCENTAGE"
              ? normalizeNonNegativeNumber(item.percentage, "pay item percentage")
              : 0,
          isTaxable: componentType === "ALLOWANCE" ? item.isTaxable !== false : false,
          isPensionable: componentType === "ALLOWANCE" && item.isPensionable === true,
          effectiveFrom,
          effectiveTo,
          status,
          updatedBy: actor
        },
        create: {
          retailOrgId: context.retailOrgId,
          companyId: company.id,
          employeeId: employee.id,
          componentType,
          code,
          name: normalizeRequiredText(item.name, "pay item name"),
          calculationType,
          amount: calculationType === "FIXED" ? normalizeNonNegativeNumber(item.amount, "pay item amount") : 0,
          percentage:
            calculationType === "PERCENTAGE"
              ? normalizeNonNegativeNumber(item.percentage, "pay item percentage")
              : 0,
          isTaxable: componentType === "ALLOWANCE" ? item.isTaxable !== false : false,
          isPensionable: componentType === "ALLOWANCE" && item.isPensionable === true,
          effectiveFrom,
          effectiveTo,
          status,
          createdBy: actor,
          updatedBy: actor
        }
      });
    }

    const existingItems = await tx.erpEmployeePayItem.findMany({
      where: { employeeId: employee.id, status: activeStatus },
      select: { id: true, componentType: true, code: true }
    });
    const omittedIds = existingItems
      .filter((item) => !retainedKeys.has(`${item.componentType}:${item.code}`))
      .map((item) => item.id);
    if (omittedIds.length) {
      await tx.erpEmployeePayItem.updateMany({
        where: { id: { in: omittedIds } },
        data: { status: "INACTIVE", updatedBy: actor }
      });
    }

    return {
      message: `Flash ERP saved payroll setup for ${employee.employeeNo}.`,
      employeeId: employee.id,
      employeeNo: employee.employeeNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}
