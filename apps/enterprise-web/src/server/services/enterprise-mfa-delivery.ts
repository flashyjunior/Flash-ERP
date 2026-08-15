import { Prisma } from "@prisma/client";
import nodemailer from "nodemailer";
import { readJsonObject, serializeJsonField } from "../repositories/json-field";

import { prisma } from "@/lib/db/prisma";
import { SecurityLogKind, SecurityLogSeverity } from "@flash-erp/domain";


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
  providerName: string;
  senderId: string;
  apiBaseUrl: string;
  username: string;
  apiKeyMask: string;
  defaultCountryCode: string;
  deliveryReportEnabled: boolean;
};

type MfaDeliveryChannel = "SMTP" | "SMS" | "DEVELOPMENT";
type MfaDeliveryStatus = "DELIVERED" | "SKIPPED" | "FAILED";

export type EnterpriseMfaDeliveryResult = {
  status: MfaDeliveryStatus;
  channel: MfaDeliveryChannel;
  deliveryHint: string;
  message: string;
};

type EnterpriseMfaDeliveryInput = {
  retailOrgId: string;
  sourceNodeCode: string;
  loginId: string;
  displayName: string;
  email: string | null;
  phone?: string | null;
  code: string;
  expiresAt: Date;
  experience?: "ENTERPRISE" | "ECOMMERCE";
};

const defaultSmtpSettings: SmtpSettings = {
  enabled: false,
  host: "",
  port: 587,
  secureConnection: false,
  username: "",
  passwordMask: "",
  fromName: "",
  fromAddress: "",
  replyToAddress: ""
};

const defaultSmsSettings: SmsSettings = {
  enabled: false,
  providerName: "",
  senderId: "",
  apiBaseUrl: "",
  username: "",
  apiKeyMask: "",
  defaultCountryCode: "GH",
  deliveryReportEnabled: false
};

function readObject(value: unknown) {
  return readJsonObject(value) as Record<string, Prisma.JsonValue>;
}

function readString(
  payload: Record<string, Prisma.JsonValue>,
  key: string,
  fallback = ""
) {
  const value = payload[key];
  return typeof value === "string" ? value : fallback;
}

function readNumber(
  payload: Record<string, Prisma.JsonValue>,
  key: string,
  fallback: number
) {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBoolean(
  payload: Record<string, Prisma.JsonValue>,
  key: string,
  fallback: boolean
) {
  const value = payload[key];
  return typeof value === "boolean" ? value : fallback;
}

function readSmtpSettings(value: Prisma.JsonValue | null | undefined): SmtpSettings {
  const payload = readObject(value);

  return {
    enabled: readBoolean(payload, "enabled", defaultSmtpSettings.enabled),
    host: readString(payload, "host", defaultSmtpSettings.host),
    port: Math.max(1, Math.trunc(readNumber(payload, "port", defaultSmtpSettings.port))),
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

function shouldSendExternally() {
  return process.env.NODE_ENV === "production" || process.env.FLASH_ERP_MFA_DELIVERY_MODE === "external";
}

function maskEmail(email: string | null | undefined) {
  const normalized = email?.trim() ?? "";

  if (!normalized || !normalized.includes("@")) {
    return "configured email channel";
  }

  const [name, domain] = normalized.split("@");
  const visibleName = name.length <= 2 ? `${name[0] ?? ""}*` : `${name.slice(0, 2)}***`;
  return `${visibleName}@${domain}`;
}

function maskPhone(phone: string | null | undefined) {
  const digits = phone?.replace(/\D/g, "") ?? "";

  if (digits.length < 4) {
    return "configured SMS channel";
  }

  return `***${digits.slice(-4)}`;
}

function buildMfaMessage(input: EnterpriseMfaDeliveryInput) {
  if (input.experience === "ECOMMERCE") {
    return `Your Flash ERP shop verification code is ${input.code}. It expires at ${input.expiresAt.toISOString()}.`;
  }

  return `Your Flash ERP enterprise MFA code is ${input.code}. It expires at ${input.expiresAt.toISOString()}.`;
}

async function writeMfaDeliveryLog(
  input: EnterpriseMfaDeliveryInput,
  result: EnterpriseMfaDeliveryResult,
  details?: Prisma.InputJsonValue
) {
  await prisma.securityLog.create({
    data: {
      retailOrgId: input.retailOrgId,
      kind: SecurityLogKind.SECURITY,
      severity:
        result.status === "DELIVERED"
          ? SecurityLogSeverity.INFO
          : result.status === "SKIPPED"
            ? SecurityLogSeverity.WARNING
            : SecurityLogSeverity.ERROR,
      category: "Authentication",
      action:
        result.status === "DELIVERED"
          ? "auth.mfa.delivery.succeeded"
          : result.status === "SKIPPED"
            ? "auth.mfa.delivery.skipped"
            : "auth.mfa.delivery.failed",
      actorLabel: input.loginId,
      targetType: input.experience === "ECOMMERCE" ? "Ecommerce customer" : "Retail user",
      targetRef: input.loginId,
      sourceNodeCode: input.sourceNodeCode,
      message: result.message,
      detailsJson: serializeJsonField({
        channel: result.channel,
        deliveryHint: result.deliveryHint,
        expiresAt: input.expiresAt.toISOString(),
        ...(details && typeof details === "object" ? details : {})
      })
    }
  });
}

async function sendEmailMfaCode(
  input: EnterpriseMfaDeliveryInput,
  settings: SmtpSettings
): Promise<EnterpriseMfaDeliveryResult> {
  if (!settings.enabled || !settings.host || !settings.fromAddress || !input.email) {
    return {
      status: "SKIPPED",
      channel: "SMTP",
      deliveryHint: maskEmail(input.email),
      message: `MFA email delivery was skipped for ${input.loginId}; SMTP or recipient email is not configured.`
    };
  }

  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secureConnection,
    auth:
      settings.username && settings.passwordMask
        ? {
            user: settings.username,
            pass: settings.passwordMask
          }
        : undefined
  });
  const fromName = settings.fromName || "Flash ERP";
  const replyTo = settings.replyToAddress || undefined;

  await transporter.sendMail({
    from: `"${fromName.replace(/"/g, "'")}" <${settings.fromAddress}>`,
    to: input.email,
    replyTo,
    subject:
      input.experience === "ECOMMERCE"
        ? "Your Flash ERP shop verification code"
        : "Your Flash ERP MFA code",
    text: [
      `Hello ${input.displayName || input.loginId},`,
      "",
      buildMfaMessage(input),
      "",
      input.experience === "ECOMMERCE"
        ? "If you did not request this code, you can safely ignore this message."
        : "If you did not request this sign-in, contact your Flash ERP administrator immediately."
    ].join("\n"),
    html: [
      `<p>Hello ${escapeHtml(input.displayName || input.loginId)},</p>`,
      `<p>${input.experience === "ECOMMERCE" ? "Your Flash ERP shop verification code" : "Your Flash ERP enterprise MFA code"} is <strong>${input.code}</strong>.</p>`,
      `<p>It expires at ${input.expiresAt.toISOString()}.</p>`,
      input.experience === "ECOMMERCE"
        ? "<p>If you did not request this code, you can safely ignore this message.</p>"
        : "<p>If you did not request this sign-in, contact your Flash ERP administrator immediately.</p>"
    ].join("")
  });

  return {
    status: "DELIVERED",
    channel: "SMTP",
    deliveryHint: maskEmail(input.email),
    message: `MFA code was delivered by SMTP to ${maskEmail(input.email)} for ${input.loginId}.`
  };
}

async function sendSmsMfaCode(
  input: EnterpriseMfaDeliveryInput,
  settings: SmsSettings
): Promise<EnterpriseMfaDeliveryResult> {
  const recipient = input.phone?.trim() || process.env.FLASH_ERP_MFA_SMS_TO?.trim() || "";

  if (!settings.enabled || !settings.apiBaseUrl || !settings.apiKeyMask || !recipient) {
    return {
      status: "SKIPPED",
      channel: "SMS",
      deliveryHint: maskPhone(recipient),
      message: `MFA SMS delivery was skipped for ${input.loginId}; SMS provider or recipient number is not configured.`
    };
  }

  const response = await fetch(settings.apiBaseUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${settings.apiKeyMask}`,
      "x-api-key": settings.apiKeyMask
    },
    body: JSON.stringify({
      provider: settings.providerName,
      username: settings.username || undefined,
      senderId: settings.senderId || "FlashERP",
      to: recipient,
      message: buildMfaMessage(input),
      deliveryReportEnabled: settings.deliveryReportEnabled
    })
  });

  if (!response.ok) {
    throw new Error(`SMS provider returned HTTP ${response.status}.`);
  }

  return {
    status: "DELIVERED",
    channel: "SMS",
    deliveryHint: maskPhone(recipient),
    message: `MFA code was delivered by SMS to ${maskPhone(recipient)} for ${input.loginId}.`
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function deliverEnterpriseMfaCode(
  input: EnterpriseMfaDeliveryInput
): Promise<EnterpriseMfaDeliveryResult> {
  if (!shouldSendExternally()) {
    const result: EnterpriseMfaDeliveryResult = {
      status: "SKIPPED",
      channel: "DEVELOPMENT",
      deliveryHint: "development sign-in screen",
      message: `MFA external delivery was skipped for ${input.loginId} outside production.`
    };

    await writeMfaDeliveryLog(input, result, {
      reason: "NON_PRODUCTION_DELIVERY_MODE"
    });
    return result;
  }

  const retailOrg = await prisma.retailOrg.findUnique({
    where: {
      id: input.retailOrgId
    },
    select: {
      smtpSettingsJson: true,
      smsSettingsJson: true
    }
  });
  const smtpSettings = readSmtpSettings(retailOrg?.smtpSettingsJson);
  const smsSettings = readSmsSettings(retailOrg?.smsSettingsJson);
  const deliveryAttempts = [
    {
      channel: "SMTP" as const,
      run: () => sendEmailMfaCode(input, smtpSettings)
    },
    {
      channel: "SMS" as const,
      run: () => sendSmsMfaCode(input, smsSettings)
    }
  ];
  const skipped: EnterpriseMfaDeliveryResult[] = [];

  for (const attempt of deliveryAttempts) {
    try {
      const result = await attempt.run();

      if (result.status === "DELIVERED") {
        await writeMfaDeliveryLog(input, result, {
          provider:
            result.channel === "SMTP"
              ? smtpSettings.host
              : smsSettings.providerName || smsSettings.apiBaseUrl
        });
        return result;
      }

      skipped.push(result);
    } catch (error) {
      const result: EnterpriseMfaDeliveryResult = {
        status: "FAILED",
        channel: attempt.channel,
        deliveryHint: attempt.channel === "SMTP" ? maskEmail(input.email) : maskPhone(input.phone),
        message:
          error instanceof Error
            ? `MFA ${attempt.channel} delivery failed for ${input.loginId}: ${error.message}`
            : `MFA ${attempt.channel} delivery failed for ${input.loginId}.`
      };

      await writeMfaDeliveryLog(input, result);
      return result;
    }
  }

  const firstSkipped = skipped[0] ?? {
    status: "SKIPPED" as const,
    channel: "DEVELOPMENT" as const,
    deliveryHint: "configured MFA channel",
    message: `MFA delivery was skipped for ${input.loginId}; no delivery provider is configured.`
  };
  const result: EnterpriseMfaDeliveryResult = {
    ...firstSkipped,
    message: `MFA delivery was skipped for ${input.loginId}; configure SMTP recipient email or SMS recipient delivery.`
  };

  await writeMfaDeliveryLog(input, result, {
    smtpEnabled: smtpSettings.enabled,
    smsEnabled: smsSettings.enabled
  });
  return result;
}
