# 14. UAT Evidence Log

Last updated: 2026-05-01

Use this log as the pass/fail record for the final RMS parity and production-readiness run. Repo-side automation can pre-fill evidence, but the items marked "Live UAT" need the deployment environment, provider credentials, shop devices, and business users.

## Automation Evidence

| Area | Command | Evidence owner | Result | Evidence link or note |
| --- | --- | --- | --- | --- |
| Prisma schema | `npm run prisma:validate` | Engineering | Pending |  |
| RMS seeded acceptance | `npm run acceptance:rms` | Engineering | Pending |  |
| Static E2E certification anchors | `npm run acceptance:e2e` | Engineering | Pending |  |
| Browser E2E: sign-in, MFA, step-up | `npm run e2e:browser` | Engineering | Pending | Requires `FLASH_ERP_E2E_ENTERPRISE_*` values. |
| Electron E2E: sign-in, shift, sale, close, sync | `npm run e2e:electron` | Engineering | Pending | Requires built Store Desktop and `FLASH_ERP_E2E_DESKTOP_*` values. |
| Store Desktop smoke | `npm run smoke:desktop` | Engineering | Pending |  |
| Store Desktop soak gate | `npm run soak:desktop` | Engineering | Pending |  |
| Hardware readiness gate | `npm run cert:hardware` | Engineering | Pending |  |
| Parity closure gate | `npm run acceptance:parity` | Engineering | Pending |  |
| Sync chaos and reconciliation | `npm run acceptance:sync-chaos` | Engineering | Pending | Requires evidence pack rows CH-01 through CH-09. |
| Installed desktop soak execution | `npm run cert:installed-soak` | Engineering | Pending | Requires installed Windows app evidence. |
| Security provider certification | `npm run cert:security-providers` | Engineering | Pending | Requires LDAP/SMTP/SMS/MFA provider evidence. |
| Hardware execution sign-off | `npm run cert:hardware-execution` | Engineering | Pending | Requires actual device model evidence. |
| Functional UAT script execution | `npm run acceptance:functional-uat` | Engineering | Pending | Requires FU-01 through FU-08 evidence. |
| Database schema readiness | `npm run cert:database-readiness` | Engineering | Pending | Verifies applied migrations plus GL, operating expense, and tender gateway schema. |
| Production hardening batch | `npm run acceptance:production-hardening` | Engineering | Pending | Runs the five new hardening gates together. |
| Workspace typecheck | `npm run typecheck` | Engineering | Pending |  |
| Production build | `npm run build` | Engineering | Pending |  |

## Live UAT Checklist

| Area | Scenario | Environment | Owner | Result | Evidence link or note |
| --- | --- | --- | --- | --- | --- |
| HQ sign-in | Enterprise sign-in with MFA delivered through configured SMTP/SMS provider | Production-like HQ |  | Pending |  |
| Security step-up | Password policy save requires step-up and writes security log | Production-like HQ |  | Pending |  |
| SMTP | Real SMTP endpoint sends MFA code and validation is accepted by endpoint owner | Deployment network |  | Pending |  |
| SMS | Real SMS provider accepts MFA payload where a recipient number is configured | Deployment network |  | Pending |  |
| LDAP | Real LDAP bind/search validates from the enterprise server network | Deployment network |  | Pending |  |
| Store Desktop sign-in | Installed desktop signs in cashier and supervisor on a clean Windows profile | Shop machine |  | Pending |  |
| Store Desktop sale | Open shift, scan/add item, complete sale, print/reprint receipt | Shop machine |  | Pending |  |
| Shift close | Supervisor closes shift and verifies Z report/expected cash | Shop machine |  | Pending |  |
| Sync | Manual sync, tray sync, and startup sync exchange with HQ | Shop machine and HQ |  | Pending |  |
| Database readiness | HQ readiness probe returns ready and desktop sync does not report schema drift | Production-like HQ |  | Pending | Capture `/api/system/database-readiness` and `npx prisma migrate status --schema prisma/schema.prisma`. |
| Sync chaos | CH-01 through CH-09 interruption, duplicate, ACK, dead-letter, replay, resend, and reconciliation drills | Shop machine and HQ |  | Pending |  |
| Inventory | Goods receipt, stock count, supplier return, transfer request/issue/receipt | Shop machine and HQ |  | Pending |  |
| Hardware | Printer, scanner, drawer, and payment-terminal workflow checks | Actual shop devices |  | Pending |  |
| Functional UAT | FU-01 sale to GL, FU-02 return/exchange, FU-03 EOD/banking, FU-04 receiving, FU-05 stock count, FU-06 transfers, FU-07 settings sync, FU-08 security journey | Shop machine and production-like HQ |  | Pending |  |
| Soak | Full trading-day simulation without freezes, black screens, or data loss | Clean Windows shop profile |  | Pending |  |

## Sync Chaos Evidence

| Drill | Owner | Environment | Result | Evidence link or note |
| --- | --- | --- | --- | --- |
| CH-01 upstream network break |  |  | Pending |  |
| CH-02 duplicate upstream resend |  |  | Pending |  |
| CH-03 stale record version |  |  | Pending |  |
| CH-04 wrong-node or stale ACK |  |  | Pending |  |
| CH-05 interrupted downstream pull |  |  | Pending |  |
| CH-06 retry exhaustion |  |  | Pending |  |
| CH-07 operator reprocess |  |  | Pending |  |
| CH-08 resend request |  |  | Pending |  |
| CH-09 business reconciliation |  |  | Pending |  |

## Functional UAT Evidence

| Script | Owner | Environment | Result | Evidence link or note |
| --- | --- | --- | --- | --- |
| FU-01 sale to GL |  |  | Pending |  |
| FU-02 return and exchange |  |  | Pending |  |
| FU-03 EOD and banking |  |  | Pending |  |
| FU-04 receiving to inventory |  |  | Pending |  |
| FU-05 stock count |  |  | Pending |  |
| FU-06 transfers |  |  | Pending |  |
| FU-07 settings sync |  |  | Pending |  |
| FU-08 security journey |  |  | Pending |  |

## Environment Variables For E2E

```powershell
$env:FLASH_ERP_E2E_ENTERPRISE_BASE_URL = "http://127.0.0.1:3000"
$env:FLASH_ERP_E2E_ENTERPRISE_LOGIN = "hq.admin"
$env:FLASH_ERP_E2E_ENTERPRISE_PASSWORD = "<admin-password>"
$env:FLASH_ERP_E2E_MFA_CODE = "<optional-real-provider-code>"

$env:FLASH_ERP_E2E_DESKTOP_CASHIER_LOGIN = "accra-central.cashier"
$env:FLASH_ERP_E2E_DESKTOP_CASHIER_PASSWORD = "FlashERPCashier2026Aa11"
$env:FLASH_ERP_E2E_DESKTOP_SUPERVISOR_LOGIN = "accra-central.supervisor"
$env:FLASH_ERP_E2E_DESKTOP_SUPERVISOR_PASSWORD = "FlashERPSupervisor2026Aa11"
$env:FLASH_ERP_E2E_DESKTOP_LOOKUP = "1000000000001"
```

For production MFA delivery, set Enterprise Settings > SMTP or SMS first. Development builds can still show the MFA code on the sign-in screen; production builds must receive the code through the configured provider.
