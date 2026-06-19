# 17. HQ SQL Server Migration Runbook

Last updated: 2026-05-22

Flash ERP HQ now uses SQL Server for the enterprise database. The store-node PostgreSQL path is still separate and only applies to the optional shared store database runtime.

## Local Connection

Use this local development connection string for the SQL Server 2017 named instance:

```powershell
DATABASE_URL="sqlserver://localhost\sql2017;database=flash_erp_enterprise;user=sa;password=sa;encrypt=false;trustServerCertificate=true"
```

The named instance must use a single backslash in `.env`.

## Bootstrap From Empty SQL Server

```powershell
sqlcmd -S "localhost\sql2017" -U sa -P sa -Q "IF DB_ID('flash_erp_enterprise') IS NULL CREATE DATABASE flash_erp_enterprise"
npx prisma migrate deploy --schema prisma/schema.prisma
npm run prisma:generate
npm run prisma:seed
npm run bootstrap:enterprise-admin
npm run bootstrap:store-operators
npm run cert:database-readiness
```

The SQL Server migration set lives under `prisma/migrations-sqlserver/`.

## Store Server SQL Server Cutover

The embedded SQLite desktop mode remains supported. For the shared store-server runtime, provision a SQL Server store database and run the PostgreSQL cutover helper:

```powershell
$env:FLASH_ERP_STORE_POSTGRES_URL="postgresql://erp:erpdev@localhost:15533/flash_erp_store_accra_central?schema=public"
$env:FLASH_ERP_STORE_MSSQL_DATABASE_URL="sqlserver://localhost\sql2017;database=flash_erp_store_accra_central;user=sa;password=sa;encrypt=false;trustServerCertificate=true"

npm --workspace @flash-erp/store-desktop run store:mssql -- provision --create-database
npm --workspace @flash-erp/store-desktop run store:mssql -- migrate-postgres --dry-run
npm --workspace @flash-erp/store-desktop run store:mssql -- migrate-postgres
npm --workspace @flash-erp/store-desktop run store:mssql -- probe
```

The cutover helper copies every table currently supported by the SQL Server store schema. It refuses a silent partial migration when the PostgreSQL source contains data in tables that the SQL Server store schema does not yet support; rerun with `--allow-partial` only for an intentional sync/bootstrap-only cutover.

After cutover, certify HQ sync against the SQL Server store database:

```powershell
$env:FLASH_ERP_STORE_DATABASE_PROVIDER="mssql"
$env:FLASH_ERP_STORE_DATABASE_URL=$env:FLASH_ERP_STORE_MSSQL_DATABASE_URL
npm run cert:desktop-sync-mssql
```

## Demo Credentials

```text
HQ admin: hq.admin / FlashERPAdmin2026Aa994DA4E07
Online-store supervisor: accra.central.supervisor / FlashERPSupervisor2026Aa11
Online-store cashier: accra.central.cashier / FlashERPCashier2026Aa11
```

Use the supervisor account for the full browser parity certification because that journey includes stock count commit, EOD, and banking actions.

## Certification Commands

```powershell
npm run prisma:validate
npm run acceptance:rms
npm run acceptance:online-store-parity
npm run acceptance:sync-hardening
npm run acceptance:desktop-stability
npm run acceptance:e2e
npm run cert:database-readiness
npm run typecheck
npm run build:enterprise
```

Live browser certification:

```powershell
$env:FLASH_ERP_E2E_ENTERPRISE_BASE_URL="http://localhost:3000"
$env:FLASH_ERP_E2E_ENTERPRISE_LOGIN="hq.admin"
$env:FLASH_ERP_E2E_ENTERPRISE_PASSWORD="FlashERPAdmin2026Aa994DA4E07"
$env:FLASH_ERP_E2E_ONLINE_STORE_LOGIN="accra.central.supervisor"
$env:FLASH_ERP_E2E_ONLINE_STORE_PASSWORD="FlashERPSupervisor2026Aa11"
$env:FLASH_ERP_E2E_ONLINE_STORE_ACCOUNT_CUSTOMER="Mensah Family Shop"
npm run e2e:browser
```

## Integrity Note

SQL Server rejected the original PostgreSQL cascade graph because several relations create multiple cascade paths. HQ therefore uses Prisma `relationMode = "prisma"` with explicit relation indexes added in the SQL Server migration set. Prisma enforces relation behavior at the client layer, while SQL Server owns storage and query execution.
