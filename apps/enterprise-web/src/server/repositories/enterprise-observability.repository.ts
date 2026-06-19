import { Prisma, type PrismaClient } from "@prisma/client";
import { serializeJsonField } from "./json-field";

import { prisma } from "@/lib/db/prisma";
import { SecurityLogKind, SecurityLogSeverity } from "@flash-erp/domain";


type SecurityLogClient = Prisma.TransactionClient | PrismaClient;

export type EnterpriseSecurityLogInput = {
  retailOrgId: string;
  kind: SecurityLogKind;
  severity?: SecurityLogSeverity;
  category: string;
  action: string;
  actorLabel: string;
  targetType?: string | null;
  targetRef?: string | null;
  sourceNodeCode?: string | null;
  message: string;
  details?: Prisma.InputJsonValue | null;
};

function toInputJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return {
      serializationError: "Flash ERP could not serialize the diagnostic detail payload."
    };
  }
}

export function describeErrorForLog(error: unknown): Prisma.InputJsonObject {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return {
      errorName: error.name,
      errorCode: error.code,
      message: error.message,
      meta: toInputJson(error.meta)
    };
  }

  if (error instanceof Error) {
    return {
      errorName: error.name,
      message: error.message,
      stackPreview: error.stack?.split("\n").slice(0, 6).join("\n") ?? null
    };
  }

  return {
    errorName: "UnknownError",
    message: String(error)
  };
}

export async function writeEnterpriseSecurityLog(
  client: SecurityLogClient,
  input: EnterpriseSecurityLogInput
) {
  await client.securityLog.create({
    data: {
      retailOrgId: input.retailOrgId,
      kind: input.kind,
      severity: input.severity ?? SecurityLogSeverity.INFO,
      category: input.category,
      action: input.action,
      actorLabel: input.actorLabel,
      targetType: input.targetType ?? null,
      targetRef: input.targetRef ?? null,
      sourceNodeCode: input.sourceNodeCode ?? null,
      message: input.message,
      detailsJson: serializeJsonField(input.details)
    }
  });
}

export async function writeEnterpriseSecurityLogSafely(input: EnterpriseSecurityLogInput) {
  try {
    await writeEnterpriseSecurityLog(prisma, input);
  } catch (error) {
    console.error("Flash ERP could not write the security log entry.", error);
  }
}

export { SecurityLogKind, SecurityLogSeverity };
