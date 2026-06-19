export const entityOwnershipRules = {
    retailOrg: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Enterprise owns core org settings."
    },
    store: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Store definitions are enterprise-controlled."
    },
    warehouse: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Warehouse topology is distributed from HQ."
    },
    terminal: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Terminal provisioning comes from enterprise."
    },
    syncNode: {
        authority: "enterprise",
        upstreamFlow: true,
        downstreamFlow: true,
        conflictPolicy: "manual-review",
        notes: "Node registrations and node posture are monitored centrally."
    },
    retailUser: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Users are distributed to stores, not mastered locally."
    },
    role: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Role definitions are enterprise-owned."
    },
    permission: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Permissions are centrally controlled."
    },
    customer: {
        authority: "shared",
        upstreamFlow: true,
        downstreamFlow: true,
        conflictPolicy: "merge-by-version",
        notes: "Stores may create or update customers offline."
    },
    customerAccountEntry: {
        authority: "shared",
        upstreamFlow: true,
        downstreamFlow: false,
        conflictPolicy: "accept-append-only",
        notes: "Customer account postings are append-only financial facts that can originate from either enterprise or the store lane."
    },
    salesOrder: {
        authority: "store",
        upstreamFlow: true,
        downstreamFlow: false,
        conflictPolicy: "accept-append-only",
        notes: "Store desktops create and fulfil sales-order commitments against local baskets."
    },
    eodReconciliation: {
        authority: "store",
        upstreamFlow: true,
        downstreamFlow: false,
        conflictPolicy: "accept-append-only",
        notes: "End-of-day reconciliation facts are captured at the trading location."
    },
    bankingDeposit: {
        authority: "store",
        upstreamFlow: true,
        downstreamFlow: false,
        conflictPolicy: "accept-append-only",
        notes: "Banking deposits are local financial handoff facts linked to reconciled shifts."
    },
    bankAccount: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Bank, branch, and account-number combinations are mastered centrally for store settlement."
    },
    supplier: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Supplier catalogs are managed centrally in the first milestone."
    },
    taxProfile: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Tax policy is distributed from enterprise."
    },
    tenderMethod: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Tender method availability is centrally controlled."
    },
    promotion: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Promotion and discount policy is distributed from enterprise."
    },
    productDepartment: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Top-level product departments are distributed from enterprise."
    },
    productCategory: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Product categories remain aligned with enterprise hierarchy."
    },
    product: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Product master data is authoritative at enterprise."
    },
    productSupplier: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Preferred supplier and replenishment posture are maintained centrally."
    },
    barcode: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Barcode assignments travel downstream with product data."
    },
    priceList: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Store pricing must be refreshed from enterprise."
    },
    inventoryLocation: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Locations are defined centrally, then consumed in stores."
    },
    inventorySerialSnapshot: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Enterprise publishes canonical serialized stock posture to store desktops."
    },
    purchaseOrder: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Purchase orders are issued centrally and executed by destination desktop nodes."
    },
    stockCountSession: {
        authority: "shared",
        upstreamFlow: true,
        downstreamFlow: false,
        conflictPolicy: "accept-append-only",
        notes: "Store desktops submit local stock-count sessions upstream so enterprise can track pending and committed count work canonically."
    },
    interStoreTransfer: {
        authority: "enterprise",
        upstreamFlow: true,
        downstreamFlow: true,
        conflictPolicy: "manual-review",
        notes: "Enterprise owns the canonical inter-store transfer document while source and destination desktops append issue and receipt execution facts."
    },
    interStoreTransferTarget: {
        authority: "enterprise",
        upstreamFlow: false,
        downstreamFlow: true,
        conflictPolicy: "reject-store-overwrite",
        notes: "Enterprise publishes the remote source-location directory that store desktops use to start transfer-in requests."
    },
    goodsReceipt: {
        authority: "shared",
        upstreamFlow: true,
        downstreamFlow: false,
        conflictPolicy: "accept-append-only",
        notes: "Goods receipts are append-only receiving facts created at enterprise or synced back from store nodes."
    },
    supplierReturn: {
        authority: "shared",
        upstreamFlow: true,
        downstreamFlow: true,
        conflictPolicy: "manual-review",
        notes: "Supplier returns are captured at the execution node and projected canonically at enterprise, with controlled downstream status and reversal publications when HQ cancels an RTV."
    },
    syncTask: {
        authority: "shared",
        upstreamFlow: true,
        downstreamFlow: true,
        conflictPolicy: "manual-review",
        notes: "Enterprise issues operational tasks downstream and the store desktop completes them upstream."
    },
    inventoryTransfer: {
        authority: "store",
        upstreamFlow: true,
        downstreamFlow: false,
        conflictPolicy: "accept-append-only",
        notes: "Store desktops emit transfer facts that enterprise projects into paired inventory ledger entries."
    },
    inventoryLedgerEntry: {
        authority: "store",
        upstreamFlow: true,
        downstreamFlow: false,
        conflictPolicy: "accept-append-only",
        notes: "Stores emit inventory facts as append-only events."
    },
    posShift: {
        authority: "store",
        upstreamFlow: true,
        downstreamFlow: false,
        conflictPolicy: "accept-append-only",
        notes: "Shift state originates from the trading location."
    },
    posTransaction: {
        authority: "store",
        upstreamFlow: true,
        downstreamFlow: false,
        conflictPolicy: "accept-append-only",
        notes: "Transactions are local-first commercial facts."
    },
    posTransactionLine: {
        authority: "store",
        upstreamFlow: true,
        downstreamFlow: false,
        conflictPolicy: "accept-append-only",
        notes: "Transaction lines are part of the immutable commercial event."
    },
    posPayment: {
        authority: "store",
        upstreamFlow: true,
        downstreamFlow: false,
        conflictPolicy: "accept-append-only",
        notes: "Payment records are captured where tendering happens."
    }
};
