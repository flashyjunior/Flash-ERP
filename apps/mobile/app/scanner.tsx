import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileTheme } from "../lib/mobile-theme";
import { HeaderStatusBar } from "../components/HeaderStatusBar";
import { BottomNavBar } from "../components/BottomNavBar";
import { mobileStorage } from "../lib/mobile-storage";
import { mobileApi, type InventoryLookupResult, type MobileUserSession } from "../lib/mobile-api";

const GRID_PAGE_SIZE = 50;

function matchesQuery(product: InventoryLookupResult, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    product.productName?.toLowerCase().includes(q) ||
    product.productCode?.toLowerCase().includes(q) ||
    (product.barcode ?? "").toLowerCase().includes(q)
  );
}

export default function BarcodeScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [torch, setTorch] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [product, setProduct] = useState<InventoryLookupResult | null>(null);
  const [selectedUnitCode, setSelectedUnitCode] = useState<string | null>(null);
  const [selectedVariantCode, setSelectedVariantCode] = useState<string | null>(null);
  const [isOfflineResult, setIsOfflineResult] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Inventory grid state: loaded automatically on mount, filtered live while
  // typing, paginated with "Load more".
  const [gridItems, setGridItems] = useState<InventoryLookupResult[]>([]);
  const [gridPage, setGridPage] = useState<number>(1);
  const [gridTotal, setGridTotal] = useState<number>(0);
  const [gridHasMore, setGridHasMore] = useState<boolean>(false);
  const [gridLoading, setGridLoading] = useState<boolean>(false);
  const [gridLoadingMore, setGridLoadingMore] = useState<boolean>(false);
  const [gridError, setGridError] = useState<string | null>(null);
  const [gridIsOffline, setGridIsOffline] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [session, setSession] = useState<MobileUserSession | null>(null);
  const searchSeq = useRef(0);
  const gridEndRef = useRef<ScrollView>(null);

  useEffect(() => {
    void mobileStorage.getUserSnapshot<MobileUserSession>().then(setSession);
  }, []);

  const insets = useSafeAreaInsets();
  const goHome = () => { try { router.dismissTo("/"); } catch { router.replace("/"); } };

  const loadGridPage = useCallback(async (text: string, page: number, append: boolean, seq: number) => {
    if (page === 1) setGridLoading(true);
    else setGridLoadingMore(true);
    setGridError(null);
    try {
      const res = await mobileApi.fetchInventoryPage({ query: text, page, limit: GRID_PAGE_SIZE });
      if (seq !== searchSeq.current) return; // a newer search superseded this page
      if (!res.ok) {
        setGridError(res.error || "Inventory could not be loaded.");
        if (!append) setGridItems([]);
        setGridHasMore(false);
        return;
      }
      setGridIsOffline(Boolean(res.isOffline));
      setGridItems((current) => (append ? [...current, ...res.items] : res.items));
      setGridPage(page);
      setGridTotal(res.total);
      setGridHasMore(res.hasMore);
    } catch (err: any) {
      if (seq !== searchSeq.current) return;
      setGridError(err.message || "Inventory could not be loaded.");
      if (!append) setGridItems([]);
      setGridHasMore(false);
    } finally {
      if (seq === searchSeq.current) {
        setGridLoading(false);
        setGridLoadingMore(false);
      }
    }
  }, []);

  // Initial load + live filter while typing: instant client-side narrowing of
  // what is already loaded, then a debounced HQ query (or offline cache
  // search) so results beyond the first page are still found.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      searchSeq.current += 1;
      void loadGridPage("", 1, false, searchSeq.current);
      return;
    }
    const text = query.trim();
    if (!text) {
      // Filter cleared — restore the full listing from page 1.
      searchSeq.current += 1;
      void loadGridPage("", 1, false, searchSeq.current);
      return;
    }
    // Instant narrowing of already-loaded rows for a responsive feel.
    setGridItems((current) => current.filter((item) => matchesQuery(item, text)));
    setGridHasMore(false);
    const timer = setTimeout(() => {
      // A fresh sequence per fired search, so a slow response for an older
      // query can never land on top of a newer one.
      searchSeq.current += 1;
      void loadGridPage(text, 1, false, searchSeq.current);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, loadGridPage]);

  const handleLookup = async (codeToSearch: string) => {
    const clean = codeToSearch.trim();
    if (!clean) return;

    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await mobileApi.lookupProduct(clean);
      if (res.ok && res.data) {
        setProduct(res.data);
        setSelectedUnitCode(res.data.sellingUnits?.find((unit) => unit.isDefault)?.unitOfMeasureCode ?? null);
        setSelectedVariantCode(null);
        setIsOfflineResult(Boolean(res.isOffline));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCameraActive(false); // Close camera upon successful scan
        setQuery(""); // Reveal the full grid again after an exact lookup.
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
    setQuery("");
    handleLookup(data);
  };

  const loadMore = () => {
    if (gridLoading || gridLoadingMore || !gridHasMore) return;
    void loadGridPage(query.trim(), gridPage + 1, true, searchSeq.current);
  };

  const openProduct = (item: InventoryLookupResult) => {
    Haptics.selectionAsync();
    setProduct(item);
    setSelectedUnitCode(item.sellingUnits?.find((unit) => unit.isDefault)?.unitOfMeasureCode ?? null);
    setSelectedVariantCode(null);
    setIsOfflineResult(false);
    setErrorMessage(null);
    gridEndRef.current?.scrollTo({ y: 0, animated: true });
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
          onPress={goHome}
        >
          <Ionicons name="home-outline" size={22} color={mobileTheme.textColor} />
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

      <ScrollView
        ref={gridEndRef}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + Math.max(insets.bottom, 0) }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              searchSeq.current += 1;
              void loadGridPage(query.trim(), 1, false, searchSeq.current).finally(() => setRefreshing(false));
            }}
          />
        }
      >
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

        {/* Inventory Search / Filter */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color={mobileTheme.neutralMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Filter inventory — type a name, code or barcode..."
              placeholderTextColor={mobileTheme.neutralMuted}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => handleLookup(query)}
              returnKeyType="search"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")}>
                <Ionicons name="close-circle" size={18} color={mobileTheme.neutralMuted} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.searchButton, loading && styles.searchButtonDisabled]}
            onPress={() => handleLookup(query)}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.searchButtonText}>Lookup</Text>
            )}
          </TouchableOpacity>
        </View>

        {gridIsOffline && !gridError && (
          <View style={styles.offlineStrip}>
            <Ionicons name="cloud-offline" size={14} color="#b45309" />
            <Text style={styles.offlineStripText}>Showing offline catalog cache</Text>
          </View>
        )}

        {/* Error Notification (exact lookup) */}
        {errorMessage && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={20} color={mobileTheme.danger} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* Product Details Display Card (exact scan/lookup or tapped grid row) */}
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
                <TouchableOpacity onPress={() => setProduct(null)}>
                  <Ionicons name="close-circle" size={20} color={mobileTheme.neutralMuted} />
                </TouchableOpacity>
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
                  <TouchableOpacity key={i} style={[styles.uomRow, selectedUnitCode === u.unitOfMeasureCode && styles.optionSelected]} onPress={() => setSelectedUnitCode(u.unitOfMeasureCode)}>
                    <Text style={styles.uomName}>
                      {u.unitOfMeasureName} ({u.unitOfMeasureCode})
                    </Text>
                    <Text style={styles.uomConversion}>
                      x{u.conversionFactor} base units
                    </Text>
                    <Text style={styles.uomPrice}>
                      GHS {u.unitPrice.toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {product.variants && product.variants.length > 0 && <View style={styles.uomSection}><Text style={styles.sectionHeader}>Product Variant</Text>{product.variants.map((variant) => <TouchableOpacity key={variant.id} style={[styles.uomRow, selectedVariantCode === variant.code && styles.optionSelected]} onPress={() => setSelectedVariantCode(variant.code)}><View><Text style={styles.uomName}>{variant.name}</Text><Text style={styles.uomConversion}>{variant.attributes.map((a) => `${a.name}: ${a.value}`).join(" · ")}</Text></View><Text style={styles.uomPrice}>GHS {variant.unitPrice.toFixed(2)}</Text></TouchableOpacity>)}</View>}

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
                style={styles.saleActionButton}
                disabled={product.quantityOnHand <= 0}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.navigate({ pathname: "/cart", params: {
                    addProductId: product.productId,
                    addProductCode: product.productCode,
                    addProductName: product.productName,
                    addUnitPrice: String(product.sellingUnits?.find((unit) => unit.unitOfMeasureCode === selectedUnitCode)?.unitPrice ?? product.variants?.find((variant) => variant.code === selectedVariantCode)?.unitPrice ?? product.unitPrice),
                    addUnitOfMeasure: product.sellingUnits?.find((unit) => unit.unitOfMeasureCode === selectedUnitCode)?.unitOfMeasureCode ?? product.unitOfMeasure,
                    addConversionFactor: String(product.sellingUnits?.find((unit) => unit.unitOfMeasureCode === selectedUnitCode)?.conversionFactor ?? 1),
                    addVariantCode: selectedVariantCode ?? "",
                    addTaxRate: String(product.taxRatePercent),
                    addTaxInclusive: product.isTaxInclusive ? "true" : "false",
                    addStock: String(product.quantityOnHand)
                  }});
                }}
              >
                <Ionicons name="cart-outline" size={18} color="#ffffff" />
                <Text style={styles.actionButtonText}>{product.quantityOnHand > 0 ? "Add to Sales POS" : "Out of Stock"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.countActionButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.navigate({
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

        {/* Inventory Grid */}
        <View style={styles.gridHeader}>
          <Text style={styles.sectionHeader}>
            Inventory{query.trim() ? " — filtered" : ""}{gridTotal > 0 ? ` (${gridTotal})` : ""}
          </Text>
          {gridError && <Text style={styles.gridErrorText}>{gridError}</Text>}
        </View>

        {gridLoading && gridItems.length === 0 ? (
          <View style={styles.gridLoadingBox}>
            <ActivityIndicator color={mobileTheme.primary} />
            <Text style={styles.gridLoadingText}>Loading inventory…</Text>
          </View>
        ) : gridItems.length === 0 ? (
          <View style={styles.gridEmptyBox}>
            <Ionicons name="cube-outline" size={34} color={mobileTheme.neutralMuted} />
            <Text style={styles.gridEmptyText}>
              {gridError ? "Inventory could not be loaded." : "No products match. Download the catalog from the status bar or check HQ for active products."}
            </Text>
            {gridError && (
              <TouchableOpacity
                style={styles.gridRetryButton}
                onPress={() => {
                  searchSeq.current += 1;
                  void loadGridPage(query.trim(), 1, false, searchSeq.current);
                }}
              >
                <Ionicons name="refresh" size={16} color="#ffffff" />
                <Text style={styles.gridRetryText}>Retry</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.gridList}>
            {gridItems.map((item) => (
              <TouchableOpacity key={item.productId} style={styles.gridRow} onPress={() => openProduct(item)} activeOpacity={0.75}>
                <View style={styles.gridRowMain}>
                  <Text style={styles.gridRowName} numberOfLines={1}>{item.productName}</Text>
                  <Text style={styles.gridRowMeta} numberOfLines={1}>
                    {item.productCode}{item.barcode ? ` · ${item.barcode}` : ""}
                  </Text>
                </View>
                <View style={styles.gridRowSide}>
                  <Text style={styles.gridRowPrice}>GHS {item.unitPrice.toFixed(2)}</Text>
                  <Text
                    style={[
                      styles.gridRowStock,
                      {
                        color:
                          item.quantityOnHand > 5
                            ? mobileTheme.accent
                            : item.quantityOnHand > 0
                            ? mobileTheme.warning
                            : mobileTheme.danger
                      }
                    ]}
                  >
                    {item.quantityOnHand > 0 ? `${item.quantityOnHand} ${item.unitOfMeasure}` : "Out of stock"}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            {gridLoadingMore && (
              <View style={styles.gridLoadMoreRow}>
                <ActivityIndicator size="small" color={mobileTheme.primary} />
                <Text style={styles.gridLoadingText}>Loading more…</Text>
              </View>
            )}
            {!gridLoadingMore && gridHasMore && (
              <TouchableOpacity style={styles.gridLoadMoreRow} onPress={loadMore}>
                <Ionicons name="chevron-down-circle-outline" size={18} color={mobileTheme.primary} />
                <Text style={styles.gridLoadMoreText}>Load more ({gridItems.length} of {gridTotal})</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
      <BottomNavBar session={session} active="home" />
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
  offlineStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: mobileTheme.warningLight,
    borderRadius: mobileTheme.radiusSmall,
    padding: 8
  },
  offlineStripText: {
    color: "#b45309",
    fontSize: 12,
    fontWeight: "700"
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
    alignItems: "center",
    gap: 6
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
  optionSelected: { backgroundColor: mobileTheme.primaryLight, borderRadius: 8, paddingHorizontal: 8 },
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
    marginTop: 4,
    gap: 10
  },
  saleActionButton: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: mobileTheme.accent, paddingVertical: 12, borderRadius: mobileTheme.radiusMedium, gap: 7
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
  },
  gridHeader: {
    gap: 4
  },
  gridErrorText: {
    fontSize: 12,
    color: mobileTheme.danger,
    fontWeight: "600"
  },
  gridLoadingBox: {
    alignItems: "center",
    paddingVertical: 36,
    gap: 10
  },
  gridLoadingText: {
    fontSize: 13,
    color: mobileTheme.mutedText,
    fontWeight: "600"
  },
  gridEmptyBox: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 10
  },
  gridEmptyText: {
    fontSize: 13,
    color: mobileTheme.mutedText,
    textAlign: "center",
    lineHeight: 18
  },
  gridRetryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: mobileTheme.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: mobileTheme.radiusMedium
  },
  gridRetryText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13
  },
  gridList: {
    gap: 8
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: mobileTheme.surfaceBackground,
    borderWidth: 1,
    borderColor: mobileTheme.borderColor,
    borderRadius: mobileTheme.radiusMedium,
    padding: 12
  },
  gridRowMain: {
    flex: 1,
    gap: 2
  },
  gridRowName: {
    fontSize: 14,
    fontWeight: "800",
    color: mobileTheme.textColor
  },
  gridRowMeta: {
    fontSize: 11,
    color: mobileTheme.mutedText
  },
  gridRowSide: {
    alignItems: "flex-end",
    gap: 2
  },
  gridRowPrice: {
    fontSize: 13,
    fontWeight: "800",
    color: mobileTheme.primary
  },
  gridRowStock: {
    fontSize: 11,
    fontWeight: "700"
  },
  gridLoadMoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12
  },
  gridLoadMoreText: {
    fontSize: 13,
    fontWeight: "700",
    color: mobileTheme.primary
  }
});
