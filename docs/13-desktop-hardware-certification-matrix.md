# 13. Store Desktop Hardware Certification Matrix

Last updated: 2026-04-30

This matrix names the physical shop hardware checks required before Store Desktop can be treated as production-certified for a store rollout. The repo can verify that the runtime exposes the hooks, but final pass/fail still requires the actual device models used in each shop.

## Device Matrix

| Device class | Runtime surface | Required certification scenario | Evidence |
| --- | --- | --- | --- |
| Receipt printer | Printer list, receipt print, account payment receipt, Z report print, thermal test slip | Select printer, print test slip, complete sale, reprint receipt, print account payment, print shift report | Device model, driver version, sample receipt photo |
| Cash drawer | Drawer kick through drawer-enabled tender routes | Kick drawer from configured tender and from hardware test action | Drawer model, interface type, tender code |
| Barcode scanner | Sell, receipt lookup, inventory browse, serial browse, stock count, receiving | Scan SKU/barcode/serial into every scan-capable workflow without focus loss | Scanner model, keyboard-wedge mode, sample codes |
| Pole/customer display | Customer-facing transaction visibility, if installed | Confirm totals and tenders render without delaying checkout | Device model and driver |
| Payment terminal | Tender capture and offline fallback, if integrated | Confirm approved, declined, voided, and offline tender handling | Provider, terminal model, receipt mapping |
| Scale | Weighted item input, if used | Confirm weighted barcode or scale input updates the basket correctly | Scale model and barcode format |

## Certification Steps

1. Install the packaged Windows app on a clean Windows user profile.
2. Confirm the support log path exists at `%APPDATA%\@flash-erp\store-desktop\logs\main.log`.
3. Configure the store connection and sync until products, tenders, users, and receipt settings are local.
4. Run the device scenarios above.
5. Save the device model, driver version, connection type, and pass/fail result for each shop.
6. Re-run the same checks after every desktop version upgrade that touches printing, scanning, checkout, or sync.

## Repo Gate

`npm run cert:hardware` verifies that the Store Desktop codebase still exposes the required hardware hooks and that this matrix remains committed. It does not replace physical device sign-off.
