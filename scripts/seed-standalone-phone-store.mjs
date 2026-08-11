import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

function readArgument(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length).trim();
  }

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : null;
}

function defaultDatabasePath() {
  const appData = process.env.APPDATA?.trim();

  if (!appData) {
    throw new Error("APPDATA is unavailable. Pass the SQLite file with --db <path>.");
  }

  return path.join(
    appData,
    "@flash-erp",
    "store-desktop",
    "flash-rms-store",
    "flash-rms-store.sqlite",
  );
}

function compactTimestamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .replace(/\.\d{3}Z$/, "Z");
}

function dateKeyWithOffset(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const databasePath = path.resolve(readArgument("--db") || defaultDatabasePath());

if (!existsSync(databasePath)) {
  throw new Error(`Flash ERP SQLite database not found at ${databasePath}.`);
}

const database = new DatabaseSync(databasePath, {
  timeout: 15_000,
});

try {
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA busy_timeout = 15000;");

  const deploymentMode = database
    .prepare("SELECT value FROM app_metadata WHERE key = 'deployment_mode' LIMIT 1")
    .get()?.value;

  if (deploymentMode !== "STANDALONE") {
    throw new Error(
      `Refusing to seed ${databasePath}: deployment mode is ${deploymentMode || "not configured"}, not STANDALONE.`,
    );
  }

  const backupDirectory = path.join(path.dirname(databasePath), "backups");
  mkdirSync(backupDirectory, { recursive: true });
  const backupPath = path.join(
    backupDirectory,
    `flash-rms-store-before-phone-seed-${compactTimestamp()}.sqlite`,
  );
  database.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}';`);

  const productColumns = new Set(
    database
      .prepare("PRAGMA table_info(product_snapshot)")
      .all()
      .map((column) => column.name),
  );
  if (!productColumns.has("track_expiry")) {
    database.exec(
      "ALTER TABLE product_snapshot ADD COLUMN track_expiry INTEGER NOT NULL DEFAULT 0;",
    );
  }
  if (!productColumns.has("shelf_life_days")) {
    database.exec(
      "ALTER TABLE product_snapshot ADD COLUMN shelf_life_days INTEGER;",
    );
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS inventory_batch_registry (
      id TEXT PRIMARY KEY,
      product_code TEXT NOT NULL,
      inventory_location_code TEXT NOT NULL,
      batch_no TEXT NOT NULL,
      manufactured_at TEXT,
      expiry_date TEXT NOT NULL,
      quantity_on_hand NUMERIC NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      source_reference_type TEXT,
      source_reference_id TEXT,
      source_reference_label TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE (inventory_location_code, product_code, batch_no)
    );
  `);

  const now = new Date().toISOString();
  const departments = [
    {
      code: "PHONES",
      name: "Mobile Phones",
      description: "Serialized smartphones and feature phones.",
      sortOrder: 10,
    },
    {
      code: "ACCESSORIES",
      name: "Phone Accessories",
      description: "Chargers, cables, audio, protection, and power accessories.",
      sortOrder: 20,
    },
    {
      code: "CARE",
      name: "Phone Care",
      description: "Phone cleaning and repair consumables.",
      sortOrder: 30,
    },
  ];
  const categories = [
    ["SMARTPHONES", "Smartphones", "PHONES", "Mobile Phones", 10],
    ["CHARGERS", "Chargers and Cables", "ACCESSORIES", "Phone Accessories", 20],
    ["AUDIO", "Mobile Audio", "ACCESSORIES", "Phone Accessories", 30],
    ["PROTECTION", "Cases and Screen Protection", "ACCESSORIES", "Phone Accessories", 40],
    ["POWER", "Power Banks", "ACCESSORIES", "Phone Accessories", 50],
    ["CLEANING", "Cleaning Supplies", "CARE", "Phone Care", 60],
    ["REPAIR", "Repair Consumables", "CARE", "Phone Care", 70],
  ];
  const products = [
    {
      code: "PHN-SAM-A16-128",
      name: "Samsung Galaxy A16 128GB",
      shortName: "Galaxy A16 128GB",
      description: "Serialized mobile phone. Receive each unit with its actual IMEI or serial number.",
      department: "PHONES",
      category: "SMARTPHONES",
      subcategory: "Samsung",
      serialized: true,
      price: 2450,
      quantity: 3,
    },
    {
      code: "PHN-SAM-A26-256",
      name: "Samsung Galaxy A26 5G 256GB",
      shortName: "Galaxy A26 5G",
      description: "Serialized mobile phone. Receive each unit with its actual IMEI or serial number.",
      department: "PHONES",
      category: "SMARTPHONES",
      subcategory: "Samsung",
      serialized: true,
      price: 4600,
      quantity: 3,
    },
    {
      code: "PHN-TEC-SPARK30C-128",
      name: "Tecno Spark 30C 128GB",
      shortName: "Spark 30C 128GB",
      description: "Serialized mobile phone. Receive each unit with its actual IMEI or serial number.",
      department: "PHONES",
      category: "SMARTPHONES",
      subcategory: "Tecno",
      serialized: true,
      price: 2100,
      quantity: 3,
    },
    {
      code: "PHN-INF-HOT50I-128",
      name: "Infinix Hot 50i 128GB",
      shortName: "Hot 50i 128GB",
      description: "Serialized mobile phone. Receive each unit with its actual IMEI or serial number.",
      department: "PHONES",
      category: "SMARTPHONES",
      subcategory: "Infinix",
      serialized: true,
      price: 1850,
      quantity: 3,
    },
    {
      code: "PHN-APL-IP13-128",
      name: "Apple iPhone 13 128GB",
      shortName: "iPhone 13 128GB",
      description: "Serialized mobile phone. Receive each unit with its actual IMEI or serial number.",
      department: "PHONES",
      category: "SMARTPHONES",
      subcategory: "Apple",
      serialized: true,
      price: 7000,
      quantity: 3,
    },
    {
      code: "PHN-APL-IP15-128",
      name: "Apple iPhone 15 128GB",
      shortName: "iPhone 15 128GB",
      description: "Serialized mobile phone. Receive each unit with its actual IMEI or serial number.",
      department: "PHONES",
      category: "SMARTPHONES",
      subcategory: "Apple",
      serialized: true,
      price: 10800,
      quantity: 3,
    },
    {
      code: "ACC-CHG-USBC-20W",
      name: "USB-C 20W Fast Charger",
      shortName: "USB-C 20W Charger",
      description: "20W wall charger with USB-C output.",
      department: "ACCESSORIES",
      category: "CHARGERS",
      subcategory: "Wall Chargers",
      serialized: false,
      price: 180,
      quantity: 20,
    },
    {
      code: "ACC-CABLE-USBC-1M",
      name: "USB-C to USB-C Cable 1m",
      shortName: "USB-C Cable 1m",
      description: "One-metre USB-C charging and data cable.",
      department: "ACCESSORIES",
      category: "CHARGERS",
      subcategory: "Cables",
      serialized: false,
      price: 80,
      quantity: 30,
    },
    {
      code: "ACC-CABLE-LTG-1M",
      name: "USB-C to Lightning Cable 1m",
      shortName: "Lightning Cable 1m",
      description: "One-metre USB-C to Lightning charging cable.",
      department: "ACCESSORIES",
      category: "CHARGERS",
      subcategory: "Cables",
      serialized: false,
      price: 100,
      quantity: 25,
    },
    {
      code: "ACC-EARBUDS-BT",
      name: "Bluetooth Wireless Earbuds",
      shortName: "Wireless Earbuds",
      description: "Bluetooth earbuds with charging case.",
      department: "ACCESSORIES",
      category: "AUDIO",
      subcategory: "Earbuds",
      serialized: false,
      price: 280,
      quantity: 15,
    },
    {
      code: "ACC-PBANK-10000",
      name: "10,000mAh USB-C Power Bank",
      shortName: "10,000mAh Power Bank",
      description: "Portable 10,000mAh USB-C power bank.",
      department: "ACCESSORIES",
      category: "POWER",
      subcategory: "Power Banks",
      serialized: false,
      price: 300,
      quantity: 12,
    },
    {
      code: "ACC-TGLASS-UNIV",
      name: "Tempered Glass Screen Protector",
      shortName: "Tempered Glass",
      description: "Standard tempered-glass screen protector.",
      department: "ACCESSORIES",
      category: "PROTECTION",
      subcategory: "Screen Protectors",
      serialized: false,
      price: 50,
      quantity: 40,
    },
    {
      code: "ACC-CASE-UNIV",
      name: "Protective Silicone Phone Case",
      shortName: "Silicone Phone Case",
      description: "Protective silicone phone case.",
      department: "ACCESSORIES",
      category: "PROTECTION",
      subcategory: "Phone Cases",
      serialized: false,
      price: 80,
      quantity: 30,
    },
    {
      code: "CARE-WIPES-30",
      name: "Screen Cleaning Wipes 30 Pack",
      shortName: "Screen Wipes 30 Pack",
      description: "Expiry-sensitive consumable. Check the manufacturer's printed expiry date before sale.",
      department: "CARE",
      category: "CLEANING",
      subcategory: "Screen Care",
      serialized: false,
      price: 60,
      quantity: 12,
      trackExpiry: true,
      shelfLifeDays: 365,
      batches: [
        { batchNo: "WIPES-NEAR-001", quantity: 5, manufacturedOffset: -120, expiryOffset: 20 },
        { batchNo: "WIPES-LONG-002", quantity: 7, manufacturedOffset: -30, expiryOffset: 335 },
      ],
    },
    {
      code: "CARE-B7000-50ML",
      name: "B-7000 Phone Repair Adhesive 50ml",
      shortName: "B-7000 Adhesive 50ml",
      description: "Expiry-sensitive repair consumable. Check the manufacturer's printed expiry date before use or sale.",
      department: "CARE",
      category: "REPAIR",
      subcategory: "Adhesives",
      serialized: false,
      price: 45,
      quantity: 10,
      trackExpiry: true,
      shelfLifeDays: 540,
      batches: [
        { batchNo: "B7000-2026-A", quantity: 4, manufacturedOffset: -180, expiryOffset: 120 },
        { batchNo: "B7000-2026-B", quantity: 6, manufacturedOffset: -45, expiryOffset: 495 },
      ],
    },
  ];

  const upsertMetadata = database.prepare(
    "INSERT INTO app_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  const upsertDepartment = database.prepare(
    "INSERT INTO product_department_snapshot (id, department_code, department_name, description, status, sort_order, updated_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?) ON CONFLICT(department_code) DO UPDATE SET department_name = excluded.department_name, description = excluded.description, status = excluded.status, sort_order = excluded.sort_order, updated_at = excluded.updated_at",
  );
  const upsertCategory = database.prepare(
    "INSERT INTO product_category_snapshot (id, category_code, category_name, department_code, department_name, description, status, sort_order, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?) ON CONFLICT(category_code) DO UPDATE SET category_name = excluded.category_name, department_code = excluded.department_code, department_name = excluded.department_name, description = excluded.description, status = excluded.status, sort_order = excluded.sort_order, updated_at = excluded.updated_at",
  );
  const upsertProduct = database.prepare(
    `INSERT INTO product_snapshot (
      id, product_code, product_name, product_type, short_name, description,
      department_code, category_code, subcategory, unit_of_measure, taxable,
      tax_profile_code, tax_profile_name, tax_rate_percent, tax_inclusive,
      track_inventory, is_serialized, track_expiry, shelf_life_days, track_size, track_color,
      must_enter_price_at_pos, min_stock_level, reorder_point,
      safety_stock_level, catalog_membership_active, catalog_sort_order,
      unit_price, quantity_on_hand, updated_at
    ) VALUES (?, ?, ?, 'STOCK', ?, ?, ?, ?, ?, 'EA', 1, NULL, NULL, NULL, 0, 1, ?, ?, ?, 0, 0, 0, ?, ?, ?, 1, ?, ?, ?, ?)
    ON CONFLICT(product_code) DO UPDATE SET
      product_name = excluded.product_name,
      product_type = excluded.product_type,
      short_name = excluded.short_name,
      description = excluded.description,
      department_code = excluded.department_code,
      category_code = excluded.category_code,
      subcategory = excluded.subcategory,
      unit_of_measure = excluded.unit_of_measure,
      track_inventory = excluded.track_inventory,
      is_serialized = excluded.is_serialized,
      track_expiry = excluded.track_expiry,
      shelf_life_days = excluded.shelf_life_days,
      min_stock_level = excluded.min_stock_level,
      reorder_point = excluded.reorder_point,
      safety_stock_level = excluded.safety_stock_level,
      catalog_membership_active = excluded.catalog_membership_active,
      catalog_sort_order = excluded.catalog_sort_order,
      unit_price = excluded.unit_price,
      updated_at = excluded.updated_at`,
  );
  const upsertBarcode = database.prepare(
    "INSERT INTO barcode_snapshot (id, barcode_code, product_code, barcode_type, updated_at) VALUES (?, ?, ?, 'LOCAL', ?) ON CONFLICT(barcode_code) DO UPDATE SET product_code = excluded.product_code, barcode_type = excluded.barcode_type, updated_at = excluded.updated_at",
  );
  const upsertPrice = database.prepare(
    "INSERT INTO price_list_entry_snapshot (id, price_list_code, price_list_name, currency_code, is_default, customer_type, loyalty_tier, product_code, unit_price, status, updated_at) VALUES (?, 'RETAIL', 'Retail Price', 'GHS', 1, NULL, NULL, ?, ?, 'ACTIVE', ?) ON CONFLICT(price_list_code, product_code) DO UPDATE SET price_list_name = excluded.price_list_name, currency_code = excluded.currency_code, is_default = excluded.is_default, unit_price = excluded.unit_price, status = excluded.status, updated_at = excluded.updated_at",
  );
  const upsertBalance = database.prepare(
    "INSERT INTO inventory_location_balance (location_code, product_code, quantity_on_hand, updated_at) VALUES ('SHOP-FLOOR', ?, ?, ?) ON CONFLICT(location_code, product_code) DO NOTHING",
  );
  const insertSerial = database.prepare(
    "INSERT INTO serial_registry (id, product_code, serial_number, inventory_location_code, status, source_transaction_id, source_transaction_no, updated_at) VALUES (?, ?, ?, 'SHOP-FLOOR', 'AVAILABLE', NULL, 'DEMO-OPENING-STOCK', ?) ON CONFLICT(product_code, serial_number) DO NOTHING",
  );
  const upsertInventoryBatch = database.prepare(
    `INSERT INTO inventory_batch_registry (
      id, product_code, inventory_location_code, batch_no, manufactured_at,
      expiry_date, quantity_on_hand, status, source_reference_type,
      source_reference_id, source_reference_label, updated_at
    ) VALUES (?, ?, 'SHOP-FLOOR', ?, ?, ?, ?, 'ACTIVE', 'OPENING_BALANCE', 'DEMO-PHONE-SEED', 'DEMO-OPENING-STOCK', ?)
    ON CONFLICT(inventory_location_code, product_code, batch_no) DO UPDATE SET
      manufactured_at = excluded.manufactured_at,
      expiry_date = excluded.expiry_date,
      quantity_on_hand = excluded.quantity_on_hand,
      status = excluded.status,
      source_reference_type = excluded.source_reference_type,
      source_reference_id = excluded.source_reference_id,
      source_reference_label = excluded.source_reference_label,
      updated_at = excluded.updated_at`,
  );

  database.exec("BEGIN IMMEDIATE;");

  try {
    upsertMetadata.run("currency_code", "GHS");
    upsertMetadata.run("last_local_write_at", now);
    upsertMetadata.run("phone_store_catalog_seeded_at", now);

    database
      .prepare(
        "INSERT INTO unit_of_measure_snapshot (id, uom_code, uom_name, description, decimal_precision, allow_fractional_sale, status, updated_at) VALUES ('standalone-uom-ea', 'EA', 'Each', 'Single retail unit.', 0, 0, 'ACTIVE', ?) ON CONFLICT(uom_code) DO UPDATE SET uom_name = excluded.uom_name, description = excluded.description, decimal_precision = excluded.decimal_precision, allow_fractional_sale = excluded.allow_fractional_sale, status = excluded.status, updated_at = excluded.updated_at",
      )
      .run(now);

    database
      .prepare(
        "INSERT INTO inventory_location_snapshot (id, location_code, location_name, location_type, status, defaults, is_sales_default, is_sales_order_default, is_receiving_default, updated_at) VALUES ('standalone-location-shop-floor', 'SHOP-FLOOR', 'Shop Floor', 'STORE_FLOOR', 'ACTIVE', 'SALES,SALES_ORDER,RECEIVING', 1, 1, 1, ?) ON CONFLICT(location_code) DO UPDATE SET location_name = excluded.location_name, location_type = excluded.location_type, status = excluded.status, defaults = excluded.defaults, is_sales_default = excluded.is_sales_default, is_sales_order_default = excluded.is_sales_order_default, is_receiving_default = excluded.is_receiving_default, updated_at = excluded.updated_at",
      )
      .run(now);

    for (const department of departments) {
      upsertDepartment.run(
        `standalone-department-${department.code.toLowerCase()}`,
        department.code,
        department.name,
        department.description,
        department.sortOrder,
        now,
      );
    }

    for (const [code, name, departmentCode, departmentName, sortOrder] of categories) {
      upsertCategory.run(
        `standalone-category-${code.toLowerCase()}`,
        code,
        name,
        departmentCode,
        departmentName,
        `${name} for the mobile phone store catalog.`,
        sortOrder,
        now,
      );
    }

    products.forEach((product, index) => {
      const productId = `standalone-product-${product.code.toLowerCase()}`;
      upsertProduct.run(
        productId,
        product.code,
        product.name,
        product.shortName,
        product.description,
        product.department,
        product.category,
        product.subcategory,
        product.serialized ? 1 : 0,
        product.trackExpiry ? 1 : 0,
        product.shelfLifeDays ?? null,
        product.serialized ? 1 : 2,
        product.serialized ? 1 : 3,
        product.serialized ? 0 : 1,
        (index + 1) * 10,
        product.price,
        product.quantity,
        now,
      );
      upsertBarcode.run(
        `standalone-barcode-${product.code.toLowerCase()}`,
        product.code,
        product.code,
        now,
      );
      upsertPrice.run(
        `standalone-price-retail-${product.code.toLowerCase()}`,
        product.code,
        product.price,
        now,
      );
      upsertBalance.run(product.code, product.quantity, now);

      if (product.serialized) {
        for (let serialIndex = 1; serialIndex <= product.quantity; serialIndex += 1) {
          const serialNumber = `DEMO-${product.code}-${String(serialIndex).padStart(3, "0")}`;
          insertSerial.run(
            `demo-serial-${product.code.toLowerCase()}-${serialIndex}`,
            product.code,
            serialNumber,
            now,
          );
        }
      }


      for (const batch of product.batches ?? []) {
        upsertInventoryBatch.run(
          `demo-batch-${product.code.toLowerCase()}-${batch.batchNo.toLowerCase()}`,
          product.code,
          batch.batchNo,
          dateKeyWithOffset(batch.manufacturedOffset),
          dateKeyWithOffset(batch.expiryOffset),
          batch.quantity,
          now,
        );
      }
    });

    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }

  const verification = database
    .prepare(
      `SELECT
        count(*) AS product_count,
        sum(CASE WHEN is_serialized = 1 THEN 1 ELSE 0 END) AS serialized_product_count,
        sum(quantity_on_hand) AS opening_stock_quantity
      FROM product_snapshot
      WHERE id LIKE 'standalone-product-%'`,
    )
    .get();

  console.log(`Database: ${databasePath}`);
  console.log(`Backup: ${backupPath}`);
  console.log(`Seeded catalog products: ${verification.product_count}`);
  console.log(`Serialized phone products: ${verification.serialized_product_count}`);
  const serialCount = database
    .prepare("SELECT count(*) AS value FROM serial_registry WHERE source_transaction_no = 'DEMO-OPENING-STOCK'")
    .get().value;
  console.log(`Demo opening stock quantity: ${verification.opening_stock_quantity}`);
  console.log(`Fake available phone serials: ${serialCount}`);
  console.log(
    `Expiry-controlled products: ${products.filter((product) => product.trackExpiry).length}`,
  );
  const batchCount = database
    .prepare("SELECT count(*) AS value FROM inventory_batch_registry WHERE source_reference_id = 'DEMO-PHONE-SEED'")
    .get().value;
  console.log(`Fake expiry batches: ${batchCount}`);
} finally {
  database.close();
}
