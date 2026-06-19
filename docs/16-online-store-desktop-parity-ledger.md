# Online Store Desktop Parity Ledger

## Desktop Is The Source Of Truth

The browser online-store is not a separate simplified POS. For HQ-connected stores that operate in browser mode, Store Desktop is the functional and business-rule baseline. A browser implementation is only acceptable when the same operational outcome, validation rule, posting effect, and manager-control behavior is present, or when the difference is explicitly listed as a browser-only exception below.

This ledger exists because visual parity is not enough. A visible button or matching layout does not certify parity unless the data contract, server validation, business posting, and live workflow evidence also line up.

## Functional Parity Areas

| Area | Store Desktop Baseline | Online-Store Required Equivalent | Current Evidence |
| --- | --- | --- | --- |
| Branding and shell | Desktop snapshot carries enterprise logo/background and renders desktop-style shell chrome. | Online-store workspace must carry enterprise branding, render saved company logo, and collapse to logo plus menu icons without text abbreviations. | `readOnlineStoreBranding`, `workspace.branding.companyLogoUrl`, `online-store-parity.spec.ts` |
| Basket sale capture | Add scanned/catalog items, remove/update basket lines, enforce open shift, price-entry products, taxes, promotions, loyalty, tender validations, and customer credit rules. | Browser POS must post through HQ with the same calculations and validation posture before a sale can complete. | `createOnlineStoreSale`, `applyAutomaticPromotions`, `calculateLoyaltyRedemption`, `deriveCustomerAccountPostingEffect`, `mustEnterPriceAtPos`, `requiresReference`, `requiresBankAccount`, `allowChange`, `creditLimitAmount`, `taxInclusive` |
| Held baskets and sales orders | Park/resume baskets, create/resume/cancel sales orders, preserve customer/operator context. | Browser POS must hold/recall baskets and create/cancel sales orders with the same customer and shift constraints. | `createOnlineStoreHeldSale`, `resumeHeldSale`, `createOnlineStoreSalesOrder`, `cancelOnlineStoreSalesOrder` |
| Customer account payments | Search customers, block invalid credit tenders, require applicable references/bank accounts, post account ledger effect, and produce a receipt. | Browser POS must use the same customer ledger effect and tender validation. | `recordOnlineStoreAccountPayment`, `deriveCustomerAccountPostingEffect`, account payment receipt preview |
| Returns and exchanges | Receipt-linked return/exchange, source-line quantity limits, supervisor approval, refund tender handling, and serial validation. | Browser Reversals must enforce receipt/source-line limits, manager approval, return/exchange line typing, and tender rules. | `createOnlineStoreCorrection`, `sourceLineId`, `PosTransactionLineIntent.RETURN`, `managerApproval` |
| Shift, X/Z, EOD, banking | Open/close shift, X report, Z/close report, EOD reconciliation, banking deposits, variance capture. | Browser Manager must open shifts, close via EOD, print browser X/Z equivalents, and record banking against reconciliation balances. | `openOnlineStoreShift`, `recordOnlineStoreEod`, `recordOnlineStoreBanking`, `printShiftReport` |
| Inventory execution | Receive purchase orders, supplier returns, stock counts, transfer requests, issue/receive transfers, and serial handling. | Browser Inventory must post HQ-direct inventory movements with the same whole-unit and serial rules. | `createOnlineStoreGoodsReceipt`, `createOnlineStoreSupplierReturn`, `createOnlineStoreStockCount`, `commitOnlineStoreStockCount`, `createOnlineStoreTransferRequest`, `processOnlineStoreTransfer`, `normalizeSerialNumbers` |
| Reports | Sales, tender, product, inventory, shift, account-payment, and banking report rows with date/scope filters. | Browser reports must expose the same business facts for the online-store scope. | `browseOnlineStoreReports`, sales/products/tenders/inventory/banking/shifts report tabs |
| Security and lock | Operator session, supervisor approvals, lock/unlock, and permission-derived behaviors. | Browser lock/unlock and manager approval checks must use HQ user/session rules. | `unlockOnlineStoreScreen`, `managerApproval`, online lock dialog |

## Explicit Browser Exceptions

These are not missing business features; they are desktop hardware/offline responsibilities that do not apply to an HQ-direct browser store:

| Desktop Feature | Browser Exception |
| --- | --- |
| Local/offline database ownership, sync queue, dead-letter replay, tray sync, and desktop connection configuration. | Browser online-store writes directly to the HQ SQL Server database and does not own a local store node. |
| Installed-app updater, window recovery, renderer watchdog, and Windows support log paths. | Browser runtime stability is owned by the web deployment and browser session, not Electron. |
| Silent thermal printing, receipt-printer selection, hardware test slip, and cash-drawer kick. | Browser can open printable receipt/report views; local printer/drawer hardware integration remains Store Desktop responsibility unless a browser hardware bridge is explicitly built. |
| Standalone local master-data setup. | Online-store is HQ-connected. Master data remains managed from HQ enterprise screens. |

Anything outside this exception table must be treated as a parity gap until it has code evidence, automated/live evidence, or a deliberate product decision.

## Certification Rule

Do not call online-store implementation complete because it compiles or visually resembles the desktop. Completion requires:

1. `npm run acceptance:online-store-parity` passes.
2. `npm --workspace @flash-erp/enterprise-web run typecheck` passes.
3. `npm --workspace @flash-erp/enterprise-web run build` passes.
4. Live browser certification runs with an online-store user and stocked/sold items:
   - `FLASH_ERP_E2E_ENTERPRISE_BASE_URL`
   - `FLASH_ERP_E2E_ONLINE_STORE_LOGIN`
   - `FLASH_ERP_E2E_ONLINE_STORE_PASSWORD`
   - optional `FLASH_ERP_E2E_MFA_CODE`
5. Manual or automated transaction evidence covers at least one successful stocked sale, held basket recall, customer/account payment, return or exchange, EOD/banking, and one inventory movement for the active online store.

The desktop implementation remains the comparison target for future online-store work. If a feature cannot be replicated exactly in browser mode, the exception must be added here before the feature is considered accepted.
