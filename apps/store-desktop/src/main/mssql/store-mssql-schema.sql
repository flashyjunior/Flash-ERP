IF OBJECT_ID(N'[dbo].[app_metadata]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[app_metadata] (
    [key] nvarchar(200) NOT NULL CONSTRAINT [PK_app_metadata] PRIMARY KEY,
    [value] nvarchar(max) NOT NULL
  );
END;

IF OBJECT_ID(N'[dbo].[store_node_metadata]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[store_node_metadata] (
    [key] nvarchar(200) NOT NULL CONSTRAINT [PK_store_node_metadata] PRIMARY KEY,
    [value] nvarchar(max) NOT NULL,
    [updated_at] nvarchar(40) NOT NULL
  );
END;

IF OBJECT_ID(N'[dbo].[product_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[product_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_product_snapshot] PRIMARY KEY,
    [product_code] nvarchar(100) NOT NULL,
    [product_name] nvarchar(300) NOT NULL,
    [product_type] nvarchar(50) NOT NULL CONSTRAINT [DF_product_snapshot_product_type] DEFAULT N'STANDARD',
    [short_name] nvarchar(300) NULL,
    [description] nvarchar(max) NULL,
    [primary_image_url] nvarchar(1000) NULL,
    [department_code] nvarchar(100) NULL,
    [category_code] nvarchar(100) NULL,
    [subcategory] nvarchar(150) NULL,
    [unit_of_measure] nvarchar(50) NOT NULL CONSTRAINT [DF_product_snapshot_uom] DEFAULT N'EA',
    [taxable] int NOT NULL CONSTRAINT [DF_product_snapshot_taxable] DEFAULT 1,
    [tax_profile_code] nvarchar(100) NULL,
    [tax_profile_name] nvarchar(200) NULL,
    [tax_rate_percent] decimal(18, 4) NULL,
    [tax_inclusive] int NOT NULL CONSTRAINT [DF_product_snapshot_tax_inclusive] DEFAULT 0,
    [track_inventory] int NOT NULL CONSTRAINT [DF_product_snapshot_track_inventory] DEFAULT 1,
    [is_serialized] int NOT NULL CONSTRAINT [DF_product_snapshot_is_serialized] DEFAULT 0,
    [track_size] int NOT NULL CONSTRAINT [DF_product_snapshot_track_size] DEFAULT 0,
    [track_color] int NOT NULL CONSTRAINT [DF_product_snapshot_track_color] DEFAULT 0,
    [must_enter_price_at_pos] int NOT NULL CONSTRAINT [DF_product_snapshot_open_price] DEFAULT 0,
    [min_stock_level] decimal(18, 3) NULL,
    [reorder_point] decimal(18, 3) NULL,
    [safety_stock_level] decimal(18, 3) NULL,
    [catalog_membership_active] int NOT NULL CONSTRAINT [DF_product_snapshot_catalog_active] DEFAULT 1,
    [catalog_sort_order] int NULL,
    [unit_price] decimal(18, 4) NOT NULL CONSTRAINT [DF_product_snapshot_unit_price] DEFAULT 0,
    [quantity_on_hand] decimal(18, 3) NOT NULL CONSTRAINT [DF_product_snapshot_qty] DEFAULT 0,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_product_snapshot_product_code] UNIQUE ([product_code])
  );
END;

IF COL_LENGTH(N'[dbo].[product_snapshot]', N'product_type') IS NULL
BEGIN
  ALTER TABLE [dbo].[product_snapshot]
  ADD [product_type] nvarchar(50) NOT NULL
    CONSTRAINT [DF_product_snapshot_product_type_existing] DEFAULT N'STANDARD';
END;

IF COL_LENGTH(N'[dbo].[product_snapshot]', N'track_size') IS NULL
BEGIN
  ALTER TABLE [dbo].[product_snapshot]
  ADD [track_size] int NOT NULL
    CONSTRAINT [DF_product_snapshot_track_size_existing] DEFAULT 0;
END;

IF OBJECT_ID(N'[dbo].[product_variant_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[product_variant_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_product_variant_snapshot] PRIMARY KEY,
    [product_code] nvarchar(100) NOT NULL,
    [variant_code] nvarchar(100) NOT NULL,
    [sku] nvarchar(100) NULL,
    [display_name] nvarchar(300) NULL,
    [unit_price] decimal(18, 4) NOT NULL CONSTRAINT [DF_product_variant_snapshot_unit_price] DEFAULT 0,
    [quantity_on_hand] decimal(18, 3) NOT NULL CONSTRAINT [DF_product_variant_snapshot_qty] DEFAULT 0,
    [barcode] nvarchar(200) NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_product_variant_snapshot_status] DEFAULT N'ACTIVE',
    [attributes_json] nvarchar(max) NOT NULL CONSTRAINT [DF_product_variant_snapshot_attributes] DEFAULT N'[]',
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_product_variant_snapshot_code] UNIQUE ([variant_code])
  );
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_product_variant_snapshot_product'
    AND object_id = OBJECT_ID(N'[dbo].[product_variant_snapshot]')
)
BEGIN
  CREATE INDEX [IX_product_variant_snapshot_product]
    ON [dbo].[product_variant_snapshot] ([product_code]);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_product_variant_snapshot_barcode'
    AND object_id = OBJECT_ID(N'[dbo].[product_variant_snapshot]')
)
BEGIN
  CREATE INDEX [IX_product_variant_snapshot_barcode]
    ON [dbo].[product_variant_snapshot] ([barcode]);
END;

IF COL_LENGTH(N'[dbo].[product_snapshot]', N'track_color') IS NULL
BEGIN
  ALTER TABLE [dbo].[product_snapshot]
  ADD [track_color] int NOT NULL
    CONSTRAINT [DF_product_snapshot_track_color_existing] DEFAULT 0;
END;

IF OBJECT_ID(N'[dbo].[product_department_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[product_department_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_product_department_snapshot] PRIMARY KEY,
    [department_code] nvarchar(100) NOT NULL,
    [department_name] nvarchar(200) NOT NULL,
    [description] nvarchar(max) NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_product_department_status] DEFAULT N'ACTIVE',
    [sort_order] int NOT NULL CONSTRAINT [DF_product_department_sort] DEFAULT 0,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_product_department_code] UNIQUE ([department_code])
  );
END;

IF OBJECT_ID(N'[dbo].[product_category_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[product_category_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_product_category_snapshot] PRIMARY KEY,
    [category_code] nvarchar(100) NOT NULL,
    [category_name] nvarchar(200) NOT NULL,
    [department_code] nvarchar(100) NOT NULL,
    [department_name] nvarchar(200) NOT NULL,
    [description] nvarchar(max) NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_product_category_status] DEFAULT N'ACTIVE',
    [sort_order] int NOT NULL CONSTRAINT [DF_product_category_sort] DEFAULT 0,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_product_category_code] UNIQUE ([category_code])
  );
END;

IF OBJECT_ID(N'[dbo].[unit_of_measure_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[unit_of_measure_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_unit_of_measure_snapshot] PRIMARY KEY,
    [uom_code] nvarchar(100) NOT NULL,
    [uom_name] nvarchar(200) NOT NULL,
    [description] nvarchar(max) NULL,
    [decimal_precision] int NOT NULL CONSTRAINT [DF_unit_of_measure_precision] DEFAULT 0,
    [allow_fractional_sale] int NOT NULL CONSTRAINT [DF_unit_of_measure_fractional] DEFAULT 0,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_unit_of_measure_status] DEFAULT N'ACTIVE',
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_unit_of_measure_code] UNIQUE ([uom_code])
  );
END;

IF OBJECT_ID(N'[dbo].[barcode_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[barcode_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_barcode_snapshot] PRIMARY KEY,
    [barcode_code] nvarchar(100) NOT NULL,
    [product_code] nvarchar(100) NOT NULL,
    [barcode_type] nvarchar(50) NOT NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_barcode_snapshot_code] UNIQUE ([barcode_code])
  );
END;

IF OBJECT_ID(N'[dbo].[price_list_entry_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[price_list_entry_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_price_list_entry_snapshot] PRIMARY KEY,
    [price_list_code] nvarchar(100) NOT NULL,
    [price_list_name] nvarchar(200) NOT NULL,
    [currency_code] nvarchar(20) NOT NULL,
    [is_default] int NOT NULL CONSTRAINT [DF_price_list_entry_is_default] DEFAULT 0,
    [customer_type] nvarchar(100) NULL,
    [loyalty_tier] nvarchar(100) NULL,
    [product_code] nvarchar(100) NOT NULL,
    [unit_price] decimal(18, 4) NOT NULL CONSTRAINT [DF_price_list_entry_unit_price] DEFAULT 0,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_price_list_entry_status] DEFAULT N'ACTIVE',
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_price_list_entry_code_product] UNIQUE ([price_list_code], [product_code])
  );
END;

IF OBJECT_ID(N'[dbo].[tax_profile_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[tax_profile_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_tax_profile_snapshot] PRIMARY KEY,
    [tax_profile_code] nvarchar(100) NOT NULL,
    [tax_profile_name] nvarchar(200) NOT NULL,
    [description] nvarchar(max) NULL,
    [rate_percent] decimal(18, 4) NOT NULL CONSTRAINT [DF_tax_profile_rate] DEFAULT 0,
    [is_default] int NOT NULL CONSTRAINT [DF_tax_profile_default] DEFAULT 0,
    [is_tax_inclusive] int NOT NULL CONSTRAINT [DF_tax_profile_inclusive] DEFAULT 0,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_tax_profile_status] DEFAULT N'ACTIVE',
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_tax_profile_code] UNIQUE ([tax_profile_code])
  );
END;

IF OBJECT_ID(N'[dbo].[gift_certificate_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[gift_certificate_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_gift_certificate_snapshot] PRIMARY KEY,
    [certificate_no] nvarchar(100) NOT NULL,
    [recipient_name] nvarchar(200) NULL,
    [purchaser_name] nvarchar(200) NULL,
    [original_amount] decimal(18, 4) NOT NULL,
    [balance_amount] decimal(18, 4) NOT NULL,
    [currency_code] nvarchar(20) NOT NULL,
    [issue_date] nvarchar(40) NOT NULL,
    [expiry_date] nvarchar(40) NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_gift_certificate_status] DEFAULT N'ACTIVE',
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_gift_certificate_no] UNIQUE ([certificate_no])
  );
END;

IF OBJECT_ID(N'[dbo].[tender_method_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[tender_method_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_tender_method_snapshot] PRIMARY KEY,
    [tender_method_code] nvarchar(100) NOT NULL,
    [tender_method_name] nvarchar(200) NOT NULL,
    [payment_method] nvarchar(100) NOT NULL,
    [gateway_provider] nvarchar(100) NULL,
    [gateway_mode] nvarchar(50) NULL,
    [gateway_merchant_id] nvarchar(200) NULL,
    [gateway_public_key] nvarchar(500) NULL,
    [gateway_callback_url] nvarchar(1000) NULL,
    [gateway_active] int NOT NULL CONSTRAINT [DF_tender_gateway_active] DEFAULT 0,
    [gateway_status] nvarchar(50) NOT NULL CONSTRAINT [DF_tender_gateway_status] DEFAULT N'DISABLED',
    [description] nvarchar(max) NULL,
    [requires_reference] int NOT NULL CONSTRAINT [DF_tender_requires_reference] DEFAULT 0,
    [allow_change] int NOT NULL CONSTRAINT [DF_tender_allow_change] DEFAULT 0,
    [allow_refund] int NOT NULL CONSTRAINT [DF_tender_allow_refund] DEFAULT 1,
    [allow_open_cash_drawer] int NOT NULL CONSTRAINT [DF_tender_cash_drawer] DEFAULT 0,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_tender_status] DEFAULT N'ACTIVE',
    [sort_order] int NOT NULL CONSTRAINT [DF_tender_sort] DEFAULT 0,
    [published_at] nvarchar(40) NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_tender_method_code] UNIQUE ([tender_method_code])
  );
END;

IF COL_LENGTH(N'[dbo].[tender_method_snapshot]', N'published_at') IS NULL
BEGIN
  ALTER TABLE [dbo].[tender_method_snapshot]
  ADD [published_at] nvarchar(40) NULL;
END;

IF OBJECT_ID(N'[dbo].[bank_account_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[bank_account_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_bank_account_snapshot] PRIMARY KEY,
    [bank_code] nvarchar(100) NOT NULL,
    [bank_name] nvarchar(200) NOT NULL,
    [branch_code] nvarchar(100) NOT NULL,
    [branch_name] nvarchar(200) NOT NULL,
    [account_number] nvarchar(100) NOT NULL,
    [account_name] nvarchar(200) NOT NULL,
    [currency_code] nvarchar(20) NOT NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_bank_account_status] DEFAULT N'ACTIVE',
    [updated_at] nvarchar(40) NOT NULL
  );
END;

IF OBJECT_ID(N'[dbo].[supplier_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[supplier_snapshot] (
    [supplier_no] nvarchar(100) NOT NULL CONSTRAINT [PK_supplier_snapshot] PRIMARY KEY,
    [supplier_name] nvarchar(200) NOT NULL,
    [phone] nvarchar(100) NULL,
    [email] nvarchar(320) NULL,
    [tax_number] nvarchar(100) NULL,
    [address_line1] nvarchar(300) NULL,
    [city] nvarchar(100) NULL,
    [country_code] nvarchar(20) NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_supplier_snapshot_status] DEFAULT N'ACTIVE',
    [updated_at] nvarchar(40) NOT NULL
  );
END;

IF OBJECT_ID(N'[dbo].[promotion_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[promotion_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_promotion_snapshot] PRIMARY KEY,
    [promotion_code] nvarchar(100) NOT NULL,
    [promotion_name] nvarchar(200) NOT NULL,
    [description] nvarchar(max) NULL,
    [discount_type] nvarchar(100) NOT NULL,
    [target_scope] nvarchar(100) NOT NULL CONSTRAINT [DF_promotion_target_scope] DEFAULT N'ALL_ITEMS',
    [discount_value] decimal(18, 4) NOT NULL,
    [minimum_basket_amount] decimal(18, 4) NULL,
    [minimum_line_quantity] decimal(18, 3) NULL,
    [buy_quantity] decimal(18, 3) NULL,
    [reward_quantity] decimal(18, 3) NULL,
    [target_department_code] nvarchar(100) NULL,
    [target_category_code] nvarchar(100) NULL,
    [target_product_code] nvarchar(100) NULL,
    [eligible_store_codes_json] nvarchar(max) NULL,
    [eligible_customer_types_json] nvarchar(max) NULL,
    [eligible_loyalty_tiers_json] nvarchar(max) NULL,
    [active_days_of_week_json] nvarchar(max) NULL,
    [active_from_minutes] int NULL,
    [active_to_minutes] int NULL,
    [coupon_required] int NOT NULL CONSTRAINT [DF_promotion_coupon_required] DEFAULT 0,
    [coupon_code] nvarchar(100) NULL,
    [allow_with_loyalty] int NOT NULL CONSTRAINT [DF_promotion_loyalty] DEFAULT 1,
    [apply_once_per_basket] int NOT NULL CONSTRAINT [DF_promotion_once] DEFAULT 0,
    [priority] int NOT NULL CONSTRAINT [DF_promotion_priority] DEFAULT 0,
    [start_at] nvarchar(40) NULL,
    [end_at] nvarchar(40) NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_promotion_status] DEFAULT N'ACTIVE',
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_promotion_code] UNIQUE ([promotion_code])
  );
END;

IF OBJECT_ID(N'[dbo].[inventory_location_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[inventory_location_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_inventory_location_snapshot] PRIMARY KEY,
    [location_code] nvarchar(100) NOT NULL,
    [location_name] nvarchar(200) NOT NULL,
    [location_type] nvarchar(100) NOT NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_inventory_location_status] DEFAULT N'ACTIVE',
    [defaults] nvarchar(300) NOT NULL CONSTRAINT [DF_inventory_location_defaults] DEFAULT N'',
    [is_sales_default] int NOT NULL CONSTRAINT [DF_inventory_location_sales_default] DEFAULT 0,
    [is_sales_order_default] int NOT NULL CONSTRAINT [DF_inventory_location_sales_order_default] DEFAULT 0,
    [is_receiving_default] int NOT NULL CONSTRAINT [DF_inventory_location_receiving_default] DEFAULT 0,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_inventory_location_code] UNIQUE ([location_code])
  );
END;

IF COL_LENGTH(N'[dbo].[inventory_location_snapshot]', N'is_sales_order_default') IS NULL
BEGIN
  ALTER TABLE [dbo].[inventory_location_snapshot]
  ADD [is_sales_order_default] int NOT NULL
    CONSTRAINT [DF_inventory_location_sales_order_default_existing] DEFAULT 0;
END;

IF COL_LENGTH(N'[dbo].[inventory_location_snapshot]', N'is_sales_order_default') IS NOT NULL
BEGIN
  EXEC sp_executesql N'
    UPDATE [dbo].[inventory_location_snapshot]
    SET [is_sales_order_default] = [is_sales_default]
    WHERE [is_sales_order_default] = 0
      AND [is_sales_default] = 1;
  ';
END;

IF OBJECT_ID(N'[dbo].[inventory_location_balance]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[inventory_location_balance] (
    [location_code] nvarchar(100) NOT NULL,
    [product_code] nvarchar(100) NOT NULL,
    [quantity_on_hand] decimal(18, 3) NOT NULL CONSTRAINT [DF_inventory_location_balance_qty] DEFAULT 0,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [PK_inventory_location_balance] PRIMARY KEY ([location_code], [product_code])
  );
END;

IF OBJECT_ID(N'[dbo].[inter_store_transfer_request_target_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[inter_store_transfer_request_target_snapshot] (
    [source_location_code] nvarchar(100) NOT NULL CONSTRAINT [PK_inter_store_transfer_request_target_snapshot] PRIMARY KEY,
    [source_store_code] nvarchar(100) NOT NULL,
    [source_store_name] nvarchar(200) NOT NULL,
    [source_store_sales_enabled] int NOT NULL CONSTRAINT [DF_transfer_target_sales] DEFAULT 1,
    [source_store_warehouse_enabled] int NOT NULL CONSTRAINT [DF_transfer_target_warehouse] DEFAULT 1,
    [source_location_name] nvarchar(200) NOT NULL,
    [source_location_type] nvarchar(100) NOT NULL,
    [source_location_status] nvarchar(50) NOT NULL,
    [source_location_defaults] nvarchar(300) NOT NULL,
    [source_warehouse_code] nvarchar(100) NULL,
    [source_warehouse_name] nvarchar(200) NULL,
    [use_for_sales_default] int NOT NULL CONSTRAINT [DF_transfer_target_sales_default] DEFAULT 0,
    [use_for_receiving_default] int NOT NULL CONSTRAINT [DF_transfer_target_receiving_default] DEFAULT 0,
    [updated_at] nvarchar(40) NOT NULL
  );
END;

IF OBJECT_ID(N'[dbo].[serial_registry]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[serial_registry] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_serial_registry] PRIMARY KEY,
    [product_code] nvarchar(100) NOT NULL,
    [serial_number] nvarchar(150) NOT NULL,
    [inventory_location_code] nvarchar(100) NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_serial_registry_status] DEFAULT N'AVAILABLE',
    [source_transaction_id] nvarchar(100) NULL,
    [source_transaction_no] nvarchar(100) NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_serial_registry_product_serial] UNIQUE ([product_code], [serial_number])
  );
END;

IF OBJECT_ID(N'[dbo].[purchase_order_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[purchase_order_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_purchase_order_snapshot] PRIMARY KEY,
    [purchase_order_no] nvarchar(100) NOT NULL,
    [status] nvarchar(50) NOT NULL,
    [inventory_location_code] nvarchar(100) NOT NULL,
    [inventory_location_name] nvarchar(200) NOT NULL,
    [supplier_no] nvarchar(100) NULL,
    [supplier_name] nvarchar(200) NULL,
    [external_reference] nvarchar(200) NULL,
    [note] nvarchar(max) NULL,
    [operator_name] nvarchar(200) NULL,
    [ordered_quantity] decimal(18, 3) NOT NULL CONSTRAINT [DF_purchase_order_ordered] DEFAULT 0,
    [received_quantity] decimal(18, 3) NOT NULL CONSTRAINT [DF_purchase_order_received] DEFAULT 0,
    [exception_quantity] decimal(18, 3) NOT NULL CONSTRAINT [DF_purchase_order_exception] DEFAULT 0,
    [outstanding_quantity] decimal(18, 3) NOT NULL CONSTRAINT [DF_purchase_order_outstanding] DEFAULT 0,
    [committed_at] nvarchar(40) NULL,
    [closed_at] nvarchar(40) NULL,
    [closure_reason] nvarchar(100) NULL,
    [closure_note] nvarchar(max) NULL,
    [closure_operator_name] nvarchar(200) NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_purchase_order_no] UNIQUE ([purchase_order_no])
  );
END;

IF OBJECT_ID(N'[dbo].[purchase_order_line_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[purchase_order_line_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_purchase_order_line_snapshot] PRIMARY KEY,
    [purchase_order_id] nvarchar(100) NOT NULL,
    [line_no] int NOT NULL,
    [product_code] nvarchar(100) NOT NULL,
    [product_name] nvarchar(300) NOT NULL,
    [department_code] nvarchar(100) NULL,
    [category_code] nvarchar(100) NULL,
    [subcategory] nvarchar(150) NULL,
    [is_serialized] int NOT NULL CONSTRAINT [DF_purchase_order_line_serialized] DEFAULT 0,
    [track_expiry] int NOT NULL CONSTRAINT [DF_purchase_order_line_track_expiry] DEFAULT 0,
    [ordered_quantity] decimal(18, 3) NOT NULL,
    [received_quantity] decimal(18, 3) NOT NULL CONSTRAINT [DF_purchase_order_line_received] DEFAULT 0,
    [exception_quantity] decimal(18, 3) NOT NULL CONSTRAINT [DF_purchase_order_line_exception] DEFAULT 0,
    [outstanding_quantity] decimal(18, 3) NOT NULL CONSTRAINT [DF_purchase_order_line_outstanding] DEFAULT 0,
    [unit_cost] decimal(18, 4) NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_purchase_order_line_order_line] UNIQUE ([purchase_order_id], [line_no])
  );
END;

IF OBJECT_ID(N'[dbo].[local_goods_receipt]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[local_goods_receipt] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_local_goods_receipt] PRIMARY KEY,
    [goods_receipt_no] nvarchar(100) NOT NULL,
    [purchase_order_id] nvarchar(100) NULL,
    [purchase_order_no] nvarchar(100) NULL,
    [inventory_location_code] nvarchar(100) NOT NULL,
    [supplier_no] nvarchar(100) NULL,
    [supplier_name] nvarchar(200) NULL,
    [external_reference] nvarchar(200) NULL,
    [note] nvarchar(max) NULL,
    [operator_name] nvarchar(200) NOT NULL,
    [total_quantity] decimal(18, 3) NOT NULL,
    [exception_quantity] decimal(18, 3) NOT NULL CONSTRAINT [DF_local_goods_receipt_exception] DEFAULT 0,
    [synced_at] nvarchar(40) NULL,
    [received_at] nvarchar(40) NOT NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_local_goods_receipt_no] UNIQUE ([goods_receipt_no])
  );
END;

IF OBJECT_ID(N'[dbo].[local_goods_receipt_line]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[local_goods_receipt_line] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_local_goods_receipt_line] PRIMARY KEY,
    [local_goods_receipt_id] nvarchar(100) NOT NULL,
    [purchase_order_line_id] nvarchar(100) NULL,
    [line_no] int NOT NULL,
    [product_code] nvarchar(100) NOT NULL,
    [product_name] nvarchar(300) NOT NULL,
    [quantity] decimal(18, 3) NOT NULL,
    [unit_cost] decimal(18, 4) NULL,
    [serial_numbers_json] nvarchar(max) NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_local_goods_receipt_line_receipt_line] UNIQUE ([local_goods_receipt_id], [line_no])
  );
END;

IF OBJECT_ID(N'[dbo].[local_goods_receipt_exception]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[local_goods_receipt_exception] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_local_goods_receipt_exception] PRIMARY KEY,
    [local_goods_receipt_id] nvarchar(100) NOT NULL,
    [purchase_order_line_id] nvarchar(100) NULL,
    [line_no] int NOT NULL,
    [product_code] nvarchar(100) NOT NULL,
    [product_name] nvarchar(300) NOT NULL,
    [quantity] decimal(18, 3) NOT NULL,
    [unit_cost] decimal(18, 4) NULL,
    [reason] nvarchar(100) NOT NULL,
    [note] nvarchar(max) NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_local_goods_receipt_exception_receipt_line] UNIQUE ([local_goods_receipt_id], [line_no])
  );
END;

IF OBJECT_ID(N'[dbo].[local_supplier_return]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[local_supplier_return] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_local_supplier_return] PRIMARY KEY,
    [supplier_return_no] nvarchar(100) NOT NULL,
    [purchase_order_id] nvarchar(100) NULL,
    [purchase_order_no] nvarchar(100) NULL,
    [goods_receipt_id] nvarchar(100) NOT NULL,
    [goods_receipt_no] nvarchar(100) NOT NULL,
    [inventory_location_code] nvarchar(100) NOT NULL,
    [supplier_no] nvarchar(100) NOT NULL,
    [supplier_name] nvarchar(200) NOT NULL,
    [external_reference] nvarchar(200) NULL,
    [reason] nvarchar(100) NOT NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_local_supplier_return_status] DEFAULT N'POSTED',
    [note] nvarchar(max) NULL,
    [operator_name] nvarchar(200) NOT NULL,
    [total_quantity] decimal(18, 3) NOT NULL,
    [synced_at] nvarchar(40) NULL,
    [returned_at] nvarchar(40) NOT NULL,
    [cancelled_at] nvarchar(40) NULL,
    [cancellation_note] nvarchar(max) NULL,
    [cancellation_operator_name] nvarchar(200) NULL,
    [cancellation_acknowledged_at] nvarchar(40) NULL,
    [cancellation_acknowledged_by] nvarchar(200) NULL,
    [cancellation_acknowledgement_note] nvarchar(max) NULL,
    [cancellation_ack_synced_at] nvarchar(40) NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_local_supplier_return_no] UNIQUE ([supplier_return_no])
  );
END;

IF OBJECT_ID(N'[dbo].[local_supplier_return_line]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[local_supplier_return_line] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_local_supplier_return_line] PRIMARY KEY,
    [local_supplier_return_id] nvarchar(100) NOT NULL,
    [goods_receipt_line_id] nvarchar(100) NULL,
    [purchase_order_line_id] nvarchar(100) NULL,
    [line_no] int NOT NULL,
    [product_code] nvarchar(100) NOT NULL,
    [product_name] nvarchar(300) NOT NULL,
    [quantity] decimal(18, 3) NOT NULL,
    [unit_cost] decimal(18, 4) NULL,
    [serial_numbers_json] nvarchar(max) NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_local_supplier_return_line_return_line] UNIQUE ([local_supplier_return_id], [line_no])
  );
END;

IF OBJECT_ID(N'[dbo].[inter_store_transfer_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[inter_store_transfer_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_inter_store_transfer_snapshot] PRIMARY KEY,
    [transfer_no] nvarchar(100) NOT NULL,
    [transfer_batch_no] nvarchar(100) NULL,
    [line_no] int NOT NULL CONSTRAINT [DF_inter_store_transfer_line_no] DEFAULT 1,
    [role] nvarchar(50) NOT NULL,
    [origin] nvarchar(50) NOT NULL,
    [status] nvarchar(50) NOT NULL,
    [external_reference] nvarchar(200) NULL,
    [source_store_code] nvarchar(100) NOT NULL,
    [source_store_name] nvarchar(200) NOT NULL,
    [source_location_code] nvarchar(100) NOT NULL,
    [source_location_name] nvarchar(200) NOT NULL,
    [destination_store_code] nvarchar(100) NOT NULL,
    [destination_store_name] nvarchar(200) NOT NULL,
    [destination_location_code] nvarchar(100) NOT NULL,
    [destination_location_name] nvarchar(200) NOT NULL,
    [product_code] nvarchar(100) NOT NULL,
    [product_name] nvarchar(300) NOT NULL,
    [department_code] nvarchar(100) NULL,
    [category_code] nvarchar(100) NULL,
    [subcategory] nvarchar(150) NULL,
    [is_serialized] int NOT NULL CONSTRAINT [DF_inter_store_transfer_serialized] DEFAULT 0,
    [requested_quantity] decimal(18, 3) NOT NULL CONSTRAINT [DF_inter_store_transfer_requested] DEFAULT 0,
    [issued_quantity] decimal(18, 3) NOT NULL CONSTRAINT [DF_inter_store_transfer_issued] DEFAULT 0,
    [received_quantity] decimal(18, 3) NOT NULL CONSTRAINT [DF_inter_store_transfer_received] DEFAULT 0,
    [outstanding_issue_quantity] decimal(18, 3) NOT NULL CONSTRAINT [DF_inter_store_transfer_outstanding_issue] DEFAULT 0,
    [outstanding_receipt_quantity] decimal(18, 3) NOT NULL CONSTRAINT [DF_inter_store_transfer_outstanding_receipt] DEFAULT 0,
    [unit_cost] decimal(18, 4) NULL,
    [issued_serial_numbers_json] nvarchar(max) NULL,
    [received_serial_numbers_json] nvarchar(max) NULL,
    [request_note] nvarchar(max) NULL,
    [issue_note] nvarchar(max) NULL,
    [receipt_note] nvarchar(max) NULL,
    [request_operator_name] nvarchar(200) NULL,
    [issue_operator_name] nvarchar(200) NULL,
    [receipt_operator_name] nvarchar(200) NULL,
    [requested_by_node_code] nvarchar(100) NULL,
    [source_node_code] nvarchar(100) NULL,
    [destination_node_code] nvarchar(100) NULL,
    [requested_at] nvarchar(40) NOT NULL,
    [required_at] nvarchar(40) NULL,
    [issued_at] nvarchar(40) NULL,
    [received_at] nvarchar(40) NULL,
    [closed_at] nvarchar(40) NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_inter_store_transfer_no] UNIQUE ([transfer_no])
  );
END;

IF OBJECT_ID(N'[dbo].[inter_store_transfer_request_draft]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[inter_store_transfer_request_draft] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_inter_store_transfer_request_draft] PRIMARY KEY,
    [request_no] nvarchar(100) NOT NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_inter_store_transfer_request_draft_status] DEFAULT N'DRAFT',
    [source_store_code] nvarchar(100) NOT NULL,
    [source_store_name] nvarchar(200) NOT NULL,
    [source_location_code] nvarchar(100) NOT NULL,
    [source_location_name] nvarchar(200) NOT NULL,
    [destination_store_code] nvarchar(100) NOT NULL,
    [destination_store_name] nvarchar(200) NOT NULL,
    [destination_location_code] nvarchar(100) NOT NULL,
    [destination_location_name] nvarchar(200) NOT NULL,
    [product_code] nvarchar(100) NOT NULL,
    [product_name] nvarchar(300) NOT NULL,
    [department_code] nvarchar(100) NULL,
    [category_code] nvarchar(100) NULL,
    [subcategory] nvarchar(150) NULL,
    [is_serialized] int NOT NULL CONSTRAINT [DF_inter_store_transfer_request_draft_serialized] DEFAULT 0,
    [quantity] decimal(18, 3) NOT NULL,
    [external_reference] nvarchar(200) NULL,
    [note] nvarchar(max) NULL,
    [operator_name] nvarchar(200) NOT NULL,
    [submitted_at] nvarchar(40) NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_inter_store_transfer_request_draft_no] UNIQUE ([request_no])
  );
END;

IF OBJECT_ID(N'[dbo].[stock_count_session]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[stock_count_session] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_stock_count_session] PRIMARY KEY,
    [session_no] nvarchar(100) NOT NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_stock_count_session_status] DEFAULT N'DRAFT',
    [inventory_location_code] nvarchar(100) NOT NULL,
    [inventory_location_name] nvarchar(200) NOT NULL,
    [product_code] nvarchar(100) NOT NULL,
    [product_name] nvarchar(300) NOT NULL,
    [department_code] nvarchar(100) NULL,
    [category_code] nvarchar(100) NULL,
    [subcategory] nvarchar(150) NULL,
    [is_serialized] int NOT NULL CONSTRAINT [DF_stock_count_session_serialized] DEFAULT 0,
    [previous_quantity] decimal(18, 3) NOT NULL,
    [counted_quantity] decimal(18, 3) NOT NULL,
    [variance_quantity] decimal(18, 3) NOT NULL,
    [previous_serial_numbers_json] nvarchar(max) NULL,
    [counted_serial_numbers_json] nvarchar(max) NULL,
    [note] nvarchar(max) NULL,
    [operator_name] nvarchar(200) NOT NULL,
    [submitted_at] nvarchar(40) NULL,
    [committed_at] nvarchar(40) NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_stock_count_session_no] UNIQUE ([session_no])
  );
END;

IF OBJECT_ID(N'[dbo].[permission_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[permission_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_permission_snapshot] PRIMARY KEY,
    [permission_code] nvarchar(150) NOT NULL,
    [permission_name] nvarchar(200) NOT NULL,
    [description] nvarchar(max) NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_permission_snapshot_code] UNIQUE ([permission_code])
  );
END;

IF OBJECT_ID(N'[dbo].[role_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[role_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_role_snapshot] PRIMARY KEY,
    [role_code] nvarchar(100) NOT NULL,
    [role_name] nvarchar(200) NOT NULL,
    [description] nvarchar(max) NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_role_snapshot_status] DEFAULT N'ACTIVE',
    [permission_codes_json] nvarchar(max) NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_role_snapshot_code] UNIQUE ([role_code])
  );
END;

IF OBJECT_ID(N'[dbo].[retail_user_snapshot]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[retail_user_snapshot] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_retail_user_snapshot] PRIMARY KEY,
    [login_id] nvarchar(150) NOT NULL,
    [email] nvarchar(320) NULL,
    [display_name] nvarchar(200) NOT NULL,
    [account_status] nvarchar(50) NOT NULL,
    [home_store_code] nvarchar(100) NULL,
    [home_store_name] nvarchar(200) NULL,
    [role_codes_json] nvarchar(max) NULL,
    [role_names_json] nvarchar(max) NULL,
    [permission_codes_json] nvarchar(max) NULL,
    [password_hash] nvarchar(max) NULL,
    [password_updated_at] nvarchar(40) NULL,
    [cashier_eligible] int NOT NULL CONSTRAINT [DF_retail_user_cashier] DEFAULT 0,
    [supervisor_eligible] int NOT NULL CONSTRAINT [DF_retail_user_supervisor] DEFAULT 0,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_retail_user_login] UNIQUE ([login_id])
  );
END;

IF OBJECT_ID(N'[dbo].[operator_session]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[operator_session] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_operator_session] PRIMARY KEY,
    [retail_user_id] nvarchar(100) NOT NULL,
    [terminal_code] nvarchar(100) NULL,
    [opened_at] nvarchar(40) NOT NULL,
    [last_seen_at] nvarchar(40) NOT NULL,
    [closed_at] nvarchar(40) NULL,
    [close_reason] nvarchar(100) NULL
  );
END;

IF OBJECT_ID(N'[dbo].[customer]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[customer] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_customer] PRIMARY KEY,
    [customer_no] nvarchar(100) NOT NULL,
    [full_name] nvarchar(200) NOT NULL,
    [customer_type] nvarchar(100) NOT NULL CONSTRAINT [DF_customer_type] DEFAULT N'INDIVIDUAL',
    [phone] nvarchar(100) NULL,
    [email] nvarchar(320) NULL,
    [home_store_code] nvarchar(100) NULL,
    [home_store_name] nvarchar(200) NULL,
    [address_line1] nvarchar(300) NULL,
    [city] nvarchar(100) NULL,
    [country_code] nvarchar(20) NULL,
    [loyalty_enrolled] int NOT NULL CONSTRAINT [DF_customer_loyalty] DEFAULT 0,
    [loyalty_tier] nvarchar(100) NULL,
    [loyalty_points_balance] int NOT NULL CONSTRAINT [DF_customer_points] DEFAULT 0,
    [allow_credit_sales] int NOT NULL CONSTRAINT [DF_customer_credit] DEFAULT 0,
    [credit_limit_amount] decimal(18, 4) NULL,
    [receivable_balance_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_customer_receivable] DEFAULT 0,
    [note] nvarchar(max) NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_customer_status] DEFAULT N'ACTIVE',
    [record_version] int NOT NULL CONSTRAINT [DF_customer_version] DEFAULT 1,
    [deleted_at] nvarchar(40) NULL,
    [updated_at] nvarchar(40) NOT NULL
  );
END;

IF OBJECT_ID(N'[dbo].[transaction_reference_capture]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[transaction_reference_capture] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_transaction_reference_capture] PRIMARY KEY,
    [reference_value] nvarchar(200) NOT NULL,
    [normalized_reference] nvarchar(200) NOT NULL,
    [details] nvarchar(max) NULL,
    [first_transaction_no] nvarchar(100) NULL,
    [last_transaction_no] nvarchar(100) NULL,
    [use_count] int NOT NULL CONSTRAINT [DF_transaction_reference_capture_use_count] DEFAULT 1,
    [first_seen_at] nvarchar(40) NOT NULL,
    [last_seen_at] nvarchar(40) NOT NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_transaction_reference_capture_key] UNIQUE ([normalized_reference])
  );
END;

IF OBJECT_ID(N'[dbo].[pos_shift]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[pos_shift] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_pos_shift] PRIMARY KEY,
    [shift_no] nvarchar(100) NOT NULL,
    [terminal_code] nvarchar(100) NOT NULL,
    [cashier_code] nvarchar(150) NOT NULL,
    [status] nvarchar(50) NOT NULL,
    [opening_float_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_pos_shift_opening_float] DEFAULT 0,
    [closing_declared_cash] decimal(18, 4) NULL,
    [closing_variance] decimal(18, 4) NULL,
    [opened_at] nvarchar(40) NOT NULL,
    [closed_at] nvarchar(40) NULL,
    [record_version] int NOT NULL CONSTRAINT [DF_pos_shift_version] DEFAULT 1
  );
END;

IF OBJECT_ID(N'[dbo].[pos_transaction]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[pos_transaction] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_pos_transaction] PRIMARY KEY,
    [transaction_no] nvarchar(100) NOT NULL,
    [shift_id] nvarchar(100) NULL,
    [cashier_code] nvarchar(150) NULL,
    [customer_id] nvarchar(100) NULL,
    [source_transaction_id] nvarchar(100) NULL,
    [source_transaction_no] nvarchar(100) NULL,
    [transaction_type] nvarchar(50) NOT NULL,
    [status] nvarchar(50) NOT NULL,
    [subtotal_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_pos_transaction_subtotal] DEFAULT 0,
    [discount_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_pos_transaction_discount] DEFAULT 0,
    [loyalty_redemption_points] int NOT NULL CONSTRAINT [DF_pos_transaction_loyalty_points] DEFAULT 0,
    [loyalty_redemption_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_pos_transaction_loyalty_amount] DEFAULT 0,
    [tax_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_pos_transaction_tax] DEFAULT 0,
    [total_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_pos_transaction_total] DEFAULT 0,
    [paid_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_pos_transaction_paid] DEFAULT 0,
    [change_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_pos_transaction_change] DEFAULT 0,
    [notes] nvarchar(max) NULL,
    [header_reference] nvarchar(200) NULL,
    [additional_details] nvarchar(max) NULL,
    [completed_at] nvarchar(40) NULL,
    [record_version] int NOT NULL CONSTRAINT [DF_pos_transaction_version] DEFAULT 1,
    [deleted_at] nvarchar(40) NULL,
    [updated_at] nvarchar(40) NOT NULL
  );
END;

IF OBJECT_ID(N'[dbo].[pos_transaction_line]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[pos_transaction_line] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_pos_transaction_line] PRIMARY KEY,
    [pos_transaction_id] nvarchar(100) NOT NULL,
    [product_id] nvarchar(100) NOT NULL,
    [inventory_location_code] nvarchar(100) NULL,
    [line_intent] nvarchar(50) NOT NULL CONSTRAINT [DF_pos_transaction_line_intent] DEFAULT N'SALE',
    [source_line_id] nvarchar(100) NULL,
    [applied_promotion_code] nvarchar(100) NULL,
    [applied_promotion_name] nvarchar(200) NULL,
    [product_code_snapshot] nvarchar(100) NOT NULL,
    [product_variant_code_snapshot] nvarchar(100) NULL,
    [product_name_snapshot] nvarchar(300) NOT NULL,
    [variant_size] nvarchar(100) NULL,
    [variant_color] nvarchar(100) NULL,
    [variant_attributes_snapshot] nvarchar(1000) NULL,
    [line_note] nvarchar(max) NULL,
    [serial_numbers_json] nvarchar(max) NULL,
    [quantity] decimal(18, 3) NOT NULL CONSTRAINT [DF_pos_transaction_line_quantity] DEFAULT 0,
    [unit_price] decimal(18, 4) NOT NULL CONSTRAINT [DF_pos_transaction_line_unit_price] DEFAULT 0,
    [discount_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_pos_transaction_line_discount] DEFAULT 0,
    [tax_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_pos_transaction_line_tax] DEFAULT 0,
    [line_total] decimal(18, 4) NOT NULL CONSTRAINT [DF_pos_transaction_line_total] DEFAULT 0,
    [manual_price_override] int NOT NULL CONSTRAINT [DF_pos_transaction_line_price_override] DEFAULT 0,
    [manual_discount_override] int NOT NULL CONSTRAINT [DF_pos_transaction_line_discount_override] DEFAULT 0
  );
END;

IF COL_LENGTH(N'[dbo].[pos_transaction_line]', N'inventory_location_code') IS NULL
BEGIN
  ALTER TABLE [dbo].[pos_transaction_line]
  ADD [inventory_location_code] nvarchar(100) NULL;
END;

IF COL_LENGTH(N'[dbo].[pos_transaction_line]', N'variant_size') IS NULL
BEGIN
  ALTER TABLE [dbo].[pos_transaction_line]
  ADD [variant_size] nvarchar(100) NULL;
END;

IF COL_LENGTH(N'[dbo].[pos_transaction_line]', N'product_variant_code_snapshot') IS NULL
BEGIN
  ALTER TABLE [dbo].[pos_transaction_line]
  ADD [product_variant_code_snapshot] nvarchar(100) NULL;
END;

IF COL_LENGTH(N'[dbo].[pos_transaction_line]', N'variant_color') IS NULL
BEGIN
  ALTER TABLE [dbo].[pos_transaction_line]
  ADD [variant_color] nvarchar(100) NULL;
END;

IF COL_LENGTH(N'[dbo].[pos_transaction_line]', N'variant_attributes_snapshot') IS NULL
BEGIN
  ALTER TABLE [dbo].[pos_transaction_line]
  ADD [variant_attributes_snapshot] nvarchar(1000) NULL;
END;

IF COL_LENGTH(N'[dbo].[pos_transaction_line]', N'line_note') IS NULL
BEGIN
  ALTER TABLE [dbo].[pos_transaction_line]
  ADD [line_note] nvarchar(max) NULL;
END;

IF OBJECT_ID(N'[dbo].[pos_payment]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[pos_payment] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_pos_payment] PRIMARY KEY,
    [pos_transaction_id] nvarchar(100) NOT NULL,
    [tender_method_code] nvarchar(100) NULL,
    [tender_method_name] nvarchar(200) NULL,
    [bank_account_id] nvarchar(100) NULL,
    [bank_code] nvarchar(100) NULL,
    [bank_name] nvarchar(200) NULL,
    [bank_branch_code] nvarchar(100) NULL,
    [bank_branch_name] nvarchar(200) NULL,
    [bank_account_number] nvarchar(100) NULL,
    [bank_account_name] nvarchar(200) NULL,
    [method] nvarchar(50) NOT NULL,
    [payment_purpose] nvarchar(50) NOT NULL CONSTRAINT [DF_pos_payment_purpose] DEFAULT N'TRANSACTION_SETTLEMENT',
    [amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_pos_payment_amount] DEFAULT 0,
    [reference] nvarchar(200) NULL,
    [received_shift_id] nvarchar(100) NULL,
    [received_shift_no] nvarchar(100) NULL,
    [received_terminal_code] nvarchar(100) NULL,
    [received_cashier_code] nvarchar(100) NULL,
    [received_at] nvarchar(40) NOT NULL
  );
END;

IF COL_LENGTH(N'[dbo].[pos_payment]', N'payment_purpose') IS NULL
BEGIN
  ALTER TABLE [dbo].[pos_payment]
    ADD [payment_purpose] nvarchar(50) NOT NULL
      CONSTRAINT [DF_pos_payment_purpose_upgrade] DEFAULT N'TRANSACTION_SETTLEMENT';
END;

IF COL_LENGTH(N'[dbo].[pos_payment]', N'received_shift_id') IS NULL
  ALTER TABLE [dbo].[pos_payment] ADD [received_shift_id] nvarchar(100) NULL;
IF COL_LENGTH(N'[dbo].[pos_payment]', N'received_shift_no') IS NULL
  ALTER TABLE [dbo].[pos_payment] ADD [received_shift_no] nvarchar(100) NULL;
IF COL_LENGTH(N'[dbo].[pos_payment]', N'received_terminal_code') IS NULL
  ALTER TABLE [dbo].[pos_payment] ADD [received_terminal_code] nvarchar(100) NULL;
IF COL_LENGTH(N'[dbo].[pos_payment]', N'received_cashier_code') IS NULL
  ALTER TABLE [dbo].[pos_payment] ADD [received_cashier_code] nvarchar(100) NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_pos_payment_received_shift'
    AND object_id = OBJECT_ID(N'[dbo].[pos_payment]')
)
  EXEC(N'CREATE INDEX [IX_pos_payment_received_shift]
    ON [dbo].[pos_payment]([received_shift_id]);');

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_pos_payment_received_at'
    AND object_id = OBJECT_ID(N'[dbo].[pos_payment]')
)
  CREATE INDEX [IX_pos_payment_received_at]
    ON [dbo].[pos_payment]([received_at]);

IF OBJECT_ID(N'[dbo].[customer_account_entry]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[customer_account_entry] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_customer_account_entry] PRIMARY KEY,
    [entry_no] nvarchar(100) NOT NULL,
    [customer_id] nvarchar(100) NOT NULL,
    [customer_no] nvarchar(100) NOT NULL,
    [customer_name] nvarchar(200) NOT NULL,
    [entry_type] nvarchar(100) NOT NULL CONSTRAINT [DF_customer_account_entry_type] DEFAULT N'ACCOUNT_PAYMENT',
    [payment_method] nvarchar(50) NOT NULL,
    [tender_method_code] nvarchar(100) NULL,
    [tender_method_name] nvarchar(200) NULL,
    [bank_account_id] nvarchar(100) NULL,
    [bank_code] nvarchar(100) NULL,
    [bank_name] nvarchar(200) NULL,
    [bank_branch_code] nvarchar(100) NULL,
    [bank_branch_name] nvarchar(200) NULL,
    [bank_account_number] nvarchar(100) NULL,
    [bank_account_name] nvarchar(200) NULL,
    [amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_customer_account_entry_amount] DEFAULT 0,
    [reference] nvarchar(200) NULL,
    [note] nvarchar(max) NULL,
    [shift_id] nvarchar(100) NOT NULL,
    [shift_no] nvarchar(100) NULL,
    [cashier_code] nvarchar(150) NULL,
    [synced_at] nvarchar(40) NULL,
    [occurred_at] nvarchar(40) NOT NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_customer_account_entry_no] UNIQUE ([entry_no])
  );
END;

IF OBJECT_ID(N'[dbo].[sales_order]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[sales_order] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_sales_order] PRIMARY KEY,
    [order_no] nvarchar(100) NOT NULL,
    [source_transaction_id] nvarchar(100) NOT NULL,
    [source_transaction_no] nvarchar(100) NOT NULL,
    [customer_id] nvarchar(100) NULL,
    [customer_no] nvarchar(100) NULL,
    [customer_name] nvarchar(200) NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_sales_order_status] DEFAULT N'OPEN',
    [total_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_sales_order_total] DEFAULT 0,
    [deposit_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_sales_order_deposit] DEFAULT 0,
    [balance_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_sales_order_balance] DEFAULT 0,
    [deposit_tender_method_code] nvarchar(100) NULL,
    [deposit_tender_method_name] nvarchar(200) NULL,
    [deposit_payment_method] nvarchar(50) NULL,
    [deposit_reference] nvarchar(200) NULL,
    [deposit_paid_at] nvarchar(40) NULL,
    [operator_name] nvarchar(200) NULL,
    [note] nvarchar(max) NULL,
    [fulfilled_transaction_id] nvarchar(100) NULL,
    [fulfilled_transaction_no] nvarchar(100) NULL,
    [synced_at] nvarchar(40) NULL,
    [created_at] nvarchar(40) NOT NULL,
    [fulfilled_at] nvarchar(40) NULL,
    [cancelled_at] nvarchar(40) NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_sales_order_no] UNIQUE ([order_no])
  );
END;

IF COL_LENGTH(N'[dbo].[sales_order]', N'deposit_amount') IS NULL
BEGIN
  ALTER TABLE [dbo].[sales_order]
  ADD [deposit_amount] decimal(18, 4) NOT NULL
    CONSTRAINT [DF_sales_order_deposit_existing] DEFAULT 0;
END;

IF COL_LENGTH(N'[dbo].[sales_order]', N'balance_amount') IS NULL
BEGIN
  ALTER TABLE [dbo].[sales_order]
  ADD [balance_amount] decimal(18, 4) NOT NULL
    CONSTRAINT [DF_sales_order_balance_existing] DEFAULT 0;
END;

IF COL_LENGTH(N'[dbo].[sales_order]', N'deposit_tender_method_code') IS NULL
BEGIN
  ALTER TABLE [dbo].[sales_order]
  ADD [deposit_tender_method_code] nvarchar(100) NULL;
END;

IF COL_LENGTH(N'[dbo].[sales_order]', N'deposit_tender_method_name') IS NULL
BEGIN
  ALTER TABLE [dbo].[sales_order]
  ADD [deposit_tender_method_name] nvarchar(200) NULL;
END;

IF COL_LENGTH(N'[dbo].[sales_order]', N'deposit_payment_method') IS NULL
BEGIN
  ALTER TABLE [dbo].[sales_order]
  ADD [deposit_payment_method] nvarchar(50) NULL;
END;

IF COL_LENGTH(N'[dbo].[sales_order]', N'deposit_reference') IS NULL
BEGIN
  ALTER TABLE [dbo].[sales_order]
  ADD [deposit_reference] nvarchar(200) NULL;
END;

IF COL_LENGTH(N'[dbo].[sales_order]', N'deposit_paid_at') IS NULL
BEGIN
  ALTER TABLE [dbo].[sales_order]
  ADD [deposit_paid_at] nvarchar(40) NULL;
END;

IF COL_LENGTH(N'[dbo].[sales_order]', N'balance_amount') IS NOT NULL
BEGIN
  EXEC(N'UPDATE [dbo].[sales_order]
    SET [balance_amount] = [total_amount]
    WHERE [balance_amount] = 0
      AND [status] = N''OPEN'';');
END;

EXEC(N'
UPDATE payment
SET [received_shift_id] = matched_shift.[id]
FROM [dbo].[pos_payment] AS payment
LEFT JOIN [dbo].[pos_transaction] AS txn
  ON txn.[id] = payment.[pos_transaction_id]
LEFT JOIN [dbo].[pos_shift] AS transaction_shift
  ON transaction_shift.[id] = txn.[shift_id]
OUTER APPLY (
  SELECT TOP (1) shift.[id]
  FROM [dbo].[pos_shift] AS shift
  WHERE shift.[opened_at] <= payment.[received_at]
    AND (shift.[closed_at] IS NULL OR shift.[closed_at] >= payment.[received_at])
    AND (
      transaction_shift.[terminal_code] IS NULL
      OR shift.[terminal_code] = transaction_shift.[terminal_code]
    )
  ORDER BY shift.[opened_at] DESC
) AS matched_shift
WHERE payment.[received_shift_id] IS NULL
  AND matched_shift.[id] IS NOT NULL;

UPDATE payment
SET [received_shift_id] = txn.[shift_id]
FROM [dbo].[pos_payment] AS payment
INNER JOIN [dbo].[pos_transaction] AS txn
  ON txn.[id] = payment.[pos_transaction_id]
WHERE payment.[received_shift_id] IS NULL;

UPDATE payment
SET [received_shift_no] = COALESCE(payment.[received_shift_no], shift.[shift_no]),
    [received_terminal_code] = COALESCE(payment.[received_terminal_code], shift.[terminal_code]),
    [received_cashier_code] = COALESCE(payment.[received_cashier_code], shift.[cashier_code])
FROM [dbo].[pos_payment] AS payment
INNER JOIN [dbo].[pos_shift] AS shift
  ON shift.[id] = payment.[received_shift_id];

UPDATE payment
SET [payment_purpose] = N''SALES_ORDER_DEPOSIT''
FROM [dbo].[pos_payment] AS payment
INNER JOIN [dbo].[sales_order] AS sales_order
  ON sales_order.[source_transaction_id] = payment.[pos_transaction_id]
WHERE payment.[payment_purpose] = N''TRANSACTION_SETTLEMENT''
  AND sales_order.[deposit_paid_at] IS NOT NULL
  AND payment.[received_at] <= sales_order.[deposit_paid_at];

UPDATE payment
SET [payment_purpose] = N''SALES_ORDER_BALANCE''
FROM [dbo].[pos_payment] AS payment
INNER JOIN [dbo].[sales_order] AS sales_order
  ON sales_order.[source_transaction_id] = payment.[pos_transaction_id]
WHERE payment.[payment_purpose] = N''TRANSACTION_SETTLEMENT''
  AND (
    sales_order.[deposit_paid_at] IS NULL
    OR payment.[received_at] > sales_order.[deposit_paid_at]
  );');

IF OBJECT_ID(N'[dbo].[eod_reconciliation]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[eod_reconciliation] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_eod_reconciliation] PRIMARY KEY,
    [reconciliation_no] nvarchar(100) NOT NULL,
    [shift_id] nvarchar(100) NOT NULL,
    [shift_no] nvarchar(100) NOT NULL,
    [cashier_code] nvarchar(150) NOT NULL,
    [expected_cash_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_eod_reconciliation_expected_cash] DEFAULT 0,
    [declared_cash_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_eod_reconciliation_declared_cash] DEFAULT 0,
    [variance_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_eod_reconciliation_variance] DEFAULT 0,
    [net_sales_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_eod_reconciliation_net_sales] DEFAULT 0,
    [cash_tendered_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_eod_reconciliation_cash_tendered] DEFAULT 0,
    [non_cash_tendered_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_eod_reconciliation_non_cash_tendered] DEFAULT 0,
    [transaction_count] int NOT NULL CONSTRAINT [DF_eod_reconciliation_transaction_count] DEFAULT 0,
    [operator_name] nvarchar(200) NULL,
    [note] nvarchar(max) NULL,
    [synced_at] nvarchar(40) NULL,
    [reconciled_at] nvarchar(40) NOT NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_eod_reconciliation_no] UNIQUE ([reconciliation_no])
  );
END;

IF OBJECT_ID(N'[dbo].[banking_deposit]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[banking_deposit] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_banking_deposit] PRIMARY KEY,
    [deposit_no] nvarchar(100) NOT NULL,
    [reconciliation_id] nvarchar(100) NOT NULL,
    [reconciliation_no] nvarchar(100) NOT NULL,
    [shift_id] nvarchar(100) NOT NULL,
    [shift_no] nvarchar(100) NOT NULL,
    [amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_banking_deposit_amount] DEFAULT 0,
    [bank_account_id] nvarchar(100) NULL,
    [bank_name] nvarchar(200) NULL,
    [bank_code] nvarchar(100) NULL,
    [bank_branch_code] nvarchar(100) NULL,
    [bank_branch_name] nvarchar(200) NULL,
    [bank_account_number] nvarchar(100) NULL,
    [bank_account_name] nvarchar(200) NULL,
    [reference] nvarchar(200) NULL,
    [operator_name] nvarchar(200) NULL,
    [note] nvarchar(max) NULL,
    [synced_at] nvarchar(40) NULL,
    [deposited_at] nvarchar(40) NOT NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_banking_deposit_no] UNIQUE ([deposit_no])
  );
END;

IF OBJECT_ID(N'[dbo].[local_store_expense]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[local_store_expense] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_local_store_expense] PRIMARY KEY,
    [expense_no] nvarchar(120) NOT NULL,
    [status] nvarchar(30) NOT NULL CONSTRAINT [DF_local_store_expense_status] DEFAULT N'DRAFT',
    [expense_date] nvarchar(40) NOT NULL,
    [category] nvarchar(80) NOT NULL,
    [description] nvarchar(500) NOT NULL,
    [supplier_name] nvarchar(200) NULL,
    [payment_method] nvarchar(80) NULL,
    [external_reference] nvarchar(200) NULL,
    [amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_local_store_expense_amount] DEFAULT 0,
    [tax_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_local_store_expense_tax] DEFAULT 0,
    [attachment_file_name] nvarchar(260) NULL,
    [attachment_url] nvarchar(500) NULL,
    [attachment_content_type] nvarchar(120) NULL,
    [attachment_content_base64] nvarchar(max) NULL,
    [operator_name] nvarchar(160) NOT NULL,
    [note] nvarchar(1000) NULL,
    [confirmed_by] nvarchar(160) NULL,
    [confirmed_at] nvarchar(40) NULL,
    [synced_at] nvarchar(40) NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_local_store_expense_no] UNIQUE ([expense_no])
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_local_store_expense_status' AND [object_id] = OBJECT_ID(N'[dbo].[local_store_expense]'))
BEGIN
  CREATE INDEX [IX_local_store_expense_status] ON [dbo].[local_store_expense] ([status], [expense_date] DESC);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_local_store_expense_synced' AND [object_id] = OBJECT_ID(N'[dbo].[local_store_expense]'))
BEGIN
  CREATE INDEX [IX_local_store_expense_synced] ON [dbo].[local_store_expense] ([synced_at], [confirmed_at] DESC);
END;

IF OBJECT_ID(N'[dbo].[sync_outbox]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[sync_outbox] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_sync_outbox] PRIMARY KEY,
    [target_node_code] nvarchar(100) NULL,
    [aggregate_type] nvarchar(100) NOT NULL,
    [aggregate_id] nvarchar(100) NOT NULL,
    [event_type] nvarchar(150) NOT NULL,
    [idempotency_key] nvarchar(300) NOT NULL,
    [payload_json] nvarchar(max) NOT NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_sync_outbox_status] DEFAULT N'PENDING',
    [attempt_count] int NOT NULL CONSTRAINT [DF_sync_outbox_attempt_count] DEFAULT 0,
    [record_version] int NOT NULL CONSTRAINT [DF_sync_outbox_record_version] DEFAULT 1,
    [last_attempt_at] nvarchar(40) NULL,
    [next_retry_at] nvarchar(40) NULL,
    [failure_kind] nvarchar(50) NULL,
    [last_http_status] int NULL,
    [sync_run_id] nvarchar(100) NULL,
    [acknowledged_at] nvarchar(40) NULL,
    [error_message] nvarchar(max) NULL,
    [created_at] nvarchar(40) NOT NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_sync_outbox_idempotency_key] UNIQUE ([idempotency_key])
  );
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'idx_sync_outbox_retry'
    AND object_id = OBJECT_ID(N'[dbo].[sync_outbox]')
)
BEGIN
  CREATE INDEX [idx_sync_outbox_retry]
    ON [dbo].[sync_outbox] ([status], [next_retry_at], [created_at]);
END;

IF OBJECT_ID(N'[dbo].[sync_inbox]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[sync_inbox] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_sync_inbox] PRIMARY KEY,
    [source_node_code] nvarchar(100) NOT NULL,
    [aggregate_type] nvarchar(100) NOT NULL,
    [aggregate_id] nvarchar(100) NOT NULL,
    [event_type] nvarchar(150) NOT NULL,
    [payload_json] nvarchar(max) NOT NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_sync_inbox_status] DEFAULT N'RECEIVED',
    [received_at] nvarchar(40) NOT NULL,
    [applied_at] nvarchar(40) NULL,
    [acknowledged_at] nvarchar(40) NULL,
    [error_message] nvarchar(max) NULL
  );
END;

IF OBJECT_ID(N'[dbo].[sync_recovery_task]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[sync_recovery_task] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_sync_recovery_task] PRIMARY KEY,
    [task_type] nvarchar(100) NOT NULL,
    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_sync_recovery_task_status] DEFAULT N'OPEN',
    [title] nvarchar(300) NOT NULL,
    [instructions] nvarchar(max) NOT NULL,
    [source_inbound_event_id] nvarchar(100) NOT NULL,
    [source_event_type] nvarchar(150) NOT NULL,
    [aggregate_type] nvarchar(100) NOT NULL,
    [aggregate_id] nvarchar(100) NOT NULL,
    [transaction_no] nvarchar(100) NULL,
    [product_code] nvarchar(100) NULL,
    [replacement_aggregate_type] nvarchar(100) NOT NULL,
    [replacement_aggregate_id] nvarchar(100) NOT NULL,
    [replacement_event_type] nvarchar(150) NOT NULL,
    [replacement_record_version] int NOT NULL CONSTRAINT [DF_sync_recovery_task_replacement_version] DEFAULT 1,
    [replacement_payload_json] nvarchar(max) NOT NULL,
    [operator_name] nvarchar(200) NOT NULL,
    [operator_note] nvarchar(max) NOT NULL,
    [store_note] nvarchar(max) NULL,
    [requested_at] nvarchar(40) NOT NULL,
    [completed_at] nvarchar(40) NULL,
    [created_at] nvarchar(40) NOT NULL,
    [updated_at] nvarchar(40) NOT NULL
  );
END;

IF OBJECT_ID(N'[dbo].[sync_checkpoint]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[sync_checkpoint] (
    [remote_node_code] nvarchar(100) NOT NULL CONSTRAINT [PK_sync_checkpoint] PRIMARY KEY,
    [last_event_id] nvarchar(100) NULL,
    [last_received_cursor] nvarchar(300) NULL,
    [last_received_at] nvarchar(40) NULL,
    [last_applied_at] nvarchar(40) NULL
  );
END;

IF OBJECT_ID(N'[dbo].[sync_run_log]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[sync_run_log] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_sync_run_log] PRIMARY KEY,
    [run_kind] nvarchar(100) NOT NULL,
    [result] nvarchar(50) NOT NULL,
    [summary] nvarchar(max) NOT NULL,
    [upstream_processed] int NOT NULL CONSTRAINT [DF_sync_run_log_upstream] DEFAULT 0,
    [downstream_applied] int NOT NULL CONSTRAINT [DF_sync_run_log_downstream] DEFAULT 0,
    [started_at] nvarchar(40) NOT NULL,
    [finished_at] nvarchar(40) NULL
  );
END;

IF OBJECT_ID(N'[dbo].[terminal_connection]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[terminal_connection] (
    [terminal_code] nvarchar(100) NOT NULL CONSTRAINT [PK_terminal_connection] PRIMARY KEY,
    [client_name] nvarchar(200) NULL,
    [first_seen_at] nvarchar(40) NOT NULL,
    [last_seen_at] nvarchar(40) NOT NULL,
    [request_count] int NOT NULL CONSTRAINT [DF_terminal_connection_request_count] DEFAULT 0,
    [last_method] nvarchar(100) NULL,
    [remote_address] nvarchar(100) NULL,
    [user_agent] nvarchar(500) NULL
  );
END;

IF NOT EXISTS (SELECT 1 FROM [dbo].[store_node_metadata] WHERE [key] = N'schema_version')
BEGIN
  INSERT INTO [dbo].[store_node_metadata] ([key], [value], [updated_at])
  VALUES (N'schema_version', N'flash-erp-store-mssql-v1', CONVERT(nvarchar(40), SYSUTCDATETIME(), 127));
END
ELSE
BEGIN
  UPDATE [dbo].[store_node_metadata]
  SET [value] = N'flash-erp-store-mssql-v1',
      [updated_at] = CONVERT(nvarchar(40), SYSUTCDATETIME(), 127)
  WHERE [key] = N'schema_version';
END;
IF COL_LENGTH(N'[dbo].[product_snapshot]', N'track_expiry') IS NULL
  ALTER TABLE [dbo].[product_snapshot] ADD [track_expiry] int NOT NULL CONSTRAINT [DF_product_snapshot_track_expiry] DEFAULT 0;
IF COL_LENGTH(N'[dbo].[product_snapshot]', N'shelf_life_days') IS NULL
  ALTER TABLE [dbo].[product_snapshot] ADD [shelf_life_days] int NULL;
IF COL_LENGTH(N'[dbo].[local_goods_receipt_line]', N'batch_no') IS NULL
  ALTER TABLE [dbo].[local_goods_receipt_line] ADD [batch_no] nvarchar(200) NULL;
IF COL_LENGTH(N'[dbo].[local_goods_receipt_line]', N'manufactured_at') IS NULL
  ALTER TABLE [dbo].[local_goods_receipt_line] ADD [manufactured_at] nvarchar(40) NULL;
IF COL_LENGTH(N'[dbo].[local_goods_receipt_line]', N'expiry_date') IS NULL
  ALTER TABLE [dbo].[local_goods_receipt_line] ADD [expiry_date] nvarchar(40) NULL;
IF COL_LENGTH(N'[dbo].[local_supplier_return_line]', N'batch_allocations_json') IS NULL
  ALTER TABLE [dbo].[local_supplier_return_line] ADD [batch_allocations_json] nvarchar(max) NULL;
IF COL_LENGTH(N'[dbo].[inter_store_transfer_snapshot]', N'track_expiry') IS NULL
  ALTER TABLE [dbo].[inter_store_transfer_snapshot] ADD [track_expiry] int NOT NULL CONSTRAINT [DF_transfer_snapshot_track_expiry] DEFAULT 0;
IF COL_LENGTH(N'[dbo].[inter_store_transfer_snapshot]', N'issued_batch_allocations_json') IS NULL
  ALTER TABLE [dbo].[inter_store_transfer_snapshot] ADD [issued_batch_allocations_json] nvarchar(max) NULL;
IF COL_LENGTH(N'[dbo].[inter_store_transfer_snapshot]', N'received_batch_allocations_json') IS NULL
  ALTER TABLE [dbo].[inter_store_transfer_snapshot] ADD [received_batch_allocations_json] nvarchar(max) NULL;
IF COL_LENGTH(N'[dbo].[stock_count_session]', N'previous_batch_quantities_json') IS NULL
  ALTER TABLE [dbo].[stock_count_session] ADD [previous_batch_quantities_json] nvarchar(max) NULL;
IF COL_LENGTH(N'[dbo].[stock_count_session]', N'counted_batch_quantities_json') IS NULL
  ALTER TABLE [dbo].[stock_count_session] ADD [counted_batch_quantities_json] nvarchar(max) NULL;
IF COL_LENGTH(N'[dbo].[pos_transaction_line]', N'batch_allocations_json') IS NULL
  ALTER TABLE [dbo].[pos_transaction_line] ADD [batch_allocations_json] nvarchar(max) NULL;
IF COL_LENGTH(N'[dbo].[purchase_order_line_snapshot]', N'track_expiry') IS NULL
  ALTER TABLE [dbo].[purchase_order_line_snapshot] ADD [track_expiry] int NOT NULL CONSTRAINT [DF_purchase_order_line_track_expiry_upgrade] DEFAULT 0;

IF OBJECT_ID(N'[dbo].[inventory_batch_registry]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[inventory_batch_registry] (
    [id] nvarchar(100) NOT NULL CONSTRAINT [PK_inventory_batch_registry] PRIMARY KEY,
    [product_code] nvarchar(100) NOT NULL,
    [inventory_location_code] nvarchar(100) NOT NULL,
    [batch_no] nvarchar(200) NOT NULL,
    [manufactured_at] nvarchar(40) NULL,
    [expiry_date] nvarchar(40) NOT NULL,
    [quantity_on_hand] decimal(18, 3) NOT NULL CONSTRAINT [DF_inventory_batch_qty] DEFAULT 0,
    [status] nvarchar(30) NOT NULL CONSTRAINT [DF_inventory_batch_status] DEFAULT N'ACTIVE',
    [source_reference_type] nvarchar(100) NULL,
    [source_reference_id] nvarchar(100) NULL,
    [source_reference_label] nvarchar(200) NULL,
    [updated_at] nvarchar(40) NOT NULL,
    CONSTRAINT [UQ_inventory_batch_position] UNIQUE ([inventory_location_code], [product_code], [batch_no])
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_inventory_batch_registry_fefo' AND object_id = OBJECT_ID(N'[dbo].[inventory_batch_registry]'))
  CREATE INDEX [IX_inventory_batch_registry_fefo] ON [dbo].[inventory_batch_registry] ([inventory_location_code], [product_code], [status], [expiry_date], [batch_no]);
