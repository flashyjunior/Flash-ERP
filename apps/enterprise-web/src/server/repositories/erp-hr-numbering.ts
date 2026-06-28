import { type Prisma } from "@prisma/client";

import { activeStatus, type HrCompany, type HrContext } from "@/server/repositories/erp-hr-shared";
import { reserveErpDocumentNumberInTransaction } from "@/server/services/erp-document-numbering";

export async function reserveHrDocumentNumber(
  tx: Prisma.TransactionClient,
  input: {
    context: HrContext;
    company: HrCompany;
    documentType: string;
    prefix: string;
    resetPolicy?: "NEVER" | "FISCAL_YEAR";
  }
) {
  const fiscalYear = await tx.erpFiscalYear.findFirst({
    where: {
      companyId: input.company.id,
      status: { not: "CLOSED" }
    },
    orderBy: [{ startsOn: "desc" }, { code: "desc" }]
  });

  if (!fiscalYear) {
    throw new Error("Flash ERP needs an open fiscal year before reserving an HR document number.");
  }

  await tx.erpDocumentSequence.upsert({
    where: {
      companyId_documentType_fiscalYearId: {
        companyId: input.company.id,
        documentType: input.documentType,
        fiscalYearId: fiscalYear.id
      }
    },
    update: {
      prefix: input.prefix,
      resetPolicy: input.resetPolicy ?? "NEVER",
      status: activeStatus
    },
    create: {
      retailOrgId: input.context.retailOrgId,
      companyId: input.company.id,
      fiscalYearId: fiscalYear.id,
      documentType: input.documentType,
      prefix: input.prefix,
      nextSequence: 1,
      paddingLength: 6,
      resetPolicy: input.resetPolicy ?? "NEVER",
      status: activeStatus
    }
  });

  return reserveErpDocumentNumberInTransaction(tx, {
    retailOrgId: input.context.retailOrgId,
    companyId: input.company.id,
    documentType: input.documentType
  });
}
