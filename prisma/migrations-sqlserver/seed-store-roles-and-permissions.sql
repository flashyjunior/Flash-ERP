/*
  Flash ERP hosted SQL Server role/permission seed.

  Purpose:
  - Shows the current role and permission mappings for the active retail org.
  - Seeds store and online-store roles without touching HQ_ADMIN.
  - Reconciles only these role codes:
      STORE_MANAGER
      STORE_CASHIER
      STORE_SUPERVISOR
      ONLINE_STORE_CASHIER
      ONLINE_STORE_SUPERVISOR

  Safe to rerun.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Now DATETIME2 = SYSUTCDATETIME();
DECLARE @RetailOrgId NVARCHAR(1000);

SELECT TOP (1)
  @RetailOrgId = [retailOrgId]
FROM [dbo].[Role]
WHERE [code] = N'HQ_ADMIN'
ORDER BY [createdAt] ASC;

IF @RetailOrgId IS NULL
BEGIN
  SELECT TOP (1)
    @RetailOrgId = [id]
  FROM [dbo].[RetailOrg]
  ORDER BY [createdAt] ASC;
END;

IF @RetailOrgId IS NULL
BEGIN
  THROW 51000, 'No RetailOrg was found. Bootstrap the HQ admin/retail organisation before running this script.', 1;
END;

PRINT N'Using retailOrgId: ' + @RetailOrgId;

PRINT N'Current role summary before seed:';
SELECT
  r.[code] AS [roleCode],
  r.[name] AS [roleName],
  r.[status],
  COUNT(rp.[permissionId]) AS [permissionCount]
FROM [dbo].[Role] r
LEFT JOIN [dbo].[RolePermission] rp ON rp.[roleId] = r.[id]
WHERE r.[retailOrgId] = @RetailOrgId
GROUP BY r.[code], r.[name], r.[status]
ORDER BY r.[code];

PRINT N'Current role permission details before seed:';
SELECT
  r.[code] AS [roleCode],
  r.[name] AS [roleName],
  p.[code] AS [permissionCode],
  p.[name] AS [permissionName]
FROM [dbo].[Role] r
LEFT JOIN [dbo].[RolePermission] rp ON rp.[roleId] = r.[id]
LEFT JOIN [dbo].[Permission] p ON p.[id] = rp.[permissionId]
WHERE r.[retailOrgId] = @RetailOrgId
ORDER BY r.[code], p.[code];

DECLARE @PermissionSeed TABLE (
  [code] NVARCHAR(1000) NOT NULL PRIMARY KEY,
  [name] NVARCHAR(1000) NOT NULL,
  [description] NVARCHAR(1000) NULL
);

INSERT INTO @PermissionSeed ([code], [name], [description])
VALUES
  (N'inventory.view', N'View inventory', N'View inventory posture, balances, counts, and serial state.'),
  (N'inventory.adjust', N'Adjust inventory', N'Post positive or negative inventory adjustments.'),
  (N'inventory.count.submit', N'Submit stock counts', N'Submit local physical stock count sessions for enterprise visibility.'),
  (N'inventory.count.commit', N'Commit stock counts', N'Commit local stock counts into live stock posture.'),
  (N'inventory.transfer.request', N'Request transfers', N'Raise branch-initiated inter-store transfer-in requests.'),
  (N'inventory.transfer.issue', N'Issue transfers', N'Issue stock out against enterprise-issued or approved transfer instructions.'),
  (N'inventory.transfer.receive', N'Receive transfers', N'Receive stock into the destination location against transfer instructions.'),
  (N'inventory.grn.receive', N'Receive goods', N'Receive purchase orders into stock and post goods receipts.'),
  (N'inventory.supplier-return.manage', N'Manage supplier returns', N'Post, review, and cancel supplier returns and exception posture.'),
  (N'fuel.station.view', N'View fuel operations', N'Open the online-store fuel operations workspace for station-side fuel capture.'),
  (N'fuel.tank.manage', N'Manage fuel tanks', N'Create and maintain station fuel tank records from the online-store fuel workspace.'),
  (N'fuel.dip.capture', N'Capture tank dips', N'Record fuel tank dip readings with evidence from the online-store fuel workspace.'),
  (N'fuel.meter-reading.capture', N'Capture meter readings', N'Record fuel meter/nozzle readings with evidence from the online-store fuel workspace.'),
  (N'fuel.supplier-receipt.capture', N'Capture fuel receipts', N'Record supplier fuel receipts into station tanks from the online-store fuel workspace.'),
  (N'fuel.reconciliation.manage', N'Manage fuel reconciliation', N'Review station fuel reconciliation from the online-store fuel workspace.'),
  (N'pos.shift.open', N'Open shift', N'Open a POS shift and start a branch till session.'),
  (N'pos.shift.close', N'Close shift', N'Close and reconcile a POS shift.'),
  (N'pos.sale.process', N'Process sales', N'Capture normal sales and complete baskets at POS.'),
  (N'pos.return.process', N'Process returns', N'Process receipt-backed returns and normal refund flows.'),
  (N'pos.exchange.process', N'Process exchanges', N'Process receipt-backed exchanges and net-refund exchanges.'),
  (N'pos.override.no-receipt-return', N'Approve receipt-less corrections', N'Approve return or exchange corrections without an original receipt.'),
  (N'pos.override.discount', N'Approve discount overrides', N'Approve discounts or manual markdown overrides beyond cashier allowance.'),
  (N'pos.override.price', N'Approve price overrides', N'Approve manual price changes and exceptional pricing actions.'),
  (N'pos.receipt.search', N'Search receipts', N'Search local receipt history beyond direct receipt number entry.'),
  (N'pos.receipt.reprint', N'Reprint receipts', N'Reprint thermal receipts from recent history or receipt search.'),
  (N'pos.customer.attach', N'Attach customers', N'Attach and change customers on a basket or correction flow.'),
  (N'pos.customer.account.collect', N'Collect account payments', N'Collect customer account payments at the branch lane.'),
  (N'pos.loyalty.redeem', N'Redeem loyalty', N'Redeem loyalty points at POS subject to enterprise policy.');

DECLARE @RoleSeed TABLE (
  [code] NVARCHAR(1000) NOT NULL PRIMARY KEY,
  [name] NVARCHAR(1000) NOT NULL,
  [description] NVARCHAR(1000) NULL
);

INSERT INTO @RoleSeed ([code], [name], [description])
VALUES
  (N'STORE_MANAGER', N'Store Manager', N'Store operations manager role for Flash ERP store desktops.'),
  (N'STORE_CASHIER', N'Store Cashier', N'Cashier lane role for Flash ERP store desktops.'),
  (N'STORE_SUPERVISOR', N'Store Supervisor', N'Supervisor and store operations role for Flash ERP desktops.'),
  (N'ONLINE_STORE_CASHIER', N'Online Store Cashier', N'Browser POS cashier role for Flash ERP online-direct stores.'),
  (N'ONLINE_STORE_SUPERVISOR', N'Online Store Supervisor', N'Browser POS supervisor role for Flash ERP online-direct stores.');

DECLARE @RolePermissionSeed TABLE (
  [roleCode] NVARCHAR(1000) NOT NULL,
  [permissionCode] NVARCHAR(1000) NOT NULL,
  PRIMARY KEY ([roleCode], [permissionCode])
);

INSERT INTO @RolePermissionSeed ([roleCode], [permissionCode])
VALUES
  (N'STORE_CASHIER', N'pos.shift.open'),
  (N'STORE_CASHIER', N'pos.shift.close'),
  (N'STORE_CASHIER', N'pos.sale.process'),
  (N'STORE_CASHIER', N'pos.return.process'),
  (N'STORE_CASHIER', N'pos.exchange.process'),
  (N'STORE_CASHIER', N'pos.receipt.search'),
  (N'STORE_CASHIER', N'pos.receipt.reprint'),
  (N'STORE_CASHIER', N'pos.customer.attach'),
  (N'STORE_CASHIER', N'pos.customer.account.collect'),
  (N'STORE_CASHIER', N'pos.loyalty.redeem'),

  (N'STORE_SUPERVISOR', N'pos.shift.open'),
  (N'STORE_SUPERVISOR', N'pos.shift.close'),
  (N'STORE_SUPERVISOR', N'pos.sale.process'),
  (N'STORE_SUPERVISOR', N'pos.return.process'),
  (N'STORE_SUPERVISOR', N'pos.exchange.process'),
  (N'STORE_SUPERVISOR', N'pos.receipt.search'),
  (N'STORE_SUPERVISOR', N'pos.receipt.reprint'),
  (N'STORE_SUPERVISOR', N'pos.customer.attach'),
  (N'STORE_SUPERVISOR', N'pos.customer.account.collect'),
  (N'STORE_SUPERVISOR', N'pos.loyalty.redeem'),
  (N'STORE_SUPERVISOR', N'pos.override.no-receipt-return'),
  (N'STORE_SUPERVISOR', N'pos.override.discount'),
  (N'STORE_SUPERVISOR', N'pos.override.price'),
  (N'STORE_SUPERVISOR', N'inventory.view'),
  (N'STORE_SUPERVISOR', N'inventory.adjust'),
  (N'STORE_SUPERVISOR', N'inventory.count.submit'),
  (N'STORE_SUPERVISOR', N'inventory.count.commit'),
  (N'STORE_SUPERVISOR', N'inventory.transfer.request'),
  (N'STORE_SUPERVISOR', N'inventory.transfer.issue'),
  (N'STORE_SUPERVISOR', N'inventory.transfer.receive'),
  (N'STORE_SUPERVISOR', N'inventory.grn.receive'),
  (N'STORE_SUPERVISOR', N'inventory.supplier-return.manage'),

  (N'STORE_MANAGER', N'inventory.view'),
  (N'STORE_MANAGER', N'inventory.adjust'),
  (N'STORE_MANAGER', N'inventory.count.submit'),
  (N'STORE_MANAGER', N'inventory.count.commit'),
  (N'STORE_MANAGER', N'inventory.transfer.request'),
  (N'STORE_MANAGER', N'inventory.transfer.issue'),
  (N'STORE_MANAGER', N'inventory.transfer.receive'),
  (N'STORE_MANAGER', N'inventory.grn.receive'),
  (N'STORE_MANAGER', N'inventory.supplier-return.manage'),
  (N'STORE_MANAGER', N'pos.shift.open'),
  (N'STORE_MANAGER', N'pos.shift.close'),
  (N'STORE_MANAGER', N'pos.sale.process'),
  (N'STORE_MANAGER', N'pos.return.process'),
  (N'STORE_MANAGER', N'pos.exchange.process'),
  (N'STORE_MANAGER', N'pos.override.no-receipt-return'),
  (N'STORE_MANAGER', N'pos.receipt.search'),
  (N'STORE_MANAGER', N'pos.receipt.reprint'),
  (N'STORE_MANAGER', N'pos.customer.attach'),
  (N'STORE_MANAGER', N'pos.customer.account.collect'),
  (N'STORE_MANAGER', N'pos.loyalty.redeem'),
  (N'STORE_MANAGER', N'fuel.station.view'),
  (N'STORE_MANAGER', N'fuel.tank.manage'),
  (N'STORE_MANAGER', N'fuel.dip.capture'),
  (N'STORE_MANAGER', N'fuel.meter-reading.capture'),
  (N'STORE_MANAGER', N'fuel.supplier-receipt.capture'),
  (N'STORE_MANAGER', N'fuel.reconciliation.manage'),

  (N'ONLINE_STORE_CASHIER', N'pos.shift.open'),
  (N'ONLINE_STORE_CASHIER', N'pos.shift.close'),
  (N'ONLINE_STORE_CASHIER', N'pos.sale.process'),
  (N'ONLINE_STORE_CASHIER', N'pos.return.process'),
  (N'ONLINE_STORE_CASHIER', N'pos.exchange.process'),
  (N'ONLINE_STORE_CASHIER', N'pos.receipt.search'),
  (N'ONLINE_STORE_CASHIER', N'pos.receipt.reprint'),
  (N'ONLINE_STORE_CASHIER', N'pos.customer.attach'),
  (N'ONLINE_STORE_CASHIER', N'pos.customer.account.collect'),
  (N'ONLINE_STORE_CASHIER', N'pos.loyalty.redeem'),
  (N'ONLINE_STORE_CASHIER', N'inventory.view'),
  (N'ONLINE_STORE_CASHIER', N'inventory.transfer.request'),

  (N'ONLINE_STORE_SUPERVISOR', N'pos.shift.open'),
  (N'ONLINE_STORE_SUPERVISOR', N'pos.shift.close'),
  (N'ONLINE_STORE_SUPERVISOR', N'pos.sale.process'),
  (N'ONLINE_STORE_SUPERVISOR', N'pos.return.process'),
  (N'ONLINE_STORE_SUPERVISOR', N'pos.exchange.process'),
  (N'ONLINE_STORE_SUPERVISOR', N'pos.receipt.search'),
  (N'ONLINE_STORE_SUPERVISOR', N'pos.receipt.reprint'),
  (N'ONLINE_STORE_SUPERVISOR', N'pos.customer.attach'),
  (N'ONLINE_STORE_SUPERVISOR', N'pos.customer.account.collect'),
  (N'ONLINE_STORE_SUPERVISOR', N'pos.loyalty.redeem'),
  (N'ONLINE_STORE_SUPERVISOR', N'pos.override.no-receipt-return'),
  (N'ONLINE_STORE_SUPERVISOR', N'pos.override.discount'),
  (N'ONLINE_STORE_SUPERVISOR', N'pos.override.price'),
  (N'ONLINE_STORE_SUPERVISOR', N'inventory.view'),
  (N'ONLINE_STORE_SUPERVISOR', N'inventory.adjust'),
  (N'ONLINE_STORE_SUPERVISOR', N'inventory.count.submit'),
  (N'ONLINE_STORE_SUPERVISOR', N'inventory.count.commit'),
  (N'ONLINE_STORE_SUPERVISOR', N'inventory.transfer.request'),
  (N'ONLINE_STORE_SUPERVISOR', N'inventory.transfer.issue'),
  (N'ONLINE_STORE_SUPERVISOR', N'inventory.transfer.receive'),
  (N'ONLINE_STORE_SUPERVISOR', N'inventory.grn.receive'),
  (N'ONLINE_STORE_SUPERVISOR', N'inventory.supplier-return.manage'),
  (N'ONLINE_STORE_SUPERVISOR', N'fuel.station.view'),
  (N'ONLINE_STORE_SUPERVISOR', N'fuel.tank.manage'),
  (N'ONLINE_STORE_SUPERVISOR', N'fuel.dip.capture'),
  (N'ONLINE_STORE_SUPERVISOR', N'fuel.meter-reading.capture'),
  (N'ONLINE_STORE_SUPERVISOR', N'fuel.supplier-receipt.capture'),
  (N'ONLINE_STORE_SUPERVISOR', N'fuel.reconciliation.manage');

BEGIN TRANSACTION;

MERGE [dbo].[Permission] WITH (HOLDLOCK) AS target
USING @PermissionSeed AS source
ON target.[code] = source.[code]
WHEN MATCHED THEN
  UPDATE SET
    target.[name] = source.[name],
    target.[description] = source.[description],
    target.[updatedAt] = @Now
WHEN NOT MATCHED THEN
  INSERT ([id], [code], [name], [description], [createdAt], [updatedAt])
  VALUES (CONVERT(NVARCHAR(36), NEWID()), source.[code], source.[name], source.[description], @Now, @Now);

MERGE [dbo].[Role] WITH (HOLDLOCK) AS target
USING @RoleSeed AS source
ON target.[retailOrgId] = @RetailOrgId
  AND target.[code] = source.[code]
WHEN MATCHED THEN
  UPDATE SET
    target.[name] = source.[name],
    target.[description] = source.[description],
    target.[status] = N'ACTIVE',
    target.[updatedAt] = @Now
WHEN NOT MATCHED THEN
  INSERT ([id], [retailOrgId], [code], [name], [description], [status], [createdAt], [updatedAt])
  VALUES (CONVERT(NVARCHAR(36), NEWID()), @RetailOrgId, source.[code], source.[name], source.[description], N'ACTIVE', @Now, @Now);

IF EXISTS (
  SELECT 1
  FROM @RolePermissionSeed seed
  LEFT JOIN [dbo].[Permission] p ON p.[code] = seed.[permissionCode]
  WHERE p.[id] IS NULL
)
BEGIN
  THROW 51001, 'One or more permission codes could not be resolved.', 1;
END;

DELETE rp
FROM [dbo].[RolePermission] rp
INNER JOIN [dbo].[Role] r ON r.[id] = rp.[roleId]
WHERE r.[retailOrgId] = @RetailOrgId
  AND r.[code] IN (SELECT [code] FROM @RoleSeed)
  AND NOT EXISTS (
    SELECT 1
    FROM @RolePermissionSeed seed
    INNER JOIN [dbo].[Permission] p ON p.[code] = seed.[permissionCode]
    WHERE seed.[roleCode] = r.[code]
      AND p.[id] = rp.[permissionId]
  );

INSERT INTO [dbo].[RolePermission] ([roleId], [permissionId], [createdAt])
SELECT
  r.[id],
  p.[id],
  @Now
FROM @RolePermissionSeed seed
INNER JOIN [dbo].[Role] r
  ON r.[retailOrgId] = @RetailOrgId
  AND r.[code] = seed.[roleCode]
INNER JOIN [dbo].[Permission] p
  ON p.[code] = seed.[permissionCode]
WHERE NOT EXISTS (
  SELECT 1
  FROM [dbo].[RolePermission] existing
  WHERE existing.[roleId] = r.[id]
    AND existing.[permissionId] = p.[id]
);

COMMIT TRANSACTION;

PRINT N'Role summary after seed:';
SELECT
  r.[code] AS [roleCode],
  r.[name] AS [roleName],
  r.[status],
  COUNT(rp.[permissionId]) AS [permissionCount]
FROM [dbo].[Role] r
LEFT JOIN [dbo].[RolePermission] rp ON rp.[roleId] = r.[id]
WHERE r.[retailOrgId] = @RetailOrgId
GROUP BY r.[code], r.[name], r.[status]
ORDER BY r.[code];

PRINT N'Seeded role permission details after seed:';
SELECT
  r.[code] AS [roleCode],
  r.[name] AS [roleName],
  p.[code] AS [permissionCode],
  p.[name] AS [permissionName]
FROM [dbo].[Role] r
INNER JOIN [dbo].[RolePermission] rp ON rp.[roleId] = r.[id]
INNER JOIN [dbo].[Permission] p ON p.[id] = rp.[permissionId]
WHERE r.[retailOrgId] = @RetailOrgId
  AND r.[code] IN (SELECT [code] FROM @RoleSeed)
ORDER BY r.[code], p.[code];
