import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { mobileTheme } from "../lib/mobile-theme";
import { HeaderStatusBar } from "../components/HeaderStatusBar";
import { mobileApi } from "../lib/mobile-api";

interface CartLine {
  id: string;
  productCode: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  unitOfMeasure: string;
}

export default function MobileCartScreen() {
  const [lines, setLines] = useState<CartLine[]>([
    {
      id: "1",
      productCode: "BEV-COLA-500",
      productName: "Coca Cola 500ml Pet",
      unitPrice: 12.0,
      quantity: 2,
      unitOfMeasure: "EA"
    }
  ]);
  const [customerName, setCustomerName] = useState<string>("Walk-in Customer");
  const [loading, setLoading] = useState<boolean>(false);
  const [checkoutModalVisible, setCheckoutModalVisible] = useState<boolean>(false);
  const [tenderMethod, setTenderMethod] = useState<"CASH" | "MOMO" | "CARD">("CASH");
  const [tenderAmount, setTenderAmount] = useState<string>("");
  const [tenderRef, setTenderRef] = useState<string>("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const tax = subtotal * 0.15; // 15% standard retail tax
  const total = subtotal + tax;

  const updateQuantity = (id: string, delta: number) => {
    Haptics.selectionAsync();
    setLines((prev) =>
      prev
        .map((l) => (l.id === id ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0)
    );
  };

  const removeLine = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleParkSale = async () => {
    if (lines.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setLoading(true);
    try {
      const res = await mobileApi.holdSale({
        lines: lines.map((l) => ({
          productCode: l.productCode,
          quantity: l.quantity,
          unitPrice: l.unitPrice
        })),
        note: `Parked from Mobile POS by ${customerName}`
      });
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setFeedback({ type: "success", message: "Basket parked as Held Sale. Till can resume." });
        setLines([]);
      } else {
        setFeedback({ type: "error", message: res.error || "Failed parking sale." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed parking sale." });
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteSale = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await mobileApi.submitSale({
        lines: lines.map((l) => ({
          productCode: l.productCode,
          quantity: l.quantity,
          unitPrice: l.unitPrice
        })),
        payments: [
          {
            method: tenderMethod,
            amount: Number.parseFloat(tenderAmount) || total,
            reference: tenderRef.trim() || undefined
          }
        ],
        note: `Floor checkout by mobile client - Tender: ${tenderMethod}`
      });

      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCheckoutModalVisible(false);
        setFeedback({
          type: "success",
          message: res.isOffline
            ? "Sale completed offline! Queued for automatic sync."
            : "Sale posted to Enterprise HQ accounting and stock cleared!"
        });
        setLines([]);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setFeedback({ type: "error", message: res.error || "Sale rejected by server." });
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFeedback({ type: "error", message: err.message || "Sale failed." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <HeaderStatusBar />

      {/* Screen Header */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={mobileTheme.textColor} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Assisted Selling & Cart</Text>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.push("/scanner")}>
          <Ionicons name="add-circle" size={24} color={mobileTheme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Customer Header */}
        <View style={styles.customerPill}>
          <Ionicons name="person-circle-outline" size={20} color={mobileTheme.primary} />
          <Text style={styles.customerNameText}>{customerName}</Text>
          <TouchableOpacity onPress={() => setCustomerName("Corporate Account #402")}>
            <Text style={styles.changeCustomerText}>Change</Text>
          </TouchableOpacity>
        </View>

        {/* Cart Line Items */}
        <View style={styles.itemsCard}>
          <Text style={styles.cardHeader}>Basket Items ({lines.length})</Text>

          {lines.length === 0 ? (
            <View style={styles.emptyCart}>
              <Ionicons name="cart-outline" size={48} color={mobileTheme.neutralMuted} />
              <Text style={styles.emptyCartText}>Basket is empty</Text>
              <TouchableOpacity
                style={styles.scanNowButton}
                onPress={() => router.push("/scanner")}
              >
                <Ionicons name="barcode-outline" size={18} color="#ffffff" />
                <Text style={styles.scanNowText}>Scan Products</Text>
              </TouchableOpacity>
            </View>
          ) : (
            lines.map((item) => (
              <View key={item.id} style={styles.cartRow}>
                <View style={styles.rowInfo}>
                  <Text style={styles.itemTitle}>{item.productName}</Text>
                  <Text style={styles.itemMeta}>
                    GHS {item.unitPrice.toFixed(2)} / {item.unitOfMeasure} • SKU: {item.productCode}
                  </Text>
                </View>

                {/* Stepper */}
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => updateQuantity(item.id, -1)}
                  >
                    <Ionicons name="remove" size={16} color={mobileTheme.textColor} />
                  </TouchableOpacity>
                  <Text style={styles.stepQty}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => updateQuantity(item.id, 1)}
                  >
                    <Ionicons name="add" size={16} color={mobileTheme.textColor} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={() => removeLine(item.id)}>
                  <Ionicons name="trash-outline" size={18} color={mobileTheme.danger} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Pricing Summary */}
        {lines.length > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryVal}>GHS {subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Taxes (VAT / NHIL 15%)</Text>
              <Text style={styles.summaryVal}>GHS {tax.toFixed(2)}</Text>
            </View>
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total Due</Text>
              <Text style={styles.totalVal}>GHS {total.toFixed(2)}</Text>
            </View>
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

        {/* Cart Bottom Actions */}
        {lines.length > 0 && (
          <View style={styles.bottomActions}>
            <TouchableOpacity
              style={[styles.parkButton, loading && styles.disabled]}
              onPress={handleParkSale}
              disabled={loading}
            >
              <Ionicons name="pause-circle-outline" size={18} color={mobileTheme.primary} />
              <Text style={styles.parkButtonText}>Park Sale (Held)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.payButton, loading && styles.disabled]}
              onPress={() => {
                setTenderAmount(total.toFixed(2));
                setCheckoutModalVisible(true);
              }}
              disabled={loading}
            >
              <Ionicons name="card" size={18} color="#ffffff" />
              <Text style={styles.payButtonText}>Take Payment (GHS {total.toFixed(2)})</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Checkout Modal */}
      <Modal
        visible={checkoutModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCheckoutModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Floor Checkout Tender</Text>
              <TouchableOpacity onPress={() => setCheckoutModalVisible(false)}>
                <Ionicons name="close-circle" size={24} color={mobileTheme.neutralMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalTotalText}>Total: GHS {total.toFixed(2)}</Text>

            {/* Tender Method Selector */}
            <View style={styles.tenderMethodGroup}>
              {[
                { id: "CASH", label: "Cash", icon: "cash-outline" },
                { id: "MOMO", label: "MoMo", icon: "phone-portrait-outline" },
                { id: "CARD", label: "Card", icon: "card-outline" }
              ].map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.tenderBtn,
                    tenderMethod === m.id && styles.tenderBtnActive
                  ]}
                  onPress={() => setTenderMethod(m.id as any)}
                >
                  <Ionicons
                    name={m.icon as any}
                    size={20}
                    color={tenderMethod === m.id ? "#ffffff" : mobileTheme.textColor}
                  />
                  <Text
                    style={[
                      styles.tenderBtnText,
                      tenderMethod === m.id && styles.tenderBtnTextActive
                    ]}
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Tender Reference if MoMo / Card */}
            {tenderMethod !== "CASH" && (
              <View style={styles.tenderInputBox}>
                <Text style={styles.tenderLabel}>Transaction Reference / Voucher</Text>
                <TextInput
                  style={styles.modalInput}
                  value={tenderRef}
                  onChangeText={setTenderRef}
                  placeholder="e.g. MOMO-98234 or POS-SLIP-12"
                  placeholderTextColor={mobileTheme.neutralMuted}
                />
              </View>
            )}

            <TouchableOpacity
              style={[styles.confirmPayButton, loading && styles.disabled]}
              onPress={handleCompleteSale}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={20} color="#ffffff" />
                  <Text style={styles.confirmPayText}>Confirm Payment & Print Slip</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  iconButton: {
    padding: 6
  },
  scrollContent: {
    padding: 16,
    gap: 14
  },
  customerPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: mobileTheme.primaryLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: mobileTheme.radiusMedium,
    gap: 8
  },
  customerNameText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: mobileTheme.primaryDark
  },
  changeCustomerText: {
    fontSize: 12,
    fontWeight: "700",
    color: mobileTheme.primary
  },
  itemsCard: {
    backgroundColor: mobileTheme.surfaceBackground,
    borderRadius: mobileTheme.radiusLarge,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    padding: 16,
    gap: 12,
    ...mobileTheme.shadowSmall
  },
  cardHeader: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: mobileTheme.mutedText
  },
  emptyCart: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 10
  },
  emptyCartText: {
    fontSize: 15,
    color: mobileTheme.mutedText,
    fontWeight: "600"
  },
  scanNowButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: mobileTheme.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: mobileTheme.radiusMedium,
    gap: 6
  },
  scanNowText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13
  },
  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: mobileTheme.borderLight,
    gap: 10
  },
  rowInfo: {
    flex: 1,
    gap: 2
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: mobileTheme.textColor
  },
  itemMeta: {
    fontSize: 12,
    color: mobileTheme.mutedText
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: mobileTheme.neutralLight,
    borderRadius: mobileTheme.radiusSmall,
    padding: 2,
    gap: 6
  },
  stepBtn: {
    padding: 4
  },
  stepQty: {
    fontSize: 14,
    fontWeight: "800",
    color: mobileTheme.textColor,
    minWidth: 20,
    textAlign: "center"
  },
  summaryCard: {
    backgroundColor: mobileTheme.surfaceBackground,
    borderRadius: mobileTheme.radiusLarge,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    padding: 16,
    gap: 8,
    ...mobileTheme.shadowSmall
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  summaryLabel: {
    fontSize: 13,
    color: mobileTheme.mutedText
  },
  summaryVal: {
    fontSize: 13,
    fontWeight: "700",
    color: mobileTheme.textColor
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: mobileTheme.borderColor,
    paddingTop: 8,
    marginTop: 4
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: mobileTheme.textColor
  },
  totalVal: {
    fontSize: 20,
    fontWeight: "900",
    color: mobileTheme.primary
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
  bottomActions: {
    gap: 10
  },
  parkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileTheme.primaryLight,
    paddingVertical: 12,
    borderRadius: mobileTheme.radiusMedium,
    gap: 8
  },
  parkButtonText: {
    color: mobileTheme.primary,
    fontSize: 14,
    fontWeight: "700"
  },
  payButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileTheme.accent,
    paddingVertical: 14,
    borderRadius: mobileTheme.radiusMedium,
    gap: 8,
    ...mobileTheme.shadowMedium
  },
  payButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  },
  disabled: {
    opacity: 0.6
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    justifyContent: "flex-end"
  },
  modalSheet: {
    backgroundColor: mobileTheme.surfaceBackground,
    borderTopLeftRadius: mobileTheme.radiusLarge,
    borderTopRightRadius: mobileTheme.radiusLarge,
    padding: 20,
    gap: 14,
    ...mobileTheme.shadowLarge
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: mobileTheme.textColor
  },
  modalTotalText: {
    fontSize: 22,
    fontWeight: "900",
    color: mobileTheme.primary
  },
  tenderMethodGroup: {
    flexDirection: "row",
    gap: 10
  },
  tenderBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: mobileTheme.radiusMedium,
    backgroundColor: mobileTheme.neutralLight,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    gap: 6
  },
  tenderBtnActive: {
    backgroundColor: mobileTheme.primary,
    borderColor: mobileTheme.primary
  },
  tenderBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: mobileTheme.textColor
  },
  tenderBtnTextActive: {
    color: "#ffffff"
  },
  tenderInputBox: {
    gap: 6
  },
  tenderLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: mobileTheme.mutedText
  },
  modalInput: {
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    borderRadius: mobileTheme.radiusMedium,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 14,
    color: mobileTheme.textColor,
    backgroundColor: mobileTheme.neutralLight
  },
  confirmPayButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileTheme.accent,
    paddingVertical: 14,
    borderRadius: mobileTheme.radiusMedium,
    gap: 8,
    marginTop: 6
  },
  confirmPayText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  }
});
