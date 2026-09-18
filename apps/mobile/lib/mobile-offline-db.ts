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
  sellingUnitsJson?: string;
  stockQuantity: number;
  storeCode?: string | null;
  updatedAt: string;
}

export type OutboxEntityType =
  | "STOCK_COUNT"
  | "SALE"
  | "GOODS_RECEIPT"
  | "TRANSFER"
  | "FUEL_DIP"
  | "FUEL_METER"
  | "EXPENSE_CLAIM";

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
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
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
      `);
      nativeDb = db;
      return nativeDb;
    }
  } catch {
    // Dynamic import or open failed; fallback to memory
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

    await db.withTransactionAsync(async () => {
      for (const p of products) {
        await db.runAsync(
          `INSERT INTO cached_products 
             (id, product_code, product_name, barcode, unit_price, unit_of_measure, selling_units_json, stock_quantity, store_code, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(product_code) DO UPDATE SET
             product_name = excluded.product_name,
             barcode = excluded.barcode,
             unit_price = excluded.unit_price,
             unit_of_measure = excluded.unit_of_measure,
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
            p.sellingUnitsJson || null,
            p.stockQuantity,
            p.storeCode || null,
            p.updatedAt || new Date().toISOString()
          ]
        );
      }
    });
  },

  async findProductByBarcode(barcode: string): Promise<CachedProduct | null> {
    const clean = barcode.trim();
    if (!clean) return null;

    const db = await getNativeDb();
    if (!db) {
      return await memoryStore.findProductByBarcode(clean);
    }

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
      sellingUnitsJson: row.selling_units_json,
      stockQuantity: row.stock_quantity,
      storeCode: row.store_code,
      updatedAt: row.updated_at
    };
  },

  async searchProducts(query: string, limit = 50): Promise<CachedProduct[]> {
    const q = query.trim();
    const db = await getNativeDb();
    if (!db) {
      return await memoryStore.searchProducts(q, limit);
    }

    const term = `%${q}%`;
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
      sellingUnitsJson: row.selling_units_json,
      stockQuantity: row.stock_quantity,
      storeCode: row.store_code,
      updatedAt: row.updated_at
    }));
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

    return mutation;
  },

  async getPendingMutations(): Promise<OutboxMutation[]> {
    const db = await getNativeDb();
    if (!db) {
      return await memoryStore.getPendingMutations();
    }

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
  },

  async getOutboxStats(): Promise<{ pending: number; failed: number; synced: number; total: number }> {
    const db = await getNativeDb();
    if (!db) {
      return await memoryStore.getOutboxStats();
    }

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
    await db.runAsync(
      `UPDATE mobile_outbox 
       SET status = ?, 
           error_message = ?, 
           synced_at = COALESCE(?, synced_at),
           attempts = CASE WHEN ? = 'FAILED' THEN attempts + 1 ELSE attempts END
       WHERE id = ?;`,
      [status, errorMessage, syncedAt, status, id]
    );
  },

  async clearSynced(): Promise<void> {
    const db = await getNativeDb();
    if (!db) {
      await memoryStore.clearSynced();
      return;
    }
    await db.runAsync(`DELETE FROM mobile_outbox WHERE status = 'SYNCED';`);
  }
};
