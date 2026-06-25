IF OBJECT_ID(N'dbo.ErpFuelStation', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.ErpFuelStation', N'gpsLatitude') IS NULL
    BEGIN
        ALTER TABLE [dbo].[ErpFuelStation]
            ADD [gpsLatitude] DECIMAL(10, 7) NULL;
    END;

    IF COL_LENGTH(N'dbo.ErpFuelStation', N'gpsLongitude') IS NULL
    BEGIN
        ALTER TABLE [dbo].[ErpFuelStation]
            ADD [gpsLongitude] DECIMAL(10, 7) NULL;
    END;
END;
