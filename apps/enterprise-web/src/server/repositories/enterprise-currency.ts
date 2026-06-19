import { type Prisma } from "@prisma/client";
import { readJsonObject } from "./json-field";

import { prisma } from "@/lib/db/prisma";
import { RecordStatus, SyncNodeType } from "@flash-erp/domain";


function readObject(value: unknown) {
  return readJsonObject(value) as Record<string, Prisma.JsonValue>;
}

function readString(payload: Record<string, Prisma.JsonValue>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeCurrencyCode(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{3}$/.test(normalized) ? normalized : fallback;
}

export function resolveEnterpriseCurrencyCode(
  retailOrg: {
    baseCurrencyCode?: string | null;
    companySettingsJson?: Prisma.JsonValue | null;
  },
  fallback = "USD"
) {
  const payload = readObject(retailOrg.companySettingsJson);
  const currencyFromProfile =
    readString(payload, "baseCurrencyCode") ??
    readString(payload, "currencyCode") ??
    readString(payload, "defaultCurrencyCode");

  return normalizeCurrencyCode(currencyFromProfile ?? retailOrg.baseCurrencyCode, fallback);
}

export async function getEnterpriseCurrencyCode(fallback = "USD") {
  try {
    const enterpriseNode = await prisma.syncNode.findFirst({
      where: {
        nodeType: SyncNodeType.ENTERPRISE,
        isPrimary: true,
        status: RecordStatus.ACTIVE
      },
      select: {
        retailOrg: {
          select: {
            baseCurrencyCode: true,
            companySettingsJson: true
          }
        }
      }
    });

    if (enterpriseNode) {
      return resolveEnterpriseCurrencyCode(enterpriseNode.retailOrg, fallback);
    }

    const retailOrg = await prisma.retailOrg.findFirst({
      where: {
        status: RecordStatus.ACTIVE
      },
      orderBy: {
        createdAt: "asc"
      },
      select: {
        baseCurrencyCode: true,
        companySettingsJson: true
      }
    });

    return retailOrg ? resolveEnterpriseCurrencyCode(retailOrg, fallback) : fallback;
  } catch {
    return fallback;
  }
}
