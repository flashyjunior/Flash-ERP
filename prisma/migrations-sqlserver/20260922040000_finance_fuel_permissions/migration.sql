SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'[dbo].[Permission]', N'U') IS NULL
   OR OBJECT_ID(N'[dbo].[Role]', N'U') IS NULL
   OR OBJECT_ID(N'[dbo].[RolePermission]', N'U') IS NULL
BEGIN
    THROW 51000, 'Permission, Role, and RolePermission must exist before Finance and HQ fuel permissions are seeded.', 1;
END;

DECLARE @Now DATETIME2 = SYSUTCDATETIME();
DECLARE @PermissionSeed TABLE (
    [code] NVARCHAR(100) NOT NULL PRIMARY KEY,
    [name] NVARCHAR(200) NOT NULL,
    [description] NVARCHAR(1000) NULL
);

INSERT INTO @PermissionSeed ([code], [name], [description])
VALUES
    (N'finance.view', N'View finance', N'View general-ledger balances, financial statements, journals, and finance inquiries.'),
    (N'finance.manage', N'Manage finance operations', N'Prepare finance documents, settlements, cashbook activity, budgets, payroll batches, and asset transactions.'),
    (N'finance.post', N'Post finance transactions', N'Post prepared journals, operational documents, settlements, cashbook entries, payroll batches, and asset transactions.'),
    (N'finance.approve', N'Approve finance controls', N'Approve or lock budgets, close fiscal periods, and perform controlled finance reversals.'),
    (N'finance.setup.manage', N'Manage finance setup', N'Maintain accounting settings, fiscal calendars, currencies, accounts, posting profiles, tax setup, and document numbering.'),
    (N'fuel.hq.view', N'View HQ fuel operations', N'View enterprise fuel stations, tanks, pumps, deliveries, sales, evidence, and reconciliation posture.'),
    (N'fuel.hq.manage', N'Manage HQ fuel operations', N'Maintain enterprise fuel setup and record or fulfil HQ fuel operations.');

BEGIN TRANSACTION;

MERGE [dbo].[Permission] WITH (HOLDLOCK) AS [target]
USING @PermissionSeed AS [source]
ON [target].[code] = [source].[code]
WHEN MATCHED THEN
    UPDATE SET
        [target].[name] = [source].[name],
        [target].[description] = [source].[description],
        [target].[updatedAt] = @Now
WHEN NOT MATCHED THEN
    INSERT ([id], [code], [name], [description], [createdAt], [updatedAt])
    VALUES (CONVERT(NVARCHAR(36), NEWID()), [source].[code], [source].[name], [source].[description], @Now, @Now);

INSERT INTO [dbo].[RolePermission] ([roleId], [permissionId], [createdAt])
SELECT
    [role].[id],
    [permission].[id],
    @Now
FROM [dbo].[Role] AS [role]
CROSS JOIN @PermissionSeed AS [seed]
INNER JOIN [dbo].[Permission] AS [permission]
    ON [permission].[code] = [seed].[code]
WHERE [role].[code] = N'HQ_ADMIN'
  AND NOT EXISTS (
      SELECT 1
      FROM [dbo].[RolePermission] AS [existing]
      WHERE [existing].[roleId] = [role].[id]
        AND [existing].[permissionId] = [permission].[id]
  );

COMMIT TRANSACTION;
