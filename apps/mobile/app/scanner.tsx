import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { mobileTheme } from "../lib/mobile-theme";
import { HeaderStatusBar } from "../components/HeaderStatusBar";
import { mobileApi, type InventoryLookupResult } from "../lib/mobile-api";

export default function BarcodeScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [torch, setTorch] = useState<boolean>(false);
  const [inputCode, setInputCode] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [product, setProduct] = useState<InventoryLookupResult | null>(null);
  const [isOfflineResult, setIsOfflineResult] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLookup = async (codeToSearch: string) => {
    const clean = codeToSearch.trim();
    if (!clean) return;

    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await mobileApi.lookupProduct(clean);
      if (res.ok && res.data) {
        setProduct(res.data);
        setIsOfflineResult(Boolean(res.isOffline));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCameraActive(false); // Close camera upon successful scan
      } else {
        setProduct(null);
        setErrorMessage(res.error || `No product found for barcode '${clean}'.`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (err: any) {
      setProduct(null);
      setErrorMessage(err.message || "Failed to query inventory.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const onBarcodeScanned = ({ data }: { data: string }) => {
    if (loading || !cameraActive) return;
    setInputCode(data);
    handleLookup(data);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <HeaderStatusBar />

      {/* Screen Header */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={22} color={mobileTheme.textColor} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Stock & Barcode Lookup</Text>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setCameraActive(!cameraActive)}
        >
          <Ionicons
            name={cameraActive ? "close-circle" : "camera"}
            size={24}
            color={cameraActive ? mobileTheme.danger : mobileTheme.primary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Camera Viewport (Expandable) */}
        {cameraActive && (
          <View style={styles.cameraContainer}>
            {!permission?.granted ? (
              <View style={styles.permissionBox}>
                <Ionicons name="camera-outline" size={36} color={mobileTheme.neutralMuted} />
                <Text style={styles.permissionText}>Camera permission needed to scan barcodes</Text>
                <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                  <Text style={styles.permissionButtonText}>Grant Permission</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <CameraView
                style={styles.cameraView}
                enableTorch={torch}
                barcodeScannerSettings={{
                  barcodeTypes: ["qr", "ean13", "ean8", "upc_a", "upc_e", "code128", "code39"]
                }}
                onBarcodeScanned={onBarcodeScanned}
              >
                <View style={styles.viewfinderOverlay}>
                  <View style={styles.targetBox}>
                    <View style={styles.laserLine} />
                  </View>
                  <TouchableOpacity
                    style={styles.torchButton}
                    onPress={() => setTorch(!torch)}
                  >
                    <Ionicons
                      name={torch ? "flash" : "flash-off"}
                      size={20}
                      color="#ffffff"
                    />
                  </TouchableOpacity>
                </View>
              </CameraView>
            )}
          </View>
        )}

        {/* Barcode Search Input */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="barcode-outline" size={22} color={mobileTheme.neutralMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Scan or type barcode / SKU..."
              placeholderTextColor={mobileTheme.neutralMuted}
              value={inputCode}
              onChangeText={setInputCode}
              onSubmitEditing={() => handleLookup(inputCode)}
              returnKeyType="search"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {inputCode.length > 0 && (
              <TouchableOpacity onPress={() => setInputCode("")}>
                <Ionicons name="close-circle" size={18} color={mobileTheme.neutralMuted} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.searchButton, loading && styles.searchButtonDisabled]}
            onPress={() => handleLookup(inputCode)}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.searchButtonText}>Lookup</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Error Notification */}
        {errorMessage && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={20} color={mobileTheme.danger} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* Product Details Display Card */}
        {product && (
          <View style={styles.productCard}>
            {/* Card Header & Badges */}
            <View style={styles.productCardHeader}>
              <View style={styles.badgeRow}>
                <View style={styles.skuBadge}>
                  <Text style={styles.skuText}>{product.productCode}</Text>
                </View>
                {isOfflineResult ? (
                  <View style={styles.offlineBadge}>
                    <Ionicons name="cloud-offline" size={12} color="#b45309" />
                    <Text style={styles.offlineBadgeText}>Offline Cache</Text>
                  </View>
                ) : (
                  <View style={styles.onlineBadge}>
                    <Ionicons name="cloud-done" size={12} color="#047857" />
                    <Text style={styles.onlineBadgeText}>HQ Live</Text>
                  </View>
                )}
              </View>

              <Text style={styles.productName}>{product.productName}</Text>
              {product.barcode ? (
                <Text style={styles.barcodeText}>Barcode: {product.barcode}</Text>
              ) : null}
            </View>

            {/* Key Metrics: Price & Stock */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Retail Price</Text>
                <Text style={styles.statPrice}>
                  GHS {product.unitPrice.toFixed(2)}
                </Text>
                <Text style={styles.statUom}>per {product.unitOfMeasure}</Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statLabel}>On Hand Stock</Text>
                <Text
                  style={[
                    styles.statStock,
                    {
                      color:
                        product.quantityOnHand > 5
                          ? mobileTheme.accent
                          : product.quantityOnHand > 0
                          ? mobileTheme.warning
                          : mobileTheme.danger
                    }
                  ]}
                >
                  {product.quantityOnHand}
                </Text>
                <Text style={styles.statUom}>
                  {product.quantityOnHand > 0 ? "Available" : "Out of Stock"}
                </Text>
              </View>
            </View>

            {/* Alternate UOMs if present */}
            {product.sellingUnits && product.sellingUnits.length > 0 && (
              <View style={styles.uomSection}>
                <Text style={styles.sectionHeader}>Alternate Selling Units</Text>
                {product.sellingUnits.map((u, i) => (
                  <View key={i} style={styles.uomRow}>
                    <Text style={styles.uomName}>
                      {u.unitOfMeasureName} ({u.unitOfMeasureCode})
                    </Text>
                    <Text style={styles.uomConversion}>
                      x{u.conversionFactor} base units
                    </Text>
                    <Text style={styles.uomPrice}>
                      GHS {u.unitPrice.toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Location Breakdown if present */}
            {product.locations && product.locations.length > 0 && (
              <View style={styles.locationSection}>
                <Text style={styles.sectionHeader}>Warehouse Locations</Text>
                {product.locations.map((loc, i) => (
                  <View key={i} style={styles.locationRow}>
                    <View style={styles.locNameCol}>
                      <Ionicons name="location-outline" size={16} color={mobileTheme.neutralMedium} />
                      <Text style={styles.locationName}>{loc.locationName || loc.locationCode}</Text>
                    </View>
                    <Text style={styles.locationQty}>{loc.quantity} {product.unitOfMeasure}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Quick Actions */}
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.countActionButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push({
                    pathname: "/stock-count",
                    params: {
                      productId: product.productCode,
                      productName: product.productName,
                      onHand: String(product.quantityOnHand)
                    }
                  });
                }}
              >
                <Ionicons name="clipboard-outline" size={18} color="#ffffff" />
                <Text style={styles.actionButtonText}>Audit / Count Item</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: mobileTheme.screenBackground
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: mobileTheme.surfaceBackground,
    borderBottomWidth: 1,
    borderBottomColor: mobileTheme.borderColor
  },
  backButton: {
    padding: 6
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: mobileTheme.textColor
  },
  iconButton: {
    padding: 6
  },
  scrollContent: {
    padding: 16,
    gap: 16
  },
  cameraContainer: {
    height: 240,
    borderRadius: mobileTheme.radiusLarge,
    overflow: "hidden",
    backgroundColor: "#000000",
    ...mobileTheme.shadowMedium
  },
  cameraView: {
    flex: 1
  },
  viewfinderOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)"
  },
  targetBox: {
    width: 220,
    height: 120,
    borderWidth: 2,
    borderColor: "#ffffff",
    borderRadius: mobileTheme.radiusMedium,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent"
  },
  laserLine: {
    width: 200,
    height: 2,
    backgroundColor: "#ef4444"
  },
  torchButton: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    padding: 10,
    borderRadius: mobileTheme.radiusPill
  },
  permissionBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    gap: 10
  },
  permissionText: {
    color: "#ffffff",
    textAlign: "center",
    fontSize: 13
  },
  permissionButton: {
    backgroundColor: mobileTheme.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: mobileTheme.radiusSmall
  },
  permissionButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13
  },
  searchSection: {
    flexDirection: "row",
    gap: 10
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: mobileTheme.surfaceBackground,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    borderRadius: mobileTheme.radiusMedium,
    paddingHorizontal: 12,
    height: 48,
    gap: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: mobileTheme.textColor,
    height: "100%"
  },
  searchButton: {
    backgroundColor: mobileTheme.primary,
    paddingHorizontal: 18,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: mobileTheme.radiusMedium
  },
  searchButtonDisabled: {
    opacity: 0.6
  },
  searchButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14
  },
  errorCard: {
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
  productCard: {
    backgroundColor: mobileTheme.surfaceBackground,
    borderRadius: mobileTheme.radiusLarge,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    padding: 18,
    gap: 16,
    ...mobileTheme.shadowSmall
  },
  productCardHeader: {
    gap: 6
  },
  badgeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  skuBadge: {
    backgroundColor: mobileTheme.neutralLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: mobileTheme.radiusSmall
  },
  skuText: {
    color: mobileTheme.neutralMedium,
    fontSize: 12,
    fontWeight: "700"
  },
  onlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: mobileTheme.accentLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: mobileTheme.radiusPill,
    gap: 4
  },
  onlineBadgeText: {
    color: mobileTheme.accentDark,
    fontSize: 11,
    fontWeight: "700"
  },
  offlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: mobileTheme.warningLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: mobileTheme.radiusPill,
    gap: 4
  },
  offlineBadgeText: {
    color: "#b45309",
    fontSize: 11,
    fontWeight: "700"
  },
  productName: {
    fontSize: 20,
    fontWeight: "800",
    color: mobileTheme.textColor
  },
  barcodeText: {
    fontSize: 13,
    color: mobileTheme.mutedText
  },
  statsRow: {
    flexDirection: "row",
    gap: 12
  },
  statBox: {
    flex: 1,
    backgroundColor: mobileTheme.neutralLight,
    borderRadius: mobileTheme.radiusMedium,
    padding: 14,
    alignItems: "center",
    gap: 2
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: mobileTheme.mutedText,
    textTransform: "uppercase"
  },
  statPrice: {
    fontSize: 20,
    fontWeight: "800",
    color: mobileTheme.textColor
  },
  statStock: {
    fontSize: 24,
    fontWeight: "900"
  },
  statUom: {
    fontSize: 11,
    color: mobileTheme.softText,
    fontWeight: "600"
  },
  uomSection: {
    borderTopWidth: 1,
    borderTopColor: mobileTheme.borderColor,
    paddingTop: 12,
    gap: 8
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: mobileTheme.mutedText
  },
  uomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4
  },
  uomName: {
    fontSize: 13,
    fontWeight: "600",
    color: mobileTheme.textColor
  },
  uomConversion: {
    fontSize: 12,
    color: mobileTheme.mutedText
  },
  uomPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: mobileTheme.primary
  },
  locationSection: {
    borderTopWidth: 1,
    borderTopColor: mobileTheme.borderColor,
    paddingTop: 12,
    gap: 8
  },
  locationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  locNameCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  locationName: {
    fontSize: 13,
    color: mobileTheme.textColor
  },
  locationQty: {
    fontSize: 13,
    fontWeight: "700",
    color: mobileTheme.textColor
  },
  cardActions: {
    marginTop: 4
  },
  countActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileTheme.primary,
    paddingVertical: 14,
    borderRadius: mobileTheme.radiusMedium,
    gap: 8
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700"
  }
});
