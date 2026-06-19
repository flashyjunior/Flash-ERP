"use client";

import {
  Activity,
  BarChart3,
  Bell,
  ChevronDown,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackageCheck,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  ShoppingCart,
  Store,
  UserCircle2,
  X
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from "react";

import {
  enterpriseMasterMenuItems,
  enterpriseInventoryMenuItems,
  enterprisePurchasesMenuItems,
  enterpriseSecurityMenuItems,
  enterpriseSettingsMenuItems
} from "@/lib/navigation/enterprise-navigation";
import {
  buildAccountInitials,
  formatRelativeTimeLabel,
  resolveAccountAvatarTheme
} from "@/lib/ui/account-avatar";
import { cn } from "@/lib/utils/cn";

type EnterpriseShellProps = {
  activeSection: string;
  eyebrow?: string;
  heading: string;
  description?: string;
  children: ReactNode;
};

type NavigationItem = {
  key: string;
  label: string;
  icon: typeof Store;
  href?: string;
  hiddenInSidebar?: boolean;
  children?: Array<{
    label: string;
    href?: string;
  }>;
};

type EnterpriseSessionSnapshot = {
  displayName: string;
  loginId: string;
  accountStatus: string;
  homeStoreCode: string | null;
  homeStoreName: string | null;
  homeStoreMode: string | null;
  isOnlineStoreUser: boolean;
  roleCodes: string[];
  permissionCount: number;
  lastActiveAt: string;
  lastLoginAt: string | null;
  expiresAt: string;
};

type EnterpriseAlertSnapshot = {
  unreadCount: number;
  refreshedAt: string;
  alerts: Array<{
    id: string;
    title: string;
    message: string;
    tone: "critical" | "warning" | "info" | "success";
    href: string;
    createdAt: string;
  }>;
};

type EnterpriseSearchSnapshot = {
  query: string;
  results: Array<{
    id: string;
    entity: string;
    title: string;
    subtitle: string;
    href: string;
    badge: string | null;
  }>;
  refreshedAt: string;
};

type SessionWarningState = {
  remainingSeconds: number;
  totalSeconds: number;
};

const navigation: NavigationItem[] = [
  {
    key: "overview",
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/"
  },
  {
    key: "online-store",
    label: "Online Store",
    icon: Store,
    href: "/online-store"
  },
  {
    key: "profile",
    label: "Profile",
    icon: UserCircle2,
    href: "/profile",
    hiddenInSidebar: true
  },
  {
    key: "master",
    label: "Master",
    icon: SlidersHorizontal,
    href: "/master/customers",
    children: enterpriseMasterMenuItems.map((item) => ({
      label: item.label,
      href: item.href
    }))
  },
  {
    key: "inventory",
    label: "Inventory",
    icon: Package,
    href: "/inventory/products",
    children: enterpriseInventoryMenuItems.map((item) => ({
      label: item.label,
      href: item.href
    }))
  },
  {
    key: "purchases",
    label: "Purchases",
    icon: PackageCheck,
    href: "/purchases/purchase-orders",
    children: enterprisePurchasesMenuItems.map((item) => ({
      label: item.label,
      href: item.href
    }))
  },
  {
    key: "pos",
    label: "POS",
    icon: ShoppingCart,
    href: "/pos"
  },
  {
    key: "sync",
    label: "Sync",
    icon: RefreshCcw,
    href: "/sync"
  },
  {
    key: "operations",
    label: "Operations",
    icon: Activity,
    href: "/operations"
  },
  {
    key: "reports",
    label: "Reports",
    icon: BarChart3,
    href: "/reports"
  },
  {
    key: "finance",
    label: "Finance",
    icon: Landmark,
    href: "/finance"
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings2,
    href: "/settings/company",
    children: enterpriseSettingsMenuItems.map((item) => ({
      label: item.label,
      href: item.href
    }))
  },
  {
    key: "security",
    label: "Security",
    icon: ShieldCheck,
    href: "/security/users",
    children: enterpriseSecurityMenuItems.map((item) => ({
      label: item.label,
      href: item.href
    }))
  }
];

function matchesHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getSessionWarningLeadMs(remainingMs: number) {
  if (remainingMs <= 0) {
    return 0;
  }

  if (remainingMs <= 90_000) {
    return Math.max(10_000, Math.floor(remainingMs * 0.25));
  }

  if (remainingMs <= 6 * 60_000) {
    return 60_000;
  }

  return 5 * 60_000;
}

function getSessionWarningSeconds(expiresAt: number) {
  const remainingMs = Math.max(0, expiresAt - Date.now());

  return Math.max(1, Math.ceil(Math.min(60_000, remainingMs) / 1000));
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const paddedSeconds = String(seconds % 60).padStart(2, "0");

  return `${minutes}:${paddedSeconds}`;
}

export function EnterpriseShell({
  activeSection,
  eyebrow,
  heading,
  description,
  children
}: EnterpriseShellProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isQuickProfileDrawerOpen, setIsQuickProfileDrawerOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<EnterpriseSearchSnapshot["results"]>([]);
  const [sessionSnapshot, setSessionSnapshot] = useState<EnterpriseSessionSnapshot | null>(null);
  const [alertSnapshot, setAlertSnapshot] = useState<EnterpriseAlertSnapshot | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [sessionWarning, setSessionWarning] = useState<SessionWarningState | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      navigation
        .filter((item) => item.children?.length)
        .map((item) => [item.key, item.key === activeSection])
    )
  );
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const alertsRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLFormElement | null>(null);
  const sessionLogoutStartedRef = useRef(false);
  const sessionWarningRef = useRef<SessionWarningState | null>(null);
  const lastSessionActivityRefreshAtRef = useRef(0);
  const sessionActivityRefreshInFlightRef = useRef(false);
  const pathname = usePathname();
  const router = useRouter();
  const isOnlineStoreSession = Boolean(sessionSnapshot?.isOnlineStoreUser);
  const sidebarNavigation = useMemo(() => {
    const visibleNavigation = navigation.filter((item) => !item.hiddenInSidebar);

    if (isOnlineStoreSession) {
      return visibleNavigation.filter((item) => item.key === "online-store");
    }

    return visibleNavigation.filter((item) => item.key !== "online-store");
  }, [isOnlineStoreSession]);
  const avatarSeed = sessionSnapshot?.loginId ?? sessionSnapshot?.displayName ?? "Flash ERP";
  const avatarTheme = resolveAccountAvatarTheme(avatarSeed);
  const accountInitials = buildAccountInitials(sessionSnapshot?.displayName ?? "Flash ERP");
  const roleLabel = sessionSnapshot
    ? `${sessionSnapshot.roleCodes.length} role${sessionSnapshot.roleCodes.length === 1 ? "" : "s"}`
    : "Session";
  const accountDisplayName = isSessionLoading
    ? "Loading account..."
    : sessionSnapshot?.displayName ?? "Enterprise session";
  const accountLoginId = isSessionLoading
    ? "Checking current session"
    : sessionSnapshot?.loginId ?? "Signed-in details unavailable";
  const lastActiveLabel = sessionSnapshot
    ? formatRelativeTimeLabel(sessionSnapshot.lastActiveAt)
    : "Not available";
  const lastActiveTimestamp = sessionSnapshot
    ? new Date(sessionSnapshot.lastActiveAt).toLocaleString()
    : "";
  const lastLoginLabel = sessionSnapshot?.lastLoginAt
    ? formatRelativeTimeLabel(sessionSnapshot.lastLoginAt)
    : "Not available";
  const lastLoginTimestamp = sessionSnapshot?.lastLoginAt
    ? new Date(sessionSnapshot.lastLoginAt).toLocaleString()
    : "";
  const sessionExpiryLabel = sessionSnapshot
    ? new Date(sessionSnapshot.expiresAt).toLocaleString()
    : "when the active policy allows";
  const alertCount = alertSnapshot?.unreadCount ?? 0;
  const sessionWarningProgress = sessionWarning
    ? Math.max(
        0,
        Math.min(100, (sessionWarning.remainingSeconds / sessionWarning.totalSeconds) * 100)
      )
    : 0;
  const normalizedSearchQuery = searchQuery.trim();
  const buildSignInReturnUrl = () => {
    if (typeof window === "undefined") {
      return "/sign-in?next=%2F";
    }

    const returnPath = `${window.location.pathname}${window.location.search}`;
    const safeReturnPath =
      returnPath && returnPath !== "/sign-in" && !returnPath.startsWith("/sign-in?")
        ? returnPath
        : "/";

    return `/sign-in?next=${encodeURIComponent(safeReturnPath)}`;
  };
  const signOutExpiredSession = async () => {
    if (sessionLogoutStartedRef.current) {
      return;
    }

    sessionLogoutStartedRef.current = true;

    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        cache: "no-store",
        redirect: "manual"
      });
    } finally {
      router.replace(buildSignInReturnUrl());
    }
  };
  const refreshSessionFromActivity = useCallback((force = false) => {
    const now = Date.now();

    if (
      sessionLogoutStartedRef.current ||
      (!force &&
        sessionWarningRef.current === null &&
        now - lastSessionActivityRefreshAtRef.current < 30_000) ||
      sessionActivityRefreshInFlightRef.current
    ) {
      return;
    }

    lastSessionActivityRefreshAtRef.current = now;
    sessionActivityRefreshInFlightRef.current = true;
    setSessionWarning(null);
    window.dispatchEvent(new Event("flash-erp:session-refresh"));
  }, []);
  const handleSessionActivity = useCallback(() => {
    refreshSessionFromActivity(false);
  }, [refreshSessionFromActivity]);

  useEffect(() => {
    sessionWarningRef.current = sessionWarning;
  }, [sessionWarning]);

  useEffect(() => {
    setExpandedSections((current) =>
      Object.fromEntries(
        Object.keys(current).map((key) => [key, key === activeSection])
      ) as Record<string, boolean>
    );
  }, [activeSection]);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
    setIsQuickProfileDrawerOpen(false);
    setIsUserMenuOpen(false);
    setIsAlertsOpen(false);
    setIsSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    const query = searchQuery.trim();

    if (isOnlineStoreSession) {
      setSearchResults([]);
      setIsSearchLoading(false);
      return;
    }

    if (query.length < 2) {
      setSearchResults([]);
      setIsSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsSearchLoading(true);

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
          signal: controller.signal
        });

        if (!response.ok) {
          setSearchResults([]);
          return;
        }

        const payload = (await response.json()) as EnterpriseSearchSnapshot;
        setSearchResults(payload.results);
      } catch {
        if (!controller.signal.aborted) {
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchLoading(false);
        }
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [isOnlineStoreSession, searchQuery]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          signal: controller.signal
        });

        if (!response.ok) {
          setSessionSnapshot(null);

          if (response.status === 401) {
            router.replace(buildSignInReturnUrl());
          }

          return;
        }

        const payload = (await response.json()) as EnterpriseSessionSnapshot;
        lastSessionActivityRefreshAtRef.current = Date.now();
        setSessionSnapshot(payload);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setSessionSnapshot(null);
      } finally {
        if (!controller.signal.aborted) {
          setIsSessionLoading(false);
          sessionActivityRefreshInFlightRef.current = false;
        }
      }
    }

    void loadSession();

    function handleSessionRefresh() {
      setIsSessionLoading(true);
      void loadSession();
    }

    window.addEventListener("flash-erp:session-refresh", handleSessionRefresh);

    return () => {
      controller.abort();
      window.removeEventListener("flash-erp:session-refresh", handleSessionRefresh);
    };
  }, [router]);

  useEffect(() => {
    if (!sessionSnapshot?.expiresAt) {
      return undefined;
    }

    const expiresAt = new Date(sessionSnapshot.expiresAt).getTime();
    const delayMs = Math.max(0, expiresAt - Date.now() + 500);
    const timeout = window.setTimeout(() => {
      void signOutExpiredSession();
    }, delayMs);

    return () => window.clearTimeout(timeout);
  }, [router, sessionSnapshot?.expiresAt, pathname]);

  useEffect(() => {
    if (!sessionSnapshot?.expiresAt) {
      setSessionWarning(null);
      return undefined;
    }

    setSessionWarning(null);
    const expiresAt = new Date(sessionSnapshot.expiresAt).getTime();
    const remainingMs = Math.max(0, expiresAt - Date.now());
    const warningLeadMs = getSessionWarningLeadMs(remainingMs);
    const warningDelayMs = Math.max(0, remainingMs - warningLeadMs);
    const timeout = window.setTimeout(() => {
      const totalSeconds = getSessionWarningSeconds(expiresAt);

      setSessionWarning({
        remainingSeconds: totalSeconds,
        totalSeconds
      });
    }, warningDelayMs);

    return () => window.clearTimeout(timeout);
  }, [sessionSnapshot?.expiresAt]);

  useEffect(() => {
    if (sessionWarning === null) {
      return undefined;
    }

    if (sessionWarning.remainingSeconds <= 0) {
      void signOutExpiredSession();
      return undefined;
    }

    const interval = window.setInterval(() => {
      setSessionWarning((current) => {
        if (current === null) {
          return null;
        }

        if (current.remainingSeconds <= 1) {
          void signOutExpiredSession();
          return {
            ...current,
            remainingSeconds: 0
          };
        }

        return {
          ...current,
          remainingSeconds: current.remainingSeconds - 1
        };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [sessionWarning]);

  useEffect(() => {
    if (!sessionSnapshot?.expiresAt) {
      return undefined;
    }

    const events: Array<keyof WindowEventMap> = [
      "pointermove",
      "mousemove",
      "mousedown",
      "keydown",
      "wheel",
      "touchstart",
      "scroll"
    ];

    events.forEach((eventName) => {
      window.addEventListener(eventName, handleSessionActivity, { passive: true });
    });

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, handleSessionActivity);
      });
    };
  }, [handleSessionActivity, sessionSnapshot?.expiresAt]);

  useEffect(() => {
    if (isSessionLoading || isOnlineStoreSession) {
      setAlertSnapshot(null);
      return undefined;
    }

    const controller = new AbortController();

    async function loadAlerts() {
      try {
        const response = await fetch("/api/alerts", {
          cache: "no-store",
          signal: controller.signal
        });

        if (!response.ok) {
          setAlertSnapshot(null);
          return;
        }

        const payload = (await response.json()) as EnterpriseAlertSnapshot;
        setAlertSnapshot(payload);
      } catch {
        if (!controller.signal.aborted) {
          setAlertSnapshot(null);
        }
      }
    }

    void loadAlerts();
    const interval = window.setInterval(() => void loadAlerts(), 60_000);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [isOnlineStoreSession, isSessionLoading, pathname]);

  useEffect(() => {
    if (!isUserMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isUserMenuOpen]);

  useEffect(() => {
    if (!isAlertsOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!alertsRef.current?.contains(event.target as Node)) {
        setIsAlertsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isAlertsOpen]);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!searchRef.current?.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isQuickProfileDrawerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsQuickProfileDrawerOpen(false);
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isQuickProfileDrawerOpen]);

  function handleGlobalSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (searchResults[0]) {
      router.push(searchResults[0].href);
      setIsSearchOpen(false);
      return;
    }

    if (normalizedSearchQuery.length >= 2) {
      setIsSearchOpen(true);
    }
  }

  function handleSidebarToggle() {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setIsSidebarCollapsed((current) => !current);
      return;
    }

    setIsMobileSidebarOpen((current) => !current);
  }

  return (
    <div className="enterprise-shell min-h-screen text-white">
      <div
        aria-hidden={!isQuickProfileDrawerOpen}
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/44 backdrop-blur-sm transition duration-200",
          isQuickProfileDrawerOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        )}
        onClick={() => setIsQuickProfileDrawerOpen(false)}
      />

      <aside
        aria-hidden={!isQuickProfileDrawerOpen}
        aria-modal="true"
        className={cn(
          "fixed right-0 top-0 z-50 flex h-screen w-full max-w-[22rem] flex-col border-l border-white/10 bg-[linear-gradient(180deg,rgba(3,17,36,0.98),rgba(9,23,46,0.96))] text-white shadow-[-20px_0_60px_rgba(2,6,23,0.42)] transition-transform duration-300 ease-out",
          isQuickProfileDrawerOpen
            ? "pointer-events-auto translate-x-0"
            : "pointer-events-none translate-x-full"
        )}
        id="enterprise-quick-profile-drawer"
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Quick profile
            </p>
            <p className="mt-1 text-sm font-semibold text-white">Account snapshot</p>
          </div>
          <button
            aria-label="Close quick profile"
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-slate-100 transition hover:border-white/16 hover:bg-white/10"
            onClick={() => setIsQuickProfileDrawerOpen(false)}
            type="button"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div className={cn("rounded-[1.4rem] border border-white/10 p-4", avatarTheme.surfaceClassName)}>
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-base font-semibold",
                  avatarTheme.avatarClassName
                )}
              >
                {accountInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-slate-950">{accountDisplayName}</p>
                <p className="truncate text-sm text-slate-500">{accountLoginId}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      avatarTheme.badgeClassName
                    )}
                  >
                    {sessionSnapshot?.accountStatus ?? "Unknown"}
                  </span>
                  <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                    {roleLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="rounded-2xl bg-white/82 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Last active
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{lastActiveLabel}</p>
                <p className="mt-1 text-xs text-slate-500">{lastActiveTimestamp}</p>
              </div>
              <div className="rounded-2xl bg-white/82 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Last login
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{lastLoginLabel}</p>
                <p className="mt-1 text-xs text-slate-500">{lastLoginTimestamp}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.2rem] border border-white/10 bg-white/6 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Privileges
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {sessionSnapshot?.permissionCount ?? 0}
              </p>
              <p className="mt-1 text-xs text-slate-300">Granted across active roles</p>
            </div>
            <div className="rounded-[1.2rem] border border-white/10 bg-white/6 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Session
              </p>
              <p className="mt-2 text-sm font-semibold text-white">{sessionExpiryLabel}</p>
              <p className="mt-1 text-xs text-slate-300">Current expiry checkpoint</p>
            </div>
          </div>

          <div className="rounded-[1.2rem] border border-sky-400/20 bg-sky-400/10 px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-200">
              Compare modes
            </p>
            <p className="mt-2 text-sm leading-6 text-sky-50">
              This drawer gives you a compact account snapshot. The chevron beside your account
              button still opens the richer dropdown menu so you can decide which interaction feels
              better.
            </p>
          </div>

          <div className="space-y-2">
            <Link
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/7 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/16 hover:bg-white/10"
              href="/profile"
              onClick={() => setIsQuickProfileDrawerOpen(false)}
            >
              <span>Open full profile</span>
              <UserCircle2 className="h-4.5 w-4.5 text-slate-300" />
            </Link>

            <form action="/api/auth/sign-out" method="post">
              <button
                className="flex w-full items-center justify-between rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-100 transition hover:border-rose-300/30 hover:bg-rose-400/16"
                type="submit"
              >
                <span>Sign out</span>
                <LogOut className="h-4.5 w-4.5" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen">
        <div
          aria-hidden={!isMobileSidebarOpen}
          className={cn(
            "fixed inset-0 z-30 bg-slate-950/56 backdrop-blur-sm transition lg:hidden",
            isMobileSidebarOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          )}
          onClick={() => setIsMobileSidebarOpen(false)}
        />

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 transition-transform duration-300 ease-out lg:sticky lg:top-0 lg:translate-x-0",
            isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div
            className={cn(
              "shell-theme-sidebar flex h-screen w-[15.25rem] flex-col border-r border-white/8 shadow-[18px_0_48px_rgba(2,6,23,0.28)] transition-[width] duration-300 ease-out",
              isSidebarCollapsed ? "lg:w-[4.875rem]" : "lg:w-[15.25rem]"
            )}
          >
            <div
              className={cn(
                "flex h-[4.5rem] items-center gap-3 border-b border-white/8 px-4",
                isSidebarCollapsed ? "lg:justify-center lg:px-2" : ""
              )}
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] text-white shadow-[0_14px_30px_rgba(29,78,216,0.28)]">
                <Store className="h-5 w-5" />
              </div>
              <div className={cn("shell-wordmark min-w-0", isSidebarCollapsed ? "lg:hidden" : "")}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                  Flash ERP
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-white">
                  Enterprise Control
                </p>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 py-1.5">
              <div className={cn("shell-subtle px-2 pb-1", isSidebarCollapsed ? "lg:hidden" : "")}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                  Navigation
                </p>
              </div>

              <div className="space-y-0.5">
                {sidebarNavigation.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.key === activeSection;
                  const isExpanded = expandedSections[item.key] ?? isActive;
                  const itemClassName = cn(
                    "group/nav flex w-full items-center gap-2 rounded-2xl border px-2 py-1 transition",
                    isActive
                      ? "border-sky-400/20 bg-[linear-gradient(135deg,rgba(37,99,235,0.96),rgba(14,116,144,0.92))] text-white shadow-[0_16px_30px_rgba(14,116,144,0.24)]"
                      : item.href
                        ? "border-transparent bg-white/5 text-slate-100 hover:border-white/10 hover:bg-white/9"
                        : "cursor-not-allowed border-transparent bg-white/4 text-slate-400",
                    isSidebarCollapsed ? "lg:justify-center lg:px-1.5" : ""
                  );

                  return (
                    <div className="space-y-1.5" key={item.key}>
                      {item.children?.length ? (
                        <div className={itemClassName}>
                          <Link
                            className={cn(
                              "flex min-w-0 flex-1 items-center gap-2",
                              isSidebarCollapsed ? "lg:flex-none lg:justify-center" : ""
                            )}
                            href={item.href ?? "#"}
                            onClick={() => setIsMobileSidebarOpen(false)}
                            title={item.label}
                          >
                            <span
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition",
                                isActive
                                  ? "border-white/14 bg-white/14 text-white"
                                  : item.href
                                    ? "border-white/8 bg-white/8 text-slate-300 group-hover/nav:border-white/14 group-hover/nav:bg-white/12 group-hover/nav:text-white"
                                    : "border-white/8 bg-white/5 text-slate-500"
                              )}
                            >
                              <Icon className="h-4.5 w-4.5" />
                            </span>
                            <span
                              className={cn(
                                "shell-label min-w-0 flex-1 truncate text-sm font-medium",
                                isSidebarCollapsed ? "lg:hidden" : ""
                              )}
                            >
                              {item.label}
                            </span>
                            <span
                              className={cn(
                                "shell-trailing h-2.5 w-2.5 rounded-full transition",
                                isActive ? "bg-white" : "bg-slate-500 group-hover/nav:bg-sky-300",
                                isSidebarCollapsed ? "lg:hidden" : ""
                              )}
                            />
                          </Link>
                          <button
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${item.label}`}
                            className={cn(
                              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/8 text-slate-200 transition hover:border-white/14 hover:bg-white/12 hover:text-white",
                              isSidebarCollapsed ? "lg:hidden" : ""
                            )}
                            onClick={() =>
                              setExpandedSections((current) =>
                                Object.fromEntries(
                                  Object.keys(current).map((key) => [
                                    key,
                                    key === item.key ? !(current[item.key] ?? false) : false
                                  ])
                                ) as Record<string, boolean>
                              )
                            }
                            type="button"
                          >
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 transition-transform duration-200",
                                isExpanded ? "rotate-180" : "rotate-0"
                              )}
                            />
                          </button>
                        </div>
                      ) : item.href ? (
                        <Link
                          className={itemClassName}
                          href={item.href}
                          onClick={() => setIsMobileSidebarOpen(false)}
                          title={item.label}
                        >
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition",
                              isActive
                                ? "border-white/14 bg-white/14 text-white"
                                : item.href
                                  ? "border-white/8 bg-white/8 text-slate-300 group-hover/nav:border-white/14 group-hover/nav:bg-white/12 group-hover/nav:text-white"
                                  : "border-white/8 bg-white/5 text-slate-500"
                            )}
                          >
                            <Icon className="h-4.5 w-4.5" />
                          </span>
                          <span
                            className={cn(
                              "shell-label min-w-0 flex-1 truncate text-sm font-medium",
                              isSidebarCollapsed ? "lg:hidden" : ""
                            )}
                          >
                            {item.label}
                          </span>
                          <span
                            className={cn(
                              "shell-trailing h-2.5 w-2.5 rounded-full transition",
                              isActive ? "bg-white" : "bg-slate-500 group-hover/nav:bg-sky-300",
                              isSidebarCollapsed ? "lg:hidden" : ""
                            )}
                          />
                        </Link>
                      ) : (
                        <button
                          aria-disabled="true"
                          className={itemClassName}
                          disabled
                          type="button"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/5 text-slate-500">
                            <Icon className="h-4.5 w-4.5" />
                          </span>
                          <span
                            className={cn(
                              "shell-label min-w-0 flex-1 truncate text-sm font-medium",
                              isSidebarCollapsed ? "lg:hidden" : ""
                            )}
                          >
                            {item.label}
                          </span>
                          <span
                            className={cn(
                              "rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500",
                              isSidebarCollapsed ? "lg:hidden" : ""
                            )}
                          >
                            Soon
                          </span>
                        </button>
                      )}

                      {item.children?.length && isExpanded && !isSidebarCollapsed ? (
                        <div className="ml-4 space-y-1 border-l border-white/8 pl-3">
                          {item.children.map((child) => {
                            const childIsActive = child.href
                              ? matchesHref(pathname, child.href)
                              : false;
                            const childClassName = cn(
                              "flex min-h-[2.15rem] items-center justify-between rounded-xl px-3 text-[12px] font-medium transition",
                              child.href
                                ? childIsActive
                                  ? "bg-white/12 text-white"
                                  : "text-slate-300 hover:bg-white/8 hover:text-white"
                                : "cursor-not-allowed text-slate-500"
                            );

                            const childContent = (
                              <>
                                <span className="truncate">{child.label}</span>
                                <span
                                  className={cn(
                                    "h-2 w-2 rounded-full",
                                    child.href
                                      ? childIsActive
                                        ? "bg-sky-300"
                                        : "bg-slate-500"
                                      : "bg-slate-600"
                                  )}
                                />
                              </>
                            );

                            if (child.href) {
                              return (
                                <Link
                                  className={childClassName}
                                  href={child.href}
                                  key={child.label}
                                  onClick={() => setIsMobileSidebarOpen(false)}
                                >
                                  {childContent}
                                </Link>
                              );
                            }

                            return (
                              <div className={childClassName} key={child.label}>
                                <span>{child.label}</span>
                                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                  Soon
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </nav>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="shell-theme-header sticky top-0 z-20 flex min-h-[4.5rem] items-center gap-3 border-b border-white/8 px-3 sm:px-4 lg:px-5">
            <button
              aria-label="Toggle sidebar"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-white transition hover:border-white/16 hover:bg-white/10"
              onClick={handleSidebarToggle}
              type="button"
            >
              {isMobileSidebarOpen ? <X className="h-5 w-5 lg:hidden" /> : <Menu className="h-5 w-5" />}
            </button>

            {!isOnlineStoreSession ? (
              <form
                className="relative ml-0 flex-1 lg:max-w-2xl"
                onSubmit={handleGlobalSearchSubmit}
                ref={searchRef}
              >
                <input
                  className="h-11 w-full rounded-2xl border border-white/10 bg-white/7 px-4 pr-24 text-[13px] text-white placeholder:text-slate-400/80 outline-none transition focus:border-sky-400/50 focus:bg-white/10"
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setIsSearchOpen(true);
                  }}
                  onFocus={() => setIsSearchOpen(true)}
                  placeholder="Search products, receipts, PO, GRN, transfers, customers, suppliers, users..."
                  value={searchQuery}
                />
                <button
                  className="absolute right-2 top-1/2 inline-flex h-8 -translate-y-1/2 items-center gap-1.5 rounded-xl border border-white/10 bg-white/9 px-3 text-xs font-semibold text-slate-100 transition hover:bg-white/14"
                  type="submit"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Search</span>
                </button>
                {isSearchOpen && normalizedSearchQuery.length >= 2 ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-40 rounded-[1.2rem] border border-slate-200 bg-white p-2 text-slate-950 shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
                    <div className="flex items-center justify-between gap-3 px-2 pb-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Global search
                      </p>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                        {isSearchLoading
                          ? "Loading"
                          : `${searchResults.length} result${searchResults.length === 1 ? "" : "s"}`}
                      </span>
                    </div>
                    <div className="max-h-[26rem] space-y-1.5 overflow-y-auto">
                      {searchResults.slice(0, 12).map((result) => (
                        <Link
                          className="flex items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 transition hover:border-slate-200 hover:bg-slate-50"
                          href={result.href}
                          key={`${result.entity}:${result.id}`}
                          onClick={() => setIsSearchOpen(false)}
                        >
                          <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                            <Search className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-slate-950">
                                {result.title}
                              </span>
                              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                {result.entity}
                              </span>
                            </span>
                            <span className="mt-1 block truncate text-xs text-slate-500">
                              {result.subtitle}
                            </span>
                          </span>
                          {result.badge ? (
                            <span className="mt-1 shrink-0 rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600">
                              {result.badge}
                            </span>
                          ) : null}
                        </Link>
                      ))}
                      {!isSearchLoading && searchResults.length === 0 ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
                          No matching enterprise records found.
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </form>
            ) : (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Online store
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-white">
                  {sessionSnapshot?.homeStoreName ?? "Store workspace"}
                </p>
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              {!isOnlineStoreSession ? (
              <div className="relative" ref={alertsRef}>
                <button
                  aria-expanded={isAlertsOpen}
                  aria-label="Open enterprise alerts"
                  className="relative inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-3 text-xs font-semibold text-slate-100 transition hover:border-white/16 hover:bg-white/12"
                  onClick={() => setIsAlertsOpen((current) => !current)}
                  type="button"
                >
                  <Bell className="h-4.5 w-4.5" />
                  <span className="hidden xl:inline">Alerts</span>
                  {alertCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                      {Math.min(alertCount, 99)}
                    </span>
                  ) : null}
                </button>

                {isAlertsOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.6rem)] z-30 w-[22rem] rounded-[1.35rem] border border-slate-200 bg-white p-3 text-slate-950 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
                    <div className="flex items-center justify-between gap-3 px-1 pb-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                          HQ alerts
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">
                          {alertCount > 0 ? `${alertCount} active signal${alertCount === 1 ? "" : "s"}` : "All clear"}
                        </p>
                      </div>
                      <Bell className="h-4.5 w-4.5 text-slate-400" />
                    </div>
                    <div className="max-h-[24rem] space-y-2 overflow-y-auto">
                      {(alertSnapshot?.alerts ?? []).map((alert) => (
                        <Link
                          className="block rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 transition hover:border-slate-300 hover:bg-white"
                          href={alert.href}
                          key={alert.id}
                          onClick={() => setIsAlertsOpen(false)}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={cn(
                                "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                                alert.tone === "critical"
                                  ? "bg-rose-500"
                                  : alert.tone === "warning"
                                    ? "bg-amber-500"
                                    : alert.tone === "success"
                                      ? "bg-emerald-500"
                                      : "bg-sky-500"
                              )}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{alert.title}</p>
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                                {alert.message}
                              </p>
                            </div>
                          </div>
                        </Link>
                      ))}
                      {!alertSnapshot ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-500">
                          Alerts are loading.
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
              ) : null}

              <div className="relative" ref={userMenuRef}>
                <div className="flex items-stretch rounded-[1.1rem] border border-white/10 bg-white/7 p-1 shadow-[0_16px_32px_rgba(2,6,23,0.14)]">
                  <button
                    aria-controls="enterprise-quick-profile-drawer"
                    aria-expanded={isQuickProfileDrawerOpen}
                    aria-label="Open quick profile drawer"
                    className="flex items-center gap-3 rounded-[0.95rem] px-2.5 py-2 text-left text-slate-100 transition hover:bg-white/8"
                    onClick={() => {
                      setIsQuickProfileDrawerOpen(true);
                      setIsUserMenuOpen(false);
                    }}
                    type="button"
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold",
                        avatarTheme.avatarClassName
                      )}
                    >
                      {accountInitials}
                    </span>
                    <span className="hidden min-w-0 sm:block">
                      <span className="block truncate text-sm font-semibold text-white">
                        {accountDisplayName}
                      </span>
                      <span className="block truncate text-xs text-slate-300">{accountLoginId}</span>
                    </span>
                  </button>

                  <div className="mx-1 my-1 w-px bg-white/10" />

                  <button
                    aria-expanded={isUserMenuOpen}
                    aria-label="Open account dropdown"
                    className="inline-flex h-auto min-h-[3.5rem] items-center justify-center rounded-[0.95rem] px-3 text-slate-300 transition hover:bg-white/8 hover:text-white"
                    onClick={() => {
                      setIsQuickProfileDrawerOpen(false);
                      setIsUserMenuOpen((current) => !current);
                    }}
                    type="button"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        isUserMenuOpen ? "rotate-180" : "rotate-0"
                      )}
                    />
                  </button>
                </div>

                {isUserMenuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.6rem)] z-30 w-[20rem] rounded-[1.35rem] border border-slate-200 bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
                    <div className={cn("rounded-[1.15rem] p-4", avatarTheme.surfaceClassName)}>
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold",
                            avatarTheme.avatarClassName
                          )}
                        >
                          {accountInitials}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{accountDisplayName}</p>
                          <p className="truncate text-xs text-slate-500">{accountLoginId}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold",
                            avatarTheme.badgeClassName
                          )}
                        >
                          {sessionSnapshot?.accountStatus ?? "Unknown"}
                        </span>
                        <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                          {roleLabel}
                        </span>
                        <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                          {sessionSnapshot?.permissionCount ?? 0} privileges
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-2xl bg-white/80 px-3 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Last active
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{lastActiveLabel}</p>
                          <p className="mt-1 text-xs text-slate-500">{lastActiveTimestamp}</p>
                        </div>
                        <div className="rounded-2xl bg-white/80 px-3 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Last login
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{lastLoginLabel}</p>
                          <p className="mt-1 text-xs text-slate-500">{lastLoginTimestamp}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      <Link
                        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-white"
                        href="/profile"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        <span>View profile</span>
                        <UserCircle2 className="h-4.5 w-4.5 text-slate-500" />
                      </Link>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs leading-6 text-slate-500">
                        Session expires {sessionExpiryLabel}.
                      </div>

                      <form action="/api/auth/sign-out" method="post">
                        <button
                          className="flex w-full items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                          type="submit"
                        >
                          <span>Sign out</span>
                          <LogOut className="h-4.5 w-4.5" />
                        </button>
                      </form>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <main className="shell-theme-main min-w-0 flex-1 overflow-x-hidden px-3 py-3 text-slate-950 sm:px-4 sm:py-4 lg:px-5 lg:py-5">
            <div className="space-y-4">
              <section className="px-1 pt-1">
                <div className="min-w-0">
                  {eyebrow ? (
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                      {eyebrow}
                    </p>
                  ) : null}
                  <h1 className="mt-1 text-[1.45rem] font-semibold leading-tight text-slate-950 sm:text-[1.65rem]">
                    {heading}
                  </h1>
                  {description ? (
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                      {description}
                    </p>
                  ) : null}
                </div>
              </section>

              {children}
            </div>
          </main>
          {sessionWarning !== null ? (
            <div className="fixed inset-0 z-[95] grid place-items-center bg-slate-950/45 px-4 backdrop-blur-[2px]">
              <section className="w-full max-w-md rounded-[1.35rem] border border-slate-200 bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.24)]">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
                      Session timeout
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-slate-950">
                      Confirm activity
                    </h2>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-lg font-semibold tabular-nums text-amber-700">
                    {formatCountdown(sessionWarning.remainingSeconds)}
                  </div>
                </div>
                <div className="mt-5">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-1000 ease-linear"
                      style={{ width: `${sessionWarningProgress}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>Auto logout</span>
                    <span className="tabular-nums">
                      {formatCountdown(sessionWarning.remainingSeconds)}
                    </span>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                    onClick={() => void signOutExpiredSession()}
                    type="button"
                  >
                    Sign out
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
                    onClick={() => refreshSessionFromActivity(true)}
                    type="button"
                  >
                    Stay signed in
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
