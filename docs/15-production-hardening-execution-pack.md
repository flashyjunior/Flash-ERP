# 15. Production Hardening Execution Pack

Last updated: 2026-05-01

This pack turns the remaining hardening work into executable certification slices. The scripts below do not replace live UAT; they guard that the code, routes, runtime hooks, and evidence templates needed for production sign-off remain present before a team enters a shop or deployment network.

## Automation Commands

Run these commands from the repository root as the next hardening batch:

```powershell
npm run acceptance:sync-chaos
npm run cert:installed-soak
npm run cert:security-providers
npm run cert:hardware-execution
npm run acceptance:functional-uat
npm run cert:database-readiness
npm run acceptance:capacity-hardening
npm run acceptance:production-hardening
```

Enterprise/HQ capacity work and its 200-concurrent-user certification matrix are tracked in `docs/16-enterprise-capacity-and-performance-plan.md`. Capacity is not certified by this repository gate alone; run `npm run capacity:load` against a production build and production-like SQL Server infrastructure, then record the result in the UAT evidence log.

## Slice 1: Sync Chaos And Reconciliation

These drills prove that sales, inventory, settings, finance, and recovery facts do not double-post or disappear when the network breaks.

| Drill | Break or conflict injected | Expected durable result | Evidence |
| --- | --- | --- | --- |
| CH-01 upstream network break | Disconnect after the store marks the outbox attempt started but before HQ responds | Store event remains `FAILED` with `next_retry_at`, `failure_kind`, `last_http_status`, and `syncRunId`; no canonical double-post exists | Store outbox row, HQ security log, sync run id |
| CH-02 duplicate upstream resend | Resend an already accepted idempotency key | HQ reports duplicate handling and keeps the existing canonical sale, inventory movement, or GL source row | Inbound event pair, canonical fact count, security log |
| CH-03 stale record version | Send an older record version for the same natural business fact | HQ rejects with `STALE_VERSION` and leaves the newer canonical record intact | Inbound event status, rejection details |
| CH-04 wrong-node or stale ACK | Store acknowledges a packet that is not in-flight for that node | HQ returns `rejectedAcknowledgementIds` and logs `sync.downstream-acknowledgement.rejected`; checkpoint does not advance | Push response, sync node detail |
| CH-05 interrupted downstream pull | Pull master/settings packets, crash before ACK, then sync again after retry delay | HQ redelivers only after retry window, then acknowledges exactly once | Downstream packet attempts, store inbox rows |
| CH-06 retry exhaustion | Keep a transport failure until the shared retry ceiling is reached | Upstream or downstream packet moves to `DEAD_LETTER` and remains visible for operator replay | Dead-letter grid, security log |
| CH-07 operator reprocess | Correct a failed inbound packet and reprocess from HQ | Existing packet is projected once inside the enterprise transaction | Recovery audit row, canonical fact count |
| CH-08 resend request | HQ cannot trust the failed packet and asks store for a clean replacement | Store recovery task queues a replacement event with a new idempotency key | Sync task, replacement event, POS exception detail |
| CH-09 business reconciliation | Compare local outbox/inbox, HQ inbound/outbox, POS transactions, inventory ledger, and GL journals after chaos | Counts reconcile by source transaction, stock movement, and journal source id | Reconciliation worksheet, screenshots |

Minimum reconciliation columns: `syncRunId`, store node, event id, idempotency key, aggregate type, aggregate id, record version, status, canonical source id, GL source id, inventory reference, acknowledged at, and evidence owner.

## Slice 2: Installed Desktop Soak

Run the installed Windows app from a clean Windows user profile, not the dev server. One trading-day simulation must include cashier, supervisor, inventory, and manager personas.

| Soak area | Required execution | Evidence |
| --- | --- | --- |
| Startup and sign-in | Launch installed app, sign in as cashier and supervisor, sign out, relaunch | Screenshot, support log path |
| POS continuity | Open shift, scan/add items, park/resume basket, complete sale, print/reprint receipt | Receipt photo, transaction number |
| Returns and EOD | Receipt return, manual supervised return, exchange, close shift, Z report, EOD reconciliation, banking deposit | Z report, reconciliation number |
| Inventory continuity | Receive PO, supplier return, stock count draft/submit/commit, transfer request/issue/receipt | GRN, count session, transfer number |
| Sync continuity | Startup sync, manual sync, tray sync, failed network retry, dead-letter requeue, update check | Runtime status screenshot |
| Runtime stability | Maximize, restore, resize, close to tray, renderer recover, stale heartbeat, black-screen recovery | `%APPDATA%\@flash-erp\store-desktop\logs\main.log` |

Pass criteria: no unrecoverable black screen, no frozen controls, no lost local queue rows, no duplicate sales or inventory movements, no auto-created shift after close, and seller attribution remains the logged-in operator.

## Slice 3: Security Provider Certification

Validate security from the deployment network with provider owners available.

| Provider or control | Required execution | Pass evidence |
| --- | --- | --- |
| LDAP | Validate URL, base DN, bind DN, user search base, and user search filter from Enterprise Settings | Validation response and endpoint owner approval |
| SMTP | Validate host, port, sender, TLS posture, and credential reachability | Provider response and delivered MFA email |
| SMS | Validate provider, sender ID, API URL, credential reachability, and recipient delivery where available | Provider response and delivered MFA SMS |
| MFA sign-in | Sign in with MFA in production mode without exposing the code on screen | Security log and sign-in screenshot |
| Step-up | Save password policy through step-up verification | Security log and audit log |
| Lockout and unlock | Fail sign-in until lockout, then admin unlocks account | Locked-account alert and unlock audit row |
| Alert routing | Trigger critical security event and verify escalation owner accepts the alert path | Alert snapshot and owner sign-off |

## Slice 4: Hardware Execution

The repo gate proves the hooks exist. This slice proves the actual shop devices work.

| Device class | Required live action | Evidence |
| --- | --- | --- |
| Receipt printer | Select printer, print test slip, complete sale, reprint receipt, print account payment receipt, print X/Z report | Device model, driver version, photos |
| Cash drawer | Kick from configured tender and from hardware test action | Drawer model, interface, tender code |
| Barcode scanner | Scan into sell, receipt lookup, inventory lookup, stock count, receiving, and serial browse | Scanner model, sample codes |
| Payment terminal | Approved, declined, voided, and offline tender handling where integrated | Provider, terminal model, transaction references |
| Pole/customer display | Totals and tender flow display correctly where installed | Device model and checkout screenshot |
| Scale | Weighted barcode or scale input updates basket quantity where used | Scale model and barcode format |

## Slice 5: Functional UAT Scripts

These are the business workflows that must be run after the gates pass.

| UAT script | Business path | Reconciliation expected |
| --- | --- | --- |
| FU-01 sale to GL | Open shift, sell mixed tender basket, print receipt, sync | POS transaction, inventory ledger, tax/receivable/COGS GL rows |
| FU-02 return and exchange | Receipt return, exchange, refund path, sync | Return transaction, stock increase, refund tender, GL reversal |
| FU-03 EOD and banking | Close shift, Z report, EOD reconciliation, banking deposit, sync | Cash variance, deposit, audit trail |
| FU-04 receiving to inventory | PO receive, GRN print, supplier return, sync | Goods receipt, stock ledger, supplier return, GL inventory rows |
| FU-05 stock count | Draft count, upload/enter lines, submit, commit, sync | Count variance, adjustment ledger, approval evidence |
| FU-06 transfers | Transfer request, issue, receive, sync both nodes | In-transit quantity clears and both location ledgers match |
| FU-07 settings sync | Change tender, price, role, receipt template, sync | Store snapshot reflects HQ change without stale permissions |
| FU-08 security journey | Password reset, MFA sign-in, lockout, admin unlock, desktop sync | Audit/security logs and user access change on store |

Every completed script must record owner, environment, start/end time, result, evidence link, exception notes, and follow-up owner in `docs/14-uat-evidence-log.md`.

## Schema Drift And Migration Readiness

This hardening extension prevents the exact class of issue where HQ code references a model or column that the live enterprise database has not migrated yet.

| Control | Required behavior | Evidence |
| --- | --- | --- |
| Readiness API | `/api/system/database-readiness` reports missing Prisma migrations, tables, and columns with HTTP 503 until the schema is current | Readiness JSON, migration status |
| Sync push/pull guard | Store sync push and pull return `ENTERPRISE_DATABASE_SCHEMA_NOT_READY` with `schemaDrift: true` instead of raw Prisma stack traces | Desktop sync log and HQ response |
| HQ API guard | Integration and HQ API errors classify Prisma table/column drift as a 503 schema-readiness response | API response and server log |
| Desktop diagnostics | SQLite and PostgreSQL desktop runtimes persist schema drift as `failure_kind = SCHEMA` and keep local queues intact | Store outbox row, sync run log |
| Live database gate | `npm run cert:database-readiness` verifies the applied migrations and the runtime tables/columns used by finance, tender gateways, and sync | Command output |

Run `npm run cert:database-readiness` after every migration deploy and before opening HQ or restarting shop sync workers. If it fails, apply `npx prisma migrate deploy --schema prisma/schema.prisma`, regenerate Prisma client, restart the enterprise server, then rerun the gate.
