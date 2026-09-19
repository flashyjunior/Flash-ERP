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

// In-memory fallback for environments without SecureStore (e.g. standard Web preview)
const memoryStore = new Map<string, string>();

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // Fallback to memory
    }
    memoryStore.set(key, value);
    return;
  }

  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    memoryStore.set(key, value);
  }
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // Fallback to memory
    }
    return memoryStore.get(key) ?? null;
  }

  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch {
      // Fallback
    }
    memoryStore.delete(key);
    return;
  }

  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    memoryStore.delete(key);
  }
}

export const mobileStorage = {
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
  async clearAllSession(): Promise<void> {
    await deleteItem(KEYS.AUTH_TOKEN);
    await deleteItem(KEYS.USER_SNAPSHOT);
  }
};
