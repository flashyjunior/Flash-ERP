# Domain Blueprint

## Top-level entities

- `RetailOrg`
- `Store`
- `Warehouse`
- `Terminal`
- `SyncNode`
- `RetailUser`
- `Role`
- `Permission`

## Core modules

### Foundation

- org setup
- security and RBAC
- sync topology
- audit and operational policy

### Catalog

- product
- variant
- barcode
- department
- category
- tax rule
- price list

### Inventory

- inventory location
- inventory ledger
- goods receipt
- transfer
- adjustment
- stock count

### POS

- shift open and close
- transaction capture
- payment capture
- returns and reversals
- receipts and print output

### Sync Operations

- node registration
- outbound queue
- inbound checkpoint
- retry and dead-letter posture
- conflict review

### Customer Commerce

- customer profile
- address
- customer group
- store credit
- gift card

## Initial schema priorities

- `RetailOrg`
- `Store`
- `Warehouse`
- `Terminal`
- `SyncNode`
- `RetailUser`
- `Role`
- `Permission`
- `Customer`
- `Supplier`
- `Product`
- `Barcode`
- `PriceList`
- `InventoryLocation`
- `InventoryLedgerEntry`
- `PosShift`
- `PosTransaction`
- `PosTransactionLine`
- `PosPayment`
- `SyncOutboxEvent`
- `SyncInboxCheckpoint`

## Core design principles

- sales and inventory changes must be append-first and auditable
- stores must be able to capture commercial activity locally
- enterprise and store ownership rules must be explicit per entity
- deletes must be sync-safe through lifecycle flags or tombstones
