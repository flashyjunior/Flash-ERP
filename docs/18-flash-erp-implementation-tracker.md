# Flash ERP Implementation Tracker

Updated: 2026-06-26

This is the live progress ledger for the Flash ERP workspace. Keep it aligned with code as slices land. The tracker is intentionally industry-neutral: product, site, storage, customer, supplier, and document-posting foundations can later support oil, retail, services, distribution, manufacturing, or other operating models.

## Status Legend

- Done: implemented and verified.
- In progress: currently being implemented.
- Next: the next recommended slice.
- Planned: scoped but not started.
- Blocked: waiting on a decision, dependency, or external fix.

## Current Checkpoint

- Database target: SQL Server `localhost\sql2017`, database `Flash-ERP`.
- Current app URL: `http://localhost:3000`.
- First foundation, AR/AP control setup, shared posting engine, party accounting profiles, document numbering, focused Finance setup pages, GL inquiry pages, generic operational document prototypes, AR/AP settlements, cashbook foundation, bank reconciliation, tax setup, fixed assets foundation, budgeting foundation, payroll GL integration foundation, financial statements, period close controls, recurring/adjusting journals, AR/AP document completion, banking workflow completion, fixed asset lifecycle completion, department/cost-center budgeting, and fuel operations foundation are complete.
- Core Finance completion gate is complete. Retail Operations is intentionally deferred for a later module pass. Finance Multi Currency setup, base/functional currency selection from configured `ErpCurrency` rows, Fuel Operations foundation, outbound filling-station transfer tracking, store-sourced fuel sales/payment capture, HQ-direct GRN receiving into PO locations, dedicated Fuel Operations workflow pages, RMS source-location alignment, fuel sales-order fulfillment, site-filtered fuel tank selection, filling-station edit/GPS capture, POS-style Fuel Sale payment capture, functional-currency Fuel Sale defaults, tender-method payment account mappings, tank UOM derivation from selected fuel products, seeded filling-station/tank defaults, customer-credit tender AR posting, shop-linked filling-station transfer destinations, store/shop `COST_CENTER` P&L tracking, transfer-out waybill/feedback handling, actual inventory valuation/GL posting for fuel transfer-outs, online-store POS service type capture, online-store fuel station-side capture routes, online-store supervisor fuel permissions/menu gating, HQ fuel-sales menu removal, and default fuel source/dispatch site settings in Settings are complete as the first industry-specific post-Finance module work.
- Fuel tank dips and nozzle meter readings now require uploaded photo evidence before saving, with backend validation to prevent bypassing the UI guard.
- Fuel Operations product choices now follow the RMS catalog: fuel products are selected from active inventory-tracked Products/Item Dynamic stock, with ERP product profiles kept only as compatibility mirrors for existing fuel tables.
- Fuel Operations source store/site dropdowns now come from RMS inventory locations/Item Dynamic stock, not the Finance Operating Foundation page; compatible ERP operating-site mirrors are maintained behind the scenes for existing fuel relations.
- HQ PO GRN receiving now treats Fuel Operations tank mirroring as optional and store-aware: inventory receipt posts to the PO location, while the tank mirror first tries the exact receiving site and then same-store/site aliases before warning for products without matching active tanks.
- Inventory inter-store transfer requests now expose logistics fields in the generic transfer dialog, persist them on create/edit, publish them with the store transfer payload, and show actionable save-block reasons instead of silently disabling save/commit.
- Goods receipt history now exposes AP supplier-invoice status and can generate a posted supplier invoice from a GRN through a confirmation prompt, using the shared operational-document posting engine so the receipt creates AP/open-item and GL ledger impact before supplier payment; supplier details now include an AP invoices tab showing GRN-generated supplier invoices, journal links, and wide GRN reference hyperlinks back to the original receipt.
- Finance AR/AP Documents now separates customer AR and supplier AP into focused tabs for statements, activity, and aging instead of mixing both sides into one clumsy view.
- AR/AP settlement posting now requires a confirmation prompt before posting customer receipt vouchers or supplier payment vouchers through Finance.
- Supplier AP invoice rows now show posted voucher reductions, paid/open amounts, and voucher context so posted PVs visibly reduce the supplier's owed balance.
- AR/AP statement running balances now apply source documents before settlements on the same posting timestamp, so supplier invoices establish the payable before a same-date payment voucher reduces it.
- HQ Reports now includes exportable Customer Statement and Supplier Statement reports backed by the same Finance AR/AP statement data.
- Fuel sales remain commercial sales through the sale/POS flow. Online-store POS now shows Service Type beside the customer selector and persists it through immediate sales and saved sales orders. HQ Fuel Delivery has been corrected to behave as a store-to-store fuel transfer-out: issuing the transfer reduces source Item Dynamic stock and source tank book quantity, appears in inter-store/in-transit monitoring, and is received by the destination online-store transfer workflow.
- Filling stations are now linked to shops/inventory locations for transfer destinations; customer-credit/accounting workflows use the actual customer account selected on the sale/payment instead of treating stations as customer accounts.
- Customer credit limits now treat `0` as unlimited credit; credit-limit enforcement only runs when the configured customer/Finance party profile limit is greater than zero.
- Fuel delivery/dispatch tank dropdowns are filtered by the selected receiving/dispatch site, with backend validation preventing cross-site tank selection.
- Filling-station payment terms and credit limits now come from the selected customer account's Finance party profile, not from station-level overrides; station records also capture GPS coordinates for future map display.
- Tank, pump, nozzle, and tank-dip dialogs now use controlled dropdowns for operational classifications, fuel products, statuses, and recorded-by users where applicable; tank UOM is derived from the selected fuel product and displayed readonly.
- Fuel Sale entry now uses a wider but compact dialog with non-payment controls placed above the grids, line totals, subtotal/tax/total/balance summary, functional-currency dropdown defaults, configurable default source-site selection from Settings, and multiple payment rows selected from Tender Methods mapped either to Finance cashbook accounts/GL accounts or to customer receivable AR for the Customer Credit tender. Fuel Sale reprints use the shared Receipt Template setup/token renderer for A4 and thermal output instead of Fuel-specific receipt HTML, with Fuel restricted to sales-receipt templates so account-payment, GRN, and PO templates are not selected for fuel sale receipts. Fuel Delivery now prints as a transfer waybill rather than a sales receipt.
- Fuel Sales and station deliveries now auto-resolve selling prices from customer group/tier price lists, source-shop prices, default price lists, or product base prices; weighted average remains the active COGS basis, with FIFO planned for the later inventory valuation slice.
- Fuel Sales, station deliveries, and supplier receipts now surface product/tank UOM in transaction grids and dialogs. Fully paid walk-in fuel sales can post without an AR customer, while sales orders, customer-credit, and unpaid/part-paid sales still require a customer account for receivables.
- Posted fuel sales and fulfilled sales orders create Finance journals through the shared posting engine and create cashbook entries for cash/bank/mobile/card tender rows or AR receivable charges for customer credit/outstanding balances; sales revenue and COGS lines carry the selling shop `COST_CENTER` so Finance income statements can be filtered for P&L by shop. HQ fuel transfer-outs now post valuation through Finance: transfer issue moves inventory value from source shop inventory to in-transit inventory, and feedback POST clears in-transit into destination shop inventory with shortage/gain variance posted to the inventory adjustment/cost account and tagged to the destination shop cost center.
- Fuel Operations receipt output can be configured in Settings for thermal slip or A4 per fuel sale, station delivery, and sales order; grids now include readonly view and direct reprint actions, thermal reprints use the same sales Receipt Template records/templates used by desktop and online-store receipt rendering, A4 reprints use a professional document-style fuel receipt layout, and posted fuel sales plus station deliveries now open the receipt window immediately after a successful save.
- Company logo uploads from Settings > Company now persist immediately to the saved company profile, and Fuel receipt printouts render the saved logo for both A4 and thermal output even when the selected receipt template does not include the logo token.
- Product master data now exposes base cost in the catalog grid, and the expanded sidebar submenu is route-synced so the active child page keeps its parent menu open until another parent menu is opened.
- Transactional fuel grids now show captured date/time stamps instead of date-only operation values, and customer account activity grids prioritize full timestamps.
- Master Tax under the Master menu is the user-facing tax source of truth for products, stores, and Finance posting; Finance tax codes are maintained behind the scenes from Master Tax profiles, and the old Finance Tax Setup route redirects to Master Tax.
- Customer-account receivable activity, including fuel customer-credit sales, now feeds AR/AP statements, aging, and open-item visibility alongside posted operational documents; customer account payments now allocate explicitly to selected invoice rows, post tender-mapped cashbook/GL entries, and generate the shared account-payment receipt.
- Sidebar grouped-menu matching now selects the most specific active child route, so Finance/Settings groups reopen the exact clicked subgroup instead of the first prefix-matching child.
- Database readiness checks now tolerate local SQL Server databases created with `prisma db push` where `[dbo].[_prisma_migrations]` does not exist, while still validating required tables and columns.
- Trial Balance now has an account-type filter, Bank Reconciliation statement-save errors are visible inside the New Statement dialog, fuel catalog repair/seed guarantees active `FUEL` product hierarchy records, and HQ Reports includes an exportable Daily Station Fuel Report for tank dips, meter readings, book stock, and reconciliation review.
- Online-store POS catalog now includes active `SERVICE` products even when no stock quantity exists, while stock/matrix catalog items remain quantity-gated; service sale lines are treated as non-stock lines for online-store stock validation and inventory movements.
- Online-store fuel GRNs and inter-store transfer receipts now mirror received fuel into the matching active fuel tank for the receiving shop/product, and online-store fuel POS sales/fulfilled sales orders reduce the matching tank book quantity when that product is linked to a tank.
- Online-store and synced shop POS sales now post through standard accounting: tender-mapped cashbook/GL accounts for cash, bank, mobile money, and card tenders; AR for Store Credit/unpaid customer balances; Sales Revenue or Service Revenue; Sales Tax Payable; COGS; Inventory; and posted cashbook entries tied to the sale journal.
- POS sales no longer fail solely because a stock item has zero or missing cost; revenue, tax, tender/cashbook, and AR still post, while COGS/Inventory relief is skipped until a valid cost exists.
- Journal Inquiry detail now surfaces related POS sale/COGS accounting lines for the same sale reference so revenue/tax/tender/AR and inventory-cost impact can be reviewed together when COGS posts in a separate inventory journal.
- HQ transfer draft dialogs now reopen with current detail lines after save/refresh, and online-store Fuel pages are scoped to the logged-in shop so tanks, pumps, nozzles, dips, meter readings, supplier receipts, reconciliation, shop prices, stock labels, and default site selections do not bleed across shops.
- Local product and transaction data was reset on 2026-06-22 after Fuel Sale defaults were implemented: transactional POS, inventory, purchasing, fuel, finance posting, cashbook, bank reconciliation, tax, payroll-posting, fixed-asset transaction, sync-event, and product-dependent rows were cleared; the clean RMS fuel catalog now contains `AGO`, `KERO`, `LPG`, and `PMS` with matching ERP product-profile mirrors, seeded filling stations, and seeded zero-quantity tanks.
- Repair/service maintenance tracking is intentionally deferred to a later dedicated Maintenance module instead of being mixed into fixed assets.
- Chart of accounts reset on 2026-06-20 to the requested 61-account general business COA. Local GL journal artifacts were cleared so the new accounts have clean ledger history.
- The inherited RMS-era model names remain where they still own existing data/workflows. Rename them gradually as ERP ownership and migrations are designed.

## Maintenance Notes

### 2026-06-26 Standard POS Sales Accounting

Status: Done

Implemented:

- Added an idempotent POS sales accounting service that posts completed POS transactions through the shared Finance posting engine.
- Posted sale settlement lines to the Tender Method's mapped Finance cashbook/GL account instead of a generic cash account.
- Posted Store Credit and unpaid customer balances to AR, while walk-in cash/bank/mobile/card sales no longer require a customer account.
- Posted transaction-level discounts and loyalty redemptions to the configured customer discount/loyalty account instead of treating them as receivables.
- Split sale revenue between `Sales Revenue` and `Service Revenue` based on product type, and posted sales tax to the Finance tax control account.
- Posted COGS and inventory relief from POS `InventoryLedgerEntry` rows using the inventory movement unit cost.
- Skipped COGS posting for stock items with zero or missing cost instead of blocking the sale's revenue, tax, tender/cashbook, or AR posting.
- Created posted Finance cashbook entries for tender rows mapped to cashbook accounts and linked them to the POS sale journal.
- Wired the service into online-store immediate sales, held-sale checkout, sales-order fulfilment checkout, returns/exchanges, synced store POS transactions, and synced POS inventory ledger entries.
- Replaced the Finance workspace's old generic POS sale materializer with the standard POS accounting service so unposted historical completed sales use the same rules.
- Added related POS sale/COGS lines to Journal Inquiry detail so separate inventory-cost journals are visible from the sale journal reference.
- Corrected online-store receipt and POS total summaries so tax-inclusive sales display a tax-exclusive subtotal that reconciles to total.

Verified:

- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/online-store`, `/api/online-store/sales`, `/api/online-store/corrections`, `/api/sync/store-nodes/[nodeCode]/push`, `/finance`, `/finance/cashbook`, and `/finance/journal-inquiry`.

### 2026-06-25 Finance Grid Polish and Fuel Daily Reporting

Status: Done

Implemented:

- Added a Type dropdown filter to the Finance Trial Balance grid.
- Rendered bank statement save errors inside the New Statement dialog so backend validation details are visible while the dialog is open.
- Added seed/runtime repair for active `FUEL` product hierarchy records and fuel categories `DIESEL`, `KEROSENE`, `LPG`, and `PETROL`.
- Added a HQ Reports Daily Station Fuel Report covering shop/station, tank, product, book quantity, latest dip/water/variance, meter sales, reconciliation gain/loss, and last activity.

Verified:

- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm run prisma:validate`
- `npm run prisma:seed`
- Live SQL/Prisma smoke confirmed active `FUEL` department and fuel categories.
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/finance/trial-balance`, `/finance/bank-reconciliation`, `/reports`, and `/catalog/products/[productCode]`.

### 2026-06-25 Transfer Draft Details and Shop-Scoped Online Fuel

Status: Done

Implemented:

- Fixed the HQ inter-store transfer grid action handlers so reopening a saved draft uses the current transfer rows instead of stale pre-refresh rows.
- Kept transfer draft detail lines visible in the Content tab after saving and reopening the draft from the HQ transfer grid.
- Added an optional shop scope to the Fuel Operations workspace loader.
- Passed the logged-in online-store shop into embedded and dedicated online-store Fuel pages.
- Scoped online-store Fuel tanks, pumps, nozzles, dips, meter readings, supplier receipts, reconciliation rows, store options, site options, shop prices, product stock labels, and default site selections to the logged-in shop.

Verified:

- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/inventory/transfers`, `/inventory/in-transit`, `/online-store/fuel`, `/online-store/fuel/tanks`, `/online-store/fuel/dips`, `/online-store/fuel/meter-readings`, `/online-store/fuel/supplier-receipts`, and `/online-store/fuel/reconciliation`.

### 2026-06-25 Online Store Fuel Tank Quantity Mirroring

Status: Done

Implemented:

- Added online-store fuel receipt tank mirroring for GRNs and inter-store transfer receipts.
- Reused inventory-location-backed operating-site, product-profile, and tank matching so received fuel increases the active tank mapped to that filling station/shop product.
- Added online-store POS fuel-sale tank reduction for immediate sales and fulfilled held/sales-order sales.
- Added receipt/sale response messages showing the fuel tank receipt/update or skipped product/site when no active matching tank exists.

Verified:

- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/online-store`, `/api/online-store/sales`, `/api/online-store/goods-receipts`, and `/api/online-store/transfers/[transferId]/receive`.

### 2026-06-25 Online Store Service POS Catalog

Status: Done

Implemented:

- Changed Online Store POS catalog eligibility so active `SERVICE` products remain visible without Item Dynamic stock quantity.
- Kept positive-stock gating for stock/matrix POS catalog items.
- Added service-aware stock-management checks so `SERVICE` sale, sales-order, exchange replacement, and held-sale fulfilment lines do not require stock or create inventory movements.
- Changed POS catalog/search/replacement labels to show `Service` instead of `Stock 0` for service products.

Verified:

- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/online-store` and `/api/online-store/sales`.

### 2026-06-25 GRN AP Invoice and Online Store Fuel Menu Correction

Status: Done

Implemented:

- Added a posted AP supplier-invoice generation action from HQ Goods Receipt history.
- Reused `SUPPLIER_INVOICE` operational documents and the shared Finance posting engine so GRNs credit AP and debit the configured inventory control account.
- Made GRN AP generation idempotent by detecting existing supplier invoices linked through `GRN:<receiptNo>`.
- Added AP invoice status, invoice number, and journal number context to the Goods Receipt grid and detail dialog.
- Added a confirmation prompt before `Generate AP` posts a supplier invoice, AP open item, and Finance journal from a GRN.
- Added supplier AP invoice visibility to the HQ supplier details dialog so GRN-generated `SUPPLIER_INVOICE` operational documents can be reviewed from the supplier record.
- Expanded supplier AP invoice GRN references and made them hyperlinks to the original Goods Receipt dialog for review and printing.
- Split Finance AR/AP Documents into Customer AR and Supplier AP tabs, each with separate statement balance, activity, and aging grids.
- Added a confirmation prompt before posting AR/AP settlement allocations, including supplier payment vouchers and customer receipt vouchers.
- Added paid/open/voucher context to supplier AP invoice rows so payment vouchers visibly update the supplier invoice posture.
- Added Customer Statement and Supplier Statement reports to HQ Reports using the Finance AR/AP statement rows.
- Corrected AR/AP statement ordering so same-date supplier invoices display before their payment vouchers and running balances no longer show temporary negative payable balances caused only by row ordering.
- Changed the online-store Fuel sidebar item to render the existing Fuel Operations workspace inside the online-store shell, instead of routing into the HQ/enterprise shell and replacing the shop menu.
- Kept Supplier Receipts as a permission-gated Fuel tab for online-store supervisors with `fuel.supplier-receipt.capture`.
- Moved Online Store POS Service Type into the top customer strip and forwarded it through immediate sale and sales-order APIs so it is posted with the transaction.

Verified:

- Live SQL/Prisma check confirmed `ONLINE_STORE_SUPERVISOR` has `fuel.station.view`, `fuel.tank.manage`, `fuel.dip.capture`, `fuel.meter-reading.capture`, `fuel.supplier-receipt.capture`, and `fuel.reconciliation.manage`.
- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/purchases/goods-receipt`, `/api/purchases/goods-receipts/[goodsReceiptId]/supplier-invoice`, and `/online-store/fuel`.

### 2026-06-25 Transfer Visibility and Online Store Grid Cleanup

Status: Done

Implemented:

- Changed the HQ In-Transit transfer number cell into a hyperlink that opens the issued transfer detail dialog through the existing `openTransfer` route state.
- Kept the rest of the HQ In-Transit row behavior available for location drilldown while making the transfer number itself the direct transfer-detail entry point.
- Locked the HQ transfer dialog for committed/non-draft transfer requests so header fields, logistics fields, line edits, remove actions, and save/commit buttons are disabled when viewing an already committed transfer.
- Removed the committed-transfer readonly banner from the HQ transfer dialog while keeping the fields and save/commit actions locked.
- Removed the visible Feedback and Print header labels from the Online Store transfer list while keeping the Feedback and Print action cells available in the grid.
- Changed the Online Store transfer action header and row action label to show `Issue` for source-shop transfer rows and `Receive` for destination-shop transfer rows, with `Issue / Receive` only for mixed-role lists.
- Promoted Online Store fuel routes into a dedicated `Fuel Management` sidebar parent for online-store users with fuel permissions, instead of burying those links under the POS/Online Store parent.
- Changed sidebar active matching to pick the most specific child route across the full sidebar, so `/online-store/fuel/...` opens `Fuel Management` instead of matching the generic `/online-store` POS child.

Verified:

- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`

### 2026-06-25 Source-Shop Fuel Transfer Visibility Repair

Status: Done

Implemented:

- Classified online-store inter-store transfer requests as `FUEL_TRANSFER` when their lines use fuel catalog products such as `AGO`, `PMS`, `KERO`, or `LPG`.
- Updated online-store transfer issue processing so fuel-product transfers keep the `FUEL_TRANSFER` workflow even when issued from the generic Inventory transfer page.
- Updated source-shop feedback visibility so already-issued fuel transfers can show the Feedback action based on product identity even if older rows had a blank workflow type.
- Updated the shared fuel feedback API to accept legacy fuel-product transfers with a blank workflow type and backfill them to `FUEL_TRANSFER` when feedback is recorded.
- Repaired the live issued `AGO` transfer row that was created with a blank workflow type so it now appears as a fuel transfer while remaining visible in HQ In-Transit.

Verified:

- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm run prisma:validate`
- Live SQL/Prisma smoke confirmed issued transfer `TRF-ACCRAC-EASTLE-20260625112647977` has `workflowType` `FUEL_TRANSFER`, status `ISSUED`, issued quantity `10`, received quantity `0`, and in-transit quantity `10`.
- Live SQL/Prisma smoke confirmed `ONLINE_STORE_SUPERVISOR` has 6 fuel permission grants.
- `npm --workspace @flash-erp/enterprise-web run build`

### 2026-06-25 Online Store Fuel Role Permissions

Status: Done

Implemented:

- Added store-surface Fuel Operations permissions for station fuel visibility, tank management, tank dips, meter readings, supplier fuel receipts, and fuel reconciliation.
- Granted the new fuel permissions to `ONLINE_STORE_SUPERVISOR` and `STORE_MANAGER` in the normal seed path.
- Updated `bootstrap-store-operators` so online supervisor role resets also include the station fuel permissions.
- Exposed session permission codes to the enterprise shell and filtered Online Store fuel sidebar items by the matching fuel permissions.
- Added online-store page gating so online users without fuel permissions are returned to POS, while supervisors see the permitted fuel tabs.
- Changed station-side Fuel API guards so online supervisors can save tank, dip, meter reading, supplier receipt, evidence, and reconciliation records using the matching fuel permission instead of requiring HQ company settings access.

Verified:

- `npm --workspace @flash-erp/domain run build`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm run prisma:validate`
- Focused live role-permission repair confirmed 6 fuel permission rows and 6 `ONLINE_STORE_SUPERVISOR` fuel grants.
- `npm run prisma:seed`
- Post-seed live SQL/Prisma check confirmed `ONLINE_STORE_SUPERVISOR` still has 6 fuel permission grants.
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/online-store/fuel`, `/online-store/fuel/tanks`, `/online-store/fuel/dips`, `/online-store/fuel/meter-readings`, `/online-store/fuel/supplier-receipts`, and `/online-store/fuel/reconciliation`.

### 2026-06-25 Inter-Store Transfer Dialog Logistics Correction

Status: Done

Implemented:

- Added logistics fields to the generic Inventory transfer request dialog: transporter, vehicle number, driver name, driver contact, and delivery note/waybill.
- Persisted those logistics fields through inter-store transfer create and draft-edit API paths.
- Returned logistics fields in the Inventory transfer read model so reopening a draft or transfer batch shows the saved values.
- Published logistics fields in the inter-store transfer sync payload for source/destination store nodes.
- Added guarded schema compatibility for older SQL Server/local databases missing the logistics columns.
- Replaced silent save/commit button blocking with visible reasons such as missing source, missing destination, same-shop transfer, or missing line items.

Verified:

- `npm --workspace @flash-erp/sync-core run typecheck`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run build`
- Live disposable draft-transfer smoke saved and read back logistics on `TRF-ACCRAC-CAPECO-20260625112558091`, then cleaned up the smoke batch.
- Production build route list includes `/inventory/transfers`, `/api/inventory/inter-store-transfers`, and `/api/inventory/inter-store-transfers/[transferBatchNo]`.

### 2026-06-25 Store Cost Centers and Shop P&L

Status: Done

Implemented:

- Seeded and workspace-ensured a `COST_CENTER` finance dimension for every active store/shop alongside existing `OPERATING_UNIT` tracking.
- Stopped presenting Filling Stations as AR/customer-account records in Fuel Operations setup; stations are maintained as shop/receiving-location transfer destinations.
- Changed station selection on fuel sales so a station no longer substitutes for a customer account; receivable/customer-credit workflows still require an actual customer account on the sale.
- Tagged fuel sale revenue and weighted-average COGS journal lines with the selling shop `COST_CENTER`.
- Tagged fuel transfer shortage/gain variance lines with the destination shop `COST_CENTER` while preserving `OPERATING_UNIT` dimensions for inventory and in-transit balance tracking.
- Added a Shop P&L cost-center filter to Finance > Financial Statements; income statement rows filter by shop, while balance sheet and period-close controls remain company-level.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:seed`
- Live SQL/Prisma smoke confirmed all 8 active stores have matching active `COST_CENTER` finance dimensions for company `FLASH-ERP`.
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/finance/financial-statements` and Fuel Operations routes.

### 2026-06-25 Fuel Transfer Valuation Posting

Status: Done

Implemented:

- Added valuation state, issue/receipt journal references, issued/received value, variance value, and valuation posted timestamp to `InterStoreTransfer`.
- Added guarded SQL Server migration script for the fuel transfer valuation columns and journal-reference indexes.
- Posted HQ fuel transfer issue valuation through the shared Finance posting engine, debiting inventory in transit and crediting source shop inventory using `OPERATING_UNIT` finance dimensions.
- Posted Fuel Delivery feedback `POST` through the shared Finance posting engine, debiting destination shop inventory for actual received value, crediting inventory in transit for issued value, and posting shortage/gain variance to account `5100`.
- Kept weighted-average issue cost as the active transfer valuation basis while preserving FIFO as a later costing upgrade.
- Required positive average/product cost before valued fuel transfers can be issued or posted to Finance, so zero-cost fuel stock cannot silently skip GL valuation.
- Updated online-store transfer issue/receipt ledger rows to retain the transfer unit cost instead of falling back to product master cost.
- Surfaced fuel transfer valuation status and issued/received/variance value in the Fuel Delivery transfer grid/detail view.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Live disposable transfer valuation smoke issued `FSD-000006`, posted issue journal `GL-000022` from source inventory to in-transit, posted receipt journal `GL-000023` from in-transit to destination inventory with `5100` variance, and then cleaned up all smoke transfer, stock, and journal rows.

### 2026-06-24 Fuel Delivery Transfer-Out Correction

Status: Done

Implemented:

- Changed filling stations to link to shops/inventory locations, while keeping AR customer as optional context for customer-credit workflows.
- Changed HQ Fuel Delivery from commercial station sale to issued inter-store fuel transfer-out using the existing `InterStoreTransfer` and online-store transfer receive lifecycle.
- Issuing a fuel transfer-out now validates source tank/site, validates source Item Dynamic stock, posts a `STOCK_TRANSFER_OUT` inventory ledger movement, reduces source tank book quantity, and queues the existing transfer publication path.
- Added transfer logistics fields for vehicle, driver, driver contact, transporter, and delivery note/waybill.
- Added transfer feedback fields and API for water test, before/after quantities, expected/actual received quantities, variance, notes, and save/confirm/post feedback states.
- Added shop `OPERATING_UNIT` Finance dimensions to seed/workspace setup so store-level posting dimensions are ready for valuation/posting.
- Added Online Store fuel capture routes for Fuel Overview, Tank Management, Tank Dips, Meter Readings, Supplier Receipts, and Reconciliation while excluding HQ-only Fuel Sales, Fuel Deliveries, Filling Stations, Pumps, and Nozzles.
- Added Online Store POS service type capture through the existing sale workflow.
- Removed HQ Fuel Sales from the Fuel Operations menu/tab surface and redirected the legacy `/fuel-operations/sales` route to Online Store, while keeping the existing sale API/data path for old records and compatibility.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- Local Prisma smoke confirmed seeded stations `FS-ACCRA-01`, `FS-TEMA-01`, and `FS-KUMASI-01` are linked to shops/locations and all active stores have `OPERATING_UNIT` finance dimensions.
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/api/fuel-operations/station-deliveries/[stationDeliveryId]/feedback`, `/fuel-operations/deliveries`, `/inventory/in-transit`, `/online-store`, `/online-store/fuel`, `/online-store/fuel/tanks`, `/online-store/fuel/dips`, `/online-store/fuel/meter-readings`, `/online-store/fuel/supplier-receipts`, and `/online-store/fuel/reconciliation`.

### 2026-06-24 Fuel Sales Finance, Receipts, and Walk-in UX

Status: Done

Implemented:

- Added UOM visibility to Fuel Sales, station deliveries, and supplier fuel receipt grids and dialogs so product/tank quantities no longer appear without their unit context.
- Allowed fully paid walk-in fuel sales to post with a default walk-in customer label while keeping AR customer enforcement for sales orders, customer-credit tenders, and unpaid or part-paid fuel sales.
- Posted fuel sales, fulfilled fuel sales orders, and station deliveries through the shared Finance posting engine, creating balanced GL journals for cash/AR, revenue, COGS, and inventory relief.
- Created posted cashbook entries for cash, bank, mobile-money, card, and other mapped tender rows so Finance cashbook inquiry reflects posted fuel transactions.
- Kept customer-credit and outstanding station balances as receivable activity using the AR customer account and existing credit-limit checks.
- Changed shared customer credit validation so `0` credit limit means no limit, while positive credit limits continue to block over-limit Store Credit / Customer Credit sales.
- Added captured timestamps to Fuel Sale, station delivery, and supplier fuel receipt transaction grids, and made customer account activity dialogs show full date/time as the primary timestamp.
- Extended AR/AP documents and settlement read models to include `CustomerAccountEntry` receivable activity such as fuel customer-credit sales, with FIFO-style application of customer account payments for aging/open balance visibility.
- Added explicit `CustomerAccountPaymentAllocation` rows so customer account payments can be applied to selected customer account invoice rows instead of relying only on inferred FIFO settlement.
- Redesigned the customer account payment dialog to select open invoices, enter allocation amounts, choose the Tender Method/payment mode, and open the shared account-payment receipt after posting.
- Customer account payments now post through Finance when the selected Tender Method is mapped to a cashbook account: debit the tender cashbook GL account, credit AR, and create a posted cashbook receipt entry.
- Removed Finance Tax Setup from the Finance settings menu, kept `/finance/tax-setup` as a redirect to `/master/tax`, and synchronized Master `TaxProfile` saves into Finance `ErpTaxCode` rows for posting.
- Linked customer-account AR/AP rows to matching posted GL journals when the transaction reference matches a journal source reference.
- Fixed grouped sidebar child matching to choose the longest matching child href, preventing `/finance` overview from stealing active state from deeper Finance children.
- Changed enterprise database readiness checks and the readiness gate script to check for `[dbo].[_prisma_migrations]` before querying it, avoiding SQL Server `Invalid object name 'dbo._prisma_migrations'` errors on `db push` databases.
- Added thermal-slip versus A4 receipt settings under Settings > Fuel Operations for fuel sales, station deliveries, and sales orders.
- Switched Fuel Sale and station-delivery reprints to the shared tokenized Receipt Template renderer, selecting active A4 or thermal templates from existing Receipt Template setup and falling back to the existing sales receipt starter.
- Restricted Fuel receipt template selection to sales-receipt templates, preventing account-payment receipt templates from rendering fuel sale reprints.
- Returned the saved Fuel Sale receipt row from `/api/fuel-operations/sales` and opened the receipt window immediately after a successful Fuel Sale or Fuel Sales Order save.
- Returned the saved station-delivery receipt row from `/api/fuel-operations/station-deliveries` and opened the delivery receipt window immediately after a successful station fuel delivery save.
- Removed operational summary lines for status, source, and total quantity from Fuel receipt printouts.
- Added configured company logo rendering to Fuel receipt printouts using the company logo URL from company settings.
- Changed company-logo upload to save the uploaded logo URL directly into the company profile instead of leaving it only in an unsaved Settings draft.
- Added the same fallback logo block used by online-store receipts so Fuel thermal receipts still show the saved company logo when a selected sales receipt template does not contain `{COMPANY_LOGO_HTML}`.
- Replaced the A4 Fuel receipt body with a professional A4 document layout instead of rendering the 80mm thermal receipt content on an A4 page.
- Added more polished Fuel Sale and station-delivery dialog sectioning with colored source/status/totals panels, clearer sale-line and payment panels, and a stronger station-delivery dispatch/logistics/fuel/payment layout.
- Added readonly view and direct reprint actions to Fuel Sales and station delivery grids.
- Exposed product base cost in the Product master grid while preserving weighted-average issue costing and leaving FIFO valuation layers for the later inventory valuation pass.
- Route-synced the expanded sidebar submenu while navigating child pages, including grouped Finance/Settings submenus, with auto-collapse only when another parent menu is opened.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- Live SQL/Prisma smoke confirmed fuel products `AGO`, `KERO`, `LPG`, and `PMS` use `LTR` / `FUEL-VOLUME`, receipt settings default to sales `THERMAL`, deliveries `THERMAL`, and sales orders `A4`, and Tender Methods map cash/bank/MoMo to cashbook accounts while `CUSTOMER-CREDIT` remains AR-only.
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run build`
- Live Prisma smoke confirmed the `CustomerAccountPaymentAllocation` table is available, Finance tax codes are present, and the allocation table was empty before new customer-payment activity.
- Follow-up verification on 2026-06-24 confirmed Fuel Sale receipts no longer select account-payment templates, the sales API returns the saved receipt row for immediate popup printing, station fuel deliveries return the saved delivery row for immediate receipt popup printing, Fuel receipt printouts suppress status/source/total-quantity summary lines, A4 output uses the professional document layout, configured company logos are passed into receipt print tokens, company-logo uploads persist immediately, and thermal Fuel receipts prepend the company logo when a selected template omits `{COMPANY_LOGO_HTML}`.

### 2026-06-24 Fuel Sales Pricing and Average Cost Source

Status: Done

Implemented:

- Added Fuel Operations selling-price resolution from customer group/tier price lists, source-shop `StoreProductPrice`, default price list, then product base price.
- Fuel Sale line product selection now auto-loads the resolved price, and changing source site, customer, or station reprices selected lines.
- Station sales/deliveries now resolve unit selling price from the same hierarchy.
- Fuel sale and station-delivery inventory issues now use weighted-average source-stock cost from `InventoryLedgerEntry` for COGS and margin; supplier receipts remain the inbound cost capture.
- FIFO valuation remains planned for the later inventory valuation slice instead of replacing the current average-cost behavior.

Verified:

- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`

### 2026-06-24 HQ GRN Fuel Tank Mirror Resolution

Status: Done

Implemented:

- Confirmed live PO `PO-ACCRACENTR-20260622183949904` receives into `accra-central-sales-floor`, while seeded AGO/PMS tanks were linked to same-store site alias `accra-sales-floor`.
- Changed HQ GRN fuel tank mirror lookup to try the exact receiving inventory-location site first, then active same-store/warehouse inventory-location mirror sites.
- Kept HQ GRN inventory posting non-blocking when a fuel product has no matching active tank mirror; the response now warns about skipped tank mirrors instead of rolling back the inventory receipt.

Verified:

- Live dry-run confirmed `AGO` resolves to `TANK-AGO-01` and `PMS` resolves to `TANK-PMS-01` for `PO-ACCRACENTR-20260622183949904`, while KERO/LPG remain unmatched because their seeded tanks are at Tema.
- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`

### 2026-06-23 Multi Currency Setup Source

Status: Done

Implemented:

- Added a dedicated Finance > Multi Currency setup route backed by `ErpCurrency`.
- Added currency create/edit support for code, name, symbol, decimal places, exchange rate, status, and base-currency flag.
- Added `/api/finance/foundation/currencies` for saving configured currencies.
- Added Multi Currency to Finance Settings navigation.
- Changed Company Settings base currency from free text to a dropdown loaded from active `ErpCurrency` rows.
- Changed Finance accounting controls functional currency selection to a dropdown loaded from active `ErpCurrency` rows.
- Synchronized base-currency changes across `RetailOrg`, `ErpCompany`, `ErpAccountingSettings`, and the single base `ErpCurrency` row.

Verified:

- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Route smoke confirmed `/finance/multi-currency` redirects to sign-in with `next=/finance/multi-currency` when unauthenticated.
- Route smoke confirmed `/settings/company` redirects to sign-in with `next=/settings/company` when unauthenticated.
- Live SQL/Prisma smoke confirmed `RetailOrg`, primary `ErpCompany`, and `ErpAccountingSettings` all use base currency `GHS`, with exactly one base `ErpCurrency` row and active currencies `GHS`/`USD`.

### 2026-06-20 Chart of Accounts Reset

Status: Done

Implemented:

- Replaced the foundation chart-of-accounts seed with the requested general business COA.
- Split `Sales Tax Payable Short-term Loans` into separate `Sales Tax Payable` and `Short-term Loans` liability accounts.
- Remapped accounting settings, AR/AP posting profile defaults, and operational document defaults to accounts that exist in the new COA.
- Updated the legacy finance seed surface so it does not recreate the old RMS-era account names.
- Cleared local `GlAccount` rows and dependent local GL journal lines, journal entries, and journal batches from SQL Server.
- Reseeded the local database with 61 GL accounts.

Verified:

- Local SQL Server check confirmed 61 `GlAccount` records.
- Local SQL Server check confirmed zero missing accounting-setting or AR/AP profile account references.
- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run build`

### 2026-06-22 Product and Transaction Data Reset

Status: Done

Implemented:

- Cleared local transaction/history rows across POS, sales orders, inventory ledger/serials, purchasing/GRN/returns/claims, stock counts, fuel operations, operational documents, AR/AP settlement allocations, cashbook entries, bank statements/reconciliation matches, GL journals, tax transactions, payroll posting batches, fixed-asset transactions, operating expenses, gift certificates, sync outbox/inbox events, and transaction-reference capture.
- Cleared local product-dependent rows including barcodes, product variants/attributes, store prices, price-list entries, product supplier links, inventory catalog links, ERP product-profile mirrors, and products.
- Reset local customer receivable balances and loyalty point balances to zero after removing dependent transaction rows.
- Reopened the Fuel Operations workspace path so clean default fuel products `AGO`, `KERO`, `LPG`, and `PMS` plus ERP product-profile mirrors were recreated.

Verified:

- Local cleanup reported deletion of 80 POS transactions, 160 POS lines, 80 POS payments, 192 inventory ledger entries, 18 GL journal entries, 41 GL journal lines, 8 banking deposits, 8 EOD reconciliations, existing Fuel Operations transactions/master product links, and 8 pre-reset product rows.
- Post-cleanup SQL/Prisma check confirmed zero POS transactions, inventory ledger entries, purchase orders, goods receipts, fuel sales/deliveries/reconciliations, operational documents, cashbook entries, bank statements/reconciliation matches, GL journals, tax transactions, payroll posting batches, and fixed-asset transactions.
- Post-cleanup SQL/Prisma check confirmed zero customers with non-zero receivable or loyalty balances.
- Post-cleanup SQL/Prisma check confirmed 4 `Product` rows and 4 `ErpProductProfile` rows for the clean fuel catalog.

## Slice Board

| Slice | Status | Purpose | Acceptance Gate |
| --- | --- | --- | --- |
| 001. ERP charter and database baseline | Done | Align Flash ERP as a separate, finance-led ERP workspace and point local SQL Server config to `Flash-ERP`. | Charter/README updated, database created, Prisma validates. |
| 002. Accounting foundation | Done | Add company, fiscal calendar, currency, accounting settings, chart of accounts, journals, posting, reversal, and generic product/site/storage foundations. | Schema pushed, seed passes, `/finance/foundation` builds and routes. |
| 003. AR/AP control-account setup | Done | Add customer/supplier posting profiles, receivables/payables controls, advances, discounts, withholding, and exchange gain/loss setup. | Control setup is editable from Finance and usable by posting rules. |
| 004. Shared posting engine | Done | Create a common accounting document posting service so operations post through GL instead of writing finance totals directly. | Balanced entries, period checks, audit trail, reversal support, and reusable API contract. |
| 005. Customer and supplier ERP profiles | Done | Add ERP accounting fields around existing customer/supplier masters without blind inherited-table renames. | Credit terms, tax profile, control accounts, and company scope are persisted and visible. |
| 006. Company document numbering | Done | Add per-company/per-fiscal-year numbering for journals, invoices, receipts, vouchers, and purchase documents. | Number sequences reserve safely and appear in created documents. |
| 007. Finance workspace split | Done | Split foundation into dedicated pages for chart of accounts, journals, fiscal calendar, posting setup, and controls. | Finance menu exposes focused pages and no page becomes a crowded catch-all. |
| 008. Trial balance and ledger inquiry | Done | Add basic GL inquiry pages after posting setup is stable. | Trial balance, account activity, and journal drilldown agree with posted GL lines. |
| 009. Operational document prototypes | Done | Start generic purchasing/sales document prototypes that post through the shared engine. | Operational documents create no direct finance totals; they generate GL entries through posting rules. |
| 010. AR/AP open items and settlement allocation | Done | Derive receivable/payable open items from posted documents and prepare receipt/payment allocation. | Posted documents appear in AR/AP aging; allocations post through GL and reduce open balances. |
| 011. Banking and cashbook foundation | Done | Add generic cash/bank accounts, cashbook entries, and receipt/payment reconciliation preparation. | Cashbook entries can be reviewed by account and future allocations can reconcile to bank/cash movement. |
| 012. Bank reconciliation and statement matching | Done | Add statement import/manual statement lines and reconciliation matching against cashbook entries. | Statement lines can be matched to posted cashbook entries and marked reconciled without changing posted GL history. |
| 013. Tax setup and control accounts | Done | Add generic tax codes, rates, tax control setup, and tax transaction inquiry. | Tax can be configured per company and future documents can post tax through GL control accounts. |
| 014. Fixed assets foundation | Done | Add asset registers, asset classes, depreciation books, and GL control setup. | Assets can be registered by company with acquisition, depreciation, and disposal control accounts ready for posting. |
| 015. Budgeting foundation | Done | Add budget models, budget lines, fiscal-period spread, and budget-vs-actual preparation. | Budgets can be maintained by company/account/period and compared against posted GL balances. |
| 016. Payroll GL integration foundation | Done | Add payroll posting batches, employee/pay-run references, earning/deduction mapping, and GL staging contracts. | Payroll can be staged and posted through the shared accounting engine without creating a payroll engine yet. |
| 017. Financial statements and period close foundation | Done | Add basic financial statements and period-close controls on top of posted GL. | Income statement and balance sheet agree with GL balances, and period close status protects posting windows. |
| 018. Recurring and adjusting journals | Done | Add recurring journal templates, scheduled journal generation, and explicit adjusting-entry workflow. | Recurring journals can generate reviewable drafts, adjusting entries are flagged, and all posting still uses the shared GL engine. |
| 019. AR/AP document completion | Done | Complete customer/supplier invoice, credit note, debit note, statement, and aging-report workflows. | AR/AP documents and statements are usable as finance workflows, and open-item aging reconciles to posted GL/source documents. |
| 020. Banking workflow completion | Done | Add bank transfers, petty cash workflow, and fuller mobile-money account handling on top of cashbook. | Transfers and petty-cash movements post balanced GL/cashbook entries and reconcile without editing posted history. |
| 021. Fixed asset lifecycle completion | Done | Add depreciation runs, asset transfers, and disposals while deferring repair/service maintenance tracking to the later Maintenance module. | Asset lifecycle actions update registers/books and post accounting impacts only through the shared GL engine. |
| 022. Department and cost-center budgeting | Done | Add budget dimensions for departments/cost centers and expand budget reporting. | Budgets can be planned and compared by department/cost center without breaking account-level budget-vs-actual. |
| 023. Fuel operations foundation | Done | Add tank, pump, nozzle, fuel dip, delivery, variance, and daily reconciliation foundations. | Fuel operational records are captured by site/tank/nozzle and reconciliation calculates loss/gain and margin without direct GL writes. |
| 024. Fuel station delivery tracking | Done | Correct fuel deliveries into outbound station dispatches while keeping supplier receipts as inbound stock. | Station deliveries reduce source tank book quantity and preserve future Finance AR settlement hooks. |
| 025. Fuel sales capture and payment tracking | Done | Add store-sourced fuel sales as a separate commercial workflow from deliveries. | Sales capture customer/product/price/payment details from the GRN receiving store/site and reduce available Item Dynamic stock through `SALE` inventory ledger movements. |
| 026. HQ GRN and Fuel Operations workflow split | Done | Add HQ-direct PO goods receiving into the PO location, align Fuel Operations products with RMS catalog/Item Dynamic stock, and split Fuel Operations sales, deliveries, dips, and meter readings into focused pages with editable operational grids. | HQ GRN posts against the PO receiving location, fuel receipts can mirror into mapped tanks, fuel sales support multiple line items from catalog products, and focused Fuel routes build. |
| 027. Fuel source stock and sales-order correction | Done | Align Fuel Operations source dropdowns with RMS Item Dynamic stock, treat station deliveries as sales, and add customer fuel sales orders that fulfill later. | Source options come from inventory locations, sales and station dispatches reduce `SALE` inventory ledger stock, and open fuel sales orders can be fulfilled into posted stock movement. |
| 028. Filling-station AR linkage and site-filtered tank selection | Done | Enforce customer-account linkage for station sales/pay-later workflows and limit fuel delivery tank selection to the selected source/receiving site. | Station sales and credit fuel sales require AR customer identity, station dropdowns show linked accounts, and delivery tank selectors/backend validation prevent cross-site tank use. |
| 029. Fuel master-data UX and customer terms inheritance | Done | Make filling stations editable, move station payment terms/credit limits to customer-derived Finance profiles, add GPS capture, and tighten Fuel Operations dropdowns. | Stations can be edited, station terms/limits inherit from the selected AR customer, product/type/status/recorded-by controls use dropdowns, and Fuel routes build. |
| 030. Fuel Sale payment dialog redesign | Done | Redesign Fuel Sale entry with POS-style multi-payment capture while keeping Fuel Delivery unchanged for a later pass. | Fuel Sale payments are captured as multiple Tender Method rows mapped to Finance cashbook accounts or Customer Credit AR, defaults resolve for products/sites/currency/accounts/UOM/stations/tanks, totals validate, and `/fuel-operations/sales` builds. |
| 031. Fuel delivery transfer-out correction | Done | Correct HQ Fuel Delivery from commercial station sale to internal transfer-out issued to a filling-station shop, with waybill and destination feedback. | Transfer-out uses existing inter-store transfer lifecycle, reduces source stock/tank book quantity, appears in in-transit, online-store can receive it, and feedback can be saved/confirmed/posted. |
| 032. Fuel transfer valuation and GL posting | Done | Post actual inventory value for HQ fuel transfer-outs and destination feedback through Finance. | Transfer issue and feedback post balanced GL journals using in-transit, source shop, destination shop, and variance accounts while preserving average cost and future FIFO planning. |
| 033. Store/shop cost-center P&L tracking | Done | Treat stores as Finance cost centers for shop profitability instead of customer accounts. | Store cost centers are seeded/ensured, fuel revenue/COGS/variance postings carry shop cost centers, and Finance statements can filter P&L by shop. |
| 034. Inventory stock ledger foundation | Next | Add generic item/site/storage quantity movement and stock balance foundations after Fuel Operations workflow correction. | Stock movement history is traceable by item/site/storage and future valuation can post through GL. |

## Completed Slice Details

### 001. ERP Charter and Database Baseline

Status: Done

Implemented:

- Reframed Flash ERP as a multi-company, finance-led ERP workspace.
- Updated local SQL Server connection target to `Flash-ERP`.
- Created the `Flash-ERP` database on `localhost\sql2017`.
- Updated seed identity from inherited retail naming toward Flash ERP.

Verified:

- `npm run prisma:validate`
- SQL Server database exists as `Flash-ERP`.

### 002. Accounting Foundation

Status: Done

Implemented:

- Added ERP company, currency, fiscal year, fiscal period, and accounting settings models.
- Extended GL account and journal models for company scoping, fiscal periods, journal batches, posting metadata, and reversal links.
- Added generic product profile, operating site, and storage unit master-data foundations.
- Added Finance > Foundation route and APIs for accounting settings, GL accounts, manual journal batches, and journal reversal.
- Added SQL Server migration script for the foundation tables and GL extensions.

Verified:

- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma --accept-data-loss`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Direct SQL check confirmed generic tables only: `ErpProductProfile`, `ErpOperatingSite`, `ErpStorageUnit`.

### 003. AR/AP Control-Account Setup

Status: Done

Implemented:

- Add AR/AP posting profile models per company.
- Configure receivables control, payables control, customer advances, supplier advances, withholding tax, discounts, write-offs, and exchange gain/loss accounts.
- Add Finance UI for maintaining posting profiles.
- Add API endpoints and validation to prevent incomplete control-account setup.

Verified:

- `ErpArApPostingProfile` table exists in SQL Server.
- Default `DEFAULT-CUSTOMER` and `DEFAULT-SUPPLIER` profiles are created by the foundation repository path.
- Posting profile API route appears in the production build.
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`

### 004. Shared Posting Engine

Status: Done

Implemented:

- Added a reusable `postAccountingDocument` server service for GL posting.
- Centralized balance validation, fiscal-period checks, account lookup, duplicate source protection, batch creation, journal entry creation, line posting, posted-by metadata, and source references.
- Routed manual journal posting through the shared engine so the Finance Foundation page uses the same path future operations will use.
- Preserved journal reversal support through the existing GL reversal flow.

Verified:

- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`

### 005. Customer and Supplier ERP Profiles

Status: Done

Implemented:

- Added company-scoped ERP party accounting profiles for customers and suppliers.
- Backfilled profiles from existing customer/supplier masters without renaming inherited RMS-era tables.
- Linked party profiles to AR/AP posting profiles and optional tax profiles.
- Added credit terms, payment terms, credit limit, credit status, delivery modes, and active status controls.
- Added Finance Foundation party profile API and UI tab.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- Foundation workspace backfill confirmed 12 party profiles.
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`

### 006. Company Document Numbering

Status: Done

Implemented:

- Added company/fiscal-year document sequences for journals, reversals, invoices, receipts, purchase documents, vouchers, credit notes, and debit notes.
- Added a reusable document-number reservation service with optimistic sequence updates.
- Routed manual journal and reversal numbering through document sequences.
- Added Finance Foundation document numbering API and UI tab.

Verified:

- Foundation workspace backfill confirmed 10 document sequences.
- Rollback reservation smoke produced `GL-000001` without consuming the sequence.
- `/finance/foundation` route returns `307` to sign-in when unauthenticated.
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`

### 007. Finance Workspace Split

Status: Done

Implemented:

- Split the Finance Foundation workspace into focused setup routes.
- Kept `/finance/foundation` as a compact overview with setup links.
- Added focused pages for fiscal calendar, chart of accounts, posting setup, party profiles, document numbering, journals, and operating foundation.
- Reused the existing Finance Foundation data/action component through a focused `view` prop instead of duplicating setup logic.
- Expanded the Finance menu so users can open each setup workflow directly.

Verified:

- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Route smoke checks returned `307` to sign-in for `/finance/foundation`, `/finance/fiscal-calendar`, `/finance/chart-of-accounts`, `/finance/posting-setup`, `/finance/party-profiles`, `/finance/document-numbering`, `/finance/journals`, and `/finance/operating-foundation`.

### 008. Trial Balance and Ledger Inquiry

Status: Done

Implemented:

- Added a read-only ERP GL inquiry repository around posted `GlJournalEntry` and `GlJournalLine` records.
- Added trial balance rows with opening, period, closing debit/credit, and normal-balance-aware balance amounts.
- Added account activity rows with company, fiscal year, fiscal period, date, account, source, journal, memo, and running-balance context.
- Added journal inquiry and journal detail drilldown showing batch, company, fiscal period, source, posted metadata, reversal context, and immutable GL lines.
- Added focused Finance routes for `/finance/trial-balance`, `/finance/account-activity`, `/finance/journal-inquiry`, and `/finance/journal-inquiry/[journalEntryId]`.
- Added Finance menu entries for Trial Balance, Account Activity, and Journal Inquiry.

Verified:

- `npm run prisma:validate`
- Live GL inquiry smoke against SQL Server confirmed trial-balance debit/credit totals reconcile to posted GL line totals for the selected scope.
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Route smoke checks returned `307` to sign-in for `/finance/trial-balance`, `/finance/account-activity`, `/finance/journal-inquiry`, and `/finance/journal-inquiry/test-journal-id`.

### 009. Operational Document Prototypes

Status: Done

Implemented:

- Added generic `ErpOperationalDocument` and `ErpOperationalDocumentLine` models for draft-first customer and supplier source documents.
- Added a SQL Server migration script for the operational document tables and indexes.
- Added a transaction-safe `postAccountingDocumentInTransaction` path so source documents and GL journals post atomically.
- Fixed document-number reservation to preserve underscore-based document types such as `SALES_INVOICE`.
- Added an operational document repository for draft creation, source-line review, posting-line generation, and GL posting through the shared posting engine.
- Added APIs for saving drafts and posting draft operational documents.
- Added `/finance/operational-documents` with a compact document grid, new-document dialog, line review dialog, and post action.
- Added Finance navigation for Operational Documents.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- Live smoke created draft `INV-000001`, posted it through journal `GL-000001`, and confirmed the document kept the journal source link.
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Route smoke check returned `307` to sign-in for `/finance/operational-documents`.

### 010. AR/AP Open Items and Settlement Allocation

Status: Done

Implemented:

- Added `ErpSettlementAllocation` for draft and posted customer receipt / supplier payment allocations.
- Derived AR/AP open items from posted operational documents minus posted settlement allocations.
- Tracked pending draft allocation amounts separately so drafts reserve available balance without reducing posted open balance.
- Added settlement posting through `postAccountingDocumentInTransaction` with source references and journal drilldown links.
- Added APIs for creating draft allocations and posting allocation journals.
- Added `/finance/ar-ap-settlements` with open-item aging, allocation history, journal links, and row actions for allocate/post.
- Added Finance navigation for AR/AP Settlements.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- Live smoke posted `INV-000002` to `GL-000002`, drafted `RV-000001`, posted it through `GL-000003`, and confirmed open balance moved from `100` to `0`.
- `npm --workspace @flash-erp/enterprise-web run build`
- Route smoke confirmed `/finance/ar-ap-settlements` responds on `http://localhost:3000`.

## Next Slice Detail

### 011. Banking and Cashbook Foundation

Status: Done

Implemented:

- Added `ErpCashbookAccount` for generic cash, bank, mobile-money, card-clearing, and other cashbook accounts.
- Added `ErpCashbookEntry` for draft and posted cash/bank movements with reconciliation placeholders.
- Linked cashbook accounts to GL accounts and optionally to inherited `BankAccount` records without renaming inherited RMS-era tables.
- Added defensive `CASHBOOK_ENTRY` numbering setup for existing databases and a `CB` sequence seed for fresh foundation setup.
- Added cashbook entry posting through `postAccountingDocumentInTransaction`; cashbook entries create balanced GL journals instead of writing GL totals directly.
- Added optional settlement-allocation links so posted AR/AP allocations can be tied back to cashbook movement in a later reconciliation slice.
- Added APIs for saving cashbook accounts, saving draft cashbook entries, and posting cashbook entries.
- Added `/finance/cashbook` with cashbook account review, entry review, create dialogs, post action, journal drilldown links, and Finance navigation.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- Live smoke created default `MAIN-CASH`, posted `CB-000001` through journal `GL-000004`, confirmed journal linkage, and confirmed book balance moved to `25`.
- `npm --workspace @flash-erp/enterprise-web run build`
- Route smoke confirmed `/finance/cashbook` responds on `http://localhost:3000`.

## Next Slice Detail

### 012. Bank Reconciliation and Statement Matching

Status: Done

Implemented:

- Added `ErpBankStatement`, `ErpBankStatementLine`, and `ErpBankReconciliationMatch` models for statement capture, line review, and match audit history.
- Added a SQL Server migration script for bank/cash statement and reconciliation match tables.
- Added a read model for statements, statement lines, posted cashbook entries, and match history.
- Added manual statement creation with line capture; later import can reuse the same statement/line model.
- Added exact one-to-one matching between posted cashbook entries and statement lines.
- Added unmatch/reverse support that preserves an audit record and reopens both the statement line and cashbook entry.
- Updated cashbook entry reconciliation status and cleared dates without editing posted GL journal history.
- Added APIs for statement creation, matching, and unmatching.
- Added `/finance/bank-reconciliation` with statement grids, line matching, posted cashbook entry review, match history, and Finance navigation.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- Live smoke posted `CB-000002` through `GL-000005`, created a statement, matched, unmatched, and rematched the line; final status was `MATCHED` / `RECONCILED`, with the original journal link still intact.
- `npm --workspace @flash-erp/enterprise-web run build`
- Route smoke confirmed `/finance/bank-reconciliation` responds on `http://localhost:3001`.

## Next Slice Detail

### 013. Tax Setup and Control Accounts

Status: Done

Implemented:

- Added generic `ErpTaxRegistration`, `ErpTaxCode`, `ErpTaxGroup`, `ErpTaxGroupLine`, and `ErpTaxTransaction` models.
- Added a SQL Server migration script for tax setup tables and operational document tax-code fields.
- Added company-scoped default tax registration, `STANDARD` and `ZERO` tax codes, and a default tax group.
- Added GL account validation for tax setup control accounts.
- Added tax setup APIs for registration, tax codes, and tax groups.
- Added `/finance/tax-setup` with registration controls, tax-code maintenance, tax-group maintenance, and posted tax transaction inquiry.
- Added Finance navigation for Tax Setup.
- Linked operational document lines to configured tax codes while preserving existing tax-account fallback behavior.
- Added tax transaction creation when operational documents post through the shared GL engine.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- Live smoke created tax code `SMOKE`, posted `INV-000003` through `GL-000006`, and confirmed a posted `ErpTaxTransaction` for tax amount `10`.
- `npm --workspace @flash-erp/enterprise-web run build`
- Route smoke confirmed `/finance/tax-setup` responds on `http://localhost:3000`.

## Next Slice Detail

### 014. Fixed Assets Foundation

Status: Done

Implemented:

- Added generic `ErpFixedAssetClass`, `ErpFixedAsset`, `ErpFixedAssetBook`, and `ErpFixedAssetTransaction` models.
- Added a SQL Server migration script for fixed asset classes, asset registers, depreciation books, and asset transaction contracts.
- Added `FIXED_ASSET` and `FIXED_ASSET_TXN` document numbering seeds.
- Added default Equipment and Vehicle asset classes with GL control accounts for acquisition, accumulated depreciation, depreciation expense, gain, and loss.
- Added GL account validation for asset class control accounts.
- Added APIs for maintaining fixed asset classes and assets.
- Added `/finance/fixed-assets` with class setup, asset register maintenance, depreciation book review, and draft posting-contract review.
- Added Finance navigation for Fixed Assets.
- Asset registration now reserves company asset numbers, creates a company depreciation book, and creates a draft acquisition posting contract without writing GL totals directly.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- Live smoke created asset class `SMOKE-ASSET`, registered asset `FA-000001`, created book `COMPANY`, and created draft posting contract `FAT-000001`.
- `npm --workspace @flash-erp/enterprise-web run build`
- Route smoke confirmed `/finance/fixed-assets` responds on `http://localhost:3000`.

## Next Slice Detail

### 015. Budgeting Foundation

Status: Done

Implemented:

- Added generic `ErpBudgetVersion`, `ErpBudgetLine`, and `ErpBudgetPeriodAmount` models.
- Added a SQL Server migration script for budget versions, budget lines, fiscal-period amounts, and relation indexes.
- Added a default `BASE` budget version for the open fiscal year without seeding fake budget lines.
- Added account validation and fiscal-period spreading for budget lines.
- Added budget-vs-actual inquiry rows that compare period and YTD budgets against posted GL journal lines.
- Added APIs for maintaining budget versions and budget lines.
- Added `/finance/budgets` with budget version maintenance, budget line maintenance, fiscal-period amount review, and budget-vs-actual inquiry.
- Added Finance navigation for Budgets.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- Live smoke created budget version `SMOKE`, spread account `6100` over 12 periods, and confirmed 12 budget-vs-actual rows.
- `npm --workspace @flash-erp/enterprise-web run build`
- Route smoke confirmed `/finance/budgets` responds on `http://localhost:3000`.

## Next Slice Detail

### 016. Payroll GL Integration Foundation

Status: Done

Implemented:

- Added generic `ErpPayrollGlMapping`, `ErpPayrollPostingBatch`, and `ErpPayrollPostingLine` models.
- Added a SQL Server migration script for payroll GL mappings, payroll staging batches, posting lines, and relation indexes.
- Added default payroll GL mappings for salary earnings, wage earnings, employer payroll tax, employee benefits, net pay payable, statutory deductions, and employer tax liabilities.
- Added `PAYROLL_BATCH` document numbering with `PR` sequence numbers.
- Added payroll batch staging with pay period, source reference, employee count, gross pay, deductions, employer costs, net pay, debit totals, and credit totals.
- Added payroll posting through `postAccountingDocumentInTransaction` with source type `ERP-PAYROLL-BATCH` and journal inquiry references.
- Added APIs for maintaining payroll mappings, staging payroll batches, and posting draft batches.
- Added `/finance/payroll-gl` with mapping maintenance, payroll batch staging, posting-line review, post action, and journal drilldown links.
- Added Finance navigation for Payroll GL.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- Live smoke staged payroll batch `PR-000001`, posted it through `GL-000007`, and confirmed balanced debit/credit totals of `1120`.
- `npm --workspace @flash-erp/enterprise-web run build`
- Route smoke confirmed `/finance/payroll-gl` responds on `http://localhost:3000`.

### 017. Financial Statements and Period Close Foundation

Status: Done

Implemented:

- Added a financial statements repository that derives income statement and balance sheet rows from posted `GlJournalLine` records.
- Added period-range, fiscal-year, and company filters for statement inquiry.
- Added current-earnings handling so balance sheet totals reconcile before formal retained-earnings close entries exist.
- Added fiscal period close/reopen controls using existing `ErpFiscalPeriod.status`.
- Added close validation to prevent closing out-of-balance periods.
- Added `/finance/financial-statements` with statement metrics, income statement grid, balance sheet grid, and period close grid.
- Added `/api/finance/period-close` for controlled close/reopen actions.
- Added Finance navigation for Financial Statements.

Verified:

- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- Live smoke confirmed financial statements loaded with balance check `0`, 4 income rows, 5 balance rows, and 12 fiscal periods.
- Live smoke closed and reopened fiscal period `2026-01`, ending back at `OPEN`.
- `npm --workspace @flash-erp/enterprise-web run build`
- Route smoke confirmed `/finance/financial-statements` returns `307` to sign-in when unauthenticated and the production route list includes `/api/finance/period-close`.

### 018. Recurring and Adjusting Journals

Status: Done

Implemented:

- Added `ErpRecurringJournalTemplate` and `ErpRecurringJournalTemplateLine` models for reusable recurring journal definitions.
- Added a SQL Server migration script for recurring journal templates and template lines.
- Added `RECURRING_JOURNAL` document numbering with `RJ` sequence numbers.
- Added recurring journal template maintenance with balanced line validation and GL account validation.
- Added draft generation from individual templates and due templates.
- Added draft review and posting through `postAccountingDocumentInTransaction` with source type `RECURRING-JOURNAL`.
- Added explicit manual journal `journalType` support so adjusting entries can be flagged separately from ordinary manual journals.
- Added `/finance/recurring-journals` with template maintenance, line review, generated draft review, post action, and Finance navigation.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- Live smoke created recurring template `SMOKE-RJ-883856`, generated draft `RJ-000001`, and posted it through journal `GL-000008`.
- `npm --workspace @flash-erp/enterprise-web run build`
- Route smoke confirmed `/finance/recurring-journals` responds on `http://localhost:3000`.

### 019. AR/AP Document Completion

Status: Done

Implemented:

- Expanded operational document posting rules for customer credit notes, customer debit notes, supplier invoices, supplier credit notes, and supplier debit notes.
- Kept existing customer invoice and supplier document support while adding distinct document numbering for the new AR/AP source document types.
- Added defensive document-sequence setup for AR/AP document creation so existing databases can reserve `CCN`, `CDN`, `SI`, `SCN`, and `SDN` numbers.
- Added 60-second transaction options to operational document save/post flows to avoid expired interactive transactions during setup and posting.
- Added an AR/AP document read model that derives customer statements, supplier statements, statement activity, and aging rows from posted operational documents and posted settlement allocations.
- Added `/finance/ar-ap-documents` with statement summary, statement activity, aging report grids, journal drilldown links, and Finance navigation.

Verified:

- `npm run prisma:validate`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- Live smoke posted `CCN-000001`, `CDN-000001`, `SI-000001`, `SCN-000001`, and `SDN-000001` through journals `GL-000009` to `GL-000013` and confirmed all five appeared in AR/AP statement activity.
- `npm --workspace @flash-erp/enterprise-web run build`
- Route smoke confirmed `/finance/ar-ap-documents` responds on `http://localhost:3000`.

### 020. Banking Workflow Completion

Status: Done

Implemented:

- Added cashbook workflow metadata for bank-transfer, petty-cash, and mobile-money references without changing posted GL history.
- Added mobile-money provider/wallet and petty-cash custodian metadata to cashbook accounts.
- Added `BANK_TRANSFER` and `PETTY_CASH` document numbering setup alongside cashbook entry numbering.
- Added bank-transfer creation that creates paired outflow/inflow cashbook entries between cashbook accounts.
- Added transfer posting that posts both transfer legs through one balanced GL journal via the shared posting engine.
- Added petty-cash issue, return, replenishment, and adjustment creation with custodian review fields.
- Added `/api/finance/cashbook/transfers` and `/api/finance/cashbook/petty-cash`.
- Expanded `/finance/cashbook` with Bank Transfer and Petty Cash dialogs, provider/custodian account fields, workflow references, and searchable provider/custodian details.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- Live smoke created `SMOKE-BANK`, `SMOKE-PETTY`, and `SMOKE-MOMO`, posted transfer `BT-000001` through paired entries `CB-000003` / `CB-000004` and journal `GL-000014`, posted petty-cash movement `PC-000001` / `CB-000005` through journal `GL-000015`, and confirmed mobile-money provider metadata.
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/api/finance/cashbook/transfers`, `/api/finance/cashbook/petty-cash`, and `/finance/cashbook`.

### 021. Fixed Asset Lifecycle Completion

Status: Done

Implemented:

- Added fixed asset lifecycle transaction metadata for book scope, disposal proceeds account, gain/loss, and transfer from/to location or custodian.
- Added depreciation proposal creation using asset books, useful life, residual value, accumulated depreciation, and last depreciation date.
- Added draft depreciation posting through the shared accounting engine and updates to asset/book accumulated depreciation, net book value, and last depreciation date.
- Added asset transfer recording for location/custodian changes without creating GL entries where there is no accounting impact.
- Added disposal proposal creation with proceeds, accumulated depreciation, gain/loss calculation, and proceeds account selection.
- Added disposal posting through the shared accounting engine, retiring the asset/book and setting net book value to zero.
- Added `/api/finance/fixed-assets/depreciation`, `/api/finance/fixed-assets/transfers`, `/api/finance/fixed-assets/disposals`, and `/api/finance/fixed-assets/transactions/post`.
- Expanded `/finance/fixed-assets` with depreciation, transfer, disposal dialogs, lifecycle row actions, draft-post actions, and lifecycle transaction detail.
- Repair/service maintenance tracking was intentionally deferred to the later dedicated Maintenance module.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- Live smoke registered asset `FA-000002`, posted depreciation proposal `FAT-000003` through journal `GL-000016`, recorded transfer `FAT-000004`, posted disposal proposal `FAT-000005` through journal `GL-000017`, and confirmed final asset status `RETIRED` with net book value `0`.
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/api/finance/fixed-assets/depreciation`, `/api/finance/fixed-assets/transfers`, `/api/finance/fixed-assets/disposals`, `/api/finance/fixed-assets/transactions/post`, and `/finance/fixed-assets`.

### 022. Department and Cost-Center Budgeting

Status: Done

Implemented:

- Added generic `ErpFinanceDimension` master data for department, cost center, project, and operating unit planning tags.
- Added optional finance dimension hooks to `GlJournalLine` so future postings can carry dimension context without changing existing posted journal behavior.
- Extended budget lines and budget period amounts with optional dimension scope and a stable `dimensionKey`.
- Changed budget-line uniqueness from account-only to budget version + account + dimension key, preserving `ACCOUNT_ONLY` behavior for existing lines.
- Added dimension-aware actual aggregation: account-only budgets compare against all posted account activity, while dimension-scoped budgets compare against matching dimension-tagged GL lines.
- Added `/api/finance/budgets/dimensions` for dimension maintenance.
- Expanded `/finance/budgets` with Finance Dimensions, dimension-scoped budget lines, dimension labels across budget grids, and budget-vs-actual filters for fiscal year, period, account, and dimension.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma --accept-data-loss`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- Live smoke created department dimension `SMOKE-DEPT`, saved account-only and dimension-specific `6100` budget lines, posted dimension-tagged journal `GL-000018`, and confirmed dimension actual `75`, dimension budget `100`, and preserved account-only actual behavior.
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/api/finance/budgets/dimensions` and `/finance/budgets`.

## Finance Completion Gate

Core Finance completion is done. Retail Operations is deferred for a later pass. Fuel Operations foundation, store-sourced fuel sales/payment capture, HQ-direct GRN receiving, focused Fuel Operations workflow pages, RMS source-location alignment, fuel sales-order fulfillment, site-filtered fuel tank selection, filling-station edit/GPS capture, POS-style Fuel Sale payment capture, shop-linked filling-station transfer destinations, transfer-out waybill/feedback handling, actual transfer valuation/GL posting, online-store fuel station-side capture routes, and HQ fuel-sales menu removal are complete as the first requested industry-specific module. Inventory stock ledger foundation is the next recommended generic operational foundation unless module priority changes.

## Next Slice Detail

### 023. Fuel Operations Foundation

Status: Done

Implemented:

- Added fuel tank, pump, nozzle, tank dip, meter reading, delivery, delivery line, daily reconciliation, and reconciliation line models.
- Added a SQL Server migration script for Fuel Operations foundation tables and indexes.
- Added `FUEL_DELIVERY` and `FUEL_RECONCILIATION` document numbering setup.
- Added early default fuel product profile setup and a fallback fuel operating site when none exists; the fuel product source was later corrected in slice 026 to use RMS Products/Item Dynamic stock instead of standalone defaults.
- Added fuel tank registration with product, site, capacity, safe capacity, reorder level, and operational book quantity tracking.
- Added pump and nozzle registration with tank/product linkage and meter baseline tracking.
- Added tank dipping with book-vs-physical variance capture.
- Added nozzle meter readings with sales quantity, sales amount, and tank book-quantity reduction.
- Added mandatory uploaded photo evidence for tank dips and meter readings to reduce fraud risk.
- Added fuel delivery recording with ordered, delivered, accepted, variance, unit cost, supplier, and supplier document references.
- Added daily fuel reconciliation with delivered quantity, meter sales, book closing, dip closing, gain/loss, sales, cost, margin, and margin percentage calculations.
- Added `/api/fuel-operations/tanks`, `/api/fuel-operations/pumps`, `/api/fuel-operations/nozzles`, `/api/fuel-operations/evidence`, `/api/fuel-operations/dips`, `/api/fuel-operations/meter-readings`, `/api/fuel-operations/deliveries`, and `/api/fuel-operations/reconciliations`.
- Added `/fuel-operations` with tank, pump/nozzle, dips/meters, delivery, and reconciliation views, including camera-friendly evidence upload controls.
- Added Fuel Operations navigation with direct child links that do not auto-open a nested subgroup.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- Live smoke created a fuel tank, pump, nozzle, delivery, meter reading, tank dip, and reconciliation `FR-000001`, confirming gain/loss and margin calculation without GL posting.
- Live fraud-control smoke confirmed tank dips and meter readings are rejected without uploaded photo evidence and accepted with Fuel evidence URLs.
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/fuel-operations` and all Fuel Operations API routes.

### 024. Fuel Station Delivery Tracking

Status: Done

Implemented:

- Kept existing fuel delivery records as supplier receipt/stock-in records and renamed the UI lane to Supplier Fuel Receipts.
- Added filling-station master records linked optionally to customer accounts or owned operating sites.
- Added outbound station delivery/dispatch records from source tanks to filling stations.
- Added station delivery lines with ordered, loaded, delivered, variance, selling price, cost, and margin fields.
- Added invoice status and future Finance document hook fields while later moving detailed customer payment capture into the separate Fuel Sales workflow.
- Added `FUEL_STATION_DELIVERY` document numbering with `FSD` sequence numbers.
- Updated daily fuel reconciliation so station dispatches reduce book closing quantity and contribute sales, cost, and margin.
- Added `/api/fuel-operations/stations` and `/api/fuel-operations/station-deliveries`.
- Expanded `/fuel-operations` with Filling Stations, Station Deliveries, and Supplier Fuel Receipts sections.
- Left Procurement as the supplier replenishment / goods-receipt path instead of using it for customer/station dispatch.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- Live smoke created tank `SMK-DISP-773417`, station `SMK-STN-773417`, and station delivery `FSD-000001`; confirmed tank book quantity moved from `100` to `80`, sales `97.50`, received `50.00`, outstanding `47.50`, and payment status `PARTIALLY_PAID`.
- Live reconciliation smoke posted `FR-000002` and confirmed station dispatch quantity `20` and book closing quantity `80` for the smoke tank.
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/api/fuel-operations/stations`, `/api/fuel-operations/station-deliveries`, and `/fuel-operations`.

### 025. Fuel Sales Capture and Payment Tracking

Status: Done

Implemented:

- Added separate `ErpFuelSale` and `ErpFuelSaleLine` models so sales are not treated as deliveries.
- Added a SQL Server migration script for fuel sales capture tables and indexes.
- Added `FUEL_SALE` document numbering with `FS` sequence numbers.
- Added fuel sales capture for date of loading, customer name/account, service type, product, price, quantity, amount, payment received, balance, payment date, Bank/MoMo account, payment narration, truck loaded, and date of dispatch.
- Required each sale to select the source store/site where fuel was received through supplier receipt/GRN stock.
- Added backend validation so fuel sales cannot exceed available inventory-ledger stock for the selected RMS catalog product at the selected source store/site.
- Fuel sales now reduce Item Dynamic stock by posting `SALE` inventory ledger movements against the GRN source store/location.
- Added `/api/fuel-operations/sales`.
- Expanded `/fuel-operations` with a Fuel Sales section and moved detailed customer payment capture out of the Station Delivery dialog.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- Live smoke rejected an over-stock fuel sale from `MAIN-SITE`, then created fuel sale `FS-000001` for `PMS` quantity `10`, amount `50`, payment received `20`, balance `30`, and payment status `PARTIALLY_PAID`; the source tank book quantity stayed `100` because sales do not move stock.
- `npm --workspace @flash-erp/enterprise-web run build`
- Route smoke confirmed `/fuel-operations` responds with `200`, and the production route list includes `/api/fuel-operations/sales`.

### 026. HQ GRN and Fuel Operations Workflow Split

Status: Done

Implemented:

- Added an HQ goods-receipt action for open purchase orders from the Goods Receipt page and PO detail dialog.
- Posted HQ GRNs to the exact receiving inventory location already specified on the PO.
- Published HQ-created inventory ledger movements back to the selected store/site node so site stock can sync.
- Mirrored fuel-product HQ GRNs into Fuel Operations supplier fuel receipts when the PO product is an RMS fuel catalog item and the receiving site has an active matching tank.
- Added `/api/inventory/purchase-orders/[purchaseOrderId]/goods-receipt`.
- Removed Fuel Operations' standalone default-product dependency from the active product picker; fuel product choices now come from active inventory-tracked Products that match fuel codes/categories, with profile mirrors created only for compatibility.
- Changed Fuel Sales stock validation and stock reduction to read/write `InventoryLedgerEntry` balances at the selected source site/location, matching the Item Dynamic stock source.
- Split Fuel Operations into dedicated dynamic pages for fuel sales, station deliveries, supplier receipts, tank dips, meter readings, tanks, pumps/nozzles, and filling stations.
- Changed Fuel Sales entry to use an editable multi-line grid with add/remove line controls and combined product stock validation.
- Added edit actions for fuel tanks, pumps, nozzles, tank dips, and meter readings.
- Updated meter-reading edits to reverse the old reading quantity before applying the edited reading so tank book quantity stays consistent.
- Kept customer sales separate from station sales/deliveries as separate workflows; both posted customer fuel sales and posted station sales/dispatches reduce RMS Item Dynamic stock through `SALE` ledger movements, while meter readings remain forecourt measurement workflow.

Verified:

- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/api/inventory/purchase-orders/[purchaseOrderId]/goods-receipt`, `/fuel-operations/sales`, `/fuel-operations/deliveries`, `/fuel-operations/dips`, `/fuel-operations/meter-readings`, `/fuel-operations/supplier-receipts`, `/fuel-operations/stations`, `/fuel-operations/tanks`, and `/fuel-operations/pumps`.

### 027. Fuel Source Stock and Sales-Order Correction

Status: Done

Implemented:

- Changed Fuel Operations source store/site dropdowns to be backed by RMS `InventoryLocation` / Item Dynamic stock instead of the Finance Operating Foundation site list.
- Kept ERP operating-site mirrors behind the scenes so existing fuel tank, sale, delivery, and reconciliation relations remain stable while users select stock-bearing RMS locations.
- Added fuel-stock quantity context to source store/site dropdown labels.
- Added shared Item Dynamic stock validation/allocation for Fuel Operations `SALE` ledger movements.
- Kept customer fuel sales as posted commercial sales that reduce Item Dynamic stock at the selected GRN source location.
- Added a Fuel Sales document mode for `SALE` versus `SALES_ORDER`.
- Saved fuel sales orders as `ORDERED` records that do not reduce stock until fulfillment.
- Added fuel sales-order fulfillment, payment update, dispatch date, truck, and narration capture; fulfillment posts `SALE` inventory ledger movements and marks the sale `POSTED`.
- Treated filling-station deliveries as station sales/dispatches: they now capture selling price, payment mode, received amount, payment date, reference, outstanding balance, and reduce Item Dynamic stock as well as source tank book quantity.
- Added `/api/fuel-operations/sales/[fuelSaleId]/fulfill`.
- Expanded Fuel Sales and Station Sales/Deliveries grids/dialogs so payment, status, and fulfillment actions are visible from the dedicated Fuel Operations pages.

Verified:

- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/api/fuel-operations/sales/[fuelSaleId]/fulfill`, `/fuel-operations/sales`, and `/fuel-operations/deliveries`.

### 028. Filling-Station AR Linkage and Site-Filtered Tank Selection

Status: Done

Implemented:

- Required non-owned filling stations to be linked to a customer account so station sales and pay-later dispatches carry a stable AR customer identity.
- Added backend validation that blocks station sales/dispatches when the selected filling station has no customer account.
- Added backend validation that blocks fuel sales orders and unpaid/part-paid customer fuel sales unless a customer account is selected for AR linkage.
- Added backend validation that blocks fulfillment of legacy/open fuel sales orders without a customer account.
- Expanded station dropdown labels to show the linked customer account, and limited station sale/fuel sale station choices to AR-linked stations.
- Updated Fuel Sales and Filling Stations dialogs to label customer-account fields as AR customer accounts.
- Added operating-site context to fuel tank options.
- Filtered station sale/dispatch source tanks by the selected dispatch site and cleared the tank when the dispatch site changes.
- Filtered supplier fuel receipt tanks by the selected receiving site and cleared the tank when the receiving site changes.
- Added backend validation to prevent supplier fuel receipts from being posted to a tank outside the selected receiving site.

Verified:

- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list still includes `/fuel-operations/sales`, `/fuel-operations/deliveries`, `/fuel-operations/supplier-receipts`, `/api/fuel-operations/station-deliveries`, `/api/fuel-operations/deliveries`, and `/api/fuel-operations/sales/[fuelSaleId]/fulfill`.

### 029. Fuel Master-Data UX and Customer Terms Inheritance

Status: Done

Implemented:

- Added filling-station edit actions so existing station records can be reopened and updated.
- Added GPS latitude and longitude fields to filling stations for future map display.
- Kept `Owned operating site` only for `OWNED` station records; customer/dealer stations use AR customer linkage instead.
- Moved filling-station payment terms and credit-limit handling to the selected customer account's Finance party profile, with station dialogs showing inherited customer terms/limits as read-only context.
- Added payment-term selection to the customer dialog and synchronized it to `ErpPartyAccountingProfile` so Finance party profiles remain the source for AR terms.
- Changed tank type, tank status, pump type, pump status, nozzle status, and fuel product fields to controlled dropdowns, with fuel products still coming from the RMS product-backed Fuel Operations product picker.
- Changed Tank Dip `Recorded by` to a dropdown from `RetailUser` records.
- Renamed Tank Dip `Dip quantity` to `Dip reading` and `Water quantity` to `Water volume` in the dialog/grid.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/fuel-operations/stations`, `/fuel-operations/tanks`, `/fuel-operations/pumps`, `/fuel-operations/dips`, `/api/fuel-operations/stations`, `/api/fuel-operations/tanks`, `/api/fuel-operations/pumps`, `/api/fuel-operations/nozzles`, `/api/fuel-operations/dips`, `/api/setup/customers`, and `/api/setup/customers/[customerNo]`.

### 030. Fuel Sale Payment Dialog Redesign

Status: Done

Implemented:

- Increased the Fuel Sale dialog width for a cleaner line-entry and payment-entry workflow.
- Tightened Fuel Sale dialog spacing, moved truck/station/currency controls above the line and payment grids, and hid the visible notes controls for now.
- Added subtotal, tax, total, paid, and balance summaries directly below the Fuel Sale line-item grid.
- Replaced the single Fuel Sale payment amount/account/reference fields with POS-style multiple payment rows.
- Added payment row controls for Tender Method, amount, payment date, reference, and notes.
- Added optional Finance cashbook account mapping to Tender Methods so the tender setup page owns the payment-mode-to-cashbook/GL account mapping.
- Changed the Fuel Sale payment dropdown to load active Tender Methods and show each mapped Finance cashbook/GL account, instead of loading raw Finance cashbook accounts directly.
- Added backend `ErpFuelSalePayment` rows so each Fuel Sale payment line is persisted against its Finance cashbook account.
- Linked Fuel Sale payment rows back to the selected Tender Method with tender code/name snapshots for future reporting and audit.
- Kept legacy Fuel Sale aggregate payment fields populated from the payment rows for existing grids and reporting compatibility.
- Added backend validation that blocks payment over-total, missing tender/account mapping on paid rows, and missing references for tender rows that require references.
- Added `CUSTOMER-CREDIT` Tender Method using `STORE_CREDIT`, with no cashbook account mapping, so customer/filling-station credit sales post to customer receivables instead of a cash/bank account.
- Made Fuel Sale cash received, customer-credit tender amount, and AR balance distinct: credit tender no longer counts as cash received, and it creates a `FUEL_RECEIVABLE_CHARGE` customer account entry with credit-limit validation.
- Made `ErpFuelSalePayment.cashbookAccountId` nullable so AR credit tender rows can be persisted without a fake Finance cashbook account.
- Moved default Fuel Operations settings for fuel sale source site and station-delivery dispatch site to Settings so new transactions preselect saved defaults while still allowing user changes.
- Changed Fuel Sale, station delivery, and supplier receipt currency fields to dropdowns backed by active Finance currencies, defaulting to the Finance functional currency.
- Added safe Fuel Operations workspace repair for empty fuel product pickers by ensuring active inventory-tracked RMS fuel catalog products for PMS, AGO, Kerosene, and LPG.
- Added safe Finance payment-account defaults for cash, bank, and mobile money, mapped through Tender Methods to Finance cashbook/GL setup, so the Fuel Sale tender dropdown is not empty on fresh setup.
- Added backend workspace defaults for inventory-backed source-site options when no active RMS inventory location exists.
- Seeded `EA`, `LTR`, `KL`, `EACH`, and `FUEL-VOLUME` UOM defaults, with fuel products linked to `LTR` and the `FUEL-VOLUME` schedule.
- Changed the Fuel Tank dialog so UOM is displayed readonly from the selected fuel product, and changed backend tank saves to derive `uomCode` from the selected fuel product profile.
- Seeded AR-linked filling stations `FS-ACCRA-01`, `FS-TEMA-01`, and `FS-KUMASI-01`.
- Seeded zero-quantity tanks `TANK-PMS-01`, `TANK-AGO-01`, `TANK-KERO-01`, and `TANK-LPG-01`, each linked to an RMS-backed fuel product and inventory-location-backed operating site.
- Changed normal seed behavior so inherited retail demo products/transactions are opt-in through `FLASH_ERP_SEED_RETAIL_DEMO_DATA=true`; normal ERP seeding keeps the clean fuel catalog path.
- Kept Fuel Delivery payment redesign deferred for the later delivery-specific pass, per current scope.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- Live SQL/Prisma smoke confirmed products `AGO`, `KERO`, `LPG`, and `PMS` only, each with `LTR` / `FUEL-VOLUME`, plus ERP product-profile mirrors.
- Live SQL/Prisma smoke confirmed UOM rows `EA`, `LTR`, `KL`, schedules `EACH` and `FUEL-VOLUME`, and `FUEL-VOLUME` conversion lines for `LTR` and `KL`.
- Live SQL/Prisma smoke confirmed Tender Methods `CASH`, `VISA-MASTERCARD`, `MOMO`, and `BANK-TRANSFER` are mapped to Finance cashbook accounts, while `CUSTOMER-CREDIT` uses `STORE_CREDIT` with no cashbook account.
- Live SQL/Prisma smoke confirmed 3 seeded AR-linked filling stations and 4 seeded product-derived-`LTR` tanks.
- Temporary Fuel Sale credit-tender smoke posted `FS-000002` with cash received `0`, AR balance `5`, no payment cashbook account, receivable delta `5`, and matching customer receivable balance; smoke rows were then cleaned up.
- Live SQL/Prisma smoke confirmed zero fuel sales, fuel sale payments, `FUEL_RECEIVABLE_CHARGE` rows, and temporary smoke stock rows after verification cleanup.
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Route smoke confirmed `/fuel-operations/sales` responds with `200` on `http://localhost:3000`.
- Production build route list includes `/fuel-operations/sales`, `/api/fuel-operations/sales`, `/settings/[view]`, `/api/settings/fuel-operations`, `/api/setup/tender-methods`, and `/api/setup/tender-methods/[tenderMethodCode]`.

### 031. Fuel Delivery Transfer-Out Correction

Status: Done

Implemented:

- Checked existing inter-store transfer, in-transit, and online-store transfer receive workflows before changing Fuel Delivery.
- Changed filling stations to link to shops/inventory locations instead of requiring customer accounts as the transfer destination identity.
- Kept AR customer linkage as optional context for customer-credit workflows, not as the primary destination key for internal transfers.
- Changed HQ Fuel Delivery issue to create issued `InterStoreTransfer` rows with `FUEL_TRANSFER` workflow metadata, source/destination stores and locations, source tank links, and logistics fields.
- Issuing a transfer-out now validates source stock, writes `STOCK_TRANSFER_OUT` inventory ledger movement, reduces source tank book quantity, and queues the existing transfer publication path for destination receipt.
- Added Fuel Delivery waybill/reprint handling on top of the transfer row instead of treating the document as a sales receipt.
- Added a Fuel Delivery Feedback tab/action path for water test, quantities before/after delivery, expected/actual received quantities, variance, note, and save/confirm/post states.
- Added Online Store fuel station-side routes that reuse the existing Fuel Operations tank, dip, meter reading, supplier receipt, and reconciliation logic while excluding HQ-only Fuel Sales, Fuel Deliveries, Filling Stations, Pumps, and Nozzles.
- Added Online Store POS service type capture using the same existing sale flow.
- Removed HQ Fuel Sales from the Fuel Operations menu/tab surface and redirected `/fuel-operations/sales` to Online Store for the sales cutover.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- Local Prisma smoke confirmed seeded stations `FS-ACCRA-01`, `FS-TEMA-01`, and `FS-KUMASI-01` are linked to shops/locations and all active stores have `OPERATING_UNIT` finance dimensions.
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/api/fuel-operations/station-deliveries/[stationDeliveryId]/feedback`, `/fuel-operations/deliveries`, `/inventory/in-transit`, `/online-store`, `/online-store/fuel`, `/online-store/fuel/tanks`, `/online-store/fuel/dips`, `/online-store/fuel/meter-readings`, `/online-store/fuel/supplier-receipts`, and `/online-store/fuel/reconciliation`.

### 032. Fuel Transfer Valuation and GL Posting

Status: Done

Implemented:

- Added transfer valuation fields to `InterStoreTransfer` for issue journal, receipt journal, issued value, received value, variance value, valuation status, and valuation posted timestamp.
- Added SQL Server migration coverage for the valuation fields and journal-reference indexes.
- Posted HQ fuel transfer issue valuation to Finance through the shared posting engine as inventory in-transit debit and source shop inventory credit.
- Posted Fuel Delivery feedback `POST` valuation to Finance through the shared posting engine as destination shop inventory debit, in-transit inventory credit, and shortage/gain variance to the inventory adjustment/cost account.
- Used `OPERATING_UNIT` finance dimensions for source shop, destination shop, and in-transit inventory value tracking.
- Kept weighted-average issue cost as the active cost basis and retained FIFO as a later valuation-layer upgrade.
- Required positive transfer cost before issuing or posting fuel transfer valuation so missing cost setup is caught at the operational entry point.
- Updated online-store transfer issue/receipt ledger rows to use the transfer unit cost.
- Added valuation status and issued/received/variance values to the Fuel Delivery transfer grid/detail view.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Disposable live smoke issued transfer `FSD-000006`, posted issue journal `GL-000022`, posted receipt/variance journal `GL-000023`, confirmed `POSTED` valuation with issued value `36.25`, received value `32.63`, variance `3.62`, and then cleaned all smoke rows.

### 033. Store/Shop Cost-Center P&L Tracking

Status: Done

Implemented:

- Added store/shop `COST_CENTER` finance dimension seeding next to existing store `OPERATING_UNIT` dimensions.
- Added Fuel Operations workspace repair so active stores get both operating-unit and cost-center dimensions when the workspace is opened.
- Removed AR/customer-account presentation from Filling Station maintenance; stations are now maintained as linked shop and receiving-location transfer destinations.
- Kept customer AR enforcement only on workflows that actually create receivables: customer-credit tenders, sales orders, and unpaid/part-paid sales.
- Tagged fuel sale revenue and weighted-average COGS posting lines with the selling shop `COST_CENTER`.
- Tagged fuel transfer shortage/gain variance posting lines with the destination shop `COST_CENTER`, while source/destination inventory and in-transit balance movements continue using `OPERATING_UNIT`.
- Added a Shop P&L cost-center selector to Finance > Financial Statements so income statement rows and P&L metrics can be filtered by shop without distorting company-level balance sheet and period close controls.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:seed`
- Live SQL/Prisma smoke confirmed company `FLASH-ERP` has 8 active store cost centers for 8 active stores, with no missing store cost centers.
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Production build route list includes `/finance/financial-statements` plus Fuel Operations routes.

### 034. Inventory Stock Ledger Foundation

Status: Next

Scope:

- Add generic item/site/storage stock movement records around existing product profile, operating site, and storage unit foundations after Fuel Operations sales capture.
- Keep quantities industry-neutral and reusable for receipts, issues, transfers, adjustments, and future manufacturing/service extensions.
- Prepare valuation hooks without posting inventory value directly outside the shared GL engine.
- Preserve current weighted-average issue costing while planning FIFO valuation layers for the later costing upgrade.

Acceptance:

- Stock movements can be listed by product, site, storage unit, movement type, date, and source reference.
- Stock balances reconcile to movement history by product/site/storage.
- Future inventory valuation postings can flow through the shared accounting engine.
- Current average-cost issue values remain traceable from inventory ledger movements, and FIFO valuation is explicitly scoped for the later valuation pass.

## Tracker Rules

- Update this tracker before starting a new major slice and again after verification.
- Do not mark a slice Done until schema, seed, typecheck, and build gates pass when touched by the slice.
- If a slice includes UI, verify that the route exists in the production build and is reachable through navigation.
- Keep domain language generic unless implementing an explicitly industry-specific extension.
