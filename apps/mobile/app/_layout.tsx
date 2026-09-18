import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { mobileTheme } from "../lib/mobile-theme";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor={mobileTheme.headerBackground} />
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
    </>
  );
}
