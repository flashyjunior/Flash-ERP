import { Prisma } from "@prisma/client";
import { SecurityLogKind, SecurityLogSeverity, SyncNodeType, RecordStatus } from "@flash-erp/domain";

import { prisma } from "@/lib/db/prisma";
import {
  alwaysIncludedPurgeScopeKeys,
  enterpriseDataPurgeConfirmationText,
  enterpriseDataPurgeScopeByKey as scopeByKey,
  type EnterpriseDataPurgeRequest,
  type EnterpriseDataPurgeResponse,
  type EnterpriseDataPurgeScopeKey
} from "@/lib/security/data-purge-scopes";

export type {
  EnterpriseDataPurgeRequest,
  EnterpriseDataPurgeResponse,
  EnterpriseDataPurgeScopeKey
};

/**
 * Enterprise data purge.
 *
 * Transactional data is always removed. Master data is opt-in per scope so an
 * operator can, for example, wipe a pilot's trading history while keeping the
 * product catalogue, or reset the whole workspace back to an empty shell.
 *
 * Deletions are ordered child-before-parent. Rows that cascade from a parent we
 * delete are not listed separately; Prisma's `onDelete: Cascade` removes them.
 */

export class EnterpriseDataPurgeError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "EnterpriseDataPurgeError";
    this.status = status;
  }
}

function resolveRequestedScopes(input: EnterpriseDataPurgeRequest) {
  const requested = new Set<EnterpriseDataPurgeScopeKey>(alwaysIncludedPurgeScopeKeys);

  for (const value of Array.isArray(input.scopes) ? input.scopes : []) {
    if (typeof value !== "string") {
      continue;
    }

    const scope = scopeByKey.get(value as EnterpriseDataPurgeScopeKey);

    if (!scope) {
      throw new EnterpriseDataPurgeError(`"${value}" is not a purgeable data scope.`);
    }

    requested.add(scope.key);
  }

  for (const key of requested) {
    for (const dependency of scopeByKey.get(key)?.requires ?? []) {
      if (!requested.has(dependency)) {
        throw new EnterpriseDataPurgeError(
          `Purging "${scopeByKey.get(key)?.label}" also requires "${scopeByKey.get(dependency)?.label}" to be selected.`
        );
      }
    }
  }

  return [...requested];
}

/**
 * Ordered delete plan. Each step names a Prisma delegate and the scope that
 * enables it; children are listed before their parents so restrict-mode foreign
 * keys stay satisfied even where cascades would have handled it.
 */
type PurgeStep = {
  scope: EnterpriseDataPurgeScopeKey;
  model: string;
  run: (tx: Prisma.TransactionClient, retailOrgId: string) => Promise<{ count: number }>;
};

const purgeSteps: PurgeStep[] = [
  // --- Transactional ------------------------------------------------------
  {
    scope: "ecommerce-orders",
    model: "EcommerceFulfillment",
    run: (tx, retailOrgId) => tx.ecommerceFulfillment.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "ecommerce-orders",
    model: "EcommerceProductReview",
    run: (tx, retailOrgId) => tx.ecommerceProductReview.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "ecommerce-orders",
    model: "EcommerceOrder",
    run: (tx, retailOrgId) => tx.ecommerceOrder.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "sales-orders",
    model: "SalesOrder",
    run: (tx, retailOrgId) => tx.salesOrder.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "pos-transactions",
    model: "PosTransaction",
    run: (tx, retailOrgId) => tx.posTransaction.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "pos-transactions",
    model: "PosShift",
    run: (tx, retailOrgId) => tx.posShift.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "pos-transactions",
    model: "TransactionReferenceCapture",
    run: (tx, retailOrgId) => tx.transactionReferenceCapture.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "purchasing",
    model: "SupplierClaim",
    run: (tx, retailOrgId) => tx.supplierClaim.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "purchasing",
    model: "SupplierReturn",
    run: (tx, retailOrgId) => tx.supplierReturn.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "purchasing",
    model: "GoodsReceipt",
    run: (tx, retailOrgId) => tx.goodsReceipt.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "purchasing",
    model: "PurchaseOrder",
    run: (tx, retailOrgId) => tx.purchaseOrder.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "transfers-counts",
    model: "InterStoreTransfer",
    run: (tx, retailOrgId) => tx.interStoreTransfer.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "transfers-counts",
    model: "StockCountSession",
    run: (tx, retailOrgId) => tx.stockCountSession.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "inventory-stock",
    model: "InventorySerialUnit",
    run: (tx, retailOrgId) => tx.inventorySerialUnit.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "inventory-stock",
    model: "InventoryBatch",
    run: (tx, retailOrgId) => tx.inventoryBatch.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "inventory-stock",
    model: "InventoryLedgerEntry",
    run: (tx, retailOrgId) => tx.inventoryLedgerEntry.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "cash-banking",
    model: "CustomerAccountPaymentAllocation",
    run: (tx, retailOrgId) =>
      tx.customerAccountPaymentAllocation.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "cash-banking",
    model: "CustomerAccountEntry",
    run: (tx, retailOrgId) => tx.customerAccountEntry.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "cash-banking",
    model: "EodReconciliation",
    run: (tx, retailOrgId) => tx.eodReconciliation.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "cash-banking",
    model: "BankingDeposit",
    run: (tx, retailOrgId) => tx.bankingDeposit.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "cash-banking",
    model: "OperatingExpense",
    run: (tx, retailOrgId) => tx.operatingExpense.deleteMany({ where: { retailOrgId } })
  },
  // Finance records that survive the purge hold restrict-mode references to GL
  // journal entries, so detach them before the entries are deleted.
  {
    scope: "finance-journals",
    model: "ErpCashbookEntry (detached from journal)",
    run: (tx, retailOrgId) =>
      tx.erpCashbookEntry.updateMany({
        where: { retailOrgId, postingJournalEntryId: { not: null } },
        data: { postingJournalEntryId: null }
      })
  },
  {
    scope: "finance-journals",
    model: "ErpFixedAssetTransaction (detached from journal)",
    run: (tx, retailOrgId) =>
      tx.erpFixedAssetTransaction.updateMany({
        where: { retailOrgId, journalEntryId: { not: null } },
        data: { journalEntryId: null }
      })
  },
  {
    scope: "finance-journals",
    model: "ErpOperationalDocument (detached from journal)",
    run: (tx, retailOrgId) =>
      tx.erpOperationalDocument.updateMany({
        where: { retailOrgId, postingJournalEntryId: { not: null } },
        data: { postingJournalEntryId: null }
      })
  },
  {
    scope: "finance-journals",
    model: "ErpPayrollPostingBatch (detached from journal)",
    run: (tx, retailOrgId) =>
      tx.erpPayrollPostingBatch.updateMany({
        where: { retailOrgId, journalEntryId: { not: null } },
        data: { journalEntryId: null }
      })
  },
  {
    scope: "finance-journals",
    model: "ErpSettlementAllocation (detached from journal)",
    run: (tx, retailOrgId) =>
      tx.erpSettlementAllocation.updateMany({
        where: { retailOrgId, postingJournalEntryId: { not: null } },
        data: { postingJournalEntryId: null }
      })
  },
  {
    scope: "finance-journals",
    model: "ErpTaxTransaction (detached from journal)",
    run: (tx, retailOrgId) =>
      tx.erpTaxTransaction.updateMany({
        where: { retailOrgId, journalEntryId: { not: null } },
        data: { journalEntryId: null }
      })
  },
  {
    scope: "finance-journals",
    model: "GlJournalBatch",
    run: (tx, retailOrgId) => tx.glJournalBatch.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "finance-journals",
    model: "GlJournalEntry",
    run: (tx, retailOrgId) => tx.glJournalEntry.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "sync-queues",
    model: "SyncOperatorAction",
    run: (tx, retailOrgId) =>
      tx.syncOperatorAction.deleteMany({ where: { syncNode: { retailOrgId } } })
  },
  {
    scope: "sync-queues",
    model: "SyncInboxCheckpoint",
    run: (tx, retailOrgId) =>
      tx.syncInboxCheckpoint.deleteMany({ where: { syncNode: { retailOrgId } } })
  },
  {
    scope: "sync-queues",
    model: "SyncInboundEvent",
    run: (tx, retailOrgId) =>
      tx.syncInboundEvent.deleteMany({ where: { syncNode: { retailOrgId } } })
  },
  {
    scope: "sync-queues",
    model: "SyncOutboxEvent",
    run: (tx, retailOrgId) =>
      tx.syncOutboxEvent.deleteMany({ where: { syncNode: { retailOrgId } } })
  },

  // --- Master data --------------------------------------------------------
  {
    scope: "ecommerce-accounts",
    model: "EcommerceOtpChallenge",
    run: (tx, retailOrgId) => tx.ecommerceOtpChallenge.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "ecommerce-accounts",
    model: "EcommerceCustomerAccount",
    run: (tx, retailOrgId) => tx.ecommerceCustomerAccount.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "promotions",
    model: "GiftCertificate",
    run: (tx, retailOrgId) => tx.giftCertificate.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "promotions",
    model: "PromotionCampaign",
    run: (tx, retailOrgId) => tx.promotionCampaign.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "pricing",
    model: "InventoryCatalogStore",
    run: (tx, retailOrgId) => tx.inventoryCatalogStore.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "pricing",
    model: "InventoryCatalogProduct",
    run: (tx, retailOrgId) => tx.inventoryCatalogProduct.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "pricing",
    model: "InventoryCatalog",
    run: (tx, retailOrgId) => tx.inventoryCatalog.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "pricing",
    model: "PriceList",
    run: (tx, retailOrgId) => tx.priceList.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "products",
    model: "StoreProductPrice",
    run: (tx, retailOrgId) => tx.storeProductPrice.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "products",
    model: "StoreProductSellingUnit",
    run: (tx, retailOrgId) => tx.storeProductSellingUnit.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "products",
    model: "ProductMatrixVariant",
    run: (tx, retailOrgId) => tx.productMatrixVariant.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "products",
    model: "ProductAttributeDefinition",
    run: (tx, retailOrgId) => tx.productAttributeDefinition.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "products",
    model: "Product",
    run: (tx, retailOrgId) => tx.product.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "categories",
    model: "ProductCategory",
    run: (tx, retailOrgId) => tx.productCategory.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "departments",
    model: "ProductDepartment",
    run: (tx, retailOrgId) => tx.productDepartment.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "units-of-measure",
    model: "UnitOfMeasureSchedule",
    run: (tx, retailOrgId) => tx.unitOfMeasureSchedule.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "units-of-measure",
    model: "UnitOfMeasure",
    run: (tx, retailOrgId) => tx.unitOfMeasure.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "tax-profiles",
    model: "ErpPartyAccountingProfile (detached from tax profile)",
    run: (tx, retailOrgId) =>
      tx.erpPartyAccountingProfile.updateMany({
        where: { retailOrgId, taxProfileId: { not: null } },
        data: { taxProfileId: null }
      })
  },
  {
    scope: "tax-profiles",
    model: "TaxProfile",
    run: (tx, retailOrgId) => tx.taxProfile.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "tender-methods",
    model: "EcommerceStorePaymentMethod",
    run: (tx, retailOrgId) => tx.ecommerceStorePaymentMethod.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "tender-methods",
    model: "ErpFuelSalePayment (detached from tender)",
    run: (tx, retailOrgId) =>
      tx.erpFuelSalePayment.updateMany({
        where: { retailOrgId, tenderMethodId: { not: null } },
        data: { tenderMethodId: null }
      })
  },
  {
    scope: "tender-methods",
    model: "TenderMethod",
    run: (tx, retailOrgId) => tx.tenderMethod.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "customers",
    model: "ErpPartyAccountingProfile (detached from customer)",
    run: (tx, retailOrgId) =>
      tx.erpPartyAccountingProfile.updateMany({
        where: { retailOrgId, customerId: { not: null } },
        data: { customerId: null }
      })
  },
  {
    scope: "customers",
    model: "Customer",
    run: (tx, retailOrgId) => tx.customer.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "suppliers",
    model: "ErpPartyAccountingProfile (detached from supplier)",
    run: (tx, retailOrgId) =>
      tx.erpPartyAccountingProfile.updateMany({
        where: { retailOrgId, supplierId: { not: null } },
        data: { supplierId: null }
      })
  },
  {
    scope: "suppliers",
    model: "Supplier",
    run: (tx, retailOrgId) => tx.supplier.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "inventory-locations",
    model: "InventoryLocation",
    run: (tx, retailOrgId) => tx.inventoryLocation.deleteMany({ where: { retailOrgId } })
  },
  {
    scope: "inventory-locations",
    model: "Warehouse",
    run: (tx, retailOrgId) => tx.warehouse.deleteMany({ where: { retailOrgId } })
  }
];

export async function purgeEnterpriseData(
  input: EnterpriseDataPurgeRequest,
  actorLabel: string
): Promise<EnterpriseDataPurgeResponse> {
  if ((input.confirmationText ?? "").trim().toUpperCase() !== enterpriseDataPurgeConfirmationText) {
    throw new EnterpriseDataPurgeError(
      `Type ${enterpriseDataPurgeConfirmationText} in the confirmation box before Flash ERP will purge data.`
    );
  }

  const scopes = resolveRequestedScopes(input);
  const scopeSet = new Set(scopes);

  const enterpriseNode = await prisma.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: { retailOrgId: true, code: true }
  });

  if (!enterpriseNode) {
    throw new EnterpriseDataPurgeError(
      "No primary enterprise node is available, so Flash ERP cannot scope the purge.",
      409
    );
  }

  const { retailOrgId } = enterpriseNode;
  const deletedCounts: Array<{ model: string; count: number }> = [];

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const step of purgeSteps) {
          if (!scopeSet.has(step.scope)) {
            continue;
          }

          const result = await step.run(tx, retailOrgId);

          if (result.count > 0) {
            deletedCounts.push({ model: step.model, count: result.count });
          }
        }
      },
      { timeout: 120_000 }
    );
  } catch (error) {
    throw new EnterpriseDataPurgeError(
      error instanceof Error
        ? `Flash ERP rolled the purge back without deleting anything: ${error.message}`
        : "Flash ERP rolled the purge back without deleting anything.",
      409
    );
  }

  const totalDeleted = deletedCounts.reduce((sum, entry) => sum + entry.count, 0);
  const selectedMasterScopes = scopes
    .filter((key) => scopeByKey.get(key)?.group === "Master data")
    .map((key) => scopeByKey.get(key)?.label ?? key);

  await prisma.securityLog.create({
    data: {
      retailOrgId,
      kind: SecurityLogKind.SECURITY,
      severity: SecurityLogSeverity.CRITICAL,
      category: "DATA_PURGE",
      action: "PURGE_EXECUTED",
      actorLabel,
      targetType: "Retail organisation",
      targetRef: retailOrgId,
      sourceNodeCode: enterpriseNode.code,
      message: `${actorLabel} purged ${totalDeleted} record(s) across ${deletedCounts.length} table(s).${
        selectedMasterScopes.length
          ? ` Master data removed: ${selectedMasterScopes.join(", ")}.`
          : " Transactional data only."
      }`,
      detailsJson: {
        scopes,
        totalDeleted,
        deletedCounts
      } as Prisma.InputJsonValue
    }
  });

  return {
    message: `Flash ERP purged ${totalDeleted} record(s) across ${deletedCounts.length} table(s). This action was written to the security log and cannot be undone.`,
    scopes,
    deletedCounts,
    totalDeleted,
    serverProcessedAt: new Date().toISOString()
  };
}
