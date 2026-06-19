import { View, Text, StyleSheet } from "react-native";

import { mobileTheme } from "../lib/mobile-theme";

export default function HomeScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Flash ERP mobile</Text>
        <Text style={styles.title}>Operational mobile baseline</Text>
        <Text style={styles.body}>
          Mobile stays lighter than the store desktop app and will grow after the offline-first
          store sync contract is stable.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Planned early workflows</Text>
        <Text style={styles.cardBody}>Stock lookup, receiving support, assisted selling, and store-floor follow-up tasks.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Design rule</Text>
        <Text style={styles.cardBody}>
          Keep the same practical Flash ERP workspace language from SMS, but tuned for high-signal mobile operations.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    gap: 16,
    backgroundColor: mobileTheme.screenBackground,
    paddingHorizontal: 20,
    paddingVertical: 24
  },
  hero: {
    gap: 8
  },
  eyebrow: {
    color: mobileTheme.mutedText,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  title: {
    color: mobileTheme.textColor,
    fontSize: 28,
    fontWeight: "800"
  },
  body: {
    color: mobileTheme.softText,
    fontSize: 15,
    lineHeight: 23
  },
  card: {
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    borderRadius: 22,
    backgroundColor: mobileTheme.surfaceBackground,
    padding: 18,
    gap: 8
  },
  cardTitle: {
    color: mobileTheme.textColor,
    fontSize: 17,
    fontWeight: "700"
  },
  cardBody: {
    color: mobileTheme.softText,
    fontSize: 14,
    lineHeight: 21
  }
});
