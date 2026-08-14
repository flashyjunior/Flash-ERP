import { NextResponse } from "next/server";

import {
  EcommerceAuthError,
  verifyEcommerceSignup
} from "@/server/ecommerce/ecommerce-customer-auth";

export async function POST(
  request: Request,
  context: { params: Promise<{ storeCode: string }> }
) {
  try {
    const { storeCode } = await context.params;
    const body = (await request.json()) as {
      challengeId?: string;
      code?: string;
      fullName?: string;
      password?: string;
    };
    return NextResponse.json(
      await verifyEcommerceSignup({
        storeCode,
        challengeId: body.challengeId,
        code: body.code,
        fullName: body.fullName,
        password: body.password
      })
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Your account could not be created." },
      { status: error instanceof EcommerceAuthError ? error.status : 400 }
    );
  }
}
