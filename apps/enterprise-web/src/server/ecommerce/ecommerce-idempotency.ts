import crypto from "node:crypto";

import { Prisma } from "@prisma/client";

import { EcommerceAuthError } from "@/server/ecommerce/ecommerce-customer-auth";

export function requireEcommerceIdempotencyKey(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  if (key.length < 16 || key.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new EcommerceAuthError(
      "This request needs a valid Idempotency-Key before it can be processed.",
      400
    );
  }
  return key;
}

export function hashEcommerceIdempotencyPayload(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
