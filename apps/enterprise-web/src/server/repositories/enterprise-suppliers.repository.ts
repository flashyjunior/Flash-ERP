import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  PurchaseOrderStatus,
  RecordStatus,
  SupplierClaimStatus,
  SupplierReturnStatus,
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

function normalizeOptionalWholeNumber(
  value: number | null | undefined,
  fieldLabel: string
) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }

  const normalized = Math.trunc(Number(value));

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`Flash ERP needs ${fieldLabel} to be zero or greater.`);
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

function toSupplierMutationError(error: unknown, fallbackMessage: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new Error("That supplier number already exists in Flash ERP enterprise.");
  }

  return error instanceof Error ? error : new Error(fallbackMessage);
}

type EnterpriseContext = {
  id: string;
  code: string;
  name: string;
  retailOrgId: string;
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
      retailOrgId: true
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
      code: true
    }
  });

  if (!enterpriseNode) {
    throw new Error("No primary enterprise node is available for supplier changes.");
  }

  return enterpriseNode;
}

export type EnterpriseSupplierWorkspaceData = {
  metrics: {
    activeSuppliers: number;
    suppliersWithProductLinks: number;
    suppliersWithOpenPurchaseOrders: number;
    suppliersWithOpenClaims: number;
    suppliersWithPostedReturns: number;
  };
  supplierRows: Array<{
    supplierNo: string;
    name: string;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    addressLine1: string | null;
    city: string | null;
    countryCode: string | null;
    leadTimeDays: number | null;
    status: string;
    linkedProductCount: number;
    openPurchaseOrderCount: number;
    openSupplierClaimCount: number;
    postedSupplierReturnCount: number;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  postureMessages: string[];
  priorities: string[];
  statusMessage: string;
  refreshedAt: string;
};

export type CreateEnterpriseSupplierRequest = {
  supplierNo: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  countryCode?: string | null;
  leadTimeDays?: number | null;
  status?: string;
};

export type EnterpriseSupplierMutationResponse = {
  supplierNo: string;
  message: string;
};

export function buildUnavailableEnterpriseSupplierWorkspace(
  reason: string
): EnterpriseSupplierWorkspaceData {
  return {
    metrics: {
      activeSuppliers: 0,
      suppliersWithProductLinks: 0,
      suppliersWithOpenPurchaseOrders: 0,
      suppliersWithOpenClaims: 0,
      suppliersWithPostedReturns: 0
    },
    supplierRows: [],
    postureMessages: [
      "Enterprise supplier masters will appear here once Flash ERP can read the control-plane database.",
      "This workspace is intended to keep sourcing, receiving, and vendor exception handling anchored to one supplier directory."
    ],
    priorities: [
      "Start the configured SQL Server service and apply the enterprise schema.",
      "Load or create supplier masters before product sourcing and purchase-order flows scale out.",
      "Refresh this page once the enterprise node is available."
    ],
    statusMessage: reason,
    refreshedAt: new Date().toISOString()
  };
}

export async function getEnterpriseSupplierWorkspace(): Promise<EnterpriseSupplierWorkspaceData> {
  const enterpriseNode = await getEnterpriseContext();

  if (!enterpriseNode) {
    return buildUnavailableEnterpriseSupplierWorkspace(
      "No primary enterprise node is available yet, so Flash ERP cannot read supplier masters."
    );
  }

  const suppliers = await prisma.supplier.findMany({
    where: {
      retailOrgId: enterpriseNode.retailOrgId,
      deletedAt: null
    },
    orderBy: [{ name: "asc" }, { supplierNo: "asc" }],
    select: {
      supplierNo: true,
      name: true,
      contactName: true,
      phone: true,
      email: true,
      addressLine1: true,
      city: true,
      countryCode: true,
      leadTimeDays: true,
      status: true,
      updatedAt: true,
      productSuppliers: {
        select: {
          id: true
        }
      },
      purchaseOrders: {
        select: {
          status: true
        }
      },
      supplierClaims: {
        select: {
          status: true
        }
      },
      supplierReturns: {
        select: {
          status: true
        }
      }
    }
  });

  const supplierRows = suppliers.map((supplier) => {
    const linkedProductCount = supplier.productSuppliers.length;
    const openPurchaseOrderCount = supplier.purchaseOrders.filter(
      (purchaseOrder) =>
        purchaseOrder.status === PurchaseOrderStatus.COMMITTED ||
        purchaseOrder.status === PurchaseOrderStatus.PART_RECEIVED
    ).length;
    const openSupplierClaimCount = supplier.supplierClaims.filter(
      (claim) =>
        claim.status === SupplierClaimStatus.OPEN ||
        claim.status === SupplierClaimStatus.CREDIT_REQUESTED ||
        claim.status === SupplierClaimStatus.CREDIT_RECEIVED
    ).length;
    const postedSupplierReturnCount = supplier.supplierReturns.filter(
      (supplierReturn) => supplierReturn.status === SupplierReturnStatus.POSTED
    ).length;

    return {
      supplierNo: supplier.supplierNo,
      name: supplier.name,
      contactName: supplier.contactName,
      phone: supplier.phone,
      email: supplier.email,
      addressLine1: supplier.addressLine1,
      city: supplier.city,
      countryCode: supplier.countryCode,
      leadTimeDays: supplier.leadTimeDays,
      status: supplier.status,
      linkedProductCount,
      openPurchaseOrderCount,
      openSupplierClaimCount,
      postedSupplierReturnCount,
      updatedAt: supplier.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(supplier.updatedAt)
    };
  });

  const activeSuppliers = supplierRows.filter((supplier) => supplier.status === RecordStatus.ACTIVE);
  const suppliersWithProductLinks = supplierRows.filter((supplier) => supplier.linkedProductCount > 0).length;
  const suppliersWithOpenPurchaseOrders = supplierRows.filter(
    (supplier) => supplier.openPurchaseOrderCount > 0
  ).length;
  const suppliersWithOpenClaims = supplierRows.filter(
    (supplier) => supplier.openSupplierClaimCount > 0
  ).length;
  const suppliersWithPostedReturns = supplierRows.filter(
    (supplier) => supplier.postedSupplierReturnCount > 0
  ).length;

  const postureMessages = [
    activeSuppliers.length > 0
      ? `${activeSuppliers.length} supplier master${activeSuppliers.length === 1 ? "" : "s"} are active for enterprise purchasing and vendor-linked product sourcing.`
      : "No active supplier masters are configured yet, so Flash ERP sourcing still depends on ad hoc product linking.",
    suppliersWithProductLinks > 0
      ? `${suppliersWithProductLinks} supplier${suppliersWithProductLinks === 1 ? "" : "s"} already have product links feeding purchasing and replenishment decisions.`
      : "No suppliers are linked to products yet, so Flash ERP cannot show sourcing depth across the assortment.",
    suppliersWithOpenClaims > 0
      ? `${suppliersWithOpenClaims} supplier${suppliersWithOpenClaims === 1 ? "" : "s"} still carry open claims or credit work that should stay visible to operations and finance.`
      : "There are no suppliers with open claims right now, which keeps the vendor exception posture clean."
  ];

  const priorities = [
    suppliersWithOpenPurchaseOrders > 0
      ? `${suppliersWithOpenPurchaseOrders} supplier${suppliersWithOpenPurchaseOrders === 1 ? "" : "s"} still have committed or part-received purchase orders in flight.`
      : "No suppliers currently have open purchase orders in flight.",
    suppliersWithPostedReturns > 0
      ? `${suppliersWithPostedReturns} supplier${suppliersWithPostedReturns === 1 ? "" : "s"} already have posted supplier returns that should stay tied to the right master record.`
      : "No supplier returns are posted right now.",
    activeSuppliers.some((supplier) => supplier.leadTimeDays === null)
      ? "Fill lead-time values on active suppliers so Flash ERP can support better replenishment and purchasing expectations."
      : "Lead-time posture is present for all active suppliers in the current master list."
  ];

  return {
    metrics: {
      activeSuppliers: activeSuppliers.length,
      suppliersWithProductLinks,
      suppliersWithOpenPurchaseOrders,
      suppliersWithOpenClaims,
      suppliersWithPostedReturns
    },
    supplierRows,
    postureMessages,
    priorities,
    statusMessage: `Supplier masters are live for ${enterpriseNode.name}, so Flash ERP can manage sourcing contacts, purchasing participation, and vendor exception visibility from one setup lane.`,
    refreshedAt: new Date().toISOString()
  };
}

export async function createEnterpriseSupplier(
  input: CreateEnterpriseSupplierRequest
): Promise<EnterpriseSupplierMutationResponse> {
  try {
    const supplierNo = normalizeCode(input.supplierNo, "supplier number");
    const name = normalizeRequiredText(input.name, "supplier name");
    const contactName = normalizeOptionalText(input.contactName);
    const phone = normalizeOptionalText(input.phone);
    const email = normalizeOptionalText(input.email);
    const addressLine1 = normalizeOptionalText(input.addressLine1);
    const city = normalizeOptionalText(input.city);
    const countryCode = normalizeOptionalText(input.countryCode)?.toUpperCase() ?? null;
    const leadTimeDays = normalizeOptionalWholeNumber(input.leadTimeDays, "lead time days");
    const status = normalizeRecordStatus(input.status);

    const supplier = await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);

      return tx.supplier.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          supplierNo,
          name,
          contactName,
          phone,
          email,
          addressLine1,
          city,
          countryCode,
          leadTimeDays,
          status,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code
        },
        select: {
          supplierNo: true
        }
      });
    });

    return {
      supplierNo: supplier.supplierNo,
      message: `Supplier ${supplier.supplierNo} is now available for sourcing and purchasing in Flash ERP.`
    };
  } catch (error) {
    throw toSupplierMutationError(error, "Flash ERP could not create that supplier.");
  }
}

export async function updateEnterpriseSupplier(
  supplierNo: string,
  input: CreateEnterpriseSupplierRequest
): Promise<EnterpriseSupplierMutationResponse> {
  try {
    const normalizedSupplierNo = normalizeCode(supplierNo, "supplier number");
    const name = normalizeRequiredText(input.name, "supplier name");
    const contactName = normalizeOptionalText(input.contactName);
    const phone = normalizeOptionalText(input.phone);
    const email = normalizeOptionalText(input.email);
    const addressLine1 = normalizeOptionalText(input.addressLine1);
    const city = normalizeOptionalText(input.city);
    const countryCode = normalizeOptionalText(input.countryCode)?.toUpperCase() ?? null;
    const leadTimeDays = normalizeOptionalWholeNumber(input.leadTimeDays, "lead time days");
    const status = normalizeRecordStatus(input.status);

    const supplier = await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const existingSupplier = await tx.supplier.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          supplierNo: normalizedSupplierNo,
          deletedAt: null
        },
        select: {
          id: true,
          supplierNo: true
        }
      });

      if (!existingSupplier) {
        throw new Error(`Supplier ${normalizedSupplierNo} does not exist in Flash ERP enterprise.`);
      }

      return tx.supplier.update({
        where: {
          id: existingSupplier.id
        },
        data: {
          name,
          contactName,
          phone,
          email,
          addressLine1,
          city,
          countryCode,
          leadTimeDays,
          status,
          lastModifiedByNodeCode: enterpriseNode.code,
          recordVersion: {
            increment: 1
          }
        },
        select: {
          supplierNo: true
        }
      });
    });

    return {
      supplierNo: supplier.supplierNo,
      message: `Supplier ${supplier.supplierNo} has been updated in Flash ERP enterprise.`
    };
  } catch (error) {
    throw toSupplierMutationError(error, "Flash ERP could not update that supplier.");
  }
}
