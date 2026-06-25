import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { RecordStatus } from "@flash-erp/domain";

type ReserveDocumentNumberInput = {
  retailOrgId: string;
  companyId: string;
  documentType: string;
};

export type ReservedDocumentNumber = {
  documentSequenceId: string;
  documentNo: string;
  documentType: string;
  sequence: number;
};

function normalizeCode(value: string | null | undefined, label: string) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    throw new Error(`Flash ERP needs a ${label}.`);
  }

  const code = normalized
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase()
    .slice(0, 32);

  if (!code) {
    throw new Error(`Flash ERP needs a valid ${label}.`);
  }

  return code;
}

function formatDocumentNumber(prefix: string, sequence: number, paddingLength: number, suffix: string | null) {
  const core = `${prefix}-${String(sequence).padStart(paddingLength, "0")}`;
  return suffix ? `${core}-${suffix}` : core;
}

export async function reserveErpDocumentNumberInTransaction(
  tx: Prisma.TransactionClient,
  input: ReserveDocumentNumberInput
): Promise<ReservedDocumentNumber> {
  const documentType = normalizeCode(input.documentType, "document type");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const sequence = await tx.erpDocumentSequence.findFirst({
      where: {
        retailOrgId: input.retailOrgId,
        companyId: input.companyId,
        documentType,
        status: RecordStatus.ACTIVE
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        id: true,
        prefix: true,
        suffix: true,
        nextSequence: true,
        paddingLength: true
      }
    });

    if (!sequence) {
      throw new Error(`Flash ERP cannot find an active numbering sequence for ${documentType}.`);
    }

    const documentNo = formatDocumentNumber(
      sequence.prefix,
      sequence.nextSequence,
      sequence.paddingLength,
      sequence.suffix
    );
    const updated = await tx.erpDocumentSequence.updateMany({
      where: {
        id: sequence.id,
        nextSequence: sequence.nextSequence
      },
      data: {
        nextSequence: sequence.nextSequence + 1,
        lastIssuedNo: documentNo,
        lastIssuedAt: new Date()
      }
    });

    if (updated.count === 1) {
      return {
        documentSequenceId: sequence.id,
        documentNo,
        documentType,
        sequence: sequence.nextSequence
      };
    }
  }

  throw new Error(`Flash ERP could not reserve a ${documentType} number. Please retry.`);
}

export async function reserveErpDocumentNumber(
  input: ReserveDocumentNumberInput
): Promise<ReservedDocumentNumber> {
  return prisma.$transaction((tx) => reserveErpDocumentNumberInTransaction(tx, input));
}
