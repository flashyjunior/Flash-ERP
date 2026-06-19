# Technical Architecture

## Chosen stack

- Next.js for `apps/enterprise-web`
- Electron + React for `apps/store-desktop`
- Expo React Native for `apps/mobile`
- Prisma + SQL Server for enterprise persistence
- SQLite compatibility mode for the current embedded store service
- PostgreSQL as the target shared store-node database for multi-terminal shops, provisioned separately from the enterprise SQL Server database
- TypeScript everywhere
- Zod for validation

## Application topology

- `apps/enterprise-web` is the enterprise control plane
- `apps/store-desktop` is the store execution client
- `apps/mobile` is the later operational companion
- `packages/domain` holds retail-domain contracts and ownership rules
- `packages/sync-core` holds sync envelopes, policies, and retry helpers
- `prisma/` owns the enterprise schema and seed

## Store architecture direction

The store desktop app is not a thin browser shell. For single-terminal previews it can still run embedded, but multi-terminal shops should run one shared store node.

The supported runtime direction is:

- `embedded`: one desktop owns its local store service for preview or single-terminal rollout.
- `store-server`: one shop machine owns the store service, database, outbox, receipt settings, inventory state, and supervisor/EOD ledger.
- `terminal-client`: POS terminals connect to the store server over the LAN and supply their own terminal code per request.

The LAN store service is token-protected with `FLASH_ERP_STORE_SERVER_TOKEN` and records terminal heartbeat metadata on each request. Terminal clients use `FLASH_ERP_STORE_SERVER_TIMEOUT_MS` to avoid hanging a till on a broken LAN call. The desktop dashboard and Sync page use the heartbeat and health payload to show which tills are connected, whether the shared database is protected, and the queue/open-shift posture of the shop node.

The store node should own:

- shared store database
- store write queue
- receipt and peripheral routing settings
- sync worker scheduling
- stock, sales, shift, EOD, and banking ledgers for the shop
- shared database backup operations from the store-server machine

The PostgreSQL store-node foundation is intentionally separate from the enterprise database:

- enterprise database: SQL Server instance `localhost\sql2017`, database `flash_erp_enterprise`
- store-node database: `localhost:15533/flash_erp_store_accra_central`

The current POS workflow service still keeps SQLite compatibility for workflows not yet ported, but the PostgreSQL store-node adapter now serves shared store metadata, terminal heartbeat tracking, operator sessions, shift open/close, catalog/customer lookup, tender and bank setup, inventory visibility, serial registry browsing, active sale basket add/update/remove, loyalty redemption, normal sale checkout, quick scanned/demo sale capture, cashier/store reports, receipt-linked return/exchange baskets, payments, account-payment receipts, sales orders, EOD reconciliation, banking deposits, purchasing receipts, supplier returns, inter-store transfer requests/issue/receipt, stock counts, local sync queue controls, receipt reads, thermal test-slip and cash-drawer preparation, inventory decrement/increment, serial sell-through/return/in-transit status, checkout outbox events, and real enterprise push/pull sync exchange when `FLASH_ERP_STORE_SYNC_BASE_URL` is configured. Store PostgreSQL can be started, schema-provisioned, probed, rehearsed with SQLite migration imports, and used by the desktop or standalone store-server for those supported workflows.

## Sync principles

- store writes commit locally first
- store mutations are published through an outbox
- enterprise publishes downstream changes through its own outbox
- each node tracks inbound checkpoints per remote node
- records use stable IDs and version metadata
- sync is idempotent and resumable
- deletes propagate through tombstones or lifecycle-state updates

## Conflict model

- enterprise-owned master data is authoritative downstream
- store-owned transactional events flow upstream as append-only records
- shared entities such as customers use explicit merge policy and review paths
- no silent overwrites for commercial records

## Engineering pattern

Reuse the proven SMS layering style where it still fits:

- `*.validation.ts`
- `*.service.ts`
- repository and integration code behind explicit interfaces
- thin route handlers
- workspace-oriented UI composition

The important change is architectural, not stylistic:

- SMS is the UI and implementation reference
- Flash ERP is an offline-first retail platform with node-based sync

## Desktop and peripheral note

The store app is Windows-first for early delivery because it must eventually support:

- receipt printers
- barcode scanners
- cash drawer workflows
- local device services

That is one reason Flash ERP uses Electron for the store surface instead of treating store POS as only a browser page.
