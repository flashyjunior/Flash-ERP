BEGIN TRY

BEGIN TRAN;

IF COL_LENGTH('dbo.ErpFuelPump', 'tankId') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFuelPump] ADD [tankId] NVARCHAR(1000);
END;

-- SQL Server compiles the full batch before executing the ALTER above. Keep
-- references to the newly-added column in a separately compiled dynamic batch.
EXEC sp_executesql N'
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N''ErpFuelPump_tankId_status_idx''
      AND object_id = OBJECT_ID(N''dbo.ErpFuelPump'')
)
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelPump_tankId_status_idx] ON [dbo].[ErpFuelPump]([tankId], [status]);
END;

;WITH PumpTankChoice AS (
    SELECT
        nozzle.[pumpId],
        nozzle.[tankId],
        ROW_NUMBER() OVER (
            PARTITION BY nozzle.[pumpId]
            ORDER BY COUNT(*) DESC, MIN(nozzle.[createdAt]) ASC
        ) AS [rank]
    FROM [dbo].[ErpFuelNozzle] nozzle
    WHERE nozzle.[tankId] IS NOT NULL
    GROUP BY nozzle.[pumpId], nozzle.[tankId]
)
UPDATE pump
SET
    pump.[tankId] = choice.[tankId],
    pump.[operatingSiteId] = COALESCE(pump.[operatingSiteId], tank.[operatingSiteId])
FROM [dbo].[ErpFuelPump] pump
INNER JOIN PumpTankChoice choice
    ON choice.[pumpId] = pump.[id]
   AND choice.[rank] = 1
INNER JOIN [dbo].[ErpFuelTank] tank
    ON tank.[id] = choice.[tankId]
WHERE pump.[tankId] IS NULL;
';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW;

END CATCH
