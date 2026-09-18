import crypto from "node:crypto";

export const ecommerceOAuthProviders = ["google", "facebook"] as const;

export type EcommerceOAuthProvider = (typeof ecommerceOAuthProviders)[number];

export type EcommerceOAuthProviderConfig = {
  provider: EcommerceOAuthProvider;
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  scopes: string[];
};

export type EcommerceOAuthState = {
  version: 1;
  provider: EcommerceOAuthProvider;
  storeCode: string;
  state: string;
  returnTo: string;
  redirectUri: string;
  codeVerifier: string | null;
  expiresAt: number;
};

function optionalText(value: string | undefined) {
  return value?.trim() || null;
}

export function parseEcommerceOAuthProvider(value: string): EcommerceOAuthProvider | null {
  const normalized = value.trim().toLowerCase();
  return ecommerceOAuthProviders.find((provider) => provider === normalized) ?? null;
}

export function resolveEcommerceOAuthProviderConfig(
  provider: EcommerceOAuthProvider,
  environment: NodeJS.ProcessEnv = process.env,
): EcommerceOAuthProviderConfig | null {
  if (provider === "google") {
    const clientId = optionalText(environment.FLASH_ERP_ECOMMERCE_GOOGLE_CLIENT_ID);
    const clientSecret = optionalText(environment.FLASH_ERP_ECOMMERCE_GOOGLE_CLIENT_SECRET);
    return clientId && clientSecret
      ? {
          provider,
          clientId,
          clientSecret,
          authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
          tokenEndpoint: "https://oauth2.googleapis.com/token",
          userInfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
          scopes: ["openid", "email", "profile"],
        }
      : null;
  }

  const clientId = optionalText(environment.FLASH_ERP_ECOMMERCE_FACEBOOK_APP_ID);
  const clientSecret = optionalText(environment.FLASH_ERP_ECOMMERCE_FACEBOOK_APP_SECRET);
  return clientId && clientSecret
    ? {
        provider,
        clientId,
        clientSecret,
        authorizationEndpoint: "https://www.facebook.com/dialog/oauth",
        tokenEndpoint: "https://graph.facebook.com/oauth/access_token",
        userInfoEndpoint: "https://graph.facebook.com/me",
        scopes: ["email", "public_profile"],
      }
    : null;
}

export function getEcommerceOAuthProviderAvailability(
  environment: NodeJS.ProcessEnv = process.env,
) {
  return ecommerceOAuthProviders.map((provider) => ({
    id: provider,
    enabled: Boolean(resolveEcommerceOAuthProviderConfig(provider, environment)),
  }));
}

export function sanitizeEcommerceOAuthReturnTo(value: string | null, storeCode: string) {
  const fallback = `/shop/${encodeURIComponent(storeCode)}`;
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "https://flash-erp.invalid");
    if (parsed.origin !== "https://flash-erp.invalid" || !parsed.pathname.startsWith("/shop/")) {
      return fallback;
    }
    parsed.hash = "";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}

export function createEcommerceOAuthCodeChallenge(codeVerifier: string) {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

export function buildEcommerceOAuthAuthorizationUrl(input: {
  config: EcommerceOAuthProviderConfig;
  redirectUri: string;
  state: string;
  codeChallenge?: string | null;
}) {
  const url = new URL(input.config.authorizationEndpoint);
  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.config.scopes.join(" "));
  url.searchParams.set("state", input.state);

  if (input.config.provider === "google") {
    url.searchParams.set("include_granted_scopes", "true");
    if (input.codeChallenge) {
      url.searchParams.set("code_challenge", input.codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
    }
  }

  return url;
}

function signPayload(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function serializeEcommerceOAuthState(state: EcommerceOAuthState, secret: string) {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  return `${payload}.${signPayload(payload, secret)}`;
}

export function parseEcommerceOAuthState(
  value: string | null | undefined,
  secret: string,
  now = Date.now(),
): EcommerceOAuthState | null {
  const [payload, suppliedSignature, extra] = value?.split(".") ?? [];
  if (!payload || !suppliedSignature || extra) {
    return null;
  }

  const expectedSignature = signPayload(payload, secret);
  const expectedBuffer = Buffer.from(expectedSignature);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  if (
    expectedBuffer.length !== suppliedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<EcommerceOAuthState>;
    if (
      parsed.version !== 1 ||
      !ecommerceOAuthProviders.includes(parsed.provider as EcommerceOAuthProvider) ||
      typeof parsed.storeCode !== "string" ||
      typeof parsed.state !== "string" ||
      typeof parsed.returnTo !== "string" ||
      typeof parsed.redirectUri !== "string" ||
      (typeof parsed.codeVerifier !== "string" && parsed.codeVerifier !== null) ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= now
    ) {
      return null;
    }
    return parsed as EcommerceOAuthState;
  } catch {
    return null;
  }
}
