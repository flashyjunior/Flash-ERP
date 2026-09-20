import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderStatusBar } from "../components/HeaderStatusBar";
import { BottomNavBar } from "../components/BottomNavBar";
import { mobileApi, type MobileUserSession } from "../lib/mobile-api";
import { mobileStorage } from "../lib/mobile-storage";
import { mobileTheme } from "../lib/mobile-theme";

const todayKey = () => new Date().toISOString().slice(0, 10);

interface ReceiptRow {
  transactionId: string;
  transactionNo: string;
  customerName: string;
  totalAmount: number;
  completedAt: string | null;
  storeName: string;
  payments: Array<{ method: string; tenderMethodCode: string | null; tenderMethodName: string | null; amount: number; reference: string | null }>;
  lines: Array<{ sourceLineId: string; productCode: string; productName: string; soldQuantity: number; returnedQuantity: number; eligibleQuantity: number; unitPrice: number; lineTotal: number; unitOfMeasure: string }>;
}

export default function ReturnsScreen() {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<MobileUserSession | null>(null);
  const [dateKey, setDateKey] = useState<string>(todayKey());
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [receipt, setReceipt] = useState<ReceiptRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { void mobileStorage.getUserSnapshot<MobileUserSession>().then(setSession); }, []);

  const loadReceipts = useCallback(async (day: string, search: string) => {
    setLoading(true);
    setMessage(null);
    const response = await mobileApi.searchReceipts(search, day);
    setLoading(false);
    if (response.ok) setRows(response.data ?? []);
    else setMessage(response.error || "Receipt search failed.");
  }, []);

  useEffect(() => { void loadReceipts(dateKey, ""); }, [dateKey, loadReceipts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadReceipts(dateKey, query.trim()).finally(() => setRefreshing(false));
  }, [dateKey, query, loadReceipts]);

  const openDatePicker = () => {
    const current = new Date(`${dateKey}T12:00:00Z`);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        maximumDate: new Date(),
        onChange: (_event, selected) => {
          if (selected) {
            setDateKey(selected.toISOString().slice(0, 10));
            setReceipt(null);
          }
        }
      });
    } else {
      setShowIosPicker(true);
    }
  };

  const returnTotal = receipt
    ? receipt.lines.reduce((sum, line) => sum + line.eligibleQuantity * line.unitPrice, 0)
    : 0;

  const processReturn = () => {
    if (!receipt) return;
    const returnLines = receipt.lines
      .filter((line) => line.eligibleQuantity > 0)
      .map((line) => ({ sourceLineId: line.sourceLineId, quantity: line.eligibleQuantity }));
    if (returnLines.length === 0) {
      setMessage("Nothing is left to return on this receipt.");
      return;
    }
    Alert.alert(
      `Process return for ${receipt.transactionNo}?`,
      `The refund posts the exact original details in negative (GHS ${returnTotal.toFixed(2)} back to the customer, quantities restored). This cannot be edited afterwards.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Process Return",
          style: "destructive",
          onPress: async () => {
            setSubmitting(true);
            setMessage(null);
            // payments left empty: HQ mirrors the ORIGINAL tender methods in
            // negative so the net financial effect is zero.
            const response = await mobileApi.submitCorrection({
              sourceTransactionNo: receipt.transactionNo,
              correctionType: "RETURN",
              returnLines,
              saleLines: [],
              payments: [],
              note: `Full refund processed from mobile POS for ${receipt.transactionNo}`
            });
            setSubmitting(false);
            if (!response.ok) {
              setMessage(response.error || "Return failed.");
              return;
            }
            setReceipt(null);
            void loadReceipts(dateKey, query.trim());
            if ((response.data as any)?.receipt) {
              await mobileStorage.setLastReceipt((response.data as any).receipt);
              router.replace({ pathname: "/receipt", params: { autoprint: "1" } } as any);
            } else {
              setMessage(response.message || "Return completed.");
            }
          }
        }
      ]
    );
  };

  return (
    <View style={s.container}>
      <HeaderStatusBar />
      <View style={s.header}>
        <TouchableOpacity onPress={() => { try { router.dismissTo("/"); } catch { router.replace("/"); } }}>
          <Ionicons name="home-outline" size={23} color={mobileTheme.textColor} />
        </TouchableOpacity>
        <Text style={s.title}>Returns & Refunds</Text>
        <View style={{ width: 23 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: 110 + Math.max(insets.bottom, 0) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Day selector + optional receipt search */}
        <View style={s.dateRow}>
          <TouchableOpacity style={s.dateButton} onPress={openDatePicker}>
            <Ionicons name="calendar-outline" size={18} color={mobileTheme.primary} />
            <Text style={s.dateButtonText}>{dateKey === todayKey() ? "Today" : dateKey}</Text>
          </TouchableOpacity>
          <TextInput
            style={s.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Or type receipt no / customer"
            onSubmitEditing={() => void loadReceipts(dateKey, query.trim())}
          />
          <TouchableOpacity style={s.searchBtn} onPress={() => void loadReceipts(dateKey, query.trim())}>
            {loading ? <ActivityIndicator color="#fff" /> : <Ionicons name="search" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
        {showIosPicker && (
          <DateTimePicker
            value={new Date(`${dateKey}T12:00:00Z`)}
            mode="date"
            maximumDate={new Date()}
            display="spinner"
            onChange={(_event, selected) => {
              setShowIosPicker(false);
              if (selected) {
                setDateKey(selected.toISOString().slice(0, 10));
                setReceipt(null);
              }
            }}
          />
        )}

        <Text style={s.hint}>Receipts for {dateKey} load automatically. Choose one to refund — every detail is locked to the original sale.</Text>
        {message && <Text style={s.message}>{message}</Text>}

        {!receipt && rows.map((row) => (
          <TouchableOpacity key={row.transactionId} style={s.card} onPress={() => { setReceipt(row); setMessage(null); }}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{row.transactionNo}</Text>
              <Text style={s.meta}>{row.storeName} · {row.customerName}{row.completedAt ? ` · ${new Date(row.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</Text>
            </View>
            <Text style={s.amount}>GHS {row.totalAmount.toFixed(2)}</Text>
          </TouchableOpacity>
        ))}
        {!receipt && !loading && rows.length === 0 && !message && (
          <Text style={s.hint}>No completed sales found for this day.</Text>
        )}

        {receipt && (
          <View style={s.card}>
            <View style={s.lockedHeader}>
              <Ionicons name="lock-closed" size={16} color={mobileTheme.mutedText} />
              <Text style={s.lockedTitle}>Locked to original sale</Text>
            </View>
            <Text style={s.cardTitle}>{receipt.transactionNo}</Text>
            <Text style={s.meta}>Original shop: {receipt.storeName} · {receipt.customerName}</Text>

            {receipt.lines.map((line) => (
              <View key={line.sourceLineId} style={[s.line, s.disabledBox]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.lineName, s.disabledText]}>{line.productName}</Text>
                  <Text style={[s.meta, s.disabledText]}>
                    {line.eligibleQuantity} of {line.soldQuantity} {line.unitOfMeasure} returnable · GHS {line.unitPrice.toFixed(2)}
                    {line.returnedQuantity > 0 ? ` · ${line.returnedQuantity} already returned` : ""}
                  </Text>
                </View>
                <Text style={[s.amount, s.disabledText]}>- {money(line.eligibleQuantity * line.unitPrice)}</Text>
              </View>
            ))}

            <View style={s.section}>
              <Text style={s.sectionTitle}>REFUND TO ORIGINAL TENDER (read-only)</Text>
              {receipt.payments.map((payment, index) => (
                <View key={index} style={[s.line, s.disabledBox]}>
                  <Text style={[s.lineName, s.disabledText]}>{payment.tenderMethodName || payment.method}</Text>
                  <Text style={[s.amount, s.disabledText]}>- {money(payment.amount)}</Text>
                </View>
              ))}
            </View>

            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Refund amount</Text>
              <Text style={s.total}>GHS {returnTotal.toFixed(2)}</Text>
            </View>

            <TouchableOpacity style={[s.submit, submitting && s.disabledBox]} onPress={processReturn} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Ionicons name="return-down-back" size={18} color="#fff" />}
              <Text style={s.submitText}>Process Return</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.backToList} onPress={() => setReceipt(null)}>
              <Text style={s.backToListText}>Choose a different receipt</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <BottomNavBar session={session} active="sales" />
    </View>
  );
}

const money = (value: number) => value.toFixed(2);

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: mobileTheme.screenBackground },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 15, backgroundColor: mobileTheme.surfaceBackground, borderBottomWidth: 1, borderBottomColor: mobileTheme.borderColor },
  title: { fontSize: 18, fontWeight: "900", color: mobileTheme.textColor },
  content: { padding: 16, gap: 12 },
  dateRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  dateButton: { flexDirection: "row", alignItems: "center", gap: 6, height: 46, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: mobileTheme.primary, backgroundColor: mobileTheme.primaryLight },
  dateButtonText: { fontWeight: "800", color: mobileTheme.primaryDark },
  input: { flex: 1, height: 46, borderWidth: 1, borderColor: mobileTheme.borderColor, borderRadius: 10, paddingHorizontal: 12, backgroundColor: "#fff", color: mobileTheme.textColor },
  searchBtn: { width: 48, height: 46, alignItems: "center", justifyContent: "center", backgroundColor: mobileTheme.primary, borderRadius: 10 },
  hint: { fontSize: 12, color: mobileTheme.mutedText, lineHeight: 17 },
  message: { padding: 10, color: mobileTheme.danger, backgroundColor: mobileTheme.dangerLight, borderRadius: 8, fontWeight: "700" },
  card: { padding: 16, gap: 9, borderRadius: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: mobileTheme.borderColor },
  cardTitle: { fontSize: 15, fontWeight: "900", color: mobileTheme.textColor },
  meta: { fontSize: 12, color: mobileTheme.mutedText },
  amount: { fontWeight: "900", color: mobileTheme.danger },
  lockedHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  lockedTitle: { fontSize: 11, fontWeight: "900", color: mobileTheme.mutedText, textTransform: "uppercase", letterSpacing: 0.8 },
  line: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: mobileTheme.borderColor },
  lineName: { fontWeight: "800", color: mobileTheme.textColor },
  disabledBox: { opacity: 0.55 },
  disabledText: { color: mobileTheme.mutedText },
  section: { gap: 4, marginTop: 4 },
  sectionTitle: { fontSize: 11, fontWeight: "900", color: mobileTheme.mutedText, letterSpacing: 0.6 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontWeight: "800", color: mobileTheme.textColor },
  total: { fontSize: 20, fontWeight: "900", color: mobileTheme.danger },
  submit: { flexDirection: "row", padding: 15, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: mobileTheme.danger, borderRadius: 12, ...mobileTheme.shadowMedium },
  submitText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  backToList: { alignItems: "center", paddingVertical: 6 },
  backToListText: { color: mobileTheme.primary, fontWeight: "800" }
});
