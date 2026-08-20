"use client";

import {
  ArrowUpRight,
  BellRing,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Eye,
  LoaderCircle,
  Image as ImageIcon,
  MapPin,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShoppingBag,
  Store,
  Truck,
  Trash2,
  UploadCloud,
  WalletCards,
  X
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { ProductDescriptionEditor } from "@/components/ecommerce/product-description-editor";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import type { OnlineStoreEcommerceWorkspaceData } from "@/server/ecommerce/ecommerce.repository";

import styles from "./online-store-ecommerce-workspace.module.css";

type Workspace = OnlineStoreEcommerceWorkspaceData;
type Order = Workspace["orders"][number];
type Product = Workspace["products"][number];
type Tab = "ORDERS" | "PRODUCTS" | "PAYMENTS" | "STOREFRONT";
const productPageSize = 20;

const nextStatuses: Record<string, string[]> = {
  PLACED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["READY", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED"]
};

function formatStatus(value: string) {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) {
    throw new Error(body.message ?? "The request could not be completed.");
  }
  return body;
}

function money(currencyCode: string, amount: number) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2
  }).format(amount);
}

function toneForStatus(status: string) {
  if (["PAID", "DELIVERED", "READY"].includes(status)) return styles.good;
  if (["CANCELLED", "REFUNDED", "FAILED"].includes(status)) return styles.bad;
  if (["REFUND_REQUESTED", "PARTIALLY_PAID"].includes(status)) return styles.warning;
  return styles.neutral;
}

export function OnlineStoreEcommerceWorkspace({
  initialWorkspace,
  embedded = false
}: {
  initialWorkspace: Workspace;
  embedded?: boolean;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [activeTab, setActiveTab] = useState<Tab>("ORDERS");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchText, setSearchText] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    ecommerceEnabled: workspace.store.ecommerceEnabled,
    ecommerceSlug: workspace.store.ecommerceSlug ?? "",
    ecommerceDisplayName: workspace.store.ecommerceDisplayName ?? "",
    ecommerceDescription: workspace.store.ecommerceDescription ?? "",
    ecommerceSupportPhone: workspace.store.ecommerceSupportPhone ?? "",
    ecommerceSupportEmail: workspace.store.ecommerceSupportEmail ?? "",
    ecommerceHeroImageUrl: workspace.store.ecommerceHeroImageUrl ?? "",
    ecommerceWhatsappPhone: workspace.store.ecommerceWhatsappPhone ?? "",
    ecommerceAllowPickup: workspace.store.ecommerceAllowPickup,
    ecommerceAllowDelivery: workspace.store.ecommerceAllowDelivery,
    ecommercePayOnDeliveryEnabled: workspace.store.ecommercePayOnDeliveryEnabled,
    ecommerceLayawayEnabled: workspace.store.ecommerceLayawayEnabled,
  });
  const [paymentMethods, setPaymentMethods] = useState(workspace.paymentMethods);
  const [fulfillmentLocations, setFulfillmentLocations] = useState(
    workspace.fulfillmentLocations.map((location) => ({
      inventoryLocationId: location.inventoryLocationId,
      supportsPickup: location.supportsPickup,
      supportsDelivery: location.supportsDelivery,
      routingPriority: location.routingPriority,
    })),
  );
  const liveSignatureRef = useRef("");
  const liveOrderCountRef = useRef(workspace.orders.length);

  const selectedOrder = workspace.orders.find((order) => order.id === selectedOrderId) ?? null;
  const publicStoreCode = workspace.store.ecommerceSlug || workspace.store.code;
  const publicStoreHref = `/shop/${encodeURIComponent(publicStoreCode)}`;
  const filteredProducts = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return workspace.products;
    return workspace.products.filter((product) =>
      [product.code, product.name, product.category]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    );
  }, [searchText, workspace.products]);
  const productPageCount = Math.max(1, Math.ceil(filteredProducts.length / productPageSize));
  const pagedProducts = filteredProducts.slice(
    (productPage - 1) * productPageSize,
    productPage * productPageSize
  );
  const placedCount = workspace.orders.filter((order) => order.status === "PLACED").length;
  const openCount = workspace.orders.filter((order) =>
    !["DELIVERED", "CANCELLED", "REFUNDED"].includes(order.status)
  ).length;
  const paidValue = workspace.orders.reduce((sum, order) => sum + order.paidAmount, 0);
  const deliveryCount = workspace.orders.filter((order) => order.fulfilmentMethod === "DELIVERY").length;

  async function refreshWorkspace() {
    const fresh = await readJson<Workspace>(
      await fetch("/api/online-store/ecommerce", { cache: "no-store" })
    );
    setWorkspace(fresh);
    setPaymentMethods(fresh.paymentMethods);
    setFulfillmentLocations(
      fresh.fulfillmentLocations.map((location) => ({
        inventoryLocationId: location.inventoryLocationId,
        supportsPickup: location.supportsPickup,
        supportsDelivery: location.supportsDelivery,
        routingPriority: location.routingPriority,
      })),
    );
  }

  useEffect(() => {
    void refreshWorkspace().catch((refreshError: unknown) => {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "The latest ecommerce orders could not be loaded."
      );
    });
    const events = new EventSource("/api/online-store/ecommerce/events");
    const handleOrders = (event: MessageEvent<string>) => {
      const snapshot = JSON.parse(event.data) as {
        signature: string;
        orderCount: number;
        latestOrder: { orderNo: string } | null;
      };
      if (!liveSignatureRef.current) {
        liveSignatureRef.current = snapshot.signature;
        liveOrderCountRef.current = snapshot.orderCount;
        return;
      }
      if (snapshot.signature === liveSignatureRef.current) return;
      const hasNewOrder = snapshot.orderCount > liveOrderCountRef.current;
      liveSignatureRef.current = snapshot.signature;
      liveOrderCountRef.current = snapshot.orderCount;
      void refreshWorkspace();
      if (hasNewOrder) {
        setMessage(`New customer order${snapshot.latestOrder?.orderNo ? ` ${snapshot.latestOrder.orderNo}` : ""} received.`);
      }
    };
    events.addEventListener("orders", handleOrders as EventListener);
    return () => events.close();
  }, []);

  useEffect(() => {
    setProductPage(1);
  }, [searchText]);

  useEffect(() => {
    setProductPage((current) => Math.min(current, productPageCount));
  }, [productPageCount]);

  async function perform(key: string, action: () => Promise<{ message?: string }>) {
    setBusyKey(key);
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      await refreshWorkspace();
      setMessage(result.message ?? "Changes saved.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The change could not be saved.");
    } finally {
      setBusyKey(null);
    }
  }

  function updateProduct(product: Product, patch: Partial<Product>) {
    return perform(`product:${product.id}`, async () =>
      readJson<{ message: string }>(
        await fetch(`/api/online-store/ecommerce/products/${encodeURIComponent(product.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            published: patch.ecommercePublished ?? product.ecommercePublished,
            featured: patch.ecommerceFeatured ?? product.ecommerceFeatured,
            sortOrder: patch.ecommerceSortOrder ?? product.ecommerceSortOrder,
            ecommerceDescription: patch.ecommerceDescription ?? product.ecommerceDescription,
            ecommerceCompareAtPrice:
              patch.ecommerceCompareAtPrice === undefined
                ? product.ecommerceCompareAtPrice
                : patch.ecommerceCompareAtPrice,
            ecommerceSpecifications:
              patch.ecommerceSpecifications ?? product.ecommerceSpecifications,
            ecommerceGalleryImageUrls:
              patch.ecommerceGalleryImageUrls ?? product.ecommerceGalleryImageUrls
          })
        })
      )
    );
  }

  async function uploadImage(file: File) {
    const formData = new FormData();
    formData.set("file", file);
    return readJson<{ url: string; message: string }>(
      await fetch("/api/online-store/ecommerce/media", { method: "POST", body: formData })
    );
  }

  function savePaymentOptions() {
    return perform("payments", async () =>
      readJson<{ message: string }>(
        await fetch("/api/online-store/ecommerce/payment-methods", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            payOnDeliveryEnabled: settings.ecommercePayOnDeliveryEnabled,
            layawayEnabled: settings.ecommerceLayawayEnabled,
            methods: paymentMethods.map((method) => ({
              tenderMethodId: method.id,
              enabled: method.enabled,
              sortOrder: method.sortOrder
            }))
          })
        })
      )
    );
  }

  function updateOrderStatus(order: Order, status: string) {
    return perform(`order:${order.id}`, async () =>
      readJson<{ message: string }>(
        await fetch(`/api/online-store/ecommerce/orders/${encodeURIComponent(order.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status })
        })
      )
    );
  }

  function saveSettings() {
    return perform("settings", async () =>
      readJson<{ message: string }>(
        await fetch("/api/online-store/ecommerce/settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...settings, fulfillmentLocations })
        })
      )
    );
  }

  function addFulfillmentLocation() {
    const selectedIds = new Set(fulfillmentLocations.map((location) => location.inventoryLocationId));
    const nextLocation = workspace.availableFulfillmentLocations.find(
      (location) => !selectedIds.has(location.id),
    );
    if (!nextLocation) {
      setError("Every active shop sales location is already listed.");
      return;
    }
    setFulfillmentLocations((current) => [
      ...current,
      {
        inventoryLocationId: nextLocation.id,
        supportsPickup: true,
        supportsDelivery: true,
        routingPriority: (current.length + 1) * 10,
      },
    ]);
  }

  function updateFulfillmentLocation(
    inventoryLocationId: string,
    patch: Partial<(typeof fulfillmentLocations)[number]>,
  ) {
    setFulfillmentLocations((current) => current.map((location) =>
      location.inventoryLocationId === inventoryLocationId
        ? { ...location, ...patch }
        : location,
    ));
  }

  const content = (
    <>
      <div className={styles.workspace}>
        <div className={styles.commandBar}>
          <div>
            <span className={`${styles.statusDot} ${workspace.store.ecommerceEnabled ? styles.live : ""}`} />
            <strong>{workspace.store.ecommerceEnabled ? "Storefront live" : "Storefront offline"}</strong>
            <small>{workspace.store.name}</small>
          </div>
          <div className={styles.commandActions}>
            <button
              aria-label="Refresh ecommerce workspace"
              disabled={busyKey === "refresh"}
              onClick={() => perform("refresh", async () => {
                await refreshWorkspace();
                return { message: "Ecommerce workspace refreshed." };
              })}
              title="Refresh"
              type="button"
            >
              {busyKey === "refresh" ? <LoaderCircle className={styles.spin} size={18} /> : <RefreshCw size={18} />}
            </button>
            <Link href={publicStoreHref} target="_blank">
              View shop <ExternalLink size={17} />
            </Link>
          </div>
        </div>

        {message ? <div className={styles.notice}><Check size={17} />{message}</div> : null}
        {error ? <div className={`${styles.notice} ${styles.noticeError}`}><X size={17} />{error}</div> : null}

        <section className={styles.metrics} aria-label="Ecommerce summary">
          <article><ShoppingBag size={20} /><span><small>New orders</small><strong>{placedCount}</strong></span></article>
          <article><Clock3 size={20} /><span><small>Open workflow</small><strong>{openCount}</strong></span></article>
          <article><CircleDollarSign size={20} /><span><small>Payments received</small><strong>{money(workspace.orders[0]?.currencyCode ?? "GHS", paidValue)}</strong></span></article>
          <article><Truck size={20} /><span><small>Delivery orders</small><strong>{deliveryCount}</strong></span></article>
        </section>

        <div className={styles.tabs} role="tablist" aria-label="Ecommerce workspace views">
          <button className={activeTab === "ORDERS" ? styles.activeTab : undefined} onClick={() => setActiveTab("ORDERS")} role="tab" type="button"><PackageCheck size={18} />Orders</button>
          <button className={activeTab === "PRODUCTS" ? styles.activeTab : undefined} onClick={() => setActiveTab("PRODUCTS")} role="tab" type="button"><ShoppingBag size={18} />Products</button>
          <button className={activeTab === "PAYMENTS" ? styles.activeTab : undefined} onClick={() => setActiveTab("PAYMENTS")} role="tab" type="button"><WalletCards size={18} />Payments</button>
          <button className={activeTab === "STOREFRONT" ? styles.activeTab : undefined} onClick={() => setActiveTab("STOREFRONT")} role="tab" type="button"><Settings2 size={18} />Storefront</button>
        </div>

        {activeTab === "ORDERS" ? (
          <section className={styles.surface}>
            <div className={styles.sectionHeading}>
              <div><span>Customer ordering</span><h2>Incoming orders</h2></div>
              <small>{workspace.orders.length} recent order(s)</small>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Order</th><th>Customer</th><th>Placed</th><th>Fulfilment</th><th>Payment</th><th>Total</th><th><span className={styles.srOnly}>View</span></th></tr></thead>
                <tbody>
                  {workspace.orders.map((order) => (
                    <tr key={order.id}>
                      <td><strong>{order.orderNo}</strong><small>{order.orderType === "LAYAWAY" ? "Layaway" : "Customer order"}</small><span className={`${styles.pill} ${toneForStatus(order.status)}`}>{formatStatus(order.status)}</span></td>
                      <td><strong>{order.customer.fullName}</strong><small>{order.customer.phone ?? order.customer.email ?? order.customer.customerNo}</small></td>
                      <td>{new Date(order.placedAt).toLocaleString()}</td>
                      <td><strong>{formatStatus(order.fulfilmentMethod)}</strong><small>{order.fulfillment?.storeName ?? workspace.store.name}{order.fulfillment?.inventoryLocationName ? ` · ${order.fulfillment.inventoryLocationName}` : ""}</small></td>
                      <td><span className={`${styles.pill} ${toneForStatus(order.paymentStatus)}`}>{formatStatus(order.paymentStatus)}</span></td>
                      <td><strong>{money(order.currencyCode, order.totalAmount)}</strong><small>{order.balanceAmount > 0 ? `${money(order.currencyCode, order.balanceAmount)} due` : "Settled"}</small></td>
                      <td><button aria-label={`View ${order.orderNo}`} onClick={() => setSelectedOrderId(order.id)} title="View order" type="button"><Eye size={18} /></button></td>
                    </tr>
                  ))}
                  {workspace.orders.length === 0 ? <tr><td className={styles.empty} colSpan={7}>No ecommerce orders have been placed yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeTab === "PRODUCTS" ? (
          <section className={styles.surface}>
            <div className={styles.sectionHeading}>
              <div><span>Public catalog</span><h2>Product visibility</h2></div>
              <label className={styles.search}><Search size={17} /><input onChange={(event) => setSearchText(event.target.value)} placeholder="Search products" value={searchText} /></label>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Product</th><th>Category</th><th>Published</th><th>Featured</th><th>Order</th><th>Details</th><th><span className={styles.srOnly}>Preview</span></th></tr></thead>
                <tbody>
                  {pagedProducts.map((product) => {
                    const busy = busyKey === `product:${product.id}`;
                    return (
                      <tr key={product.id}>
                        <td><div className={styles.productCell}>{product.primaryImageUrl ? <img alt="" src={product.primaryImageUrl} /> : <span>{product.name.slice(0, 2).toUpperCase()}</span>}<div><strong>{product.name}</strong><small>{product.code}</small></div></div></td>
                        <td>{product.category ?? "Uncategorized"}</td>
                        <td><label className={styles.toggle}><input checked={product.ecommercePublished} disabled={busy} onChange={(event) => void updateProduct(product, { ecommercePublished: event.target.checked })} type="checkbox" /><span /></label></td>
                        <td><label className={styles.toggle}><input checked={product.ecommerceFeatured} disabled={busy} onChange={(event) => void updateProduct(product, { ecommerceFeatured: event.target.checked })} type="checkbox" /><span /></label></td>
                        <td><input aria-label={`Sort order for ${product.name}`} className={styles.sortInput} disabled={busy} min="0" onBlur={(event) => { const value = Number(event.target.value); if (value !== product.ecommerceSortOrder) void updateProduct(product, { ecommerceSortOrder: value }); }} type="number" defaultValue={product.ecommerceSortOrder} /></td>
                        <td><button aria-label={`Edit ecommerce details for ${product.name}`} onClick={() => setSelectedProduct(product)} title="Edit ecommerce details" type="button"><Pencil size={17} /></button></td>
                        <td>{busy ? <LoaderCircle className={styles.spin} size={18} /> : product.ecommercePublished ? <Link aria-label={`Open ${product.name} in public shop`} href={`${publicStoreHref}/products/${encodeURIComponent(product.code)}`} target="_blank"><ArrowUpRight size={18} /></Link> : null}</td>
                      </tr>
                    );
                  })}
                  {filteredProducts.length === 0 ? <tr><td className={styles.empty} colSpan={7}>No matching active products.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <div className={styles.pagination}>
              <span>
                {filteredProducts.length === 0
                  ? "0 products"
                  : `${(productPage - 1) * productPageSize + 1}-${Math.min(
                      productPage * productPageSize,
                      filteredProducts.length
                    )} of ${filteredProducts.length}`}
              </span>
              <div>
                <button
                  disabled={productPage <= 1}
                  onClick={() => setProductPage((page) => Math.max(1, page - 1))}
                  type="button"
                >
                  Previous
                </button>
                <strong>Page {productPage} of {productPageCount}</strong>
                <button
                  disabled={productPage >= productPageCount}
                  onClick={() => setProductPage((page) => Math.min(productPageCount, page + 1))}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "PAYMENTS" ? (
          <section className={styles.surface}>
            <div className={styles.sectionHeading}>
              <div><span>Customer checkout</span><h2>Payment options</h2></div>
              <small>Only enabled and ready options appear publicly.</small>
            </div>
            <div className={styles.paymentSetup}>
              <div className={styles.paymentOptionRow}>
                <span className={styles.paymentIcon}><Truck size={20} /></span>
                <span><strong>Pay on delivery or collection</strong><small>Staff collects payment during fulfilment.</small></span>
                <label className={styles.toggle}><input checked={settings.ecommercePayOnDeliveryEnabled} onChange={(event) => setSettings((current) => ({ ...current, ecommercePayOnDeliveryEnabled: event.target.checked }))} type="checkbox" /><span /></label>
              </div>
              <div className={styles.paymentOptionRow}>
                <span className={styles.paymentIcon}><WalletCards size={20} /></span>
                <span>
                  <strong>Offer Layaway online</strong>
                  <small>
                    {workspace.layawayPolicy.enabled
                      ? `${workspace.layawayPolicy.minimumDepositPercent}% minimum deposit; customers also need an enabled, gateway-ready online payment option for the deposit.`
                      : "Enable Layaway in HQ Company Settings before offering it online."}
                  </small>
                </span>
                <label className={styles.toggle}>
                  <input
                    checked={settings.ecommerceLayawayEnabled}
                    disabled={!workspace.layawayPolicy.enabled}
                    onChange={(event) => setSettings((current) => ({ ...current, ecommerceLayawayEnabled: event.target.checked }))}
                    type="checkbox"
                  />
                  <span />
                </label>
              </div>
              {paymentMethods.map((method) => (
                <div className={styles.paymentOptionRow} key={method.id}>
                  <span className={styles.paymentIcon}><CircleDollarSign size={20} /></span>
                  <span><strong>{method.name}</strong><small>{method.provider} · Pay before delivery · {method.gatewayRuntimeReady ? "Server key ready" : "Server key needed"}</small></span>
                  <label className={styles.toggle}><input checked={method.enabled} disabled={!method.gatewayRuntimeReady} onChange={(event) => setPaymentMethods((current) => current.map((entry) => entry.id === method.id ? { ...entry, enabled: event.target.checked } : entry))} type="checkbox" /><span /></label>
                </div>
              ))}
              {paymentMethods.length === 0 ? <div className={styles.empty}>Configure a Paystack or Flutterwave tender method before enabling prepayment.</div> : null}
              <button className={styles.saveButton} disabled={busyKey === "payments"} onClick={() => void savePaymentOptions()} type="button">{busyKey === "payments" ? <LoaderCircle className={styles.spin} size={18} /> : <Check size={18} />}Save payment options</button>
            </div>
          </section>
        ) : null}

        {activeTab === "STOREFRONT" ? (
          <section className={styles.settingsLayout}>
            <div className={styles.settingsIntro}>
              <Store size={30} />
              <span>Public storefront</span>
              <h2>{settings.ecommerceDisplayName || workspace.store.name}</h2>
              <p>These details are customer-facing. Staff POS settings and workflows remain unchanged.</p>
              <Link href={publicStoreHref} target="_blank">Open public URL <ChevronRight size={17} /></Link>
            </div>
            <form className={styles.settingsForm} onSubmit={(event) => { event.preventDefault(); void saveSettings(); }}>
              <div className={styles.switchRow}><div><strong>Publish storefront</strong><small>Customers can browse and place orders when enabled.</small></div><label className={styles.toggle}><input checked={settings.ecommerceEnabled} onChange={(event) => setSettings((current) => ({ ...current, ecommerceEnabled: event.target.checked }))} type="checkbox" /><span /></label></div>
              <div className={styles.formGrid}>
                <label><span>Storefront name</span><input onChange={(event) => setSettings((current) => ({ ...current, ecommerceDisplayName: event.target.value }))} value={settings.ecommerceDisplayName} /></label>
                <label><span>Public URL name</span><div className={styles.slugInput}><small>/shop/</small><input onChange={(event) => setSettings((current) => ({ ...current, ecommerceSlug: event.target.value.replace(/[^a-z0-9-]/gi, "").toLowerCase() }))} value={settings.ecommerceSlug} /></div></label>
              </div>
              <div className={styles.heroUpload}>
                <div className={styles.heroPreview}>{settings.ecommerceHeroImageUrl ? <img alt="Storefront background preview" src={settings.ecommerceHeroImageUrl} /> : <ImageIcon size={28} />}</div>
                <label><span>Storefront background</span><small>Use a clear landscape image, ideally 1600 x 700.</small><input accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void perform("hero-upload", async () => { const uploaded = await uploadImage(file); setSettings((current) => ({ ...current, ecommerceHeroImageUrl: uploaded.url })); return uploaded; }); }} type="file" /></label>
              </div>
              <label><span>Description</span><textarea onChange={(event) => setSettings((current) => ({ ...current, ecommerceDescription: event.target.value }))} rows={4} value={settings.ecommerceDescription} /></label>
              <div className={styles.formGrid}>
                <label><span>Support phone</span><input inputMode="tel" onChange={(event) => setSettings((current) => ({ ...current, ecommerceSupportPhone: event.target.value }))} value={settings.ecommerceSupportPhone} /></label>
                <label><span>Support email</span><input inputMode="email" onChange={(event) => setSettings((current) => ({ ...current, ecommerceSupportEmail: event.target.value }))} value={settings.ecommerceSupportEmail} /></label>
              </div>
              <label><span>WhatsApp business number</span><input inputMode="tel" onChange={(event) => setSettings((current) => ({ ...current, ecommerceWhatsappPhone: event.target.value }))} placeholder="233 20 000 0000" value={settings.ecommerceWhatsappPhone} /></label>
              <div className={styles.fulfilmentOptions}>
                <label><input checked={settings.ecommerceAllowDelivery} onChange={(event) => setSettings((current) => ({ ...current, ecommerceAllowDelivery: event.target.checked }))} type="checkbox" /><Truck size={19} /><span><strong>Delivery</strong><small>Collect a delivery address.</small></span></label>
                <label><input checked={settings.ecommerceAllowPickup} onChange={(event) => setSettings((current) => ({ ...current, ecommerceAllowPickup: event.target.checked }))} type="checkbox" /><Store size={19} /><span><strong>Store pickup</strong><small>Customer collects at the shop.</small></span></label>
              </div>
              <section className={styles.fulfillmentLocations}>
                <header>
                  <span><MapPin size={18} /><strong>Fulfilment locations</strong></span>
                  <button onClick={addFulfillmentLocation} type="button"><Plus size={16} />Add location</button>
                </header>
                <p>Delivery routes to the first listed location that can supply the whole stock-tracked order. Customers choose a listed pickup shop.</p>
                {fulfillmentLocations.length > 0 ? (
                  <div className={styles.fulfillmentLocationRows}>
                    {fulfillmentLocations.map((location) => (
                      <div className={styles.fulfillmentLocationRow} key={location.inventoryLocationId}>
                        <label>
                          <span>Sales location</span>
                          <select
                            onChange={(event) => updateFulfillmentLocation(location.inventoryLocationId, { inventoryLocationId: event.target.value })}
                            value={location.inventoryLocationId}
                          >
                            {workspace.availableFulfillmentLocations.map((availableLocation) => (
                              <option key={availableLocation.id} value={availableLocation.id}>
                                {[availableLocation.storeName, availableLocation.name, availableLocation.code].filter(Boolean).join(" - ")}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Priority</span>
                          <input min={1} onChange={(event) => updateFulfillmentLocation(location.inventoryLocationId, { routingPriority: Math.max(1, Number(event.target.value) || 1) })} type="number" value={location.routingPriority} />
                        </label>
                        <label className={styles.fulfillmentCheck}><input checked={location.supportsDelivery} onChange={(event) => updateFulfillmentLocation(location.inventoryLocationId, { supportsDelivery: event.target.checked })} type="checkbox" /><Truck size={16} />Delivery</label>
                        <label className={styles.fulfillmentCheck}><input checked={location.supportsPickup} onChange={(event) => updateFulfillmentLocation(location.inventoryLocationId, { supportsPickup: event.target.checked })} type="checkbox" /><Store size={16} />Pickup</label>
                        <button aria-label="Remove fulfilment location" onClick={() => setFulfillmentLocations((current) => current.filter((entry) => entry.inventoryLocationId !== location.inventoryLocationId))} title="Remove fulfilment location" type="button"><Trash2 size={17} /></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.fulfillmentFallback}>The storefront currently uses its own default sales location.</div>
                )}
              </section>
              <button className={styles.saveButton} disabled={busyKey === "settings"} type="submit">{busyKey === "settings" ? <LoaderCircle className={styles.spin} size={18} /> : <Check size={18} />}Save storefront</button>
            </form>
          </section>
        ) : null}
      </div>

      {selectedOrder ? (
        <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedOrderId(null); }} role="presentation">
          <section aria-label={`Order ${selectedOrder.orderNo}`} aria-modal="true" className={styles.orderDialog} role="dialog">
            <header><div><span>Customer order</span><h2>{selectedOrder.orderNo}</h2></div><button aria-label="Close order" onClick={() => setSelectedOrderId(null)} title="Close" type="button"><X size={21} /></button></header>
            <div className={styles.orderSummary}>
              <div><small>Status</small><strong>{formatStatus(selectedOrder.status)}</strong></div>
              <div><small>Payment</small><strong>{formatStatus(selectedOrder.paymentStatus)}</strong></div>
              <div><small>Order total</small><strong>{money(selectedOrder.currencyCode, selectedOrder.totalAmount)}</strong></div>
              <div><small>Balance</small><strong>{money(selectedOrder.currencyCode, selectedOrder.balanceAmount)}</strong></div>
            </div>
            <div className={styles.orderDialogBody}>
              <section>
                {selectedOrder.status === "PLACED" ? (
                  <div className={styles.acceptanceNotice}><BellRing size={18} /><span><strong>{selectedOrder.orderType === "LAYAWAY" && selectedOrder.paidAmount + 0.005 >= selectedOrder.minimumDepositAmount ? "Layaway deposit received" : selectedOrder.paymentTiming === "PREPAY" && selectedOrder.paymentStatus !== "PAID" ? "Awaiting payment" : "Awaiting acceptance"}</strong><small>{selectedOrder.orderType === "LAYAWAY" && selectedOrder.paidAmount + 0.005 >= selectedOrder.minimumDepositAmount ? "The minimum deposit is satisfied. Staff may accept the Layaway; full-payment fulfilment rules still apply." : selectedOrder.paymentTiming === "PREPAY" && selectedOrder.paymentStatus !== "PAID" ? "Confirm the required online payment before accepting this order." : "This order is not available in the POS fulfilment lane until staff accepts it."}</small></span></div>
                ) : null}
                <h3>Items</h3>
                <div className={styles.lineItems}>{selectedOrder.lines.map((line) => <div key={line.id}><span><strong>{line.productName}</strong><small>{line.variant || line.productCode}</small></span><span>{line.quantity} x {money(selectedOrder.currencyCode, line.unitPrice)}</span><strong>{money(selectedOrder.currencyCode, line.lineTotal)}</strong></div>)}</div>
              </section>
              <aside>
                <h3>Delivery</h3>
                <p><strong>{selectedOrder.recipientName}</strong><br />{selectedOrder.deliveryPhone}<br />{selectedOrder.fulfilmentMethod === "DELIVERY" ? selectedOrder.deliveryAddress : "Store pickup"}</p>
                {selectedOrder.deliveryNote ? <p><small>Customer note</small><br />{selectedOrder.deliveryNote}</p> : null}
                {selectedOrder.fulfillment ? <><h3>Fulfilment location</h3><p><strong>{selectedOrder.fulfillment.storeName}</strong><br />{selectedOrder.fulfillment.inventoryLocationName ?? "Store sales location"}<br /><small>{formatStatus(selectedOrder.fulfillment.status)}</small></p></> : null}
                <h3>Customer</h3>
                <p>{selectedOrder.customer.fullName}<br />{selectedOrder.customer.phone ?? ""}<br />{selectedOrder.customer.email ?? ""}</p>
                {selectedOrder.refundRequests.length > 0 ? (
                  <div className={styles.refundPanel}>
                    <h3>Refund request</h3>
                    {selectedOrder.refundRequests.map((refund) => (
                      <div key={refund.id}>
                        <span className={`${styles.pill} ${toneForStatus("REFUND_REQUESTED")}`}>{formatStatus(refund.status)}</span>
                        <strong>{money(selectedOrder.currencyCode, refund.amount)}</strong>
                        <p>{formatStatus(refund.reason)}</p>
                        {refund.details ? <small>{refund.details}</small> : null}
                        <small>Requested {new Date(refund.requestedAt).toLocaleString()}</small>
                      </div>
                    ))}
                    <small>Complete any approved refund through the governed payment or POS reversal workflow.</small>
                  </div>
                ) : null}
              </aside>
            </div>
            <footer>
              <div><span className={`${styles.pill} ${toneForStatus(selectedOrder.status)}`}>{formatStatus(selectedOrder.status)}</span><small>{new Date(selectedOrder.placedAt).toLocaleString()}</small></div>
              <div className={styles.statusActions}>{(nextStatuses[selectedOrder.status] ?? []).map((status) => {
                const paymentBlocksAcceptance = status === "CONFIRMED" && selectedOrder.paymentTiming === "PREPAY" && selectedOrder.paymentStatus !== "PAID";
                return <button className={status === "CANCELLED" ? styles.cancelAction : undefined} disabled={busyKey === `order:${selectedOrder.id}` || paymentBlocksAcceptance} key={status} onClick={() => void updateOrderStatus(selectedOrder, status)} title={paymentBlocksAcceptance ? "Online payment must be confirmed first" : undefined} type="button">{status === "CONFIRMED" ? "Accept order" : formatStatus(status)}</button>;
              })}</div>
            </footer>
          </section>
        </div>
      ) : null}

      {selectedProduct ? (
        <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedProduct(null); }} role="presentation">
          <section aria-label={`Ecommerce details for ${selectedProduct.name}`} aria-modal="true" className={styles.productDialog} role="dialog">
            <header><div><span>Public product page</span><h2>{selectedProduct.name}</h2><small>{selectedProduct.code}</small></div><button aria-label="Close product details" onClick={() => setSelectedProduct(null)} title="Close" type="button"><X size={21} /></button></header>
            <div className={styles.productDialogBody}>
              <label className={styles.richTextField}>
                <span>Storefront description</span>
                <small>Format benefits and details with headings, bold, italics, links, bullets, or numbered lists.</small>
                <ProductDescriptionEditor
                  onChange={(value) => setSelectedProduct((current) => current ? { ...current, ecommerceDescription: value } : current)}
                  value={selectedProduct.ecommerceDescription ?? ""}
                />
              </label>
              <div className={styles.formGrid}>
                <label><span>Comparison price</span><input min="0" onChange={(event) => setSelectedProduct((current) => current ? { ...current, ecommerceCompareAtPrice: event.target.value ? Number(event.target.value) : null } : current)} placeholder="Original price before markdown" step="0.01" type="number" value={selectedProduct.ecommerceCompareAtPrice ?? ""} /></label>
                <label><span>Gallery images</span><small>Up to six additional product views.</small><input accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void perform("product-upload", async () => { const uploaded = await uploadImage(file); setSelectedProduct((current) => current ? { ...current, ecommerceGalleryImageUrls: [...current.ecommerceGalleryImageUrls, uploaded.url].slice(0, 6) } : current); return uploaded; }); }} type="file" /></label>
              </div>
              <section className={styles.galleryEditor}>
                {selectedProduct.ecommerceGalleryImageUrls.map((imageUrl) => <div key={imageUrl}><img alt="Product gallery preview" src={imageUrl} /><button aria-label="Remove gallery image" onClick={() => setSelectedProduct((current) => current ? { ...current, ecommerceGalleryImageUrls: current.ecommerceGalleryImageUrls.filter((entry) => entry !== imageUrl) } : current)} title="Remove" type="button"><X size={16} /></button></div>)}
                {selectedProduct.ecommerceGalleryImageUrls.length === 0 ? <small>No additional gallery images.</small> : null}
              </section>
              <section className={styles.specificationEditor}>
                <div><span>Specifications</span><button onClick={() => setSelectedProduct((current) => current ? { ...current, ecommerceSpecifications: [...current.ecommerceSpecifications, { name: "", value: "" }] } : current)} type="button">Add specification</button></div>
                {selectedProduct.ecommerceSpecifications.map((specification, index) => (
                  <div key={index}>
                    <input aria-label={`Specification ${index + 1} name`} onChange={(event) => setSelectedProduct((current) => current ? { ...current, ecommerceSpecifications: current.ecommerceSpecifications.map((entry, entryIndex) => entryIndex === index ? { ...entry, name: event.target.value } : entry) } : current)} placeholder="Name, e.g. Storage" value={specification.name} />
                    <input aria-label={`Specification ${index + 1} value`} onChange={(event) => setSelectedProduct((current) => current ? { ...current, ecommerceSpecifications: current.ecommerceSpecifications.map((entry, entryIndex) => entryIndex === index ? { ...entry, value: event.target.value } : entry) } : current)} placeholder="Value, e.g. 128 GB" value={specification.value} />
                    <button aria-label={`Remove specification ${index + 1}`} onClick={() => setSelectedProduct((current) => current ? { ...current, ecommerceSpecifications: current.ecommerceSpecifications.filter((_, entryIndex) => entryIndex !== index) } : current)} title="Remove" type="button"><X size={17} /></button>
                  </div>
                ))}
              </section>
            </div>
            <footer><button onClick={() => setSelectedProduct(null)} type="button">Cancel</button><button className={styles.saveButton} disabled={busyKey === `product:${selectedProduct.id}`} onClick={() => { const product = selectedProduct; void updateProduct(product, { ecommerceDescription: product.ecommerceDescription, ecommerceCompareAtPrice: product.ecommerceCompareAtPrice, ecommerceSpecifications: product.ecommerceSpecifications, ecommerceGalleryImageUrls: product.ecommerceGalleryImageUrls }).then(() => setSelectedProduct(null)); }} type="button">{busyKey === `product:${selectedProduct.id}` ? <LoaderCircle className={styles.spin} size={18} /> : <Check size={18} />}Save product details</button></footer>
          </section>
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <EnterpriseShell
      activeSection="online-store"
      description="Publish products, process customer orders, and manage the public storefront without changing the staff POS."
      eyebrow="Online Store"
      heading="Ecommerce"
    >
      {content}
    </EnterpriseShell>
  );
}
