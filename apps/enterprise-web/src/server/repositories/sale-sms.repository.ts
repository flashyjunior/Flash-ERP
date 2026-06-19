import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { readJsonObject } from "./json-field";

type Tx = Prisma.TransactionClient | PrismaClient;

type CaptureReferenceInput = {
  retailOrgId: string;
  reference: string | null | undefined;
  transactionNo: string;
  source: "ONLINE_STORE" | "STORE_DESKTOP";
  customerName?: string | null;
  notes?: string | null;
};

export type SaleSmsInput = {
  retailOrgId: string;
  phoneReference: string | null | undefined;
  transactionNo: string;
  storeName: string;
  currencyCode: string;
  totalAmount: number;
  details?: string | null | undefined;
};

const defaultSaleSmsTemplate =
  "Thank you for shopping at {shopName}. Receipt {transactionNo}. Total {currencyCode} {totalAmount}.";

function isSqlServerDatabase() {
  return (process.env.DATABASE_URL ?? "").trim().toLowerCase().startsWith("sqlserver://");
}

function normalizeReference(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeReferenceKey(value: string) {
  return value.replace(/\s+/g, " ").trim().toUpperCase();
}

function normalizePhoneReference(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  const digits = trimmed.replace(/[^\d+]/g, "");
  const numericDigits = digits.replace(/\D/g, "");

  if (numericDigits.length < 7) {
    return null;
  }

  return digits || trimmed;
}

export async function ensureReferenceCaptureTable(tx: Tx) {
  if (isSqlServerDatabase()) {
    await tx.$executeRawUnsafe(`
      IF OBJECT_ID(N'[dbo].[transaction_reference_capture]', N'U') IS NULL
      BEGIN
        CREATE TABLE [dbo].[transaction_reference_capture] (
          [id] NVARCHAR(1000) NOT NULL,
          [retailOrgId] NVARCHAR(1000) NOT NULL,
          [referenceValue] NVARCHAR(1000) NOT NULL,
          [normalizedReference] NVARCHAR(1000) NOT NULL,
          [phoneNumber] NVARCHAR(1000) NULL,
          [source] NVARCHAR(100) NOT NULL,
          [sourceTransactionNo] NVARCHAR(1000) NULL,
          [customerName] NVARCHAR(1000) NULL,
          [notes] NVARCHAR(MAX) NULL,
          [firstCapturedAt] DATETIME2(3) NOT NULL CONSTRAINT [transaction_reference_capture_first_df] DEFAULT CURRENT_TIMESTAMP,
          [lastCapturedAt] DATETIME2(3) NOT NULL CONSTRAINT [transaction_reference_capture_last_df] DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT [transaction_reference_capture_pkey] PRIMARY KEY CLUSTERED ([id]),
          CONSTRAINT [transaction_reference_capture_org_ref_key] UNIQUE NONCLUSTERED ([retailOrgId], [normalizedReference])
        );
      END
    `);
  } else {
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "transaction_reference_capture" (
        "id" TEXT PRIMARY KEY,
        "retailOrgId" TEXT NOT NULL,
        "referenceValue" TEXT NOT NULL,
        "normalizedReference" TEXT NOT NULL,
        "phoneNumber" TEXT,
        "source" TEXT NOT NULL,
        "sourceTransactionNo" TEXT,
        "customerName" TEXT,
        "notes" TEXT,
        "firstCapturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastCapturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "transaction_reference_capture_org_ref_key" UNIQUE ("retailOrgId", "normalizedReference")
      )
    `);
  }
}

export async function captureTransactionReference(tx: Tx, input: CaptureReferenceInput) {
  const referenceValue = normalizeReference(input.reference);

  if (!referenceValue) {
    return null;
  }

  const normalizedReference = normalizeReferenceKey(referenceValue);
  const phoneNumber = normalizePhoneReference(referenceValue);
  const notes = input.notes?.trim() || null;
  const customerName = input.customerName?.trim() || null;

  await ensureReferenceCaptureTable(tx);

  try {
    await tx.transactionReferenceCapture.create({
      data: {
        retailOrgId: input.retailOrgId,
        referenceValue,
        normalizedReference,
        phoneNumber,
        source: input.source,
        sourceTransactionNo: input.transactionNo,
        customerName,
        notes
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existingCapture = await tx.transactionReferenceCapture.findUnique({
        where: {
          retailOrgId_normalizedReference: {
            retailOrgId: input.retailOrgId,
            normalizedReference
          }
        },
        select: {
          source: true
        }
      });

      await tx.transactionReferenceCapture.update({
        where: {
          retailOrgId_normalizedReference: {
            retailOrgId: input.retailOrgId,
            normalizedReference
          }
        },
        data: {
          referenceValue,
          phoneNumber,
          source:
            existingCapture?.source === "CUSTOMER_CONVERSION"
              ? existingCapture.source
              : input.source,
          sourceTransactionNo: input.transactionNo,
          customerName,
          notes
        }
      });

      return {
        referenceValue,
        phoneNumber
      };
    }

    throw error;
  }

  return {
    referenceValue,
    phoneNumber
  };
}

function readBoolean(payload: Record<string, unknown>, key: string) {
  return payload[key] === true;
}

function readString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function readFirstDetailsWord(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";

  if (!normalized) {
    return "";
  }

  return normalized.split(" ")[0] ?? "";
}

function renderSaleSmsTemplate(template: string, input: SaleSmsInput) {
  const detailsFirstName = readFirstDetailsWord(input.details);
  const replacements: Record<string, string> = {
    shop: input.storeName,
    shopname: input.storeName,
    store: input.storeName,
    storename: input.storeName,
    transactionno: input.transactionNo,
    receiptno: input.transactionNo,
    currency: input.currencyCode,
    currencycode: input.currencyCode,
    total: input.totalAmount.toFixed(2),
    totalamount: input.totalAmount.toFixed(2),
    customerfirstname: detailsFirstName,
    detailsfirstname: detailsFirstName,
    detailsfirstword: detailsFirstName,
    firstname: detailsFirstName
  };
  const source = template.trim() || defaultSaleSmsTemplate;
  const replaceToken = (match: string, tokenName: string) =>
    replacements[tokenName.trim().toLowerCase()] ?? match;

  return source
    .replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, replaceToken)
    .replace(/\{\s*([A-Za-z0-9_]+)\s*\}/g, replaceToken);
}

function buildSaleSmsMessage(input: SaleSmsInput, template: string) {
  return renderSaleSmsTemplate(template, input);
}

export async function sendSaleSmsNotification(input: SaleSmsInput) {
  const recipient = normalizePhoneReference(input.phoneReference);

  if (!recipient) {
    return { sent: false, reason: "NO_PHONE" as const };
  }

  const org = await prisma.retailOrg.findUnique({
    where: {
      id: input.retailOrgId
    },
    select: {
      smsSettingsJson: true
    }
  });
  const settings = readJsonObject(org?.smsSettingsJson);

  if (!readBoolean(settings, "enabled") || !readBoolean(settings, "saleSmsEnabled")) {
    return { sent: false, reason: "DISABLED" as const };
  }

  const sender = readString(settings, "senderId");
  const apiKey = readString(settings, "apiKeyMask");
  const baseUrl = readString(settings, "apiBaseUrl") || "https://api.mnotify.com/api/sms/quick";

  if (!sender || !apiKey || !baseUrl) {
    return { sent: false, reason: "NOT_CONFIGURED" as const };
  }

  const endpoint = new URL(baseUrl);
  endpoint.searchParams.set("key", apiKey);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      recipient: [recipient],
      sender,
      message: buildSaleSmsMessage(input, readString(settings, "saleSmsTemplate")),
      is_schedule: false,
      schedule_date: ""
    })
  });

  if (!response.ok) {
    throw new Error(`mNotify returned HTTP ${response.status}.`);
  }

  return { sent: true, reason: "SENT" as const };
}

export async function sendSaleSmsNotificationSafely(
  input: SaleSmsInput,
  contextLabel = "sale SMS",
) {
  try {
    const result = await sendSaleSmsNotification(input);

    if (!result.sent) {
      console.warn(`Flash ERP skipped ${contextLabel}: ${result.reason}.`);
    }

    return result;
  } catch (error) {
    console.warn(`Flash ERP could not send ${contextLabel}.`, error);
    return { sent: false, reason: "ERROR" as const };
  }
}
