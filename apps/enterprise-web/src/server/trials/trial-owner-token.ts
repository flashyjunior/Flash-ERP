import crypto from "node:crypto";

const TOKEN_VERSION = 1;

export type TrialOwnerActivationPayload = {
  requestId: string;
  retailOrgId: string;
  userId: string;
  email: string;
  exp: number;
  nonce: string;
};

function activationSecret() {
  const secret = process.env.FLASH_ERP_TRIAL_WORKSPACE_SECRET?.trim();
  if (!secret) throw new Error("The trial workspace activation secret is not configured.");
  return secret;
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", activationSecret()).update(payload).digest("base64url");
}

function secureEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createTrialOwnerActivationToken(input: Omit<TrialOwnerActivationPayload, "nonce">) {
  const payload = Buffer.from(
    JSON.stringify({
      v: TOKEN_VERSION,
      ...input,
      email: input.email.trim().toLowerCase(),
      nonce: crypto.randomBytes(18).toString("base64url")
    }),
    "utf8"
  ).toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

export function readTrialOwnerActivationToken(token: string): TrialOwnerActivationPayload {
  const [encodedPayload, signature] = token.trim().split(".");
  if (!encodedPayload || !signature || !secureEquals(signature, signPayload(encodedPayload))) {
    throw new Error("This trial activation link is invalid.");
  }

  let payload: TrialOwnerActivationPayload & { v?: number };
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new Error("This trial activation link is invalid.");
  }

  if (
    payload.v !== TOKEN_VERSION ||
    !payload.requestId ||
    !payload.retailOrgId ||
    !payload.userId ||
    !payload.email ||
    !payload.nonce ||
    !Number.isFinite(payload.exp)
  ) {
    throw new Error("This trial activation link is invalid.");
  }
  if (payload.exp <= Date.now()) throw new Error("This trial activation link has expired.");

  return payload;
}
