/**
 * Flash ERP Mobile Offline Database & Outbox Engine
 * Provides local SQLite caching for fast product/barcode lookup and an ACID outbox
 * queue for offline mutations that sync to the Enterprise HQ API when connected.
 */

import { Platform } from "react-native";

export interface CachedProduct {
  id: string;
  productCode: string;
  productName: string;
  barcode: string;
  unitPrice: number;
  unitOfMeasure: string;
  taxRatePercent?: number;
  isTaxInclusive?: boolean;
  sellingUnitsJson?: string;
  stockQuantity: number;
  storeCode?: string | null;
  updatedAt: string;
}

/** Master-data copy of an HQ customer for offline POS customer selection. */
export interface CachedCustomer {
  id: string;
  customerNo: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  customerType: string;
  updatedAt: string;
}

export type OutboxEntityType =
  | "STOCK_COUNT"
  | "SALE"
  | "GOODS_RECEIPT"
  | "TRANSFER"
  | "FUEL_DIP"
  | "FUEL_METER"
  | "EXPENSE_CLAIM"
  | "LEAVE_REQUEST";

export type OutboxStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED";

export interface OutboxMutation {
  id: string;
  entityType: OutboxEntityType;
  action: string;
  endpoint: string;
  payloadJson: string;
  status: OutboxStatus;
  attempts: number;
  errorMessage: string | null;
  createdAt: string;
  syncedAt: string | null;
}

// In-memory fallback for web preview or environments where native SQLite is not linked
class MemoryOfflineStorage {
  private products = new Map<string, CachedProduct>();
  private customers = new Map<string, CachedCustomer>();
  private outbox = new Map<string, OutboxMutation>();

  async saveProducts(items: CachedProduct[]) {
    for (const item of items) {
      this.products.set(item.productCode, item);
      if (item.barcode) {
        this.products.set(`barcode:${item.barcode.toUpperCase()}`, item);
      }
    }
  }

  async findProductByBarcode(barcode: string): Promise<CachedProduct | null> {
    const direct = this.products.get(`barcode:${barcode.trim().toUpperCase()}`);
    if (direct) return direct;
    for (const p of this.products.values()) {
      if (p.barcode?.toUpperCase() === barcode.trim().toUpperCase() || p.productCode.toUpperCase() === barcode.trim().toUpperCase()) {
        return p;
      }
    }
    return null;
  }

  async searchProducts(query: string, limit = 50): Promise<CachedProduct[]> {
    const q = query.trim().toUpperCase();
    const results: CachedProduct[] = [];
    const seen = new Set<string>();

    for (const p of this.products.values()) {
      if (seen.has(p.productCode)) continue;
      if (!q || p.productCode.toUpperCase().includes(q) || p.productName.toUpperCase().includes(q) || (p.barcode && p.barcode.toUpperCase().includes(q))) {
        seen.add(p.productCode);
        results.push(p);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  async clearProducts() { this.products.clear(); }

  async saveCustomers(items: CachedCustomer[]) {
    for (const item of items) this.customers.set(item.id, item);
  }

  async searchCustomers(query: string, limit = 30): Promise<CachedCustomer[]> {
    const q = query.trim().toLowerCase();
    const results: CachedCustomer[] = [];
    for (const customer of [...this.customers.values()].sort((a, b) => a.fullName.localeCompare(b.fullName))) {
      if (!q || customer.fullName.toLowerCase().includes(q) || customer.customerNo.toLowerCase().includes(q) || (customer.phone ?? "").toLowerCase().includes(q) || (customer.email ?? "").toLowerCase().includes(q)) {
        results.push(customer);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  async countCustomers(): Promise<number> { return this.customers.size; }

  async pruneCustomers(validCustomerIds: string[]) {
    const valid = new Set(validCustomerIds);
    for (const [key] of this.customers) if (!valid.has(key)) this.customers.delete(key);
  }

  async pruneProducts(validProductCodes: string[]) {
    const valid = new Set(validProductCodes);
    for (const [key, product] of this.products) if (!valid.has(product.productCode)) this.products.delete(key);
  }

  async enqueueMutation(mutation: OutboxMutation) {
    this.outbox.set(mutation.id, mutation);
  }

  async getPendingMutations(): Promise<OutboxMutation[]> {
    return Array.from(this.outbox.values())
      .filter((m) => m.status === "PENDING" || m.status === "FAILED")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getOutboxStats() {
    let pending = 0;
    let failed = 0;
    let synced = 0;
    for (const m of this.outbox.values()) {
      if (m.status === "PENDING") pending += 1;
      else if (m.status === "FAILED") failed += 1;
      else if (m.status === "SYNCED") synced += 1;
    }
    return { pending, failed, synced, total: this.outbox.size };
  }

  async markMutationStatus(id: string, status: OutboxStatus, errorMessage: string | null = null) {
    const existing = this.outbox.get(id);
    if (existing) {
      existing.status = status;
      existing.errorMessage = errorMessage;
      if (status === "SYNCED") {
        existing.syncedAt = new Date().toISOString();
      } else if (status === "FAILED") {
        existing.attempts += 1;
      }
    }
  }

  async clearSynced() {
    for (const [id, m] of this.outbox) {
      if (m.status === "SYNCED") {
        this.outbox.delete(id);
      }
    }
  }
}

const memoryStore = new MemoryOfflineStorage();

// Safe dynamic loader for native SQLite on iOS/Android
let nativeDb: any = null;

async function getNativeDb() {
  if (Platform.OS === "web") return null;
  if (nativeDb) return nativeDb;

  try {
    const SQLite = await import("expo-sqlite");
    if (SQLite && typeof SQLite.openDatabaseAsync === "function") {
      const db = await SQLite.openDatabaseAsync("flash_erp_mobile_offline.db");
      try {
        await db.execAsync(`PRAGMA journal_mode = WAL;`);
      } catch (walError) {
        // WAL is an optimization; some storage configurations reject it.
        console.warn("[flash-erp:mobile] WAL journal mode unavailable; using default journal.", walError);
      }
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS cached_products (
          id TEXT PRIMARY KEY,
          product_code TEXT NOT NULL UNIQUE,
          product_name TEXT NOT NULL,
          barcode TEXT,
          unit_price REAL NOT NULL,
          unit_of_measure TEXT NOT NULL,
          selling_units_json TEXT,
          stock_quantity REAL NOT NULL DEFAULT 0,
          store_code TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_products_barcode ON cached_products(barcode);
        CREATE INDEX IF NOT EXISTS idx_products_name ON cached_products(product_name);

        CREATE TABLE IF NOT EXISTS mobile_outbox (
          id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL,
          action TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING',
          attempts INTEGER NOT NULL DEFAULT 0,
          error_message TEXT,
          created_at TEXT NOT NULL,
          synced_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_outbox_status ON mobile_outbox(status);

        CREATE TABLE IF NOT EXISTS cached_customers (
          id TEXT PRIMARY KEY,
          customer_no TEXT NOT NULL,
          full_name TEXT NOT NULL,
          phone TEXT,
          email TEXT,
          customer_type TEXT NOT NULL DEFAULT 'WALK_IN',
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_customers_name ON cached_customers(full_name);
      `);
      for (const migration of [
        "ALTER TABLE cached_products ADD COLUMN tax_rate_percent REAL NOT NULL DEFAULT 0;",
        "ALTER TABLE cached_products ADD COLUMN is_tax_inclusive INTEGER NOT NULL DEFAULT 0;"
      ]) {
        try { await db.execAsync(migration); } catch { /* Column already exists. */ }
      }
      nativeDb = db;
      return nativeDb;
    }
  } catch (error) {
    // Dynamic import or open failed; fallback to memory.
    console.warn("[flash-erp:mobile] SQLite unavailable; using in-memory storage.", error);
  }
  return null;
}

export const mobileOfflineDb = {
  async init(): Promise<void> {
    await getNativeDb();
  },

  async saveProducts(products: CachedProduct[]): Promise<void> {
    const db = await getNativeDb();
    if (!db) {
      await memoryStore.saveProducts(products);
      return;
    }

    try {
      await db.withTransactionAsync(async () => {
        for (const p of products) {
          await db.runAsync(
            `INSERT INTO cached_products 
               (id, product_code, product_name, barcode, unit_price, unit_of_measure, tax_rate_percent, is_tax_inclusive, selling_units_json, stock_quantity, store_code, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(product_code) DO UPDATE SET
               product_name = excluded.product_name,
               barcode = excluded.barcode,
               unit_price = excluded.unit_price,
               unit_of_measure = excluded.unit_of_measure,
               tax_rate_percent = excluded.tax_rate_percent,
               is_tax_inclusive = excluded.is_tax_inclusive,
               selling_units_json = excluded.selling_units_json,
               stock_quantity = excluded.stock_quantity,
               store_code = excluded.store_code,
               updated_at = excluded.updated_at;`,
            [
              p.id || p.productCode,
              p.productCode,
              p.productName,
              p.barcode || null,
              p.unitPrice,
              p.unitOfMeasure,
              p.taxRatePercent ?? 0,
              p.isTaxInclusive ? 1 : 0,
              p.sellingUnitsJson || null,
              p.stockQuantity,
              p.storeCode || null,
              p.updatedAt || new Date().toISOString()
            ]
          );
        }
      });
    } catch (error) {
      console.warn("[flash-erp:mobile] SQLite product cache write failed; cached in memory instead.", error);
      await memoryStore.saveProducts(products);
    }
  },

  async clearProducts(): Promise<void> {
    const stats = await this.getOutboxStats();
    if (stats.pending + stats.failed > 0) throw new Error("Sync pending transactions before clearing the offline catalog.");
    const db = await getNativeDb();
    if (!db) { await memoryStore.clearProducts(); return; }
    await db.runAsync("DELETE FROM cached_products;");
  },

  async pruneProducts(validProductCodes: string[]): Promise<void> {
    const db = await getNativeDb();
    if (!db) { await memoryStore.pruneProducts(validProductCodes); return; }
    try {
      if (validProductCodes.length === 0) { await db.runAsync("DELETE FROM cached_products;"); return; }
      const placeholders = validProductCodes.map(() => "?").join(",");
      await db.runAsync(`DELETE FROM cached_products WHERE product_code NOT IN (${placeholders});`, validProductCodes);
    } catch (error) { console.warn("[flash-erp:mobile] Product cache pruning failed.", error); }
  },

  // ---- Offline customer master data (POS customer selection while offline) ----

  async saveCustomers(customers: CachedCustomer[]): Promise<void> {
    const db = await getNativeDb();
    if (!db) {
      await memoryStore.saveCustomers(customers);
      return;
    }
    try {
      await db.withTransactionAsync(async () => {
        for (const customer of customers) {
          await db.runAsync(
            `INSERT INTO cached_customers
               (id, customer_no, full_name, phone, email, customer_type, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               customer_no = excluded.customer_no,
               full_name = excluded.full_name,
               phone = excluded.phone,
               email = excluded.email,
               customer_type = excluded.customer_type,
               updated_at = excluded.updated_at;`,
            [
              customer.id,
              customer.customerNo,
              customer.fullName,
              customer.phone || null,
              customer.email || null,
              customer.customerType || "WALK_IN",
              customer.updatedAt || new Date().toISOString()
            ]
          );
        }
      });
    } catch (error) {
      console.warn("[flash-erp:mobile] SQLite customer cache write failed; cached in memory instead.", error);
      await memoryStore.saveCustomers(customers);
    }
  },

  async searchCustomers(query: string, limit = 30): Promise<CachedCustomer[]> {
    const q = query.trim();
    const db = await getNativeDb();
    if (!db) {
      return await memoryStore.searchCustomers(q, limit);
    }
    const term = `%${q}%`;
    try {
      const rows: any[] = await db.getAllAsync(
        `SELECT * FROM cached_customers
         WHERE UPPER(full_name) LIKE UPPER(?)
            OR UPPER(customer_no) LIKE UPPER(?)
            OR UPPER(COALESCE(phone, '')) LIKE UPPER(?)
            OR UPPER(COALESCE(email, '')) LIKE UPPER(?)
         ORDER BY full_name ASC
         LIMIT ?;`,
        [term, term, term, term, limit]
      );
      return rows.map((row) => ({
        id: row.id,
        customerNo: row.customer_no,
        fullName: row.full_name,
        phone: row.phone,
        email: row.email,
        customerType: row.customer_type,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.warn("[flash-erp:mobile] SQLite customer search failed; using memory cache.", error);
      return await memoryStore.searchCustomers(q, limit);
    }
  },

  async countCustomers(): Promise<number> {
    const db = await getNativeDb();
    if (!db) return await memoryStore.countCustomers();
    try {
      const row: any = await db.getFirstAsync(`SELECT COUNT(*) AS count FROM cached_customers;`);
      return Number(row?.count ?? 0);
    } catch {
      return await memoryStore.countCustomers();
    }
  },

  async pruneCustomers(validCustomerIds: string[]): Promise<void> {
    const db = await getNativeDb();
    if (!db) {
      await memoryStore.pruneCustomers(validCustomerIds);
      return;
    }
    try {
      if (validCustomerIds.length === 0) {
        await db.runAsync("DELETE FROM cached_customers;");
        return;
      }
      const placeholders = validCustomerIds.map(() => "?").join(",");
      await db.runAsync(`DELETE FROM cached_customers WHERE id NOT IN (${placeholders});`, validCustomerIds);
    } catch (error) {
      console.warn("[flash-erp:mobile] Customer cache pruning failed.", error);
    }
  },

  async findProductByBarcode(barcode: string): Promise<CachedProduct | null> {
    const clean = barcode.trim();
    if (!clean) return null;

    const db = await getNativeDb();
    if (!db) {
      return await memoryStore.findProductByBarcode(clean);
    }

    try {
      const row: any = await db.getFirstAsync(
        `SELECT * FROM cached_products 
         WHERE UPPER(barcode) = UPPER(?) OR UPPER(product_code) = UPPER(?) 
         LIMIT 1;`,
        [clean, clean]
      );

      if (!row) return null;
      return {
        id: row.id,
        productCode: row.product_code,
        productName: row.product_name,
        barcode: row.barcode,
        unitPrice: row.unit_price,
        unitOfMeasure: row.unit_of_measure,
        taxRatePercent: Number(row.tax_rate_percent ?? 0),
        isTaxInclusive: Boolean(row.is_tax_inclusive),
        sellingUnitsJson: row.selling_units_json,
        stockQuantity: row.stock_quantity,
        storeCode: row.store_code,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.warn("[flash-erp:mobile] SQLite product lookup failed; using memory cache.", error);
      return await memoryStore.findProductByBarcode(clean);
    }
  },

  async searchProducts(query: string, limit = 50): Promise<CachedProduct[]> {
    const q = query.trim();
    const db = await getNativeDb();
    if (!db) {
      return await memoryStore.searchProducts(q, limit);
    }

    const term = `%${q}%`;
    try {
      const rows: any[] = await db.getAllAsync(
        `SELECT * FROM cached_products 
         WHERE UPPER(product_code) LIKE UPPER(?) 
            OR UPPER(product_name) LIKE UPPER(?) 
            OR UPPER(barcode) LIKE UPPER(?)
         LIMIT ?;`,
        [term, term, term, limit]
      );

      return rows.map((row) => ({
        id: row.id,
        productCode: row.product_code,
        productName: row.product_name,
        barcode: row.barcode,
        unitPrice: row.unit_price,
        unitOfMeasure: row.unit_of_measure,
        taxRatePercent: Number(row.tax_rate_percent ?? 0),
        isTaxInclusive: Boolean(row.is_tax_inclusive),
        sellingUnitsJson: row.selling_units_json,
        stockQuantity: row.stock_quantity,
        storeCode: row.store_code,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.warn("[flash-erp:mobile] SQLite product search failed; using memory cache.", error);
      return await memoryStore.searchProducts(q, limit);
    }
  },

  async enqueueMutation(input: {
    entityType: OutboxEntityType;
    action: string;
    endpoint: string;
    payload: unknown;
  }): Promise<OutboxMutation> {
    const mutation: OutboxMutation = {
      id: `MOB-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      entityType: input.entityType,
      action: input.action,
      endpoint: input.endpoint,
      payloadJson: JSON.stringify(input.payload),
      status: "PENDING",
      attempts: 0,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      syncedAt: null
    };

    const db = await getNativeDb();
    if (!db) {
      await memoryStore.enqueueMutation(mutation);
      return mutation;
    }

    try {
      await db.runAsync(
        `INSERT INTO mobile_outbox 
           (id, entity_type, action, endpoint, payload_json, status, attempts, error_message, created_at, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          mutation.id,
          mutation.entityType,
          mutation.action,
          mutation.endpoint,
          mutation.payloadJson,
          mutation.status,
          mutation.attempts,
          mutation.errorMessage,
          mutation.createdAt,
          mutation.syncedAt
        ]
      );
    } catch (error) {
      // Persist in memory as a last resort so the mutation is never silently lost
      // within this app session; the outbox screen still reflects the in-memory queue.
      console.warn("[flash-erp:mobile] SQLite outbox insert failed; mutation held in memory only.", error);
      await memoryStore.enqueueMutation(mutation);
    }

    return mutation;
  },

  async getPendingMutations(): Promise<OutboxMutation[]> {
    const db = await getNativeDb();
    if (!db) {
      return await memoryStore.getPendingMutations();
    }

    try {
      const rows: any[] = await db.getAllAsync(
        `SELECT * FROM mobile_outbox 
         WHERE status IN ('PENDING', 'FAILED') 
         ORDER BY created_at ASC;`
      );

      return rows.map((r) => ({
        id: r.id,
        entityType: r.entity_type,
        action: r.action,
        endpoint: r.endpoint,
        payloadJson: r.payload_json,
        status: r.status,
        attempts: r.attempts,
        errorMessage: r.error_message,
        createdAt: r.created_at,
        syncedAt: r.synced_at
      }));
    } catch (error) {
      console.warn("[flash-erp:mobile] SQLite outbox read failed; using memory queue.", error);
      return await memoryStore.getPendingMutations();
    }
  },

  async getOutboxStats(): Promise<{ pending: number; failed: number; synced: number; total: number }> {
    const db = await getNativeDb();
    if (!db) {
      return await memoryStore.getOutboxStats();
    }

    try {
      const rows: any[] = await db.getAllAsync(
        `SELECT status, COUNT(*) as count FROM mobile_outbox GROUP BY status;`
      );

      let pending = 0;
      let failed = 0;
      let synced = 0;
      let total = 0;

      for (const r of rows) {
        const c = Number(r.count || 0);
        total += c;
        if (r.status === "PENDING" || r.status === "SYNCING") pending += c;
        else if (r.status === "FAILED") failed += c;
        else if (r.status === "SYNCED") synced += c;
      }

      return { pending, failed, synced, total };
    } catch (error) {
      console.warn("[flash-erp:mobile] SQLite outbox stats read failed; using memory queue.", error);
      return await memoryStore.getOutboxStats();
    }
  },

  async markMutationStatus(
    id: string,
    status: OutboxStatus,
    errorMessage: string | null = null
  ): Promise<void> {
    const db = await getNativeDb();
    if (!db) {
      await memoryStore.markMutationStatus(id, status, errorMessage);
      return;
    }

    const syncedAt = status === "SYNCED" ? new Date().toISOString() : null;
    try {
      await db.runAsync(
        `UPDATE mobile_outbox 
         SET status = ?, 
             error_message = ?, 
             synced_at = COALESCE(?, synced_at),
             attempts = CASE WHEN ? = 'FAILED' THEN attempts + 1 ELSE attempts END
         WHERE id = ?;`,
        [status, errorMessage, syncedAt, status, id]
      );
    } catch (error) {
      console.warn("[flash-erp:mobile] SQLite outbox status update failed; updated in memory.", error);
      await memoryStore.markMutationStatus(id, status, errorMessage);
    }
  },

  async clearSynced(): Promise<void> {
    const db = await getNativeDb();
    if (!db) {
      await memoryStore.clearSynced();
      return;
    }
    try {
      await db.runAsync(`DELETE FROM mobile_outbox WHERE status = 'SYNCED';`);
    } catch (error) {
      console.warn("[flash-erp:mobile] SQLite synced-cleanup failed; cleaned in memory.", error);
      await memoryStore.clearSynced();
    }
  }
};
