# Ecommerce Multi-Branch Fulfilment Tracker

Updated: 2026-08-20

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
- Branch: `fix/ecommerce-stock-availability`.
- Baseline implementation commit: `31a1a27` (`Rework ecommerce fulfilment across branches`).
- Review baseline: PR #18, `Rework ecommerce fulfilment across branches`.
- Current delivery position: central network allocation, internal-transfer routing, and staff/customer allocation visibility are code complete and covered by focused acceptance plus local production-build browser verification. This change still needs review, deployment, configuration, and production-like UAT before it is marked Done.
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
- SQL Server migrations `20260820010000_multi_branch_ecommerce_fulfillment` and `20260820020000_ecommerce_network_allocation` are in the configured `prisma/migrations-sqlserver` deployment path and apply idempotently.
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
- Publish the customer order as a high-priority `sales-order.published` packet to an assigned Store Desktop node. The packet creates a parked local sales order, preserving the actual balance for payment-on-delivery. Source shops receive only their corresponding high-priority transfer packets.
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
- Prevent staff from marking an order ready, out for delivery, or delivered until all required internal stock transfers have been received at the dispatch location.

Acceptance:

- An authorised staff member can configure at least two active fulfilment locations.
- The customer sees the selected pickup location or assigned delivery dispatch branch at checkout and on the order without being shown internal source stock.
- Unconfigured shops retain the backward-compatible default-location path.

Evidence:

- Enterprise web TypeScript check passed.
- Focused ecommerce acceptance passed.
- The staff order view displays each source transfer, requested/received quantity, and remaining receipt work; browser UAT remains outstanding.

### ECOM-MBF-005 - Phase 1 Rollout And UAT

Status: Next

- Review and merge PR #18.
- Deploy the migration with the normal Flash ERP release and database-readiness gate.
- Configure at least two real fulfilment locations, priorities, and their delivery/pickup eligibility.
- Test delivery from one location, then a delivery basket whose stock is deliberately split across two source locations and confirm the internal transfers reach the dispatch location.
- Test pickup at each configured location.
- Test insufficient network stock, cancellation before/after source issue, paid layaway, POS fulfilment, and a customer order reload.
- Confirm that delivery uses the post-reservation, post-safety-stock network balance while pickup cannot use cross-shop stock.
- Run the full production build and browser smoke on the release/build machine before production deployment.

Local verification evidence (2026-08-20):

- `npm --workspace @flash-erp/enterprise-web run build` passed.
- `npm run acceptance:ecommerce-multi-branch`, `npm run cert:database-readiness`, and Prisma schema validation passed.
- The production server returned HTTP 200 from both live and database-readiness endpoints, including both network-allocation migrations and the fulfilment tables.
- Public ecommerce browser suite: 6 passed; 3 authentication-dependent flows were skipped because this local runtime intentionally does not expose development OTP/MFA codes.

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

Status: Planned

- Measure availability lookup, quote, reservation, payment callback, and staff-queue latency under realistic concurrent checkout load.
- Add targeted indexes, cache boundaries, retry/backoff, queue health, and alerting based on measured bottlenecks.
- Monitor reservation expiry, allocation failure, webhook failure, stock mismatch, and branch queue age.

Acceptance:

- Load tests show stock cannot be oversold under concurrent checkout.
- Operational dashboards surface stale reservations, failed callbacks, and blocked fulfilments before customers are affected.

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
