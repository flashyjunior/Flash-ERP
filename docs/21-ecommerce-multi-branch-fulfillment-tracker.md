# Ecommerce Multi-Branch Fulfilment Tracker

Updated: 2026-08-25

This tracker governs the evolution of the Flash ERP public ecommerce storefront from a single-shop sales path into a centrally managed, multi-branch fulfilment operation. It is deliberately phased: a customer must never be promised stock by adding inventory from several branches unless the order has a real, auditable fulfilment plan.

## Status Legend

- Done: implemented and verified with the listed evidence.
- Code complete: implementation and focused automated acceptance are complete; PR review, UAT, or deployment remains.
- In progress: currently being implemented.
- Next: the next coherent delivery slice.
- Planned: scoped but not started.
- Blocked: waiting on a business decision or external dependency.

## Decisions Locked For This Programme

- The customer sees one storefront, while the enterprise retains branch-level inventory ownership and fulfilment responsibility.
- A product's public delivery availability is the network total across eligible fulfilment locations after each location's active reservations and the product safety-stock level are removed. It is never raw on-hand stock.
- A delivery basket may draw from several eligible source locations, but it remains one customer delivery: Flash ERP reserves each source quantity and creates governed internal transfers into one priority dispatch location. The customer selects the pickup shop for pickup orders, and pickup never combines quantities across shops.
- A normal ecommerce order reserves its stock at the allocated fulfilment location when the order is created. Layaway reserves stock only after its required opening deposit is verified, according to the shop's layaway policy.
- Cancellation, expiry, void, and POS fulfilment must release or consume the exact location reservation; no second stock balance is created.
- Delivery fees remain outside the automatic product-order calculation until a controlled delivery-pricing capability is approved.
- Store-specific selling UOMs, prices, and barcodes are a later phase. Until then, ecommerce uses the existing storefront selling rules and price snapshots.
- Split fulfilment is not silently enabled. It needs a customer-visible, payment-safe, and operations-safe delivery model before it can go live.

## Current Checkpoint

- Repository: Flash ERP.
- Branch: `master`.
- Baseline implementation commit: `31a1a27` (`Rework ecommerce fulfilment across branches`).
- Merged implementation commit: `1fcd33f` (`Add ecommerce storefront order handoff`), PR #20.
- Current delivery position: central network allocation, internal-transfer routing, customer and staff visibility, configurable storefront slides, and Store Desktop order handoff are merged. VPS release `c183953-r1` was confirmed running with database readiness on 2026-08-24. Production-like UAT then exposed a same-shop ecommerce receipt projection conflict and premature Store Desktop handoff before staff acceptance. The first correction is committed and pushed at `dedbfd9` and packaged as VPS release `dedbfd9-r1`. Follow-up UAT exposed exact-only Item Dynamic filters and ecommerce payment totals that were not reconciled from Store Desktop sales-order events or direct-HQ online-store POS fulfilment. Those follow-up corrections and an idempotent payment backfill are locally code complete and validated; commit, packaging, deployment, authenticated browser UAT, and live data verification remain pending. Phase 1 remains in progress.
- This tracker distinguishes code completion from rollout acceptance. Do not mark a phase Done merely because its branch compiles.

## Phase 1: Central Delivery Allocation And Reservation

### ECOM-MBF-001 - Fulfilment Domain And Migration

Status: Code complete

- Add fulfilment-location, fulfilment, and fulfilment-line records to the ecommerce domain.
- Record the storefront store separately from the shop/location selected to fulfil the order.
- Permit one sales-order line to reserve source stock at more than one inventory location.
- Add idempotent SQL Server migration and runtime compatibility for deployed databases.
- Preserve existing ecommerce orders and existing stores that have not yet configured fulfilment locations.

Acceptance:

- Existing production data remains readable.
- Schema compatibility can be applied safely to an already deployed SQL Server database.
- An ecommerce order records its primary dispatch location and source-level reservation identity.

Evidence:

- Prisma schema validation passed.
- SQL Server migrations `20260820010000_multi_branch_ecommerce_fulfillment`, `20260820020000_ecommerce_network_allocation`, and `20260821010000_ecommerce_hero_slides` are in the configured `prisma/migrations-sqlserver` deployment path and apply idempotently.
- `acceptance:ecommerce-multi-branch` passed against the central-network fulfilment contract.

### ECOM-MBF-002 - Availability, Routing, And Checkout Contract

Status: Code complete

- Calculate public delivery availability from the sum of each eligible location's sellable quantity: on hand minus active reservations minus product safety stock.
- Allocate delivery orders to one priority dispatch location. When it cannot supply a line itself, reserve eligible source stock and plan internal transfers into that dispatch location.
- Require pickup customers to choose an eligible pickup location and reject pickup baskets that that shop cannot fulfil itself.
- Reject a quote or order when the delivery network cannot supply it after reservations and safety stock.
- Return the dispatching branch and network-allocation status to the storefront for customer visibility.

Acceptance:

- Delivery can be accepted only when eligible network inventory can supply every stock-controlled line after buffers; source allocation is deterministic by routing priority.
- A customer cannot buy the same reserved or safety-stock quantity twice.
- Pickup remains deterministic and branch-specific after browser refresh and order reload.

Evidence:

- Ecommerce network allocation acceptance covers safety stock, reservations, delivery transfer planning, and pickup isolation.
- Enterprise web TypeScript check passed.

### ECOM-MBF-003 - Reservation, Layaway, POS, And Cancellation Integrity

Status: Code complete

- Reserve normal ecommerce stock at every allocated source location and create one internal transfer request per external-source line into the dispatch location.
- After ecommerce staff acceptance, publish the customer order as a high-priority `sales-order.published` packet to the assigned Store Desktop node and publish any required source-transfer packets. The customer order packet creates a parked local sales order, preserving the actual balance for payment-on-delivery; an unaccepted order must not enter a shop's POS fulfilment queue.
- Create layaway reservations and network transfers only after the verified opening deposit required by the selected store's policy.
- Consume every active source reservation during POS fulfilment after transfer stock has reached the dispatch location.
- Release active reservations and cancel unissued network transfers on cancellation and the relevant terminal lifecycle paths.
- Keep sales order, ecommerce fulfilment, and reservation state auditable.

Acceptance:

- A second buyer cannot place an order using inventory already reserved by the first order.
- Cancelling an unissued network order restores each source location's availability and sends cancellation downstream.
- POS fulfilment waits for stock at its own dispatch location, then consumes the corresponding source reservations exactly once.
- A pickup or delivery dispatch shop that is offline receives its packet on the first successful sync after it reconnects; it cannot receive any network packet while physically offline.
- Layaway follows the same allocation and verified-deposit rule.

Evidence:

- `acceptance:ecommerce-multi-branch` passed.
- Existing public ecommerce E2E contract was updated to include fulfilment details.
- Sync-core, Store Desktop, and Enterprise Web TypeScript checks passed after the ecommerce order-publication contract was added.

### ECOM-MBF-004 - Staff Console And Storefront UX

Status: Code complete

- Configure fulfilment locations with priority plus pickup/delivery eligibility in the ecommerce staff console.
- Display the selected pickup or dispatching delivery branch and network-allocation status to the customer and staff.
- Display allocation and stock context in the staff order view without changing the separate online-store POS workflow.
- Prevent staff from advancing an order until all required internal stock transfers have been received at the dispatch location. Use delivery-specific actions for delivery and pickup-specific actions such as `Ready for pickup` and `Picked up` for pickup orders.
- Offer Google and Facebook as additional customer sign-in and signup options when provider credentials and an HTTPS storefront origin are configured; preserve the existing ecommerce customer session and resume checkout after authentication.

Acceptance:

- An authorised staff member can configure at least two active fulfilment locations.
- The customer sees the selected pickup location or assigned delivery dispatch branch at checkout and on the order without being shown internal source stock.
- Unconfigured shops retain the backward-compatible default-location path.
- Configured social login creates or safely links the correct customer account, rejects tampered or expired state, and returns the customer to checkout without exposing provider secrets or access tokens.

Evidence:

- Enterprise web TypeScript check passed.
- Focused ecommerce acceptance passed.
- The staff order view displays each source transfer, requested/received quantity, and remaining receipt work; browser UAT remains outstanding.
- Local production browser acceptance on 2026-08-22 passed for the image-only hero, default-collapsed department rail with hover/focus category mega-menu, full-width desktop storefront bands, hero-aligned desktop product sections, catalogue filtering, product breadcrumbs, desktop side-thumbnail gallery, structured product/checkout/fulfilment facts, category-ranked related products, ash product placeholders, materially distinct persistent small/medium/large text controls, and mobile/tablet/desktop overflow checks. Deployment of this storefront UX revision remains pending.
- Ecommerce OAuth regression, Enterprise Web typecheck, deploy build, provider-route smoke, and focused production browser acceptance passed for disabled-until-configured Google/Facebook controls, signed state, Google PKCE, safe return URLs, existing-session reuse, and checkout resumption. Live provider consent and callback verification remains deployment UAT after real credentials and HTTPS callback URLs are configured.

### ECOM-MBF-005 - Phase 1 Rollout And UAT

Status: In progress

- PR #20 (`Add ecommerce storefront order handoff`) is merged at `1fcd33f`.
- Deploy the migration with the normal Flash ERP release and database-readiness gate.
- Configure at least two real fulfilment locations, priorities, and their delivery/pickup eligibility.
- Test delivery from one location, then a delivery basket whose stock is deliberately split across two source locations and confirm the internal transfers reach the dispatch location.
- Test pickup at each configured location.
- Test insufficient network stock, cancellation before/after source issue, paid layaway, POS fulfilment, and a customer order reload.
- Confirm that delivery uses the post-reservation, post-safety-stock network balance while pickup cannot use cross-shop stock.
- Run the full production build and browser smoke on the release/build machine before production deployment.

Local verification evidence (2026-08-21):

- `npm run build:deploy` passed against merged commit `1fcd33f`.
- `npm run acceptance:ecommerce-multi-branch`, `npm run cert:database-readiness`, and Prisma schema validation passed.
- Sync-core, Store Desktop, and Enterprise Web TypeScript checks passed.
- A checksum-verified VPS release package was assembled with all three ecommerce migrations and with runtime uploads excluded.
- Public ecommerce browser suite: 6 passed; 3 authentication-dependent flows were skipped because this local runtime intentionally does not expose development OTP/MFA codes.

Fulfilment UAT correction evidence (2026-08-25):

- East Legon pickup UAT exposed a partial sync projection: the inventory-ledger event landed, while `pos.transaction.completed` for `WEB-ECOM-EAST-LEGON-MARKET-1787654125681-977` dead-lettered because Enterprise mistook its pre-created ecommerce parked transaction for another store event.
- The projection now permits replacement only when the existing transaction is the same-store ecommerce handoff linked by sales-order source identity. Store Desktop requeues this specific `WEB-ECOM-*` stale-conflict class while retaining unrelated `STALE_VERSION` conflicts for investigation.
- Ecommerce sales-order and network-transfer packets now remain unpublished while an order is `PLACED`; staff acceptance publishes the governed shop work. Pickup status labels and actions no longer use delivery wording.
- `npm run build:deploy`, Enterprise Web and Store Desktop TypeScript validation, `npm run acceptance:desktop-sync-recovery`, and `npm run acceptance:ecommerce-multi-branch` passed.
- Focused production Playwright acceptance passed against `http://127.0.0.1:3001` for partial-name typeahead, selected-product search results, conditional out-of-stock ribbon, white card media, pointer-position image zoom, product-card navigation, and mobile/tablet/desktop layout.
- Commit `dedbfd9` (`Fix ecommerce fulfilment UAT issues`) was pushed to `origin/master`. `FlashERP-HQ-DEDBFD9-R1-VPS-Deploy-Resolved.zip` was assembled from that clean commit with outer SHA-256 `2DEC0B78AC7190DF15E0D1CF71A13362B5A81705A5AAA1671FD67D56D929B171`; both archive audits, the hydrated-layout regression, no-write missing-task guard, Windows PowerShell parsing, and executable packaged-Prisma-alias smoke passed. VPS deployment, the matching Store Desktop release, and live dead-letter recovery verification remain pending.
- Follow-up UAT found that Item Dynamic still used exact-value shop and product selectors. The controls now filter immediately as staff type any part of a shop, warehouse, location, product name, code, or SKU, while retaining selectable browser suggestions and responsive small-screen layout.
- Store Desktop sales-order events and direct-HQ online-store POS fulfilment now reconcile cumulative paid and balance amounts into the linked ecommerce order in their respective Enterprise transactions. `PAID` requires a positive paid amount and zero balance, partial layaway remains `PARTIALLY_PAID`, and fulfilment status alone never marks an order paid.
- SQL Server migration `20260825010000_ecommerce_store_payment_reconciliation` idempotently backfills open and fulfilled ecommerce orders from their linked sales orders and is required by both database-readiness checks.
- `npm run acceptance:inventory-search`, `npm run acceptance:ecommerce-multi-branch`, `npm run acceptance:desktop-sync-recovery`, Enterprise Web TypeScript validation, Prisma schema validation, and `npm run build:deploy` passed. Authenticated Item Dynamic browser UAT and live payment-backfill verification remain deployment evidence.

Storefront UX package evidence (2026-08-22):

- The `225c682-r8` deployment attempt completed migration and Prisma generation but failed before changing `FlashRMSHQ`: the same validator used for the pristine ZIP was incorrectly rerun after the deployer intentionally restored `.env`, root dependencies, and shared uploads. It rejected the approved `apps\enterprise-web\public\uploads` junction. The failed release directory is retained and `r8` must not be reused.
- `FlashERP-HQ-225C682-R9-VPS-Deploy-Resolved.zip` was assembled with outer SHA-256 `CDEFFDFFD52B4C128DC805BE53534A9360AF4A6754E6AE10783802BB0796C0B6`; deployment remains pending.
- The `r9` deployer separates pristine-payload validation from hydrated-release validation. Before promotion and again before the task switch, it requires the restored root `.env` to match its approved source and verifies that root `node_modules` and ecommerce uploads are junctions to their expected targets.
- The `r9` packager reproduced that hydrated state with a harmless test environment and both junctions, then invoked the actual packaged deployer and passed the regression gate. It also re-extracted and audited both ZIP layers, passed Windows PowerShell 5.1 parsing and the no-write missing-task guard, and confirmed that `.env` files, runtime uploads, root dependencies, and Next standalone/dev/cache output were excluded from the ZIP.
- The finished payload contains physical `@prisma/client-2c3a283f134fdcb6` runtime alias files, all three ecommerce migrations, and the direct Node service host. An executable alias smoke loaded `PrismaClient` through the same reused-root-`node_modules` model used on the VPS.
- The `r9` deployment window was interrupted by an abrupt VPS restart and must not be resumed or reused. Post-restart external checks returned HTTP 200 for live health, database readiness with `ready: true`, catalog, and storefront. The three remotely served page/CSS assets absent from `r9` are all present in the archived `r7` payload, confirming recovery of the `r7` storefront runtime pending VPS-local task-action confirmation.
- `FlashERP-HQ-225C682-R10-VPS-Deploy-Resolved.zip` was assembled as the clean retry with outer SHA-256 `FCA37F9AEDAF66EFDFB6AC5495E5FE789F7BFC3BC677710A9BA7D2992907956E`. The hydrated-layout regression gate, both archive audits, no-write guard, PowerShell 5.1 parse, physical Prisma alias audit, and executable alias smoke passed; deployment remains pending.
- `FlashERP-HQ-24AC473-R1-VPS-Deploy-Resolved.zip` was assembled from clean commit `24ac473` with outer SHA-256 `9CBEA0B1E5A27BF9AC5A2AD3BFAABFAE978BE901F89A33D5A3D1684DF31A645F`. The production deploy build, ecommerce OAuth and multi-branch gates, OAuth and manual-master-data route-manifest checks, hydrated-layout regression gate, both archive audits, no-write guard, Windows PowerShell 5.1 parse, physical Prisma alias audit, and executable alias smoke passed; deployment remains pending.

Deployment evidence (2026-08-21):

- `FlashRMS-225c682-r1` was switched into the `FlashRMSHQ` scheduled task on the target VPS after idempotent migrations and Prisma client generation completed.
- External checks returned HTTP 200 for live health, database readiness, `api/ecommerce/accra-shop/catalog`, and `shop/accra-shop`.

Storefront correction deployment evidence (2026-08-22):

- The operator confirmed `FlashRMS-225c682-r7` is running after checksum verification, migration/Prisma preparation, endpoint checks, and the scheduled-task stability window.
- External checks returned HTTP 200 for live health, database readiness, `api/ecommerce/accra-shop/catalog`, and `shop/accra-shop`; all four configured `/uploads/ecommerce/...` hero images returned HTTP 200.
- Focused live Playwright acceptance passed against `84.247.188.30:3000`: the four-slide hero rendered at the increased desktop/mobile height, a simple product cart button added one item without navigating to product details, and mobile, tablet, and desktop layouts had no horizontal overflow.

Exit criteria:

- A business owner signs off the above scenarios.
- The deployed release passes live and database-readiness endpoints.
- No reservation, sales-order, or inventory reconciliation anomaly remains from UAT.

## Phase 2: Customer-Visible Split Fulfilment

### ECOM-MBF-101 - Split Decision And Customer Promise

Status: Planned

- Define when split fulfilment is allowed: delivery only, pickup only, or both.
- Define customer consent, delivery-charge handling, promised dates, and cancellation/refund policy before enabling it.
- Prefer the fewest branches and lowest operational cost; do not split an order merely because it is technically possible.
- Present each proposed shipment or pickup leg clearly before the customer pays.

Acceptance:

- The customer knows before payment whether an order will arrive in one or multiple fulfilments.
- The allocation engine chooses a reproducible plan and produces an explanation in its audit record.

### ECOM-MBF-102 - Multi-Fulfilment Allocation And Reservations

Status: Planned

- Allow one ecommerce order to contain multiple customer-visible fulfilments and line allocations. This is distinct from Phase 1's internal transfer plan into a single dispatch location.
- Allocate every stock-controlled line exactly once, with atomic location-level reservations.
- Support retry, idempotency, timeout recovery, cancellation, and stock race handling across multiple locations.
- Keep payment totals, discount snapshots, tax, and promotion allocation reconcilable by order and fulfilment.

Acceptance:

- A basket can be delivered as multiple customer shipments only when Phase 2 policy permits it.
- Partial allocation cannot leave orphaned reservations.
- Inventory and reservation reconciliation agrees by location, order, fulfilment, and line.

### ECOM-MBF-103 - Staff, Customer, And POS Workflows

Status: Planned

- Give each branch a queue containing only its assigned fulfilments and allocated lines.
- Support pick, pack, ready, handed-over, dispatched, delivered, failed-delivery, cancellation, and return states per fulfilment.
- Expose customer-facing partial-progress timeline, pickup instructions, and delivery tracking without revealing internal stock data.
- Permit controlled reassignment before picking, with approval, stock recheck, audit, and customer notification.
- Ensure POS fulfils only the assigned branch portion and cannot complete other locations' lines.

Acceptance:

- Two branches can independently process their assigned parts without altering each other's stock or order state.
- The customer sees meaningful per-fulfilment progress and the whole order completes only when all required fulfilments finish.

### ECOM-MBF-104 - Payments, Refunds, Delivery, And Notifications

Status: Planned

- Allocate payment, refund, promotion, and tax accounting across fulfilments without losing order-level reconciliation.
- Add controlled delivery-charge policy only after the business agrees the fee model.
- Add delivery/driver assignments, proof of delivery, notifications, and failure/retry workflows as a separate operational capability.

Acceptance:

- Partial cancellation/refund is traceable to the correct fulfilment and payment record.
- Payment gateway webhook replay remains idempotent.
- Customer notifications reflect the actual fulfilment state.

## Phase 3: Branch-Specific Selling Rules

### ECOM-MBF-201 - Store UOM, Price, And Barcode Policy

Status: Planned

- Adapt the validated alternate-UOM model into the Flash ERP ecommerce allocation path.
- Define whether customer-facing price is central, location-specific, or locked when the basket is first quoted.
- Support branch-specific valid selling UOMs, prices, and barcodes while retaining canonical base inventory quantities.
- Preserve selected selling UOM, conversion, price, tax, discount, and promotion snapshots on every order and fulfilment line.

Acceptance:

- The chosen fulfilment location can sell the selected UOM at the quoted price.
- A store-specific selling rule cannot change historical receipt, return, payment, or report values.
- Serial, batch, and expiry stock remain measured and reserved in base quantities.

### ECOM-MBF-202 - Returns, Reporting, And Reconciliation

Status: Planned

- Extend receipts, returns, reversals, inventory, settlement, and ecommerce reports with branch/fulfilment/UOM context.
- Report promised, reserved, picked, dispatched, delivered, cancelled, returned, and refunded quantities by branch and order.
- Reconcile public storefront demand with HQ stock, POS completion, payment settlement, and delivery exceptions.

Acceptance:

- Finance, stock, and customer-service teams can trace a customer order from checkout through return without manual reconstruction.

## Phase 4: Capacity, Observability, And Operational Hardening

### ECOM-MBF-301 - Performance And Reliability

Status: In progress

- Measure availability lookup, quote, reservation, payment callback, and staff-queue latency under realistic concurrent checkout load.
- Serve managed ecommerce images through responsive AVIF/WebP derivatives, use a high-priority first hero image, and lazy-load noncritical product and gallery images.
- Cache immutable ecommerce upload URLs for one year and render public storefront and product pages as 15-second revalidated output rather than forcing an uncached server render for every visit.
- Return compact product-card records in the storefront catalogue; load rich descriptions, galleries, specifications, and reviews from a separately cached product-detail route only when a customer opens that product.
- Record bounded, per-storefront live-process timing and failure metrics for catalogue availability, product details, quotes, order placement, payment start/verification/webhooks, and staff queues. Return the matching `Server-Timing` measurement from those routes and expose the current storefront snapshot to authorised staff in the ecommerce Monitoring tab.
- Surface durable operational health from the ecommerce records: stale active reservations, persisted payment failures, overdue network transfers, aged fulfilment queues, and ledger-versus-reservation stock shortfalls. Bound the scan and visibly report when the configured scan limit prevents a complete shortfall review.
- Provide an explicitly gated disposable-fixture checkout-contention runner. It requires two distinct customer sessions, proves the exact stock-reservation boundary with concurrent pay-on-collection orders, verifies persisted location reservations, and cancels all generated orders through the governed staff workflow before it reports success.
- Add targeted indexes, broader cache boundaries, retry/backoff, queue health, CDN/object storage, and alerting based on measured bottlenecks.
- Retain webhook failure history and issue automated notifications only after the operations policy and storage/alerting boundary are approved; current-process webhook failures are already visible in the live timing snapshot.

Acceptance:

- Load tests show stock cannot be oversold under concurrent checkout.
- Operational dashboards surface stale reservations, failed callbacks, and blocked fulfilments before customers are affected.

Evidence:

- Enterprise Web production build and TypeScript validation passed after responsive image delivery and static route revalidation were introduced.
- Local production runtime served an ecommerce upload with `Cache-Control: public, max-age=31536000, immutable`; its 384px image-optimizer response was AVIF and 22,202 bytes from a 102,682-byte JPEG source.
- Public ecommerce Playwright specification parses with compact-catalog and on-demand product-detail assertions; its browser run remains part of production-like UAT.
- `npm run acceptance:ecommerce-performance`, Enterprise Web TypeScript validation, and `npm run acceptance:ecommerce-multi-branch` passed after route timing, webhook attribution, and staff monitoring were added.
- The ecommerce performance gate now verifies persistent-health severity escalation for stale reservations and reserved-stock shortfalls; the staff monitoring API combines this durable snapshot with the live route timings.
- `npm run acceptance:capacity-hardening` and `npm run acceptance:ecommerce-performance` passed after the checkout-contention runner was added. Its local guard was exercised without a fixture and refused to issue writes until the required explicit opt-in is supplied; a production-like run with disposable customer/staff sessions remains UAT evidence.
- Live mobile, tablet, and desktop browser verification passed against the deployed `225c682-r7` storefront, including configured hero-image retrieval and direct simple-item card-to-cart behavior. Authentication-dependent and operational fulfilment scenarios remain part of production-like UAT.

## Explicitly Out Of Scope Until A Later Approved Phase

- A separate public storefront URL and catalogue for every branch.
- Automatic delivery-fee calculation or driver marketplace integration.
- Silent cross-branch splitting of a customer order.
- Branch-specific UOM/pricing/barcodes without snapshot-safe orders, returns, receipts, and reports.
- Treating service items as stock-reserved ecommerce products unless a service fulfilment policy is separately approved.

## Tracker Maintenance

- Update a work item only with its implementation status, commit/PR, validation command, and UAT evidence.
- Keep code complete, merged, deployed, and business accepted as distinct checkpoints.
- Any scope change that affects pricing, payments, allocation, customer promise, or inventory must be added here before implementation starts.
