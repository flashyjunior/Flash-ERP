import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";
import { InventoryMovementType, SerialInventoryStatus } from "@flash-erp/domain";

import { prisma } from "@/lib/db/prisma";
import { readJsonStringArray } from "@/server/repositories/json-field";

type DbClient = Prisma.TransactionClient | PrismaClient;

export const STOCK_UPDATE_MODE_AUTO = "AUTO";
export const STOCK_UPDATE_MODE_HQ_CONFIRM = "HQ_CONFIRM";
export const STOCK_UPDATE_STATUS_POSTED = "POSTED";
export const STOCK_UPDATE_STATUS_PENDING = "PENDING_HQ_CONFIRM";

export type StockUpdateMode = typeof STOCK_UPDATE_MODE_AUTO | typeof STOCK_UPDATE_MODE_HQ_CONFIRM;

function normalizeStockUpdateMode(value: string | null | undefined): StockUpdateMode {
  return value === STOCK_UPDATE_MODE_HQ_CONFIRM ? STOCK_UPDATE_MODE_HQ_CONFIRM : STOCK_UPDATE_MODE_AUTO;
}

function toQuantityString(value: number) {
  return Number(value.toFixed(3)).toFixed(3);
}

function toMoneyString(value: number) {
  return Number(value.toFixed(2)).toFixed(2);
}

function toQuantity(value: Prisma.Decimal | number | string | null | undefined) {
  return Number(Number(value ?? 0).toFixed(3));
}

function readSerialNumbers(value: unknown) {
  return readJsonStringArray(value) ?? [];
}

export function formatStockUpdateMode(value: string | null | undefined) {
  return normalizeStockUpdateMode(value) === STOCK_UPDATE_MODE_HQ_CONFIRM
    ? "Hold for HQ confirmation"
    : "Auto update stock";
}

export async function resolveStockUpdateMode(
  tx: DbClient,
  retailOrgId: string,
  storeId?: string | null
): Promise<StockUpdateMode> {
  const [retailOrg, store] = await Promise.all([
    tx.retailOrg.findUnique({
      where: { id: retailOrgId },
      select: { stockUpdateMode: true }
    }),
    storeId
      ? tx.store.findFirst({
          where: { id: storeId, retailOrgId },
          select: { stockUpdateMode: true }
        })
      : Promise.resolve(null)
  ]);

  return normalizeStockUpdateMode(store?.stockUpdateMode ?? retailOrg?.stockUpdateMode);
}

export async function shouldPostStockImmediately(
  tx: DbClient,
  retailOrgId: string,
  storeId?: string | null
) {
  return (await resolveStockUpdateMode(tx, retailOrgId, storeId)) === STOCK_UPDATE_MODE_AUTO;
}

async function upsertSerialUnit(
  tx: DbClient,
  input: {
    retailOrgId: string;
    storeId: string | null;
    warehouseId: string | null;
    inventoryLocationId: string | null;
    productId: string;
    serialNumber: string;
    status: SerialInventoryStatus;
    sourceReferenceType: string;
    sourceReferenceId: string;
    sourceReferenceLabel: string | null;
    sourceNodeCode: string | null;
    occurredAt: Date;
  }
) {
  await tx.inventorySerialUnit.upsert({
    where: {
      retailOrgId_productId_serialNumber: {
        retailOrgId: input.retailOrgId,
        productId: input.productId,
        serialNumber: input.serialNumber
      }
    },
    update: {
      storeId: input.storeId,
      warehouseId: input.warehouseId,
      inventoryLocationId: input.inventoryLocationId,
      status: input.status,
      sourceReferenceType: input.sourceReferenceType,
      sourceReferenceId: input.sourceReferenceId,
      sourceReferenceLabel: input.sourceReferenceLabel,
      sourceNodeCode: input.sourceNodeCode,
      lastOccurredAt: input.occurredAt
    },
    create: {
      retailOrgId: input.retailOrgId,
      storeId: input.storeId,
      warehouseId: input.warehouseId,
      inventoryLocationId: input.inventoryLocationId,
      productId: input.productId,
      serialNumber: input.serialNumber,
      status: input.status,
      sourceReferenceType: input.sourceReferenceType,
      sourceReferenceId: input.sourceReferenceId,
      sourceReferenceLabel: input.sourceReferenceLabel,
      sourceNodeCode: input.sourceNodeCode,
      lastOccurredAt: input.occurredAt
    }
  });
}

export async function confirmGoodsReceiptStockUpdate(
  goodsReceiptId: string,
  actorLabel: string
) {
  return prisma.$transaction(async (tx) => {
    const receipt = await tx.goodsReceipt.findUnique({
      where: { id: goodsReceiptId },
      include: {
        inventoryLocation: true,
        lines: {
          include: {
            product: {
              select: {
                id: true,
                code: true,
                name: true,
                isSerialized: true,
                baseCostPrice: true
              }
            }
          },
          orderBy: { lineNo: "asc" }
        }
      }
    });

    if (!receipt) {
      throw new Error("Flash ERP could not find that goods receipt.");
    }

    if (receipt.stockUpdateStatus === STOCK_UPDATE_STATUS_POSTED) {
      return {
      referenceNo: receipt.receiptNo,
      status: STOCK_UPDATE_STATUS_POSTED,
      stockUpdateStatus: STOCK_UPDATE_STATUS_POSTED,
      stockConfirmedAt: receipt.stockConfirmedAt?.toISOString() ?? null,
      stockConfirmedBy: receipt.stockConfirmedBy,
      postedQuantity: 0,
      message: `${receipt.receiptNo} stock has already been posted.`
      };
    }

    const now = new Date();
    let postedQuantity = 0;

    for (const line of receipt.lines) {
      const alreadyPosted = await tx.inventoryLedgerEntry.aggregate({
        where: {
          retailOrgId: receipt.retailOrgId,
          referenceId: receipt.id,
          movementType: InventoryMovementType.GOODS_RECEIPT,
          productId: line.productId
        },
        _sum: { quantity: true }
      });
      const pendingQuantity = Number(
        Math.max(0, toQuantity(line.quantity) - toQuantity(alreadyPosted._sum.quantity)).toFixed(3)
      );

      if (pendingQuantity <= 0) {
        continue;
      }

      await tx.inventoryLedgerEntry.create({
        data: {
          id: randomUUID(),
          retailOrgId: receipt.retailOrgId,
          storeId: receipt.storeId,
          warehouseId: receipt.warehouseId,
          inventoryLocationId: receipt.inventoryLocationId,
          productId: line.productId,
          movementType: InventoryMovementType.GOODS_RECEIPT,
          quantity: toQuantityString(pendingQuantity),
          unitCost:
            line.unitCost === null
              ? line.product.baseCostPrice?.toString() ?? null
              : toMoneyString(Number(line.unitCost)),
          referenceType: "GOODS_RECEIPT",
          referenceId: receipt.id,
          externalReference: receipt.externalReference ?? receipt.receiptNo,
          sourceNodeCode: receipt.sourceNodeCode ?? "ENTERPRISE",
          occurredAt: receipt.receivedAt
        }
      });

      if (line.product.isSerialized) {
        for (const serialNumber of readSerialNumbers(line.serialNumbersSnapshot)) {
          await upsertSerialUnit(tx, {
            retailOrgId: receipt.retailOrgId,
            storeId: receipt.storeId,
            warehouseId: receipt.warehouseId,
            inventoryLocationId: receipt.inventoryLocationId,
            productId: line.productId,
            serialNumber,
            status: SerialInventoryStatus.AVAILABLE,
            sourceReferenceType: "GOODS_RECEIPT",
            sourceReferenceId: receipt.id,
            sourceReferenceLabel: receipt.externalReference ?? receipt.receiptNo,
            sourceNodeCode: receipt.sourceNodeCode,
            occurredAt: receipt.receivedAt
          });
        }
      }

      postedQuantity = Number((postedQuantity + pendingQuantity).toFixed(3));
    }

    await tx.goodsReceipt.update({
      where: { id: receipt.id },
      data: {
        stockUpdateStatus: STOCK_UPDATE_STATUS_POSTED,
        stockConfirmedAt: now,
        stockConfirmedBy: actorLabel
      }
    });

    return {
      referenceNo: receipt.receiptNo,
      status: STOCK_UPDATE_STATUS_POSTED,
      stockUpdateStatus: STOCK_UPDATE_STATUS_POSTED,
      stockConfirmedAt: now.toISOString(),
      stockConfirmedBy: actorLabel,
      postedQuantity,
      message:
        postedQuantity > 0
          ? `${receipt.receiptNo} stock update posted ${postedQuantity.toFixed(3)} unit(s).`
          : `${receipt.receiptNo} had no remaining stock quantity to post.`
    };
  });
}

export async function confirmTransferStockUpdate(
  transferKey: string,
  direction: "ISSUE" | "RECEIPT",
  actorLabel: string
) {
  return prisma.$transaction(async (tx) => {
    const transfers = await tx.interStoreTransfer.findMany({
      where: {
        OR: [{ id: transferKey }, { transferNo: transferKey }, { transferBatchNo: transferKey }]
      },
      include: {
        sourceInventoryLocation: true,
        destinationInventoryLocation: true,
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            isSerialized: true,
            baseCostPrice: true
          }
        }
      },
      orderBy: [{ lineNo: "asc" }, { transferNo: "asc" }]
    });

    if (transfers.length === 0) {
      throw new Error("Flash ERP could not find that transfer.");
    }

    const isIssue = direction === "ISSUE";
    const movementType = isIssue
      ? InventoryMovementType.STOCK_TRANSFER_OUT
      : InventoryMovementType.STOCK_TRANSFER_IN;
    const now = new Date();
    let postedQuantity = 0;
    let updatedLines = 0;

    for (const transfer of transfers) {
      const status = isIssue ? transfer.issueStockUpdateStatus : transfer.receiptStockUpdateStatus;

      if (status === STOCK_UPDATE_STATUS_POSTED) {
        continue;
      }

      const targetQuantity = isIssue ? toQuantity(transfer.issuedQuantity) : toQuantity(transfer.receivedQuantity);
      const posted = await tx.inventoryLedgerEntry.aggregate({
        where: {
          retailOrgId: transfer.retailOrgId,
          referenceId: transfer.id,
          movementType
        },
        _sum: { quantity: true }
      });
      const alreadyPostedQuantity = Math.abs(toQuantity(posted._sum.quantity));
      const pendingQuantity = Number(Math.max(0, targetQuantity - alreadyPostedQuantity).toFixed(3));
      const location = isIssue ? transfer.sourceInventoryLocation : transfer.destinationInventoryLocation;
      const storeId = isIssue ? transfer.sourceStoreId : transfer.destinationStoreId;

      if (pendingQuantity > 0) {
        await tx.inventoryLedgerEntry.create({
          data: {
            id: randomUUID(),
            retailOrgId: transfer.retailOrgId,
            storeId,
            warehouseId: location.warehouseId,
            inventoryLocationId: location.id,
            productId: transfer.productId,
            movementType,
            quantity: toQuantityString(isIssue ? pendingQuantity * -1 : pendingQuantity),
            unitCost:
              transfer.unitCost === null
                ? transfer.product.baseCostPrice?.toString() ?? null
                : toMoneyString(Number(transfer.unitCost)),
            referenceType: "INTER_STORE_TRANSFER",
            referenceId: transfer.id,
            externalReference: transfer.transferNo,
            sourceNodeCode: isIssue
              ? transfer.sourceNodeCode ?? "ENTERPRISE"
              : transfer.destinationNodeCode ?? "ENTERPRISE",
            occurredAt: isIssue ? transfer.issuedAt ?? now : transfer.receivedAt ?? now
          }
        });
      }

      if (transfer.product.isSerialized) {
        const serialNumbers = readSerialNumbers(
          isIssue ? transfer.issuedSerialNumbersSnapshot : transfer.receivedSerialNumbersSnapshot
        );

        for (const serialNumber of serialNumbers) {
          await upsertSerialUnit(tx, {
            retailOrgId: transfer.retailOrgId,
            storeId: isIssue ? null : transfer.destinationStoreId,
            warehouseId: isIssue ? null : transfer.destinationInventoryLocation.warehouseId,
            inventoryLocationId: isIssue ? null : transfer.destinationInventoryLocationId,
            productId: transfer.productId,
            serialNumber,
            status: isIssue ? SerialInventoryStatus.IN_TRANSIT : SerialInventoryStatus.AVAILABLE,
            sourceReferenceType: "INTER_STORE_TRANSFER",
            sourceReferenceId: transfer.id,
            sourceReferenceLabel: transfer.transferNo,
            sourceNodeCode: isIssue ? transfer.sourceNodeCode : transfer.destinationNodeCode,
            occurredAt: isIssue ? transfer.issuedAt ?? now : transfer.receivedAt ?? now
          });
        }
      }

      await tx.interStoreTransfer.update({
        where: { id: transfer.id },
        data: isIssue
          ? {
              issueStockUpdateStatus: STOCK_UPDATE_STATUS_POSTED,
              issueStockConfirmedAt: now,
              issueStockConfirmedBy: actorLabel
            }
          : {
              receiptStockUpdateStatus: STOCK_UPDATE_STATUS_POSTED,
              receiptStockConfirmedAt: now,
              receiptStockConfirmedBy: actorLabel
            }
      });

      postedQuantity = Number((postedQuantity + pendingQuantity).toFixed(3));
      updatedLines += 1;
    }

    const referenceNo = transfers[0]?.transferBatchNo ?? transfers[0]?.transferNo ?? transferKey;

    return {
      referenceNo,
      status: STOCK_UPDATE_STATUS_POSTED,
      postedQuantity,
      stockUpdateStatus: STOCK_UPDATE_STATUS_POSTED,
      stockConfirmedAt: now.toISOString(),
      stockConfirmedBy: actorLabel,
      message:
        updatedLines > 0
          ? `${referenceNo} ${isIssue ? "issue" : "receipt"} stock update posted ${postedQuantity.toFixed(3)} unit(s) across ${updatedLines} line(s).`
          : `${referenceNo} ${isIssue ? "issue" : "receipt"} stock has already been posted.`
    };
  });
}
