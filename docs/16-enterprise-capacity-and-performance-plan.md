# 16. Enterprise Capacity And Performance Plan

Last updated: 2026-08-13

## Objective

Certify the complete Flash ERP Enterprise/HQ deployment for at least 200 concurrent users without limiting the work to the public ecommerce portal. The scope includes public storefront traffic, HQ dashboard and search, catalog, inventory, purchasing, finance, reporting, security, sync supervision, online POS, and ecommerce staff operations.

Implementation completion and production certification are separate. A checked implementation item means the control exists in code. Capacity is certified only after the production build passes the workload matrix against production-like application and SQL Server infrastructure.

## Measured Baseline

On 2026-08-13, a diagnostic burst was run against the local development server with six published products:

| Scenario | Concurrency | Result | Observed latency |
| --- | ---: | --- | --- |
| Public catalog API | 200 | 200 succeeded | p50 52.3 s; p95 53.7 s |
| Server-rendered storefront | 200 | 200 timed out | 120 s client timeout |

This is not a production benchmark because it used `next dev`, but it conclusively exposed an uncached database/read-model stampede. The baseline must not be used as evidence that production can support 200 users.

The first production-build implementation run was then completed on the same machine. After converting the public shop and product pages to 15-second on-demand ISR, the production process handled 200 concurrent requests in each scenario without an error or restart:

| Scenario | Requests | Result | p50 | p95 | p99 |
| --- | ---: | --- | ---: | ---: | ---: |
| Public catalog API | 200 | 200 succeeded | 1.113 s | 1.826 s | 1.886 s |
| Public storefront | 200 | 200 succeeded | 1.688 s | 1.699 s | 1.699 s |
| Runtime capacity endpoint | 200 | 200 succeeded | 0.936 s | 1.694 s | 1.766 s |

After the burst, the process had zero active or queued guarded operations, zero database/pool errors, and approximately 231 MB RSS. A subsequent storefront request completed in 61 ms. This certifies only the current local public-read slice; it does not certify authenticated HQ workflows, writes, production SQL/network infrastructure, multi-worker behavior, or the required soak.

The first repository-wide query-budget audit inspected 526 Prisma `findMany` and `groupBy` calls under the Enterprise server. It classified 148 as directly row-bounded, 376 as scoped but requiring pagination/query-plan review, two as approved complete permission registries, and zero as unexplained unbounded or dynamically opaque calls.

The first authenticated HQ baseline used 50 simultaneous requests per route against search, alerts, dashboard, catalog, inventory products, purchase orders, finance, and reports. Before HQ read coalescing, finance and reports each timed out 48 of 50 requests and the process executed about 71,000 queries, including about 18,700 above the one-second slow-query threshold. After tenant-scoped read caching and one-second non-stale session-read coalescing, all 400 requests succeeded, seven of eight routes met the 2.5-second p95 target, finance recorded p95 3.144 seconds, and the process executed 1,503 queries with one slow query.

A simultaneous mixed 200-request authenticated HQ burst then completed with zero HTTP or database connection errors, but its single-worker p95 was 11.13 seconds. Four local workers distributed requests evenly (46, 50, 52, and 52) but increased p95 to 16.86 seconds and exceeded 1.4 GB combined RSS because each worker independently warmed read models against the same local SQL Server. This proves stability, cache isolation, and worker distribution, but it does not meet the latency target. Production worker count must be sized against CPU, RAM, SQL capacity, and a shared cache rather than defaulting to four.

The transactional concurrency probe submitted 50 simultaneous ecommerce checkout requests with one persisted idempotency key. Every request succeeded with the same order number, exactly one order was stored, and reusing the key with changed order details returned HTTP 409. The production HTTP write boundary admitted at most 32 writes concurrently and queued up to 17 during the probe. Payment-initialization idempotency is implemented and statically gated; live duplicate gateway initialization remains part of payment-provider certification.

A separate disposable-fixture checkout-contention runner is available for the missing distinct-buyer reservation test. It determines a low-stock product's current pickup capacity through quote preflight, submits one additional set of independent customer checkouts concurrently, verifies the exact persisted active reservation quantity, confirms that no further unit can be quoted, and cancels every generated order through the normal staff workflow. No production-like run has been recorded yet.

## Acceptance Targets

Unless a customer workload requires stricter limits, the first production certification target is:

| Workload class | Target |
| --- | --- |
| Cached public and HQ reads | zero errors; p95 <= 2 s; p99 <= 3 s |
| Uncached filtered/list reads | zero errors; p95 <= 2.5 s; p99 <= 5 s |
| Transactional writes | zero lost or duplicate facts; p95 <= 3 s; p99 <= 6 s |
| Long reports/exports | asynchronous or bounded; no request blocks interactive traffic for more than 10 s |
| Runtime | no sustained overload, pool exhaustion, or event-loop p95 delay above 250 ms |
| Recovery | returns to normal latency within 60 s after a burst without restarting the service |

## Work Programme

### CAP-01 Baseline And Guardrails

- [x] Record the 200-user ecommerce diagnostic baseline.
- [x] Add a reusable GET-only load runner with per-route latency/error output.
- [x] Add a repository gate for required capacity controls and documentation.
- [ ] Capture production-like baselines for every workload in the certification matrix.

### CAP-02 Shared Enterprise Runtime

- [x] Add a request correlation ID to all Enterprise/HQ responses.
- [x] Add configurable SQL connection pool, acquisition, connection, and request timeouts.
- [x] Add bounded operation concurrency and queue timeouts for adopted read/write routes.
- [x] Add process memory, event-loop, operation, database-error, and cache telemetry.
- [x] Guard the first HQ read slice: dashboard, search, alerts, catalog, inventory, purchasing, finance, reports, security, sync, master data, and online-store workspaces.
- [x] Throttle authenticated session activity writes with a configurable interval and an atomic multi-worker cutoff.
- [ ] Adopt the operation guard across all expensive HQ API route families.
- [x] Bound every production HTTP mutation through the shared Enterprise server before route execution.
- [ ] Export metrics to the selected production monitoring platform with alerts.

### CAP-03 Read Models, Caching, And Invalidation

- [x] Add bounded in-process cache, request coalescing, stale-while-revalidate, and cache metrics.
- [x] Cache the public storefront and promotion policy read models.
- [x] Invalidate ecommerce cache after storefront, publication, payment, review, and promotion changes.
- [x] Add a Redis-backed shared cache adapter, distributed load locks, and explicit version/publish invalidation for multi-worker deployments.
- [x] Profile and cache the first dashboard, global-search, alerts, catalog, inventory, purchasing, finance, and reporting read models.
- [x] Remove legacy GL posting repair from Finance reads and execute the report catalog separately from report data.
- [x] Keep authenticated shells server-rendered while deferring heavy interactive grid construction to each user's browser.
- [ ] Profile and cache remaining navigation counts and shared reference data.
- [ ] Separate product-list summaries from product-detail, gallery, specification, and review reads.

### CAP-04 Pagination And Query Budgets

- [x] Inventory Enterprise server list/aggregate queries and classify bounded, scoped, reference, unbounded, and dynamic calls.
- [x] Add query-count, average/max duration, slow-query count, threshold, target, and timestamp telemetry without retaining SQL text or parameters.
- [x] Bulk-select already-posted Finance source IDs before any legacy per-record reconciliation work.
- [ ] Add server-side pagination, filtering, stable sort keys, and maximum page sizes.
- [ ] Add query-duration logging and SQL execution-plan evidence for critical routes.
- [ ] Add or revise composite indexes from measured production query plans.
- [ ] Move large exports and long reports to background jobs with downloadable results.

### CAP-05 Transaction And Concurrency Safety

- [x] Add persisted request keys and payload fingerprints to ecommerce checkout and payment initialization.
- [x] Reject an idempotency key reused with changed checkout or payment details.
- [ ] Extend the shared idempotency contract to other retryable Enterprise writes.
- [x] Add a repository-wide audit of POST, PUT, PATCH, and DELETE adoption of the shared transactional capacity guard.
- [x] Add a global production write-concurrency and queue boundary covering all 222 mutation handlers.
- [ ] Adopt the shared transactional guard across every mutation route reported by the audit.
- [ ] Verify optimistic concurrency for master-data and workflow status mutations.
- [ ] Stress simultaneous sales orders, fulfilments, receipts, inventory postings, payments, and reversals.
- [ ] Prove unique document numbering under multiple application workers.
- [ ] Prove failed retries cannot double-post inventory, tax, payment, or GL facts.

### CAP-06 Security And Abuse Resistance

- [x] Retain database-backed ecommerce OTP identity/IP limits and attempt limits.
- [ ] Add shared distributed rate limiting for sign-in, search, quote, checkout, uploads, and exports.
- [ ] Add request-body, upload, query-length, and pagination limits across HQ APIs.
- [ ] Certify lockout, OTP, session revocation, and audit logging under concurrent traffic.

### CAP-07 Realtime And Background Work

- [ ] Replace per-client SQL polling where fan-out grows with connected staff sessions.
- [ ] Introduce a shared event/backplane strategy for multi-worker order notifications.
- [ ] Bound sync, scheduled jobs, notification delivery, and report workers independently from web traffic.
- [ ] Add retry, dead-letter, lag, and queue-depth alerts for background processing.

### CAP-08 Deployment And Static Delivery

- [x] Run a production Next.js build, never `next dev`, for capacity certification.
- [ ] Put a supported reverse proxy in front of the app with HTTPS, compression, request limits, and timeouts.
- [ ] Serve immutable frontend assets and product/storefront media through a CDN or object storage.
- [x] Run multiple configurable application workers with round-robin distribution, crash-loop protection, and graceful draining.
- [x] Report the total SQL connection ceiling at startup as `worker count x pool maximum` for deployment sizing.
- [ ] Document rollback, draining, restart, and zero-downtime deployment procedures.

### CAP-09 Enterprise Workload Certification

- [ ] Public storefront browse, search, product detail, quote, account, and order tracking.
- [ ] HQ sign-in/session, dashboard, global search, alerts, and navigation counts.
- [ ] Catalog/product/customer/supplier list and edit workflows.
- [ ] Inventory browser, batch/expiry, purchasing, receiving, counts, and transfers.
- [ ] Online POS sale, sales order, fulfilment, return, and payment workflows.
- [ ] Finance, reporting, GL inquiry, reconciliation, and export workflows.
- [ ] Security administration, audit logs, sync supervision, and recovery actions.
- [ ] Eight-hour soak with 200 mixed virtual users and realistic think time.

## Commands

Repository control gate:

```powershell
npm run acceptance:capacity-hardening
```

Query-budget audit, failing when a new unexplained table-wide or opaque query appears:

```powershell
$env:FLASH_ERP_QUERY_AUDIT_FAIL_ON_UNBOUNDED = "1"
npm run audit:query-budgets
```

Inventory mutation routes that still need the shared transactional capacity guard:

```powershell
npm run audit:write-guards
```

Production-mode read test, with authenticated HQ routes included when a test-session cookie is supplied:

```powershell
$env:FLASH_ERP_CAPACITY_BASE_URL = "https://erp.example.com"
$env:FLASH_ERP_CAPACITY_STORE_CODE = "ACCRA-CENTRAL"
$env:FLASH_ERP_CAPACITY_CONCURRENCY = "200"
$env:FLASH_ERP_CAPACITY_REQUESTS = "200"
$env:FLASH_ERP_CAPACITY_HQ_PATHS = "/api/search?q=flash,/api/system/database-readiness"
$env:FLASH_ERP_CAPACITY_COOKIE = "flash_erp_session=REPLACE_WITH_TEST_SESSION"
npm run capacity:load
```

Validate Redis serialization, distributed miss coalescing, and namespace invalidation against a disposable Redis database:

```powershell
$env:FLASH_ERP_REDIS_URL = "redis://127.0.0.1:6379"
npm run acceptance:shared-cache
```

Production Redis must be private, authenticated, and use TLS (`rediss://`) when traffic leaves a trusted private network. When `FLASH_ERP_REDIS_URL` is unset, a single process continues with the bounded in-memory cache. When Redis is configured but unavailable, requests fall back locally and `/api/system/runtime-capacity` reports degraded health.

Set `FLASH_ERP_CAPACITY_MIXED_HQ=1` to distribute one concurrent burst over every path supplied in `FLASH_ERP_CAPACITY_HQ_PATHS`. Evidence includes the response distribution by application worker.

Mixed-route runs use a balanced, deterministically shuffled request order so route order cannot align with cluster round-robin slots. Set `FLASH_ERP_CAPACITY_ROUTE_SEED` when repeating a specific schedule; the effective seed is written to the evidence output.

Set `FLASH_ERP_CAPACITY_CLOSE_CONNECTIONS=1` only when certifying direct Node-cluster worker distribution without a reverse proxy. It models independent virtual-user connections and prevents the load runner's shared keep-alive pool from pinning most requests to one worker. Production certification behind IIS/ARR or another edge must retain normal keep-alive behavior and verify distribution at that edge.

Run the isolated ecommerce duplicate-checkout probe only against disposable test data:

```powershell
$env:FLASH_ERP_CAPACITY_BASE_URL = "http://127.0.0.1:3100"
npm run capacity:idempotency
```

Never use a production administrator session or run write scenarios from this GET-only command. Transactional capacity tests require isolated test data, idempotency assertions, and reconciliation evidence.

Run the distinct-buyer ecommerce oversell probe only against a disposable low-stock pickup fixture. Supply two different disposable customer sessions separated by `|`, an online-store staff session permitted to cancel orders for the storefront, and a product whose sellable quantity is below `FLASH_ERP_ECOMMERCE_CONTENTION_MAX_PROBE`. The command refuses remote targets until both write-test flags are set, records no session values in its evidence file, and cancels every accepted test order before reporting success:

```powershell
$env:FLASH_ERP_ECOMMERCE_CONTENTION_RUN = "1"
$env:FLASH_ERP_ECOMMERCE_CONTENTION_ALLOW_REMOTE = "1"
$env:FLASH_ERP_ECOMMERCE_CONTENTION_BASE_URL = "https://staging.example.com"
$env:FLASH_ERP_ECOMMERCE_CONTENTION_STORE_CODE = "ACCRA-CENTRAL"
$env:FLASH_ERP_ECOMMERCE_CONTENTION_PICKUP_STORE_CODE = "ACCRA-CENTRAL"
$env:FLASH_ERP_ECOMMERCE_CONTENTION_PRODUCT_ID = "DISPOSABLE-LOW-STOCK-PRODUCT-ID"
$env:FLASH_ERP_ECOMMERCE_CONTENTION_CUSTOMER_COOKIES = "flash_erp_shop_session=FIRST_TEST_SESSION|flash_erp_shop_session=SECOND_TEST_SESSION"
$env:FLASH_ERP_ECOMMERCE_CONTENTION_STAFF_COOKIE = "flash_rms_session=STAFF_TEST_SESSION"
npm run capacity:ecommerce-contention
```

Do not use production customer or staff sessions. The runner intentionally uses pay-on-collection and pickup so cancellation cannot collide with an issued delivery transfer; delivery-network contention remains a separate UAT scenario.

Start a production build with four local workers after sizing SQL Server for the combined connection ceiling:

```powershell
$env:FLASH_ERP_WEB_WORKERS = "4"
$env:FLASH_ERP_DB_POOL_MAX = "20"
npm run start:enterprise:cluster
```

Keep IIS/ARR or another supported edge reverse proxy in front of the cluster for TLS termination, compression, public request limits, and deployment-level health checks. The application cluster does not replace that edge boundary.

## Certification Evidence

For each route/workflow record build SHA, environment, application workers, CPU/RAM, SQL Server tier, pool settings, dataset size, concurrency, request count, throughput, p50/p95/p99/max, error count, event-loop delay, memory high-water mark, SQL waits, deadlocks, and reconciliation result in `docs/14-uat-evidence-log.md`.
