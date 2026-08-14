import { NextResponse } from "next/server";

import {
  EcommerceAuthError,
  requestEcommerceOtp
} from "@/server/ecommerce/ecommerce-customer-auth";

export async function POST(
  request: Request,
  context: { params: Promise<{ storeCode: string }> }
) {
  try {
    const { storeCode } = await context.params;
    const body = (await request.json()) as {
      identifier?: string;
      purpose?: "SIGN_UP" | "PASSWORD_RESET";
    };
    return NextResponse.json(
      await requestEcommerceOtp({
        storeCode,
        identifier: body.identifier,
        purpose: body.purpose
      })
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Verification code could not be sent." },
      { status: error instanceof EcommerceAuthError ? error.status : 400 }
    );
  }
}
