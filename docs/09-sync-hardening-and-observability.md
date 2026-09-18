# Flash ERP Sync Hardening And Observability

This note captures the current hardening posture for store-to-HQ sync and the audit/security evidence administrators should expect to see when sync breaks.

## Data Conflicts During Sync

Flash ERP now treats upstream store packets as policy-bound events, not blind writes. The enterprise sync projector checks the ownership rule for the aggregate before applying the payload:

- Enterprise-owned aggregates reject upstream store writes with `POLICY_REJECTED`.
- Shared/store-owned aggregates continue through their explicit projector.
- Stale or duplicate natural keys from database uniqueness conflicts are converted into `STALE_VERSION` sync rejections.
- Missing dependencies such as products, locations, POs, or related transfer records remain retryable `DEPENDENCY_MISSING` failures.

Every rejected projection writes a `SecurityLog` entry under `Sync exceptions` with the event id, idempotency key, aggregate, event type, source node, record version, retryability, ownership policy, payload keys, and error diagnostics.

## Network Interruptions

Downstream pulls resend `PENDING` packets immediately and redeliver `IN_FLIGHT` packets only after the shared retry window has elapsed. When an `IN_FLIGHT` packet is redelivered, enterprise now records a `Sync network` warning that includes the packet ids, idempotency keys, previous attempt count, retry delay, and last attempt timestamp. If a downstream packet reaches the shared retry ceiling without a store acknowledgement, enterprise moves it to `DEAD_LETTER` and records a `sync.downstream-dead-lettered` security event for operator replay.

Desktop upstream pushes now record each outbound attempt before the HTTP call leaves the store. If the network breaks, the server times out, or HQ returns a retryable projection rejection, the store keeps the packet in a retryable `FAILED` state with `next_retry_at`, `failure_kind`, `last_http_status`, and the sync run id that attempted delivery. The next scheduled or manual sync only retries packets whose retry window has elapsed; exhausted upstream retries move to `DEAD_LETTER` instead of looping silently.

Every push and pull can carry a `syncRunId`, trigger, and client start timestamp. The enterprise response echoes the sync run id, giving support staff a single correlation value across desktop queue rows, enterprise security logs, and HTTP-level request failures.

## Schema Drift And Migration Breaks

HQ now checks enterprise database readiness before accepting store sync push or pull traffic. If the deployed code expects a Prisma migration that has not been applied, sync returns HTTP 503 with `ENTERPRISE_DATABASE_SCHEMA_NOT_READY` and `schemaDrift: true` instead of leaking a raw Prisma table or column error. Store Desktop classifies that response as `SCHEMA`, writes it to sync run/outbox diagnostics, and preserves every local queue row for retry after the HQ migration is applied.

Use `/api/system/database-readiness`, `npx prisma migrate status --schema prisma/schema.prisma`, and `npm run cert:database-readiness` to prove HQ is safe before restarting shop sync workers after a deploy.

## Idempotent Sync Logic

Inbound events are keyed by globally unique `idempotencyKey` values. When a store resends an already-known key, enterprise does not project the payload again. It returns the event as a duplicate and writes a `Sync idempotency` log showing the incoming event id, existing event id, existing status, applied timestamp, and any stored error message.

Downstream publication also uses deterministic idempotency keys and `skipDuplicates` for generated publication batches, so repeated master-data publication runs do not create duplicate packets.

## Manual Master-Data Publication

Enterprise-owned master data is normally evaluated when a shop pulls from HQ. A first pull without a cursor queues the shop's eligible bootstrap data; later pulls queue records whose current version has not already been published for that shop. Product publication follows the shop catalogue policy unless an operational workflow explicitly requires a product dependency.

An authorised operator can open `Sync > Node detail`, choose `Queue master data`, select one or more data groups, and enter an audit note. HQ immediately creates the selected downstream packets and records a `PUBLISH_MASTER_DATA` operator action. The action does not contact or wake an offline shop: the queued packets remain visible in Downstream delivery until that shop's next scheduled or manual pull acknowledges them.

The selectable groups cover store setup, security, customers, suppliers, products, pricing, tax and tenders, promotions, banking, and gift certificates. Suppliers use the governed `supplier.published` contract and are applied by the SQLite, PostgreSQL, and SQL Server Store Desktop adapters.

## Data Integrity Guarantees

Enterprise projection still runs inside a database transaction for each push batch. The sync event row, canonical projection writes, checkpoint updates, acknowledgement updates, operator actions, and security/audit evidence commit together. If projection fails, the inbound sync event is retained with `FAILED` or `DEAD_LETTER` status and the security log captures enough context for administrator diagnosis.

Downstream acknowledgements are now validated against the target store and packet state before HQ marks a packet acknowledged. A rejected acknowledgement is returned in `rejectedAcknowledgementIds` and logged as `sync.downstream-acknowledgement.rejected`, so stray, stale, or wrong-node ACKs cannot advance enterprise state. Telemetry-only pushes also avoid overwriting the last applied checkpoint; checkpoint progress now advances only when upstream packets or valid downstream ACKs are processed.

The security workspace now exposes diagnostic details from `SecurityLog.detailsJson`, so audit and security grids can show reason codes, idempotency keys, affected events, and retry context without requiring a database console.

## Administrator Troubleshooting Trail

Administrators should use these views together:

- `Security > Security logs`: sync projection exceptions, network redeliveries, idempotency duplicates, sign-in failures, lockouts, and request-level sync failures.
- `Security > Audit logs`: administrator changes and sync recovery/operator actions.
- `POS > Exceptions`: failed inbound POS/store packets with payload, recovery actions, and resend/reprocess controls.
- `Sync > Node detail`: queue posture, dead-letter counts, and downstream replay actions.
