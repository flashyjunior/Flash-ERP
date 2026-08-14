# 12. Production Certification And Soak Plan

Last updated: 2026-05-01

This plan closes the gap between "implemented in code" and "safe to call production-ready." It is intentionally practical: every item names the command, environment, or human sign-off needed before Flash ERP should be presented as fully certified for the initial iVend-like desktop and HQ scope.

## Automated Gates

Run these from the repository root before each parity sign-off:

```powershell
npm run prisma:validate
npm run acceptance:rms
npm run smoke:desktop
npm run soak:desktop
npm run cert:hardware
npm run acceptance:parity
npm run acceptance:sync-hardening
npm run acceptance:desktop-stability
npm run acceptance:e2e
npm run acceptance:sync-chaos
npm run cert:installed-soak
npm run cert:security-providers
npm run cert:hardware-execution
npm run acceptance:functional-uat
npm run cert:database-readiness
npm run acceptance:capacity-hardening
npm run acceptance:production-hardening
npm run e2e:certification
npm run typecheck
npm run build
```

`npm run acceptance:rms` proves seeded HQ data depth and advanced promotion scenarios. `npm run smoke:desktop` checks packaged-runtime readiness. `npm run soak:desktop` checks release, support, updater, tray sync, and runtime diagnostics coverage. `npm run cert:hardware` checks that printer, scanner, drawer, and peripheral certification anchors remain wired. `npm run acceptance:parity` checks that the committed parity matrix, security hardening, external-service validation, and production-readiness artifacts are present. `npm run acceptance:sync-hardening` checks sync run id correlation, retry windows, invalid acknowledgement rejection, upstream transport failure handling, and downstream redelivery backoff. `npm run acceptance:desktop-stability` checks sign-in stall protection, renderer watchdog status, stale heartbeat recovery, persisted maximize/resize posture, and black-screen recovery wiring. `npm run acceptance:e2e` checks the repository anchors for MFA sign-in, step-up verification, security alerts, and desktop open/close/checkout/sync journeys. `npm run acceptance:sync-chaos` checks the interruption, duplicate resend, stale version, wrong-node ACK, dead-letter, replay, resend, and reconciliation evidence anchors. `npm run cert:installed-soak` checks that the installed-desktop trading-day soak evidence pack remains wired to packaged runtime, support logs, tray sync, watchdog, and recovery behavior. `npm run cert:security-providers` checks LDAP, SMTP, SMS, MFA, step-up, lockout, unlock, and alert-escalation certification anchors. `npm run cert:hardware-execution` checks the physical hardware execution evidence anchors for printers, scanners, drawer, payment terminal, display, and scale workflows. `npm run acceptance:functional-uat` checks the business UAT scripts for sale-to-GL, returns, EOD, receiving, stock count, transfers, settings sync, and security journeys. `npm run cert:database-readiness` checks the live enterprise database for the migrations, tables, and columns required by this build before HQ or desktop sync run. `npm run acceptance:production-hardening` runs those hardening gates together. `npm run e2e:certification` runs the live Playwright browser and Electron workflows when the required `FLASH_ERP_E2E_*` environment values are provided.

`npm run acceptance:capacity-hardening` checks that the shared enterprise cache, request correlation, SQL pool controls, overload protection, runtime telemetry, load runner, and capacity plan remain wired. It is a code gate, not a 200-user certificate. The live certification procedure and workload matrix are in `docs/16-enterprise-capacity-and-performance-plan.md`.

Record command output, screenshots, traces, and any manual exceptions in `docs/14-uat-evidence-log.md`.

The detailed execution pack for the five production-hardening slices lives in `docs/15-production-hardening-execution-pack.md`.

## Database Schema Readiness

Before starting HQ or shop sync workers after a deploy, run `npm run cert:database-readiness` against the target `DATABASE_URL`. The gate verifies the applied Prisma migrations plus the GL, operating expense, and tender gateway tables/columns that can otherwise break finance, integration APIs, and desktop sync. HQ also exposes `/api/system/database-readiness` for a runtime readiness probe, and sync push/pull responses return `ENTERPRISE_DATABASE_SCHEMA_NOT_READY` with `schemaDrift: true` when a store tries to sync against an unmigrated database.

## Desktop Soak

Run the desktop app from an installed Windows package on a clean Windows profile for at least one full trading-day simulation per shop role.

Required scenarios:

- Operator sign-in and sign-out with a synced cashier.
- Open a shift, process sales, park/resume a basket, checkout, reprint receipt, and close the shift.
- Process receipt-based return, manual supervised return, and exchange.
- Run stock count draft, submit, and commit.
- Receive a purchase order and sync the GRN back to HQ.
- Create and submit an inter-store transfer request, then sync.
- Run manual sync from the desktop UI and from the tray Sync option.
- Trigger Sync > Runtime > Check updates against the configured feed.
- Confirm crashes, renderer failures, updater failures, and local snapshot failures are written to `%APPDATA%\@flash-erp\store-desktop\logs\main.log`.

Pass criteria:

- No black screen, frozen control, or unrecoverable sign-in stall during the soak window.
- UI remains responsive after repeated sales, returns, inventory, and sync actions.
- Shift close does not automatically create a new shift.
- Completed sales retain the logged-in seller instead of replacing the seller with the shift owner.
- Manual sync remains available even when role permissions do not expose other privileged actions.
- Runtime > Status shows the renderer watchdog as ready, updates heartbeat age, and manual Recover reloads the desktop without losing the local queue.
- Runtime > Status shows stale heartbeat counters and the main process auto-recovers a stale renderer only after the recovery cooldown, avoiding a reload loop.
- Sign-in stall testing forces the store service unavailable path and confirms the login button releases with a clear timeout message.
- Maximize, restore, resize, close-to-tray, and relaunch preserve sane window bounds instead of returning to a black or off-screen window.

## Sync Chaos And Reconciliation

Before production sign-off, run the sync chaos drill matrix from `docs/15-production-hardening-execution-pack.md`. The minimum drill set is upstream network break, duplicate resend, stale record version, wrong-node ACK, interrupted downstream pull, retry exhaustion, operator reprocess, resend request, and business reconciliation.

Pass criteria:

- Store outbox/inbox state, HQ inbound/outbox state, and sync node checkpoints all agree after recovery.
- Sales, returns, inventory movements, settings changes, and finance journals reconcile by source id and idempotency key.
- No accepted packet creates duplicate canonical sales, inventory ledger rows, or GL journal source rows.
- Wrong-node or stale acknowledgements are returned in `rejectedAcknowledgementIds` and do not advance checkpoints.
- Dead-letter rows stay visible until an operator replays, reprocesses, or requests a trusted resend.

## External Services

Before production sign-off, validate real endpoints from the Enterprise Settings workspace:

- LDAP: server URL, base DN, bind DN, secret, user search base, user search filter, and reachability from the enterprise server.
- SMTP: host, port, sender address, credential posture, and reachability from the enterprise server.
- SMS: provider, sender ID, API base URL, API credential, and provider reachability where the provider safely supports a health check.

The built-in validation buttons perform structure checks by default. Network probes should be run only from the target deployment network and with real endpoint owners aware of the test.

## Security Certification

The current hardening baseline includes:

- Failed sign-in lockout counters.
- Administrator account unlock workflow.
- Password length, complexity, history, expiry, lockout, and session timeout policy.
- MFA policy mode controls for disabled, admin-only, or all-user posture, plus a signed one-time challenge flow during enterprise sign-in.
- Step-up verification for sensitive policy updates.
- Security alert routing fields for critical escalation and account lockout alerting.
- Dedicated audit and security logs.

Remaining production certification work:

- Validate the MFA code delivery path against the selected production mail/SMS provider. Development builds expose the one-time code for local testing only.
- Extend step-up prompts to any future sensitive operation beyond the current security policy surface.
- Decide alert routing and escalation ownership for critical security events.
- Run audit-log review with the customer operations team after a simulated trading day.

The live provider certification pass must be recorded against LDAP, SMTP, SMS, MFA sign-in, step-up, lockout/unlock, and alert-routing rows in `docs/14-uat-evidence-log.md`.

## Packaging And Hardware

Package certification is complete only after:

- A per-machine NSIS installer is built from the tagged version.
- Installer output, `latest.yml`, and `.blockmap` are uploaded to the update feed.
- Install is verified on a clean Windows user profile.
- Update detection is verified from the installed app.
- Receipt printer list, thermal test slip, receipt print, silent print, and cash drawer kick are verified on the actual shop hardware model.
- Barcode scanner input is tested in sale, return, inventory lookup, stock count, and receiving screens.
- The support log path is confirmed on the installed app.
- `npm run cert:hardware` passes before physical sign-off starts.
- `npm run cert:hardware-execution` passes before live hardware evidence is marked ready for sign-off.

## Functional UAT

Functional UAT must run the FU-01 through FU-08 scripts listed in `docs/15-production-hardening-execution-pack.md`: sale to GL, return and exchange, EOD and banking, receiving to inventory, stock count, transfers, settings sync, and security journey.

Pass criteria:

- Each script has an owner, environment, start/end time, result, evidence link, exception note, and follow-up owner.
- Each business fact has a source reference that can be traced through desktop runtime, sync queue, HQ canonical tables, and reporting or GL output.
- Any exception has a replay, reprocess, resend, or defect owner before sign-off.

## Mobile Assessment

The mobile app is present in the monorepo and participates in workspace typecheck, but mobile POS parity is not part of this initial iVend-like closure. A later mobile assessment should decide whether the target is manager approvals, inventory lookup, stock count, mobile POS, or all of those workflows.

## Sign-Off Record

Use this table during UAT:

| Area | Owner | Environment | Evidence | Result |
| --- | --- | --- | --- | --- |
| HQ dashboard and reports |  |  |  |  |
| Security and user administration |  |  |  |  |
| LDAP/SMTP/SMS validation |  |  |  |  |
| Store desktop POS |  |  |  |  |
| Store desktop inventory |  |  |  |  |
| Store desktop sync and tray sync |  |  |  |  |
| Database schema readiness |  |  |  |  |
| Sync chaos and reconciliation |  |  |  |  |
| Installer and update feed |  |  |  |  |
| Hardware peripherals |  |  |  |  |
| Functional UAT scripts |  |  |  |  |

The expanded working log lives in `docs/14-uat-evidence-log.md`.
