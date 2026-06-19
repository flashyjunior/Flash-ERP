# Sync Architecture

## Node model

Flash ERP syncs between named nodes:

- `ENTERPRISE`
- `STORE_DESKTOP`
- `MOBILE`

Each store desktop installation is treated as a sync node with its own:

- node code
- store binding
- terminal binding when relevant
- outbound queue
- inbound checkpoint

## Ownership rules

### Enterprise-owned

- org settings
- store, warehouse, and terminal definitions
- users, roles, and permissions
- catalog, pricing, tax, and promotion baselines

Store changes to enterprise-owned data are not applied as silent overwrites.

### Store-owned append-only

- shifts
- POS transactions
- POS payments
- receipt issuance
- local stock-impacting events captured in-store

Enterprise ingests these as authoritative transactional facts from the store.

### Shared with policy

- customer profiles
- selected inventory workflow metadata
- selected operational notes

These require explicit merge policy, version checks, or review tooling.

## Sync mechanics

- local writes create domain state and outbox events in one local transaction
- upstream sync posts batches with idempotency keys
- enterprise applies accepted events and records checkpoints
- downstream enterprise changes are published as separate outbox events
- store nodes pull and acknowledge downstream batches

## Conflict posture

- no silent mutation of store-captured commercial history
- no naive last-write-wins across all entities
- conflicts should be classed as:
  - reject and retry later
  - accept as append-only
  - merge by policy
  - escalate for operator review

## Monitoring baseline

Enterprise should surface:

- last successful sync per node
- queue depth
- failure count
- dead-letter count
- last applied checkpoint
- version skew and stale-node warnings
