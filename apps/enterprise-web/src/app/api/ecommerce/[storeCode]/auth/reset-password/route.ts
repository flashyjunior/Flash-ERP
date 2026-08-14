import { NextResponse } from "next/server";

import {
  EcommerceAuthError,
  resetEcommerceCustomerPassword
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
      password?: string;
    };
    return NextResponse.json(
      await resetEcommerceCustomerPassword({
        storeCode,
        challengeId: body.challengeId,
        code: body.code,
        password: body.password
      })
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Password could not be updated." },
      { status: error instanceof EcommerceAuthError ? error.status : 400 }
    );
  }
}
