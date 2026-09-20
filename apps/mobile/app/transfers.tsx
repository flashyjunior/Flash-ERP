import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { mobileTheme } from "../lib/mobile-theme";
import { HeaderStatusBar } from "../components/HeaderStatusBar";
import { BottomNavBar } from "../components/BottomNavBar";
import { mobileApi } from "../lib/mobile-api";

type TransferMode = "ISSUE" | "RECEIVE";

export default function TransfersScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const goHome = () => { try { router.dismissTo("/"); } catch { router.replace("/"); } };
  const [activeTab, setActiveTab] = useState<TransferMode>("ISSUE");
  const [transferId, setTransferId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [transporter, setTransporter] = useState<string>("");
  const [vehicleNo, setVehicleNo] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const handleTabSwitch = (mode: TransferMode) => {
    Haptics.selectionAsync();
    setActiveTab(mode);
    setFeedback(null);
  };

  const handleSubmit = async () => {
    const cleanId = transferId.trim();
    const qty = Number.parseFloat(quantity);

    if (!cleanId) {
      setFeedback({ type: "error", message: "Enter or scan the Transfer ID / Batch No." });
      return;
    }
    if (Number.isNaN(qty) || qty <= 0) {
      setFeedback({ type: "error", message: "Enter a valid positive quantity." });
      return;
    }

    setLoading(true);
    setFeedback(null);
    try {
      let res;
      if (activeTab === "ISSUE") {
        res = await mobileApi.issueTransfer(cleanId, {
          quantity: qty,
          transporterName: transporter.trim() || undefined,
          vehicleRegistrationNo: vehicleNo.trim() || undefined,
          note: note.trim() || undefined
        });
      } else {
        res = await mobileApi.receiveTransfer(cleanId, {
          quantity: qty,
          note: note.trim() || undefined
        });
      }

      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setFeedback({
          type: "success",
          message: res.isOffline
            ? `Transfer ${activeTab.toLowerCase()} queued offline for automatic sync.`
            : res.message || `Transfer ${activeTab.toLowerCase()} completed!`
        });
        setTransferId("");
        setQuantity("1");
        setTransporter("");
        setVehicleNo("");
        setNote("");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setFeedback({ type: "error", message: res.error || `Failed ${activeTab.toLowerCase()}ing transfer.` });
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFeedback({ type: "error", message: err.message || "Transfer error." });
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
        <TouchableOpacity style={styles.backButton} onPress={goHome}>
          <Ionicons name="arrow-back" size={22} color={mobileTheme.textColor} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Inter-Store Transfers</Text>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.push("/scanner")}>
          <Ionicons name="barcode-outline" size={22} color={mobileTheme.primary} />
        </TouchableOpacity>
      </View>

      {/* Mode Selector Tabs (Issue / Receive) */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "ISSUE" && styles.tabButtonActive]}
          onPress={() => handleTabSwitch("ISSUE")}
        >
          <Ionicons
            name="arrow-up-circle-outline"
            size={18}
            color={activeTab === "ISSUE" ? "#ffffff" : mobileTheme.neutralMedium}
          />
          <Text style={[styles.tabButtonText, activeTab === "ISSUE" && styles.tabButtonTextActive]}>
            Pick & Dispatch (Issue)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === "RECEIVE" && styles.tabButtonActive]}
          onPress={() => handleTabSwitch("RECEIVE")}
        >
          <Ionicons
            name="arrow-down-circle-outline"
            size={18}
            color={activeTab === "RECEIVE" ? "#ffffff" : mobileTheme.neutralMedium}
          />
          <Text
            style={[styles.tabButtonText, activeTab === "RECEIVE" && styles.tabButtonTextActive]}
          >
            Receive Incoming
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 + Math.max(insets.bottom, 0) }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setFeedback(null); setTimeout(() => setRefreshing(false), 400); }} />}
      >
        {/* Transfer Reference */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Transfer Document / Batch No</Text>
          <View style={styles.inputField}>
            <Ionicons name="swap-horizontal" size={18} color={mobileTheme.neutralMuted} />
            <TextInput
              style={styles.textInput}
              value={transferId}
              onChangeText={setTransferId}
              placeholder="e.g. TR-2026-0019"
              placeholderTextColor={mobileTheme.neutralMuted}
              autoCapitalize="characters"
            />
          </View>
        </View>

        {/* Quantity */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Total Quantity to {activeTab === "ISSUE" ? "Dispatch" : "Receive"}</Text>
          <View style={styles.inputField}>
            <Ionicons name="layers-outline" size={18} color={mobileTheme.neutralMuted} />
            <TextInput
              style={styles.textInput}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Logistics fields for Dispatch */}
        {activeTab === "ISSUE" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Logistics & Dispatch Details</Text>
            <View style={styles.inputField}>
              <Ionicons name="business-outline" size={18} color={mobileTheme.neutralMuted} />
              <TextInput
                style={styles.textInput}
                value={transporter}
                onChangeText={setTransporter}
                placeholder="Transporter Name (Optional)"
                placeholderTextColor={mobileTheme.neutralMuted}
              />
            </View>

            <View style={styles.inputField}>
              <Ionicons name="car-outline" size={18} color={mobileTheme.neutralMuted} />
              <TextInput
                style={styles.textInput}
                value={vehicleNo}
                onChangeText={setVehicleNo}
                placeholder="Vehicle Reg No (e.g. GR-2024-X)"
                placeholderTextColor={mobileTheme.neutralMuted}
                autoCapitalize="characters"
              />
            </View>
          </View>
        )}

        {/* Notes */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Transfer Note</Text>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Add transfer instructions or notes..."
            placeholderTextColor={mobileTheme.neutralMuted}
            multiline
          />
        </View>

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

        {/* Submit Action */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <>
              <Ionicons
                name={activeTab === "ISSUE" ? "arrow-forward-circle" : "checkmark-circle"}
                size={20}
                color="#ffffff"
              />
              <Text style={styles.submitButtonText}>
                {activeTab === "ISSUE" ? "Dispatch Transfer Out" : "Confirm Stock Receipt"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
      <BottomNavBar active="home" />
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
  iconButton: {
    padding: 6
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
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: mobileTheme.radiusSmall,
    gap: 6
  },
  tabButtonActive: {
    backgroundColor: mobileTheme.primary,
    ...mobileTheme.shadowSmall
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: mobileTheme.neutralMedium
  },
  tabButtonTextActive: {
    color: "#ffffff"
  },
  scrollContent: {
    padding: 16,
    gap: 14
  },
  card: {
    backgroundColor: mobileTheme.surfaceBackground,
    borderRadius: mobileTheme.radiusLarge,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    padding: 16,
    gap: 10,
    ...mobileTheme.shadowSmall
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: mobileTheme.mutedText
  },
  inputField: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    borderRadius: mobileTheme.radiusMedium,
    paddingHorizontal: 12,
    height: 46,
    backgroundColor: mobileTheme.neutralLight,
    gap: 8
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: mobileTheme.textColor,
    fontWeight: "600"
  },
  noteInput: {
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    borderRadius: mobileTheme.radiusMedium,
    padding: 10,
    fontSize: 14,
    color: mobileTheme.textColor,
    backgroundColor: mobileTheme.neutralLight,
    minHeight: 50
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
  submitButtonDisabled: {
    opacity: 0.5
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  }
});
