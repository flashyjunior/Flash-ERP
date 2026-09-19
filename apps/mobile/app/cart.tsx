import React, { useEffect, useRef, useState } from "react";
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
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileTheme } from "../lib/mobile-theme";
import { mobileStorage } from "../lib/mobile-storage";
import { HeaderStatusBar } from "../components/HeaderStatusBar";
import { mobileApi, type MobileCustomer, type MobileTenderMethod } from "../lib/mobile-api";

interface CartLine {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  unitPrice: number;
  taxRatePercent: number;
  isTaxInclusive: boolean;
  availableStock: number;
  quantity: number;
  unitOfMeasure: string;
  conversionFactor: number;
  variantCode?: string;
}

export default function MobileCartScreen() {
  const params = useLocalSearchParams<{
    addProductId?: string; addProductCode?: string; addProductName?: string;
    addUnitPrice?: string; addUnitOfMeasure?: string; addStock?: string;
    addTaxRate?: string; addTaxInclusive?: string; addConversionFactor?: string; addVariantCode?: string;
  }>();
  const addedRouteProduct = useRef<string | null>(null);
  const saleIdempotencyKey = useRef(`MOBILE-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const insets = useSafeAreaInsets();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const [customerName, setCustomerName] = useState<string>("Walk-in Customer");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [heldModalVisible, setHeldModalVisible] = useState(false);
  const [heldSales, setHeldSales] = useState<Array<any>>([]);
  const [heldLoading, setHeldLoading] = useState(false);
  const [recalledTransactionId, setRecalledTransactionId] = useState<string | null>(null);
  const [recalledTotal, setRecalledTotal] = useState<number | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<MobileCustomer[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [checkoutModalVisible, setCheckoutModalVisible] = useState<boolean>(false);
  const [tenderMethods, setTenderMethods] = useState<MobileTenderMethod[]>([]);
  const [selectedTenderCode, setSelectedTenderCode] = useState<string>("");
  const [tenderError, setTenderError] = useState<string | null>(null);
  const [tenderAmount, setTenderAmount] = useState<string>("");
  const [tenderRef, setTenderRef] = useState<string>("");
  const [splitPayments, setSplitPayments] = useState<Array<{ id: string; tender: MobileTenderMethod; amount: number; reference?: string }>>([]);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  useEffect(() => {
    void mobileStorage.getPosCart<CartLine[]>().then((saved) => {
      if (Array.isArray(saved)) setLines(saved);
      setCartReady(true);
    });
  }, []);

  useEffect(() => {
    if (!cartReady) return;
    void mobileStorage.setPosCart(lines);
  }, [lines, cartReady]);

  useEffect(() => {
    if (!cartReady || !params.addProductId || addedRouteProduct.current === params.addProductId) return;
    const price = Number(params.addUnitPrice);
    const stock = Number(params.addStock);
    if (!params.addProductCode || !params.addProductName || !Number.isFinite(price) || price < 0 || stock <= 0) return;
    addedRouteProduct.current = params.addProductId;
    setLines((current) => {
      const existing = current.find((line) => line.productId === params.addProductId);
      if (existing) {
        if (existing.quantity >= stock) return current;
        return current.map((line) => line.id === existing.id ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, {
        id: `${params.addProductId}:${Date.now()}`,
        productId: params.addProductId!,
        productCode: params.addProductCode!,
        productName: params.addProductName!,
        unitPrice: price,
        taxRatePercent: Number(params.addTaxRate || 0),
        isTaxInclusive: params.addTaxInclusive === "true",
        availableStock: stock,
        quantity: 1,
        unitOfMeasure: params.addUnitOfMeasure || "EA",
        conversionFactor: Number(params.addConversionFactor || 1),
        variantCode: params.addVariantCode || undefined
      }];
    });
    setFeedback({ type: "success", message: `${params.addProductName} added to the basket.` });
  }, [cartReady, params.addProductId, params.addProductCode, params.addProductName, params.addUnitPrice, params.addUnitOfMeasure, params.addStock, params.addTaxRate, params.addTaxInclusive, params.addConversionFactor, params.addVariantCode]);

  const selectedTender = tenderMethods.find((tender) => tender.code === selectedTenderCode) ?? null;

  useEffect(() => {
    void mobileApi.fetchTenderMethods().then((response) => {
      if (!response.ok || !response.data?.length) {
        setTenderError(response.error || "No active tender methods are configured at HQ.");
        return;
      }
      setTenderMethods(response.data);
      setSelectedTenderCode(response.data[0].code);
      setTenderError(null);
    });
  }, []);

  const subtotal = lines.reduce((sum, line) => {
    const gross = line.unitPrice * line.quantity;
    return sum + (line.isTaxInclusive ? gross / (1 + line.taxRatePercent / 100) : gross);
  }, 0);
  const tax = lines.reduce((sum, line) => {
    const gross = line.unitPrice * line.quantity;
    const rate = line.taxRatePercent / 100;
    return sum + (line.isTaxInclusive ? gross - gross / (1 + rate) : gross * rate);
  }, 0);
  const calculatedTotal = lines.reduce((sum, line) => {
    const gross = line.unitPrice * line.quantity;
    return sum + (line.isTaxInclusive ? gross : gross * (1 + line.taxRatePercent / 100));
  }, 0);
  const total = recalledTotal ?? calculatedTotal;
  const splitTotal = splitPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const remainingDue = Math.max(0, total - splitTotal);

  const updateQuantity = (id: string, delta: number) => {
    Haptics.selectionAsync();
    setLines((prev) =>
      prev
        .map((l) => (l.id === id ? { ...l, quantity: Math.min(l.availableStock, Math.max(1, l.quantity + delta)) } : l))
        .filter((l) => l.quantity > 0)
    );
  };

  const removeLine = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const loadHeldSales = async () => {
    setHeldLoading(true);
    const response = await mobileApi.fetchHeldSales();
    setHeldLoading(false);
    if (!response.ok) { setFeedback({ type: "error", message: response.error || "Could not load held sales." }); return; }
    setHeldSales(response.data ?? []);
    setHeldModalVisible(true);
  };

  const recallHeldSale = (held: any) => {
    setRecalledTransactionId(held.transactionId);
    setRecalledTotal(Number(held.totalAmount));
    setCustomerId(held.customerId ?? null);
    setCustomerName(held.customerName || "Walk-in Customer");
    setLines(held.lines.map((line: any) => ({ id: `${held.transactionId}:${line.productId}`, productId: line.productId, productCode: line.productCode, productName: line.productName, unitPrice: Number(line.unitPrice), taxRatePercent: 0, isTaxInclusive: true, availableStock: Number(line.quantity), quantity: Number(line.quantity), unitOfMeasure: line.sellingUnitOfMeasure || "EA" })));
    setHeldModalVisible(false);
    setFeedback({ type: "success", message: `${held.transactionNo} recalled. Complete payment to finish the held sale.` });
  };

  const searchCustomers = async (query = customerQuery) => {
    setCustomerLoading(true);
    const response = await mobileApi.searchCustomers(query);
    setCustomerLoading(false);
    if (response.ok) setCustomers(response.data ?? []);
    else setFeedback({ type: "error", message: response.error || "Customer search failed." });
  };

  const selectCustomer = (customer: MobileCustomer | null) => {
    setCustomerId(customer?.id ?? null);
    setCustomerName(customer?.fullName ?? "Walk-in Customer");
    setCustomerModalVisible(false);
  };

  const handleParkSale = async () => {
    if (lines.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setLoading(true);
    try {
      const res = await mobileApi.holdSale({
        customerId: customerId || undefined,
        lines: lines.map((l) => ({
          productId: l.productId,
          productCode: l.productCode,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          sellingUnitOfMeasure: l.unitOfMeasure,
          productVariantCode: l.variantCode || null
        })),
        note: `Parked from Mobile POS by ${customerName}`
      });
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setFeedback({ type: "success", message: "Basket parked as Held Sale. Till can resume." });
        setLines([]);
        await mobileStorage.clearPosCart();
      } else {
        setFeedback({ type: "error", message: res.error || "Failed parking sale." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed parking sale." });
    } finally {
      setLoading(false);
    }
  };

  const addSplitPayment = () => {
    const amount = Number.parseFloat(tenderAmount);
    if (!selectedTender || !Number.isFinite(amount) || amount <= 0 || amount > remainingDue) {
      setFeedback({ type: "error", message: `Enter an amount up to GHS ${remainingDue.toFixed(2)}.` });
      return;
    }
    if (selectedTender.requiresReference && !tenderRef.trim()) {
      setFeedback({ type: "error", message: `${selectedTender.name} requires a payment reference.` });
      return;
    }
    setSplitPayments((rows) => [...rows, { id: `${Date.now()}-${rows.length}`, tender: selectedTender, amount, reference: tenderRef.trim() || undefined }]);
    setTenderAmount((remainingDue - amount).toFixed(2));
    setTenderRef("");
    setFeedback(null);
  };

  const handleCompleteSale = async () => {
    if (loading || lines.length === 0) return;
    const paid = Number.parseFloat(tenderAmount);
    const currentAmount = Number.isFinite(paid) ? paid : 0;
    const tenderedTotal = splitTotal + currentAmount;
    if (Math.abs(tenderedTotal - total) > 0.009 && tenderedTotal < total) {
      setFeedback({ type: "error", message: `GHS ${(total - tenderedTotal).toFixed(2)} remains unpaid.` });
      return;
    }
    if (!selectedTender) {
      setFeedback({ type: "error", message: tenderError || "Choose an active tender method." });
      return;
    }
    if (currentAmount > 0 && selectedTender.requiresReference && !tenderRef.trim()) {
      setFeedback({ type: "error", message: `${selectedTender.name} requires a payment reference.` });
      return;
    }
    if (tenderedTotal > total && !selectedTender.allowChange) {
      setFeedback({
        type: "error",
        message: `${selectedTender.name} is not configured at HQ to issue change. Enter the exact amount.`,
      });
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const res = await mobileApi.submitSale({
        sourceTransactionId: recalledTransactionId ?? saleIdempotencyKey.current,
        customerId: customerId || undefined,
        lines: lines.map((l) => ({
          productId: l.productId,
          productCode: l.productCode,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          sellingUnitOfMeasure: l.unitOfMeasure,
          productVariantCode: l.variantCode || null
        })),
        payments: [
          ...splitPayments.map((payment) => ({
            method: payment.tender.paymentMethod,
            tenderMethodCode: payment.tender.code,
            tenderMethodId: payment.tender.id,
            amount: payment.amount,
            reference: payment.reference
          })),
          ...(currentAmount > 0 ? [{
            method: selectedTender.paymentMethod,
            tenderMethodCode: selectedTender.code,
            tenderMethodId: selectedTender.id,
            amount: currentAmount,
            reference: tenderRef.trim() || undefined
          }] : [])
        ],
        note: `Floor checkout by mobile client - Tender: ${selectedTender.name}`
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
        setSplitPayments([]);
        setRecalledTransactionId(null);
        setRecalledTotal(null);
        await mobileStorage.clearPosCart();
        saleIdempotencyKey.current = `MOBILE-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        if (!res.isOffline && (res.data as any)?.receipt) {
          await mobileStorage.setLastReceipt((res.data as any).receipt);
          router.replace("/receipt");
        }
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
        <View style={styles.headerActions}><TouchableOpacity style={styles.iconButton} onPress={() => void loadHeldSales()}>{heldLoading ? <ActivityIndicator size="small" color={mobileTheme.primary} /> : <Ionicons name="pause-circle-outline" size={23} color={mobileTheme.primary} />}</TouchableOpacity><TouchableOpacity style={styles.iconButton} onPress={() => router.push("/scanner")}><Ionicons name="add-circle" size={24} color={mobileTheme.primary} /></TouchableOpacity></View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Customer Header */}
        <View style={styles.customerPill}>
          <Ionicons name="person-circle-outline" size={20} color={mobileTheme.primary} />
          <Text style={styles.customerNameText}>{customerName}</Text>
          {customerId && <TouchableOpacity onPress={() => selectCustomer(null)}><Ionicons name="close-circle" size={18} color={mobileTheme.neutralMuted} /></TouchableOpacity>}
          <TouchableOpacity onPress={() => { setCustomerModalVisible(true); void searchCustomers(""); }}>
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
                    disabled={Boolean(recalledTransactionId)}
                  >
                    <Ionicons name="remove" size={16} color={mobileTheme.textColor} />
                  </TouchableOpacity>
                  <Text style={styles.stepQty}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => updateQuantity(item.id, 1)}
                    disabled={Boolean(recalledTransactionId)}
                  >
                    <Ionicons name="add" size={16} color={mobileTheme.textColor} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={() => removeLine(item.id)} disabled={Boolean(recalledTransactionId)}>
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
              <Text style={styles.summaryLabel}>Configured taxes</Text>
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
                setSplitPayments([]);
                setTenderRef("");
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

      <Modal visible={heldModalVisible} transparent animationType="slide" onRequestClose={() => setHeldModalVisible(false)}><View style={styles.modalBackdrop}><View style={[styles.customerModal, { paddingBottom: Math.max(insets.bottom, 16) }]}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Recall Held Sale</Text><TouchableOpacity onPress={() => setHeldModalVisible(false)}><Ionicons name="close-circle" size={24} color={mobileTheme.neutralMuted} /></TouchableOpacity></View><ScrollView style={{ maxHeight: 420 }}>{heldSales.map((held) => <TouchableOpacity key={held.transactionId} style={styles.heldRow} onPress={() => recallHeldSale(held)}><View style={{ flex: 1 }}><Text style={styles.customerResultName}>{held.transactionNo}</Text><Text style={styles.customerResultMeta}>{held.customerName} · {held.lines.length} line(s) · {new Date(held.updatedAt).toLocaleString()}</Text></View><Text style={styles.heldAmount}>GHS {Number(held.totalAmount).toFixed(2)}</Text></TouchableOpacity>)}{heldSales.length === 0 && <Text style={styles.noCustomers}>No held sales are waiting.</Text>}</ScrollView></View></View></Modal>

      <Modal visible={customerModalVisible} transparent animationType="slide" onRequestClose={() => setCustomerModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.customerModal, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>Select Customer</Text><TouchableOpacity onPress={() => setCustomerModalVisible(false)}><Ionicons name="close-circle" size={24} color={mobileTheme.neutralMuted} /></TouchableOpacity></View>
            <View style={styles.customerSearchRow}>
              <TextInput style={[styles.modalInput, { flex: 1 }]} value={customerQuery} onChangeText={setCustomerQuery} onSubmitEditing={() => void searchCustomers()} placeholder="Name, customer number, phone or email" returnKeyType="search" />
              <TouchableOpacity style={styles.customerSearchButton} onPress={() => void searchCustomers()}>{customerLoading ? <ActivityIndicator color="#fff" /> : <Ionicons name="search" size={20} color="#fff" />}</TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.walkInRow} onPress={() => selectCustomer(null)}><Ionicons name="person-outline" size={20} color={mobileTheme.primary} /><Text style={styles.customerResultName}>Walk-in Customer</Text></TouchableOpacity>
            <ScrollView style={{ maxHeight: 330 }} keyboardShouldPersistTaps="handled">
              {customers.map((customer) => <TouchableOpacity key={customer.id} style={styles.customerResult} onPress={() => selectCustomer(customer)}><View style={{ flex: 1 }}><Text style={styles.customerResultName}>{customer.fullName}</Text><Text style={styles.customerResultMeta}>{customer.customerNo} · {customer.phone || customer.email || customer.customerType}</Text></View><Ionicons name="chevron-forward" size={18} color={mobileTheme.neutralMuted} /></TouchableOpacity>)}
              {!customerLoading && customers.length === 0 && <Text style={styles.noCustomers}>No matching customers.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Checkout Modal */}
      <Modal
        visible={checkoutModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCheckoutModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Floor Checkout Tender</Text>
              <TouchableOpacity onPress={() => setCheckoutModalVisible(false)}>
                <Ionicons name="close-circle" size={24} color={mobileTheme.neutralMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalTotalText}>Total: GHS {total.toFixed(2)}</Text>

            {/* Tender Method Selector */}
            <View style={styles.tenderMethodGroup}>
              {tenderMethods.map((m) => (
                /* Tender behavior comes from the centrally managed HQ tender configuration. */
                <TouchableOpacity
                  key={m.code}
                  style={[
                    styles.tenderBtn,
                    selectedTenderCode === m.code && styles.tenderBtnActive
                  ]}
                  onPress={() => { setSelectedTenderCode(m.code); setTenderRef(""); }}
                >
                  <Ionicons
                    name={(m.paymentMethod === "CASH" ? "cash-outline" : m.paymentMethod === "CARD" ? "card-outline" : "phone-portrait-outline") as any}
                    size={20}
                    color={selectedTenderCode === m.code ? "#ffffff" : mobileTheme.textColor}
                  />
                  <Text
                    style={[
                      styles.tenderBtnText,
                      selectedTenderCode === m.code && styles.tenderBtnTextActive
                    ]}
                  >
                    {m.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {splitPayments.length > 0 && <View style={styles.splitList}>
              {splitPayments.map((payment) => <View key={payment.id} style={styles.splitRow}><View><Text style={styles.splitName}>{payment.tender.name}</Text><Text style={styles.splitRef}>{payment.reference || "No reference"}</Text></View><Text style={styles.splitAmount}>GHS {payment.amount.toFixed(2)}</Text><TouchableOpacity onPress={() => setSplitPayments((rows) => rows.filter((row) => row.id !== payment.id))}><Ionicons name="trash-outline" size={18} color={mobileTheme.danger} /></TouchableOpacity></View>)}
              <Text style={styles.remainingText}>Remaining: GHS {remainingDue.toFixed(2)}</Text>
            </View>}
            {selectedTender?.paymentMethod === "CASH" && selectedTender.allowChange && Number(tenderAmount) >= total && (
              <View style={styles.changeRow}><Text style={styles.changeLabel}>Change due</Text><Text style={styles.changeValue}>GHS {(Number(tenderAmount) - total).toFixed(2)}</Text></View>
            )}

            {tenderError && <Text style={styles.tenderError}>{tenderError}</Text>}

            {/* HQ controls whether the selected tender requires a reference. */}
            {selectedTender?.requiresReference && (
              <View style={styles.tenderInputBox}>
                <Text style={styles.tenderLabel}>Transaction Reference / Voucher (required)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={tenderRef}
                  onChangeText={setTenderRef}
                  placeholder="e.g. MOMO-98234 or POS-SLIP-12"
                  placeholderTextColor={mobileTheme.neutralMuted}
                />
              </View>
            )}

            {remainingDue > 0 && tenderMethods.length > 1 && <TouchableOpacity style={styles.addSplitButton} onPress={addSplitPayment}><Ionicons name="add-circle-outline" size={18} color={mobileTheme.primary} /><Text style={styles.addSplitText}>Add Another Payment Method</Text></TouchableOpacity>}

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
  headerActions: { flexDirection: "row", alignItems: "center" },
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
    ...mobileTheme.shadowLarge,
    maxHeight: "92%"
  },
  customerModal: { backgroundColor: mobileTheme.surfaceBackground, borderTopLeftRadius: mobileTheme.radiusLarge, borderTopRightRadius: mobileTheme.radiusLarge, padding: 20, gap: 12, maxHeight: "80%" },
  customerSearchRow: { flexDirection: "row", gap: 8 },
  customerSearchButton: { width: 48, alignItems: "center", justifyContent: "center", borderRadius: mobileTheme.radiusMedium, backgroundColor: mobileTheme.primary },
  walkInRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: mobileTheme.radiusMedium, backgroundColor: mobileTheme.primaryLight },
  heldRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: mobileTheme.borderColor },
  heldAmount: { fontWeight: "900", color: mobileTheme.primary },
  customerResult: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: mobileTheme.borderColor },
  customerResultName: { fontSize: 14, fontWeight: "800", color: mobileTheme.textColor },
  customerResultMeta: { marginTop: 2, fontSize: 12, color: mobileTheme.mutedText },
  noCustomers: { padding: 20, textAlign: "center", color: mobileTheme.mutedText },
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
  splitList: { gap: 8, padding: 10, borderRadius: 10, backgroundColor: mobileTheme.neutralLight },
  splitRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  splitName: { fontSize: 13, fontWeight: "800", color: mobileTheme.textColor },
  splitRef: { fontSize: 11, color: mobileTheme.mutedText },
  splitAmount: { flex: 1, textAlign: "right", fontWeight: "800", color: mobileTheme.textColor },
  remainingText: { textAlign: "right", fontWeight: "900", color: mobileTheme.primary },
  addSplitButton: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7, padding: 11, borderWidth: 1, borderColor: mobileTheme.primary, borderRadius: mobileTheme.radiusMedium },
  addSplitText: { color: mobileTheme.primary, fontWeight: "800" },
  changeRow: { flexDirection: "row", justifyContent: "space-between", padding: 12, borderRadius: 10, backgroundColor: mobileTheme.accentLight },
  changeLabel: { fontWeight: "700", color: mobileTheme.mutedText },
  changeValue: { fontWeight: "900", color: mobileTheme.accentDark },
  tenderError: { color: mobileTheme.danger, fontSize: 12, fontWeight: "700" },
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
