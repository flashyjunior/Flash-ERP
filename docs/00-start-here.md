# Start Here

This workspace exists to build Flash ERP as a retail platform with offline-capable store operations and enterprise coordination.

## What changed

The earlier handoff assumed:

- online-first delivery
- browser POS as the primary store surface
- offline sync as a later enhancement

That is no longer the target.

Flash ERP is now designed around:

- enterprise web for HQ and shared services
- a Windows-first store desktop app for POS and store operations
- local-first persistence at the store
- two-way sync between store nodes and enterprise
- mobile as a later extension, not the primary store client

## Non-negotiable design constraints

- The store app must continue core operations while disconnected.
- Sync must work in both directions: store to enterprise and enterprise to store.
- Store transactions must be durable locally before network acknowledgement.
- Inventory and sales must be event-driven and auditable.
- SMS is the UI and engineering reference, not the data model reference.
- Retail tenancy must be modeled around `RetailOrg`, `Store`, `Warehouse`, `Terminal`, and `SyncNode`.

## Immediate implementation goal

Bootstrap the workspace with:

- `apps/enterprise-web` Next.js application
- `apps/store-desktop` Electron + React application
- `apps/mobile` Expo application
- `packages/domain` for retail-domain contracts
- `packages/sync-core` for sync envelopes and policies
- root Prisma/SQL Server enterprise schema
- first offline and sync architecture documents
