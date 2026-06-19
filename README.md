# Flash ERP

Flash ERP workspace for building a multi-company ERP for oil buying, selling, and marketing operations. It starts from the proven Flash RMS codebase so we can reuse the enterprise shell, local-first store runtime, sync contracts, master-data patterns, and reporting foundations without changing the original RMS project.

Flash ERP takes SMS as the implementation reference for UI polish, workspace composition, and engineering discipline. It does not inherit the SMS school domain or deployment model.

## Product shape

Flash ERP is split into four application lanes:

- `apps/enterprise-web` for group/company administration, finance, oil trading operations, reporting, and sync monitoring
- `apps/store-desktop` for depot/station/store operations with local-first persistence
- `apps/mobile` for later field, depot, truck, and assisted-selling workflows
- `packages/*` for shared domain and sync contracts

## Core direction

- multi-company and multi-tenant accounting foundation
- complete finance module: GL, AR, AP, banking, fixed assets, budgets, tax, payroll, and chart of accounts
- oil-specific operations for crude/petrol/diesel purchasing, lifting, depot stock, freight, tax, credit sales, and margin control
- automatic posting from operations into the general ledger
- consolidation across legal entities and companies
- offline-first operational capture where depots, stations, and store nodes need resilience

## Local infrastructure

The inherited baseline currently uses SQL Server for the Prisma enterprise schema. Local helper PostgreSQL services are isolated from RMS and reserved for store/runtime experiments and transition work.

- `DATABASE_URL` in `.env.example` points to `flash_erp_enterprise`
- `docker-compose.yml` uses Flash ERP container names, databases, and ports
- `prisma/schema.prisma` holds the inherited enterprise schema that will be evolved toward ERP accounting
- `.env.example` contains the expected local environment variables

## Start here

Read these in order:

1. `docs/00-flash-erp-charter.md`
2. `docs/00-start-here.md`
3. `docs/01-product-vision.md`
4. `docs/02-domain-blueprint.md`
5. `docs/03-technical-architecture.md`
6. `docs/04-roadmap.md`
7. `docs/05-next-chat-handoff.md`
8. `docs/06-sms-style-and-quality-bar.md`
9. `docs/07-sync-architecture.md`

## Quick start

1. Copy `.env.example` to `.env`
2. Run `docker compose up -d`
3. Run `npm install`
4. Run `npm run prisma:generate`
5. Run `npm run prisma:seed`
6. Run `npm run dev:enterprise`

## Important note

This workspace is now the Flash ERP fork. Keep `D:\DEVELOPMENTS\FLASH_DEVS\RMS` untouched unless an RMS-specific task explicitly asks for changes there.
