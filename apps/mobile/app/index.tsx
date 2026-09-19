import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { mobileTheme } from "../lib/mobile-theme";
import { HeaderStatusBar } from "../components/HeaderStatusBar";
import { mobileStorage } from "../lib/mobile-storage";
import { mobileOfflineDb } from "../lib/mobile-offline-db";
import { mobileApi, type MobileUserSession } from "../lib/mobile-api";

export default function DashboardScreen() {
  const [user, setUser] = useState<MobileUserSession | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [cachedProductsCount, setCachedProductsCount] = useState<number>(0);
  const [outboxPendingCount, setOutboxPendingCount] = useState<number>(0);

  const loadDashboard = async () => {
    try {
      const sessionRes = await mobileApi.fetchSession();
      if (sessionRes.ok && sessionRes.data) {
        setUser(sessionRes.data);
      } else {
        const cached = await mobileStorage.getUserSnapshot<MobileUserSession>();
        setUser(cached);
      }

      const stats = await mobileOfflineDb.getOutboxStats();
      setOutboxPendingCount(stats.pending + stats.failed);

      const prods = await mobileOfflineDb.searchProducts("", 1000);
      setCachedProductsCount(prods.length);
    } catch (error) {
      // Mount-time failures must degrade gracefully, never crash the release app.
      console.warn("[flash-erp:mobile] Dashboard refresh failed.", error);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  const navigateTo = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as any);
  };

  const handleSignOut = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await mobileApi.signOut();
    setUser(null);
    router.push("/login");
  };

  return (
    <View style={styles.container}>
      {/* Persistent Online/Offline Status Pill & Sync Bar */}
      <HeaderStatusBar onSyncComplete={loadDashboard} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* User Identity & Store Header */}
        <View style={styles.operatorCard}>
          <View style={styles.operatorInfo}>
            <View style={styles.avatarPill}>
              <Ionicons name="person" size={20} color="#ffffff" />
            </View>
            <View style={styles.operatorDetails}>
              <Text style={styles.operatorName}>
                {user?.displayName || "Guest Operator"}
              </Text>
              <Text style={styles.operatorStore}>
                {user?.homeStoreName || "Accra Central Store"} • {user?.loginId || "Tap to sign in"}
              </Text>
            </View>
          </View>

          {user ? (
            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={18} color={mobileTheme.danger} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.signInPill}
              onPress={() => router.push("/login")}
            >
              <Text style={styles.signInPillText}>Sign In</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Metrics Bar */}
        <View style={styles.metricsRow}>
          <TouchableOpacity
            style={styles.metricCard}
            onPress={() => navigateTo("/scanner")}
          >
            <Ionicons name="cube-outline" size={20} color={mobileTheme.primary} />
            <Text style={styles.metricNumber}>{cachedProductsCount}</Text>
            <Text style={styles.metricLabel}>Offline Products</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.metricCard}
            onPress={() => navigateTo("/outbox")}
          >
            <Ionicons
              name="cloud-upload-outline"
              size={20}
              color={outboxPendingCount > 0 ? mobileTheme.warning : mobileTheme.accent}
            />
            <Text
              style={[
                styles.metricNumber,
                { color: outboxPendingCount > 0 ? mobileTheme.warning : mobileTheme.accent }
              ]}
            >
              {outboxPendingCount}
            </Text>
            <Text style={styles.metricLabel}>Outbox Pending</Text>
          </TouchableOpacity>
        </View>

        {/* Section 1: Warehouse & Store Floor */}
        <Text style={styles.sectionTitle}>Warehouse & Store Floor</Text>
        <View style={styles.gridTwoColumns}>
          {/* Stock Lookup */}
          <TouchableOpacity
            style={styles.tileCard}
            onPress={() => navigateTo("/scanner")}
            activeOpacity={0.8}
          >
            <View style={[styles.tileIcon, { backgroundColor: mobileTheme.primary }]}>
              <Ionicons name="barcode-outline" size={24} color="#ffffff" />
            </View>
            <Text style={styles.tileTitle}>Stock & Barcode</Text>
            <Text style={styles.tileDesc}>Live & offline lookup</Text>
          </TouchableOpacity>

          {/* Cycle Counts */}
          <TouchableOpacity
            style={styles.tileCard}
            onPress={() => navigateTo("/stock-count")}
            activeOpacity={0.8}
          >
            <View style={[styles.tileIcon, { backgroundColor: mobileTheme.accent }]}>
              <Ionicons name="clipboard-outline" size={24} color="#ffffff" />
            </View>
            <Text style={styles.tileTitle}>Cycle Count</Text>
            <Text style={styles.tileDesc}>Shelf audits & take</Text>
          </TouchableOpacity>

          {/* Goods Receiving */}
          <TouchableOpacity
            style={styles.tileCard}
            onPress={() => navigateTo("/goods-receipt")}
            activeOpacity={0.8}
          >
            <View style={[styles.tileIcon, { backgroundColor: "#0284c7" }]}>
              <Ionicons name="cube-outline" size={24} color="#ffffff" />
            </View>
            <Text style={styles.tileTitle}>Goods Receiving</Text>
            <Text style={styles.tileDesc}>PO check & GRN</Text>
          </TouchableOpacity>

          {/* Inter-Store Transfers */}
          <TouchableOpacity
            style={styles.tileCard}
            onPress={() => navigateTo("/transfers")}
            activeOpacity={0.8}
          >
            <View style={[styles.tileIcon, { backgroundColor: "#8b5cf6" }]}>
              <Ionicons name="swap-horizontal-outline" size={24} color="#ffffff" />
            </View>
            <Text style={styles.tileTitle}>Transfers</Text>
            <Text style={styles.tileDesc}>Dispatch & receive</Text>
          </TouchableOpacity>
        </View>

        {/* Section 2: Retail Sales & Fuel Operations */}
        <Text style={styles.sectionTitle}>Retail POS & Field Operations</Text>
        <View style={styles.gridTwoColumns}>
          {/* Assisted Selling */}
          <TouchableOpacity
            style={styles.tileCard}
            onPress={() => navigateTo("/cart")}
            activeOpacity={0.8}
          >
            <View style={[styles.tileIcon, { backgroundColor: "#10b981" }]}>
              <Ionicons name="cart-outline" size={24} color="#ffffff" />
            </View>
            <Text style={styles.tileTitle}>Floor Sales POS</Text>
            <Text style={styles.tileDesc}>Baskets & layaway</Text>
          </TouchableOpacity>

          {/* Fuel Operations */}
          <TouchableOpacity
            style={styles.tileCard}
            onPress={() => navigateTo("/fuel-operations")}
            activeOpacity={0.8}
          >
            <View style={[styles.tileIcon, { backgroundColor: "#ea580c" }]}>
              <Ionicons name="water-outline" size={24} color="#ffffff" />
            </View>
            <Text style={styles.tileTitle}>Fuel Operations</Text>
            <Text style={styles.tileDesc}>Dips & pump meters</Text>
          </TouchableOpacity>
        </View>

        {/* Section 3: Management & Self-Service */}
        <Text style={styles.sectionTitle}>Management & Self-Service</Text>
        <View style={styles.gridTwoColumns}>
          {/* Manager Approvals */}
          <TouchableOpacity
            style={styles.tileCard}
            onPress={() => navigateTo("/approvals")}
            activeOpacity={0.8}
          >
            <View style={[styles.tileIcon, { backgroundColor: "#0f172a" }]}>
              <Ionicons name="shield-checkmark-outline" size={24} color="#ffffff" />
            </View>
            <Text style={styles.tileTitle}>Approvals & KPIs</Text>
            <Text style={styles.tileDesc}>Authorize POs & leave</Text>
          </TouchableOpacity>

          {/* HR Self-Service */}
          <TouchableOpacity
            style={styles.tileCard}
            onPress={() => navigateTo("/self-service")}
            activeOpacity={0.8}
          >
            <View style={[styles.tileIcon, { backgroundColor: "#ec4899" }]}>
              <Ionicons name="finger-print-outline" size={24} color="#ffffff" />
            </View>
            <Text style={styles.tileTitle}>HR & Attendance</Text>
            <Text style={styles.tileDesc}>Clock-in & claims</Text>
          </TouchableOpacity>
        </View>

        {/* System & Outbox Links */}
        <View style={styles.systemBar}>
          <TouchableOpacity
            style={styles.systemBarItem}
            onPress={() => navigateTo("/outbox")}
          >
            <Ionicons name="sync-outline" size={18} color={mobileTheme.warning} />
            <Text style={styles.systemBarText}>Outbox Queue ({outboxPendingCount})</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.systemBarItem}
            onPress={() => navigateTo("/login")}
          >
            <Ionicons name="server-outline" size={18} color={mobileTheme.primary} />
            <Text style={styles.systemBarText}>Server Config</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: mobileTheme.screenBackground
  },
  scrollContent: {
    padding: 16,
    gap: 14
  },
  operatorCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: mobileTheme.surfaceBackground,
    borderRadius: mobileTheme.radiusLarge,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    padding: 14,
    ...mobileTheme.shadowSmall
  },
  operatorInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  avatarPill: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: mobileTheme.primary,
    justifyContent: "center",
    alignItems: "center"
  },
  operatorDetails: {
    gap: 2
  },
  operatorName: {
    fontSize: 16,
    fontWeight: "800",
    color: mobileTheme.textColor
  },
  operatorStore: {
    fontSize: 12,
    color: mobileTheme.mutedText
  },
  signOutButton: {
    padding: 8
  },
  signInPill: {
    backgroundColor: mobileTheme.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: mobileTheme.radiusPill
  },
  signInPillText: {
    color: mobileTheme.primary,
    fontSize: 12,
    fontWeight: "700"
  },
  metricsRow: {
    flexDirection: "row",
    gap: 12
  },
  metricCard: {
    flex: 1,
    backgroundColor: mobileTheme.surfaceBackground,
    borderRadius: mobileTheme.radiusLarge,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    padding: 14,
    alignItems: "center",
    gap: 4,
    ...mobileTheme.shadowSmall
  },
  metricNumber: {
    fontSize: 22,
    fontWeight: "900",
    color: mobileTheme.textColor
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: mobileTheme.mutedText,
    textTransform: "uppercase"
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: mobileTheme.mutedText,
    marginTop: 4
  },
  gridTwoColumns: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  tileCard: {
    width: "48%",
    backgroundColor: mobileTheme.surfaceBackground,
    borderRadius: mobileTheme.radiusLarge,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    padding: 14,
    gap: 6,
    ...mobileTheme.shadowSmall
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4
  },
  tileTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: mobileTheme.textColor
  },
  tileDesc: {
    fontSize: 12,
    color: mobileTheme.softText
  },
  systemBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: mobileTheme.surfaceBackground,
    borderRadius: mobileTheme.radiusLarge,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    padding: 12,
    marginTop: 6
  },
  systemBarItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8
  },
  systemBarText: {
    fontSize: 13,
    fontWeight: "700",
    color: mobileTheme.textColor
  }
});
