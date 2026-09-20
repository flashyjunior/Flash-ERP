import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { mobileTheme } from "../lib/mobile-theme";
import { mobileStorage, DEFAULT_SERVER_URL } from "../lib/mobile-storage";
import { mobileApi } from "../lib/mobile-api";

export default function LoginScreen() {
  const [serverUrl, setServerUrl] = useState<string>(DEFAULT_SERVER_URL);
  // The HQ server field is a first-run step: once the operator has configured
  // and signed in with it, it moves to My Account (Enterprise server) and is
  // no longer shown on every sign-in.
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null);
  const [loginId, setLoginId] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [pingStatus, setPingStatus] = useState<{ testing: boolean; alive?: boolean; latencyMs?: number } | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(() => mobileStorage.getSessionMessage());

  useEffect(() => {
    void Promise.all([
      mobileStorage.getServerUrl().catch((error) => {
        console.warn("[flash-erp:mobile] Failed reading server URL; using default.", error);
        return DEFAULT_SERVER_URL;
      }),
      mobileStorage.hasSavedServerUrl().catch(() => false)
    ]).then(([url, configured]) => {
      setServerUrl(url);
      setServerConfigured(configured);
    });
  }, []);

  const handleTestConnection = async () => {
    Haptics.selectionAsync();
    setPingStatus({ testing: true });
    try {
      await mobileStorage.setServerUrl(serverUrl);
      const result = await mobileApi.checkServerHealth();
      setPingStatus({ testing: false, alive: result.ok, latencyMs: result.latencyMs });
      if (result.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (error) {
      console.warn("[flash-erp:mobile] Connection test failed.", error);
      setPingStatus({ testing: false, alive: false });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleSignIn = async () => {
    if (!loginId.trim() || !password) {
      setErrorMessage("Enter your Login ID and Password.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      await mobileStorage.setServerUrl(serverUrl);
      const res = await mobileApi.signIn({ loginId: loginId.trim(), password });
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setErrorMessage(res.error || "Invalid credentials or server rejected sign-in.");
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage(err.message || "Failed to reach Flash ERP server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 24}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {/* Brand Header */}
        <View style={styles.brandHero}>
          <View style={styles.logoBadge}>
            <Ionicons name="flash" size={32} color="#ffffff" />
          </View>
          <Text style={styles.brandTitle}>FLASH ERP</Text>
          <Text style={styles.brandSubtitle}>Mobile Operational Companion</Text>
        </View>

        {/* Server Endpoint Configuration — first run only. Once configured it
            lives under My Account › Enterprise server. */}
        {serverConfigured === false ? (
          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>Enterprise Server Host (First Run)</Text>
            <Text style={styles.serverHint}>Point this device at your Flash ERP Enterprise API. You can change it any time from My Account.</Text>
            <View style={styles.serverRow}>
              <TextInput
                style={styles.serverInput}
                value={serverUrl}
                onChangeText={setServerUrl}
                placeholder="http://your-vps:3000"
                placeholderTextColor={mobileTheme.neutralMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.pingButton}
                onPress={handleTestConnection}
                disabled={pingStatus?.testing}
              >
                {pingStatus?.testing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.pingButtonText}>Test</Text>
                )}
              </TouchableOpacity>
            </View>

            {pingStatus && !pingStatus.testing && (
              <View style={styles.pingResultRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: pingStatus.alive ? mobileTheme.accent : mobileTheme.danger }
                  ]}
                />
                <Text
                  style={[
                    styles.pingResultText,
                    { color: pingStatus.alive ? mobileTheme.accentDark : mobileTheme.danger }
                  ]}
                >
                  {pingStatus.alive
                    ? `Enterprise API online (${pingStatus.latencyMs}ms)`
                    : "Unreachable (Check URL / VPS firewall)"}
                </Text>
              </View>
            )}
          </View>
        ) : serverConfigured ? (
          <View style={styles.serverSummary}>
            <Ionicons name="server-outline" size={16} color={mobileTheme.primary} />
            <Text style={styles.serverSummaryText} numberOfLines={1}>Signing in via {serverUrl}</Text>
            <Text style={styles.serverSummaryLink}>Change in My Account</Text>
          </View>
        ) : null}

        {/* Credentials Form */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Operator Sign In</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Login ID / Username</Text>
            <View style={styles.inputFieldContainer}>
              <Ionicons name="person-outline" size={20} color={mobileTheme.neutralMuted} />
              <TextInput
                style={styles.textInput}
                value={loginId}
                onChangeText={setLoginId}
                placeholder="e.g. hq.admin or cashier01"
                placeholderTextColor={mobileTheme.neutralMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputFieldContainer}>
              <Ionicons name="lock-closed-outline" size={20} color={mobileTheme.neutralMuted} />
              <TextInput
                style={styles.textInput}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••••••"
                placeholderTextColor={mobileTheme.neutralMuted}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={mobileTheme.neutralMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          {errorMessage && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={mobileTheme.danger} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.signInButton, loading && styles.signInButtonDisabled]}
            onPress={handleSignIn}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Text style={styles.signInButtonText}>Login</Text>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: mobileTheme.screenBackground
  },
  scrollContent: {
    padding: 20,
    gap: 20,
    justifyContent: "center",
    flexGrow: 1,
    minHeight: "100%",
    paddingBottom: 40
  },
  brandHero: {
    alignItems: "center",
    gap: 8,
    marginVertical: 10
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: mobileTheme.primary,
    justifyContent: "center",
    alignItems: "center",
    ...mobileTheme.shadowMedium
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: mobileTheme.textColor,
    letterSpacing: 1.5
  },
  brandSubtitle: {
    fontSize: 14,
    color: mobileTheme.mutedText,
    fontWeight: "600"
  },
  card: {
    backgroundColor: mobileTheme.surfaceBackground,
    borderRadius: mobileTheme.radiusLarge,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    padding: 20,
    gap: 14,
    ...mobileTheme.shadowSmall
  },
  cardSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: mobileTheme.mutedText
  },
  serverHint: {
    fontSize: 12,
    color: mobileTheme.mutedText,
    lineHeight: 16
  },
  serverSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: mobileTheme.primaryLight,
    borderRadius: mobileTheme.radiusMedium,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  serverSummaryText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: mobileTheme.primaryDark
  },
  serverSummaryLink: {
    fontSize: 11,
    fontWeight: "800",
    color: mobileTheme.primary
  },
  serverRow: {
    flexDirection: "row",
    gap: 8
  },
  serverInput: {
    flex: 1,
    height: 46,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    borderRadius: mobileTheme.radiusMedium,
    paddingHorizontal: 12,
    fontSize: 14,
    color: mobileTheme.textColor,
    backgroundColor: mobileTheme.neutralLight
  },
  pingButton: {
    backgroundColor: mobileTheme.neutralDark,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: mobileTheme.radiusMedium
  },
  pingButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13
  },
  pingResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  pingResultText: {
    fontSize: 12,
    fontWeight: "600"
  },
  inputGroup: {
    gap: 6
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: mobileTheme.softText
  },
  inputFieldContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    borderRadius: mobileTheme.radiusMedium,
    paddingHorizontal: 12,
    height: 48,
    backgroundColor: mobileTheme.neutralLight,
    gap: 10
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: mobileTheme.textColor
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: mobileTheme.dangerLight,
    padding: 12,
    borderRadius: mobileTheme.radiusMedium,
    gap: 8
  },
  errorText: {
    flex: 1,
    color: mobileTheme.danger,
    fontSize: 13,
    fontWeight: "600"
  },
  signInButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileTheme.primary,
    paddingVertical: 14,
    borderRadius: mobileTheme.radiusMedium,
    gap: 8,
    marginTop: 6,
    ...mobileTheme.shadowMedium
  },
  signInButtonDisabled: {
    opacity: 0.6
  },
  signInButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  }
});
