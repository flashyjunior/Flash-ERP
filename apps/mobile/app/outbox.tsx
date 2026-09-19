import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileTheme } from "../lib/mobile-theme";
import { HeaderStatusBar } from "../components/HeaderStatusBar";
import { mobileOfflineDb, type OutboxMutation } from "../lib/mobile-offline-db";
import { mobileApi } from "../lib/mobile-api";

export default function OutboxManagerScreen() {
  const insets = useSafeAreaInsets();
  const [mutations, setMutations] = useState<OutboxMutation[]>([]);
  const [stats, setStats] = useState<{ pending: number; failed: number; synced: number; total: number }>({
    pending: 0,
    failed: 0,
    synced: 0,
    total: 0
  });
  const [syncing, setSyncing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const list = await mobileOfflineDb.getPendingMutations();
      const s = await mobileOfflineDb.getOutboxStats();
      setMutations(list);
      setStats(s);
    } catch (error) {
      console.warn("[flash-erp:mobile] Outbox load failed.", error);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleSyncAll = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSyncing(true);
    setFeedback("Connecting to Enterprise HQ...");
    try {
      const res = await mobileApi.drainOutboxQueue();
      if (res.failed > 0) {
        setFeedback(`Synced ${res.synced} mutations, but ${res.failed} failed.`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        setFeedback(`All ${res.synced} pending mutations synced to HQ!`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      await loadData();
    } catch (err: any) {
      setFeedback(err.message || "Failed syncing outbox.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSyncing(false);
    }
  };

  const handleClearSynced = async () => {
    await mobileOfflineDb.clearSynced();
    await loadData();
    Haptics.selectionAsync();
  };

  const renderMutation = ({ item }: { item: OutboxMutation }) => {
    const isFailed = item.status === "FAILED";
    const isSyncing = item.status === "SYNCING";

    let payloadPreview = "";
    try {
      const parsed = JSON.parse(item.payloadJson);
      payloadPreview = Object.entries(parsed)
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" | ");
    } catch {
      payloadPreview = item.payloadJson.slice(0, 50);
    }

    return (
      <View style={styles.mutationCard}>
        <View style={styles.cardHeader}>
          <View style={styles.entityTag}>
            <Text style={styles.entityText}>{item.entityType}</Text>
          </View>
          <View
            style={[
              styles.statusPill,
              isFailed
                ? styles.statusFailed
                : isSyncing
                ? styles.statusSyncing
                : styles.statusPending
            ]}
          >
            <Text
              style={[
                styles.statusText,
                isFailed
                  ? styles.statusTextFailed
                  : isSyncing
                  ? styles.statusTextSyncing
                  : styles.statusTextPending
              ]}
            >
              {item.status}
            </Text>
          </View>
        </View>

        <Text style={styles.endpointText}>{item.endpoint}</Text>
        <Text style={styles.payloadText} numberOfLines={2}>
          {payloadPreview}
        </Text>

        {item.errorMessage && (
          <View style={styles.errorBox}>
            <Ionicons name="warning-outline" size={14} color={mobileTheme.danger} />
            <Text style={styles.errorBoxText}>{item.errorMessage}</Text>
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.timeText}>Created: {new Date(item.createdAt).toLocaleTimeString()}</Text>
          <Text style={styles.attemptsText}>Attempts: {item.attempts}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <HeaderStatusBar onSyncComplete={loadData} />

      {/* Top Header */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={mobileTheme.textColor} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mobile Outbox Queue</Text>
        <TouchableOpacity style={styles.iconButton} onPress={loadData}>
          <Ionicons name="refresh" size={22} color={mobileTheme.primary} />
        </TouchableOpacity>
      </View>

      {/* Stats Summary Bar */}
      <View style={styles.summaryGrid}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{stats.pending}</Text>
          <Text style={styles.statTitle}>Pending</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: mobileTheme.danger }]}>{stats.failed}</Text>
          <Text style={styles.statTitle}>Failed</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: mobileTheme.accent }]}>{stats.synced}</Text>
          <Text style={styles.statTitle}>Synced</Text>
        </View>
      </View>

      {/* Feedback Banner */}
      {feedback && (
        <View style={styles.feedbackBanner}>
          <Text style={styles.feedbackBannerText}>{feedback}</Text>
        </View>
      )}

      {/* Mutations List */}
      <FlatList
        data={mutations}
        keyExtractor={(item) => item.id}
        renderItem={renderMutation}
        contentContainerStyle={[styles.listContent, { paddingBottom: 24 }]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-done-circle-outline" size={54} color={mobileTheme.accent} />
            <Text style={styles.emptyTitle}>Outbox Clean</Text>
            <Text style={styles.emptySubtitle}>All mobile transactions are synchronized with HQ.</Text>
          </View>
        }
      />

      {/* Bottom Floating Actions */}
      <View style={[styles.footerActions, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.syncAllButton, syncing && styles.syncAllButtonDisabled]}
          onPress={handleSyncAll}
          disabled={syncing || mutations.length === 0}
        >
          {syncing ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <>
              <Ionicons name="cloud-upload" size={18} color="#ffffff" />
              <Text style={styles.syncAllButtonText}>
                Drain & Sync Queue ({stats.pending + stats.failed})
              </Text>
            </>
          )}
        </TouchableOpacity>

        {stats.synced > 0 && (
          <TouchableOpacity style={styles.clearButton} onPress={handleClearSynced}>
            <Text style={styles.clearButtonText}>Clear Synced</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: mobileTheme.screenBackground
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: mobileTheme.surfaceBackground,
    borderBottomWidth: 1,
    borderBottomColor: mobileTheme.borderColor
  },
  backButton: {
    padding: 6
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: mobileTheme.textColor
  },
  iconButton: {
    padding: 6
  },
  summaryGrid: {
    flexDirection: "row",
    backgroundColor: mobileTheme.surfaceBackground,
    borderBottomWidth: 1,
    borderBottomColor: mobileTheme.borderColor,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    backgroundColor: mobileTheme.neutralLight,
    paddingVertical: 10,
    borderRadius: mobileTheme.radiusMedium
  },
  statNum: {
    fontSize: 20,
    fontWeight: "800",
    color: mobileTheme.textColor
  },
  statTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: mobileTheme.mutedText,
    textTransform: "uppercase"
  },
  feedbackBanner: {
    backgroundColor: mobileTheme.primaryLight,
    padding: 10,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: mobileTheme.radiusSmall
  },
  feedbackBannerText: {
    color: mobileTheme.primary,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center"
  },
  listContent: {
    padding: 16,
    gap: 12
  },
  mutationCard: {
    backgroundColor: mobileTheme.surfaceBackground,
    borderRadius: mobileTheme.radiusLarge,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    padding: 14,
    gap: 8,
    ...mobileTheme.shadowSmall
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  entityTag: {
    backgroundColor: mobileTheme.neutralLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: mobileTheme.radiusSmall
  },
  entityText: {
    fontSize: 12,
    fontWeight: "800",
    color: mobileTheme.neutralDark
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: mobileTheme.radiusPill
  },
  statusPending: {
    backgroundColor: mobileTheme.warningLight
  },
  statusSyncing: {
    backgroundColor: mobileTheme.primaryLight
  },
  statusFailed: {
    backgroundColor: mobileTheme.dangerLight
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800"
  },
  statusTextPending: {
    color: "#b45309"
  },
  statusTextSyncing: {
    color: mobileTheme.primary
  },
  statusTextFailed: {
    color: mobileTheme.danger
  },
  endpointText: {
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    color: mobileTheme.mutedText
  },
  payloadText: {
    fontSize: 13,
    color: mobileTheme.softText,
    lineHeight: 18
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: mobileTheme.dangerLight,
    padding: 8,
    borderRadius: mobileTheme.radiusSmall,
    gap: 6
  },
  errorBoxText: {
    fontSize: 12,
    color: mobileTheme.danger,
    fontWeight: "600",
    flex: 1
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: mobileTheme.borderColor,
    paddingTop: 8
  },
  timeText: {
    fontSize: 11,
    color: mobileTheme.mutedText
  },
  attemptsText: {
    fontSize: 11,
    fontWeight: "600",
    color: mobileTheme.neutralMedium
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 10
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: mobileTheme.textColor
  },
  emptySubtitle: {
    fontSize: 14,
    color: mobileTheme.mutedText,
    textAlign: "center"
  },
  footerActions: {
    padding: 16,
    backgroundColor: mobileTheme.surfaceBackground,
    borderTopWidth: 1,
    borderTopColor: mobileTheme.borderColor,
    gap: 10
  },
  syncAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileTheme.primary,
    paddingVertical: 14,
    borderRadius: mobileTheme.radiusMedium,
    gap: 8,
    ...mobileTheme.shadowMedium
  },
  syncAllButtonDisabled: {
    opacity: 0.5
  },
  syncAllButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  },
  clearButton: {
    alignItems: "center",
    paddingVertical: 6
  },
  clearButtonText: {
    color: mobileTheme.neutralMuted,
    fontSize: 13,
    fontWeight: "600"
  }
});
