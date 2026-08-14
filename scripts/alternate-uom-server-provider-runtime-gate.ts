import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import "dotenv/config";
import sql from "mssql";
import pg from "pg";

import { MssqlStoreService } from "../apps/store-desktop/src/main/mssql/mssql-store-service.js";
import { PostgresStoreService } from "../apps/store-desktop/src/main/postgres/postgres-store-service.js";

const workspaceRoot = process.cwd();
const hqDatabaseUrl = process.env.DATABASE_URL?.trim();
const loginId = "uom.provider.admin";
const password = "UomProviderAdmin123!";

type SqlServerConnection = {
  server: string;
  database: string;
  user: string;
  password: string;
  encrypt: string;
  trustServerCertificate: string;
};

type UomProviderService = {
  getSyncSnapshot(): Promise<{
    standaloneBootstrapAvailable: boolean;
    storeUsers: unknown[];
  }>;
  bootstrapStandaloneAdmin(input: {
    loginId: string;
    displayName: string;
    password: string;
  }): Promise<unknown>;
  signInOperator(input: { loginId: string; password: string }): Promise<unknown>;
  saveStandaloneSettings(input: {
    layawaySettings: {
      enabled: boolean;
      reserveStockOnDeposit: boolean;
      minimumDepositPercent: number;
      requireFullPaymentBeforeFulfilment: boolean;
      refundPaymentsOnCancellation: boolean;
      cancellationFeeType: "PERCENTAGE";
      cancellationFeeValue: number;
    };
  }): Promise<unknown>;
  saveStandaloneUnitOfMeasure(input: {
    uomCode: string;
    uomName: string;
    decimalPrecision: number;
    allowFractionalSale: boolean;
  }): Promise<unknown>;
  saveStandaloneLocation(input: {
    locationCode: string;
    locationName: string;
    locationType: string;
    useForSalesDefault: boolean;
    useForSalesOrderDefault: boolean;
    useForReceivingDefault: boolean;
  }): Promise<unknown>;
  saveStandaloneProduct(input: {
    productCode: string;
    productName: string;
    unitOfMeasure: string;
    unitPrice: number;
    quantityOnHand: number;
    trackInventory: boolean;
    trackExpiry?: boolean;
    isSerialized?: boolean;
    sellingUnits: Array<{
      unitOfMeasureCode: string;
      unitOfMeasureName: string;
      conversionFactor: number;
      unitPrice: number;
      barcode: string;
      isDefault: boolean;
    }>;
  }): Promise<unknown>;
  saveStandaloneCustomer(input: {
    customerNo: string;
    fullName: string;
  }): Promise<unknown>;
  openShift(input: { cashierCode: string; openingFloatAmount: number }): Promise<unknown>;
  captureScannedSale(input: {
    lookupValue: string;
    quantity: number;
    serialNumbers?: string[];
  }): Promise<unknown>;
  addItemToBasket(input: {
    lookupValue: string;
    quantity: number;
    lineIntent: "SALE";
  }): Promise<unknown>;
  attachCustomerToActiveBasket(input: { customerId: string }): Promise<unknown>;
  createSalesOrderFromActiveBasket(input: {
    orderType?: "SALES_ORDER" | "LAYAWAY";
    layawayExpiresAt?: string | null;
    payments: Array<{
      method: "CASH";
      tenderMethodCode: null;
      tenderMethodName: null;
      amount: number;
      reference: string;
    }>;
  }): Promise<ProviderActionResult>;
  resumeSalesOrder(orderId: string): Promise<unknown>;
  receiveLayawayPayment(input: {
    orderId: string;
    payments: Array<{
      method: "CASH";
      tenderMethodCode: null;
      tenderMethodName: null;
      amount: number;
      reference: string;
    }>;
    operatorName?: string | null;
    note?: string | null;
  }): Promise<ProviderActionResult>;
  releaseLayawayReservation(input: {
    orderId: string;
    reason: string;
    operatorName?: string | null;
  }): Promise<ProviderActionResult>;
  expireLayaway(input: {
    orderId: string;
    reason?: string | null;
    operatorName?: string | null;
  }): Promise<ProviderActionResult>;
  cancelSalesOrder(input: {
    orderId: string;
    operatorName?: string | null;
    note?: string | null;
    refundPayments?: Array<{
      method: "CASH";
      tenderMethodCode: null;
      tenderMethodName: null;
      amount: number;
      reference: string;
    }>;
  }): Promise<ProviderActionResult>;
  issueInterStoreTransfer(input: {
    transferId: string;
    quantity: number;
    operatorName?: string;
    note?: string | null;
  }): Promise<unknown>;
  receiveInterStoreTransfer(input: {
    transferId: string;
    quantity: number;
    operatorName?: string;
    note?: string | null;
  }): Promise<unknown>;
  discardActiveBasket(): Promise<unknown>;
  startReturnFromReceipt(transactionNo: string): Promise<unknown>;
  addReceiptLineToBasket(input: {
    sourceTransactionId: string;
    sourceLineId: string;
    quantity: number;
  }): Promise<unknown>;
  checkoutActiveBasket(input?: {
    payments: Array<{
      method: "CASH";
      tenderMethodCode: null;
      tenderMethodName: null;
      amount: number;
      reference: string;
    }>;
  }): Promise<ProviderActionResult>;
  browseStoreReports(input: {
    scope: "STORE";
    productQuery?: string;
    limit?: number;
  }): Promise<{
    productRows: Array<{
      productCode: string;
      quantity: number;
      sellingUnitOfMeasure: string;
      baseQuantity: number;
      baseUnitOfMeasure: string;
      uomConversionFactor: number;
      grossAmount: number;
      netAmount: number;
    }>;
  }>;
  getPrintableReceiptDocument(transactionNo: string): Promise<{
    lines: Array<{
      productCode: string;
      quantity: number;
      sellingUnitOfMeasure: string;
      baseQuantity: number;
      baseUnitOfMeasure: string;
      uomConversionFactor: number;
    }>;
  }>;
  getPrintableSalesOrderReceiptDocument(orderNo: string): Promise<{
    lines: Array<{
      productCode: string;
      quantity: number;
      sellingUnitOfMeasure: string;
      baseQuantity: number;
      baseUnitOfMeasure: string;
      uomConversionFactor: number;
    }>;
  }>;
  close(): Promise<void>;
};

type ProviderSalesOrderSummary = {
  orderId: string;
  orderNo: string;
  orderType: "SALES_ORDER" | "LAYAWAY";
  status: "OPEN" | "FULFILLED" | "CANCELLED" | "EXPIRED";
  totalAmount: number;
  depositAmount: number;
  paidAmount: number;
  balanceAmount: number;
  minimumDepositAmount: number;
  reservationStatus: "NOT_APPLICABLE" | "ACTIVE" | "RELEASED" | "CONSUMED" | "EXPIRED";
  cancellationFeeAmount: number;
  refundedAmount: number;
};

type ProviderActionResult = {
  salesOrderNo?: string | null;
  snapshot: {
    salesOrders: ProviderSalesOrderSummary[];
  };
};

type ProviderProbe = {
  transactionId: string;
  transactionNo: string;
  lineId: string;
  quantity: number;
  sellingUnitOfMeasure: string;
  baseUnitOfMeasure: string;
  conversionFactor: number;
  baseQuantity: number;
  unitPrice: number;
  lineTotal: number;
  quantityOnHand: number;
};

type ReturnProbe = Omit<
  ProviderProbe,
  "transactionId" | "transactionNo" | "lineId"
>;

type ReturnSummaryProbe = {
  lineCount: number;
  quantity: number;
  baseQuantity: number;
  quantityOnHand: number;
  snapshotsAreConsistent: boolean;
};

type SalesOrderProbe = {
  orderId: string;
  orderNo: string;
  sourceTransactionId: string;
  orderStatus: string;
  transactionStatus: string;
  totalAmount: number;
  depositAmount: number;
  balanceAmount: number;
  quantity: number;
  sellingUnitOfMeasure: string;
  baseUnitOfMeasure: string;
  conversionFactor: number;
  baseQuantity: number;
  unitPrice: number;
  lineTotal: number;
  quantityOnHand: number;
  paidAmount: number;
};

type InventoryControlProbe = {
  expiry: {
    quantity: number;
    sellingUnitOfMeasure: string;
    baseQuantity: number;
    baseUnitOfMeasure: string;
    conversionFactor: number;
    batchAllocations: Array<{ batchId: string; quantity: number }>;
    batchBalances: Array<{ batchId: string; quantityOnHand: number }>;
    quantityOnHand: number;
  };
  serialized: {
    quantity: number;
    sellingUnitOfMeasure: string;
    baseQuantity: number;
    baseUnitOfMeasure: string;
    conversionFactor: number;
    serialNumbers: string[];
    serialStatuses: Array<{ serialNumber: string; status: string }>;
    quantityOnHand: number;
  };
};

type TransferProbe = {
  status: string;
  requestedQuantity: number;
  requestedUnitOfMeasure: string;
  requestedUnitQuantity: number;
  conversionFactor: number;
  baseUnitOfMeasure: string;
  issuedQuantity: number;
  receivedQuantity: number;
  sourceQuantityOnHand: number;
  destinationQuantityOnHand: number;
  productQuantityOnHand: number;
};

function requireActionOrder(
  result: ProviderActionResult,
  matcher: { orderId?: string; orderNo?: string },
) {
  const order = result.snapshot.salesOrders.find((candidate) =>
    matcher.orderId
      ? candidate.orderId === matcher.orderId
      : candidate.orderNo === matcher.orderNo,
  );
  assert.ok(
    order,
    `Provider snapshot did not contain sales order ${matcher.orderId ?? matcher.orderNo}.`,
  );
  return order;
}

function createSellingUnitReplayEvent(targetNodeCode: string) {
  const occurredAt = new Date().toISOString();
  return {
    eventId: `uom-replay-${randomUUID()}`,
    idempotencyKey: `uom-replay-${randomUUID()}`,
    aggregateType: "product" as const,
    aggregateId: "uom-replay-product",
    eventType: "catalog.product.published",
    originatingNodeCode: "enterprise-primary",
    targetNodeCode,
    recordVersion: 1,
    occurredAt,
    payload: {
      storeCode: "accra-central",
      productCode: "UOM-REPLAY-PRODUCT",
      productName: "UOM Replay Product",
      productType: "STOCK",
      unitOfMeasure: "EA",
      baseUnitOfMeasure: "EA",
      unitPrice: 4,
      quantityOnHand: 48,
      trackInventory: true,
      sellingUnits: [{
        productVariantCode: null,
        uomCode: "CTN",
        uomName: "Carton",
        conversionFactor: 24,
        unitPrice: 72,
        barcode: "UOM-REPLAY-CTN-24",
        isDefault: true,
        allowFractionalSale: false,
        decimalPrecision: 0,
      }],
      publishedAt: occurredAt,
    },
  };
}

function parseSqlServerUrl(value: string): SqlServerConnection {
  const trimmed = value.trim().replace(/^"|"$/g, "");
  const body = trimmed.replace(/^sqlserver:\/\//i, "");
  const [server, ...parts] = body.split(";");
  const values = new Map<string, string>();

  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator > 0) {
      values.set(part.slice(0, separator).trim().toLowerCase(), part.slice(separator + 1));
    }
  }

  return {
    server,
    database: values.get("database") ?? values.get("initial catalog") ?? "",
    user: values.get("user") ?? values.get("user id") ?? values.get("uid") ?? "",
    password: values.get("password") ?? values.get("pwd") ?? "",
    encrypt: values.get("encrypt") ?? "false",
    trustServerCertificate:
      values.get("trustservercertificate") ??
      values.get("trust server certificate") ??
      "true"
  };
}

function sqlServerConnectionString(input: SqlServerConnection) {
  return [
    `Server=${input.server}`,
    `Database=${input.database}`,
    input.user ? `User Id=${input.user}` : "",
    input.password ? `Password=${input.password}` : "",
    `Encrypt=${input.encrypt}`,
    `TrustServerCertificate=${input.trustServerCertificate}`
  ]
    .filter(Boolean)
    .join(";");
}

function quoteSqlServerDatabase(databaseName: string) {
  assert.match(databaseName, /^flash_erp_uom_gate_[a-f0-9]+$/);
  return `[${databaseName.replace(/]/g, "]]" )}]`;
}

async function withSqlServerPool<T>(
  connectionString: string,
  work: (pool: sql.ConnectionPool) => Promise<T>
) {
  const pool = await new sql.ConnectionPool(connectionString).connect();
  try {
    return await work(pool);
  } finally {
    await pool.close();
  }
}

async function exerciseProvider(
  providerName: string,
  service: UomProviderService,
  readSale: () => Promise<ProviderProbe>,
  readReturn: (sourceLineId: string) => Promise<ReturnProbe>,
  readReturnSummary: (sourceLineId: string) => Promise<ReturnSummaryProbe>,
  readOpenSalesOrder: () => Promise<SalesOrderProbe>,
  readFulfilledSalesOrder: (orderId: string) => Promise<SalesOrderProbe>,
  readCancelledSalesOrder: (orderId: string) => Promise<SalesOrderProbe>,
  seedInventoryControls: () => Promise<void>,
  readInventoryControls: () => Promise<InventoryControlProbe>,
  seedTransfer: () => Promise<void>,
  projectTransferToDestination: () => Promise<void>,
  readTransfer: () => Promise<TransferProbe>,
) {
  const initialSnapshot = await service.getSyncSnapshot();
  assert.equal(initialSnapshot.storeUsers.length, 0);
  assert.equal(
    initialSnapshot.standaloneBootstrapAvailable,
    true,
    `${providerName} did not expose first-administrator setup for a fresh standalone database.`,
  );
  await service.bootstrapStandaloneAdmin({
    loginId,
    displayName: `${providerName} UOM Gate Admin`,
    password
  });
  await service.signInOperator({ loginId, password });
  await service.saveStandaloneSettings({
    layawaySettings: {
      enabled: true,
      reserveStockOnDeposit: true,
      minimumDepositPercent: 20,
      requireFullPaymentBeforeFulfilment: true,
      refundPaymentsOnCancellation: true,
      cancellationFeeType: "PERCENTAGE",
      cancellationFeeValue: 10,
    },
  });
  await service.saveStandaloneUnitOfMeasure({
    uomCode: "CTN",
    uomName: "Carton",
    decimalPrecision: 0,
    allowFractionalSale: false
  });
  await service.saveStandaloneUnitOfMeasure({
    uomCode: "PK",
    uomName: "Pack",
    decimalPrecision: 0,
    allowFractionalSale: false
  });
  await service.saveStandaloneUnitOfMeasure({
    uomCode: "PAIR",
    uomName: "Pair",
    decimalPrecision: 0,
    allowFractionalSale: false
  });
  await service.saveStandaloneLocation({
    locationCode: "SHOP-FLOOR",
    locationName: "Shop Floor",
    locationType: "STORE",
    useForSalesDefault: true,
    useForSalesOrderDefault: true,
    useForReceivingDefault: true
  });
  await service.saveStandaloneLocation({
    locationCode: "WAREHOUSE",
    locationName: "Warehouse",
    locationType: "WAREHOUSE",
    useForSalesDefault: false,
    useForSalesOrderDefault: false,
    useForReceivingDefault: false,
  });
  await service.saveStandaloneProduct({
    productCode: "UOM-GATE-COLA",
    productName: "UOM Gate Cola",
    unitOfMeasure: "EA",
    unitPrice: 3,
    quantityOnHand: 100,
    trackInventory: true,
    sellingUnits: [{
      unitOfMeasureCode: "CTN",
      unitOfMeasureName: "Carton",
      conversionFactor: 24,
      unitPrice: 60,
      barcode: "UOM-GATE-CTN-24",
      isDefault: true
    }]
  });
  await service.saveStandaloneProduct({
    productCode: "UOM-GATE-WIPES",
    productName: "UOM Gate Wipes",
    unitOfMeasure: "EA",
    unitPrice: 2,
    quantityOnHand: 30,
    trackInventory: true,
    trackExpiry: true,
    sellingUnits: [{
      unitOfMeasureCode: "PK",
      unitOfMeasureName: "Pack",
      conversionFactor: 10,
      unitPrice: 18,
      barcode: "UOM-GATE-WIPES-PK-10",
      isDefault: true
    }]
  });
  await service.saveStandaloneProduct({
    productCode: "UOM-GATE-PHONES",
    productName: "UOM Gate Phones",
    unitOfMeasure: "EA",
    unitPrice: 100,
    quantityOnHand: 2,
    trackInventory: true,
    isSerialized: true,
    sellingUnits: [{
      unitOfMeasureCode: "PAIR",
      unitOfMeasureName: "Pair",
      conversionFactor: 2,
      unitPrice: 190,
      barcode: "UOM-GATE-PHONES-PAIR-2",
      isDefault: true
    }]
  });
  await service.saveStandaloneProduct({
    productCode: "UOM-GATE-LAYAWAY",
    productName: "UOM Gate Layaway Item",
    unitOfMeasure: "EA",
    unitPrice: 25,
    quantityOnHand: 20,
    trackInventory: true,
    sellingUnits: [{
      unitOfMeasureCode: "PAIR",
      unitOfMeasureName: "Pair",
      conversionFactor: 2,
      unitPrice: 50,
      barcode: "UOM-GATE-LAYAWAY-PAIR-2",
      isDefault: true,
    }],
  });
  await seedInventoryControls();
  await service.saveStandaloneCustomer({
    customerNo: "UOM-GATE-CUSTOMER",
    fullName: "UOM Provider Gate Customer"
  });
  await service.openShift({ cashierCode: loginId, openingFloatAmount: 0 });
  await service.captureScannedSale({ lookupValue: "UOM-GATE-CTN-24", quantity: 2 });

  const sale = await readSale();
  assert.equal(sale.quantity, 2);
  assert.equal(sale.sellingUnitOfMeasure, "CTN");
  assert.equal(sale.baseUnitOfMeasure, "EA");
  assert.equal(sale.conversionFactor, 24);
  assert.equal(sale.baseQuantity, 48);
  assert.equal(sale.unitPrice, 60);
  assert.equal(sale.lineTotal, 120);
  assert.equal(sale.quantityOnHand, 52);

  await service.startReturnFromReceipt(sale.transactionNo);
  await service.addReceiptLineToBasket({
    sourceTransactionId: sale.transactionId,
    sourceLineId: sale.lineId,
    quantity: 1
  });
  await service.checkoutActiveBasket();

  const returned = await readReturn(sale.lineId);
  assert.equal(returned.quantity, 1);
  assert.equal(returned.sellingUnitOfMeasure, "CTN");
  assert.equal(returned.baseUnitOfMeasure, "EA");
  assert.equal(returned.conversionFactor, 24);
  assert.equal(returned.baseQuantity, 24);
  assert.equal(returned.unitPrice, 60);
  assert.equal(returned.lineTotal, 60);
  assert.equal(returned.quantityOnHand, 76);

  await service.addItemToBasket({
    lookupValue: "UOM-GATE-CTN-24",
    quantity: 1,
    lineIntent: "SALE"
  });
  await service.attachCustomerToActiveBasket({
    customerId: "standalone-customer-uom-gate-customer"
  });
  await service.createSalesOrderFromActiveBasket({
    payments: [{
      method: "CASH",
      tenderMethodCode: null,
      tenderMethodName: null,
      amount: 20,
      reference: "UOM-GATE-DEPOSIT"
    }]
  });

  const openOrder = await readOpenSalesOrder();
  assert.equal(openOrder.orderStatus, "OPEN");
  assert.equal(openOrder.transactionStatus, "PARKED");
  assert.equal(openOrder.totalAmount, 60);
  assert.equal(openOrder.depositAmount, 20);
  assert.equal(openOrder.balanceAmount, 40);
  assert.equal(openOrder.quantity, 1);
  assert.equal(openOrder.sellingUnitOfMeasure, "CTN");
  assert.equal(openOrder.baseUnitOfMeasure, "EA");
  assert.equal(openOrder.conversionFactor, 24);
  assert.equal(openOrder.baseQuantity, 24);
  assert.equal(openOrder.unitPrice, 60);
  assert.equal(openOrder.lineTotal, 60);
  assert.equal(openOrder.quantityOnHand, 76);
  assert.equal(openOrder.paidAmount, 20);

  await service.resumeSalesOrder(openOrder.orderId);
  await service.discardActiveBasket();
  const recoveredOrder = await readOpenSalesOrder();
  assert.equal(recoveredOrder.orderId, openOrder.orderId);
  assert.equal(recoveredOrder.orderStatus, "OPEN");
  assert.equal(recoveredOrder.transactionStatus, "PARKED");
  assert.equal(recoveredOrder.quantity, 1);
  assert.equal(recoveredOrder.sellingUnitOfMeasure, "CTN");
  assert.equal(recoveredOrder.baseQuantity, 24);
  assert.equal(recoveredOrder.baseUnitOfMeasure, "EA");
  assert.equal(recoveredOrder.conversionFactor, 24);
  assert.equal(recoveredOrder.quantityOnHand, 76);
  assert.equal(recoveredOrder.paidAmount, 20);
  await service.resumeSalesOrder(openOrder.orderId);
  await service.checkoutActiveBasket({
    payments: [{
      method: "CASH",
      tenderMethodCode: null,
      tenderMethodName: null,
      amount: 40,
      reference: "UOM-GATE-BALANCE"
    }]
  });

  const fulfilledOrder = await readFulfilledSalesOrder(openOrder.orderId);
  assert.equal(fulfilledOrder.orderStatus, "FULFILLED");
  assert.equal(fulfilledOrder.transactionStatus, "COMPLETED");
  assert.equal(fulfilledOrder.totalAmount, 60);
  assert.equal(fulfilledOrder.depositAmount, 20);
  assert.equal(fulfilledOrder.balanceAmount, 0);
  assert.equal(fulfilledOrder.quantity, 1);
  assert.equal(fulfilledOrder.sellingUnitOfMeasure, "CTN");
  assert.equal(fulfilledOrder.baseUnitOfMeasure, "EA");
  assert.equal(fulfilledOrder.conversionFactor, 24);
  assert.equal(fulfilledOrder.baseQuantity, 24);
  assert.equal(fulfilledOrder.unitPrice, 60);
  assert.equal(fulfilledOrder.lineTotal, 60);
  assert.equal(fulfilledOrder.quantityOnHand, 52);
  assert.equal(fulfilledOrder.paidAmount, 60);

  await service.addItemToBasket({
    lookupValue: "UOM-GATE-CTN-24",
    quantity: 1,
    lineIntent: "SALE",
  });
  await service.attachCustomerToActiveBasket({
    customerId: "standalone-customer-uom-gate-customer",
  });
  await service.createSalesOrderFromActiveBasket({ payments: [] });
  const cancellableOrder = await readOpenSalesOrder();
  await service.cancelSalesOrder({
    orderId: cancellableOrder.orderId,
    operatorName: `${providerName} UOM Gate Admin`,
    note: "Alternate-UOM cancellation acceptance",
  });
  const cancelledOrder = await readCancelledSalesOrder(cancellableOrder.orderId);
  assert.equal(cancelledOrder.orderStatus, "CANCELLED");
  assert.equal(cancelledOrder.transactionStatus, "CANCELLED");
  assert.equal(cancelledOrder.quantity, 1);
  assert.equal(cancelledOrder.sellingUnitOfMeasure, "CTN");
  assert.equal(cancelledOrder.baseUnitOfMeasure, "EA");
  assert.equal(cancelledOrder.conversionFactor, 24);
  assert.equal(cancelledOrder.baseQuantity, 24);
  assert.equal(cancelledOrder.unitPrice, 60);
  assert.equal(cancelledOrder.lineTotal, 60);
  assert.equal(cancelledOrder.quantityOnHand, 52);
  assert.equal(cancelledOrder.paidAmount, 0);

  await service.addItemToBasket({
    lookupValue: "UOM-GATE-LAYAWAY-PAIR-2",
    quantity: 1,
    lineIntent: "SALE",
  });
  await service.attachCustomerToActiveBasket({
    customerId: "standalone-customer-uom-gate-customer",
  });
  await assert.rejects(
    () => service.createSalesOrderFromActiveBasket({
      orderType: "LAYAWAY",
      payments: [{
        method: "CASH",
        tenderMethodCode: null,
        tenderMethodName: null,
        amount: 9,
        reference: "LAYAWAY-BELOW-MINIMUM",
      }],
    }),
    /minimum opening payment of 10\.00/i,
  );

  const openedLayawayResult = await service.createSalesOrderFromActiveBasket({
    orderType: "LAYAWAY",
    layawayExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    payments: [{
      method: "CASH",
      tenderMethodCode: null,
      tenderMethodName: null,
      amount: 10,
      reference: "LAYAWAY-OPENING-DEPOSIT",
    }],
  });
  const openedLayaway = requireActionOrder(openedLayawayResult, {
    orderNo: openedLayawayResult.salesOrderNo ?? undefined,
  });
  assert.equal(openedLayaway.orderType, "LAYAWAY");
  assert.equal(openedLayaway.status, "OPEN");
  assert.equal(openedLayaway.totalAmount, 50);
  assert.equal(openedLayaway.depositAmount, 10);
  assert.equal(openedLayaway.paidAmount, 10);
  assert.equal(openedLayaway.balanceAmount, 40);
  assert.equal(openedLayaway.minimumDepositAmount, 10);
  assert.equal(openedLayaway.reservationStatus, "ACTIVE");

  const installmentResult = await service.receiveLayawayPayment({
    orderId: openedLayaway.orderId,
    payments: [{
      method: "CASH",
      tenderMethodCode: null,
      tenderMethodName: null,
      amount: 15,
      reference: "LAYAWAY-INSTALLMENT-1",
    }],
  });
  const installmentLayaway = requireActionOrder(installmentResult, {
    orderId: openedLayaway.orderId,
  });
  assert.equal(installmentLayaway.paidAmount, 25);
  assert.equal(installmentLayaway.balanceAmount, 25);
  assert.equal(installmentLayaway.reservationStatus, "ACTIVE");
  await assert.rejects(
    () => service.resumeSalesOrder(openedLayaway.orderId),
    /paid in full before fulfilment/i,
  );

  const finalPaymentResult = await service.receiveLayawayPayment({
    orderId: openedLayaway.orderId,
    payments: [{
      method: "CASH",
      tenderMethodCode: null,
      tenderMethodName: null,
      amount: 25,
      reference: "LAYAWAY-FINAL-INSTALLMENT",
    }],
  });
  const paidLayaway = requireActionOrder(finalPaymentResult, {
    orderId: openedLayaway.orderId,
  });
  assert.equal(paidLayaway.paidAmount, 50);
  assert.equal(paidLayaway.balanceAmount, 0);
  await service.resumeSalesOrder(openedLayaway.orderId);
  const fulfilledLayawayResult = await service.checkoutActiveBasket({ payments: [] });
  const fulfilledLayaway = requireActionOrder(fulfilledLayawayResult, {
    orderId: openedLayaway.orderId,
  });
  assert.equal(fulfilledLayaway.status, "FULFILLED");
  assert.equal(fulfilledLayaway.balanceAmount, 0);
  assert.equal(fulfilledLayaway.reservationStatus, "CONSUMED");

  await service.addItemToBasket({
    lookupValue: "UOM-GATE-LAYAWAY-PAIR-2",
    quantity: 1,
    lineIntent: "SALE",
  });
  await service.attachCustomerToActiveBasket({
    customerId: "standalone-customer-uom-gate-customer",
  });
  const cancellableLayawayResult = await service.createSalesOrderFromActiveBasket({
    orderType: "LAYAWAY",
    payments: [{
      method: "CASH",
      tenderMethodCode: null,
      tenderMethodName: null,
      amount: 10,
      reference: "LAYAWAY-CANCEL-DEPOSIT",
    }],
  });
  const cancellableLayaway = requireActionOrder(cancellableLayawayResult, {
    orderNo: cancellableLayawayResult.salesOrderNo ?? undefined,
  });
  const cancelledLayawayResult = await service.cancelSalesOrder({
    orderId: cancellableLayaway.orderId,
    note: "Layaway cancellation provider acceptance",
    refundPayments: [{
      method: "CASH",
      tenderMethodCode: null,
      tenderMethodName: null,
      amount: 9,
      reference: "LAYAWAY-CANCEL-REFUND",
    }],
  });
  const cancelledLayaway = requireActionOrder(cancelledLayawayResult, {
    orderId: cancellableLayaway.orderId,
  });
  assert.equal(cancelledLayaway.status, "CANCELLED");
  assert.equal(cancelledLayaway.reservationStatus, "RELEASED");
  assert.equal(cancelledLayaway.cancellationFeeAmount, 1);
  assert.equal(cancelledLayaway.refundedAmount, 9);

  await service.addItemToBasket({
    lookupValue: "UOM-GATE-LAYAWAY-PAIR-2",
    quantity: 1,
    lineIntent: "SALE",
  });
  await service.attachCustomerToActiveBasket({
    customerId: "standalone-customer-uom-gate-customer",
  });
  const releasableLayawayResult = await service.createSalesOrderFromActiveBasket({
    orderType: "LAYAWAY",
    payments: [{
      method: "CASH",
      tenderMethodCode: null,
      tenderMethodName: null,
      amount: 10,
      reference: "LAYAWAY-RELEASE-DEPOSIT",
    }],
  });
  const releasableLayaway = requireActionOrder(releasableLayawayResult, {
    orderNo: releasableLayawayResult.salesOrderNo ?? undefined,
  });
  const releasedLayawayResult = await service.releaseLayawayReservation({
    orderId: releasableLayaway.orderId,
    reason: "Provider acceptance release",
  });
  const releasedLayaway = requireActionOrder(releasedLayawayResult, {
    orderId: releasableLayaway.orderId,
  });
  assert.equal(releasedLayaway.status, "OPEN");
  assert.equal(releasedLayaway.reservationStatus, "RELEASED");
  await service.cancelSalesOrder({
    orderId: releasableLayaway.orderId,
    note: "Provider acceptance cleanup",
    refundPayments: [{
      method: "CASH",
      tenderMethodCode: null,
      tenderMethodName: null,
      amount: 9,
      reference: "LAYAWAY-RELEASE-REFUND",
    }],
  });

  const productReport = await service.browseStoreReports({
    scope: "STORE",
    productQuery: "UOM-GATE-COLA",
    limit: 100,
  });
  const cartonReportRow = productReport.productRows.find(
    (row) =>
      row.productCode === "UOM-GATE-COLA" &&
      row.sellingUnitOfMeasure === "CTN",
  );
  assert.ok(
    cartonReportRow,
    `${providerName} product report did not retain the carton UOM.`,
  );
  assert.equal(cartonReportRow.quantity, 2);
  assert.equal(cartonReportRow.baseQuantity, 48);
  assert.equal(cartonReportRow.baseUnitOfMeasure, "EA");
  assert.equal(cartonReportRow.uomConversionFactor, 24);
  assert.equal(cartonReportRow.grossAmount, 120);
  assert.equal(cartonReportRow.netAmount, 120);

  const saleReceipt = await service.getPrintableReceiptDocument(
    sale.transactionNo,
  );
  const saleReceiptLine = saleReceipt.lines.find(
    (line) => line.productCode === "UOM-GATE-COLA",
  );
  assert.ok(
    saleReceiptLine,
    `${providerName} receipt did not retain the carton sale line.`,
  );
  assert.equal(saleReceiptLine.quantity, 2);
  assert.equal(saleReceiptLine.sellingUnitOfMeasure, "CTN");
  assert.equal(saleReceiptLine.baseQuantity, 48);
  assert.equal(saleReceiptLine.baseUnitOfMeasure, "EA");
  assert.equal(saleReceiptLine.uomConversionFactor, 24);

  const salesOrderReceipt = await service.getPrintableSalesOrderReceiptDocument(
    openOrder.orderNo,
  );
  const salesOrderReceiptLine = salesOrderReceipt.lines.find(
    (line) => line.productCode === "UOM-GATE-COLA",
  );
  assert.ok(
    salesOrderReceiptLine,
    `${providerName} sales-order reprint did not retain the carton line.`,
  );
  assert.equal(salesOrderReceiptLine.quantity, 1);
  assert.equal(salesOrderReceiptLine.sellingUnitOfMeasure, "CTN");
  assert.equal(salesOrderReceiptLine.baseQuantity, 24);
  assert.equal(salesOrderReceiptLine.baseUnitOfMeasure, "EA");
  assert.equal(salesOrderReceiptLine.uomConversionFactor, 24);

  const cancelledOrderReceipt = await service.getPrintableSalesOrderReceiptDocument(
    cancellableOrder.orderNo,
  );
  const cancelledOrderReceiptLine = cancelledOrderReceipt.lines.find(
    (line) => line.productCode === "UOM-GATE-COLA",
  );
  assert.ok(
    cancelledOrderReceiptLine,
    `${providerName} cancelled sales-order reprint did not retain the carton line.`,
  );
  assert.equal(cancelledOrderReceiptLine.quantity, 1);
  assert.equal(cancelledOrderReceiptLine.sellingUnitOfMeasure, "CTN");
  assert.equal(cancelledOrderReceiptLine.baseQuantity, 24);
  assert.equal(cancelledOrderReceiptLine.baseUnitOfMeasure, "EA");
  assert.equal(cancelledOrderReceiptLine.uomConversionFactor, 24);

  await service.startReturnFromReceipt(sale.transactionNo);
  await service.addReceiptLineToBasket({
    sourceTransactionId: sale.transactionId,
    sourceLineId: sale.lineId,
    quantity: 1,
  });
  await service.checkoutActiveBasket();

  const reversal = await readReturnSummary(sale.lineId);
  assert.equal(reversal.lineCount, 2);
  assert.equal(reversal.quantity, 2);
  assert.equal(reversal.baseQuantity, 48);
  assert.equal(reversal.quantityOnHand, 76);
  assert.equal(reversal.snapshotsAreConsistent, true);
  await assert.rejects(async () => {
    await service.startReturnFromReceipt(sale.transactionNo);
    await service.addReceiptLineToBasket({
      sourceTransactionId: sale.transactionId,
      sourceLineId: sale.lineId,
      quantity: 1,
    });
  });
  try {
    await service.discardActiveBasket();
  } catch {
    // The fully returned receipt is rejected before a basket is created.
  }

  const reversedProductReport = await service.browseStoreReports({
    scope: "STORE",
    productQuery: "UOM-GATE-COLA",
    limit: 100,
  });
  const reversedCartonReportRow = reversedProductReport.productRows.find(
    (row) =>
      row.productCode === "UOM-GATE-COLA" &&
      row.sellingUnitOfMeasure === "CTN",
  );
  assert.ok(
    reversedCartonReportRow,
    `${providerName} product report lost the carton UOM after reversal.`,
  );
  assert.equal(reversedCartonReportRow.quantity, 1);
  assert.equal(reversedCartonReportRow.baseQuantity, 24);
  assert.equal(reversedCartonReportRow.netAmount, 60);

  await seedTransfer();
  await service.issueInterStoreTransfer({
    transferId: "uom-gate-transfer",
    quantity: 24,
    operatorName: `${providerName} UOM Gate Admin`,
  });
  await projectTransferToDestination();
  await service.receiveInterStoreTransfer({
    transferId: "uom-gate-transfer",
    quantity: 24,
    operatorName: `${providerName} UOM Gate Admin`,
  });
  const transfer = await readTransfer();
  assert.equal(transfer.status, "RECEIVED");
  assert.equal(transfer.requestedQuantity, 24);
  assert.equal(transfer.requestedUnitOfMeasure, "CTN");
  assert.equal(transfer.requestedUnitQuantity, 1);
  assert.equal(transfer.conversionFactor, 24);
  assert.equal(transfer.baseUnitOfMeasure, "EA");
  assert.equal(transfer.issuedQuantity, 24);
  assert.equal(transfer.receivedQuantity, 24);
  assert.equal(transfer.sourceQuantityOnHand, 52);
  assert.equal(transfer.destinationQuantityOnHand, 24);
  assert.equal(transfer.productQuantityOnHand, 76);

  await service.captureScannedSale({
    lookupValue: "UOM-GATE-WIPES-PK-10",
    quantity: 1,
  });
  await service.captureScannedSale({
    lookupValue: "UOM-GATE-PHONES-PAIR-2",
    quantity: 1,
    serialNumbers: ["UOM-PHONE-0001", "UOM-PHONE-0002"],
  });
  const inventoryControls = await readInventoryControls();
  assert.equal(inventoryControls.expiry.quantity, 1);
  assert.equal(inventoryControls.expiry.sellingUnitOfMeasure, "PK");
  assert.equal(inventoryControls.expiry.baseQuantity, 10);
  assert.equal(inventoryControls.expiry.baseUnitOfMeasure, "EA");
  assert.equal(inventoryControls.expiry.conversionFactor, 10);
  assert.deepEqual(inventoryControls.expiry.batchAllocations, [
    { batchId: "uom-gate-batch-first", quantity: 6 },
    { batchId: "uom-gate-batch-later", quantity: 4 },
  ]);
  assert.deepEqual(inventoryControls.expiry.batchBalances, [
    { batchId: "uom-gate-batch-first", quantityOnHand: 0 },
    { batchId: "uom-gate-batch-later", quantityOnHand: 20 },
  ]);
  assert.equal(inventoryControls.expiry.quantityOnHand, 20);
  assert.equal(inventoryControls.serialized.quantity, 1);
  assert.equal(inventoryControls.serialized.sellingUnitOfMeasure, "PAIR");
  assert.equal(inventoryControls.serialized.baseQuantity, 2);
  assert.equal(inventoryControls.serialized.baseUnitOfMeasure, "EA");
  assert.equal(inventoryControls.serialized.conversionFactor, 2);
  assert.deepEqual(inventoryControls.serialized.serialNumbers, [
    "UOM-PHONE-0001",
    "UOM-PHONE-0002",
  ]);
  assert.deepEqual(inventoryControls.serialized.serialStatuses, [
    { serialNumber: "UOM-PHONE-0001", status: "SOLD" },
    { serialNumber: "UOM-PHONE-0002", status: "SOLD" },
  ]);
  assert.equal(inventoryControls.serialized.quantityOnHand, 0);

  await service.saveStandaloneProduct({
    productCode: "UOM-GATE-COLA",
    productName: "UOM Gate Cola",
    unitOfMeasure: "EA",
    unitPrice: 9,
    quantityOnHand: 76,
    trackInventory: true,
    sellingUnits: [{
      unitOfMeasureCode: "CTN",
      unitOfMeasureName: "Carton",
      conversionFactor: 12,
      unitPrice: 999,
      barcode: "UOM-GATE-CTN-12-UPDATED",
      isDefault: true,
    }],
  });
  const historicalReceipt = await service.getPrintableReceiptDocument(
    sale.transactionNo,
  );
  const historicalReceiptLine = historicalReceipt.lines.find(
    (line) => line.productCode === "UOM-GATE-COLA",
  );
  assert.ok(historicalReceiptLine);
  assert.equal(historicalReceiptLine.uomConversionFactor, 24);
  assert.equal(historicalReceiptLine.baseQuantity, 48);
  const historicalReport = await service.browseStoreReports({
    scope: "STORE",
    productQuery: "UOM-GATE-COLA",
    limit: 100,
  });
  const historicalReportRow = historicalReport.productRows.find(
    (row) =>
      row.productCode === "UOM-GATE-COLA" &&
      row.sellingUnitOfMeasure === "CTN",
  );
  assert.ok(historicalReportRow);
  assert.equal(historicalReportRow.uomConversionFactor, 24);
  assert.equal(historicalReportRow.baseQuantity, 24);
  assert.equal(historicalReportRow.netAmount, 60);

  console.log(
    `${providerName} alternate-UOM runtime passed: sale, reversal, partial-deposit fulfilment, cancellation/recovery, report/reprint, carton transfer, FEFO batch allocation, and serial movement reconciled in base units.`
  );
}

async function runSqlServerGate() {
  assert.ok(hqDatabaseUrl, "DATABASE_URL is required for the disposable SQL Server provider gate.");
  const source = parseSqlServerUrl(hqDatabaseUrl);
  const databaseName = `flash_erp_uom_gate_${randomUUID().replace(/-/g, "")}`;
  const masterConnection = sqlServerConnectionString({ ...source, database: "master" });
  const storeConnection = sqlServerConnectionString({ ...source, database: databaseName });
  const quotedDatabase = quoteSqlServerDatabase(databaseName);
  let service: MssqlStoreService | null = null;

  try {
    await withSqlServerPool(masterConnection, async (pool) => {
      await pool.request().query(`CREATE DATABASE ${quotedDatabase}`);
    });
    await withSqlServerPool(storeConnection, async (pool) => {
      await pool.request().batch(
        readFileSync(
          path.join(workspaceRoot, "apps/store-desktop/src/main/mssql/store-mssql-schema.sql"),
          "utf8"
        )
      );
    });
    service = await MssqlStoreService.create({
      connectionString: storeConnection,
      deploymentMode: "STANDALONE",
      nodeCode: "uom-mssql-gate",
      terminalCode: "UOM-MSSQL-01",
      connectionTimeoutMs: 8000
    });
    const pool = (service as unknown as { pool: sql.ConnectionPool }).pool;
    const sqlServerReplay = service as unknown as {
      applyDownstreamBatch(
        events: Array<ReturnType<typeof createSellingUnitReplayEvent>>,
        remoteNodeCode: string,
        cursor: string | null,
      ): Promise<string[]>;
    };
    const replayEvent = createSellingUnitReplayEvent("uom-mssql-gate");
    assert.deepEqual(
      await sqlServerReplay.applyDownstreamBatch(
        [replayEvent],
        "enterprise-primary",
        replayEvent.eventId,
      ),
      [replayEvent.eventId],
    );
    assert.deepEqual(
      await sqlServerReplay.applyDownstreamBatch(
        [replayEvent],
        "enterprise-primary",
        replayEvent.eventId,
      ),
      [replayEvent.eventId],
    );
    const replayResult = await pool.request()
      .input("eventId", replayEvent.eventId)
      .query<{
        inbox_count: number;
        product_count: number;
        barcode_count: number;
        selling_units_json: string;
      }>(`
        SELECT
          (SELECT COUNT(*) FROM [dbo].[sync_inbox] WHERE [id] = @eventId AND [status] = N'APPLIED') AS [inbox_count],
          (SELECT COUNT(*) FROM [dbo].[product_snapshot] WHERE [product_code] = N'UOM-REPLAY-PRODUCT') AS [product_count],
          (SELECT COUNT(*) FROM [dbo].[barcode_snapshot] WHERE [barcode_code] = N'UOM-REPLAY-CTN-24') AS [barcode_count],
          (SELECT TOP (1) [selling_units_json] FROM [dbo].[product_snapshot] WHERE [product_code] = N'UOM-REPLAY-PRODUCT') AS [selling_units_json]
      `);
    const replayRow = replayResult.recordset[0];
    assert.equal(Number(replayRow?.inbox_count), 1);
    assert.equal(Number(replayRow?.product_count), 1);
    assert.equal(Number(replayRow?.barcode_count), 1);
    assert.equal(JSON.parse(replayRow?.selling_units_json ?? "[]").length, 1);
    const readSalesOrder = async (
      orderStatus: "OPEN" | "FULFILLED" | "CANCELLED",
      orderId?: string,
    ): Promise<SalesOrderProbe> => {
      const request = pool.request().input("orderStatus", orderStatus);
      if (orderId) request.input("orderId", orderId);
      const result = await request.query<{
        order_id: string;
        order_no: string;
        source_transaction_id: string;
        order_status: string;
        transaction_status: string;
        total_amount: number;
        deposit_amount: number;
        balance_amount: number;
        quantity: number;
        selling_unit_of_measure: string;
        base_unit_of_measure: string;
        uom_conversion_factor: number;
        base_quantity: number;
        unit_price: number;
        line_total: number;
        quantity_on_hand: number;
        paid_amount: number;
      }>(`
        SELECT TOP (1)
          sales_order.[id] AS [order_id], sales_order.[order_no],
          sales_order.[source_transaction_id], sales_order.[status] AS [order_status],
          transaction_row.[status] AS [transaction_status], sales_order.[total_amount],
          sales_order.[deposit_amount], sales_order.[balance_amount], line.[quantity],
          line.[selling_unit_of_measure], line.[base_unit_of_measure],
          line.[uom_conversion_factor], line.[base_quantity], line.[unit_price],
          line.[line_total], balance.[quantity_on_hand], ISNULL(payment.[paid_amount], 0) AS [paid_amount]
        FROM [dbo].[sales_order] sales_order
        INNER JOIN [dbo].[pos_transaction] transaction_row
          ON transaction_row.[id] = sales_order.[source_transaction_id]
        INNER JOIN [dbo].[pos_transaction_line] line
          ON line.[pos_transaction_id] = sales_order.[source_transaction_id]
        INNER JOIN [dbo].[inventory_location_balance] balance
          ON balance.[product_code] = line.[product_code_snapshot]
        OUTER APPLY (
          SELECT SUM(pos_payment.[amount]) AS [paid_amount]
          FROM [dbo].[pos_payment] pos_payment
          WHERE pos_payment.[pos_transaction_id] = sales_order.[source_transaction_id]
        ) payment
        WHERE sales_order.[status] = @orderStatus
          ${orderId ? "AND sales_order.[id] = @orderId" : ""}
        ORDER BY sales_order.[created_at] DESC
      `);
      const row = result.recordset[0];
      assert.ok(row, `SQL Server ${orderStatus.toLowerCase()} sales-order probe did not find an order.`);
      return {
        orderId: row.order_id,
        orderNo: row.order_no,
        sourceTransactionId: row.source_transaction_id,
        orderStatus: row.order_status,
        transactionStatus: row.transaction_status,
        totalAmount: Number(row.total_amount),
        depositAmount: Number(row.deposit_amount),
        balanceAmount: Number(row.balance_amount),
        quantity: Number(row.quantity),
        sellingUnitOfMeasure: row.selling_unit_of_measure,
        baseUnitOfMeasure: row.base_unit_of_measure,
        conversionFactor: Number(row.uom_conversion_factor),
        baseQuantity: Number(row.base_quantity),
        unitPrice: Number(row.unit_price),
        lineTotal: Number(row.line_total),
        quantityOnHand: Number(row.quantity_on_hand),
        paidAmount: Number(row.paid_amount),
      };
    };

    await exerciseProvider(
      "SQL Server",
      service,
      async () => {
        const result = await pool.request().query<{
          transaction_id: string;
          transaction_no: string;
          line_id: string;
          quantity: number;
          selling_unit_of_measure: string;
          base_unit_of_measure: string;
          uom_conversion_factor: number;
          base_quantity: number;
          unit_price: number;
          line_total: number;
          quantity_on_hand: number;
        }>(`
          SELECT TOP (1)
            transaction_row.[id] AS [transaction_id], transaction_row.[transaction_no],
            line.[id] AS [line_id], line.[quantity], line.[selling_unit_of_measure],
            line.[base_unit_of_measure], line.[uom_conversion_factor], line.[base_quantity],
            line.[unit_price], line.[line_total], balance.[quantity_on_hand]
          FROM [dbo].[pos_transaction] transaction_row
          INNER JOIN [dbo].[pos_transaction_line] line ON line.[pos_transaction_id] = transaction_row.[id]
          INNER JOIN [dbo].[inventory_location_balance] balance ON balance.[product_code] = line.[product_code_snapshot]
          WHERE transaction_row.[status] = N'COMPLETED' AND transaction_row.[transaction_type] = N'SALE'
          ORDER BY transaction_row.[completed_at] DESC
        `);
        const row = result.recordset[0];
        assert.ok(row, "SQL Server sale probe did not find a completed UOM sale.");
        return {
          transactionId: row.transaction_id,
          transactionNo: row.transaction_no,
          lineId: row.line_id,
          quantity: Number(row.quantity),
          sellingUnitOfMeasure: row.selling_unit_of_measure,
          baseUnitOfMeasure: row.base_unit_of_measure,
          conversionFactor: Number(row.uom_conversion_factor),
          baseQuantity: Number(row.base_quantity),
          unitPrice: Number(row.unit_price),
          lineTotal: Number(row.line_total),
          quantityOnHand: Number(row.quantity_on_hand)
        };
      },
      async (sourceLineId) => {
        const result = await pool.request().input("sourceLineId", sourceLineId).query<{
          quantity: number;
          selling_unit_of_measure: string;
          base_unit_of_measure: string;
          uom_conversion_factor: number;
          base_quantity: number;
          unit_price: number;
          line_total: number;
          quantity_on_hand: number;
        }>(`
          SELECT TOP (1) line.[quantity], line.[selling_unit_of_measure], line.[base_unit_of_measure],
            line.[uom_conversion_factor], line.[base_quantity], line.[unit_price], line.[line_total],
            balance.[quantity_on_hand]
          FROM [dbo].[pos_transaction_line] line
          INNER JOIN [dbo].[pos_transaction] transaction_row
            ON transaction_row.[id] = line.[pos_transaction_id]
          INNER JOIN [dbo].[inventory_location_balance] balance
            ON balance.[product_code] = line.[product_code_snapshot]
          WHERE line.[source_line_id] = @sourceLineId
            AND line.[line_intent] = N'RETURN'
            AND transaction_row.[status] = N'COMPLETED'
            AND transaction_row.[transaction_type] = N'RETURN'
        `);
        const row = result.recordset[0];
        assert.ok(row, "SQL Server return probe did not find the linked UOM return line.");
        return {
          quantity: Number(row.quantity),
          sellingUnitOfMeasure: row.selling_unit_of_measure,
          baseUnitOfMeasure: row.base_unit_of_measure,
          conversionFactor: Number(row.uom_conversion_factor),
          baseQuantity: Number(row.base_quantity),
          unitPrice: Number(row.unit_price),
          lineTotal: Number(row.line_total),
          quantityOnHand: Number(row.quantity_on_hand)
        };
      },
      async (sourceLineId) => {
        const result = await pool.request().input("sourceLineId", sourceLineId).query<{
          line_count: number;
          quantity: number;
          base_quantity: number;
          quantity_on_hand: number;
          snapshots_are_consistent: number;
        }>(`
          SELECT COUNT_BIG(*) AS [line_count], SUM(line.[quantity]) AS [quantity],
            SUM(line.[base_quantity]) AS [base_quantity],
            MAX(balance.[quantity_on_hand]) AS [quantity_on_hand],
            MIN(CASE WHEN line.[selling_unit_of_measure] = N'CTN'
              AND line.[base_unit_of_measure] = N'EA'
              AND line.[uom_conversion_factor] = 24
              THEN 1 ELSE 0 END) AS [snapshots_are_consistent]
          FROM [dbo].[pos_transaction_line] line
          INNER JOIN [dbo].[pos_transaction] transaction_row
            ON transaction_row.[id] = line.[pos_transaction_id]
          INNER JOIN [dbo].[inventory_location_balance] balance
            ON balance.[product_code] = line.[product_code_snapshot]
          WHERE line.[source_line_id] = @sourceLineId
            AND line.[line_intent] = N'RETURN'
            AND transaction_row.[status] = N'COMPLETED'
            AND transaction_row.[transaction_type] = N'RETURN'
        `);
        const row = result.recordset[0];
        assert.ok(row, "SQL Server reversal summary did not find linked return lines.");
        return {
          lineCount: Number(row.line_count),
          quantity: Number(row.quantity),
          baseQuantity: Number(row.base_quantity),
          quantityOnHand: Number(row.quantity_on_hand),
          snapshotsAreConsistent: Number(row.snapshots_are_consistent) === 1,
        };
      },
      () => readSalesOrder("OPEN"),
      (orderId) => readSalesOrder("FULFILLED", orderId),
      (orderId) => readSalesOrder("CANCELLED", orderId),
      async () => {
        const updatedAt = new Date().toISOString();
        await pool.request().input("updatedAt", updatedAt).query(`
          INSERT INTO [dbo].[inventory_batch_registry] (
            [id], [product_code], [inventory_location_code], [batch_no],
            [manufactured_at], [expiry_date], [quantity_on_hand], [status],
            [source_reference_type], [source_reference_id], [source_reference_label], [updated_at]
          ) VALUES
            (N'uom-gate-batch-first', N'UOM-GATE-WIPES', N'SHOP-FLOOR', N'WIPES-FIRST', N'2026-01-01', N'2030-01-01', 6, N'ACTIVE', N'ACCEPTANCE_GATE', N'uom-gate-batches', N'Alternate UOM gate', @updatedAt),
            (N'uom-gate-batch-later', N'UOM-GATE-WIPES', N'SHOP-FLOOR', N'WIPES-LATER', N'2026-01-01', N'2031-01-01', 24, N'ACTIVE', N'ACCEPTANCE_GATE', N'uom-gate-batches', N'Alternate UOM gate', @updatedAt);

          INSERT INTO [dbo].[serial_registry] (
            [id], [product_code], [serial_number], [inventory_location_code],
            [status], [source_transaction_id], [source_transaction_no], [updated_at]
          ) VALUES
            (N'uom-gate-phone-1', N'UOM-GATE-PHONES', N'UOM-PHONE-0001', N'SHOP-FLOOR', N'AVAILABLE', NULL, NULL, @updatedAt),
            (N'uom-gate-phone-2', N'UOM-GATE-PHONES', N'UOM-PHONE-0002', N'SHOP-FLOOR', N'AVAILABLE', NULL, NULL, @updatedAt);
        `);
      },
      async () => {
        const expiryResult = await pool.request().query<{
          quantity: number;
          selling_unit_of_measure: string;
          base_quantity: number;
          base_unit_of_measure: string;
          uom_conversion_factor: number;
          batch_allocations_json: string;
          quantity_on_hand: number;
          track_expiry: number;
          product_type: string;
          inventory_location_code: string | null;
        }>(`
          SELECT TOP (1) line.[quantity], line.[selling_unit_of_measure],
            line.[base_quantity], line.[base_unit_of_measure], line.[uom_conversion_factor],
            line.[batch_allocations_json], line.[inventory_location_code],
            balance.[quantity_on_hand], product.[track_expiry], product.[product_type]
          FROM [dbo].[pos_transaction_line] line
          INNER JOIN [dbo].[product_snapshot] product
            ON product.[product_code] = line.[product_code_snapshot]
          INNER JOIN [dbo].[inventory_location_balance] balance
            ON balance.[product_code] = line.[product_code_snapshot]
            AND balance.[location_code] = N'SHOP-FLOOR'
          WHERE line.[product_code_snapshot] = N'UOM-GATE-WIPES'
          ORDER BY line.[id] DESC
        `);
        const batchResult = await pool.request().query<{
          id: string;
          quantity_on_hand: number;
        }>(`
          SELECT [id], [quantity_on_hand]
          FROM [dbo].[inventory_batch_registry]
          WHERE [product_code] = N'UOM-GATE-WIPES'
          ORDER BY [expiry_date] ASC
        `);
        const serializedResult = await pool.request().query<{
          quantity: number;
          selling_unit_of_measure: string;
          base_quantity: number;
          base_unit_of_measure: string;
          uom_conversion_factor: number;
          serial_numbers_json: string;
          quantity_on_hand: number;
        }>(`
          SELECT TOP (1) line.[quantity], line.[selling_unit_of_measure],
            line.[base_quantity], line.[base_unit_of_measure], line.[uom_conversion_factor],
            line.[serial_numbers_json], balance.[quantity_on_hand]
          FROM [dbo].[pos_transaction_line] line
          INNER JOIN [dbo].[inventory_location_balance] balance
            ON balance.[product_code] = line.[product_code_snapshot]
            AND balance.[location_code] = N'SHOP-FLOOR'
          WHERE line.[product_code_snapshot] = N'UOM-GATE-PHONES'
          ORDER BY line.[id] DESC
        `);
        const serialResult = await pool.request().query<{
          serial_number: string;
          status: string;
        }>(`
          SELECT [serial_number], [status]
          FROM [dbo].[serial_registry]
          WHERE [product_code] = N'UOM-GATE-PHONES'
          ORDER BY [serial_number] ASC
        `);
        const expiry = expiryResult.recordset[0];
        const serialized = serializedResult.recordset[0];
        assert.ok(expiry, "SQL Server expiry-control sale probe did not find a line.");
        assert.ok(serialized, "SQL Server serialized sale probe did not find a line.");
        assert.ok(
          expiry.batch_allocations_json,
          `SQL Server did not persist expiry allocations: ${JSON.stringify({
            trackExpiry: expiry.track_expiry,
            productType: expiry.product_type,
            location: expiry.inventory_location_code,
            batchBalances: batchResult.recordset,
          })}`,
        );
        return {
          expiry: {
            quantity: Number(expiry.quantity),
            sellingUnitOfMeasure: expiry.selling_unit_of_measure,
            baseQuantity: Number(expiry.base_quantity),
            baseUnitOfMeasure: expiry.base_unit_of_measure,
            conversionFactor: Number(expiry.uom_conversion_factor),
            batchAllocations: JSON.parse(expiry.batch_allocations_json).map(
              (row: { batchId: string; quantity: number }) => ({
                batchId: row.batchId,
                quantity: Number(row.quantity),
              }),
            ),
            batchBalances: batchResult.recordset.map((row) => ({
              batchId: row.id,
              quantityOnHand: Number(row.quantity_on_hand),
            })),
            quantityOnHand: Number(expiry.quantity_on_hand),
          },
          serialized: {
            quantity: Number(serialized.quantity),
            sellingUnitOfMeasure: serialized.selling_unit_of_measure,
            baseQuantity: Number(serialized.base_quantity),
            baseUnitOfMeasure: serialized.base_unit_of_measure,
            conversionFactor: Number(serialized.uom_conversion_factor),
            serialNumbers: JSON.parse(serialized.serial_numbers_json),
            serialStatuses: serialResult.recordset.map((row) => ({
              serialNumber: row.serial_number,
              status: row.status,
            })),
            quantityOnHand: Number(serialized.quantity_on_hand),
          },
        };
      },
      async () => {
        const updatedAt = new Date().toISOString();
        await pool.request().input("updatedAt", updatedAt).query(`
          UPDATE [dbo].[inventory_location_balance]
          SET [quantity_on_hand] = 0, [updated_at] = @updatedAt
          WHERE [location_code] = N'SHOP-FLOOR'
            AND [product_code] = N'UOM-GATE-COLA';

          MERGE [dbo].[inventory_location_balance] AS target
          USING (SELECT N'WAREHOUSE' AS [location_code], N'UOM-GATE-COLA' AS [product_code]) AS source
          ON target.[location_code] = source.[location_code]
            AND target.[product_code] = source.[product_code]
          WHEN MATCHED THEN
            UPDATE SET [quantity_on_hand] = 76, [updated_at] = @updatedAt
          WHEN NOT MATCHED THEN
            INSERT ([location_code], [product_code], [quantity_on_hand], [updated_at])
            VALUES (source.[location_code], source.[product_code], 76, @updatedAt);

          INSERT INTO [dbo].[inter_store_transfer_snapshot] (
            [id], [transfer_no], [line_no], [role], [origin], [status],
            [source_store_code], [source_store_name], [source_location_code], [source_location_name],
            [destination_store_code], [destination_store_name],
            [destination_location_code], [destination_location_name],
            [product_code], [product_name], [is_serialized],
            [requested_quantity], [requested_unit_of_measure], [requested_unit_quantity],
            [uom_conversion_factor], [base_unit_of_measure], [issued_quantity], [received_quantity],
            [outstanding_issue_quantity], [outstanding_receipt_quantity], [requested_at], [updated_at]
          ) VALUES (
            N'uom-gate-transfer', N'TR-UOM-GATE-0001', 1, N'SOURCE', N'ENTERPRISE', N'REQUESTED',
            N'UOM-GATE', N'UOM Gate', N'WAREHOUSE', N'Warehouse',
            N'UOM-GATE', N'UOM Gate', N'SHOP-FLOOR', N'Shop Floor',
            N'UOM-GATE-COLA', N'UOM Gate Cola', 0,
            24, N'CTN', 1, 24, N'EA', 0, 0, 24, 0, @updatedAt, @updatedAt
          );
        `);
      },
      async () => {
        await pool.request().input("updatedAt", new Date().toISOString()).query(`
          UPDATE [dbo].[inter_store_transfer_snapshot]
          SET [role] = N'DESTINATION', [updated_at] = @updatedAt
          WHERE [id] = N'uom-gate-transfer'
        `);
      },
      async () => {
        const result = await pool.request().query<{
          status: string;
          requested_quantity: number;
          requested_unit_of_measure: string;
          requested_unit_quantity: number;
          uom_conversion_factor: number;
          base_unit_of_measure: string;
          issued_quantity: number;
          received_quantity: number;
          source_quantity_on_hand: number;
          destination_quantity_on_hand: number;
          product_quantity_on_hand: number;
        }>(`
          SELECT transfer.[status], transfer.[requested_quantity],
            transfer.[requested_unit_of_measure], transfer.[requested_unit_quantity],
            transfer.[uom_conversion_factor], transfer.[base_unit_of_measure],
            transfer.[issued_quantity], transfer.[received_quantity],
            source.[quantity_on_hand] AS [source_quantity_on_hand],
            destination.[quantity_on_hand] AS [destination_quantity_on_hand],
            product.[quantity_on_hand] AS [product_quantity_on_hand]
          FROM [dbo].[inter_store_transfer_snapshot] transfer
          INNER JOIN [dbo].[inventory_location_balance] source
            ON source.[location_code] = transfer.[source_location_code]
           AND source.[product_code] = transfer.[product_code]
          INNER JOIN [dbo].[inventory_location_balance] destination
            ON destination.[location_code] = transfer.[destination_location_code]
           AND destination.[product_code] = transfer.[product_code]
          INNER JOIN [dbo].[product_snapshot] product
            ON product.[product_code] = transfer.[product_code]
          WHERE transfer.[id] = N'uom-gate-transfer'
        `);
        const row = result.recordset[0];
        assert.ok(row, "SQL Server transfer probe did not find the carton transfer.");
        return {
          status: row.status,
          requestedQuantity: Number(row.requested_quantity),
          requestedUnitOfMeasure: row.requested_unit_of_measure,
          requestedUnitQuantity: Number(row.requested_unit_quantity),
          conversionFactor: Number(row.uom_conversion_factor),
          baseUnitOfMeasure: row.base_unit_of_measure,
          issuedQuantity: Number(row.issued_quantity),
          receivedQuantity: Number(row.received_quantity),
          sourceQuantityOnHand: Number(row.source_quantity_on_hand),
          destinationQuantityOnHand: Number(row.destination_quantity_on_hand),
          productQuantityOnHand: Number(row.product_quantity_on_hand),
        };
      },
    );
  } finally {
    await service?.close().catch(() => undefined);
    await withSqlServerPool(masterConnection, async (pool) => {
      await pool.request().query(`
        IF DB_ID(N'${databaseName}') IS NOT NULL
        BEGIN
          ALTER DATABASE ${quotedDatabase} SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
          DROP DATABASE ${quotedDatabase};
        END
      `);
    });
  }
}

async function findFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function findPostgresBinary(name: string) {
  const explicitBin = process.env.FLASH_ERP_POSTGRES_BIN?.trim();
  const roots = [
    explicitBin,
    ...[18, 17, 16, 15].map((version) => `C:\\Program Files\\PostgreSQL\\${version}\\bin`)
  ].filter((value): value is string => Boolean(value));
  const binary = roots.map((root) => path.join(root, `${name}.exe`)).find(existsSync);
  assert.ok(binary, `Could not find PostgreSQL ${name}.exe.`);
  return binary;
}

async function runPostgresGate() {
  const directory = mkdtempSync(path.join(tmpdir(), "flash-erp-uom-pg-"));
  const dataDirectory = path.join(directory, "data");
  const logPath = path.join(directory, "postgres.log");
  const databaseName = `flash_erp_uom_gate_${randomUUID().replace(/-/g, "")}`;
  const port = await findFreePort();
  const initdb = findPostgresBinary("initdb");
  const pgCtl = findPostgresBinary("pg_ctl");
  const createdb = findPostgresBinary("createdb");
  let clusterStarted = false;
  let service: PostgresStoreService | null = null;

  try {
    execFileSync(initdb, ["-D", dataDirectory, "-U", "postgres", "-A", "trust", "--encoding=UTF8"], {
      stdio: "pipe"
    });
    execFileSync(
      pgCtl,
      ["-D", dataDirectory, "-l", logPath, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"],
      { stdio: "ignore" }
    );
    clusterStarted = true;
    execFileSync(createdb, ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", databaseName], {
      stdio: "pipe"
    });

    const connectionString = `postgresql://postgres@127.0.0.1:${port}/${databaseName}`;
    const schemaPool = new pg.Pool({ connectionString });
    try {
      await schemaPool.query(
        readFileSync(
          path.join(workspaceRoot, "apps/store-desktop/src/main/postgres/store-postgres-schema.sql"),
          "utf8"
        )
      );
    } finally {
      await schemaPool.end();
    }
    service = await PostgresStoreService.create({
      connectionString,
      deploymentMode: "STANDALONE",
      nodeCode: "uom-postgres-gate",
      terminalCode: "UOM-PG-01",
      connectionTimeoutMs: 8000
    });
    const pool = (service as unknown as { pool: pg.Pool }).pool;
    const postgresReplay = service as unknown as {
      applyDownstreamBatch(
        events: Array<ReturnType<typeof createSellingUnitReplayEvent>>,
        remoteNodeCode: string,
        cursor: string | null,
      ): Promise<string[]>;
    };
    const replayEvent = createSellingUnitReplayEvent("uom-postgres-gate");
    assert.deepEqual(
      await postgresReplay.applyDownstreamBatch(
        [replayEvent],
        "enterprise-primary",
        replayEvent.eventId,
      ),
      [replayEvent.eventId],
    );
    assert.deepEqual(
      await postgresReplay.applyDownstreamBatch(
        [replayEvent],
        "enterprise-primary",
        replayEvent.eventId,
      ),
      [replayEvent.eventId],
    );
    const replayResult = await pool.query<{
      inbox_count: string;
      product_count: string;
      barcode_count: string;
      selling_units_json: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM sync_inbox WHERE id = $1 AND status = 'APPLIED') AS inbox_count,
        (SELECT COUNT(*) FROM product_snapshot WHERE product_code = 'UOM-REPLAY-PRODUCT') AS product_count,
        (SELECT COUNT(*) FROM barcode_snapshot WHERE barcode_code = 'UOM-REPLAY-CTN-24') AS barcode_count,
        (SELECT selling_units_json FROM product_snapshot WHERE product_code = 'UOM-REPLAY-PRODUCT' LIMIT 1) AS selling_units_json
    `, [replayEvent.eventId]);
    const replayRow = replayResult.rows[0];
    assert.equal(Number(replayRow?.inbox_count), 1);
    assert.equal(Number(replayRow?.product_count), 1);
    assert.equal(Number(replayRow?.barcode_count), 1);
    assert.equal(JSON.parse(replayRow?.selling_units_json ?? "[]").length, 1);
    const readSalesOrder = async (
      orderStatus: "OPEN" | "FULFILLED" | "CANCELLED",
      orderId?: string,
    ): Promise<SalesOrderProbe> => {
      const result = await pool.query<{
        order_id: string;
        order_no: string;
        source_transaction_id: string;
        order_status: string;
        transaction_status: string;
        total_amount: string;
        deposit_amount: string;
        balance_amount: string;
        quantity: string;
        selling_unit_of_measure: string;
        base_unit_of_measure: string;
        uom_conversion_factor: string;
        base_quantity: string;
        unit_price: string;
        line_total: string;
        quantity_on_hand: string;
        paid_amount: string;
      }>(`
        SELECT sales_order.id AS order_id, sales_order.order_no,
          sales_order.source_transaction_id, sales_order.status AS order_status,
          transaction_row.status AS transaction_status, sales_order.total_amount,
          sales_order.deposit_amount, sales_order.balance_amount, line.quantity,
          line.selling_unit_of_measure, line.base_unit_of_measure,
          line.uom_conversion_factor, line.base_quantity, line.unit_price,
          line.line_total, balance.quantity_on_hand,
          COALESCE(payment.paid_amount, 0) AS paid_amount
        FROM sales_order sales_order
        INNER JOIN pos_transaction transaction_row
          ON transaction_row.id = sales_order.source_transaction_id
        INNER JOIN pos_transaction_line line
          ON line.pos_transaction_id = sales_order.source_transaction_id
        INNER JOIN inventory_location_balance balance
          ON balance.product_code = line.product_code_snapshot
        LEFT JOIN LATERAL (
          SELECT SUM(pos_payment.amount) AS paid_amount
          FROM pos_payment pos_payment
          WHERE pos_payment.pos_transaction_id = sales_order.source_transaction_id
        ) payment ON true
        WHERE sales_order.status = $1
          AND ($2::text IS NULL OR sales_order.id = $2)
        ORDER BY sales_order.created_at DESC
        LIMIT 1
      `, [orderStatus, orderId ?? null]);
      const row = result.rows[0];
      assert.ok(row, `PostgreSQL ${orderStatus.toLowerCase()} sales-order probe did not find an order.`);
      return {
        orderId: row.order_id,
        orderNo: row.order_no,
        sourceTransactionId: row.source_transaction_id,
        orderStatus: row.order_status,
        transactionStatus: row.transaction_status,
        totalAmount: Number(row.total_amount),
        depositAmount: Number(row.deposit_amount),
        balanceAmount: Number(row.balance_amount),
        quantity: Number(row.quantity),
        sellingUnitOfMeasure: row.selling_unit_of_measure,
        baseUnitOfMeasure: row.base_unit_of_measure,
        conversionFactor: Number(row.uom_conversion_factor),
        baseQuantity: Number(row.base_quantity),
        unitPrice: Number(row.unit_price),
        lineTotal: Number(row.line_total),
        quantityOnHand: Number(row.quantity_on_hand),
        paidAmount: Number(row.paid_amount),
      };
    };

    await exerciseProvider(
      "PostgreSQL",
      service,
      async () => {
        const result = await pool.query<{
          transaction_id: string;
          transaction_no: string;
          line_id: string;
          quantity: string;
          selling_unit_of_measure: string;
          base_unit_of_measure: string;
          uom_conversion_factor: string;
          base_quantity: string;
          unit_price: string;
          line_total: string;
          quantity_on_hand: string;
        }>(`
          SELECT transaction_row.id AS transaction_id, transaction_row.transaction_no,
            line.id AS line_id, line.quantity, line.selling_unit_of_measure,
            line.base_unit_of_measure, line.uom_conversion_factor, line.base_quantity,
            line.unit_price, line.line_total, balance.quantity_on_hand
          FROM pos_transaction transaction_row
          INNER JOIN pos_transaction_line line ON line.pos_transaction_id = transaction_row.id
          INNER JOIN inventory_location_balance balance ON balance.product_code = line.product_code_snapshot
          WHERE transaction_row.status = 'COMPLETED' AND transaction_row.transaction_type = 'SALE'
          ORDER BY transaction_row.completed_at DESC
          LIMIT 1
        `);
        const row = result.rows[0];
        assert.ok(row, "PostgreSQL sale probe did not find a completed UOM sale.");
        return {
          transactionId: row.transaction_id,
          transactionNo: row.transaction_no,
          lineId: row.line_id,
          quantity: Number(row.quantity),
          sellingUnitOfMeasure: row.selling_unit_of_measure,
          baseUnitOfMeasure: row.base_unit_of_measure,
          conversionFactor: Number(row.uom_conversion_factor),
          baseQuantity: Number(row.base_quantity),
          unitPrice: Number(row.unit_price),
          lineTotal: Number(row.line_total),
          quantityOnHand: Number(row.quantity_on_hand)
        };
      },
      async (sourceLineId) => {
        const result = await pool.query<{
          quantity: string;
          selling_unit_of_measure: string;
          base_unit_of_measure: string;
          uom_conversion_factor: string;
          base_quantity: string;
          unit_price: string;
          line_total: string;
          quantity_on_hand: string;
        }>(`
          SELECT line.quantity, line.selling_unit_of_measure, line.base_unit_of_measure,
            line.uom_conversion_factor, line.base_quantity, line.unit_price, line.line_total,
            balance.quantity_on_hand
          FROM pos_transaction_line line
          INNER JOIN pos_transaction transaction_row
            ON transaction_row.id = line.pos_transaction_id
          INNER JOIN inventory_location_balance balance
            ON balance.product_code = line.product_code_snapshot
          WHERE line.source_line_id = $1
            AND line.line_intent = 'RETURN'
            AND transaction_row.status = 'COMPLETED'
            AND transaction_row.transaction_type = 'RETURN'
          LIMIT 1
        `, [sourceLineId]);
        const row = result.rows[0];
        assert.ok(row, "PostgreSQL return probe did not find the linked UOM return line.");
        return {
          quantity: Number(row.quantity),
          sellingUnitOfMeasure: row.selling_unit_of_measure,
          baseUnitOfMeasure: row.base_unit_of_measure,
          conversionFactor: Number(row.uom_conversion_factor),
          baseQuantity: Number(row.base_quantity),
          unitPrice: Number(row.unit_price),
          lineTotal: Number(row.line_total),
          quantityOnHand: Number(row.quantity_on_hand)
        };
      },
      async (sourceLineId) => {
        const result = await pool.query<{
          line_count: string;
          quantity: string;
          base_quantity: string;
          quantity_on_hand: string;
          snapshots_are_consistent: string;
        }>(`
          SELECT COUNT(*) AS line_count, SUM(line.quantity) AS quantity,
            SUM(line.base_quantity) AS base_quantity,
            MAX(balance.quantity_on_hand) AS quantity_on_hand,
            MIN(CASE WHEN line.selling_unit_of_measure = 'CTN'
              AND line.base_unit_of_measure = 'EA'
              AND line.uom_conversion_factor = 24
              THEN 1 ELSE 0 END) AS snapshots_are_consistent
          FROM pos_transaction_line line
          INNER JOIN pos_transaction transaction_row
            ON transaction_row.id = line.pos_transaction_id
          INNER JOIN inventory_location_balance balance
            ON balance.product_code = line.product_code_snapshot
          WHERE line.source_line_id = $1
            AND line.line_intent = 'RETURN'
            AND transaction_row.status = 'COMPLETED'
            AND transaction_row.transaction_type = 'RETURN'
        `, [sourceLineId]);
        const row = result.rows[0];
        assert.ok(row, "PostgreSQL reversal summary did not find linked return lines.");
        return {
          lineCount: Number(row.line_count),
          quantity: Number(row.quantity),
          baseQuantity: Number(row.base_quantity),
          quantityOnHand: Number(row.quantity_on_hand),
          snapshotsAreConsistent: Number(row.snapshots_are_consistent) === 1,
        };
      },
      () => readSalesOrder("OPEN"),
      (orderId) => readSalesOrder("FULFILLED", orderId),
      (orderId) => readSalesOrder("CANCELLED", orderId),
      async () => {
        const updatedAt = new Date().toISOString();
        await pool.query(`
          INSERT INTO inventory_batch_registry (
            id, product_code, inventory_location_code, batch_no, manufactured_at,
            expiry_date, quantity_on_hand, status, source_reference_type,
            source_reference_id, source_reference_label, updated_at
          ) VALUES
            ('uom-gate-batch-first', 'UOM-GATE-WIPES', 'SHOP-FLOOR', 'WIPES-FIRST', '2026-01-01', '2030-01-01', 6, 'ACTIVE', 'ACCEPTANCE_GATE', 'uom-gate-batches', 'Alternate UOM gate', $1),
            ('uom-gate-batch-later', 'UOM-GATE-WIPES', 'SHOP-FLOOR', 'WIPES-LATER', '2026-01-01', '2031-01-01', 24, 'ACTIVE', 'ACCEPTANCE_GATE', 'uom-gate-batches', 'Alternate UOM gate', $1);
        `, [updatedAt]);
        await pool.query(`
          INSERT INTO serial_registry (
            id, product_code, serial_number, inventory_location_code, status,
            source_transaction_id, source_transaction_no, updated_at
          ) VALUES
            ('uom-gate-phone-1', 'UOM-GATE-PHONES', 'UOM-PHONE-0001', 'SHOP-FLOOR', 'AVAILABLE', NULL, NULL, $1),
            ('uom-gate-phone-2', 'UOM-GATE-PHONES', 'UOM-PHONE-0002', 'SHOP-FLOOR', 'AVAILABLE', NULL, NULL, $1);
        `, [updatedAt]);
      },
      async () => {
        const expiryResult = await pool.query<{
          quantity: string;
          selling_unit_of_measure: string;
          base_quantity: string;
          base_unit_of_measure: string;
          uom_conversion_factor: string;
          batch_allocations_json: string;
          quantity_on_hand: string;
        }>(`
          SELECT line.quantity, line.selling_unit_of_measure, line.base_quantity,
            line.base_unit_of_measure, line.uom_conversion_factor,
            line.batch_allocations_json, balance.quantity_on_hand
          FROM pos_transaction_line line
          INNER JOIN inventory_location_balance balance
            ON balance.product_code = line.product_code_snapshot
            AND balance.location_code = 'SHOP-FLOOR'
          WHERE line.product_code_snapshot = 'UOM-GATE-WIPES'
          ORDER BY line.id DESC
          LIMIT 1
        `);
        const batchResult = await pool.query<{
          id: string;
          quantity_on_hand: string;
        }>(`
          SELECT id, quantity_on_hand
          FROM inventory_batch_registry
          WHERE product_code = 'UOM-GATE-WIPES'
          ORDER BY expiry_date ASC
        `);
        const serializedResult = await pool.query<{
          quantity: string;
          selling_unit_of_measure: string;
          base_quantity: string;
          base_unit_of_measure: string;
          uom_conversion_factor: string;
          serial_numbers_json: string;
          quantity_on_hand: string;
        }>(`
          SELECT line.quantity, line.selling_unit_of_measure, line.base_quantity,
            line.base_unit_of_measure, line.uom_conversion_factor,
            line.serial_numbers_json, balance.quantity_on_hand
          FROM pos_transaction_line line
          INNER JOIN inventory_location_balance balance
            ON balance.product_code = line.product_code_snapshot
            AND balance.location_code = 'SHOP-FLOOR'
          WHERE line.product_code_snapshot = 'UOM-GATE-PHONES'
          ORDER BY line.id DESC
          LIMIT 1
        `);
        const serialResult = await pool.query<{
          serial_number: string;
          status: string;
        }>(`
          SELECT serial_number, status
          FROM serial_registry
          WHERE product_code = 'UOM-GATE-PHONES'
          ORDER BY serial_number ASC
        `);
        const expiry = expiryResult.rows[0];
        const serialized = serializedResult.rows[0];
        assert.ok(expiry, "PostgreSQL expiry-control sale probe did not find a line.");
        assert.ok(serialized, "PostgreSQL serialized sale probe did not find a line.");
        return {
          expiry: {
            quantity: Number(expiry.quantity),
            sellingUnitOfMeasure: expiry.selling_unit_of_measure,
            baseQuantity: Number(expiry.base_quantity),
            baseUnitOfMeasure: expiry.base_unit_of_measure,
            conversionFactor: Number(expiry.uom_conversion_factor),
            batchAllocations: JSON.parse(expiry.batch_allocations_json).map(
              (row: { batchId: string; quantity: number }) => ({
                batchId: row.batchId,
                quantity: Number(row.quantity),
              }),
            ),
            batchBalances: batchResult.rows.map((row) => ({
              batchId: row.id,
              quantityOnHand: Number(row.quantity_on_hand),
            })),
            quantityOnHand: Number(expiry.quantity_on_hand),
          },
          serialized: {
            quantity: Number(serialized.quantity),
            sellingUnitOfMeasure: serialized.selling_unit_of_measure,
            baseQuantity: Number(serialized.base_quantity),
            baseUnitOfMeasure: serialized.base_unit_of_measure,
            conversionFactor: Number(serialized.uom_conversion_factor),
            serialNumbers: JSON.parse(serialized.serial_numbers_json),
            serialStatuses: serialResult.rows.map((row) => ({
              serialNumber: row.serial_number,
              status: row.status,
            })),
            quantityOnHand: Number(serialized.quantity_on_hand),
          },
        };
      },
      async () => {
        const updatedAt = new Date().toISOString();
        await pool.query(`
          UPDATE inventory_location_balance
          SET quantity_on_hand = 0, updated_at = $1
          WHERE location_code = 'SHOP-FLOOR'
            AND product_code = 'UOM-GATE-COLA'
        `, [updatedAt]);
        await pool.query(`
          INSERT INTO inventory_location_balance (
            location_code, product_code, quantity_on_hand, updated_at
          ) VALUES ('WAREHOUSE', 'UOM-GATE-COLA', 76, $1)
          ON CONFLICT (location_code, product_code) DO UPDATE SET
            quantity_on_hand = EXCLUDED.quantity_on_hand,
            updated_at = EXCLUDED.updated_at
        `, [updatedAt]);
        await pool.query(`
          INSERT INTO inter_store_transfer_snapshot (
            id, transfer_no, line_no, role, origin, status,
            source_store_code, source_store_name, source_location_code, source_location_name,
            destination_store_code, destination_store_name,
            destination_location_code, destination_location_name,
            product_code, product_name, is_serialized,
            requested_quantity, requested_unit_of_measure, requested_unit_quantity,
            uom_conversion_factor, base_unit_of_measure, issued_quantity, received_quantity,
            outstanding_issue_quantity, outstanding_receipt_quantity, requested_at, updated_at
          ) VALUES (
            'uom-gate-transfer', 'TR-UOM-GATE-0001', 1, 'SOURCE', 'ENTERPRISE', 'REQUESTED',
            'UOM-GATE', 'UOM Gate', 'WAREHOUSE', 'Warehouse',
            'UOM-GATE', 'UOM Gate', 'SHOP-FLOOR', 'Shop Floor',
            'UOM-GATE-COLA', 'UOM Gate Cola', 0,
            24, 'CTN', 1, 24, 'EA', 0, 0, 24, 0, $1, $1
          )
        `, [updatedAt]);
      },
      async () => {
        await pool.query(`
          UPDATE inter_store_transfer_snapshot
          SET role = 'DESTINATION', updated_at = $1
          WHERE id = 'uom-gate-transfer'
        `, [new Date().toISOString()]);
      },
      async () => {
        const result = await pool.query<{
          status: string;
          requested_quantity: string;
          requested_unit_of_measure: string;
          requested_unit_quantity: string;
          uom_conversion_factor: string;
          base_unit_of_measure: string;
          issued_quantity: string;
          received_quantity: string;
          source_quantity_on_hand: string;
          destination_quantity_on_hand: string;
          product_quantity_on_hand: string;
        }>(`
          SELECT transfer.status, transfer.requested_quantity,
            transfer.requested_unit_of_measure, transfer.requested_unit_quantity,
            transfer.uom_conversion_factor, transfer.base_unit_of_measure,
            transfer.issued_quantity, transfer.received_quantity,
            source.quantity_on_hand AS source_quantity_on_hand,
            destination.quantity_on_hand AS destination_quantity_on_hand,
            product.quantity_on_hand AS product_quantity_on_hand
          FROM inter_store_transfer_snapshot transfer
          INNER JOIN inventory_location_balance source
            ON source.location_code = transfer.source_location_code
           AND source.product_code = transfer.product_code
          INNER JOIN inventory_location_balance destination
            ON destination.location_code = transfer.destination_location_code
           AND destination.product_code = transfer.product_code
          INNER JOIN product_snapshot product
            ON product.product_code = transfer.product_code
          WHERE transfer.id = 'uom-gate-transfer'
        `);
        const row = result.rows[0];
        assert.ok(row, "PostgreSQL transfer probe did not find the carton transfer.");
        return {
          status: row.status,
          requestedQuantity: Number(row.requested_quantity),
          requestedUnitOfMeasure: row.requested_unit_of_measure,
          requestedUnitQuantity: Number(row.requested_unit_quantity),
          conversionFactor: Number(row.uom_conversion_factor),
          baseUnitOfMeasure: row.base_unit_of_measure,
          issuedQuantity: Number(row.issued_quantity),
          receivedQuantity: Number(row.received_quantity),
          sourceQuantityOnHand: Number(row.source_quantity_on_hand),
          destinationQuantityOnHand: Number(row.destination_quantity_on_hand),
          productQuantityOnHand: Number(row.product_quantity_on_hand),
        };
      },
    );
  } finally {
    await service?.close().catch(() => undefined);
    if (clusterStarted) {
      execFileSync(pgCtl, ["-D", dataDirectory, "-m", "fast", "-w", "stop"], {
        stdio: "ignore"
      });
    }
    const resolvedDirectory = path.resolve(directory);
    assert.ok(resolvedDirectory.startsWith(path.resolve(tmpdir()) + path.sep));
    rmSync(resolvedDirectory, { recursive: true, force: true });
  }
}

async function main() {
  await runSqlServerGate();
  await runPostgresGate();
  console.log("Alternate-UOM SQL Server and PostgreSQL provider runtime gate passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
