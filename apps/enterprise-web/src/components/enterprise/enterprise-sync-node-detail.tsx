"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  HardDriveDownload,
  Inbox,
  RefreshCcw,
  Save,
  Store
} from "lucide-react";
import type { StoreNodeReplayRequest, StoreNodeReplayResponse } from "@flash-erp/sync-core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type { EnterpriseSyncNodeDetailData } from "@/server/repositories/enterprise-sync-node.repository";

const numberFormatter = new Intl.NumberFormat("en-US");

type InboundRow = EnterpriseSyncNodeDetailData["inboundRows"][number];
type DownstreamRow = EnterpriseSyncNodeDetailData["downstreamRows"][number];
type EscalatedRow = EnterpriseSyncNodeDetailData["escalatedRows"][number];
type SyncPolicyDraft = {
  autoSyncEnabled: boolean;
  intervalMinutes: string;
  activeFrom: string;
  activeTo: string;
  jitterSeconds: string;
  backoffBaseSeconds: string;
  backoffMaxSeconds: string;
};

function statusTone(value: string) {
  if (value === "ACKNOWLEDGED" || value === "APPLIED") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (value === "FAILED" || value === "DEAD_LETTER") {
    return "bg-rose-100 text-rose-700";
  }

  return "bg-sky-100 text-sky-700";
}

function toLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(value)}`}
    >
      {toLabel(value)}
    </span>
  );
}

function PostureBadge({ value }: { value: EnterpriseSyncNodeDetailData["node"]["posture"] }) {
  const tone =
    value === "Healthy"
      ? "bg-emerald-100 text-emerald-700"
      : value === "Lagging"
        ? "bg-amber-100 text-amber-700"
        : "bg-rose-100 text-rose-700";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      {value}
    </span>
  );
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

const inboundFilter: FilterFn<InboundRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.eventType,
    row.original.aggregateType,
    row.original.aggregateId,
    row.original.status,
    row.original.idempotencyKey,
    row.original.diagnosticSummary,
    row.original.errorMessage ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const downstreamFilter: FilterFn<DownstreamRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.eventType,
    row.original.aggregateType,
    row.original.aggregateId,
    row.original.status,
    row.original.idempotencyKey,
    row.original.diagnosticSummary,
    row.original.errorMessage ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

function renderTimestamp(value: string | null, label: string) {
  if (!value) {
    return "Not yet";
  }

  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-stone-800">{label}</p>
      <p className="mt-0.5 truncate text-xs text-stone-500">{new Date(value).toLocaleString()}</p>
    </div>
  );
}

function PayloadPreview({ value }: { value: string }) {
  return (
    <details className="mt-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
      <summary className="cursor-pointer font-semibold text-stone-800">Payload preview</summary>
      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-stone-950 p-3 font-mono text-[11px] leading-5 text-stone-100">
        {value}
      </pre>
    </details>
  );
}

function minutesToTime(value: number) {
  const safeValue = Math.min(1440, Math.max(0, Math.trunc(value)));
  const hour = Math.floor(safeValue / 60) % 24;
  const minute = safeValue % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);

  if (!Number.isFinite(parsedHours) || !Number.isFinite(parsedMinutes)) {
    return 0;
  }

  return Math.min(1440, Math.max(0, Math.trunc(parsedHours) * 60 + Math.trunc(parsedMinutes)));
}

function buildPolicyDraft(
  policy: EnterpriseSyncNodeDetailData["syncPolicy"]
): SyncPolicyDraft {
  return {
    autoSyncEnabled: policy.autoSyncEnabled,
    intervalMinutes: String(policy.intervalMinutes),
    activeFrom: minutesToTime(policy.activeFromMinutes),
    activeTo: minutesToTime(policy.activeToMinutes),
    jitterSeconds: String(policy.jitterSeconds),
    backoffBaseSeconds: String(policy.backoffBaseSeconds),
    backoffMaxSeconds: String(policy.backoffMaxSeconds)
  };
}

export function EnterpriseSyncNodeDetail({
  detail
}: {
  detail: EnterpriseSyncNodeDetailData;
}) {
  const router = useRouter();
  const [isReplayOpen, setIsReplayOpen] = useState(false);
  const [replayNote, setReplayNote] = useState(
    `Requeueing escalated downstream packets for ${detail.node.storeName} after operator review.`
  );
  const [replayOperatorName, setReplayOperatorName] = useState("Flash ERP operator");
  const [selectedEscalatedEvent, setSelectedEscalatedEvent] = useState<EscalatedRow | null>(null);
  const [eventReplayNote, setEventReplayNote] = useState("");
  const [eventReplayOperatorName, setEventReplayOperatorName] = useState("Flash ERP operator");
  const [replayState, setReplayState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string | null;
  }>({
    status: "idle",
    message: null
  });
  const [policyDraft, setPolicyDraft] = useState<SyncPolicyDraft>(() =>
    buildPolicyDraft(detail.syncPolicy)
  );
  const [policyState, setPolicyState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string | null;
  }>({
    status: "idle",
    message: null
  });
  const canReplay = detail.metrics.downstreamEscalated > 0;
  const inboundColumns = useMemo<ColumnDef<InboundRow>[]>(
    () => [
      {
        accessorKey: "eventType",
        header: "Event",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.eventType}</p>
            <p className="truncate text-xs text-stone-600">{row.original.diagnosticSummary}</p>
            <p className="truncate text-xs text-stone-500">{row.original.eventId}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "aggregateType",
        header: "Aggregate",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm text-stone-800">{row.original.aggregateType}</p>
            <p className="truncate text-xs text-stone-500">{row.original.aggregateId}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "payloadPreview",
        header: "Details",
        cell: ({ row }) => (
          <div className="min-w-0">
            {row.original.errorMessage ? (
              <p className="mb-2 rounded-lg bg-rose-50 px-2 py-1 text-xs text-rose-700">
                {row.original.errorMessage}
              </p>
            ) : null}
            <PayloadPreview value={row.original.payloadPreview} />
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "receivedAtLabel",
        header: "Received",
        cell: ({ row }) =>
          renderTimestamp(row.original.receivedAt, row.original.receivedAtLabel),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "appliedAtLabel",
        header: "Applied",
        cell: ({ row }) => renderTimestamp(row.original.appliedAt, row.original.appliedAtLabel),
        meta: {
          disableTruncate: true
        }
      }
    ],
    []
  );

  const downstreamColumns = useMemo<ColumnDef<DownstreamRow>[]>(
    () => [
      {
        accessorKey: "eventType",
        header: "Event",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.eventType}</p>
            <p className="truncate text-xs text-stone-600">{row.original.diagnosticSummary}</p>
            <p className="truncate text-xs text-stone-500">{row.original.eventId}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "aggregateType",
        header: "Aggregate",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm text-stone-800">{row.original.aggregateType}</p>
            <p className="truncate text-xs text-stone-500">{row.original.aggregateId}</p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "payloadPreview",
        header: "Details",
        cell: ({ row }) => (
          <div className="min-w-0 space-y-2">
            {row.original.errorMessage ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
                <span className="block font-semibold">Failure reason</span>
                <span className="break-words">{row.original.errorMessage}</span>
              </div>
            ) : null}
            <PayloadPreview value={row.original.payloadPreview} />
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <div className="space-y-1">
            <StatusBadge value={row.original.status} />
            <p className="text-xs text-stone-500">
              {row.original.attemptCount} {row.original.attemptCount === 1 ? "attempt" : "attempts"}
            </p>
          </div>
        ),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "createdAtLabel",
        header: "Created",
        cell: ({ row }) => renderTimestamp(row.original.createdAt, row.original.createdAtLabel),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "lastAttemptAtLabel",
        header: "Last attempt",
        cell: ({ row }) =>
          renderTimestamp(row.original.lastAttemptAt, row.original.lastAttemptAtLabel),
        meta: {
          disableTruncate: true
        }
      },
      {
        accessorKey: "acknowledgedAtLabel",
        header: "Acknowledged",
        cell: ({ row }) =>
          renderTimestamp(row.original.acknowledgedAt, row.original.acknowledgedAtLabel),
        meta: {
          disableTruncate: true
        }
      }
    ],
    []
  );

  async function submitReplay(
    path: string,
    input: StoreNodeReplayRequest,
    successMessage: (payload: StoreNodeReplayResponse) => string
  ) {
    setReplayState({
      status: "submitting",
      message: "Flash ERP is applying the operator replay request."
    });

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(input)
      });
      const payload = (await response.json()) as
        | StoreNodeReplayResponse
        | {
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Flash ERP could not replay the downstream packets for this node."
        );
      }

      const replayPayload = payload as StoreNodeReplayResponse;

      setReplayState({
        status: "success",
        message: successMessage(replayPayload)
      });

      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setReplayState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not replay the downstream packets for this node."
      });
    }
  }

  async function handleReplayEscalations() {
    await submitReplay(
      `/api/sync/store-nodes/${detail.node.code}/replay`,
      {
        note: replayNote,
        operatorName: replayOperatorName
      },
      (payload) =>
        payload.replayedCount > 0
          ? `Requeued ${payload.replayedCount} escalated downstream packet(s). Refreshing the workspace now.`
          : "There were no escalated downstream packets left to replay."
    );
  }

  async function handleReplayEvent() {
    if (!selectedEscalatedEvent) {
      return;
    }

    await submitReplay(
      `/api/sync/store-nodes/${detail.node.code}/events/${selectedEscalatedEvent.eventId}/replay`,
      {
        note: eventReplayNote,
        operatorName: eventReplayOperatorName
      },
      () =>
        `Requeued ${selectedEscalatedEvent.eventType} for ${detail.node.storeName}. Refreshing the workspace now.`
    );
  }

  async function handlePolicySave() {
    setPolicyState({
      status: "submitting",
      message: "Flash ERP is updating the store-node sync policy."
    });

    try {
      const response = await fetch(`/api/sync/store-nodes/${detail.node.code}/policy`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          autoSyncEnabled: policyDraft.autoSyncEnabled,
          intervalMinutes: Number(policyDraft.intervalMinutes),
          activeFromMinutes: timeToMinutes(policyDraft.activeFrom),
          activeToMinutes:
            policyDraft.activeTo === "00:00" ? 1440 : timeToMinutes(policyDraft.activeTo),
          jitterSeconds: Number(policyDraft.jitterSeconds),
          backoffBaseSeconds: Number(policyDraft.backoffBaseSeconds),
          backoffMaxSeconds: Number(policyDraft.backoffMaxSeconds)
        })
      });
      const payload = (await response.json()) as
        | {
            message: string;
          }
        | {
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Flash ERP could not update the sync policy."
        );
      }

      setPolicyState({
        status: "success",
        message: "message" in payload ? payload.message : "Sync policy updated."
      });

      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setPolicyState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update the sync policy."
      });
    }
  }

  function openEventReplay(row: EscalatedRow) {
    setSelectedEscalatedEvent(row);
    setEventReplayOperatorName("Flash ERP operator");
    setEventReplayNote(
      `Requeueing ${row.eventType} (${row.aggregateType}) after operator review for ${detail.node.storeName}.`
    );
    setReplayState({
      status: "idle",
      message: null
    });
  }

  return (
    <EnterpriseShell
      activeSection="sync"
      description={`Inspect the live enterprise checkpoint, inbound history, and downstream delivery posture for ${detail.node.storeName}.`}
      eyebrow={`Flash ERP enterprise • ${detail.node.code}`}
      heading={`${detail.node.storeName} node control`}
    >
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Link
          className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
          href="/"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sync command center
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {canReplay ? (
            <ActionDialog
              description="Move failed and dead-letter downstream packets back into the active enterprise outbox so the store can pull them again."
              onOpenChange={setIsReplayOpen}
              open={isReplayOpen}
              title="Replay downstream escalations"
              triggerLabel="Replay escalations"
              triggerClassName="border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400 hover:text-amber-950"
              widthClassName="max-w-2xl"
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  {detail.metrics.downstreamEscalated} escalated packet(s) are currently blocking
                  enterprise delivery to {detail.node.storeName}.
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Operator name</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setReplayOperatorName(event.target.value)}
                      placeholder="Flash ERP operator"
                      value={replayOperatorName}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                    <span className="block font-semibold text-stone-900">Audit note</span>
                    <textarea
                      className="min-h-28 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setReplayNote(event.target.value)}
                      placeholder="Describe why these packets are being replayed."
                      value={replayNote}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="inline-flex items-center justify-center rounded-2xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={replayState.status === "submitting"}
                    onClick={() => void handleReplayEscalations()}
                    type="button"
                  >
                    {replayState.status === "submitting"
                      ? "Requeueing packets..."
                      : "Replay escalated packets"}
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    onClick={() => setIsReplayOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
                {replayState.message ? (
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm ${
                      replayState.status === "error"
                        ? "border border-rose-200 bg-rose-50 text-rose-800"
                        : "border border-sky-200 bg-sky-50 text-sky-800"
                    }`}
                  >
                    {replayState.message}
                  </div>
                ) : null}
              </div>
            </ActionDialog>
          ) : null}
          <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-700">
            Last refresh {new Date(detail.refreshedAt).toLocaleString()}
          </div>
          <PostureBadge value={detail.node.posture} />
        </div>
      </section>

      <ActionDialog
        description={
          selectedEscalatedEvent
            ? `Replay only ${selectedEscalatedEvent.eventType} and record why this packet should move back into the active enterprise outbox.`
            : "Replay one escalated packet and capture an operator note."
        }
        hideTrigger
        onOpenChange={(open) => {
          if (!open) {
            setSelectedEscalatedEvent(null);
          }
        }}
        open={selectedEscalatedEvent !== null}
        title="Replay single downstream packet"
        triggerLabel="Replay single packet"
        widthClassName="max-w-2xl"
      >
        {selectedEscalatedEvent ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              {selectedEscalatedEvent.eventType} on {selectedEscalatedEvent.aggregateType} is{" "}
              {toLabel(selectedEscalatedEvent.status)} and will be requeued individually.
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-stone-700">
                <span className="block font-semibold text-stone-900">Operator name</span>
                <input
                  className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                  onChange={(event) => setEventReplayOperatorName(event.target.value)}
                  placeholder="Flash ERP operator"
                  value={eventReplayOperatorName}
                />
              </label>
              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                <p className="font-semibold text-stone-900">Packet reference</p>
                <p className="mt-1 break-all text-xs text-stone-500">
                  {selectedEscalatedEvent.idempotencyKey}
                </p>
              </div>
              <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                <span className="block font-semibold text-stone-900">Audit note</span>
                <textarea
                  className="min-h-28 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                  onChange={(event) => setEventReplayNote(event.target.value)}
                  placeholder="Describe why this packet is being replayed."
                  value={eventReplayNote}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="inline-flex items-center justify-center rounded-2xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={replayState.status === "submitting"}
                onClick={() => void handleReplayEvent()}
                type="button"
              >
                {replayState.status === "submitting" ? "Requeueing packet..." : "Replay packet"}
              </button>
              <button
                className="inline-flex items-center justify-center rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                onClick={() => setSelectedEscalatedEvent(null)}
                type="button"
              >
                Cancel
              </button>
            </div>
            {replayState.message ? (
              <div
                className={`rounded-2xl px-4 py-3 text-sm ${
                  replayState.status === "error"
                    ? "border border-rose-200 bg-rose-50 text-rose-800"
                    : "border border-sky-200 bg-sky-50 text-sky-800"
                }`}
              >
                {replayState.message}
              </div>
            ) : null}
          </div>
        ) : null}
      </ActionDialog>

      <section className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          hint="Upstream packets enterprise has accepted from this store node."
          icon={Inbox}
          label="Inbound received"
          value={numberFormatter.format(detail.metrics.inboundReceived)}
        />
        <MetricCard
          hint="Enterprise-owned packets still waiting to apply in-store."
          icon={HardDriveDownload}
          label="Downstream pending"
          value={numberFormatter.format(detail.metrics.downstreamPending)}
        />
        <MetricCard
          hint="Packets that need replay or operator review before delivery can continue."
          icon={AlertTriangle}
          label="Escalated"
          value={numberFormatter.format(detail.metrics.downstreamEscalated)}
        />
        <MetricCard
          hint="Packets already acknowledged back to enterprise by this node."
          icon={CheckCircle2}
          label="Acknowledged"
          value={numberFormatter.format(detail.metrics.downstreamAcknowledged)}
        />
      </section>

      <WorkspaceTabs
        ariaLabel="Store node sync views"
        defaultValue="overview"
        summaries={{
          overview:
            "See the node identity, enterprise checkpoint, and the recovery posture that operations should respond to first.",
          inbound:
            "Review the upstream history enterprise has already accepted from the store desktop.",
          downstream:
            "Track enterprise-owned packets targeted at this node and isolate escalations quickly."
        }}
        tabs={[
          { value: "overview", label: "Overview", badge: detail.node.posture },
          { value: "inbound", label: "Inbound history" },
          {
            value: "downstream",
            label: "Downstream delivery",
            badge:
              detail.metrics.downstreamEscalated > 0
                ? `${detail.metrics.downstreamEscalated} review`
                : null,
            badgeTone: detail.metrics.downstreamEscalated > 0 ? "warning" : "default"
          }
        ]}
      >
        <WorkspaceTabsContent value="overview">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(22rem,1fr)]">
            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Node identity
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Store</p>
                    <p className="mt-1 text-sm font-semibold text-stone-950">
                      {detail.node.storeName}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">{detail.node.storeCode}</p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Node</p>
                    <p className="mt-1 text-sm font-semibold text-stone-950">{detail.node.name}</p>
                    <p className="mt-1 text-xs text-stone-500">{detail.node.code}</p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                      Terminal
                    </p>
                    <p className="mt-1 text-sm font-semibold text-stone-950">
                      {detail.node.terminalName ?? "Not assigned"}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {detail.node.terminalCode ?? "Terminal binding pending"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                      Enterprise org
                    </p>
                    <p className="mt-1 text-sm font-semibold text-stone-950">
                      {detail.node.retailOrgName}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">{toLabel(detail.node.status)}</p>
                  </div>
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Sync posture
                </p>
                <div className="mt-4 space-y-3">
                  {detail.syncPostureMessages.map((item) => (
                    <div
                      className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800"
                      key={item}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Store-reported queue state
                </p>
                {detail.storeTelemetry ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge value={detail.storeTelemetry.health?.toUpperCase() ?? "UNKNOWN"} />
                      <div className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600">
                        Reported {detail.storeTelemetry.reportedAtLabel}
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                        <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                          Upstream queue
                        </p>
                        <p className="mt-1 font-semibold text-stone-950">
                          {numberFormatter.format(detail.storeTelemetry.upstreamQueued)} queued /{" "}
                          {numberFormatter.format(detail.storeTelemetry.upstreamInFlight)} in flight
                        </p>
                      </div>
                      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                        <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                          Downstream queue
                        </p>
                        <p className="mt-1 font-semibold text-stone-950">
                          {numberFormatter.format(detail.storeTelemetry.downstreamQueued)} pending /{" "}
                          {numberFormatter.format(detail.storeTelemetry.deadLetter)} dead-letter
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                        <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                          Last store sync
                        </p>
                        <p className="mt-1 font-semibold text-stone-950">
                          {detail.storeTelemetry.lastSyncAtLabel}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {detail.storeTelemetry.lastSyncAt
                            ? new Date(detail.storeTelemetry.lastSyncAt).toLocaleString()
                            : "The store has not reported a completed sync yet"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                        <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                          Last local write
                        </p>
                        <p className="mt-1 font-semibold text-stone-950">
                          {detail.storeTelemetry.lastLocalWriteAtLabel}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {detail.storeTelemetry.lastLocalWriteAt
                            ? new Date(detail.storeTelemetry.lastLocalWriteAt).toLocaleString()
                            : "No local write has been reported yet"}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                    This node has not posted live store telemetry yet. Enterprise will fall back
                    to checkpoint and downstream outbox data until the desktop app reports queue
                    pressure.
                  </div>
                )}
              </article>
            </div>

            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                      Sync policy
                    </p>
                    <p className="mt-1 text-sm text-stone-600">
                      Next scheduled {detail.syncPolicy.nextScheduledSyncAtLabel}
                    </p>
                  </div>
                  <CalendarClock className="h-5 w-5 text-stone-400" />
                </div>
                <div className="mt-4 grid gap-3">
                  <label className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-800">
                    Auto sync
                    <input
                      checked={policyDraft.autoSyncEnabled}
                      className="h-4 w-4 accent-[var(--brand)]"
                      onChange={(event) =>
                        setPolicyDraft((current) => ({
                          ...current,
                          autoSyncEnabled: event.target.checked
                        }))
                      }
                      type="checkbox"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">Interval minutes</span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        min="1"
                        onChange={(event) =>
                          setPolicyDraft((current) => ({
                            ...current,
                            intervalMinutes: event.target.value
                          }))
                        }
                        type="number"
                        value={policyDraft.intervalMinutes}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">Jitter seconds</span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        min="0"
                        onChange={(event) =>
                          setPolicyDraft((current) => ({
                            ...current,
                            jitterSeconds: event.target.value
                          }))
                        }
                        type="number"
                        value={policyDraft.jitterSeconds}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">Active from</span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setPolicyDraft((current) => ({
                            ...current,
                            activeFrom: event.target.value
                          }))
                        }
                        type="time"
                        value={policyDraft.activeFrom}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">Active to</span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        onChange={(event) =>
                          setPolicyDraft((current) => ({
                            ...current,
                            activeTo: event.target.value
                          }))
                        }
                        type="time"
                        value={policyDraft.activeTo}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">Backoff base</span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        min="1"
                        onChange={(event) =>
                          setPolicyDraft((current) => ({
                            ...current,
                            backoffBaseSeconds: event.target.value
                          }))
                        }
                        type="number"
                        value={policyDraft.backoffBaseSeconds}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-stone-700">
                      <span className="block font-semibold text-stone-900">Backoff max</span>
                      <input
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                        min="1"
                        onChange={(event) =>
                          setPolicyDraft((current) => ({
                            ...current,
                            backoffMaxSeconds: event.target.value
                          }))
                        }
                        type="number"
                        value={policyDraft.backoffMaxSeconds}
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 text-sm text-stone-700 sm:grid-cols-2">
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                        Last scheduled
                      </p>
                      <p className="mt-1 font-semibold text-stone-950">
                        {detail.syncPolicy.lastAutoSyncAtLabel}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                        Last manual
                      </p>
                      <p className="mt-1 font-semibold text-stone-950">
                        {detail.syncPolicy.lastManualSyncAtLabel}
                      </p>
                    </div>
                  </div>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={policyState.status === "submitting"}
                    onClick={() => void handlePolicySave()}
                    type="button"
                  >
                    <Save className="h-4 w-4" />
                    {policyState.status === "submitting" ? "Saving..." : "Save policy"}
                  </button>
                  {policyState.message ? (
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm ${
                        policyState.status === "error"
                          ? "border border-rose-200 bg-rose-50 text-rose-800"
                          : "border border-sky-200 bg-sky-50 text-sky-800"
                      }`}
                    >
                      {policyState.message}
                    </div>
                  ) : null}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                      Enterprise checkpoint
                    </p>
                    <p className="mt-1 text-sm text-stone-600">
                      Remote node {detail.checkpoint?.remoteNodeCode ?? detail.node.code}
                    </p>
                  </div>
                  <RefreshCcw className="h-5 w-5 text-stone-400" />
                </div>
                <div className="mt-4 space-y-3 text-sm text-stone-700">
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                      Last heartbeat
                    </p>
                    <p className="mt-1 font-medium text-stone-950">
                      {detail.timings.lastHeartbeatLabel}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {detail.timings.lastHeartbeatAt
                        ? new Date(detail.timings.lastHeartbeatAt).toLocaleString()
                        : "No heartbeat recorded yet"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                      Last enterprise apply
                    </p>
                    <p className="mt-1 font-medium text-stone-950">
                      {detail.timings.lastCheckpointLabel}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {detail.timings.lastCheckpointAt
                        ? new Date(detail.timings.lastCheckpointAt).toLocaleString()
                        : "No downstream checkpoint has been confirmed yet"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                      Cursor
                    </p>
                    <p className="mt-1 break-all font-medium text-stone-950">
                      {detail.checkpoint?.lastCursor ?? "No cursor stored yet"}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      Last event {detail.checkpoint?.lastEventId ?? "not recorded yet"}
                    </p>
                  </div>
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Recovery priorities
                </p>
                <div className="mt-4 space-y-3">
                  {detail.recoveryPriorities.map((item) => (
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
                  Operator audit
                </p>
                <div className="mt-4 space-y-3">
                  {detail.operatorActions.length > 0 ? (
                    detail.operatorActions.map((action) => (
                      <div
                        className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700"
                        key={action.id}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge value={action.actionType} />
                          <span className="text-xs text-stone-500">
                            {action.operatorName} • {action.createdAtLabel}
                          </span>
                        </div>
                        <p className="mt-2 leading-6 text-stone-800">{action.note}</p>
                        <p className="mt-2 text-xs text-stone-500">
                          {action.eventType ?? "Node-level action"}
                          {action.aggregateType ? ` • ${action.aggregateType}` : ""}
                          {action.eventId ? ` • ${action.eventId}` : ""}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                      No operator interventions have been recorded for this store node yet.
                    </div>
                  )}
                </div>
              </article>
            </div>
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="inbound">
          <SharedDataGrid
            columns={inboundColumns}
            data={detail.inboundRows}
            emptyLabel="Enterprise has not recorded any upstream events from this store node yet."
            exportFileName={`${detail.node.code}-inbound-history`}
            globalFilterFn={inboundFilter}
            searchPlaceholder="Search inbound events, aggregates, or idempotency keys"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="downstream">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]">
            <SharedDataGrid
              columns={downstreamColumns}
              data={detail.downstreamRows}
              emptyLabel="No downstream packets have been targeted at this store node yet."
              exportFileName={`${detail.node.code}-downstream-history`}
              globalFilterFn={downstreamFilter}
              searchPlaceholder="Search downstream packets, aggregates, or idempotency keys"
            />

            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Escalated delivery
                </p>
                <div className="mt-4 space-y-3">
                  {detail.escalatedRows.length > 0 ? (
                    detail.escalatedRows.map((row) => (
                      <div
                        className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
                        key={row.eventId}
                      >
                        <p className="font-semibold">{row.eventType}</p>
                        <p className="mt-1">{row.diagnosticSummary}</p>
                        <p className="mt-1 text-xs">
                          {row.aggregateType} • {row.aggregateId}
                        </p>
                        <p className="mt-1 break-all text-xs text-rose-700">
                          {row.idempotencyKey}
                        </p>
                        <p className="mt-1 text-xs">
                          {toLabel(row.status)} • Created {row.createdAtLabel} • Last attempt{" "}
                          {row.lastAttemptAtLabel} • {row.attemptCount} {row.attemptCount === 1 ? "attempt" : "attempts"}
                        </p>
                        {row.errorMessage ? (
                          <div className="mt-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-900">
                            <span className="block font-semibold">Failure reason</span>
                            <span className="break-words">{row.errorMessage}</span>
                          </div>
                        ) : null}
                        <PayloadPreview value={row.payloadPreview} />
                        <div className="mt-3">
                          <button
                            className="inline-flex items-center justify-center rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 transition hover:border-rose-400 hover:text-rose-900"
                            onClick={() => openEventReplay(row)}
                            type="button"
                          >
                            Replay packet
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      No escalated downstream packets are blocking this node right now.
                    </div>
                  )}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Recent operator actions
                </p>
                <div className="mt-4 space-y-3">
                  {detail.operatorActions.length > 0 ? (
                    detail.operatorActions.slice(0, 4).map((action) => (
                      <div
                        className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700"
                        key={action.id}
                      >
                        <p className="font-semibold text-stone-900">{action.operatorName}</p>
                        <p className="mt-1 leading-6">{action.note}</p>
                        <p className="mt-2 text-xs text-stone-500">
                          {toLabel(action.actionType)} • {action.createdAtLabel}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                      The operator audit trail will appear here once packet actions are taken.
                    </div>
                  )}
                </div>
              </article>
            </div>
          </section>
        </WorkspaceTabsContent>
      </WorkspaceTabs>

      <section className="glass-panel rounded-[1.4rem] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
          Enterprise status
        </p>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-stone-600">{detail.statusMessage}</p>
      </section>
    </EnterpriseShell>
  );
}
