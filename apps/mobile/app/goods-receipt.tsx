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

interface ReceiptLine {
  productId: string;
  quantity: number;
  unitCost?: number;
  batchNumber?: string;
  expiryDate?: string;
}

export default function GoodsReceiptScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const goHome = () => { try { router.dismissTo("/"); } catch { router.replace("/"); } };
  const [poNumber, setPoNumber] = useState<string>("");
  const [currentProductCode, setCurrentProductCode] = useState<string>("");
  const [currentQty, setCurrentQty] = useState<string>("1");
  const [currentBatch, setCurrentBatch] = useState<string>("");
  const [currentExpiry, setCurrentExpiry] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const handleAddLine = () => {
    const code = currentProductCode.trim().toUpperCase();
    const qty = Number.parseFloat(currentQty);

    if (!code) {
      setFeedback({ type: "error", message: "Enter a product SKU or scan barcode." });
      return;
    }
    if (Number.isNaN(qty) || qty <= 0) {
      setFeedback({ type: "error", message: "Enter a valid received quantity." });
      return;
    }

    Haptics.selectionAsync();
    setLines((prev) => [
      ...prev,
      {
        productId: code,
        quantity: qty,
        batchNumber: currentBatch.trim() || undefined,
        expiryDate: currentExpiry.trim() || undefined
      }
    ]);

    setCurrentProductCode("");
    setCurrentQty("1");
    setCurrentBatch("");
    setCurrentExpiry("");
    setFeedback(null);
  };

  const handleRemoveLine = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitReceipt = async () => {
    if (lines.length === 0) {
      setFeedback({ type: "error", message: "Add at least one received item before submitting." });
      return;
    }

    setLoading(true);
    setFeedback(null);
    try {
      const res = await mobileApi.submitGoodsReceipt({
        purchaseOrderId: poNumber.trim() || undefined,
        note: note.trim() || undefined,
        lines
      });

      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setFeedback({
          type: "success",
          message: res.isOffline
            ? "Receipt saved offline. Queued for automatic sync."
            : "Goods receipt committed directly to inventory!"
        });
        setLines([]);
        setPoNumber("");
        setNote("");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setFeedback({ type: "error", message: res.error || "Failed receiving stock." });
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFeedback({ type: "error", message: err.message || "Failed posting goods receipt." });
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
        <Text style={styles.headerTitle}>Goods Receiving (GRN)</Text>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.push("/scanner")}>
          <Ionicons name="barcode-outline" size={22} color={mobileTheme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 + Math.max(insets.bottom, 0) }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setFeedback(null); setTimeout(() => setRefreshing(false), 400); }} />}
      >
        {/* PO Reference Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Purchase Order Reference</Text>
          <View style={styles.inputField}>
            <Ionicons name="document-text-outline" size={18} color={mobileTheme.neutralMuted} />
            <TextInput
              style={styles.textInput}
              value={poNumber}
              onChangeText={setPoNumber}
              placeholder="e.g. PO-2026-0042 (Optional)"
              placeholderTextColor={mobileTheme.neutralMuted}
              autoCapitalize="characters"
            />
          </View>
        </View>

        {/* Scan & Add Receiving Line */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add Receiving Line</Text>

          <View style={styles.inputField}>
            <Ionicons name="barcode-outline" size={18} color={mobileTheme.neutralMuted} />
            <TextInput
              style={styles.textInput}
              value={currentProductCode}
              onChangeText={setCurrentProductCode}
              placeholder="Product SKU or barcode..."
              placeholderTextColor={mobileTheme.neutralMuted}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.rowInputs}>
            <View style={[styles.inputField, { flex: 1 }]}>
              <Text style={styles.miniLabel}>Qty:</Text>
              <TextInput
                style={styles.textInput}
                value={currentQty}
                onChangeText={setCurrentQty}
                keyboardType="numeric"
              />
            </View>

            <View style={[styles.inputField, { flex: 1.5 }]}>
              <Text style={styles.miniLabel}>Batch:</Text>
              <TextInput
                style={styles.textInput}
                value={currentBatch}
                onChangeText={setCurrentBatch}
                placeholder="B-001"
                placeholderTextColor={mobileTheme.neutralMuted}
                autoCapitalize="characters"
              />
            </View>
          </View>

          <TouchableOpacity style={styles.addLineButton} onPress={handleAddLine}>
            <Ionicons name="add-circle" size={18} color="#ffffff" />
            <Text style={styles.addLineButtonText}>Add to Receiving Slip</Text>
          </TouchableOpacity>
        </View>

        {/* Lines Staged for Receipt */}
        {lines.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Received Items ({lines.length})</Text>
            {lines.map((line, idx) => (
              <View key={idx} style={styles.lineItemRow}>
                <View style={styles.lineItemLeft}>
                  <Text style={styles.lineSku}>{line.productId}</Text>
                  <Text style={styles.lineDetails}>
                    Qty: <Text style={styles.boldText}>{line.quantity}</Text>
                    {line.batchNumber ? ` • Batch: ${line.batchNumber}` : ""}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveLine(idx)}>
                  <Ionicons name="trash-outline" size={18} color={mobileTheme.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Note Field */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Receiving Note / Supplier Info</Text>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Delivered by ABC Logistics, seal intact"
            placeholderTextColor={mobileTheme.neutralMuted}
            multiline
          />
        </View>

        {/* Feedback Banner */}
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

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, (loading || lines.length === 0) && styles.submitButtonDisabled]}
          onPress={handleSubmitReceipt}
          disabled={loading || lines.length === 0}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-done" size={20} color="#ffffff" />
              <Text style={styles.submitButtonText}>Commit Goods Receipt ({lines.length})</Text>
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
  rowInputs: {
    flexDirection: "row",
    gap: 10
  },
  miniLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: mobileTheme.mutedText
  },
  addLineButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileTheme.primary,
    paddingVertical: 12,
    borderRadius: mobileTheme.radiusMedium,
    gap: 6
  },
  addLineButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13
  },
  lineItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: mobileTheme.borderLight
  },
  lineItemLeft: {
    gap: 2
  },
  lineSku: {
    fontSize: 14,
    fontWeight: "700",
    color: mobileTheme.textColor
  },
  lineDetails: {
    fontSize: 12,
    color: mobileTheme.mutedText
  },
  boldText: {
    fontWeight: "800",
    color: mobileTheme.textColor
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
    backgroundColor: mobileTheme.accent,
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
