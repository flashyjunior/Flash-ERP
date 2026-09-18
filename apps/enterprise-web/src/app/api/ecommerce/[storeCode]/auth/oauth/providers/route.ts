import { NextResponse } from "next/server";

import {
  EcommerceAuthError,
} from "@/server/ecommerce/ecommerce-customer-auth";
import {
  getConfiguredEcommerceOAuthProviders,
} from "@/server/ecommerce/ecommerce-customer-oauth";

export async function GET(
  request: Request,
  context: { params: Promise<{ storeCode: string }> },
) {
  try {
    const { storeCode } = await context.params;
    return NextResponse.json({ providers: await getConfiguredEcommerceOAuthProviders(storeCode, request) });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Social sign-in options could not be read." },
      { status: error instanceof EcommerceAuthError ? error.status : 400 },
    );
  }
}
