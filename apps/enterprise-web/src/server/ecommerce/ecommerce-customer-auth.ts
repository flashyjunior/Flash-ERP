import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";

import { prisma } from "@/lib/db/prisma";
import { deliverEnterpriseMfaCode } from "@/server/services/enterprise-mfa-delivery";

const ecommerceSessionCookieName = "flash_erp_shop_session";
const ecommerceSessionLifetimeDays = 30;
const ecommerceOtpLifetimeMinutes = 10;
const ecommerceOtpResendSeconds = 60;
const ecommerceOtpMaxAttempts = 5;
const ecommerceOtpHourlyLimit = 8;
const ecommerceOtpIpWindowMinutes = 15;
const ecommerceOtpIpLimit = 20;
const ecommerceSignInMaxAttempts = 5;
const ecommerceSignInLockMinutes = 15;
const ecommerceSessionTouchCache = new Map<string, number>();
const dummyCustomerPasswordHash =
  "$2b$12$y8DBRMD0tsGS1epBOsJmNuxhcUVG/LRe.U2dl/.hLoWJ.g8KMzqwq";

type EcommerceIdentityType = "EMAIL" | "PHONE";
type EcommerceOtpPurpose = "SIGN_UP" | "PASSWORD_RESET";

export class EcommerceAuthError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function ecommerceAuthSecret() {
  const configuredSecret =
    process.env.FLASH_ERP_ECOMMERCE_AUTH_SECRET ??
    process.env.FLASH_ERP_AUTH_SECRET;

  if (configuredSecret) {
    return configuredSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new EcommerceAuthError(
      "Customer authentication is not configured. Set a strong ecommerce authentication secret.",
      503
    );
  }

  return process.env.DATABASE_URL ?? "flash-erp-ecommerce-development-secret";
}

function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashOtpCode(challengeId: string, identifierNormalized: string, code: string) {
  return crypto
    .createHmac("sha256", ecommerceAuthSecret())
    .update(`${challengeId}:${identifierNormalized}:${code}`)
    .digest("hex");
}

function secureEquals(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");

  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function normalizeEmail(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 320) {
    throw new EcommerceAuthError("Enter a valid email address.");
  }

  return normalized;
}

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("0") && digits.length >= 9) {
    digits = `233${digits.slice(1)}`;
  }

  if (digits.length < 9 || digits.length > 15) {
    throw new EcommerceAuthError("Enter a valid phone number with its country code.");
  }

  return `+${digits}`;
}

export function normalizeEcommerceIdentity(value: unknown): {
  identityType: EcommerceIdentityType;
  identifier: string;
  identifierNormalized: string;
} {
  const identifier = optionalText(value);

  if (!identifier) {
    throw new EcommerceAuthError("Enter your email address or phone number.");
  }

  if (identifier.includes("@")) {
    const normalized = normalizeEmail(identifier);
    return {
      identityType: "EMAIL",
      identifier: normalized,
      identifierNormalized: normalized
    };
  }

  const normalized = normalizePhone(identifier);
  return {
    identityType: "PHONE",
    identifier: normalized,
    identifierNormalized: normalized
  };
}

function maskIdentifier(identityType: EcommerceIdentityType, identifier: string) {
  if (identityType === "PHONE") {
    return `***${identifier.replace(/\D/g, "").slice(-4)}`;
  }

  const [name, domain] = identifier.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}

function validateCustomerPassword(password: unknown) {
  if (typeof password !== "string" || password.length < 8) {
    throw new EcommerceAuthError("Password must be at least 8 characters long.");
  }

  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new EcommerceAuthError(
      "Password must include uppercase, lowercase, and numeric characters."
    );
  }

  return password;
}

async function requestMetadata() {
  const requestHeaders = await headers();

  return {
    ipAddress:
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      requestHeaders.get("x-real-ip") ??
      null,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 500) ?? null
  };
}

async function findPublicStore(storeCodeOrSlug: string) {
  const normalized = storeCodeOrSlug.trim();
  const store = await prisma.store.findFirst({
    where: {
      OR: [
        { code: normalized.toUpperCase() },
        { ecommerceSlug: normalized.toLowerCase() }
      ],
      ecommerceEnabled: true,
      salesEnabled: true,
      status: "ACTIVE"
    },
    select: {
      id: true,
      retailOrgId: true,
      code: true,
      name: true,
      ecommerceDisplayName: true
    }
  });

  if (!store) {
    throw new EcommerceAuthError("This online shop is not available.", 404);
  }

  return store;
}

export async function requestEcommerceOtp(input: {
  storeCode: string;
  identifier: unknown;
  purpose?: EcommerceOtpPurpose;
}) {
  const store = await findPublicStore(input.storeCode);
  const identity = normalizeEcommerceIdentity(input.identifier);
  const purpose: EcommerceOtpPurpose =
    input.purpose === "PASSWORD_RESET" ? "PASSWORD_RESET" : "SIGN_UP";
  const now = new Date();
  const metadata = await requestMetadata();
  const existingIdentity = await prisma.ecommerceCustomerIdentity.findFirst({
    where: {
      retailOrgId: store.retailOrgId,
      identityType: identity.identityType,
      identifierNormalized: identity.identifierNormalized
    },
    select: { id: true }
  });

  if (purpose === "SIGN_UP" && existingIdentity) {
    throw new EcommerceAuthError("An account already uses this email address or phone number.", 409);
  }

  if (purpose === "PASSWORD_RESET" && !existingIdentity) {
    return {
      challengeId: null,
      deliveryHint: maskIdentifier(identity.identityType, identity.identifier),
      expiresAt: new Date(now.getTime() + ecommerceOtpLifetimeMinutes * 60_000).toISOString(),
      message: "If an account matches those details, a verification code has been sent."
    };
  }

  const identityWindowStart = new Date(now.getTime() - 60 * 60_000);
  const identityRequestCount = await prisma.ecommerceOtpChallenge.count({
    where: {
      retailOrgId: store.retailOrgId,
      identityType: identity.identityType,
      identifierNormalized: identity.identifierNormalized,
      createdAt: { gte: identityWindowStart }
    }
  });
  if (identityRequestCount >= ecommerceOtpHourlyLimit) {
    throw new EcommerceAuthError(
      "Too many verification codes were requested. Try again later.",
      429
    );
  }

  if (metadata.ipAddress) {
    const ipWindowStart = new Date(
      now.getTime() - ecommerceOtpIpWindowMinutes * 60_000
    );
    const ipRequestCount = await prisma.ecommerceOtpChallenge.count({
      where: {
        ipAddress: metadata.ipAddress,
        createdAt: { gte: ipWindowStart }
      }
    });
    if (ipRequestCount >= ecommerceOtpIpLimit) {
      throw new EcommerceAuthError(
        "Too many verification requests were made from this connection. Try again later.",
        429
      );
    }
  }

  const latestChallenge = await prisma.ecommerceOtpChallenge.findFirst({
    where: {
      retailOrgId: store.retailOrgId,
      identityType: identity.identityType,
      identifierNormalized: identity.identifierNormalized,
      purpose,
      consumedAt: null
    },
    orderBy: { createdAt: "desc" },
    select: { resendAvailableAt: true }
  });

  if (latestChallenge && latestChallenge.resendAvailableAt > now) {
    const waitSeconds = Math.max(
      1,
      Math.ceil((latestChallenge.resendAvailableAt.getTime() - now.getTime()) / 1000)
    );
    throw new EcommerceAuthError(`Wait ${waitSeconds} second(s) before requesting another code.`, 429);
  }

  const challengeId = crypto.randomUUID();
  const code = String(crypto.randomInt(100000, 1_000_000));
  const expiresAt = new Date(now.getTime() + ecommerceOtpLifetimeMinutes * 60_000);
  const resendAvailableAt = new Date(now.getTime() + ecommerceOtpResendSeconds * 1000);
  await prisma.ecommerceOtpChallenge.create({
    data: {
      id: challengeId,
      retailOrgId: store.retailOrgId,
      identityType: identity.identityType,
      identifier: identity.identifier,
      identifierNormalized: identity.identifierNormalized,
      purpose,
      codeHash: hashOtpCode(challengeId, identity.identifierNormalized, code),
      maxAttempts: ecommerceOtpMaxAttempts,
      expiresAt,
      resendAvailableAt,
      ...metadata
    }
  });

  const delivery = await deliverEnterpriseMfaCode({
    retailOrgId: store.retailOrgId,
    sourceNodeCode: "ECOMMERCE",
    loginId: identity.identifierNormalized,
    displayName: "Customer",
    email: identity.identityType === "EMAIL" ? identity.identifier : null,
    phone: identity.identityType === "PHONE" ? identity.identifier : null,
    code,
    expiresAt,
    experience: "ECOMMERCE"
  });

  if (delivery.status === "FAILED") {
    throw new EcommerceAuthError(
      "We could not deliver the verification code. Try again or use another contact option.",
      502
    );
  }

  return {
    challengeId,
    deliveryHint: delivery.deliveryHint || maskIdentifier(identity.identityType, identity.identifier),
    expiresAt: expiresAt.toISOString(),
    message:
      delivery.status === "DELIVERED"
        ? "Verification code sent."
        : "Verification code created for this non-production environment.",
    ...(process.env.NODE_ENV !== "production" &&
    process.env.FLASH_ERP_ECOMMERCE_EXPOSE_OTP !== "false"
      ? { developmentCode: code }
      : {})
  };
}

async function consumeOtpChallenge(input: {
  storeCode: string;
  challengeId: unknown;
  code: unknown;
  purpose: EcommerceOtpPurpose;
}) {
  const store = await findPublicStore(input.storeCode);
  const challengeId = optionalText(input.challengeId);
  const code = optionalText(input.code);

  if (!challengeId || !code || !/^\d{6}$/.test(code)) {
    throw new EcommerceAuthError("Enter the 6-digit verification code.");
  }

  return prisma.$transaction(async (tx) => {
    const challenge = await tx.ecommerceOtpChallenge.findFirst({
      where: {
        id: challengeId,
        retailOrgId: store.retailOrgId,
        purpose: input.purpose,
        consumedAt: null
      }
    });

    if (!challenge || challenge.expiresAt <= new Date()) {
      throw new EcommerceAuthError("This verification code has expired. Request a new code.", 410);
    }

    if (challenge.attemptCount >= challenge.maxAttempts) {
      throw new EcommerceAuthError("Too many incorrect attempts. Request a new code.", 429);
    }

    const suppliedHash = hashOtpCode(challenge.id, challenge.identifierNormalized, code);

    if (!secureEquals(challenge.codeHash, suppliedHash)) {
      await tx.ecommerceOtpChallenge.update({
        where: { id: challenge.id },
        data: { attemptCount: { increment: 1 } }
      });
      throw new EcommerceAuthError("The verification code is incorrect.", 401);
    }

    await tx.ecommerceOtpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() }
    });

    return { store, challenge };
  });
}

async function createCustomerSession(input: {
  retailOrgId: string;
  customerAccountId: string;
}) {
  const token = crypto.randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + ecommerceSessionLifetimeDays * 24 * 60 * 60 * 1000);
  const metadata = await requestMetadata();

  await prisma.ecommerceCustomerSession.create({
    data: {
      retailOrgId: input.retailOrgId,
      customerAccountId: input.customerAccountId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      ...metadata
    }
  });

  const cookieStore = await cookies();
  cookieStore.set(ecommerceSessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt
  });
}

export async function verifyEcommerceSignup(input: {
  storeCode: string;
  challengeId: unknown;
  code: unknown;
  fullName: unknown;
  password: unknown;
}) {
  const fullName = optionalText(input.fullName);
  const password = validateCustomerPassword(input.password);

  if (!fullName || fullName.length < 2 || fullName.length > 200) {
    throw new EcommerceAuthError("Enter your full name.");
  }

  const { store, challenge } = await consumeOtpChallenge({
    storeCode: input.storeCode,
    challengeId: input.challengeId,
    code: input.code,
    purpose: "SIGN_UP"
  });
  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();
  const account = await prisma.$transaction(async (tx) => {
    const existingIdentity = await tx.ecommerceCustomerIdentity.findFirst({
      where: {
        retailOrgId: store.retailOrgId,
        identityType: challenge.identityType,
        identifierNormalized: challenge.identifierNormalized
      },
      select: { id: true }
    });

    if (existingIdentity) {
      throw new EcommerceAuthError("An account already uses this email address or phone number.", 409);
    }

    const customer = await tx.customer.create({
      data: {
        retailOrgId: store.retailOrgId,
        storeId: store.id,
        customerNo: `ECOM-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
        customerType: "INDIVIDUAL",
        fullName,
        email: challenge.identityType === "EMAIL" ? challenge.identifier : null,
        phone: challenge.identityType === "PHONE" ? challenge.identifier : null,
        status: "ACTIVE",
        originNodeCode: "ECOMMERCE",
        lastModifiedByNodeCode: "ECOMMERCE"
      }
    });

    return tx.ecommerceCustomerAccount.create({
      data: {
        retailOrgId: store.retailOrgId,
        customerId: customer.id,
        passwordHash,
        status: "ACTIVE",
        passwordUpdatedAt: now,
        lastLoginAt: now,
        identities: {
          create: {
            retailOrgId: store.retailOrgId,
            identityType: challenge.identityType,
            identifier: challenge.identifier,
            identifierNormalized: challenge.identifierNormalized,
            isPrimary: true,
            verifiedAt: now
          }
        }
      },
      select: { id: true, retailOrgId: true }
    });
  });

  await createCustomerSession({
    retailOrgId: account.retailOrgId,
    customerAccountId: account.id
  });

  return { message: "Your account is ready." };
}

export async function resetEcommerceCustomerPassword(input: {
  storeCode: string;
  challengeId: unknown;
  code: unknown;
  password: unknown;
}) {
  const password = validateCustomerPassword(input.password);
  const { store, challenge } = await consumeOtpChallenge({
    storeCode: input.storeCode,
    challengeId: input.challengeId,
    code: input.code,
    purpose: "PASSWORD_RESET"
  });
  const identity = await prisma.ecommerceCustomerIdentity.findFirst({
    where: {
      retailOrgId: store.retailOrgId,
      identityType: challenge.identityType,
      identifierNormalized: challenge.identifierNormalized
    },
    select: { customerAccountId: true }
  });

  if (!identity) {
    throw new EcommerceAuthError("This password reset request is no longer valid.", 410);
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.ecommerceCustomerAccount.update({
      where: { id: identity.customerAccountId },
      data: {
        passwordHash: await bcrypt.hash(password, 12),
        passwordUpdatedAt: now,
        failedLoginAttempts: 0,
        lockedUntil: null,
        status: "ACTIVE"
      }
    }),
    prisma.ecommerceCustomerSession.updateMany({
      where: { customerAccountId: identity.customerAccountId, revokedAt: null },
      data: { revokedAt: now }
    })
  ]);

  return { message: "Password updated. Sign in with your new password." };
}

export async function signInEcommerceCustomer(input: {
  storeCode: string;
  identifier: unknown;
  password: unknown;
}) {
  const store = await findPublicStore(input.storeCode);
  const identity = normalizeEcommerceIdentity(input.identifier);
  const password = typeof input.password === "string" ? input.password : "";
  const record = await prisma.ecommerceCustomerIdentity.findFirst({
    where: {
      retailOrgId: store.retailOrgId,
      identityType: identity.identityType,
      identifierNormalized: identity.identifierNormalized,
      verifiedAt: { not: null },
      customerAccount: { status: "ACTIVE" }
    },
    select: {
      customerAccount: {
        select: {
          id: true,
          retailOrgId: true,
          passwordHash: true,
          failedLoginAttempts: true,
          lockedUntil: true
        }
      }
    }
  });

  const now = new Date();
  const account = record?.customerAccount ?? null;
  if (account?.lockedUntil && account.lockedUntil > now) {
    throw new EcommerceAuthError(
      "Too many unsuccessful sign-in attempts. Try again later.",
      429
    );
  }

  const passwordMatches = await bcrypt.compare(
    password,
    account?.passwordHash ?? dummyCustomerPasswordHash
  );
  if (!account || !passwordMatches) {
    if (account) {
      const failedLoginAttempts = account.failedLoginAttempts + 1;
      await prisma.ecommerceCustomerAccount.update({
        where: { id: account.id },
        data: {
          failedLoginAttempts,
          lockedUntil:
            failedLoginAttempts >= ecommerceSignInMaxAttempts
              ? new Date(now.getTime() + ecommerceSignInLockMinutes * 60_000)
              : null
        }
      });
    }
    throw new EcommerceAuthError("The email/phone or password is incorrect.", 401);
  }

  await prisma.ecommerceCustomerAccount.update({
    where: { id: account.id },
    data: { lastLoginAt: now, failedLoginAttempts: 0, lockedUntil: null }
  });
  await createCustomerSession({
    retailOrgId: account.retailOrgId,
    customerAccountId: account.id
  });

  return { message: "Signed in." };
}

export async function getEcommerceCustomerSession(options?: {
  storeCode?: string;
  required?: boolean;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ecommerceSessionCookieName)?.value;

  if (!token) {
    if (options?.required) {
      throw new EcommerceAuthError("Sign in to continue.", 401);
    }
    return null;
  }

  const session = await prisma.ecommerceCustomerSession.findFirst({
    where: {
      tokenHash: hashSessionToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
      customerAccount: { status: "ACTIVE" }
    },
    select: {
      id: true,
      retailOrgId: true,
      expiresAt: true,
      lastSeenAt: true,
      customerAccount: {
        select: {
          id: true,
          customerId: true,
          customer: {
            select: {
              customerNo: true,
              fullName: true,
              email: true,
              phone: true,
              customerType: true,
              loyaltyTier: true
            }
          },
          identities: {
            where: { verifiedAt: { not: null } },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            select: {
              identityType: true,
              identifier: true,
              isPrimary: true
            }
          }
        }
      }
    }
  });

  if (!session) {
    cookieStore.delete(ecommerceSessionCookieName);
    if (options?.required) {
      throw new EcommerceAuthError("Your session has expired. Sign in again.", 401);
    }
    return null;
  }

  if (options?.storeCode) {
    const store = await findPublicStore(options.storeCode);
    if (store.retailOrgId !== session.retailOrgId) {
      throw new EcommerceAuthError("This customer account belongs to another shop.", 403);
    }
  }

  const now = new Date();
  const touchIntervalMs = positiveInteger(
    process.env.FLASH_ERP_ECOMMERCE_SESSION_TOUCH_INTERVAL_MS,
    60_000
  );
  const touchBefore = new Date(now.getTime() - touchIntervalMs);
  const locallyDeferredUntil = ecommerceSessionTouchCache.get(session.id) ?? 0;
  if (session.lastSeenAt <= touchBefore && locallyDeferredUntil <= now.getTime()) {
    ecommerceSessionTouchCache.set(session.id, now.getTime() + touchIntervalMs);
    await prisma.ecommerceCustomerSession.updateMany({
      where: { id: session.id, lastSeenAt: { lte: touchBefore } },
      data: { lastSeenAt: now }
    });
  }

  return session;
}

export async function signOutEcommerceCustomer() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ecommerceSessionCookieName)?.value;

  if (token) {
    await prisma.ecommerceCustomerSession.updateMany({
      where: { tokenHash: hashSessionToken(token), revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  cookieStore.delete(ecommerceSessionCookieName);
  return { message: "Signed out." };
}
