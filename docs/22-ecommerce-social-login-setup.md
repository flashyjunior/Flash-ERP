# Ecommerce Social Login Setup

Updated: 2026-08-22

Flash ERP supports Google and Facebook as additional customer sign-in and signup options. Social accounts use the existing ecommerce customer account and `flash_erp_shop_session`; they do not create a separate checkout identity or session system.

## Prerequisites

- Serve the public storefront over HTTPS. Local development may use `http://localhost` or `http://127.0.0.1`.
- Set `FLASH_ERP_ECOMMERCE_PUBLIC_URL` to the exact public origin, without a path or trailing route.
- Keep all client/app secrets in the deployment environment. Never add them to a deployment ZIP, source control, browser configuration, or `NEXT_PUBLIC_*` variable.

## Environment Settings

```dotenv
FLASH_ERP_ECOMMERCE_PUBLIC_URL="https://shop.example.com"
FLASH_ERP_ECOMMERCE_GOOGLE_CLIENT_ID=""
FLASH_ERP_ECOMMERCE_GOOGLE_CLIENT_SECRET=""
FLASH_ERP_ECOMMERCE_FACEBOOK_APP_ID=""
FLASH_ERP_ECOMMERCE_FACEBOOK_APP_SECRET=""
```

A provider button becomes available only when both credentials for that provider are set and the public storefront URL is HTTPS or a local-development URL.

## Provider Callbacks

Register one exact callback for each public storefront code used by the application:

```text
https://shop.example.com/api/ecommerce/<STORE_CODE>/auth/oauth/google/callback
https://shop.example.com/api/ecommerce/<STORE_CODE>/auth/oauth/facebook/callback
```

The scheme, hostname, port, path, and store code must match the deployed URL exactly. Google needs the `openid`, `email`, and `profile` scopes. Facebook needs `email` and `public_profile`.

## Account Rules

- Google sign-in requires a verified email. A matching verified ecommerce email account is linked to the Google subject ID and retains its existing orders and profile.
- Facebook accounts are keyed by the Facebook subject ID. A returned Facebook email is copied to the customer profile but is not treated as a verified email identity.
- Provider access tokens and provider secrets are never persisted. Flash ERP stores only the provider subject identity and the normal local customer session.
- OAuth state is signed, expires after ten minutes, is bound to the provider and storefront, and permits only internal `/shop/...` return paths. Google authorization also uses PKCE.

After changing credentials, restart the Enterprise Web service and confirm that the provider availability route reports the intended buttons before testing sign-in:

```text
GET /api/ecommerce/<STORE_CODE>/auth/oauth/providers
```
