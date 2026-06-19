# 08. iVend-Like Parity Checklist

Last updated: 2026-05-01

This checklist is an internal Flash ERP parity baseline, not a certification that the product matches an external iVend specification one-for-one. There is no formal iVend requirements document checked into this repository, so the checklist below is based on the implemented Flash ERP screens, routes, APIs, and desktop runtime surface that exist in code today.

Status legend:

- `[x]` Implemented in code and buildable
- `[~]` Partially implemented, implemented but not fully validated, or known to have runtime gaps
- `[ ]` Missing, unverified, or not yet represented in the current product surface

## Overall Readout

- `[x]` Enterprise web now has a coherent shell, dedicated navigation areas, sign-in flow, account menu, profile page, password reset flow, and view-specific Settings and Security pages.
- `[x]` Core enterprise functional areas exist in code for master data, catalog, stores, inventory, POS, sync, operations, reports, finance, settings, and security.
- `[x]` Store Desktop exposes a broad offline-first operational surface for sales, returns, inventory, receiving, transfers, stock counts, sync, and recovery.
- `[~]` Store Desktop runtime stability has smoke and soak-readiness gates plus softer runtime diagnostics, but installed field soak testing is still required before full sign-off.
- `[x]` Formal parity sign-off now has a committed acceptance matrix in `docs/11-ivend-parity-acceptance-matrix.md`.
- `[~]` Automated end-to-end certification now has real Playwright browser and Electron specs plus the existing static gates; live credentials and a running enterprise/desktop environment are still required to produce final pass evidence.

## Authentication And Account Experience

- `[x]` Enterprise sign-in exists as a dedicated entry screen and is separated from the main application shell.
- `[x]` Forgot-password and reset-password flows exist.
- `[x]` Session snapshot and sign-out endpoints exist.
- `[x]` The top navbar surfaces the signed-in user with avatar color treatment, status, last-active details, and profile access.
- `[x]` The account control now supports both a compact quick-profile drawer and a separate richer dropdown menu.
- `[x]` A dedicated profile page exists for the signed-in user.
- `[x]` The profile page supports inline change-password actions.
- `[~]` Advanced identity hardening is represented through lockout, administrator unlock, MFA policy mode, a signed MFA challenge flow, production SMTP/SMS MFA delivery plumbing, step-up verification for sensitive policy updates, and alert routing controls; provider endpoint sign-off still needs the deployment network.

## Enterprise Shell And Navigation

- `[x]` The enterprise shell provides top-level navigation for Overview, Master, Inventory, Purchases, POS, Sync, Operations, Reports, Finance, Settings, Security, and Profile.
- `[x]` Master, Settings, and Security each expose dedicated submenu structures.
- `[x]` Settings pages now present view-specific copy and data instead of leaking descriptions from unrelated pages.
- `[x]` Security pages now present view-specific copy and data instead of generic shared content.
- `[x]` Parity against the current iVend-like baseline is mapped in `docs/11-ivend-parity-acceptance-matrix.md`, with omnichannel order flow explicitly deferred.

## Master Data, Catalog, And Store Setup

- `[x]` Master-data screens and routes exist for Customers, Suppliers, Tax, Tenders, Departments, Categories, Loyalty, Promotions, Products, and Stores.
- `[x]` API routes exist for core CRUD operations across customers, suppliers, categories, departments, tax profiles, tender methods, promotions, receipt templates, roles, users, stores, and store publication flows.
- `[x]` Catalog pages and product detail pages exist with product profile, pricing, supplier, media, and barcode endpoints.
- `[~]` Business-rule completeness and user acceptance coverage for each master-data flow still need customer UAT, but promotions now include shop, customer, loyalty tier, weekday/time, coupon, and buy-X-get-Y style rule fields with acceptance gates.

## Settings And Security

- `[x]` Settings coverage exists for Company, LDAP, SMTP, SMS, Receipt Templates, Retail Users, and Options.
- `[x]` Security coverage exists for Users, Roles and Privileges, Audit Logs, Online Users, Password Policy, and Security Logs.
- `[x]` Security logging is implemented as a dedicated page concern rather than mixed into unrelated security views.
- `[~]` External service validation for LDAP, SMTP, and SMS now has API routes and Settings UI validate actions; real endpoint network probes still require deployment-network sign-off.
- `[~]` Security operations are represented at the UI and API level with admin unlock, expanded password posture, step-up verification, and HQ alert escalation; production escalation ownership and long-run audit acceptance still need explicit verification.

## Operations, Inventory, POS, And Sync

- `[x]` Enterprise operations, inventory, POS, and sync routes exist and are wired into the main shell.
- `[x]` Inventory detail flows exist for goods receipt, count variance tasks, adjustment tasks, purchase orders, transfer tasks, and inter-store transfers.
- `[x]` POS detail flows exist for transaction drill-down and exception drill-down.
- `[x]` Sync routes and APIs exist for push, pull, replay, inbound reprocess, resend request, and event replay operations.
- `[x]` Sync hardening now covers sync run id correlation, retry windows, invalid downstream ACK rejection, upstream transport failure classification, downstream redelivery backoff, and exhausted retry dead-lettering.
- `[x]` HQ stock movement audit coverage is represented through the canonical `InventoryLedgerEntry` ledger, Operations ledger view, Inventory ledger tabs, movement detail routes, and the versioned `/api/integrations/v1/inventory/ledger` export.
- `[x]` Customer-group and loyalty-tier price lists are represented in HQ pricing setup, synced to Store Desktop, applied in desktop basket price resolution, and exported through `/api/integrations/v1/catalog/prices`.
- `[x]` Predictive purchasing now exposes weighted demand forecasts, trend direction, confidence score, forecast quantities, and reorder recommendations in HQ and `/api/integrations/v1/forecast/demand`.
- `[~]` End-to-end transactional reconciliation across enterprise and store nodes still needs scenario-based installed soak testing; the certification plan and `docs/15-production-hardening-execution-pack.md` now name the CH-01 through CH-09 chaos and reconciliation drills, plus the schema-readiness gate that catches unapplied Prisma migrations before sync runs.

## Finance And Integrations

- `[x]` HQ Finance exists as a dedicated enterprise page with a standard chart of accounts, GL journal list, journal lines, trial balance, and source posting coverage.
- `[x]` POS sales, tax, receivables, inventory receipts, COGS, returns, and stock adjustments are projected into idempotent GL journals keyed by source fact.
- `[x]` Third-party integration discovery is exposed through `/api/openapi.json` and Swagger UI at `/api/docs`.
- `[x]` Versioned integration APIs exist for stock ledger, customer-group pricing, customer and supplier master data, tender/gateway metadata, completed sales, purchase orders, operating expense import/export, demand forecast, and GL journal export under `/api/integrations/v1/*`.
- `[~]` External GL export remains a mapped integration handoff: the journal and operating-expense data is now structured and exportable/importable, but customer-specific target-account mapping and downstream posting acknowledgement still need deployment sign-off.

## Store Desktop Offline Runtime

- `[x]` The desktop preload and shared runtime expose offline-first operations for operator sign-in and sign-out.
- `[x]` The desktop runtime exposes sale capture, scanned sale capture, basket add/update/remove, basket checkout, parking, and resume flows.
- `[x]` The desktop runtime exposes receipt search, receipt-based return flows, and exchange flows.
- `[x]` The desktop runtime exposes customer search, customer account payment capture, basket customer attachment, and loyalty redemption flows.
- `[x]` The desktop runtime exposes purchase-order receiving, supplier returns, inter-store transfer request and execution flows, stock-count save/submit/commit flows, and sync recovery actions.
- `[x]` The desktop runtime exposes receipt printer selection, receipt printing, thermal test slip printing, and cash-drawer kick operations.
- `[x]` Desktop stability hardening now covers sign-in stall timeouts, login input focus recovery, persisted maximize/resize state, renderer heartbeat watchdogs, stale-heartbeat auto-recovery with cooldowns, and black-screen/crash recovery.
- `[x]` Store Desktop currently passes TypeScript typecheck and production build.
- `[~]` Runtime parity is still incomplete until installed field soak clears sign-in, input responsiveness, maximize/auto-resize, frozen-control, unresponsive renderer, and black-screen risks; the main-process runtime status now fails soft with support-log diagnostics when the local store snapshot cannot be read.
- `[~]` The desktop code surface is broad, and `npm run soak:desktop` now verifies release-readiness anchors, but runtime stability and UX polish still require live soak sign-off.
- `[~]` Automated desktop end-to-end coverage now includes an Electron workflow spec for sign-in, shift open, sale capture, shift close, and sync; final certification still requires the installed app and shop-machine soak evidence.

## Quality, Verification, And Acceptance

- `[x]` `@flash-erp/enterprise-web` passes `typecheck` and production `build`.
- `[x]` `@flash-erp/store-desktop` passes `typecheck` and production `build`.
- `[~]` Playwright specs now cover the core enterprise and desktop certification journeys, while `npm run acceptance:rms` continues to check seeded HQ data and critical promotion-engine scenarios.
- `[x]` A formal acceptance matrix against the intended iVend-like baseline is stored in `docs/11-ivend-parity-acceptance-matrix.md`.
- `[~]` End-to-end certification is documented in `docs/12-production-certification-and-soak-plan.md`, expanded in `docs/15-production-hardening-execution-pack.md`, and tracked in `docs/14-uat-evidence-log.md`, but installed prolonged real-usage soak still needs to be run.

## Out Of Scope For This Checklist

- `[~]` The mobile app exists in the monorepo and participates in typecheck, but mobile POS parity is deferred to a later mobile assessment.
- `[~]` Hardware certification, packaging, installation, and production deployment readiness now have a certification plan, hardware matrix, and repo gate, but physical device sign-off is still required.

## Recommended Next Milestones

1. Run the production-hardening gates together with `npm run acceptance:production-hardening`, including `npm run cert:database-readiness` after every migration deploy.
2. Run installed Store Desktop soak on the target shop machine to prove the new sign-in timeout, watchdog, resize persistence, stale-heartbeat recovery, and black-screen recovery behavior under real usage.
3. Run the CH-01 through CH-09 sync chaos and reconciliation drills against store/HQ, then attach the evidence to the UAT log.
4. Run the new Playwright browser/Electron suites against the target environment and attach their output to the UAT evidence log.
5. Run scenario-based UAT for cross-system workflows such as password reset followed by desktop sync, receipt correction, transfer issue and receipt, goods receipt, and stock count commit.
6. Validate production MFA delivery against the selected mail/SMS provider endpoints from the deployment network.
7. Defer omnichannel order flow for a later slice: eCommerce order import, BOPIS/click-and-collect, order reservation, fulfilment, cancellation, and return-to-store journeys are intentionally not part of the 2026-04-30 hardening batch.
8. Only after installed runtime soak and UAT should the product be called parity-complete against the intended initial iVend-like baseline.

## Evidence Anchors

- Enterprise navigation and page taxonomy: `apps/enterprise-web/src/lib/navigation/enterprise-navigation.ts`
- Enterprise shell and account surface: `apps/enterprise-web/src/components/layouts/enterprise-shell.tsx`
- Enterprise profile surface: `apps/enterprise-web/src/app/profile/page.tsx`
- Enterprise auth routes: `apps/enterprise-web/src/app/api/auth/*`
- Enterprise app routes: `apps/enterprise-web/src/app/**/page.tsx`
- Store Desktop runtime contract: `apps/store-desktop/src/shared/desktop-runtime.ts`
- Store Desktop preload bridge: `apps/store-desktop/electron/preload.ts`
- Store Desktop offline service: `apps/store-desktop/src/main/offline/local-store-service.ts`
- Store Desktop shell renderer: `apps/store-desktop/src/renderer/app.tsx`
- Formal parity matrix: `docs/11-ivend-parity-acceptance-matrix.md`
- Production certification and soak plan: `docs/12-production-certification-and-soak-plan.md`
- UAT evidence log: `docs/14-uat-evidence-log.md`
- Production hardening execution pack: `docs/15-production-hardening-execution-pack.md`
- Playwright E2E config: `playwright.config.ts`
- Enterprise browser E2E spec: `tests/e2e/enterprise-auth.spec.ts`
- Store Desktop Electron E2E spec: `tests/e2e/store-desktop.spec.ts`
- Production MFA delivery service: `apps/enterprise-web/src/server/services/enterprise-mfa-delivery.ts`
- HQ Finance workspace: `apps/enterprise-web/src/app/finance/page.tsx`
- HQ GL repository: `apps/enterprise-web/src/server/repositories/enterprise-finance.repository.ts`
- Integration OpenAPI spec: `apps/enterprise-web/src/server/integrations/openapi.ts`
- Integration API queries: `apps/enterprise-web/src/server/integrations/integration-queries.ts`
- Parity closure gate: `npm run acceptance:parity`
- Sync hardening gate: `npm run acceptance:sync-hardening`
- Desktop stability gate: `npm run acceptance:desktop-stability`
- E2E certification gate: `npm run acceptance:e2e`
- Live Playwright certification: `npm run e2e:certification`
- Desktop soak gate: `npm run soak:desktop`
- Hardware certification gate: `npm run cert:hardware`
- Production hardening gate: `npm run acceptance:production-hardening`
- Database readiness gate: `npm run cert:database-readiness`
- Hardware certification matrix: `docs/13-desktop-hardware-certification-matrix.md`
