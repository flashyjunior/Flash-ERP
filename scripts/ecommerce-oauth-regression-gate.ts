import assert from "node:assert/strict";

import {
  buildEcommerceOAuthAuthorizationUrl,
  createEcommerceOAuthCodeChallenge,
  getEcommerceOAuthProviderAvailability,
  parseEcommerceOAuthState,
  resolveEcommerceOAuthProviderConfig,
  sanitizeEcommerceOAuthReturnTo,
  serializeEcommerceOAuthState,
  type EcommerceOAuthState,
} from "../apps/enterprise-web/src/server/ecommerce/ecommerce-customer-oauth-contract";

const environment = {
  FLASH_ERP_ECOMMERCE_GOOGLE_CLIENT_ID: "google-client",
  FLASH_ERP_ECOMMERCE_GOOGLE_CLIENT_SECRET: "google-secret",
  FLASH_ERP_ECOMMERCE_FACEBOOK_APP_ID: "facebook-app",
  FLASH_ERP_ECOMMERCE_FACEBOOK_APP_SECRET: "facebook-secret",
} as NodeJS.ProcessEnv;
const availability = getEcommerceOAuthProviderAvailability(environment);
assert.deepEqual(availability, [
  { id: "google", enabled: true },
  { id: "facebook", enabled: true },
]);
assert.equal(getEcommerceOAuthProviderAvailability({} as NodeJS.ProcessEnv).every((item) => !item.enabled), true);

const googleConfig = resolveEcommerceOAuthProviderConfig("google", environment);
assert.ok(googleConfig);
const codeVerifier = "oauth-code-verifier-with-enough-entropy-for-the-regression-gate";
const codeChallenge = createEcommerceOAuthCodeChallenge(codeVerifier);
const authorizationUrl = buildEcommerceOAuthAuthorizationUrl({
  config: googleConfig,
  redirectUri: "https://shop.example.com/api/ecommerce/accra/auth/oauth/google/callback",
  state: "csrf-state",
  codeChallenge,
});
assert.equal(authorizationUrl.origin, "https://accounts.google.com");
assert.equal(authorizationUrl.searchParams.get("response_type"), "code");
assert.equal(authorizationUrl.searchParams.get("state"), "csrf-state");
assert.equal(authorizationUrl.searchParams.get("code_challenge"), codeChallenge);
assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
assert.match(authorizationUrl.searchParams.get("scope") ?? "", /openid/);

assert.equal(
  sanitizeEcommerceOAuthReturnTo("/shop/accra-shop?cart=open", "accra-shop"),
  "/shop/accra-shop?cart=open",
);
assert.equal(
  sanitizeEcommerceOAuthReturnTo("https://attacker.example/collect", "accra-shop"),
  "/shop/accra-shop",
);
assert.equal(
  sanitizeEcommerceOAuthReturnTo("//attacker.example/collect", "accra-shop"),
  "/shop/accra-shop",
);

const now = Date.now();
const state: EcommerceOAuthState = {
  version: 1,
  provider: "google",
  storeCode: "accra-shop",
  state: "csrf-state",
  returnTo: "/shop/accra-shop",
  redirectUri: "https://shop.example.com/api/ecommerce/accra-shop/auth/oauth/google/callback",
  codeVerifier,
  expiresAt: now + 60_000,
};
const signedState = serializeEcommerceOAuthState(state, "test-secret");
assert.deepEqual(parseEcommerceOAuthState(signedState, "test-secret", now), state);
assert.equal(parseEcommerceOAuthState(`${signedState.slice(0, -1)}x`, "test-secret", now), null);
assert.equal(parseEcommerceOAuthState(signedState, "wrong-secret", now), null);
assert.equal(parseEcommerceOAuthState(signedState, "test-secret", now + 61_000), null);

console.log(
  "Ecommerce OAuth regression gate passed: provider configuration, PKCE, signed state, expiry, and return URLs are governed.",
);
