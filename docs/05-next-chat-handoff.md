# Next Chat Handoff

## Workspace

Work in:

- `D:\DEVELOPMENTS\FLASH_DEVS\RMS`

## What has been decided

- Flash ERP is offline-first for store operations.
- Flash ERP has three application surfaces:
  - enterprise web
  - store desktop
  - mobile
- The store app is Windows-first and desktop-native.
- Sync is two-way between store nodes and enterprise.
- SMS is the reference for UI style, workspace behavior, and engineering discipline.
- SMS is not the Flash ERP domain model or deployment model.
- Enterprise HQ uses SQL Server.
- Store desktop uses local persistence designed for disconnected operation.

## Recommended next tasks

- implement enterprise auth and shell
- implement store desktop local database bootstrap
- implement sync queue tables and envelopes
- wire catalog download and POS sale upload paths
- build enterprise sync monitoring workspace

## Suggested prompt for the next chat

Use the Flash ERP workspace in `D:\DEVELOPMENTS\FLASH_DEVS\RMS`.

Read the docs in `docs/`.

Continue Flash ERP as an offline-first retail platform with:

- `apps/enterprise-web` for HQ workflows
- `apps/store-desktop` for store POS and offline operations
- `apps/mobile` for later operational mobile workflows
- SQL Server at enterprise HQ
- local store persistence and two-way sync
- SMS-style workspace UI and engineering conventions

Prioritize:

- durable local store writes
- outbound and inbound sync infrastructure
- retail-native schema and terminology
- enterprise master data with controlled downstream replication
