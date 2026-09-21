import crypto from "node:crypto";

import { headers } from "next/headers";

import { prisma } from "@/lib/db/prisma";
import { deliverEnterpriseMfaCode } from "@/server/services/enterprise-mfa-delivery";

const OTP_LIFETIME_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const STATUS_TOKEN_LIFETIME_HOURS = 24;
const TRIAL_DAYS = 14;
const ACTIVE_REQUEST_STATUSES = [
  "PENDING_VERIFICATION",
  "VERIFIED",
  "AWAITING_PROVISIONER",
  "PROVISIONING",
  "ACTIVE"
];

const BUSINESS_TYPES = new Set([
  "RETAIL",
  "SUPERMARKET_GROCERY",
  "WHOLESALE_DISTRIBUTION",
  "PHARMACY_HEALTH",
  "FASHION",
  "FUEL_STATION",
  "HOSPITALITY",
  "OTHER"
]);

const EMPLOYEE_RANGES = new Set(["1_5", "6_20", "21_50", "51_100", "101_PLUS"]);

export class TrialSignupError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "TRIAL_SIGNUP_INVALID") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type TrialSignupPayload = {
  companyName?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
  countryCode?: unknown;
  city?: unknown;
  businessType?: unknown;
  branchCount?: unknown;
  employeeCountRange?: unknown;
  preferredSlug?: unknown;
  marketingConsent?: unknown;
  termsAccepted?: unknown;
  turnstileToken?: unknown;
  website?: unknown;
};

type TrialProvisioningCallback = {
  requestId?: unknown;
  provisioningRequestKey?: unknown;
  status?: unknown;
  provisionerReference?: unknown;
  workspaceUrl?: unknown;
  onlineStoreUrl?: unknown;
  storefrontUrl?: unknown;
  trialStartsAt?: unknown;
  trialExpiresAt?: unknown;
  failureCode?: unknown;
  failureMessage?: unknown;
  lifecycleAction?: unknown;
  workspaceSlug?: unknown;
  workspaceDatabaseName?: unknown;
  workspacePort?: unknown;
  ownerLoginId?: unknown;
  activationSentAt?: unknown;
};

function optionalText(value: unknown, maximumLength = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maximumLength);
}

function requiredText(value: unknown, label: string, maximumLength = 200) {
  const result = optionalText(value, maximumLength);
  if (!result) throw new TrialSignupError(`${label} is required.`);
  return result;
}

function normalizeEmail(value: unknown) {
  const email = requiredText(value, "Work email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new TrialSignupError("Enter a valid work email address.");
  }
  return email;
}

function normalizePhone(value: unknown) {
  const phone = requiredText(value, "Phone number", 40);
  const normalized = phone.replace(/[\s()-]/g, "");
  if (!/^\+?[0-9]{9,15}$/.test(normalized)) {
    throw new TrialSignupError("Enter a valid phone number including the country code.");
  }
  return phone;
}

function normalizeSlug(value: unknown) {
  const slug = optionalText(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return slug.length >= 3 ? slug : null;
}

function signupSecret() {
  const configured =
    process.env.FLASH_ERP_TRIAL_SIGNUP_SECRET?.trim() ||
    process.env.FLASH_ERP_AUTH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new TrialSignupError(
      "Trial registration is temporarily unavailable.",
      503,
      "TRIAL_SECRET_UNAVAILABLE"
    );
  }
  return "flash-erp-trial-development-secret";
}

function secureEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hashOtp(requestId: string, email: string, code: string) {
  return crypto
    .createHmac("sha256", signupSecret())
    .update(`${requestId}:${email}:${code}`)
    .digest("hex");
}

function hashClientIdentity(value: string) {
  return crypto.createHmac("sha256", signupSecret()).update(value).digest("hex");
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function requestNumber(now: Date) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `TRIAL-${date}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function statusToken(requestId: string) {
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      requestId,
      exp: Date.now() + STATUS_TOKEN_LIFETIME_HOURS * 60 * 60_000
    })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", signupSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readStatusToken(token: unknown) {
  const [payload, suppliedSignature] = optionalText(token, 3000).split(".");
  if (!payload || !suppliedSignature) {
    throw new TrialSignupError("This trial status link is invalid.", 401, "TRIAL_STATUS_INVALID");
  }
  const expectedSignature = crypto
    .createHmac("sha256", signupSecret())
    .update(payload)
    .digest("base64url");
  if (!secureEquals(suppliedSignature, expectedSignature)) {
    throw new TrialSignupError("This trial status link is invalid.", 401, "TRIAL_STATUS_INVALID");
  }
  let parsed: { v?: number; requestId?: string; exp?: number };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new TrialSignupError("This trial status link is invalid.", 401, "TRIAL_STATUS_INVALID");
  }
  if (parsed.v !== 1 || !parsed.requestId || !parsed.exp || parsed.exp < Date.now()) {
    throw new TrialSignupError("This trial status link has expired.", 401, "TRIAL_STATUS_EXPIRED");
  }
  return parsed.requestId;
}

async function requestMetadata() {
  const requestHeaders = await headers();
  const trustProxyHeaders = process.env.FLASH_ERP_TRUST_PROXY_HEADERS === "true";
  const ipAddress = trustProxyHeaders
    ? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      requestHeaders.get("x-real-ip")?.trim() ||
      ""
    : "";
  return {
    ipAddressHash: ipAddress ? hashClientIdentity(ipAddress) : null,
    userAgent: optionalText(requestHeaders.get("user-agent"), 500) || null
  };
}

async function verifyTurnstile(token: unknown) {
  const secret = process.env.FLASH_ERP_TRIAL_TURNSTILE_SECRET?.trim();
  const siteKey = process.env.NEXT_PUBLIC_FLASH_ERP_TRIAL_TURNSTILE_SITE_KEY?.trim();
  if (Boolean(secret) !== Boolean(siteKey)) {
    throw new TrialSignupError(
      "Trial registration is temporarily unavailable.",
      503,
      "TRIAL_SECURITY_MISCONFIGURED"
    );
  }
  if (!secret) return;
  const responseToken = optionalText(token, 4000);
  if (!responseToken) {
    throw new TrialSignupError("Complete the security check.", 400, "TRIAL_SECURITY_REQUIRED");
  }
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", responseToken);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
    cache: "no-store"
  });
  const result = (await response.json().catch(() => null)) as { success?: boolean } | null;
  if (!response.ok || !result?.success) {
    throw new TrialSignupError(
      "The security check could not be verified. Refresh and try again.",
      400,
      "TRIAL_SECURITY_FAILED"
    );
  }
}

async function controlPlaneContext() {
  const enterpriseNode = await prisma.syncNode.findFirst({
    where: { nodeType: "ENTERPRISE", isPrimary: true, status: "ACTIVE" },
    select: { code: true, retailOrgId: true }
  });
  if (!enterpriseNode) {
    throw new TrialSignupError(
      "Trial registration is temporarily unavailable.",
      503,
      "TRIAL_CONTROL_PLANE_UNAVAILABLE"
    );
  }
  return enterpriseNode;
}

function publicStatus(request: {
  status: string;
  requestNo: string;
  companyName: string;
  workspaceUrl: string | null;
  onlineStoreUrl: string | null;
  storefrontUrl: string | null;
  trialStartsAt: Date | null;
  trialExpiresAt: Date | null;
  failureMessage: string | null;
}) {
  return {
    status: request.status,
    requestNo: request.requestNo,
    companyName: request.companyName,
    workspaceUrl: request.workspaceUrl,
    onlineStoreUrl: request.onlineStoreUrl,
    storefrontUrl: request.storefrontUrl,
    trialStartsAt: request.trialStartsAt?.toISOString() ?? null,
    trialExpiresAt: request.trialExpiresAt?.toISOString() ?? null,
    message:
      request.status === "ACTIVE"
        ? "Your Flash ERP trial workspace is ready. Use the secure activation email to set your password."
        : request.status === "EXPIRED"
          ? "Your Flash ERP trial has expired. Contact Flash Code Solutions if you need an extension."
        : request.status === "PROVISIONING"
          ? "Your isolated Flash ERP workspace is being prepared."
        : request.status === "AWAITING_PROVISIONER"
            ? "Your email is verified. The provisioning service will prepare your workspace next."
            : request.status === "FAILED"
              ? "We could not complete provisioning automatically. Support has been notified."
              : "Your trial request is being processed."
  };
}

export async function createTrialSignupRequest(payload: TrialSignupPayload) {
  if (process.env.FLASH_ERP_PUBLIC_TRIAL_SIGNUP_ENABLED === "false") {
    throw new TrialSignupError("Trial registration is not available from this workspace.", 404);
  }
  if (optionalText(payload.website, 200)) {
    return {
      requestId: crypto.randomUUID(),
      deliveryHint: "your email address",
      expiresAt: new Date(Date.now() + OTP_LIFETIME_MINUTES * 60_000).toISOString(),
      message: "Check your email for the verification code."
    };
  }
  await verifyTurnstile(payload.turnstileToken);
  if (payload.termsAccepted !== true) {
    throw new TrialSignupError("Accept the trial terms and privacy notice to continue.");
  }
  const now = new Date();
  const companyName = requiredText(payload.companyName, "Business name");
  const contactName = requiredText(payload.contactName, "Your name");
  const email = normalizeEmail(payload.email);
  const phone = normalizePhone(payload.phone);
  const businessType = requiredText(payload.businessType, "Business type", 60).toUpperCase();
  const employeeCountRange = requiredText(
    payload.employeeCountRange,
    "Team size",
    30
  ).toUpperCase();
  const branchCount = Number(payload.branchCount);
  if (!BUSINESS_TYPES.has(businessType)) {
    throw new TrialSignupError("Choose a valid business type.");
  }
  if (!EMPLOYEE_RANGES.has(employeeCountRange)) {
    throw new TrialSignupError("Choose a valid team size.");
  }
  if (!Number.isInteger(branchCount) || branchCount < 1 || branchCount > 100) {
    throw new TrialSignupError("Branch count must be between 1 and 100.");
  }
  const context = await controlPlaneContext();
  const metadata = await requestMetadata();
  const existing = await prisma.trialSignupRequest.findFirst({
    where: { emailNormalized: email, status: { in: ACTIVE_REQUEST_STATUSES } },
    orderBy: { createdAt: "desc" }
  });
  if (existing && existing.createdAt.getTime() > now.getTime() - 60_000) {
    throw new TrialSignupError(
      "A verification code was sent recently. Wait a minute before requesting another.",
      429,
      "TRIAL_VERIFICATION_THROTTLED"
    );
  }
  if (existing && existing.status !== "PENDING_VERIFICATION") {
    throw new TrialSignupError(
      "A trial for this email is already verified or active. Contact trial support if you need the access details resent.",
      409,
      "TRIAL_ALREADY_EXISTS"
    );
  }
  const id = existing?.id ?? crypto.randomUUID();
  const code = String(crypto.randomInt(100000, 1_000_000));
  const expiresAt = new Date(now.getTime() + OTP_LIFETIME_MINUTES * 60_000);
  const data = {
    companyName,
    contactName,
    email,
    emailNormalized: email,
    phone,
    countryCode: optionalText(payload.countryCode, 2).toUpperCase() || "GH",
    city: optionalText(payload.city) || null,
    businessType,
    branchCount,
    employeeCountRange,
    preferredSlug: normalizeSlug(payload.preferredSlug),
    status: "PENDING_VERIFICATION",
    verificationCodeHash: hashOtp(id, email, code),
    verificationExpiresAt: expiresAt,
    verificationAttemptCount: 0,
    verifiedAt: null,
    failureCode: null,
    failureMessage: null,
    marketingConsent: payload.marketingConsent === true,
    termsAcceptedAt: now,
    ...metadata
  };
  const request = existing
    ? await prisma.trialSignupRequest.update({ where: { id }, data })
    : await prisma.trialSignupRequest.create({
        data: {
          id,
          requestNo: requestNumber(now),
          provisioningRequestKey: `flash-erp-trial:${id}`,
          ...data
        }
      });
  const delivery = await deliverEnterpriseMfaCode({
    retailOrgId: context.retailOrgId,
    sourceNodeCode: context.code,
    loginId: email,
    displayName: contactName,
    email,
    code,
    expiresAt,
    experience: "ECOMMERCE"
  });
  if (delivery.status === "FAILED") {
    await prisma.trialSignupRequest.update({
      where: { id },
      data: { status: "VERIFICATION_DELIVERY_FAILED", failureCode: "OTP_DELIVERY_FAILED" }
    });
    throw new TrialSignupError(
      "We could not deliver the verification code. Try again shortly.",
      502,
      "TRIAL_VERIFICATION_DELIVERY_FAILED"
    );
  }
  return {
    requestId: request.id,
    deliveryHint: delivery.deliveryHint || maskEmail(email),
    expiresAt: expiresAt.toISOString(),
    message: "Check your email for the 6-digit verification code.",
    ...(process.env.NODE_ENV !== "production" &&
    process.env.FLASH_ERP_TRIAL_EXPOSE_OTP !== "false"
      ? { developmentCode: code }
      : {})
  };
}

async function triggerProvisioner(requestId: string) {
  const request = await prisma.trialSignupRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new TrialSignupError("Trial request was not found.", 404);
  const provisionerUrl = process.env.FLASH_ERP_TRIAL_PROVISIONER_URL?.trim();
  const provisionerSecret = process.env.FLASH_ERP_TRIAL_PROVISIONER_SECRET?.trim();
  if (!provisionerUrl && !provisionerSecret) {
    await prisma.trialSignupRequest.update({
      where: { id: request.id },
      data: { status: "AWAITING_PROVISIONER" }
    });
    return;
  }
  if (!provisionerUrl || !provisionerSecret) {
    await prisma.trialSignupRequest.update({
      where: { id: request.id },
      data: {
        status: "FAILED",
        failureCode: "PROVISIONER_MISCONFIGURED",
        failureMessage: "The trial provisioner URL and signing secret must be configured together."
      }
    });
    return;
  }
  const body = JSON.stringify({
    version: 1,
    requestId: request.id,
    requestNo: request.requestNo,
    provisioningRequestKey: request.provisioningRequestKey,
    trialDays: TRIAL_DAYS,
    owner: { name: request.contactName, email: request.email, phone: request.phone },
    business: {
      name: request.companyName,
      type: request.businessType,
      countryCode: request.countryCode,
      city: request.city,
      branchCount: request.branchCount,
      employeeCountRange: request.employeeCountRange,
      preferredSlug: request.preferredSlug
    },
    products: ["HQ_ENTERPRISE", "ONLINE_STORE", "ECOMMERCE_STOREFRONT", "STORE_DESKTOP"]
  });
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", provisionerSecret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  try {
    const response = await fetch(provisionerUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": request.provisioningRequestKey,
        "x-flash-timestamp": timestamp,
        "x-flash-signature": signature
      },
      body,
      cache: "no-store"
    });
    const result = (await response.json().catch(() => null)) as {
      operationId?: string;
      status?: string;
    } | null;
    if (!response.ok) throw new Error(`Provisioner returned HTTP ${response.status}.`);
    await prisma.trialSignupRequest.update({
      where: { id: request.id },
      data: {
        status: "PROVISIONING",
        provisionerReference: optionalText(result?.operationId, 200) || null,
        failureCode: null,
        failureMessage: null
      }
    });
    await prisma.trialLifecycleEvent.create({
      data: {
        trialSignupRequestId: request.id,
        eventType: "PROVISIONING_QUEUED",
        outcome: "SUCCEEDED",
        actorType: "SYSTEM",
        actorRef: "Public trial verification",
        previousStatus: request.status,
        newStatus: "PROVISIONING"
      }
    });
  } catch (error) {
    await prisma.trialSignupRequest.update({
      where: { id: request.id },
      data: {
        status: "FAILED",
        failureCode: "PROVISIONER_UNAVAILABLE",
        failureMessage:
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "The provisioning service is unavailable."
      }
    });
  }
}

export async function verifyTrialSignup(requestIdValue: unknown, codeValue: unknown) {
  const requestId = requiredText(requestIdValue, "Trial request", 100);
  const code = requiredText(codeValue, "Verification code", 6);
  if (!/^\d{6}$/.test(code)) throw new TrialSignupError("Enter the 6-digit verification code.");
  await prisma.$transaction(async (tx) => {
    const request = await tx.trialSignupRequest.findUnique({ where: { id: requestId } });
    if (!request || request.status !== "PENDING_VERIFICATION") {
      throw new TrialSignupError("This verification request is no longer available.", 409);
    }
    if (!request.verificationExpiresAt || request.verificationExpiresAt <= new Date()) {
      throw new TrialSignupError(
        "This verification code has expired. Start the signup again.",
        410,
        "TRIAL_VERIFICATION_EXPIRED"
      );
    }
    if (request.verificationAttemptCount >= OTP_MAX_ATTEMPTS) {
      throw new TrialSignupError(
        "Too many incorrect attempts. Start the signup again.",
        429,
        "TRIAL_VERIFICATION_LOCKED"
      );
    }
    const expectedHash = hashOtp(request.id, request.emailNormalized, code);
    if (!request.verificationCodeHash || !secureEquals(request.verificationCodeHash, expectedHash)) {
      await tx.trialSignupRequest.update({
        where: { id: request.id },
        data: { verificationAttemptCount: { increment: 1 } }
      });
      throw new TrialSignupError("The verification code is incorrect.", 401);
    }
    await tx.trialSignupRequest.update({
      where: { id: request.id },
      data: {
        status: "VERIFIED",
        verifiedAt: new Date(),
        verificationCodeHash: null,
        verificationExpiresAt: null
      }
    });
  });
  await triggerProvisioner(requestId);
  const request = await prisma.trialSignupRequest.findUniqueOrThrow({ where: { id: requestId } });
  return { token: statusToken(requestId), ...publicStatus(request) };
}

export async function getTrialSignupStatus(token: unknown) {
  const requestId = readStatusToken(token);
  const request = await prisma.trialSignupRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new TrialSignupError("Trial request was not found.", 404);
  return publicStatus(request);
}

function requiredHttpsUrl(value: unknown, label: string) {
  const text = requiredText(value, label, 1000);
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new TrialSignupError(`${label} must be a valid URL.`);
  }
  if (
    parsed.protocol !== "https:" &&
    process.env.NODE_ENV === "production" &&
    process.env.FLASH_ERP_TRIAL_ALLOW_INSECURE_URLS !== "true"
  ) {
    throw new TrialSignupError(`${label} must use HTTPS.`);
  }
  return parsed.toString();
}

export function assertProvisionerCallbackSignature(rawBody: string, timestamp: string, signature: string) {
  const secret = process.env.FLASH_ERP_TRIAL_PROVISIONER_SECRET?.trim();
  if (!secret) {
    throw new TrialSignupError("Trial provisioner callbacks are not configured.", 503);
  }
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() - timestampNumber) > 5 * 60_000) {
    throw new TrialSignupError("Provisioner callback timestamp is invalid.", 401);
  }
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  if (!signature || !secureEquals(signature, expected)) {
    throw new TrialSignupError("Provisioner callback signature is invalid.", 401);
  }
}

export async function applyTrialProvisioningCallback(payload: TrialProvisioningCallback) {
  const requestId = requiredText(payload.requestId, "Request ID", 100);
  const provisioningRequestKey = requiredText(
    payload.provisioningRequestKey,
    "Provisioning request key",
    200
  );
  const status = requiredText(payload.status, "Provisioning status", 40).toUpperCase();
  const lifecycleAction = optionalText(payload.lifecycleAction, 60).toUpperCase() || "PROVISIONED";
  const request = await prisma.trialSignupRequest.findFirst({
    where: { id: requestId, provisioningRequestKey }
  });
  if (!request) throw new TrialSignupError("Trial request was not found.", 404);
  if (request.status === "ACTIVE" && status === "ACTIVE" && lifecycleAction !== "EXTENDED") {
    return { requestNo: request.requestNo, status: request.status };
  }
  if (status === "FAILED") {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.trialSignupRequest.update({
        where: { id: request.id },
        data: {
          status: "FAILED",
          failureCode: optionalText(payload.failureCode, 100) || "PROVISIONING_FAILED",
          failureMessage: optionalText(payload.failureMessage, 1000) || "Provisioning failed.",
          lastLifecycleAt: new Date()
        },
        select: { requestNo: true, status: true }
      });
      await tx.trialLifecycleEvent.create({
        data: {
          trialSignupRequestId: request.id,
          eventType: lifecycleAction,
          outcome: "FAILED",
          actorType: "PROVISIONER",
          actorRef: optionalText(payload.provisionerReference, 200) || null,
          previousStatus: request.status,
          newStatus: "FAILED",
          previousExpiresAt: request.trialExpiresAt,
          detailsJson: JSON.stringify({
            failureCode: optionalText(payload.failureCode, 100) || "PROVISIONING_FAILED"
          })
        }
      });
      return updated;
    });
  }
  if (status === "PROVISIONING") {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.trialSignupRequest.update({
        where: { id: request.id },
        data: {
          status: "PROVISIONING",
          provisionerReference: optionalText(payload.provisionerReference, 200) || null,
          lastLifecycleAt: new Date()
        },
        select: { requestNo: true, status: true }
      });
      await tx.trialLifecycleEvent.create({
        data: {
          trialSignupRequestId: request.id,
          eventType: lifecycleAction,
          outcome: "IN_PROGRESS",
          actorType: "PROVISIONER",
          actorRef: optionalText(payload.provisionerReference, 200) || null,
          previousStatus: request.status,
          newStatus: "PROVISIONING",
          previousExpiresAt: request.trialExpiresAt
        }
      });
      return updated;
    });
  }
  if (status === "EXPIRED") {
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const updated = await tx.trialSignupRequest.update({
        where: { id: request.id },
        data: {
          status: "EXPIRED",
          expiredAt: now,
          lastLifecycleAt: now,
          failureCode: null,
          failureMessage: null
        },
        select: { requestNo: true, status: true }
      });
      await tx.trialLifecycleEvent.create({
        data: {
          trialSignupRequestId: request.id,
          eventType: "EXPIRED",
          outcome: "SUCCEEDED",
          actorType: "PROVISIONER",
          actorRef: optionalText(payload.provisionerReference, 200) || null,
          previousStatus: request.status,
          newStatus: "EXPIRED",
          previousExpiresAt: request.trialExpiresAt,
          newExpiresAt: request.trialExpiresAt
        }
      });
      return updated;
    });
  }
  if (status !== "ACTIVE") throw new TrialSignupError("Unsupported provisioning status.");
  const startsAt = request.trialStartsAt ??
    (payload.trialStartsAt ? new Date(requiredText(payload.trialStartsAt, "Trial start")) : new Date());
  if (Number.isNaN(startsAt.getTime())) {
    throw new TrialSignupError("Trial start timestamp is invalid.");
  }
  const governedInitialExpiry = new Date(startsAt.getTime() + TRIAL_DAYS * 24 * 60 * 60_000);
  const requestedExpiry = payload.trialExpiresAt
    ? new Date(requiredText(payload.trialExpiresAt, "Trial expiry"))
    : governedInitialExpiry;
  if (Number.isNaN(requestedExpiry.getTime())) {
    throw new TrialSignupError("Trial expiry timestamp is invalid.");
  }
  const expiresAt = lifecycleAction === "EXTENDED" ? requestedExpiry : governedInitialExpiry;
  if (
    lifecycleAction === "EXTENDED" &&
    (!request.trialExpiresAt || expiresAt.getTime() <= request.trialExpiresAt.getTime())
  ) {
    throw new TrialSignupError("A trial extension must move the expiry forward.");
  }
  const workspacePort = Number(payload.workspacePort);
  const now = new Date();
  const activationSentAt = payload.activationSentAt
    ? new Date(requiredText(payload.activationSentAt, "Activation delivery timestamp"))
    : null;
  if (activationSentAt && Number.isNaN(activationSentAt.getTime())) {
    throw new TrialSignupError("Activation delivery timestamp is invalid.");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.trialSignupRequest.update({
      where: { id: request.id },
      data: {
        status: "ACTIVE",
        provisionerReference: optionalText(payload.provisionerReference, 200) || null,
        workspaceUrl: requiredHttpsUrl(payload.workspaceUrl, "HQ workspace URL"),
        onlineStoreUrl: requiredHttpsUrl(payload.onlineStoreUrl, "Online POS URL"),
        storefrontUrl: requiredHttpsUrl(payload.storefrontUrl, "Ecommerce storefront URL"),
        trialStartsAt: startsAt,
        trialExpiresAt: expiresAt,
        workspaceSlug: optionalText(payload.workspaceSlug, 80) || request.workspaceSlug,
        workspaceDatabaseName:
          optionalText(payload.workspaceDatabaseName, 128) || request.workspaceDatabaseName,
        workspacePort:
          Number.isInteger(workspacePort) && workspacePort > 0 ? workspacePort : request.workspacePort,
        ownerLoginId: optionalText(payload.ownerLoginId, 254) || request.ownerLoginId,
        activationSentAt: activationSentAt ?? request.activationSentAt,
        expiredAt: null,
        extensionCount: lifecycleAction === "EXTENDED" ? { increment: 1 } : request.extensionCount,
        lastLifecycleAt: now,
        failureCode: null,
        failureMessage: null
      },
      select: { requestNo: true, status: true }
    });
    await tx.trialLifecycleEvent.create({
      data: {
        trialSignupRequestId: request.id,
        eventType: lifecycleAction,
        outcome: "SUCCEEDED",
        actorType: "PROVISIONER",
        actorRef: optionalText(payload.provisionerReference, 200) || null,
        previousStatus: request.status,
        newStatus: "ACTIVE",
        previousExpiresAt: request.trialExpiresAt,
        newExpiresAt: expiresAt
      }
    });
    return updated;
  });
}
