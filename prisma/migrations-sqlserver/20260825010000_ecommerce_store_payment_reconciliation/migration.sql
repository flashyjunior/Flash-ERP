IF OBJECT_ID(N'[dbo].[EcommerceOrder]', N'U') IS NOT NULL
  AND OBJECT_ID(N'[dbo].[SalesOrder]', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.EcommerceOrder', N'paidAmount') IS NOT NULL
  AND COL_LENGTH(N'dbo.EcommerceOrder', N'balanceAmount') IS NOT NULL
  AND COL_LENGTH(N'dbo.EcommerceOrder', N'paymentStatus') IS NOT NULL
  AND COL_LENGTH(N'dbo.SalesOrder', N'paidAmount') IS NOT NULL
  AND COL_LENGTH(N'dbo.SalesOrder', N'balanceAmount') IS NOT NULL
BEGIN
  UPDATE [ecommerce]
  SET
    [paidAmount] = CASE
      WHEN [sales].[paidAmount] < 0 THEN 0
      ELSE [sales].[paidAmount]
    END,
    [balanceAmount] = CASE
      WHEN [sales].[balanceAmount] < 0 THEN 0
      ELSE [sales].[balanceAmount]
    END,
    [paymentStatus] = CASE
      WHEN [sales].[balanceAmount] <= 0.005 AND [sales].[paidAmount] > 0.005 THEN N'PAID'
      WHEN [sales].[paidAmount] > 0.005 THEN N'PARTIALLY_PAID'
      ELSE N'UNPAID'
    END,
    [updatedAt] = SYSUTCDATETIME()
  FROM [dbo].[EcommerceOrder] AS [ecommerce]
  INNER JOIN [dbo].[SalesOrder] AS [sales]
    ON [sales].[id] = [ecommerce].[salesOrderId]
    AND [sales].[retailOrgId] = [ecommerce].[retailOrgId]
  WHERE [sales].[status] IN (N'OPEN', N'FULFILLED')
    AND (
      [ecommerce].[paidAmount] <> CASE
        WHEN [sales].[paidAmount] < 0 THEN 0
        ELSE [sales].[paidAmount]
      END
      OR [ecommerce].[balanceAmount] <> CASE
        WHEN [sales].[balanceAmount] < 0 THEN 0
        ELSE [sales].[balanceAmount]
      END
      OR [ecommerce].[paymentStatus] <> CASE
        WHEN [sales].[balanceAmount] <= 0.005 AND [sales].[paidAmount] > 0.005 THEN N'PAID'
        WHEN [sales].[paidAmount] > 0.005 THEN N'PARTIALLY_PAID'
        ELSE N'UNPAID'
      END
    );
END;
