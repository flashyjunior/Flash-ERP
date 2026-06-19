"use client";

import type { StoreNodeInboundActionResponse } from "@flash-erp/sync-core";
import { AlertTriangle, ArrowLeft, ReceiptText, Store, Waypoints } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type { EnterprisePosExceptionDetailData } from "@/server/repositories/enterprise-pos.repository";

function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "FAILED" || value === "DEAD_LETTER"
      ? "bg-rose-100 text-rose-700"
      : value === "ACKNOWLEDGED"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-sky-100 text-sky-700";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {value
        .toLowerCase()
        .split("_")
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ")}
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
          <p className="mt-2 text-[1.25rem] font-semibold text-stone-950">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] text-white shadow-[0_14px_30px_rgba(29,78,216,0.28)]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-600">{hint}</p>
    </article>
  );
}

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

export function EnterprisePosExceptionDetail({
  detail
}: {
  detail: EnterprisePosExceptionDetailData;
}) {
  const router = useRouter();
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: detail.currencyCode
      }),
    [detail.currencyCode]
  );
  const [isReprocessOpen, setIsReprocessOpen] = useState(false);
  const [isResendOpen, setIsResendOpen] = useState(false);
  const [reprocessOperatorName, setReprocessOperatorName] = useState("Flash ERP operator");
  const [reprocessNote, setReprocessNote] = useState(
    `Reprocessing ${detail.event.eventType} after operator review for ${detail.event.storeName}.`
  );
  const [resendOperatorName, setResendOperatorName] = useState("Flash ERP operator");
  const [resendNote, setResendNote] = useState(
    `Requesting a clean resend for ${detail.event.eventType} from ${detail.event.storeName} after operator review.`
  );
  const [reprocessState, setReprocessState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string | null;
  }>({
    status: "idle",
    message: null
  });
  const [resendState, setResendState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string | null;
  }>({
    status: "idle",
    message: null
  });

  async function submitInboundAction(
    path: string,
    input: {
      note: string;
      operatorName: string;
    },
    setState: (value: {
      status: "idle" | "submitting" | "success" | "error";
      message: string | null;
    }) => void
  ) {
    setState({
      status: "submitting",
      message: "Flash ERP is applying the operator action."
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
        | StoreNodeInboundActionResponse
        | {
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Flash ERP could not apply the operator action for this inbound packet."
        );
      }

      const actionPayload = payload as StoreNodeInboundActionResponse;
      setState({
        status: "success",
        message: actionPayload.message
      });

      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not apply the operator action for this inbound packet."
      });
    }
  }

  async function handleReprocess() {
    await submitInboundAction(
      `/api/sync/store-nodes/${detail.event.sourceNodeCode}/inbound/${detail.event.id}/reprocess`,
      {
        note: reprocessNote,
        operatorName: reprocessOperatorName
      },
      setReprocessState
    );
  }

  async function handleRequestResend() {
    await submitInboundAction(
      `/api/sync/store-nodes/${detail.event.sourceNodeCode}/inbound/${detail.event.id}/request-resend`,
      {
        note: resendNote,
        operatorName: resendOperatorName
      },
      setResendState
    );
  }

  return (
    <EnterpriseShell
      activeSection="pos"
      description={`Inspect failed upstream packet ${detail.event.eventType}, confirm the store and transaction context, and move into the right recovery workspace with the right identifiers.`}
      eyebrow={`Flash ERP enterprise • ${detail.event.storeCode}`}
      heading={`POS exception ${detail.event.id}`}
    >
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
            href="/pos"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to POS command
          </Link>
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
            href={`/sync/nodes/${detail.event.sourceNodeCode}`}
          >
            Open source node
          </Link>
          {detail.relatedTransaction ? (
            <Link
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
              href={`/pos/transactions/${encodeURIComponent(detail.relatedTransaction.transactionNo)}`}
            >
              Open related transaction
            </Link>
          ) : null}
          {detail.relatedInventoryEntry ? (
            <Link
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
              href={`/operations/inventory/${encodeURIComponent(detail.relatedInventoryEntry.entryId)}`}
            >
              Open inventory movement
            </Link>
          ) : null}
          {detail.availableActions.canReprocess ? (
            <ActionDialog
              description="Retry enterprise projection for this exact inbound packet and capture an operator note for the audit trail."
              onOpenChange={setIsReprocessOpen}
              open={isReprocessOpen}
              title="Reprocess inbound packet"
              triggerLabel="Reprocess packet"
              triggerClassName="border-sky-300 bg-sky-50 text-sky-900 hover:border-sky-400 hover:text-sky-950"
              widthClassName="max-w-2xl"
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
                  Flash ERP will attempt enterprise projection again for {detail.event.eventType} on{" "}
                  {detail.event.storeName}.
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Operator name</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setReprocessOperatorName(event.target.value)}
                      placeholder="Flash ERP operator"
                      value={reprocessOperatorName}
                    />
                  </label>
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                    <p className="font-semibold text-stone-900">Packet</p>
                    <p className="mt-1 break-all text-xs text-stone-500">
                      {detail.event.idempotencyKey}
                    </p>
                  </div>
                  <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                    <span className="block font-semibold text-stone-900">Audit note</span>
                    <textarea
                      className="min-h-28 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setReprocessNote(event.target.value)}
                      placeholder="Describe why this packet is being reprocessed."
                      value={reprocessNote}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="inline-flex items-center justify-center rounded-2xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={reprocessState.status === "submitting"}
                    onClick={() => void handleReprocess()}
                    type="button"
                  >
                    {reprocessState.status === "submitting"
                      ? "Reprocessing packet..."
                      : "Reprocess packet"}
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    onClick={() => setIsReprocessOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
                {reprocessState.message ? (
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm ${
                      reprocessState.status === "error"
                        ? "border border-rose-200 bg-rose-50 text-rose-800"
                        : "border border-sky-200 bg-sky-50 text-sky-800"
                    }`}
                  >
                    {reprocessState.message}
                  </div>
                ) : null}
              </div>
            </ActionDialog>
          ) : null}
          {detail.availableActions.canRequestResend ? (
            <ActionDialog
              description="Record that enterprise needs the store to publish a clean replacement packet after the underlying issue is corrected."
              onOpenChange={setIsResendOpen}
              open={isResendOpen}
              title="Request clean resend"
              triggerLabel="Request resend"
              triggerClassName="border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400 hover:text-amber-950"
              widthClassName="max-w-2xl"
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  Use this when the store needs to republish a corrected packet with a new
                  idempotency key instead of reprocessing the existing enterprise copy.
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-stone-700">
                    <span className="block font-semibold text-stone-900">Operator name</span>
                    <input
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setResendOperatorName(event.target.value)}
                      placeholder="Flash ERP operator"
                      value={resendOperatorName}
                    />
                  </label>
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                    <p className="font-semibold text-stone-900">Current status</p>
                    <p className="mt-1 text-xs text-stone-500">{detail.event.status}</p>
                  </div>
                  <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
                    <span className="block font-semibold text-stone-900">Audit note</span>
                    <textarea
                      className="min-h-28 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                      onChange={(event) => setResendNote(event.target.value)}
                      placeholder="Describe what the store needs to resend or correct."
                      value={resendNote}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="inline-flex items-center justify-center rounded-2xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={resendState.status === "submitting"}
                    onClick={() => void handleRequestResend()}
                    type="button"
                  >
                    {resendState.status === "submitting"
                      ? "Recording request..."
                      : "Record resend request"}
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    onClick={() => setIsResendOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
                {resendState.message ? (
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm ${
                      resendState.status === "error"
                        ? "border border-rose-200 bg-rose-50 text-rose-800"
                        : "border border-amber-200 bg-amber-50 text-amber-900"
                    }`}
                  >
                    {resendState.message}
                  </div>
                ) : null}
              </div>
            </ActionDialog>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-700">
            Last refresh {new Date(detail.refreshedAt).toLocaleString()}
          </div>
          <StatusBadge value={detail.event.status} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          hint="Current inbound packet status inside the enterprise projection pipeline."
          icon={AlertTriangle}
          label="Packet status"
          value={detail.event.status}
        />
        <MetricCard
          hint="Aggregate type that enterprise was attempting to project from the store packet."
          icon={Waypoints}
          label="Aggregate"
          value={detail.event.aggregateType}
        />
        <MetricCard
          hint="Store and terminal source currently associated with this upstream packet."
          icon={Store}
          label="Source store"
          value={detail.event.storeCode}
        />
        <MetricCard
          hint="When enterprise most recently received this packet from the store node."
          icon={ReceiptText}
          label="Received"
          value={detail.event.receivedAtLabel}
        />
      </section>

      <WorkspaceTabs
        ariaLabel="POS exception detail views"
        defaultValue="overview"
        summaries={{
          overview:
            "Review the failing packet, derived retail identifiers, and the most likely recovery path.",
          payload:
            "Inspect the raw upstream payload that enterprise received from the store desktop."
        }}
        tabs={[
          { value: "overview", label: "Overview", badge: "Review", badgeTone: "warning" },
          { value: "payload", label: "Payload" }
        ]}
      >
        <WorkspaceTabsContent value="overview">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,1fr)]">
            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Packet identity
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[
                    ["Event", detail.event.eventType],
                    ["Aggregate id", detail.event.aggregateId],
                    ["Idempotency key", detail.event.idempotencyKey],
                    ["Source node", `${detail.event.sourceNodeName} • ${detail.event.sourceNodeCode}`],
                    ["Store", `${detail.event.storeName} • ${detail.event.storeCode}`],
                    [
                      "Terminal",
                      detail.event.terminalCode
                        ? `${detail.event.terminalCode}${
                            detail.event.terminalName ? ` • ${detail.event.terminalName}` : ""
                          }`
                        : "Terminal binding not available"
                    ]
                  ].map(([label, value]) => (
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3" key={label}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        {label}
                      </p>
                      <p className="mt-1 break-all text-sm leading-6 text-stone-800">{value}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Derived retail context
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[
                    ["Transaction no", detail.context.transactionNo ?? "Not provided"],
                    ["Transaction id", detail.context.transactionId ?? "Not provided"],
                    ["External reference", detail.context.externalReference ?? "Not provided"],
                    ["Reference id", detail.context.referenceId ?? "Not provided"],
                    [
                      "Product",
                      detail.context.productCode
                        ? `${detail.context.productCode}${
                            detail.context.productName ? ` • ${detail.context.productName}` : ""
                          }`
                        : "Not provided"
                    ],
                    [
                      "Payload totals",
                      [
                        detail.context.quantity !== null
                          ? `${detail.context.quantity} unit(s)`
                          : null,
                        detail.context.totalAmount !== null
                          ? currencyFormatter.format(detail.context.totalAmount)
                          : null,
                        detail.context.lineCount !== null
                          ? `${detail.context.lineCount} line(s)`
                          : null
                      ]
                        .filter(Boolean)
                        .join(" • ") || "No totals included"
                    ]
                  ].map(([label, value]) => (
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3" key={label}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        {label}
                      </p>
                      <p className="mt-1 break-all text-sm leading-6 text-stone-800">{value}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Recovery guidance
                </p>
                <div className="mt-4 space-y-3">
                  {detail.recoveryMessages.map((message) => (
                    <div
                      className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800"
                      key={message}
                    >
                      {message}
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <div className="space-y-4">
              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Failure state
                </p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800">
                    {detail.event.errorMessage ??
                      "Enterprise did not store a detailed error message for this packet."}
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Received
                    </p>
                    <div className="mt-1">{renderTimestamp(detail.event.receivedAt, detail.event.receivedAtLabel)}</div>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Applied
                    </p>
                    <div className="mt-1">{renderTimestamp(detail.event.appliedAt, detail.event.appliedAtLabel)}</div>
                  </div>
                </div>
              </article>

              {detail.recoveryOutcome ? (
                <article className="glass-panel rounded-[1.35rem] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                    Recovery outcome
                  </p>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
                      {detail.recoveryOutcome.summary}
                    </div>
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge value={detail.recoveryOutcome.latestReplacementEvent.status} />
                        <span className="text-xs text-stone-500">
                          Record version {detail.recoveryOutcome.latestReplacementEvent.recordVersion}
                        </span>
                        {detail.recoveryOutcome.replacementCount > 1 ? (
                          <span className="text-xs text-stone-500">
                            {detail.recoveryOutcome.replacementCount} resend attempts tracked
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                            Replacement packet
                          </p>
                          <p className="mt-1 break-all text-sm leading-6 text-stone-800">
                            {detail.recoveryOutcome.latestReplacementEvent.eventId}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                            Idempotency key
                          </p>
                          <p className="mt-1 break-all text-sm leading-6 text-stone-800">
                            {detail.recoveryOutcome.latestReplacementEvent.idempotencyKey}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                            Received
                          </p>
                          <div className="mt-1">
                            {renderTimestamp(
                              detail.recoveryOutcome.latestReplacementEvent.receivedAt,
                              detail.recoveryOutcome.latestReplacementEvent.receivedAtLabel
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                            Applied
                          </p>
                          <div className="mt-1">
                            {renderTimestamp(
                              detail.recoveryOutcome.latestReplacementEvent.appliedAt,
                              detail.recoveryOutcome.latestReplacementEvent.appliedAtLabel
                            )}
                          </div>
                        </div>
                      </div>
                      {detail.recoveryOutcome.latestReplacementEvent.errorMessage ? (
                        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800">
                          {detail.recoveryOutcome.latestReplacementEvent.errorMessage}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              ) : null}

              <article className="glass-panel rounded-[1.35rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Canonical linkage
                </p>
                {detail.relatedTransaction || detail.relatedInventoryEntry ? (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
                      Enterprise already has canonical records that appear related to this packet.
                    </div>
                    {detail.relatedTransaction ? (
                      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                          Canonical transaction
                        </p>
                        <p className="mt-1 font-semibold text-stone-900">
                          {detail.relatedTransaction.transactionNo}
                        </p>
                        <p className="mt-1">
                          {detail.relatedTransaction.storeName} • {detail.relatedTransaction.storeCode}
                        </p>
                        <p className="mt-1">
                          {currencyFormatter.format(detail.relatedTransaction.totalAmount)} •{" "}
                          {detail.relatedTransaction.completedAtLabel}
                        </p>
                        <div className="mt-3">
                          <StatusBadge value={detail.relatedTransaction.status} />
                        </div>
                      </div>
                    ) : null}
                    {detail.relatedInventoryEntry ? (
                      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                          Canonical inventory movement
                        </p>
                        <p className="mt-1 font-semibold text-stone-900">
                          {detail.relatedInventoryEntry.entryId}
                        </p>
                        <p className="mt-1">
                          {detail.relatedInventoryEntry.productCode} •{" "}
                          {detail.relatedInventoryEntry.productName}
                        </p>
                        <p className="mt-1">
                          {detail.relatedInventoryEntry.movementType} •{" "}
                          {detail.relatedInventoryEntry.quantity} unit(s) •{" "}
                          {detail.relatedInventoryEntry.occurredAtLabel}
                        </p>
                        <p className="mt-1">
                          {detail.relatedInventoryEntry.inventoryLocationCode} •{" "}
                          {detail.relatedInventoryEntry.inventoryLocationName}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {detail.relatedInventoryEntry.storeName && detail.relatedInventoryEntry.storeCode
                            ? `${detail.relatedInventoryEntry.storeName} • ${detail.relatedInventoryEntry.storeCode}`
                            : "Store linkage is not available for this inventory record."}
                          {detail.relatedInventoryEntry.externalReference
                            ? ` • Ref ${detail.relatedInventoryEntry.externalReference}`
                            : ""}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                    No canonical transaction or inventory movement is currently linked to this packet in enterprise.
                  </div>
                )}
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
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                      No operator actions have been recorded for this inbound packet yet.
                    </div>
                  )}
                </div>
              </article>
            </div>
          </section>
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="payload">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(24rem,1fr)]">
            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Payload summary
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {detail.payloadSummary.length > 0 ? (
                  detail.payloadSummary.map((item) => (
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3" key={item.label}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        {item.label}
                      </p>
                      <p className="mt-1 break-all text-sm leading-6 text-stone-800">
                        {item.value}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                    This packet did not expose recognizable POS fields beyond the raw payload.
                  </div>
                )}
              </div>
            </article>

            <article className="glass-panel rounded-[1.35rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Raw payload
              </p>
              <pre className="mt-4 overflow-x-auto rounded-[1.2rem] border border-stone-200 bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">
                {detail.payloadJson}
              </pre>
            </article>
          </section>
        </WorkspaceTabsContent>
      </WorkspaceTabs>

      <section className="glass-panel rounded-[1.4rem] p-5">
        <p className="text-sm leading-6 text-stone-600">{detail.statusMessage}</p>
      </section>
    </EnterpriseShell>
  );
}
