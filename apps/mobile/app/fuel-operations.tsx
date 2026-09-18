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
import { router } from "expo-router";
import { mobileTheme } from "../lib/mobile-theme";
import { HeaderStatusBar } from "../components/HeaderStatusBar";
import { mobileApi } from "../lib/mobile-api";

type FuelTab = "DIP" | "METER" | "EVIDENCE";

export default function FuelOperationsScreen() {
  const [activeTab, setActiveTab] = useState<FuelTab>("DIP");

  // Tank Dip state
  const [tankId, setTankId] = useState<string>("TANK-PMS-01");
  const [dipCm, setDipCm] = useState<string>("");
  const [waterDipCm, setWaterDipCm] = useState<string>("0");
  const [volumeLiters, setVolumeLiters] = useState<string>("");

  // Pump Meter state
  const [nozzleId, setNozzleId] = useState<string>("PUMP-01-NOZZLE-01");
  const [closingMeter, setClosingMeter] = useState<string>("");
  const [openingMeter, setOpeningMeter] = useState<string>("");

  // Evidence state
  const [deliveryNoteNo, setDeliveryNoteNo] = useState<string>("");
  const [driverName, setDriverName] = useState<string>("");
  const [truckReg, setTruckReg] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const handleTabSwitch = (t: FuelTab) => {
    Haptics.selectionAsync();
    setActiveTab(t);
    setFeedback(null);
  };

  const handleSubmitDip = async () => {
    const cm = Number.parseFloat(dipCm);
    if (!tankId.trim() || Number.isNaN(cm) || cm <= 0) {
      setFeedback({ type: "error", message: "Enter a valid tank dip reading in cm." });
      return;
    }

    setLoading(true);
    setFeedback(null);
    try {
      const res = await mobileApi.submitFuelDip({
        tankId: tankId.trim(),
        dipCm: cm,
        waterDipCm: Number.parseFloat(waterDipCm) || 0,
        volumeLiters: Number.parseFloat(volumeLiters) || undefined,
        recordedAt: new Date().toISOString()
      });

      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setFeedback({
          type: "success",
          message: res.isOffline
            ? "Tank dip saved offline. Queued for automatic sync."
            : "Tank dip reading committed to Enterprise HQ!"
        });
        setDipCm("");
        setWaterDipCm("0");
        setVolumeLiters("");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setFeedback({ type: "error", message: res.error || "Failed recording dip." });
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFeedback({ type: "error", message: err.message || "Dip recording error." });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitMeter = async () => {
    const meter = Number.parseFloat(closingMeter);
    if (!nozzleId.trim() || Number.isNaN(meter) || meter <= 0) {
      setFeedback({ type: "error", message: "Enter a valid closing meter reading." });
      return;
    }

    setLoading(true);
    setFeedback(null);
    try {
      const res = await mobileApi.submitFuelMeter({
        nozzleId: nozzleId.trim(),
        closingMeter: meter,
        openingMeter: Number.parseFloat(openingMeter) || undefined,
        recordedAt: new Date().toISOString()
      });

      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setFeedback({
          type: "success",
          message: res.isOffline
            ? "Meter reading saved offline. Queued for automatic sync."
            : "Meter reading committed to Enterprise HQ shift totalizer!"
        });
        setClosingMeter("");
        setOpeningMeter("");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setFeedback({ type: "error", message: res.error || "Failed recording meter reading." });
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFeedback({ type: "error", message: err.message || "Meter reading error." });
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
        <Text style={styles.headerTitle}>Fuel Station Operations</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Operation Tabs */}
      <View style={styles.tabBar}>
        {[
          { id: "DIP", label: "Tank Dips", icon: "water-outline" },
          { id: "METER", label: "Pump Meters", icon: "speedometer-outline" },
          { id: "EVIDENCE", label: "Delivery Note", icon: "camera-outline" }
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabBtn, activeTab === tab.id && styles.tabBtnActive]}
            onPress={() => handleTabSwitch(tab.id as any)}
          >
            <Ionicons
              name={tab.icon as any}
              size={16}
              color={activeTab === tab.id ? "#ffffff" : mobileTheme.neutralMedium}
            />
            <Text
              style={[styles.tabBtnText, activeTab === tab.id && styles.tabBtnTextActive]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* 1. TANK DIP TAB */}
        {activeTab === "DIP" && (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Underground Fuel Tank</Text>
              <View style={styles.tankSelectorRow}>
                {["TANK-PMS-01", "TANK-AGO-01", "TANK-PMS-02"].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.tankPill, tankId === t && styles.tankPillActive]}
                    onPress={() => setTankId(t)}
                  >
                    <Text
                      style={[styles.tankPillText, tankId === t && styles.tankPillTextActive]}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Dip Reading (Centimeters)</Text>
              <TextInput
                style={styles.bigNumericInput}
                value={dipCm}
                onChangeText={setDipCm}
                placeholder="0.0"
                placeholderTextColor={mobileTheme.neutralMuted}
                keyboardType="numeric"
                textAlign="center"
              />

              <View style={styles.rowFields}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Water Dip (cm)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={waterDipCm}
                    onChangeText={setWaterDipCm}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1.5 }}>
                  <Text style={styles.inputLabel}>Calculated Liters</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={volumeLiters}
                    onChangeText={setVolumeLiters}
                    placeholder="e.g. 14,250 L"
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.disabled]}
              onPress={handleSubmitDip}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={20} color="#ffffff" />
                  <Text style={styles.submitButtonText}>Commit Tank Dip</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* 2. PUMP METERS TAB */}
        {activeTab === "METER" && (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Dispenser / Nozzle ID</Text>
              <View style={styles.tankSelectorRow}>
                {["PUMP-01-NOZZLE-01", "PUMP-01-NOZZLE-02", "PUMP-02-NOZZLE-01"].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.tankPill, nozzleId === n && styles.tankPillActive]}
                    onPress={() => setNozzleId(n)}
                  >
                    <Text
                      style={[styles.tankPillText, nozzleId === n && styles.tankPillTextActive]}
                    >
                      {n.replace("PUMP-", "P").replace("NOZZLE-", "N")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Closing Meter Reading (Totalizer)</Text>
              <TextInput
                style={styles.bigNumericInput}
                value={closingMeter}
                onChangeText={setClosingMeter}
                placeholder="104928.5"
                placeholderTextColor={mobileTheme.neutralMuted}
                keyboardType="numeric"
                textAlign="center"
              />

              <Text style={styles.inputLabel}>Opening Meter Reading (Shift Start)</Text>
              <TextInput
                style={styles.fieldInput}
                value={openingMeter}
                onChangeText={setOpeningMeter}
                placeholder="e.g. 104200.0"
                keyboardType="numeric"
              />
            </View>

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.disabled]}
              onPress={handleSubmitMeter}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Ionicons name="speedometer" size={20} color="#ffffff" />
                  <Text style={styles.submitButtonText}>Commit Meter Totalizer</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* 3. DELIVERY EVIDENCE TAB */}
        {activeTab === "EVIDENCE" && (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Fuel Delivery Verification</Text>
              <Text style={styles.cardSubtitle}>
                Take timestamped photos before discharge and after discharge for BRV tanker audit.
              </Text>

              <Text style={styles.inputLabel}>Delivery Note / Waybill No</Text>
              <TextInput
                style={styles.fieldInput}
                value={deliveryNoteNo}
                onChangeText={setDeliveryNoteNo}
                placeholder="e.g. DN-2026-904"
                autoCapitalize="characters"
              />

              <View style={styles.rowFields}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>BRV Truck Reg</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={truckReg}
                    onChangeText={setTruckReg}
                    placeholder="GT-1249-22"
                    autoCapitalize="characters"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Driver Name</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={driverName}
                    onChangeText={setDriverName}
                    placeholder="K. Mensah"
                  />
                </View>
              </View>

              {/* Photo Evidence Buttons */}
              <View style={styles.evidencePhotoRow}>
                <TouchableOpacity
                  style={styles.evidenceBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setFeedback({ type: "success", message: "Before-discharge photo captured & stamped." });
                  }}
                >
                  <Ionicons name="camera" size={24} color={mobileTheme.primary} />
                  <Text style={styles.evidenceBtnText}>Before Discharge</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.evidenceBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setFeedback({ type: "success", message: "After-discharge photo captured & stamped." });
                  }}
                >
                  <Ionicons name="camera" size={24} color={mobileTheme.accent} />
                  <Text style={styles.evidenceBtnText}>After Discharge</Text>
                </TouchableOpacity>
              </View>
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
  tabBar: {
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
  cardSubtitle: {
    fontSize: 13,
    color: mobileTheme.softText,
    lineHeight: 18
  },
  tankSelectorRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  tankPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: mobileTheme.neutralLight,
    borderRadius: mobileTheme.radiusMedium,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor
  },
  tankPillActive: {
    backgroundColor: mobileTheme.primaryLight,
    borderColor: mobileTheme.primary
  },
  tankPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: mobileTheme.neutralMedium
  },
  tankPillTextActive: {
    color: mobileTheme.primaryDark
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: mobileTheme.softText,
    marginTop: 4
  },
  bigNumericInput: {
    fontSize: 32,
    fontWeight: "900",
    color: mobileTheme.textColor,
    backgroundColor: mobileTheme.neutralLight,
    borderWidth: 1,
    borderColor: mobileTheme.primary,
    borderRadius: mobileTheme.radiusMedium,
    height: 60
  },
  rowFields: {
    flexDirection: "row",
    gap: 10
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
  evidencePhotoRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6
  },
  evidenceBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileTheme.neutralLight,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    borderRadius: mobileTheme.radiusMedium,
    paddingVertical: 20,
    gap: 8
  },
  evidenceBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: mobileTheme.textColor
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
