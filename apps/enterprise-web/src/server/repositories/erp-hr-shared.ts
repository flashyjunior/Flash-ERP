import { type Prisma } from "@prisma/client";

import { RecordStatus, SyncNodeType } from "@flash-erp/domain";
import { prisma } from "@/lib/db/prisma";

export type HrContext = {
  retailOrgId: string;
  retailOrg: {
    code: string;
    name: string;
    baseCurrencyCode: string;
    timezone: string;
  };
};

export type HrCompany = {
  id: string;
  code: string;
  legalName: string;
  tradingName: string | null;
  baseCurrencyCode: string;
};

export const activeStatus = RecordStatus.ACTIVE;

export function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

export function normalizeRequiredText(value: string | null | undefined, label: string) {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    throw new Error(`Flash ERP needs a ${label}.`);
  }

  return normalized;
}

export function normalizeCode(value: string | null | undefined, label: string, maxLength = 40) {
  const normalized = normalizeRequiredText(value, label)
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase()
    .slice(0, maxLength);

  if (!normalized) {
    throw new Error(`Flash ERP needs a valid ${label}.`);
  }

  return normalized;
}

export function normalizeChoice(
  value: string | null | undefined,
  label: string,
  allowed: string[],
  fallback?: string
) {
  const normalized = normalizeCode(value ?? fallback, label);

  if (!allowed.includes(normalized)) {
    throw new Error(`Flash ERP ${label} must be one of: ${allowed.join(", ")}.`);
  }

  return normalized;
}

export function numberOrZero(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeNonNegativeNumber(
  value: number | string | null | undefined,
  label: string
) {
  const normalized = numberOrZero(value);

  if (normalized < 0) {
    throw new Error(`Flash ERP ${label} cannot be negative.`);
  }

  return normalized;
}

export function normalizeDate(value: string | Date | null | undefined, label: string) {
  if (!value) {
    throw new Error(`Flash ERP needs a ${label}.`);
  }

  const date = value instanceof Date ? new Date(value) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Flash ERP needs a valid ${label}.`);
  }

  return date;
}

export function normalizeDateOnly(value: string | Date | null | undefined, label: string) {
  const date = normalizeDate(value, label);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function normalizeOptionalDate(value: string | Date | null | undefined, label: string) {
  return value ? normalizeDate(value, label) : null;
}

export function dateInputValue(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

export async function getHrContext(
  tx: Prisma.TransactionClient = prisma
): Promise<HrContext | null> {
  const node = await tx.syncNode.findFirst({
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
          name: true,
          baseCurrencyCode: true,
          timezone: true
        }
      }
    }
  });

  if (!node) {
    return null;
  }

  return {
    retailOrgId: node.retailOrgId,
    retailOrg: node.retailOrg
  };
}

export async function getPrimaryHrCompany(
  tx: Prisma.TransactionClient,
  context: HrContext
): Promise<HrCompany | null> {
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
      tradingName: true,
      baseCurrencyCode: true
    }
  });
}
