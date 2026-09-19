import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { mobileTheme } from "../lib/mobile-theme";
import { HeaderStatusBar } from "../components/HeaderStatusBar";

export default function ApprovalsScreen() {
  // Do not display sample transactions/KPIs or report an authorization without
  // a server write. A real mobile approval workflow has not been wired up yet.
  return (
    <View style={styles.container}>
      <HeaderStatusBar />
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={mobileTheme.textColor} />
        </TouchableOpacity>
        <Text style={styles.title}>Manager Approvals & KPIs</Text>
      </View>
      <View style={styles.notice}>
        <Ionicons name="information-circle-outline" size={38} color={mobileTheme.primary} />
        <Text style={styles.title}>Use Enterprise Web for approvals</Text>
        <Text style={styles.message}>
          Mobile approvals are not connected to the server yet. Review and authorize leave,
          expense claims, and purchase orders in Enterprise Web. No approval actions can be
          submitted from this screen.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mobileTheme.screenBackground },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  title: { color: mobileTheme.textColor, fontSize: 18, fontWeight: "700" },
  notice: { margin: 16, padding: 20, gap: 16, borderRadius: 16, backgroundColor: mobileTheme.surfaceBackground },
  message: { color: mobileTheme.mutedText, fontSize: 15, lineHeight: 23 },
});
