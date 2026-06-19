

import { prisma } from "@/lib/db/prisma";
import { ensureInterStoreTransferSchemaCompatibility } from "@/server/repositories/schema-compatibility.repository";
import { RecordStatus, SyncNodeType } from "@flash-erp/domain";


export type EnterpriseSearchEntity =
  | "Product"
  | "Receipt"
  | "Purchase order"
  | "Goods receipt"
  | "Transfer"
  | "Customer"
  | "Supplier"
  | "User"
  | "Store"
  | "Inventory location"
  | "Sync node";

export type EnterpriseSearchResult = {
  id: string;
  entity: EnterpriseSearchEntity;
  title: string;
  subtitle: string;
  href: string;
  badge: string | null;
};

export type EnterpriseSearchPayload = {
  query: string;
  results: EnterpriseSearchResult[];
  refreshedAt: string;
};

function contains(query: string) {
  return {
    contains: query
  };
}

function formatEnumLabel(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function joinParts(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" - ");
}

function byEntityAndTitle(left: EnterpriseSearchResult, right: EnterpriseSearchResult) {
  if (left.entity !== right.entity) {
    return left.entity.localeCompare(right.entity);
  }

  return left.title.localeCompare(right.title);
}

export async function getEnterpriseGlobalSearch(
  rawQuery: string | null | undefined
): Promise<EnterpriseSearchPayload> {
  const query = rawQuery?.trim() ?? "";

  if (query.length < 2) {
    return {
      query,
      results: [],
      refreshedAt: new Date().toISOString()
    };
  }

  const enterpriseNode = await prisma.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      retailOrgId: true
    }
  });

  if (!enterpriseNode) {
    return {
      query,
      results: [],
      refreshedAt: new Date().toISOString()
    };
  }

  const match = contains(query);
  const retailOrgId = enterpriseNode.retailOrgId;

  await ensureInterStoreTransferSchemaCompatibility();

  const [
    products,
    transactions,
    purchaseOrders,
    goodsReceipts,
    transfers,
    customers,
    suppliers,
    users,
    stores,
    locations,
    syncNodes
  ] = await Promise.all([
    prisma.product.findMany({
      where: {
        retailOrgId,
        deletedAt: null,
        OR: [
          { code: match },
          { sku: match },
          { name: match },
          { brand: match },
          { department: match },
          { category: match },
          { barcodes: { some: { code: match } } }
        ]
      },
      select: {
        id: true,
        code: true,
        sku: true,
        name: true,
        status: true,
        category: true,
        department: true
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 8
    }),
    prisma.posTransaction.findMany({
      where: {
        retailOrgId,
        deletedAt: null,
        OR: [
          { transactionNo: match },
          { sourceTransactionNo: match },
          { customerNameSnapshot: match },
          { notes: match },
          { customer: { customerNo: match } },
          { customer: { fullName: match } }
        ]
      },
      select: {
        id: true,
        transactionNo: true,
        status: true,
        totalAmount: true,
        completedAt: true,
        store: {
          select: {
            code: true,
            name: true
          }
        },
        terminal: {
          select: {
            code: true
          }
        },
        customerNameSnapshot: true,
        customer: {
          select: {
            customerNo: true,
            fullName: true
          }
        }
      },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      take: 8
    }),
    prisma.purchaseOrder.findMany({
      where: {
        retailOrgId,
        OR: [
          { purchaseOrderNo: match },
          { externalReference: match },
          { note: match },
          { operatorName: match },
          { supplier: { supplierNo: match } },
          { supplier: { name: match } },
          { inventoryLocation: { code: match } },
          { inventoryLocation: { name: match } }
        ]
      },
      select: {
        id: true,
        purchaseOrderNo: true,
        status: true,
        grandTotalAmount: true,
        updatedAt: true,
        supplier: {
          select: {
            supplierNo: true,
            name: true
          }
        },
        inventoryLocation: {
          select: {
            code: true,
            name: true,
            store: {
              select: {
                code: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 8
    }),
    prisma.goodsReceipt.findMany({
      where: {
        retailOrgId,
        OR: [
          { receiptNo: match },
          { externalReference: match },
          { note: match },
          { operatorName: match },
          { sourceNodeCode: match },
          { supplier: { supplierNo: match } },
          { supplier: { name: match } },
          { purchaseOrder: { purchaseOrderNo: match } },
          { inventoryLocation: { code: match } },
          { inventoryLocation: { name: match } }
        ]
      },
      select: {
        id: true,
        receiptNo: true,
        receivedAt: true,
        supplier: {
          select: {
            supplierNo: true,
            name: true
          }
        },
        purchaseOrder: {
          select: {
            purchaseOrderNo: true
          }
        },
        inventoryLocation: {
          select: {
            code: true,
            name: true,
            store: {
              select: {
                code: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: { receivedAt: "desc" },
      take: 8
    }),
    prisma.interStoreTransfer.findMany({
      where: {
        retailOrgId,
        OR: [
          { transferNo: match },
          { transferBatchNo: match },
          { externalReference: match },
          { requestNote: match },
          { issueNote: match },
          { receiptNote: match },
          { product: { code: match } },
          { product: { sku: match } },
          { product: { name: match } },
          { sourceStore: { code: match } },
          { sourceStore: { name: match } },
          { destinationStore: { code: match } },
          { destinationStore: { name: match } },
          { sourceInventoryLocation: { code: match } },
          { destinationInventoryLocation: { code: match } }
        ]
      },
      select: {
        id: true,
        transferNo: true,
        transferBatchNo: true,
        status: true,
        requestedAt: true,
        product: {
          select: {
            code: true,
            name: true
          }
        },
        sourceStore: {
          select: {
            code: true,
            name: true
          }
        },
        destinationStore: {
          select: {
            code: true,
            name: true
          }
        }
      },
      orderBy: { requestedAt: "desc" },
      take: 8
    }),
    prisma.customer.findMany({
      where: {
        retailOrgId,
        deletedAt: null,
        OR: [
          { customerNo: match },
          { fullName: match },
          { phone: match },
          { email: match },
          { city: match }
        ]
      },
      select: {
        id: true,
        customerNo: true,
        fullName: true,
        phone: true,
        email: true,
        status: true,
        store: {
          select: {
            code: true,
            name: true
          }
        }
      },
      orderBy: [{ status: "asc" }, { fullName: "asc" }],
      take: 8
    }),
    prisma.supplier.findMany({
      where: {
        retailOrgId,
        deletedAt: null,
        OR: [
          { supplierNo: match },
          { name: match },
          { contactName: match },
          { phone: match },
          { email: match },
          { city: match }
        ]
      },
      select: {
        id: true,
        supplierNo: true,
        name: true,
        contactName: true,
        phone: true,
        email: true,
        status: true
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 8
    }),
    prisma.retailUser.findMany({
      where: {
        retailOrgId,
        deletedAt: null,
        OR: [{ loginId: match }, { displayName: match }, { email: match }]
      },
      select: {
        id: true,
        loginId: true,
        displayName: true,
        email: true,
        accountStatus: true,
        homeStore: {
          select: {
            code: true,
            name: true
          }
        }
      },
      orderBy: [{ accountStatus: "asc" }, { displayName: "asc" }],
      take: 8
    }),
    prisma.store.findMany({
      where: {
        retailOrgId,
        OR: [
          { code: match },
          { name: match },
          { shortName: match },
          { managerName: match },
          { phone: match },
          { email: match },
          { city: match }
        ]
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        city: true,
        managerName: true
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 8
    }),
    prisma.inventoryLocation.findMany({
      where: {
        retailOrgId,
        OR: [
          { code: match },
          { name: match },
          { store: { code: match } },
          { store: { name: match } },
          { warehouse: { code: match } },
          { warehouse: { name: match } }
        ]
      },
      select: {
        id: true,
        code: true,
        name: true,
        locationType: true,
        status: true,
        store: {
          select: {
            code: true,
            name: true
          }
        },
        warehouse: {
          select: {
            code: true,
            name: true
          }
        }
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 8
    }),
    prisma.syncNode.findMany({
      where: {
        retailOrgId,
        OR: [
          { code: match },
          { name: match },
          { store: { code: match } },
          { store: { name: match } }
        ]
      },
      select: {
        id: true,
        code: true,
        name: true,
        nodeType: true,
        lastReportedHealth: true,
        store: {
          select: {
            code: true,
            name: true
          }
        }
      },
      orderBy: [{ nodeType: "asc" }, { code: "asc" }],
      take: 8
    })
  ]);

  const results: EnterpriseSearchResult[] = [
    ...products.map((product) => ({
      id: product.id,
      entity: "Product" as const,
      title: `${product.code} - ${product.name}`,
      subtitle: joinParts([product.sku, product.department, product.category]) || "Catalog item",
      href: `/catalog/products/${encodeURIComponent(product.code)}`,
      badge: formatEnumLabel(product.status)
    })),
    ...transactions.map((transaction) => ({
      id: transaction.id,
      entity: "Receipt" as const,
      title: transaction.transactionNo,
      subtitle: joinParts([
        transaction.store.name,
        transaction.terminal?.code,
        transaction.customer?.fullName ?? transaction.customerNameSnapshot,
        Number(transaction.totalAmount).toFixed(2)
      ]),
      href: `/pos/transactions/${encodeURIComponent(transaction.transactionNo)}`,
      badge: formatEnumLabel(transaction.status)
    })),
    ...purchaseOrders.map((purchaseOrder) => ({
      id: purchaseOrder.id,
      entity: "Purchase order" as const,
      title: purchaseOrder.purchaseOrderNo,
      subtitle: joinParts([
        purchaseOrder.supplier?.name,
        purchaseOrder.inventoryLocation.store?.name,
        purchaseOrder.inventoryLocation.name,
        Number(purchaseOrder.grandTotalAmount).toFixed(2)
      ]),
      href: `/purchases/purchase-orders?openPo=${encodeURIComponent(purchaseOrder.purchaseOrderNo)}`,
      badge: formatEnumLabel(purchaseOrder.status)
    })),
    ...goodsReceipts.map((receipt) => ({
      id: receipt.id,
      entity: "Goods receipt" as const,
      title: receipt.receiptNo,
      subtitle: joinParts([
        receipt.purchaseOrder?.purchaseOrderNo,
        receipt.supplier?.name,
        receipt.inventoryLocation.store?.name,
        receipt.inventoryLocation.name
      ]),
      href: `/purchases/goods-receipt?openGrn=${encodeURIComponent(receipt.receiptNo)}`,
      badge: "Posted"
    })),
    ...transfers.map((transfer) => ({
      id: transfer.id,
      entity: "Transfer" as const,
      title: transfer.transferNo,
      subtitle: joinParts([
        transfer.transferBatchNo,
        transfer.product.name,
        `${transfer.sourceStore.name} to ${transfer.destinationStore.name}`
      ]),
      href: `/inventory/transfers?openTransfer=${encodeURIComponent(
        transfer.transferBatchNo ?? transfer.transferNo
      )}`,
      badge: formatEnumLabel(transfer.status)
    })),
    ...customers.map((customer) => ({
      id: customer.id,
      entity: "Customer" as const,
      title: `${customer.customerNo} - ${customer.fullName}`,
      subtitle: joinParts([customer.store?.name, customer.phone, customer.email]) || "Customer account",
      href: `/master/customers?openCustomer=${encodeURIComponent(customer.customerNo)}`,
      badge: formatEnumLabel(customer.status)
    })),
    ...suppliers.map((supplier) => ({
      id: supplier.id,
      entity: "Supplier" as const,
      title: `${supplier.supplierNo} - ${supplier.name}`,
      subtitle: joinParts([supplier.contactName, supplier.phone, supplier.email]) || "Supplier master",
      href: `/master/suppliers?openSupplier=${encodeURIComponent(supplier.supplierNo)}`,
      badge: formatEnumLabel(supplier.status)
    })),
    ...users.map((user) => ({
      id: user.id,
      entity: "User" as const,
      title: `${user.loginId} - ${user.displayName}`,
      subtitle: joinParts([user.homeStore?.name, user.email]) || "Enterprise user",
      href: `/security/users?openUser=${encodeURIComponent(user.id)}`,
      badge: formatEnumLabel(user.accountStatus)
    })),
    ...stores.map((store) => ({
      id: store.id,
      entity: "Store" as const,
      title: `${store.code} - ${store.name}`,
      subtitle: joinParts([store.city, store.managerName]) || "Store master",
      href: `/stores/${encodeURIComponent(store.code)}`,
      badge: formatEnumLabel(store.status)
    })),
    ...locations.map((location) => ({
      id: location.id,
      entity: "Inventory location" as const,
      title: `${location.code} - ${location.name}`,
      subtitle:
        joinParts([location.store?.name, location.warehouse?.name, formatEnumLabel(location.locationType)]) ||
        "Inventory location",
      href: `/inventory/locations/${encodeURIComponent(location.code)}`,
      badge: formatEnumLabel(location.status)
    })),
    ...syncNodes.map((node) => ({
      id: node.id,
      entity: "Sync node" as const,
      title: `${node.code} - ${node.name}`,
      subtitle: joinParts([node.store?.name, formatEnumLabel(node.nodeType)]) || "Sync node",
      href: node.store?.code ? `/stores/${encodeURIComponent(node.store.code)}` : "/sync",
      badge: formatEnumLabel(node.lastReportedHealth) ?? "No heartbeat"
    }))
  ];

  return {
    query,
    results: results.sort(byEntityAndTitle).slice(0, 60),
    refreshedAt: new Date().toISOString()
  };
}
