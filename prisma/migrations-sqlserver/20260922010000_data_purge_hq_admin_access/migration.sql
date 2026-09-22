IF OBJECT_ID(N'[dbo].[Permission]', N'U') IS NOT NULL
   AND OBJECT_ID(N'[dbo].[Role]', N'U') IS NOT NULL
   AND OBJECT_ID(N'[dbo].[RolePermission]', N'U') IS NOT NULL
BEGIN
    DECLARE @DataPurgePermissionId NVARCHAR(1000);

    SELECT @DataPurgePermissionId = [id]
    FROM [dbo].[Permission]
    WHERE [code] = N'security.data-purge.execute';

    IF @DataPurgePermissionId IS NULL
    BEGIN
        SET @DataPurgePermissionId = LOWER(CONVERT(NVARCHAR(36), NEWID()));

        INSERT INTO [dbo].[Permission] (
            [id],
            [code],
            [name],
            [description],
            [createdAt],
            [updatedAt]
        )
        VALUES (
            @DataPurgePermissionId,
            N'security.data-purge.execute',
            N'Purge enterprise data',
            N'Irreversibly delete transactional and selected master data for the whole organisation.',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        );
    END
    ELSE
    BEGIN
        UPDATE [dbo].[Permission]
        SET
            [name] = N'Purge enterprise data',
            [description] = N'Irreversibly delete transactional and selected master data for the whole organisation.',
            [updatedAt] = CURRENT_TIMESTAMP
        WHERE [id] = @DataPurgePermissionId;
    END;

    INSERT INTO [dbo].[RolePermission] ([roleId], [permissionId], [createdAt])
    SELECT [role].[id], @DataPurgePermissionId, CURRENT_TIMESTAMP
    FROM [dbo].[Role] AS [role]
    WHERE [role].[code] = N'HQ_ADMIN'
      AND [role].[status] = N'ACTIVE'
      AND NOT EXISTS (
          SELECT 1
          FROM [dbo].[RolePermission] AS [grant]
          WHERE [grant].[roleId] = [role].[id]
            AND [grant].[permissionId] = @DataPurgePermissionId
      );
END;
