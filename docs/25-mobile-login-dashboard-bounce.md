# Mobile login → dashboard → login bounce (2026-09-19)

## Cause

This is a session-routing failure, distinct from the startup crashes in
[the startup incident notes](24-mobile-startup-crash-root-cause.md).

1. `/api/auth/sign-in` returns a bearer token.
2. `/api/auth/session` returns the public `EnterpriseSessionSnapshot`: `loginId`,
   display name, store, roles, permissions, and expiry. It deliberately does not
   expose `userId` or `sessionId`.
3. The mobile parser accepted a bare response only if `data.userId` existed, so
   it discarded a valid snapshot without saving it.
4. `signIn()` ignored that failure and returned success anyway. Login navigated
   to `/`, but `SessionRouteGuard` found no saved profile and replaced it with
   `/login`. No exception was thrown, so the crash boundary had nothing to show.

## Fix

- Validate the actual public snapshot fields, supporting both bare and
  `{ session: ... }` responses. Internal IDs are optional in the mobile type.
- Require a nonempty token and a fresh, valid, saved profile before reporting
  successful login. Do not fall back to an earlier operator's cached profile
  during a new login. Failed attempts clear partial local authentication and
  return an error to the existing login error panel.
- Treat MFA challenges as incomplete authentication, with an explicit message
  directing users to web sign-in (the mobile app has no MFA verification UI).
- Preserve normal cached-profile access for existing offline sessions.
- Correct storage fallback reads: a failed persistent write must be visible from
  memory even if a subsequent persistent read succeeds with null or an old
  value. Failed deletes leave an in-memory tombstone so the current app run
  cannot resurrect a logged-out profile. Memory fallback is not durable across
  process restarts.

## Verification

- `npm --workspace @flash-erp/mobile run typecheck` — passed.
- `npm run acceptance:mobile` — passed, including production Android JS bundle
  export, singleton checks, authentication regression tests, and operational checks.
- `npm run acceptance:mobile-auth` executes the real mobile API/storage modules
  with mocked native/network IO and the server's actual snapshot builder. It
  covers bare/wrapped snapshots, missing tokens, MFA, failed/malformed session
  responses, offline access, stale operator cleanup, and storage fallbacks.
- Running the same regression gate against the original mobile API/storage code
  fails immediately: login reports success but the saved operator is undefined.

No physical-device login or native APK build was performed in this sandbox.

## Rollout and device check

The installed mobile app needs a new build containing these changes; a server
restart alone will not update it. No server schema changes are required.

```bash
cd apps/mobile
npx eas-cli build -p android --profile preview
```

Install the resulting APK as an update using the same signing identity. Preserve
app data; do not uninstall or clear storage while there are unsynced outbox items.
Then verify:

1. Sign in with a non-MFA test operator: the dashboard stays open with the correct
   operator and permitted modules.
2. Refresh, reopen the app, and sign out/in again.
3. Test a failed session fetch: login stays visible with an error rather than
   reporting success and bouncing back silently.
4. Check offline access after a successful sign-in and confirm queued operations
   remain intact.

## Follow-up flow verification

The broader screen-level run and additional fixes are documented in
[Mobile pre-deployment verification](26-mobile-predeploy-verification.md).
Use `npm run build:mobile:preview` from the repository root to gate the APK build
on those checks rather than invoking EAS directly.
