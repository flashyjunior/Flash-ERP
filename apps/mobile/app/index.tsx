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
import { router, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileTheme } from "../lib/mobile-theme";
import { HeaderStatusBar } from "../components/HeaderStatusBar";
import { BottomNavBar } from "../components/BottomNavBar";
import { mobileStorage } from "../lib/mobile-storage";
import { mobileOfflineDb } from "../lib/mobile-offline-db";
import { mobileApi, type MobileUserSession } from "../lib/mobile-api";
import { canOpenMobileRoute } from "../lib/mobile-access";

export default function DashboardScreen() {
  // Android edge-to-edge (Expo SDK 54+): the system gesture bar overlaps any
  // view pinned to the bottom edge, so the nav must pad for the bottom inset.
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<MobileUserSession | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [cachedProductsCount, setCachedProductsCount] = useState<number>(0);
  const [outboxPendingCount, setOutboxPendingCount] = useState<number>(0);
  const [analytics, setAnalytics] = useState<{ salesTotal: number; transactionCount: number; averageBasket: number; pendingApprovals: number; trend: Array<{ date: string; total: number }>; topProducts: Array<{ productName: string; quantity: number; sales: number }> } | null>(null);
  const [homeFeed, setHomeFeed] = useState<{
    birthdays: Array<{ displayName: string; department: string | null; position: string | null; turns: number; daysUntil: number; dateLabel: string }>;
    attendance: { checkInAt: string | null; checkOutAt: string | null; attendanceStatus: string } | null;
    upcomingLeave: Array<{ requestNo: string; leaveTypeName: string; startDate: string; endDate: string; requestedDays: number; status: string }>;
    recentClaims: Array<{ claimNo: string; purpose: string; totalAmount: number; currencyCode: string; status: string }>;
    pendingApprovals: number;
  } | null>(null);

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

      const feed = await mobileApi.fetchMobileHome();
      setHomeFeed(feed.ok && feed.data ? feed.data : null);
    } catch (error) {
      // Mount-time failures must degrade gracefully, never crash the release app.
      console.warn("[flash-erp:mobile] Dashboard refresh failed.", error);
    }
  };

  const navigation = useNavigation();
  useEffect(() => {
    void loadDashboard();
    // Coming back from a completed sale (or any screen) must refresh the
    // dashboard values immediately, not only on a full remount.
    const unsubscribe = navigation.addListener("focus", () => {
      void loadDashboard();
    });
    return unsubscribe;
  }, [navigation]);

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
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 104 + Math.max(insets.bottom, 0) }]}
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
                {user ? (user.homeStoreName || "Head office & self-service") : "Sign in to continue"} • {user?.loginId || "Guest"}
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

        {/* Quick Metrics Bar — shop operators only; hidden for accounts without a shop. */}
        {user?.homeStoreCode ? (
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
        ) : null}

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
          /* Informative home feed for operators without a shop: company
             birthdays, own leave & attendance — no shop-related empty card. */
          <>
            <Text style={styles.sectionTitle}>Company Pulse</Text>
            {homeFeed?.birthdays && homeFeed.birthdays.length > 0 ? (
              <View style={styles.feedCard}>
                <View style={styles.feedHeader}><Ionicons name="gift-outline" size={18} color="#ec4899" /><Text style={styles.feedTitle}>Upcoming Birthdays</Text></View>
                {homeFeed.birthdays.map((person, index) => (
                  <View key={`${person.displayName}-${index}`} style={styles.feedRow}>
                    <View style={styles.feedAvatar}><Text style={styles.feedAvatarText}>{person.displayName.slice(0, 1)}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.feedRowTitle}>{person.displayName}</Text>
                      <Text style={styles.feedRowMeta}>{[person.position, person.department].filter(Boolean).join(" · ") || "Team member"}</Text>
                    </View>
                    <Text style={styles.feedRowBadge}>{person.daysUntil === 0 ? "Today 🎂" : person.daysUntil === 1 ? "Tomorrow" : `in ${person.daysUntil} days`}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.feedCard}><View style={styles.feedHeader}><Ionicons name="gift-outline" size={18} color="#ec4899" /><Text style={styles.feedTitle}>Upcoming Birthdays</Text></View><Text style={styles.feedEmpty}>No birthdays in the next two weeks.</Text></View>
            )}

            <View style={styles.feedCard}>
              <View style={styles.feedHeader}><Ionicons name="calendar-outline" size={18} color={mobileTheme.primary} /><Text style={styles.feedTitle}>My HR Snapshot</Text></View>
              {homeFeed?.attendance ? (
                <Text style={styles.feedRowTitle}>Today: {homeFeed.attendance.attendanceStatus}{homeFeed.attendance.checkInAt ? ` · in ${new Date(homeFeed.attendance.checkInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}{homeFeed.attendance.checkOutAt ? ` · out ${new Date(homeFeed.attendance.checkOutAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</Text>
              ) : (
                <Text style={styles.feedEmpty}>You have not clocked in today. Use HR & Attendance to clock in.</Text>
              )}
              {homeFeed?.upcomingLeave && homeFeed.upcomingLeave.length > 0 && homeFeed.upcomingLeave.map((leave) => (
                <View key={leave.requestNo} style={styles.feedRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.feedRowTitle}>{leave.leaveTypeName} · {leave.requestedDays} day(s)</Text>
                    <Text style={styles.feedRowMeta}>{leave.startDate} → {leave.endDate}</Text>
                  </View>
                  <Text style={[styles.feedRowBadge, { color: leave.status === "APPROVED" ? mobileTheme.accent : mobileTheme.warning }]}>{leave.status}</Text>
                </View>
              ))}
              {homeFeed?.recentClaims && homeFeed.recentClaims.length > 0 && homeFeed.recentClaims.map((claim) => (
                <View key={claim.claimNo} style={styles.feedRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.feedRowTitle}>{claim.claimNo} · {claim.currencyCode} {claim.totalAmount.toFixed(2)}</Text>
                    <Text style={styles.feedRowMeta} numberOfLines={1}>{claim.purpose}</Text>
                  </View>
                  <Text style={[styles.feedRowBadge, { color: claim.status === "APPROVED" ? mobileTheme.accent : claim.status === "REJECTED" ? mobileTheme.danger : mobileTheme.warning }]}>{claim.status}</Text>
                </View>
              ))}
              {homeFeed?.pendingApprovals ? <Text style={styles.feedRowMeta}>{homeFeed.pendingApprovals} approval(s) waiting — open Approvals & KPIs.</Text> : null}
            </View>
          </>
        ) : null}

        {/* Section 3: Management & Self-Service */}
        <Text style={styles.sectionTitle}>Management & Self-Service</Text>
        <View style={styles.gridTwoColumns}>
          {/* Manager Approvals */}
          <TouchableOpacity
            style={[styles.tileCard, !canOpenMobileRoute(user, "approvals") && styles.hidden]}
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
      {user && <BottomNavBar session={user} active="home" />}
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
  feedCard: {
    backgroundColor: mobileTheme.surfaceBackground, borderRadius: mobileTheme.radiusLarge,
    borderWidth: 1, borderColor: mobileTheme.borderColor, padding: 16, gap: 10, ...mobileTheme.shadowSmall
  },
  feedHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  feedTitle: { fontSize: 14, fontWeight: "800", color: mobileTheme.textColor },
  feedRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: mobileTheme.borderLight },
  feedAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#fce7f3", alignItems: "center", justifyContent: "center" },
  feedAvatarText: { color: "#db2777", fontWeight: "900", fontSize: 14 },
  feedRowTitle: { fontSize: 13, fontWeight: "800", color: mobileTheme.textColor },
  feedRowMeta: { marginTop: 2, fontSize: 11, color: mobileTheme.mutedText },
  feedRowBadge: { fontSize: 11, fontWeight: "800", color: "#db2777" },
  feedEmpty: { fontSize: 12, color: mobileTheme.mutedText },
  bottomNav: {
    position: "absolute", left: 0, right: 0, bottom: 0, minHeight: 64,
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    paddingTop: 10,
    backgroundColor: mobileTheme.surfaceBackground, borderTopWidth: 1, borderTopColor: mobileTheme.borderColor
  },
  bottomNavItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, minHeight: 48, paddingVertical: 4 },
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
