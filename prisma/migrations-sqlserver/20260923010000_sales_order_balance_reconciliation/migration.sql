IF OBJECT_ID(N'[dbo].[SalesOrder]', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.SalesOrder', N'totalAmount') IS NOT NULL
  AND COL_LENGTH(N'dbo.SalesOrder', N'paidAmount') IS NOT NULL
  AND COL_LENGTH(N'dbo.SalesOrder', N'balanceAmount') IS NOT NULL
BEGIN
  UPDATE [dbo].[SalesOrder]
  SET [balanceAmount] = CASE
    WHEN [totalAmount] > [paidAmount] THEN [totalAmount] - [paidAmount]
    ELSE 0
  END
  WHERE [status] = N'OPEN'
    AND [balanceAmount] <> CASE
      WHEN [totalAmount] > [paidAmount] THEN [totalAmount] - [paidAmount]
      ELSE 0
    END;
END;
