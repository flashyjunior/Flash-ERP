# Flash ERP Charter

Flash ERP is the separate ERP workspace derived from Flash RMS. RMS remains the retail/POS product. This repository becomes the multi-company ERP foundation for finance-led business operations across multiple industries.

## Initial Business Scope

- Group and company setup for multiple legal entities, branches, sites, departments, projects, and operating units.
- Configurable product, service, asset, and stock profiles with industry-specific attributes layered on top.
- Purchasing, receiving, stock/storage tracking, freight or service costs, supplier claims, and landed-cost tracking.
- Bulk and retail sales, customer credit, receivables, cash/bank receipts, and margin reporting.
- Tax handling for VAT, excise, levies, withholding tax, and other jurisdiction-specific taxes.

## Finance Target

The Finance area should become a full accounting module, not only a reporting screen:

- General ledger and journal posting engine.
- Complete chart of accounts per company, with group consolidation support.
- Accounts receivable and credit control.
- Accounts payable and supplier reconciliation.
- Banking, cashbooks, bank reconciliation, and payment/receipt allocation.
- Fixed assets, depreciation, and disposals.
- Budgeting and budget-vs-actual reporting.
- Tax setup, tax returns support, and tax control accounts.
- Payroll integration into the GL.

## First Implementation Principle

Build the accounting foundation first. Operational workflows should post into GL through a shared posting engine instead of writing finance totals directly.

Recommended first slices:

1. Company/tenant foundation.
2. Fiscal years, periods, currencies, and accounting settings.
3. Chart of accounts.
4. Journal batches, journal lines, posting, and reversal.
5. AR/AP control-account setup.
6. Product/site/storage master-data foundation.

## Inherited Baseline

The repository still contains RMS-era names in schema models, workflow screens, scripts, and older docs. Rename those gradually when the ERP domain model is reshaped. Avoid blind model renames until migrations and data ownership rules are designed.
