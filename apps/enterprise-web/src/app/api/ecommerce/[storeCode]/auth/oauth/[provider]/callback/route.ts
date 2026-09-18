import { NextResponse } from "next/server";

import {
  buildEcommerceOAuthResultUrl,
  completeEcommerceOAuth,
  EcommerceOAuthError,
  getEcommerceOAuthPublicOrigin,
} from "@/server/ecommerce/ecommerce-customer-oauth";
import {
  parseEcommerceOAuthProvider,
  sanitizeEcommerceOAuthReturnTo,
} from "@/server/ecommerce/ecommerce-customer-oauth-contract";

export async function GET(
  request: Request,
  context: { params: Promise<{ storeCode: string; provider: string }> },
) {
  const { storeCode, provider: providerValue } = await context.params;
  const provider = parseEcommerceOAuthProvider(providerValue);
  if (!provider) {
    return NextResponse.json({ message: "This social sign-in provider is not supported." }, { status: 404 });
  }

  let origin: string;
  try {
    origin = getEcommerceOAuthPublicOrigin(request);
  } catch {
    origin = new URL(request.url).origin;
  }

  try {
    const result = await completeEcommerceOAuth({ provider, request, storeCode });
    return NextResponse.redirect(buildEcommerceOAuthResultUrl({
      origin,
      returnTo: result.returnTo,
      provider,
      result: "success",
    }), { status: 302 });
  } catch (error) {
    const oauthError = error instanceof EcommerceOAuthError ? error : null;
    return NextResponse.redirect(buildEcommerceOAuthResultUrl({
      origin,
      returnTo: oauthError?.returnTo ?? sanitizeEcommerceOAuthReturnTo(null, storeCode),
      provider,
      result: oauthError?.resultCode ?? "failed",
    }), { status: 302 });
  }
}
