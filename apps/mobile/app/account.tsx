import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";

import { HeaderStatusBar } from "../components/HeaderStatusBar";
import { mobileApi, type MobileUserSession } from "../lib/mobile-api";
import { mobileStorage } from "../lib/mobile-storage";
import { mobileReceiptStore } from "../lib/mobile-receipt-store";
import { mobileTheme } from "../lib/mobile-theme";
import { mobileOfflineDb } from "../lib/mobile-offline-db";

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<MobileUserSession | null>(null);
  const [serverUrl, setServerUrl] = useState("");
  const [serverDraft, setServerDraft] = useState("");
  const [serverTesting, setServerTesting] = useState(false);
  const [serverPing, setServerPing] = useState<{ testing: boolean; alive?: boolean; latencyMs?: number } | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [hasLastReceipt, setHasLastReceipt] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [diagCount, setDiagCount] = useState(0);
  const [diagVisible, setDiagVisible] = useState(false);
  const [diagText, setDiagText] = useState("");
  const [diagBusy, setDiagBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      mobileStorage.getUserSnapshot<MobileUserSession>(),
      mobileStorage.getServerUrl(),
    ]).then(async ([snapshot, url]) => {
      setUser(snapshot);
      setServerUrl(url);
      setServerDraft(url);
      const fileReceipt = await mobileReceiptStore.loadLastReceipt();
      const legacyReceipt = fileReceipt ? null : await mobileStorage.getLastReceipt();
      setHasLastReceipt(Boolean(fileReceipt || legacyReceipt));
      void Promise.all([mobileStorage.getBiometricLockEnabled(), LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]).then(([enabled, hardware, enrolled]) => { setBiometricEnabled(enabled); setBiometricAvailable(hardware && enrolled); });
      void mobileApi.fetchProfile().then((response) => { if (response.ok && response.data) { setDisplayName(response.data.displayName); setEmail(response.data.email || ""); } });
      void mobileApi.readErrorLog().then((entries) => setDiagCount(entries.length)).catch(() => setDiagCount(0));
    });
  }, []);

  const saveProfile = async () => {
    if (!displayName.trim()) { setFeedback({ type: "error", message: "Display name is required." }); return; }
    setProfileSaving(true);
    const response = await mobileApi.updateProfile({ displayName: displayName.trim(), email: email.trim() || null });
    setProfileSaving(false);
    if (!response.ok) { setFeedback({ type: "error", message: response.error || "Profile update failed." }); return; }
    const refreshed = await mobileApi.fetchSession();
    if (refreshed.data) setUser(refreshed.data);
    setFeedback({ type: "success", message: "Your profile was updated successfully." });
  };

  const handleTestServer = async () => {
    const candidate = serverDraft.trim();
    if (!candidate) { setFeedback({ type: "error", message: "Enter the Enterprise server address first." }); return; }
    setServerTesting(true);
    setServerPing({ testing: true });
    try {
      await mobileStorage.setServerUrl(candidate);
      setServerUrl(candidate);
      const result = await mobileApi.checkServerHealth();
      setServerPing({ testing: false, alive: result.ok, latencyMs: result.latencyMs });
      setFeedback(result.ok
        ? { type: "success", message: `Enterprise API online (${result.latencyMs}ms).` }
        : { type: "error", message: "Server unreachable — check the URL and VPS firewall." });
    } catch (error: any) {
      setServerPing({ testing: false, alive: false });
      setFeedback({ type: "error", message: error.message || "Connection test failed." });
    } finally {
      setServerTesting(false);
    }
  };

  const changePassword = async () => {
    setFeedback(null);
    if (!currentPassword || !nextPassword) {
      setFeedback({ type: "error", message: "Enter your current and new passwords." });
      return;
    }
    if (nextPassword !== confirmPassword) {
      setFeedback({ type: "error", message: "The new password confirmation does not match." });
      return;
    }
    if (nextPassword.length < 8) {
      setFeedback({ type: "error", message: "Your new password must contain at least 8 characters." });
      return;
    }
    setSaving(true);
    const response = await mobileApi.changePassword({ currentPassword, nextPassword });
    setSaving(false);
    if (!response.ok) {
      setFeedback({ type: "error", message: response.error || "Password update failed." });
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCurrentPassword("");
    setNextPassword("");
    setConfirmPassword("");
    setFeedback({ type: "success", message: "Your password was updated successfully." });
  };

  const clearOfflineCatalog = async () => {
    const stats = await mobileOfflineDb.getOutboxStats();
    if (stats.pending + stats.failed > 0) {
      Alert.alert("Catalog cannot be cleared", `Sync ${stats.pending + stats.failed} pending transaction(s) before clearing offline data.`);
      return;
    }
    Alert.alert("Clear offline catalog", "Downloaded products will be removed from this device. Your account and completed transactions are not deleted.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear Catalog", style: "destructive", onPress: async () => { await mobileOfflineDb.clearProducts(); setFeedback({ type: "success", message: "Offline product catalog cleared." }); } }
    ]);
  };

  const openDiagnostics = async () => {
    setDiagBusy(true);
    try {
      const exported = await mobileApi.exportErrorLog();
      setDiagText(exported);
      setDiagVisible(true);
      const entries = await mobileApi.readErrorLog();
      setDiagCount(entries.length);
    } finally {
      setDiagBusy(false);
    }
  };

  const shareDiagnostics = async () => {
    try {
      const exported = diagText || (await mobileApi.exportErrorLog());
      await Share.share({ message: exported, title: "Flash ERP diagnostics" });
    } catch {
      // Share sheet dismissed or unavailable.
    }
  };

  const clearDiagnostics = () => {
    Alert.alert("Clear diagnostics", "Remove all saved error details from this device?", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: async () => { await mobileApi.clearErrorLog(); setDiagCount(0); setDiagText(""); setDiagVisible(false); } }
    ]);
  };

  const signOut = () => {
    Alert.alert("Sign out", "Do you want to sign out of Flash ERP on this device? Unsynced transactions will remain on this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await mobileApi.signOut();
          // Protected navigation already removed authenticated screens.
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <HeaderStatusBar />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={22} color={mobileTheme.textColor} />
        </TouchableOpacity>
        <Text style={styles.title}>My Account</Text>
        <View style={styles.iconButton} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 + Math.max(insets.bottom, 0) }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.profileCard}>
          <View style={styles.avatar}><Text style={styles.initials}>{(user?.displayName || "U").slice(0, 2).toUpperCase()}</Text></View>
          <View style={styles.profileText}>
            <Text style={styles.name}>{user?.displayName || "Flash ERP User"}</Text>
            <Text style={styles.login}>{user?.loginId}</Text>
            <Text style={styles.shop}>{user?.homeStoreName || "No shop assigned"}</Text>
          </View>
          <View style={styles.activePill}><Text style={styles.activeText}>{user?.accountStatus || "ACTIVE"}</Text></View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account access</Text>
          <InfoRow icon="shield-checkmark-outline" label="Roles" value={user?.roleCodes?.join(", ") || "No role assigned"} />
          <InfoRow icon="storefront-outline" label="Home shop" value={user?.homeStoreName || "Not assigned"} />
          <InfoRow icon="time-outline" label="Session expires" value={user?.expiresAt ? new Date(user.expiresAt).toLocaleString() : "Unknown"} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Enterprise server</Text>
          <Text style={styles.helper}>HQ connection address. Update it here after the first run — it is hidden on the sign-in screen once configured.</Text>
          <View style={styles.serverRow}>
            <TextInput
              style={styles.input}
              value={serverDraft}
              onChangeText={setServerDraft}
              placeholder="http://your-vps:3000"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TouchableOpacity
              style={[styles.testServerButton, serverTesting && styles.disabled]}
              onPress={handleTestServer}
              disabled={serverTesting}
            >
              {serverTesting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.testServerText}>Test & Save</Text>}
            </TouchableOpacity>
          </View>
          {serverPing && !serverPing.testing && (
            <View style={styles.pingRow}>
              <View style={[styles.pingDot, { backgroundColor: serverPing.alive ? mobileTheme.accent : mobileTheme.danger }]} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: serverPing.alive ? mobileTheme.accentDark : mobileTheme.danger }}>
                {serverPing.alive ? `Enterprise API online (${serverPing.latencyMs}ms)` : "Unreachable (check URL / VPS firewall)"}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal details</Text>
          <View><Text style={styles.fieldLabel}>Display name</Text><TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} autoCapitalize="words" /></View>
          <View><Text style={styles.fieldLabel}>Email address</Text><TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} /></View>
          <TouchableOpacity style={[styles.saveButton, profileSaving && styles.disabled]} onPress={saveProfile} disabled={profileSaving}>{profileSaving ? <ActivityIndicator color="#fff" /> : <><Ionicons name="save-outline" size={18} color="#fff" /><Text style={styles.saveText}>Save Profile</Text></>}</TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.passwordHeader}>
            <View><Text style={styles.cardTitle}>Change password</Text><Text style={styles.helper}>Update the password used across Flash ERP.</Text></View>
            <TouchableOpacity onPress={() => setShowPasswords((value) => !value)}><Ionicons name={showPasswords ? "eye-off-outline" : "eye-outline"} size={22} color={mobileTheme.primary} /></TouchableOpacity>
          </View>
          <PasswordField label="Current password" value={currentPassword} onChange={setCurrentPassword} visible={showPasswords} />
          <PasswordField label="New password" value={nextPassword} onChange={setNextPassword} visible={showPasswords} />
          <PasswordField label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} visible={showPasswords} />
          {feedback && <View style={[styles.feedback, feedback.type === "success" ? styles.success : styles.error]}><Text style={feedback.type === "success" ? styles.successText : styles.errorText}>{feedback.message}</Text></View>}
          <TouchableOpacity style={[styles.saveButton, saving && styles.disabled]} onPress={changePassword} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <><Ionicons name="key-outline" size={18} color="#fff" /><Text style={styles.saveText}>Update Password</Text></>}
          </TouchableOpacity>
        </View>

        {hasLastReceipt && <View style={styles.card}><Text style={styles.cardTitle}>Last sale receipt</Text><Text style={styles.helper}>Reopen the latest successful online receipt to print or share it again.</Text><TouchableOpacity style={styles.saveButton} onPress={() => router.push("/receipt")}><Ionicons name="receipt-outline" size={18} color="#fff" /><Text style={styles.saveText}>Open Last Receipt</Text></TouchableOpacity></View>}

        <View style={styles.card}><View style={styles.securityRow}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Biometric app lock</Text><Text style={styles.helper}>{biometricAvailable ? "Lock Flash ERP after five minutes away from the app." : "Set up fingerprint or face authentication in your phone settings first."}</Text></View><Switch disabled={!biometricAvailable} value={biometricEnabled} onValueChange={async (enabled) => { if (enabled) { const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Enable Flash ERP biometric lock" }); if (!result.success) return; } await mobileStorage.setBiometricLockEnabled(enabled); setBiometricEnabled(enabled); }} /></View></View>

        <View style={styles.card}><Text style={styles.cardTitle}>Device storage</Text><Text style={styles.helper}>Remove downloaded catalog data when troubleshooting or changing shops. Pending transactions are always protected.</Text><TouchableOpacity style={styles.cacheButton} onPress={clearOfflineCatalog}><Ionicons name="trash-bin-outline" size={18} color={mobileTheme.warning} /><Text style={styles.cacheText}>Clear Offline Catalog</Text></TouchableOpacity></View>

        <View style={styles.diagCard}>
          <View style={styles.diagHeader}>
            <Ionicons name="bug-outline" size={16} color={mobileTheme.mutedText} />
            <Text style={styles.diagTitle}>Diagnostics</Text>
            <Text style={styles.diagCount}>{diagCount} entr{diagCount === 1 ? "y" : "ies"}</Text>
          </View>
          <Text style={styles.diagHelper}>Connection and sync errors are recorded here (never your password). Open, then share with HQ support when asked.</Text>
          <View style={styles.diagRow}>
            <TouchableOpacity style={styles.diagButton} onPress={openDiagnostics} disabled={diagBusy}>
              {diagBusy ? <ActivityIndicator size="small" color={mobileTheme.primary} /> : <><Ionicons name="document-text-outline" size={16} color={mobileTheme.primary} /><Text style={styles.diagButtonText}>View</Text></>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.diagButton} onPress={shareDiagnostics}>
              <Ionicons name="share-social-outline" size={16} color={mobileTheme.primary} />
              <Text style={styles.diagButtonText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.diagButton} onPress={clearDiagnostics}>
              <Ionicons name="trash-outline" size={16} color={mobileTheme.mutedText} />
              <Text style={styles.diagButtonMuted}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Ionicons name="log-out-outline" size={20} color={mobileTheme.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
      <Modal visible={diagVisible} transparent animationType="slide" onRequestClose={() => setDiagVisible(false)}>
        <View style={styles.diagBackdrop}>
          <View style={[styles.diagModal, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            <View style={styles.diagModalHeader}>
              <Text style={styles.diagModalTitle}>Error details for HQ support</Text>
              <TouchableOpacity onPress={() => setDiagVisible(false)}>
                <Ionicons name="close-circle" size={24} color={mobileTheme.neutralMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.diagHelper}>Long-press the text to copy it, or use Share to send it (e.g. WhatsApp or email).</Text>
            <ScrollView style={styles.diagScroll}>
              <Text selectable style={styles.diagPre}>{diagText || "No errors recorded yet."}</Text>
            </ScrollView>
            <View style={styles.diagRow}>
              <TouchableOpacity style={styles.diagPrimary} onPress={shareDiagnostics}>
                <Ionicons name="share-social-outline" size={18} color="#fff" />
                <Text style={styles.diagPrimaryText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.diagButton} onPress={() => setDiagVisible(false)}>
                <Text style={styles.diagButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function InfoRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return <View style={styles.infoRow}><Ionicons name={icon} size={19} color={mobileTheme.primary} /><View style={{ flex: 1 }}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View></View>;
}
function PasswordField({ label, value, onChange, visible }: { label: string; value: string; onChange: (value: string) => void; visible: boolean }) {
  return <View><Text style={styles.fieldLabel}>{label}</Text><TextInput style={styles.input} value={value} onChangeText={onChange} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} /></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mobileTheme.screenBackground },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, backgroundColor: mobileTheme.surfaceBackground, borderBottomWidth: 1, borderBottomColor: mobileTheme.borderColor },
  iconButton: { width: 36, padding: 6 }, title: { fontSize: 18, fontWeight: "900", color: mobileTheme.textColor },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: mobileTheme.radiusLarge, backgroundColor: mobileTheme.primary },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.2)" }, initials: { color: "#fff", fontWeight: "900", fontSize: 18 },
  profileText: { flex: 1 }, name: { color: "#fff", fontWeight: "900", fontSize: 17 }, login: { color: "#dbeafe", fontSize: 13 }, shop: { color: "#bfdbfe", fontSize: 12, marginTop: 2 },
  activePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.18)" }, activeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  card: { padding: 16, gap: 13, borderRadius: mobileTheme.radiusLarge, borderWidth: 1, borderColor: mobileTheme.borderColor, backgroundColor: mobileTheme.surfaceBackground },
  cardTitle: { fontSize: 16, fontWeight: "900", color: mobileTheme.textColor }, helper: { fontSize: 12, color: mobileTheme.mutedText, marginTop: 2 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 4 }, infoLabel: { fontSize: 11, textTransform: "uppercase", fontWeight: "700", color: mobileTheme.mutedText }, infoValue: { fontSize: 13, color: mobileTheme.textColor, marginTop: 2 },
  passwordHeader: { flexDirection: "row", justifyContent: "space-between" }, fieldLabel: { fontSize: 12, fontWeight: "700", color: mobileTheme.mutedText, marginBottom: 5 },
  input: { height: 46, borderWidth: 1, borderColor: mobileTheme.borderColor, borderRadius: mobileTheme.radiusMedium, paddingHorizontal: 12, color: mobileTheme.textColor },
  feedback: { padding: 10, borderRadius: 8 }, success: { backgroundColor: mobileTheme.accentLight }, error: { backgroundColor: mobileTheme.dangerLight }, successText: { color: mobileTheme.accentDark, fontWeight: "700" }, errorText: { color: mobileTheme.danger, fontWeight: "700" },
  saveButton: { height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: mobileTheme.radiusMedium, backgroundColor: mobileTheme.primary }, saveText: { color: "#fff", fontWeight: "800" }, disabled: { opacity: 0.6 },
  serverRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  testServerButton: { height: 46, paddingHorizontal: 16, borderRadius: mobileTheme.radiusMedium, backgroundColor: mobileTheme.neutralDark, alignItems: "center", justifyContent: "center" },
  testServerText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  pingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  pingDot: { width: 8, height: 8, borderRadius: 4 },
  securityRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  cacheButton: { height: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: mobileTheme.radiusMedium, borderWidth: 1, borderColor: mobileTheme.warning }, cacheText: { color: mobileTheme.warning, fontWeight: "800" },
  logoutButton: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: mobileTheme.radiusMedium, borderWidth: 1, borderColor: mobileTheme.danger }, logoutText: { color: mobileTheme.danger, fontWeight: "900" },
  diagCard: { padding: 14, gap: 8, borderRadius: mobileTheme.radiusMedium, borderWidth: 1, borderColor: mobileTheme.borderColor, backgroundColor: mobileTheme.surfaceBackground },
  diagHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  diagTitle: { fontSize: 13, fontWeight: "800", color: mobileTheme.mutedText, flex: 1 },
  diagCount: { fontSize: 11, fontWeight: "700", color: mobileTheme.mutedText },
  diagHelper: { fontSize: 11, color: mobileTheme.mutedText, lineHeight: 16 },
  diagRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  diagButton: { flex: 1, height: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: mobileTheme.radiusSmall, borderWidth: 1, borderColor: mobileTheme.borderColor },
  diagButtonText: { color: mobileTheme.primary, fontWeight: "800", fontSize: 13 },
  diagButtonMuted: { color: mobileTheme.mutedText, fontWeight: "800", fontSize: 13 },
  diagBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.7)", justifyContent: "flex-end" },
  diagModal: { maxHeight: "86%", backgroundColor: mobileTheme.surfaceBackground, borderTopLeftRadius: mobileTheme.radiusLarge, borderTopRightRadius: mobileTheme.radiusLarge, padding: 18, gap: 10 },
  diagModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  diagModalTitle: { fontSize: 16, fontWeight: "800", color: mobileTheme.textColor },
  diagScroll: { maxHeight: 420, borderWidth: 1, borderColor: mobileTheme.borderColor, borderRadius: mobileTheme.radiusSmall, backgroundColor: "#020617" },
  diagPre: { padding: 12, color: "#cbd5e1", fontSize: 11, fontFamily: "monospace" },
  diagPrimary: { flex: 1, height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: mobileTheme.radiusSmall, backgroundColor: mobileTheme.primary },
  diagPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
