SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Store', N'ecommerceEnabled') IS NULL
  ALTER TABLE [dbo].[Store] ADD [ecommerceEnabled] BIT NOT NULL CONSTRAINT [Store_ecommerceEnabled_df] DEFAULT 0;
IF COL_LENGTH(N'dbo.Store', N'ecommerceSlug') IS NULL
  ALTER TABLE [dbo].[Store] ADD [ecommerceSlug] NVARCHAR(120) NULL;
IF COL_LENGTH(N'dbo.Store', N'ecommerceDisplayName') IS NULL
  ALTER TABLE [dbo].[Store] ADD [ecommerceDisplayName] NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.Store', N'ecommerceDescription') IS NULL
  ALTER TABLE [dbo].[Store] ADD [ecommerceDescription] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.Store', N'ecommerceSupportPhone') IS NULL
  ALTER TABLE [dbo].[Store] ADD [ecommerceSupportPhone] NVARCHAR(80) NULL;
IF COL_LENGTH(N'dbo.Store', N'ecommerceSupportEmail') IS NULL
  ALTER TABLE [dbo].[Store] ADD [ecommerceSupportEmail] NVARCHAR(320) NULL;
IF COL_LENGTH(N'dbo.Store', N'ecommerceAllowPickup') IS NULL
  ALTER TABLE [dbo].[Store] ADD [ecommerceAllowPickup] BIT NOT NULL CONSTRAINT [Store_ecommerceAllowPickup_df] DEFAULT 1;
IF COL_LENGTH(N'dbo.Store', N'ecommerceAllowDelivery') IS NULL
  ALTER TABLE [dbo].[Store] ADD [ecommerceAllowDelivery] BIT NOT NULL CONSTRAINT [Store_ecommerceAllowDelivery_df] DEFAULT 1;
IF COL_LENGTH(N'dbo.Store', N'ecommerceDeliveryFee') IS NULL
  ALTER TABLE [dbo].[Store] ADD [ecommerceDeliveryFee] DECIMAL(18, 2) NOT NULL CONSTRAINT [Store_ecommerceDeliveryFee_df] DEFAULT 0;
IF COL_LENGTH(N'dbo.Store', N'ecommerceFreeDeliveryThreshold') IS NULL
  ALTER TABLE [dbo].[Store] ADD [ecommerceFreeDeliveryThreshold] DECIMAL(18, 2) NULL;

IF COL_LENGTH(N'dbo.Product', N'ecommercePublished') IS NULL
  ALTER TABLE [dbo].[Product] ADD [ecommercePublished] BIT NOT NULL CONSTRAINT [Product_ecommercePublished_df] DEFAULT 0;
IF COL_LENGTH(N'dbo.Product', N'ecommerceFeatured') IS NULL
  ALTER TABLE [dbo].[Product] ADD [ecommerceFeatured] BIT NOT NULL CONSTRAINT [Product_ecommerceFeatured_df] DEFAULT 0;
IF COL_LENGTH(N'dbo.Product', N'ecommerceSortOrder') IS NULL
  ALTER TABLE [dbo].[Product] ADD [ecommerceSortOrder] INT NOT NULL CONSTRAINT [Product_ecommerceSortOrder_df] DEFAULT 0;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'Store_ecommerceSlug_idx' AND [object_id] = OBJECT_ID(N'[dbo].[Store]'))
  EXEC(N'CREATE INDEX [Store_ecommerceSlug_idx] ON [dbo].[Store] ([ecommerceSlug]) WHERE [ecommerceSlug] IS NOT NULL;');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'Product_ecommercePublished_ecommerceFeatured_ecommerceSortOrder_idx' AND [object_id] = OBJECT_ID(N'[dbo].[Product]'))
  EXEC(N'CREATE INDEX [Product_ecommercePublished_ecommerceFeatured_ecommerceSortOrder_idx]
    ON [dbo].[Product] ([ecommercePublished], [ecommerceFeatured], [ecommerceSortOrder]);');

IF OBJECT_ID(N'[dbo].[EcommerceCustomerAccount]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[EcommerceCustomerAccount] (
    [id] NVARCHAR(64) NOT NULL CONSTRAINT [EcommerceCustomerAccount_id_df] DEFAULT CONVERT(NVARCHAR(64), NEWID()),
    [retailOrgId] NVARCHAR(64) NOT NULL,
    [customerId] NVARCHAR(64) NOT NULL,
    [passwordHash] NVARCHAR(255) NOT NULL,
    [status] NVARCHAR(40) NOT NULL CONSTRAINT [EcommerceCustomerAccount_status_df] DEFAULT N'PENDING_VERIFICATION',
    [passwordUpdatedAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceCustomerAccount_passwordUpdatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [failedLoginAttempts] INT NOT NULL CONSTRAINT [EcommerceCustomerAccount_failedLoginAttempts_df] DEFAULT 0,
    [lockedUntil] DATETIME2(3) NULL,
    [lastLoginAt] DATETIME2(3) NULL,
    [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceCustomerAccount_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceCustomerAccount_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EcommerceCustomerAccount_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EcommerceCustomerAccount_customerId_key] UNIQUE NONCLUSTERED ([customerId])
  );
END;

IF COL_LENGTH(N'dbo.EcommerceCustomerAccount', N'failedLoginAttempts') IS NULL
  ALTER TABLE [dbo].[EcommerceCustomerAccount] ADD [failedLoginAttempts] INT NOT NULL CONSTRAINT [EcommerceCustomerAccount_failedLoginAttempts_df] DEFAULT 0;
IF COL_LENGTH(N'dbo.EcommerceCustomerAccount', N'lockedUntil') IS NULL
  ALTER TABLE [dbo].[EcommerceCustomerAccount] ADD [lockedUntil] DATETIME2(3) NULL;

IF OBJECT_ID(N'[dbo].[EcommerceCustomerIdentity]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[EcommerceCustomerIdentity] (
    [id] NVARCHAR(64) NOT NULL CONSTRAINT [EcommerceCustomerIdentity_id_df] DEFAULT CONVERT(NVARCHAR(64), NEWID()),
    [retailOrgId] NVARCHAR(64) NOT NULL,
    [customerAccountId] NVARCHAR(64) NOT NULL,
    [identityType] NVARCHAR(20) NOT NULL,
    [identifier] NVARCHAR(320) NOT NULL,
    [identifierNormalized] NVARCHAR(320) NOT NULL,
    [isPrimary] BIT NOT NULL CONSTRAINT [EcommerceCustomerIdentity_isPrimary_df] DEFAULT 0,
    [verifiedAt] DATETIME2(3) NULL,
    [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceCustomerIdentity_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceCustomerIdentity_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EcommerceCustomerIdentity_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EcommerceCustomerIdentity_org_type_identifier_key]
      UNIQUE NONCLUSTERED ([retailOrgId], [identityType], [identifierNormalized])
  );
END;

IF OBJECT_ID(N'[dbo].[EcommerceCustomerSession]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[EcommerceCustomerSession] (
    [id] NVARCHAR(64) NOT NULL CONSTRAINT [EcommerceCustomerSession_id_df] DEFAULT CONVERT(NVARCHAR(64), NEWID()),
    [retailOrgId] NVARCHAR(64) NOT NULL,
    [customerAccountId] NVARCHAR(64) NOT NULL,
    [tokenHash] NVARCHAR(128) NOT NULL,
    [expiresAt] DATETIME2(3) NOT NULL,
    [lastSeenAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceCustomerSession_lastSeenAt_df] DEFAULT CURRENT_TIMESTAMP,
    [revokedAt] DATETIME2(3) NULL,
    [ipAddress] NVARCHAR(80) NULL,
    [userAgent] NVARCHAR(500) NULL,
    [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceCustomerSession_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EcommerceCustomerSession_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EcommerceCustomerSession_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
  );
END;

IF OBJECT_ID(N'[dbo].[EcommerceOtpChallenge]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[EcommerceOtpChallenge] (
    [id] NVARCHAR(64) NOT NULL CONSTRAINT [EcommerceOtpChallenge_id_df] DEFAULT CONVERT(NVARCHAR(64), NEWID()),
    [retailOrgId] NVARCHAR(64) NOT NULL,
    [identityType] NVARCHAR(20) NOT NULL,
    [identifier] NVARCHAR(320) NOT NULL,
    [identifierNormalized] NVARCHAR(320) NOT NULL,
    [purpose] NVARCHAR(40) NOT NULL,
    [codeHash] NVARCHAR(128) NOT NULL,
    [attemptCount] INT NOT NULL CONSTRAINT [EcommerceOtpChallenge_attemptCount_df] DEFAULT 0,
    [maxAttempts] INT NOT NULL CONSTRAINT [EcommerceOtpChallenge_maxAttempts_df] DEFAULT 5,
    [expiresAt] DATETIME2(3) NOT NULL,
    [resendAvailableAt] DATETIME2(3) NOT NULL,
    [consumedAt] DATETIME2(3) NULL,
    [ipAddress] NVARCHAR(80) NULL,
    [userAgent] NVARCHAR(500) NULL,
    [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceOtpChallenge_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EcommerceOtpChallenge_pkey] PRIMARY KEY CLUSTERED ([id])
  );
END;

IF OBJECT_ID(N'[dbo].[EcommerceCustomerAddress]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[EcommerceCustomerAddress] (
    [id] NVARCHAR(64) NOT NULL CONSTRAINT [EcommerceCustomerAddress_id_df] DEFAULT CONVERT(NVARCHAR(64), NEWID()),
    [customerAccountId] NVARCHAR(64) NOT NULL,
    [label] NVARCHAR(80) NULL,
    [recipientName] NVARCHAR(200) NOT NULL,
    [phone] NVARCHAR(80) NOT NULL,
    [addressLine1] NVARCHAR(300) NOT NULL,
    [addressLine2] NVARCHAR(300) NULL,
    [city] NVARCHAR(120) NOT NULL,
    [region] NVARCHAR(120) NULL,
    [countryCode] NVARCHAR(8) NOT NULL CONSTRAINT [EcommerceCustomerAddress_countryCode_df] DEFAULT N'GH',
    [postalCode] NVARCHAR(40) NULL,
    [deliveryNote] NVARCHAR(MAX) NULL,
    [isDefault] BIT NOT NULL CONSTRAINT [EcommerceCustomerAddress_isDefault_df] DEFAULT 0,
    [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceCustomerAddress_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceCustomerAddress_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EcommerceCustomerAddress_pkey] PRIMARY KEY CLUSTERED ([id])
  );
END;

IF OBJECT_ID(N'[dbo].[EcommerceOrder]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[EcommerceOrder] (
    [id] NVARCHAR(64) NOT NULL CONSTRAINT [EcommerceOrder_id_df] DEFAULT CONVERT(NVARCHAR(64), NEWID()),
    [retailOrgId] NVARCHAR(64) NOT NULL,
    [storeId] NVARCHAR(64) NOT NULL,
    [salesOrderId] NVARCHAR(64) NOT NULL,
    [customerAccountId] NVARCHAR(64) NOT NULL,
    [orderNo] NVARCHAR(160) NOT NULL,
    [status] NVARCHAR(40) NOT NULL CONSTRAINT [EcommerceOrder_status_df] DEFAULT N'PLACED',
    [paymentStatus] NVARCHAR(40) NOT NULL CONSTRAINT [EcommerceOrder_paymentStatus_df] DEFAULT N'UNPAID',
    [deliveryStatus] NVARCHAR(40) NOT NULL CONSTRAINT [EcommerceOrder_deliveryStatus_df] DEFAULT N'PENDING',
    [fulfilmentMethod] NVARCHAR(40) NOT NULL CONSTRAINT [EcommerceOrder_fulfilmentMethod_df] DEFAULT N'DELIVERY',
    [currencyCode] NVARCHAR(8) NOT NULL,
    [itemsSubtotalAmount] DECIMAL(18, 2) NOT NULL,
    [discountAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [EcommerceOrder_discountAmount_df] DEFAULT 0,
    [taxAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [EcommerceOrder_taxAmount_df] DEFAULT 0,
    [deliveryFeeAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [EcommerceOrder_deliveryFeeAmount_df] DEFAULT 0,
    [totalAmount] DECIMAL(18, 2) NOT NULL,
    [paidAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [EcommerceOrder_paidAmount_df] DEFAULT 0,
    [balanceAmount] DECIMAL(18, 2) NOT NULL,
    [recipientName] NVARCHAR(200) NOT NULL,
    [deliveryPhone] NVARCHAR(80) NOT NULL,
    [deliveryAddressLine1] NVARCHAR(300) NULL,
    [deliveryAddressLine2] NVARCHAR(300) NULL,
    [deliveryCity] NVARCHAR(120) NULL,
    [deliveryRegion] NVARCHAR(120) NULL,
    [deliveryCountryCode] NVARCHAR(8) NULL,
    [deliveryPostalCode] NVARCHAR(40) NULL,
    [deliveryNote] NVARCHAR(MAX) NULL,
    [customerNote] NVARCHAR(MAX) NULL,
    [trackingReference] NVARCHAR(160) NULL,
    [placedAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceOrder_placedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [confirmedAt] DATETIME2(3) NULL,
    [processingAt] DATETIME2(3) NULL,
    [readyAt] DATETIME2(3) NULL,
    [dispatchedAt] DATETIME2(3) NULL,
    [deliveredAt] DATETIME2(3) NULL,
    [cancelledAt] DATETIME2(3) NULL,
    [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceOrder_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceOrder_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EcommerceOrder_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EcommerceOrder_salesOrderId_key] UNIQUE NONCLUSTERED ([salesOrderId]),
    CONSTRAINT [EcommerceOrder_org_orderNo_key] UNIQUE NONCLUSTERED ([retailOrgId], [orderNo])
  );
END;

IF OBJECT_ID(N'[dbo].[EcommercePayment]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[EcommercePayment] (
    [id] NVARCHAR(64) NOT NULL CONSTRAINT [EcommercePayment_id_df] DEFAULT CONVERT(NVARCHAR(64), NEWID()),
    [ecommerceOrderId] NVARCHAR(64) NOT NULL,
    [tenderMethodId] NVARCHAR(64) NULL,
    [reference] NVARCHAR(160) NOT NULL,
    [provider] NVARCHAR(40) NULL,
    [providerReference] NVARCHAR(200) NULL,
    [method] NVARCHAR(60) NOT NULL,
    [currencyCode] NVARCHAR(8) NOT NULL,
    [amount] DECIMAL(18, 2) NOT NULL,
    [status] NVARCHAR(40) NOT NULL CONSTRAINT [EcommercePayment_status_df] DEFAULT N'PENDING',
    [checkoutUrl] NVARCHAR(MAX) NULL,
    [gatewayResponseJson] NVARCHAR(MAX) NULL,
    [failureMessage] NVARCHAR(MAX) NULL,
    [initializedAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommercePayment_initializedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [verifiedAt] DATETIME2(3) NULL,
    [paidAt] DATETIME2(3) NULL,
    [failedAt] DATETIME2(3) NULL,
    [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommercePayment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommercePayment_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EcommercePayment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EcommercePayment_reference_key] UNIQUE NONCLUSTERED ([reference])
  );
END;

IF OBJECT_ID(N'[dbo].[EcommerceRefundRequest]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[EcommerceRefundRequest] (
    [id] NVARCHAR(64) NOT NULL CONSTRAINT [EcommerceRefundRequest_id_df] DEFAULT CONVERT(NVARCHAR(64), NEWID()),
    [ecommerceOrderId] NVARCHAR(64) NOT NULL,
    [paymentId] NVARCHAR(64) NULL,
    [amount] DECIMAL(18, 2) NOT NULL,
    [reason] NVARCHAR(120) NOT NULL,
    [details] NVARCHAR(MAX) NULL,
    [status] NVARCHAR(40) NOT NULL CONSTRAINT [EcommerceRefundRequest_status_df] DEFAULT N'REQUESTED',
    [resolutionNote] NVARCHAR(MAX) NULL,
    [requestedAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceRefundRequest_requestedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [reviewedAt] DATETIME2(3) NULL,
    [completedAt] DATETIME2(3) NULL,
    [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceRefundRequest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceRefundRequest_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EcommerceRefundRequest_pkey] PRIMARY KEY CLUSTERED ([id])
  );
END;

IF OBJECT_ID(N'[dbo].[EcommerceOrderStatusEvent]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[EcommerceOrderStatusEvent] (
    [id] NVARCHAR(64) NOT NULL CONSTRAINT [EcommerceOrderStatusEvent_id_df] DEFAULT CONVERT(NVARCHAR(64), NEWID()),
    [ecommerceOrderId] NVARCHAR(64) NOT NULL,
    [status] NVARCHAR(40) NOT NULL,
    [label] NVARCHAR(160) NOT NULL,
    [note] NVARCHAR(MAX) NULL,
    [actorType] NVARCHAR(40) NOT NULL CONSTRAINT [EcommerceOrderStatusEvent_actorType_df] DEFAULT N'SYSTEM',
    [actorLabel] NVARCHAR(200) NULL,
    [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceOrderStatusEvent_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EcommerceOrderStatusEvent_pkey] PRIMARY KEY CLUSTERED ([id])
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceCustomerAccount_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceCustomerAccount]'))
  CREATE INDEX [EcommerceCustomerAccount_retailOrgId_status_idx] ON [dbo].[EcommerceCustomerAccount] ([retailOrgId], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceCustomerIdentity_customerAccountId_isPrimary_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceCustomerIdentity]'))
  CREATE INDEX [EcommerceCustomerIdentity_customerAccountId_isPrimary_idx] ON [dbo].[EcommerceCustomerIdentity] ([customerAccountId], [isPrimary]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceCustomerSession_customerAccountId_expiresAt_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceCustomerSession]'))
  CREATE INDEX [EcommerceCustomerSession_customerAccountId_expiresAt_idx] ON [dbo].[EcommerceCustomerSession] ([customerAccountId], [expiresAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceCustomerSession_retailOrgId_expiresAt_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceCustomerSession]'))
  CREATE INDEX [EcommerceCustomerSession_retailOrgId_expiresAt_idx] ON [dbo].[EcommerceCustomerSession] ([retailOrgId], [expiresAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceOtpChallenge_identity_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceOtpChallenge]'))
  CREATE INDEX [EcommerceOtpChallenge_identity_idx] ON [dbo].[EcommerceOtpChallenge] ([retailOrgId], [identityType], [identifierNormalized], [purpose], [createdAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceOtpChallenge_expiry_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceOtpChallenge]'))
  CREATE INDEX [EcommerceOtpChallenge_expiry_idx] ON [dbo].[EcommerceOtpChallenge] ([expiresAt], [consumedAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceCustomerAddress_account_default_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceCustomerAddress]'))
  CREATE INDEX [EcommerceCustomerAddress_account_default_idx] ON [dbo].[EcommerceCustomerAddress] ([customerAccountId], [isDefault]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceOrder_store_status_updatedAt_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceOrder]'))
  CREATE INDEX [EcommerceOrder_store_status_updatedAt_idx] ON [dbo].[EcommerceOrder] ([storeId], [status], [updatedAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceOrder_customer_placedAt_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceOrder]'))
  CREATE INDEX [EcommerceOrder_customer_placedAt_idx] ON [dbo].[EcommerceOrder] ([customerAccountId], [placedAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceOrder_paymentStatus_updatedAt_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceOrder]'))
  CREATE INDEX [EcommerceOrder_paymentStatus_updatedAt_idx] ON [dbo].[EcommerceOrder] ([paymentStatus], [updatedAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceOrder_deliveryStatus_updatedAt_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceOrder]'))
  CREATE INDEX [EcommerceOrder_deliveryStatus_updatedAt_idx] ON [dbo].[EcommerceOrder] ([deliveryStatus], [updatedAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommercePayment_order_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommercePayment]'))
  CREATE INDEX [EcommercePayment_order_status_idx] ON [dbo].[EcommercePayment] ([ecommerceOrderId], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommercePayment_provider_reference_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommercePayment]'))
  CREATE INDEX [EcommercePayment_provider_reference_idx] ON [dbo].[EcommercePayment] ([provider], [providerReference]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceRefundRequest_order_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceRefundRequest]'))
  CREATE INDEX [EcommerceRefundRequest_order_status_idx] ON [dbo].[EcommerceRefundRequest] ([ecommerceOrderId], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceRefundRequest_paymentId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceRefundRequest]'))
  CREATE INDEX [EcommerceRefundRequest_paymentId_idx] ON [dbo].[EcommerceRefundRequest] ([paymentId]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceOrderStatusEvent_order_createdAt_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceOrderStatusEvent]'))
  CREATE INDEX [EcommerceOrderStatusEvent_order_createdAt_idx] ON [dbo].[EcommerceOrderStatusEvent] ([ecommerceOrderId], [createdAt]);

IF COL_LENGTH(N'dbo.Store', N'ecommerceHeroImageUrl') IS NULL
  ALTER TABLE [dbo].[Store] ADD [ecommerceHeroImageUrl] NVARCHAR(1000) NULL;
IF COL_LENGTH(N'dbo.Store', N'ecommerceWhatsappPhone') IS NULL
  ALTER TABLE [dbo].[Store] ADD [ecommerceWhatsappPhone] NVARCHAR(80) NULL;
IF COL_LENGTH(N'dbo.Store', N'ecommercePayOnDeliveryEnabled') IS NULL
  ALTER TABLE [dbo].[Store] ADD [ecommercePayOnDeliveryEnabled] BIT NOT NULL CONSTRAINT [Store_ecommercePayOnDeliveryEnabled_df] DEFAULT 1;

IF COL_LENGTH(N'dbo.Product', N'ecommerceDescription') IS NULL
  ALTER TABLE [dbo].[Product] ADD [ecommerceDescription] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.Product', N'ecommerceCompareAtPrice') IS NULL
  ALTER TABLE [dbo].[Product] ADD [ecommerceCompareAtPrice] DECIMAL(18, 2) NULL;
IF COL_LENGTH(N'dbo.Product', N'ecommerceSpecificationsJson') IS NULL
  ALTER TABLE [dbo].[Product] ADD [ecommerceSpecificationsJson] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.Product', N'ecommerceGalleryJson') IS NULL
  ALTER TABLE [dbo].[Product] ADD [ecommerceGalleryJson] NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.EcommerceOrder', N'paymentTiming') IS NULL
  ALTER TABLE [dbo].[EcommerceOrder] ADD [paymentTiming] NVARCHAR(40) NOT NULL CONSTRAINT [EcommerceOrder_paymentTiming_df] DEFAULT N'ON_DELIVERY';
IF COL_LENGTH(N'dbo.EcommerceOrder', N'selectedPaymentMethodCode') IS NULL
  ALTER TABLE [dbo].[EcommerceOrder] ADD [selectedPaymentMethodCode] NVARCHAR(1000) NULL;
IF COL_LENGTH(N'dbo.EcommerceOrder', N'selectedPaymentMethodName') IS NULL
  ALTER TABLE [dbo].[EcommerceOrder] ADD [selectedPaymentMethodName] NVARCHAR(1000) NULL;

IF OBJECT_ID(N'[dbo].[EcommerceStorePaymentMethod]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[EcommerceStorePaymentMethod] (
    [id] NVARCHAR(64) NOT NULL CONSTRAINT [EcommerceStorePaymentMethod_id_df] DEFAULT CONVERT(NVARCHAR(64), NEWID()),
    [retailOrgId] NVARCHAR(64) NOT NULL,
    [storeId] NVARCHAR(64) NOT NULL,
    [tenderMethodId] NVARCHAR(64) NOT NULL,
    [enabled] BIT NOT NULL CONSTRAINT [EcommerceStorePaymentMethod_enabled_df] DEFAULT 1,
    [sortOrder] INT NOT NULL CONSTRAINT [EcommerceStorePaymentMethod_sortOrder_df] DEFAULT 0,
    [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceStorePaymentMethod_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceStorePaymentMethod_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EcommerceStorePaymentMethod_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EcommerceStorePaymentMethod_store_tender_key] UNIQUE NONCLUSTERED ([storeId], [tenderMethodId])
  );
END;

IF OBJECT_ID(N'[dbo].[EcommerceProductReview]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[EcommerceProductReview] (
    [id] NVARCHAR(64) NOT NULL CONSTRAINT [EcommerceProductReview_id_df] DEFAULT CONVERT(NVARCHAR(64), NEWID()),
    [retailOrgId] NVARCHAR(64) NOT NULL,
    [productId] NVARCHAR(64) NOT NULL,
    [customerAccountId] NVARCHAR(64) NOT NULL,
    [ecommerceOrderId] NVARCHAR(64) NULL,
    [rating] INT NOT NULL,
    [title] NVARCHAR(300) NULL,
    [body] NVARCHAR(MAX) NULL,
    [status] NVARCHAR(40) NOT NULL CONSTRAINT [EcommerceProductReview_status_df] DEFAULT N'PUBLISHED',
    [verifiedPurchase] BIT NOT NULL CONSTRAINT [EcommerceProductReview_verifiedPurchase_df] DEFAULT 1,
    [publishedAt] DATETIME2(3) NULL,
    [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceProductReview_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceProductReview_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EcommerceProductReview_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EcommerceProductReview_product_customer_key] UNIQUE NONCLUSTERED ([productId], [customerAccountId])
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceStorePaymentMethod_store_enabled_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceStorePaymentMethod]'))
  CREATE INDEX [EcommerceStorePaymentMethod_store_enabled_idx] ON [dbo].[EcommerceStorePaymentMethod] ([retailOrgId], [storeId], [enabled], [sortOrder]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceStorePaymentMethod_tenderMethodId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceStorePaymentMethod]'))
  CREATE INDEX [EcommerceStorePaymentMethod_tenderMethodId_idx] ON [dbo].[EcommerceStorePaymentMethod] ([tenderMethodId]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceProductReview_product_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceProductReview]'))
  CREATE INDEX [EcommerceProductReview_product_status_idx] ON [dbo].[EcommerceProductReview] ([retailOrgId], [productId], [status], [createdAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceProductReview_order_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceProductReview]'))
  CREATE INDEX [EcommerceProductReview_order_idx] ON [dbo].[EcommerceProductReview] ([ecommerceOrderId]);

INSERT INTO [dbo].[EcommerceStorePaymentMethod] ([id], [retailOrgId], [storeId], [tenderMethodId], [enabled], [sortOrder], [createdAt], [updatedAt])
SELECT CONVERT(NVARCHAR(64), NEWID()), s.[retailOrgId], s.[id], t.[id], 1, t.[sortOrder], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM [dbo].[Store] s
INNER JOIN [dbo].[TenderMethod] t ON t.[retailOrgId] = s.[retailOrgId]
WHERE s.[storeMode] = N'ONLINE_DIRECT'
  AND t.[status] = N'ACTIVE'
  AND t.[gatewayActive] = 1
  AND t.[gatewayStatus] = N'READY'
  AND NOT EXISTS (
    SELECT 1 FROM [dbo].[EcommerceStorePaymentMethod] currentMethod
    WHERE currentMethod.[storeId] = s.[id] AND currentMethod.[tenderMethodId] = t.[id]
  );

DECLARE @EcommercePermissionId NVARCHAR(64);
SELECT @EcommercePermissionId = [id] FROM [dbo].[Permission] WHERE [code] = N'ecommerce.console.access';
IF @EcommercePermissionId IS NULL
BEGIN
  SET @EcommercePermissionId = CONVERT(NVARCHAR(64), NEWID());
  INSERT INTO [dbo].[Permission] ([id], [code], [name], [description], [createdAt], [updatedAt])
  VALUES (@EcommercePermissionId, N'ecommerce.console.access', N'Access ecommerce staff console', N'Open and operate customer orders, catalog publication, payment options, and storefront setup.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
END;

INSERT INTO [dbo].[RolePermission] ([roleId], [permissionId], [createdAt])
SELECT r.[id], @EcommercePermissionId, CURRENT_TIMESTAMP
FROM [dbo].[Role] r
WHERE r.[code] = N'ONLINE_STORE_SUPERVISOR'
  AND NOT EXISTS (
    SELECT 1 FROM [dbo].[RolePermission] rp
    WHERE rp.[roleId] = r.[id] AND rp.[permissionId] = @EcommercePermissionId
  );
