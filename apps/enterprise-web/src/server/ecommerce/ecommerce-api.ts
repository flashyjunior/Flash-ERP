import { NextResponse } from "next/server";

import { EcommerceAuthError } from "@/server/ecommerce/ecommerce-customer-auth";

export function ecommerceErrorResponse(error: unknown, fallback: string) {
  const status =
    error instanceof EcommerceAuthError
      ? error.status
      : typeof error === "object" && error !== null && "status" in error &&
          typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : 400;
  return NextResponse.json(
    { message: error instanceof Error ? error.message : fallback },
    { status }
  );
}
