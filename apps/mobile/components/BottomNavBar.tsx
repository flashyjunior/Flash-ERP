import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileTheme } from "../lib/mobile-theme";
import { mobileStorage } from "../lib/mobile-storage";
import type { MobileUserSession } from "../lib/mobile-api";
import { canOpenMobileRoute } from "../lib/mobile-access";

export type BottomNavKey = "home" | "sales" | "hr" | "sync" | "account";

interface BottomNavBarProps {
  session?: MobileUserSession | null;
  active: BottomNavKey;
}

/** One tap to any core screen, from any page — including a single-tap way
 *  back home no matter how deep the current stack is. */
export function BottomNavBar({ session, active }: BottomNavBarProps) {
  const insets = useSafeAreaInsets();
  const [storedSession, setStoredSession] = useState<MobileUserSession | null>(null);
  useEffect(() => {
    if (session) return;
    void mobileStorage.getUserSnapshot<MobileUserSession>().then(setStoredSession);
  }, [session]);
  const effectiveSession = session ?? storedSession;

  const go = (key: BottomNavKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    switch (key) {
      case "home":
        // Collapse any stack (sale → scanner → sale...) straight to home.
        try { router.dismissTo("/"); } catch { router.replace("/"); }
        break;
      case "sales":
        router.navigate("/cart" as any);
        break;
      case "hr":
        router.navigate("/self-service" as any);
        break;
      case "sync":
        router.navigate("/outbox" as any);
        break;
      case "account":
        router.navigate("/account" as any);
        break;
    }
  };

  const item = (key: BottomNavKey, icon: string, label: string, hidden = false) => {
    if (hidden) return null;
    const isActive = active === key;
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.item}
        onPress={() => go(key)}
      >
        <Ionicons name={icon as any} size={22} color={isActive ? mobileTheme.primary : mobileTheme.mutedText} />
        <Text style={isActive ? styles.labelActive : styles.label}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {item("home", "home", "Home")}
      {item("sales", "cart-outline", "Sales", !canOpenMobileRoute(effectiveSession, "cart"))}
      {item("hr", "person-outline", "My HR")}
      {item("sync", "sync-outline", "Sync")}
      {item("account", "person-circle-outline", "Account")}
    </View>
  );
}

export const BOTTOM_NAV_HEIGHT = 64;

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: BOTTOM_NAV_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 8,
    backgroundColor: mobileTheme.surfaceBackground,
    borderTopWidth: 1,
    borderTopColor: mobileTheme.borderColor,
    ...mobileTheme.shadowMedium
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minHeight: 48,
    paddingVertical: 4
  },
  label: { fontSize: 11, fontWeight: "700", color: mobileTheme.mutedText },
  labelActive: { fontSize: 11, fontWeight: "800", color: mobileTheme.primary }
});
