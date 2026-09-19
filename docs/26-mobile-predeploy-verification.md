# Mobile pre-deployment verification

**Run date:** 2026-09-19

**Result:** Automated gate passed — 26 browser-driven mobile screen-flow tests, authentication regressions, operational checks, TypeScript checking, and production Android JavaScript bundle checks.

## What actually ran

Playwright launched Chromium at a Pixel 7 viewport against the **real Expo app**, exercising its screens, router, API client, and storage. HTTP responses were intercepted with deterministic fixtures; the live ERP was not contacted or modified. The authentication regression gate separately executes the server's actual public session-snapshot builder against the mobile API client.

These are not static source checks alone, but they are also **not an Android emulator or installed-APK certification**. Expo Web uses localStorage and the mobile database's web memory fallback; it does not exercise Android Keystore or native SQLite persistence.

| Flow | Result |
| --- | --- |
| Fresh launch → login → dashboard → account → back → reload → logout → sign in again | Passed |
| Bad credentials, visible error, then successful retry | Passed |
| Slow profile response; remain on login until complete | Passed |
| Failed profile response; visible error and retry | Passed |
| Dashboard HTTP failure without losing the session | Passed |
| Malformed analytics response without a render crash | Passed |
| Offline reload with cached operator | Passed |
| Server-rejected session returns to login with an explanation | Passed |
| Corrupt saved profile cannot crash protected navigation | Passed |
| Operator without a shop cannot open selling routes | Passed |
| Dashboard → stock lookup, count, receiving, transfers, cart, fuel, HR, approvals, returns, outbox → back | Passed (10 tests) |
| Manual product lookup → cart → cash payment → receipt → home | Passed, fixture sale |
| Rejected sale preserves cart; no false offline success or receipt | Passed |
| Rejected count shows an error; no offline queue entry | Passed |
| Network failure queues a count in the web memory outbox | Passed |
| Approvals screen cannot fabricate authorization success | Passed |
| Receipt deep link without a saved receipt provides a way back | Passed |

The 26-test suite passed both during the full gate and again with a cold, automatically started server under CI settings. The Playwright configuration and test file also passed a standalone TypeScript check.

Every screen-flow test fails on uncaught JavaScript errors, unhandled promise rejections, or the app's fatal UI error logging. Screenshots/traces are retained on failures under ignored test artifacts.

## Bugs addressed during this verification

1. **Login/session contract mismatch:** mobile expected an internal ID absent from the server's public snapshot and reported success despite failing to save the profile.
2. **Malformed analytics crash:** unchecked values reached `.toFixed()`/array rendering. Invalid analytics now produce a nonfatal message while navigation remains usable.
3. **Revoked sessions treated as offline sessions:** HTTP authentication failures now clear local authentication and trigger protected navigation. Ordinary network failure still supports existing offline sessions.
4. **Corrupt profile route-guard crash:** stored snapshots are validated before permission checks. Navigation uses Expo protected routes, with hydration before route selection so restored deep links are retained.
5. **Logout races/history:** access is removed locally before waiting for the remote logout. Late profile responses cannot restore the previous session, and protected screens are removed from navigation history.
6. **Rejected writes shown as offline success:** HTTP rejections no longer silently queue sales/counts and the other API methods using the same fallback pattern. Genuine network failures retain offline fallback. The write tests cover sales/counts; they do not certify every business workflow.
7. **Missing receipt dead end:** an absent receipt previously left a permanent spinner. It now offers a return to the dashboard; receipt completion dismisses back to the existing dashboard.
8. **Misleading approvals prototype:** hardcoded transactions, fabricated KPIs, and local-only "authorized successfully" controls were removed. The screen explicitly directs managers to Enterprise Web until a real mobile approval workflow is implemented.
9. **Storage fallback consistency:** failed writes and deletes override stale persistent values during the current app run. Memory fallback remains non-durable across process restarts.

## Repeat the checks before building

From the repository root, after installing dependencies:

```bash
# One-time browser setup (on Linux, --with-deps can install required libraries).
npx playwright install chromium

# Full gate: typecheck + Android bundle + API/storage regressions + UI flows.
npm run acceptance:mobile

# Recommended APK build entry point: only invokes EAS if the full gate passes.
npm run build:mobile:preview
```

The UI gate starts/stops an Expo Web server on port 8081 automatically when one is not already running. It may reuse a local server outside CI; restart it after code changes if it was launched with `CI=1`, which disables Metro watching. A direct `eas build` bypasses this repository wrapper.

Useful individual commands:

```bash
npm run acceptance:mobile-ui
npm run acceptance:mobile-auth
npm run acceptance:mobile:static
```

`acceptance:mobile:static` is a fast subset, **not** the full release gate.

The HTML UI report is generated at `playwright-report/mobile/index.html`. It is deliberately ignored by Git. In environments with an existing Chromium installation, set `FLASH_ERP_E2E_BROWSER_EXECUTABLE_PATH` to its executable. In this sandbox, the normal browser download endpoints were unavailable, so Chromium and its required libraries were obtained from an npm-distributed package in ignored temporary storage. No browser binaries are committed.

## Remaining limits / release cautions

- **Mobile approvals are unavailable**, not repaired end-to-end. Use Enterprise Web.
- **Mobile MFA remains unsupported**; MFA challenges now show a clear error instead of pretending login succeeded.
- No live-server credential test, real accounting/inventory write, native APK build/install, or Android emulator run was performed.
- Camera scanning, biometric unlock, location capture, printing, native SQLite recovery/persistence, and device-specific background/resume behavior still need native-device coverage.
- Goods receiving, transfers, fuel, HR, and returns were tested for screen entry/back navigation, not complete production posting/reconciliation.
- This gate reduces reproducible JavaScript/flow regressions. Passing it is not a claim that every mobile business operation or hardware integration is bug-free.

Install any new APK as an update using the same signing identity. Preserve app data and unsynced outbox work; do not uninstall or clear storage merely to apply this fix.
