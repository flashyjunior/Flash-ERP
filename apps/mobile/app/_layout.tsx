import React, { Component, useEffect, useState, type ReactNode } from "react";
import { AppState, View, Text, TouchableOpacity, StyleSheet, ScrollView, Share } from "react-native";
import { Stack } from "expo-router";
import { mobileStorage } from "../lib/mobile-storage";
import { readMobileSession, type MobileUserSession } from "../lib/mobile-session";
import { canOpenMobileRoute } from "../lib/mobile-access";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { mobileTheme } from "../lib/mobile-theme";
import * as LocalAuthentication from "expo-local-authentication";

const LOG_TAG = "[flash-erp:mobile]";

type ErrorHandler = (error: unknown, isFatal?: boolean) => void;

interface RuntimeErrorUtils {
  getGlobalHandler?: () => ErrorHandler;
  setGlobalHandler?: (handler: ErrorHandler) => void;
}

/**
 * Release builds fail silently: an uncaught error just kills the process and the
 * user sees the app "close without an error". These guards make every fatal
 * error visible (on screen via the boundary, in logcat under [flash-erp:mobile]).
 *
 * Filter logcat with: adb logcat -s ReactNativeJS
 *
 * IMPORTANT: `ErrorUtils` is NOT a runtime export of the "react-native" package
 * (it is only a TypeScript type there); at runtime it exists solely as the
 * global installed by React Native's error-guard polyfill. Importing it from
 * "react-native" type-checks but evaluates to `undefined`, which crashed the
 * root layout module before anything could render. Always read it from the
 * global, and never let this bootstrap code itself throw.
 */
function installCrashGuards(): void {
  try {
    const errorUtils = (globalThis as { ErrorUtils?: RuntimeErrorUtils }).ErrorUtils;
    if (
      errorUtils &&
      typeof errorUtils.getGlobalHandler === "function" &&
      typeof errorUtils.setGlobalHandler === "function"
    ) {
      const previousHandler = errorUtils.getGlobalHandler();
      errorUtils.setGlobalHandler((error, isFatal) => {
        // eslint-disable-next-line no-console
        console.error(
          `${LOG_TAG} FATAL JS ERROR (isFatal=${String(isFatal)}):`,
          error instanceof Error ? (error.stack ?? error.message) : error
        );
        try {
          previousHandler?.(error, isFatal);
        } catch {
          // Never let the handler itself throw.
        }
      });
    }

    const scope = globalThis as {
      addEventListener?: (type: string, listener: (event: unknown) => void) => void;
    };
    if (typeof scope.addEventListener === "function") {
      scope.addEventListener("unhandledrejection", (event: unknown) => {
        const reason = (event as { reason?: unknown } | undefined)?.reason;
        // eslint-disable-next-line no-console
        console.error(
          `${LOG_TAG} UNHANDLED PROMISE REJECTION:`,
          reason instanceof Error ? (reason.stack ?? reason.message) : reason
        );
      });
    }
  } catch (error) {
    // Diagnostics must never be the reason the app fails to boot.
    // eslint-disable-next-line no-console
    console.warn(`${LOG_TAG} Crash guards could not be installed.`, error);
  }
}

installCrashGuards();

class FatalErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error(
      `${LOG_TAG} FATAL UI ERROR:`,
      error.stack ?? error.message,
      info?.componentStack ?? ""
    );
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.fatalContainer}>
          <Text style={styles.fatalTitle}>Flash ERP hit a fatal error</Text>
          <Text style={styles.fatalMessage}>
            {this.state.error.message || String(this.state.error)}
          </Text>
          <ScrollView style={styles.fatalStackBox}>
            <Text style={styles.fatalStack}>{this.state.error.stack}</Text>
          </ScrollView>
          <TouchableOpacity style={styles.fatalButton} onPress={this.handleRetry}>
            <Text style={styles.fatalButtonText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.fatalShareButton}
            onPress={() => {
              const error = this.state.error;
              Share.share({
                title: "Flash ERP fatal error",
                message: `Flash ERP fatal error\n${error?.message ?? "Unknown error"}\n\n${error?.stack ?? ""}`.slice(0, 20000),
              }).catch(() => {});
            }}
          >
            <Text style={styles.fatalShareText}>Share Error Details with HQ IT</Text>
          </TouchableOpacity>
          <Text style={styles.fatalHint}>
            If this keeps happening, close the app fully, reopen it, and report the text above
            (and the logcat tag {LOG_TAG}) to HQ IT.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}



function BiometricLock({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const backgroundedAt = React.useRef<number | null>(null);
  useEffect(() => {
    void mobileStorage.getBiometricLockEnabled().then(setEnabled);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") backgroundedAt.current = Date.now();
      if (state === "active" && enabled && backgroundedAt.current && Date.now() - backgroundedAt.current >= 5 * 60_000) setLocked(true);
    });
    return () => subscription.remove();
  }, [enabled]);
  const unlock = async () => {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock Flash ERP", cancelLabel: "Cancel", disableDeviceFallback: false });
    if (result.success) { backgroundedAt.current = null; setLocked(false); }
  };
  if (locked) return <View style={styles.lockContainer}><View style={styles.lockIcon}><Ionicons name="lock-closed" size={34} color="#fff" /></View><Text style={styles.lockTitle}>Flash ERP is locked</Text><Text style={styles.lockHint}>Authenticate to continue without losing your current work.</Text><TouchableOpacity style={styles.fatalButton} onPress={unlock}><Text style={styles.fatalButtonText}>Unlock</Text></TouchableOpacity></View>;
  return <>{children}</>;
}

function SessionNavigator() {
  const [session, setSession] = useState<MobileUserSession | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    let readVersion = 0;
    const refresh = async () => {
      const version = ++readVersion;
      try {
        const [raw, token] = await Promise.all([mobileStorage.getUserSnapshot(), mobileStorage.getAuthToken()]);
        if (!active || version !== readVersion) return;
        setSession(token ? readMobileSession(raw) : null);
      } catch (error) {
        console.warn(`${LOG_TAG} Session restore failed.`, error);
        if (active && version === readVersion) setSession(null);
      } finally {
        if (active && version === readVersion) setReady(true);
      }
    };
    const unsubscribe = mobileStorage.subscribeSessionChanges(() => { void refresh(); });
    void refresh();
    return () => { active = false; unsubscribe(); };
  }, []);

  // Hydrate before choosing routes so a restored-session deep link is not
  // discarded as unauthorized. No imperative navigation runs during bootstrap.
  if (!ready) return <View style={{ flex: 1, backgroundColor: mobileTheme.screenBackground }} />;
  // Protected screens never mount/fetch without access, and are removed from
  // navigation history immediately on sign-out or revoked permissions.
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: mobileTheme.screenBackground } }}>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="login" options={{ title: "Sign In" }} />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && canOpenMobileRoute(session, "index")}>
          <Stack.Screen name="index" options={{ title: "Flash ERP" }} />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && canOpenMobileRoute(session, "scanner")}>
          <Stack.Screen name="scanner" options={{ title: "Stock & Barcode Lookup" }} />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && canOpenMobileRoute(session, "stock-count")}>
          <Stack.Screen name="stock-count" options={{ title: "Cycle Count" }} />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && canOpenMobileRoute(session, "goods-receipt")}>
          <Stack.Screen name="goods-receipt" options={{ title: "Goods Receiving" }} />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && canOpenMobileRoute(session, "transfers")}>
          <Stack.Screen name="transfers" options={{ title: "Inter-Store Transfers" }} />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && canOpenMobileRoute(session, "cart")}>
          <Stack.Screen name="cart" options={{ title: "Assisted Selling & Cart" }} />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && canOpenMobileRoute(session, "fuel-operations")}>
          <Stack.Screen name="fuel-operations" options={{ title: "Fuel Station Operations" }} />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && canOpenMobileRoute(session, "approvals")}>
          <Stack.Screen name="approvals" options={{ title: "Manager Approvals" }} />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && canOpenMobileRoute(session, "self-service")}>
          <Stack.Screen name="self-service" options={{ title: "HR & Self-Service" }} />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && canOpenMobileRoute(session, "outbox")}>
          <Stack.Screen name="outbox" options={{ title: "Outbox Queue" }} />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && canOpenMobileRoute(session, "account")}>
          <Stack.Screen name="account" options={{ title: "My Account" }} />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && canOpenMobileRoute(session, "receipt")}>
          <Stack.Screen name="receipt" options={{ title: "Sale Receipt" }} />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && canOpenMobileRoute(session, "returns")}>
          <Stack.Screen name="returns" options={{ title: "Returns" }} />
        </Stack.Protected>
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <FatalErrorBoundary>
        <BiometricLock>
          <SessionNavigator />
        </BiometricLock>
      </FatalErrorBoundary>
    </>
  );
}

const styles = StyleSheet.create({
  lockContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 14, backgroundColor: mobileTheme.screenBackground },
  lockIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: mobileTheme.primary },
  lockTitle: { fontSize: 22, fontWeight: "900", color: mobileTheme.textColor },
  lockHint: { textAlign: "center", color: mobileTheme.mutedText, marginBottom: 8 },
  fatalContainer: {
    flex: 1,
    backgroundColor: mobileTheme.neutralDark,
    padding: 24,
    paddingTop: 64,
    justifyContent: "center",
    gap: 14
  },
  fatalTitle: {
    color: "#fca5a5",
    fontSize: 20,
    fontWeight: "900"
  },
  fatalMessage: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "600"
  },
  fatalStackBox: {
    maxHeight: 220,
    backgroundColor: "#020617",
    borderRadius: 10,
    padding: 12
  },
  fatalStack: {
    color: "#94a3b8",
    fontSize: 11,
    fontFamily: "monospace"
  },
  fatalButton: {
    backgroundColor: mobileTheme.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  fatalButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  },
  fatalShareButton: {
    borderWidth: 1,
    borderColor: "#475569",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center"
  },
  fatalShareText: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "700"
  },
  fatalHint: {
    color: "#94a3b8",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17
  }
});
