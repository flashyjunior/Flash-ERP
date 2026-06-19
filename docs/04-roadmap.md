# Roadmap

## Phase 0: Architecture reset and bootstrap

- freeze the offline-first architecture
- scaffold enterprise web, store desktop, and mobile apps
- set up Prisma with SQL Server for enterprise HQ
- define sync ownership and queue contracts

## Phase 1: Store offline foundation

- local store database
- shift open and close
- product and price download
- POS sale and return capture
- payment breakdown
- local receipt rendering
- upstream sync queue and replay

## Phase 2: Enterprise master data and sync monitoring

- store, warehouse, terminal, and node management
- catalog management
- pricing and tax management
- sync health dashboards
- retry and dead-letter tooling

## Phase 3: Inventory operations

- receiving
- transfers
- adjustments
- count sessions
- downstream inventory policy sync

## Phase 4: Customer and commerce

- customer profiles
- store credit
- promotions baseline
- loyalty groundwork

## Phase 5: Omnichannel and integration

- order management
- click and collect
- integration outbox
- ERP and commerce connectors

## Delivery recommendation

Prove this order first:

1. store desktop offline write path
2. enterprise master data
3. two-way sync infrastructure
4. POS sale and return
5. inventory ledger
6. monitoring and recovery tools
