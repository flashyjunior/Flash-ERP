import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  ensureEnterpriseAccountPaymentReceiptTemplate,
  ensureEnterpriseGoodsReceiptTemplate,
  ensureEnterprisePurchaseOrderTemplate,
  ensureEnterpriseStarterReceiptTemplate
} from "@/server/repositories/receipt-template-support";
import {
  PaymentGatewayMode,
  PaymentGatewayProvider,
  PaymentGatewayStatus,
  PaymentMethod,
  RecordStatus,
  SyncNodeType
} from "@flash-erp/domain";


function formatRelativeTime(value: Date | null) {
  if (!value) {
    return "Not yet";
  }

  const minutes = Math.max(0, Math.floor((Date.now() - value.getTime()) / 60_000));

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function normalizeRequiredText(value: string | null | undefined, fieldLabel: string) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    throw new Error(`Flash ERP needs a ${fieldLabel}.`);
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeCode(value: string | null | undefined, fieldLabel: string) {
  return normalizeRequiredText(value, fieldLabel)
    .toUpperCase()
    .replace(/\s+/g, "-");
}

function normalizeMoneyLike(value: number | null | undefined, fieldLabel: string) {
  const normalized = Number(Number(value).toFixed(2));

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`Flash ERP needs ${fieldLabel} to be zero or greater.`);
  }

  return normalized;
}

function normalizeRateLike(
  value: number | null | undefined,
  fieldLabel: string,
  precision = 4
) {
  const normalized = Number(Number(value).toFixed(precision));

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`Flash ERP needs ${fieldLabel} to be zero or greater.`);
  }

  return normalized;
}

function normalizeIntegerLike(value: number | null | undefined, fieldLabel: string, minimum = 0) {
  const normalized = Math.trunc(Number(value ?? minimum));

  if (!Number.isFinite(normalized) || normalized < minimum) {
    throw new Error(`Flash ERP needs ${fieldLabel} to be ${minimum} or greater.`);
  }

  return normalized;
}

function normalizePercentLike(value: number | null | undefined, fieldLabel: string) {
  const normalized = Number(Number(value).toFixed(2));

  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 100) {
    throw new Error(`Flash ERP needs ${fieldLabel} to stay between 0 and 100.`);
  }

  return normalized;
}

function normalizeSortOrder(value: number | null | undefined) {
  const normalized = Math.trunc(Number(value ?? 0));

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error("Flash ERP needs sort order to be zero or greater.");
  }

  return normalized;
}

function normalizeRecordStatus(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? RecordStatus.ACTIVE;

  if (
    normalized === RecordStatus.ACTIVE ||
    normalized === RecordStatus.INACTIVE ||
    normalized === RecordStatus.ARCHIVED
  ) {
    return normalized;
  }

  throw new Error("Flash ERP only supports ACTIVE, INACTIVE, or ARCHIVED status values here.");
}

function normalizePaymentMethod(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? PaymentMethod.CASH;

  if (Object.values(PaymentMethod).includes(normalized as PaymentMethod)) {
    return normalized as PaymentMethod;
  }

  throw new Error("Flash ERP does not recognize that payment method family.");
}

function normalizePaymentGatewayProvider(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";

  if (!normalized) {
    return null;
  }

  if (Object.values(PaymentGatewayProvider).includes(normalized as PaymentGatewayProvider)) {
    return normalized as PaymentGatewayProvider;
  }

  throw new Error("Flash ERP only supports PAYSTACK, FLUTTERWAVE, or OTHER gateway providers.");
}

function normalizePaymentGatewayMode(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";

  if (!normalized) {
    return null;
  }

  if (Object.values(PaymentGatewayMode).includes(normalized as PaymentGatewayMode)) {
    return normalized as PaymentGatewayMode;
  }

  throw new Error("Flash ERP only supports TEST or LIVE gateway mode.");
}

function resolveGatewayStatus(input: {
  gatewayProvider: PaymentGatewayProvider | null;
  gatewayActive: boolean;
  gatewayPublicKey: string | null;
}) {
  if (!input.gatewayProvider || !input.gatewayActive) {
    return PaymentGatewayStatus.DISABLED;
  }

  return input.gatewayPublicKey ? PaymentGatewayStatus.READY : PaymentGatewayStatus.NEEDS_REVIEW;
}

function toSetupMutationError(error: unknown, fallbackMessage: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new Error("That setup code already exists in Flash ERP enterprise.");
  }

  return error instanceof Error ? error : new Error(fallbackMessage);
}

type EnterpriseContext = {
  id: string;
  code: string;
  name: string;
  retailOrgId: string;
  retailOrg: {
    name: string;
    baseCurrencyCode: string;
    loyaltyProgramEnabled: boolean;
    loyaltyPointsPerCurrencyUnit: Prisma.Decimal;
    loyaltyRedemptionEnabled: boolean;
    loyaltyRedemptionPointsStep: number;
    loyaltyRedemptionValueAmount: Prisma.Decimal;
    loyaltyMinimumRedeemPoints: number;
    loyaltyMaximumRedeemPercentOfSale: Prisma.Decimal;
  };
};

async function getEnterpriseContext(): Promise<EnterpriseContext | null> {
  return prisma.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      id: true,
      code: true,
      name: true,
      retailOrgId: true,
      retailOrg: {
        select: {
          name: true,
          baseCurrencyCode: true,
          loyaltyProgramEnabled: true,
          loyaltyPointsPerCurrencyUnit: true,
          loyaltyRedemptionEnabled: true,
          loyaltyRedemptionPointsStep: true,
          loyaltyRedemptionValueAmount: true,
          loyaltyMinimumRedeemPoints: true,
          loyaltyMaximumRedeemPercentOfSale: true
        }
      }
    }
  });
}

async function getWritableEnterpriseNode(tx: Prisma.TransactionClient) {
  const enterpriseNode = await tx.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      retailOrgId: true,
      code: true,
      retailOrg: {
        select: {
          baseCurrencyCode: true
        }
      }
    }
  });

  if (!enterpriseNode) {
    throw new Error("No primary enterprise node is available for setup changes.");
  }

  return enterpriseNode;
}

export type EnterpriseSetupWorkspaceData = {
  currencyCode: string;
  loyaltyPolicy: {
    loyaltyProgramEnabled: boolean;
    loyaltyPointsPerCurrencyUnit: number;
    loyaltyRedemptionEnabled: boolean;
    loyaltyRedemptionPointsStep: number;
    loyaltyRedemptionValueAmount: number;
    loyaltyMinimumRedeemPoints: number;
    loyaltyMaximumRedeemPercentOfSale: number;
  };
  availableDepartments: Array<{
    departmentCode: string;
    name: string;
    status: string;
  }>;
  metrics: {
    activeProductDepartments: number;
    activeProductCategories: number;
    activeTaxProfiles: number;
    activeTenderMethods: number;
    activeBankAccounts: number;
    activeReceiptTemplates: number;
    referenceRequiredTenderMethods: number;
    changeEnabledTenderMethods: number;
  };
  departmentRows: Array<{
    departmentCode: string;
    name: string;
    description: string | null;
    status: string;
    sortOrder: number;
    categoryCount: number;
    activeCategoryCount: number;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  categoryRows: Array<{
    categoryCode: string;
    departmentCode: string;
    departmentName: string;
    name: string;
    description: string | null;
    status: string;
    sortOrder: number;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  taxRows: Array<{
    taxProfileCode: string;
    name: string;
    ratePercent: number;
    isDefault: boolean;
    isTaxInclusive: boolean;
    status: string;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  tenderRows: Array<{
    tenderMethodCode: string;
    name: string;
    paymentMethod: string;
    cashbookAccountId: string | null;
    cashbookAccountCode: string | null;
    cashbookAccountName: string | null;
    cashbookAccountType: string | null;
    glAccountCode: string | null;
    gatewayProvider: string | null;
    gatewayMode: string | null;
    gatewayMerchantId: string | null;
    gatewayPublicKey: string | null;
    gatewayCallbackUrl: string | null;
    gatewayActive: boolean;
    gatewayStatus: string;
    requiresReference: boolean;
    allowChange: boolean;
    allowRefund: boolean;
    allowOpenCashDrawer: boolean;
    status: string;
    sortOrder: number;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  receiptTemplateRows: Array<{
    receiptTemplateCode: string;
    name: string;
    description: string | null;
    templateHtml: string;
    isDefault: boolean;
    paperWidthMm: number;
    status: string;
    linkedStoreCount: number;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  bankRows: Array<{
    bankCode: string;
    name: string;
    description: string | null;
    status: string;
    branchCount: number;
    accountCount: number;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  bankBranchRows: Array<{
    branchCode: string;
    name: string;
    bankCode: string;
    bankName: string;
    addressLine1: string | null;
    status: string;
    accountNumber: string | null;
    accountName: string | null;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  bankAccountRows: Array<{
    bankAccountId: string;
    bankCode: string;
    bankName: string;
    branchCode: string;
    branchName: string;
    addressLine1: string | null;
    accountNumber: string;
    accountName: string;
    currencyCode: string;
    status: string;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  cashbookAccountOptions: Array<{
    cashbookAccountId: string;
    code: string;
    name: string;
    accountType: string;
    glAccountCode: string;
    label: string;
  }>;
  postureMessages: string[];
  priorities: string[];
  statusMessage: string;
  refreshedAt: string;
};

export function buildUnavailableEnterpriseSetupWorkspace(
  reason: string
): EnterpriseSetupWorkspaceData {
  return {
    currencyCode: "USD",
    loyaltyPolicy: {
      loyaltyProgramEnabled: true,
      loyaltyPointsPerCurrencyUnit: 1,
      loyaltyRedemptionEnabled: false,
      loyaltyRedemptionPointsStep: 100,
      loyaltyRedemptionValueAmount: 1,
      loyaltyMinimumRedeemPoints: 100,
      loyaltyMaximumRedeemPercentOfSale: 100
    },
    availableDepartments: [],
    metrics: {
      activeProductDepartments: 0,
      activeProductCategories: 0,
      activeTaxProfiles: 0,
      activeTenderMethods: 0,
      activeBankAccounts: 0,
      activeReceiptTemplates: 0,
      referenceRequiredTenderMethods: 0,
      changeEnabledTenderMethods: 0
    },
    departmentRows: [],
    categoryRows: [],
    taxRows: [],
    tenderRows: [],
    receiptTemplateRows: [],
    bankRows: [],
    bankBranchRows: [],
    bankAccountRows: [],
    cashbookAccountOptions: [],
    postureMessages: [
      "Enterprise departments, categories, taxes, tender methods, loyalty policy, and receipt templates will appear here once Flash ERP can read the control-plane database.",
      "This workspace is intended to own enterprise selling policy before stores trade locally."
    ],
    priorities: [
      "Start the configured SQL Server service and apply the enterprise schema.",
      "Run the Flash ERP seed script to provision sample hierarchy, taxes, and tender methods.",
      "Refresh this page once the enterprise node is available."
    ],
    statusMessage: reason,
    refreshedAt: new Date().toISOString()
  };
}

export async function getEnterpriseSetupWorkspace(): Promise<EnterpriseSetupWorkspaceData> {
  const enterpriseNode = await getEnterpriseContext();

  if (!enterpriseNode) {
    return buildUnavailableEnterpriseSetupWorkspace(
      "No primary enterprise node is available yet, so Flash ERP cannot read master policy."
    );
  }

  await ensureEnterpriseStarterReceiptTemplate(prisma, enterpriseNode.retailOrgId);
  await ensureEnterpriseAccountPaymentReceiptTemplate(prisma, enterpriseNode.retailOrgId);
  await ensureEnterpriseGoodsReceiptTemplate(prisma, enterpriseNode.retailOrgId);
  await ensureEnterprisePurchaseOrderTemplate(prisma, enterpriseNode.retailOrgId);

  const primaryCompany = await prisma.erpCompany.findFirst({
    where: {
      retailOrgId: enterpriseNode.retailOrgId,
      status: RecordStatus.ACTIVE
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
    select: {
      id: true
    }
  });

  const [
    departments,
    categories,
    taxProfiles,
    tenderMethods,
    receiptTemplates,
    banks,
    bankBranches,
    bankAccounts,
    cashbookAccounts
  ] = await Promise.all([
    prisma.productDepartment.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
        description: true,
        status: true,
        sortOrder: true,
        updatedAt: true,
        categories: {
          where: {
            deletedAt: null
          },
          select: {
            status: true
          }
        }
      }
    }),
    prisma.productCategory.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
        description: true,
        status: true,
        sortOrder: true,
        updatedAt: true,
        department: {
          select: {
            code: true,
            name: true
          }
        }
      }
    }),
    prisma.taxProfile.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
        ratePercent: true,
        isDefault: true,
        isTaxInclusive: true,
        status: true,
        updatedAt: true
      }
    }),
    prisma.tenderMethod.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
        paymentMethod: true,
        cashbookAccountId: true,
        cashbookAccount: {
          select: {
            id: true,
            code: true,
            name: true,
            accountType: true,
            glAccountCode: true,
            bankName: true,
            mobileProviderName: true
          }
        },
        gatewayProvider: true,
        gatewayMode: true,
        gatewayMerchantId: true,
        gatewayPublicKey: true,
        gatewayCallbackUrl: true,
        gatewayActive: true,
        gatewayStatus: true,
        requiresReference: true,
        allowChange: true,
        allowRefund: true,
        allowOpenCashDrawer: true,
        status: true,
        sortOrder: true,
        updatedAt: true
      }
    }),
    prisma.receiptTemplate.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
        description: true,
        templateHtml: true,
        isDefault: true,
        paperWidthMm: true,
        status: true,
        updatedAt: true,
        _count: {
          select: {
            salesStores: true,
            accountStores: true
          }
        }
      }
    }),
    prisma.bank.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      },
      orderBy: [{ name: "asc" }],
      select: {
        code: true,
        name: true,
        description: true,
        status: true,
        updatedAt: true,
        branches: {
          where: {
            deletedAt: null
          },
          select: {
            status: true,
            account: {
              select: {
                id: true,
                status: true,
                deletedAt: true
              }
            }
          }
        }
      }
    }),
    prisma.bankBranch.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      },
      orderBy: [
        {
          bank: {
            name: "asc"
          }
        },
        {
          name: "asc"
        }
      ],
      select: {
        code: true,
        name: true,
        addressLine1: true,
        status: true,
        updatedAt: true,
        bank: {
          select: {
            code: true,
            name: true,
            status: true
          }
        },
        account: {
          select: {
            accountNumber: true,
            accountName: true,
            status: true,
            deletedAt: true
          }
        }
      }
    }),
    prisma.bankAccount.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      },
      orderBy: [
        {
          branch: {
            bank: {
              name: "asc"
            }
          }
        },
        {
          branch: {
            name: "asc"
          }
        },
        {
          accountNumber: "asc"
        }
      ],
      select: {
        id: true,
        accountNumber: true,
        accountName: true,
        currencyCode: true,
        status: true,
        updatedAt: true,
        branch: {
          select: {
            code: true,
            name: true,
            addressLine1: true,
            status: true,
            bank: {
              select: {
                code: true,
                name: true,
                status: true
              }
            }
          }
        }
      }
    }),
    primaryCompany
      ? prisma.erpCashbookAccount.findMany({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            companyId: primaryCompany.id,
            status: RecordStatus.ACTIVE,
            accountType: {
              in: ["CASH", "BANK", "MOBILE_MONEY", "CARD_CLEARING", "OTHER"]
            }
          },
          orderBy: [{ accountType: "asc" }, { code: "asc" }],
          select: {
            id: true,
            code: true,
            name: true,
            accountType: true,
            glAccountCode: true,
            bankName: true,
            mobileProviderName: true
          }
        })
      : Promise.resolve([])
  ]);

  const activeDepartments = departments.filter((department) => department.status === RecordStatus.ACTIVE);
  const activeCategories = categories.filter((category) => category.status === RecordStatus.ACTIVE);
  const activeTaxProfiles = taxProfiles.filter((profile) => profile.status === RecordStatus.ACTIVE);
  const activeTenderMethods = tenderMethods.filter(
    (method) => method.status === RecordStatus.ACTIVE
  );

  if (activeTaxProfiles.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const profile of activeTaxProfiles) {
        await syncTaxProfileToFinanceTaxCode(tx, {
          retailOrgId: enterpriseNode.retailOrgId,
          taxProfileCode: profile.code,
          name: profile.name,
          ratePercent: Number(profile.ratePercent),
          status: profile.status
        });
      }
    });
  }

  const activeBankAccounts = bankAccounts.filter(
    (account) =>
      account.status === RecordStatus.ACTIVE &&
      account.branch.status === RecordStatus.ACTIVE &&
      account.branch.bank.status === RecordStatus.ACTIVE
  );
  const activeReceiptTemplates = receiptTemplates.filter(
    (template) => template.status === RecordStatus.ACTIVE
  );

  const priorities: string[] = [];

  if (activeDepartments.length === 0) {
    priorities.push(
      "Create at least one active department before product onboarding accelerates."
    );
  }

  if (activeCategories.length === 0) {
    priorities.push(
      "Create active categories under each selling department so product classification is controlled instead of free text."
    );
  }

  if (!activeTaxProfiles.some((profile) => profile.isDefault)) {
    priorities.push(
      "Set a default tax profile so new taxable products inherit enterprise tax posture cleanly."
    );
  }

  if (!activeTenderMethods.some((method) => method.paymentMethod === PaymentMethod.CASH)) {
    priorities.push(
      "Activate at least one cash tender before store rollout depends on mixed-payment settlement."
    );
  }

  if (activeTenderMethods.some((method) => method.paymentMethod !== PaymentMethod.STORE_CREDIT && !method.cashbookAccountId)) {
    priorities.push(
      "Map active cash, bank, mobile-money, card, and other receipt tenders to Finance cashbook accounts before using them for Fuel Sales."
    );
  }

  if (activeReceiptTemplates.length === 0) {
    priorities.push(
      "Create at least one active thermal receipt template so stores can link to centrally designed thermal slips."
    );
  }

  if (activeBankAccounts.length === 0) {
    priorities.push(
      "Create at least one bank, branch, and account-number combination before supervisors begin end-of-day banking."
    );
  }

  if (
    enterpriseNode.retailOrg.loyaltyProgramEnabled &&
    !enterpriseNode.retailOrg.loyaltyRedemptionEnabled
  ) {
    priorities.push(
      "Decide whether loyalty redemption should be enabled before stores start promising points redemption at the lane."
    );
  }

  if (priorities.length === 0) {
    priorities.push(
      "Enterprise master posture looks healthy. The next strong slice is hardening store operations against this controlled master data."
    );
  }

  return {
    currencyCode: enterpriseNode.retailOrg.baseCurrencyCode,
    loyaltyPolicy: {
      loyaltyProgramEnabled: enterpriseNode.retailOrg.loyaltyProgramEnabled,
      loyaltyPointsPerCurrencyUnit: Number(
        enterpriseNode.retailOrg.loyaltyPointsPerCurrencyUnit
      ),
      loyaltyRedemptionEnabled: enterpriseNode.retailOrg.loyaltyRedemptionEnabled,
      loyaltyRedemptionPointsStep: enterpriseNode.retailOrg.loyaltyRedemptionPointsStep,
      loyaltyRedemptionValueAmount: Number(
        enterpriseNode.retailOrg.loyaltyRedemptionValueAmount
      ),
      loyaltyMinimumRedeemPoints: enterpriseNode.retailOrg.loyaltyMinimumRedeemPoints,
      loyaltyMaximumRedeemPercentOfSale: Number(
        enterpriseNode.retailOrg.loyaltyMaximumRedeemPercentOfSale
      )
    },
    availableDepartments: departments.map((department) => ({
      departmentCode: department.code,
      name: department.name,
      status: department.status
    })),
    metrics: {
      activeProductDepartments: activeDepartments.length,
      activeProductCategories: activeCategories.length,
      activeTaxProfiles: activeTaxProfiles.length,
      activeTenderMethods: activeTenderMethods.length,
      activeBankAccounts: activeBankAccounts.length,
      activeReceiptTemplates: activeReceiptTemplates.length,
      referenceRequiredTenderMethods: activeTenderMethods.filter((method) => method.requiresReference)
        .length,
      changeEnabledTenderMethods: activeTenderMethods.filter((method) => method.allowChange).length
    },
    departmentRows: departments.map((department) => ({
      departmentCode: department.code,
      name: department.name,
      description: department.description,
      status: department.status,
      sortOrder: department.sortOrder,
      categoryCount: department.categories.length,
      activeCategoryCount: department.categories.filter(
        (category) => category.status === RecordStatus.ACTIVE
      ).length,
      updatedAt: department.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(department.updatedAt)
    })),
    categoryRows: categories.map((category) => ({
      categoryCode: category.code,
      departmentCode: category.department.code,
      departmentName: category.department.name,
      name: category.name,
      description: category.description,
      status: category.status,
      sortOrder: category.sortOrder,
      updatedAt: category.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(category.updatedAt)
    })),
    taxRows: taxProfiles.map((profile) => ({
      taxProfileCode: profile.code,
      name: profile.name,
      ratePercent: Number(profile.ratePercent),
      isDefault: profile.isDefault,
      isTaxInclusive: profile.isTaxInclusive,
      status: profile.status,
      updatedAt: profile.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(profile.updatedAt)
    })),
    tenderRows: tenderMethods.map((method) => ({
      tenderMethodCode: method.code,
      name: method.name,
      paymentMethod: method.paymentMethod,
      cashbookAccountId: method.cashbookAccountId,
      cashbookAccountCode: method.cashbookAccount?.code ?? null,
      cashbookAccountName:
        method.cashbookAccount?.accountType === "MOBILE_MONEY"
          ? method.cashbookAccount.mobileProviderName ?? method.cashbookAccount.name
          : method.cashbookAccount?.bankName ?? method.cashbookAccount?.name ?? null,
      cashbookAccountType: method.cashbookAccount?.accountType ?? null,
      glAccountCode: method.cashbookAccount?.glAccountCode ?? null,
      gatewayProvider: method.gatewayProvider,
      gatewayMode: method.gatewayMode,
      gatewayMerchantId: method.gatewayMerchantId,
      gatewayPublicKey: method.gatewayPublicKey,
      gatewayCallbackUrl: method.gatewayCallbackUrl,
      gatewayActive: method.gatewayActive,
      gatewayStatus: method.gatewayStatus,
      requiresReference: method.requiresReference,
      allowChange: method.allowChange,
      allowRefund: method.allowRefund,
      allowOpenCashDrawer: method.allowOpenCashDrawer,
      status: method.status,
      sortOrder: method.sortOrder,
      updatedAt: method.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(method.updatedAt)
    })),
    receiptTemplateRows: receiptTemplates.map((template) => ({
      receiptTemplateCode: template.code,
      name: template.name,
      description: template.description,
      templateHtml: template.templateHtml,
      isDefault: template.isDefault,
      paperWidthMm: template.paperWidthMm,
      status: template.status,
      linkedStoreCount: template._count.salesStores + template._count.accountStores,
      updatedAt: template.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(template.updatedAt)
    })),
    bankRows: banks.map((bank) => ({
      bankCode: bank.code,
      name: bank.name,
      description: bank.description,
      status: bank.status,
      branchCount: bank.branches.length,
      accountCount: bank.branches.filter(
        (branch) => branch.account && !branch.account.deletedAt
      ).length,
      updatedAt: bank.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(bank.updatedAt)
    })),
    bankBranchRows: bankBranches.map((branch) => ({
      branchCode: branch.code,
      name: branch.name,
      bankCode: branch.bank.code,
      bankName: branch.bank.name,
      addressLine1: branch.addressLine1,
      status:
        branch.status === RecordStatus.ACTIVE && branch.bank.status === RecordStatus.ACTIVE
          ? "ACTIVE"
          : branch.status,
      accountNumber: branch.account && !branch.account.deletedAt ? branch.account.accountNumber : null,
      accountName: branch.account && !branch.account.deletedAt ? branch.account.accountName : null,
      updatedAt: branch.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(branch.updatedAt)
    })),
    bankAccountRows: bankAccounts.map((account) => ({
      bankAccountId: account.id,
      bankCode: account.branch.bank.code,
      bankName: account.branch.bank.name,
      branchCode: account.branch.code,
      branchName: account.branch.name,
      addressLine1: account.branch.addressLine1,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      currencyCode: account.currencyCode,
      status:
        account.status === RecordStatus.ACTIVE &&
        account.branch.status === RecordStatus.ACTIVE &&
        account.branch.bank.status === RecordStatus.ACTIVE
          ? "ACTIVE"
          : account.status,
      updatedAt: account.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(account.updatedAt)
    })),
    cashbookAccountOptions: cashbookAccounts.map((account) => {
      const accountName =
        account.accountType === "MOBILE_MONEY"
          ? account.mobileProviderName ?? account.name
          : account.bankName ?? account.name;

      return {
        cashbookAccountId: account.id,
        code: account.code,
        name: account.name,
        accountType: account.accountType,
        glAccountCode: account.glAccountCode,
        label: `${account.code} - ${accountName} (${account.accountType}; GL ${account.glAccountCode})`
      };
    }),
    postureMessages: [
      `${activeDepartments.length} active department(s) and ${activeCategories.length} active category(s) are currently controlled from enterprise.`,
      `${activeTaxProfiles.length} active tax profile(s) and ${activeTenderMethods.length} active tender method(s) are available for downstream policy sync.`,
      `${activeBankAccounts.length} active bank account combination(s) are ready for cheque, bank-deposit, and end-of-day banking workflows.`,
      enterpriseNode.retailOrg.loyaltyProgramEnabled
        ? enterpriseNode.retailOrg.loyaltyRedemptionEnabled
          ? `Loyalty is active at ${Number(enterpriseNode.retailOrg.loyaltyPointsPerCurrencyUnit).toFixed(2)} point(s) per currency unit, with redemption enabled from ${enterpriseNode.retailOrg.loyaltyMinimumRedeemPoints} points.`
          : `Loyalty accrual is active at ${Number(enterpriseNode.retailOrg.loyaltyPointsPerCurrencyUnit).toFixed(2)} point(s) per currency unit, but redemption is still disabled.`
        : "Enterprise loyalty is currently disabled for this retail org.",
      `${activeReceiptTemplates.length} active thermal receipt template(s) are available for store linkage and thermal slip publishing.`,
      activeTaxProfiles.some((profile) => profile.isDefault)
        ? "A default tax profile is available for new taxable product masters."
        : "No default tax profile is set yet. New taxable products will need manual assignment.",
      activeTenderMethods.some((method) => method.paymentMethod === PaymentMethod.CASH)
        ? "At least one cash-capable tender is active for cashier settlement."
        : "No active cash-capable tender is available right now."
    ],
    priorities,
    statusMessage: `Flash ERP enterprise is showing hierarchy, tax, and tender policy from ${enterpriseNode.name}. Use this workspace to manage the master configuration stores and product workflows will consume on their next pull.`,
    refreshedAt: new Date().toISOString()
  };
}

export type CreateProductDepartmentRequest = {
  departmentCode: string;
  name: string;
  description?: string | null;
  sortOrder?: number | null;
  status?: string;
};

export type UpdateEnterpriseLoyaltyPolicyRequest = {
  loyaltyProgramEnabled?: boolean;
  loyaltyPointsPerCurrencyUnit?: number | null;
  loyaltyRedemptionEnabled?: boolean;
  loyaltyRedemptionPointsStep?: number | null;
  loyaltyRedemptionValueAmount?: number | null;
  loyaltyMinimumRedeemPoints?: number | null;
  loyaltyMaximumRedeemPercentOfSale?: number | null;
};

export type LoyaltyPolicyMutationResponse = {
  loyaltyPolicy: EnterpriseSetupWorkspaceData["loyaltyPolicy"];
  message: string;
  serverProcessedAt: string;
};

export async function updateEnterpriseLoyaltyPolicy(
  input: UpdateEnterpriseLoyaltyPolicyRequest
): Promise<LoyaltyPolicyMutationResponse> {
  const loyaltyProgramEnabled = input.loyaltyProgramEnabled ?? true;
  const loyaltyPointsPerCurrencyUnit = normalizeRateLike(
    input.loyaltyPointsPerCurrencyUnit,
    "loyalty earn rate"
  );
  const loyaltyRedemptionEnabled = input.loyaltyRedemptionEnabled ?? false;
  const loyaltyRedemptionPointsStep = normalizeIntegerLike(
    input.loyaltyRedemptionPointsStep,
    "loyalty redemption points step",
    1
  );
  const loyaltyRedemptionValueAmount = normalizeMoneyLike(
    input.loyaltyRedemptionValueAmount,
    "loyalty redemption value"
  );
  const loyaltyMinimumRedeemPoints = normalizeIntegerLike(
    input.loyaltyMinimumRedeemPoints,
    "minimum redeemable loyalty points",
    loyaltyRedemptionPointsStep
  );
  const loyaltyMaximumRedeemPercentOfSale = normalizePercentLike(
    input.loyaltyMaximumRedeemPercentOfSale,
    "maximum redeem percent of sale"
  );

  if (loyaltyRedemptionEnabled && loyaltyRedemptionValueAmount <= 0) {
    throw new Error("Flash ERP needs the loyalty redemption value amount to be greater than zero.");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);

      await tx.retailOrg.update({
        where: {
          id: enterpriseNode.retailOrgId
        },
        data: {
          loyaltyProgramEnabled,
          loyaltyPointsPerCurrencyUnit,
          loyaltyRedemptionEnabled,
          loyaltyRedemptionPointsStep,
          loyaltyRedemptionValueAmount,
          loyaltyMinimumRedeemPoints,
          loyaltyMaximumRedeemPercentOfSale
        }
      });

      return {
        loyaltyPolicy: {
          loyaltyProgramEnabled,
          loyaltyPointsPerCurrencyUnit,
          loyaltyRedemptionEnabled,
          loyaltyRedemptionPointsStep,
          loyaltyRedemptionValueAmount,
          loyaltyMinimumRedeemPoints,
          loyaltyMaximumRedeemPercentOfSale
        },
        message: loyaltyRedemptionEnabled
          ? "Flash ERP updated the enterprise loyalty policy. Stores will pick up governed earning and redemption rules on their next sync."
          : "Flash ERP updated the enterprise loyalty policy. Stores will keep accruing points, but redemption remains disabled until you enable it.",
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSetupMutationError(error, "Flash ERP could not update the loyalty policy.");
  }
}

export type ProductDepartmentMutationResponse = {
  departmentCode: string;
  message: string;
  serverProcessedAt: string;
};

export async function createEnterpriseProductDepartment(
  input: CreateProductDepartmentRequest
): Promise<ProductDepartmentMutationResponse> {
  const departmentCode = normalizeCode(input.departmentCode, "department code");
  const name = normalizeRequiredText(input.name, "department name");
  const description = normalizeOptionalText(input.description);
  const sortOrder = normalizeSortOrder(input.sortOrder);
  const status = normalizeRecordStatus(input.status);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);

      await tx.productDepartment.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: departmentCode,
          name,
          description,
          sortOrder,
          status,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code
        }
      });

      return {
        departmentCode,
        message: `Flash ERP created department ${departmentCode}. Stores and product dialogs will receive the hierarchy delta on their next pull.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSetupMutationError(error, "Flash ERP could not create that department.");
  }
}

export async function updateEnterpriseProductDepartment(
  departmentCode: string,
  input: CreateProductDepartmentRequest
): Promise<ProductDepartmentMutationResponse> {
  const normalizedCode = normalizeCode(departmentCode, "department code");
  const name = normalizeRequiredText(input.name, "department name");
  const description = normalizeOptionalText(input.description);
  const sortOrder = normalizeSortOrder(input.sortOrder);
  const status = normalizeRecordStatus(input.status);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);

      const department = await tx.productDepartment.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: normalizedCode,
          deletedAt: null
        },
        select: {
          id: true
        }
      });

      if (!department) {
        throw new Error(`Flash ERP could not find department "${normalizedCode}".`);
      }

      await tx.productDepartment.update({
        where: {
          id: department.id
        },
        data: {
          name,
          description,
          sortOrder,
          status,
          lastModifiedByNodeCode: enterpriseNode.code,
          recordVersion: {
            increment: 1
          }
        }
      });

      return {
        departmentCode: normalizedCode,
        message: `Flash ERP updated department ${normalizedCode}. Stores and product dialogs will consume the hierarchy delta on their next pull.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSetupMutationError(error, "Flash ERP could not update that department.");
  }
}

export type CreateProductCategoryRequest = {
  categoryCode: string;
  departmentCode: string;
  name: string;
  description?: string | null;
  sortOrder?: number | null;
  status?: string;
};

export type ProductCategoryMutationResponse = {
  categoryCode: string;
  departmentCode: string;
  message: string;
  serverProcessedAt: string;
};

export async function createEnterpriseProductCategory(
  input: CreateProductCategoryRequest
): Promise<ProductCategoryMutationResponse> {
  const categoryCode = normalizeCode(input.categoryCode, "category code");
  const departmentCode = normalizeCode(input.departmentCode, "department code");
  const name = normalizeRequiredText(input.name, "category name");
  const description = normalizeOptionalText(input.description);
  const sortOrder = normalizeSortOrder(input.sortOrder);
  const status = normalizeRecordStatus(input.status);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);

      const department = await tx.productDepartment.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: departmentCode,
          deletedAt: null
        },
        select: {
          id: true,
          code: true
        }
      });

      if (!department) {
        throw new Error(`Flash ERP could not find department "${departmentCode}".`);
      }

      await tx.productCategory.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          departmentId: department.id,
          code: categoryCode,
          name,
          description,
          sortOrder,
          status,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code
        }
      });

      return {
        categoryCode,
        departmentCode: department.code,
        message: `Flash ERP created category ${categoryCode} under ${department.code}. Stores and product dialogs will receive the hierarchy delta on their next pull.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSetupMutationError(error, "Flash ERP could not create that category.");
  }
}

export async function updateEnterpriseProductCategory(
  categoryCode: string,
  input: CreateProductCategoryRequest
): Promise<ProductCategoryMutationResponse> {
  const normalizedCode = normalizeCode(categoryCode, "category code");
  const departmentCode = normalizeCode(input.departmentCode, "department code");
  const name = normalizeRequiredText(input.name, "category name");
  const description = normalizeOptionalText(input.description);
  const sortOrder = normalizeSortOrder(input.sortOrder);
  const status = normalizeRecordStatus(input.status);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);

      const [category, department] = await Promise.all([
        tx.productCategory.findFirst({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: normalizedCode,
            deletedAt: null
          },
          select: {
            id: true
          }
        }),
        tx.productDepartment.findFirst({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: departmentCode,
            deletedAt: null
          },
          select: {
            id: true,
            code: true
          }
        })
      ]);

      if (!category) {
        throw new Error(`Flash ERP could not find category "${normalizedCode}".`);
      }

      if (!department) {
        throw new Error(`Flash ERP could not find department "${departmentCode}".`);
      }

      await tx.productCategory.update({
        where: {
          id: category.id
        },
        data: {
          departmentId: department.id,
          name,
          description,
          sortOrder,
          status,
          lastModifiedByNodeCode: enterpriseNode.code,
          recordVersion: {
            increment: 1
          }
        }
      });

      return {
        categoryCode: normalizedCode,
        departmentCode: department.code,
        message: `Flash ERP updated category ${normalizedCode}. Stores and product dialogs will consume the hierarchy delta on their next pull.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSetupMutationError(error, "Flash ERP could not update that category.");
  }
}

export type CreateTaxProfileRequest = {
  taxProfileCode: string;
  name: string;
  description?: string | null;
  ratePercent: number;
  isDefault?: boolean;
  isTaxInclusive?: boolean;
  status?: string;
};

export type TaxProfileMutationResponse = {
  taxProfileCode: string;
  message: string;
  serverProcessedAt: string;
};

async function findTaxMirrorAccountCode(tx: Prisma.TransactionClient, retailOrgId: string) {
  const preferred = await tx.glAccount.findFirst({
    where: {
      retailOrgId,
      code: "2100",
      status: RecordStatus.ACTIVE
    },
    select: {
      code: true
    }
  });

  if (preferred) {
    return preferred.code;
  }

  const liability = await tx.glAccount.findFirst({
    where: {
      retailOrgId,
      accountType: "LIABILITY",
      status: RecordStatus.ACTIVE
    },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: {
      code: true
    }
  });

  if (liability) {
    return liability.code;
  }

  const account = await tx.glAccount.findFirst({
    where: {
      retailOrgId,
      status: RecordStatus.ACTIVE
    },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: {
      code: true
    }
  });

  return account?.code ?? null;
}

async function syncTaxProfileToFinanceTaxCode(
  tx: Prisma.TransactionClient,
  input: {
    retailOrgId: string;
    taxProfileCode: string;
    name: string;
    ratePercent: number;
    status: string;
  }
) {
  const company = await tx.erpCompany.findFirst({
    where: {
      retailOrgId: input.retailOrgId,
      status: RecordStatus.ACTIVE
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
    select: {
      id: true,
      baseCurrencyCode: true
    }
  });

  if (!company) {
    return;
  }

  const fallbackAccountCode = await findTaxMirrorAccountCode(tx, input.retailOrgId);
  const registration = await tx.erpTaxRegistration.findUnique({
    where: {
      companyId: company.id
    },
    select: {
      defaultInputTaxAccountCode: true,
      defaultOutputTaxAccountCode: true,
      taxPayableAccountCode: true,
      taxReceivableAccountCode: true
    }
  });
  const outputTaxAccountCode =
    registration?.defaultOutputTaxAccountCode ??
    registration?.taxPayableAccountCode ??
    fallbackAccountCode;
  const inputTaxAccountCode =
    registration?.defaultInputTaxAccountCode ??
    registration?.taxReceivableAccountCode ??
    fallbackAccountCode;

  await tx.erpTaxCode.upsert({
    where: {
      companyId_code: {
        companyId: company.id,
        code: input.taxProfileCode
      }
    },
    update: {
      name: input.name,
      calculationMode: "PERCENTAGE",
      ratePercent: input.ratePercent,
      inputTaxAccountCode,
      outputTaxAccountCode,
      payableAccountCode: registration?.taxPayableAccountCode ?? outputTaxAccountCode,
      receivableAccountCode: registration?.taxReceivableAccountCode ?? inputTaxAccountCode,
      status: input.status
    },
    create: {
      retailOrgId: input.retailOrgId,
      companyId: company.id,
      code: input.taxProfileCode,
      name: input.name,
      taxType: "VAT",
      calculationMode: "PERCENTAGE",
      ratePercent: input.ratePercent,
      recoverablePercent: 100,
      inputTaxAccountCode,
      outputTaxAccountCode,
      payableAccountCode: registration?.taxPayableAccountCode ?? outputTaxAccountCode,
      receivableAccountCode: registration?.taxReceivableAccountCode ?? inputTaxAccountCode,
      status: input.status
    }
  });
}

export async function createEnterpriseTaxProfile(
  input: CreateTaxProfileRequest
): Promise<TaxProfileMutationResponse> {
  const taxProfileCode = normalizeCode(input.taxProfileCode, "tax profile code");
  const name = normalizeRequiredText(input.name, "tax profile name");
  const description = normalizeOptionalText(input.description);
  const ratePercent = normalizeMoneyLike(input.ratePercent, "tax rate");
  const isDefault = input.isDefault ?? false;
  const isTaxInclusive = input.isTaxInclusive ?? false;
  const status = normalizeRecordStatus(input.status);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);

      if (isDefault) {
        await tx.taxProfile.updateMany({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            isDefault: true
          },
          data: {
            isDefault: false
          }
        });
      }

      await tx.taxProfile.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: taxProfileCode,
          name,
          description,
          ratePercent,
          isDefault,
          isTaxInclusive,
          status,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code
        }
      });
      await syncTaxProfileToFinanceTaxCode(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        taxProfileCode,
        name,
        ratePercent,
        status
      });

      return {
        taxProfileCode,
        message: `Flash ERP created tax profile ${taxProfileCode}. Master Tax is the source of truth and Finance posting will use the synced tax code.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSetupMutationError(error, "Flash ERP could not create that tax profile.");
  }
}

export async function updateEnterpriseTaxProfile(
  taxProfileCode: string,
  input: CreateTaxProfileRequest
): Promise<TaxProfileMutationResponse> {
  const normalizedCode = normalizeCode(taxProfileCode, "tax profile code");
  const name = normalizeRequiredText(input.name, "tax profile name");
  const description = normalizeOptionalText(input.description);
  const ratePercent = normalizeMoneyLike(input.ratePercent, "tax rate");
  const isDefault = input.isDefault ?? false;
  const isTaxInclusive = input.isTaxInclusive ?? false;
  const status = normalizeRecordStatus(input.status);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);

      const profile = await tx.taxProfile.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: normalizedCode,
          deletedAt: null
        },
        select: {
          id: true
        }
      });

      if (!profile) {
        throw new Error(`Flash ERP could not find tax profile "${normalizedCode}".`);
      }

      if (isDefault) {
        await tx.taxProfile.updateMany({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            isDefault: true,
            id: {
              not: profile.id
            }
          },
          data: {
            isDefault: false
          }
        });
      }

      await tx.taxProfile.update({
        where: {
          id: profile.id
        },
        data: {
          name,
          description,
          ratePercent,
          isDefault,
          isTaxInclusive,
          status,
          lastModifiedByNodeCode: enterpriseNode.code,
          recordVersion: {
            increment: 1
          }
        }
      });
      await syncTaxProfileToFinanceTaxCode(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        taxProfileCode: normalizedCode,
        name,
        ratePercent,
        status
      });

      return {
        taxProfileCode: normalizedCode,
        message: `Flash ERP updated tax profile ${normalizedCode}. Master Tax remains the source of truth and Finance posting will use the synced tax code.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSetupMutationError(error, "Flash ERP could not update that tax profile.");
  }
}

export type CreateTenderMethodRequest = {
  tenderMethodCode: string;
  name: string;
  paymentMethod: string;
  cashbookAccountId?: string | null;
  gatewayProvider?: string | null;
  gatewayMode?: string | null;
  gatewayMerchantId?: string | null;
  gatewayPublicKey?: string | null;
  gatewaySecretMask?: string | null;
  gatewayWebhookSecretMask?: string | null;
  gatewayCallbackUrl?: string | null;
  gatewayActive?: boolean;
  description?: string | null;
  requiresReference?: boolean;
  allowChange?: boolean;
  allowRefund?: boolean;
  allowOpenCashDrawer?: boolean;
  sortOrder?: number;
  status?: string;
};

export type TenderMethodMutationResponse = {
  tenderMethodCode: string;
  message: string;
  serverProcessedAt: string;
};

async function validateTenderCashbookAccount(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  cashbookAccountId: string | null
) {
  if (!cashbookAccountId) {
    return null;
  }

  const account = await tx.erpCashbookAccount.findFirst({
    where: {
      id: cashbookAccountId,
      retailOrgId,
      status: RecordStatus.ACTIVE,
      accountType: {
        in: ["CASH", "BANK", "MOBILE_MONEY", "CARD_CLEARING", "OTHER"]
      }
    },
    select: {
      id: true,
      code: true,
      glAccountCode: true
    }
  });

  if (!account) {
    throw new Error("Flash ERP could not find the Finance cashbook account selected for this tender.");
  }

  if (!account.glAccountCode?.trim()) {
    throw new Error(`${account.code} must be mapped to a GL account before it can be linked to a tender.`);
  }

  return account.id;
}

export async function createEnterpriseTenderMethod(
  input: CreateTenderMethodRequest
): Promise<TenderMethodMutationResponse> {
  const tenderMethodCode = normalizeCode(input.tenderMethodCode, "tender method code");
  const name = normalizeRequiredText(input.name, "tender method name");
  const paymentMethod = normalizePaymentMethod(input.paymentMethod);
  const gatewayProvider = normalizePaymentGatewayProvider(input.gatewayProvider);
  const gatewayMode = normalizePaymentGatewayMode(input.gatewayMode);
  const gatewayMerchantId = normalizeOptionalText(input.gatewayMerchantId);
  const gatewayPublicKey = normalizeOptionalText(input.gatewayPublicKey);
  const gatewaySecretMask = normalizeOptionalText(input.gatewaySecretMask);
  const gatewayWebhookSecretMask = normalizeOptionalText(input.gatewayWebhookSecretMask);
  const gatewayCallbackUrl = normalizeOptionalText(input.gatewayCallbackUrl);
  const gatewayActive = Boolean(input.gatewayActive && gatewayProvider);
  const gatewayStatus = resolveGatewayStatus({
    gatewayProvider,
    gatewayActive,
    gatewayPublicKey
  });
  const description = normalizeOptionalText(input.description);
  const requiresReference = input.requiresReference ?? false;
  const allowChange = input.allowChange ?? false;
  const allowRefund = input.allowRefund ?? true;
  const allowOpenCashDrawer = input.allowOpenCashDrawer ?? false;
  const sortOrder = normalizeSortOrder(input.sortOrder);
  const status = normalizeRecordStatus(input.status);
  const requestedCashbookAccountId = normalizeOptionalText(input.cashbookAccountId);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const cashbookAccountId = await validateTenderCashbookAccount(
        tx,
        enterpriseNode.retailOrgId,
        requestedCashbookAccountId
      );

      await tx.tenderMethod.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          cashbookAccountId,
          code: tenderMethodCode,
          name,
          paymentMethod,
          gatewayProvider,
          gatewayMode,
          gatewayMerchantId,
          gatewayPublicKey,
          gatewaySecretMask,
          gatewayWebhookSecretMask,
          gatewayCallbackUrl,
          gatewayActive,
          gatewayStatus,
          description,
          requiresReference,
          allowChange,
          allowRefund,
          allowOpenCashDrawer,
          sortOrder,
          status,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code
        }
      });

      return {
        tenderMethodCode,
        message: `Flash ERP created tender method ${tenderMethodCode}. Stores will receive the master-data delta on their next pull.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSetupMutationError(error, "Flash ERP could not create that tender method.");
  }
}

export async function updateEnterpriseTenderMethod(
  tenderMethodCode: string,
  input: CreateTenderMethodRequest
): Promise<TenderMethodMutationResponse> {
  const normalizedCode = normalizeCode(tenderMethodCode, "tender method code");
  const name = normalizeRequiredText(input.name, "tender method name");
  const paymentMethod = normalizePaymentMethod(input.paymentMethod);
  const gatewayProvider = normalizePaymentGatewayProvider(input.gatewayProvider);
  const gatewayMode = normalizePaymentGatewayMode(input.gatewayMode);
  const gatewayMerchantId = normalizeOptionalText(input.gatewayMerchantId);
  const gatewayPublicKey = normalizeOptionalText(input.gatewayPublicKey);
  const gatewaySecretMask = normalizeOptionalText(input.gatewaySecretMask);
  const gatewayWebhookSecretMask = normalizeOptionalText(input.gatewayWebhookSecretMask);
  const gatewayCallbackUrl = normalizeOptionalText(input.gatewayCallbackUrl);
  const gatewayActive = Boolean(input.gatewayActive && gatewayProvider);
  const gatewayStatus = resolveGatewayStatus({
    gatewayProvider,
    gatewayActive,
    gatewayPublicKey
  });
  const description = normalizeOptionalText(input.description);
  const requiresReference = input.requiresReference ?? false;
  const allowChange = input.allowChange ?? false;
  const allowRefund = input.allowRefund ?? true;
  const allowOpenCashDrawer = input.allowOpenCashDrawer ?? false;
  const sortOrder = normalizeSortOrder(input.sortOrder);
  const status = normalizeRecordStatus(input.status);
  const requestedCashbookAccountId = normalizeOptionalText(input.cashbookAccountId);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const cashbookAccountId = await validateTenderCashbookAccount(
        tx,
        enterpriseNode.retailOrgId,
        requestedCashbookAccountId
      );

      const tenderMethod = await tx.tenderMethod.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: normalizedCode,
          deletedAt: null
        },
        select: {
          id: true
        }
      });

      if (!tenderMethod) {
        throw new Error(`Flash ERP could not find tender method "${normalizedCode}".`);
      }

      await tx.tenderMethod.update({
        where: {
          id: tenderMethod.id
        },
        data: {
          name,
          cashbookAccountId,
          paymentMethod,
          gatewayProvider,
          gatewayMode,
          gatewayMerchantId,
          gatewayPublicKey,
          gatewaySecretMask,
          gatewayWebhookSecretMask,
          gatewayCallbackUrl,
          gatewayActive,
          gatewayStatus,
          description,
          requiresReference,
          allowChange,
          allowRefund,
          allowOpenCashDrawer,
          sortOrder,
          status,
          lastModifiedByNodeCode: enterpriseNode.code,
          recordVersion: {
            increment: 1
          }
        }
      });

      return {
        tenderMethodCode: normalizedCode,
        message: `Flash ERP updated tender method ${normalizedCode}. Stores will consume the master-data delta on their next pull.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSetupMutationError(error, "Flash ERP could not update that tender method.");
  }
}

export type CreateBankRequest = {
  bankCode: string;
  name: string;
  description?: string | null;
  status?: string | null;
};

export type BankMutationResponse = {
  bankCode: string;
  message: string;
  serverProcessedAt: string;
};

export type CreateBankBranchRequest = {
  branchCode: string;
  bankCode: string;
  name: string;
  addressLine1?: string | null;
  status?: string | null;
};

export type BankBranchMutationResponse = {
  branchCode: string;
  bankCode: string;
  message: string;
  serverProcessedAt: string;
};

export type CreateBankAccountRequest = {
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  addressLine1?: string | null;
  accountNumber: string;
  accountName: string;
  currencyCode?: string | null;
  status?: string;
};

export type BankAccountMutationResponse = {
  bankAccountId: string;
  bankCode: string;
  branchCode: string;
  accountNumber: string;
  message: string;
  serverProcessedAt: string;
};

function normalizeCurrencyCode(value: string | null | undefined, fallback: string) {
  const normalized = (value?.trim() || fallback || "GHS").toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("Flash ERP needs a three-letter currency code for the bank account.");
  }

  return normalized;
}

export async function createEnterpriseBank(input: CreateBankRequest): Promise<BankMutationResponse> {
  const bankCode = normalizeCode(input.bankCode, "bank code");
  const name = normalizeRequiredText(input.name, "bank name");
  const description = normalizeOptionalText(input.description);
  const status = normalizeRecordStatus(input.status);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      await tx.bank.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: bankCode,
          name,
          description,
          status,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code
        }
      });

      return {
        bankCode,
        message: `Flash ERP created bank ${name}. Create branches under it before adding account numbers.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSetupMutationError(error, "Flash ERP could not create that bank.");
  }
}

export async function updateEnterpriseBank(
  bankCode: string,
  input: CreateBankRequest
): Promise<BankMutationResponse> {
  const nextBankCode = normalizeCode(input.bankCode || bankCode, "bank code");
  const name = normalizeRequiredText(input.name, "bank name");
  const description = normalizeOptionalText(input.description);
  const status = normalizeRecordStatus(input.status);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const existingBank = await tx.bank.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: normalizeCode(bankCode, "bank code"),
          deletedAt: null
        },
        select: {
          id: true
        }
      });

      if (!existingBank) {
        throw new Error("Flash ERP could not find that bank.");
      }

      await tx.bank.update({
        where: {
          id: existingBank.id
        },
        data: {
          code: nextBankCode,
          name,
          description,
          status,
          lastModifiedByNodeCode: enterpriseNode.code,
          recordVersion: {
            increment: 1
          }
        }
      });

      return {
        bankCode: nextBankCode,
        message: `Flash ERP updated bank ${name}.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSetupMutationError(error, "Flash ERP could not update that bank.");
  }
}

export async function createEnterpriseBankBranch(
  input: CreateBankBranchRequest
): Promise<BankBranchMutationResponse> {
  const branchCode = normalizeCode(input.branchCode, "branch code");
  const bankCode = normalizeCode(input.bankCode, "bank code");
  const name = normalizeRequiredText(input.name, "branch name");
  const addressLine1 = normalizeOptionalText(input.addressLine1);
  const status = normalizeRecordStatus(input.status);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const bank = await tx.bank.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: bankCode,
          deletedAt: null
        },
        select: {
          id: true,
          code: true
        }
      });

      if (!bank) {
        throw new Error("Select an existing bank before creating a branch.");
      }

      await tx.bankBranch.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          bankId: bank.id,
          code: branchCode,
          name,
          addressLine1,
          status,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code
        }
      });

      return {
        branchCode,
        bankCode: bank.code,
        message: `Flash ERP created branch ${name}. Add one account number to make it available for POS banking.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSetupMutationError(error, "Flash ERP could not create that branch.");
  }
}

export async function updateEnterpriseBankBranch(
  branchCode: string,
  input: CreateBankBranchRequest
): Promise<BankBranchMutationResponse> {
  const nextBranchCode = normalizeCode(input.branchCode || branchCode, "branch code");
  const bankCode = normalizeCode(input.bankCode, "bank code");
  const name = normalizeRequiredText(input.name, "branch name");
  const addressLine1 = normalizeOptionalText(input.addressLine1);
  const status = normalizeRecordStatus(input.status);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const [bank, existingBranch] = await Promise.all([
        tx.bank.findFirst({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: bankCode,
            deletedAt: null
          },
          select: {
            id: true,
            code: true
          }
        }),
        tx.bankBranch.findFirst({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: normalizeCode(branchCode, "branch code"),
            deletedAt: null
          },
          select: {
            id: true
          }
        })
      ]);

      if (!bank) {
        throw new Error("Select an existing bank before updating a branch.");
      }

      if (!existingBranch) {
        throw new Error("Flash ERP could not find that branch.");
      }

      await tx.bankBranch.update({
        where: {
          id: existingBranch.id
        },
        data: {
          bankId: bank.id,
          code: nextBranchCode,
          name,
          addressLine1,
          status,
          lastModifiedByNodeCode: enterpriseNode.code,
          recordVersion: {
            increment: 1
          }
        }
      });

      return {
        branchCode: nextBranchCode,
        bankCode: bank.code,
        message: `Flash ERP updated branch ${name}.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSetupMutationError(error, "Flash ERP could not update that branch.");
  }
}

async function resolveBankAndBranchForAccount(
  tx: Prisma.TransactionClient,
  enterpriseNode: {
    retailOrgId: string;
    code: string;
  },
  input: CreateBankAccountRequest
) {
  const bankCode = normalizeCode(input.bankCode, "bank code");
  const bankName = normalizeRequiredText(input.bankName, "bank name");
  const branchCode = normalizeCode(input.branchCode, "branch code");
  const branchName = normalizeRequiredText(input.branchName, "branch name");
  const addressLine1 = normalizeOptionalText(input.addressLine1);
  const now = new Date();

  const bank = await tx.bank.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: enterpriseNode.retailOrgId,
        code: bankCode
      }
    },
    create: {
      retailOrgId: enterpriseNode.retailOrgId,
      code: bankCode,
      name: bankName,
      status: RecordStatus.ACTIVE,
      originNodeCode: enterpriseNode.code,
      lastModifiedByNodeCode: enterpriseNode.code,
      updatedAt: now
    },
    update: {
      name: bankName,
      deletedAt: null,
      lastModifiedByNodeCode: enterpriseNode.code,
      recordVersion: {
        increment: 1
      }
    },
    select: {
      id: true,
      code: true
    }
  });

  const existingBranch = await tx.bankBranch.findFirst({
    where: {
      retailOrgId: enterpriseNode.retailOrgId,
      code: branchCode
    },
    select: {
      id: true,
      bankId: true,
      account: {
        select: {
          id: true
        }
      }
    }
  });

  if (existingBranch && existingBranch.bankId !== bank.id) {
    throw new Error(
      `Flash ERP already has branch code "${branchCode}" under another bank. Use a unique branch code for this bank.`
    );
  }

  const branch = existingBranch
    ? await tx.bankBranch.update({
        where: {
          id: existingBranch.id
        },
        data: {
          bankId: bank.id,
          name: branchName,
          addressLine1,
          deletedAt: null,
          lastModifiedByNodeCode: enterpriseNode.code,
          recordVersion: {
            increment: 1
          }
        },
        select: {
          id: true,
          code: true,
          account: {
            select: {
              id: true
            }
          }
        }
      })
    : await tx.bankBranch.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          bankId: bank.id,
          code: branchCode,
          name: branchName,
          addressLine1,
          status: RecordStatus.ACTIVE,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code
        },
        select: {
          id: true,
          code: true,
          account: {
            select: {
              id: true
            }
          }
        }
      });

  return {
    bank,
    branch
  };
}

export async function createEnterpriseBankAccount(
  input: CreateBankAccountRequest
): Promise<BankAccountMutationResponse> {
  const accountNumber = normalizeRequiredText(input.accountNumber, "account number");
  const accountName = normalizeRequiredText(input.accountName, "account name");
  const status = normalizeRecordStatus(input.status);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const currencyCode = normalizeCurrencyCode(
        input.currencyCode,
        enterpriseNode.retailOrg.baseCurrencyCode
      );
      const { bank, branch } = await resolveBankAndBranchForAccount(tx, enterpriseNode, input);

      if (branch.account) {
        throw new Error(
          `Flash ERP already has an account number attached to branch "${branch.code}". Each branch can only have one account number.`
        );
      }

      const account = await tx.bankAccount.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          branchId: branch.id,
          accountNumber,
          accountName,
          currencyCode,
          status,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code
        },
        select: {
          id: true
        }
      });

      return {
        bankAccountId: account.id,
        bankCode: bank.code,
        branchCode: branch.code,
        accountNumber,
        message: `Flash ERP created bank account ${accountNumber}. Stores will receive the bank, branch, and account-number combination on their next sync.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSetupMutationError(error, "Flash ERP could not create that bank account.");
  }
}

export async function updateEnterpriseBankAccount(
  bankAccountId: string,
  input: CreateBankAccountRequest
): Promise<BankAccountMutationResponse> {
  const accountNumber = normalizeRequiredText(input.accountNumber, "account number");
  const accountName = normalizeRequiredText(input.accountName, "account name");
  const status = normalizeRecordStatus(input.status);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const existingAccount = await tx.bankAccount.findFirst({
        where: {
          id: bankAccountId,
          retailOrgId: enterpriseNode.retailOrgId,
          deletedAt: null
        },
        select: {
          id: true,
          branchId: true
        }
      });

      if (!existingAccount) {
        throw new Error("Flash ERP could not find that bank account.");
      }

      const currencyCode = normalizeCurrencyCode(
        input.currencyCode,
        enterpriseNode.retailOrg.baseCurrencyCode
      );
      const { bank, branch } = await resolveBankAndBranchForAccount(tx, enterpriseNode, input);

      if (branch.account && branch.account.id !== existingAccount.id) {
        throw new Error(
          `Flash ERP already has another account number attached to branch "${branch.code}". Each branch can only have one account number.`
        );
      }

      await tx.bankAccount.update({
        where: {
          id: existingAccount.id
        },
        data: {
          branchId: branch.id,
          accountNumber,
          accountName,
          currencyCode,
          status,
          deletedAt: null,
          lastModifiedByNodeCode: enterpriseNode.code,
          recordVersion: {
            increment: 1
          }
        }
      });

      return {
        bankAccountId: existingAccount.id,
        bankCode: bank.code,
        branchCode: branch.code,
        accountNumber,
        message: `Flash ERP updated bank account ${accountNumber}. Stores will consume the refreshed banking setup on their next sync.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSetupMutationError(error, "Flash ERP could not update that bank account.");
  }
}

export type CreateReceiptTemplateRequest = {
  receiptTemplateCode: string;
  name: string;
  description?: string | null;
  templateHtml: string;
  paperWidthMm?: number | null;
  isDefault?: boolean;
  status?: string;
};

export type ReceiptTemplateMutationResponse = {
  receiptTemplateCode: string;
  message: string;
  serverProcessedAt: string;
};

export async function createEnterpriseReceiptTemplate(
  input: CreateReceiptTemplateRequest
): Promise<ReceiptTemplateMutationResponse> {
  const receiptTemplateCode = normalizeCode(input.receiptTemplateCode, "receipt template code");
  const name = normalizeRequiredText(input.name, "receipt template name");
  const description = normalizeOptionalText(input.description);
  const templateHtml = normalizeRequiredText(input.templateHtml, "receipt template HTML");
  const paperWidthMm = input.paperWidthMm && input.paperWidthMm >= 200 ? 210 : 80;
  const status = normalizeRecordStatus(input.status);
  const requestedDefault = input.isDefault ?? false;

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const existingCount = await tx.receiptTemplate.count({
        where: {
          retailOrgId: enterpriseNode.retailOrgId
        }
      });
      const isDefault = requestedDefault || existingCount === 0;

      if (isDefault) {
        await tx.receiptTemplate.updateMany({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            isDefault: true
          },
          data: {
            isDefault: false
          }
        });
      }

      await tx.receiptTemplate.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: receiptTemplateCode,
          name,
          description,
          templateHtml,
          isDefault,
          paperWidthMm,
          status
        }
      });

      return {
        receiptTemplateCode,
        message: `Flash ERP created receipt template ${receiptTemplateCode}. Stores can now link this ${paperWidthMm >= 200 ? "A4 document" : "thermal slip"} from settings.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSetupMutationError(error, "Flash ERP could not create that receipt template.");
  }
}

export async function updateEnterpriseReceiptTemplate(
  receiptTemplateCode: string,
  input: CreateReceiptTemplateRequest
): Promise<ReceiptTemplateMutationResponse> {
  const normalizedCode = normalizeCode(receiptTemplateCode, "receipt template code");
  const name = normalizeRequiredText(input.name, "receipt template name");
  const description = normalizeOptionalText(input.description);
  const templateHtml = normalizeRequiredText(input.templateHtml, "receipt template HTML");
  const paperWidthMm = input.paperWidthMm && input.paperWidthMm >= 200 ? 210 : 80;
  const status = normalizeRecordStatus(input.status);
  const requestedDefault = input.isDefault ?? false;

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const existingTemplate = await tx.receiptTemplate.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: normalizedCode
        },
        select: {
          id: true,
          isDefault: true
        }
      });

      if (!existingTemplate) {
        throw new Error(`Flash ERP could not find receipt template "${normalizedCode}".`);
      }

      const isDefault = requestedDefault || existingTemplate.isDefault;

      if (isDefault) {
        await tx.receiptTemplate.updateMany({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            isDefault: true,
            id: {
              not: existingTemplate.id
            }
          },
          data: {
            isDefault: false
          }
        });
      }

      await tx.receiptTemplate.update({
        where: {
          id: existingTemplate.id
        },
        data: {
          name,
          description,
          templateHtml,
          paperWidthMm,
          isDefault,
          status
        }
      });

      return {
        receiptTemplateCode: normalizedCode,
        message: `Flash ERP updated receipt template ${normalizedCode}. Linked stores will pick up the refreshed ${paperWidthMm >= 200 ? "A4 document" : "thermal design"} on their next pull.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSetupMutationError(error, "Flash ERP could not update that receipt template.");
  }
}
