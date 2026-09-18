import { NextResponse } from "next/server";

import { EcommerceAuthError } from "@/server/ecommerce/ecommerce-customer-auth";
import { beginEcommerceOAuth } from "@/server/ecommerce/ecommerce-customer-oauth";
import { parseEcommerceOAuthProvider } from "@/server/ecommerce/ecommerce-customer-oauth-contract";

export async function GET(
  request: Request,
  context: { params: Promise<{ storeCode: string; provider: string }> },
) {
  try {
    const { storeCode, provider: providerValue } = await context.params;
    const provider = parseEcommerceOAuthProvider(providerValue);
    if (!provider) {
      return NextResponse.json({ message: "This social sign-in provider is not supported." }, { status: 404 });
    }
    const authorizationUrl = await beginEcommerceOAuth({
      provider,
      request,
      storeCode,
      returnTo: new URL(request.url).searchParams.get("returnTo"),
    });
    return NextResponse.redirect(authorizationUrl, { status: 302 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Social sign-in could not be started." },
      { status: error instanceof EcommerceAuthError ? error.status : 400 },
    );
  }
}
