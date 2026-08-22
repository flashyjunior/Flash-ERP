import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

import { prisma } from "@/lib/db/prisma";
import {
  createEcommerceCustomerSession,
  EcommerceAuthError,
  findPublicEcommerceStore,
  getEcommerceAuthSecret,
  normalizeEcommerceIdentity,
} from "@/server/ecommerce/ecommerce-customer-auth";
import {
  buildEcommerceOAuthAuthorizationUrl,
  createEcommerceOAuthCodeChallenge,
  getEcommerceOAuthProviderAvailability,
  parseEcommerceOAuthState,
  resolveEcommerceOAuthProviderConfig,
  sanitizeEcommerceOAuthReturnTo,
  serializeEcommerceOAuthState,
  type EcommerceOAuthProvider,
  type EcommerceOAuthProviderConfig,
} from "@/server/ecommerce/ecommerce-customer-oauth-contract";

const ecommerceOAuthLifetimeMs = 10 * 60_000;
const ecommerceOAuthRequestTimeoutMs = 15_000;

type EcommerceOAuthProfile = {
  subject: string;
  fullName: string;
  email: string | null;
  emailVerified: boolean;
};

export class EcommerceOAuthError extends EcommerceAuthError {
  resultCode: "cancelled" | "conflict" | "failed" | "unavailable";
  returnTo: string | null;

  constructor(
    message: string,
    resultCode: EcommerceOAuthError["resultCode"],
    status = 400,
    returnTo: string | null = null,
  ) {
    super(message, status);
    this.resultCode = resultCode;
    this.returnTo = returnTo;
  }
}

function oauthCookieName(provider: EcommerceOAuthProvider) {
  return `flash_erp_shop_oauth_${provider}`;
}

function publicOrigin(request: Request) {
  const configured =
    process.env.FLASH_ERP_ECOMMERCE_PUBLIC_URL?.trim() ||
    process.env.FLASH_ERP_ENTERPRISE_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_ENTERPRISE_URL?.trim();

  let url: URL;
  try {
    url = new URL(configured || request.url);
  } catch {
    throw new EcommerceOAuthError(
      "The public ecommerce URL is not configured correctly.",
      "unavailable",
      503,
    );
  }

  const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !localHost) {
    throw new EcommerceOAuthError(
      "Social sign-in requires an HTTPS ecommerce URL.",
      "unavailable",
      503,
    );
  }

  return url.origin;
}

export function getEcommerceOAuthPublicOrigin(request: Request) {
  return publicOrigin(request);
}

function callbackUrl(origin: string, storeCode: string, provider: EcommerceOAuthProvider) {
  return new URL(
    `/api/ecommerce/${encodeURIComponent(storeCode)}/auth/oauth/${provider}/callback`,
    origin,
  ).toString();
}

function secureTextEquals(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

async function readProviderJson(
  url: string | URL,
  init: RequestInit,
  failureMessage: string,
) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(ecommerceOAuthRequestTimeoutMs),
    });
  } catch {
    throw new EcommerceOAuthError(failureMessage, "failed", 502);
  }

  if (!response.ok) {
    throw new EcommerceOAuthError(failureMessage, "failed", 502);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

async function exchangeAuthorizationCode(input: {
  config: EcommerceOAuthProviderConfig;
  code: string;
  redirectUri: string;
  codeVerifier: string | null;
}) {
  const body = new URLSearchParams({
    client_id: input.config.clientId,
    client_secret: input.config.clientSecret,
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
  });
  if (input.config.provider === "google" && input.codeVerifier) {
    body.set("code_verifier", input.codeVerifier);
  }

  const payload = await readProviderJson(
    input.config.tokenEndpoint,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    },
    `${input.config.provider === "google" ? "Google" : "Facebook"} sign-in could not be completed.`,
  );
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : null;
  if (!accessToken) {
    throw new EcommerceOAuthError("The social provider did not return an access token.", "failed", 502);
  }
  return accessToken;
}

async function loadGoogleProfile(config: EcommerceOAuthProviderConfig, accessToken: string) {
  const payload = await readProviderJson(
    config.userInfoEndpoint,
    { headers: { authorization: `Bearer ${accessToken}` } },
    "Google profile information could not be read.",
  );
  const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const emailVerified = payload.email_verified === true;
  if (!subject || subject.length > 320 || !email || !emailVerified) {
    throw new EcommerceOAuthError(
      "Google must provide a verified email address to use this shop.",
      "failed",
      403,
    );
  }

  const identity = normalizeEcommerceIdentity(email);
  if (identity.identityType !== "EMAIL") {
    throw new EcommerceOAuthError("Google returned an invalid email address.", "failed", 502);
  }

  return {
    subject,
    fullName: typeof payload.name === "string" ? payload.name.trim().slice(0, 200) : "Google customer",
    email: identity.identifier,
    emailVerified: true,
  } satisfies EcommerceOAuthProfile;
}

async function loadFacebookProfile(config: EcommerceOAuthProviderConfig, accessToken: string) {
  const profileUrl = new URL(config.userInfoEndpoint);
  profileUrl.searchParams.set("fields", "id,name,email");
  profileUrl.searchParams.set(
    "appsecret_proof",
    crypto.createHmac("sha256", config.clientSecret).update(accessToken).digest("hex"),
  );
  const payload = await readProviderJson(
    profileUrl,
    { headers: { authorization: `Bearer ${accessToken}` } },
    "Facebook profile information could not be read.",
  );
  const subject = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!subject || subject.length > 320) {
    throw new EcommerceOAuthError("Facebook returned an invalid account identifier.", "failed", 502);
  }

  let email: string | null = null;
  if (typeof payload.email === "string" && payload.email.trim()) {
    try {
      const identity = normalizeEcommerceIdentity(payload.email);
      email = identity.identityType === "EMAIL" ? identity.identifier : null;
    } catch {
      email = null;
    }
  }

  return {
    subject,
    fullName: typeof payload.name === "string" ? payload.name.trim().slice(0, 200) : "Facebook customer",
    email,
    emailVerified: false,
  } satisfies EcommerceOAuthProfile;
}

async function resolveCustomerAccount(input: {
  provider: EcommerceOAuthProvider;
  profile: EcommerceOAuthProfile;
  store: Awaited<ReturnType<typeof findPublicEcommerceStore>>;
}) {
  const identityType = input.provider.toUpperCase();
  const now = new Date();
  const existingProviderIdentity = await prisma.ecommerceCustomerIdentity.findFirst({
    where: {
      retailOrgId: input.store.retailOrgId,
      identityType,
      identifierNormalized: input.profile.subject,
    },
    select: {
      customerAccount: { select: { id: true, retailOrgId: true, status: true } },
    },
  });
  if (existingProviderIdentity) {
    if (existingProviderIdentity.customerAccount.status !== "ACTIVE") {
      throw new EcommerceOAuthError("This customer account is not active.", "failed", 403);
    }
    await prisma.ecommerceCustomerAccount.update({
      where: { id: existingProviderIdentity.customerAccount.id },
      data: { lastLoginAt: now, failedLoginAttempts: 0, lockedUntil: null },
    });
    return existingProviderIdentity.customerAccount;
  }

  const generatedPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString("base64url"), 12);

  const createOrLink = async () => prisma.$transaction(async (tx) => {
    const providerIdentity = await tx.ecommerceCustomerIdentity.findFirst({
      where: {
        retailOrgId: input.store.retailOrgId,
        identityType,
        identifierNormalized: input.profile.subject,
      },
      select: {
        customerAccount: { select: { id: true, retailOrgId: true, status: true } },
      },
    });
    if (providerIdentity) {
      if (providerIdentity.customerAccount.status !== "ACTIVE") {
        throw new EcommerceOAuthError("This customer account is not active.", "failed", 403);
      }
      await tx.ecommerceCustomerAccount.update({
        where: { id: providerIdentity.customerAccount.id },
        data: { lastLoginAt: now, failedLoginAttempts: 0, lockedUntil: null },
      });
      return providerIdentity.customerAccount;
    }

    if (input.profile.email && input.profile.emailVerified) {
      const emailIdentity = await tx.ecommerceCustomerIdentity.findFirst({
        where: {
          retailOrgId: input.store.retailOrgId,
          identityType: "EMAIL",
          identifierNormalized: input.profile.email,
          verifiedAt: { not: null },
        },
        select: {
          customerAccount: { select: { id: true, retailOrgId: true, status: true } },
        },
      });
      if (emailIdentity) {
        if (emailIdentity.customerAccount.status !== "ACTIVE") {
          throw new EcommerceOAuthError("This customer account is not active.", "failed", 403);
        }
        await tx.ecommerceCustomerIdentity.create({
          data: {
            retailOrgId: input.store.retailOrgId,
            customerAccountId: emailIdentity.customerAccount.id,
            identityType,
            identifier: input.profile.subject,
            identifierNormalized: input.profile.subject,
            isPrimary: false,
            verifiedAt: now,
          },
        });
        await tx.ecommerceCustomerAccount.update({
          where: { id: emailIdentity.customerAccount.id },
          data: { lastLoginAt: now, failedLoginAttempts: 0, lockedUntil: null },
        });
        return emailIdentity.customerAccount;
      }
    }

    const customer = await tx.customer.create({
      data: {
        retailOrgId: input.store.retailOrgId,
        storeId: input.store.id,
        customerNo: `ECOM-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
        customerType: "INDIVIDUAL",
        fullName: input.profile.fullName || `${input.provider === "google" ? "Google" : "Facebook"} customer`,
        email: input.profile.email,
        status: "ACTIVE",
        originNodeCode: "ECOMMERCE",
        lastModifiedByNodeCode: "ECOMMERCE",
      },
    });
    const identities = [
      {
        retailOrgId: input.store.retailOrgId,
        identityType,
        identifier: input.profile.subject,
        identifierNormalized: input.profile.subject,
        isPrimary: true,
        verifiedAt: now,
      },
      ...(input.profile.email && input.profile.emailVerified
        ? [{
            retailOrgId: input.store.retailOrgId,
            identityType: "EMAIL",
            identifier: input.profile.email,
            identifierNormalized: input.profile.email,
            isPrimary: false,
            verifiedAt: now,
          }]
        : []),
    ];
    return tx.ecommerceCustomerAccount.create({
      data: {
        retailOrgId: input.store.retailOrgId,
        customerId: customer.id,
        passwordHash: generatedPasswordHash,
        status: "ACTIVE",
        passwordUpdatedAt: now,
        lastLoginAt: now,
        identities: { create: identities },
      },
      select: { id: true, retailOrgId: true, status: true },
    });
  });

  try {
    return await createOrLink();
  } catch (error) {
    if (error instanceof EcommerceOAuthError) {
      throw error;
    }
    const winner = await prisma.ecommerceCustomerIdentity.findFirst({
      where: {
        retailOrgId: input.store.retailOrgId,
        identityType,
        identifierNormalized: input.profile.subject,
        customerAccount: { status: "ACTIVE" },
      },
      select: { customerAccount: { select: { id: true, retailOrgId: true, status: true } } },
    });
    if (winner) {
      return winner.customerAccount;
    }
    throw error;
  }
}

export async function getConfiguredEcommerceOAuthProviders(storeCode: string, request: Request) {
  await findPublicEcommerceStore(storeCode);
  let publicOriginReady = true;
  try {
    getEcommerceOAuthPublicOrigin(request);
  } catch {
    publicOriginReady = false;
  }
  return getEcommerceOAuthProviderAvailability().map((provider) => ({
    ...provider,
    enabled: provider.enabled && publicOriginReady,
  }));
}

export async function beginEcommerceOAuth(input: {
  provider: EcommerceOAuthProvider;
  request: Request;
  storeCode: string;
  returnTo: string | null;
}) {
  await findPublicEcommerceStore(input.storeCode);
  const config = resolveEcommerceOAuthProviderConfig(input.provider);
  if (!config) {
    throw new EcommerceOAuthError(
      `${input.provider === "google" ? "Google" : "Facebook"} sign-in is not configured.`,
      "unavailable",
      503,
    );
  }

  const origin = getEcommerceOAuthPublicOrigin(input.request);
  const redirectUri = callbackUrl(origin, input.storeCode, input.provider);
  const state = crypto.randomBytes(32).toString("base64url");
  const codeVerifier = input.provider === "google" ? crypto.randomBytes(48).toString("base64url") : null;
  const returnTo = sanitizeEcommerceOAuthReturnTo(input.returnTo, input.storeCode);
  const signedState = serializeEcommerceOAuthState(
    {
      version: 1,
      provider: input.provider,
      storeCode: input.storeCode,
      state,
      returnTo,
      redirectUri,
      codeVerifier,
      expiresAt: Date.now() + ecommerceOAuthLifetimeMs,
    },
    getEcommerceAuthSecret(),
  );
  const cookieStore = await cookies();
  cookieStore.set(oauthCookieName(input.provider), signedState, {
    httpOnly: true,
    secure: new URL(origin).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ecommerceOAuthLifetimeMs / 1000),
  });

  return buildEcommerceOAuthAuthorizationUrl({
    config,
    redirectUri,
    state,
    codeChallenge: codeVerifier ? createEcommerceOAuthCodeChallenge(codeVerifier) : null,
  });
}

export async function completeEcommerceOAuth(input: {
  provider: EcommerceOAuthProvider;
  request: Request;
  storeCode: string;
}) {
  const requestUrl = new URL(input.request.url);
  const cookieStore = await cookies();
  const state = parseEcommerceOAuthState(
    cookieStore.get(oauthCookieName(input.provider))?.value,
    getEcommerceAuthSecret(),
  );
  cookieStore.delete(oauthCookieName(input.provider));
  const fallbackReturnTo = sanitizeEcommerceOAuthReturnTo(null, input.storeCode);

  if (
    !state ||
    state.provider !== input.provider ||
    state.storeCode.toLowerCase() !== input.storeCode.toLowerCase() ||
    !secureTextEquals(state.state, requestUrl.searchParams.get("state") ?? "")
  ) {
    throw new EcommerceOAuthError(
      "The social sign-in request expired or could not be verified.",
      "failed",
      400,
      state?.returnTo ?? fallbackReturnTo,
    );
  }

  if (requestUrl.searchParams.get("error")) {
    throw new EcommerceOAuthError(
      "Social sign-in was cancelled.",
      "cancelled",
      400,
      state.returnTo,
    );
  }
  const code = requestUrl.searchParams.get("code")?.trim();
  const config = resolveEcommerceOAuthProviderConfig(input.provider);
  if (!code || !config) {
    throw new EcommerceOAuthError(
      "Social sign-in could not be completed.",
      config ? "failed" : "unavailable",
      config ? 400 : 503,
      state.returnTo,
    );
  }

  try {
    const accessToken = await exchangeAuthorizationCode({
      config,
      code,
      redirectUri: state.redirectUri,
      codeVerifier: state.codeVerifier,
    });
    const profile = input.provider === "google"
      ? await loadGoogleProfile(config, accessToken)
      : await loadFacebookProfile(config, accessToken);
    const store = await findPublicEcommerceStore(input.storeCode);
    const account = await resolveCustomerAccount({ provider: input.provider, profile, store });
    await createEcommerceCustomerSession({
      retailOrgId: account.retailOrgId,
      customerAccountId: account.id,
    });
  } catch (error) {
    if (error instanceof EcommerceOAuthError) {
      error.returnTo ??= state.returnTo;
    }
    throw error;
  }

  return { returnTo: state.returnTo };
}

export function buildEcommerceOAuthResultUrl(input: {
  origin: string;
  returnTo: string;
  provider: EcommerceOAuthProvider;
  result: "success" | EcommerceOAuthError["resultCode"];
}) {
  const url = new URL(input.returnTo, input.origin);
  url.searchParams.set("socialAuth", input.result);
  url.searchParams.set("socialProvider", input.provider);
  return url;
}
