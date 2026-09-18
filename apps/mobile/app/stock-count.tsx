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
  Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { mobileTheme } from "../lib/mobile-theme";
import { HeaderStatusBar } from "../components/HeaderStatusBar";
import { mobileApi } from "../lib/mobile-api";

export default function StockCountScreen() {
  const params = useLocalSearchParams<{
    productId?: string;
    productName?: string;
    onHand?: string;
  }>();

  const [productId, setProductId] = useState<string>(params.productId || "");
  const [productName, setProductName] = useState<string>(params.productName || "");
  const [countedQty, setCountedQty] = useState<string>("1");
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const adjustQty = (delta: number) => {
    Haptics.selectionAsync();
    const current = Number.parseFloat(countedQty) || 0;
    const next = Math.max(0, current + delta);
    setCountedQty(String(next));
  };

  const handleSubmit = async () => {
    const cleanId = productId.trim();
    const qty = Number.parseFloat(countedQty);

    if (!cleanId) {
      setFeedback({ type: "error", message: "Enter a product code." });
      return;
    }

    if (Number.isNaN(qty) || qty < 0) {
      setFeedback({ type: "error", message: "Enter a valid positive counted quantity." });
      return;
    }

    setLoading(true);
    setFeedback(null);
    try {
      const res = await mobileApi.submitStockCount({
        productId: cleanId,
        countedQuantity: qty,
        note: note.trim() || undefined
      });

      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setFeedback({
          type: "success",
          message: res.isOffline
            ? "Count saved offline. Queued for automatic sync."
            : "Stock count committed to Enterprise HQ ledger."
        });
        setCountedQty("1");
        setNote("");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setFeedback({ type: "error", message: res.error || "Failed to record stock count." });
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFeedback({ type: "error", message: err.message || "Failed submitting count." });
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

      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={mobileTheme.textColor} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cycle Count & Audit</Text>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.push("/scanner")}>
          <Ionicons name="barcode" size={22} color={mobileTheme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Product Card / Code Input */}
        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>Product Code / SKU</Text>
          <View style={styles.codeRow}>
            <TextInput
              style={styles.codeTextInput}
              value={productId}
              onChangeText={setProductId}
              placeholder="e.g. BEV-COLA-500"
              placeholderTextColor={mobileTheme.neutralMuted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.scanPickerButton}
              onPress={() => router.push("/scanner")}
            >
              <Ionicons name="scan-outline" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {productName ? (
            <Text style={styles.productNameDisplay}>{productName}</Text>
          ) : null}

          {params.onHand ? (
            <Text style={styles.systemOnHandText}>
              System Expected On-Hand: <Text style={styles.boldText}>{params.onHand}</Text>
            </Text>
          ) : null}
        </View>

        {/* Count Quantity Input with Quick Taps */}
        <View style={styles.countCard}>
          <Text style={styles.inputLabel}>Physical Counted Quantity</Text>

          <View style={styles.qtyDisplayRow}>
            <TouchableOpacity style={styles.qtyAdjustButton} onPress={() => adjustQty(-1)}>
              <Ionicons name="remove" size={24} color={mobileTheme.textColor} />
            </TouchableOpacity>

            <TextInput
              style={styles.qtyInput}
              value={countedQty}
              onChangeText={setCountedQty}
              keyboardType="numeric"
              textAlign="center"
              selectTextOnFocus
            />

            <TouchableOpacity style={styles.qtyAdjustButton} onPress={() => adjustQty(1)}>
              <Ionicons name="add" size={24} color={mobileTheme.textColor} />
            </TouchableOpacity>
          </View>

          {/* Quick Increment Chips */}
          <View style={styles.quickChipRow}>
            {[5, 10, 24, 50].map((inc) => (
              <TouchableOpacity
                key={inc}
                style={styles.quickChip}
                onPress={() => adjustQty(inc)}
              >
                <Text style={styles.quickChipText}>+{inc}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.quickChip, styles.resetChip]}
              onPress={() => setCountedQty("0")}
            >
              <Text style={styles.resetChipText}>Zero</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Audit Note Input */}
        <View style={styles.noteCard}>
          <Text style={styles.inputLabel}>Audit Note / Discrepancy Reason (Optional)</Text>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Box damaged, found behind shelf, expired"
            placeholderTextColor={mobileTheme.neutralMuted}
            multiline
            numberOfLines={2}
          />
        </View>

        {/* Status Feedback Notification */}
        {feedback && (
          <View
            style={[
              styles.feedbackCard,
              feedback.type === "success" ? styles.feedbackSuccess : styles.feedbackError
            ]}
          >
            <Ionicons
              name={feedback.type === "success" ? "checkmark-circle" : "alert-circle"}
              size={22}
              color={feedback.type === "success" ? mobileTheme.accent : mobileTheme.danger}
            />
            <Text
              style={[
                styles.feedbackText,
                feedback.type === "success"
                  ? styles.feedbackTextSuccess
                  : styles.feedbackTextError
              ]}
            >
              {feedback.message}
            </Text>
          </View>
        )}

        {/* Submit Count Action */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-done" size={20} color="#ffffff" />
              <Text style={styles.submitButtonText}>Commit Count</Text>
            </>
          )}
        </TouchableOpacity>
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
  iconButton: {
    padding: 6
  },
  scrollContent: {
    padding: 16,
    gap: 16
  },
  inputCard: {
    backgroundColor: mobileTheme.surfaceBackground,
    borderRadius: mobileTheme.radiusLarge,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    padding: 16,
    gap: 10,
    ...mobileTheme.shadowSmall
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: mobileTheme.mutedText
  },
  codeRow: {
    flexDirection: "row",
    gap: 8
  },
  codeTextInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    borderRadius: mobileTheme.radiusMedium,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: "700",
    color: mobileTheme.textColor,
    backgroundColor: mobileTheme.neutralLight
  },
  scanPickerButton: {
    width: 48,
    height: 48,
    backgroundColor: mobileTheme.primary,
    borderRadius: mobileTheme.radiusMedium,
    justifyContent: "center",
    alignItems: "center"
  },
  productNameDisplay: {
    fontSize: 16,
    fontWeight: "700",
    color: mobileTheme.textColor
  },
  systemOnHandText: {
    fontSize: 13,
    color: mobileTheme.mutedText
  },
  boldText: {
    fontWeight: "700",
    color: mobileTheme.textColor
  },
  countCard: {
    backgroundColor: mobileTheme.surfaceBackground,
    borderRadius: mobileTheme.radiusLarge,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    padding: 16,
    gap: 14,
    ...mobileTheme.shadowSmall
  },
  qtyDisplayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16
  },
  qtyAdjustButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: mobileTheme.neutralLight,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    justifyContent: "center",
    alignItems: "center"
  },
  qtyInput: {
    width: 120,
    height: 56,
    fontSize: 32,
    fontWeight: "900",
    color: mobileTheme.textColor,
    borderWidth: 1,
    borderColor: mobileTheme.primary,
    borderRadius: mobileTheme.radiusMedium,
    backgroundColor: mobileTheme.neutralLight
  },
  quickChipRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap"
  },
  quickChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: mobileTheme.neutralLight,
    borderRadius: mobileTheme.radiusPill,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor
  },
  quickChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: mobileTheme.neutralMedium
  },
  resetChip: {
    backgroundColor: mobileTheme.dangerLight,
    borderColor: mobileTheme.danger
  },
  resetChipText: {
    color: mobileTheme.danger,
    fontSize: 13,
    fontWeight: "700"
  },
  noteCard: {
    backgroundColor: mobileTheme.surfaceBackground,
    borderRadius: mobileTheme.radiusLarge,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    padding: 16,
    gap: 8,
    ...mobileTheme.shadowSmall
  },
  noteInput: {
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    borderRadius: mobileTheme.radiusMedium,
    padding: 12,
    fontSize: 14,
    color: mobileTheme.textColor,
    backgroundColor: mobileTheme.neutralLight,
    minHeight: 60,
    textAlignVertical: "top"
  },
  feedbackCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: mobileTheme.radiusMedium,
    gap: 10
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
    paddingVertical: 16,
    borderRadius: mobileTheme.radiusMedium,
    gap: 8,
    ...mobileTheme.shadowMedium
  },
  submitButtonDisabled: {
    opacity: 0.6
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800"
  }
});
