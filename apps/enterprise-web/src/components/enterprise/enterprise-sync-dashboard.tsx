"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import { ArrowUpRight, BellRing, HardDriveDownload, Send, ShoppingCart, Store } from "lucide-react";
import type {
  StoreMasterDataDistributionResponse,
  StoreMasterDataPublicationScope
} from "@flash-erp/sync-core";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";

type SyncPosture = "Healthy" | "Lagging" | "Attention";

type EnterpriseSyncDashboardData = {
  metrics: {
    activeStores: number;
    queuedSales: number;
    downstreamPackets: number;
    attentionNodes: number;
  };
  storeOptions: Array<{
    code: string;
    name: string;
    storeMode: string;
    terminals: Array<{
      code: string;
      name: string;
    }>;
  }>;
  storeRows: Array<{
    store: string;
    nodeCode: string;
    upstreamQueue: number;
    downstreamQueue: number;
    lastSync: string;
    posture: SyncPosture;
  }>;
  publicationTargets: Array<{
    storeCode: string;
    storeName: string;
    nodeCode: string;
  }>;
  priorities: string[];
  downstreamOwnership: Array<{
    title: string;
    body: string;
    pendingPackets: number;
  }>;
  syncPostureMessages: string[];
  statusMessage: string;
  phaseLabel: string;
  refreshedAt: string;
};

type StoreNodeRow = EnterpriseSyncDashboardData["storeRows"][number];

const conflictPolicy = [
  "Reject store overwrites for enterprise-owned master data.",
  "Accept store-captured commercial history as append-only fact.",
  "Merge customers by version policy, then escalate suspicious changes.",
  "Never hide failure state behind silent last-write-wins behavior."
];

const recoveryLanes = [
  "Surface stale checkpoints with store, node, and last acknowledged cursor.",
  "Classify rejections into retryable, review-required, and dead-letter categories.",
  "Make it easy for operators to replay a batch without rewriting business history."
];

const numberFormatter = new Intl.NumberFormat("en-US");

const masterDataPublicationOptions: Array<{
  value: StoreMasterDataPublicationScope;
  label: string;
}> = [
  { value: "STORE_SETUP", label: "Store setup and locations" },
  { value: "SECURITY", label: "Users, roles and permissions" },
  { value: "CUSTOMERS", label: "Customers" },
  { value: "SUPPLIERS", label: "Suppliers" },
  { value: "PRODUCTS", label: "Products, categories, units and barcodes" },
  { value: "PRICING", label: "Product pricing" },
  { value: "TAX_AND_TENDERS", label: "Taxes and tender methods" },
  { value: "PROMOTIONS", label: "Promotions" },
  { value: "BANKING", label: "Bank accounts" },
  { value: "GIFT_CERTIFICATES", label: "Gift certificates" }
];

const allMasterDataPublicationScopes = masterDataPublicationOptions.map((option) => option.value);

function buildSuggestedNodeCode(storeCode: string) {
  return storeCode ? `${storeCode}-desktop-01` : "";
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint
}: {
  icon: typeof Store;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article className="glass-panel rounded-[1.3rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            {label}
          </p>
          <p className="mt-2 text-[1.45rem] font-semibold text-stone-950">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] text-white shadow-[0_14px_30px_rgba(29,78,216,0.28)]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-600">{hint}</p>
    </article>
  );
}

function PostureBadge({ value }: { value: StoreNodeRow["posture"] }) {
  const tone =
    value === "Healthy"
      ? "bg-emerald-100 text-emerald-700"
      : value === "Lagging"
        ? "bg-amber-100 text-amber-700"
        : "bg-rose-100 text-rose-700";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {value}
    </span>
  );
}

const storeFilter: FilterFn<StoreNodeRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "")
    .trim()
    .toLowerCase();

  if (!query) {
    return true;
  }

  return [row.original.store, row.original.nodeCode, row.original.posture]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

function RegisterStoreNodeDialog({
  storeOptions
}: {
  storeOptions: EnterpriseSyncDashboardData["storeOptions"];
}) {
  const router = useRouter();
  const firstStore = storeOptions[0] ?? null;
  const [isOpen, setIsOpen] = useState(false);
  const [storeCode, setStoreCode] = useState(firstStore?.code ?? "");
  const [terminalCode, setTerminalCode] = useState(firstStore?.terminals[0]?.code ?? "");
  const [nodeCode, setNodeCode] = useState(buildSuggestedNodeCode(firstStore?.code ?? ""));
  const [nodeType, setNodeType] = useState("STORE_DESKTOP");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const selectedStore = storeOptions.find((store) => store.code === storeCode) ?? firstStore;
  const terminalOptions = selectedStore?.terminals ?? [];

  function handleStoreChange(nextStoreCode: string) {
    const nextStore = storeOptions.find((store) => store.code === nextStoreCode) ?? null;

    setStoreCode(nextStoreCode);
    setTerminalCode(nextStore?.terminals[0]?.code ?? "");
    setNodeCode((current) =>
      !current.trim() || current === buildSuggestedNodeCode(storeCode)
        ? buildSuggestedNodeCode(nextStoreCode)
        : current
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!storeCode || !nodeCode.trim()) {
      setStatus("error");
      setMessage("Select a store and enter a node code before saving.");
      return;
    }

    setStatus("submitting");
    setMessage(null);

    try {
      const response = await fetch("/api/sync/store-nodes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          storeCode,
          terminalCode: terminalCode || null,
          nodeCode,
          nodeType,
          notes
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not register that store node.");
      }

      setStatus("idle");
      setMessage(null);
      setIsOpen(false);
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Flash ERP could not register that store node."
      );
    }
  }

  return (
    <ActionDialog
      description="Register a store desktop node and define the store and terminal binding it should sync under."
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen);

        if (nextOpen) {
          setStatus("idle");
          setMessage(null);
        }
      }}
      open={isOpen}
      title="Register store node"
      triggerLabel="Register node"
    >
      <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void handleSubmit(event)}>
        <label className="space-y-2 text-sm text-stone-700">
          <span className="block font-semibold text-stone-900">Store</span>
          <select
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
            disabled={status === "submitting" || storeOptions.length === 0}
            onChange={(event) => handleStoreChange(event.target.value)}
            value={storeCode}
          >
            {storeOptions.length === 0 ? (
              <option value="">No active stores available</option>
            ) : (
              storeOptions.map((store) => (
                <option key={store.code} value={store.code}>
                  {store.name} ({store.code})
                </option>
              ))
            )}
          </select>
        </label>
        <label className="space-y-2 text-sm text-stone-700">
          <span className="block font-semibold text-stone-900">Node code</span>
          <input
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
            disabled={status === "submitting"}
            onChange={(event) => setNodeCode(event.target.value)}
            placeholder="accra-central-desktop-01"
            value={nodeCode}
          />
        </label>
        <label className="space-y-2 text-sm text-stone-700">
          <span className="block font-semibold text-stone-900">Terminal</span>
          <select
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
            disabled={status === "submitting" || terminalOptions.length === 0}
            onChange={(event) => setTerminalCode(event.target.value)}
            value={terminalCode}
          >
            {terminalOptions.length === 0 ? (
              <option value="">No active terminals for this store</option>
            ) : (
              terminalOptions.map((terminal) => (
                <option key={terminal.code} value={terminal.code}>
                  {terminal.name} ({terminal.code})
                </option>
              ))
            )}
          </select>
        </label>
        <label className="space-y-2 text-sm text-stone-700">
          <span className="block font-semibold text-stone-900">Node type</span>
          <select
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
            disabled={status === "submitting"}
            onChange={(event) => setNodeType(event.target.value)}
            value={nodeType}
          >
            <option value="STORE_DESKTOP">Store desktop</option>
            <option value="MOBILE">Mobile</option>
          </select>
        </label>
        <textarea
          className="min-h-28 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)] md:col-span-2"
          disabled={status === "submitting"}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Sync notes, provisioning intent, or rollout comment"
          value={notes}
        />
        {message ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700 md:col-span-2">
            {message}
          </div>
        ) : null}
        <button
          className="inline-flex items-center justify-center rounded-2xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
          disabled={status === "submitting" || !storeCode || !nodeCode.trim()}
          type="submit"
        >
          {status === "submitting" ? "Saving node..." : "Save node blueprint"}
        </button>
      </form>
    </ActionDialog>
  );
}

function MasterDataDistributionDialog({
  targets
}: {
  targets: EnterpriseSyncDashboardData["publicationTargets"];
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedNodeCodes, setSelectedNodeCodes] = useState<string[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<StoreMasterDataPublicationScope[]>(
    allMasterDataPublicationScopes
  );
  const [note, setNote] = useState("Manually publishing selected enterprise master data from HQ.");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  function toggleNode(nodeCode: string) {
    setSelectedNodeCodes((current) =>
      current.includes(nodeCode)
        ? current.filter((candidate) => candidate !== nodeCode)
        : [...current, nodeCode]
    );
  }

  function toggleScope(scope: StoreMasterDataPublicationScope) {
    setSelectedScopes((current) =>
      current.includes(scope)
        ? current.filter((candidate) => candidate !== scope)
        : [...current, scope]
    );
  }

  async function handleSubmit() {
    if (selectedNodeCodes.length === 0 || selectedScopes.length === 0) {
      setStatus("error");
      setMessage("Select at least one shop and one data group.");
      return;
    }

    setStatus("submitting");
    setMessage("Flash ERP is building the selected shop publication batches.");

    try {
      const response = await fetch("/api/sync/master-data-publications", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          nodeCodes: selectedNodeCodes,
          scopes: selectedScopes,
          note
        })
      });
      const payload = (await response.json()) as
        StoreMasterDataDistributionResponse | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Flash ERP could not queue the selected master data."
        );
      }

      const distribution = payload as StoreMasterDataDistributionResponse;
      setStatus("success");
      setMessage(
        `Queued ${numberFormatter.format(distribution.queuedCount)} packet(s) for ${numberFormatter.format(distribution.targets.length)} shop(s).`
      );
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Flash ERP could not queue the selected master data."
      );
    }
  }

  return (
    <ActionDialog
      description="Select the shops and enterprise-owned data groups that should be queued for downstream delivery."
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen);

        if (nextOpen) {
          setStatus("idle");
          setMessage(null);
        }
      }}
      open={isOpen}
      title="Queue master data"
      triggerLabel="Queue master data"
      widthClassName="max-w-3xl"
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
              <Store className="h-4 w-4 text-[var(--brand)]" />
              Select shops
            </div>
            <div className="flex items-center gap-3">
              <button
                className="text-sm font-semibold text-[var(--brand)] hover:text-[var(--brand-deep)]"
                onClick={() => setSelectedNodeCodes(targets.map((target) => target.nodeCode))}
                type="button"
              >
                Select all
              </button>
              <button
                className="text-sm font-semibold text-stone-600 hover:text-stone-950"
                onClick={() => setSelectedNodeCodes([])}
                type="button"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2">
            {targets.length === 0 ? (
              <div className="border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600 sm:col-span-2">
                No active shop desktop nodes are available.
              </div>
            ) : (
              targets.map((target) => (
                <label
                  className="flex min-h-12 items-center gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
                  key={target.storeCode}
                >
                  <input
                    checked={selectedNodeCodes.includes(target.nodeCode)}
                    className="h-4 w-4 accent-[var(--brand)]"
                    onChange={() => toggleNode(target.nodeCode)}
                    type="checkbox"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-stone-900">{target.storeName}</span>
                    <span className="block truncate text-xs text-stone-500">{target.nodeCode}</span>
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="space-y-3 border-t border-stone-200 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
              <HardDriveDownload className="h-4 w-4 text-[var(--brand)]" />
              Select data groups
            </div>
            <div className="flex items-center gap-3">
              <button
                className="text-sm font-semibold text-[var(--brand)] hover:text-[var(--brand-deep)]"
                onClick={() => setSelectedScopes(allMasterDataPublicationScopes)}
                type="button"
              >
                Select all
              </button>
              <button
                className="text-sm font-semibold text-stone-600 hover:text-stone-950"
                onClick={() => setSelectedScopes([])}
                type="button"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {masterDataPublicationOptions.map((option) => (
              <label
                className="flex min-h-12 items-center gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800"
                key={option.value}
              >
                <input
                  checked={selectedScopes.includes(option.value)}
                  className="h-4 w-4 accent-[var(--brand)]"
                  onChange={() => toggleScope(option.value)}
                  type="checkbox"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="block space-y-2 text-sm text-stone-700">
          <span className="block font-semibold text-stone-900">Audit note</span>
          <textarea
            className="min-h-24 w-full rounded-lg border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)]"
            disabled={status === "submitting"}
            onChange={(event) => setNote(event.target.value)}
            value={note}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              status === "submitting" ||
              selectedNodeCodes.length === 0 ||
              selectedScopes.length === 0
            }
            onClick={() => void handleSubmit()}
            type="button"
          >
            <Send className="h-4 w-4" />
            {status === "submitting" ? "Queueing..." : "Queue selected data"}
          </button>
          <button
            className="rounded-lg border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
            disabled={status === "submitting"}
            onClick={() => setIsOpen(false)}
            type="button"
          >
            Close
          </button>
        </div>

        {message ? (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              status === "error"
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : status === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-sky-200 bg-sky-50 text-sky-800"
            }`}
          >
            {message}
          </div>
        ) : null}
      </div>
    </ActionDialog>
  );
}

export function EnterpriseSyncDashboard({
  canPublishMasterData,
  dashboard
}: {
  canPublishMasterData: boolean;
  dashboard: EnterpriseSyncDashboardData;
}) {
  const columns = useMemo<ColumnDef<StoreNodeRow>[]>(
    () => [
      {
        accessorKey: "store",
        header: "Store"
      },
      {
        accessorKey: "nodeCode",
        header: "Node"
      },
      {
        accessorKey: "upstreamQueue",
        header: "Upstream",
        cell: ({ row }) => `${numberFormatter.format(row.original.upstreamQueue)} events`
      },
      {
        accessorKey: "downstreamQueue",
        header: "Downstream",
        cell: ({ row }) => `${numberFormatter.format(row.original.downstreamQueue)} events`
      },
      {
        accessorKey: "lastSync",
        header: "Last sync"
      },
      {
        accessorKey: "posture",
        header: "Posture",
        cell: ({ row }) => <PostureBadge value={row.original.posture} />,
        meta: {
          disableTruncate: true
        }
      }
    ],
    []
  );

  return (
    <EnterpriseShell
      activeSection="sync"
      description="Coordinate store nodes, push enterprise-owned master data downstream, receive store transactions upstream, and keep recovery posture visible from one enterprise workspace."
      eyebrow="Flash ERP enterprise"
      heading="Sync command center"
    >
      <section className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          hint="Stores currently provisioned in the Flash ERP enterprise estate."
          icon={Store}
          label="Active stores"
          value={numberFormatter.format(dashboard.metrics.activeStores)}
        />
        <MetricCard
          hint="Store sales packets waiting for upstream delivery into enterprise."
          icon={ShoppingCart}
          label="Queued sales"
          value={numberFormatter.format(dashboard.metrics.queuedSales)}
        />
        <MetricCard
          hint="Enterprise catalog, price, and policy updates waiting for downstream delivery."
          icon={HardDriveDownload}
          label="Downstream packets"
          value={numberFormatter.format(dashboard.metrics.downstreamPackets)}
        />
        <MetricCard
          hint="Nodes that need intervention because of stale checkpoints or escalated batches."
          icon={BellRing}
          label="Attention nodes"
          value={numberFormatter.format(dashboard.metrics.attentionNodes)}
        />
      </section>

      <WorkspaceTabs
        ariaLabel="Enterprise sync views"
        defaultValue="network"
        summaries={{
          network:
            "Track last sync time, upstream backlog, and downstream pressure for every store node.",
          downstream: "Review the domains that enterprise owns and pushes into store environments.",
          conflicts: "Make conflict posture explicit instead of allowing silent retail data drift."
        }}
        tabs={[
          {
            value: "network",
            label: "Network",
            badge: "Live",
            badgeTone: "success"
          },
          { value: "downstream", label: "Downstream" },
          {
            value: "conflicts",
            label: "Conflicts",
            badge: "Review",
            badgeTone: "warning"
          }
        ]}
      >
        <WorkspaceTabsContent value="network">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]">
            <div className="space-y-4">
              <SharedDataGrid
                columns={columns}
                data={dashboard.storeRows}
                emptyLabel="No store nodes have been registered yet."
                exportFileName="flash-erp-store-sync-network"
                getRowHref={(row) => `/sync/nodes/${row.nodeCode}`}
                globalFilterFn={storeFilter}
                searchPlaceholder="Search stores, node codes, or sync posture"
                toolbarActions={
                  <div className="flex flex-wrap items-center gap-2">
                    {canPublishMasterData ? (
                      <MasterDataDistributionDialog targets={dashboard.publicationTargets} />
                    ) : null}
                    <RegisterStoreNodeDialog storeOptions={dashboard.storeOptions} />
                  </div>
                }
              />
            </div>

            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                      Immediate priorities
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      Last refreshed {new Date(dashboard.refreshedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-full border border-stone-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-600">
                    {dashboard.phaseLabel}
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {dashboard.priorities.map((item) => (
                    <div
                      className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-3 text-sm leading-6 text-stone-700"
                      key={item}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Sync posture
                </p>
                <div className="mt-4 space-y-3">
                  {dashboard.syncPostureMessages.map((item) => (
                    <div
                      className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800"
                      key={item}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="downstream">
          <section className="grid gap-4 lg:grid-cols-3">
            {dashboard.downstreamOwnership.map((item) => (
              <article className="glass-panel rounded-[1.3rem] p-5" key={item.title}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                      Enterprise-owned
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-stone-950">{item.title}</h2>
                  </div>
                  <ArrowUpRight className="h-5 w-5 text-stone-400" />
                </div>
                <p className="mt-3 text-sm leading-6 text-stone-600">{item.body}</p>
                <div className="mt-4 rounded-2xl border border-stone-200 bg-white/90 px-4 py-3 text-sm font-semibold text-stone-700">
                  {numberFormatter.format(item.pendingPackets)} packet(s) queued
                </div>
              </article>
            ))}
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="conflicts">
          <section className="grid gap-4 lg:grid-cols-2">
            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Conflict policy
              </p>
              <div className="mt-4 space-y-3">
                {conflictPolicy.map((item) => (
                  <div
                    className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700"
                    key={item}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </article>

            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Immediate recovery lanes
              </p>
              <div className="mt-4 space-y-3">
                {recoveryLanes.map((item) => (
                  <div
                    className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700"
                    key={item}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </article>
          </section>
        </WorkspaceTabsContent>
      </WorkspaceTabs>

      <section className="glass-panel rounded-[1.4rem] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Next implementation lane
            </p>
            <h2 className="mt-1 text-lg font-semibold text-stone-950">
              Node drill-downs are live. The next lane is replay controls and dead-letter actions
              directly from each store workspace.
            </h2>
          </div>
          <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700">
            {dashboard.phaseLabel}
          </div>
        </div>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-stone-600">{dashboard.statusMessage}</p>
      </section>
    </EnterpriseShell>
  );
}
