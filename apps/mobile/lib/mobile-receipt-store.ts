/**
 * File-backed last-receipt store.
 *
 * SecureStore (Keychain/Keystore) caps each item at ~2KB, and a sale receipt
 * with several lines easily exceeds that — an oversized write is dropped,
 * which silently broke "Open Last Receipt" and re-printing. The latest sale
 * receipt is therefore persisted as a plain JSON file in the document
 * directory, which has no such limit.
 */

import * as FileSystem from "expo-file-system/legacy";

const RECEIPT_FILE = "flash-erp-last-receipt.json";

export const mobileReceiptStore = {
  filePath(): string | null {
    return FileSystem.documentDirectory ? `${FileSystem.documentDirectory}${RECEIPT_FILE}` : null;
  },

  async saveLastReceipt(receipt: unknown): Promise<void> {
    const path = this.filePath();
    if (!path || !receipt) return;
    try {
      await FileSystem.writeAsStringAsync(path, JSON.stringify(receipt));
    } catch (error) {
      // Diagnostics must never break a completed sale.
      console.warn("[flash-erp:mobile] Failed persisting last receipt.", error);
    }
  },

  async loadLastReceipt<T = unknown>(): Promise<T | null> {
    const path = this.filePath();
    if (!path) return null;
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) return null;
      const raw = await FileSystem.readAsStringAsync(path);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as { lines?: unknown }).lines) && Array.isArray((parsed as { payments?: unknown }).payments)) {
        return parsed as T;
      }
      return null;
    } catch {
      return null;
    }
  },

  async clearLastReceipt(): Promise<void> {
    const path = this.filePath();
    if (!path) return;
    await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
  }
};
