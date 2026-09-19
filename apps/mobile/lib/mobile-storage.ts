/**
 * Flash ERP Mobile Secure Storage
 * Stores authentication tokens in hardware-backed secure storage (iOS Keychain / Android Keystore)
 * and persists operational settings.
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEYS = {
  AUTH_TOKEN: "flash_erp_auth_token",
  SERVER_URL: "flash_erp_server_url",
  USER_SNAPSHOT: "flash_erp_user_snapshot",
  OPERATION_MODE: "flash_erp_operation_mode",
  TENDER_METHODS: "flash_erp_tender_methods",
  POS_CART: "flash_erp_pos_cart",
  LAST_RECEIPT: "flash_erp_last_receipt",
  CATALOG_SYNCED_AT: "flash_erp_catalog_synced_at",
  BIOMETRIC_LOCK: "flash_erp_biometric_lock"
} as const;

export type OperationMode = "ONLINE" | "OFFLINE" | "AUTO";

export const DEFAULT_SERVER_URL = "http://84.247.188.30:3000";

// Failed writes must shadow persistent storage, even if a later read succeeds
// with null or an older value (e.g. an oversized permission snapshot). A null
// tombstone also prevents a failed delete from resurrecting a signed-out user.
const memoryStore = new Map<string, string | null>();

async function setItem(key: string, value: string): Promise<void> {
  memoryStore.set(key, value);
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined" || !window.localStorage) return;
      window.localStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
    memoryStore.delete(key);
  } catch {
    // Keep the in-memory override for this app run.
  }
}

async function getItem(key: string): Promise<string | null> {
  if (memoryStore.has(key)) return memoryStore.get(key) ?? null;
  try {
    if (Platform.OS === "web") {
      return typeof window !== "undefined" ? window.localStorage?.getItem(key) ?? null : null;
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function deleteItem(key: string): Promise<void> {
  memoryStore.set(key, null);
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined" || !window.localStorage) return;
      window.localStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
    memoryStore.delete(key);
  } catch {
    // Keep the tombstone so a subsequent read cannot restore stale credentials.
  }
}

// Session changes drive protected navigation, including expiry on any screen.
const sessionListeners = new Set<() => void>();
let sessionVersion = 0;
let sessionMessage: string | null = null;
function notifySessionChange() { for (const listener of sessionListeners) listener(); }

export const mobileStorage = {
  getSessionVersion(): number { return sessionVersion; },
  getSessionMessage(): string | null { return sessionMessage; },
  subscribeSessionChanges(listener: () => void): () => void {
    sessionListeners.add(listener);
    return () => { sessionListeners.delete(listener); };
  },
  // Server URL
  async getServerUrl(): Promise<string> {
    const stored = await getItem(KEYS.SERVER_URL);
    return (stored?.trim() || DEFAULT_SERVER_URL).replace(/\/+$/, "");
  },
  async setServerUrl(url: string): Promise<void> {
    await setItem(KEYS.SERVER_URL, url.trim().replace(/\/+$/, ""));
  },

  // Auth Token
  async getAuthToken(): Promise<string | null> {
    return await getItem(KEYS.AUTH_TOKEN);
  },
  async setAuthToken(token: string): Promise<void> {
    await setItem(KEYS.AUTH_TOKEN, token.trim());
  },
  async clearAuthToken(): Promise<void> {
    await deleteItem(KEYS.AUTH_TOKEN);
  },

  // User Profile Snapshot
  async getUserSnapshot<T = unknown>(): Promise<T | null> {
    const raw = await getItem(KEYS.USER_SNAPSHOT);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  async setUserSnapshot(snapshot: unknown): Promise<void> {
    await setItem(KEYS.USER_SNAPSHOT, JSON.stringify(snapshot));
    sessionMessage = null;
    notifySessionChange();
  },
  async clearUserSnapshot(): Promise<void> {
    await deleteItem(KEYS.USER_SNAPSHOT);
  },

  // Operation Mode (ONLINE | OFFLINE | AUTO)
  async getOperationMode(): Promise<OperationMode> {
    const mode = await getItem(KEYS.OPERATION_MODE);
    if (mode === "OFFLINE" || mode === "ONLINE" || mode === "AUTO") {
      return mode;
    }
    return "AUTO";
  },
  async setOperationMode(mode: OperationMode): Promise<void> {
    await setItem(KEYS.OPERATION_MODE, mode);
  },

  async getBiometricLockEnabled(): Promise<boolean> { return (await getItem(KEYS.BIOMETRIC_LOCK)) === "true"; },
  async setBiometricLockEnabled(enabled: boolean): Promise<void> { await setItem(KEYS.BIOMETRIC_LOCK, String(enabled)); },

  async getCatalogSyncedAt(): Promise<string | null> { return await getItem(KEYS.CATALOG_SYNCED_AT); },
  async setCatalogSyncedAt(value: string): Promise<void> { await setItem(KEYS.CATALOG_SYNCED_AT, value); },

  async getLastReceipt<T = unknown>(): Promise<T | null> {
    const raw = await getItem(KEYS.LAST_RECEIPT);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  },
  async setLastReceipt(receipt: unknown): Promise<void> { await setItem(KEYS.LAST_RECEIPT, JSON.stringify(receipt)); },

  async getPosCart<T = unknown>(): Promise<T | null> {
    const raw = await getItem(KEYS.POS_CART);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  },
  async setPosCart(cart: unknown): Promise<void> { await setItem(KEYS.POS_CART, JSON.stringify(cart)); },
  async clearPosCart(): Promise<void> { await deleteItem(KEYS.POS_CART); },

  async getTenderMethods<T = unknown>(): Promise<T | null> {
    const raw = await getItem(KEYS.TENDER_METHODS);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  },
  async setTenderMethods(tenders: unknown): Promise<void> {
    await setItem(KEYS.TENDER_METHODS, JSON.stringify(tenders));
  },

  // Full Session Logout
  async clearAllSession(message: string | null = null): Promise<void> {
    sessionVersion += 1;
    sessionMessage = message;
    await deleteItem(KEYS.AUTH_TOKEN);
    await deleteItem(KEYS.USER_SNAPSHOT);
    notifySessionChange();
  }
};
