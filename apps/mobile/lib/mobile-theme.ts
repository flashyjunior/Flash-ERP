/**
 * Flash ERP Mobile Design System & Theme Tokens
 * High-contrast, tactile-optimized design system for retail floor and warehouse handhelds.
 */

export const mobileTheme = {
  // Brand & Accent Colors
  primary: "#2563eb",         // Flash ERP Royal Blue
  primaryDark: "#1d4ed8",
  primaryLight: "#dbeafe",
  accent: "#059669",          // Emerald Green (Success, Completed, High Stock)
  accentDark: "#047857",
  accentLight: "#d1fae5",
  warning: "#d97706",         // Amber (Pending Sync, Warning, Low Stock)
  warningLight: "#fef3c7",
  danger: "#dc2626",          // Coral Red (Error, Out of Stock, Overdue)
  dangerLight: "#fee2e2",
  neutralDark: "#0f172a",     // Slate 900
  neutralMedium: "#475569",   // Slate 600
  neutralMuted: "#94a3b8",    // Slate 400
  neutralBorder: "#cbd5e1",   // Slate 300
  neutralLight: "#f1f5f9",    // Slate 100

  // Surface & Canvas
  screenBackground: "#f8fafc",
  surfaceBackground: "#ffffff",
  cardBackground: "#ffffff",
  surfaceElevated: "#ffffff",
  headerBackground: "#090d16", // Premium dark header
  headerText: "#ffffff",
  headerMuted: "#94a3b8",

  // Typography Tokens
  textColor: "#0f172a",
  softText: "#334155",
  mutedText: "#64748b",
  inverseText: "#ffffff",

  // Borders & Dividers
  borderColor: "#e2e8f0",
  borderLight: "#f1f5f9",
  dividerColor: "#e2e8f0",

  // Status Badges
  statusOnline: "#10b981",    // Green pulse
  statusOffline: "#f59e0b",   // Amber pulse
  statusSyncing: "#3b82f6",   // Blue pulse

  // Shadows (Elevations)
  shadowSmall: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  shadowMedium: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4
  },
  shadowLarge: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8
  },

  // Radius
  radiusSmall: 8,
  radiusMedium: 14,
  radiusLarge: 20,
  radiusPill: 999
} as const;

export type MobileTheme = typeof mobileTheme;
