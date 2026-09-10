import { NextResponse, type NextRequest } from "next/server";

import {
  enforceEnterpriseRateLimit,
  type EnterpriseRateLimitPolicy
} from "@/server/performance/enterprise-distributed-rate-limit";

type RouteRateLimitPolicy = EnterpriseRateLimitPolicy & {
  methods: string[];
  pattern: RegExp;
};

const sensitiveRoutePolicies: RouteRateLimitPolicy[] = [
  { scope: "hq-sign-in", limit: 10, windowMs: 15 * 60_000, methods: ["POST"], pattern: /^\/api\/auth\/sign-in$/ },
  { scope: "hq-mfa", limit: 10, windowMs: 10 * 60_000, methods: ["POST"], pattern: /^\/api\/auth\/mfa\/verify$/ },
  { scope: "hq-password-recovery", limit: 5, windowMs: 60 * 60_000, methods: ["POST"], pattern: /^\/api\/auth\/(?:forgot-password|reset-password)$/ },
  { scope: "trial-signup", limit: 5, windowMs: 60 * 60_000, methods: ["POST"], pattern: /^\/api\/trials$/ },
  { scope: "trial-verify", limit: 10, windowMs: 15 * 60_000, methods: ["POST"], pattern: /^\/api\/trials\/verify$/ },
  { scope: "trial-status", limit: 120, windowMs: 60_000, methods: ["POST"], pattern: /^\/api\/trials\/status$/ },
  { scope: "trial-callback", limit: 120, windowMs: 60_000, methods: ["POST"], pattern: /^\/api\/trials\/provisioning-callback$/ },
  { scope: "trial-password-reset-delivery", limit: 120, windowMs: 60_000, methods: ["POST"], pattern: /^\/api\/trials\/password-reset-delivery$/ },
  { scope: "shop-otp", limit: 5, windowMs: 10 * 60_000, methods: ["POST"], pattern: /^\/api\/ecommerce\/[^/]+\/auth\/request-otp$/ },
  { scope: "shop-auth", limit: 10, windowMs: 15 * 60_000, methods: ["POST"], pattern: /^\/api\/ecommerce\/[^/]+\/auth\/(?:sign-in|verify-signup|reset-password)$/ },
  { scope: "shop-checkout", limit: 30, windowMs: 60_000, methods: ["POST"], pattern: /^\/api\/ecommerce\/[^/]+\/orders$/ },
  { scope: "shop-payment", limit: 15, windowMs: 60_000, methods: ["POST"], pattern: /^\/api\/ecommerce\/[^/]+\/orders\/[^/]+\/payments$/ },
  { scope: "shop-refund", limit: 5, windowMs: 60 * 60_000, methods: ["POST"], pattern: /^\/api\/ecommerce\/[^/]+\/orders\/[^/]+\/refunds$/ },
  { scope: "shop-review", limit: 10, windowMs: 60_000, methods: ["POST"], pattern: /^\/api\/ecommerce\/[^/]+\/products\/[^/]+\/reviews$/ },
  { scope: "shop-quote", limit: 60, windowMs: 60_000, methods: ["POST"], pattern: /^\/api\/ecommerce\/[^/]+\/quote$/ }
];

async function clientIdentity(request: NextRequest) {
  const trustProxyHeaders = process.env.FLASH_ERP_TRUST_PROXY_HEADERS === "true";
  const forwardedFor = trustProxyHeaders
    ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    : null;
  const remoteAddress = forwardedFor || (trustProxyHeaders ? request.headers.get("x-real-ip")?.trim() : null);
  const sessionFingerprint =
    request.cookies.get("flash_erp_session")?.value ||
    request.cookies.get("flash_erp_ecommerce_session")?.value ||
    "anonymous";
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || "";
  let submittedIdentity = "";
  if (request.method === "POST" && request.headers.get("content-type")?.includes("application/json")) {
    const payload = await request.clone().json().catch(() => null) as Record<string, unknown> | null;
    submittedIdentity = [
      payload?.loginId,
      payload?.identifier,
      payload?.challengeToken,
      payload?.email,
      payload?.phone
    ].find((value) => typeof value === "string" && value.trim())?.toString().trim() ?? "";
  }
  return [
    remoteAddress || "unresolved",
    sessionFingerprint,
    submittedIdentity,
    idempotencyKey,
    request.headers.get("user-agent") || "unknown"
  ].join("|");
}

function requestRateLimitPolicy(request: NextRequest) {
  if (process.env.FLASH_ERP_RATE_LIMIT_ENABLED === "false") return null;
  return sensitiveRoutePolicies.find(
    (policy) => policy.methods.includes(request.method) && policy.pattern.test(request.nextUrl.pathname)
  ) ?? null;
}

function setBaseResponseHeaders(response: NextResponse, requestId: string) {
  response.headers.set("x-request-id", requestId);
  response.headers.set("x-flash-erp-worker", process.env.FLASH_ERP_WEB_WORKER_ID ?? "single");
  response.headers.set("x-content-type-options", "nosniff");
}

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const requestId = request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set(
    "x-flash-erp-return-path",
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );

  const policy = requestRateLimitPolicy(request);
  const rateLimit = policy
    ? await enforceEnterpriseRateLimit(policy, await clientIdentity(request))
    : null;

  if (rateLimit && !rateLimit.allowed) {
    const response = NextResponse.json(
      {
        code: "ENTERPRISE_RATE_LIMITED",
        message: "Too many requests. Wait briefly, then try again.",
        requestId
      },
      { status: 429 }
    );
    setBaseResponseHeaders(response, requestId);
    response.headers.set("cache-control", "no-store");
    response.headers.set("retry-after", String(rateLimit.retryAfterSeconds));
    response.headers.set("ratelimit-limit", String(rateLimit.limit));
    response.headers.set("ratelimit-remaining", "0");
    response.headers.set("ratelimit-reset", rateLimit.resetAt);
    return response;
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
  setBaseResponseHeaders(response, requestId);
  if (rateLimit) {
    response.headers.set("ratelimit-limit", String(rateLimit.limit));
    response.headers.set("ratelimit-remaining", String(rateLimit.remaining));
    response.headers.set("ratelimit-reset", rateLimit.resetAt);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/).*)"]
};
