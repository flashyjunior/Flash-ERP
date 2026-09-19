import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { mobileTheme } from "../lib/mobile-theme";
import { mobileStorage, type OperationMode } from "../lib/mobile-storage";
import { mobileOfflineDb } from "../lib/mobile-offline-db";
import { mobileApi } from "../lib/mobile-api";

interface HeaderStatusBarProps {
  onSyncComplete?: () => void;
}

export function HeaderStatusBar({ onSyncComplete }: HeaderStatusBarProps) {
  const [mode, setMode] = useState<OperationMode>("AUTO");
  const [serverUrl, setServerUrl] = useState<string>("");
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [serverAlive, setServerAlive] = useState<boolean | null>(null);
  const [latency, setLatency] = useState<number>(0);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const refreshState = async () => {
    try {
      const currentMode = await mobileStorage.getOperationMode();
      const currentUrl = await mobileStorage.getServerUrl();
      const stats = await mobileOfflineDb.getOutboxStats();
      setMode(currentMode);
      setServerUrl(currentUrl);
      setPendingCount(stats.pending);

      if (currentMode !== "OFFLINE") {
        const ping = await mobileApi.checkServerHealth();
        setServerAlive(ping.ok);
        setLatency(ping.latencyMs);
      } else {
        setServerAlive(false);
      }
    } catch (error) {
      // The status bar must never take the app down on a refresh hiccup.
      console.warn("[flash-erp:mobile] Status bar refresh failed.", error);
    }
  };

  useEffect(() => {
    void refreshState();
    const interval = setInterval(() => {
      void refreshState();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setModalVisible(true);
  };

  const handleSelectMode = async (selected: OperationMode) => {
    Haptics.selectionAsync();
    try {
      await mobileStorage.setOperationMode(selected);
    } catch (error) {
      console.warn("[flash-erp:mobile] Failed persisting operation mode.", error);
    }
    setMode(selected);
    void refreshState();
  };

  const handleTriggerSync = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setSyncing(true);
    setSyncMessage("Syncing outbox to Enterprise HQ...");
    try {
      const res = await mobileApi.drainOutboxQueue();
      if (res.failed > 0) {
        setSyncMessage(`Synced ${res.synced} mutations, ${res.failed} failed.`);
      } else {
        setSyncMessage(`Successfully synced all ${res.synced} mutations!`);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshState();
      onSyncComplete?.();
    } catch (err: any) {
      setSyncMessage(err.message || "Sync failed.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSyncing(false);
    }
  };

  const handleDownloadCatalog = async () => {
    setSyncing(true);
    setSyncMessage("Downloading master product catalog...");
    try {
      const res = await mobileApi.syncCatalogToLocalDb();
      if (res.error) {
        setSyncMessage(`Download failed: ${res.error}`);
      } else {
        setSyncMessage(`Cached ${res.count} products into mobile SQLite.`);
      }
      await refreshState();
    } catch (err: any) {
      setSyncMessage(err.message || "Failed downloading catalog.");
    } finally {
      setSyncing(false);
    }
  };

  const getModeColor = () => {
    if (mode === "OFFLINE") return mobileTheme.warning;
    if (serverAlive) return mobileTheme.accent;
    return mobileTheme.neutralMuted;
  };

  return (
    <>
      <TouchableOpacity
        style={styles.container}
        onPress={handleOpenModal}
        activeOpacity={0.8}
      >
        <View style={styles.leftPill}>
          <View style={[styles.statusDot, { backgroundColor: getModeColor() }]} />
          <Text style={styles.modeText}>
            {mode === "OFFLINE" ? "OFFLINE" : serverAlive ? "HQ ONLINE" : "CONNECTING"}
          </Text>
          {serverAlive && latency > 0 && (
            <Text style={styles.latencyText}>{latency}ms</Text>
          )}
        </View>

        {pendingCount > 0 ? (
          <View style={styles.outboxBadge}>
            <Ionicons name="cloud-upload-outline" size={12} color="#ffffff" />
            <Text style={styles.outboxCount}>{pendingCount} Outbox</Text>
          </View>
        ) : (
          <View style={styles.syncedBadge}>
            <Ionicons name="checkmark-circle-outline" size={12} color={mobileTheme.accent} />
            <Text style={styles.syncedText}>Synced</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Mode & Sync Modal */}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="git-network-outline" size={20} color={mobileTheme.primary} />
                <Text style={styles.modalTitle}>Network & Outbox Sync</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close-circle" size={24} color={mobileTheme.neutralMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionSubtitle}>
              Active Server: <Text style={styles.boldText}>{serverUrl || "http://84.247.188.30:3000"}</Text>
            </Text>

            {/* Mode Switcher */}
            <Text style={styles.modeLabel}>Operation Mode</Text>
            <View style={styles.modeToggleGroup}>
              {(["ONLINE", "OFFLINE", "AUTO"] as OperationMode[]).map((m) => {
                const active = mode === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.modeButton, active && styles.modeButtonActive]}
                    onPress={() => handleSelectMode(m)}
                  >
                    <Text
                      style={[styles.modeButtonText, active && styles.modeButtonTextActive]}
                    >
                      {m}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.modeDescription}>
              {mode === "ONLINE" && "Strictly hits Enterprise HQ API directly. Requires internet."}
              {mode === "OFFLINE" && "Strictly works from local mobile SQLite. All writes queued to outbox."}
              {mode === "AUTO" && "Prefers HQ live. Automatically falls back to offline outbox if offline."}
            </Text>

            {/* Outbox Actions */}
            <View style={styles.actionSection}>
              <TouchableOpacity
                style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
                onPress={handleTriggerSync}
                disabled={syncing}
              >
                <Ionicons name="cloud-upload" size={18} color="#ffffff" />
                <Text style={styles.syncButtonText}>
                  {syncing ? "Syncing..." : `Sync Outbox Now (${pendingCount})`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.catalogButton, syncing && styles.syncButtonDisabled]}
                onPress={handleDownloadCatalog}
                disabled={syncing}
              >
                <Ionicons name="cloud-download-outline" size={18} color={mobileTheme.primary} />
                <Text style={styles.catalogButtonText}>
                  Download Catalog for Offline Use
                </Text>
              </TouchableOpacity>
            </View>

            {syncMessage && (
              <View style={styles.messageBox}>
                <Text style={styles.messageText}>{syncMessage}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: mobileTheme.headerBackground,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b"
  },
  leftPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: mobileTheme.radiusPill,
    gap: 6
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  modeText: {
    color: "#f8fafc",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5
  },
  latencyText: {
    color: mobileTheme.neutralMuted,
    fontSize: 10,
    fontVariant: ["tabular-nums"]
  },
  outboxBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: mobileTheme.warning,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: mobileTheme.radiusPill,
    gap: 5
  },
  outboxCount: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700"
  },
  syncedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#064e3b",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: mobileTheme.radiusPill,
    gap: 4
  },
  syncedText: {
    color: "#a7f3d0",
    fontSize: 11,
    fontWeight: "600"
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: mobileTheme.surfaceBackground,
    borderRadius: mobileTheme.radiusLarge,
    padding: 20,
    gap: 14,
    ...mobileTheme.shadowLarge
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  modalHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: mobileTheme.textColor
  },
  sectionSubtitle: {
    fontSize: 13,
    color: mobileTheme.mutedText
  },
  boldText: {
    fontWeight: "700",
    color: mobileTheme.textColor
  },
  modeLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: mobileTheme.mutedText,
    marginTop: 4
  },
  modeToggleGroup: {
    flexDirection: "row",
    backgroundColor: mobileTheme.neutralLight,
    borderRadius: mobileTheme.radiusMedium,
    padding: 4,
    gap: 4
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: mobileTheme.radiusSmall
  },
  modeButtonActive: {
    backgroundColor: mobileTheme.primary,
    ...mobileTheme.shadowSmall
  },
  modeButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: mobileTheme.neutralMedium
  },
  modeButtonTextActive: {
    color: "#ffffff"
  },
  modeDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: mobileTheme.softText,
    backgroundColor: mobileTheme.neutralLight,
    padding: 10,
    borderRadius: mobileTheme.radiusSmall
  },
  actionSection: {
    gap: 10,
    marginTop: 6
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileTheme.primary,
    paddingVertical: 12,
    borderRadius: mobileTheme.radiusMedium,
    gap: 8
  },
  syncButtonDisabled: {
    opacity: 0.6
  },
  syncButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700"
  },
  catalogButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileTheme.primaryLight,
    paddingVertical: 12,
    borderRadius: mobileTheme.radiusMedium,
    gap: 8
  },
  catalogButtonText: {
    color: mobileTheme.primary,
    fontSize: 14,
    fontWeight: "700"
  },
  messageBox: {
    backgroundColor: mobileTheme.neutralLight,
    padding: 10,
    borderRadius: mobileTheme.radiusSmall
  },
  messageText: {
    fontSize: 12,
    color: mobileTheme.textColor,
    textAlign: "center"
  },
  doneButton: {
    backgroundColor: mobileTheme.neutralDark,
    paddingVertical: 12,
    borderRadius: mobileTheme.radiusMedium,
    alignItems: "center",
    marginTop: 4
  },
  doneButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700"
  }
});
