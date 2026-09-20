import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { mobileTheme } from "../lib/mobile-theme";
import { HeaderStatusBar } from "../components/HeaderStatusBar";
import { BottomNavBar } from "../components/BottomNavBar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileApi } from "../lib/mobile-api";


/**
 * Copy camera / library evidence into the app's document directory so the OS
 * cannot garbage-collect the temporary capture before sync. If the copy fails
 * for any reason we fall back to the original URI (with a warning) rather than
 * silently dropping the photo the operator just took.
 */
async function preserveEvidenceFile(uri: string, prefix: string): Promise<string> {
  try {
    if (!FileSystem.documentDirectory || !uri) return uri;
    const sourceInfo = await FileSystem.getInfoAsync(uri);
    if (!sourceInfo.exists) {
      console.warn("[flash-erp:mobile] Captured evidence file is missing at:", uri);
      return uri;
    }
    const directory = `${FileSystem.documentDirectory}pending-evidence/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const destination = `${directory}${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    await FileSystem.copyAsync({ from: uri, to: destination });
    const copied = await FileSystem.getInfoAsync(destination);
    if (copied.exists) return destination;
    console.warn("[flash-erp:mobile] Evidence copy did not land; using the original capture URI.");
  } catch (error) {
    console.warn("[flash-erp:mobile] Failed preserving evidence file; using original URI.", error);
  }
  return uri;
}

type HrTab = "ATTENDANCE" | "EXPENSE" | "LEAVE";
type LeaveTypeOption = { id: string; code: string; name: string; isPaid: boolean; requiresAttachment: boolean; availableDays: number };
type LeaveHistoryItem = { id: string; requestNo: string; leaveTypeName: string; startDate: string; endDate: string; requestedDays: number; reason: string | null; status: string; attachmentUrl?: string | null };

export default function SelfServiceScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const goHome = () => { try { router.dismissTo("/"); } catch { router.replace("/"); } };
  const [activeTab, setActiveTab] = useState<HrTab>("ATTENDANCE");
  const [clockedIn, setClockedIn] = useState<boolean>(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>("");

  // Expense form
  const [expenseTitle, setExpenseTitle] = useState<string>("");
  const [expenseAmount, setExpenseAmount] = useState<string>("");
  const [expenseCategory, setExpenseCategory] = useState<string>("MEALS");
  const [receiptImageUri, setReceiptImageUri] = useState<string | null>(null);
  const [expenseHistory, setExpenseHistory] = useState<Array<{ id: string; claimNo: string; claimDate: string; purpose: string; totalAmount: number; currencyCode: string; status: string; category: string | null }>>([]);

  // Leave form
  const [leaveReason, setLeaveReason] = useState<string>("");
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOption[]>([]);
  const [selectedLeaveTypeId, setSelectedLeaveTypeId] = useState("");
  const [leaveHistory, setLeaveHistory] = useState<LeaveHistoryItem[]>([]);
  const [cancellingLeaveId, setCancellingLeaveId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [leaveStartDate, setLeaveStartDate] = useState<string>("");
  const [leaveEndDate, setLeaveEndDate] = useState<string>("");
  const [leaveDocumentUri, setLeaveDocumentUri] = useState<string | null>(null);
  const [datePickerField, setDatePickerField] = useState<"start" | "end" | null>(null);

  const selectedLeaveType = leaveTypes.find((type) => type.id === selectedLeaveTypeId) ?? null;
  const requestedLeaveDays = leaveStartDate && leaveEndDate && leaveEndDate >= leaveStartDate
    ? Math.floor((new Date(`${leaveEndDate}T00:00:00Z`).getTime() - new Date(`${leaveStartDate}T00:00:00Z`).getTime()) / 86400000) + 1
    : 0;

  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const loadWorkspace = () => {
    void mobileApi.fetchMyExpenseClaims().then((response) => { if (response.ok && response.data) setExpenseHistory(response.data); });
    void mobileApi.fetchMyLeaveWorkspace().then((response) => {
      if (!response.ok || !response.data) return;
      setLeaveTypes(response.data.leaveTypes);
      setSelectedLeaveTypeId((current) => current || response.data!.leaveTypes[0]?.id || "");
      setLeaveHistory(response.data.requests);
    });
    void mobileApi.fetchMyAttendance().then((response) => {
      if (!response.ok || !response.data) return;
      setClockInTime(response.data.checkInAt ? new Date(response.data.checkInAt).toLocaleTimeString() : null);
      setClockedIn(Boolean(response.data.checkInAt && !response.data.checkOutAt));
    });
  };

  useEffect(() => {
    loadWorkspace();
    const update = () => setCurrentTime(new Date().toLocaleTimeString());
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const captureExpenseReceipt = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setFeedback({ type: "error", message: "Camera permission is required to photograph a receipt." });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.75,
        allowsEditing: true
      });
      if (result.canceled) return;
      const assetUri = result.assets?.[0]?.uri;
      if (!assetUri) {
        setFeedback({ type: "error", message: "The camera did not return a photo. Tap the button and try again." });
        return;
      }
      const stored = await preserveEvidenceFile(assetUri, "expense");
      setReceiptImageUri(stored);
      setFeedback({ type: "success", message: "Receipt photo attached to this claim." });
    } catch (error: any) {
      console.warn("[flash-erp:mobile] Expense receipt capture failed.", error);
      setFeedback({ type: "error", message: error?.message || "The receipt photo could not be attached. Try again." });
    }
  };

  const pickLeaveDocument = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setFeedback({ type: "error", message: "Photo-library permission is required to attach a leave document." });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8
      });
      if (result.canceled) return;
      const assetUri = result.assets?.[0]?.uri;
      if (!assetUri) {
        setFeedback({ type: "error", message: "No photo was selected. Try again." });
        return;
      }
      setLeaveDocumentUri(await preserveEvidenceFile(assetUri, "leave"));
      setFeedback({ type: "success", message: "Supporting document attached." });
    } catch (error: any) {
      console.warn("[flash-erp:mobile] Leave document attach failed.", error);
      setFeedback({ type: "error", message: error?.message || "The document could not be attached. Try again." });
    }
  };

  const handleClockToggle = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLoading(true);
    setFeedback(null);
    try {
      const now = new Date().toISOString();
      const permission = await Location.requestForegroundPermissionsAsync();
      let locationNote = "Location permission was not granted";
      if (permission.status === "granted") {
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        locationNote = `GPS ${location.coords.latitude.toFixed(6)},${location.coords.longitude.toFixed(6)} accuracy ${Math.round(location.coords.accuracy ?? 0)}m`;
      }
      const res = await mobileApi.submitAttendance({
        ...(clockedIn ? { checkOutTime: now } : { checkInTime: now }),
        locationNote
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
      const receiptUrl = receiptImageUri || undefined;
      const res = await mobileApi.submitExpenseClaim({
        title: expenseTitle.trim(),
        amount: amt,
        category: expenseCategory,
        expenseDate: new Date().toISOString(),
        receiptUrl
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
        setReceiptImageUri(null);
        void mobileApi.fetchMyExpenseClaims().then((history) => { if (history.ok && history.data) setExpenseHistory(history.data); });
      } else {
        setFeedback({ type: "error", message: res.error || "Failed submitting claim." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed submitting expense." });
    } finally {
      setLoading(false);
    }
  };

  const cancelLeave = async () => {
    if (!cancellingLeaveId || !cancellationReason.trim()) { setFeedback({ type: "error", message: "Enter a cancellation reason." }); return; }
    setLoading(true); const response = await mobileApi.cancelLeaveRequest(cancellingLeaveId, cancellationReason.trim()); setLoading(false);
    if (!response.ok) { setFeedback({ type: "error", message: response.error || "Cancellation failed." }); return; }
    setCancellingLeaveId(null); setCancellationReason(""); setFeedback({ type: "success", message: response.message || "Leave application cancelled." });
    const workspace = await mobileApi.fetchMyLeaveWorkspace(); if (workspace.ok && workspace.data) { setLeaveTypes(workspace.data.leaveTypes); setLeaveHistory(workspace.data.requests); }
  };

  const handleLeaveDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    const field = datePickerField;
    if (Platform.OS === "android") setDatePickerField(null);
    if (!date || !field) return;
    const value = date.toISOString().slice(0, 10);
    if (field === "start") setLeaveStartDate(value);
    else setLeaveEndDate(value);
  };

  const handleSubmitLeave = async () => {
    setFeedback(null);
    if (!selectedLeaveTypeId || !leaveStartDate || !leaveEndDate || !leaveReason.trim()) {
      setFeedback({ type: "error", message: "Choose a leave type, start and end dates, and enter a reason." });
      return;
    }
    if (leaveEndDate < leaveStartDate) {
      setFeedback({ type: "error", message: "End date cannot be before start date." });
      return;
    }
    if (selectedLeaveType && requestedLeaveDays > selectedLeaveType.availableDays) {
      setFeedback({ type: "error", message: `This request needs ${requestedLeaveDays} days, but only ${selectedLeaveType.availableDays.toFixed(1)} are available.` });
      return;
    }
    if (selectedLeaveType?.requiresAttachment && !leaveDocumentUri) { setFeedback({ type: "error", message: `${selectedLeaveType.name} requires a supporting document.` }); return; }
    setLoading(true);
    const res = await mobileApi.submitLeaveRequest({ leaveTypeId: selectedLeaveTypeId, startDate: leaveStartDate, endDate: leaveEndDate, reason: leaveReason.trim(), attachmentUrl: leaveDocumentUri || undefined, attachmentMimeType: leaveDocumentUri ? "image/jpeg" : undefined });
    setLoading(false);
    if (!res.ok) {
      setFeedback({ type: "error", message: res.error || "Failed submitting leave application." });
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setFeedback({ type: "success", message: res.isOffline ? "Leave application and supporting document queued for sync." : (res.message || "Leave application submitted to HR.") });
    void mobileApi.fetchMyExpenseClaims().then((response) => { if (response.ok && response.data) setExpenseHistory(response.data); });
    void mobileApi.fetchMyLeaveWorkspace().then((workspace) => { if (workspace.ok && workspace.data) { setLeaveTypes(workspace.data.leaveTypes); setLeaveHistory(workspace.data.requests); } });
    setLeaveStartDate(""); setLeaveEndDate(""); setLeaveReason(""); setLeaveDocumentUri(null);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <HeaderStatusBar />

      {/* Screen Header */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={goHome}>
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

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 + Math.max(insets.bottom, 0) }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadWorkspace(); setRefreshing(false); }} />}
      >
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
                onPress={() => void captureExpenseReceipt()}
              >
                <Ionicons name="camera-outline" size={20} color={mobileTheme.primary} />
                <Text style={styles.photoReceiptText}>{receiptImageUri ? "Receipt Photo Attached · Retake" : "Attach Receipt Photo"}</Text>
              </TouchableOpacity>

              {receiptImageUri ? (
                <View style={styles.photoPreviewBox}>
                  <Image source={{ uri: receiptImageUri }} style={styles.photoPreview} resizeMode="contain" />
                  <TouchableOpacity style={styles.photoRemove} onPress={() => setReceiptImageUri(null)}>
                    <Ionicons name="trash-outline" size={14} color={mobileTheme.danger} />
                    <Text style={styles.photoRemoveText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
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
            <View style={styles.leaveHistoryCard}>
              <Text style={styles.cardTitle}>My Expense Claims</Text>
              {expenseHistory.map((claim) => <View key={claim.id} style={styles.leaveHistoryRow}><View style={{ flex: 1 }}><Text style={styles.leaveHistoryTitle}>{claim.purpose} · {claim.claimNo}</Text><Text style={styles.leaveHistoryDates}>{claim.claimDate} · {claim.category || "Expense"}</Text></View><View style={{ alignItems: "flex-end", gap: 4 }}><Text style={styles.expenseHistoryAmount}>{claim.currencyCode} {claim.totalAmount.toFixed(2)}</Text><View style={styles.leaveStatus}><Text style={styles.leaveStatusText}>{claim.status}</Text></View></View></View>)}
              {expenseHistory.length === 0 && <Text style={styles.emptyLeaveText}>No expense claims submitted yet.</Text>}
            </View>
          </View>
        )}

        {/* 3. LEAVE REQUEST */}
        {activeTab === "LEAVE" && (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Apply for Employee Leave</Text>

              <Text style={styles.inputLabel}>Leave Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.leaveTypeRow}>
                {leaveTypes.map((type) => <TouchableOpacity key={type.id} style={[styles.leaveTypeChip, selectedLeaveTypeId === type.id && styles.leaveTypeChipActive]} onPress={() => setSelectedLeaveTypeId(type.id)}><Text style={[styles.leaveTypeName, selectedLeaveTypeId === type.id && styles.leaveTypeNameActive]}>{type.name}</Text><Text style={[styles.leaveBalance, selectedLeaveTypeId === type.id && styles.leaveTypeNameActive]}>{type.availableDays.toFixed(1)} days available</Text></TouchableOpacity>)}
              </ScrollView>
              {leaveTypes.length === 0 && <Text style={styles.emptyLeaveText}>No active leave types or entitlements are available.</Text>}

              <Text style={styles.inputLabel}>Start Date</Text>
              <TouchableOpacity style={styles.dateField} onPress={() => setDatePickerField("start")}>
                <Text style={leaveStartDate ? styles.dateValue : styles.datePlaceholder}>{leaveStartDate || "Choose start date"}</Text>
                <Ionicons name="calendar-outline" size={20} color={mobileTheme.primary} />
              </TouchableOpacity>

              <Text style={styles.inputLabel}>End Date</Text>
              <TouchableOpacity style={styles.dateField} onPress={() => setDatePickerField("end")}>
                <Text style={leaveEndDate ? styles.dateValue : styles.datePlaceholder}>{leaveEndDate || "Choose end date"}</Text>
                <Ionicons name="calendar-outline" size={20} color={mobileTheme.primary} />
              </TouchableOpacity>

              {requestedLeaveDays > 0 && <View style={styles.requestedDaysRow}><Text style={styles.requestedDaysLabel}>Requested duration</Text><Text style={styles.requestedDaysValue}>{requestedLeaveDays} day(s)</Text></View>}

              <TouchableOpacity style={styles.photoReceiptButton} onPress={() => void pickLeaveDocument()}><Ionicons name="document-attach-outline" size={20} color={mobileTheme.primary}/><Text style={styles.photoReceiptText}>{leaveDocumentUri ? "Supporting Document Attached · Change" : selectedLeaveType?.requiresAttachment ? "Attach Required Supporting Document" : "Attach Supporting Document (Optional)"}</Text></TouchableOpacity>
              {leaveDocumentUri ? (
                <View style={styles.photoPreviewBox}>
                  <Image source={{ uri: leaveDocumentUri }} style={styles.photoPreview} resizeMode="contain" />
                  <TouchableOpacity style={styles.photoRemove} onPress={() => setLeaveDocumentUri(null)}>
                    <Ionicons name="trash-outline" size={14} color={mobileTheme.danger} />
                    <Text style={styles.photoRemoveText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

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
              onPress={handleSubmitLeave}
              disabled={loading}
            >
              <Ionicons name="calendar" size={18} color="#ffffff" />
              <Text style={styles.submitButtonText}>Submit Leave Application</Text>
            </TouchableOpacity>

            <View style={styles.leaveHistoryCard}>
              <Text style={styles.cardTitle}>My Leave History</Text>
              {leaveHistory.map((item) => <View key={item.id} style={styles.leaveHistoryRow}><View style={{ flex: 1 }}><Text style={styles.leaveHistoryTitle}>{item.leaveTypeName} · {item.requestNo} {item.attachmentUrl ? "📎" : ""}</Text><Text style={styles.leaveHistoryDates}>{item.startDate} to {item.endDate} · {item.requestedDays} day(s)</Text></View><View style={{ alignItems: "flex-end", gap: 5 }}><View style={styles.leaveStatus}><Text style={styles.leaveStatusText}>{item.status}</Text></View>{["DRAFT","SUBMITTED","APPROVED"].includes(item.status) && <TouchableOpacity onPress={() => { setCancellingLeaveId(item.id); setCancellationReason(""); }}><Text style={styles.cancelLeaveText}>Cancel</Text></TouchableOpacity>}</View></View>)}
              {cancellingLeaveId && <View style={styles.cancelBox}><Text style={styles.inputLabel}>Cancellation reason</Text><TextInput style={styles.fieldInput} value={cancellationReason} onChangeText={setCancellationReason} placeholder="Why are you cancelling this leave?"/><View style={styles.cancelActions}><TouchableOpacity onPress={() => setCancellingLeaveId(null)}><Text style={styles.dismissText}>Keep Leave</Text></TouchableOpacity><TouchableOpacity style={styles.confirmCancel} onPress={cancelLeave}><Text style={styles.confirmCancelText}>Confirm Cancellation</Text></TouchableOpacity></View></View>}
              {leaveHistory.length === 0 && <Text style={styles.emptyLeaveText}>No leave applications submitted yet.</Text>}
            </View>
          </View>
        )}

        {datePickerField && (
          <DateTimePicker
            value={new Date((datePickerField === "start" ? leaveStartDate : leaveEndDate) || Date.now())}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            minimumDate={datePickerField === "end" && leaveStartDate ? new Date(leaveStartDate) : undefined}
            onChange={handleLeaveDateChange}
          />
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
      <BottomNavBar active="hr" />
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
  leaveTypeRow: { gap: 8, paddingVertical: 2 },
  leaveTypeChip: { minWidth: 135, padding: 11, borderRadius: mobileTheme.radiusMedium, borderWidth: 1, borderColor: mobileTheme.borderColor, backgroundColor: mobileTheme.neutralLight },
  leaveTypeChipActive: { backgroundColor: mobileTheme.primary, borderColor: mobileTheme.primary },
  leaveTypeName: { fontSize: 13, fontWeight: "800", color: mobileTheme.textColor },
  leaveTypeNameActive: { color: "#ffffff" },
  leaveBalance: { marginTop: 3, fontSize: 11, color: mobileTheme.mutedText },
  emptyLeaveText: { paddingVertical: 10, color: mobileTheme.mutedText, textAlign: "center" },
  leaveHistoryCard: { padding: 16, gap: 12, borderRadius: mobileTheme.radiusLarge, backgroundColor: mobileTheme.surfaceBackground, borderWidth: 1, borderColor: mobileTheme.borderColor },
  leaveHistoryRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: mobileTheme.borderColor },
  leaveHistoryTitle: { fontSize: 13, fontWeight: "800", color: mobileTheme.textColor },
  leaveHistoryDates: { marginTop: 3, fontSize: 11, color: mobileTheme.mutedText },
  leaveStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: mobileTheme.primaryLight },
  leaveStatusText: { fontSize: 10, fontWeight: "800", color: mobileTheme.primary },
  cancelLeaveText: { fontSize: 11, fontWeight: "800", color: mobileTheme.danger },
  cancelBox: { padding: 12, gap: 8, borderRadius: 10, backgroundColor: mobileTheme.dangerLight }, cancelActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 14 }, dismissText: { color: mobileTheme.mutedText, fontWeight: "700" }, confirmCancel: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: mobileTheme.danger }, confirmCancelText: { color: "#fff", fontWeight: "800" },
  expenseHistoryAmount: { fontSize: 12, fontWeight: "900", color: mobileTheme.textColor },
  requestedDaysRow: { flexDirection: "row", justifyContent: "space-between", padding: 10, borderRadius: 8, backgroundColor: mobileTheme.primaryLight },
  requestedDaysLabel: { fontWeight: "700", color: mobileTheme.mutedText },
  requestedDaysValue: { fontWeight: "900", color: mobileTheme.primary },
  dateField: {
    height: 48,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    borderRadius: mobileTheme.radiusMedium,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: mobileTheme.surfaceBackground
  },
  dateValue: { color: mobileTheme.textColor, fontSize: 14 },
  datePlaceholder: { color: mobileTheme.neutralMuted, fontSize: 14 },
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
  photoPreviewBox: {
    borderRadius: mobileTheme.radiusMedium,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    backgroundColor: mobileTheme.neutralLight,
    overflow: "hidden"
  },
  photoPreview: {
    width: "100%",
    height: 160
  },
  photoRemove: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: mobileTheme.borderColor
  },
  photoRemoveText: {
    color: mobileTheme.danger,
    fontSize: 12,
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
