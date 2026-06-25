IF COL_LENGTH(N'[dbo].[ErpFuelTankDip]', N'evidenceImageUrl') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFuelTankDip] ADD [evidenceImageUrl] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH(N'[dbo].[ErpFuelTankDip]', N'evidenceFileName') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFuelTankDip] ADD [evidenceFileName] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH(N'[dbo].[ErpFuelTankDip]', N'evidenceCapturedAt') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFuelTankDip] ADD [evidenceCapturedAt] DATETIME2 NULL;
END;

IF COL_LENGTH(N'[dbo].[ErpFuelTankDip]', N'evidenceUploadedAt') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFuelTankDip] ADD [evidenceUploadedAt] DATETIME2 NULL;
END;

IF COL_LENGTH(N'[dbo].[ErpFuelMeterReading]', N'evidenceImageUrl') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFuelMeterReading] ADD [evidenceImageUrl] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH(N'[dbo].[ErpFuelMeterReading]', N'evidenceFileName') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFuelMeterReading] ADD [evidenceFileName] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH(N'[dbo].[ErpFuelMeterReading]', N'evidenceCapturedAt') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFuelMeterReading] ADD [evidenceCapturedAt] DATETIME2 NULL;
END;

IF COL_LENGTH(N'[dbo].[ErpFuelMeterReading]', N'evidenceUploadedAt') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFuelMeterReading] ADD [evidenceUploadedAt] DATETIME2 NULL;
END;
