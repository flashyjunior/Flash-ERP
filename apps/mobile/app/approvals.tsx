import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { mobileTheme } from "../lib/mobile-theme";
import { HeaderStatusBar } from "../components/HeaderStatusBar";

interface ApprovalItem {
  id: string;
  type: "LEAVE" | "EXPENSE" | "PO";
  title: string;
  requester: string;
  details: string;
  amountOrDays: string;
  date: string;
}

export default function ApprovalsScreen() {
  const [activeFilter, setActiveFilter] = useState<"ALL" | "LEAVE" | "EXPENSE" | "PO">("ALL");
  const [items, setItems] = useState<ApprovalItem[]>([
    {
      id: "LV-102",
      type: "LEAVE",
      title: "Annual Leave (5 Days)",
      requester: "Kofi Mensah (Retail Store)",
      details: "Family travel during annual school break.",
      amountOrDays: "5 Days",
      date: "2026-09-22 to 2026-09-27"
    },
    {
      id: "EXP-89",
      type: "EXPENSE",
      title: "Generator Diesel Fuel Refill",
      requester: "Kwame Boateng (Station Ops)",
      details: "Emergency generator run during power grid outage. Receipt attached.",
      amountOrDays: "GHS 1,450.00",
      date: "Today, 10:30 AM"
    },
    {
      id: "PO-2026-088",
      type: "PO",
      title: "Purchase Order: Unilever Ghana",
      requester: "Procurement Officer",
      details: "Stock replenishment: 20 Cartons Omo 500g, 40 Cartons Geisha Soap.",
      amountOrDays: "GHS 8,920.00",
      date: "Yesterday"
    }
  ]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleAction = (id: string, action: "APPROVED" | "REJECTED") => {
    if (action === "APPROVED") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setFeedback(`Item ${id} authorized successfully!`);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setFeedback(`Item ${id} rejected.`);
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const filteredItems = items.filter((i) => activeFilter === "ALL" || i.type === activeFilter);

  return (
    <View style={styles.container}>
      <HeaderStatusBar />

      {/* Screen Header */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={mobileTheme.textColor} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manager Approvals & KPIs</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Executive KPI Banner */}
        <View style={styles.kpiCard}>
          <Text style={styles.kpiTitle}>Executive Performance Snapshot</Text>
          <View style={styles.kpiGrid}>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiNum}>GHS 48,250</Text>
              <Text style={styles.kpiLabel}>Today's Net Sales</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={[styles.kpiNum, { color: mobileTheme.warning }]}>{items.length}</Text>
              <Text style={styles.kpiLabel}>Pending Actions</Text>
            </View>
          </View>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          {[
            { id: "ALL", label: `All (${items.length})` },
            { id: "LEAVE", label: "Leave" },
            { id: "EXPENSE", label: "Expenses" },
            { id: "PO", label: "POs" }
          ].map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterPill, activeFilter === f.id && styles.filterPillActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setActiveFilter(f.id as any);
              }}
            >
              <Text
                style={[
                  styles.filterPillText,
                  activeFilter === f.id && styles.filterPillTextActive
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Feedback Alert */}
        {feedback && (
          <View style={styles.feedbackBanner}>
            <Ionicons name="checkmark-circle" size={18} color={mobileTheme.accent} />
            <Text style={styles.feedbackText}>{feedback}</Text>
          </View>
        )}

        {/* Pending Items List */}
        {filteredItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-done-circle-outline" size={54} color={mobileTheme.accent} />
            <Text style={styles.emptyTitle}>Queue Clear</Text>
            <Text style={styles.emptySubtitle}>No pending approvals awaiting authorization.</Text>
          </View>
        ) : (
          filteredItems.map((item) => (
            <View key={item.id} style={styles.approvalCard}>
              <View style={styles.cardHeader}>
                <View
                  style={[
                    styles.typeBadge,
                    {
                      backgroundColor:
                        item.type === "EXPENSE"
                          ? mobileTheme.primaryLight
                          : item.type === "PO"
                          ? mobileTheme.warningLight
                          : mobileTheme.accentLight
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.typeBadgeText,
                      {
                        color:
                          item.type === "EXPENSE"
                            ? mobileTheme.primaryDark
                            : item.type === "PO"
                            ? "#b45309"
                            : mobileTheme.accentDark
                      }
                    ]}
                  >
                    {item.type}
                  </Text>
                </View>
                <Text style={styles.amountText}>{item.amountOrDays}</Text>
              </View>

              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.requesterText}>By: {item.requester}</Text>
              <Text style={styles.detailsText}>{item.details}</Text>
              <Text style={styles.dateText}>Requested: {item.date}</Text>

              {/* Action Buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => handleAction(item.id, "REJECTED")}
                >
                  <Ionicons name="close-circle-outline" size={18} color={mobileTheme.danger} />
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => handleAction(item.id, "APPROVED")}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
                  <Text style={styles.approveBtnText}>Authorize</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
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
  scrollContent: {
    padding: 16,
    gap: 14
  },
  kpiCard: {
    backgroundColor: mobileTheme.neutralDark,
    borderRadius: mobileTheme.radiusLarge,
    padding: 18,
    gap: 12,
    ...mobileTheme.shadowMedium
  },
  kpiTitle: {
    color: mobileTheme.neutralMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  kpiGrid: {
    flexDirection: "row",
    gap: 12
  },
  kpiBox: {
    flex: 1,
    backgroundColor: "#1e293b",
    padding: 14,
    borderRadius: mobileTheme.radiusMedium,
    gap: 4
  },
  kpiNum: {
    fontSize: 20,
    fontWeight: "900",
    color: "#ffffff"
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: mobileTheme.neutralMuted
  },
  filterRow: {
    flexDirection: "row",
    gap: 8
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: mobileTheme.radiusPill,
    backgroundColor: mobileTheme.neutralLight,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor
  },
  filterPillActive: {
    backgroundColor: mobileTheme.primary,
    borderColor: mobileTheme.primary
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: mobileTheme.neutralMedium
  },
  filterPillTextActive: {
    color: "#ffffff"
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: mobileTheme.accentLight,
    padding: 12,
    borderRadius: mobileTheme.radiusMedium,
    gap: 8
  },
  feedbackText: {
    color: mobileTheme.accentDark,
    fontSize: 13,
    fontWeight: "700"
  },
  emptyCard: {
    alignItems: "center",
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
    color: mobileTheme.mutedText
  },
  approvalCard: {
    backgroundColor: mobileTheme.surfaceBackground,
    borderRadius: mobileTheme.radiusLarge,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    padding: 16,
    gap: 10,
    ...mobileTheme.shadowSmall
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: mobileTheme.radiusSmall
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "800"
  },
  amountText: {
    fontSize: 16,
    fontWeight: "900",
    color: mobileTheme.textColor
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: mobileTheme.textColor
  },
  requesterText: {
    fontSize: 12,
    fontWeight: "600",
    color: mobileTheme.mutedText
  },
  detailsText: {
    fontSize: 13,
    color: mobileTheme.softText,
    lineHeight: 18
  },
  dateText: {
    fontSize: 11,
    color: mobileTheme.neutralMuted
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6
  },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: mobileTheme.radiusMedium,
    backgroundColor: mobileTheme.dangerLight,
    gap: 6
  },
  rejectBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: mobileTheme.danger
  },
  approveBtn: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: mobileTheme.radiusMedium,
    backgroundColor: mobileTheme.accent,
    gap: 6
  },
  approveBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff"
  }
});
