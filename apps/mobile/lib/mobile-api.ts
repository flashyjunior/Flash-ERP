/**
 * Flash ERP Mobile Resilient API Client
 * Connects directly to the Enterprise Web API with support for:
 * - Bearer token authentication
 * - Online / Offline mode switching
 * - Transparent offline fallback (reads from SQLite cache, queues writes to outbox)
 * - Automatic outbox draining upon sync
 */

import { mobileStorage, type OperationMode } from "./mobile-storage";
import * as FileSystem from "expo-file-system/legacy";
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
  isOnlineStoreUser?: boolean;
  expiresAt: string;
}



export interface MobileCustomer {
  id: string;
  customerNo: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  customerType: string;
}

export interface MobileTenderMethod {
  id: string;
  code: string;
  name: string;
  paymentMethod: string;
  requiresReference: boolean;
  allowChange: boolean;
  sortOrder: number;
}

export interface InventoryLookupResult {
  productId: string;
  productCode: string;
  productName: string;
  barcode: string | null;
  unitPrice: number;
  unitOfMeasure: string;
  taxRatePercent: number;
  isTaxInclusive: boolean;
  quantityOnHand: number;
  storeCode?: string;
  locations?: Array<{ locationCode: string; locationName: string; quantity: number }>;
  variants?: Array<{ id: string; code: string; name: string; barcode: string | null; unitPrice: number; quantityOnHand: number; attributes: Array<{ name: string; value: string }> }>;
  sellingUnits?: Array<{
    unitOfMeasureCode: string;
    unitOfMeasureName: string;
    conversionFactor: number;
    unitPrice: number;
    barcode: string;
    isDefault: boolean;
  }>;
}

function readCachedProductOptions(product: CachedProduct): Pick<InventoryLookupResult, "sellingUnits" | "variants"> {
  if (!product.sellingUnitsJson) return {};
  try { const parsed = JSON.parse(product.sellingUnitsJson); return { sellingUnits: Array.isArray(parsed?.sellingUnits) ? parsed.sellingUnits : undefined, variants: Array.isArray(parsed?.variants) ? parsed.variants : undefined }; }
  catch { return {}; }
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
      const session = data?.session ?? (data?.userId ? data : null);
      if (session) {
        await mobileStorage.setUserSnapshot(session);
        return { ok: true, data: session };
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

  async fetchProfile(): Promise<ApiResponse<{ displayName: string; email: string | null; loginId: string }>> {
    try { const { data } = await request<any>("/api/auth/profile"); return { ok: true, data: data.profile }; }
    catch (error: any) { return { ok: false, error: error.message || "Could not load your profile." }; }
  },

  async updateProfile(input: { displayName: string; email: string | null }): Promise<ApiResponse> {
    try { const { data } = await request("/api/auth/profile", { method: "PATCH", body: JSON.stringify(input) }); return { ok: true, data, message: "Profile updated successfully." }; }
    catch (error: any) { return { ok: false, error: error.message || "Could not update your profile." }; }
  },

  async changePassword(input: { currentPassword: string; nextPassword: string }): Promise<ApiResponse> {
    try {
      const { data } = await request("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify(input)
      });
      return { ok: true, data, message: "Password updated successfully." };
    } catch (error: any) {
      return { ok: false, error: error.message || "Could not update your password." };
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

  async searchCustomers(query = ""): Promise<ApiResponse<MobileCustomer[]>> {
    try {
      const { data } = await request<any>(`/api/online-store/customers?query=${encodeURIComponent(query.trim())}`);
      return { ok: true, data: Array.isArray(data?.customers) ? data.customers : [] };
    } catch (error: any) {
      return { ok: false, error: error.message || "Customer search failed." };
    }
  },

  async fetchTenderMethods(): Promise<ApiResponse<MobileTenderMethod[]>> {
    try {
      const { data } = await request<any>("/api/online-store/tender-methods");
      const tenders = Array.isArray(data?.tenders) ? data.tenders as MobileTenderMethod[] : [];
      await mobileStorage.setTenderMethods(tenders);
      return { ok: true, data: tenders };
    } catch (error: any) {
      const cached = await mobileStorage.getTenderMethods<MobileTenderMethod[]>();
      if (cached?.length) return { ok: true, data: cached, isOffline: true };
      return { ok: false, error: error.message || "Tender settings are unavailable." };
    }
  },

  async fetchDashboardAnalytics(): Promise<ApiResponse<{ salesTotal: number; transactionCount: number; averageBasket: number; pendingApprovals: number; trend: Array<{ date: string; total: number }>; topProducts: Array<{ productCode: string; productName: string; quantity: number; sales: number }>; generatedAt: string }>> {
    try { const { data } = await request<any>("/api/mobile/dashboard"); return { ok: true, data }; }
    catch (error: any) { return { ok: false, error: error.message || "Dashboard analytics are unavailable." }; }
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
            productId: cached.id,
            productCode: cached.productCode,
            productName: cached.productName,
            barcode: cached.barcode,
            unitPrice: cached.unitPrice,
            unitOfMeasure: cached.unitOfMeasure,
            taxRatePercent: cached.taxRatePercent ?? 0,
            isTaxInclusive: cached.isTaxInclusive ?? false,
            quantityOnHand: cached.stockQuantity,
            storeCode: cached.storeCode || undefined,
            ...readCachedProductOptions(cached)
          },
          isOffline: true
        };
      }
      return { ok: false, error: "Product not found in offline mobile cache.", isOffline: true };
    }

    // Attempt Online Lookup via Enterprise Web /api/online-store/inventory-lookup
    try {
      const { data } = await request<any>(`/api/catalog/products?limit=1&query=${encodeURIComponent(clean)}`);

      const row = Array.isArray(data?.data) ? data.data[0] : null;
      if (row) {
        const item: InventoryLookupResult = {
          productId: row.productId || row.id,
          productCode: row.productCode || row.code,
          productName: row.productName || row.name,
          barcode: row.barcode || null,
          unitPrice: Number(row.unitPrice || row.price || 0),
          unitOfMeasure: row.unitOfMeasure || row.uom || "EA",
          taxRatePercent: Number(row.taxRatePercent || 0),
          isTaxInclusive: Boolean(row.isTaxInclusive),
          quantityOnHand: Number(row.quantityOnHand || row.stock || 0),
          storeCode: row.storeCode,
          locations: row.locations,
          sellingUnits: row.sellingUnits,
          variants: row.variants
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
            taxRatePercent: item.taxRatePercent,
            isTaxInclusive: item.isTaxInclusive,
            stockQuantity: item.quantityOnHand,
            storeCode: item.storeCode,
            sellingUnitsJson: JSON.stringify({ sellingUnits: item.sellingUnits ?? [], variants: item.variants ?? [] }),
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
          productId: cached.id,
          productCode: cached.productCode,
          productName: cached.productName,
          barcode: cached.barcode,
          unitPrice: cached.unitPrice,
          unitOfMeasure: cached.unitOfMeasure,
          taxRatePercent: cached.taxRatePercent ?? 0,
          isTaxInclusive: cached.isTaxInclusive ?? false,
          quantityOnHand: cached.stockQuantity,
          storeCode: cached.storeCode || undefined
        },
        isOffline: true
      };
    }

    return { ok: false, error: `Product '${clean}' not found.` };
  },

  // 4. Download / Refresh Full Catalog into Offline SQLite
  async syncCatalogToLocalDb(onProgress?: (downloaded: number, total: number) => void): Promise<{ count: number; error?: string }> {
    try {
      let page = 1;
      let count = 0;
      let hasMore = true;
      const validProductCodes: string[] = [];
      while (hasMore) {
        const { data } = await request<any>(`/api/catalog/products?limit=100&page=${page}`);
        const list = Array.isArray(data?.data) ? data.data : [];
        const formatted: CachedProduct[] = list.map((p: any) => ({
          id: p.id || p.productCode,
          productCode: p.productCode || p.code,
          productName: p.productName || p.name,
          barcode: p.barcode || "",
          unitPrice: Number(p.unitPrice || 0),
          unitOfMeasure: p.unitOfMeasure || "EA",
          taxRatePercent: Number(p.taxRatePercent || 0),
          isTaxInclusive: Boolean(p.isTaxInclusive),
          sellingUnitsJson: JSON.stringify({ sellingUnits: p.sellingUnits ?? [], variants: p.variants ?? [] }),
          stockQuantity: Number(p.quantityOnHand || 0),
          storeCode: p.storeCode,
          updatedAt: new Date().toISOString()
        }));
        await mobileOfflineDb.saveProducts(formatted);
        validProductCodes.push(...formatted.map((product) => product.productCode));
        count += formatted.length;
        onProgress?.(count, Number(data?.total ?? count));
        hasMore = Boolean(data?.hasMore) && formatted.length > 0;
        page += 1;
      }
      await mobileOfflineDb.pruneProducts(validProductCodes);
      await mobileStorage.setCatalogSyncedAt(new Date().toISOString());
      return { count };
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
        if (mutation.entityType === "EXPENSE_CLAIM" && typeof payload.receiptUrl === "string" && !payload.receiptUrl.startsWith("/api/")) {
          const upload = await this.uploadExpenseReceipt(payload.receiptUrl);
          if (!upload.ok || !upload.data?.url) throw new Error(upload.error || "Expense evidence upload failed.");
          payload.receiptUrl = upload.data.url;
        }
        if (mutation.entityType === "LEAVE_REQUEST" && typeof payload.attachmentUrl === "string" && !payload.attachmentUrl.startsWith("/api/")) {
          const upload = await this.uploadLeaveDocument(payload.attachmentUrl);
          if (!upload.ok || !upload.data?.url) throw new Error(upload.error || "Leave evidence upload failed.");
          payload.attachmentUrl = upload.data.url;
          payload.attachmentFileName = upload.data.fileName;
          payload.attachmentMimeType = "image/jpeg";
        }
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
  async searchReceipts(query: string): Promise<ApiResponse<any[]>> {
    try { const { data } = await request<any>(`/api/online-store/receipts?query=${encodeURIComponent(query.trim())}`); return { ok: true, data: Array.isArray(data?.receipts) ? data.receipts : [] }; }
    catch (error: any) { return { ok: false, error: error.message || "Receipt search failed." }; }
  },

  async submitCorrection(input: { sourceTransactionNo: string; correctionType: "RETURN" | "EXCHANGE"; returnLines: Array<{ sourceLineId: string; quantity: number }>; saleLines?: Array<{ productId: string; quantity: number; unitPrice?: number; sellingUnitOfMeasure?: string; productVariantCode?: string | null }>; payments: any[]; note: string }): Promise<ApiResponse<any>> {
    try { const { data } = await request<any>("/api/online-store/corrections", { method: "POST", body: JSON.stringify(input) }); return { ok: true, data, message: data?.message || `${input.correctionType === "EXCHANGE" ? "Exchange" : "Return"} completed.` }; }
    catch (error: any) { return { ok: false, error: error.message || "Return or exchange failed." }; }
  },

  async fetchHeldSales(): Promise<ApiResponse<Array<{
    transactionId: string; transactionNo: string; customerId: string | null; customerName: string; totalAmount: number; updatedAt: string;
    lines: Array<{ productId: string; productCode: string; productName: string; quantity: number; unitPrice: number; taxAmount: number; lineTotal: number; sellingUnitOfMeasure: string }>;
  }>>> {
    try {
      const { data } = await request<any>("/api/online-store/held-sales");
      return { ok: true, data: Array.isArray(data?.heldSales) ? data.heldSales : [] };
    } catch (error: any) { return { ok: false, error: error.message || "Could not load held sales." }; }
  },

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
  async fetchMyAttendance(): Promise<ApiResponse<{ checkInAt: string | null; checkOutAt: string | null; attendanceStatus: string } | null>> {
    try {
      const { data } = await request<any>("/api/human-resources/attendance?self=true");
      return { ok: true, data: data?.attendance ?? null };
    } catch (error: any) {
      return { ok: false, error: error.message || "Could not load today's attendance." };
    }
  },

  async submitAttendance(input: {
    employeeId?: string;
    checkInTime?: string;
    checkOutTime?: string;
    locationNote?: string;
  }): Promise<ApiResponse> {
    try {
      const { data } = await request("/api/human-resources/attendance", {
        method: "POST",
        body: JSON.stringify(input)
      });
      return { ok: true, data, message: input.checkOutTime ? "Attendance clocked out successfully." : "Attendance clocked in successfully." };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },

  async uploadExpenseReceipt(uri: string): Promise<ApiResponse<{ url: string }>> {
    try {
      const baseUrl = await mobileStorage.getServerUrl();
      const token = await mobileStorage.getAuthToken();
      const form = new FormData();
      form.append("file", { uri, name: `receipt-${Date.now()}.jpg`, type: "image/jpeg" } as any);
      const response = await fetch(`${baseUrl}/api/human-resources/expense-claims/attachments`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || `Receipt upload failed (${response.status}).`);
      if (uri.includes("pending-evidence/")) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      return { ok: true, data };
    } catch (error: any) { return { ok: false, error: error.message || "Receipt upload failed." }; }
  },

  async fetchMyExpenseClaims(): Promise<ApiResponse<Array<{ id: string; claimNo: string; claimDate: string; purpose: string; totalAmount: number; currencyCode: string; status: string; category: string | null; evidenceUrl: string | null }>>> {
    try { const { data } = await request<any>("/api/human-resources/expense-claims"); return { ok: true, data: Array.isArray(data?.claims) ? data.claims : [] }; }
    catch (error: any) { return { ok: false, error: error.message || "Could not load expense claims." }; }
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
      const onlineInput = { ...input };
      if (onlineInput.receiptUrl && !onlineInput.receiptUrl.startsWith("/api/")) {
        const upload = await this.uploadExpenseReceipt(onlineInput.receiptUrl);
        if (!upload.ok || !upload.data?.url) throw new Error(upload.error || "Receipt upload failed.");
        onlineInput.receiptUrl = upload.data.url;
      }
      const { data } = await request(endpoint, { method: "POST", body: JSON.stringify(onlineInput) });
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

  async fetchMyLeaveWorkspace(): Promise<ApiResponse<{
    year: number;
    leaveTypes: Array<{ id: string; code: string; name: string; isPaid: boolean; requiresAttachment: boolean; availableDays: number }>;
    requests: Array<{ id: string; requestNo: string; leaveTypeName: string; startDate: string; endDate: string; requestedDays: number; reason: string | null; status: string; attachmentUrl?: string | null }>;
  }>> {
    try {
      const { data } = await request<any>("/api/human-resources/leave/requests");
      return { ok: true, data };
    } catch (error: any) {
      return { ok: false, error: error.message || "Could not load your leave information." };
    }
  },

  async uploadLeaveDocument(uri: string): Promise<ApiResponse<{ url: string; fileName?: string }>> {
    try { const baseUrl = await mobileStorage.getServerUrl(); const token = await mobileStorage.getAuthToken(); const form = new FormData(); form.append("file", { uri, name: `leave-support-${Date.now()}.jpg`, type: "image/jpeg" } as any); const response = await fetch(`${baseUrl}/api/human-resources/leave/requests/attachments`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form }); const data = await response.json(); if (!response.ok) throw new Error(data?.message || "Leave document upload failed."); if (uri.includes("pending-evidence/")) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); return { ok: true, data }; }
    catch (error: any) { return { ok: false, error: error.message || "Leave document upload failed." }; }
  },

  async cancelLeaveRequest(leaveRequestId: string, reason: string): Promise<ApiResponse> {
    try { const { data } = await request("/api/human-resources/leave/requests", { method: "PATCH", body: JSON.stringify({ leaveRequestId, reason }) }); return { ok: true, data, message: "Leave application cancelled." }; }
    catch (error: any) { return { ok: false, error: error.message || "Could not cancel the leave application." }; }
  },

  async submitLeaveRequest(input: {
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    reason: string;
    attachmentUrl?: string;
    attachmentFileName?: string;
    attachmentMimeType?: string;
  }): Promise<ApiResponse> {
    const endpoint = "/api/human-resources/leave/requests";
    const mode = await mobileStorage.getOperationMode();
    if (mode === "OFFLINE") {
      const mutation = await mobileOfflineDb.enqueueMutation({ entityType: "LEAVE_REQUEST", action: "POST_LEAVE_REQUEST", endpoint, payload: input });
      return { ok: true, isOffline: true, queuedMutationId: mutation.id, message: "Leave request and evidence queued offline." };
    }
    try {
      const onlineInput = { ...input };
      if (onlineInput.attachmentUrl && !onlineInput.attachmentUrl.startsWith("/api/")) {
        const upload = await this.uploadLeaveDocument(onlineInput.attachmentUrl);
        if (!upload.ok || !upload.data?.url) throw new Error(upload.error || "Leave document upload failed.");
        onlineInput.attachmentUrl = upload.data.url; onlineInput.attachmentFileName = upload.data.fileName; onlineInput.attachmentMimeType = "image/jpeg";
      }
      const { data } = await request(endpoint, { method: "POST", body: JSON.stringify(onlineInput) });
      return { ok: true, data, message: "Leave request submitted." };
    } catch (err: any) {
      if (mode === "ONLINE") return { ok: false, error: err.message };
      const mutation = await mobileOfflineDb.enqueueMutation({ entityType: "LEAVE_REQUEST", action: "POST_LEAVE_REQUEST", endpoint, payload: input });
      return { ok: true, isOffline: true, queuedMutationId: mutation.id, message: "Leave request queued after network failure." };
    }
  }
};
