"use client";

import Image from "next/image";
import Script from "next/script";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Boxes,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Cloud,
  CloudOff,
  Database,
  DatabaseZap,
  FileCheck2,
  Factory,
  Fuel,
  Globe2,
  HeartHandshake,
  KeyRound,
  Laptop,
  LockKeyhole,
  MailCheck,
  MonitorSmartphone,
  PackageCheck,
  RefreshCcw,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Store,
  Users,
  Warehouse,
  Zap
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import styles from "./signup.module.css";

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void }
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

type SignupStage = "FORM" | "VERIFY" | "STATUS";

type TrialStatus = {
  status: string;
  requestNo: string;
  companyName: string;
  workspaceUrl: string | null;
  onlineStoreUrl: string | null;
  storefrontUrl: string | null;
  trialStartsAt: string | null;
  trialExpiresAt: string | null;
  message: string;
};

type FormState = {
  contactName: string;
  companyName: string;
  email: string;
  phone: string;
  countryCode: string;
  city: string;
  businessType: string;
  branchCount: string;
  employeeCountRange: string;
  preferredSlug: string;
  marketingConsent: boolean;
  termsAccepted: boolean;
  website: string;
};

const initialForm: FormState = {
  contactName: "",
  companyName: "",
  email: "",
  phone: "+233 ",
  countryCode: "GH",
  city: "",
  businessType: "",
  branchCount: "1",
  employeeCountRange: "",
  preferredSlug: "",
  marketingConsent: false,
  termsAccepted: false,
  website: ""
};

const featureGroups = [
  {
    icon: ReceiptText,
    title: "Sales, POS & customer accounts",
    copy: "Fast checkout, shifts, returns, held sales, layaway, quotations, sales orders, customer credit and payment allocation."
  },
  {
    icon: Boxes,
    title: "Inventory & product control",
    copy: "Products, variants, UOMs, barcodes, serials, batches, expiry, safety stock, counts, pricing and stock by location."
  },
  {
    icon: PackageCheck,
    title: "Purchasing & suppliers",
    copy: "Purchase orders, predictive review, goods receipts, supplier accounts, returns, claims and stock confirmation."
  },
  {
    icon: CircleDollarSign,
    title: "Finance & accounting",
    copy: "General ledger, AR/AP, cashbook, budgets, tax, bank reconciliation, fixed assets, multi-currency and financial statements."
  },
  {
    icon: Users,
    title: "HR, payroll & people operations",
    copy: "Employees, payroll runs, payslips, statutory filings, attendance, leave, benefits, loans, claims, travel, exits and visitors."
  },
  {
    icon: ShoppingBag,
    title: "Ecommerce & fulfilment",
    copy: "Branded storefront, customer accounts, pickup, delivery, payments, layaway, reservations and governed multi-branch fulfilment."
  },
  {
    icon: Warehouse,
    title: "Branches & warehouses",
    copy: "Store topology, inventory locations, internal requests, transfers, in-transit control and branch-level availability."
  },
  {
    icon: Fuel,
    title: "Fuel operations",
    copy: "Stations, tanks, pumps, nozzles, dips, meter readings, deliveries, sales and daily reconciliation."
  },
  {
    icon: BarChart3,
    title: "Reports & operational insight",
    copy: "Live HQ dashboards, transaction drill-down, inventory movement, payroll reports, financial statements and exceptions."
  },
  {
    icon: ShieldCheck,
    title: "Security & audit",
    copy: "Role-based permissions, MFA, password policy, session control, audit trails, security logs and operational monitoring."
  },
  {
    icon: Laptop,
    title: "Offline-first Store Desktop",
    copy: "Keep selling and managing stock locally during an outage, then synchronize governed events when connectivity returns."
  },
  {
    icon: DatabaseZap,
    title: "Sync, integrations & APIs",
    copy: "Idempotent branch synchronization, queue recovery, health monitoring and protected integration endpoints."
  },
  {
    icon: Factory,
    title: "Manufacturing",
    copy: "Production planning, bills of materials, work orders, material issues, finished output, quality checks and production costing.",
    featured: true
  }
];

function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!siteKey || !target.current) return;
    let widgetId = "";
    const render = () => {
      if (!target.current || !window.turnstile || widgetId) return;
      widgetId = window.turnstile.render(target.current, {
        sitekey: siteKey,
        callback: onToken,
        "expired-callback": () => onToken("")
      });
    };
    render();
    const timer = window.setInterval(render, 250);
    return () => {
      window.clearInterval(timer);
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, onToken]);
  return siteKey ? <div ref={target} className={styles.turnstile} /> : null;
}

function statusLabel(status: string) {
  if (status === "ACTIVE") return "Trial ready";
  if (status === "FAILED") return "Needs attention";
  if (status === "AWAITING_PROVISIONER") return "Verified";
  return "Preparing workspace";
}

type TrialSignupPageProps = {
  turnstileSiteKey: string;
  whatsappNumber: string;
  whatsappMessage: string;
};

function WhatsAppLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479s1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.693.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.981.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26C2.168 6.442 6.613 2.01 12.065 2.01c2.64 0 5.122 1.029 6.988 2.896a9.825 9.825 0 0 1 2.893 6.99c-.002 5.45-4.437 9.884-9.884 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.304-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"
      />
    </svg>
  );
}

export function TrialSignupPage({
  turnstileSiteKey,
  whatsappNumber,
  whatsappMessage
}: TrialSignupPageProps) {
  const [stage, setStage] = useState<SignupStage>("FORM");
  const [form, setForm] = useState<FormState>(initialForm);
  const [requestId, setRequestId] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [deliveryHint, setDeliveryHint] = useState("");
  const [statusToken, setStatusToken] = useState("");
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const whatsappHref = useMemo(() => {
    const digits = whatsappNumber.replace(/\D/g, "");
    if (!/^\d{8,15}$/.test(digits)) return "";
    return `https://wa.me/${digits}?text=${encodeURIComponent(whatsappMessage)}`;
  }, [whatsappMessage, whatsappNumber]);

  const preferredSlugPreview = useMemo(
    () =>
      (form.preferredSlug || form.companyName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 50),
    [form.companyName, form.preferredSlug]
  );

  useEffect(() => {
    const savedToken = window.sessionStorage.getItem("flash-erp-trial-status-token");
    if (!savedToken) return;
    setStatusToken(savedToken);
    setStage("STATUS");
  }, []);

  useEffect(() => {
    if (stage !== "STATUS" || !statusToken) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loadStatus = async () => {
      const response = await fetch("/api/trials/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: statusToken }),
        cache: "no-store"
      });
      const body = (await response.json().catch(() => null)) as (TrialStatus & { message?: string }) | null;
      if (cancelled) return;
      if (!response.ok || !body) {
        setError(body?.message || "Unable to load the trial status.");
        return;
      }
      setTrialStatus(body);
      setError("");
      if (!["ACTIVE", "FAILED"].includes(body.status)) {
        timer = setTimeout(loadStatus, 5000);
      }
    };
    void loadStatus();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [stage, statusToken]);

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/trials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          branchCount: Number(form.branchCount),
          turnstileToken
        })
      });
      const body = (await response.json().catch(() => null)) as {
        requestId?: string;
        deliveryHint?: string;
        developmentCode?: string;
        message?: string;
      } | null;
      if (!response.ok || !body?.requestId) throw new Error(body?.message || "Unable to start the trial.");
      setRequestId(body.requestId);
      setDeliveryHint(body.deliveryHint || form.email);
      setVerificationCode(body.developmentCode || "");
      setMessage(body.message || "Verification code sent.");
      setStage("VERIFY");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to start the trial.");
    } finally {
      setBusy(false);
    }
  }

  async function verifySignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/trials/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId, code: verificationCode })
      });
      const body = (await response.json().catch(() => null)) as
        | (TrialStatus & { token?: string; message?: string })
        | null;
      if (!response.ok || !body?.token) throw new Error(body?.message || "Unable to verify the code.");
      setStatusToken(body.token);
      setTrialStatus(body);
      window.sessionStorage.setItem("flash-erp-trial-status-token", body.token);
      setStage("STATUS");
    } catch (verificationError) {
      setError(
        verificationError instanceof Error ? verificationError.message : "Unable to verify the code."
      );
    } finally {
      setBusy(false);
    }
  }

  function startAnotherRequest() {
    window.sessionStorage.removeItem("flash-erp-trial-status-token");
    setStage("FORM");
    setForm(initialForm);
    setRequestId("");
    setVerificationCode("");
    setStatusToken("");
    setTrialStatus(null);
    setError("");
    setMessage("");
  }

  return (
    <main className={styles.page}>
      {turnstileSiteKey ? (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      ) : null}

      <header className={styles.header}>
        <a href="#top" className={styles.brand} aria-label="Flash ERP home">
          <span className={styles.brandMark}><Zap size={22} strokeWidth={2.6} /></span>
          <span><strong>FLASH ERP</strong><small>by Flash Code Solutions</small></span>
        </a>
        <nav className={styles.nav} aria-label="Trial page navigation">
          <a href="#platform">Platform</a>
          <a href="#features">Features</a>
          <a href="#offline">Offline first</a>
          <a href="#trial" className={styles.navTrialAction}>14-day trial</a>
        </nav>
      </header>

      <section className={styles.hero} aria-labelledby="trial-hero-title">
        <div className={styles.heroMedia}>
          <Image
            src="/images/flash-erp-trial-hero.png"
            alt="A Ghanaian retail operations manager working in a connected shop and stockroom"
            fill
            priority
            sizes="(max-width: 760px) 100vw, 64vw"
            className={styles.heroImage}
          />
        </div>
        <div className={styles.heroMediaFade} />
        <div className={styles.heroPulse} aria-hidden="true">
          <svg viewBox="0 0 420 90" preserveAspectRatio="none">
            <path className={styles.pulseBlue} d="M2 52 C20 52 20 28 38 28 S56 74 74 74 S92 43 110 43 S128 56 146 56" />
            <path className={styles.pulseCyan} d="M146 56 C164 56 164 18 182 18 S200 67 218 67 S236 38 254 38 S272 53 290 53" />
            <path className={styles.pulseGreen} d="M290 53 C308 53 308 30 326 30 S344 69 362 69 S380 43 398 43 L418 43" />
          </svg>
        </div>
        <div id="top" className={styles.heroContent}>
          <p className={styles.eyebrow}><BadgeCheck size={18} /> One system for every part of the business</p>
          <h1 id="trial-hero-title">Flash ERP</h1>
          <p className={styles.heroLead}>
            Run HQ, every branch, payroll and your online business from one operational platform,
            even when a shop loses internet.
          </p>
          <div className={styles.heroActions}>
            <a href="#trial" className={styles.primaryAction}>Start your 14-day trial <ArrowRight size={19} /></a>
            <a href="#platform" className={styles.secondaryAction}>Explore the platform</a>
          </div>
          <div className={styles.heroFacts} aria-label="Trial highlights">
            <span><Check size={17} /> Isolated trial workspace</span>
            <span><Check size={17} /> Secure email activation</span>
            <span><Check size={17} /> No card on signup</span>
          </div>
        </div>
      </section>

      <section className={styles.proofBand} aria-label="Flash ERP platform summary">
        <div><span className={styles.proofIcon}><MonitorSmartphone /></span><span><strong>4</strong><small>Connected work surfaces</small></span></div>
        <div><span className={styles.proofIcon}><CalendarDays /></span><span><strong>14 days</strong><small>Full trial period</small></span></div>
        <div><span className={styles.proofIcon}><Cloud /></span><span><strong>Offline first</strong><small>Store continuity built-in</small></span></div>
        <div><span className={styles.proofIcon}><Building2 /></span><span><strong>Branch aware</strong><small>Stock and responsibility</small></span></div>
      </section>

      <section id="platform" className={styles.platformSection}>
        <div className={styles.platformLayout}>
          <div className={styles.platformCopy}>
            <div className={styles.sectionIntro}>
              <p className={styles.sectionLabel}>One operating picture</p>
              <h2>Cloud oversight. Store-level control.</h2>
              <p>
                Flash ERP joins management, staff, customers and branch devices without flattening the
                controls each part of the business needs.
              </p>
            </div>
            <div className={styles.surfaceList}>
              <article><Building2 /><div><strong>HQ Enterprise</strong><span>Finance, people, purchasing, stock, security and cross-branch reporting.</span></div></article>
              <article><Store /><div><strong>Online Store</strong><span>Browser-based store operations, ecommerce handoff and daily controls.</span></div></article>
              <article><Laptop /><div><strong>Store Desktop</strong><span>Offline-first checkout and inventory with governed synchronization.</span></div></article>
              <article><Globe2 /><div><strong>Ecommerce storefront</strong><span>Customer accounts, catalog, pickup, delivery and order visibility.</span></div></article>
            </div>
          </div>
          <div className={styles.productPreview} aria-label="Illustrative Flash ERP dashboard preview">
            <div className={styles.previewTopbar}>
              <span className={styles.previewLogo}><Zap size={15} /></span>
              <strong>Enterprise overview</strong>
              <span className={styles.previewLive}><span /> All branches synced</span>
            </div>
            <div className={styles.previewBody}>
              <aside>
                <span className={styles.activeNav}><BarChart3 /> Overview</span>
                <span><Boxes /> Inventory</span>
                <span data-testid="enterprise-preview-manufacturing"><Factory aria-hidden="true" /> Manufacturing</span>
                <span><CircleDollarSign /> Finance</span>
                <span><Users /> People</span>
                <span><PackageCheck /> Purchases</span>
                <span><Fuel /> Fuel</span>
                <span><ShoppingBag /> Ecommerce</span>
              </aside>
              <div className={styles.previewContent}>
                <div className={styles.previewHeading}><div><small>Tuesday operations</small><strong>Good morning, Ama</strong></div><span>Last sync 24 sec ago</span></div>
                <div className={styles.metricRow}>
                  <div><small>Net sales</small><strong>GHS 84,920</strong><span>Across 4 branches</span></div>
                  <div><small>Web orders</small><strong>128</strong><span>12 awaiting action</span></div>
                  <div><small>Payroll</small><strong>Ready</strong><span>August run reviewed</span></div>
                </div>
                <div className={styles.previewLower}>
                  <div className={styles.chartPanel}><strong>Branch performance</strong><div className={styles.bars}><i /><i /><i /><i /><i /><i /><i /></div><small>Mon Tue Wed Thu Fri Sat Sun</small></div>
                  <div className={styles.activityPanel}><strong>Live operations</strong><span><Check /> East Legon synchronized</span><span><PackageCheck /> Transfer received at Osu</span><span><ReceiptText /> 32 sales posted</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className={styles.featuresSection}>
        <div className={styles.sectionIntro}>
          <p className={styles.sectionLabel}>Complete ERP coverage</p>
          <h2>Move the whole business forward</h2>
          <p>Each module works inside the same governed company, store, user and reporting context.</p>
        </div>
        <div className={styles.featureGrid}>
          {featureGroups.map(({ icon: Icon, title, copy, featured }) => (
            <article
              key={title}
              className={`${styles.featureItem} ${featured ? styles.featureEmphasis : ""}`}
            >
              <span className={styles.featureIcon}><Icon size={22} /></span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="offline" className={styles.offlineSection}>
        <div className={styles.offlineInner}>
          <div className={styles.offlineContent}>
            <p className={styles.sectionLabel}>Built for real connectivity</p>
            <h2>The shop keeps moving when the internet stops.</h2>
            <p>
              Store Desktop keeps approved work available locally and reconciles it with Enterprise when
              connectivity returns.
            </p>
          </div>
          <ol className={styles.continuityFlow} aria-label="Offline continuity flow">
            <li><span><CloudOff /></span><div><strong>Keep selling</strong><small>Approved store operations remain available.</small></div></li>
            <li><span><DatabaseZap /></span><div><strong>Queue safely</strong><small>Every local event is retained in order.</small></div></li>
            <li><span><Cloud /></span><div><strong>Resume sync</strong><small>Delivery restarts when the connection returns.</small></div></li>
            <li><span><Database /></span><div><strong>Reconcile at HQ</strong><small>Enterprise receives a complete audit trail.</small></div></li>
          </ol>
        </div>
      </section>

      <section className={styles.trialJourney}>
        <div className={styles.sectionIntro}>
          <p className={styles.sectionLabel}>Your trial journey</p>
          <h2>From signup to a working business in four steps</h2>
        </div>
        <ol>
          <li><span className={styles.journeyIcon}><MailCheck /></span><div><span className={styles.journeyNumber}>01</span><strong>Verify your email</strong><p>We confirm the business owner before any environment is created.</p></div><ChevronRight className={styles.journeyArrow} /></li>
          <li><span className={styles.journeyIcon}><KeyRound /></span><div><span className={styles.journeyNumber}>02</span><strong>Activate securely</strong><p>One-time links let you set credentials without passwords travelling by email.</p></div><ChevronRight className={styles.journeyArrow} /></li>
          <li><span className={styles.journeyIcon}><Building2 /></span><div><span className={styles.journeyNumber}>03</span><strong>Enter your workspace</strong><p>Open HQ Enterprise, Online Store and your ecommerce storefront.</p></div><ChevronRight className={styles.journeyArrow} /></li>
          <li><span className={styles.journeyIcon}><HeartHandshake /></span><div><span className={styles.journeyNumber}>04</span><strong>Test with support</strong><p>Use the 14 days to validate the workflows that matter to your team.</p></div></li>
        </ol>
      </section>

      <section id="trial" className={styles.trialSection}>
        <div className={styles.trialCopy}>
          <p className={styles.sectionLabel}>Start your 14-day trial</p>
          <h2>See your operation in one place.</h2>
          <p>
            Tell us enough to prepare the right isolated workspace. Your password is created only
            through the secure activation link sent after provisioning.
          </p>
          <ul>
            <li><Check /> HQ Enterprise owner access</li>
            <li><Check /> Online Store operator access</li>
            <li><Check /> Public ecommerce storefront</li>
            <li><Check /> Store Desktop trial access</li>
          </ul>
          <div className={styles.securityNote}><LockKeyhole /><div><strong>Your business data stays separated.</strong><span>Trial users are never added to another customer&apos;s operating company.</span></div></div>
        </div>

        <div className={styles.formShell}>
          <div className={styles.formHeader}>
            <span>{stage === "FORM" ? "01" : stage === "VERIFY" ? "02" : "03"} / 03</span>
            <div><i className={stage !== "FORM" ? styles.complete : styles.current} /><i className={stage === "STATUS" ? styles.complete : stage === "VERIFY" ? styles.current : ""} /><i className={stage === "STATUS" ? styles.current : ""} /></div>
          </div>

          {stage === "FORM" ? (
            <form onSubmit={submitSignup} className={styles.signupForm}>
              <div className={styles.formTitle}><h3>Create your trial workspace</h3><p>Use your work details so we can prepare the correct setup.</p></div>
              <div className={styles.fieldGrid}>
                <label><span>Your full name</span><input required autoComplete="name" value={form.contactName} onChange={(event) => updateField("contactName", event.target.value)} placeholder="Ama Mensah" /></label>
                <label><span>Business name</span><input required autoComplete="organization" value={form.companyName} onChange={(event) => updateField("companyName", event.target.value)} placeholder="Mensah Retail Ltd" /></label>
                <label><span>Work email</span><input required type="email" autoComplete="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} placeholder="ama@company.com" /></label>
                <label><span>Phone number</span><input required type="tel" autoComplete="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} /></label>
                <label><span>Business type</span><select required value={form.businessType} onChange={(event) => updateField("businessType", event.target.value)}><option value="">Select one</option><option value="RETAIL">Retail</option><option value="SUPERMARKET_GROCERY">Supermarket / grocery</option><option value="WHOLESALE_DISTRIBUTION">Wholesale / distribution</option><option value="PHARMACY_HEALTH">Pharmacy / health retail</option><option value="FASHION">Fashion</option><option value="FUEL_STATION">Fuel station</option><option value="HOSPITALITY">Hospitality</option><option value="OTHER">Other</option></select></label>
                <label><span>Team size</span><select required value={form.employeeCountRange} onChange={(event) => updateField("employeeCountRange", event.target.value)}><option value="">Select one</option><option value="1_5">1-5 people</option><option value="6_20">6-20 people</option><option value="21_50">21-50 people</option><option value="51_100">51-100 people</option><option value="101_PLUS">101+ people</option></select></label>
                <label><span>Number of branches</span><input required type="number" min="1" max="100" value={form.branchCount} onChange={(event) => updateField("branchCount", event.target.value)} /></label>
                <label><span>City</span><input autoComplete="address-level2" value={form.city} onChange={(event) => updateField("city", event.target.value)} placeholder="Accra" /></label>
                <label className={styles.fullField}><span>Preferred storefront name <small>optional</small></span><div className={styles.slugField}><input value={form.preferredSlug} onChange={(event) => updateField("preferredSlug", event.target.value)} placeholder="mensah-retail" /><em>/shop/{preferredSlugPreview || "your-store"}</em></div></label>
                <label className={styles.honeypot} aria-hidden="true"><span>Website</span><input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => updateField("website", event.target.value)} /></label>
              </div>
              <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} />
              <label className={styles.checkbox}><input type="checkbox" checked={form.termsAccepted} onChange={(event) => updateField("termsAccepted", event.target.checked)} required /><span>I agree to the Flash ERP trial terms and privacy notice.</span></label>
              <label className={styles.checkbox}><input type="checkbox" checked={form.marketingConsent} onChange={(event) => updateField("marketingConsent", event.target.checked)} /><span>Send me relevant product updates and trial guidance.</span></label>
              {error ? <p className={styles.formError} role="alert">{error}</p> : null}
              <button type="submit" className={styles.submitButton} disabled={busy || (Boolean(turnstileSiteKey) && !turnstileToken)}>{busy ? "Starting your trial..." : <>Continue to email verification <ArrowRight size={18} /></>}</button>
              <p className={styles.formFootnote}>Already have access? <a href="/sign-in">Sign in to Flash ERP</a></p>
            </form>
          ) : null}

          {stage === "VERIFY" ? (
            <form onSubmit={verifySignup} className={styles.verifyForm}>
              <span className={styles.stageIcon}><MailCheck /></span>
              <h3>Verify your work email</h3>
              <p>{message} We sent it to <strong>{deliveryHint}</strong>.</p>
              <label><span>6-digit code</span><input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" autoFocus /></label>
              {error ? <p className={styles.formError} role="alert">{error}</p> : null}
              <button type="submit" className={styles.submitButton} disabled={busy || verificationCode.length !== 6}>{busy ? "Verifying..." : <>Verify and prepare workspace <ArrowRight size={18} /></>}</button>
              <button type="button" className={styles.textButton} onClick={() => { setStage("FORM"); setError(""); }}>Change signup details</button>
            </form>
          ) : null}

          {stage === "STATUS" ? (
            <div className={styles.statusPanel}>
              <span className={styles.stageIcon}>{trialStatus?.status === "ACTIVE" ? <BadgeCheck /> : trialStatus?.status === "FAILED" ? <FileCheck2 /> : <RefreshCcw className={styles.spinning} />}</span>
              <p className={styles.statusBadge}>{trialStatus ? statusLabel(trialStatus.status) : "Loading status"}</p>
              <h3>{trialStatus?.companyName || "Your Flash ERP trial"}</h3>
              <p>{trialStatus?.message || "Checking the provisioning service..."}</p>
              {trialStatus?.requestNo ? <small>Reference: {trialStatus.requestNo}</small> : null}
              {trialStatus?.status === "ACTIVE" ? (
                <div className={styles.workspaceLinks}>
                  {trialStatus.workspaceUrl ? <a href={trialStatus.workspaceUrl}>Open HQ Enterprise <ArrowRight /></a> : null}
                  {trialStatus.onlineStoreUrl ? <a href={trialStatus.onlineStoreUrl}>Open Online Store <ArrowRight /></a> : null}
                  {trialStatus.storefrontUrl ? <a href={trialStatus.storefrontUrl}>View ecommerce storefront <ArrowRight /></a> : null}
                </div>
              ) : null}
              {trialStatus?.trialExpiresAt ? <p className={styles.expiry}>Trial access ends {new Intl.DateTimeFormat("en-GH", { dateStyle: "long" }).format(new Date(trialStatus.trialExpiresAt))}.</p> : null}
              {error ? <p className={styles.formError} role="alert">{error}</p> : null}
              {trialStatus?.status === "FAILED" ? <a className={styles.submitButton} href="mailto:info@flashcodesolutions.com.gh?subject=Flash%20ERP%20trial%20provisioning">Contact trial support <ArrowRight size={18} /></a> : null}
              <button type="button" className={styles.textButton} onClick={startAnotherRequest}>Start another request</button>
            </div>
          ) : null}
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.brand}><span className={styles.brandMark}><Zap size={22} strokeWidth={2.6} /></span><span><strong>FLASH ERP</strong><small>by Flash Code Solutions</small></span></div>
        <p>&copy; 2026 Flash Code Solutions. All rights reserved.</p>
        <div><a href="https://flashcodesolutions.com.gh">Flash Code Solutions</a><a href="mailto:info@flashcodesolutions.com.gh">Contact</a><a href="/sign-in">Sign in</a></div>
      </footer>

      {whatsappHref ? (
        <a
          className={styles.whatsappButton}
          data-testid="trial-whatsapp-link"
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with Flash ERP on WhatsApp"
          title="Chat on WhatsApp"
        >
          <WhatsAppLogo />
        </a>
      ) : null}
    </main>
  );
}
