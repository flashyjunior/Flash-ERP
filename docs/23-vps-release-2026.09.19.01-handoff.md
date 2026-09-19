# VPS Release 2026.09.19.01 — Build, Verification and Deployment Handoff

Session branch: `arena/01a0b7f7-flash-erp` (branched from `master @ 334f268`, which
already contains the merged PR #24 mobile / API / auth work).

## What this session produced

A verified, deployable VPS release package built entirely inside the Arena
sandbox (Linux), because the sandbox network allows the npm registry but not
`binaries.prisma.sh`, Google Fonts, the EAS API or the VPS itself:

- **Package ZIP:** `artifacts/releases/FlashERP-HQ-2026.09.19.01-VPS-Deploy-Resolved.zip`
  (64 MB, gitignored — ship the file itself, not the path)
- **ZIP SHA-256:** `9EB69A2AF66F61AD380BD6D177772E0E69AF3D0A16B21FA668F5473F7CF4B66E`
- **Next BUILD_ID:** `pr-vq-c8nlOfaw0Knyv6F`
- **Source commit:** `334f268` (working tree clean, `sourceDirty=false`)
- **Recorded migrations:** 61 (`20260522000000_init_sqlserver` … `20260827010000_trial_workspace_lifecycle`)
- **Materialized runtime aliases:** `@prisma/client-2c3a283f134fdcb6`, `postcss-9745a0d11e3197ae`

The ZIP has the same flat operator layout as the official
`scripts/package-flash-erp-vps-release.ps1` output:

```
Deploy Flash ERP 2026.09.19.01.cmd
deploy-flash-erp-2026.09.19.01.ps1
release-manifest.json            (packageVersion 2)
FlashRMS-2026.09.19.01-runtime.zip
FlashRMS-2026.09.19.01-runtime.zip.sha256.txt
README-FIRST.txt
```

## How the package was built in the sandbox

1. `npm ci` (registry reachable; `ELECTRON_SKIP_BINARY_DOWNLOAD=1` for the desktop workspace).
2. `prisma generate` is **impossible in the sandbox** (schema-engine download is
   blocked). This does not change the payload: generated client output lives in
   `node_modules/.prisma/client`, which is never part of the package, and the
   VPS deployer runs `prisma migrate deploy` + `prisma generate` in the release
   directory before switching the scheduled task.
   - To let `next build` pass its page-data collection phase, a build-time stub
     was placed at `node_modules/.prisma/client/default.js` (node_modules only,
     gitignored, never shipped). The stub loads cleanly, exposes `Prisma` /
     `PrismaClient`, and throws loudly if any real database operation is
     attempted. The real client replaces it on the VPS at deploy time.
3. `next build` (Turbopack) with the official deploy environment
   (`FLASH_ERP_DEPLOY_BUILD=1`, 1 worker, 1024 MB heap).
4. `next/font/google` (Inter, `signup/page.tsx`) is fetched at build time from
   `fonts.googleapis.com` (blocked). The build used Next's official
   `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` hook: a local HTTP server on
   `127.0.0.1:8765` served the real Inter latin variable `woff2` (sourced from
   the npm `@fontsource-variable/inter` package), so the shipped font bytes are
   identical to what a normal build embeds.
5. Packaging used a line-for-line Linux port of
   `scripts/package-flash-erp-vps-release.ps1` (session scratch script, not
   committed): same payload assembly, same required/forbidden path assertions,
   same alias materialization and checks, same manifests, same ZIP
   round-trip verifications, same `.cmd` launcher and README content.

## Verification status (this session)

Green:

- `@flash-erp/mobile` typecheck — 0 errors
- `@flash-erp/domain` typecheck — 0 errors
- `@flash-erp/sync-core` typecheck — 0 errors
- `acceptance:alternate-uom` — passed
- `acceptance:layaway-policy` — passed
- `acceptance:layaway-lifecycle` — passed
- `acceptance:sync-hardening` — passed
- Deploy build `next build` — succeeded (all routes, BUILD_ID above)
- Payload assertions: required runtime paths present, no forbidden paths
  (no `standalone`/`cache`/`dev`/`public/uploads`/root `node_modules`), zero
  `.env*` files, alias materialization (package.json + main + `index.js` for
  the Prisma alias), BUILD_ID match, inner and outer ZIP re-extraction
  verification, manifest checksum match
- New surface confirmed inside the packaged payload: `/api` directory route,
  `/api/auth/sign-in`, `/api/auth/mfa/verify`, and the `flash_rms_session`
  Bearer/Cookie session helper

Skipped (Windows-only, cannot run in a Linux sandbox):

- PowerShell 5.1 parse checks of the trial-workspace and deploy scripts
- Hydrated release layout regression gate (runs the deployer with Windows
  junctions)
- Missing-task no-write preflight guard

Residual risk is contained: the packaged deployer itself re-asserts the
hydrated payload layout, runs migrations, regenerates Prisma Client, switches
the `FlashRMSHQ` task and runs the 60-second health soak — and restores the
previous task action if sustained health fails. For a belt-and-braces check,
run the official PowerShell packager (or at least
`scripts/smoke-flash-erp-vps-release-package.ps1`) on a Windows machine before
shipping; the payload layout this session produced is the same contract the
deployer verifies.

## Deploying to the VPS (from a machine that can reach `84.247.188.30`)

1. Copy `FlashERP-HQ-2026.09.19.01-VPS-Deploy-Resolved.zip` to
   `C:\Users\Demo\Desktop` on the VPS.
2. Elevated PowerShell: extract, then run the launcher:
   ```powershell
   Expand-Archive -LiteralPath '.\FlashERP-HQ-2026.09.19.01-VPS-Deploy-Resolved.zip' -DestinationPath '.\FlashERP-HQ-2026.09.19.01-VPS-Deploy-Resolved'
   Set-Location '.\FlashERP-HQ-2026.09.19.01-VPS-Deploy-Resolved'
   & '.\Deploy Flash ERP 2026.09.19.01.cmd'
   ```
3. Success = `FlashRMSHQ` Running, port 3000 listening for 60 s,
   `ready=true`, and HTTP 200 from local + public live/readiness/catalog/
   storefront checks (all automatic in the deployer).
4. After deploy, confirm the new `/api` endpoint:
   `Invoke-RestMethod http://84.247.188.30:3000/api` (route directory + health).
5. Do not reuse the release directory on failure — build a fresh release ID.

## Still outstanding (needs the user's machine / credentials)

- **APK:** `eas-cli build -p android --profile preview` in `apps/mobile`
  requires the EAS API (unreachable from the sandbox) plus the user's Expo
  account token. Run it locally, or add `EXPO_TOKEN` to a machine that can
  reach `api.expo.dev`.
- **Live floor-workflow test** (barcode scan, outbox drain against the live
  VPS) — the sandbox has no route to `84.247.188.30`; do this after the deploy
  above, with the installed APK against the live HQ.
