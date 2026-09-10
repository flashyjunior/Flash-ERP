import crypto from "node:crypto";

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

export type EnterprisePasswordResetDeliveryResult = {
  status: "DELIVERED" | "SKIPPED" | "FAILED";
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

type EnterprisePasswordResetDeliveryInput = {
  retailOrgId: string;
  sourceNodeCode: string;
  userId: string;
  loginId: string;
  displayName: string;
  email: string | null;
  resetLink: string;
  expiresAt: Date;
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

async function deliverTrialPasswordResetLink(
  input: EnterprisePasswordResetDeliveryInput
): Promise<EnterprisePasswordResetDeliveryResult> {
  const requestId = process.env.FLASH_ERP_TRIAL_CONTROL_PLANE_REQUEST_ID?.trim();
  const workspaceSecret = process.env.FLASH_ERP_TRIAL_WORKSPACE_SECRET?.trim();
  const controlPlaneUrl =
    process.env.FLASH_ERP_TRIAL_CONTROL_PLANE_URL?.trim() || "http://127.0.0.1:3000";
  if (!requestId || !workspaceSecret) {
    throw new Error("The trial workspace password-reset relay is not configured.");
  }

  const body = JSON.stringify({
    version: 1,
    requestId,
    userId: input.userId,
    loginId: input.loginId,
    email: input.email,
    resetLink: input.resetLink,
    expiresAt: input.expiresAt.toISOString()
  });
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", workspaceSecret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const response = await fetch(new URL("/api/trials/password-reset-delivery", controlPlaneUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-flash-timestamp": timestamp,
      "x-flash-signature": signature
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(result?.message || `The trial password-reset relay returned HTTP ${response.status}.`);
  }

  return {
    status: "DELIVERED",
    deliveryHint: maskEmail(input.email),
    message: `Password reset instructions were delivered by the trial control plane to ${maskEmail(input.email)} for ${input.loginId}.`
  };
}

async function writePasswordResetDeliveryLog(
  input: EnterprisePasswordResetDeliveryInput,
  result: EnterprisePasswordResetDeliveryResult,
  provider?: string
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
          ? "auth.password-reset.delivery.succeeded"
          : result.status === "SKIPPED"
            ? "auth.password-reset.delivery.skipped"
            : "auth.password-reset.delivery.failed",
      actorLabel: "Self-service recovery",
      targetType: "Retail user",
      targetRef: input.loginId,
      sourceNodeCode: input.sourceNodeCode,
      message: result.message,
      detailsJson: serializeJsonField({
        channel: "SMTP",
        deliveryHint: result.deliveryHint,
        expiresAt: input.expiresAt.toISOString(),
        ...(provider ? { provider } : {})
      })
    }
  });
}

export async function deliverEnterprisePasswordResetLink(
  input: EnterprisePasswordResetDeliveryInput
): Promise<EnterprisePasswordResetDeliveryResult> {
  if (process.env.FLASH_ERP_TRIAL_WORKSPACE_MODE === "true") {
    try {
      const result = await deliverTrialPasswordResetLink(input);
      await writePasswordResetDeliveryLog(input, result, "trial-control-plane");
      return result;
    } catch (error) {
      const result: EnterprisePasswordResetDeliveryResult = {
        status: "FAILED",
        deliveryHint: maskEmail(input.email),
        message:
          error instanceof Error
            ? `Password reset email delivery failed for ${input.loginId}: ${error.message}`
            : `Password reset email delivery failed for ${input.loginId}.`
      };
      await writePasswordResetDeliveryLog(input, result, "trial-control-plane");
      return result;
    }
  }

  if (!shouldSendExternally()) {
    return {
      status: "SKIPPED",
      deliveryHint: "development recovery page",
      message: `Password reset email delivery was skipped for ${input.loginId} outside production.`
    };
  }

  const retailOrg = await prisma.retailOrg.findUnique({
    where: { id: input.retailOrgId },
    select: { smtpSettingsJson: true }
  });
  const settings = readSmtpSettings(retailOrg?.smtpSettingsJson);
  const deliveryHint = maskEmail(input.email);

  if (!settings.enabled || !settings.host || !settings.fromAddress || !input.email) {
    const result: EnterprisePasswordResetDeliveryResult = {
      status: "SKIPPED",
      deliveryHint,
      message: `Password reset email delivery was skipped for ${input.loginId}; SMTP or the account email is not configured.`
    };
    await writePasswordResetDeliveryLog(input, result);
    return result;
  }

  try {
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
    const expiryLabel = input.expiresAt.toISOString();

    await transporter.sendMail({
      from: `"${fromName.replace(/"/g, "'")}" <${settings.fromAddress}>`,
      to: input.email,
      replyTo: settings.replyToAddress || undefined,
      subject: `Reset your Flash ERP password for ${input.loginId}`,
      text: [
        `Hello ${input.displayName || input.loginId},`,
        "",
        "A password reset was requested for your Flash ERP Enterprise account.",
        `Login ID: ${input.loginId}`,
        "",
        `Reset your password: ${input.resetLink}`,
        "",
        `This link expires at ${expiryLabel} and becomes invalid after your password changes.`,
        "If you did not request this reset, you can safely ignore this email."
      ].join("\n"),
      html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #dbe4ee;border-radius:8px;overflow:hidden;">
            <tr><td style="background:#0f766e;padding:22px 28px;color:#ffffff;font-size:22px;font-weight:700;">Flash ERP</td></tr>
            <tr>
              <td style="padding:30px 28px;">
                <h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;">Reset your password</h1>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#475569;">Hello ${escapeHtml(input.displayName || input.loginId)}, a password reset was requested for your Enterprise account.</p>
                <div style="margin:0 0 22px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
                  <div style="font-size:12px;color:#64748b;text-transform:uppercase;">Login ID</div>
                  <div style="margin-top:5px;font-size:16px;font-weight:700;">${escapeHtml(input.loginId)}</div>
                </div>
                <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="border-radius:6px;background:#0f766e;"><a href="${escapeHtml(input.resetLink)}" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Reset password</a></td></tr></table>
                <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#64748b;">This secure link expires at ${escapeHtml(expiryLabel)} and becomes invalid after your password changes.</p>
                <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#64748b;">If you did not request this reset, you can safely ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
    });

    const result: EnterprisePasswordResetDeliveryResult = {
      status: "DELIVERED",
      deliveryHint,
      message: `Password reset instructions were delivered by SMTP to ${deliveryHint} for ${input.loginId}.`
    };
    await writePasswordResetDeliveryLog(input, result, settings.host);
    return result;
  } catch (error) {
    const result: EnterprisePasswordResetDeliveryResult = {
      status: "FAILED",
      deliveryHint,
      message:
        error instanceof Error
          ? `Password reset email delivery failed for ${input.loginId}: ${error.message}`
          : `Password reset email delivery failed for ${input.loginId}.`
    };
    await writePasswordResetDeliveryLog(input, result, settings.host);
    return result;
  }
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
