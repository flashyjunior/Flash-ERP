# Store Node Rollout

## Runtime modes

- `embedded`: the desktop opens its own local store service and database.
- `store-server`: one shop machine hosts the store service for all terminals.
- `terminal-client`: a till connects to the store server over the LAN.

For LAN mode, set the same `FLASH_ERP_STORE_SERVER_TOKEN` on the server and every terminal client. When the token is configured, both `/health` and `/api/store/*` reject requests without it.

## New Shop Database Provisioning

Provision the shop database locally before the store starts HQ sync. HQ sync publishes store setup, users, tenders, banks, products, customers, prices, and stock snapshots into an already provisioned store database; it should not be the step that creates store tables.

For embedded SQLite, set an optional store data path and launch the desktop. The app creates the SQLite file and the local store tables on first run, then applies compatible schema repairs during startup.

```powershell
$env:FLASH_ERP_STORE_DATABASE_PROVIDER="sqlite"
$env:FLASH_ERP_STORE_USER_DATA_PATH="C:\FlashERP\StoreNode"
npm --workspace @flash-erp/store-desktop run preview
```

For PostgreSQL, create an empty PostgreSQL database and user first, then provision and probe the Flash ERP store schema.

```powershell
$env:FLASH_ERP_STORE_DATABASE_URL="postgresql://erp:erpdev@localhost:15533/flash_erp_store_accra_central?schema=public"
npm --workspace @flash-erp/store-desktop run store:postgres -- provision
npm --workspace @flash-erp/store-desktop run store:postgres -- probe
```

For SQL Server, the helper can create the target database when the SQL login has database creation rights. Without those rights, create the empty database first and run the same provision command without `--create-database`.

```powershell
$env:FLASH_ERP_STORE_DATABASE_PROVIDER="mssql"
$env:FLASH_ERP_STORE_DATABASE_URL="sqlserver://localhost\sql2017;database=flash_erp_store_accra_central;user=sa;password=<password>;encrypt=false;trustServerCertificate=true"
npm --workspace @flash-erp/store-desktop run store:mssql -- provision --create-database
npm --workspace @flash-erp/store-desktop run store:mssql -- probe
```

Start sync only after the probe reports the store schema is ready.

## Standalone shop mode

Standalone mode is for clients who do not need HQ enterprise, multi-store control, or enterprise sync. It keeps the same desktop and store-service boundary, but local supervisors can manage the shop's master data from the desktop.

```powershell
$env:FLASH_ERP_STORE_DEPLOYMENT_MODE="standalone"
$env:FLASH_ERP_STORE_RUNTIME_ROLE="embedded"
npm --workspace @flash-erp/store-desktop run preview
```

The first standalone launch exposes a local administrator bootstrap on the login screen when no operators exist. After signing in, use the Setup workspace to maintain store settings, locations, bank accounts, suppliers, departments, categories, units, tax, tenders, products, default prices, and automatic promotions. Product master data can also be imported or exported by CSV.

Standalone receiving uses the same purchasing receipt engine as enterprise-managed stores. In the Inventory > Receiving tab, a supervisor can create a local committed purchase order, then receive it immediately into the selected inventory location. This keeps goods receipts, supplier returns, inventory balances, serial movements, reports, and receipt printing on the existing desktop workflow without requiring HQ.

In standalone mode, local operational documents remain local. Goods receipts, supplier returns, stock-count submission/commit, EOD reconciliation, and banking deposits update the desktop store database and local reports without creating HQ-bound sync outbox work. Enterprise-managed stores keep the existing upstream queue behavior for the same workflows.

Standalone transfer and recovery follow-up uses the same rule. Transfer-request submission, transfer issue, transfer receipt, and supplier-return cancellation acknowledgement update the local SQLite or PostgreSQL store database and local activity history without creating HQ-bound sync work. The desktop health/activity feed also switches to standalone wording so an offline standalone shop is not marked unhealthy just because no enterprise acknowledgement exists.

Standalone selling follows the same local-document boundary. POS checkout, quick scanned sales, demo sales, checkout inventory ledger movements, sales-order creation/fulfilment/cancellation, and customer account payment receipts post to the local SQLite or PostgreSQL store ledger without creating HQ-bound outbox events. Enterprise-managed stores keep the existing event queue for the same selling and receivable workflows.

Standalone recovery tasks are local too. Dead-letter requeue, resend review, inventory adjustment recovery, count-variance recovery, and stock-transfer recovery can be completed from the desktop without creating replacement or `syncTask` HQ confirmations. Enterprise-managed stores continue to queue both the corrected business packet and the enterprise task completion packet.

## Store server example

```powershell
$env:FLASH_ERP_STORE_RUNTIME_ROLE="store-server"
$env:FLASH_ERP_STORE_TERMINAL_CODE="back-office-01"
$env:FLASH_ERP_STORE_TERMINAL_NAME="Back Office Server"
$env:FLASH_ERP_STORE_SERVER_HOST="0.0.0.0"
$env:FLASH_ERP_STORE_SERVER_PORT="4747"
$env:FLASH_ERP_STORE_SERVER_TOKEN="<shared-lan-token>"
$env:FLASH_ERP_STORE_SERVER_TIMEOUT_MS="8000"
npm --workspace @flash-erp/store-desktop run preview
```

For a headless store node without opening the desktop UI:

```powershell
$env:FLASH_ERP_STORE_TERMINAL_CODE="back-office-01"
$env:FLASH_ERP_STORE_TERMINAL_NAME="Back Office Server"
$env:FLASH_ERP_STORE_SERVER_HOST="0.0.0.0"
$env:FLASH_ERP_STORE_SERVER_PORT="4747"
$env:FLASH_ERP_STORE_SERVER_TOKEN="<shared-lan-token>"
$env:FLASH_ERP_STORE_USER_DATA_PATH="C:\FlashERP\StoreNode"
npm --workspace @flash-erp/store-desktop run store-server
```

The server health endpoint is available at:

```text
http://<store-server-ip>:4747/health
```

## Terminal client example

```powershell
$env:FLASH_ERP_STORE_RUNTIME_ROLE="terminal-client"
$env:FLASH_ERP_STORE_TERMINAL_CODE="front-02"
$env:FLASH_ERP_STORE_TERMINAL_NAME="Front Till 02"
$env:FLASH_ERP_STORE_SERVER_URL="http://<store-server-ip>:4747"
$env:FLASH_ERP_STORE_SERVER_TOKEN="<shared-lan-token>"
$env:FLASH_ERP_STORE_SERVER_TIMEOUT_MS="8000"
npm --workspace @flash-erp/store-desktop run preview
```

The Sync page shows connected tills from the shared store database. Terminals are treated as online when their heartbeat is seen within the last five minutes.

## Shared database backup

Run backups on the store-server machine, against the shared SQLite database path shown on the desktop Sync page.

```powershell
npm --workspace @flash-erp/store-desktop run db:backup -- backup --source "C:\FlashERP\StoreNode\flash-erp-store.sqlite" --out "D:\FlashERPBackups"
```

The command creates a SQLite backup and a `.manifest.json` file with size, SHA-256, and integrity-check results. To verify a backup later:

```powershell
npm --workspace @flash-erp/store-desktop run db:backup -- verify --source "D:\FlashERPBackups\flash-erp-store-backup-20260428120000.sqlite"
```

## Existing SQLite terminal ledger consolidation

Export an old terminal database:

```powershell
npm --workspace @flash-erp/store-desktop run ledger:migration -- export --source "C:\path\flash-erp-store.sqlite" --out ".\exports\front-02-ledger.json"
```

Import it into the shared store database:

```powershell
npm --workspace @flash-erp/store-desktop run ledger:migration -- import --source ".\exports\front-02-ledger.json" --target "C:\path\shared-store.sqlite" --terminal-code "front-02"
```

The import tool uses `INSERT OR IGNORE` and imports ledger tables by default. It intentionally avoids overwriting store configuration and sync queue metadata.

## Database direction

SQLite remains the compatibility engine behind the store-service boundary for any workflow not yet ported. PostgreSQL is now available as the shared store-node engine for metadata, terminal heartbeats, operator sessions, shift open/close, catalog/customer lookup, tender and bank setup, inventory visibility, serial registry browsing, active sale basket add/update/remove, loyalty redemption, sale checkout, quick scanned/demo sale capture, cashier/store reports, receipt-linked return/exchange baskets, payment capture, account-payment receipts, sales orders, EOD reconciliation, banking deposits, purchasing receipts, supplier returns, inter-store transfer requests/issue/receipt, stock count draft/submit/commit, local sync queue controls, real enterprise push/pull sync when configured, receipt lookup/printing reads, thermal test-slip and cash-drawer preparation, inventory decrement/increment, serial sell-through/return/in-transit status, and outbox events.

## PostgreSQL store-node foundation

Start the separate store PostgreSQL instance:

```powershell
docker compose up -d store-postgres
```

The store database listens on:

```text
postgresql://erp:erpdev@localhost:15533/flash_erp_store_accra_central?schema=public
```

Provision the Flash ERP store schema:

```powershell
$env:FLASH_ERP_STORE_DATABASE_URL="postgresql://erp:erpdev@localhost:15533/flash_erp_store_accra_central?schema=public"
npm --workspace @flash-erp/store-desktop run store:postgres -- provision
```

Probe readiness:

```powershell
$env:FLASH_ERP_STORE_DATABASE_URL="postgresql://erp:erpdev@localhost:15533/flash_erp_store_accra_central?schema=public"
npm --workspace @flash-erp/store-desktop run store:postgres -- probe
```

Enable the desktop or store-server against PostgreSQL after the schema is ready:

```powershell
$env:FLASH_ERP_STORE_DATABASE_PROVIDER="postgres"
$env:FLASH_ERP_STORE_DATABASE_URL="postgresql://erp:erpdev@localhost:15533/flash_erp_store_accra_central?schema=public"
npm --workspace @flash-erp/store-desktop run store-server
```

Plan a SQLite migration without writing to PostgreSQL:

```powershell
npm --workspace @flash-erp/store-desktop run store:postgres -- migrate --sqlite "C:\FlashERP\StoreNode\flash-erp-store.sqlite" --dry-run
```

After reviewing the plan, run the import:

```powershell
npm --workspace @flash-erp/store-desktop run store:postgres -- migrate --sqlite "C:\FlashERP\StoreNode\flash-erp-store.sqlite"
```

Use `FLASH_ERP_STORE_DATABASE_PROVIDER=postgres` for the workflows already served by the PostgreSQL adapter, including normal sale checkout, loyalty redemption, quick scanned/demo capture, receipt-linked returns/exchanges, cashier/store reports, account collections, sales orders, EOD/banking, purchasing receipts, supplier returns, transfer requests/issue/receipt, stock counts, receipt/peripheral preparation, and enterprise sync exchange. Keep `FLASH_ERP_STORE_DATABASE_PROVIDER=sqlite` only for any remaining store workflow that still requires the older SQLite-only mutation adapters.
