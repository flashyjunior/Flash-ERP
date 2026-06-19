const catalog = [
    {
        code: "master.customer.manage",
        name: "Manage customers",
        description: "Create and maintain customer masters, account posture, and customer setup.",
        domain: "Master",
        group: "Customers",
        surface: "both",
        sortOrder: 10
    },
    {
        code: "master.supplier.manage",
        name: "Manage suppliers",
        description: "Create and maintain supplier masters and sourcing posture.",
        domain: "Master",
        group: "Suppliers",
        surface: "both",
        sortOrder: 20
    },
    {
        code: "master.tax.manage",
        name: "Manage tax",
        description: "Create and maintain enterprise tax profiles and defaults.",
        domain: "Master",
        group: "Tax",
        surface: "enterprise",
        sortOrder: 30
    },
    {
        code: "master.tender.manage",
        name: "Manage tenders",
        description: "Create and maintain tender methods, refund rules, and drawer rules.",
        domain: "Master",
        group: "Tenders",
        surface: "enterprise",
        sortOrder: 40
    },
    {
        code: "master.bank.manage",
        name: "Manage banks",
        description: "Create and maintain bank, branch, and account-number setup for banking and non-cash settlement.",
        domain: "Master",
        group: "Banks",
        surface: "enterprise",
        sortOrder: 45
    },
    {
        code: "master.department.manage",
        name: "Manage departments",
        description: "Create and maintain top-level product departments.",
        domain: "Master",
        group: "Departments",
        surface: "enterprise",
        sortOrder: 50
    },
    {
        code: "master.category.manage",
        name: "Manage categories",
        description: "Create and maintain product categories under departments.",
        domain: "Master",
        group: "Categories",
        surface: "enterprise",
        sortOrder: 60
    },
    {
        code: "master.product.manage",
        name: "Manage products",
        description: "Create and maintain product masters, attributes, pricing posture, and serial rules.",
        domain: "Master",
        group: "Products",
        surface: "both",
        sortOrder: 70
    },
    {
        code: "master.store.manage",
        name: "Manage stores",
        description: "Create and maintain stores, warehouse-enabled sites, and terminals.",
        domain: "Master",
        group: "Stores",
        surface: "enterprise",
        sortOrder: 80
    },
    {
        code: "master.loyalty.manage",
        name: "Manage loyalty",
        description: "Maintain loyalty earning, redemption policy, and loyalty setup.",
        domain: "Master",
        group: "Loyalty",
        surface: "enterprise",
        sortOrder: 90
    },
    {
        code: "master.promotion.manage",
        name: "Manage promotions",
        description: "Maintain promotion and discount policies.",
        domain: "Master",
        group: "Promotions",
        surface: "enterprise",
        sortOrder: 100
    },
    {
        code: "settings.company.manage",
        name: "Manage company settings",
        description: "Update company profile, identity, and enterprise-level company settings.",
        domain: "Settings",
        group: "Company",
        surface: "enterprise",
        sortOrder: 110
    },
    {
        code: "settings.ldap.manage",
        name: "Manage LDAP settings",
        description: "Configure enterprise LDAP connectivity, sync posture, and directory mappings.",
        domain: "Settings",
        group: "Company",
        surface: "enterprise",
        sortOrder: 112
    },
    {
        code: "settings.smtp.manage",
        name: "Manage SMTP settings",
        description: "Configure enterprise SMTP credentials and outbound messaging defaults.",
        domain: "Settings",
        group: "Company",
        surface: "enterprise",
        sortOrder: 114
    },
    {
        code: "settings.sms.manage",
        name: "Manage SMS settings",
        description: "Configure enterprise SMS providers, sender IDs, and delivery reporting.",
        domain: "Settings",
        group: "Company",
        surface: "enterprise",
        sortOrder: 116
    },
    {
        code: "settings.receipt-template.manage",
        name: "Manage receipt templates",
        description: "Design and publish thermal receipt templates for stores.",
        domain: "Settings",
        group: "Receipt templates",
        surface: "enterprise",
        sortOrder: 120
    },
    {
        code: "settings.retail-user.manage",
        name: "Manage retail users",
        description: "Maintain retail-user profiles, home stores, and operational assignment.",
        domain: "Settings",
        group: "Retail users",
        surface: "enterprise",
        sortOrder: 130
    },
    {
        code: "settings.option.manage",
        name: "Manage options",
        description: "Change enterprise operational options and behavior defaults.",
        domain: "Settings",
        group: "Options",
        surface: "enterprise",
        sortOrder: 140
    },
    {
        code: "security.user.manage",
        name: "Manage security users",
        description: "Create and maintain centrally managed retail-user accounts.",
        domain: "Security",
        group: "Users",
        surface: "enterprise",
        sortOrder: 150
    },
    {
        code: "security.role.manage",
        name: "Manage roles",
        description: "Create and maintain security roles.",
        domain: "Security",
        group: "Roles & privileges",
        surface: "enterprise",
        sortOrder: 160
    },
    {
        code: "security.privilege.manage",
        name: "Manage privileges",
        description: "Assign granular privileges to roles and control effective access posture.",
        domain: "Security",
        group: "Roles & privileges",
        surface: "enterprise",
        sortOrder: 170
    },
    {
        code: "security.audit-log.view",
        name: "View audit logs",
        description: "View security and administrative audit activity.",
        domain: "Security",
        group: "Audit logs",
        surface: "enterprise",
        sortOrder: 180
    },
    {
        code: "security.online-user.view",
        name: "View online users",
        description: "View currently active branch operator sessions and open-shift operators.",
        domain: "Security",
        group: "Online users",
        surface: "enterprise",
        sortOrder: 190
    },
    {
        code: "security.password-policy.manage",
        name: "Manage password policy",
        description: "Set password complexity, lockout, and session timeout policy.",
        domain: "Security",
        group: "Password policy",
        surface: "enterprise",
        sortOrder: 200
    },
    {
        code: "security.log.view",
        name: "View security logs",
        description: "Review security-specific warnings, alerts, and events.",
        domain: "Security",
        group: "Security logs",
        surface: "enterprise",
        sortOrder: 210
    },
    {
        code: "inventory.view",
        name: "View inventory",
        description: "View inventory posture, balances, counts, and serial state.",
        domain: "Inventory",
        group: "Visibility",
        surface: "both",
        sortOrder: 220
    },
    {
        code: "inventory.adjust",
        name: "Adjust inventory",
        description: "Post positive or negative inventory adjustments.",
        domain: "Inventory",
        group: "Adjustments",
        surface: "both",
        sortOrder: 230
    },
    {
        code: "inventory.count.submit",
        name: "Submit stock counts",
        description: "Submit local physical stock count sessions for enterprise visibility.",
        domain: "Inventory",
        group: "Counts",
        surface: "store",
        sortOrder: 240
    },
    {
        code: "inventory.count.commit",
        name: "Commit stock counts",
        description: "Commit local stock counts into live stock posture.",
        domain: "Inventory",
        group: "Counts",
        surface: "store",
        sortOrder: 250
    },
    {
        code: "inventory.transfer.request",
        name: "Request transfers",
        description: "Raise branch-initiated inter-store transfer-in requests.",
        domain: "Inventory",
        group: "Transfers",
        surface: "store",
        sortOrder: 260
    },
    {
        code: "inventory.transfer.issue",
        name: "Issue transfers",
        description: "Issue stock out against enterprise-issued or approved transfer instructions.",
        domain: "Inventory",
        group: "Transfers",
        surface: "store",
        sortOrder: 270
    },
    {
        code: "inventory.transfer.receive",
        name: "Receive transfers",
        description: "Receive stock into the destination location against transfer instructions.",
        domain: "Inventory",
        group: "Transfers",
        surface: "store",
        sortOrder: 280
    },
    {
        code: "inventory.purchase-order.manage",
        name: "Manage purchase orders",
        description: "Create, commit, and close purchase orders.",
        domain: "Inventory",
        group: "Purchasing",
        surface: "enterprise",
        sortOrder: 290
    },
    {
        code: "inventory.grn.receive",
        name: "Receive goods",
        description: "Receive purchase orders into stock and post goods receipts.",
        domain: "Inventory",
        group: "Purchasing",
        surface: "both",
        sortOrder: 300
    },
    {
        code: "inventory.supplier-return.manage",
        name: "Manage supplier returns",
        description: "Post, review, and cancel supplier returns and exception posture.",
        domain: "Inventory",
        group: "Purchasing",
        surface: "both",
        sortOrder: 310
    },
    {
        code: "pos.shift.open",
        name: "Open shift",
        description: "Open a POS shift and start a branch till session.",
        domain: "POS",
        group: "Shifts",
        surface: "store",
        sortOrder: 320
    },
    {
        code: "pos.shift.close",
        name: "Close shift",
        description: "Close and reconcile a POS shift.",
        domain: "POS",
        group: "Shifts",
        surface: "store",
        sortOrder: 330
    },
    {
        code: "pos.sale.process",
        name: "Process sales",
        description: "Capture normal sales and complete baskets at POS.",
        domain: "POS",
        group: "Selling",
        surface: "store",
        sortOrder: 340
    },
    {
        code: "pos.return.process",
        name: "Process returns",
        description: "Process receipt-backed returns and normal refund flows.",
        domain: "POS",
        group: "Corrections",
        surface: "store",
        sortOrder: 350
    },
    {
        code: "pos.exchange.process",
        name: "Process exchanges",
        description: "Process receipt-backed exchanges and net-refund exchanges.",
        domain: "POS",
        group: "Corrections",
        surface: "store",
        sortOrder: 360
    },
    {
        code: "pos.override.no-receipt-return",
        name: "Approve receipt-less corrections",
        description: "Approve return or exchange corrections without an original receipt.",
        domain: "POS",
        group: "Overrides",
        surface: "store",
        sortOrder: 370
    },
    {
        code: "pos.override.discount",
        name: "Approve discount overrides",
        description: "Approve discounts or manual markdown overrides beyond cashier allowance.",
        domain: "POS",
        group: "Overrides",
        surface: "store",
        sortOrder: 380
    },
    {
        code: "pos.override.price",
        name: "Approve price overrides",
        description: "Approve manual price changes and exceptional pricing actions.",
        domain: "POS",
        group: "Overrides",
        surface: "store",
        sortOrder: 390
    },
    {
        code: "pos.receipt.search",
        name: "Search receipts",
        description: "Search local receipt history beyond direct receipt number entry.",
        domain: "POS",
        group: "Receipts",
        surface: "store",
        sortOrder: 400
    },
    {
        code: "pos.receipt.reprint",
        name: "Reprint receipts",
        description: "Reprint thermal receipts from recent history or receipt search.",
        domain: "POS",
        group: "Receipts",
        surface: "store",
        sortOrder: 410
    },
    {
        code: "pos.customer.attach",
        name: "Attach customers",
        description: "Attach and change customers on a basket or correction flow.",
        domain: "POS",
        group: "Customers",
        surface: "store",
        sortOrder: 420
    },
    {
        code: "pos.customer.account.collect",
        name: "Collect account payments",
        description: "Collect customer account payments at the branch lane.",
        domain: "POS",
        group: "Customers",
        surface: "store",
        sortOrder: 430
    },
    {
        code: "pos.loyalty.redeem",
        name: "Redeem loyalty",
        description: "Redeem loyalty points at POS subject to enterprise policy.",
        domain: "POS",
        group: "Customers",
        surface: "store",
        sortOrder: 440
    },
    {
        code: "sync.monitor",
        name: "Monitor sync",
        description: "Review sync topology, queue posture, and node health.",
        domain: "Sync",
        group: "Monitoring",
        surface: "enterprise",
        sortOrder: 450
    },
    {
        code: "sync.store.operate",
        name: "Operate store sync",
        description: "Open the store desktop sync workspace, run manual sync, and recover local sync queues.",
        domain: "Sync",
        group: "Store operations",
        surface: "store",
        sortOrder: 455
    },
    {
        code: "sync.admin.reseed",
        name: "Run sync admin tools",
        description: "Perform reseed, replay, and sync administrative recovery actions.",
        domain: "Sync",
        group: "Administration",
        surface: "enterprise",
        sortOrder: 460
    },
    {
        code: "operations.dashboard.view",
        name: "View operations dashboard",
        description: "View operational dashboards and estate-level health posture.",
        domain: "Operations",
        group: "Dashboards",
        surface: "enterprise",
        sortOrder: 470
    },
    {
        code: "catalog.manage",
        name: "Legacy catalog management",
        description: "Legacy compatibility permission for broad catalog maintenance access.",
        domain: "Master",
        group: "Legacy compatibility",
        surface: "both",
        sortOrder: 1000,
        legacy: true
    },
    {
        code: "pos.sell",
        name: "Legacy POS sell",
        description: "Legacy compatibility permission for broad cashier lane access.",
        domain: "POS",
        group: "Legacy compatibility",
        surface: "store",
        sortOrder: 1010,
        legacy: true
    },
    {
        code: "pos.refund",
        name: "Legacy POS refund",
        description: "Legacy compatibility permission for broad return and override access.",
        domain: "POS",
        group: "Legacy compatibility",
        surface: "store",
        sortOrder: 1020,
        legacy: true
    },
    {
        code: "stores.manage",
        name: "Legacy store management",
        description: "Legacy compatibility permission for broad store maintenance access.",
        domain: "Master",
        group: "Legacy compatibility",
        surface: "enterprise",
        sortOrder: 1030,
        legacy: true
    },
    {
        code: "users.manage",
        name: "Legacy user management",
        description: "Legacy compatibility permission for broad user and role administration.",
        domain: "Security",
        group: "Legacy compatibility",
        surface: "enterprise",
        sortOrder: 1040,
        legacy: true
    }
];
export const securityPermissionCatalog = [...catalog].sort((left, right) => left.sortOrder === right.sortOrder
    ? left.code.localeCompare(right.code)
    : left.sortOrder - right.sortOrder);
export const securityPermissionDomains = [
    ...new Set(securityPermissionCatalog.map((permission) => permission.domain))
];
const definitionsByCode = new Map(securityPermissionCatalog.map((permission) => [permission.code, permission]));
const legacyAliases = new Map([
    ["catalog.manage", ["master.department.manage", "master.category.manage", "master.product.manage"]],
    ["stores.manage", ["master.store.manage", "settings.retail-user.manage"]],
    ["users.manage", ["security.user.manage", "security.role.manage", "security.privilege.manage"]],
    [
        "pos.sell",
        ["pos.shift.open", "pos.shift.close", "pos.sale.process", "pos.receipt.search", "pos.customer.attach"]
    ],
    [
        "pos.refund",
        [
            "pos.return.process",
            "pos.exchange.process",
            "pos.override.no-receipt-return",
            "pos.receipt.search",
            "pos.receipt.reprint"
        ]
    ]
]);
export function getSecurityPermissionDefinition(code) {
    return definitionsByCode.get(code) ?? null;
}
export function expandGrantedPermissionCodes(permissionCodes) {
    const expanded = new Set(permissionCodes.filter(Boolean));
    for (const permissionCode of [...expanded]) {
        for (const alias of legacyAliases.get(permissionCode) ?? []) {
            expanded.add(alias);
        }
    }
    return [...expanded].sort((left, right) => left.localeCompare(right));
}
export function groupSecurityPermissions(permissionCodes) {
    const source = permissionCodes && permissionCodes.length > 0
        ? securityPermissionCatalog.filter((permission) => permissionCodes.includes(permission.code))
        : securityPermissionCatalog;
    const grouped = new Map();
    for (const permission of source) {
        const domainGroups = grouped.get(permission.domain) ?? [];
        const existingGroup = domainGroups.find((group) => group.group === permission.group);
        if (existingGroup) {
            existingGroup.permissions.push(permission);
        }
        else {
            domainGroups.push({
                group: permission.group,
                permissions: [permission]
            });
        }
        grouped.set(permission.domain, domainGroups);
    }
    return securityPermissionDomains
        .map((domain) => ({
        domain,
        groups: grouped.get(domain)?.map((entry) => ({
            group: entry.group,
            permissions: [...entry.permissions].sort((left, right) => left.sortOrder === right.sortOrder
                ? left.name.localeCompare(right.name)
                : left.sortOrder - right.sortOrder)
        })) ?? []
    }))
        .filter((entry) => entry.groups.length > 0);
}
export function deriveRetailUserCapabilities(permissionCodes, accountStatus) {
    const expandedPermissions = new Set(expandGrantedPermissionCodes(permissionCodes));
    const isActive = accountStatus === "ACTIVE";
    const has = (...requiredCodes) => requiredCodes.every((requiredCode) => expandedPermissions.has(requiredCode));
    const hasAny = (...candidateCodes) => candidateCodes.some((candidateCode) => expandedPermissions.has(candidateCode));
    const canOpenShift = isActive && has("pos.shift.open");
    const canCloseShift = isActive && has("pos.shift.close");
    const canProcessSale = isActive && has("pos.sale.process");
    const canProcessReturn = isActive && has("pos.return.process");
    const canProcessExchange = isActive && has("pos.exchange.process");
    const canSearchReceipt = isActive && has("pos.receipt.search");
    const canReprintReceipt = isActive && has("pos.receipt.reprint");
    const canAttachCustomer = isActive && has("pos.customer.attach");
    const canCollectAccountPayment = isActive && has("pos.customer.account.collect");
    const canRedeemLoyalty = isActive && has("pos.loyalty.redeem");
    const canApproveNoReceiptReturn = isActive && has("pos.override.no-receipt-return");
    const canApproveDiscountOverride = isActive && has("pos.override.discount");
    const canApprovePriceOverride = isActive && has("pos.override.price");
    return {
        normalizedPermissionCodes: [...expandedPermissions].sort((left, right) => left.localeCompare(right)),
        cashierEligible: canOpenShift && canProcessSale,
        supervisorEligible: canApproveNoReceiptReturn || canApproveDiscountOverride || canApprovePriceOverride,
        canOpenShift,
        canCloseShift,
        canProcessSale,
        canProcessReturn,
        canProcessExchange,
        canSearchReceipt,
        canReprintReceipt,
        canAttachCustomer,
        canCollectAccountPayment,
        canRedeemLoyalty,
        canApproveNoReceiptReturn,
        canApproveDiscountOverride,
        canApprovePriceOverride,
        hasInventoryVisibility: isActive && hasAny("inventory.view"),
        canAdjustInventory: isActive && hasAny("inventory.adjust"),
        canSubmitCount: isActive && hasAny("inventory.count.submit"),
        canCommitCount: isActive && hasAny("inventory.count.commit"),
        canRequestTransfer: isActive && hasAny("inventory.transfer.request"),
        canIssueTransfer: isActive && hasAny("inventory.transfer.issue"),
        canReceiveTransfer: isActive && hasAny("inventory.transfer.receive"),
        canReceiveGoods: isActive && hasAny("inventory.grn.receive"),
        canManageSupplierReturns: isActive && hasAny("inventory.supplier-return.manage"),
        canOperateStoreSync: isActive && hasAny("sync.store.operate")
    };
}
