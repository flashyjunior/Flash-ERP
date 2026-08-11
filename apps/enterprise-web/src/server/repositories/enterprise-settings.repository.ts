import { Prisma } from "@prisma/client";
import net from "node:net";
import tls from "node:tls";
import { readJsonObject, serializeJsonField } from "./json-field";

import { prisma } from "@/lib/db/prisma";
import {
  STOCK_UPDATE_MODE_AUTO,
  STOCK_UPDATE_MODE_HQ_CONFIRM,
  formatStockUpdateMode
} from "@/server/repositories/inventory-stock-policy.repository";
import {
  RecordStatus,
  SecurityLogKind,
  SecurityLogSeverity,
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

function toSettingsMutationError(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error : new Error(fallbackMessage);
}

function toAuditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function changedAuditFields(previousJson: Record<string, unknown>, updatedJson: Record<string, unknown>) {
  return Array.from(new Set([...Object.keys(previousJson), ...Object.keys(updatedJson)])).filter(
    (key) => JSON.stringify(previousJson[key] ?? null) !== JSON.stringify(updatedJson[key] ?? null)
  );
}

function buildUpdateAuditDetails(
  previousJson: Record<string, unknown>,
  updatedJson: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) {
  const changedFields = changedAuditFields(previousJson, updatedJson);

  return toAuditJson({
    ...extra,
    changedFields,
    changedFieldsLabel: changedFields.join(", "),
    previousJson,
    updatedJson
  });
}

type EnterpriseSettingsContext = {
  id: string;
  code: string;
  name: string;
  retailOrgId: string;
};

type CompanyProfileSettings = {
  legalName: string;
  tradingName: string;
  companyLogoUrl: string;
  loginBackgroundImageUrl: string;
  documentNumberFormats: DocumentNumberFormatSettings;
  productSizes: string[];
  posDiscountRates: number[];
  posExpressChargeRates: number[];
  salesOrderFulfilmentStoreId: string;
  phone: string;
  email: string;
  website: string;
  taxRegistrationNo: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  countryCode: string;
  postalCode: string;
};

type DocumentNumberFormatKey =
  | "purchaseOrder"
  | "goodsReceipt"
  | "transferIn"
  | "transferOut"
  | "stockCount"
  | "storeReceipt";

type DocumentNumberFormatSettings = Record<
  DocumentNumberFormatKey,
  {
    prefix: string;
    digits: number;
    includeStoreCode: boolean;
  }
>;

const defaultDocumentNumberFormats: DocumentNumberFormatSettings = {
  purchaseOrder: { prefix: "PO", digits: 4, includeStoreCode: true },
  goodsReceipt: { prefix: "GRN", digits: 4, includeStoreCode: true },
  transferIn: { prefix: "TIN", digits: 4, includeStoreCode: true },
  transferOut: { prefix: "TOUT", digits: 4, includeStoreCode: true },
  stockCount: { prefix: "CNT", digits: 4, includeStoreCode: true },
  storeReceipt: { prefix: "POS", digits: 4, includeStoreCode: true }
};

type LdapSettings = {
  enabled: boolean;
  serverUrl: string;
  baseDn: string;
  bindDn: string;
  bindPasswordMask: string;
  userSearchBase: string;
  userSearchFilter: string;
  startTls: boolean;
  syncEnabled: boolean;
};

type SmtpSettings = {
  enabled: boolean;
  host: string;
  port: number;
  secureConnection: boolean;
  username: string;
  passwordMask: string;
  fromName: string;
  fromAddress: string;
  replyToAddress: string;
};

type SmsSettings = {
  enabled: boolean;
  saleSmsEnabled: boolean;
  saleSmsTemplate: string;
  providerName: string;
  senderId: string;
  apiBaseUrl: string;
  username: string;
  apiKeyMask: string;
  defaultCountryCode: string;
  deliveryReportEnabled: boolean;
};

type OptionSettings = {
  allowNegativeInventory: boolean;
  allowOfflineSales: boolean;
  autoPrintReceipts: boolean;
  enforceSerializedScanAtPos: boolean;
  requireCustomerForCreditSales: boolean;
  requireSupervisorForReceiptlessReturn: boolean;
  showCriticalStocksOnStartup: boolean;
  showExpiringBatchesOnStartup: boolean;
  expiryAlertLeadDays: number;
  expiryCriticalDays: number;
  defaultReceiptSearchDays: number;
  shiftFloatPromptAmount: number;
};

const defaultLdapSettings: LdapSettings = {
  enabled: false,
  serverUrl: "",
  baseDn: "",
  bindDn: "",
  bindPasswordMask: "",
  userSearchBase: "",
  userSearchFilter: "(uid={{username}})",
  startTls: false,
  syncEnabled: false
};

const defaultSmtpSettings: SmtpSettings = {
  enabled: false,
  host: "",
  port: 587,
  secureConnection: true,
  username: "",
  passwordMask: "",
  fromName: "",
  fromAddress: "",
  replyToAddress: ""
};

const defaultSaleSmsTemplate =
  "Thank you for shopping at {shopName}. Receipt {transactionNo}. Total {currencyCode} {totalAmount}.";

const defaultSmsSettings: SmsSettings = {
  enabled: false,
  saleSmsEnabled: false,
  saleSmsTemplate: defaultSaleSmsTemplate,
  providerName: "",
  senderId: "",
  apiBaseUrl: "https://api.mnotify.com/api/sms/quick",
  username: "",
  apiKeyMask: "",
  defaultCountryCode: "GH",
  deliveryReportEnabled: false
};

const defaultOptionSettings: OptionSettings = {
  allowNegativeInventory: false,
  allowOfflineSales: true,
  autoPrintReceipts: true,
  enforceSerializedScanAtPos: true,
  requireCustomerForCreditSales: true,
  requireSupervisorForReceiptlessReturn: true,
  showCriticalStocksOnStartup: false,
  showExpiringBatchesOnStartup: true,
  expiryAlertLeadDays: 30,
  expiryCriticalDays: 7,
  defaultReceiptSearchDays: 30,
  shiftFloatPromptAmount: 0
};

function readObject(value: unknown) {
  return readJsonObject(value) as Record<string, Prisma.JsonValue>;
}

function readString(
  payload: Record<string, Prisma.JsonValue>,
  key: string,
  fallback = ""
) {
  return typeof payload[key] === "string" ? (payload[key] as string) : fallback;
}

function readBoolean(
  payload: Record<string, Prisma.JsonValue>,
  key: string,
  fallback = false
) {
  return typeof payload[key] === "boolean" ? (payload[key] as boolean) : fallback;
}

function readNumber(
  payload: Record<string, Prisma.JsonValue>,
  key: string,
  fallback = 0
) {
  return typeof payload[key] === "number" && Number.isFinite(payload[key])
    ? (payload[key] as number)
    : fallback;
}

function readDocumentNumberFormats(
  value: Prisma.JsonValue | null | undefined
): DocumentNumberFormatSettings {
  const payload = readObject(value);
  const rawFormats = readObject(payload.documentNumberFormats);

  return Object.fromEntries(
    Object.entries(defaultDocumentNumberFormats).map(([key, fallback]) => {
      const rawFormat = readObject(rawFormats[key]);
      const prefix = readString(rawFormat, "prefix", fallback.prefix)
        .replace(/[^A-Za-z0-9-]/g, "")
        .toUpperCase()
        .slice(0, 12);
      const digits = Math.min(10, Math.max(2, Math.trunc(readNumber(rawFormat, "digits", fallback.digits))));

      return [
        key,
        {
          prefix: prefix || fallback.prefix,
          digits,
          includeStoreCode: readBoolean(rawFormat, "includeStoreCode", fallback.includeStoreCode)
        }
      ];
    })
  ) as DocumentNumberFormatSettings;
}

function normalizeProductSizes(input: unknown): string[] {
  const rawValues = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const sizes: string[] = [];

  for (const rawValue of rawValues) {
    const size = String(rawValue ?? "").trim().slice(0, 24);
    const key = size.toUpperCase();

    if (!size || seen.has(key)) {
      continue;
    }

    seen.add(key);
    sizes.push(size);
  }

  return sizes.slice(0, 100);
}

function normalizePosDiscountRates(input: unknown): number[] {
  const rawValues = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const rates: number[] = [];

  for (const rawValue of rawValues) {
    const rate = Number(rawValue);

    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      continue;
    }

    const normalizedRate = Number(rate.toFixed(2));
    const key = normalizedRate.toFixed(2);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    rates.push(normalizedRate);
  }

  return rates.slice(0, 100);
}

function normalizeDocumentNumberFormats(
  input: DocumentNumberFormatSettings | undefined
): DocumentNumberFormatSettings {
  return Object.fromEntries(
    Object.entries(defaultDocumentNumberFormats).map(([key, fallback]) => {
      const entry = input?.[key as DocumentNumberFormatKey] ?? fallback;
      const prefix = String(entry.prefix ?? fallback.prefix)
        .replace(/[^A-Za-z0-9-]/g, "")
        .toUpperCase()
        .slice(0, 12);
      const digits = Math.min(10, Math.max(2, Math.trunc(Number(entry.digits) || fallback.digits)));

      return [
        key,
        {
          prefix: prefix || fallback.prefix,
          digits,
          includeStoreCode: Boolean(entry.includeStoreCode)
        }
      ];
    })
  ) as DocumentNumberFormatSettings;
}

function readCompanyProfileSettings(
  value: Prisma.JsonValue | null | undefined,
  retailOrg: {
    code: string;
    name: string;
    baseCurrencyCode: string;
    timezone: string;
    stockUpdateMode?: string | null;
  }
) {
  const payload = readObject(value);

  return {
    companyCode: retailOrg.code,
    legalName: readString(payload, "legalName", retailOrg.name),
    tradingName: readString(payload, "tradingName", retailOrg.name),
    companyLogoUrl: readString(payload, "companyLogoUrl"),
    loginBackgroundImageUrl: readString(payload, "loginBackgroundImageUrl"),
    documentNumberFormats: readDocumentNumberFormats(value),
    productSizes: normalizeProductSizes(payload.productSizes),
    posDiscountRates: normalizePosDiscountRates(payload.posDiscountRates),
    posExpressChargeRates: normalizePosDiscountRates(payload.posExpressChargeRates),
    salesOrderFulfilmentStoreId: readString(payload, "salesOrderFulfilmentStoreId"),
    phone: readString(payload, "phone"),
    email: readString(payload, "email"),
    website: readString(payload, "website"),
    taxRegistrationNo: readString(payload, "taxRegistrationNo"),
    addressLine1: readString(payload, "addressLine1"),
    addressLine2: readString(payload, "addressLine2"),
    city: readString(payload, "city"),
    region: readString(payload, "region"),
    countryCode: readString(payload, "countryCode"),
    postalCode: readString(payload, "postalCode"),
    baseCurrencyCode: retailOrg.baseCurrencyCode || readString(payload, "baseCurrencyCode", "USD"),
    stockUpdateMode:
      retailOrg.stockUpdateMode === STOCK_UPDATE_MODE_HQ_CONFIRM
        ? STOCK_UPDATE_MODE_HQ_CONFIRM
        : STOCK_UPDATE_MODE_AUTO,
    stockUpdateModeLabel: formatStockUpdateMode(retailOrg.stockUpdateMode),
    timezone: readString(payload, "timezone", retailOrg.timezone)
  };
}

function readLdapSettings(value: Prisma.JsonValue | null | undefined): LdapSettings {
  const payload = readObject(value);

  return {
    enabled: readBoolean(payload, "enabled", defaultLdapSettings.enabled),
    serverUrl: readString(payload, "serverUrl", defaultLdapSettings.serverUrl),
    baseDn: readString(payload, "baseDn", defaultLdapSettings.baseDn),
    bindDn: readString(payload, "bindDn", defaultLdapSettings.bindDn),
    bindPasswordMask: readString(payload, "bindPasswordMask", defaultLdapSettings.bindPasswordMask),
    userSearchBase: readString(payload, "userSearchBase", defaultLdapSettings.userSearchBase),
    userSearchFilter: readString(
      payload,
      "userSearchFilter",
      defaultLdapSettings.userSearchFilter
    ),
    startTls: readBoolean(payload, "startTls", defaultLdapSettings.startTls),
    syncEnabled: readBoolean(payload, "syncEnabled", defaultLdapSettings.syncEnabled)
  };
}

function readSmtpSettings(value: Prisma.JsonValue | null | undefined): SmtpSettings {
  const payload = readObject(value);

  return {
    enabled: readBoolean(payload, "enabled", defaultSmtpSettings.enabled),
    host: readString(payload, "host", defaultSmtpSettings.host),
    port: readNumber(payload, "port", defaultSmtpSettings.port),
    secureConnection: readBoolean(
      payload,
      "secureConnection",
      defaultSmtpSettings.secureConnection
    ),
    username: readString(payload, "username", defaultSmtpSettings.username),
    passwordMask: readString(payload, "passwordMask", defaultSmtpSettings.passwordMask),
    fromName: readString(payload, "fromName", defaultSmtpSettings.fromName),
    fromAddress: readString(payload, "fromAddress", defaultSmtpSettings.fromAddress),
    replyToAddress: readString(payload, "replyToAddress", defaultSmtpSettings.replyToAddress)
  };
}

function readSmsSettings(value: Prisma.JsonValue | null | undefined): SmsSettings {
  const payload = readObject(value);

  return {
    enabled: readBoolean(payload, "enabled", defaultSmsSettings.enabled),
    saleSmsEnabled: readBoolean(payload, "saleSmsEnabled", defaultSmsSettings.saleSmsEnabled),
    saleSmsTemplate: readString(
      payload,
      "saleSmsTemplate",
      defaultSmsSettings.saleSmsTemplate
    ),
    providerName: readString(payload, "providerName", defaultSmsSettings.providerName),
    senderId: readString(payload, "senderId", defaultSmsSettings.senderId),
    apiBaseUrl: readString(payload, "apiBaseUrl", defaultSmsSettings.apiBaseUrl),
    username: readString(payload, "username", defaultSmsSettings.username),
    apiKeyMask: readString(payload, "apiKeyMask", defaultSmsSettings.apiKeyMask),
    defaultCountryCode: readString(
      payload,
      "defaultCountryCode",
      defaultSmsSettings.defaultCountryCode
    ),
    deliveryReportEnabled: readBoolean(
      payload,
      "deliveryReportEnabled",
      defaultSmsSettings.deliveryReportEnabled
    )
  };
}

type IntegrationValidationStatus = "READY" | "NOT_CONFIGURED" | "FAILED";
type IntegrationValidationCheckStatus = "PASS" | "WARN" | "FAIL";

export type EnterpriseIntegrationValidationResponse = {
  provider: "LDAP" | "SMTP" | "SMS";
  status: IntegrationValidationStatus;
  message: string;
  checks: Array<{
    label: string;
    status: IntegrationValidationCheckStatus;
    message: string;
  }>;
  networkAttempted: boolean;
  serverProcessedAt: string;
};

type ValidationOptions = {
  attemptNetwork?: boolean;
};

function pushValidationCheck(
  checks: EnterpriseIntegrationValidationResponse["checks"],
  label: string,
  status: IntegrationValidationCheckStatus,
  message: string
) {
  checks.push({ label, status, message });
}

function finishValidationResponse(
  provider: EnterpriseIntegrationValidationResponse["provider"],
  enabled: boolean,
  checks: EnterpriseIntegrationValidationResponse["checks"],
  networkAttempted: boolean
): EnterpriseIntegrationValidationResponse {
  const hasFailures = checks.some((check) => check.status === "FAIL");
  const status: IntegrationValidationStatus = !enabled
    ? "NOT_CONFIGURED"
    : hasFailures
      ? "FAILED"
      : "READY";
  const message =
    status === "NOT_CONFIGURED"
      ? `${provider} integration is disabled.`
      : status === "FAILED"
        ? `${provider} validation found settings that need attention.`
        : `${provider} validation passed.`;

  return {
    provider,
    status,
    message,
    checks,
    networkAttempted,
    serverProcessedAt: new Date().toISOString()
  };
}

function normalizeLdapSettingsInput(input: Partial<LdapSettings> | null | undefined): LdapSettings {
  return {
    enabled: Boolean(input?.enabled),
    serverUrl: input?.serverUrl?.trim() ?? "",
    baseDn: input?.baseDn?.trim() ?? "",
    bindDn: input?.bindDn?.trim() ?? "",
    bindPasswordMask: input?.bindPasswordMask?.trim() ?? "",
    userSearchBase: input?.userSearchBase?.trim() ?? "",
    userSearchFilter: input?.userSearchFilter?.trim() || defaultLdapSettings.userSearchFilter,
    startTls: Boolean(input?.startTls),
    syncEnabled: Boolean(input?.syncEnabled)
  };
}

function normalizeSmtpSettingsInput(input: Partial<SmtpSettings> | null | undefined): SmtpSettings {
  return {
    enabled: Boolean(input?.enabled),
    host: input?.host?.trim() ?? "",
    port: Math.max(1, Math.trunc(Number(input?.port ?? defaultSmtpSettings.port))),
    secureConnection: Boolean(input?.secureConnection),
    username: input?.username?.trim() ?? "",
    passwordMask: input?.passwordMask?.trim() ?? "",
    fromName: input?.fromName?.trim() ?? "",
    fromAddress: input?.fromAddress?.trim() ?? "",
    replyToAddress: input?.replyToAddress?.trim() ?? ""
  };
}

function normalizeSmsSettingsInput(input: Partial<SmsSettings> | null | undefined): SmsSettings {
  return {
    enabled: Boolean(input?.enabled),
    saleSmsEnabled: Boolean(input?.saleSmsEnabled),
    saleSmsTemplate: input?.saleSmsTemplate?.trim() || defaultSaleSmsTemplate,
    providerName: input?.providerName?.trim() ?? "",
    senderId: input?.senderId?.trim() ?? "",
    apiBaseUrl: input?.apiBaseUrl?.trim() ?? "",
    username: input?.username?.trim() ?? "",
    apiKeyMask: input?.apiKeyMask?.trim() ?? "",
    defaultCountryCode: input?.defaultCountryCode?.trim() || defaultSmsSettings.defaultCountryCode,
    deliveryReportEnabled: Boolean(input?.deliveryReportEnabled)
  };
}

type ParsedLdapEndpoint =
  | {
      ok: true;
      host: string;
      port: number;
      secure: boolean;
    }
  | {
      ok: false;
      error: string;
    };

function parseLdapEndpoint(serverUrl: string): ParsedLdapEndpoint {
  try {
    const endpoint = new URL(serverUrl);
    const protocol = endpoint.protocol.toLowerCase();

    if (protocol !== "ldap:" && protocol !== "ldaps:") {
      return {
        ok: false,
        error: "Use an ldap:// or ldaps:// server URL."
      };
    }

    return {
      ok: true,
      host: endpoint.hostname,
      port: endpoint.port ? Number(endpoint.port) : protocol === "ldaps:" ? 636 : 389,
      secure: protocol === "ldaps:"
    };
  } catch {
    return {
      ok: false,
      error: "Use a valid LDAP URL such as ldap://directory.example.com:389."
    };
  }
}

function looksLikeDistinguishedName(value: string) {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 && parts.every((part) => /^[a-z][a-z0-9-]*=/i.test(part));
}

function looksLikeUserSearchFilter(value: string) {
  const filter = value.trim();
  return filter.startsWith("(") && filter.endsWith(")") && filter.includes("{{username}}");
}

async function probeTcpEndpoint(input: {
  host: string;
  port: number;
  secure: boolean;
  timeoutMs?: number;
}) {
  const timeoutMs = input.timeoutMs ?? 3_000;

  return new Promise<{ ok: boolean; message: string }>((resolve) => {
    let settled = false;
    const socket: net.Socket = input.secure
      ? tls.connect({
          host: input.host,
          port: input.port,
          servername: input.host,
          rejectUnauthorized: false
        })
      : net.createConnection({
          host: input.host,
          port: input.port
        });

    const settle = (ok: boolean, message: string) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve({ ok, message });
    };

    socket.setTimeout(timeoutMs);
    socket.once(input.secure ? "secureConnect" : "connect", () =>
      settle(true, `Reached ${input.host}:${input.port}.`)
    );
    socket.once("timeout", () =>
      settle(false, `Timed out reaching ${input.host}:${input.port} after ${timeoutMs}ms.`)
    );
    socket.once("error", (error) =>
      settle(false, error instanceof Error ? error.message : "Network probe failed.")
    );
  });
}

async function probeHttpEndpoint(url: string, timeoutMs = 3_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal
    });

    return {
      ok: response.ok,
      message: `Reached HTTP endpoint with status ${response.status}.`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "HTTP probe failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function readOptionSettings(value: Prisma.JsonValue | null | undefined): OptionSettings {
  const payload = readObject(value);
  const expiryAlertLeadDays = Math.min(
    3650,
    Math.max(
      1,
      Math.trunc(
        readNumber(
          payload,
          "expiryAlertLeadDays",
          defaultOptionSettings.expiryAlertLeadDays
        )
      )
    )
  );
  const expiryCriticalDays = Math.min(
    expiryAlertLeadDays,
    Math.max(
      0,
      Math.trunc(
        readNumber(
          payload,
          "expiryCriticalDays",
          defaultOptionSettings.expiryCriticalDays
        )
      )
    )
  );

  return {
    allowNegativeInventory: readBoolean(
      payload,
      "allowNegativeInventory",
      defaultOptionSettings.allowNegativeInventory
    ),
    allowOfflineSales: readBoolean(
      payload,
      "allowOfflineSales",
      defaultOptionSettings.allowOfflineSales
    ),
    autoPrintReceipts: readBoolean(
      payload,
      "autoPrintReceipts",
      defaultOptionSettings.autoPrintReceipts
    ),
    enforceSerializedScanAtPos: readBoolean(
      payload,
      "enforceSerializedScanAtPos",
      defaultOptionSettings.enforceSerializedScanAtPos
    ),
    requireCustomerForCreditSales: readBoolean(
      payload,
      "requireCustomerForCreditSales",
      defaultOptionSettings.requireCustomerForCreditSales
    ),
    requireSupervisorForReceiptlessReturn: readBoolean(
      payload,
      "requireSupervisorForReceiptlessReturn",
      defaultOptionSettings.requireSupervisorForReceiptlessReturn
    ),
    showCriticalStocksOnStartup: readBoolean(
      payload,
      "showCriticalStocksOnStartup",
      defaultOptionSettings.showCriticalStocksOnStartup
    ),
    showExpiringBatchesOnStartup: readBoolean(
      payload,
      "showExpiringBatchesOnStartup",
      defaultOptionSettings.showExpiringBatchesOnStartup
    ),
    expiryAlertLeadDays,
    expiryCriticalDays,
    defaultReceiptSearchDays: readNumber(
      payload,
      "defaultReceiptSearchDays",
      defaultOptionSettings.defaultReceiptSearchDays
    ),
    shiftFloatPromptAmount: Number(
      readNumber(payload, "shiftFloatPromptAmount", defaultOptionSettings.shiftFloatPromptAmount).toFixed(2)
    )
  };
}

async function getEnterpriseSettingsContext(): Promise<
  | (EnterpriseSettingsContext & {
      retailOrg: {
        code: string;
        name: string;
        baseCurrencyCode: string;
        timezone: string;
        stockUpdateMode: string;
        companySettingsJson: Prisma.JsonValue | null;
        ldapSettingsJson: Prisma.JsonValue | null;
        smtpSettingsJson: Prisma.JsonValue | null;
        smsSettingsJson: Prisma.JsonValue | null;
        optionsSettingsJson: Prisma.JsonValue | null;
        updatedAt: Date;
      };
    })
  | null
> {
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
          code: true,
          name: true,
          baseCurrencyCode: true,
          timezone: true,
          stockUpdateMode: true,
          companySettingsJson: true,
          ldapSettingsJson: true,
          smtpSettingsJson: true,
          smsSettingsJson: true,
          optionsSettingsJson: true,
          updatedAt: true
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
      code: true
    }
  });

  if (!enterpriseNode) {
    throw new Error("No primary enterprise node is available for settings changes.");
  }

  return enterpriseNode;
}

async function getWritableRetailOrgSettings(tx: Prisma.TransactionClient, retailOrgId: string) {
  const retailOrg = await tx.retailOrg.findUnique({
    where: {
      id: retailOrgId
    },
    select: {
      code: true,
      name: true,
      baseCurrencyCode: true,
      timezone: true,
      stockUpdateMode: true,
      companySettingsJson: true,
      ldapSettingsJson: true,
      smtpSettingsJson: true,
      smsSettingsJson: true,
      optionsSettingsJson: true
    }
  });

  if (!retailOrg) {
    throw new Error("No retail organization is available for settings changes.");
  }

  return retailOrg;
}

async function writeSecurityLog(
  tx: Prisma.TransactionClient,
  input: {
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
  }
) {
  await tx.securityLog.create({
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

export type EnterpriseSettingsWorkspaceData = {
  metrics: {
    activeStores: number;
    activeRetailUsers: number;
    activeReceiptTemplates: number;
  };
  companyProfile: ReturnType<typeof readCompanyProfileSettings>;
  ldapSettings: LdapSettings;
  smtpSettings: SmtpSettings;
  smsSettings: SmsSettings;
  optionsSettings: OptionSettings;
  storeOptions: Array<{
    storeId: string;
    storeCode: string;
    storeName: string;
  }>;
  currencyOptions: Array<{
    currencyCode: string;
    label: string;
    isBaseCurrency: boolean;
  }>;
  postureMessages: string[];
  priorities: string[];
  statusMessage: string;
  refreshedAt: string;
};

export function buildUnavailableEnterpriseSettingsWorkspace(
  reason: string
): EnterpriseSettingsWorkspaceData {
  return {
    metrics: {
      activeStores: 0,
      activeRetailUsers: 0,
      activeReceiptTemplates: 0
    },
    companyProfile: {
      companyCode: "flash-retail",
      legalName: "Flash ERP",
      tradingName: "Flash ERP",
      companyLogoUrl: "",
      loginBackgroundImageUrl: "",
      documentNumberFormats: defaultDocumentNumberFormats,
      productSizes: [],
      posDiscountRates: [],
      posExpressChargeRates: [],
      salesOrderFulfilmentStoreId: "",
      phone: "",
      email: "",
      website: "",
      taxRegistrationNo: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      region: "",
      countryCode: "",
      postalCode: "",
      baseCurrencyCode: "USD",
      stockUpdateMode: STOCK_UPDATE_MODE_AUTO,
      stockUpdateModeLabel: formatStockUpdateMode(STOCK_UPDATE_MODE_AUTO),
      timezone: "UTC"
    },
    ldapSettings: defaultLdapSettings,
    smtpSettings: defaultSmtpSettings,
    smsSettings: defaultSmsSettings,
    optionsSettings: defaultOptionSettings,
    storeOptions: [],
    currencyOptions: [],
    postureMessages: [
      "Enterprise company and integration settings will appear here once Flash ERP can read the control-plane database."
    ],
    priorities: [
      "Start the Flash ERP enterprise database and confirm the primary enterprise node is active."
    ],
    statusMessage: reason,
    refreshedAt: new Date().toISOString()
  };
}

export async function getEnterpriseSettingsWorkspace(): Promise<EnterpriseSettingsWorkspaceData> {
  const enterpriseNode = await getEnterpriseSettingsContext();

  if (!enterpriseNode) {
    return buildUnavailableEnterpriseSettingsWorkspace(
      "No primary enterprise node is available yet, so Flash ERP cannot read enterprise settings."
    );
  }

  const [activeStores, activeRetailUsers, activeReceiptTemplates, storeOptions, currencyRows] =
    await Promise.all([
      prisma.store.count({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          status: RecordStatus.ACTIVE
        }
      }),
      prisma.retailUser.count({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          deletedAt: null,
          accountStatus: "ACTIVE"
        }
      }),
      prisma.receiptTemplate.count({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          status: RecordStatus.ACTIVE
        }
      }),
      prisma.store.findMany({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          status: RecordStatus.ACTIVE
        },
        orderBy: [{ name: "asc" }, { code: "asc" }],
        select: {
          id: true,
          code: true,
          name: true
        }
      }),
      prisma.erpCurrency.findMany({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          status: RecordStatus.ACTIVE
        },
        orderBy: [{ isBaseCurrency: "desc" }, { code: "asc" }],
        select: {
          code: true,
          name: true,
          isBaseCurrency: true
        }
      })
    ]);

  const companyProfile = readCompanyProfileSettings(
    enterpriseNode.retailOrg.companySettingsJson,
    enterpriseNode.retailOrg
  );
  const ldapSettings = readLdapSettings(enterpriseNode.retailOrg.ldapSettingsJson);
  const smtpSettings = readSmtpSettings(enterpriseNode.retailOrg.smtpSettingsJson);
  const smsSettings = readSmsSettings(enterpriseNode.retailOrg.smsSettingsJson);
  const optionsSettings = readOptionSettings(enterpriseNode.retailOrg.optionsSettingsJson);

  const priorities: string[] = [];

  if (!companyProfile.email) {
    priorities.push("Add a company email address so receipts and outbound notices use owned contact data.");
  }

  if (!smtpSettings.enabled) {
    priorities.push("Configure SMTP if Flash ERP should send password, report, or workflow emails.");
  }

  if (!smsSettings.enabled) {
    priorities.push("Configure SMS if Flash ERP should send branch or customer text notifications.");
  }

  if (priorities.length === 0) {
    priorities.push(
      "Enterprise settings posture looks healthy. The next strong slice is true authentication and integration delivery hardening."
    );
  }

  return {
    metrics: {
      activeStores,
      activeRetailUsers,
      activeReceiptTemplates
    },
    companyProfile,
    ldapSettings,
    smtpSettings,
    smsSettings,
    optionsSettings,
    storeOptions: storeOptions.map((store) => ({
      storeId: store.id,
      storeCode: store.code,
      storeName: store.name
    })),
    currencyOptions: currencyRows.map((currency) => ({
      currencyCode: currency.code,
      label: `${currency.code} - ${currency.name}`,
      isBaseCurrency: currency.isBaseCurrency
    })),
    postureMessages: [
      `${activeStores} active store(s), ${activeRetailUsers} active retail user(s), and ${activeReceiptTemplates} active receipt template(s) are currently governed from enterprise settings.`,
      ldapSettings.enabled
        ? "LDAP connectivity is enabled for enterprise-controlled identity integration."
        : "LDAP integration is currently disabled.",
      smtpSettings.enabled
        ? `SMTP is enabled through ${smtpSettings.host || "the configured mail host"}.`
        : "SMTP is currently disabled.",
      smsSettings.enabled
        ? `SMS is enabled through ${smsSettings.providerName || "the configured provider"}.`
        : "SMS is currently disabled."
    ],
    priorities,
    statusMessage: `Flash ERP enterprise is showing company, integration, and option settings from ${enterpriseNode.name}.`,
    refreshedAt: enterpriseNode.retailOrg.updatedAt.toISOString()
  };
}

export type UpdateEnterpriseCompanyProfileRequest = CompanyProfileSettings & {
  baseCurrencyCode: string;
  stockUpdateMode?: string | null;
  timezone: string;
};

export type UpdateEnterpriseCompanyMediaRequest = {
  companyLogoUrl?: string | null;
  loginBackgroundImageUrl?: string | null;
};

export type EnterprisePublicBranding = {
  legalName: string;
  tradingName: string;
  shopName: string | null;
  companyLogoUrl: string | null;
  loginBackgroundImageUrl: string | null;
};

export type UpdateEnterpriseLdapSettingsRequest = LdapSettings;
export type UpdateEnterpriseSmtpSettingsRequest = SmtpSettings;
export type UpdateEnterpriseSmsSettingsRequest = SmsSettings;
export type UpdateEnterpriseOptionSettingsRequest = OptionSettings;

export type EnterpriseSettingsMutationResponse = {
  message: string;
  serverProcessedAt: string;
};

export async function updateEnterpriseCompanyProfile(
  input: UpdateEnterpriseCompanyProfileRequest
): Promise<EnterpriseSettingsMutationResponse> {
  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const currentOrg = await getWritableRetailOrgSettings(tx, enterpriseNode.retailOrgId);
      const previousJson = readCompanyProfileSettings(currentOrg.companySettingsJson, currentOrg);
      const legalName = normalizeRequiredText(
        input.legalName ?? previousJson.legalName,
        "legal company name"
      );
      const tradingName = normalizeRequiredText(
        input.tradingName ?? previousJson.tradingName,
        "trading name"
      );
      const requestedBaseCurrencyCode = normalizeRequiredText(
        input.baseCurrencyCode ?? previousJson.baseCurrencyCode,
        "base currency code"
      ).toUpperCase();
      const configuredBaseCurrency = await tx.erpCurrency.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: requestedBaseCurrencyCode,
          status: RecordStatus.ACTIVE
        },
        select: {
          id: true,
          code: true
        }
      });

      if (!configuredBaseCurrency) {
        throw new Error("Choose an active currency from Multi Currency setup.");
      }

      const baseCurrencyCode = configuredBaseCurrency.code;
      const timezone = normalizeRequiredText(
        input.timezone ?? previousJson.timezone,
        "timezone"
      );
      const stockUpdateMode =
        input.stockUpdateMode === STOCK_UPDATE_MODE_HQ_CONFIRM
          ? STOCK_UPDATE_MODE_HQ_CONFIRM
          : STOCK_UPDATE_MODE_AUTO;
      const salesOrderFulfilmentStoreId =
        normalizeOptionalText(
          input.salesOrderFulfilmentStoreId ?? previousJson.salesOrderFulfilmentStoreId
        ) ?? "";

      if (salesOrderFulfilmentStoreId) {
        const fulfilmentStoreCount = await tx.store.count({
          where: {
            id: salesOrderFulfilmentStoreId,
            retailOrgId: enterpriseNode.retailOrgId,
            status: RecordStatus.ACTIVE
          }
        });

        if (fulfilmentStoreCount === 0) {
          throw new Error("Choose an active shop for sales order fulfilment routing.");
        }
      }

      const updatedJson = {
        companyCode: currentOrg.code,
        legalName,
        tradingName,
        companyLogoUrl:
          normalizeOptionalText(input.companyLogoUrl ?? previousJson.companyLogoUrl) ?? "",
        loginBackgroundImageUrl:
          normalizeOptionalText(
            input.loginBackgroundImageUrl ?? previousJson.loginBackgroundImageUrl
          ) ?? "",
        documentNumberFormats: normalizeDocumentNumberFormats(
          input.documentNumberFormats ?? previousJson.documentNumberFormats
        ),
        productSizes: normalizeProductSizes(input.productSizes ?? previousJson.productSizes),
        posDiscountRates: normalizePosDiscountRates(
          input.posDiscountRates ?? previousJson.posDiscountRates
        ),
        posExpressChargeRates: normalizePosDiscountRates(
          input.posExpressChargeRates ?? previousJson.posExpressChargeRates
        ),
        salesOrderFulfilmentStoreId,
        phone: normalizeOptionalText(input.phone ?? previousJson.phone) ?? "",
        email: normalizeOptionalText(input.email ?? previousJson.email) ?? "",
        website: normalizeOptionalText(input.website ?? previousJson.website) ?? "",
        taxRegistrationNo:
          normalizeOptionalText(input.taxRegistrationNo ?? previousJson.taxRegistrationNo) ?? "",
        addressLine1: normalizeOptionalText(input.addressLine1 ?? previousJson.addressLine1) ?? "",
        addressLine2: normalizeOptionalText(input.addressLine2 ?? previousJson.addressLine2) ?? "",
        city: normalizeOptionalText(input.city ?? previousJson.city) ?? "",
        region: normalizeOptionalText(input.region ?? previousJson.region) ?? "",
        countryCode: normalizeOptionalText(input.countryCode ?? previousJson.countryCode) ?? "",
        postalCode: normalizeOptionalText(input.postalCode ?? previousJson.postalCode) ?? "",
        baseCurrencyCode,
        stockUpdateMode,
        timezone
      };

      await tx.retailOrg.update({
        where: {
          id: enterpriseNode.retailOrgId
        },
        data: {
          name: legalName,
          baseCurrencyCode,
          timezone,
          stockUpdateMode,
          companySettingsJson: serializeJsonField(updatedJson)
        }
      });

      await tx.erpCurrency.updateMany({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          id: {
            not: configuredBaseCurrency.id
          }
        },
        data: {
          isBaseCurrency: false
        }
      });

      await tx.erpCurrency.update({
        where: {
          id: configuredBaseCurrency.id
        },
        data: {
          exchangeRateToBase: "1.000000",
          isBaseCurrency: true
        }
      });

      await tx.erpCompany.updateMany({
        where: {
          retailOrgId: enterpriseNode.retailOrgId
        },
        data: {
          baseCurrencyCode
        }
      });

      await tx.erpAccountingSettings.updateMany({
        where: {
          retailOrgId: enterpriseNode.retailOrgId
        },
        data: {
          baseCurrencyCode
        }
      });

      await writeSecurityLog(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        category: "SETTINGS",
        action: "COMPANY_UPDATED",
        actorLabel: "Enterprise settings",
        targetType: "Company",
        targetRef: legalName,
        sourceNodeCode: enterpriseNode.code,
        message: `Updated company profile for ${legalName}.`,
        details: buildUpdateAuditDetails(previousJson, updatedJson, {
          tradingName,
          baseCurrencyCode,
          stockUpdateMode,
          timezone
        })
      });

      return {
        message: "Flash ERP saved the company profile.",
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSettingsMutationError(error, "Flash ERP could not update the company profile.");
  }
}

export async function updateEnterpriseCompanyMedia(
  input: UpdateEnterpriseCompanyMediaRequest
): Promise<EnterpriseSettingsMutationResponse> {
  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const currentOrg = await getWritableRetailOrgSettings(tx, enterpriseNode.retailOrgId);
      const previousJson = readCompanyProfileSettings(currentOrg.companySettingsJson, currentOrg);
      const updatedJson = {
        ...previousJson,
        companyLogoUrl:
          input.companyLogoUrl === undefined
            ? previousJson.companyLogoUrl
            : (normalizeOptionalText(input.companyLogoUrl) ?? ""),
        loginBackgroundImageUrl:
          input.loginBackgroundImageUrl === undefined
            ? previousJson.loginBackgroundImageUrl
            : (normalizeOptionalText(input.loginBackgroundImageUrl) ?? "")
      };
      const changedFields = changedAuditFields(previousJson, updatedJson);

      await tx.retailOrg.update({
        where: {
          id: enterpriseNode.retailOrgId
        },
        data: {
          companySettingsJson: serializeJsonField(updatedJson)
        }
      });

      await writeSecurityLog(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        category: "SETTINGS",
        action: "COMPANY_MEDIA_UPDATED",
        actorLabel: "Enterprise settings",
        targetType: "Company",
        targetRef: previousJson.legalName,
        sourceNodeCode: enterpriseNode.code,
        message: "Updated company profile media.",
        details: toAuditJson({
          changedFields,
          changedFieldsLabel: changedFields.join(", "),
          companyLogoUpdated: input.companyLogoUrl !== undefined,
          loginBackgroundUpdated: input.loginBackgroundImageUrl !== undefined
        })
      });

      return {
        message: "Flash ERP saved the company profile media.",
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSettingsMutationError(error, "Flash ERP could not update the company profile media.");
  }
}

export async function getEnterprisePublicBranding(): Promise<EnterprisePublicBranding> {
  const enterpriseNode = await getEnterpriseSettingsContext();

  if (!enterpriseNode) {
    return {
      legalName: "Flash ERP",
      tradingName: "Flash ERP",
      shopName: null,
      companyLogoUrl: null,
      loginBackgroundImageUrl: null
    };
  }

  const companyProfile = readCompanyProfileSettings(
    enterpriseNode.retailOrg.companySettingsJson,
    enterpriseNode.retailOrg
  );
  const publicShop = await prisma.store.findFirst({
    where: {
      retailOrgId: enterpriseNode.retailOrgId,
      status: RecordStatus.ACTIVE
    },
    orderBy: [
      {
        openedOn: "asc"
      },
      {
        code: "asc"
      }
    ],
    select: {
      name: true,
      shortName: true
    }
  });
  const shopName =
    normalizeOptionalText(publicShop?.shortName) ??
    normalizeOptionalText(publicShop?.name);

  return {
    legalName: companyProfile.legalName,
    tradingName: companyProfile.tradingName || companyProfile.legalName,
    shopName,
    companyLogoUrl: companyProfile.companyLogoUrl.trim() || null,
    loginBackgroundImageUrl: companyProfile.loginBackgroundImageUrl.trim() || null
  };
}

export async function validateEnterpriseLdapSettings(
  input: Partial<UpdateEnterpriseLdapSettingsRequest> & ValidationOptions
): Promise<EnterpriseIntegrationValidationResponse> {
  const settings = normalizeLdapSettingsInput(input);
  const checks: EnterpriseIntegrationValidationResponse["checks"] = [];
  const endpoint = settings.serverUrl ? parseLdapEndpoint(settings.serverUrl) : null;

  if (!settings.enabled) {
    pushValidationCheck(checks, "Enabled", "WARN", "LDAP integration is currently disabled.");
    return finishValidationResponse("LDAP", false, checks, false);
  }

  if (!settings.serverUrl) {
    pushValidationCheck(checks, "Server URL", "FAIL", "LDAP needs a server URL.");
  } else if (!endpoint?.ok) {
    pushValidationCheck(
      checks,
      "Server URL",
      "FAIL",
      endpoint?.error ?? "Use a valid LDAP URL."
    );
  } else if (endpoint.ok) {
    pushValidationCheck(
      checks,
      "Server URL",
      "PASS",
      `LDAP endpoint resolves to ${endpoint.host}:${endpoint.port}.`
    );
  }

  pushValidationCheck(
    checks,
    "Base DN",
    looksLikeDistinguishedName(settings.baseDn) ? "PASS" : "FAIL",
    looksLikeDistinguishedName(settings.baseDn)
      ? "Base DN format looks valid."
      : "LDAP needs a base DN like dc=example,dc=com."
  );
  pushValidationCheck(
    checks,
    "Bind DN",
    looksLikeDistinguishedName(settings.bindDn) ? "PASS" : "FAIL",
    looksLikeDistinguishedName(settings.bindDn)
      ? "Bind DN format looks valid."
      : "LDAP needs a bind DN like cn=reader,dc=example,dc=com."
  );
  pushValidationCheck(
    checks,
    "Bind secret",
    settings.bindPasswordMask ? "PASS" : "FAIL",
    settings.bindPasswordMask
      ? "Bind secret is present."
      : "Enter the LDAP bind password before testing."
  );
  pushValidationCheck(
    checks,
    "User search",
    looksLikeDistinguishedName(settings.userSearchBase) &&
      looksLikeUserSearchFilter(settings.userSearchFilter)
      ? "PASS"
      : "FAIL",
    looksLikeDistinguishedName(settings.userSearchBase) &&
      looksLikeUserSearchFilter(settings.userSearchFilter)
      ? "User search base and username filter look valid."
      : "LDAP needs a valid user search base and a filter containing {{username}}."
  );

  if (input.attemptNetwork && endpoint?.ok) {
    const result = await probeTcpEndpoint({
      host: endpoint.host,
      port: endpoint.port,
      secure: endpoint.secure
    });
    pushValidationCheck(
      checks,
      "Network reachability",
      result.ok ? "PASS" : "FAIL",
      result.message
    );
  } else {
    pushValidationCheck(
      checks,
      "Network reachability",
      "FAIL",
      "Network probe was not run, so Flash ERP cannot mark LDAP as tested."
    );
  }

  return finishValidationResponse("LDAP", settings.enabled, checks, Boolean(input.attemptNetwork));
}

export async function validateEnterpriseSmtpSettings(
  input: Partial<UpdateEnterpriseSmtpSettingsRequest> & ValidationOptions
): Promise<EnterpriseIntegrationValidationResponse> {
  const settings = normalizeSmtpSettingsInput(input);
  const checks: EnterpriseIntegrationValidationResponse["checks"] = [];

  if (!settings.enabled) {
    pushValidationCheck(checks, "Enabled", "WARN", "SMTP integration is currently disabled.");
    return finishValidationResponse("SMTP", false, checks, false);
  }

  pushValidationCheck(
    checks,
    "Host",
    settings.host ? "PASS" : "FAIL",
    settings.host ? "SMTP host is present." : "SMTP needs a host."
  );
  pushValidationCheck(
    checks,
    "Port",
    settings.port > 0 && settings.port <= 65_535 ? "PASS" : "FAIL",
    settings.port > 0 && settings.port <= 65_535
      ? `SMTP port ${settings.port} is valid.`
      : "SMTP port must be between 1 and 65535."
  );
  pushValidationCheck(
    checks,
    "Sender address",
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.fromAddress) ? "PASS" : "FAIL",
    settings.fromAddress
      ? "Sender address format looks valid."
      : "SMTP needs a sender email address."
  );
  pushValidationCheck(
    checks,
    "Credential",
    settings.username && settings.passwordMask ? "PASS" : "FAIL",
    settings.username && settings.passwordMask
      ? "Username and password are present."
      : "Enter SMTP username and password before testing."
  );

  if (input.attemptNetwork && settings.host) {
    const result = await probeTcpEndpoint({
      host: settings.host,
      port: settings.port,
      secure: settings.secureConnection
    });
    pushValidationCheck(
      checks,
      "Network reachability",
      result.ok ? "PASS" : "FAIL",
      result.message
    );
  } else {
    pushValidationCheck(
      checks,
      "Network reachability",
      "FAIL",
      "Network probe was not run, so Flash ERP cannot mark SMTP as tested."
    );
  }

  return finishValidationResponse("SMTP", settings.enabled, checks, Boolean(input.attemptNetwork));
}

export async function validateEnterpriseSmsSettings(
  input: Partial<UpdateEnterpriseSmsSettingsRequest> & ValidationOptions
): Promise<EnterpriseIntegrationValidationResponse> {
  const settings = normalizeSmsSettingsInput(input);
  const checks: EnterpriseIntegrationValidationResponse["checks"] = [];
  let endpoint: URL | null = null;

  if (!settings.enabled) {
    pushValidationCheck(checks, "Enabled", "WARN", "SMS integration is currently disabled.");
    return finishValidationResponse("SMS", false, checks, false);
  }

  pushValidationCheck(
    checks,
    "Provider",
    settings.providerName ? "PASS" : "FAIL",
    settings.providerName ? "SMS provider name is present." : "SMS needs a provider name."
  );
  pushValidationCheck(
    checks,
    "Sender ID",
    settings.senderId ? "PASS" : "FAIL",
    settings.senderId ? "Sender ID is present." : "SMS needs a sender ID."
  );

  try {
    endpoint = settings.apiBaseUrl ? new URL(settings.apiBaseUrl) : null;
  } catch {
    endpoint = null;
  }

  pushValidationCheck(
    checks,
    "API base URL",
    endpoint && (endpoint.protocol === "https:" || endpoint.protocol === "http:") ? "PASS" : "FAIL",
    endpoint && (endpoint.protocol === "https:" || endpoint.protocol === "http:")
      ? "SMS API base URL is valid."
      : "SMS needs a valid http:// or https:// API base URL."
  );
  pushValidationCheck(
    checks,
    "API credential",
    settings.apiKeyMask ? "PASS" : "FAIL",
    settings.apiKeyMask ? "API key is present." : "Enter the SMS API key before testing."
  );
  pushValidationCheck(
    checks,
    "Sale template",
    !settings.saleSmsEnabled || /\{+\s*(shop|shopName|store|storeName)\s*\}+/i.test(settings.saleSmsTemplate)
      ? "PASS"
      : "FAIL",
    !settings.saleSmsEnabled || /\{+\s*(shop|shopName|store|storeName)\s*\}+/i.test(settings.saleSmsTemplate)
      ? "Sale SMS template can resolve the shop name."
      : "Sale SMS template needs a shop placeholder such as {shopName}."
  );

  if (input.attemptNetwork && endpoint) {
    const result = await probeHttpEndpoint(endpoint.toString());
    pushValidationCheck(
      checks,
      "Network reachability",
      result.ok ? "PASS" : "FAIL",
      result.message
    );
  } else {
    pushValidationCheck(
      checks,
      "Network reachability",
      "FAIL",
      "Network probe was not run, so Flash ERP cannot mark SMS as tested."
    );
  }

  return finishValidationResponse("SMS", settings.enabled, checks, Boolean(input.attemptNetwork));
}

export async function updateEnterpriseLdapSettings(
  input: UpdateEnterpriseLdapSettingsRequest
): Promise<EnterpriseSettingsMutationResponse> {
  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const payload: LdapSettings = {
        enabled: Boolean(input.enabled),
        serverUrl: input.serverUrl?.trim() ?? "",
        baseDn: input.baseDn?.trim() ?? "",
        bindDn: input.bindDn?.trim() ?? "",
        bindPasswordMask: input.bindPasswordMask?.trim() ?? "",
        userSearchBase: input.userSearchBase?.trim() ?? "",
        userSearchFilter: input.userSearchFilter?.trim() || "(uid={{username}})",
        startTls: Boolean(input.startTls),
        syncEnabled: Boolean(input.syncEnabled)
      };
      const currentOrg = await getWritableRetailOrgSettings(tx, enterpriseNode.retailOrgId);
      const previousSettings = readLdapSettings(currentOrg.ldapSettingsJson);
      const previousJson = {
        ...previousSettings,
        bindPasswordMask: previousSettings.bindPasswordMask ? "***" : ""
      };
      const updatedJson = {
        ...payload,
        bindPasswordMask: payload.bindPasswordMask ? "***" : ""
      };

      await tx.retailOrg.update({
        where: {
          id: enterpriseNode.retailOrgId
        },
        data: {
          ldapSettingsJson: serializeJsonField(payload)
        }
      });

      await writeSecurityLog(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        category: "SETTINGS",
        action: "LDAP_UPDATED",
        actorLabel: "Enterprise settings",
        targetType: "LDAP",
        targetRef: payload.serverUrl || "default",
        sourceNodeCode: enterpriseNode.code,
        message: payload.enabled
          ? "Updated LDAP integration settings."
          : "Disabled LDAP integration settings.",
        details: buildUpdateAuditDetails(previousJson, updatedJson, {
          enabled: payload.enabled,
          syncEnabled: payload.syncEnabled,
          serverUrl: payload.serverUrl
        })
      });

      await writeSecurityLog(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.SECURITY,
        severity: payload.enabled ? SecurityLogSeverity.INFO : SecurityLogSeverity.WARNING,
        category: "LDAP",
        action: payload.enabled ? "DIRECTORY_POLICY_UPDATED" : "DIRECTORY_POLICY_DISABLED",
        actorLabel: "Enterprise settings",
        targetType: "LDAP",
        targetRef: payload.serverUrl || "default",
        sourceNodeCode: enterpriseNode.code,
        message: payload.enabled
          ? `LDAP identity integration is enabled${payload.syncEnabled ? " with directory sync." : "."}`
          : "LDAP identity integration was disabled.",
        details: {
          enabled: payload.enabled,
          syncEnabled: payload.syncEnabled,
          startTls: payload.startTls,
          serverUrl: payload.serverUrl
        }
      });

      return {
        message: "Flash ERP saved the LDAP settings.",
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSettingsMutationError(error, "Flash ERP could not update the LDAP settings.");
  }
}

export async function updateEnterpriseSmtpSettings(
  input: UpdateEnterpriseSmtpSettingsRequest
): Promise<EnterpriseSettingsMutationResponse> {
  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const payload: SmtpSettings = {
        enabled: Boolean(input.enabled),
        host: input.host?.trim() ?? "",
        port: Math.max(1, Math.trunc(Number(input.port ?? defaultSmtpSettings.port))),
        secureConnection: Boolean(input.secureConnection),
        username: input.username?.trim() ?? "",
        passwordMask: input.passwordMask?.trim() ?? "",
        fromName: input.fromName?.trim() ?? "",
        fromAddress: input.fromAddress?.trim() ?? "",
        replyToAddress: input.replyToAddress?.trim() ?? ""
      };
      const currentOrg = await getWritableRetailOrgSettings(tx, enterpriseNode.retailOrgId);
      const previousSettings = readSmtpSettings(currentOrg.smtpSettingsJson);
      const previousJson = {
        ...previousSettings,
        passwordMask: previousSettings.passwordMask ? "***" : ""
      };
      const updatedJson = {
        ...payload,
        passwordMask: payload.passwordMask ? "***" : ""
      };

      await tx.retailOrg.update({
        where: {
          id: enterpriseNode.retailOrgId
        },
        data: {
          smtpSettingsJson: serializeJsonField(payload)
        }
      });

      await writeSecurityLog(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        category: "SETTINGS",
        action: "SMTP_UPDATED",
        actorLabel: "Enterprise settings",
        targetType: "SMTP",
        targetRef: payload.host || "default",
        sourceNodeCode: enterpriseNode.code,
        message: payload.enabled ? "Updated SMTP settings." : "Disabled SMTP settings.",
        details: buildUpdateAuditDetails(previousJson, updatedJson, {
          enabled: payload.enabled,
          host: payload.host,
          port: payload.port
        })
      });

      return {
        message: "Flash ERP saved the SMTP settings.",
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSettingsMutationError(error, "Flash ERP could not update the SMTP settings.");
  }
}

export async function updateEnterpriseSmsSettings(
  input: UpdateEnterpriseSmsSettingsRequest
): Promise<EnterpriseSettingsMutationResponse> {
  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const currentOrg = await getWritableRetailOrgSettings(tx, enterpriseNode.retailOrgId);
      const previousSettings = readSmsSettings(currentOrg.smsSettingsJson);
      const submittedApiKey = input.apiKeyMask?.trim() ?? "";
      const payload: SmsSettings = {
        enabled: Boolean(input.enabled),
        saleSmsEnabled: Boolean(input.saleSmsEnabled),
        saleSmsTemplate: input.saleSmsTemplate?.trim() || defaultSaleSmsTemplate,
        providerName: input.providerName?.trim() ?? "",
        senderId: input.senderId?.trim() ?? "",
        apiBaseUrl: input.apiBaseUrl?.trim() ?? "",
        username: input.username?.trim() ?? "",
        apiKeyMask:
          submittedApiKey && !/^\*+$/.test(submittedApiKey)
            ? submittedApiKey
            : previousSettings.apiKeyMask,
        defaultCountryCode: input.defaultCountryCode?.trim() || "GH",
        deliveryReportEnabled: Boolean(input.deliveryReportEnabled)
      };
      const previousJson = {
        ...previousSettings,
        apiKeyMask: previousSettings.apiKeyMask ? "***" : ""
      };
      const updatedJson = {
        ...payload,
        apiKeyMask: payload.apiKeyMask ? "***" : ""
      };

      await tx.retailOrg.update({
        where: {
          id: enterpriseNode.retailOrgId
        },
        data: {
          smsSettingsJson: serializeJsonField(payload)
        }
      });

      await writeSecurityLog(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        category: "SETTINGS",
        action: "SMS_UPDATED",
        actorLabel: "Enterprise settings",
        targetType: "SMS",
        targetRef: payload.providerName || "default",
        sourceNodeCode: enterpriseNode.code,
        message: payload.enabled ? "Updated SMS settings." : "Disabled SMS settings.",
        details: buildUpdateAuditDetails(previousJson, updatedJson, {
          enabled: payload.enabled,
          providerName: payload.providerName,
          deliveryReportEnabled: payload.deliveryReportEnabled
        })
      });

      return {
        message: "Flash ERP saved the SMS settings.",
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSettingsMutationError(error, "Flash ERP could not update the SMS settings.");
  }
}

export async function updateEnterpriseOptionSettings(
  input: UpdateEnterpriseOptionSettingsRequest
): Promise<EnterpriseSettingsMutationResponse> {
  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const requestedExpiryAlertLeadDays = Number(input.expiryAlertLeadDays ?? 30);
      const expiryAlertLeadDays = Math.min(
        3650,
        Math.max(
          1,
          Math.trunc(
            Number.isFinite(requestedExpiryAlertLeadDays)
              ? requestedExpiryAlertLeadDays
              : 30
          )
        )
      );
      const requestedExpiryCriticalDays = Number(input.expiryCriticalDays ?? 7);
      const payload: OptionSettings = {
        allowNegativeInventory: Boolean(input.allowNegativeInventory),
        allowOfflineSales: Boolean(input.allowOfflineSales),
        autoPrintReceipts: Boolean(input.autoPrintReceipts),
        enforceSerializedScanAtPos: Boolean(input.enforceSerializedScanAtPos),
        requireCustomerForCreditSales: Boolean(input.requireCustomerForCreditSales),
        requireSupervisorForReceiptlessReturn: Boolean(input.requireSupervisorForReceiptlessReturn),
        showCriticalStocksOnStartup: Boolean(input.showCriticalStocksOnStartup),
        showExpiringBatchesOnStartup:
          input.showExpiringBatchesOnStartup !== false,
        expiryAlertLeadDays,
        expiryCriticalDays: Math.min(
          expiryAlertLeadDays,
          Math.max(
            0,
            Math.trunc(
              Number.isFinite(requestedExpiryCriticalDays)
                ? requestedExpiryCriticalDays
                : 7
            )
          )
        ),
        defaultReceiptSearchDays: Math.max(1, Math.trunc(Number(input.defaultReceiptSearchDays ?? 30))),
        shiftFloatPromptAmount: Number(
          Number(input.shiftFloatPromptAmount ?? 0).toFixed(2)
        )
      };
      const currentOrg = await getWritableRetailOrgSettings(tx, enterpriseNode.retailOrgId);
      const previousJson = readOptionSettings(currentOrg.optionsSettingsJson);

      await tx.retailOrg.update({
        where: {
          id: enterpriseNode.retailOrgId
        },
        data: {
          optionsSettingsJson: serializeJsonField(payload)
        }
      });

      await writeSecurityLog(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        category: "SETTINGS",
        action: "OPTIONS_UPDATED",
        actorLabel: "Enterprise settings",
        targetType: "Options",
        targetRef: "retail-defaults",
        sourceNodeCode: enterpriseNode.code,
        message: "Updated enterprise operational options.",
        details: buildUpdateAuditDetails(previousJson, payload, {
          allowOfflineSales: payload.allowOfflineSales,
          allowNegativeInventory: payload.allowNegativeInventory
        })
      });

      return {
        message: "Flash ERP saved the options.",
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSettingsMutationError(error, "Flash ERP could not update the options.");
  }
}
