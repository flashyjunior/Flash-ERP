/**
 * Flash ERP Mobile Resilient API Client
 * Connects directly to the Enterprise Web API with support for:
 * - Bearer token authentication
 * - Online / Offline mode switching
 * - Transparent offline fallback (reads from SQLite cache, queues writes to outbox)
 * - Automatic outbox draining upon sync
 */

import { mobileStorage, type OperationMode } from "./mobile-storage";
import {
  mobileOfflineDb,
  type CachedProduct,
  type OutboxMutation,
  type OutboxEntityType
} from "./mobile-offline-db";

export interface MobileUserSession {
  sessionId: string;
  userId: string;
  loginId: string;
  displayName: string;
  accountStatus: string;
  homeStoreCode: string | null;
  homeStoreName: string | null;
  roleCodes: string[];
  permissionCodes: string[];
  expiresAt: string;
}

export interface InventoryLookupResult {
  productCode: string;
  productName: string;
  barcode: string | null;
  unitPrice: number;
  unitOfMeasure: string;
  quantityOnHand: number;
  storeCode?: string;
  locations?: Array<{ locationCode: string; locationName: string; quantity: number }>;
  sellingUnits?: Array<{
    unitOfMeasureCode: string;
    unitOfMeasureName: string;
    conversionFactor: number;
    unitPrice: number;
    barcode: string;
    isDefault: boolean;
  }>;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  message?: string;
  error?: string;
  isOffline?: boolean;
  queuedMutationId?: string;
}

async function request<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ status: number; data: T }> {
  const baseUrl = await mobileStorage.getServerUrl();
  const token = await mobileStorage.getAuthToken();
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanEndpoint}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>)
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const text = await response.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { rawText: text };
    }

    if (!response.ok) {
      throw new Error(data?.message || `HTTP ${response.status}: Flash ERP server error.`);
    }

    return { status: response.status, data };
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export const mobileApi = {
  // 1. Health & Server Ping
  async checkServerHealth(): Promise<{ ok: boolean; service?: string; latencyMs: number }> {
    const started = Date.now();
    try {
      const { data } = await request<any>("/api/system/live");
      return { ok: true, service: data?.service, latencyMs: Date.now() - started };
    } catch {
      return { ok: false, latencyMs: Date.now() - started };
    }
  },

  // 2. Authentication
  async signIn(input: { loginId: string; password: string }): Promise<ApiResponse<{ token?: string; user?: any }>> {
    try {
      const { data } = await request<any>("/api/auth/sign-in", {
        method: "POST",
        body: JSON.stringify(input)
      });

      if (data.token) {
        await mobileStorage.setAuthToken(data.token);
      }

      // Fetch active session profile
      const sessionResult = await this.fetchSession();
      if (sessionResult.data) {
        await mobileStorage.setUserSnapshot(sessionResult.data);
      }

      return { ok: true, data };
    } catch (error: any) {
      return { ok: false, error: error.message || "Failed to sign in." };
    }
  },

  async fetchSession(): Promise<ApiResponse<MobileUserSession>> {
    try {
      const { data } = await request<any>("/api/auth/session");
      if (data?.session) {
        await mobileStorage.setUserSnapshot(data.session);
        return { ok: true, data: data.session };
      }
      return { ok: false, error: "No active session." };
    } catch (error: any) {
      // Return cached user snapshot if offline
      const cached = await mobileStorage.getUserSnapshot<MobileUserSession>();
      if (cached) {
        return { ok: true, data: cached, isOffline: true };
      }
      return { ok: false, error: error.message };
    }
  },

  async signOut(): Promise<void> {
    try {
      await request("/api/auth/sign-out", { method: "POST" });
    } catch {
      // Proceed with local logout regardless of network
    }
    await mobileStorage.clearAllSession();
  },

  // 3. Resilient Product & Barcode Lookup
  async lookupProduct(lookupValue: string): Promise<ApiResponse<InventoryLookupResult>> {
    const clean = lookupValue.trim();
    if (!clean) return { ok: false, error: "Enter a barcode or product code." };

    const mode = await mobileStorage.getOperationMode();

    // If strictly OFFLINE, query local SQLite immediately
    if (mode === "OFFLINE") {
      const cached = await mobileOfflineDb.findProductByBarcode(clean);
      if (cached) {
        return {
          ok: true,
          data: {
            productCode: cached.productCode,
            productName: cached.productName,
            barcode: cached.barcode,
            unitPrice: cached.unitPrice,
            unitOfMeasure: cached.unitOfMeasure,
            quantityOnHand: cached.stockQuantity,
            storeCode: cached.storeCode || undefined
          },
          isOffline: true
        };
      }
      return { ok: false, error: "Product not found in offline mobile cache.", isOffline: true };
    }

    // Attempt Online Lookup via Enterprise Web /api/online-store/inventory-lookup
    try {
      const { data } = await request<any>("/api/online-store/inventory-lookup", {
        method: "POST",
        body: JSON.stringify({ query: clean, limit: 1 })
      });

      const row = Array.isArray(data?.products) ? data.products[0] : (data?.product ?? null);
      if (row) {
        const item: InventoryLookupResult = {
          productCode: row.productCode || row.code,
          productName: row.productName || row.name,
          barcode: row.barcode || null,
          unitPrice: Number(row.unitPrice || row.price || 0),
          unitOfMeasure: row.unitOfMeasure || row.uom || "EA",
          quantityOnHand: Number(row.quantityOnHand || row.stock || 0),
          storeCode: row.storeCode,
          locations: row.locations,
          sellingUnits: row.sellingUnits
        };

        // Update local SQLite cache in background for future offline use
        mobileOfflineDb.saveProducts([
          {
            id: item.productCode,
            productCode: item.productCode,
            productName: item.productName,
            barcode: item.barcode || "",
            unitPrice: item.unitPrice,
            unitOfMeasure: item.unitOfMeasure,
            stockQuantity: item.quantityOnHand,
            storeCode: item.storeCode,
            updatedAt: new Date().toISOString()
          }
        ]).catch(() => {});

        return { ok: true, data: item };
      }
    } catch (onlineError: any) {
      if (mode === "ONLINE") {
        return { ok: false, error: onlineError.message };
      }
      // If AUTO mode, fall back to offline cache on network failure
    }

    // Fallback to offline cache
    const cached = await mobileOfflineDb.findProductByBarcode(clean);
    if (cached) {
      return {
        ok: true,
        data: {
          productCode: cached.productCode,
          productName: cached.productName,
          barcode: cached.barcode,
          unitPrice: cached.unitPrice,
          unitOfMeasure: cached.unitOfMeasure,
          quantityOnHand: cached.stockQuantity,
          storeCode: cached.storeCode || undefined
        },
        isOffline: true
      };
    }

    return { ok: false, error: `Product '${clean}' not found.` };
  },

  // 4. Download / Refresh Full Catalog into Offline SQLite
  async syncCatalogToLocalDb(): Promise<{ count: number; error?: string }> {
    try {
      const { data } = await request<any>("/api/catalog/products?limit=500");
      const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      const formatted: CachedProduct[] = list.map((p: any) => ({
        id: p.id || p.productCode,
        productCode: p.productCode || p.code,
        productName: p.productName || p.name,
        barcode: p.barcode || "",
        unitPrice: Number(p.unitPrice || 0),
        unitOfMeasure: p.unitOfMeasure || "EA",
        stockQuantity: Number(p.quantityOnHand || 0),
        updatedAt: new Date().toISOString()
      }));

      await mobileOfflineDb.saveProducts(formatted);
      return { count: formatted.length };
    } catch (err: any) {
      return { count: 0, error: err.message };
    }
  },

  // 5. Resilient Stock Count Submission (Posts online or queues in SQLite outbox)
  async submitStockCount(input: {
    sheetNo?: string;
    productId: string;
    inventoryLocationId?: string;
    countedQuantity: number;
    batchCounts?: any[];
    note?: string;
  }): Promise<ApiResponse> {
    const mode = await mobileStorage.getOperationMode();

    if (mode === "OFFLINE") {
      const mutation = await mobileOfflineDb.enqueueMutation({
        entityType: "STOCK_COUNT",
        action: "POST_STOCK_COUNT",
        endpoint: "/api/online-store/stock-counts",
        payload: input
      });
      return {
        ok: true,
        isOffline: true,
        queuedMutationId: mutation.id,
        message: "Count recorded offline. Queued for sync."
      };
    }

    try {
      const { data } = await request<any>("/api/online-store/stock-counts", {
        method: "POST",
        body: JSON.stringify(input)
      });
      return { ok: true, data, message: "Count posted directly to HQ ledger." };
    } catch (err: any) {
      if (mode === "ONLINE") {
        return { ok: false, error: err.message };
      }
      // Auto fallback to queue
      const mutation = await mobileOfflineDb.enqueueMutation({
        entityType: "STOCK_COUNT",
        action: "POST_STOCK_COUNT",
        endpoint: "/api/online-store/stock-counts",
        payload: input
      });
      return {
        ok: true,
        isOffline: true,
        queuedMutationId: mutation.id,
        message: "Network unavailable. Count queued offline."
      };
    }
  },

  // 6. Resilient Mobile Sale Submission
  async submitSale(saleInput: any): Promise<ApiResponse> {
    const mode = await mobileStorage.getOperationMode();

    if (mode === "OFFLINE") {
      const mutation = await mobileOfflineDb.enqueueMutation({
        entityType: "SALE",
        action: "POST_ONLINE_STORE_SALE",
        endpoint: "/api/online-store/sales",
        payload: saleInput
      });
      return {
        ok: true,
        isOffline: true,
        queuedMutationId: mutation.id,
        message: "Sale completed offline. Queued for sync."
      };
    }

    try {
      const { data } = await request<any>("/api/online-store/sales", {
        method: "POST",
        body: JSON.stringify(saleInput)
      });
      return { ok: true, data, message: "Sale posted to HQ accounting." };
    } catch (err: any) {
      if (mode === "ONLINE") {
        return { ok: false, error: err.message };
      }
      const mutation = await mobileOfflineDb.enqueueMutation({
        entityType: "SALE",
        action: "POST_ONLINE_STORE_SALE",
        endpoint: "/api/online-store/sales",
        payload: saleInput
      });
      return {
        ok: true,
        isOffline: true,
        queuedMutationId: mutation.id,
        message: "Offline fallback: Sale saved to mobile outbox."
      };
    }
  },

  // 7. Drain & Sync Outbox Queue to HQ Enterprise API
  async drainOutboxQueue(): Promise<{
    processed: number;
    synced: number;
    failed: number;
    errors: string[];
  }> {
    const pending = await mobileOfflineDb.getPendingMutations();
    if (pending.length === 0) {
      return { processed: 0, synced: 0, failed: 0, errors: [] };
    }

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const mutation of pending) {
      await mobileOfflineDb.markMutationStatus(mutation.id, "SYNCING");
      try {
        const payload = JSON.parse(mutation.payloadJson);
        await request(mutation.endpoint, {
          method: "POST",
          body: JSON.stringify(payload)
        });
        await mobileOfflineDb.markMutationStatus(mutation.id, "SYNCED");
        synced += 1;
      } catch (err: any) {
        failed += 1;
        const msg = err.message || "Sync failure";
        errors.push(`${mutation.entityType} [${mutation.id}]: ${msg}`);
        await mobileOfflineDb.markMutationStatus(mutation.id, "FAILED", msg);
      }
    }

    return { processed: pending.length, synced, failed, errors };
  },

  // 8. Goods Receiving & Purchase Order Check
  async submitGoodsReceipt(input: {
    purchaseOrderId?: string;
    inventoryLocationId?: string;
    note?: string;
    lines: Array<{
      productId: string;
      quantity: number;
      unitCost?: number;
      batchNumber?: string;
      expiryDate?: string;
    }>;
  }): Promise<ApiResponse> {
    const mode = await mobileStorage.getOperationMode();
    if (mode === "OFFLINE") {
      const mutation = await mobileOfflineDb.enqueueMutation({
        entityType: "GOODS_RECEIPT",
        action: "POST_GOODS_RECEIPT",
        endpoint: "/api/online-store/goods-receipts",
        payload: input
      });
      return { ok: true, isOffline: true, queuedMutationId: mutation.id, message: "Receipt queued offline." };
    }
    try {
      const { data } = await request("/api/online-store/goods-receipts", {
        method: "POST",
        body: JSON.stringify(input)
      });
      return { ok: true, data, message: "Goods received and committed to inventory." };
    } catch (err: any) {
      if (mode === "ONLINE") return { ok: false, error: err.message };
      const mutation = await mobileOfflineDb.enqueueMutation({
        entityType: "GOODS_RECEIPT",
        action: "POST_GOODS_RECEIPT",
        endpoint: "/api/online-store/goods-receipts",
        payload: input
      });
      return { ok: true, isOffline: true, queuedMutationId: mutation.id, message: "Offline fallback: Receipt queued." };
    }
  },

  // 9. Inter-Store Transfers (Issue / Receive)
  async issueTransfer(transferId: string, input: {
    quantity: number;
    sourceInventoryLocationId?: string;
    transporterName?: string;
    vehicleRegistrationNo?: string;
    note?: string;
  }): Promise<ApiResponse> {
    const endpoint = `/api/online-store/transfers/${encodeURIComponent(transferId)}/issue`;
    const mode = await mobileStorage.getOperationMode();
    if (mode === "OFFLINE") {
      const mutation = await mobileOfflineDb.enqueueMutation({
        entityType: "TRANSFER",
        action: "ISSUE_TRANSFER",
        endpoint,
        payload: input
      });
      return { ok: true, isOffline: true, queuedMutationId: mutation.id, message: "Transfer dispatch queued offline." };
    }
    try {
      const { data } = await request(endpoint, {
        method: "POST",
        body: JSON.stringify(input)
      });
      return { ok: true, data, message: "Transfer issued successfully." };
    } catch (err: any) {
      if (mode === "ONLINE") return { ok: false, error: err.message };
      const mutation = await mobileOfflineDb.enqueueMutation({
        entityType: "TRANSFER",
        action: "ISSUE_TRANSFER",
        endpoint,
        payload: input
      });
      return { ok: true, isOffline: true, queuedMutationId: mutation.id, message: "Offline fallback: Transfer dispatch queued." };
    }
  },

  async receiveTransfer(transferId: string, input: {
    quantity: number;
    note?: string;
  }): Promise<ApiResponse> {
    const endpoint = `/api/online-store/transfers/${encodeURIComponent(transferId)}/receive`;
    const mode = await mobileStorage.getOperationMode();
    if (mode === "OFFLINE") {
      const mutation = await mobileOfflineDb.enqueueMutation({
        entityType: "TRANSFER",
        action: "RECEIVE_TRANSFER",
        endpoint,
        payload: input
      });
      return { ok: true, isOffline: true, queuedMutationId: mutation.id, message: "Transfer receipt queued offline." };
    }
    try {
      const { data } = await request(endpoint, {
        method: "POST",
        body: JSON.stringify(input)
      });
      return { ok: true, data, message: "Transfer received and cleared into stock." };
    } catch (err: any) {
      if (mode === "ONLINE") return { ok: false, error: err.message };
      const mutation = await mobileOfflineDb.enqueueMutation({
        entityType: "TRANSFER",
        action: "RECEIVE_TRANSFER",
        endpoint,
        payload: input
      });
      return { ok: true, isOffline: true, queuedMutationId: mutation.id, message: "Offline fallback: Transfer receipt queued." };
    }
  },

  // 10. Held Sales & Layaway Orders
  async holdSale(input: {
    lines: any[];
    customerId?: string;
    note?: string;
  }): Promise<ApiResponse> {
    try {
      const { data } = await request("/api/online-store/held-sales", {
        method: "POST",
        body: JSON.stringify(input)
      });
      return { ok: true, data, message: "Sale parked as Held Basket." };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },

  async createSalesOrder(input: {
    orderType?: "SALES_ORDER" | "LAYAWAY";
    customerId: string;
    lines: any[];
    payments?: any[];
    note?: string;
  }): Promise<ApiResponse> {
    try {
      const { data } = await request("/api/online-store/sales-orders", {
        method: "POST",
        body: JSON.stringify(input)
      });
      return { ok: true, data, message: "Sales order / layaway created." };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },

  // 11. Fuel Operations (Dips & Meters)
  async submitFuelDip(input: {
    tankId: string;
    dipCm: number;
    volumeLiters?: number;
    waterDipCm?: number;
    recordedAt?: string;
    note?: string;
  }): Promise<ApiResponse> {
    const endpoint = "/api/fuel-operations/dips";
    const mode = await mobileStorage.getOperationMode();
    if (mode === "OFFLINE") {
      const mutation = await mobileOfflineDb.enqueueMutation({
        entityType: "FUEL_DIP",
        action: "POST_FUEL_DIP",
        endpoint,
        payload: input
      });
      return { ok: true, isOffline: true, queuedMutationId: mutation.id, message: "Tank dip saved offline." };
    }
    try {
      const { data } = await request(endpoint, {
        method: "POST",
        body: JSON.stringify(input)
      });
      return { ok: true, data, message: "Tank dip reading committed." };
    } catch (err: any) {
      if (mode === "ONLINE") return { ok: false, error: err.message };
      const mutation = await mobileOfflineDb.enqueueMutation({
        entityType: "FUEL_DIP",
        action: "POST_FUEL_DIP",
        endpoint,
        payload: input
      });
      return { ok: true, isOffline: true, queuedMutationId: mutation.id, message: "Offline fallback: Tank dip queued." };
    }
  },

  async submitFuelMeter(input: {
    nozzleId: string;
    closingMeter: number;
    openingMeter?: number;
    recordedAt?: string;
  }): Promise<ApiResponse> {
    const endpoint = "/api/fuel-operations/meter-readings";
    const mode = await mobileStorage.getOperationMode();
    if (mode === "OFFLINE") {
      const mutation = await mobileOfflineDb.enqueueMutation({
        entityType: "FUEL_METER",
        action: "POST_FUEL_METER",
        endpoint,
        payload: input
      });
      return { ok: true, isOffline: true, queuedMutationId: mutation.id, message: "Meter reading saved offline." };
    }
    try {
      const { data } = await request(endpoint, {
        method: "POST",
        body: JSON.stringify(input)
      });
      return { ok: true, data, message: "Meter reading recorded." };
    } catch (err: any) {
      if (mode === "ONLINE") return { ok: false, error: err.message };
      const mutation = await mobileOfflineDb.enqueueMutation({
        entityType: "FUEL_METER",
        action: "POST_FUEL_METER",
        endpoint,
        payload: input
      });
      return { ok: true, isOffline: true, queuedMutationId: mutation.id, message: "Offline fallback: Meter reading queued." };
    }
  },

  // 12. HR Self-Service (Attendance, Expense Claims, Leave)
  async submitAttendance(input: {
    employeeId?: string;
    checkInTime: string;
    locationNote?: string;
  }): Promise<ApiResponse> {
    try {
      const { data } = await request("/api/human-resources/attendance", {
        method: "POST",
        body: JSON.stringify(input)
      });
      return { ok: true, data, message: "Attendance clocked in successfully." };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },

  async submitExpenseClaim(input: {
    title: string;
    amount: number;
    category: string;
    expenseDate: string;
    receiptUrl?: string;
    note?: string;
  }): Promise<ApiResponse> {
    const endpoint = "/api/human-resources/expense-claims";
    const mode = await mobileStorage.getOperationMode();
    if (mode === "OFFLINE") {
      const mutation = await mobileOfflineDb.enqueueMutation({
        entityType: "EXPENSE_CLAIM",
        action: "POST_EXPENSE_CLAIM",
        endpoint,
        payload: input
      });
      return { ok: true, isOffline: true, queuedMutationId: mutation.id, message: "Expense claim queued offline." };
    }
    try {
      const { data } = await request(endpoint, {
        method: "POST",
        body: JSON.stringify(input)
      });
      return { ok: true, data, message: "Expense claim submitted for approval." };
    } catch (err: any) {
      if (mode === "ONLINE") return { ok: false, error: err.message };
      const mutation = await mobileOfflineDb.enqueueMutation({
        entityType: "EXPENSE_CLAIM",
        action: "POST_EXPENSE_CLAIM",
        endpoint,
        payload: input
      });
      return { ok: true, isOffline: true, queuedMutationId: mutation.id, message: "Offline fallback: Expense claim queued." };
    }
  },

  async submitLeaveRequest(input: {
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    reason: string;
  }): Promise<ApiResponse> {
    try {
      const { data } = await request("/api/human-resources/leave/requests", {
        method: "POST",
        body: JSON.stringify(input)
      });
      return { ok: true, data, message: "Leave request submitted." };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
};
