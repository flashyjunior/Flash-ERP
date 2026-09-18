IF OBJECT_ID(N'[dbo].[SalesOrderInventoryReservation]', N'U') IS NOT NULL
  AND OBJECT_ID(N'[dbo].[SalesOrder]', N'U') IS NOT NULL
  AND OBJECT_ID(N'[dbo].[EcommerceOrder]', N'U') IS NOT NULL
BEGIN
  DECLARE @reconciledAt DATETIME2(3) = SYSUTCDATETIME();

  UPDATE [reservation]
  SET
    [status] = CASE [sales].[status]
      WHEN N'FULFILLED' THEN N'CONSUMED'
      WHEN N'CANCELLED' THEN N'RELEASED'
      WHEN N'EXPIRED' THEN N'EXPIRED'
    END,
    [releaseReason] = COALESCE(
      NULLIF([reservation].[releaseReason], N''),
      CONCAT(N'Backfilled from terminal ecommerce sales order ', [sales].[orderNo], N' (', [sales].[status], N').')
    ),
    [releasedAt] = COALESCE(
      [reservation].[releasedAt],
      [sales].[fulfilledAt],
      [sales].[cancelledAt],
      [sales].[expiredAt],
      [ecommerce].[deliveredAt],
      [ecommerce].[cancelledAt],
      @reconciledAt
    ),
    [updatedAt] = @reconciledAt
  FROM [dbo].[SalesOrderInventoryReservation] AS [reservation]
  INNER JOIN [dbo].[SalesOrder] AS [sales]
    ON [sales].[id] = [reservation].[salesOrderId]
  INNER JOIN [dbo].[EcommerceOrder] AS [ecommerce]
    ON [ecommerce].[salesOrderId] = [sales].[id]
    AND [ecommerce].[retailOrgId] = [sales].[retailOrgId]
  WHERE [reservation].[status] = N'ACTIVE'
    AND [sales].[status] IN (N'FULFILLED', N'CANCELLED', N'EXPIRED');

  UPDATE [sales]
  SET
    [reservationStatus] = CASE [sales].[status]
      WHEN N'FULFILLED' THEN N'CONSUMED'
      WHEN N'CANCELLED' THEN N'RELEASED'
      WHEN N'EXPIRED' THEN N'EXPIRED'
    END,
    [reservationReleasedAt] = COALESCE(
      [sales].[reservationReleasedAt],
      [sales].[fulfilledAt],
      [sales].[cancelledAt],
      [sales].[expiredAt],
      [ecommerce].[deliveredAt],
      [ecommerce].[cancelledAt],
      @reconciledAt
    ),
    [updatedAt] = @reconciledAt
  FROM [dbo].[SalesOrder] AS [sales]
  INNER JOIN [dbo].[EcommerceOrder] AS [ecommerce]
    ON [ecommerce].[salesOrderId] = [sales].[id]
    AND [ecommerce].[retailOrgId] = [sales].[retailOrgId]
  WHERE [sales].[status] IN (N'FULFILLED', N'CANCELLED', N'EXPIRED')
    AND [sales].[reservationStatus] = N'ACTIVE';
END;
