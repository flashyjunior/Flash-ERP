SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'[dbo].[Permission]', N'U') IS NULL
   OR OBJECT_ID(N'[dbo].[Role]', N'U') IS NULL
   OR OBJECT_ID(N'[dbo].[RolePermission]', N'U') IS NULL
BEGIN
    THROW 51000, 'Permission, Role, and RolePermission must exist before Flash support access is reconciled.', 1;
END;

DECLARE @Now DATETIME2 = SYSUTCDATETIME();

BEGIN TRANSACTION;

INSERT INTO [dbo].[RolePermission] ([roleId], [permissionId], [createdAt])
SELECT
    [role].[id],
    [permission].[id],
    @Now
FROM [dbo].[Role] AS [role]
CROSS JOIN [dbo].[Permission] AS [permission]
WHERE [role].[code] = N'FLASH_SUPPORT'
  AND NOT EXISTS (
      SELECT 1
      FROM [dbo].[RolePermission] AS [existing]
      WHERE [existing].[roleId] = [role].[id]
        AND [existing].[permissionId] = [permission].[id]
  );

COMMIT TRANSACTION;
