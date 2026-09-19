import React, { Component, type ReactNode } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { mobileTheme } from "../lib/mobile-theme";

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

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
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
  fatalHint: {
    color: "#94a3b8",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17
  }
});
