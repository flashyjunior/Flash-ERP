ALTER TABLE [dbo].[ErpFuelStation] ADD
    [storeId] NVARCHAR(1000) NULL,
    [inventoryLocationId] NVARCHAR(1000) NULL;

CREATE INDEX [ErpFuelStation_storeId_idx] ON [dbo].[ErpFuelStation]([storeId]);
CREATE INDEX [ErpFuelStation_inventoryLocationId_idx] ON [dbo].[ErpFuelStation]([inventoryLocationId]);

ALTER TABLE [dbo].[InterStoreTransfer] ADD
    [fuelStationId] NVARCHAR(1000) NULL,
    [sourceFuelTankId] NVARCHAR(1000) NULL,
    [workflowType] NVARCHAR(1000) NULL,
    [transporterName] NVARCHAR(1000) NULL,
    [vehicleRegistrationNo] NVARCHAR(1000) NULL,
    [driverName] NVARCHAR(1000) NULL,
    [driverContact] NVARCHAR(1000) NULL,
    [deliveryNoteNo] NVARCHAR(1000) NULL,
    [feedbackStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [InterStoreTransfer_feedbackStatus_df] DEFAULT N'PENDING',
    [waterTestResult] NVARCHAR(1000) NULL,
    [quantityBeforeDelivery] DECIMAL(18, 3) NULL,
    [expectedQuantityReceived] DECIMAL(18, 3) NULL,
    [expectedStockQuantity] DECIMAL(18, 3) NULL,
    [quantityAfterDelivery] DECIMAL(18, 3) NULL,
    [actualQuantityReceived] DECIMAL(18, 3) NULL,
    [feedbackVarianceQuantity] DECIMAL(18, 3) NULL,
    [feedbackNote] NVARCHAR(MAX) NULL,
    [feedbackRecordedAt] DATETIME2 NULL,
    [feedbackConfirmedAt] DATETIME2 NULL,
    [feedbackPostedAt] DATETIME2 NULL,
    [feedbackOperatorName] NVARCHAR(1000) NULL;

CREATE INDEX [InterStoreTransfer_fuelStationId_idx] ON [dbo].[InterStoreTransfer]([fuelStationId]);
CREATE INDEX [InterStoreTransfer_sourceFuelTankId_requestedAt_idx] ON [dbo].[InterStoreTransfer]([sourceFuelTankId], [requestedAt]);
CREATE INDEX [InterStoreTransfer_retailOrgId_workflowType_status_idx] ON [dbo].[InterStoreTransfer]([retailOrgId], [workflowType], [status]);
