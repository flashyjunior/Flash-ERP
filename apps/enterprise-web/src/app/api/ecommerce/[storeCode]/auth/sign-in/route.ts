import { NextResponse } from "next/server";

import {
  EcommerceAuthError,
  signInEcommerceCustomer
} from "@/server/ecommerce/ecommerce-customer-auth";

export async function POST(
  request: Request,
  context: { params: Promise<{ storeCode: string }> }
) {
  try {
    const { storeCode } = await context.params;
    const body = (await request.json()) as { identifier?: string; password?: string };
    return NextResponse.json(
      await signInEcommerceCustomer({
        storeCode,
        identifier: body.identifier,
        password: body.password
      })
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Sign-in failed." },
      { status: error instanceof EcommerceAuthError ? error.status : 400 }
    );
  }
}
