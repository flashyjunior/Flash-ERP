CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS store_node_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT now()::text
);

CREATE TABLE IF NOT EXISTS product_snapshot (
  id TEXT PRIMARY KEY,
  product_code TEXT NOT NULL UNIQUE,
  product_name TEXT NOT NULL,
  product_type TEXT NOT NULL DEFAULT 'STANDARD',
  short_name TEXT,
  description TEXT,
  primary_image_url TEXT,
  department_code TEXT,
  category_code TEXT,
  subcategory TEXT,
  unit_of_measure TEXT NOT NULL DEFAULT 'EA',
  taxable INTEGER NOT NULL DEFAULT 1,
  tax_profile_code TEXT,
  tax_profile_name TEXT,
  tax_rate_percent NUMERIC,
  tax_inclusive INTEGER NOT NULL DEFAULT 0,
  track_inventory INTEGER NOT NULL DEFAULT 1,
  is_serialized INTEGER NOT NULL DEFAULT 0,
  track_size INTEGER NOT NULL DEFAULT 0,
  track_color INTEGER NOT NULL DEFAULT 0,
  must_enter_price_at_pos INTEGER NOT NULL DEFAULT 0,
  min_stock_level NUMERIC,
  reorder_point NUMERIC,
  safety_stock_level NUMERIC,
  catalog_membership_active INTEGER NOT NULL DEFAULT 1,
  catalog_sort_order INTEGER,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  quantity_on_hand NUMERIC NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_variant_snapshot (
  id TEXT PRIMARY KEY,
  product_code TEXT NOT NULL,
  variant_code TEXT NOT NULL UNIQUE,
  sku TEXT,
  display_name TEXT,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  quantity_on_hand NUMERIC NOT NULL DEFAULT 0,
  barcode TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  attributes_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (product_code) REFERENCES product_snapshot(product_code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_department_snapshot (
  id TEXT PRIMARY KEY,
  department_code TEXT NOT NULL UNIQUE,
  department_name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_category_snapshot (
  id TEXT PRIMARY KEY,
  category_code TEXT NOT NULL UNIQUE,
  category_name TEXT NOT NULL,
  department_code TEXT NOT NULL,
  department_name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS unit_of_measure_snapshot (
  id TEXT PRIMARY KEY,
  uom_code TEXT NOT NULL UNIQUE,
  uom_name TEXT NOT NULL,
  description TEXT,
  decimal_precision INTEGER NOT NULL DEFAULT 0,
  allow_fractional_sale INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS barcode_snapshot (
  id TEXT PRIMARY KEY,
  barcode_code TEXT NOT NULL UNIQUE,
  product_code TEXT NOT NULL,
  barcode_type TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_list_entry_snapshot (
  id TEXT PRIMARY KEY,
  price_list_code TEXT NOT NULL,
  price_list_name TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  customer_type TEXT,
  loyalty_tier TEXT,
  product_code TEXT NOT NULL,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  updated_at TEXT NOT NULL,
  UNIQUE(price_list_code, product_code)
);

CREATE TABLE IF NOT EXISTS tax_profile_snapshot (
  id TEXT PRIMARY KEY,
  tax_profile_code TEXT NOT NULL UNIQUE,
  tax_profile_name TEXT NOT NULL,
  description TEXT,
  rate_percent NUMERIC NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_tax_inclusive INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gift_certificate_snapshot (
  id TEXT PRIMARY KEY,
  certificate_no TEXT NOT NULL UNIQUE,
  recipient_name TEXT,
  purchaser_name TEXT,
  original_amount NUMERIC NOT NULL,
  balance_amount NUMERIC NOT NULL,
  currency_code TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  expiry_date TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tender_method_snapshot (
  id TEXT PRIMARY KEY,
  tender_method_code TEXT NOT NULL UNIQUE,
  tender_method_name TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  gateway_provider TEXT,
  gateway_mode TEXT,
  gateway_merchant_id TEXT,
  gateway_public_key TEXT,
  gateway_callback_url TEXT,
  gateway_active INTEGER NOT NULL DEFAULT 0,
  gateway_status TEXT NOT NULL DEFAULT 'DISABLED',
  description TEXT,
  requires_reference INTEGER NOT NULL DEFAULT 0,
  allow_change INTEGER NOT NULL DEFAULT 0,
  allow_refund INTEGER NOT NULL DEFAULT 1,
  allow_open_cash_drawer INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  updated_at TEXT NOT NULL
);

ALTER TABLE tender_method_snapshot ADD COLUMN IF NOT EXISTS published_at TEXT;

CREATE TABLE IF NOT EXISTS bank_account_snapshot (
  id TEXT PRIMARY KEY,
  bank_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  branch_code TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS supplier_snapshot (
  supplier_no TEXT PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  tax_number TEXT,
  address_line1 TEXT,
  city TEXT,
  country_code TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS promotion_snapshot (
  id TEXT PRIMARY KEY,
  promotion_code TEXT NOT NULL UNIQUE,
  promotion_name TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL,
  target_scope TEXT NOT NULL DEFAULT 'ALL_ITEMS',
  discount_value NUMERIC NOT NULL,
  minimum_basket_amount NUMERIC,
  minimum_line_quantity NUMERIC,
  buy_quantity NUMERIC,
  reward_quantity NUMERIC,
  target_department_code TEXT,
  target_category_code TEXT,
  target_product_code TEXT,
  eligible_store_codes_json TEXT,
  eligible_customer_types_json TEXT,
  eligible_loyalty_tiers_json TEXT,
  active_days_of_week_json TEXT,
  active_from_minutes INTEGER,
  active_to_minutes INTEGER,
  coupon_required INTEGER NOT NULL DEFAULT 0,
  coupon_code TEXT,
  allow_with_loyalty INTEGER NOT NULL DEFAULT 1,
  apply_once_per_basket INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  start_at TEXT,
  end_at TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  updated_at TEXT NOT NULL
);

ALTER TABLE promotion_snapshot ADD COLUMN IF NOT EXISTS minimum_line_quantity NUMERIC;
ALTER TABLE promotion_snapshot ADD COLUMN IF NOT EXISTS buy_quantity NUMERIC;
ALTER TABLE promotion_snapshot ADD COLUMN IF NOT EXISTS reward_quantity NUMERIC;
ALTER TABLE promotion_snapshot ADD COLUMN IF NOT EXISTS eligible_store_codes_json TEXT;
ALTER TABLE promotion_snapshot ADD COLUMN IF NOT EXISTS eligible_customer_types_json TEXT;
ALTER TABLE promotion_snapshot ADD COLUMN IF NOT EXISTS eligible_loyalty_tiers_json TEXT;
ALTER TABLE promotion_snapshot ADD COLUMN IF NOT EXISTS active_days_of_week_json TEXT;
ALTER TABLE promotion_snapshot ADD COLUMN IF NOT EXISTS active_from_minutes INTEGER;
ALTER TABLE promotion_snapshot ADD COLUMN IF NOT EXISTS active_to_minutes INTEGER;
ALTER TABLE promotion_snapshot ADD COLUMN IF NOT EXISTS coupon_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE promotion_snapshot ADD COLUMN IF NOT EXISTS coupon_code TEXT;

CREATE TABLE IF NOT EXISTS inventory_location_snapshot (
  id TEXT PRIMARY KEY,
  location_code TEXT NOT NULL UNIQUE,
  location_name TEXT NOT NULL,
  location_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  defaults TEXT NOT NULL,
  is_sales_default INTEGER NOT NULL DEFAULT 0,
  is_sales_order_default INTEGER NOT NULL DEFAULT 0,
  is_receiving_default INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
ALTER TABLE inventory_location_snapshot ADD COLUMN IF NOT EXISTS is_sales_order_default INTEGER NOT NULL DEFAULT 0;
UPDATE inventory_location_snapshot
SET is_sales_order_default = is_sales_default
WHERE is_sales_order_default = 0
  AND is_sales_default = 1;

CREATE TABLE IF NOT EXISTS inventory_location_balance (
  location_code TEXT NOT NULL,
  product_code TEXT NOT NULL,
  quantity_on_hand NUMERIC NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (location_code, product_code)
);

CREATE TABLE IF NOT EXISTS serial_registry (
  id TEXT PRIMARY KEY,
  product_code TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  inventory_location_code TEXT,
  status TEXT NOT NULL DEFAULT 'AVAILABLE',
  source_transaction_id TEXT,
  source_transaction_no TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (product_code, serial_number)
);

CREATE TABLE IF NOT EXISTS purchase_order_snapshot (
  id TEXT PRIMARY KEY,
  purchase_order_no TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  inventory_location_code TEXT NOT NULL,
  inventory_location_name TEXT NOT NULL,
  supplier_no TEXT,
  supplier_name TEXT,
  external_reference TEXT,
  note TEXT,
  operator_name TEXT,
  ordered_quantity NUMERIC NOT NULL DEFAULT 0,
  received_quantity NUMERIC NOT NULL DEFAULT 0,
  exception_quantity NUMERIC NOT NULL DEFAULT 0,
  outstanding_quantity NUMERIC NOT NULL DEFAULT 0,
  committed_at TEXT,
  closed_at TEXT,
  closure_reason TEXT,
  closure_note TEXT,
  closure_operator_name TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_order_line_snapshot (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL,
  line_no INTEGER NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  department_code TEXT,
  category_code TEXT,
  subcategory TEXT,
  is_serialized INTEGER NOT NULL DEFAULT 0,
  ordered_quantity NUMERIC NOT NULL,
  received_quantity NUMERIC NOT NULL DEFAULT 0,
  exception_quantity NUMERIC NOT NULL DEFAULT 0,
  outstanding_quantity NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC,
  updated_at TEXT NOT NULL,
  UNIQUE (purchase_order_id, line_no)
);

CREATE TABLE IF NOT EXISTS local_goods_receipt (
  id TEXT PRIMARY KEY,
  goods_receipt_no TEXT NOT NULL UNIQUE,
  purchase_order_id TEXT,
  purchase_order_no TEXT,
  inventory_location_code TEXT NOT NULL,
  supplier_no TEXT,
  supplier_name TEXT,
  external_reference TEXT,
  note TEXT,
  operator_name TEXT NOT NULL,
  total_quantity NUMERIC NOT NULL,
  exception_quantity NUMERIC NOT NULL DEFAULT 0,
  synced_at TEXT,
  received_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_goods_receipt_line (
  id TEXT PRIMARY KEY,
  local_goods_receipt_id TEXT NOT NULL,
  purchase_order_line_id TEXT,
  line_no INTEGER NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit_cost NUMERIC,
  serial_numbers_json TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (local_goods_receipt_id, line_no)
);

CREATE TABLE IF NOT EXISTS local_goods_receipt_exception (
  id TEXT PRIMARY KEY,
  local_goods_receipt_id TEXT NOT NULL,
  purchase_order_line_id TEXT,
  line_no INTEGER NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit_cost NUMERIC,
  reason TEXT NOT NULL,
  note TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (local_goods_receipt_id, line_no)
);

CREATE TABLE IF NOT EXISTS local_supplier_return (
  id TEXT PRIMARY KEY,
  supplier_return_no TEXT NOT NULL UNIQUE,
  purchase_order_id TEXT,
  purchase_order_no TEXT,
  goods_receipt_id TEXT NOT NULL,
  goods_receipt_no TEXT NOT NULL,
  inventory_location_code TEXT NOT NULL,
  supplier_no TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  external_reference TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'POSTED',
  note TEXT,
  operator_name TEXT NOT NULL,
  total_quantity NUMERIC NOT NULL,
  synced_at TEXT,
  returned_at TEXT NOT NULL,
  cancelled_at TEXT,
  cancellation_note TEXT,
  cancellation_operator_name TEXT,
  cancellation_acknowledged_at TEXT,
  cancellation_acknowledged_by TEXT,
  cancellation_acknowledgement_note TEXT,
  cancellation_ack_synced_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_supplier_return_line (
  id TEXT PRIMARY KEY,
  local_supplier_return_id TEXT NOT NULL,
  goods_receipt_line_id TEXT,
  purchase_order_line_id TEXT,
  line_no INTEGER NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit_cost NUMERIC,
  serial_numbers_json TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (local_supplier_return_id, line_no)
);

CREATE TABLE IF NOT EXISTS inter_store_transfer_snapshot (
  id TEXT PRIMARY KEY,
  transfer_no TEXT NOT NULL UNIQUE,
  transfer_batch_no TEXT,
  line_no INTEGER NOT NULL DEFAULT 1,
  role TEXT NOT NULL,
  origin TEXT NOT NULL,
  status TEXT NOT NULL,
  external_reference TEXT,
  source_store_code TEXT NOT NULL,
  source_store_name TEXT NOT NULL,
  source_location_code TEXT NOT NULL,
  source_location_name TEXT NOT NULL,
  destination_store_code TEXT NOT NULL,
  destination_store_name TEXT NOT NULL,
  destination_location_code TEXT NOT NULL,
  destination_location_name TEXT NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  department_code TEXT,
  category_code TEXT,
  subcategory TEXT,
  is_serialized INTEGER NOT NULL DEFAULT 0,
  requested_quantity NUMERIC NOT NULL DEFAULT 0,
  issued_quantity NUMERIC NOT NULL DEFAULT 0,
  received_quantity NUMERIC NOT NULL DEFAULT 0,
  outstanding_issue_quantity NUMERIC NOT NULL DEFAULT 0,
  outstanding_receipt_quantity NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC,
  issued_serial_numbers_json TEXT,
  received_serial_numbers_json TEXT,
  request_note TEXT,
  issue_note TEXT,
  receipt_note TEXT,
  request_operator_name TEXT,
  issue_operator_name TEXT,
  receipt_operator_name TEXT,
  requested_by_node_code TEXT,
  source_node_code TEXT,
  destination_node_code TEXT,
  requested_at TEXT NOT NULL,
  required_at TEXT,
  issued_at TEXT,
  received_at TEXT,
  closed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inter_store_transfer_request_target_snapshot (
  source_location_code TEXT PRIMARY KEY,
  source_store_code TEXT NOT NULL,
  source_store_name TEXT NOT NULL,
  source_store_sales_enabled INTEGER NOT NULL DEFAULT 1,
  source_store_warehouse_enabled INTEGER NOT NULL DEFAULT 1,
  source_location_name TEXT NOT NULL,
  source_location_type TEXT NOT NULL,
  source_location_status TEXT NOT NULL,
  source_location_defaults TEXT NOT NULL,
  source_warehouse_code TEXT,
  source_warehouse_name TEXT,
  use_for_sales_default INTEGER NOT NULL DEFAULT 0,
  use_for_receiving_default INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inter_store_transfer_request_draft (
  id TEXT PRIMARY KEY,
  request_no TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  source_store_code TEXT NOT NULL,
  source_store_name TEXT NOT NULL,
  source_location_code TEXT NOT NULL,
  source_location_name TEXT NOT NULL,
  destination_store_code TEXT NOT NULL,
  destination_store_name TEXT NOT NULL,
  destination_location_code TEXT NOT NULL,
  destination_location_name TEXT NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  department_code TEXT,
  category_code TEXT,
  subcategory TEXT,
  is_serialized INTEGER NOT NULL DEFAULT 0,
  quantity NUMERIC NOT NULL,
  external_reference TEXT,
  note TEXT,
  operator_name TEXT NOT NULL,
  submitted_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_count_session (
  id TEXT PRIMARY KEY,
  session_no TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  inventory_location_code TEXT NOT NULL,
  inventory_location_name TEXT NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  department_code TEXT,
  category_code TEXT,
  subcategory TEXT,
  is_serialized INTEGER NOT NULL DEFAULT 0,
  previous_quantity NUMERIC NOT NULL,
  counted_quantity NUMERIC NOT NULL,
  variance_quantity NUMERIC NOT NULL,
  previous_serial_numbers_json TEXT,
  counted_serial_numbers_json TEXT,
  note TEXT,
  operator_name TEXT NOT NULL,
  submitted_at TEXT,
  committed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permission_snapshot (
  id TEXT PRIMARY KEY,
  permission_code TEXT NOT NULL UNIQUE,
  permission_name TEXT NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_snapshot (
  id TEXT PRIMARY KEY,
  role_code TEXT NOT NULL UNIQUE,
  role_name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  permission_codes_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS retail_user_snapshot (
  id TEXT PRIMARY KEY,
  login_id TEXT NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT NOT NULL,
  account_status TEXT NOT NULL,
  home_store_code TEXT,
  home_store_name TEXT,
  role_codes_json TEXT,
  role_names_json TEXT,
  permission_codes_json TEXT,
  password_hash TEXT,
  password_updated_at TEXT,
  cashier_eligible INTEGER NOT NULL DEFAULT 0,
  supervisor_eligible INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operator_session (
  id TEXT PRIMARY KEY,
  retail_user_id TEXT NOT NULL,
  terminal_code TEXT,
  opened_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  closed_at TEXT,
  close_reason TEXT
);

CREATE TABLE IF NOT EXISTS terminal_connection (
  terminal_code TEXT PRIMARY KEY,
  client_name TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  last_method TEXT,
  remote_address TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS customer (
  id TEXT PRIMARY KEY,
  customer_no TEXT NOT NULL,
  full_name TEXT NOT NULL,
  customer_type TEXT NOT NULL DEFAULT 'INDIVIDUAL',
  phone TEXT,
  email TEXT,
  home_store_code TEXT,
  home_store_name TEXT,
  address_line1 TEXT,
  city TEXT,
  country_code TEXT,
  loyalty_enrolled INTEGER NOT NULL DEFAULT 0,
  loyalty_tier TEXT,
  loyalty_points_balance INTEGER NOT NULL DEFAULT 0,
  allow_credit_sales INTEGER NOT NULL DEFAULT 0,
  credit_limit_amount NUMERIC,
  receivable_balance_amount NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  record_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transaction_reference_capture (
  id TEXT PRIMARY KEY,
  reference_value TEXT NOT NULL,
  normalized_reference TEXT NOT NULL UNIQUE,
  details TEXT,
  first_transaction_no TEXT,
  last_transaction_no TEXT,
  use_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pos_shift (
  id TEXT PRIMARY KEY,
  shift_no TEXT NOT NULL,
  terminal_code TEXT NOT NULL,
  cashier_code TEXT NOT NULL,
  status TEXT NOT NULL,
  opening_float_amount NUMERIC NOT NULL DEFAULT 0,
  closing_declared_cash NUMERIC,
  closing_variance NUMERIC,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  record_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pos_transaction (
  id TEXT PRIMARY KEY,
  transaction_no TEXT NOT NULL,
  shift_id TEXT,
  cashier_code TEXT,
  customer_id TEXT,
  source_transaction_id TEXT,
  source_transaction_no TEXT,
  transaction_type TEXT NOT NULL,
  status TEXT NOT NULL,
  subtotal_amount NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  loyalty_redemption_points INTEGER NOT NULL DEFAULT 0,
  loyalty_redemption_amount NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  change_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  header_reference TEXT,
  additional_details TEXT,
  completed_at TEXT,
  record_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pos_transaction_line (
  id TEXT PRIMARY KEY,
  pos_transaction_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  inventory_location_code TEXT,
  line_intent TEXT NOT NULL DEFAULT 'SALE',
  source_line_id TEXT,
  applied_promotion_code TEXT,
  applied_promotion_name TEXT,
  product_code_snapshot TEXT NOT NULL,
  product_variant_code_snapshot TEXT,
  product_name_snapshot TEXT NOT NULL,
  variant_size TEXT,
  variant_color TEXT,
  variant_attributes_snapshot TEXT,
  line_note TEXT,
  serial_numbers_json TEXT,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0,
  manual_price_override INTEGER NOT NULL DEFAULT 0,
  manual_discount_override INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE pos_transaction_line ADD COLUMN IF NOT EXISTS inventory_location_code TEXT;
ALTER TABLE pos_transaction_line ADD COLUMN IF NOT EXISTS product_variant_code_snapshot TEXT;
ALTER TABLE pos_transaction_line ADD COLUMN IF NOT EXISTS variant_attributes_snapshot TEXT;
ALTER TABLE pos_transaction_line ADD COLUMN IF NOT EXISTS line_note TEXT;

CREATE TABLE IF NOT EXISTS pos_payment (
  id TEXT PRIMARY KEY,
  pos_transaction_id TEXT NOT NULL,
  tender_method_code TEXT,
  tender_method_name TEXT,
  bank_account_id TEXT,
  bank_code TEXT,
  bank_name TEXT,
  bank_branch_code TEXT,
  bank_branch_name TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  method TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  reference TEXT,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_account_entry (
  id TEXT PRIMARY KEY,
  entry_no TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL,
  customer_no TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  entry_type TEXT NOT NULL DEFAULT 'ACCOUNT_PAYMENT',
  payment_method TEXT NOT NULL,
  tender_method_code TEXT,
  tender_method_name TEXT,
  bank_account_id TEXT,
  bank_code TEXT,
  bank_name TEXT,
  bank_branch_code TEXT,
  bank_branch_name TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  reference TEXT,
  note TEXT,
  shift_id TEXT NOT NULL,
  shift_no TEXT,
  cashier_code TEXT,
  synced_at TEXT,
  occurred_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_order (
  id TEXT PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  source_transaction_id TEXT NOT NULL,
  source_transaction_no TEXT NOT NULL,
  customer_id TEXT,
  customer_no TEXT,
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  total_amount NUMERIC NOT NULL DEFAULT 0,
  deposit_amount NUMERIC NOT NULL DEFAULT 0,
  balance_amount NUMERIC NOT NULL DEFAULT 0,
  deposit_tender_method_code TEXT,
  deposit_tender_method_name TEXT,
  deposit_payment_method TEXT,
  deposit_reference TEXT,
  deposit_paid_at TEXT,
  operator_name TEXT,
  note TEXT,
  fulfilled_transaction_id TEXT,
  fulfilled_transaction_no TEXT,
  synced_at TEXT,
  created_at TEXT NOT NULL,
  fulfilled_at TEXT,
  cancelled_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eod_reconciliation (
  id TEXT PRIMARY KEY,
  reconciliation_no TEXT NOT NULL UNIQUE,
  shift_id TEXT NOT NULL,
  shift_no TEXT NOT NULL,
  cashier_code TEXT NOT NULL,
  expected_cash_amount NUMERIC NOT NULL DEFAULT 0,
  declared_cash_amount NUMERIC NOT NULL DEFAULT 0,
  variance_amount NUMERIC NOT NULL DEFAULT 0,
  net_sales_amount NUMERIC NOT NULL DEFAULT 0,
  cash_tendered_amount NUMERIC NOT NULL DEFAULT 0,
  non_cash_tendered_amount NUMERIC NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  operator_name TEXT,
  note TEXT,
  synced_at TEXT,
  reconciled_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS banking_deposit (
  id TEXT PRIMARY KEY,
  deposit_no TEXT NOT NULL UNIQUE,
  reconciliation_id TEXT NOT NULL,
  reconciliation_no TEXT NOT NULL,
  shift_id TEXT NOT NULL,
  shift_no TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  bank_account_id TEXT,
  bank_name TEXT,
  bank_code TEXT,
  bank_branch_code TEXT,
  bank_branch_name TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  reference TEXT,
  operator_name TEXT,
  note TEXT,
  synced_at TEXT,
  deposited_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_store_expense (
  id TEXT PRIMARY KEY,
  expense_no TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  supplier_name TEXT,
  payment_method TEXT,
  external_reference TEXT,
  amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
  attachment_file_name TEXT,
  attachment_url TEXT,
  attachment_content_type TEXT,
  attachment_content_base64 TEXT,
  operator_name TEXT NOT NULL,
  note TEXT,
  confirmed_by TEXT,
  confirmed_at TEXT,
  synced_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  id TEXT PRIMARY KEY,
  target_node_code TEXT,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  failure_kind TEXT,
  last_http_status INTEGER,
  last_attempt_at TEXT,
  next_retry_at TEXT,
  sync_run_id TEXT,
  acknowledged_at TEXT,
  record_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_inbox (
  id TEXT PRIMARY KEY,
  source_node_code TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  received_at TEXT NOT NULL,
  applied_at TEXT,
  acknowledged_at TEXT,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS sync_recovery_task (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  title TEXT NOT NULL,
  instructions TEXT NOT NULL,
  source_inbound_event_id TEXT NOT NULL,
  source_event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  transaction_no TEXT,
  product_code TEXT,
  replacement_aggregate_type TEXT NOT NULL,
  replacement_aggregate_id TEXT NOT NULL,
  replacement_event_type TEXT NOT NULL,
  replacement_record_version INTEGER NOT NULL DEFAULT 1,
  replacement_payload_json TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  operator_note TEXT NOT NULL,
  store_note TEXT,
  requested_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_checkpoint (
  remote_node_code TEXT PRIMARY KEY,
  last_event_id TEXT,
  last_received_cursor TEXT,
  last_received_at TEXT,
  last_applied_at TEXT
);

CREATE TABLE IF NOT EXISTS sync_run_log (
  id TEXT PRIMARY KEY,
  run_kind TEXT NOT NULL,
  result TEXT NOT NULL,
  summary TEXT NOT NULL,
  upstream_processed INTEGER NOT NULL DEFAULT 0,
  downstream_applied INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_store_node_metadata_updated ON store_node_metadata(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_terminal_connection_seen ON terminal_connection(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_operator_session_open ON operator_session(terminal_code, closed_at, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_snapshot_updated_at ON product_snapshot(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_variant_product ON product_variant_snapshot(product_code);
CREATE INDEX IF NOT EXISTS idx_product_variant_barcode ON product_variant_snapshot(barcode);
CREATE INDEX IF NOT EXISTS idx_barcode_snapshot_product_code ON barcode_snapshot(product_code, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_list_entry_snapshot_product ON price_list_entry_snapshot(product_code, status, is_default);
CREATE INDEX IF NOT EXISTS idx_price_list_entry_snapshot_profile ON price_list_entry_snapshot(product_code, customer_type, loyalty_tier, status);
CREATE INDEX IF NOT EXISTS idx_tax_profile_snapshot_status ON tax_profile_snapshot(status, tax_profile_name);
CREATE INDEX IF NOT EXISTS idx_promotion_snapshot_status_priority ON promotion_snapshot(status, priority, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_location_balance_updated_at ON inventory_location_balance(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_order_snapshot_status ON purchase_order_snapshot(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_order_line_snapshot_order ON purchase_order_line_snapshot(purchase_order_id, line_no);
CREATE INDEX IF NOT EXISTS idx_local_goods_receipt_received_at ON local_goods_receipt(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_goods_receipt_exception_receipt ON local_goods_receipt_exception(local_goods_receipt_id, line_no);
CREATE INDEX IF NOT EXISTS idx_local_supplier_return_returned_at ON local_supplier_return(returned_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_supplier_return_goods_receipt ON local_supplier_return(goods_receipt_id, returned_at DESC);
CREATE INDEX IF NOT EXISTS idx_inter_store_transfer_snapshot_role_status ON inter_store_transfer_snapshot(role, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inter_store_transfer_snapshot_location ON inter_store_transfer_snapshot(source_location_code, destination_location_code, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inter_store_transfer_request_target_store ON inter_store_transfer_request_target_snapshot(source_store_name, source_location_name);
CREATE INDEX IF NOT EXISTS idx_inter_store_transfer_request_draft_status ON inter_store_transfer_request_draft(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_count_session_status ON stock_count_session(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_count_session_location_product ON stock_count_session(inventory_location_code, product_code, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_reference_capture_key ON transaction_reference_capture(normalized_reference);
CREATE INDEX IF NOT EXISTS idx_transaction_reference_capture_seen ON transaction_reference_capture(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_transaction_shift ON pos_transaction(shift_id);
CREATE INDEX IF NOT EXISTS idx_pos_transaction_status ON pos_transaction(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_pos_transaction_completed ON pos_transaction(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_transaction_line_transaction ON pos_transaction_line(pos_transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_payment_transaction ON pos_payment(pos_transaction_id);
CREATE INDEX IF NOT EXISTS idx_customer_account_entry_customer ON customer_account_entry(customer_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_account_entry_synced ON customer_account_entry(synced_at, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_shift_status ON pos_shift(status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_order_status ON sales_order(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_eod_reconciliation_shift ON eod_reconciliation(shift_id, reconciled_at DESC);
CREATE INDEX IF NOT EXISTS idx_banking_deposit_reconciliation ON banking_deposit(reconciliation_id, deposited_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_store_expense_status ON local_store_expense(status, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_local_store_expense_synced ON local_store_expense(synced_at, confirmed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_retry ON sync_outbox(status, next_retry_at, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_inbox_status ON sync_inbox(status, received_at);
CREATE INDEX IF NOT EXISTS idx_sync_recovery_task_status ON sync_recovery_task(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_run_log_started_at ON sync_run_log(started_at DESC);

INSERT INTO store_node_metadata (key, value, updated_at)
VALUES ('schema_version', 'flash-erp-store-postgres-v1', now()::text)
ON CONFLICT (key) DO UPDATE
SET value = excluded.value,
    updated_at = excluded.updated_at;
