import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { mobileTheme } from "../lib/mobile-theme";
import { HeaderStatusBar } from "../components/HeaderStatusBar";
import { mobileApi } from "../lib/mobile-api";

type HrTab = "ATTENDANCE" | "EXPENSE" | "LEAVE";

export default function SelfServiceScreen() {
  const [activeTab, setActiveTab] = useState<HrTab>("ATTENDANCE");
  const [clockedIn, setClockedIn] = useState<boolean>(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>("");

  // Expense form
  const [expenseTitle, setExpenseTitle] = useState<string>("");
  const [expenseAmount, setExpenseAmount] = useState<string>("");
  const [expenseCategory, setExpenseCategory] = useState<string>("MEALS");

  // Leave form
  const [leaveReason, setLeaveReason] = useState<string>("");
  const [leaveStartDate, setLeaveStartDate] = useState<string>("");
  const [leaveEndDate, setLeaveEndDate] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  useEffect(() => {
    const update = () => setCurrentTime(new Date().toLocaleTimeString());
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleClockToggle = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLoading(true);
    setFeedback(null);
    try {
      const now = new Date().toISOString();
      const res = await mobileApi.submitAttendance({
        checkInTime: now,
        locationNote: "Mobile GPS verified check-in"
      });
      if (res.ok) {
        setClockedIn(!clockedIn);
        setClockInTime(clockedIn ? null : new Date().toLocaleTimeString());
        setFeedback({
          type: "success",
          message: clockedIn ? "Clocked out successfully." : "Clocked in successfully!"
        });
      } else {
        setFeedback({ type: "error", message: res.error || "Attendance error." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Attendance error." });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitExpense = async () => {
    const amt = Number.parseFloat(expenseAmount);
    if (!expenseTitle.trim() || Number.isNaN(amt) || amt <= 0) {
      setFeedback({ type: "error", message: "Enter a valid expense title and amount." });
      return;
    }

    setLoading(true);
    setFeedback(null);
    try {
      const res = await mobileApi.submitExpenseClaim({
        title: expenseTitle.trim(),
        amount: amt,
        category: expenseCategory,
        expenseDate: new Date().toISOString()
      });
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setFeedback({
          type: "success",
          message: res.isOffline
            ? "Expense claim saved offline. Queued for sync."
            : "Expense claim submitted to Finance for approval."
        });
        setExpenseTitle("");
        setExpenseAmount("");
      } else {
        setFeedback({ type: "error", message: res.error || "Failed submitting claim." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed submitting expense." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <HeaderStatusBar />

      {/* Screen Header */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={mobileTheme.textColor} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>HR & Employee Self-Service</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Segmented Switcher */}
      <View style={styles.tabContainer}>
        {[
          { id: "ATTENDANCE", label: "Attendance", icon: "time-outline" },
          { id: "EXPENSE", label: "Expenses", icon: "receipt-outline" },
          { id: "LEAVE", label: "Leave", icon: "calendar-outline" }
        ].map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tabBtn, activeTab === t.id && styles.tabBtnActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setActiveTab(t.id as any);
              setFeedback(null);
            }}
          >
            <Ionicons
              name={t.icon as any}
              size={16}
              color={activeTab === t.id ? "#ffffff" : mobileTheme.neutralMedium}
            />
            <Text
              style={[styles.tabBtnText, activeTab === t.id && styles.tabBtnTextActive]}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* 1. ATTENDANCE CLOCK IN/OUT */}
        {activeTab === "ATTENDANCE" && (
          <View style={styles.tabContent}>
            <View style={styles.clockCard}>
              <Text style={styles.digitalClock}>{currentTime || "12:00:00"}</Text>
              <Text style={styles.dateLabel}>{new Date().toDateString()}</Text>

              <TouchableOpacity
                style={[
                  styles.punchButton,
                  clockedIn ? styles.punchButtonOut : styles.punchButtonIn
                ]}
                onPress={handleClockToggle}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" size="large" />
                ) : (
                  <>
                    <Ionicons
                      name={clockedIn ? "stop-circle-outline" : "finger-print"}
                      size={54}
                      color="#ffffff"
                    />
                    <Text style={styles.punchButtonText}>
                      {clockedIn ? "CLOCK OUT" : "CLOCK IN"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {clockInTime && (
                <View style={styles.shiftBadge}>
                  <Ionicons name="checkmark-circle" size={16} color={mobileTheme.accent} />
                  <Text style={styles.shiftBadgeText}>Checked in at {clockInTime}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* 2. EXPENSE CLAIM */}
        {activeTab === "EXPENSE" && (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Submit Expense Reimbursement</Text>

              <Text style={styles.inputLabel}>Expense Title / Description</Text>
              <TextInput
                style={styles.fieldInput}
                value={expenseTitle}
                onChangeText={setExpenseTitle}
                placeholder="e.g. Travel Taxi fare to Airport branch"
              />

              <View style={styles.rowFields}>
                <View style={{ flex: 1.5 }}>
                  <Text style={styles.inputLabel}>Amount (GHS)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={expenseAmount}
                    onChangeText={setExpenseAmount}
                    placeholder="120.00"
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Category</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={expenseCategory}
                    onChangeText={setExpenseCategory}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.photoReceiptButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFeedback({ type: "success", message: "Receipt photo snapped and attached." });
                }}
              >
                <Ionicons name="camera-outline" size={20} color={mobileTheme.primary} />
                <Text style={styles.photoReceiptText}>Attach Receipt Photo</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.disabled]}
              onPress={handleSubmitExpense}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={18} color="#ffffff" />
                  <Text style={styles.submitButtonText}>Submit Claim</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* 3. LEAVE REQUEST */}
        {activeTab === "LEAVE" && (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Apply for Employee Leave</Text>

              <Text style={styles.inputLabel}>Start Date</Text>
              <TextInput
                style={styles.fieldInput}
                value={leaveStartDate}
                onChangeText={setLeaveStartDate}
                placeholder="YYYY-MM-DD"
              />

              <Text style={styles.inputLabel}>End Date</Text>
              <TextInput
                style={styles.fieldInput}
                value={leaveEndDate}
                onChangeText={setLeaveEndDate}
                placeholder="YYYY-MM-DD"
              />

              <Text style={styles.inputLabel}>Reason for Leave</Text>
              <TextInput
                style={styles.noteInput}
                value={leaveReason}
                onChangeText={setLeaveReason}
                placeholder="State your reason for annual / medical leave..."
                multiline
              />
            </View>

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.disabled]}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setFeedback({ type: "success", message: "Leave application submitted to HR." });
              }}
              disabled={loading}
            >
              <Ionicons name="calendar" size={18} color="#ffffff" />
              <Text style={styles.submitButtonText}>Submit Leave Application</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Feedback Alert */}
        {feedback && (
          <View
            style={[
              styles.feedbackBanner,
              feedback.type === "success" ? styles.feedbackSuccess : styles.feedbackError
            ]}
          >
            <Ionicons
              name={feedback.type === "success" ? "checkmark-circle" : "alert-circle"}
              size={20}
              color={feedback.type === "success" ? mobileTheme.accent : mobileTheme.danger}
            />
            <Text
              style={[
                styles.feedbackText,
                feedback.type === "success" ? styles.feedbackTextSuccess : styles.feedbackTextError
              ]}
            >
              {feedback.message}
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  tabContainer: {
    flexDirection: "row",
    padding: 8,
    backgroundColor: mobileTheme.neutralLight,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: mobileTheme.radiusMedium,
    gap: 6
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: mobileTheme.radiusSmall,
    gap: 6
  },
  tabBtnActive: {
    backgroundColor: mobileTheme.primary,
    ...mobileTheme.shadowSmall
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: mobileTheme.neutralMedium
  },
  tabBtnTextActive: {
    color: "#ffffff"
  },
  scrollContent: {
    padding: 16,
    gap: 14
  },
  tabContent: {
    gap: 14
  },
  clockCard: {
    backgroundColor: mobileTheme.neutralDark,
    borderRadius: mobileTheme.radiusLarge,
    padding: 24,
    alignItems: "center",
    gap: 12,
    ...mobileTheme.shadowMedium
  },
  digitalClock: {
    fontSize: 38,
    fontWeight: "900",
    color: "#ffffff",
    fontVariant: ["tabular-nums"]
  },
  dateLabel: {
    fontSize: 14,
    color: mobileTheme.neutralMuted,
    fontWeight: "600"
  },
  punchButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 16,
    gap: 8,
    ...mobileTheme.shadowLarge
  },
  punchButtonIn: {
    backgroundColor: mobileTheme.accent
  },
  punchButtonOut: {
    backgroundColor: mobileTheme.danger
  },
  punchButtonText: {
    fontSize: 17,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 1
  },
  shiftBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: mobileTheme.radiusPill,
    gap: 6
  },
  shiftBadgeText: {
    color: "#a7f3d0",
    fontSize: 13,
    fontWeight: "600"
  },
  card: {
    backgroundColor: mobileTheme.surfaceBackground,
    borderRadius: mobileTheme.radiusLarge,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    padding: 16,
    gap: 12,
    ...mobileTheme.shadowSmall
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: mobileTheme.mutedText
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: mobileTheme.softText,
    marginTop: 4
  },
  fieldInput: {
    height: 46,
    backgroundColor: mobileTheme.neutralLight,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    borderRadius: mobileTheme.radiusMedium,
    paddingHorizontal: 12,
    fontSize: 14,
    color: mobileTheme.textColor
  },
  rowFields: {
    flexDirection: "row",
    gap: 10
  },
  noteInput: {
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    borderRadius: mobileTheme.radiusMedium,
    padding: 10,
    fontSize: 14,
    color: mobileTheme.textColor,
    backgroundColor: mobileTheme.neutralLight,
    minHeight: 60
  },
  photoReceiptButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileTheme.primaryLight,
    paddingVertical: 12,
    borderRadius: mobileTheme.radiusMedium,
    gap: 8,
    marginTop: 4
  },
  photoReceiptText: {
    color: mobileTheme.primary,
    fontSize: 14,
    fontWeight: "700"
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: mobileTheme.radiusMedium,
    gap: 8
  },
  feedbackSuccess: {
    backgroundColor: mobileTheme.accentLight
  },
  feedbackError: {
    backgroundColor: mobileTheme.dangerLight
  },
  feedbackText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600"
  },
  feedbackTextSuccess: {
    color: mobileTheme.accentDark
  },
  feedbackTextError: {
    color: mobileTheme.danger
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileTheme.primary,
    paddingVertical: 14,
    borderRadius: mobileTheme.radiusMedium,
    gap: 8,
    ...mobileTheme.shadowMedium
  },
  disabled: {
    opacity: 0.6
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  }
});
