# Alternate UOM And Layaway Implementation Tracker

Updated: 2026-08-14

This is the delivery ledger for alternate-unit selling and Layaway across Flash ERP HQ, online store, ecommerce, and Store Desktop. Both capabilities share product, pricing, inventory, order, payment, and reporting foundations, but they are implemented and accepted as separate slices. Alternate UOM is completed first because Layaway stock reservation must operate on canonical base quantities.

## Status Legend

- Done: implemented and verified with the listed evidence.
- In progress: currently being implemented.
- Next: the next coherent delivery slice.
- Planned: scoped but not started.
- Blocked: waiting on a decision or external dependency.

## Non-Negotiable Rules

- Inventory quantities and ledger movements remain in the product base UOM.
- Every sale and order line preserves both the selling quantity/UOM and its base-quantity conversion snapshot.
- Existing products without alternate selling-unit setup continue to sell exactly as they do today.
- Store-specific selling units, prices, and optional barcodes are centrally governed and sync to offline stores.
- Returns reverse the original base quantity using the original transaction-line conversion snapshot.
- Serialized products cannot use a selling conversion that produces an invalid serial count.
- Expiry and batch allocation always consume the calculated base quantity.
- Layaway reservations never invent a second stock balance; available stock is on-hand less active reservations.

## Current Checkpoint

- Branch: `agent/alternate-uom-selling`.
- Baseline: merged PR #3 at `aa89bc95f44fb1b41c1cf64e091385fdf539a774`.
- Active slice: alternate UOM and Layaway are complete across HQ, Online Store POS, public ecommerce, Store Desktop, sync, finance, reporting, and supported databases.
- Accepted foundation: SQL Server schema/backfill, shared conversion rules, HQ configuration, ecommerce cart, online POS basket, and SQLite/PostgreSQL/SQL Server desktop sale and linked-return behavior.
- Layaway implementation begins only after alternate-UOM sale, return, sync, and reporting acceptance is complete.

## Alternate UOM

### UOM-01 Data Model And Domain Rules

Status: Done

- Add store/product/variant selling-unit configuration with UOM, conversion factor, price, optional barcode, default flag, and status.
- Add selling UOM, base UOM, conversion factor, and base quantity snapshots to POS transaction and sales-order lines.
- Preserve base-UOM fallback for all existing products and transactions.
- Add shared validation and conversion helpers with decimal-precision and serialized-item guards.
- Add SQL Server migration and schema-compatibility handling for deployed databases.

Acceptance:

- Prisma format, validate, and generate pass.
- Migration is idempotent on an existing SQL Server database.
- Conversion tests cover each, pack, carton, fractional, service, serialized, and invalid configurations.

Evidence:

- Prisma schema validation and enterprise/domain/sync/desktop typechecks pass.
- `acceptance:alternate-uom:sqlserver` executes the migration twice against SQL Server and verifies required schema plus historical base-quantity backfill.
- `acceptance:alternate-uom` covers base fallback, fractional sale rules, serialized guards, stale selections, and invalid configurations.

### UOM-02 HQ Product And Store Configuration

Status: Done

- Configure sellable UOMs from the product's active UOM schedule.
- Configure store-specific price, optional barcode, default selling UOM, and active state.
- Prevent duplicate defaults, invalid schedule UOMs, non-sale UOMs, duplicate store barcodes, and invalid conversion factors.
- Show a clear base-UOM fallback when no store override exists.

Acceptance:

- HQ create, edit, reload, validation, and authorization checks pass.
- Product and store configuration remains usable on desktop, tablet, and mobile widths.

Evidence:

- Authenticated browser acceptance creates and edits base/carton selling units, rejects a UOM outside the active sale schedule, reloads the HQ grid, and verifies the saved price and conversion.
- The HQ grid now shows selling-unit code/name and the exact product base UOM instead of a generic base-unit label.
- Mobile and tablet browser checks confirm no page-level horizontal overflow.

### UOM-03 Sync And Standalone Providers

Status: Done

- Publish store selling-unit configuration through the existing sync owner.
- Persist the same contract in SQLite, PostgreSQL, and SQL Server Store Desktop providers.
- Make sync retry and replay idempotent.
- Support equivalent local maintenance in standalone mode.

Acceptance:

- All three providers resolve the same lookup, price, conversion, and default UOM.
- Replayed downstream events do not duplicate selling-unit rows.
- Existing stores continue to sell using base-UOM fallback before the new setup is synced.

Evidence:

- Sync publication plus SQLite, PostgreSQL, and SQL Server persistence paths compile and pass the static alternate-UOM and sync-hardening gates.
- Standalone product maintenance supports selling-unit code, conversion, price, barcode, and default selection.
- Disposable SQLite, PostgreSQL, and SQL Server runtimes all sell `2 CTN` as `48 EA`, complete a linked `1 CTN` return as `24 EA`, and fulfil a partial-deposit `1 CTN` sales order as `24 EA`.
- The provider run also verifies standalone administrator bootstrap, selling-unit barcode lookup, UOM-specific price, location-stock movement, and deposit/balance payment attribution.
- SQL Server and PostgreSQL apply the same downstream product event twice while retaining one applied inbox record, one product, one selling-unit barcode, and one valid carton configuration.

### UOM-04 Store Desktop POS And Sales Orders

Status: Done

- Resolve a scanned product/UOM barcode to the correct selling unit.
- Show a compact UOM selector when more than one selling unit is active.
- Price and promote the entered selling quantity while validating and moving base quantity.
- Preserve selling/base snapshots through immediate sales, saved sales orders, fulfilment, cancellation, and recovery.
- Allocate serials and expiry batches using calculated base quantity.

Acceptance:

- Each/carton sale, sales order, fulfilment, partial payment, reversal, and return pass.
- Stock movement equals `selling quantity x conversion factor` in every provider.

Evidence:

- Disposable SQLite, PostgreSQL, and SQL Server runtime acceptance sold `2 CTN` as `48 EA`, completed a linked `1 CTN` return, then created and fulfilled a `1 CTN` sales order with a `20` deposit and `40` balance payment.
- The order remained at `76 EA` while open and moved exactly `24 EA` on fulfilment, leaving `52 EA`; the selling/base UOM snapshots and total `60` payment attribution remained intact.
- The same provider suite resumes and abandons fulfilment without changing the open order, deposit, line snapshots, or stock; a separate `1 CTN` order then cancels without moving stock and retains its carton/base snapshots for reprint.
- A completed `2 CTN` sale is fully reversed through two linked `1 CTN` returns in SQLite, PostgreSQL, and SQL Server; exactly `48 EA` returns to stock and a third return is rejected as an over-return.
- Expiry-controlled `1 PK = 10 EA` sales allocate exactly ten base units by FEFO across two batches, while serialized `1 PAIR = 2 EA` sales require and move exactly two serial numbers.
- Desktop typecheck, expiry acceptance, sales-order payment attribution, and stability gates pass.

### UOM-05 Online POS And Ecommerce

Status: Done

- Apply the same selling-unit resolution and base-stock semantics to online POS.
- Expose valid selling UOM choices and prices on ecommerce product, cart, checkout, and order views.
- Keep cart identity distinct by product, variant, and selling UOM.
- Apply promotions to selling quantity and selected UOM without overstating or understating stock.

Acceptance:

- Online POS and ecommerce totals, fulfilment, inventory, and status transitions match Store Desktop.
- Responsive browser checks pass at mobile, tablet, and desktop viewports.

Evidence:

- Browser acceptance verifies UOM-specific price, conversion, server quote, and cart identity on ecommerce.
- The same browser fixture verifies selling-unit selection, price, and base-quantity context in authenticated online POS.
- Existing public-storefront mobile, tablet, and desktop responsive acceptance passes.
- Persisted ecommerce acceptance creates `1 CTN = 24 EA`, rejects an idempotent replay that changes the selected UOM, and retains the selling/base snapshots in both `SalesOrderLine` and the parked POS line.
- Staff progression records `PLACED -> CONFIRMED -> PROCESSING -> READY`; fulfilment completes the sales order and source transaction, prints the carton/base context, and reconciles stock from `100 EA` to `76 EA`.

### UOM-06 Receipts, Returns, Reports, And Audit

Status: Done

- Print selling quantity/UOM and useful conversion context on receipts and order documents.
- Reverse original base quantities on linked returns and reversals.
- Expose selling quantity, UOM, conversion, and base quantity in HQ reports and exports.
- Preserve historical snapshots when product UOM setup or conversion factors change later.

Acceptance:

- Receipt/reprint, linked return, reversal, item sales, inventory movement, and audit reports reconcile.
- Historical reports remain unchanged after master-data edits.

Evidence:

- Transaction/order snapshot fields, receipt context, product report fields, and linked-return conversion handling are implemented.
- SQLite, PostgreSQL, and SQL Server receipt/reprint acceptance retains selling quantity/UOM, conversion, and base quantity for completed sales, fulfilled orders, and cancelled orders.
- Product-sales reports reconcile net `2 CTN = 48 EA` and monetary totals after a `2 CTN` sale, linked `1 CTN` return, and fulfilled `1 CTN` order without merging incompatible selling UOMs.
- After the completed sale is fully reversed, reports reconcile the remaining fulfilled order as net `1 CTN = 24 EA` and `60`; stock returns to `76 EA` and over-return is blocked.
- Changing the current carton master setup from factor `24`/price `60` to factor `12`/price `999` leaves historical receipts and reports on their original factor, base quantity, and monetary snapshots in all three providers.

### UOM-07 Production Acceptance

Status: Done

- Run focused unit, typecheck, build, Prisma, sync, desktop, online-store, ecommerce, and browser gates.
- Certify SQL Server HQ plus SQLite, PostgreSQL, and SQL Server desktop providers.
- Record real transfer-in-carton, retail-sale-in-eaches, sale-in-carton, return, and fulfilment evidence.

Current evidence:

- Passed: Prisma validate; domain, sync, desktop, and enterprise-web typechecks; alternate-UOM static/runtime gates; SQL Server migration idempotency; real SQLite/PostgreSQL/SQL Server sale, linked-return/full reversal, partial-deposit fulfilment, cancellation/recovery, FEFO batch, serialized-item, receipt/reprint, historical-snapshot, product-report, and carton-transfer runs; online-store parity; expiry; sales-order payment attribution; sync hardening; desktop stability; responsive browser acceptance; and cross-surface UOM browser acceptance.
- Carton-transfer evidence: each provider issues `1 CTN = 24 EA` from a warehouse balance of `76 EA`, receives `24 EA` into the retail location, leaves `52 EA` at source and `24 EA` at destination, and preserves aggregate stock at `76 EA`.
- Final consolidated rerun passed workspace typechecks, Prisma validation, SQL Server migration replay, alternate-UOM SQLite/PostgreSQL/SQL Server runtimes, online-store parity, expiry, sales-order payment attribution, sync hardening, and desktop stability.

## Layaway

### LAY-01 Company Policy And Permissions

Status: Done

- Add a Company Settings > Layaway tab.
- Configure immediate stock reservation, default minimum deposit percentage, full-payment fulfilment requirement, and cancellation fee.
- Add role permissions for create, receive payment, cancel/refund, release reservation, override policy, and fulfil.

Evidence:

- Company Settings persists an enabled flag, immediate-reservation policy, minimum deposit percentage, full-payment fulfilment requirement, cancellation-refund policy, and percentage/fixed cancellation fee in the existing company settings owner.
- The normalized policy publishes through the store sync contract and is consumed consistently by SQLite, PostgreSQL, and SQL Server Store Desktop providers; standalone mode exposes the same policy as editable local settings while HQ-managed desktop and online-store views remain read-only.
- The central security catalog and every standalone provider expose granular permissions for create, installment receipt, cancellation/refund, reservation release, policy override, and fulfilment.
- `acceptance:layaway-policy` validates defaults and bounds, HQ UI/repository/sync wiring, all provider mappings, persisted custom SQLite policy values, persisted custom role permissions, and successful reload after a service restart.

### LAY-02 Layaway Lifecycle And Reservations

Status: Done

- Create quote/layaway, accept deposit, reserve base stock, receive installments, release or adjust reservations, fulfil, cancel, expire, and refund.
- Store an immutable policy snapshot on each layaway.
- Prevent overselling by subtracting active reservations from available stock.
- Keep serialized and batch units unallocated until fulfilment unless policy explicitly reserves identified units.

Evidence:

- Shared layaway rules calculate immutable policy snapshots, minimum deposits, cancellation fees/refunds, reservation-aware availability, and full-payment fulfilment eligibility.
- Prisma, SQL Server migration, SQLite, PostgreSQL, and SQL Server store schemas carry order type, cumulative paid amount, policy snapshot, reservation/expiry/cancellation state, record version, and base-UOM reservation rows.
- SQLite lifecycle acceptance creates a `400` layaway with an `80` deposit, reserves `4 EA` without moving on-hand stock, blocks a `7 EA` sale against only `6 EA` unreserved availability, receives cross-action installments, and rejects fulfilment before full payment.
- After full payment, fulfilment consumes the reservation and moves stock exactly once from `10 EA` to `6 EA`; cancellation retains a `10%` fee, records a negative refund tender, releases stock, and expiry releases stock without allocating serial or batch identities.
- Connected-store acceptance emits monotonic `sales-order.recorded`, `sales-order.payment-received`, `sales-order.fulfilled`, `sales-order.cancelled`, and `sales-order.expired` events with reservation snapshots and replay-safe payment IDs; state survives a service restart.
- Enterprise sync parses and projects every lifecycle transition, UOM/base-quantity snapshot, reservation row, and missing payment idempotently while preserving an already-completed source transaction.
- `acceptance:layaway-lifecycle` passes the standalone and connected-store lifecycle, and `acceptance:layaway:sqlserver` executes the deployed SQL Server migration twice while verifying lifecycle columns, reservation indexes, and historical paid-amount backfill.

### LAY-03 Payments, Finance, And Reporting

Status: Done

- Attribute every deposit/installment/refund to the receiving shift, terminal, operator, tender, reference, and date.
- Post customer liability/clearing, cashbook, fulfilment revenue/tax/COGS, cancellation fees, and refunds through existing Finance owners.
- Add outstanding layaway, payment history, ageing, reservation, cancellation, refund, and operator/shift reports.

Evidence:

- Layaway deposits and installments debit the receiving cash, bank, store-credit, or clearing account and credit customer advances when the money is received; refunds and cancellation fees clear the same customer-advance liability through the existing Finance posting and cashbook owners.
- Fulfilment recognizes revenue, tax, and COGS without receiving the deposit or installment cash a second time, and historical hyphenated posting source codes remain visible to replay/idempotency checks.
- HQ Enterprise Reporting and Online Store reports expose outstanding balances, ageing buckets, base-unit reservations, cancellation fees, refunds, and dated payment history with shift, terminal, operator, tender, and reference attribution.
- `acceptance:layaway-finance` passes a rollback-only SQL Server posting cycle for deposits, installments, cancellation/refund, fulfilment, cashbook attribution, report reconciliation, and replay idempotency.
- Domain, sync-core, enterprise-web, and Store Desktop typechecks pass together with Prisma validation, layaway policy/lifecycle/SQL Server gates, online-store parity, sync hardening, and desktop stability.

### LAY-04 Desktop, Online Store, And Acceptance

Status: Done

- Deliver equivalent desktop and online-store workflows with offline sync and conflict handling.
- Show due amount, payment history, reservation state, expiry, and permitted actions without editing the original order lines during fulfilment.
- Test create, installment, cross-day/cross-shift payment, full payment, fulfilment, cancellation, refund, expiry, sync replay, and recovery.

Evidence:

- Store Desktop SQLite, PostgreSQL, and SQL Server providers expose create, installment, release, expire, cancel/refund, and full-payment fulfilment with the same immutable policy and base-stock reservation rules.
- Online Store POS exposes Layaway mode, minimum-deposit enforcement, optional expiry, cumulative paid/due amounts, immutable-policy fulfilment checks, payment history, reservation state, and permission-controlled installment, release, expiry, cancellation/refund, and fulfilment actions.
- Online Store API routes and repository transactions post every Layaway action through the existing payment, Finance, cashbook, audit, and reporting owners; default bootstrapped cashier and supervisor roles now receive the appropriate Layaway permissions.
- Public ecommerce exposes Layaway only when both the HQ company policy and the store-level ecommerce offer are enabled and a ready online gateway is published. Checkout enforces the configured minimum deposit, excludes pay-on-delivery, preserves immutable policy terms, and lets customers pay later installments from their order account.
- Ecommerce stock is reserved only after the opening deposit is verified when the policy requires immediate reservation; unpaid requests remain unreserved, and staff cannot progress them before the minimum deposit is received.
- Automated gates pass for policy/permissions, lifecycle/restart recovery, SQL Server migration replay, Finance/reporting/idempotency, Online Store parity, sales-order payment attribution, sync hardening, Desktop stability, alternate-UOM SQLite/PostgreSQL/SQL Server runtimes, Prisma validation, and all workspace typechecks.
- Authenticated Playwright acceptance enables the store offer, verifies the public catalog policy, rejects a below-minimum deposit, creates an unpaid Layaway with its policy snapshot, confirms staff cannot process it before deposit, and cleans up every fixture.
- Mobile browser acceptance opens a public product, enters checkout, selects Layaway, verifies the configured minimum deposit, and confirms there is no page-level horizontal overflow.
- Optimized enterprise and Store Desktop production builds pass; the production route manifest contains the ecommerce payment endpoints and one consistent online-transfer dynamic route family.
- Cashbook sequence setup now preserves configured prefixes and uses a company-specific prefix for newly created sequences, preventing cross-company Layaway payment entry-number collisions.

## Completion Boundary

Implementation is not complete when only Prisma or one UI is updated. A slice moves to Done only after its domain behavior, HQ data path, online path, Store Desktop providers, sync contract, migrations, documents/reports, and recorded acceptance evidence all agree.
