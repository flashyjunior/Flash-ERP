"use client";

import {
  ArrowLeft,
  Baby,
  BadgeCheck,
  BadgePercent,
  BookOpen,
  Boxes,
  Car,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Clock3,
  CreditCard,
  Dumbbell,
  Fuel,
  Heart,
  HeartPulse,
  House,
  KeyRound,
  Laptop,
  LoaderCircle,
  ListTree,
  LocateFixed,
  LogIn,
  MapPin,
  Minus,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Tags,
  Trash2,
  Truck,
  Utensils,
  WalletCards,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  PublicStorefrontData,
  PublicStorefrontProductDetail,
} from "@/server/ecommerce/ecommerce.repository";

import styles from "./public-storefront.module.css";
import { productCardRequiresSelection } from "./storefront-card-action";
import {
  buildStorefrontCategoryTree,
  formatStorefrontTaxonomyLabel,
  getStorefrontSelectionLabel,
  productMatchesStorefrontSelection,
  type StorefrontCatalogSelection,
  type StorefrontDepartmentNode,
} from "./storefront-category-tree";

type Product = PublicStorefrontData["products"][number];
type ProductDetail = PublicStorefrontProductDetail;
type Variant = Product["variants"][number];
type SellingUnit = Product["sellingUnits"][number];
type ProductPromotion = NonNullable<Product["promotion"]>;
type StorefrontTextSize = "SMALL" | "MEDIUM" | "LARGE";
type SocialAuthProvider = "google" | "facebook";
type SocialAuthProviderOption = { id: SocialAuthProvider; enabled: boolean };
type SocialAuthResult = {
  provider: SocialAuthProvider;
  result: "success" | "cancelled" | "conflict" | "failed" | "unavailable";
};
type SearchSuggestion = {
  key: string;
  label: string;
  query: string;
  type: "Product" | "Department" | "Category" | "Subcategory" | "Brand";
  imageUrl?: string | null;
};
type SearchSuggestionGroup = {
  label: "Products" | "Categories" | "Brands";
  suggestions: SearchSuggestion[];
};

const storefrontTextSizeStorageKey = "flash-erp-storefront-text-size";
const categoryIconRules: Array<{ pattern: RegExp; icon: LucideIcon }> = [
  { pattern: /fuel|petrol|diesel|kerosene|gas|lpg/i, icon: Fuel },
  { pattern: /computer|electronic|phone|technology|appliance/i, icon: Laptop },
  { pattern: /fashion|cloth|apparel|shoe/i, icon: Shirt },
  { pattern: /food|grocery|drink|restaurant|kitchen/i, icon: Utensils },
  { pattern: /baby|child|kid|toy/i, icon: Baby },
  { pattern: /vehicle|automotive|motor|car/i, icon: Car },
  { pattern: /book|office|school|stationery/i, icon: BookOpen },
  { pattern: /sport|fitness|exercise/i, icon: Dumbbell },
  { pattern: /beauty|cosmetic|personal care/i, icon: Sparkles },
  { pattern: /health|medical|pharmacy/i, icon: HeartPulse },
  { pattern: /home|furniture|garden/i, icon: House },
];

function resolveCategoryIcon(label: string) {
  return categoryIconRules.find(({ pattern }) => pattern.test(label))?.icon ?? Package;
}

function normalizeProductCode(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCatalogLabel(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function productMatchesSearch(product: Product, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const searchableText = [
    product.name,
    product.shortName,
    product.code,
    product.sku,
    product.brand,
    product.department,
    product.category,
    product.subcategory,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return terms.every((term) => searchableText.includes(term));
}

function getProductPriceBounds(products: Product[]) {
  const prices = products.map((product) => getProductPrice(product));
  if (prices.length === 0) return { minimum: 0, maximum: 0 };

  return {
    minimum: Math.max(0, Math.floor(Math.min(...prices))),
    maximum: Math.max(0, Math.ceil(Math.max(...prices))),
  };
}

function getRelatedProductScore(product: Product, candidate: Product) {
  let score = 0;
  const productDepartment = normalizeCatalogLabel(product.department);
  const productCategory = normalizeCatalogLabel(product.category);
  const productSubcategory = normalizeCatalogLabel(product.subcategory);
  const productBrand = normalizeCatalogLabel(product.brand);

  if (productDepartment && productDepartment === normalizeCatalogLabel(candidate.department)) score += 20;
  if (productCategory && productCategory === normalizeCatalogLabel(candidate.category)) score += 40;
  if (productSubcategory && productSubcategory === normalizeCatalogLabel(candidate.subcategory)) score += 80;
  if (productBrand && productBrand === normalizeCatalogLabel(candidate.brand)) score += 10;

  return score;
}

function isOptimizableStorefrontImage(src: string) {
  return src.startsWith("/") && !src.startsWith("//");
}

function StorefrontImage({
  alt,
  priority = false,
  sizes,
  src,
}: {
  alt: string;
  priority?: boolean;
  sizes: string;
  src: string;
}) {
  if (!isOptimizableStorefrontImage(src)) {
    return (
      <img
        alt={alt}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        loading={priority ? "eager" : "lazy"}
        src={src}
      />
    );
  }

  return <Image alt={alt} fill priority={priority} sizes={sizes} src={src} />;
}
type DrawerView = "cart" | "checkout" | "orders" | "account" | null;
type CheckoutPaymentOption = {
  code: string;
  name: string;
  description: string;
  timing: "ON_DELIVERY" | "PREPAY";
};

type CartLine = {
  key: string;
  productId: string;
  productCode: string;
  name: string;
  imageUrl: string | null;
  variantCode: string | null;
  variantName: string | null;
  sellingUnitOfMeasure: string;
  sellingUnitName: string;
  baseUnitOfMeasure: string;
  uomConversionFactor: number;
  unitPrice: number;
  quantity: number;
};

type EcommerceQuote = {
  currencyCode: string;
  subtotalAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  fulfillment: {
    method: "DELIVERY" | "PICKUP";
    storeCode: string;
    storeName: string;
    inventoryLocationCode: string;
    inventoryLocationName: string;
    routingMethod: string;
    networkAllocation: boolean;
  };
  lines: Array<{
    lineIndex: number;
    productId: string;
    variantCode: string | null;
    quantity: number;
    sellingUnitOfMeasure: string;
    baseUnitOfMeasure: string;
    uomConversionFactor: number;
    baseQuantity: number;
    unitPrice: number;
    subtotalAmount: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
    appliedPromotionCode: string | null;
    appliedPromotionName: string | null;
  }>;
};

type CustomerSession = {
  authenticated: boolean;
  customer: null | {
    customerNo: string;
    fullName: string;
    email: string | null;
    phone: string | null;
  };
};

type CustomerAddress = {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  region: string | null;
  countryCode: string;
  postalCode: string | null;
  deliveryNote: string | null;
  isDefault: boolean;
};

type CustomerAccount = {
  customer: NonNullable<CustomerSession["customer"]>;
  addresses: CustomerAddress[];
};

type CustomerAddressDraft = Omit<CustomerAddress, "id" | "countryCode" | "isDefault"> & {
  id?: string;
  makeDefault: boolean;
};

type CustomerOrder = {
  id: string;
  orderNo: string;
  orderType: "SALES_ORDER" | "LAYAWAY";
  status: string;
  paymentStatus: string;
  deliveryStatus: string;
  fulfilmentMethod: string;
  paymentTiming: string;
  selectedPaymentMethodCode: string | null;
  selectedPaymentMethodName: string | null;
  currencyCode: string;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  minimumDepositAmount: number;
  reservationStatus: string;
  layawayExpiresAt: string | null;
  placedAt: string;
  deliveryAddress: string;
  trackingReference: string | null;
  fulfillment: {
    storeCode: string;
    storeName: string;
    inventoryLocationCode: string | null;
    inventoryLocationName: string | null;
    status: string;
    fulfilmentMethod: string;
    routingMethod: string;
  } | null;
  lines: Array<{
    id: string;
    productName: string;
    variant: string | null;
    quantity: number;
    lineTotal: number;
  }>;
  timeline: Array<{
    id: string;
    label: string;
    note: string | null;
    createdAt: string;
  }>;
  refundRequests: Array<{
    id: string;
    status: string;
  }>;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) {
    throw new Error(body.message ?? "The request could not be completed.");
  }
  return body;
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function createBrowserRequestKey(scope: string) {
  const bytes = new Uint8Array(16);
  try {
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      globalThis.crypto.getRandomValues(bytes);
      return `${scope}-${Date.now().toString(36)}-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
    }
  } catch {
    // HTTP storefronts can expose a partial Web Crypto implementation.
  }

  return `${scope}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

const friendlyDateTime = new Intl.DateTimeFormat("en-GH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

function formatFriendlyDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : friendlyDateTime.format(date);
}

const relativeReviewTime = new Intl.RelativeTimeFormat("en", { numeric: "always" });

function formatRelativeReviewTime(value: string, now: number) {
  const reviewedAt = new Date(value).getTime();
  if (Number.isNaN(reviewedAt)) return value;

  const elapsedSeconds = Math.max(0, Math.floor((now - reviewedAt) / 1_000));
  if (elapsedSeconds < 45) return "Just now";
  if (elapsedSeconds < 90) return "1 minute ago";
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return relativeReviewTime.format(-elapsedMinutes, "minute");
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return relativeReviewTime.format(-elapsedHours, "hour");
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return relativeReviewTime.format(-elapsedDays, "day");
  const elapsedWeeks = Math.floor(elapsedDays / 7);
  if (elapsedWeeks < 5) return relativeReviewTime.format(-elapsedWeeks, "week");
  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths < 12) return relativeReviewTime.format(-elapsedMonths, "month");
  return relativeReviewTime.format(-Math.floor(elapsedDays / 365), "year");
}

function RelativeReviewTime({ value }: { value: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <small title={formatFriendlyDateTime(value)}>
      {now === null ? formatFriendlyDateTime(value) : formatRelativeReviewTime(value, now)}
    </small>
  );
}

function productInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getProductPromotion(product: Product, variant: Variant | null = null) {
  return variant?.promotion ?? product.promotion;
}

function getProductSellingUnits(product: Product, variant: Variant | null) {
  return variant?.sellingUnits ?? product.sellingUnits;
}

function resolveProductSellingUnit(
  product: Product,
  variant: Variant | null,
  selectedUnitOfMeasure?: string | null
): SellingUnit | null {
  const sellingUnits = getProductSellingUnits(product, variant);
  const normalizedSelected = selectedUnitOfMeasure?.trim().toUpperCase() ?? "";

  return (
    sellingUnits.find(
      (sellingUnit) => sellingUnit.unitOfMeasureCode.toUpperCase() === normalizedSelected
    ) ??
    sellingUnits.find((sellingUnit) => sellingUnit.isDefault) ??
    sellingUnits.find(
      (sellingUnit) =>
        sellingUnit.unitOfMeasureCode.toUpperCase() === product.baseUnitOfMeasure.toUpperCase()
    ) ??
    null
  );
}

function getAvailableBaseQuantity(product: Product, variant: Variant | null = null) {
  const quantity = variant?.availableQuantity ?? product.availableQuantity;
  return typeof quantity === "number" ? Math.max(0, quantity) : null;
}

function getMaximumOrderQuantity(
  product: Product,
  variant: Variant | null,
  sellingUnit: SellingUnit | null,
) {
  const availableBaseQuantity = getAvailableBaseQuantity(product, variant);
  if (availableBaseQuantity === null) {
    return null;
  }

  const conversionFactor = Math.max(0.001, Number(sellingUnit?.conversionFactor ?? 1));
  return Math.max(0, Math.floor((availableBaseQuantity + 0.0005) / conversionFactor));
}

function isProductOutOfStock(product: Product) {
  if (product.availableQuantity === null) {
    return false;
  }
  if (product.variants.length === 0) {
    return product.availableQuantity <= 0;
  }
  return product.variants.length > 0 && product.variants.every(
    (variant) => variant.availableQuantity !== null && variant.availableQuantity <= 0,
  );
}

function getProductPrice(product: Product, variant: Variant | null = null) {
  const unitPrice = variant?.unitPrice ?? product.unitPrice;
  return getProductPromotion(product, variant)?.promotionalUnitPrice ?? unitPrice;
}

function getProductOriginalPrice(product: Product, variant: Variant | null = null) {
  const unitPrice = variant?.unitPrice ?? product.unitPrice;
  const promotion = getProductPromotion(product, variant);

  if (promotion?.promotionalUnitPrice !== null && promotion?.promotionalUnitPrice < unitPrice) {
    return unitPrice;
  }

  return !variant && product.compareAtPrice && product.compareAtPrice > unitPrice
    ? product.compareAtPrice
    : null;
}

function getProductPreviewTotal(
  product: Product,
  variant: Variant | null,
  quantity: number,
  unitPriceOverride?: number
) {
  const unitPrice = unitPriceOverride ?? variant?.unitPrice ?? product.unitPrice;
  const grossTotal = toCartMoney(unitPrice * quantity);
  const promotion = getProductPromotion(product, variant);

  if (!promotion) return grossTotal;
  if (quantity < Number(promotion.minimumLineQuantity ?? 0)) return grossTotal;
  if (grossTotal < Number(promotion.minimumBasketAmount ?? 0)) return grossTotal;

  const buyQuantity = Number(promotion.buyQuantity ?? 0);
  const rewardQuantity = Number(promotion.rewardQuantity ?? 0);
  const rewardedUnits = buyQuantity > 0 && rewardQuantity > 0
    ? Math.floor(quantity / (buyQuantity + rewardQuantity)) * rewardQuantity
    : quantity;

  if (rewardedUnits <= 0) return grossTotal;

  let discountAmount = 0;
  if (promotion.discountType === "PERCENT") {
    discountAmount = unitPrice * rewardedUnits * Math.min(100, promotion.discountValue) / 100;
  } else if (promotion.discountType === "AMOUNT") {
    discountAmount = buyQuantity > 0 && rewardQuantity > 0
      ? Math.min(unitPrice, promotion.discountValue) * rewardedUnits
      : Math.min(grossTotal, promotion.discountValue);
  } else if (promotion.discountType === "FIXED_PRICE") {
    discountAmount = Math.max(0, unitPrice - Math.min(unitPrice, promotion.discountValue)) * rewardedUnits;
  }

  return toCartMoney(Math.max(0, grossTotal - discountAmount));
}

function getPromotionLabel(promotion: ProductPromotion, money: Intl.NumberFormat) {
  const buyQuantity = Number(promotion.buyQuantity ?? 0);
  const rewardQuantity = Number(promotion.rewardQuantity ?? 0);

  if (buyQuantity > 0 && rewardQuantity > 0) {
    if (promotion.discountType === "PERCENT" && promotion.discountValue >= 100) {
      return `Buy ${buyQuantity}, get ${rewardQuantity} free`;
    }
    if (promotion.discountType === "PERCENT") {
      return `Buy ${buyQuantity}, get ${rewardQuantity} at ${promotion.discountValue}% off`;
    }
    return promotion.name;
  }

  if (Number(promotion.minimumLineQuantity ?? 0) > 1) {
    return `${promotion.name} · Buy ${promotion.minimumLineQuantity}+`;
  }

  if (promotion.minimumBasketAmount && promotion.targetScope === "ALL_ITEMS") {
    return `${promotion.name} · Spend ${money.format(promotion.minimumBasketAmount)}`;
  }

  if (promotion.discountType === "PERCENT") {
    return `${promotion.discountValue}% off`;
  }
  if (promotion.discountType === "AMOUNT") {
    return `Save ${money.format(promotion.discountValue)}`;
  }

  return promotion.name;
}

function getPromotionScopeLabel(promotion: ProductPromotion) {
  switch (promotion.targetScope) {
    case "ALL_ITEMS":
      return "Storewide: all products";
    case "DEPARTMENT":
      return promotion.targetDepartmentCode
        ? `Department: ${promotion.targetDepartmentCode}`
        : "Selected department only";
    case "CATEGORY":
      return promotion.targetCategoryCode
        ? `Category: ${promotion.targetCategoryCode}`
        : "Selected category only";
    case "PRODUCT":
      return "This product only";
    default:
      return "Selected products only";
  }
}

const promotionWeekdays = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY"
];

function formatPromotionDays(values: string[]) {
  const days = new Set(values.map((value) => value.trim().toUpperCase()));
  if (days.size === 0 || promotionWeekdays.every((day) => days.has(day))) {
    return "Every day";
  }
  if (promotionWeekdays.slice(0, 5).every((day) => days.has(day)) && days.size === 5) {
    return "Monday-Friday";
  }
  if (days.has("SATURDAY") && days.has("SUNDAY") && days.size === 2) {
    return "Saturday-Sunday";
  }

  return promotionWeekdays
    .filter((day) => days.has(day))
    .map((day) => day.slice(0, 3).toLowerCase().replace(/^./, (letter) => letter.toUpperCase()))
    .join(", ");
}

function formatPromotionMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${period}`;
}

function getPromotionTerms(
  promotion: ProductPromotion,
  money: Intl.NumberFormat,
  timezone: string
) {
  const terms: string[] = [getPromotionScopeLabel(promotion)];
  const buyQuantity = Number(promotion.buyQuantity ?? 0);
  const rewardQuantity = Number(promotion.rewardQuantity ?? 0);

  if (buyQuantity > 0 && rewardQuantity > 0) {
    terms.push(`Add ${buyQuantity + rewardQuantity} to cart and pay for ${buyQuantity}`);
  } else if (Number(promotion.minimumLineQuantity ?? 0) > 1) {
    terms.push(`Minimum quantity ${promotion.minimumLineQuantity}`);
  }
  if (Number(promotion.minimumBasketAmount ?? 0) > 0) {
    terms.push(`Minimum order ${money.format(Number(promotion.minimumBasketAmount))}`);
  }

  const validDays = formatPromotionDays(promotion.activeDaysOfWeek);
  if (promotion.activeFromMinutes !== null || promotion.activeToMinutes !== null) {
    const from = formatPromotionMinutes(promotion.activeFromMinutes ?? 0);
    const to = formatPromotionMinutes(promotion.activeToMinutes ?? 1439);
    terms.push(`${validDays}, ${from}-${to} (${timezone})`);
  } else if (promotion.activeDaysOfWeek.length > 0) {
    terms.push(validDays);
  }

  return terms.join(" | ");
}

export function PublicStorefront({
  storefront,
  initialProductCode = null,
  initialProduct = null,
  initialSearchQuery = null,
}: {
  storefront: PublicStorefrontData;
  initialProductCode?: string | null;
  initialProduct?: ProductDetail | null;
  initialSearchQuery?: string | null;
}) {
  const router = useRouter();
  const storageKey = `flash-erp-cart:${storefront.store.code}`;
  const socialAuthResumeKey = `flash-erp-social-auth-resume:${storefront.store.code}`;
  const searchResultsMode = initialSearchQuery !== null;
  const initialPriceBounds = getProductPriceBounds(storefront.products);
  const priceSliderMaximum = Math.max(initialPriceBounds.minimum + 1, initialPriceBounds.maximum);
  const [searchText, setSearchText] = useState(initialSearchQuery ?? "");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchFiltersOpen, setSearchFiltersOpen] = useState(false);
  const [selectedSearchCategories, setSelectedSearchCategories] = useState<string[]>([]);
  const [selectedSearchBrands, setSelectedSearchBrands] = useState<string[]>([]);
  const [searchMinimumPrice, setSearchMinimumPrice] = useState(initialPriceBounds.minimum);
  const [searchMaximumPrice, setSearchMaximumPrice] = useState(priceSliderMaximum);
  const [catalogSelection, setCatalogSelection] = useState<StorefrontCatalogSelection>({ level: "ALL" });
  const [textSize, setTextSize] = useState<StorefrontTextSize>("MEDIUM");
  const [textSizeReady, setTextSizeReady] = useState(false);
  const [promotionStripDismissed, setPromotionStripDismissed] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const [drawerView, setDrawerView] = useState<DrawerView>(null);
  const [quickProduct, setQuickProduct] = useState<ProductDetail | null>(initialProduct);
  const [productDetailsBusy, setProductDetailsBusy] = useState(
    Boolean(initialProductCode && !initialProduct),
  );
  const [quickVariant, setQuickVariant] = useState<Variant | null>(null);
  const [quickSellingUnitOfMeasure, setQuickSellingUnitOfMeasure] = useState("");
  const [quickQuantity, setQuickQuantity] = useState(1);
  const [quickImageUrl, setQuickImageUrl] = useState<string | null>(null);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageViewerZoomed, setImageViewerZoomed] = useState(false);
  const [imageViewerProduct, setImageViewerProduct] = useState<ProductDetail | null>(null);
  const [imageViewerUrl, setImageViewerUrl] = useState<string | null>(null);
  const [productDetailTab, setProductDetailTab] = useState<"DESCRIPTION" | "SPECIFICATIONS" | "REVIEWS">("DESCRIPTION");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [session, setSession] = useState<CustomerSession>({ authenticated: false, customer: null });
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"SIGN_IN" | "SIGN_UP" | "VERIFY" | "RESET" | "RESET_VERIFY">("SIGN_IN");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [developmentCode, setDevelopmentCode] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [socialAuthBusy, setSocialAuthBusy] = useState<SocialAuthProvider | null>(null);
  const [socialAuthProviders, setSocialAuthProviders] = useState<SocialAuthProviderOption[]>([
    { id: "google", enabled: false },
    { id: "facebook", enabled: false },
  ]);
  const [socialAuthResult, setSocialAuthResult] = useState<SocialAuthResult | null>(null);
  const [resumeCheckoutAfterAuth, setResumeCheckoutAfterAuth] = useState(false);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [ordersBusy, setOrdersBusy] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null);
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<"DELIVERY" | "PICKUP">(
    storefront.store.allowDelivery ? "DELIVERY" : "PICKUP"
  );
  const [pickupStoreCode, setPickupStoreCode] = useState(
    storefront.store.pickupLocations[0]?.storeCode ?? "",
  );
  const [recipientName, setRecipientName] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [saveAddress, setSaveAddress] = useState(true);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [cartStockError, setCartStockError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<{
    orderNo: string;
    totalAmount: number;
    currencyCode: string;
    paymentMethodCode: string;
    paymentMethodName: string;
    paymentTiming: "ON_DELIVERY" | "PREPAY";
    orderType: "SALES_ORDER" | "LAYAWAY";
    paymentAmountDueNow: number;
    fulfillment: EcommerceQuote["fulfillment"];
  } | null>(null);
  const [checkoutOrderType, setCheckoutOrderType] = useState<"SALES_ORDER" | "LAYAWAY">("SALES_ORDER");
  const [layawayDepositAmount, setLayawayDepositAmount] = useState(0);
  const [selectedPaymentCode, setSelectedPaymentCode] = useState(
    storefront.store.payOnDeliveryEnabled
      ? "PAY_ON_DELIVERY"
      : storefront.paymentMethods[0]?.code ?? ""
  );
  const [receiptEmail, setReceiptEmail] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);
  const checkoutRequestKeyRef = useRef<string | null>(null);
  const paymentRequestKeyRef = useRef<string | null>(null);
  const productDetailsRef = useRef(new Map<string, ProductDetail>(
    initialProduct ? [[normalizeProductCode(initialProduct.code), initialProduct]] : [],
  ));
  const productDetailRequestIdRef = useRef(0);
  const [toast, setToast] = useState<string | null>(null);
  const [quickQuote, setQuickQuote] = useState<{ key: string; value: EcommerceQuote } | null>(null);
  const [cartQuote, setCartQuote] = useState<{ key: string; value: EcommerceQuote } | null>(null);

  const money = useMemo(
    () =>
      new Intl.NumberFormat("en-GH", {
        style: "currency",
        currency: storefront.store.currencyCode,
        maximumFractionDigits: 2
      }),
    [storefront.store.currencyCode]
  );
  const checkoutPaymentOptions = useMemo<CheckoutPaymentOption[]>(
    () => [
      ...(storefront.store.payOnDeliveryEnabled
        ? [{
            code: "PAY_ON_DELIVERY",
            name: "Pay on delivery or collection",
            description: "Pay when the shop delivers your order or when you collect it.",
            timing: "ON_DELIVERY" as const
          }]
        : []),
      ...storefront.paymentMethods.map((method) => ({
        code: method.code,
        name: method.name,
        description: `Secure online payment with ${method.provider}.`,
        timing: "PREPAY" as const
      }))
    ],
    [storefront.paymentMethods, storefront.store.payOnDeliveryEnabled]
  );
  const effectiveCheckoutPaymentOptions = useMemo(
    () => checkoutOrderType === "LAYAWAY"
      ? checkoutPaymentOptions.filter((method) => method.timing === "PREPAY")
      : checkoutPaymentOptions,
    [checkoutOrderType, checkoutPaymentOptions],
  );
  const whatsappDigits = storefront.store.whatsappPhone?.replace(/\D/g, "") ?? "";
  const publicStoreCode = storefront.store.slug || storefront.store.code;
  const publicStoreHref = `/shop/${encodeURIComponent(publicStoreCode)}`;
  const imageViewerImages = imageViewerProduct
    ? [
        ...imageViewerProduct.galleryImageUrls,
        imageViewerProduct.imageUrl,
        imageViewerUrl
      ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
    : [];
  const imageViewerImageIndex = imageViewerUrl
    ? Math.max(0, imageViewerImages.indexOf(imageViewerUrl))
    : 0;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as CartLine[];
        if (Array.isArray(parsed)) {
          setCart(parsed.flatMap((line) => {
            const product = storefront.products.find((candidate) => candidate.id === line.productId);

            if (!product) {
              return [];
            }

            const variant = line.variantCode
              ? product.variants.find((candidate) => candidate.code === line.variantCode) ?? null
              : null;
            const sellingUnit = resolveProductSellingUnit(
              product,
              variant,
              line.sellingUnitOfMeasure
            );
            const unitOfMeasure = sellingUnit?.unitOfMeasureCode ?? product.baseUnitOfMeasure;

            return [{
              ...line,
              key: `${product.id}:${variant?.code ?? "base"}:${unitOfMeasure}`,
              sellingUnitOfMeasure: unitOfMeasure,
              sellingUnitName: sellingUnit?.unitOfMeasureName ?? unitOfMeasure,
              baseUnitOfMeasure: product.baseUnitOfMeasure,
              uomConversionFactor: sellingUnit?.conversionFactor ?? 1,
              unitPrice: sellingUnit?.unitPrice ?? variant?.unitPrice ?? product.unitPrice
            }];
          }));
        }
      }
    } finally {
      setCartReady(true);
    }
  }, [storageKey]);

  useEffect(() => {
    const stored = window.localStorage.getItem(storefrontTextSizeStorageKey);
    if (stored === "SMALL" || stored === "MEDIUM" || stored === "LARGE") {
      setTextSize(stored);
    }
    setTextSizeReady(true);
  }, []);

  useEffect(() => {
    if (textSizeReady) {
      window.localStorage.setItem(storefrontTextSizeStorageKey, textSize);
    }
  }, [textSize, textSizeReady]);

  useEffect(() => {
    if (cartReady) {
      window.localStorage.setItem(storageKey, JSON.stringify(cart));
    }
  }, [cart, cartReady, storageKey]);

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    let active = true;
    void fetch(`/api/ecommerce/${encodeURIComponent(storefront.store.code)}/auth/oauth/providers`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { providers?: SocialAuthProviderOption[] };
        if (active && Array.isArray(payload.providers)) {
          setSocialAuthProviders(payload.providers);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [storefront.store.code]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const provider = url.searchParams.get("socialProvider");
    const result = url.searchParams.get("socialAuth");
    if (
      (provider === "google" || provider === "facebook") &&
      (result === "success" ||
        result === "cancelled" ||
        result === "conflict" ||
        result === "failed" ||
        result === "unavailable")
    ) {
      setSocialAuthResult({ provider, result });
    }
    if (provider || result) {
      url.searchParams.delete("socialProvider");
      url.searchParams.delete("socialAuth");
      const query = url.searchParams.toString();
      window.history.replaceState({}, "", `${url.pathname}${query ? `?${query}` : ""}${url.hash}`);
    }
  }, []);

  useEffect(() => {
    if (!socialAuthResult || !cartReady) return;
    const result = socialAuthResult;
    setSocialAuthResult(null);
    void (async () => {
      try {
        if (result.result !== "success") {
          const messages: Record<Exclude<SocialAuthResult["result"], "success">, string> = {
            cancelled: "Social sign-in was cancelled.",
            conflict: "That social account is already linked to another customer account.",
            failed: "Social sign-in could not be completed. Please try again.",
            unavailable: "That social sign-in option is not available yet.",
          };
          setAuthError(messages[result.result]);
          setAuthMode("SIGN_IN");
          setAuthOpen(true);
          return;
        }

        const nextSession = await refreshSession();
        if (!nextSession?.authenticated) {
          setAuthError("Your social sign-in completed, but the customer session could not be opened.");
          setAuthOpen(true);
          return;
        }
        setAuthOpen(false);
        showToast(`Signed in with ${result.provider === "google" ? "Google" : "Facebook"}`);
        if (window.sessionStorage.getItem(socialAuthResumeKey) === "checkout" && cart.length > 0) {
          await beginCheckout(true);
        }
      } finally {
        window.sessionStorage.removeItem(socialAuthResumeKey);
        setSocialAuthBusy(null);
      }
    })();
  }, [cartReady, socialAuthResult]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const refreshAt = storefront.promotionRefreshAt
      ? new Date(storefront.promotionRefreshAt).getTime()
      : Number.NaN;
    const timeout = Number.isFinite(refreshAt)
      ? window.setTimeout(
          () => router.refresh(),
          Math.max(1_000, Math.min(2_147_000_000, refreshAt - Date.now() + 1_000))
        )
      : null;
    const refreshVisibleStorefront = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };

    window.addEventListener("focus", refreshVisibleStorefront);
    document.addEventListener("visibilitychange", refreshVisibleStorefront);
    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      window.removeEventListener("focus", refreshVisibleStorefront);
      document.removeEventListener("visibilitychange", refreshVisibleStorefront);
    };
  }, [router, storefront.promotionRefreshAt]);

  useEffect(() => {
    if (session.customer) {
      setRecipientName((value) => value || session.customer?.fullName || "");
      setDeliveryPhone((value) => value || session.customer?.phone || "");
      setReceiptEmail((value) => value || session.customer?.email || "");
    }
  }, [session.customer]);

  useEffect(() => {
    if (session.authenticated && !account) {
      void refreshAccount(true);
    }
    if (!session.authenticated) {
      setAccount(null);
    }
  }, [session.authenticated]);

  useEffect(() => {
    const defaultAddress = account?.addresses.find((address) => address.isDefault);
    if (!defaultAddress) return;

    setRecipientName((value) => value || defaultAddress.recipientName);
    setDeliveryPhone((value) => value || defaultAddress.phone);
    setAddressLine1((value) => value || defaultAddress.addressLine1);
    setAddressLine2((value) => value || defaultAddress.addressLine2 || "");
    setCity((value) => value || defaultAddress.city);
    setRegion((value) => value || defaultAddress.region || "");
    setDeliveryNote((value) => value || defaultAddress.deliveryNote || "");
  }, [account]);

  useEffect(() => {
    if (!initialProductCode) {
      productDetailRequestIdRef.current += 1;
      setQuickProduct(null);
      setQuickVariant(null);
      setQuickSellingUnitOfMeasure("");
      setQuickQuantity(1);
      setQuickImageUrl(null);
      setProductDetailsBusy(false);
      setImageViewerOpen(false);
      setImageViewerZoomed(false);
      setImageViewerProduct(null);
      setImageViewerUrl(null);
      setProductDetailTab("DESCRIPTION");
      return;
    }

    if (initialProduct) {
      productDetailRequestIdRef.current += 1;
      productDetailsRef.current.set(
        normalizeProductCode(initialProduct.code),
        initialProduct,
      );
      applyQuickProduct(initialProduct);
      return;
    }

    const product = storefront.products.find(
      (entry) => normalizeProductCode(entry.code) === normalizeProductCode(initialProductCode),
    );
    if (product) {
      void loadProductDetails(product);
      return;
    }

    setQuickProduct(null);
    setProductDetailsBusy(false);
  }, [initialProduct, initialProductCode, storefront.products]);

  useEffect(() => {
    if (!imageViewerOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setImageViewerOpen(false);
        setImageViewerZoomed(false);
        setImageViewerProduct(null);
        setImageViewerUrl(null);
      } else if (event.key === "ArrowLeft") {
        navigateImageViewer(-1);
      } else if (event.key === "ArrowRight") {
        navigateImageViewer(1);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [imageViewerOpen, imageViewerProduct, imageViewerUrl]);

  const catalogTree = useMemo(
    () => buildStorefrontCategoryTree(storefront.products),
    [storefront.products],
  );
  const catalogSelectionLabel = getStorefrontSelectionLabel(catalogSelection);
  const searchSuggestionGroups = useMemo<SearchSuggestionGroup[]>(() => {
    const query = searchText.trim();
    if (query.length < 2) return [];

    const normalizedQuery = query.toLowerCase();
    const products = storefront.products
      .filter((product) => productMatchesSearch(product, query))
      .slice(0, 6)
      .map((product) => ({
        key: `product:${product.id}`,
        label: product.name,
        query,
        type: "Product" as const,
        imageUrl: product.imageUrl,
      }));
    const taxonomy = new Map<string, SearchSuggestion>();
    const brands = new Map<string, SearchSuggestion>();

    for (const product of storefront.products) {
      for (const [type, value] of [
        ["Department", product.department],
        ["Category", product.category],
        ["Subcategory", product.subcategory],
      ] as const) {
        if (!value) continue;
        const label = formatStorefrontTaxonomyLabel(value);
        if (!label.toLowerCase().includes(normalizedQuery)) continue;
        const key = `${type.toLowerCase()}:${label.toLowerCase()}`;
        if (!taxonomy.has(key)) {
          taxonomy.set(key, { key, label, query: label, type });
        }
      }

      const brand = product.brand?.trim();
      if (brand && brand.toLowerCase().includes(normalizedQuery)) {
        const key = `brand:${brand.toLowerCase()}`;
        if (!brands.has(key)) {
          brands.set(key, { key, label: brand, query: brand, type: "Brand" });
        }
      }
    }

    return [
      { label: "Products", suggestions: products },
      {
        label: "Categories",
        suggestions: [...taxonomy.values()]
          .sort((left, right) => left.label.localeCompare(right.label))
          .slice(0, 6),
      },
      {
        label: "Brands",
        suggestions: [...brands.values()]
          .sort((left, right) => left.label.localeCompare(right.label))
          .slice(0, 5),
      },
    ].filter((group) => group.suggestions.length > 0) as SearchSuggestionGroup[];
  }, [searchText, storefront.products]);
  const visibleProducts = useMemo(() => {
    return storefront.products.filter((product) => {
      const categoryMatches = productMatchesStorefrontSelection(product, catalogSelection);
      return categoryMatches && productMatchesSearch(product, searchText);
    });
  }, [catalogSelection, searchText, storefront.products]);
  const activeSearchQuery = (initialSearchQuery ?? searchText).trim();
  const searchMatchedProducts = useMemo(
    () => storefront.products.filter((product) => productMatchesSearch(product, activeSearchQuery)),
    [activeSearchQuery, storefront.products],
  );
  const searchCategoryFacets = useMemo(() => {
    const facets = new Map<string, { value: string; label: string; count: number }>();
    for (const product of searchMatchedProducts) {
      const label = formatStorefrontTaxonomyLabel(product.category);
      const value = label.toLowerCase();
      const current = facets.get(value);
      facets.set(value, { value, label, count: (current?.count ?? 0) + 1 });
    }
    return [...facets.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [searchMatchedProducts]);
  const searchBrandFacets = useMemo(() => {
    const facets = new Map<string, { value: string; label: string; count: number }>();
    for (const product of searchMatchedProducts) {
      const label = product.brand?.trim();
      if (!label) continue;
      const value = label.toLowerCase();
      const current = facets.get(value);
      facets.set(value, { value, label: current?.label ?? label, count: (current?.count ?? 0) + 1 });
    }
    return [...facets.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [searchMatchedProducts]);
  const filteredSearchProducts = useMemo(
    () => searchMatchedProducts.filter((product) => {
      const category = formatStorefrontTaxonomyLabel(product.category).toLowerCase();
      const brand = product.brand?.trim().toLowerCase() ?? "";
      const price = getProductPrice(product);
      return (
        (selectedSearchCategories.length === 0 || selectedSearchCategories.includes(category)) &&
        (selectedSearchBrands.length === 0 || selectedSearchBrands.includes(brand)) &&
        price >= searchMinimumPrice &&
        price <= searchMaximumPrice
      );
    }),
    [
      searchMatchedProducts,
      searchMaximumPrice,
      searchMinimumPrice,
      selectedSearchBrands,
      selectedSearchCategories,
    ],
  );
  const activeSearchFilterCount =
    selectedSearchCategories.length +
    selectedSearchBrands.length +
    Number(searchMinimumPrice !== initialPriceBounds.minimum || searchMaximumPrice !== priceSliderMaximum);
  const searchRangeStart = priceSliderMaximum === initialPriceBounds.minimum
    ? 0
    : ((searchMinimumPrice - initialPriceBounds.minimum) / (priceSliderMaximum - initialPriceBounds.minimum)) * 100;
  const searchRangeEnd = priceSliderMaximum === initialPriceBounds.minimum
    ? 100
    : ((searchMaximumPrice - initialPriceBounds.minimum) / (priceSliderMaximum - initialPriceBounds.minimum)) * 100;

  const featuredProducts = storefront.products.filter((product) => product.featured).slice(0, 8);
  const relatedProducts = useMemo(() => {
    if (!quickProduct) return [];

    return storefront.products
      .filter((product) => product.id !== quickProduct.id)
      .map((product) => ({ product, score: getRelatedProductScore(quickProduct, product) }))
      .sort((left, right) =>
        right.score - left.score ||
        Number(right.product.featured) - Number(left.product.featured) ||
        right.product.averageRating - left.product.averageRating ||
        left.product.name.localeCompare(right.product.name)
      )
      .slice(0, 6)
      .map(({ product }) => product);
  }, [quickProduct, storefront.products]);
  const selectedProductPromotion = quickProduct
    ? getProductPromotion(quickProduct, quickVariant)
    : null;
  const selectedProductSellingUnit = quickProduct
    ? resolveProductSellingUnit(quickProduct, quickVariant, quickSellingUnitOfMeasure)
    : null;
  const selectedProductPrice = quickProduct
    ? selectedProductSellingUnit?.unitPrice ?? getProductPrice(quickProduct, quickVariant)
    : 0;
  const quickMaximumQuantity = quickProduct && (quickProduct.variants.length === 0 || quickVariant)
    ? getMaximumOrderQuantity(quickProduct, quickVariant, selectedProductSellingUnit)
    : null;
  const quickOutOfStock = quickMaximumQuantity === 0;
  const selectedProductOriginalPrice = quickProduct
    ? getProductOriginalPrice(quickProduct, quickVariant)
    : null;
  const quickQuoteKey = quickProduct
    ? JSON.stringify([
        quickProduct.id,
        quickVariant?.code ?? null,
        selectedProductSellingUnit?.unitOfMeasureCode ?? null,
        quickQuantity
      ])
    : "";
  const selectedProductTotal = quickProduct
    ? quickQuote?.key === quickQuoteKey
      ? quickQuote.value.totalAmount
      : getProductPreviewTotal(quickProduct, quickVariant, quickQuantity, selectedProductPrice)
    : 0;
  const cartQuantity = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartQuoteKey = JSON.stringify({
    lines: cart.map((line) => [line.productId, line.variantCode, line.sellingUnitOfMeasure, line.quantity]),
    fulfilmentMethod: deliveryMethod,
    pickupStoreCode: deliveryMethod === "PICKUP" ? pickupStoreCode : null,
  });
  const fallbackCartSubtotal = toCartMoney(
    cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
  );
  const currentCartQuote = cartQuote?.key === cartQuoteKey ? cartQuote.value : null;
  const cartSubtotal = currentCartQuote?.subtotalAmount ?? fallbackCartSubtotal;
  const cartDiscount = currentCartQuote?.discountAmount ?? 0;
  const checkoutTotal = currentCartQuote?.totalAmount ?? fallbackCartSubtotal;
  const minimumLayawayDeposit = toCartMoney(
    checkoutTotal * (storefront.store.layawayOffer.minimumDepositPercent / 100),
  );

  useEffect(() => {
    if (!quickProduct || (quickProduct.variants.length > 0 && !quickVariant)) {
      setQuickQuote(null);
      return;
    }

    const quoteKey = quickQuoteKey;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/ecommerce/${encodeURIComponent(storefront.store.code)}/quote`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              lines: [{
                productId: quickProduct.id,
                variantCode: quickVariant?.code ?? null,
                sellingUnitOfMeasure: selectedProductSellingUnit?.unitOfMeasureCode ?? null,
                quantity: quickQuantity
              }]
            }),
            signal: controller.signal
          }
        );
        if (response.ok) {
          setQuickQuote({ key: quoteKey, value: await response.json() as EcommerceQuote });
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setQuickQuote(null);
        }
      }
    }, 120);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [quickProduct, quickVariant, selectedProductSellingUnit, quickQuantity, quickQuoteKey, storefront.store.code]);

  useEffect(() => {
    if (cart.length === 0) {
      setCartQuote(null);
      setCartStockError(null);
      return;
    }

    const quoteKey = cartQuoteKey;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/ecommerce/${encodeURIComponent(storefront.store.code)}/quote`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              lines: cart.map((line) => ({
                productId: line.productId,
                variantCode: line.variantCode,
                sellingUnitOfMeasure: line.sellingUnitOfMeasure,
                quantity: line.quantity
              })),
              delivery: {
                fulfilmentMethod: deliveryMethod,
                pickupStoreCode: deliveryMethod === "PICKUP" ? pickupStoreCode : null,
              },
            }),
            signal: controller.signal
          }
        );
        const quote = await readJson<EcommerceQuote>(response);
        setCartQuote({ key: quoteKey, value: quote });
        setCartStockError(null);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setCartQuote(null);
          setCartStockError(error instanceof Error ? error.message : "Some cart items are no longer available.");
        }
      }
    }, 120);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [cart, cartQuoteKey, deliveryMethod, pickupStoreCode, storefront.store.code]);

  useEffect(() => {
    if (quickMaximumQuantity === null || quickMaximumQuantity <= 0) {
      return;
    }
    setQuickQuantity((current) => Math.min(current, quickMaximumQuantity));
  }, [quickMaximumQuantity]);

  async function refreshSession() {
    const response = await fetch(`/api/ecommerce/${encodeURIComponent(storefront.store.code)}/auth/session`, {
      cache: "no-store"
    });
    if (response.ok) {
      const nextSession = (await response.json()) as CustomerSession;
      setSession(nextSession);
      return nextSession;
    }
    return null;
  }

  function startSocialAuth(provider: SocialAuthProvider) {
    const providerOption = socialAuthProviders.find((option) => option.id === provider);
    if (!providerOption?.enabled) {
      setAuthError(`${provider === "google" ? "Google" : "Facebook"} sign-in is not configured yet.`);
      return;
    }
    setSocialAuthBusy(provider);
    setAuthError(null);
    window.sessionStorage.setItem(
      socialAuthResumeKey,
      resumeCheckoutAfterAuth ? "checkout" : "account",
    );
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(
      `/api/ecommerce/${encodeURIComponent(storefront.store.code)}/auth/oauth/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  function showToast(message: string) {
    setToast(message);
  }

  function applyQuickProduct(product: ProductDetail) {
    const variant = product.variants.length === 1 ? product.variants[0] : null;
    setQuickProduct(product);
    setQuickVariant(variant);
    setQuickSellingUnitOfMeasure(
      resolveProductSellingUnit(product, variant)?.unitOfMeasureCode ?? "",
    );
    setQuickQuantity(1);
    setQuickImageUrl(product.galleryImageUrls[0] ?? product.imageUrl);
    setProductDetailsBusy(false);
    setImageViewerOpen(false);
    setImageViewerZoomed(false);
    setImageViewerProduct(null);
    setImageViewerUrl(null);
    setProductDetailTab("DESCRIPTION");
    setReviewMessage(null);
  }

  async function loadProductDetails(product: Product) {
    const productKey = normalizeProductCode(product.code);
    const cached = productDetailsRef.current.get(productKey);
    if (cached) {
      applyQuickProduct(cached);
      return;
    }

    const requestId = productDetailRequestIdRef.current + 1;
    productDetailRequestIdRef.current = requestId;
    setProductDetailsBusy(true);
    try {
      const detail = await readJson<ProductDetail>(
        await fetch(
          `/api/ecommerce/${encodeURIComponent(storefront.store.code)}/products/${encodeURIComponent(product.code)}`,
          { cache: "force-cache" },
        ),
      );
      if (requestId !== productDetailRequestIdRef.current) {
        return;
      }
      productDetailsRef.current.set(productKey, detail);
      applyQuickProduct(detail);
    } catch (error) {
      if (requestId !== productDetailRequestIdRef.current) {
        return;
      }
      setQuickProduct(null);
      setProductDetailsBusy(false);
      showToast(error instanceof Error ? error.message : "The product could not be loaded.");
    }
  }

  function openProduct(product: Product) {
    void loadProductDetails(product);
    router.push(
      `${publicStoreHref}/products/${encodeURIComponent(product.code)}`
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeProduct() {
    productDetailRequestIdRef.current += 1;
    closeImageViewer();
    setQuickProduct(null);
    setProductDetailsBusy(false);
    router.push(publicStoreHref);
  }

  function showCatalog(selection: StorefrontCatalogSelection) {
    setCatalogSelection(selection);
    setSearchText("");
    if (quickProduct) {
      productDetailRequestIdRef.current += 1;
      closeImageViewer();
      setQuickProduct(null);
      setProductDetailsBusy(false);
      router.push(publicStoreHref);
    }
  }

  function navigateToSearch(query: string) {
    const normalizedQuery = query.trim();
    setSearchFocused(false);
    if (!normalizedQuery) {
      setSearchText("");
      router.push(publicStoreHref);
      return;
    }

    setSearchText(normalizedQuery);
    router.push(`${publicStoreHref}/search?q=${encodeURIComponent(normalizedQuery)}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearSearch() {
    setSearchText("");
    setSearchFocused(false);
    if (searchResultsMode) {
      router.push(publicStoreHref);
    }
  }

  function toggleSearchFilter(
    value: string,
    setter: (updater: (current: string[]) => string[]) => void,
  ) {
    setter((current) => current.includes(value)
      ? current.filter((candidate) => candidate !== value)
      : [...current, value]);
  }

  function clearSearchFilters() {
    setSelectedSearchCategories([]);
    setSelectedSearchBrands([]);
    setSearchMinimumPrice(initialPriceBounds.minimum);
    setSearchMaximumPrice(priceSliderMaximum);
  }

  function updateGlobalSearch(value: string) {
    setSearchText(value);
    if (quickProduct) {
      productDetailRequestIdRef.current += 1;
      closeImageViewer();
      setQuickProduct(null);
      setProductDetailsBusy(false);
      router.push(publicStoreHref);
    }
  }

  function navigateQuickProductImage(direction: -1 | 1) {
    if (!quickProduct || quickProduct.galleryImageUrls.length <= 1) return;

    const currentIndex = Math.max(0, quickProduct.galleryImageUrls.indexOf(quickImageUrl ?? ""));
    const nextIndex = (
      currentIndex + direction + quickProduct.galleryImageUrls.length
    ) % quickProduct.galleryImageUrls.length;
    setQuickImageUrl(quickProduct.galleryImageUrls[nextIndex]);
  }

  function openImageViewer(product: ProductDetail, imageUrl: string | null) {
    if (!imageUrl) {
      openProduct(product);
      return;
    }
    setImageViewerProduct(product);
    setImageViewerUrl(imageUrl);
    setImageViewerZoomed(false);
    setImageViewerOpen(true);
  }

  function closeImageViewer() {
    setImageViewerOpen(false);
    setImageViewerZoomed(false);
    setImageViewerProduct(null);
    setImageViewerUrl(null);
  }

  function navigateImageViewer(direction: -1 | 1) {
    if (!imageViewerProduct || !imageViewerUrl) return;
    if (imageViewerImages.length <= 1) return;

    const nextIndex = (
      imageViewerImageIndex + direction + imageViewerImages.length
    ) % imageViewerImages.length;
    setImageViewerUrl(imageViewerImages[nextIndex]);
    setImageViewerZoomed(false);
  }

  function addProduct(
    product: Product,
    variant: Variant | null,
    quantity: number,
    sellingUnit: SellingUnit | null = resolveProductSellingUnit(product, variant)
  ) {
    const unitOfMeasure = sellingUnit?.unitOfMeasureCode ?? product.baseUnitOfMeasure;
    const key = `${product.id}:${variant?.code ?? "base"}:${unitOfMeasure}`;
    const availableBaseQuantity = getAvailableBaseQuantity(product, variant);
    const requestedBaseQuantity = quantity * Math.max(0.001, Number(sellingUnit?.conversionFactor ?? 1));
    const existingBaseQuantity = cart
      .filter(
        (line) =>
          line.productId === product.id &&
          line.variantCode === (variant?.code ?? null)
      )
      .reduce(
        (total, line) => total + line.quantity * Math.max(0.001, line.uomConversionFactor),
        0
      );

    if (
      availableBaseQuantity !== null &&
      existingBaseQuantity + requestedBaseQuantity > availableBaseQuantity + 0.0005
    ) {
      const remainingQuantity = Math.max(0, Math.floor(
        (availableBaseQuantity - existingBaseQuantity + 0.0005) /
          Math.max(0.001, Number(sellingUnit?.conversionFactor ?? 1))
      ));
      showToast(
        remainingQuantity <= 0
          ? `${product.name} is currently out of stock.`
          : `Only ${remainingQuantity} more ${sellingUnit?.unitOfMeasureName ?? unitOfMeasure} can be ordered for ${product.name}.`
      );
      return;
    }

    setCart((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) {
        return current.map((line) =>
          line.key === key ? { ...line, quantity: Math.min(999, line.quantity + quantity) } : line
        );
      }
      return [
        ...current,
        {
          key,
          productId: product.id,
          productCode: product.code,
          name: product.name,
          imageUrl: product.imageUrl,
          variantCode: variant?.code ?? null,
          variantName: variant?.name ?? null,
          sellingUnitOfMeasure: unitOfMeasure,
          sellingUnitName: sellingUnit?.unitOfMeasureName ?? unitOfMeasure,
          baseUnitOfMeasure: product.baseUnitOfMeasure,
          uomConversionFactor: sellingUnit?.conversionFactor ?? 1,
          unitPrice: sellingUnit?.unitPrice ?? variant?.unitPrice ?? product.unitPrice,
          quantity
        }
      ];
    });
    showToast(`${product.name} added to cart`);
  }

  function addProductFromCard(product: Product) {
    const variant = product.variants.length === 1 ? product.variants[0] : null;

    if (productCardRequiresSelection(product.variants.length)) {
      openProduct(product);
      return;
    }

    const sellingUnit = resolveProductSellingUnit(product, variant);
    if (getMaximumOrderQuantity(product, variant, sellingUnit) === 0) {
      showToast(`${product.name} is currently out of stock.`);
      return;
    }

    addProduct(product, variant, 1, sellingUnit);
  }

  function updateCartQuantity(key: string, quantity: number) {
    if (quantity <= 0) {
      setCart((current) => current.filter((line) => line.key !== key));
      return;
    }
    setCart((current) =>
      current.map((line) => (line.key === key ? { ...line, quantity: Math.min(999, quantity) } : line))
    );
  }

  async function submitAuth() {
    setAuthBusy(true);
    setAuthError(null);
    try {
      if (authMode === "SIGN_IN") {
        await readJson(
          await fetch(`/api/ecommerce/${encodeURIComponent(storefront.store.code)}/auth/sign-in`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ identifier, password })
          })
        );
        await refreshSession();
        setAuthOpen(false);
        showToast("Welcome back");
        if (resumeCheckoutAfterAuth) {
          setResumeCheckoutAfterAuth(false);
          await beginCheckout(true);
        }
        return;
      }

      if (authMode === "SIGN_UP" || authMode === "RESET") {
        const result = await readJson<{
          challengeId: string;
          developmentCode?: string;
        }>(
          await fetch(`/api/ecommerce/${encodeURIComponent(storefront.store.code)}/auth/request-otp`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              identifier,
              purpose: authMode === "RESET" ? "PASSWORD_RESET" : "SIGN_UP"
            })
          })
        );
        setChallengeId(result.challengeId);
        setDevelopmentCode(result.developmentCode ?? null);
        setAuthMode(authMode === "RESET" ? "RESET_VERIFY" : "VERIFY");
        return;
      }

      if (authMode === "RESET_VERIFY") {
        await readJson(
          await fetch(`/api/ecommerce/${encodeURIComponent(storefront.store.code)}/auth/reset-password`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ challengeId, code: otpCode, password })
          })
        );
        setOtpCode("");
        setChallengeId(null);
        setDevelopmentCode(null);
        setAuthMode("SIGN_IN");
        showToast("Password updated");
        return;
      }

      await readJson(
        await fetch(`/api/ecommerce/${encodeURIComponent(storefront.store.code)}/auth/verify-signup`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ challengeId, code: otpCode, fullName, password })
        })
      );
      await refreshSession();
      setAuthOpen(false);
      showToast("Account created");
      if (resumeCheckoutAfterAuth) {
        setResumeCheckoutAfterAuth(false);
        await beginCheckout(true);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function beginCheckout(authenticated = session.authenticated) {
    if (cart.length === 0) {
      return;
    }
    if (!authenticated) {
      setAuthMode("SIGN_IN");
      setResumeCheckoutAfterAuth(true);
      setAuthOpen(true);
      return;
    }
    try {
      const response = await fetch(
        `/api/ecommerce/${encodeURIComponent(storefront.store.code)}/quote`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lines: cart.map((line) => ({
              productId: line.productId,
              variantCode: line.variantCode,
              sellingUnitOfMeasure: line.sellingUnitOfMeasure,
              quantity: line.quantity
            })),
            delivery: {
              fulfilmentMethod: deliveryMethod,
              pickupStoreCode: deliveryMethod === "PICKUP" ? pickupStoreCode : null,
            },
          })
        }
      );
      const quote = await readJson<EcommerceQuote>(response);
      setCartQuote({ key: cartQuoteKey, value: quote });
      setCartStockError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Some cart items are no longer available.";
      setCartStockError(message);
      setCheckoutError(message);
      setDrawerView("cart");
      showToast(message);
      return;
    }
    const availablePaymentOptions = checkoutOrderType === "LAYAWAY"
      ? checkoutPaymentOptions.filter((method) => method.timing === "PREPAY")
      : checkoutPaymentOptions;
    if (!selectedPaymentCode || !availablePaymentOptions.some((method) => method.code === selectedPaymentCode)) {
      const fallbackPaymentCode = availablePaymentOptions[0]?.code ?? "";
      if (fallbackPaymentCode) {
        setSelectedPaymentCode(fallbackPaymentCode);
      } else {
        setToast("This shop has no available ecommerce payment option.");
        return;
      }
    }
    if (checkoutOrderType === "LAYAWAY" && !storefront.store.layawayOffer.enabled) {
      setToast("Layaway is not currently available from this shop.");
      return;
    }
    if (checkoutOrderType === "LAYAWAY" && !storefront.store.layawayOffer.paymentReady) {
      setToast("Layaway needs an available online payment option for the opening deposit.");
      return;
    }
    if (checkoutOrderType === "LAYAWAY" && layawayDepositAmount <= 0) {
      setLayawayDepositAmount(minimumLayawayDeposit);
    }
    if (availablePaymentOptions.length === 0) {
      setToast("This shop has no available ecommerce payment option.");
      return;
    }
    setCreatedOrder(null);
    checkoutRequestKeyRef.current = null;
    paymentRequestKeyRef.current = null;
    setCheckoutError(null);
    setDrawerView("checkout");
  }

  async function placeOrder() {
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      checkoutRequestKeyRef.current ??= createBrowserRequestKey("checkout");
      const result = await readJson<{
        orderNo: string;
        totalAmount: number;
        currencyCode: string;
        paymentMethodCode: string;
        paymentMethodName: string;
        paymentTiming: "ON_DELIVERY" | "PREPAY";
        orderType: "SALES_ORDER" | "LAYAWAY";
        paymentAmountDueNow: number;
        fulfillment: EcommerceQuote["fulfillment"];
      }>(
        await fetch(`/api/ecommerce/${encodeURIComponent(storefront.store.code)}/orders`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": checkoutRequestKeyRef.current
          },
          body: JSON.stringify({
            lines: cart.map((line) => ({
              productId: line.productId,
              variantCode: line.variantCode,
              sellingUnitOfMeasure: line.sellingUnitOfMeasure,
              quantity: line.quantity
            })),
            delivery: {
              fulfilmentMethod: deliveryMethod,
              pickupStoreCode: deliveryMethod === "PICKUP" ? pickupStoreCode : null,
              recipientName,
              phone: deliveryPhone,
              addressLine1,
              addressLine2,
              city,
              region,
              countryCode: storefront.store.countryCode ?? "GH",
              deliveryNote,
              saveAddress
            },
            paymentMethodCode: selectedPaymentCode,
            orderType: checkoutOrderType,
            layawayDepositAmount:
              checkoutOrderType === "LAYAWAY"
                ? layawayDepositAmount || minimumLayawayDeposit
                : null,
          })
        })
      );
      setCreatedOrder(result);
      checkoutRequestKeyRef.current = null;
      setCart([]);
      showToast("Order placed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Order could not be placed.";
      setCheckoutError(message);
      if (/available|stock/i.test(message)) {
        setCartStockError(message);
      }
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function startPayment(
    tenderMethodCode: string,
    orderNo = createdOrder?.orderNo,
    amount = createdOrder?.paymentAmountDueNow,
  ) {
    if (!orderNo) {
      return;
    }
    setPaymentBusy(true);
    setCheckoutError(null);
    try {
      paymentRequestKeyRef.current ??= createBrowserRequestKey("payment");
      const result = await readJson<{ checkoutUrl: string }>(
        await fetch(
          `/api/ecommerce/${encodeURIComponent(storefront.store.code)}/orders/${encodeURIComponent(orderNo)}/payments`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "idempotency-key": paymentRequestKeyRef.current
            },
            body: JSON.stringify({ tenderMethodCode, receiptEmail, amount })
          }
        )
      );
      paymentRequestKeyRef.current = null;
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Payment could not be started.");
      setPaymentBusy(false);
    }
  }

  async function openOrders() {
    if (!session.authenticated) {
      setAuthMode("SIGN_IN");
      setResumeCheckoutAfterAuth(false);
      setAuthOpen(true);
      return;
    }
    setDrawerView("orders");
    setOrdersBusy(true);
    try {
      const result = await readJson<{ orders: CustomerOrder[] }>(
        await fetch(`/api/ecommerce/${encodeURIComponent(storefront.store.code)}/orders`, {
          cache: "no-store"
        })
      );
      setOrders(result.orders);
      setSelectedOrder((current) =>
        current ? result.orders.find((order) => order.id === current.id) ?? null : null
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Orders could not be loaded");
    } finally {
      setOrdersBusy(false);
    }
  }

  async function refreshAccount(silent = false) {
    setAccountBusy(true);
    try {
      const result = await readJson<CustomerAccount>(
        await fetch(`/api/ecommerce/${encodeURIComponent(storefront.store.code)}/account`, {
          cache: "no-store"
        })
      );
      setAccount(result);
    } catch (error) {
      if (!silent) {
        showToast(error instanceof Error ? error.message : "Your account could not be loaded.");
      }
    } finally {
      setAccountBusy(false);
    }
  }

  async function openAccount() {
    if (!session.authenticated) {
      setAuthMode("SIGN_IN");
      setResumeCheckoutAfterAuth(false);
      setAuthOpen(true);
      return;
    }
    setSelectedOrder(null);
    setDrawerView("account");
    await refreshAccount();
  }

  async function saveAccountProfile(fullName: string) {
    setAccountSaving(true);
    try {
      const result = await readJson<CustomerAccount>(
        await fetch(`/api/ecommerce/${encodeURIComponent(storefront.store.code)}/account`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fullName })
        })
      );
      setAccount(result);
      await refreshSession();
      showToast("Profile updated");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Your profile could not be updated.");
      return false;
    } finally {
      setAccountSaving(false);
    }
  }

  async function saveAccountAddress(address: CustomerAddressDraft) {
    setAccountSaving(true);
    try {
      const addressPath = address.id
        ? `/api/ecommerce/${encodeURIComponent(storefront.store.code)}/account/addresses/${encodeURIComponent(address.id)}`
        : `/api/ecommerce/${encodeURIComponent(storefront.store.code)}/account/addresses`;
      const result = await readJson<CustomerAccount>(
        await fetch(addressPath, {
          method: address.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(address)
        })
      );
      setAccount(result);
      showToast(address.id ? "Delivery address updated" : "Delivery address saved");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Your delivery address could not be saved.");
      return false;
    } finally {
      setAccountSaving(false);
    }
  }

  async function removeAccountAddress(address: CustomerAddress) {
    setAccountSaving(true);
    try {
      const result = await readJson<CustomerAccount>(
        await fetch(
          `/api/ecommerce/${encodeURIComponent(storefront.store.code)}/account/addresses/${encodeURIComponent(address.id)}`,
          { method: "DELETE" }
        )
      );
      setAccount(result);
      showToast("Delivery address removed");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Your delivery address could not be removed.");
      return false;
    } finally {
      setAccountSaving(false);
    }
  }

  function openPasswordReset() {
    setIdentifier(session.customer?.email ?? session.customer?.phone ?? "");
    setPassword("");
    setAuthError(null);
    setAuthMode("RESET");
    setResumeCheckoutAfterAuth(false);
    setDrawerView(null);
    setAuthOpen(true);
  }

  async function requestRefund(order: CustomerOrder) {
    try {
      await readJson(
        await fetch(
          `/api/ecommerce/${encodeURIComponent(storefront.store.code)}/orders/${encodeURIComponent(order.orderNo)}/refunds`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              amount: order.paidAmount,
              reason: "Customer requested refund",
              details: "Submitted from the customer order portal."
            })
          }
        )
      );
      showToast("Refund request sent");
      await openOrders();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Refund could not be requested");
    }
  }

  async function signOut() {
    await fetch(`/api/ecommerce/${encodeURIComponent(storefront.store.code)}/auth/sign-out`, {
      method: "POST"
    });
    setSession({ authenticated: false, customer: null });
    setAccount(null);
    setDrawerView(null);
    showToast("Signed out");
  }

  async function submitReview() {
    if (!quickProduct) {
      return;
    }
    if (!session.authenticated) {
      setAuthMode("SIGN_IN");
      setResumeCheckoutAfterAuth(false);
      setAuthOpen(true);
      return;
    }
    setReviewBusy(true);
    setReviewMessage(null);
    try {
      const result = await readJson<{ message: string }>(
        await fetch(
          `/api/ecommerce/${encodeURIComponent(storefront.store.code)}/products/${encodeURIComponent(quickProduct.id)}/reviews`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rating: reviewRating, title: reviewTitle, body: reviewBody })
          }
        )
      );
      setReviewTitle("");
      setReviewBody("");
      setReviewMessage(result.message);
    } catch (error) {
      setReviewMessage(error instanceof Error ? error.message : "Your review could not be saved.");
    } finally {
      setReviewBusy(false);
    }
  }

  return (
    <main className={styles.page} data-text-size={textSize.toLowerCase()}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <button className={styles.brand} onClick={() => { setDrawerView(null); if (quickProduct) closeProduct(); }} type="button">
            <span className={styles.brandMark}><Store size={21} strokeWidth={2.3} /></span>
            <span>
              <strong>{storefront.store.name}</strong>
              <small>{storefront.store.legalName}</small>
            </span>
          </button>
          <form
            className={styles.searchArea}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setSearchFocused(false);
              }
            }}
            onSubmit={(event) => {
              event.preventDefault();
              navigateToSearch(searchText);
            }}
          >
            <label className={styles.headerSearch}>
              <Search size={20} />
              <input
                aria-label="Search products, brands and categories"
                autoComplete="off"
                onChange={(event) => updateGlobalSearch(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                placeholder="Search products, brands and categories"
                value={searchText}
              />
              {searchText ? (
                <button aria-label="Clear search" onClick={clearSearch} title="Clear search" type="button">
                  <X size={17} />
                </button>
              ) : null}
            </label>
            {searchFocused && searchText.trim().length >= 2 ? (
              <div aria-label="Search suggestions" className={styles.searchSuggestions}>
                {searchSuggestionGroups.length > 0 ? searchSuggestionGroups.map((group) => (
                  <section className={styles.searchSuggestionGroup} key={group.label}>
                    <h2>{group.label}</h2>
                    {group.suggestions.map((suggestion) => (
                      <button
                        key={suggestion.key}
                        onClick={() => navigateToSearch(suggestion.query)}
                        type="button"
                      >
                        <span className={styles.searchSuggestionVisual}>
                          {suggestion.imageUrl ? (
                            <StorefrontImage alt="" sizes="42px" src={suggestion.imageUrl} />
                          ) : suggestion.type === "Brand" ? (
                            <Tags size={18} />
                          ) : (
                            (() => {
                              const SuggestionIcon = resolveCategoryIcon(suggestion.label);
                              return <SuggestionIcon size={18} />;
                            })()
                          )}
                        </span>
                        <span><strong>{suggestion.label}</strong><small>{suggestion.type}</small></span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  </section>
                )) : (
                  <div className={styles.searchSuggestionEmpty}>No matching products or categories</div>
                )}
                {searchSuggestionGroups.length > 0 ? (
                  <button
                    className={styles.searchAllResults}
                    onClick={() => navigateToSearch(searchText)}
                    type="button"
                  >
                    <Search size={17} />
                    See all results for &quot;{searchText.trim()}&quot;
                  </button>
                ) : null}
              </div>
            ) : null}
          </form>
          <div aria-label="Text size" className={styles.textSizeControl} role="group">
            {(["SMALL", "MEDIUM", "LARGE"] as const).map((size) => (
              <button
                aria-label={`Use ${size.toLowerCase()} text`}
                aria-pressed={textSize === size}
                className={styles[`textSize${size[0]}${size.slice(1).toLowerCase()}` as keyof typeof styles]}
                key={size}
                onClick={() => setTextSize(size)}
                title={`${size[0]}${size.slice(1).toLowerCase()} text`}
                type="button"
              >
                A
              </button>
            ))}
          </div>
          <div className={styles.headerActions}>
            <button className={styles.iconButton} onClick={() => void openOrders()} title="My orders" type="button">
              <PackageCheck size={20} />
            </button>
            <button
              aria-label={session.authenticated ? "Open my account" : "Sign in"}
              className={styles.iconButton}
              onClick={() => {
                if (session.authenticated) {
                  void openAccount();
                } else {
                  setAuthMode("SIGN_IN");
                  setResumeCheckoutAfterAuth(false);
                  setAuthOpen(true);
                }
              }}
              title={session.authenticated ? "My account" : "Sign in"}
              type="button"
            >
              <CircleUserRound size={20} />
            </button>
            <button aria-label="Open cart" className={styles.cartButton} onClick={() => setDrawerView("cart")} type="button">
              <ShoppingCart size={20} />
              <span>Cart</span>
              <b>{cartQuantity}</b>
            </button>
          </div>
        </div>
      </header>

      {quickProduct ? (
        <article className={styles.productPage}>
          <button className={styles.backToShop} onClick={closeProduct} type="button">
            <ArrowLeft size={18} /> Back to shop
          </button>
          <ProductBreadcrumb product={quickProduct} onSelect={showCatalog} />
          <div className={styles.productPageHero} data-testid="product-detail-hero">
            <div className={styles.productGallery}>
              <div className={styles.productGalleryStage}>
                <button
                  aria-label={`Open image viewer for ${quickProduct.name}`}
                  className={styles.productZoomButton}
                  onClick={() => openImageViewer(quickProduct, quickImageUrl)}
                  title="Open image viewer"
                  type="button"
                >
                  <ProductVisual imageUrl={quickImageUrl} product={quickProduct} large />
                  <span><ZoomIn size={18} /></span>
                </button>
                {quickProduct.galleryImageUrls.length > 1 ? (
                  <>
                    <button
                      aria-label="Previous product gallery image"
                      className={classNames(styles.productGalleryArrow, styles.productGalleryArrowPrevious)}
                      onClick={() => navigateQuickProductImage(-1)}
                      title="Previous image"
                      type="button"
                    ><ChevronLeft size={24} /></button>
                    <button
                      aria-label="Next product gallery image"
                      className={classNames(styles.productGalleryArrow, styles.productGalleryArrowNext)}
                      onClick={() => navigateQuickProductImage(1)}
                      title="Next image"
                      type="button"
                    ><ChevronRight size={24} /></button>
                  </>
                ) : null}
              </div>
              {quickProduct.galleryImageUrls.length > 1 ? (
                <div className={styles.thumbnailRail}>
                  {quickProduct.galleryImageUrls.map((imageUrl, index) => (
                    <button aria-label={`View product image ${index + 1}`} className={quickImageUrl === imageUrl ? styles.thumbnailActive : undefined} key={imageUrl} onClick={() => setQuickImageUrl(imageUrl)} type="button"><StorefrontImage alt="" sizes="58px" src={imageUrl} /></button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className={styles.productPageSummary}>
              <span className={styles.productEyebrow}>{quickProduct.brand ?? formatStorefrontTaxonomyLabel(quickProduct.category)}</span>
              <h1>{quickProduct.name}</h1>
              <small>{quickProduct.code}</small>
              <div className={styles.productRating}><StarRating rating={quickProduct.averageRating} /><span>{quickProduct.averageRating > 0 ? quickProduct.averageRating.toFixed(1) : "New"} ({quickProduct.reviewCount} review{quickProduct.reviewCount === 1 ? "" : "s"})</span></div>
              <div className={styles.productPrice}>
                <strong>{money.format(selectedProductPrice)}</strong>
                {selectedProductOriginalPrice ? <del>{money.format(selectedProductOriginalPrice)}</del> : null}
              </div>
              {selectedProductPromotion ? (
                <div className={styles.productPromotionCallout}>
                  <BadgePercent size={20} />
                  <div>
                    <strong>{getPromotionLabel(selectedProductPromotion, money)}</strong>
                    <span>{selectedProductPromotion.description ?? selectedProductPromotion.name}</span>
                    <small><Clock3 size={13} />{getPromotionTerms(selectedProductPromotion, money, storefront.store.timezone)}</small>
                  </div>
                </div>
              ) : null}
              {quickProduct.variants.length > 0 ? (
                <div className={styles.variantGrid}>
                  {quickProduct.variants.map((variant) => (
                    <button className={quickVariant?.code === variant.code ? styles.variantActive : undefined} disabled={getMaximumOrderQuantity(quickProduct, variant, resolveProductSellingUnit(quickProduct, variant)) === 0} key={variant.code} onClick={() => {
                      setQuickVariant(variant);
                      setQuickSellingUnitOfMeasure(
                        resolveProductSellingUnit(quickProduct, variant)?.unitOfMeasureCode ?? ""
                      );
                    }} type="button">
                      <span>{variant.name}</span><strong>{money.format(variant.unitPrice)}</strong>
                    </button>
                  ))}
                </div>
              ) : null}
              {getProductSellingUnits(quickProduct, quickVariant).length > 0 ? (
                <div className={styles.variantGrid} aria-label="Selling unit">
                  {getProductSellingUnits(quickProduct, quickVariant).map((sellingUnit) => (
                    <button
                      className={selectedProductSellingUnit?.unitOfMeasureCode === sellingUnit.unitOfMeasureCode ? styles.variantActive : undefined}
                      key={sellingUnit.unitOfMeasureCode}
                      onClick={() => setQuickSellingUnitOfMeasure(sellingUnit.unitOfMeasureCode)}
                      type="button"
                    >
                      <span>{sellingUnit.unitOfMeasureName}</span>
                      <strong>{money.format(sellingUnit.unitPrice)}</strong>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className={styles.purchaseAssurance}><BadgeCheck size={17} /><span>Secure order tracking</span><CreditCard size={17} /><span>{checkoutPaymentOptions.length} payment option{checkoutPaymentOptions.length === 1 ? "" : "s"}</span></div>
              {quickMaximumQuantity !== null ? <p className={quickOutOfStock ? styles.stockUnavailable : styles.stockAvailable}>{quickOutOfStock ? "Out of stock" : `${quickMaximumQuantity} available to order`}</p> : null}
              <div className={styles.modalPurchase}>
                <QuantityStepper max={quickMaximumQuantity} onChange={setQuickQuantity} value={quickQuantity} />
                <button className={styles.primaryButton} disabled={(quickProduct.variants.length > 0 && !quickVariant) || quickOutOfStock} onClick={() => addProduct(quickProduct, quickVariant, quickQuantity, selectedProductSellingUnit)} type="button">
                  <ShoppingCart size={19} /> {quickOutOfStock ? "Out of stock" : `Add · ${money.format(selectedProductTotal)}`}
                </button>
              </div>
            </div>
            <aside aria-label="Product information" className={styles.productFactsPanel}>
              <div className={styles.productSeller}>
                <span><Store size={18} /></span>
                <div><small>Sold by</small><strong>{storefront.store.name}</strong></div>
              </div>
              <section>
                <h2>Product details</h2>
                <dl className={styles.productFactList}>
                  <div><dt>SKU</dt><dd>{quickProduct.sku || quickProduct.code}</dd></div>
                  {quickProduct.brand ? <div><dt>Brand</dt><dd>{quickProduct.brand}</dd></div> : null}
                  {quickProduct.department ? <div><dt>Department</dt><dd>{formatStorefrontTaxonomyLabel(quickProduct.department)}</dd></div> : null}
                  {quickProduct.category ? <div><dt>Category</dt><dd>{formatStorefrontTaxonomyLabel(quickProduct.category)}</dd></div> : null}
                  {quickProduct.subcategory ? <div><dt>Subcategory</dt><dd>{formatStorefrontTaxonomyLabel(quickProduct.subcategory)}</dd></div> : null}
                  <div><dt>Unit</dt><dd>{selectedProductSellingUnit?.unitOfMeasureName ?? quickProduct.unitOfMeasure}</dd></div>
                </dl>
              </section>
              <section>
                <h2>Secure checkout</h2>
                <ul className={styles.productConfidenceList}>
                  <li><BadgeCheck size={17} /><span>Secure order tracking</span></li>
                  {storefront.paymentMethods.length > 0 ? <li><CreditCard size={17} /><span>Secure online payment</span></li> : null}
                  {storefront.store.payOnDeliveryEnabled ? <li><WalletCards size={17} /><span>Pay on delivery or collection</span></li> : null}
                </ul>
              </section>
              <section>
                <h2>Fulfilment</h2>
                <ul className={styles.productConfidenceList}>
                  {storefront.store.allowDelivery ? <li><Truck size={17} /><span>Delivery confirmed at checkout</span></li> : null}
                  {storefront.store.allowPickup ? <li><Store size={17} /><span>Pickup from an eligible shop</span></li> : null}
                  {quickProduct.trackInventory ? <li><PackageCheck size={17} /><span>Normal orders reserve available stock</span></li> : null}
                </ul>
              </section>
            </aside>
          </div>
          <section className={styles.productInformation}>
            <div className={styles.detailTabs} role="tablist">
              <button aria-selected={productDetailTab === "DESCRIPTION"} className={productDetailTab === "DESCRIPTION" ? styles.detailTabActive : undefined} onClick={() => setProductDetailTab("DESCRIPTION")} role="tab" type="button">Description</button>
              <button aria-selected={productDetailTab === "SPECIFICATIONS"} className={productDetailTab === "SPECIFICATIONS" ? styles.detailTabActive : undefined} onClick={() => setProductDetailTab("SPECIFICATIONS")} role="tab" type="button">Specifications</button>
              <button aria-selected={productDetailTab === "REVIEWS"} className={productDetailTab === "REVIEWS" ? styles.detailTabActive : undefined} onClick={() => setProductDetailTab("REVIEWS")} role="tab" type="button">Reviews <span>{quickProduct.reviewCount}</span></button>
            </div>
            <div className={styles.detailPanel} role="tabpanel">
              {productDetailTab === "DESCRIPTION" ? (
                quickProduct.description ? <div className={styles.richProductDescription} dangerouslySetInnerHTML={{ __html: quickProduct.description }} /> : <p>{quickProduct.shortName ?? quickProduct.code}</p>
              ) : null}
              {productDetailTab === "SPECIFICATIONS" ? (
                quickProduct.specifications.length > 0 ? <dl className={styles.specificationList}>{quickProduct.specifications.map((specification) => <div key={`${specification.name}:${specification.value}`}><dt>{specification.name}</dt><dd>{specification.value}</dd></div>)}</dl> : <p>No additional specifications have been published for this product.</p>
              ) : null}
              {productDetailTab === "REVIEWS" ? (
                <div className={styles.reviewPanel}>
                  {quickProduct.reviews.length > 0 ? <div className={styles.reviewList}>{quickProduct.reviews.map((review) => <article key={review.id}><div><StarRating rating={review.rating} /><RelativeReviewTime value={review.createdAt} /></div><strong>{review.title || review.customerName}</strong><p>{review.body || "Verified customer rating"}</p><span><BadgeCheck size={14} /> Verified purchase</span></article>)}</div> : <p>No reviews yet. Delivered customers can be the first to review this product.</p>}
                  <div className={styles.reviewForm}>
                    <strong>Write a review</strong>
                    <div className={styles.reviewStars} aria-label="Review rating">{[1, 2, 3, 4, 5].map((rating) => <button aria-label={`${rating} star rating`} key={rating} onClick={() => setReviewRating(rating)} title={`${rating} star${rating === 1 ? "" : "s"}`} type="button"><Star fill={rating <= reviewRating ? "currentColor" : "none"} size={21} /></button>)}</div>
                    <input aria-label="Review title" onChange={(event) => setReviewTitle(event.target.value)} placeholder="Review title" value={reviewTitle} />
                    <textarea aria-label="Review details" onChange={(event) => setReviewBody(event.target.value)} placeholder="Tell other customers about this product" rows={3} value={reviewBody} />
                    {reviewMessage ? <small>{reviewMessage}</small> : null}
                    <button disabled={reviewBusy} onClick={() => void submitReview()} type="button">{reviewBusy ? <LoaderCircle className={styles.spin} size={17} /> : <BadgeCheck size={17} />}Submit verified review</button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
          {relatedProducts.length > 0 ? (
            <section aria-label="Related products" className={styles.relatedProducts}>
              <div className={styles.sectionHeading}>
                <div><span>Related products</span><h2>You may also like</h2></div>
                <ShoppingBag size={20} />
              </div>
              <div className={styles.relatedProductGrid}>
                {relatedProducts.map((product) => (
                  <ProductCard
                    compact
                    key={`related-${product.id}`}
                    money={money}
                    onAdd={addProductFromCard}
                    onOpen={openProduct}
                    product={product}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </article>
      ) : productDetailsBusy ? (
        <section aria-live="polite" className={styles.emptyState}>
          <LoaderCircle className={styles.spin} size={28} />
          <h2>Loading product</h2>
        </section>
      ) : searchResultsMode ? (
        <section className={styles.searchResultsPage} data-testid="storefront-search-results">
          <nav aria-label="Search breadcrumb" className={styles.searchBreadcrumb}>
            <button onClick={() => router.push(publicStoreHref)} type="button">Home</button>
            <ChevronRight aria-hidden="true" size={14} />
            <span aria-current="page">Search results</span>
          </nav>
          <div className={styles.searchResultsHeading}>
            <div>
              <span>{searchMatchedProducts.length} result{searchMatchedProducts.length === 1 ? "" : "s"}</span>
              <h1>Products matching &quot;{activeSearchQuery}&quot;</h1>
            </div>
            <button
              aria-expanded={searchFiltersOpen}
              className={styles.searchFilterToggle}
              onClick={() => setSearchFiltersOpen((current) => !current)}
              type="button"
            >
              <SlidersHorizontal size={18} /> Filters
              {activeSearchFilterCount > 0 ? <b>{activeSearchFilterCount}</b> : null}
            </button>
          </div>
          <div className={styles.searchResultsLayout}>
            <aside className={classNames(styles.searchFilters, searchFiltersOpen && styles.searchFiltersOpen)}>
              <div className={styles.searchFiltersHeader}>
                <strong>Filter results</strong>
                <button
                  aria-label="Close filters"
                  onClick={() => setSearchFiltersOpen(false)}
                  title="Close filters"
                  type="button"
                ><X size={18} /></button>
              </div>
              {searchCategoryFacets.length > 0 ? (
                <fieldset className={styles.searchFilterGroup}>
                  <legend>Categories</legend>
                  {searchCategoryFacets.map((facet) => (
                    <label key={facet.value}>
                      <input
                        checked={selectedSearchCategories.includes(facet.value)}
                        onChange={() => toggleSearchFilter(facet.value, setSelectedSearchCategories)}
                        type="checkbox"
                      />
                      <span>{facet.label}</span>
                      <small>{facet.count}</small>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              {searchBrandFacets.length > 0 ? (
                <fieldset className={styles.searchFilterGroup}>
                  <legend>Brands</legend>
                  {searchBrandFacets.map((facet) => (
                    <label key={facet.value}>
                      <input
                        checked={selectedSearchBrands.includes(facet.value)}
                        onChange={() => toggleSearchFilter(facet.value, setSelectedSearchBrands)}
                        type="checkbox"
                      />
                      <span>{facet.label}</span>
                      <small>{facet.count}</small>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              <fieldset className={styles.searchPriceFilter}>
                <legend>Price range</legend>
                <div className={styles.searchPriceValues}>
                  <span>{money.format(searchMinimumPrice)}</span>
                  <span>{money.format(searchMaximumPrice)}</span>
                </div>
                <div className={styles.searchPriceRange}>
                  <span
                    className={styles.searchPriceRangeActive}
                    style={{ left: `${searchRangeStart}%`, right: `${100 - searchRangeEnd}%` }}
                  />
                  <input
                    aria-label="Minimum price"
                    max={priceSliderMaximum}
                    min={initialPriceBounds.minimum}
                    onChange={(event) => setSearchMinimumPrice(Math.min(Number(event.target.value), searchMaximumPrice))}
                    step="1"
                    type="range"
                    value={searchMinimumPrice}
                  />
                  <input
                    aria-label="Maximum price"
                    max={priceSliderMaximum}
                    min={initialPriceBounds.minimum}
                    onChange={(event) => setSearchMaximumPrice(Math.max(Number(event.target.value), searchMinimumPrice))}
                    step="1"
                    type="range"
                    value={searchMaximumPrice}
                  />
                </div>
              </fieldset>
              {activeSearchFilterCount > 0 ? (
                <button className={styles.clearSearchFilters} onClick={clearSearchFilters} type="button">
                  Clear all filters
                </button>
              ) : null}
            </aside>
            <div className={styles.searchResultsContent}>
              <div className={styles.searchResultsToolbar}>
                <strong>{filteredSearchProducts.length} product{filteredSearchProducts.length === 1 ? "" : "s"}</strong>
                <span>Matched by product, category, or brand</span>
              </div>
              {filteredSearchProducts.length > 0 ? (
                <div className={styles.searchProductGrid}>
                  {filteredSearchProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      money={money}
                      onAdd={addProductFromCard}
                      onOpen={openProduct}
                      product={product}
                    />
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <Search size={28} />
                  <h2>No products match these filters</h2>
                  <button onClick={clearSearchFilters} type="button">Clear filters</button>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <>
          {storefront.promotions.length > 0 && !promotionStripDismissed ? (
            <section aria-label="Storewide promotions" className={styles.promotionStrip}>
              <span className={styles.promotionStripIcon}><BadgePercent size={20} /></span>
              <div className={styles.promotionRail}>
                {storefront.promotions.map((promotion) => (
                  <div className={styles.promotionPill} key={promotion.code}>
                    <strong>{getPromotionLabel(promotion, money)}</strong>
                    <span>{promotion.description ?? promotion.name}</span>
                    <small>{getPromotionTerms(promotion, money, storefront.store.timezone)}</small>
                  </div>
                ))}
              </div>
              <button
                aria-label="Close storewide promotions"
                className={styles.promotionStripClose}
                onClick={() => setPromotionStripDismissed(true)}
                title="Close promotions"
                type="button"
              >
                <X size={18} />
              </button>
            </section>
          ) : null}
          <div className={styles.heroLayout} data-testid="storefront-hero-layout">
            <StorefrontCategoryMenu
              departments={catalogTree}
              onSelect={showCatalog}
              selection={catalogSelection}
              totalProductCount={storefront.products.length}
            />
            <StorefrontHero store={storefront.store} />
          </div>
          {featuredProducts.length > 0 && catalogSelection.level === "ALL" && !searchText ? <section className={styles.featuredSection} data-testid="storefront-featured-section"><div className={styles.sectionHeading}><div><span>Featured</span><h2>Popular right now</h2></div><Heart size={20} /></div><div className={styles.featuredRail}>{featuredProducts.map((product) => <ProductCard key={`featured-${product.id}`} money={money} onAdd={addProductFromCard} onOpen={openProduct} product={product} compact />)}</div></section> : null}
          <section className={styles.catalogSection} data-testid="storefront-catalog-section"><div className={styles.sectionHeading}><div><span>{catalogSelectionLabel}</span><h2>{visibleProducts.length} product{visibleProducts.length === 1 ? "" : "s"}</h2></div></div>{visibleProducts.length > 0 ? <div className={styles.productGrid}>{visibleProducts.map((product) => <ProductCard key={product.id} money={money} onAdd={addProductFromCard} onOpen={openProduct} product={product} />)}</div> : <div className={styles.emptyState}><Search size={28} /><h3>No matching products</h3><button onClick={() => { setSearchText(""); setCatalogSelection({ level: "ALL" }); }} type="button">Clear filters</button></div>}</section>
        </>
      )}

      <footer className={styles.footer}>
        <strong>{storefront.store.name}</strong>
        <span>{storefront.store.address}</span>
        <small>Secure ordering powered by Flash ERP</small>
      </footer>

      <nav className={styles.mobileNav}>
        <button className={!drawerView ? styles.mobileNavActive : undefined} onClick={() => { setDrawerView(null); if (quickProduct) closeProduct(); }} type="button"><ShoppingBag size={20} /><span>Shop</span></button>
        <button className={drawerView === "orders" ? styles.mobileNavActive : undefined} onClick={() => void openOrders()} type="button"><PackageCheck size={20} /><span>Orders</span></button>
        <button className={drawerView === "cart" || drawerView === "checkout" ? styles.mobileNavActive : undefined} onClick={() => setDrawerView("cart")} type="button"><ShoppingCart size={20} /><span>Cart</span><b>{cartQuantity}</b></button>
        <button aria-label={session.authenticated ? "Open my account" : "Sign in"} className={drawerView === "account" ? styles.mobileNavActive : undefined} onClick={() => { if (session.authenticated) { void openAccount(); } else { setAuthMode("SIGN_IN"); setResumeCheckoutAfterAuth(false); setAuthOpen(true); } }} type="button"><CircleUserRound size={20} /><span>Account</span></button>
      </nav>

      {whatsappDigits ? (
        <a
          aria-label={`Chat with ${storefront.store.name} on WhatsApp`}
          className={styles.whatsappButton}
          href={`https://wa.me/${whatsappDigits}?text=${encodeURIComponent(`Hello ${storefront.store.name}, I need help with an order.`)}`}
          rel="noreferrer"
          target="_blank"
          title="Chat on WhatsApp"
        >
          <WhatsAppMark />
        </a>
      ) : null}

      {imageViewerOpen && imageViewerProduct && imageViewerUrl ? (
        <div
          aria-label={`${imageViewerProduct.name} image viewer`}
          aria-modal="true"
          className={styles.imageViewer}
          onClick={(event) => {
            if (event.currentTarget === event.target) {
              closeImageViewer();
            }
          }}
          role="dialog"
        >
          {imageViewerImages.length > 1 ? (
            <>
              <button
                aria-label="Previous product image"
                className={classNames(styles.imageViewerNavigation, styles.imageViewerPrevious)}
                onClick={() => navigateImageViewer(-1)}
                title="Previous image"
                type="button"
              ><ChevronLeft size={28} /></button>
              <button
                aria-label="Next product image"
                className={classNames(styles.imageViewerNavigation, styles.imageViewerNext)}
                onClick={() => navigateImageViewer(1)}
                title="Next image"
                type="button"
              ><ChevronRight size={28} /></button>
              <span className={styles.imageViewerPosition}>
                {imageViewerImageIndex + 1} / {imageViewerImages.length}
              </span>
            </>
          ) : null}
          <div className={classNames(styles.imageViewerCanvas, imageViewerZoomed && styles.imageViewerCanvasZoomed)}>
            <div className={styles.imageViewerActions}>
              <button
                aria-label={imageViewerZoomed ? "Fit image to screen" : "Zoom image"}
                onClick={() => setImageViewerZoomed((value) => !value)}
                title={imageViewerZoomed ? "Fit image to screen" : "Zoom image"}
                type="button"
              >
                {imageViewerZoomed ? <ZoomOut size={21} /> : <ZoomIn size={21} />}
              </button>
              <button
                aria-label="Close image viewer"
                onClick={closeImageViewer}
                title="Close image viewer"
                type="button"
              ><X size={22} /></button>
            </div>
            <button
              aria-label={imageViewerZoomed ? "Fit image to screen" : "Zoom image"}
              className={styles.imageViewerImageButton}
              onClick={() => setImageViewerZoomed((value) => !value)}
              type="button"
            >
              <img alt={imageViewerProduct.name} decoding="async" fetchPriority="high" src={imageViewerUrl} />
            </button>
          </div>
        </div>
      ) : null}

      <div className={classNames(styles.drawerBackdrop, drawerView && styles.drawerBackdropOpen)} onClick={() => setDrawerView(null)} />
      <aside className={classNames(styles.drawer, drawerView && styles.drawerOpen)} aria-hidden={!drawerView}>
        {drawerView === "cart" ? (
          <CartPanel
            cart={cart}
            stockError={cartStockError}
            money={money}
            onCheckout={() => void beginCheckout()}
            onClose={() => setDrawerView(null)}
            onQuantity={updateCartQuantity}
            quote={currentCartQuote}
            discount={cartDiscount}
            subtotal={cartSubtotal}
            total={checkoutTotal}
          />
        ) : null}
        {drawerView === "checkout" ? (
          <CheckoutPanel
            addressLine1={addressLine1}
            addressLine2={addressLine2}
            busy={checkoutBusy}
            checkoutError={checkoutError}
            stockError={cartStockError}
            checkoutTotal={checkoutTotal}
            fulfillment={currentCartQuote?.fulfillment ?? null}
            city={city}
            createdOrder={createdOrder}
            deliveryMethod={deliveryMethod}
            pickupStoreCode={pickupStoreCode}
            deliveryNote={deliveryNote}
            deliveryPhone={deliveryPhone}
            money={money}
            onAddressLine1={setAddressLine1}
            onAddressLine2={setAddressLine2}
            onBack={() => setDrawerView("cart")}
            onCity={setCity}
            onClose={() => setDrawerView(null)}
            onDeliveryMethod={setDeliveryMethod}
            onPickupStoreCode={setPickupStoreCode}
            onDeliveryNote={setDeliveryNote}
            onDeliveryPhone={setDeliveryPhone}
            onPay={startPayment}
            onPlaceOrder={placeOrder}
            onReceiptEmail={setReceiptEmail}
            onRecipientName={setRecipientName}
            onRegion={setRegion}
            onSaveAddress={setSaveAddress}
            onSelectedPaymentCode={setSelectedPaymentCode}
            onOrderType={(value) => {
              setCheckoutOrderType(value);
              if (value === "LAYAWAY") {
                setLayawayDepositAmount(minimumLayawayDeposit);
                setSelectedPaymentCode(
                  checkoutPaymentOptions.find((method) => method.timing === "PREPAY")?.code ?? "",
                );
              }
            }}
            onLayawayDepositAmount={setLayawayDepositAmount}
            paymentBusy={paymentBusy}
            paymentOptions={effectiveCheckoutPaymentOptions}
            receiptEmail={receiptEmail}
            recipientName={recipientName}
            region={region}
            saveAddress={saveAddress}
            selectedPaymentCode={selectedPaymentCode}
            orderType={checkoutOrderType}
            layawayDepositAmount={layawayDepositAmount || minimumLayawayDeposit}
            store={storefront.store}
            discount={cartDiscount}
            subtotal={cartSubtotal}
          />
        ) : null}
        {drawerView === "orders" ? (
          <OrdersPanel
            busy={ordersBusy}
            money={money}
            onClose={() => setDrawerView(null)}
            onRefresh={openOrders}
            onRefund={requestRefund}
            onPay={(order, amount) => startPayment(
              order.selectedPaymentMethodCode ?? "",
              order.orderNo,
              amount,
            )}
            paymentBusy={paymentBusy}
            paymentOptions={checkoutPaymentOptions.filter((method) => method.timing === "PREPAY")}
            receiptEmail={receiptEmail}
            onReceiptEmail={setReceiptEmail}
            onSelect={setSelectedOrder}
            onSignOut={signOut}
            orders={orders}
            selectedOrder={selectedOrder}
            session={session}
          />
        ) : null}
        {drawerView === "account" ? (
          <AccountPanel
            account={account}
            busy={accountBusy}
            saving={accountSaving}
            onClose={() => setDrawerView(null)}
            onRefresh={refreshAccount}
            onSaveProfile={saveAccountProfile}
            onSaveAddress={saveAccountAddress}
            onDeleteAddress={removeAccountAddress}
            onResetPassword={openPasswordReset}
            onSignOut={signOut}
          />
        ) : null}
      </aside>

      {authOpen ? (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setAuthOpen(false)}>
          <section className={styles.authModal} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setAuthOpen(false)} title="Close" type="button"><X size={20} /></button>
            <div className={styles.authMark}><CircleUserRound size={26} /></div>
            <span className={styles.productEyebrow}>{storefront.store.name}</span>
            <h2>{authMode === "SIGN_IN" ? "Welcome back" : authMode === "SIGN_UP" ? "Create account" : authMode === "RESET" ? "Reset password" : authMode === "RESET_VERIFY" ? "Set a new password" : "Verify your account"}</h2>
            {authMode === "SIGN_IN" || authMode === "SIGN_UP" ? (
              <>
                <div className={styles.socialAuthOptions}>
                  {(["google", "facebook"] as const).map((provider) => {
                    const enabled = socialAuthProviders.some((option) => option.id === provider && option.enabled);
                    const label = provider === "google" ? "Google" : "Facebook";
                    return (
                      <button
                        aria-label={`Continue with ${label}`}
                        className={styles.socialAuthButton}
                        disabled={!enabled || Boolean(socialAuthBusy)}
                        key={provider}
                        onClick={() => startSocialAuth(provider)}
                        title={enabled ? `Continue with ${label}` : `${label} sign-in is not configured`}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className={provider === "google" ? styles.googleAuthMark : styles.facebookAuthMark}
                        >
                          {provider === "google" ? "G" : "f"}
                        </span>
                        <strong>Continue with {label}</strong>
                        {socialAuthBusy === provider ? <LoaderCircle className={styles.spin} size={18} /> : <span />}
                      </button>
                    );
                  })}
                </div>
                <div className={styles.socialAuthDivider}><span>or continue with email</span></div>
              </>
            ) : null}
            {authMode === "VERIFY" || authMode === "RESET_VERIFY" ? (
              <>
                <p className={styles.authCopy}>Enter the code sent to {identifier}.</p>
                {developmentCode ? <p className={styles.developmentCode}>Development code: <strong>{developmentCode}</strong></p> : null}
                <label className={styles.field}><span>Verification code</span><input autoComplete="one-time-code" inputMode="numeric" maxLength={6} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ""))} value={otpCode} /></label>
                {authMode === "RESET_VERIFY" ? <label className={styles.field}><span>New password</span><input autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></label> : null}
              </>
            ) : (
              <>
                {authMode === "SIGN_UP" ? <label className={styles.field}><span>Full name</span><input autoComplete="name" onChange={(event) => setFullName(event.target.value)} value={fullName} /></label> : null}
                <label className={styles.field}><span>Email or phone</span><input autoComplete="username" onChange={(event) => setIdentifier(event.target.value)} value={identifier} /></label>
                {authMode !== "RESET" ? <label className={styles.field}><span>Password</span><input autoComplete={authMode === "SIGN_IN" ? "current-password" : "new-password"} onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></label> : null}
              </>
            )}
            {authError ? <p className={styles.formError}>{authError}</p> : null}
            <button className={styles.primaryButton} disabled={authBusy} onClick={() => void submitAuth()} type="button">
              {authBusy ? <LoaderCircle className={styles.spin} size={19} /> : authMode === "SIGN_IN" ? <LogIn size={19} /> : <ChevronRight size={19} />}
              {authMode === "SIGN_IN" ? "Sign in" : authMode === "SIGN_UP" || authMode === "RESET" ? "Send verification code" : authMode === "RESET_VERIFY" ? "Update password" : "Verify and continue"}
            </button>
            {authMode === "SIGN_IN" ? (
              <div className={styles.authLinks}>
                <button className={styles.textButton} onClick={() => { setAuthError(null); setAuthMode("SIGN_UP"); }} type="button">Create a customer account</button>
                <button className={styles.textButton} onClick={() => { setAuthError(null); setAuthMode("RESET"); }} type="button">Forgot password?</button>
              </div>
            ) : authMode !== "VERIFY" && authMode !== "RESET_VERIFY" ? (
              <button className={styles.textButton} onClick={() => { setAuthError(null); setAuthMode("SIGN_IN"); }} type="button">I already have an account</button>
            ) : (
              <button className={styles.textButton} onClick={() => setAuthMode(authMode === "RESET_VERIFY" ? "RESET" : "SIGN_UP")} type="button">Use a different email or phone</button>
            )}
          </section>
        </div>
      ) : null}

      {toast ? <div className={styles.toast}><Check size={18} />{toast}</div> : null}
    </main>
  );
}

function ProductBreadcrumb({
  product,
  onSelect,
}: {
  product: ProductDetail;
  onSelect: (selection: StorefrontCatalogSelection) => void;
}) {
  const department = formatStorefrontTaxonomyLabel(product.department);
  const category = formatStorefrontTaxonomyLabel(product.category);
  const subcategory = formatStorefrontTaxonomyLabel(product.subcategory);

  return (
    <nav aria-label="Breadcrumb" className={styles.productBreadcrumb}>
      <button onClick={() => onSelect({ level: "ALL" })} type="button">
        <House size={15} /> Shop
      </button>
      {product.department?.trim() ? (
        <>
          <ChevronRight aria-hidden="true" size={14} />
          <button
            onClick={() => onSelect({ level: "DEPARTMENT", department })}
            type="button"
          >
            {department}
          </button>
        </>
      ) : null}
      {product.category?.trim() ? (
        <>
          <ChevronRight aria-hidden="true" size={14} />
          <button
            onClick={() => onSelect({ level: "CATEGORY", department, category })}
            type="button"
          >
            {category}
          </button>
        </>
      ) : null}
      {product.subcategory?.trim() ? (
        <>
          <ChevronRight aria-hidden="true" size={14} />
          <button
            onClick={() => onSelect({
              level: "SUBCATEGORY",
              department,
              category,
              subcategory,
            })}
            type="button"
          >
            {subcategory}
          </button>
        </>
      ) : null}
      <ChevronRight aria-hidden="true" size={14} />
      <span aria-current="page">{product.name}</span>
    </nav>
  );
}

function StorefrontCategoryMenu({
  departments,
  onSelect,
  selection,
  totalProductCount,
}: {
  departments: StorefrontDepartmentNode[];
  onSelect: (selection: StorefrontCatalogSelection) => void;
  selection: StorefrontCatalogSelection;
  totalProductCount: number;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileDepartment, setMobileDepartment] = useState<string | null>(null);
  const [hoveredDepartment, setHoveredDepartment] = useState<string | null>(null);
  const activeDepartment = departments.find(
    (department) => department.name === (mobileDepartment ?? hoveredDepartment),
  ) ?? null;
  const ActiveDepartmentIcon = activeDepartment
    ? resolveCategoryIcon(activeDepartment.name)
    : null;

  const selectCatalog = (nextSelection: StorefrontCatalogSelection) => {
    setMobileDepartment(null);
    setHoveredDepartment(null);
    onSelect(nextSelection);
  };

  return (
    <nav
      aria-label="Product categories"
      className={styles.categoryMenu}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setHoveredDepartment(null);
        }
      }}
      onMouseLeave={() => setHoveredDepartment(null)}
    >
      <button
        aria-expanded={mobileOpen}
        className={styles.categoryMenuHeader}
        onClick={() => setMobileOpen((current) => {
          if (current) setMobileDepartment(null);
          return !current;
        })}
        type="button"
      >
        <ListTree size={19} />
        <strong>All categories</strong>
        <ChevronDown className={mobileOpen ? styles.categoryMenuChevronOpen : undefined} size={17} />
      </button>
      <div className={classNames(styles.categoryMenuBody, mobileOpen && styles.categoryMenuBodyOpen)}>
        <div className={styles.categoryMenuScroll}>
          <button
            aria-current={selection.level === "ALL" ? "true" : undefined}
            className={classNames(styles.categoryMenuAll, selection.level === "ALL" && styles.categoryMenuActive)}
            onClick={() => selectCatalog({ level: "ALL" })}
            type="button"
          >
            <Boxes size={18} />
            <span>All products</span>
            <small>{totalProductCount}</small>
          </button>
          {departments.map((department) => {
            const DepartmentIcon = resolveCategoryIcon(department.name);
            const departmentExpanded = mobileDepartment === department.name;
            const departmentSelected = selection.level === "DEPARTMENT"
              && selection.department === department.name;
            const departmentContainsSelection = selection.level !== "ALL"
              && selection.department === department.name;

            return (
              <div
                className={styles.categoryMenuGroup}
                key={department.name}
                onMouseEnter={() => setHoveredDepartment(department.name)}
              >
                <div className={styles.categoryMenuRow}>
                  <button
                    aria-current={departmentSelected ? "true" : undefined}
                    className={classNames(
                      styles.categoryMenuSelect,
                      departmentSelected && styles.categoryMenuActive,
                      departmentContainsSelection && !departmentSelected && styles.categoryMenuAncestor,
                    )}
                    onFocus={() => setHoveredDepartment(department.name)}
                    onClick={() => selectCatalog({ level: "DEPARTMENT", department: department.name })}
                    type="button"
                  >
                    <DepartmentIcon size={18} />
                    <span>{department.name}</span>
                    <small>{department.count}</small>
                  </button>
                  <button
                    aria-expanded={departmentExpanded}
                    aria-label={`${departmentExpanded ? "Collapse" : "Expand"} ${department.name}`}
                    className={styles.categoryMenuExpand}
                    onClick={() => setMobileDepartment((current) => current === department.name ? null : department.name)}
                    type="button"
                  >
                    <ChevronRight className={departmentExpanded ? styles.categoryMenuFlyoutToggleOpen : undefined} size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {activeDepartment ? (
        <section
          aria-label={`${activeDepartment.name} categories`}
          className={classNames(styles.categoryMegaMenu, styles.categoryMegaMenuOpen)}
        >
          <div className={styles.categoryMegaMenuHeader}>
            {ActiveDepartmentIcon ? <ActiveDepartmentIcon size={22} /> : null}
            <div>
              <span>Department</span>
              <strong>{activeDepartment.name}</strong>
            </div>
            <button
              onClick={() => selectCatalog({ level: "DEPARTMENT", department: activeDepartment.name })}
              type="button"
            >
              View all <ChevronRight size={15} />
            </button>
          </div>
          <div className={styles.categoryMegaMenuGrid}>
            {activeDepartment.categories.map((category) => {
              const CategoryIcon = resolveCategoryIcon(category.name);
              const categorySelected = selection.level === "CATEGORY"
                && selection.department === activeDepartment.name
                && selection.category === category.name;

              return (
                <div className={styles.categoryMegaMenuSection} key={category.name}>
                  <button
                    aria-current={categorySelected ? "true" : undefined}
                    className={categorySelected ? styles.categoryMegaMenuActive : undefined}
                    onClick={() => selectCatalog({
                      level: "CATEGORY",
                      department: activeDepartment.name,
                      category: category.name,
                    })}
                    type="button"
                  >
                    <CategoryIcon size={16} />
                    <strong>{category.name}</strong>
                    <small>{category.count}</small>
                  </button>
                  <div className={styles.categoryMegaMenuLinks}>
                    {category.subcategories.map((subcategory) => {
                      const selected = selection.level === "SUBCATEGORY"
                        && selection.department === activeDepartment.name
                        && selection.category === category.name
                        && selection.subcategory === subcategory.name;
                      return (
                        <button
                          aria-current={selected ? "true" : undefined}
                          className={selected ? styles.categoryMegaMenuActive : undefined}
                          key={subcategory.name}
                          onClick={() => selectCatalog({
                            level: "SUBCATEGORY",
                            department: activeDepartment.name,
                            category: category.name,
                            subcategory: subcategory.name,
                          })}
                          type="button"
                        >
                          <span>{subcategory.name}</span>
                          <small>{subcategory.count}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </nav>
  );
}

function StorefrontHero({ store }: { store: PublicStorefrontData["store"] }) {
  const slides = store.heroImageUrls.length > 0 ? store.heroImageUrls : [store.heroImageUrl];
  const slideSignature = slides.join("|");
  const [activeSlide, setActiveSlide] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setActiveSlide(0);
  }, [slideSignature]);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const timer = window.setInterval(
      () => setActiveSlide((current) => (current + 1) % slides.length),
      5500,
    );
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  const moveSlide = (direction: -1 | 1) => {
    setActiveSlide((current) => (current + direction + slides.length) % slides.length);
  };

  return (
    <section
      aria-label={`${store.name} offers`}
      className={styles.shopIntro}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className={styles.shopIntroTrack} style={{ transform: `translateX(-${activeSlide * 100}%)` }}>
        {slides.map((imageUrl, index) => <div aria-hidden={index !== activeSlide} className={styles.shopIntroSlide} key={`${imageUrl}-${index}`}><StorefrontImage alt={index === 0 ? `${store.name} storefront` : ""} priority={index === 0} sizes="(max-width: 639px) calc(100vw - 28px), (max-width: 1268px) calc(100vw - 28px), 1240px" src={imageUrl} /></div>)}
      </div>
      <h1 className={styles.srOnly}>{store.name}</h1>
      {slides.length > 1 ? <><div className={styles.heroControls}><button aria-label="Previous banner" onClick={() => moveSlide(-1)} title="Previous banner" type="button"><ChevronLeft size={22} /></button><button aria-label="Next banner" onClick={() => moveSlide(1)} title="Next banner" type="button"><ChevronRight size={22} /></button></div><div aria-label="Storefront banners" className={styles.heroDots}>{slides.map((imageUrl, index) => <button aria-label={`Show banner ${index + 1}`} aria-pressed={index === activeSlide} className={index === activeSlide ? styles.heroDotActive : undefined} key={`${imageUrl}-dot-${index}`} onClick={() => setActiveSlide(index)} title={`Show banner ${index + 1}`} type="button" />)}</div></> : null}
      {store.supportPhone ? <a href={`tel:${store.supportPhone}`}>Call shop</a> : null}
    </section>
  );
}

function ProductCard({ product, money, onOpen, onAdd, compact = false }: {
  product: Product;
  money: Intl.NumberFormat;
  onOpen: (product: Product) => void;
  onAdd: (product: Product) => void;
  compact?: boolean;
}) {
  const promotion = getProductPromotion(product);
  const displayPrice = getProductPrice(product);
  const originalPrice = getProductOriginalPrice(product);
  const previewImageUrl = product.imageUrl;

  return (
    <article
      className={classNames(styles.productCard, compact && styles.productCardCompact)}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest(`.${styles.productQuickAdd}`)) return;
        onOpen(product);
      }}
    >
      <button
        aria-label={`View details for ${product.name}`}
        className={styles.productVisualButton}
        title="View product details"
        type="button"
      >
        <ProductVisual imageUrl={previewImageUrl} product={product} />
        {promotion ? (
          <span className={styles.promotionBadge}><BadgePercent size={13} />{getPromotionLabel(promotion, money)}</span>
        ) : product.featured ? <span className={styles.featuredBadge}>Featured</span> : null}
      </button>
      <div className={styles.productCardBody}>
        <span>{product.brand ?? (product.category ? formatStorefrontTaxonomyLabel(product.category) : product.code)}</span>
        <button type="button"><h3>{product.name}</h3></button>
        <div className={styles.cardRating}><StarRating rating={product.averageRating} /><span>{product.reviewCount > 0 ? product.reviewCount : "New"}</span></div>
        <div className={styles.productCardFooter}>
          <div><strong>{money.format(displayPrice)}</strong>{originalPrice ? <del>{money.format(originalPrice)}</del> : null}<small>{promotion ? `${promotion.name} · ${getPromotionScopeLabel(promotion)}` : isProductOutOfStock(product) ? "Out of stock" : product.variants.length > 0 ? `${product.variants.length} options` : product.availableQuantity === null ? "Available" : `${Math.floor(product.availableQuantity)} available`}</small></div>
          <button
            aria-label={`Add ${product.name} to cart`}
            className={styles.productQuickAdd}
            disabled={isProductOutOfStock(product)}
            onClick={(event) => {
              event.stopPropagation();
              onAdd(product);
            }}
            title="Add to cart"
            type="button"
          ><ShoppingCart size={18} /></button>
        </div>
      </div>
    </article>
  );
}

function WhatsAppMark() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.097-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.206-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479s1.065 2.875 1.213 3.074c.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.868 9.868 0 0 1-5.031-1.378l-.361-.214-3.741.981.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 7.021 2.91 9.825 9.825 0 0 1 2.9 7.027c-.003 5.45-4.437 9.884-9.925 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.304-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.478-8.413Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ProductVisual({ product, large = false, imageUrl = product.imageUrl }: { product: Product; large?: boolean; imageUrl?: string | null }) {
  const sizes = large
    ? "(max-width: 899px) calc(100vw - 44px), (max-width: 1199px) 50vw, 620px"
    : "(max-width: 639px) 50vw, (max-width: 899px) 33vw, (max-width: 1179px) 25vw, 248px";
  return (
    <div className={classNames(styles.productVisual, large && styles.productVisualLarge)}>
      {imageUrl ? <StorefrontImage alt={product.name} sizes={sizes} src={imageUrl} /> : <span>{productInitials(product.name)}</span>}
    </div>
  );
}

function StarRating({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return <span aria-label={rating > 0 ? `${rating} out of 5 stars` : "Not yet rated"} className={styles.stars}>{[1, 2, 3, 4, 5].map((value) => <Star fill={value <= rounded ? "currentColor" : "none"} key={value} size={13} />)}</span>;
}

function QuantityStepper({ value, onChange, max = null }: { value: number; onChange: (value: number) => void; max?: number | null }) {
  const maximumQuantity = max === null ? 999 : Math.max(0, max);
  return (
    <div className={styles.quantityStepper}>
      <button aria-label="Decrease quantity" onClick={() => onChange(Math.max(1, value - 1))} type="button"><Minus size={17} /></button>
      <strong>{value}</strong>
      <button aria-label="Increase quantity" disabled={value >= maximumQuantity} onClick={() => onChange(Math.min(maximumQuantity, value + 1))} type="button"><Plus size={17} /></button>
    </div>
  );
}

function DrawerHeader({
  title,
  onClose,
  onBack,
  onRefresh,
  busy = false
}: {
  title: string;
  onClose: () => void;
  onBack?: () => void;
  onRefresh?: () => void;
  busy?: boolean;
}) {
  return (
    <header className={styles.drawerHeader}>
      {onBack ? <button onClick={onBack} title="Back" type="button"><ArrowLeft size={20} /></button> : <span />}
      <h2>{title}</h2>
      <div className={styles.drawerHeaderActions}>
        {onRefresh ? <button aria-label="Refresh order details" disabled={busy} onClick={onRefresh} title="Refresh order details" type="button"><RefreshCw className={busy ? styles.spin : undefined} size={19} /></button> : null}
        <button onClick={onClose} title="Close" type="button"><X size={20} /></button>
      </div>
    </header>
  );
}

function CartPanel({ cart, stockError, money, quote, subtotal, discount, total, onClose, onQuantity, onCheckout }: {
  cart: CartLine[];
  stockError: string | null;
  money: Intl.NumberFormat;
  quote: EcommerceQuote | null;
  subtotal: number;
  discount: number;
  total: number;
  onClose: () => void;
  onQuantity: (key: string, quantity: number) => void;
  onCheckout: () => void;
}) {
  return (
    <div className={styles.drawerContent}>
      <DrawerHeader onClose={onClose} title="Your cart" />
      {cart.length === 0 ? (
        <div className={styles.drawerEmpty}><ShoppingCart size={34} /><h3>Your cart is empty</h3><button onClick={onClose} type="button">Browse products</button></div>
      ) : (
        <>
          <div className={styles.cartLines}>
            {cart.map((line, index) => (
              <article className={styles.cartLine} key={line.key}>
                <div className={styles.cartThumb}>{line.imageUrl ? <StorefrontImage alt="" sizes="72px" src={line.imageUrl} /> : productInitials(line.name)}</div>
                <div className={styles.cartLineMain}><strong>{line.name}</strong><span>{line.variantName ?? line.productCode} · {line.sellingUnitName}{line.uomConversionFactor !== 1 ? ` (${line.uomConversionFactor} ${line.baseUnitOfMeasure})` : ""}</span><small>{quote?.lines[index]?.appliedPromotionName ? `${quote.lines[index].appliedPromotionName} · ` : ""}{money.format(quote?.lines[index]?.totalAmount ?? line.unitPrice * line.quantity)}</small></div>
                <div className={styles.cartLineActions}>
                  <QuantityStepper onChange={(quantity) => onQuantity(line.key, quantity)} value={line.quantity} />
                  <button className={styles.deleteButton} onClick={() => onQuantity(line.key, 0)} title="Remove item" type="button"><Trash2 size={17} /></button>
                </div>
              </article>
            ))}
          </div>
          <div className={styles.drawerDock}>
            <div className={styles.totalLine}><span>Subtotal</span><strong>{money.format(subtotal)}</strong></div>
            {discount > 0 ? <div className={styles.totalLine}><span>Promotion savings</span><strong>-{money.format(discount)}</strong></div> : null}
            <div className={styles.totalLine}><span>Total</span><strong>{money.format(total)}</strong></div>
            {stockError ? <p className={styles.formError}>{stockError}</p> : null}
            <button className={styles.primaryButton} disabled={Boolean(stockError)} onClick={onCheckout} type="button">Checkout <ChevronRight size={19} /></button>
          </div>
        </>
      )}
    </div>
  );
}

function CheckoutPanel(props: {
  store: PublicStorefrontData["store"];
  subtotal: number;
  discount: number;
  checkoutTotal: number;
  fulfillment: EcommerceQuote["fulfillment"] | null;
  money: Intl.NumberFormat;
  deliveryMethod: "DELIVERY" | "PICKUP";
  pickupStoreCode: string;
  recipientName: string;
  deliveryPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  deliveryNote: string;
  saveAddress: boolean;
  busy: boolean;
  checkoutError: string | null;
  stockError: string | null;
  createdOrder: {
    orderNo: string;
    totalAmount: number;
    currencyCode: string;
    paymentMethodCode: string;
    paymentMethodName: string;
    paymentTiming: "ON_DELIVERY" | "PREPAY";
    orderType: "SALES_ORDER" | "LAYAWAY";
    paymentAmountDueNow: number;
    fulfillment: EcommerceQuote["fulfillment"];
  } | null;
  paymentOptions: CheckoutPaymentOption[];
  selectedPaymentCode: string;
  receiptEmail: string;
  paymentBusy: boolean;
  orderType: "SALES_ORDER" | "LAYAWAY";
  layawayDepositAmount: number;
  onClose: () => void;
  onBack: () => void;
  onDeliveryMethod: (value: "DELIVERY" | "PICKUP") => void;
  onPickupStoreCode: (value: string) => void;
  onRecipientName: (value: string) => void;
  onDeliveryPhone: (value: string) => void;
  onAddressLine1: (value: string) => void;
  onAddressLine2: (value: string) => void;
  onCity: (value: string) => void;
  onRegion: (value: string) => void;
  onDeliveryNote: (value: string) => void;
  onSaveAddress: (value: boolean) => void;
  onSelectedPaymentCode: (value: string) => void;
  onOrderType: (value: "SALES_ORDER" | "LAYAWAY") => void;
  onLayawayDepositAmount: (value: number) => void;
  onPlaceOrder: () => void;
  onReceiptEmail: (value: string) => void;
  onPay: (tenderMethodCode: string) => void;
}) {
  const pickupLocation = props.store.pickupLocations.find(
    (location) => location.storeCode === props.pickupStoreCode,
  );
  if (props.createdOrder) {
    return (
      <div className={styles.drawerContent}>
        <DrawerHeader onClose={props.onClose} title={props.createdOrder.orderType === "LAYAWAY" ? "Layaway created" : "Order placed"} />
        <div className={styles.orderSuccess}>
          <span><BadgeCheck size={42} /></span>
          <h2>{props.createdOrder.orderType === "LAYAWAY" ? "Complete your deposit" : "Thank you"}</h2>
          <p>{props.createdOrder.orderNo}</p>
          <strong>{props.money.format(props.createdOrder.totalAmount)}</strong>
          {props.createdOrder.orderType === "LAYAWAY" ? <small>Deposit due now: {props.money.format(props.createdOrder.paymentAmountDueNow)}</small> : null}
          <div className={styles.pickupInfo}>
            <Store size={21} />
            <div>
              <strong>
                {props.createdOrder.fulfillment.routingMethod === "NETWORK_TRANSFER"
                  ? "Network fulfilment is being arranged"
                  : props.createdOrder.fulfillment.method === "PICKUP"
                    ? `Pickup from ${props.createdOrder.fulfillment.storeName}`
                    : `Delivery dispatching from ${props.createdOrder.fulfillment.storeName}`}
              </strong>
              <p>{props.createdOrder.fulfillment.inventoryLocationName}</p>
            </div>
          </div>
        </div>
        <div className={styles.paymentSection}>
          {props.createdOrder.paymentTiming === "PREPAY" ? (
            <>
              <label className={styles.field}><span>Payment receipt email</span><input autoComplete="email" inputMode="email" onChange={(event) => props.onReceiptEmail(event.target.value)} value={props.receiptEmail} /></label>
              <div className={styles.paymentMethods}>
                <button disabled={props.paymentBusy} onClick={() => props.onPay(props.createdOrder?.paymentMethodCode ?? "")} type="button"><CreditCard size={20} /><span><strong>{props.createdOrder.orderType === "LAYAWAY" ? `Pay ${props.money.format(props.createdOrder.paymentAmountDueNow)} deposit` : `Pay now with ${props.createdOrder.paymentMethodName}`}</strong><small>{props.createdOrder.orderType === "LAYAWAY" ? `Secure payment with ${props.createdOrder.paymentMethodName}.` : "Complete payment securely before delivery."}</small></span><ChevronRight size={19} /></button>
              </div>
            </>
          ) : (
            <div className={styles.pendingPayment}><Clock3 size={24} /><div><strong>{props.createdOrder.paymentMethodName}</strong><p>The shop will accept your order before it enters the fulfilment lane.</p></div></div>
          )}
          {props.checkoutError ? <p className={styles.formError}>{props.checkoutError}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.drawerContent}>
      <DrawerHeader onBack={props.onBack} onClose={props.onClose} title="Checkout" />
      <div className={styles.checkoutScroll}>
        {props.store.layawayOffer.enabled ? (
          <>
            <div className={styles.segmented}>
              <button className={props.orderType === "SALES_ORDER" ? styles.segmentedActive : undefined} onClick={() => props.onOrderType("SALES_ORDER")} type="button"><ShoppingBag size={18} />Buy now</button>
              <button aria-describedby={props.store.layawayOffer.paymentReady ? undefined : "layaway-payment-note"} className={props.orderType === "LAYAWAY" ? styles.segmentedActive : undefined} disabled={!props.store.layawayOffer.paymentReady} onClick={() => props.onOrderType("LAYAWAY")} title={props.store.layawayOffer.paymentReady ? "Start a layaway" : "Layaway needs an online payment option"} type="button"><WalletCards size={18} />Layaway</button>
            </div>
            {!props.store.layawayOffer.paymentReady ? <div className={styles.layawayUnavailable} id="layaway-payment-note"><CreditCard size={18} /><span>Layaway is offered by this shop, but online deposit payment is temporarily unavailable. Contact the shop for help.</span></div> : null}
          </>
        ) : null}
        <div className={styles.segmented}>
          {props.store.allowDelivery ? <button className={props.deliveryMethod === "DELIVERY" ? styles.segmentedActive : undefined} onClick={() => props.onDeliveryMethod("DELIVERY")} type="button"><Truck size={18} />Delivery</button> : null}
          {props.store.allowPickup ? <button className={props.deliveryMethod === "PICKUP" ? styles.segmentedActive : undefined} onClick={() => props.onDeliveryMethod("PICKUP")} type="button"><Store size={18} />Pickup</button> : null}
        </div>
        <section className={styles.checkoutSection}>
          <h3>Contact</h3>
          <div className={styles.formGrid}>
            <label className={styles.field}><span>Recipient name</span><input autoComplete="name" onChange={(event) => props.onRecipientName(event.target.value)} value={props.recipientName} /></label>
            <label className={styles.field}><span>Phone number</span><input autoComplete="tel" inputMode="tel" onChange={(event) => props.onDeliveryPhone(event.target.value)} value={props.deliveryPhone} /></label>
          </div>
        </section>
        {props.deliveryMethod === "DELIVERY" ? (
          <section className={styles.checkoutSection}>
            <h3>Delivery address</h3>
            <label className={styles.field}><span>Address</span><input autoComplete="street-address" onChange={(event) => props.onAddressLine1(event.target.value)} value={props.addressLine1} /></label>
            <label className={styles.field}><span>Address line 2</span><input onChange={(event) => props.onAddressLine2(event.target.value)} value={props.addressLine2} /></label>
            <div className={styles.formGrid}>
              <label className={styles.field}><span>City</span><input autoComplete="address-level2" onChange={(event) => props.onCity(event.target.value)} value={props.city} /></label>
              <label className={styles.field}><span>Region</span><input autoComplete="address-level1" onChange={(event) => props.onRegion(event.target.value)} value={props.region} /></label>
            </div>
            <label className={styles.field}><span>Delivery note</span><textarea onChange={(event) => props.onDeliveryNote(event.target.value)} rows={3} value={props.deliveryNote} /></label>
            <label className={styles.checkField}><input checked={props.saveAddress} onChange={(event) => props.onSaveAddress(event.target.checked)} type="checkbox" /><span>Save this address</span></label>
          </section>
        ) : (
          <section className={styles.checkoutSection}>
            <h3>Pickup shop</h3>
            <label className={styles.field}>
              <span>Collect from</span>
              <select onChange={(event) => props.onPickupStoreCode(event.target.value)} value={props.pickupStoreCode}>
                {props.store.pickupLocations.map((location) => (
                  <option key={location.storeCode} value={location.storeCode}>{location.name}</option>
                ))}
              </select>
            </label>
            {pickupLocation?.address ? (
              <div className={styles.pickupInfo}><LocateFixed size={22} /><div><strong>{pickupLocation.name}</strong><p>{pickupLocation.address}</p></div></div>
            ) : null}
          </section>
        )}
        {props.fulfillment ? (
          <div className={styles.pickupInfo}>
            <Store size={21} />
            <div>
              <strong>
                {props.deliveryMethod === "PICKUP"
                  ? "Pickup stock assigned"
                  : props.fulfillment.networkAllocation
                    ? "Delivery stock secured across the fulfilment network"
                    : "Delivery stock assigned"}
              </strong>
              <p>
                {props.deliveryMethod === "PICKUP" ? "Collect from" : "Dispatching from"} {props.fulfillment.storeName}
                {" · "}{props.fulfillment.inventoryLocationName}
              </p>
            </div>
          </div>
        ) : null}
        <section className={styles.checkoutSection}>
          <h3>Payment</h3>
          {props.orderType === "LAYAWAY" ? (
            <>
              <div className={styles.pendingPayment}><Clock3 size={22} /><div><strong>{props.store.layawayOffer.minimumDepositPercent}% minimum deposit</strong><p>{props.store.layawayOffer.reserveStockOnDeposit ? "Stock is reserved after the deposit is verified." : "Stock is allocated when the Layaway is fulfilled."} {props.store.layawayOffer.requireFullPaymentBeforeFulfilment ? "Full payment is required before fulfilment." : "The shop may fulfil with an approved balance."}</p></div></div>
              <label className={styles.field}><span>Deposit to pay now</span><input inputMode="decimal" max={props.checkoutTotal} min={props.checkoutTotal * (props.store.layawayOffer.minimumDepositPercent / 100)} onChange={(event) => props.onLayawayDepositAmount(Number(event.target.value))} step="0.01" type="number" value={props.layawayDepositAmount} /></label>
            </>
          ) : null}
          <div className={styles.checkoutPaymentOptions}>
            {props.paymentOptions.map((method) => (
              <label className={props.selectedPaymentCode === method.code ? styles.checkoutPaymentSelected : undefined} key={method.code}>
                <input checked={props.selectedPaymentCode === method.code} name="checkout-payment" onChange={() => props.onSelectedPaymentCode(method.code)} type="radio" />
                <span><CreditCard size={19} /><span><strong>{method.name}</strong><small>{method.description}</small></span></span>
              </label>
            ))}
            {props.paymentOptions.length === 0 ? <p>No ecommerce payment option is currently available.</p> : null}
          </div>
        </section>
        <section className={styles.orderSummary}>
          <div><span>Items</span><strong>{props.money.format(props.subtotal)}</strong></div>
          {props.discount > 0 ? <div><span>Promotion savings</span><strong>-{props.money.format(props.discount)}</strong></div> : null}
          <div><span>Total</span><strong>{props.money.format(props.checkoutTotal)}</strong></div>
        </section>
        {props.checkoutError ?? props.stockError ? <p className={styles.formError}>{props.checkoutError ?? props.stockError}</p> : null}
      </div>
      <div className={styles.drawerDock}>
        <button className={styles.primaryButton} disabled={props.busy || !props.selectedPaymentCode || Boolean(props.stockError)} onClick={props.onPlaceOrder} type="button">
          {props.busy ? <LoaderCircle className={styles.spin} size={19} /> : props.orderType === "LAYAWAY" ? <WalletCards size={19} /> : <ShoppingBag size={19} />} {props.orderType === "LAYAWAY" ? `Start Layaway · ${props.money.format(props.layawayDepositAmount)}` : `Place order · ${props.money.format(props.checkoutTotal)}`}
        </button>
      </div>
    </div>
  );
}

function createCustomerAddressDraft(address?: CustomerAddress): CustomerAddressDraft {
  return {
    id: address?.id,
    label: address?.label ?? "",
    recipientName: address?.recipientName ?? "",
    phone: address?.phone ?? "",
    addressLine1: address?.addressLine1 ?? "",
    addressLine2: address?.addressLine2 ?? "",
    city: address?.city ?? "",
    region: address?.region ?? "",
    postalCode: address?.postalCode ?? "",
    deliveryNote: address?.deliveryNote ?? "",
    makeDefault: address?.isDefault ?? false
  };
}

function AccountPanel(props: {
  account: CustomerAccount | null;
  busy: boolean;
  saving: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSaveProfile: (fullName: string) => Promise<boolean>;
  onSaveAddress: (address: CustomerAddressDraft) => Promise<boolean>;
  onDeleteAddress: (address: CustomerAddress) => Promise<boolean>;
  onResetPassword: () => void;
  onSignOut: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [addressEditorOpen, setAddressEditorOpen] = useState(false);
  const [addressDraft, setAddressDraft] = useState<CustomerAddressDraft>(() => createCustomerAddressDraft());

  useEffect(() => {
    setFullName(props.account?.customer.fullName ?? "");
  }, [props.account?.customer.fullName]);

  function beginAddressEdit(address?: CustomerAddress) {
    setAddressDraft(createCustomerAddressDraft(address));
    setAddressEditorOpen(true);
  }

  async function saveAddress() {
    if (await props.onSaveAddress(addressDraft)) {
      setAddressEditorOpen(false);
      setAddressDraft(createCustomerAddressDraft());
    }
  }

  async function deleteAddress(address: CustomerAddress) {
    if (!window.confirm(`Remove the saved address${address.label ? ` '${address.label}'` : ""}?`)) {
      return;
    }
    if (await props.onDeleteAddress(address) && addressDraft.id === address.id) {
      setAddressEditorOpen(false);
      setAddressDraft(createCustomerAddressDraft());
    }
  }

  return (
    <div className={styles.drawerContent}>
      <DrawerHeader busy={props.busy} onClose={props.onClose} onRefresh={props.onRefresh} title="My account" />
      {props.busy && !props.account ? (
        <div className={styles.drawerEmpty}><LoaderCircle className={styles.spin} size={30} /></div>
      ) : !props.account ? (
        <div className={styles.drawerEmpty}><CircleUserRound size={34} /><h3>Account unavailable</h3><button className={styles.secondaryButton} onClick={props.onRefresh} type="button">Try again</button></div>
      ) : (
        <div className={styles.accountPanelScroll}>
          <section className={styles.accountHero}>
            <span><CircleUserRound size={26} /></span>
            <div><small>Customer account</small><h2>{props.account.customer.fullName}</h2><p>{props.account.customer.customerNo}</p></div>
          </section>

          <section className={styles.accountSection}>
            <div className={styles.accountSectionHeading}><div><span>Profile</span><h3>Personal details</h3></div></div>
            <label className={styles.field}><span>Full name</span><input autoComplete="name" onChange={(event) => setFullName(event.target.value)} value={fullName} /></label>
            <div className={styles.readonlyDetails}>
              <span><small>Email</small><strong>{props.account.customer.email ?? "Not provided"}</strong></span>
              <span><small>Phone</small><strong>{props.account.customer.phone ?? "Not provided"}</strong></span>
            </div>
            <div className={styles.accountActions}>
              <button className={styles.secondaryButton} disabled={props.saving || fullName.trim() === props.account.customer.fullName} onClick={() => void props.onSaveProfile(fullName)} type="button"><Check size={17} />Save profile</button>
              <button className={styles.textButton} onClick={props.onResetPassword} type="button"><KeyRound size={16} />Change password</button>
            </div>
          </section>

          <section className={styles.accountSection}>
            <div className={styles.accountSectionHeading}><div><span>Delivery</span><h3>Saved addresses</h3></div><button className={styles.iconTextButton} onClick={() => beginAddressEdit()} type="button"><Plus size={16} />Add</button></div>
            {props.account.addresses.length === 0 ? <div className={styles.addressEmpty}><MapPin size={22} /><span>No saved delivery addresses yet.</span></div> : <div className={styles.addressList}>{props.account.addresses.map((address) => <article key={address.id} className={address.isDefault ? styles.addressDefault : undefined}><div><span className={styles.addressIcon}><MapPin size={18} /></span><span><strong>{address.label || "Delivery address"}{address.isDefault ? <em>Default</em> : null}</strong><small>{address.recipientName} · {address.phone}</small><p>{[address.addressLine1, address.addressLine2, address.city, address.region].filter(Boolean).join(", ")}</p></span></div><footer><button aria-label="Edit delivery address" className={styles.iconButton} onClick={() => beginAddressEdit(address)} title="Edit address" type="button"><Pencil size={16} /></button>{!address.isDefault ? <button className={styles.textButton} disabled={props.saving} onClick={() => void props.onSaveAddress({ ...createCustomerAddressDraft(address), makeDefault: true })} type="button">Make default</button> : null}<button aria-label="Remove delivery address" className={styles.iconButtonDanger} disabled={props.saving} onClick={() => void deleteAddress(address)} title="Remove address" type="button"><Trash2 size={16} /></button></footer></article>)}</div>}
          </section>

          {addressEditorOpen ? (
            <section className={styles.accountSection}>
              <div className={styles.accountSectionHeading}><div><span>{addressDraft.id ? "Edit" : "New"}</span><h3>{addressDraft.id ? "Update address" : "Add delivery address"}</h3></div><button className={styles.iconButton} aria-label="Close address editor" onClick={() => setAddressEditorOpen(false)} title="Close" type="button"><X size={17} /></button></div>
              <div className={styles.accountFormGrid}>
                <label className={styles.field}><span>Label</span><input onChange={(event) => setAddressDraft((current) => ({ ...current, label: event.target.value }))} placeholder="Home, Office, etc." value={addressDraft.label ?? ""} /></label>
                <label className={styles.field}><span>Recipient</span><input autoComplete="name" onChange={(event) => setAddressDraft((current) => ({ ...current, recipientName: event.target.value }))} value={addressDraft.recipientName} /></label>
                <label className={styles.field}><span>Phone</span><input autoComplete="tel" inputMode="tel" onChange={(event) => setAddressDraft((current) => ({ ...current, phone: event.target.value }))} value={addressDraft.phone} /></label>
                <label className={styles.field}><span>Address line 1</span><input autoComplete="address-line1" onChange={(event) => setAddressDraft((current) => ({ ...current, addressLine1: event.target.value }))} value={addressDraft.addressLine1} /></label>
                <label className={styles.field}><span>Address line 2</span><input autoComplete="address-line2" onChange={(event) => setAddressDraft((current) => ({ ...current, addressLine2: event.target.value }))} value={addressDraft.addressLine2 ?? ""} /></label>
                <label className={styles.field}><span>City or town</span><input autoComplete="address-level2" onChange={(event) => setAddressDraft((current) => ({ ...current, city: event.target.value }))} value={addressDraft.city} /></label>
                <label className={styles.field}><span>Region</span><input autoComplete="address-level1" onChange={(event) => setAddressDraft((current) => ({ ...current, region: event.target.value }))} value={addressDraft.region ?? ""} /></label>
                <label className={styles.field}><span>Delivery note</span><textarea onChange={(event) => setAddressDraft((current) => ({ ...current, deliveryNote: event.target.value }))} placeholder="Landmark, gate, or delivery note" rows={3} value={addressDraft.deliveryNote ?? ""} /></label>
              </div>
              <label className={styles.checkField}><input checked={addressDraft.makeDefault} onChange={(event) => setAddressDraft((current) => ({ ...current, makeDefault: event.target.checked }))} type="checkbox" /><span>Use this as my default delivery address</span></label>
              <div className={styles.accountActions}><button className={styles.secondaryButton} disabled={props.saving} onClick={() => void saveAddress()} type="button">{props.saving ? <LoaderCircle className={styles.spin} size={17} /> : <Check size={17} />}{addressDraft.id ? "Save address" : "Add address"}</button><button className={styles.textButton} onClick={() => setAddressEditorOpen(false)} type="button">Cancel</button></div>
            </section>
          ) : null}

          <section className={styles.accountSection}>
            <div className={styles.accountSectionHeading}><div><span>Security</span><h3>Access and sign out</h3></div></div>
            <p className={styles.accountHelp}>Email and phone are verified sign-in details. Use a verification code when changing your password.</p>
            <div className={styles.accountActions}><button className={styles.secondaryButton} onClick={props.onResetPassword} type="button"><KeyRound size={17} />Change password</button><button className={styles.textButton} onClick={props.onSignOut} type="button">Sign out</button></div>
          </section>
        </div>
      )}
    </div>
  );
}

function OrdersPanel(props: {
  orders: CustomerOrder[];
  selectedOrder: CustomerOrder | null;
  busy: boolean;
  session: CustomerSession;
  money: Intl.NumberFormat;
  onClose: () => void;
  onRefresh: () => void;
  onSelect: (order: CustomerOrder | null) => void;
  onRefund: (order: CustomerOrder) => void;
  onPay: (order: CustomerOrder, amount: number) => void;
  paymentBusy: boolean;
  paymentOptions: CheckoutPaymentOption[];
  receiptEmail: string;
  onReceiptEmail: (value: string) => void;
  onSignOut: () => void;
}) {
  const [paymentAmount, setPaymentAmount] = useState(0);

  useEffect(() => {
    setPaymentAmount(props.selectedOrder?.balanceAmount ?? 0);
  }, [props.selectedOrder?.id, props.selectedOrder?.balanceAmount]);

  if (props.selectedOrder) {
    const order = props.selectedOrder;
    return (
      <div className={styles.drawerContent}>
        <DrawerHeader
          busy={props.busy}
          onBack={() => props.onSelect(null)}
          onClose={props.onClose}
          onRefresh={props.onRefresh}
          title={order.orderNo}
        />
        <div className={styles.orderDetailScroll}>
          <div className={styles.orderStatusHero}><span>{order.orderType === "LAYAWAY" ? `LAYAWAY · ${order.status.replace(/_/g, " ")}` : order.status.replace(/_/g, " ")}</span><h2>{props.money.format(order.totalAmount)}</h2><p>{formatFriendlyDateTime(order.placedAt)}</p></div>
          <div className={styles.orderTimeline}>
            {order.timeline.map((event, index) => (
              <div key={event.id}><span className={index === order.timeline.length - 1 ? styles.timelineCurrent : undefined}><Check size={14} /></span><div><strong>{event.label}</strong>{event.note ? <p>{event.note}</p> : null}<small>{formatFriendlyDateTime(event.createdAt)}</small></div></div>
            ))}
          </div>
          <section className={styles.orderItems}>
            <h3>Items</h3>
            {order.lines.map((line) => <div key={line.id}><span><strong>{line.productName}</strong><small>{line.variant ?? `${line.quantity} item(s)`}</small></span><b>{props.money.format(line.lineTotal)}</b></div>)}
          </section>
          {order.deliveryAddress ? <div className={styles.pickupInfo}><Truck size={21} /><div><strong>Delivery</strong><p>{order.deliveryAddress}</p>{order.trackingReference ? <small>{order.trackingReference}</small> : null}</div></div> : null}
          {order.fulfilmentMethod === "DELIVERY" && order.fulfillment ? <div className={styles.pickupInfo}><Truck size={21} /><div><strong>Delivery prepared by {order.fulfillment.storeName}</strong><p>{order.fulfillment.routingMethod === "NETWORK_TRANSFER" ? "The dispatch shop is coordinating stock for one delivery." : order.fulfillment.inventoryLocationName ?? "Store sales location"}</p></div></div> : null}
          {order.fulfilmentMethod === "PICKUP" && order.fulfillment ? <div className={styles.pickupInfo}><Store size={21} /><div><strong>Pickup from {order.fulfillment.storeName}</strong><p>{order.fulfillment.inventoryLocationName ?? "Store sales location"}</p></div></div> : null}
          {order.orderType === "LAYAWAY" && order.balanceAmount > 0 && order.selectedPaymentMethodCode ? (
            <section className={styles.checkoutSection}>
              <h3>Pay Layaway balance</h3>
              <p>Paid {props.money.format(order.paidAmount)} · Balance {props.money.format(order.balanceAmount)} · Reservation {order.reservationStatus.replace(/_/g, " ").toLowerCase()}</p>
              <label className={styles.field}><span>Payment amount</span><input inputMode="decimal" max={order.balanceAmount} min={order.paidAmount <= 0 ? order.minimumDepositAmount : 0.01} onChange={(event) => setPaymentAmount(Number(event.target.value))} step="0.01" type="number" value={paymentAmount} /></label>
              <label className={styles.field}><span>Payment receipt email</span><input autoComplete="email" inputMode="email" onChange={(event) => props.onReceiptEmail(event.target.value)} value={props.receiptEmail} /></label>
              <button className={styles.primaryButton} disabled={props.paymentBusy || paymentAmount <= 0 || paymentAmount > order.balanceAmount} onClick={() => props.onPay(order, paymentAmount)} type="button"><CreditCard size={19} />Pay with {order.selectedPaymentMethodName ?? props.paymentOptions[0]?.name ?? "online payment"}</button>
            </section>
          ) : null}
          {order.paidAmount > 0 && order.refundRequests.length === 0 && !["REFUNDED", "CANCELLED"].includes(order.status) ? <button className={styles.secondaryButton} onClick={() => props.onRefund(order)} type="button">Request refund</button> : null}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.drawerContent}>
      <DrawerHeader onClose={props.onClose} title="My orders" />
      <div className={styles.accountStrip}><span><CircleUserRound size={22} /></span><div><strong>{props.session.customer?.fullName}</strong><small>{props.session.customer?.email ?? props.session.customer?.phone}</small></div><button onClick={props.onSignOut} type="button">Sign out</button></div>
      <button className={styles.refreshButton} disabled={props.busy} onClick={props.onRefresh} type="button"><RefreshCw className={props.busy ? styles.spin : undefined} size={17} />Refresh</button>
      {props.busy ? <div className={styles.drawerEmpty}><LoaderCircle className={styles.spin} size={30} /></div> : props.orders.length === 0 ? <div className={styles.drawerEmpty}><PackageCheck size={34} /><h3>No orders yet</h3></div> : <div className={styles.orderList}>{props.orders.map((order) => <button key={order.id} onClick={() => props.onSelect(order)} type="button"><span className={styles.orderIcon}>{order.deliveryStatus === "DELIVERED" ? <PackageCheck size={21} /> : <Truck size={21} />}</span><span><strong>{order.orderNo}</strong><small>{formatFriendlyDateTime(order.placedAt)} · {order.status.replace(/_/g, " ")}</small></span><b>{props.money.format(order.totalAmount)}</b><ChevronRight size={18} /></button>)}</div>}
    </div>
  );
}

function toCartMoney(value: number) {
  return Number(value.toFixed(2));
}
