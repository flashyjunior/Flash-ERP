import React, { Component, type ReactNode } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ErrorUtils } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { mobileTheme } from "../lib/mobile-theme";

const LOG_TAG = "[flash-erp:mobile]";

/**
 * Release builds fail silently: an uncaught error just kills the process and the
 * user sees the app "close without an error". These guards make every fatal
 * error visible (on screen via the boundary, in logcat under [flash-erp:mobile]).
 *
 * Filter logcat with: adb logcat -s ReactNativeJS
 */
function installCrashGuards() {
  const previousHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    // eslint-disable-next-line no-console
    console.error(
      `${LOG_TAG} FATAL JS ERROR (isFatal=${isFatal}):`,
      error instanceof Error ? (error.stack ?? error.message) : error
    );
    try {
      previousHandler(error, isFatal);
    } catch {
      // Never let the handler itself throw.
    }
  });

  if (typeof (globalThis as any).addEventListener === "function") {
    (globalThis as any).addEventListener("unhandledrejection", (event: any) => {
      const reason = event?.reason;
      // eslint-disable-next-line no-console
      console.error(
        `${LOG_TAG} UNHANDLED PROMISE REJECTION:`,
        reason instanceof Error ? (reason.stack ?? reason.message) : reason
      );
    });
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

  render() {
    if (this.state.error) {
      return (
        <View style={styles.fatalContainer}>
          <Text style={styles.fatalTitle}>Flash ERP hit a fatal error</Text>
          <Text style={styles.fatalMessage}>
            {this.state.error.message || String(this.state.error)}
          </Text>
          <Text style={styles.fatalStack}>{this.state.error.stack}</Text>
          <TouchableOpacity
            style={styles.fatalButton}
            onPress={() => process.exit(0)}
          >
            <Text style={styles.fatalButtonText}>Close &amp; Restart App</Text>
          </TouchableOpacity>
          <Text style={styles.fatalHint}>
            If this keeps happening, report the text above (and the logcat tag{" "}
            {LOG_TAG}) to HQ IT.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor={mobileTheme.headerBackground} />
      <FatalErrorBoundary>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: mobileTheme.screenBackground
            }
          }}
        >
          <Stack.Screen name="index" options={{ title: "Flash ERP" }} />
          <Stack.Screen name="scanner" options={{ title: "Stock & Barcode Lookup" }} />
          <Stack.Screen name="stock-count" options={{ title: "Cycle Count" }} />
          <Stack.Screen name="goods-receipt" options={{ title: "Goods Receiving" }} />
          <Stack.Screen name="transfers" options={{ title: "Inter-Store Transfers" }} />
          <Stack.Screen name="cart" options={{ title: "Assisted Selling & Cart" }} />
          <Stack.Screen name="fuel-operations" options={{ title: "Fuel Station Operations" }} />
          <Stack.Screen name="approvals" options={{ title: "Manager Approvals" }} />
          <Stack.Screen name="self-service" options={{ title: "HR & Self-Service" }} />
          <Stack.Screen name="outbox" options={{ title: "Outbox Queue" }} />
          <Stack.Screen name="login" options={{ title: "Sign In", presentation: "modal" }} />
        </Stack>
      </FatalErrorBoundary>
    </>
  );
}

const styles = StyleSheet.create({
  fatalContainer: {
    flex: 1,
    backgroundColor: mobileTheme.screenBackground,
    padding: 24,
    justifyContent: "center",
    gap: 14
  },
  fatalTitle: {
    color: mobileTheme.danger,
    fontSize: 20,
    fontWeight: "900"
  },
  fatalMessage: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "600"
  },
  fatalStack: {
    color: "#94a3b8",
    fontSize: 11,
    fontFamily: "monospace",
    backgroundColor: "#0f172a",
    padding: 12,
    borderRadius: 10,
    overflow: "hidden",
    maxHeight: 220
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
  fatalHint: {
    color: "#94a3b8",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17
  }
});
