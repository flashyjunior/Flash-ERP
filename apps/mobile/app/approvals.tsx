import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { mobileTheme } from "../lib/mobile-theme";
import { HeaderStatusBar } from "../components/HeaderStatusBar";
import { BottomNavBar } from "../components/BottomNavBar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileApi } from "../lib/mobile-api";
import { mobileStorage } from "../lib/mobile-storage";

type Tab = "leave" | "expenses";

interface LeaveItem {
  id: string;
  requestNo: string;
  employeeName: string;
  employeeNo: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  requestedDays: number;
  reason: string | null;
  status: string;
  submittedAt: string;
}

interface ExpenseItem {
  id: string;
  claimNo: string;
  employeeName: string;
  employeeNo: string;
  claimDate: string;
  purpose: string;
  totalAmount: number;
  currencyCode: string;
  status: string;
  lineCount: number;
  submittedAt: string | null;
}

export default function ApprovalsScreen() {
  const insets = useSafeAreaInsets();
  const goHome = () => { try { router.dismissTo("/"); } catch { router.replace("/"); } };
  const [tab, setTab] = useState<Tab>("leave");
  const [leave, setLeave] = useState<LeaveItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [armed, setArmed] = useState<{ id: string; action: "APPROVE" | "REJECT" } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const mode = await mobileStorage.getOperationMode().catch(() => "AUTO" as const);
    setOfflineMode(mode === "OFFLINE");
    const response = await mobileApi.fetchPendingApprovals();
    if (response.ok && response.data) {
      setLeave(response.data.leave);
      setExpenses(response.data.expenses);
      if (response.data.leave.length === 0 && response.data.expenses.length > 0) setTab("expenses");
    } else {
      setError(response.error || "Could not load pending approvals.");
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  // Two-tap confirmation: the first tap arms the decision (button relabels to
  // "Confirm …"), the second tap writes it to HQ. No native dialog, so the flow
  // behaves identically on Android, iOS and web.
  const tapDecision = (
    kind: Tab,
    item: LeaveItem | ExpenseItem,
    action: "APPROVE" | "REJECT"
  ) => {
    if (action === "REJECT" && !note.trim()) {
      setFeedback({ type: "error", message: "Enter a rejection reason in the note field first." });
      return;
    }
    if (armed?.id === item.id && armed.action === action) {
      setArmed(null);
      void decide(kind, item, action, note.trim());
    } else {
      setArmed({ id: item.id, action });
    }
  };

  const decide = async (
    kind: Tab,
    item: LeaveItem | ExpenseItem,
    action: "APPROVE" | "REJECT",
    decisionNote: string
  ) => {
    setDecidingId(item.id);
    setFeedback(null);
    try {
      const response =
        kind === "leave"
          ? await mobileApi.decideLeaveRequest({ leaveRequestId: item.id, action, note: decisionNote || undefined })
          : await mobileApi.decideExpenseClaim({ expenseClaimId: item.id, action, note: decisionNote || undefined });
      if (response.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const title = kind === "leave" ? (item as LeaveItem).requestNo : (item as ExpenseItem).claimNo;
        setFeedback({
          type: "success",
          message: `${title} ${action === "APPROVE" ? "approved" : "rejected"} at HQ.`,
        });
        if (kind === "leave") setLeave((rows) => rows.filter((row) => row.id !== item.id));
        else setExpenses((rows) => rows.filter((row) => row.id !== item.id));
        setExpandedId(null);
        setNote("");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setFeedback({ type: "error", message: response.error || "HQ rejected this decision." });
      }
    } finally {
      setDecidingId(null);
    }
  };

  const rows = tab === "leave" ? leave : expenses;

  return (
    <View style={styles.container}>
      <HeaderStatusBar />
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to dashboard" onPress={goHome}>
          <Ionicons name="home-outline" size={22} color={mobileTheme.textColor} />
        </TouchableOpacity>
        <Text style={styles.title}>Manager Approvals & KPIs</Text>
      </View>

      {offlineMode && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={18} color={mobileTheme.warning} />
          <Text style={styles.offlineText}>
            Approvals need a live HQ connection — decisions are validated against live HQ state and are never
            queued offline. Switch to AUTO or ONLINE to review.
          </Text>
        </View>
      )}

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === "leave" && styles.tabActive]}
          onPress={() => setTab("leave")}
        >
          <Text style={[styles.tabText, tab === "leave" && styles.tabTextActive]}>
            Leave ({leave.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "expenses" && styles.tabActive]}
          onPress={() => setTab("expenses")}
        >
          <Text style={[styles.tabText, tab === "expenses" && styles.tabTextActive]}>
            Expenses ({expenses.length})
          </Text>
        </TouchableOpacity>
      </View>

      {feedback && (
        <View style={[styles.feedback, feedback.type === "success" ? styles.success : styles.errorBox]}>
          <Text style={feedback.type === "success" ? styles.successText : styles.errorText}>
            {feedback.message}
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={mobileTheme.primary} />
          <Text style={styles.muted}>Loading pending approvals from HQ…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={mobileTheme.danger} />
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => { setLoading(true); void load(); }}>
            <Ionicons name="refresh-outline" size={18} color="#fff" />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : rows.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.center}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Ionicons name="checkmark-done-circle-outline" size={44} color={mobileTheme.accent} />
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.muted}>
            {tab === "leave"
              ? "No leave requests are waiting for a decision."
              : "No expense claims are waiting for a decision."}
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: 110 + Math.max(insets.bottom, 0) }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {tab === "leave"
            ? (rows as LeaveItem[]).map((item) => (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ref}>{item.requestNo}</Text>
                      <Text style={styles.person}>
                        {item.employeeName} · {item.employeeNo}
                      </Text>
                    </View>
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{item.requestedDays} day(s)</Text>
                    </View>
                  </View>
                  <Text style={styles.detail}>
                    {item.leaveTypeName} · {item.startDate} → {item.endDate}
                  </Text>
                  {item.reason && <Text style={styles.reason}>"{item.reason}"</Text>}
                  <Text style={styles.meta}>Submitted {new Date(item.submittedAt).toLocaleString()}</Text>
                  {expandedId === item.id ? (
                    <View style={styles.editor}>
                      <TextInput
                        style={styles.noteInput}
                        value={note}
                        onChangeText={setNote}
                        placeholder="Decision note (required to reject)"
                        placeholderTextColor={mobileTheme.neutralMuted}
                        multiline
                      />
                      <View style={styles.decisionRow}>
                        <TouchableOpacity
                          style={[styles.rejectButton, decidingId === item.id && styles.disabled]}
                          onPress={() => tapDecision("leave", item, "REJECT")}
                          disabled={decidingId === item.id}
                        >
                          {decidingId === item.id ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.decisionText}>
                              {armed?.id === item.id && armed.action === "REJECT" ? "Confirm Reject" : "Reject"}
                            </Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.approveButton, decidingId === item.id && styles.disabled]}
                          onPress={() => tapDecision("leave", item, "APPROVE")}
                          disabled={decidingId === item.id}
                        >
                          {decidingId === item.id ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.decisionText}>
                              {armed?.id === item.id && armed.action === "APPROVE" ? "Confirm Approve" : "Approve"}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity onPress={() => { setExpandedId(null); setNote(""); setArmed(null); }}>
                        <Text style={styles.cancelLink}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.reviewButton}
                      onPress={() => { setExpandedId(item.id); setNote(""); setArmed(null); setFeedback(null); }}
                    >
                      <Text style={styles.reviewText}>Review & Decide</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            : (rows as ExpenseItem[]).map((item) => (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ref}>{item.claimNo}</Text>
                      <Text style={styles.person}>
                        {item.employeeName} · {item.employeeNo}
                      </Text>
                    </View>
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>
                        {item.currencyCode} {item.totalAmount.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.detail}>{item.purpose}</Text>
                  <Text style={styles.meta}>
                    {item.claimDate} · {item.lineCount} line(s)
                    {item.submittedAt ? ` · Submitted ${new Date(item.submittedAt).toLocaleString()}` : ""}
                  </Text>
                  {expandedId === item.id ? (
                    <View style={styles.editor}>
                      <TextInput
                        style={styles.noteInput}
                        value={note}
                        onChangeText={setNote}
                        placeholder="Decision note (required to reject)"
                        placeholderTextColor={mobileTheme.neutralMuted}
                        multiline
                      />
                      <View style={styles.decisionRow}>
                        <TouchableOpacity
                          style={[styles.rejectButton, decidingId === item.id && styles.disabled]}
                          onPress={() => tapDecision("expenses", item, "REJECT")}
                          disabled={decidingId === item.id}
                        >
                          {decidingId === item.id ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.decisionText}>
                              {armed?.id === item.id && armed.action === "REJECT" ? "Confirm Reject" : "Reject"}
                            </Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.approveButton, decidingId === item.id && styles.disabled]}
                          onPress={() => tapDecision("expenses", item, "APPROVE")}
                          disabled={decidingId === item.id}
                        >
                          {decidingId === item.id ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.decisionText}>
                              {armed?.id === item.id && armed.action === "APPROVE" ? "Confirm Approve" : "Approve"}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity onPress={() => { setExpandedId(null); setNote(""); setArmed(null); }}>
                        <Text style={styles.cancelLink}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.reviewButton}
                      onPress={() => { setExpandedId(item.id); setNote(""); setArmed(null); setFeedback(null); }}
                    >
                      <Text style={styles.reviewText}>Review & Decide</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
        </ScrollView>
      )}
      <BottomNavBar active="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mobileTheme.screenBackground },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  title: { color: mobileTheme.textColor, fontSize: 18, fontWeight: "800" },
  offlineBanner: {
    flexDirection: "row", gap: 8, alignItems: "flex-start", marginHorizontal: 16, marginBottom: 10,
    padding: 12, borderRadius: 10, backgroundColor: mobileTheme.warningLight,
  },
  offlineText: { flex: 1, fontSize: 12, lineHeight: 17, color: "#92400e", fontWeight: "600" },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  tab: {
    flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10,
    backgroundColor: mobileTheme.surfaceBackground, borderWidth: 1, borderColor: mobileTheme.borderColor,
  },
  tabActive: { backgroundColor: mobileTheme.primary, borderColor: mobileTheme.primary },
  tabText: { fontWeight: "800", fontSize: 13, color: mobileTheme.mutedText },
  tabTextActive: { color: "#fff" },
  feedback: { marginHorizontal: 16, marginBottom: 10, padding: 10, borderRadius: 8 },
  success: { backgroundColor: mobileTheme.accentLight },
  errorBox: { backgroundColor: mobileTheme.dangerLight },
  successText: { color: mobileTheme.accentDark, fontWeight: "700", fontSize: 13 },
  errorText: { color: mobileTheme.danger, fontWeight: "700", fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  muted: { color: mobileTheme.mutedText, fontSize: 13, textAlign: "center" },
  errorMessage: { color: mobileTheme.danger, fontSize: 13, fontWeight: "600", textAlign: "center", lineHeight: 19 },
  retryButton: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6,
    backgroundColor: mobileTheme.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10,
  },
  retryText: { color: "#fff", fontWeight: "800" },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: mobileTheme.textColor },
  list: { padding: 16, paddingBottom: 32, gap: 12 },
  card: {
    padding: 14, gap: 7, borderRadius: 14, borderWidth: 1, borderColor: mobileTheme.borderColor,
    backgroundColor: mobileTheme.surfaceBackground,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  ref: { fontSize: 15, fontWeight: "900", color: mobileTheme.textColor },
  person: { fontSize: 12, color: mobileTheme.mutedText, marginTop: 2 },
  pill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 16, backgroundColor: mobileTheme.primaryLight },
  pillText: { fontSize: 11, fontWeight: "800", color: mobileTheme.primary },
  detail: { fontSize: 13, fontWeight: "700", color: mobileTheme.textColor },
  reason: { fontSize: 12, fontStyle: "italic", color: mobileTheme.mutedText },
  meta: { fontSize: 11, color: mobileTheme.mutedText },
  reviewButton: {
    alignItems: "center", paddingVertical: 10, borderRadius: 10, marginTop: 4,
    backgroundColor: mobileTheme.primaryLight,
  },
  reviewText: { color: mobileTheme.primary, fontWeight: "800", fontSize: 13 },
  editor: { gap: 8, marginTop: 4 },
  noteInput: {
    minHeight: 64, borderWidth: 1, borderColor: mobileTheme.borderColor, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8, color: mobileTheme.textColor, fontSize: 13,
    backgroundColor: mobileTheme.neutralLight, textAlignVertical: "top",
  },
  decisionRow: { flexDirection: "row", gap: 8 },
  rejectButton: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 10, backgroundColor: mobileTheme.danger },
  approveButton: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 10, backgroundColor: mobileTheme.accent },
  decisionText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  cancelLink: { textAlign: "center", color: mobileTheme.mutedText, fontWeight: "700", fontSize: 12, paddingVertical: 4 },
  disabled: { opacity: 0.6 },
});
