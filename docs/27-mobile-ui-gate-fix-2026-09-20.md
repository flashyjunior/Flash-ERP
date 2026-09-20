# Mobile UI gate: why a red run took ~28 minutes (and the bug it was hiding)

**Run date:** 2026-09-20

**Reported symptom:** `npm run acceptance:mobile` typechecked, passed the startup/auth/operations
gates, then spent **28 minutes** in the Playwright suite and finished with `25 failed / 1 passed`.

## Root cause of the failures

One endpoint was added to the app (`GET /api/mobile/home`, the shop-independent dashboard feed)
and the UI gate's fixture switch was never updated. The catch-all branch did:

```ts
default: throw new Error(`Missing test HTTP fixture: ${route.request().method()} ${url.pathname}`);
```

A route handler that throws never fulfils the request, so every dashboard load left a request
pending. The failure then presented itself once per test (`Missing test HTTP fixture:
GET /api/mobile/home`) and dragged unrelated assertions with it.

## Root cause of the runtime

Playwright's trace recorder never settles on the multi-megabyte Metro dev-server bundle response.
With `trace: "retain-on-failure"` every failing test stalled until the 45s test timeout — measured
in this repository: **~3s per failing test with tracing off, ~48s with tracing on**, and a bogus
`Test timeout of 45000ms exceeded` error alongside the real failure. 25 failures × ~65s ≈ the
28 minutes the user saw. Test bodies themselves are only 1-3s.

The bundle itself is not the app's fault: a 5 MB response from a plain static server traces fine;
only the Expo dev-server response triggers the stall.

## What changed

- `tests/mobile/session-flow.spec.ts`
  - adds the missing `/api/mobile/home` fixture (matching the real route's payload) and
    `/api/online-store/receipts` (the returns screen's receipt search).
  - replaces the throwing catch-all with an explicit 404 plus a teardown assertion listing every
    endpoint the app called without a fixture, so a forgotten endpoint fails in ~2s with a precise
    message instead of hanging the page's fetch queue.
  - repairs stale screen expectations that the app had already moved past:
    scanner placeholder → "Filter inventory — type a name, code or barcode...",
    cart button → "Complete Sale & Print Receipt",
    returns heading → "Returns & Refunds",
    receipt URL is `/receipt?autoprint=1`.
  - asserts the shopless home feed actually renders (Company Pulse, birthdays, leave).
- `playwright.mobile.config.ts` — tracing is opt-in via `FLASH_ERP_MOBILE_TRACE=1` (see above);
  screenshots on failure are unchanged.
- `apps/mobile/app/receipt.tsx` — **the bug the fixture failure had been masking.** Reaching the
  receipt screen after a completed sale threw `Rendered more hooks than during the previous render`:
  `useLocalSearchParams`, `useRef` and one `useEffect` were declared *after* the two early returns
  for the loading/empty states, so the async load changed the hook order and the fatal-error
  boundary replaced the receipt. The loading/empty states now render the receipt through
  `ReceiptView`, which mounts only once a receipt exists, keeping every hook unconditional.

## Verified result

`npm run acceptance:mobile` (typecheck + production Android bundle check + auth + operations +
26 browser flows): **all green, 57s locally** (UI suite itself 41s), against 28m 25s red before.
