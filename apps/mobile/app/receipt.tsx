import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import { HeaderStatusBar } from "../components/HeaderStatusBar";
import { BottomNavBar } from "../components/BottomNavBar";
import { mobileStorage } from "../lib/mobile-storage";
import { mobileReceiptStore } from "../lib/mobile-receipt-store";
import { mobileTheme } from "../lib/mobile-theme";
import type { MobileUserSession } from "../lib/mobile-api";

type Receipt = { retailOrgName: string; storeName: string; storeAddress?: string | null; transactionNo: string; completedAt: string; cashierCode: string; currencyCode: string; customerName: string; subtotalAmount: number; discountAmount: number; taxAmount: number; totalAmount: number; paidAmount: number; changeAmount: number; receiptHeader?: string | null; receiptFooter?: string | null; lines: Array<{ productCode: string; productName: string; quantity: number; sellingUnitOfMeasure: string; unitPrice: number; lineTotal: number }>; payments: Array<{ tenderMethodName: string | null; method: string; amount: number; reference: string | null }> };

function isValidReceipt(value: unknown): value is Receipt {
  if (!value || typeof value !== "object") return false;
  return Array.isArray((value as Receipt).lines) && Array.isArray((value as Receipt).payments);
}

export default function ReceiptScreen() {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [ready, setReady] = useState(false);
  const [printState, setPrintState] = useState<{ printing: boolean; error: string | null }>({ printing: false, error: null });
  const [sharing, setSharing] = useState(false);
  const [session, setSession] = useState<MobileUserSession | null>(null);
  const insets = useSafeAreaInsets();
  useEffect(() => { void mobileStorage.getUserSnapshot<MobileUserSession>().then(setSession); }, []);
  useEffect(() => {
    // File store first (no size limit), then the legacy SecureStore copy so
    // receipts saved by earlier app versions are still re-printable.
    void mobileReceiptStore
      .loadLastReceipt<Receipt>()
      .then((saved) => (isValidReceipt(saved) ? saved : null))
      .then(async (fileReceipt) => {
        if (fileReceipt) return fileReceipt;
        const legacy = await mobileStorage.getLastReceipt<Receipt>().catch(() => null);
        return isValidReceipt(legacy) ? legacy : null;
      })
      .catch(() => null)
      .then((saved) => setReceipt(saved))
      .finally(() => setReady(true));
  }, []);
  if (ready && !receipt) return <View style={styles.loading}><Text>No saved receipt is available.</Text><TouchableOpacity accessibilityRole="button" onPress={() => { try { router.dismissTo("/"); } catch { router.replace("/"); } }}><Text style={styles.doneText}>Back to dashboard</Text></TouchableOpacity></View>;
  if (!receipt) return <View style={styles.loading}><ActivityIndicator color={mobileTheme.primary} /><Text>Loading receipt…</Text></View>;
  const money = (value: number) => `${receipt.currencyCode} ${Number(value).toFixed(2)}`;
  const buildReceiptHtml = () => {
    const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
    const lineHtml = receipt.lines.map((line) => `<tr><td>${escape(line.quantity)} × ${escape(line.productName)}<small>${escape(line.sellingUnitOfMeasure)} @ ${escape(money(line.unitPrice))}</small></td><td>${escape(money(line.lineTotal))}</td></tr>`).join("");
    const paymentHtml = receipt.payments.map((payment) => `<tr><td>${escape(payment.tenderMethodName || payment.method)}</td><td>${escape(money(payment.amount))}</td></tr>`).join("");
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>@page{margin:8mm}body{font-family:monospace;font-size:11px;color:#000;max-width:76mm;margin:auto}h1,h2,p{text-align:center;margin:3px}table{width:100%;border-collapse:collapse}td{padding:4px 0;border-bottom:1px dashed #aaa}td:last-child{text-align:right;font-weight:bold}small{display:block;color:#555}.total{font-size:15px;font-weight:bold}</style></head><body><h1>${escape(receipt.retailOrgName)}</h1><h2>${escape(receipt.storeName)}</h2><p>${escape(receipt.storeAddress || "")}</p><p>Receipt ${escape(receipt.transactionNo)}<br>${escape(new Date(receipt.completedAt).toLocaleString())}<br>Customer: ${escape(receipt.customerName)}</p><table>${lineHtml}<tr><td>Subtotal</td><td>${escape(money(receipt.subtotalAmount))}</td></tr><tr><td>Tax</td><td>${escape(money(receipt.taxAmount))}</td></tr><tr class="total"><td>TOTAL</td><td>${escape(money(receipt.totalAmount))}</td></tr>${paymentHtml}${receipt.changeAmount > 0 ? `<tr><td>Change</td><td>${escape(money(receipt.changeAmount))}</td></tr>` : ""}</table><p>${escape(receipt.receiptFooter || "Thank you for shopping with us.")}</p></body></html>`;
  };
  const printReceipt = async () => {
    if (printState.printing) return;
    setPrintState({ printing: true, error: null });
    try {
      await Print.printAsync({ html: buildReceiptHtml() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPrintState({ printing: false, error: null });
    } catch (error: any) {
      // Printing must never block or undo a completed sale — report it and
      // let the cashier share the receipt or retry the print.
      console.warn("[flash-erp:mobile] Receipt printing failed.", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPrintState({ printing: false, error: error?.message || "Printing failed. The sale is complete — use Share, or retry the print." });
    }
  };
  // Coming straight from a completed sale/refund? Pop the print dialog up
  // immediately (offline sales included) so the cashier never misses it.
  const params = useLocalSearchParams<{ autoprint?: string }>();
  const autoPrinted = React.useRef(false);
  useEffect(() => {
    if (ready && receipt && params.autoprint === "1" && !autoPrinted.current) {
      autoPrinted.current = true;
      const timer = setTimeout(() => { void printReceipt(); }, 350);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [ready, receipt, params.autoprint]);

  /** Sharing renders the receipt to a PDF file first, so recipients receive a
   *  proper document instead of plain text. */
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (Platform.OS !== "web") {
        const file = await Print.printToFileAsync({ html: buildReceiptHtml() });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: "application/pdf",
            UTI: "com.adobe.pdf",
            dialogTitle: `Receipt ${receipt.transactionNo}`
          });
          return;
        }
      }
      const lines = receipt.lines.map((line) => `${line.quantity} × ${line.productName} — ${money(line.lineTotal)}`).join("\n");
      await Share.share({ message: `${receipt.retailOrgName}\n${receipt.storeName}\nReceipt ${receipt.transactionNo}\n${lines}\nTOTAL: ${money(receipt.totalAmount)}\nThank you.` });
    } catch {
      // Share sheet dismissed or unavailable.
    } finally {
      setSharing(false);
    }
  };
  const goHome = () => { try { router.dismissTo("/"); } catch { router.replace("/"); } };
  return <View style={styles.container}><HeaderStatusBar /><View style={styles.topBar}><TouchableOpacity onPress={goHome}><Ionicons name="close" size={24} color={mobileTheme.textColor} /></TouchableOpacity><Text style={styles.title}>Receipt {receipt.transactionNo}</Text><TouchableOpacity onPress={share}><Ionicons name="share-social-outline" size={23} color={mobileTheme.primary} /></TouchableOpacity></View><ScrollView contentContainerStyle={[styles.content, { paddingBottom: 110 + Math.max(insets.bottom, 20) }]}><View style={styles.paper}><Text style={styles.org}>{receipt.retailOrgName}</Text><Text style={styles.store}>{receipt.storeName}</Text>{receipt.storeAddress && <Text style={styles.muted}>{receipt.storeAddress}</Text>}<View style={styles.divider} /><Text style={styles.receiptNo}>{receipt.transactionNo}</Text><Text style={styles.muted}>{new Date(receipt.completedAt).toLocaleString()} · {receipt.cashierCode}</Text><Text style={styles.muted}>Customer: {receipt.customerName}</Text><View style={styles.divider} />{receipt.lines.map((line, index) => <View key={`${line.productCode}-${index}`} style={styles.line}><View style={{ flex: 1 }}><Text style={styles.lineName}>{line.productName}</Text><Text style={styles.muted}>{line.quantity} {line.sellingUnitOfMeasure} × {money(line.unitPrice)}</Text></View><Text style={styles.lineTotal}>{money(line.lineTotal)}</Text></View>)}<View style={styles.divider} /><Row label="Subtotal" value={money(receipt.subtotalAmount)} /><Row label="Discount" value={money(receipt.discountAmount)} /><Row label="Tax" value={money(receipt.taxAmount)} /><Row label="TOTAL" value={money(receipt.totalAmount)} strong />{receipt.payments.map((payment, index) => <Row key={index} label={payment.tenderMethodName || payment.method} value={money(payment.amount)} />)}{receipt.changeAmount > 0 && <Row label="Change" value={money(receipt.changeAmount)} strong />}<View style={styles.divider} /><Text style={styles.footer}>{receipt.receiptFooter || "Thank you for shopping with us."}</Text></View>{printState.error && <View style={styles.printError}><Ionicons name="alert-circle" size={18} color={mobileTheme.danger} /><Text style={styles.printErrorText}>{printState.error}</Text></View>}<TouchableOpacity style={styles.printButton} onPress={() => void printReceipt()} disabled={printState.printing}><Ionicons name="print" size={19} color="#fff" /><Text style={styles.shareText}>{printState.printing ? "Preparing print…" : "Print Receipt"}</Text></TouchableOpacity><TouchableOpacity style={styles.shareButton} onPress={share} disabled={sharing}>{sharing ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="share-social" size={19} color="#fff" />}<Text style={styles.shareText}>{sharing ? "Preparing PDF…" : "Share as PDF"}</Text></TouchableOpacity><TouchableOpacity style={styles.doneButton} onPress={goHome}><Text style={styles.doneText}>Done</Text></TouchableOpacity></ScrollView><BottomNavBar session={session} active="sales" /></View>;
}
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) { return <View style={styles.row}><Text style={strong ? styles.strong : styles.rowLabel}>{label}</Text><Text style={strong ? styles.strong : styles.rowValue}>{value}</Text></View>; }
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: mobileTheme.screenBackground }, loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 }, topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, backgroundColor: mobileTheme.surfaceBackground }, title: { fontSize: 16, fontWeight: "900", color: mobileTheme.textColor, flexShrink: 1, marginHorizontal: 8 }, content: { padding: 16, gap: 12 }, paper: { backgroundColor: "#fff", padding: 20, borderRadius: 12, gap: 8, ...mobileTheme.shadowSmall }, org: { textAlign: "center", fontSize: 19, fontWeight: "900" }, store: { textAlign: "center", fontSize: 15, fontWeight: "700" }, muted: { color: mobileTheme.mutedText, fontSize: 12 }, divider: { borderTopWidth: 1, borderStyle: "dashed", borderColor: mobileTheme.borderColor, marginVertical: 7 }, receiptNo: { fontSize: 15, fontWeight: "900" }, line: { flexDirection: "row", gap: 10 }, lineName: { fontSize: 13, fontWeight: "700" }, lineTotal: { fontWeight: "800" }, row: { flexDirection: "row", justifyContent: "space-between" }, rowLabel: { color: mobileTheme.mutedText }, rowValue: { color: mobileTheme.textColor }, strong: { fontSize: 16, fontWeight: "900", color: mobileTheme.textColor }, footer: { textAlign: "center", marginTop: 8, color: mobileTheme.mutedText }, printError: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: mobileTheme.dangerLight, padding: 12, borderRadius: mobileTheme.radiusMedium }, printErrorText: { flex: 1, color: mobileTheme.danger, fontSize: 12, fontWeight: "600" }, printButton: { flexDirection: "row", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, backgroundColor: mobileTheme.accent }, shareButton: { flexDirection: "row", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, backgroundColor: mobileTheme.primary }, shareText: { color: "#fff", fontWeight: "800" }, doneButton: { alignItems: "center", padding: 13 }, doneText: { color: mobileTheme.primary, fontWeight: "800" } });
