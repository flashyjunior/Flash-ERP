-- Permit one ecommerce sales-order line to reserve stock at more than one inventory location.
-- A location can still have only one active allocation for the same order line.

IF EXISTS (
  SELECT 1
  FROM sys.key_constraints
  WHERE [name] = N'SalesOrderInventoryReservation_salesOrderId_salesOrderLineId_key'
    AND [parent_object_id] = OBJECT_ID(N'[dbo].[SalesOrderInventoryReservation]')
)
BEGIN
  ALTER TABLE [dbo].[SalesOrderInventoryReservation]
    DROP CONSTRAINT [SalesOrderInventoryReservation_salesOrderId_salesOrderLineId_key];
END
ELSE IF EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE [name] = N'SalesOrderInventoryReservation_salesOrderId_salesOrderLineId_key'
    AND [object_id] = OBJECT_ID(N'[dbo].[SalesOrderInventoryReservation]')
)
BEGIN
  DROP INDEX [SalesOrderInventoryReservation_salesOrderId_salesOrderLineId_key]
    ON [dbo].[SalesOrderInventoryReservation];
END

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE [name] = N'SalesOrderInventoryReservation_salesOrderId_salesOrderLineId_inventoryLocationId_key'
    AND [object_id] = OBJECT_ID(N'[dbo].[SalesOrderInventoryReservation]')
)
BEGIN
  CREATE UNIQUE NONCLUSTERED INDEX [SalesOrderInventoryReservation_salesOrderId_salesOrderLineId_inventoryLocationId_key]
    ON [dbo].[SalesOrderInventoryReservation]([salesOrderId], [salesOrderLineId], [inventoryLocationId]);
END
