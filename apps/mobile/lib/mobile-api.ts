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

import { readMobileSession, type MobileUserSession } from "./mobile-session";
export type { MobileUserSession } from "./mobile-session";

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

/** Map one /api/catalog/products row (HQ only returns ACTIVE, non-deleted products). */
function mapCatalogProductRow(row: any): InventoryLookupResult {
  return {
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
}

function mapCachedProductRow(product: CachedProduct): InventoryLookupResult {
  return {
    productId: product.id,
    productCode: product.productCode,
    productName: product.productName,
    barcode: product.barcode || null,
    unitPrice: product.unitPrice,
    unitOfMeasure: product.unitOfMeasure,
    taxRatePercent: product.taxRatePercent ?? 0,
    isTaxInclusive: product.isTaxInclusive ?? false,
    quantityOnHand: product.stockQuantity,
    storeCode: product.storeCode || undefined,
    ...readCachedProductOptions(product)
  };
}

export interface InventoryPageResult {
  ok: boolean;
  items: InventoryLookupResult[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  isOffline?: boolean;
  error?: string;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  message?: string;
  error?: string;
  isOffline?: boolean;
  queuedMutationId?: string;
}

export interface MobileErrorLogEntry {
  seq: number;
  time: string;
  tag: string;
  method?: string;
  endpoint?: string;
  status?: number | null;
  mode?: string;
  serverHost?: string;
  message: string;
}

const ERROR_LOG_CAP = 150;
const ERROR_LOG_FILE = "flash-erp-error-log.json";
const errorLogBuffer: MobileErrorLogEntry[] = [];
let errorLogSeq = 0;

function serverHostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl;
  }
}

function persistErrorLogBestEffort(): void {
  try {
    const fileSystem = FileSystem as unknown as {
      documentDirectory?: string | null;
      writeAsStringAsync?: (uri: string, content: string) => Promise<void>;
    };
    const directory = fileSystem?.documentDirectory;
    if (!directory || typeof fileSystem?.writeAsStringAsync !== "function") return;
    void fileSystem.writeAsStringAsync(directory + ERROR_LOG_FILE, JSON.stringify(errorLogBuffer.slice(-ERROR_LOG_CAP))).catch(() => {});
  } catch {
    // Diagnostics must never break API calls.
  }
}

function recordErrorLog(entry: Omit<MobileErrorLogEntry, "seq" | "time">): void {
  try {
    errorLogSeq += 1;
    errorLogBuffer.push({ ...entry, seq: errorLogSeq, time: new Date().toISOString(), message: entry.message.slice(0, 500) });
    while (errorLogBuffer.length > ERROR_LOG_CAP) errorLogBuffer.shift();
    persistErrorLogBestEffort();
  } catch {
    // Diagnostics must never break API calls.
  }
}

async function readPersistedErrorLog(): Promise<MobileErrorLogEntry[]> {
  try {
    const fileSystem = FileSystem as unknown as {
      documentDirectory?: string | null;
      readAsStringAsync?: (uri: string) => Promise<string>;
    };
    const directory = fileSystem?.documentDirectory;
    if (!directory || typeof fileSystem?.readAsStringAsync !== "function") return [];
    const raw = await fileSystem.readAsStringAsync(directory + ERROR_LOG_FILE);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is MobileErrorLogEntry =>
      Boolean(entry) && typeof entry === "object" && typeof (entry as MobileErrorLogEntry).message === "string"
    );
  } catch {
    return [];
  }
}

class MobileHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string = "",
    readonly method: string = "",
    readonly serverMessage: string = ""
  ) { super(message); }
}

function friendlyHttpMessage(status: number, serverMessage: string, method: string, endpoint: string): string {
  if (serverMessage && status !== 404 && status !== 405) return serverMessage;
  if (status === 404 || status === 405) {
    const detail = serverMessage ? `${serverMessage} ` : "";
    return `${detail}HQ rejected this request (HTTP ${status} on ${method} ${endpoint}). The HQ Enterprise Web build is outdated or missing this feature — update HQ to the latest version, or continue offline. Details were saved under My Account › Diagnostics.`;
  }
  if (status >= 500) {
    return serverMessage || `HQ reported a server error (HTTP ${status} on ${method} ${endpoint}). Try again; if it continues, copy diagnostics from My Account and send them to HQ IT.`;
  }
  if (status === 401) return serverMessage || "Your session has expired. Please sign in again.";
  if (status === 403) return serverMessage || "Your account is not permitted to do this. Contact HQ to review your role or home shop.";
  return serverMessage || `HQ rejected this request (HTTP ${status} on ${method} ${endpoint}).`;
}

/** Online-only features must fail fast in OFFLINE mode with guidance, never a raw network error. */
async function requireOnlineMode(feature: string): Promise<ApiResponse<never> | null> {
  const mode = await mobileStorage.getOperationMode();
  if (mode !== "OFFLINE") return null;
  return { ok: false, isOffline: true, error: `${feature} needs a live HQ connection. Switch to AUTO or ONLINE (tap the status bar at the top), then try again.` };
}

async function request<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  authToken?: string | null
): Promise<{ status: number; data: T }> {
  const baseUrl = await mobileStorage.getServerUrl();
  const token = authToken === undefined ? await mobileStorage.getAuthToken() : authToken;
  const sessionVersion = mobileStorage.getSessionVersion();
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanEndpoint}`;
  const method = (options.method || "GET").toUpperCase();

  // Never send Content-Type on bodyless requests: strict proxies/gateways in
  // front of HQ can reject a GET that claims a JSON body.
  const hasBody = options.body !== undefined && options.body !== null && options.body !== "";
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
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
      credentials: "omit", // Mobile uses Bearer auth, not an unrelated browser/native cookie.
      headers,
      signal: controller.signal
    });
    const text = await response.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      if (response.ok) throw new MobileHttpError("The server returned an invalid response. Please try again.", response.status, cleanEndpoint, method);
      data = {};
    }

    if (!response.ok) {
      if (response.status === 401 && token && sessionVersion === mobileStorage.getSessionVersion() && await mobileStorage.getAuthToken() === token) {
        await mobileStorage.clearAllSession("Your session has expired. Please sign in again.");
      }
      const serverMessage = typeof data?.message === "string" ? data.message : "";
      const httpError = new MobileHttpError(
        friendlyHttpMessage(response.status, serverMessage, method, cleanEndpoint),
        response.status,
        cleanEndpoint,
        method,
        serverMessage
      );
      recordErrorLog({
        tag: "api",
        method,
        endpoint: cleanEndpoint,
        status: response.status,
        serverHost: serverHostOf(baseUrl),
        message: serverMessage ? `${httpError.message} [server said: ${serverMessage.slice(0, 200)}]` : httpError.message
      });
      throw httpError;
    }

    return { status: response.status, data };
  } catch (error) {
    if (error instanceof MobileHttpError) throw error;
    // Network-level failure (no response at all): keep it a plain Error so AUTO
    // mode can still fall back to the offline cache/outbox, but explain the cause.
    const causeMessage = error instanceof Error ? error.message : "Unknown network failure";
    const timedOut = causeMessage.toLowerCase().includes("abort");
    const networkError = new Error(
      timedOut
        ? `HQ did not answer within 12 seconds (${serverHostOf(baseUrl)}). Check your internet connection, or switch to OFFLINE to keep working — details saved under My Account › Diagnostics.`
        : `Could not reach HQ at ${serverHostOf(baseUrl)} (${causeMessage}). Check your internet connection, or switch to OFFLINE to keep working — details saved under My Account › Diagnostics.`
    );
    (networkError as { cause?: unknown }).cause = error;
    (networkError as { endpoint?: string }).endpoint = cleanEndpoint;
    (networkError as { method?: string }).method = method;
    recordErrorLog({ tag: "network", method, endpoint: cleanEndpoint, status: null, serverHost: serverHostOf(baseUrl), message: `${networkError.message} [cause: ${causeMessage.slice(0, 200)}]` });
    throw networkError;
  } finally {
    // Include response-body reads in the deadline, not just response headers.
    clearTimeout(timeoutId);
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
      await mobileStorage.clearAllSession();
      const { data } = await request<any>("/api/auth/sign-in", {
        method: "POST",
        body: JSON.stringify(input)
      });

      // A 200 can be an MFA challenge, not a completed sign-in. Never navigate
      // to the dashboard until both the bearer token and fresh profile exist.
      if (data?.requiresMfa) {
        throw new Error("This account requires multi-factor authentication, which this mobile app does not yet support. Please sign in through the web app.");
      }
      if (typeof data?.token !== "string" || !data.token.trim()) {
        throw new Error("The server did not return a sign-in token. Please try again or contact HQ IT.");
      }

      await mobileStorage.setAuthToken(data.token);
      const sessionResult = await this.fetchSession({ allowCached: false });
      if (!sessionResult.ok || !sessionResult.data) {
        throw new Error(sessionResult.error || "Could not load your signed-in profile. Please try again.");
      }

      return { ok: true, data };
    } catch (error: any) {
      // Do not leave a partial login or another operator's cached profile behind.
      await mobileStorage.clearAllSession();
      return { ok: false, error: error.message || "Failed to sign in." };
    }
  },

  async fetchSession(options: { allowCached?: boolean } = {}): Promise<ApiResponse<MobileUserSession>> {
    const version = mobileStorage.getSessionVersion();
    try {
      if (!await mobileStorage.getAuthToken()) return { ok: false, error: "Please sign in." };
      const { data } = await request<unknown>("/api/auth/session");
      if (version !== mobileStorage.getSessionVersion()) return { ok: false, error: "Session changed. Please sign in again." };
      const session = readMobileSession(data);
      if (session) {
        await mobileStorage.setUserSnapshot(session);
        return { ok: true, data: session };
      }
      await mobileStorage.clearAllSession("The saved session is invalid. Please sign in again.");
      return { ok: false, error: "The server returned an invalid session profile. Please try again or contact HQ IT." };
    } catch (error: any) {
      // Offline reads can use a cached profile, but a new sign-in must validate
      // the new token online rather than reuse a previous operator's snapshot.
      if (version !== mobileStorage.getSessionVersion()) return { ok: false, error: "Session changed. Please sign in again." };
      if (error instanceof MobileHttpError && (error.status === 401 || error.status === 403)) {
        await mobileStorage.clearAllSession("Your session is no longer available. Please sign in again.");
        return { ok: false, error: error.message };
      }
      if (options.allowCached !== false) {
        const cached = readMobileSession(await mobileStorage.getUserSnapshot());
        if (cached) {
          return { ok: true, data: cached, isOffline: true };
        }
      }
      return { ok: false, error: error.message || "Could not load your signed-in profile." };
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

  /** Start self-service password recovery (sends the reset link by email). */
  async requestPasswordReset(identifier: string): Promise<ApiResponse<{ resetLink?: string }>> {
    try {
      const { data } = await request<any>("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ identifier })
      });
      return { ok: true, data, message: data?.message || "If Flash ERP recognizes that account, recovery instructions are on the way." };
    } catch (error: any) {
      return { ok: false, error: error.message || "Could not start password recovery." };
    }
  },

  /** Complete self-service password recovery with the token from the reset link. */
  async resetPassword(token: string, password: string): Promise<ApiResponse> {
    try {
      const { data } = await request<any>("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password })
      });
      return { ok: true, data, message: "Password updated. Sign in with your new password." };
    } catch (error: any) {
      return { ok: false, error: error.message || "Could not reset the password." };
    }
  },

  /** Shop-independent home feed (birthdays, own leave/attendance, approvals). */
  async fetchMobileHome(): Promise<ApiResponse<{
    birthdays: Array<{ displayName: string; department: string | null; position: string | null; turns: number; daysUntil: number; dateLabel: string }>;
    attendance: { checkInAt: string | null; checkOutAt: string | null; attendanceStatus: string } | null;
    upcomingLeave: Array<{ requestNo: string; leaveTypeName: string; startDate: string; endDate: string; requestedDays: number; status: string }>;
    recentClaims: Array<{ claimNo: string; purpose: string; totalAmount: number; currencyCode: string; status: string }>;
    pendingApprovals: number;
  }>> {
    try {
      const { data } = await request<any>("/api/mobile/home");
      return { ok: true, data };
    } catch (error: any) {
      return { ok: false, error: error.message || "Home feed unavailable." };
    }
  },

  async signOut(): Promise<void> {
    const token = await mobileStorage.getAuthToken();
    // Revoke local access immediately. Late session responses cannot restore it.
    await mobileStorage.clearAllSession();
    try {
      await request("/api/auth/sign-out", { method: "POST" }, token);
    } catch {
      // Local logout already completed, even if HQ is unreachable.
    }
  },

  async searchCustomers(query = ""): Promise<ApiResponse<MobileCustomer[]>> {
    const mode = await mobileStorage.getOperationMode();
    const clean = query.trim();

    // Strictly offline: serve the locally synced customer master data.
    if (mode === "OFFLINE") {
      const cached = await mobileOfflineDb.searchCustomers(clean, 30);
      return { ok: true, data: cached, isOffline: true };
    }

    try {
      const { data } = await request<any>(`/api/online-store/customers?query=${encodeURIComponent(clean)}`);
      const customers: MobileCustomer[] = Array.isArray(data?.customers) ? data.customers : [];
      // Keep the offline master-data copy warm with every successful search.
      if (customers.length > 0) {
        mobileOfflineDb.saveCustomers(customers.map((customer) => ({ ...customer, updatedAt: new Date().toISOString() }))).catch(() => {});
      }
      return { ok: true, data: customers };
    } catch (error: any) {
      if (mode === "ONLINE" || error instanceof MobileHttpError) {
        return { ok: false, error: error.message || "Customer search failed." };
      }
      // AUTO mode with a dead connection: fall back to the synced customers.
      const cached = await mobileOfflineDb.searchCustomers(clean, 30);
      return { ok: true, data: cached, isOffline: true };
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
    try {
      const { data } = await request<any>("/api/mobile/dashboard");
      const number = (value: unknown) => typeof value === "number" && Number.isFinite(value);
      if (!data || ![data.salesTotal, data.transactionCount, data.averageBasket, data.pendingApprovals].every(number) ||
        !Array.isArray(data.trend) || !data.trend.every((day: any) => typeof day?.date === "string" && number(day.total)) ||
        !Array.isArray(data.topProducts) || !data.topProducts.every((product: any) => typeof product?.productName === "string" && number(product.quantity) && number(product.sales))) {
        return { ok: false, error: "Sales analytics are unavailable: the server returned an invalid response." };
      }
      return { ok: true, data };
    }
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
            // The HQ product id — offline sales must post this exact id, or
            // HQ rejects the synced sale as "product no longer available".
            id: item.productId,
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
      if (mode === "ONLINE" || onlineError instanceof MobileHttpError) {
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

  // 3b. Resilient inventory grid: paginated ACTIVE products with name/code/barcode filter.
  //     Online/AUTO hit HQ (which only returns active, non-deleted products); OFFLINE
  //     or a network failure in AUTO mode falls back to the local catalog cache.
  async fetchInventoryPage(params: { page?: number; limit?: number; query?: string } = {}): Promise<InventoryPageResult> {
    const page = Math.max(1, Math.trunc(Number(params.page ?? 1) || 1));
    const limit = Math.min(200, Math.max(1, Math.trunc(Number(params.limit ?? 50) || 50)));
    const query = (params.query ?? "").trim();
    const mode = await mobileStorage.getOperationMode();

    if (mode === "OFFLINE") {
      const rows = await mobileOfflineDb.searchProducts(query, limit);
      return { ok: true, items: rows.map(mapCachedProductRow), page: 1, pageSize: limit, total: rows.length, hasMore: false, isOffline: true };
    }

    try {
      const qs = new URLSearchParams({ limit: String(limit), page: String(page) });
      if (query) qs.set("query", query);
      const { data } = await request<any>(`/api/catalog/products?${qs.toString()}`);
      const list = Array.isArray(data?.data) ? data.data : [];
      const items = list.map(mapCatalogProductRow);
      // Keep the offline cache warm with every page the cashier browses.
      const cacheRows: Array<{
        id: string; productCode: string; productName: string; barcode: string; unitPrice: number;
        unitOfMeasure: string; taxRatePercent: number; isTaxInclusive: boolean; stockQuantity: number;
        storeCode: string | null; sellingUnitsJson: string; updatedAt: string;
      }> = [];
      for (const item of items) {
        cacheRows.push({
          // Cache the HQ product id (never the code) so offline sales built
          // from the grid resolve on HQ when the outbox drains.
          id: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          barcode: item.barcode || "",
          unitPrice: item.unitPrice,
          unitOfMeasure: item.unitOfMeasure,
          taxRatePercent: item.taxRatePercent,
          isTaxInclusive: item.isTaxInclusive,
          stockQuantity: item.quantityOnHand,
          storeCode: item.storeCode ?? null,
          sellingUnitsJson: JSON.stringify({ sellingUnits: item.sellingUnits ?? [], variants: item.variants ?? [] }),
          updatedAt: new Date().toISOString()
        });
      }
      if (cacheRows.length > 0) mobileOfflineDb.saveProducts(cacheRows).catch(() => {});
      return {
        ok: true,
        items,
        page: Number(data?.page ?? page),
        pageSize: Number(data?.pageSize ?? limit),
        total: Number(data?.total ?? items.length),
        hasMore: Boolean(data?.hasMore) && items.length > 0
      };
    } catch (onlineError: any) {
      if (mode === "ONLINE" || onlineError instanceof MobileHttpError) {
        return { ok: false, items: [], page, pageSize: limit, total: 0, hasMore: false, error: onlineError.message };
      }
      // AUTO mode: transparently fall back to the offline cache.
      const rows = await mobileOfflineDb.searchProducts(query, limit);
      return { ok: true, items: rows.map(mapCachedProductRow), page: 1, pageSize: limit, total: rows.length, hasMore: false, isOffline: true };
    }
  },

  // 4. Download / Refresh Full Catalog into Offline SQLite
  async syncCatalogToLocalDb(onProgress?: (downloaded: number, total: number) => void): Promise<{ count: number; error?: string }> {
    const offline = await requireOnlineMode("Catalog download");
    if (offline) return { count: 0, error: offline.error };
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

  // 4b. Full POS master-data download for offline use: products (incl. taxes),
  //     customers and tender methods. Everything a cashier needs to sell offline.
  async syncMasterDataToLocalDb(onProgress?: (message: string) => void): Promise<{ products: number; customers: number; error?: string }> {
    const offline = await requireOnlineMode("Master data download");
    if (offline) return { products: 0, customers: 0, error: offline.error };
    try {
      onProgress?.("Downloading product catalog...");
      const catalog = await this.syncCatalogToLocalDb((downloaded, total) => onProgress?.(`Downloading catalog... ${downloaded} of ${total} products`));
      if (catalog.error) return { products: 0, customers: 0, error: catalog.error };

      onProgress?.("Downloading customers...");
      let page = 1;
      let customerCount = 0;
      const validCustomerIds: string[] = [];
      for (;;) {
        const { data } = await request<any>(`/api/online-store/customers?limit=200&page=${page}`);
        const batch: any[] = Array.isArray(data?.customers) ? data.customers : [];
        if (batch.length === 0) break;
        await mobileOfflineDb.saveCustomers(batch.map((customer) => ({
          id: customer.id,
          customerNo: customer.customerNo,
          fullName: customer.fullName,
          phone: customer.phone ?? null,
          email: customer.email ?? null,
          customerType: customer.customerType ?? "WALK_IN",
          updatedAt: new Date().toISOString()
        })));
        validCustomerIds.push(...batch.map((customer) => customer.id));
        customerCount += batch.length;
        onProgress?.(`Downloading customers... ${customerCount}`);
        if (batch.length < 200 || customerCount >= 5000) break;
        page += 1;
      }
      await mobileOfflineDb.pruneCustomers(validCustomerIds);

      onProgress?.("Downloading tender methods...");
      await this.fetchTenderMethods();
      await mobileStorage.setCatalogSyncedAt(new Date().toISOString());
      return { products: catalog.count, customers: customerCount };
    } catch (err: any) {
      return { products: 0, customers: 0, error: err.message };
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
      if (mode === "ONLINE" || err instanceof MobileHttpError) {
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
      if (mode === "ONLINE" || err instanceof MobileHttpError) {
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
        recordErrorLog({
          tag: "sync",
          method: "POST",
          endpoint: mutation.endpoint,
          status: typeof err?.status === "number" ? err.status : null,
          message: `Outbox ${mutation.entityType} ${mutation.id} failed: ${msg}`
        });
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
      if (mode === "ONLINE" || err instanceof MobileHttpError) return { ok: false, error: err.message };
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
      if (mode === "ONLINE" || err instanceof MobileHttpError) return { ok: false, error: err.message };
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
      if (mode === "ONLINE" || err instanceof MobileHttpError) return { ok: false, error: err.message };
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
  /** `date` (YYYY-MM-DD) lists that day's receipts; `query` narrows by number/customer. */
  async searchReceipts(query: string, date?: string): Promise<ApiResponse<any[]>> {
    const offline = await requireOnlineMode("Receipt search");
    if (offline) return offline;
    const qs = new URLSearchParams();
    if (query.trim()) qs.set("query", query.trim());
    if (date) qs.set("date", date);
    try { const { data } = await request<any>(`/api/online-store/receipts?${qs.toString()}`); return { ok: true, data: Array.isArray(data?.receipts) ? data.receipts : [] }; }
    catch (error: any) { return { ok: false, error: error.message || "Receipt search failed." }; }
  },

  async submitCorrection(input: { sourceTransactionNo: string; correctionType: "RETURN" | "EXCHANGE"; returnLines: Array<{ sourceLineId: string; quantity: number }>; saleLines?: Array<{ productId: string; quantity: number; unitPrice?: number; sellingUnitOfMeasure?: string; productVariantCode?: string | null }>; payments: any[]; note: string }): Promise<ApiResponse<any>> {
    const offline = await requireOnlineMode("Returns and exchanges");
    if (offline) return offline;
    try { const { data } = await request<any>("/api/online-store/corrections", { method: "POST", body: JSON.stringify(input) }); return { ok: true, data, message: data?.message || `${input.correctionType === "EXCHANGE" ? "Exchange" : "Return"} completed.` }; }
    catch (error: any) { return { ok: false, error: error.message || "Return or exchange failed." }; }
  },

  async fetchHeldSales(): Promise<ApiResponse<Array<{
    transactionId: string; transactionNo: string; customerId: string | null; customerName: string; totalAmount: number; updatedAt: string;
    lines: Array<{ productId: string; productCode: string; productName: string; quantity: number; unitPrice: number; taxAmount: number; lineTotal: number; sellingUnitOfMeasure: string }>;
  }>>> {
    const offline = await requireOnlineMode("Held sales");
    if (offline) return offline;
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
    const offline = await requireOnlineMode("Parking a sale");
    if (offline) return offline;
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
    const offline = await requireOnlineMode("Sales orders and layaway");
    if (offline) return offline;
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
      if (mode === "ONLINE" || err instanceof MobileHttpError) return { ok: false, error: err.message };
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
      if (mode === "ONLINE" || err instanceof MobileHttpError) return { ok: false, error: err.message };
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
    const offline = await requireOnlineMode("Attendance status");
    if (offline) return offline;
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
    const offline = await requireOnlineMode("Clock in/out");
    if (offline) return offline;
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
    const offline = await requireOnlineMode("Expense claims");
    if (offline) return offline;
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
      if (mode === "ONLINE" || err instanceof MobileHttpError) return { ok: false, error: err.message };
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
    const offline = await requireOnlineMode("Leave information");
    if (offline) return offline;
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
    const offline = await requireOnlineMode("Cancelling leave");
    if (offline) return offline;
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
      if (mode === "ONLINE" || err instanceof MobileHttpError) return { ok: false, error: err.message };
      const mutation = await mobileOfflineDb.enqueueMutation({ entityType: "LEAVE_REQUEST", action: "POST_LEAVE_REQUEST", endpoint, payload: input });
      return { ok: true, isOffline: true, queuedMutationId: mutation.id, message: "Leave request queued after network failure." };
    }
  },

  // 13. Manager approvals (online-only: a decision must be validated against live HQ state)
  async fetchPendingApprovals(): Promise<ApiResponse<{
    leave: Array<{ id: string; requestNo: string; employeeName: string; employeeNo: string; leaveTypeName: string; startDate: string; endDate: string; requestedDays: number; reason: string | null; status: string; submittedAt: string }>;
    expenses: Array<{ id: string; claimNo: string; employeeName: string; employeeNo: string; claimDate: string; purpose: string; totalAmount: number; currencyCode: string; status: string; lineCount: number; submittedAt: string | null }>;
    pendingCount: number;
  }>> {
    const offline = await requireOnlineMode("Manager approvals");
    if (offline) return offline;
    try {
      const { data } = await request<any>("/api/mobile/approvals");
      const leave = Array.isArray(data?.leave) ? data.leave : [];
      const expenses = Array.isArray(data?.expenses) ? data.expenses : [];
      return { ok: true, data: { leave, expenses, pendingCount: typeof data?.pendingCount === "number" ? data.pendingCount : leave.length + expenses.length } };
    } catch (error: any) {
      return { ok: false, error: error.message || "Could not load pending approvals." };
    }
  },

  async decideLeaveRequest(input: { leaveRequestId: string; action: "APPROVE" | "REJECT"; note?: string }): Promise<ApiResponse> {
    const offline = await requireOnlineMode("Leave decisions");
    if (offline) return offline;
    try {
      const { data } = await request("/api/human-resources/leave/requests/decision", {
        method: "POST",
        body: JSON.stringify({ leaveRequestId: input.leaveRequestId, action: input.action, note: input.note || undefined })
      });
      return { ok: true, data, message: input.action === "APPROVE" ? "Leave request approved." : "Leave request rejected." };
    } catch (error: any) {
      return { ok: false, error: error.message || "Could not update the leave request." };
    }
  },

  async decideExpenseClaim(input: { expenseClaimId: string; action: "APPROVE" | "REJECT"; note?: string }): Promise<ApiResponse> {
    const offline = await requireOnlineMode("Expense claim decisions");
    if (offline) return offline;
    try {
      const { data } = await request("/api/human-resources/expense-claims/actions", {
        method: "POST",
        body: JSON.stringify({ expenseClaimId: input.expenseClaimId, action: input.action, note: input.note || undefined })
      });
      return { ok: true, data, message: input.action === "APPROVE" ? "Expense claim approved." : "Expense claim rejected." };
    } catch (error: any) {
      return { ok: false, error: error.message || "Could not update the expense claim." };
    }
  },

  // 14. On-device diagnostics (My Account › Diagnostics). Never contains tokens or passwords.
  async readErrorLog(): Promise<MobileErrorLogEntry[]> {
    const persisted = await readPersistedErrorLog();
    const seen = new Set(errorLogBuffer.map((entry) => `${entry.seq}:${entry.time}`));
    return [...persisted.filter((entry) => !seen.has(`${entry.seq}:${entry.time}`)), ...errorLogBuffer].slice(-ERROR_LOG_CAP);
  },

  async clearErrorLog(): Promise<void> {
    errorLogBuffer.length = 0;
    try {
      const fileSystem = FileSystem as unknown as {
        documentDirectory?: string | null;
        deleteAsync?: (uri: string, options?: { idempotent?: boolean }) => Promise<void>;
      };
      const directory = fileSystem?.documentDirectory;
      if (directory && typeof fileSystem?.deleteAsync === "function") {
        await fileSystem.deleteAsync(directory + ERROR_LOG_FILE, { idempotent: true }).catch(() => {});
      }
    } catch {
      // Clearing memory is enough; file cleanup is best-effort.
    }
  },

  async exportErrorLog(): Promise<string> {
    const [serverUrl, mode, catalogSyncedAt, outbox, session] = await Promise.all([
      mobileStorage.getServerUrl().catch(() => "unknown"),
      mobileStorage.getOperationMode().catch(() => "unknown" as OperationMode),
      mobileStorage.getCatalogSyncedAt().catch(() => null),
      mobileOfflineDb.getOutboxStats().catch(() => ({ pending: -1, failed: -1, synced: -1, total: -1 })),
      mobileStorage.getUserSnapshot<MobileUserSession>().catch(() => null)
    ]);
    const entries = await this.readErrorLog();
    const lines = [
      "Flash ERP mobile diagnostics",
      `Exported: ${new Date().toISOString()}`,
      `HQ server: ${serverUrl}`,
      `Operation mode: ${mode}`,
      `Signed in as: ${session?.loginId ?? "not signed in"}${session?.homeStoreCode ? ` (shop ${session.homeStoreCode})` : ""}`,
      `Catalog last synced: ${catalogSyncedAt ?? "never"}`,
      `Outbox: ${outbox.pending} pending, ${outbox.failed} failed, ${outbox.synced} synced`,
      `Logged errors: ${entries.length}`,
      "---"
    ];
    for (const entry of entries.slice(-100)) {
      const where = [entry.method, entry.endpoint].filter(Boolean).join(" ");
      const status = entry.status === null || entry.status === undefined ? "no-response" : `HTTP ${entry.status}`;
      lines.push(`[${entry.time}] #${entry.seq} ${entry.tag} ${where} ${status}${entry.serverHost ? ` @${entry.serverHost}` : ""}: ${entry.message}`);
    }
    return lines.join("\n").slice(0, 60000);
  }
};
