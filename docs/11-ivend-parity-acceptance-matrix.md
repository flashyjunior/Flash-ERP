# 11. iVend-Like Parity Acceptance Matrix

Last updated: 2026-05-01

This matrix is the committed Flash ERP acceptance baseline for the initial iVend-like scope. It maps the product surface we are targeting to the route, API, desktop runtime surface, and verification evidence in this repository.

Omnichannel order flow is intentionally deferred. eCommerce order import, BOPIS, click-and-collect, reservation, fulfilment, cancellation, and return-to-store journeys remain outside this batch and must not be counted as closed parity until that later slice is implemented.

## Acceptance Status Legend

- `Implemented`: feature exists in code and is covered by build or a static gate.
- `Gated`: feature is covered by a smoke, parity, or acceptance command in this repo.
- `Soak Required`: feature exists but needs long-running field validation before production sign-off.
- `Deferred`: deliberately excluded from the current parity batch.

## Enterprise Web

| Area | Acceptance baseline | Primary surface | Evidence | Status |
| --- | --- | --- | --- | --- |
| Sign-in and session | Dedicated sign-in, MFA challenge handling, production SMTP/SMS delivery plumbing, session snapshot, sign-out, profile menu, password reset, change password | `/sign-in`, `/profile`, `/api/auth/*` | `npm run acceptance:e2e`, `npm run e2e:browser`, `npm run typecheck`, `npm run build` | Gated |
| Security users | Create/update retail users, role assignment, cashier/supervisor capability derivation, admin unlock for locked accounts | `/security?view=users`, `/api/setup/users/*` | `npm run acceptance:parity` | Gated |
| Roles and privileges | Role CRUD with grouped permission catalog and store/enterprise permission surfaces | `/security?view=roles-privileges`, `/api/setup/roles/*` | `npm run acceptance:parity` | Gated |
| Password policy | Length/complexity/history/expiry, lockout, session timeout, MFA policy mode, step-up policy, alert routing, admin unlock requirement | `/security?view=password-policy`, `/api/security/password-policy`, `/api/auth/step-up` | `npm run acceptance:parity`, `npm run acceptance:e2e`, `npm run e2e:browser` | Gated |
| Audit and security logs | Dedicated audit and security log views with severity/category/action detail and HQ alert escalation for critical events | `/security?view=audit-logs`, `/security?view=security-logs`, `/api/alerts` | `npm run acceptance:e2e`, `npm run typecheck`, `npm run build` | Gated |
| Company settings | Company profile, branding, document numbering, receipt template linkages, operational options | `/settings?view=company` | `npm run typecheck`, `npm run build` | Implemented |
| External integrations | LDAP, SMTP, and SMS settings plus validate actions, Swagger/OpenAPI discovery, and versioned third-party APIs for stock ledger, pricing, customers, suppliers, tender methods, sales, purchase orders, expenses, demand forecasts, and GL journals | `/settings?view=ldap`, `/settings?view=smtp`, `/settings?view=sms`, `/api/docs`, `/api/openapi.json`, `/api/integrations/v1/*` | `npm run acceptance:parity` | Gated |
| Master data | Customers, suppliers, tax, tenders, departments, categories, loyalty, promotions, products, stores | `/master/*`, `/catalog/*`, `/api/setup/*` | `npm run acceptance:rms` | Implemented |
| Promotion engine | Store/customer/tier/date/time/coupon/minimum quantity/buy-X-get-Y eligibility | `/master?view=promotions`, sync promotion snapshots | `npm run acceptance:rms` | Gated |
| Reports | HQ overview and reports for sales, cashier, items, promotions, stock valuation, variance, P&L-style financial rows, and slow/no-movement stock | `/reports`, `/overview`, `/pos` | `npm run acceptance:rms` | Gated |
| Finance and GL | Standard chart of accounts, idempotent GL postings for POS sales/tax/receivables, inventory receipts, COGS, returns, stock adjustments, operating expenses, journal lines, trial balance, and posting coverage | `/finance`, `/api/integrations/v1/finance/gl-journal`, `/api/integrations/v1/finance/operating-expenses` | `npm run acceptance:parity`, `npm run typecheck`, `npm run build` | Gated |
| Demand forecasting | Weighted demand forecast with short/long trend, confidence score, stockout projection, supplier lead time, and draft PO recommendation | `/purchases/predictive-review`, `/api/integrations/v1/forecast/demand` | `npm run acceptance:parity`, `npm run typecheck`, `npm run build` | Gated |

## Store Desktop

| Area | Acceptance baseline | Primary surface | Evidence | Status |
| --- | --- | --- | --- | --- |
| Operator access | Synced operator sign-in, sign-out, sign-in stall timeout, focused login inputs, local permission validation, shift open/close | `apps/store-desktop/src/renderer/modern-app.tsx`, desktop runtime IPC | `npm run acceptance:desktop-stability`, `npm run smoke:desktop`, `npm run soak:desktop`, `npm run e2e:electron` | Soak Required |
| POS sale capture | Basket add/update/remove, scanned sale capture, checkout, print receipt, cash drawer | Store Desktop Sell workspace | `npm run smoke:desktop`, `npm run e2e:electron`, `npm run build` | Soak Required |
| Returns and exchanges | Receipt lookup, receipt-based return, manual supervised return, exchange lines and refunds | Store Desktop Returns workflow | `npm run smoke:desktop`, `npm run build` | Soak Required |
| Inventory | Goods receipt, supplier return, stock count draft/submit/commit, transfer issue/receipt, remote lookup | Store Desktop Inventory workspace | `npm run smoke:desktop`, `npm run build` | Soak Required |
| Sync and recovery | Manual sync, tray sync, auto-sync policy, sync run id correlation, retry windows, rejected acknowledgement handling, dead-letter visibility, replay/reprocess support | Store Desktop Sync workspace, tray menu, HQ sync APIs | `npm run acceptance:sync-hardening`, `npm run smoke:desktop`, `npm run soak:desktop` | Soak Required |
| Packaging and hardware | Per-machine NSIS installer, updater feed, support logging, clean profile installation checklist, hardware certification matrix | `electron-builder.config.cjs`, `docs/10-store-desktop-production-deployment.md`, `docs/13-desktop-hardware-certification-matrix.md` | `npm run soak:desktop`, `npm run cert:hardware` | Gated |

## Cross-System Scenarios

| Scenario | Acceptance baseline | Verification |
| --- | --- | --- |
| HQ seed depth | Multiple active shops with sales spread across at least three shops | `npm run acceptance:rms` |
| Promotion parity | Advanced promotion rules produce expected discounts and blocks | `npm run acceptance:rms` |
| Desktop production readiness | Support log, updater, tray sync, runtime status, renderer watchdog, persisted window state, package scripts, release checklist exist | `npm run acceptance:desktop-stability`, `npm run smoke:desktop`, `npm run soak:desktop` |
| External service readiness | LDAP/SMTP/SMS validation routes and UI actions exist and return structured checks | `npm run acceptance:parity` |
| Third-party API readiness | OpenAPI/Swagger docs plus stock ledger, pricing, customers, suppliers, tender methods, sales, purchase orders, operating expenses, forecast, and GL journal endpoints remain wired | `npm run acceptance:parity` |
| Finance posting readiness | HQ GL chart, journals, trial balance, and posting coverage remain wired to source facts | `npm run acceptance:parity` |
| Database schema readiness | Runtime readiness probe, Prisma migration check, and desktop schema-drift diagnostics prevent HQ/sync from running against an unmigrated database | `npm run cert:database-readiness`, `/api/system/database-readiness` |
| Security hardening readiness | MFA policy mode, step-up policy, admin unlock policy, and unlock API are represented | `npm run acceptance:parity` |
| Sync hardening readiness | Shared retry policy, upstream retry windows, downstream redelivery backoff, invalid ACK rejection, and sync run correlation remain wired | `npm run acceptance:sync-hardening` |
| Sync chaos and reconciliation readiness | Network break, duplicate resend, stale record version, wrong-node ACK, interrupted pull, dead-letter, reprocess, resend, and business reconciliation evidence anchors remain wired | `npm run acceptance:sync-chaos` |
| Desktop stability readiness | Renderer-ready handshake, heartbeat watchdog, black-screen recovery, crash recovery, persisted maximize/resize state, and sign-in stall timeout remain wired | `npm run acceptance:desktop-stability` |
| Installed desktop soak readiness | Installed trading-day soak evidence anchors remain wired to package, support logs, tray sync, watchdog, and recovery controls | `npm run cert:installed-soak` |
| Security provider certification readiness | LDAP, SMTP, SMS, MFA, step-up, lockout, unlock, and alert-routing evidence anchors remain wired | `npm run cert:security-providers` |
| E2E certification readiness | MFA sign-in, step-up hooks, alerts, and Playwright browser/Electron flows for desktop open/close/sale/sync remain wired | `npm run acceptance:e2e`, `npm run e2e:certification` |
| Hardware readiness | Printer, scanner, drawer, and peripheral certification anchors remain wired | `npm run cert:hardware` |
| Hardware execution readiness | Physical hardware execution evidence anchors remain wired for printer, scanner, drawer, payment terminal, display, and scale checks | `npm run cert:hardware-execution` |
| Functional UAT readiness | Sale-to-GL, returns, EOD, receiving, stock count, transfers, settings sync, and security journey scripts remain wired | `npm run acceptance:functional-uat` |
| Production hardening readiness | The hardening gates, including schema readiness, run as one batch | `npm run acceptance:production-hardening` |

## Deferred Scope

| Area | Reason |
| --- | --- |
| Omnichannel order flow | Deferred by product decision on 2026-04-30. Implement later as a dedicated order import, reservation, fulfilment, cancellation, and return-to-store slice. |
| Full third-party certification | Requires physical devices, production identity/mail/SMS endpoint evidence, installed desktop soak, and customer UAT sign-off in `docs/14-uat-evidence-log.md`. |
| Mobile parity | Mobile app exists in the monorepo, but mobile POS parity is not part of this initial desktop/HQ parity closure. |
