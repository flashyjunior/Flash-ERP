import "dotenv/config";

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sql from "mssql";

import { MssqlStoreService } from "../apps/store-desktop/src/main/mssql/mssql-store-service.js";
import type {
  StoreInventoryLedgerRecordedPayload,
  StorePosShiftClosedPayload,
  StorePosShiftOpenedPayload,
  StorePosTransactionCompletedPayload,
  SyncEnvelope
} from "@flash-erp/sync-core";

const workspaceRoot = process.cwd();
const hqDatabaseUrl = process.env.DATABASE_URL;
const storeNodeCode =
  process.env.FLASH_ERP_STORE_MSSQL_CERT_NODE_CODE?.trim() || "store-mssql-cert-01";
const storeCode =
  process.env.FLASH_ERP_STORE_MSSQL_CERT_STORE_CODE?.trim() || "mssql-cert-store";
const storeName =
  process.env.FLASH_ERP_STORE_MSSQL_CERT_STORE_NAME?.trim() || "MSSQL Certification Store";
const terminalCode =
  process.env.FLASH_ERP_STORE_MSSQL_CERT_TERMINAL_CODE?.trim() ||
  "mssql-cert-terminal-01";
const terminalName =
  process.env.FLASH_ERP_STORE_MSSQL_CERT_TERMINAL_NAME?.trim() ||
  "MSSQL Certification Terminal";
const storeDatabaseName =
  process.env.FLASH_ERP_STORE_MSSQL_DATABASE_NAME?.trim() || "flash_erp_store_mssql_cert";
const enterpriseBaseUrl =
  process.env.FLASH_ERP_STORE_SYNC_BASE_URL?.trim() || "http://localhost:3000";

type CertificationOutboxEvent = {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
};

type ExpectedStoreRow = {
  label: string;
  tableName: string;
  keyColumn: string;
  keyValue: string;
};

type UpstreamCertificationEvent = {
  eventId: string;
  aggregateType: SyncEnvelope["aggregateType"];
  aggregateId: string;
  eventType: string;
  expectedStatus: "ACKNOWLEDGED" | "DEAD_LETTER";
};

type UpstreamCertification = {
  events: UpstreamCertificationEvent[];
  shiftId: string;
  transactionId: string;
  paymentId: string;
  ledgerEntryId: string;
};

if (!hqDatabaseUrl) {
  throw new Error("DATABASE_URL must point at the MSSQL-backed HQ database.");
}

function parseSqlServerUrl(value: string) {
  const trimmed = value.trim().replace(/^"|"$/g, "");

  if (trimmed.startsWith("sqlserver://")) {
    const body = trimmed.slice("sqlserver://".length);
    const [server, ...parts] = body.split(";");
    const entries = new Map<string, string>();

    for (const part of parts) {
      const separator = part.indexOf("=");
      if (separator <= 0) {
        continue;
      }

      entries.set(part.slice(0, separator).trim().toLowerCase(), part.slice(separator + 1));
    }

    return {
      server,
      database: entries.get("database") ?? "",
      user: entries.get("user") ?? entries.get("user id") ?? entries.get("uid") ?? "",
      password: entries.get("password") ?? entries.get("pwd") ?? "",
      encrypt: entries.get("encrypt") ?? "false",
      trustServerCertificate:
        entries.get("trustservercertificate") ??
        entries.get("trust server certificate") ??
        "true"
    };
  }

  const entries = new Map<string, string>();
  for (const part of trimmed.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    entries.set(part.slice(0, separator).trim().toLowerCase(), part.slice(separator + 1));
  }

  return {
    server: entries.get("server") ?? entries.get("data source") ?? "",
    database: entries.get("database") ?? entries.get("initial catalog") ?? "",
    user: entries.get("user id") ?? entries.get("uid") ?? entries.get("user") ?? "",
    password: entries.get("password") ?? entries.get("pwd") ?? "",
    encrypt: entries.get("encrypt") ?? "false",
    trustServerCertificate:
      entries.get("trustservercertificate") ??
      entries.get("trust server certificate") ??
      "true"
  };
}

function buildSqlServerConnectionString(input: ReturnType<typeof parseSqlServerUrl>) {
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

function normalizeSqlServerConnectionString(value: string) {
  return buildSqlServerConnectionString(parseSqlServerUrl(value));
}

function deriveStoreDatabaseUrl() {
  const explicit = process.env.FLASH_ERP_STORE_MSSQL_CERT_DATABASE_URL?.trim();
  if (explicit) {
    return normalizeSqlServerConnectionString(explicit);
  }

  const parsed = parseSqlServerUrl(hqDatabaseUrl);
  return buildSqlServerConnectionString({
    ...parsed,
    database: storeDatabaseName
  });
}

function quoteDatabaseName(databaseName: string) {
  if (!databaseName.trim()) {
    throw new Error("Store SQL Server database name cannot be empty.");
  }

  return `[${databaseName.replace(/]/g, "]]")}]`;
}

async function withPool<T>(connectionString: string, work: (pool: sql.ConnectionPool) => Promise<T>) {
  const pool = new sql.ConnectionPool(normalizeSqlServerConnectionString(connectionString));

  try {
    await pool.connect();
    return await work(pool);
  } finally {
    await pool.close().catch(() => undefined);
  }
}

async function ensureStoreDatabase(storeDatabaseUrl: string) {
  const parsed = parseSqlServerUrl(storeDatabaseUrl);
  const masterUrl = buildSqlServerConnectionString({
    ...parsed,
    database: "master"
  });
  const databaseName = parsed.database || storeDatabaseName;

  await withPool(masterUrl, async (pool) => {
    const exists = await pool
      .request()
      .input("databaseName", databaseName)
      .query<{ value: number }>("SELECT CASE WHEN DB_ID(@databaseName) IS NULL THEN 0 ELSE 1 END AS [value]");

    if (exists.recordset[0]?.value !== 1) {
      await pool.request().query(`CREATE DATABASE ${quoteDatabaseName(databaseName)}`);
    }
  });
}

async function provisionStoreSchema(storeDatabaseUrl: string) {
  const schemaPath = path.join(
    workspaceRoot,
    "apps/store-desktop/src/main/mssql/store-mssql-schema.sql"
  );

  if (!existsSync(schemaPath)) {
    throw new Error(`Missing SQL Server store schema at ${schemaPath}.`);
  }

  await withPool(storeDatabaseUrl, async (pool) => {
    await pool.request().batch(readFileSync(schemaPath, "utf8"));
  });
}

async function seedStoreMetadata(
  storeDatabaseUrl: string,
  input: {
    retailOrgName: string;
    storeCode: string;
    storeName: string;
    terminalCode: string;
    nodeCode: string;
  }
) {
  const entries = [
    ["retail_org_name", input.retailOrgName],
    ["store_code", input.storeCode],
    ["store_name", input.storeName],
    ["terminal_code", input.terminalCode],
    ["node_code", input.nodeCode]
  ] as const;

  await withPool(storeDatabaseUrl, async (pool) => {
    for (const [key, value] of entries) {
      await pool
        .request()
        .input("key", key)
        .input("value", value)
        .query(`
          MERGE [dbo].[app_metadata] AS target
          USING (SELECT @key AS [key], @value AS [value]) AS source
          ON target.[key] = source.[key]
          WHEN MATCHED THEN UPDATE SET [value] = source.[value]
          WHEN NOT MATCHED THEN INSERT ([key], [value]) VALUES (source.[key], source.[value]);
        `);
    }
  });
}

async function prepareHqCertificationEvent() {
  const parsed = parseSqlServerUrl(hqDatabaseUrl);
  const hqUrl = buildSqlServerConnectionString(parsed);
  const certificationId = randomUUID();
  const suffix = certificationId.slice(0, 8).toUpperCase();
  const idempotencyPrefix = `cert:mssql-store-server:${storeNodeCode}:${certificationId}`;
  const productCode = `MSSQL-CERT-${suffix}`;
  const unitPrice = Number((20 + Math.random() * 5).toFixed(2));
  const quantityOnHand = 77;

  return withPool(hqUrl, async (pool) => {
    const contextResult = await pool
      .request()
      .query<{
        enterpriseNodeId: string;
        retailOrgId: string;
        retailOrgName: string;
        timezone: string;
        currencyCode: string;
      }>(`
        SELECT TOP (1)
          enterpriseNode.[id] AS [enterpriseNodeId],
          retailOrg.[id] AS [retailOrgId],
          retailOrg.[name] AS [retailOrgName],
          retailOrg.[timezone] AS [timezone],
          retailOrg.[baseCurrencyCode] AS [currencyCode]
        FROM [dbo].[SyncNode] enterpriseNode
        INNER JOIN [dbo].[RetailOrg] retailOrg ON retailOrg.[id] = enterpriseNode.[retailOrgId]
        WHERE enterpriseNode.[nodeType] = N'ENTERPRISE'
          AND enterpriseNode.[isPrimary] = 1
          AND enterpriseNode.[status] = N'ACTIVE'
      `);
    const context = contextResult.recordset[0];

    if (!context) {
      throw new Error("HQ does not have an active primary enterprise sync node.");
    }

    await pool
      .request()
      .input("retailOrgId", context.retailOrgId)
      .input("storeCode", storeCode)
      .input("storeName", storeName)
      .input("timezone", context.timezone || "Africa/Accra")
      .input("currencyCode", context.currencyCode || "USD")
      .input("terminalCode", terminalCode)
      .input("terminalName", terminalName)
      .input("nodeCode", storeNodeCode)
      .input("nodeName", `${storeName} Desktop`)
      .input("licensedUntil", new Date(Date.now() + 365 * 24 * 60 * 60 * 1000))
      .query(`
        DECLARE @storeId nvarchar(100);
        DECLARE @terminalId nvarchar(100);

        SELECT @storeId = [id]
        FROM [dbo].[Store]
        WHERE [retailOrgId] = @retailOrgId
          AND [code] = @storeCode;

        IF @storeId IS NULL
        BEGIN
          SET @storeId = LOWER(CONVERT(nvarchar(36), NEWID()));

          INSERT INTO [dbo].[Store] (
            [id], [retailOrgId], [code], [name], [timezone], [currencyCode],
            [salesEnabled], [warehouseEnabled], [licenseStatus], [licenseKey],
            [licensedUntil], [storeMode], [touchModeEnabled], [status],
            [createdAt], [updatedAt]
          ) VALUES (
            @storeId, @retailOrgId, @storeCode, @storeName, @timezone, @currencyCode,
            1, 1, N'LICENSED', CONCAT(N'CERT-', @storeCode), @licensedUntil,
            N'OFFLINE_FIRST', 1, N'ACTIVE', SYSUTCDATETIME(), SYSUTCDATETIME()
          );
        END
        ELSE
        BEGIN
          UPDATE [dbo].[Store]
          SET [name] = @storeName,
              [timezone] = @timezone,
              [currencyCode] = @currencyCode,
              [licenseStatus] = N'LICENSED',
              [licenseKey] = COALESCE([licenseKey], CONCAT(N'CERT-', @storeCode)),
              [licensedUntil] = @licensedUntil,
              [status] = N'ACTIVE',
              [updatedAt] = SYSUTCDATETIME()
          WHERE [id] = @storeId;
        END;

        SELECT @terminalId = [id]
        FROM [dbo].[Terminal]
        WHERE [storeId] = @storeId
          AND [code] = @terminalCode;

        IF @terminalId IS NULL
        BEGIN
          SET @terminalId = LOWER(CONVERT(nvarchar(36), NEWID()));

          INSERT INTO [dbo].[Terminal] (
            [id], [retailOrgId], [storeId], [code], [name], [status],
            [licenseStatus], [licenseKey], [licensedUntil], [registeredAt],
            [lastHeartbeatAt], [createdAt], [updatedAt]
          ) VALUES (
            @terminalId, @retailOrgId, @storeId, @terminalCode, @terminalName,
            N'ACTIVE', N'LICENSED', CONCAT(N'CERT-', @terminalCode), @licensedUntil,
            SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME()
          );
        END
        ELSE
        BEGIN
          UPDATE [dbo].[Terminal]
          SET [name] = @terminalName,
              [status] = N'ACTIVE',
              [licenseStatus] = N'LICENSED',
              [licenseKey] = COALESCE([licenseKey], CONCAT(N'CERT-', @terminalCode)),
              [licensedUntil] = @licensedUntil,
              [lastHeartbeatAt] = SYSUTCDATETIME(),
              [updatedAt] = SYSUTCDATETIME()
          WHERE [id] = @terminalId;
        END;

        IF EXISTS (SELECT 1 FROM [dbo].[SyncNode] WHERE [code] = @nodeCode)
        BEGIN
          UPDATE [dbo].[SyncNode]
          SET [retailOrgId] = @retailOrgId,
              [storeId] = @storeId,
              [terminalId] = @terminalId,
              [name] = @nodeName,
              [nodeType] = N'STORE_DESKTOP',
              [direction] = N'BIDIRECTIONAL',
              [isPrimary] = 0,
              [status] = N'ACTIVE',
              [lastHeartbeatAt] = SYSUTCDATETIME(),
              [updatedAt] = SYSUTCDATETIME()
          WHERE [code] = @nodeCode;
        END
        ELSE
        BEGIN
          INSERT INTO [dbo].[SyncNode] (
            [id], [retailOrgId], [storeId], [terminalId], [code], [name],
            [nodeType], [direction], [isPrimary], [status], [lastHeartbeatAt],
            [autoSyncEnabled], [syncIntervalMinutes], [syncActiveFromMinutes],
            [syncActiveToMinutes], [syncJitterSeconds], [syncBackoffBaseSeconds],
            [syncBackoffMaxSeconds], [createdAt], [updatedAt]
          ) VALUES (
            LOWER(CONVERT(nvarchar(36), NEWID())), @retailOrgId, @storeId,
            @terminalId, @nodeCode, @nodeName, N'STORE_DESKTOP',
            N'BIDIRECTIONAL', 0, N'ACTIVE', SYSUTCDATETIME(), 1, 15, 0,
            1440, 30, 60, 900, SYSUTCDATETIME(), SYSUTCDATETIME()
          );
        END;
      `);

    const nodeResult = await pool
      .request()
      .input("nodeCode", storeNodeCode)
      .query<{
        storeNodeId: string;
        storeId: string;
        storeCode: string;
        storeName: string;
        terminalId: string;
        terminalCode: string;
        enterpriseNodeId: string;
        retailOrgId: string;
        retailOrgName: string;
      }>(`
        SELECT TOP (1)
          storeNode.[id] AS [storeNodeId],
          storeNode.[retailOrgId] AS [retailOrgId],
          retailOrg.[name] AS [retailOrgName],
          storeRecord.[id] AS [storeId],
          storeRecord.[code] AS [storeCode],
          storeRecord.[name] AS [storeName],
          terminal.[id] AS [terminalId],
          terminal.[code] AS [terminalCode],
          enterpriseNode.[id] AS [enterpriseNodeId]
        FROM [dbo].[SyncNode] storeNode
        INNER JOIN [dbo].[RetailOrg] retailOrg ON retailOrg.[id] = storeNode.[retailOrgId]
        INNER JOIN [dbo].[Store] storeRecord ON storeRecord.[id] = storeNode.[storeId]
        INNER JOIN [dbo].[Terminal] terminal ON terminal.[id] = storeNode.[terminalId]
        INNER JOIN [dbo].[SyncNode] enterpriseNode
          ON enterpriseNode.[retailOrgId] = storeNode.[retailOrgId]
         AND enterpriseNode.[nodeType] = N'ENTERPRISE'
         AND enterpriseNode.[isPrimary] = 1
         AND enterpriseNode.[status] = N'ACTIVE'
        WHERE storeNode.[code] = @nodeCode
          AND storeNode.[nodeType] = N'STORE_DESKTOP'
      `);
    const node = nodeResult.recordset[0];

    if (!node) {
      throw new Error(`HQ could not prepare store desktop node "${storeNodeCode}".`);
    }

    await pool
      .request()
      .input("targetNodeCode", storeNodeCode)
      .query(`
        UPDATE [dbo].[SyncOutboxEvent]
        SET [status] = N'ACKNOWLEDGED',
            [acknowledgedAt] = COALESCE([acknowledgedAt], SYSUTCDATETIME()),
            [updatedAt] = SYSUTCDATETIME()
        WHERE [targetNodeCode] = @targetNodeCode
          AND [status] IN (N'PENDING', N'IN_FLIGHT');
      `);

    const currencyCode = context.currencyCode || "USD";
    const issuedAt = new Date().toISOString();
    const licenseExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const permissionCode = `CERT.POS.${suffix}`;
    const roleCode = `CERT_ROLE_${suffix}`;
    const roleName = "MSSQL Certification Role";
    const loginId = `cert-${suffix.toLowerCase()}`;
    const customerNo = `CERT-CUST-${suffix}`;
    const departmentCode = `CERT-DEPT-${suffix}`;
    const departmentName = "MSSQL Certification Department";
    const categoryCode = `CERT-CAT-${suffix}`;
    const categoryName = "MSSQL Certification Category";
    const uomCode = `CERT-UOM-${suffix}`;
    const certificateNo = `CERT-GC-${suffix}`;
    const promotionCode = `CERT-PROMO-${suffix}`;
    const taxProfileCode = `CERT-TAX-${suffix}`;
    const tenderMethodCode = `CERT-TENDER-${suffix}`;
    const bankAccountId = `cert-bank-${suffix.toLowerCase()}`;
    const barcode = `CERT-BARCODE-${suffix}`;
    const priceListCode = `cert-price-${suffix.toLowerCase()}`;
    const locationCode = `CERT-LOC-${suffix}`;
    const sourceLocationCode = `CERT-SRC-LOC-${suffix}`;
    const serialNumber = `CERT-SERIAL-${suffix}`;
    const purchaseOrderId = `cert-po-${suffix.toLowerCase()}`;
    const purchaseOrderNo = `CERT-PO-${suffix}`;
    const purchaseOrderLineId = `cert-po-line-${suffix.toLowerCase()}`;
    const productId = `cert-product-${suffix.toLowerCase()}`;
    const locationId = `cert-location-${suffix.toLowerCase()}`;
    const cashierId = `cert-cashier-${suffix.toLowerCase()}`;
    const outboxEvents: CertificationOutboxEvent[] = [];
    const expectedRows: ExpectedStoreRow[] = [];

    await pool
      .request()
      .input("retailOrgId", node.retailOrgId)
      .input("storeId", node.storeId)
      .input("productId", productId)
      .input("productCode", productCode)
      .input("productName", "MSSQL Certification Product")
      .input("uomCode", uomCode)
      .input("unitPrice", unitPrice)
      .input("locationId", locationId)
      .input("locationCode", locationCode)
      .input("locationName", "MSSQL Certification Location")
      .input("cashierId", cashierId)
      .input("loginId", loginId)
      .query(`
        IF NOT EXISTS (
          SELECT 1 FROM [dbo].[Product]
          WHERE [retailOrgId] = @retailOrgId
            AND [code] = @productCode
        )
        BEGIN
          INSERT INTO [dbo].[Product] (
            [id], [retailOrgId], [code], [sku], [name], [productType],
            [unitOfMeasure], [taxable], [trackInventory], [isSerialized],
            [allowPriceOverride], [mustEnterPriceAtPos], [baseUnitPrice],
            [baseCostPrice], [status], [recordVersion], [createdAt], [updatedAt]
          ) VALUES (
            @productId, @retailOrgId, @productCode, @productCode, @productName, N'STOCK',
            @uomCode, 1, 1, 0, 0, 0, @unitPrice, 10.00, N'ACTIVE', 1,
            SYSUTCDATETIME(), SYSUTCDATETIME()
          );
        END
        ELSE
        BEGIN
          UPDATE [dbo].[Product]
          SET [name] = @productName,
              [sku] = @productCode,
              [unitOfMeasure] = @uomCode,
              [baseUnitPrice] = @unitPrice,
              [trackInventory] = 1,
              [status] = N'ACTIVE',
              [updatedAt] = SYSUTCDATETIME()
          WHERE [retailOrgId] = @retailOrgId
            AND [code] = @productCode;
        END;

        IF NOT EXISTS (
          SELECT 1 FROM [dbo].[InventoryLocation]
          WHERE [retailOrgId] = @retailOrgId
            AND [code] = @locationCode
        )
        BEGIN
          INSERT INTO [dbo].[InventoryLocation] (
            [id], [retailOrgId], [storeId], [warehouseId], [code], [name],
            [locationType], [status], [useForSalesDefault],
            [useForSalesOrderDefault], [useForReceivingDefault],
            [createdAt], [updatedAt]
          ) VALUES (
            @locationId, @retailOrgId, @storeId, NULL, @locationCode,
            @locationName, N'STORE', N'ACTIVE', 0, 0, 0,
            SYSUTCDATETIME(), SYSUTCDATETIME()
          );
        END
        ELSE
        BEGIN
          UPDATE [dbo].[InventoryLocation]
          SET [storeId] = @storeId,
              [name] = @locationName,
              [locationType] = N'STORE',
              [status] = N'ACTIVE',
              [useForSalesOrderDefault] = 0,
              [updatedAt] = SYSUTCDATETIME()
          WHERE [retailOrgId] = @retailOrgId
            AND [code] = @locationCode;
        END;

        IF NOT EXISTS (
          SELECT 1 FROM [dbo].[RetailUser]
          WHERE [retailOrgId] = @retailOrgId
            AND [loginId] = @loginId
        )
        BEGIN
          INSERT INTO [dbo].[RetailUser] (
            [id], [retailOrgId], [homeStoreId], [loginId], [email],
            [displayName], [passwordHash], [passwordUpdatedAt],
            [failedLoginAttempts], [accountStatus], [recordVersion],
            [createdAt], [updatedAt]
          ) VALUES (
            @cashierId, @retailOrgId, @storeId, @loginId,
            CONCAT(@loginId, N'@example.test'), N'MSSQL Certification Cashier',
            NULL, SYSUTCDATETIME(), 0, N'ACTIVE', 1,
            SYSUTCDATETIME(), SYSUTCDATETIME()
          );
        END
        ELSE
        BEGIN
          UPDATE [dbo].[RetailUser]
          SET [homeStoreId] = @storeId,
              [displayName] = N'MSSQL Certification Cashier',
              [accountStatus] = N'ACTIVE',
              [updatedAt] = SYSUTCDATETIME()
          WHERE [retailOrgId] = @retailOrgId
            AND [loginId] = @loginId;
        END;
      `);

    const addExpectedRow = (
      label: string,
      tableName: string,
      keyColumn: string,
      keyValue: string
    ) => {
      expectedRows.push({ label, tableName, keyColumn, keyValue });
    };
    const addOutboxEvent = (
      aggregateType: string,
      eventType: string,
      aggregateId: string,
      payload: Record<string, unknown>
    ) => {
      const outboxEventId = randomUUID();
      outboxEvents.push({
        eventId: outboxEventId,
        aggregateType,
        aggregateId,
        eventType,
        idempotencyKey: `${idempotencyPrefix}:${eventType}:${aggregateId}`,
        payload
      });
      return outboxEventId;
    };

    addOutboxEvent("store", "store.settings.published", node.storeCode, {
      retailOrgName: node.retailOrgName,
      storeCode: node.storeCode,
      storeName: node.storeName,
      licenseStatus: "LICENSED",
      licenseKey: `CERT-${node.storeCode}`,
      licensedUntil: licenseExpiry,
      terminalLicenseStatus: "LICENSED",
      terminalLicenseKey: `CERT-${node.terminalCode}`,
      terminalLicensedUntil: licenseExpiry
    });
    addExpectedRow("permission", "permission_snapshot", "permission_code", permissionCode);
    addOutboxEvent("permission", "security.permission.published", permissionCode, {
      storeCode: node.storeCode,
      permissionCode,
      permissionName: "MSSQL Certification Permission",
      description: "Certification permission from MSSQL-backed HQ"
    });
    addExpectedRow("role", "role_snapshot", "role_code", roleCode);
    addOutboxEvent("role", "security.role.published", roleCode, {
      storeCode: node.storeCode,
      roleCode,
      roleName,
      description: "Certification role from MSSQL-backed HQ",
      status: "ACTIVE",
      permissionCodes: [permissionCode]
    });
    addExpectedRow("retail user", "retail_user_snapshot", "login_id", loginId);
    addOutboxEvent("retailUser", "security.user.published", loginId, {
      storeCode: node.storeCode,
      userId: `cert-user-${suffix.toLowerCase()}`,
      loginId,
      email: `${loginId}@example.test`,
      displayName: "MSSQL Certification Cashier",
      accountStatus: "ACTIVE",
      homeStoreCode: node.storeCode,
      homeStoreName: node.storeName,
      roleCodes: [roleCode],
      roleNames: [roleName],
      permissionCodes: [permissionCode],
      passwordHash: null,
      passwordUpdatedAt: issuedAt
    });
    addExpectedRow("customer", "customer", "customer_no", customerNo);
    addOutboxEvent("customer", "customer.published", customerNo, {
      storeCode: node.storeCode,
      customerId: `cert-customer-${suffix.toLowerCase()}`,
      customerNo,
      fullName: "MSSQL Certification Customer",
      customerType: "RETAIL",
      phone: "0000000000",
      email: "mssql-cert-customer@example.test",
      homeStoreCode: node.storeCode,
      homeStoreName: node.storeName,
      addressLine1: "Certification Street",
      city: "Accra",
      countryCode: "GH",
      loyaltyEnrolled: false,
      loyaltyPointsBalance: 0,
      allowCreditSales: false,
      creditLimitAmount: 0,
      receivableBalanceAmount: 0,
      note: "MSSQL certification customer",
      status: "ACTIVE"
    });
    addExpectedRow("product department", "product_department_snapshot", "department_code", departmentCode);
    addOutboxEvent("productDepartment", "setup.product-department.published", departmentCode, {
      storeCode: node.storeCode,
      departmentCode,
      departmentName,
      description: "Certification department",
      status: "ACTIVE",
      sortOrder: 1
    });
    addExpectedRow("product category", "product_category_snapshot", "category_code", categoryCode);
    addOutboxEvent("productCategory", "setup.product-category.published", categoryCode, {
      storeCode: node.storeCode,
      categoryCode,
      categoryName,
      departmentCode,
      departmentName,
      description: "Certification category",
      status: "ACTIVE",
      sortOrder: 1
    });
    addExpectedRow("unit of measure", "unit_of_measure_snapshot", "uom_code", uomCode);
    addOutboxEvent("unitOfMeasure", "setup.unit-of-measure.published", uomCode, {
      storeCode: node.storeCode,
      uomCode,
      uomName: "Certification Unit",
      description: "Certification unit of measure",
      decimalPrecision: 0,
      allowFractionalSale: false,
      status: "ACTIVE"
    });
    addExpectedRow("gift certificate", "gift_certificate_snapshot", "certificate_no", certificateNo);
    addOutboxEvent("giftCertificate", "gift-certificate.published", certificateNo, {
      storeCode: node.storeCode,
      certificateId: `cert-gift-${suffix.toLowerCase()}`,
      certificateNo,
      recipientName: "Certification Recipient",
      purchaserName: "Certification Purchaser",
      originalAmount: 100,
      balanceAmount: 100,
      currencyCode,
      issueDate: issuedAt,
      expiryDate: licenseExpiry,
      status: "ACTIVE"
    });
    addExpectedRow("promotion", "promotion_snapshot", "promotion_code", promotionCode);
    addOutboxEvent("promotion", "setup.promotion.published", promotionCode, {
      storeCode: node.storeCode,
      promotionId: `cert-promo-${suffix.toLowerCase()}`,
      promotionCode,
      promotionName: "MSSQL Certification Promotion",
      description: "Certification promotion",
      discountType: "PERCENT",
      targetScope: "BASKET",
      discountValue: 5,
      eligibleStoreCodes: [node.storeCode],
      couponRequired: false,
      allowWithLoyalty: true,
      applyOncePerBasket: true,
      priority: 1,
      status: "ACTIVE"
    });
    const productEventId = addOutboxEvent("product", "catalog.product.published", productCode, {
      storeCode: node.storeCode,
      productCode,
      productName: "MSSQL Certification Product",
      department: departmentCode,
      category: categoryCode,
      unitPrice,
      quantityOnHand,
      unitOfMeasure: uomCode,
      taxable: true,
      taxProfileCode,
      trackInventory: true
    });
    addExpectedRow("tax profile", "tax_profile_snapshot", "tax_profile_code", taxProfileCode);
    addOutboxEvent("taxProfile", "setup.tax-profile.published", taxProfileCode, {
      storeCode: node.storeCode,
      taxProfileCode,
      taxProfileName: "MSSQL Certification Tax",
      description: "Certification tax profile",
      ratePercent: 12.5,
      isDefault: false,
      isTaxInclusive: false,
      status: "ACTIVE"
    });
    addExpectedRow("tender method", "tender_method_snapshot", "tender_method_code", tenderMethodCode);
    addOutboxEvent("tenderMethod", "setup.tender-method.published", tenderMethodCode, {
      storeCode: node.storeCode,
      tenderMethodCode,
      tenderMethodName: "MSSQL Certification Tender",
      paymentMethod: "CASH",
      requiresReference: false,
      allowChange: true,
      allowRefund: true,
      allowOpenCashDrawer: true,
      status: "ACTIVE",
      sortOrder: 1
    });
    addExpectedRow("bank account", "bank_account_snapshot", "id", bankAccountId);
    addOutboxEvent("bankAccount", "setup.bank-account.published", bankAccountId, {
      storeCode: node.storeCode,
      bankAccountId,
      bankCode: "CERTBANK",
      bankName: "MSSQL Certification Bank",
      branchCode: "CERTBR",
      branchName: "Certification Branch",
      accountNumber: `000${suffix}`,
      accountName: "MSSQL Certification Account",
      currencyCode,
      status: "ACTIVE"
    });
    addExpectedRow("barcode", "barcode_snapshot", "barcode_code", barcode);
    addOutboxEvent("barcode", "catalog.barcode.published", barcode, {
      storeCode: node.storeCode,
      productCode,
      barcode,
      barcodeType: "MANUAL"
    });
    addExpectedRow("price list entry", "price_list_entry_snapshot", "price_list_code", priceListCode);
    addOutboxEvent("priceList", "pricing.price-list.published", priceListCode, {
      storeCode: node.storeCode,
      priceListCode,
      priceListName: "MSSQL Certification Price",
      currencyCode,
      isDefault: false,
      productCode,
      unitPrice: Number((unitPrice + 1).toFixed(2)),
      status: "ACTIVE"
    });
    addExpectedRow("inventory location", "inventory_location_snapshot", "location_code", locationCode);
    addOutboxEvent("inventoryLocation", "inventory.location.published", locationCode, {
      storeCode: node.storeCode,
      locationCode,
      locationName: "MSSQL Certification Location",
      locationType: "STORE",
      status: "ACTIVE",
      defaults: "Sales default / Sales order default / Receiving default",
      useForSalesDefault: true,
      useForSalesOrderDefault: true,
      useForReceivingDefault: true
    });
    addExpectedRow(
      "inter-store transfer target",
      "inter_store_transfer_request_target_snapshot",
      "source_location_code",
      sourceLocationCode
    );
    addOutboxEvent("interStoreTransferTarget", "inter-store-transfer.target.published", sourceLocationCode, {
      storeCode: node.storeCode,
      sourceStoreCode: `CERT-SRC-${suffix}`,
      sourceStoreName: "MSSQL Certification Source Store",
      sourceStoreSalesEnabled: true,
      sourceStoreWarehouseEnabled: true,
      sourceLocationCode,
      sourceLocationName: "MSSQL Certification Source Location",
      sourceLocationType: "WAREHOUSE",
      sourceLocationStatus: "ACTIVE",
      sourceLocationDefaults: "CERTIFICATION",
      useForSalesDefault: false,
      useForReceivingDefault: false
    });
    addExpectedRow("serial registry", "serial_registry", "serial_number", serialNumber);
    addOutboxEvent("inventorySerialSnapshot", "inventory.serial-snapshot.published", productCode, {
      storeCode: node.storeCode,
      productCode,
      productName: "MSSQL Certification Product",
      availableQuantity: quantityOnHand,
      serialItems: [
        {
          serialNumber,
          locationCode,
          status: "AVAILABLE",
          sourceReferenceId: purchaseOrderId,
          sourceReferenceLabel: purchaseOrderNo,
          updatedAt: issuedAt
        }
      ]
    });
    addExpectedRow("purchase order", "purchase_order_snapshot", "purchase_order_no", purchaseOrderNo);
    addExpectedRow("purchase order line", "purchase_order_line_snapshot", "id", purchaseOrderLineId);
    addOutboxEvent("purchaseOrder", "purchase-order.published", purchaseOrderId, {
      storeCode: node.storeCode,
      purchaseOrderId,
      purchaseOrderNo,
      locationCode,
      locationName: "MSSQL Certification Location",
      supplierNo: `CERT-SUP-${suffix}`,
      supplierName: "MSSQL Certification Supplier",
      externalReference: `CERT-EXT-${suffix}`,
      note: "MSSQL certification purchase order",
      operatorName: "MSSQL Certification Operator",
      status: "OPEN",
      orderedQuantity: 2,
      receivedQuantity: 0,
      exceptionQuantity: 0,
      outstandingQuantity: 2,
      committedAt: issuedAt,
      lines: [
        {
          purchaseOrderLineId,
          lineNo: 1,
          productCode,
          productName: "MSSQL Certification Product",
          departmentCode,
          categoryCode,
          isSerialized: true,
          orderedQuantity: 2,
          receivedQuantity: 0,
          exceptionQuantity: 0,
          outstandingQuantity: 2,
          unitCost: 10
        }
      ]
    });

    for (const outboxEvent of outboxEvents) {
      await pool
        .request()
        .input("eventId", outboxEvent.eventId)
        .input("syncNodeId", node.enterpriseNodeId)
        .input("targetNodeCode", storeNodeCode)
        .input("aggregateType", outboxEvent.aggregateType)
        .input("aggregateId", outboxEvent.aggregateId)
        .input("eventType", outboxEvent.eventType)
        .input("idempotencyKey", outboxEvent.idempotencyKey)
        .input("payload", JSON.stringify(outboxEvent.payload))
        .query(`
          INSERT INTO [dbo].[SyncOutboxEvent] (
            [id], [syncNodeId], [targetNodeCode], [aggregateType], [aggregateId],
            [eventType], [idempotencyKey], [payload], [status], [attemptCount],
            [createdAt], [updatedAt]
          ) VALUES (
            @eventId, @syncNodeId, @targetNodeCode, @aggregateType, @aggregateId,
            @eventType, @idempotencyKey, @payload, N'PENDING', 0,
            SYSUTCDATETIME(), SYSUTCDATETIME()
          )
        `);
    }

    return {
      eventId: productEventId,
      eventIds: outboxEvents.map((outboxEvent) => outboxEvent.eventId),
      expectedRows,
      productCode,
      inventoryLocationCode: locationCode,
      cashierCode: loginId,
      unitPrice,
      quantityOnHand,
      retailOrgName: node.retailOrgName,
      storeCode: node.storeCode,
      storeName: node.storeName,
      terminalCode: node.terminalCode,
      nodeCode: storeNodeCode
    };
  });
}

async function queueUpstreamCertificationEvents(
  service: MssqlStoreService,
  input: {
    nodeCode: string;
    storeCode: string;
    terminalCode: string;
    productCode: string;
    inventoryLocationCode: string;
    cashierCode: string;
    unitPrice: number;
  }
): Promise<UpstreamCertification> {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const now = new Date();
  const openedAt = new Date(now.getTime() - 15 * 60_000).toISOString();
  const completedAt = new Date(now.getTime() - 5 * 60_000).toISOString();
  const inventoryRecordedAt = new Date(now.getTime() - 4 * 60_000).toISOString();
  const closedAt = now.toISOString();
  const rejectedAt = new Date(now.getTime() + 1_000).toISOString();
  const shiftId = randomUUID();
  const shiftNo = `CERT-SHIFT-${suffix}`;
  const transactionId = randomUUID();
  const transactionNo = `CERT-SALE-${suffix}`;
  const lineId = randomUUID();
  const paymentId = randomUUID();
  const ledgerEntryId = randomUUID();
  const rejectedAggregateId = `CERT-REJECT-${suffix}`;
  const events: UpstreamCertificationEvent[] = [];
  const enqueue = async (
    aggregateType: SyncEnvelope["aggregateType"],
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>,
    recordVersion: number,
    expectedStatus: UpstreamCertificationEvent["expectedStatus"],
    occurredAt: string
  ) => {
    const eventId = await service.enqueueUpstreamEvent({
      aggregateType,
      aggregateId,
      eventType,
      payload,
      recordVersion,
      idempotencyKey: `${input.nodeCode}:${aggregateType}:${aggregateId}:${eventType}:${suffix}`,
      occurredAt
    });
    events.push({ eventId, aggregateType, aggregateId, eventType, expectedStatus });
    return eventId;
  };
  const openedPayload: StorePosShiftOpenedPayload = {
    shiftId,
    shiftNo,
    storeCode: input.storeCode,
    terminalCode: input.terminalCode,
    cashierCode: input.cashierCode,
    openingFloatAmount: 50,
    openedAt
  };
  const salePayload: StorePosTransactionCompletedPayload = {
    transactionId,
    transactionNo,
    sourceTransactionId: null,
    sourceTransactionNo: null,
    storeCode: input.storeCode,
    terminalCode: input.terminalCode,
    shiftId,
    shiftNo,
    cashierCode: input.cashierCode,
    customerId: null,
    customerNo: null,
    customerName: null,
    transactionType: "SALE",
    status: "COMPLETED",
    subtotalAmount: input.unitPrice,
    discountAmount: 0,
    loyaltyPointsRedeemed: 0,
    loyaltyRedemptionAmount: 0,
    taxAmount: 0,
    totalAmount: input.unitPrice,
    paidAmount: input.unitPrice,
    changeAmount: 0,
    notes: "MSSQL upstream certification sale",
    completedAt,
    lines: [
      {
        lineId,
        lineIntent: "SALE",
        sourceLineId: null,
        productCode: input.productCode,
        productName: "MSSQL Certification Product",
        barcode: null,
        serialNumbers: [],
        quantity: 1,
        unitPrice: input.unitPrice,
        discountAmount: 0,
        taxAmount: 0,
        lineTotal: input.unitPrice
      }
    ],
    payments: [
      {
        paymentId,
        method: "CASH",
        tenderMethodCode: null,
        tenderMethodName: "Cash",
        amount: input.unitPrice,
        reference: `CERT-PAY-${suffix}`,
        receivedAt: completedAt
      }
    ]
  };
  const inventoryPayload: StoreInventoryLedgerRecordedPayload = {
    ledgerEntryId,
    storeCode: input.storeCode,
    terminalCode: input.terminalCode,
    inventoryLocationCode: input.inventoryLocationCode,
    productCode: input.productCode,
    movementType: "ADJUSTMENT_POSITIVE",
    quantity: 1,
    unitCost: null,
    referenceType: "MSSQL_UPSTREAM_CERTIFICATION",
    referenceId: transactionId,
    externalReference: transactionNo,
    occurredAt: inventoryRecordedAt
  };
  const closedPayload: StorePosShiftClosedPayload = {
    shiftId,
    shiftNo,
    storeCode: input.storeCode,
    terminalCode: input.terminalCode,
    cashierCode: input.cashierCode,
    openingFloatAmount: 50,
    closingDeclaredCash: input.unitPrice + 50,
    closingVariance: 0,
    openedAt,
    closedAt
  };

  await enqueue("posShift", shiftId, "pos.shift.opened", openedPayload, 1, "ACKNOWLEDGED", openedAt);
  await enqueue(
    "posTransaction",
    transactionId,
    "pos.transaction.completed",
    salePayload,
    1,
    "ACKNOWLEDGED",
    completedAt
  );
  await enqueue(
    "inventoryLedgerEntry",
    ledgerEntryId,
    "inventory.ledger.recorded",
    inventoryPayload,
    1,
    "ACKNOWLEDGED",
    inventoryRecordedAt
  );
  await enqueue("posShift", shiftId, "pos.shift.closed", closedPayload, 2, "ACKNOWLEDGED", closedAt);
  await enqueue(
    "product",
    rejectedAggregateId,
    "catalog.product.published",
    {
      storeCode: input.storeCode,
      productCode: rejectedAggregateId,
      productName: "Rejected upstream product",
      unitPrice: 1
    },
    1,
    "DEAD_LETTER",
    rejectedAt
  );

  return {
    events,
    shiftId,
    transactionId,
    paymentId,
    ledgerEntryId
  };
}

async function verifyCertification(input: {
  storeDatabaseUrl: string;
  eventId: string;
  eventIds: string[];
  expectedRows: ExpectedStoreRow[];
  upstream: UpstreamCertification;
  productCode: string;
  unitPrice: number;
  quantityOnHand: number;
  syncStartedAt: string;
}) {
  const parsed = parseSqlServerUrl(hqDatabaseUrl);
  const hqUrl = buildSqlServerConnectionString(parsed);

  await withPool(input.storeDatabaseUrl, async (pool) => {
    const result = await pool
      .request()
      .input("productCode", input.productCode)
      .query<{ unit_price: number; quantity_on_hand: number }>(`
        SELECT TOP (1) [unit_price], [quantity_on_hand]
        FROM [dbo].[product_snapshot]
        WHERE [product_code] = @productCode
      `);
    const product = result.recordset[0];

    if (!product) {
      throw new Error(`SQL Server store database did not receive ${input.productCode}.`);
    }

    if (Number(product.unit_price) !== input.unitPrice) {
      throw new Error(
        `SQL Server store product price mismatch for ${input.productCode}: expected ${input.unitPrice}, got ${product.unit_price}.`
      );
    }

    if (Number(product.quantity_on_hand) < 0) {
      throw new Error(
        `SQL Server store product ${input.productCode} has a negative on-hand quantity (${product.quantity_on_hand}).`
      );
    }

    for (const expectedRow of input.expectedRows) {
      const rowResult = await pool
        .request()
        .input("keyValue", expectedRow.keyValue)
        .query<{ rowCount: number }>(`
          SELECT COUNT(*) AS [rowCount]
          FROM [dbo].[${expectedRow.tableName}]
          WHERE [${expectedRow.keyColumn}] = @keyValue
        `);
      const rowCount = Number(rowResult.recordset[0]?.rowCount ?? 0);

      if (rowCount < 1) {
        throw new Error(
          `SQL Server store database did not receive the ${expectedRow.label} certification row (${expectedRow.tableName}.${expectedRow.keyColumn}=${expectedRow.keyValue}).`
        );
      }
    }

    const failures = await pool
      .request()
      .input("syncStartedAt", input.syncStartedAt)
      .query<{ failedCount: number; sample: string | null }>(`
        SELECT
          COUNT(*) AS [failedCount],
          MIN(CONCAT([aggregate_type], N':', [event_type], N' -> ', COALESCE([error_message], N''))) AS [sample]
        FROM [dbo].[sync_inbox]
        WHERE [received_at] >= @syncStartedAt
          AND [status] = N'FAILED'
      `);
    const failureRow = failures.recordset[0];

    if (failureRow && Number(failureRow.failedCount) > 0) {
      throw new Error(
        `SQL Server store sync created ${failureRow.failedCount} failed downstream inbox row(s); first failure: ${failureRow.sample ?? "unknown"}.`
      );
    }

    for (const upstreamEvent of input.upstream.events) {
      const result = await pool
        .request()
        .input("eventId", upstreamEvent.eventId)
        .query<{ status: string; acknowledgedAt: Date | null; failureKind: string | null }>(`
          SELECT TOP (1) [status], [acknowledged_at] AS [acknowledgedAt], [failure_kind] AS [failureKind]
          FROM [dbo].[sync_outbox]
          WHERE [id] = @eventId
        `);
      const row = result.recordset[0];

      if (!row) {
        throw new Error(`SQL Server store upstream event ${upstreamEvent.eventId} was not found locally.`);
      }

      if (row.status !== upstreamEvent.expectedStatus) {
        throw new Error(
          `SQL Server store upstream event ${upstreamEvent.eventId} expected ${upstreamEvent.expectedStatus} but was ${row.status}.`
        );
      }

      if (upstreamEvent.expectedStatus === "ACKNOWLEDGED" && !row.acknowledgedAt) {
        throw new Error(`SQL Server store upstream event ${upstreamEvent.eventId} was acknowledged without an acknowledged_at timestamp.`);
      }

      if (upstreamEvent.expectedStatus === "DEAD_LETTER" && !row.failureKind) {
        throw new Error(`SQL Server store rejected upstream event ${upstreamEvent.eventId} without failure diagnostics.`);
      }
    }
  });

  await withPool(hqUrl, async (pool) => {
    for (const eventId of input.eventIds) {
      const result = await pool
        .request()
        .input("eventId", eventId)
        .query<{ status: string; acknowledgedAt: Date | null }>(`
          SELECT TOP (1) [status], [acknowledgedAt]
          FROM [dbo].[SyncOutboxEvent]
          WHERE [id] = @eventId
        `);
      const event = result.recordset[0];

      if (!event) {
        throw new Error(`HQ certification event ${eventId} was not found after sync.`);
      }

      if (event.status !== "ACKNOWLEDGED" || !event.acknowledgedAt) {
        throw new Error(
          `HQ certification event ${eventId} was not acknowledged; status=${event.status}.`
        );
      }
    }

    for (const upstreamEvent of input.upstream.events) {
      const inboundResult = await pool
        .request()
        .input("eventId", upstreamEvent.eventId)
        .query<{ status: string; appliedAt: Date | null; errorMessage: string | null }>(`
          SELECT TOP (1) [status], [appliedAt], [errorMessage]
          FROM [dbo].[SyncInboundEvent]
          WHERE [id] = @eventId
        `);
      const inbound = inboundResult.recordset[0];

      if (!inbound) {
        throw new Error(`HQ did not receive upstream event ${upstreamEvent.eventId}.`);
      }

      if (inbound.status !== upstreamEvent.expectedStatus) {
        throw new Error(
          `HQ upstream event ${upstreamEvent.eventId} expected ${upstreamEvent.expectedStatus} but was ${inbound.status}: ${inbound.errorMessage ?? "no error"}`
        );
      }

      if (upstreamEvent.expectedStatus === "ACKNOWLEDGED" && !inbound.appliedAt) {
        throw new Error(`HQ upstream event ${upstreamEvent.eventId} was acknowledged without projection.`);
      }
    }

    const shiftResult = await pool
      .request()
      .input("shiftId", input.upstream.shiftId)
      .query<{ status: string; closedAt: Date | null }>(`
        SELECT TOP (1) [status], [closedAt]
        FROM [dbo].[PosShift]
        WHERE [id] = @shiftId
      `);
    const shift = shiftResult.recordset[0];

    if (!shift || shift.status !== "CLOSED" || !shift.closedAt) {
      throw new Error(`HQ did not project and close MSSQL upstream shift ${input.upstream.shiftId}.`);
    }

    const transactionResult = await pool
      .request()
      .input("transactionId", input.upstream.transactionId)
      .input("paymentId", input.upstream.paymentId)
      .query<{ transactionCount: number; paymentCount: number }>(`
        SELECT
          (SELECT COUNT(*) FROM [dbo].[PosTransaction] WHERE [id] = @transactionId) AS [transactionCount],
          (SELECT COUNT(*) FROM [dbo].[PosPayment] WHERE [id] = @paymentId) AS [paymentCount]
      `);
    const transactionCounts = transactionResult.recordset[0];

    if (
      Number(transactionCounts?.transactionCount ?? 0) !== 1 ||
      Number(transactionCounts?.paymentCount ?? 0) !== 1
    ) {
      throw new Error(`HQ did not project the MSSQL upstream POS transaction/payment pair.`);
    }

    const ledgerResult = await pool
      .request()
      .input("ledgerEntryId", input.upstream.ledgerEntryId)
      .query<{ ledgerCount: number }>(`
        SELECT COUNT(*) AS [ledgerCount]
        FROM [dbo].[InventoryLedgerEntry]
        WHERE [id] = @ledgerEntryId
      `);

    if (Number(ledgerResult.recordset[0]?.ledgerCount ?? 0) !== 1) {
      throw new Error(`HQ did not project MSSQL upstream inventory ledger entry ${input.upstream.ledgerEntryId}.`);
    }
  });
}

async function main() {
  const storeDatabaseUrl = deriveStoreDatabaseUrl();
  await ensureStoreDatabase(storeDatabaseUrl);
  await provisionStoreSchema(storeDatabaseUrl);
  const certificationEvent = await prepareHqCertificationEvent();
  await seedStoreMetadata(storeDatabaseUrl, {
    retailOrgName: certificationEvent.retailOrgName,
    storeCode: certificationEvent.storeCode,
    storeName: certificationEvent.storeName,
    terminalCode: certificationEvent.terminalCode,
    nodeCode: certificationEvent.nodeCode
  });
  const service = await MssqlStoreService.create({
    connectionString: storeDatabaseUrl,
    deploymentMode: "ENTERPRISE_MANAGED",
    syncBaseUrl: enterpriseBaseUrl,
    terminalCode: certificationEvent.terminalCode,
    connectionTimeoutMs: 8000
  });
  const upstreamCertification = await queueUpstreamCertificationEvents(service, {
    nodeCode: certificationEvent.nodeCode,
    storeCode: certificationEvent.storeCode,
    terminalCode: certificationEvent.terminalCode,
    productCode: certificationEvent.productCode,
    inventoryLocationCode: certificationEvent.inventoryLocationCode,
    cashierCode: certificationEvent.cashierCode,
    unitPrice: certificationEvent.unitPrice
  });
  const syncStartedAt = new Date().toISOString();

  try {
    await service.runSyncCycle({ trigger: "startup" });
  } finally {
    await service.close();
  }

  await verifyCertification({
    storeDatabaseUrl,
    eventId: certificationEvent.eventId,
    eventIds: certificationEvent.eventIds,
    expectedRows: certificationEvent.expectedRows,
    upstream: upstreamCertification,
    productCode: certificationEvent.productCode,
    unitPrice: certificationEvent.unitPrice,
    quantityOnHand: certificationEvent.quantityOnHand,
    syncStartedAt
  });

  console.log(
    `SQL Server store-server sync certification passed for ${storeNodeCode} against MSSQL-backed HQ.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
