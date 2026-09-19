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
import { canOpenMobileRoute } from "../lib/mobile-access";

export default function DashboardScreen() {
  const [user, setUser] = useState<MobileUserSession | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [cachedProductsCount, setCachedProductsCount] = useState<number>(0);
  const [outboxPendingCount, setOutboxPendingCount] = useState<number>(0);
  const [analytics, setAnalytics] = useState<{ salesTotal: number; transactionCount: number; averageBasket: number; pendingApprovals: number; trend: Array<{ date: string; total: number }>; topProducts: Array<{ productName: string; quantity: number; sales: number }> } | null>(null);

  const loadDashboard = async () => {
    try {
      const sessionRes = await mobileApi.fetchSession();
      if (sessionRes.ok && sessionRes.data) {
        setUser(sessionRes.data);
      } else {
        const cached = await mobileStorage.getUserSnapshot<MobileUserSession>();
        setUser(cached);
      }

      if (!await mobileStorage.getAuthToken()) return;
      const dashboard = await mobileApi.fetchDashboardAnalytics();
      setAnalytics(dashboard.ok && dashboard.data ? dashboard.data : null);
      setAnalyticsError(dashboard.ok ? null : dashboard.error || "Sales analytics are unavailable.");

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
    // Protected navigation removes authenticated screens immediately.
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
                {user ? (user.homeStoreName || "No shop assigned") : "Sign in to continue"} • {user?.loginId || "Guest"}
              </Text>
            </View>
          </View>

          {user ? (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Sign out" style={styles.signOutButton} onPress={handleSignOut}>
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

        {analyticsError && canOpenMobileRoute(user, "cart") && <Text accessibilityRole="alert" style={{ color: mobileTheme.mutedText }}>{analyticsError}</Text>}
        {analytics && canOpenMobileRoute(user, "cart") && <View style={styles.analyticsCard}>
          <View style={styles.analyticsHeader}><View><Text style={styles.analyticsEyebrow}>TODAY AT YOUR SHOP</Text><Text style={styles.analyticsTotal}>GHS {analytics.salesTotal.toFixed(2)}</Text></View><View style={styles.livePill}><View style={styles.liveDot}/><Text style={styles.liveText}>LIVE</Text></View></View>
          <View style={styles.analyticsMetrics}><View><Text style={styles.analyticsMetricValue}>{analytics.transactionCount}</Text><Text style={styles.analyticsMetricLabel}>Transactions</Text></View><View><Text style={styles.analyticsMetricValue}>GHS {analytics.averageBasket.toFixed(2)}</Text><Text style={styles.analyticsMetricLabel}>Average basket</Text></View>{analytics.pendingApprovals > 0 && <View><Text style={styles.analyticsMetricValue}>{analytics.pendingApprovals}</Text><Text style={styles.analyticsMetricLabel}>Approvals</Text></View>}</View>
          <View style={styles.chart}>{analytics.trend.map((day) => { const max = Math.max(...analytics.trend.map((item) => item.total), 1); return <View key={day.date} style={styles.chartColumn}><View style={[styles.chartBar, { height: Math.max(4, (day.total / max) * 54) }]}/><Text style={styles.chartLabel}>{new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined,{weekday:"short"}).slice(0,1)}</Text></View>; })}</View>
          {analytics.topProducts.length > 0 && <View style={styles.topProducts}><Text style={styles.analyticsEyebrow}>TOP PRODUCTS · 7 DAYS</Text>{analytics.topProducts.slice(0,3).map((product,index)=><View key={`${product.productName}-${index}`} style={styles.topProductRow}><Text style={styles.topRank}>{index+1}</Text><Text style={styles.topName} numberOfLines={1}>{product.productName}</Text><Text style={styles.topQty}>{product.quantity} sold</Text></View>)}</View>}
        </View>}

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

        {user?.homeStoreCode ? (<>
        {/* Section 1: Warehouse & Store Floor */}
        <Text style={styles.sectionTitle}>Warehouse & Store Floor</Text>
        <View style={styles.gridTwoColumns}>
          {/* Stock Lookup */}
          <TouchableOpacity
            style={[styles.tileCard, !canOpenMobileRoute(user, "scanner") && styles.hidden]}
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
            style={[styles.tileCard, !canOpenMobileRoute(user, "stock-count") && styles.hidden]}
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
            style={[styles.tileCard, !canOpenMobileRoute(user, "goods-receipt") && styles.hidden]}
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
            style={[styles.tileCard, !canOpenMobileRoute(user, "transfers") && styles.hidden]}
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
            style={[styles.tileCard, !canOpenMobileRoute(user, "cart") && styles.hidden]}
            onPress={() => navigateTo("/cart")}
            activeOpacity={0.8}
          >
            <View style={[styles.tileIcon, { backgroundColor: "#10b981" }]}>
              <Ionicons name="cart-outline" size={24} color="#ffffff" />
            </View>
            <Text style={styles.tileTitle}>Sales POS</Text>
            <Text style={styles.tileDesc}>Baskets & layaway</Text>
          </TouchableOpacity>

          {/* Fuel Operations */}
          <TouchableOpacity
            style={[styles.tileCard, !canOpenMobileRoute(user, "fuel-operations") && styles.hidden]}
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

        </>) : user ? (
          <View style={styles.noShopCard}>
            <Ionicons name="information-circle-outline" size={24} color={mobileTheme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.noShopTitle}>No shop assigned</Text>
              <Text style={styles.noShopText}>Shop operations are hidden. Ask an administrator to assign your home shop before selling, counting or moving stock.</Text>
            </View>
          </View>
        ) : null}

        {/* Section 3: Management & Self-Service */}
        <Text style={styles.sectionTitle}>Management & Self-Service</Text>
        <View style={styles.gridTwoColumns}>
          {/* Manager Approvals */}
          <TouchableOpacity
            style={[styles.tileCard, !user?.permissionCodes?.some((code) => code.includes("approve")) && styles.hidden]}
            onPress={() => navigateTo("/approvals")}
            activeOpacity={0.8}
          >
            <View style={[styles.tileIcon, { backgroundColor: "#0f172a" }]}>
              <Ionicons name="shield-checkmark-outline" size={24} color="#ffffff" />
            </View>
            <Text style={styles.tileTitle}>Approvals & KPIs</Text>
            <Text style={styles.tileDesc}>Authorize POs & leave</Text>
          </TouchableOpacity>

          {canOpenMobileRoute(user, "returns") && <TouchableOpacity style={styles.tileCard} onPress={() => navigateTo("/returns")} activeOpacity={0.8}><View style={[styles.tileIcon, { backgroundColor: mobileTheme.danger }]}><Ionicons name="return-down-back-outline" size={24} color="#ffffff" /></View><Text style={styles.tileTitle}>Returns</Text><Text style={styles.tileDesc}>Receipt-linked refunds</Text></TouchableOpacity>}

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
            onPress={() => navigateTo("/account")}
          >
            <Ionicons name="server-outline" size={18} color={mobileTheme.primary} />
            <Text style={styles.systemBarText}>My Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      {user && (
        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.bottomNavItem}><Ionicons name="home" size={22} color={mobileTheme.primary} /><Text style={styles.bottomNavActive}>Home</Text></TouchableOpacity>
          {canOpenMobileRoute(user, "cart") && <TouchableOpacity style={styles.bottomNavItem} onPress={() => navigateTo("/cart")}><Ionicons name="cart-outline" size={22} color={mobileTheme.mutedText} /><Text style={styles.bottomNavText}>Sales</Text></TouchableOpacity>}
          <TouchableOpacity style={styles.bottomNavItem} onPress={() => navigateTo("/self-service")}><Ionicons name="person-outline" size={22} color={mobileTheme.mutedText} /><Text style={styles.bottomNavText}>My HR</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomNavItem} onPress={() => navigateTo("/outbox")}><Ionicons name="sync-outline" size={22} color={mobileTheme.mutedText} /><Text style={styles.bottomNavText}>Sync</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomNavItem} onPress={() => navigateTo("/account")}><Ionicons name="person-circle-outline" size={22} color={mobileTheme.mutedText} /><Text style={styles.bottomNavText}>Account</Text></TouchableOpacity>
        </View>
      )}
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
    paddingBottom: 92,
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
  analyticsCard: { padding: 16, gap: 14, borderRadius: mobileTheme.radiusLarge, backgroundColor: mobileTheme.headerBackground },
  analyticsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  analyticsEyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1, color: "#94a3b8" },
  analyticsTotal: { marginTop: 3, fontSize: 26, fontWeight: "900", color: "#ffffff" },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: "#064e3b" }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#34d399" }, liveText: { fontSize: 9, fontWeight: "900", color: "#6ee7b7" },
  analyticsMetrics: { flexDirection: "row", justifyContent: "space-between" }, analyticsMetricValue: { fontSize: 15, fontWeight: "900", color: "#ffffff" }, analyticsMetricLabel: { marginTop: 2, fontSize: 10, color: "#94a3b8" },
  chart: { height: 72, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", borderBottomWidth: 1, borderBottomColor: "#334155" }, chartColumn: { alignItems: "center", justifyContent: "flex-end", height: 70, width: 24 }, chartBar: { width: 12, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: mobileTheme.accent }, chartLabel: { marginTop: 3, fontSize: 9, color: "#94a3b8" },
  topProducts: { gap: 7 }, topProductRow: { flexDirection: "row", alignItems: "center", gap: 8 }, topRank: { width: 18, fontSize: 11, fontWeight: "900", color: "#64748b" }, topName: { flex: 1, fontSize: 12, fontWeight: "700", color: "#e2e8f0" }, topQty: { fontSize: 10, color: "#94a3b8" },
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
  hidden: { display: "none" },
  noShopCard: {
    flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 16,
    borderRadius: mobileTheme.radiusLarge, backgroundColor: mobileTheme.primaryLight
  },
  noShopTitle: { fontSize: 15, fontWeight: "800", color: mobileTheme.textColor },
  noShopText: { marginTop: 3, fontSize: 12, lineHeight: 18, color: mobileTheme.mutedText },
  bottomNav: {
    position: "absolute", left: 0, right: 0, bottom: 0, height: 72,
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    backgroundColor: mobileTheme.surfaceBackground, borderTopWidth: 1, borderTopColor: mobileTheme.borderColor
  },
  bottomNavItem: { flex: 1, alignItems: "center", gap: 3 },
  bottomNavActive: { fontSize: 11, fontWeight: "800", color: mobileTheme.primary },
  bottomNavText: { fontSize: 11, fontWeight: "700", color: mobileTheme.mutedText },
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
