"use client";

import { Copy, Eye, ReceiptText, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";

import { RichTextTemplateField } from "@/components/templates/rich-text-template-field";
import {
  defaultGoodsReceiptTemplateHtml,
  defaultThermalReceiptTemplateHtml,
  renderThermalReceiptTemplatePreview,
  thermalReceiptTemplateTokens
} from "@/lib/templates/thermal-receipt-templates";
import type {
  CreateReceiptTemplateRequest,
  EnterpriseSetupWorkspaceData,
  ReceiptTemplateMutationResponse
} from "@/server/repositories/enterprise-setup.repository";

type ReceiptTemplateRow = EnterpriseSetupWorkspaceData["receiptTemplateRows"][number];

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

const statusOptions = [
  { label: "ACTIVE", value: "ACTIVE" },
  { label: "INACTIVE", value: "INACTIVE" },
  { label: "ARCHIVED", value: "ARCHIVED" }
] as const;

function emptyReceiptTemplateDraft(): CreateReceiptTemplateRequest {
  return {
    receiptTemplateCode: "",
    name: "",
    description: "",
    templateHtml: defaultThermalReceiptTemplateHtml,
    paperWidthMm: 80,
    isDefault: false,
    status: "ACTIVE"
  };
}

function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "ACTIVE"
      ? "bg-emerald-100 text-emerald-700"
      : value === "INACTIVE"
        ? "bg-amber-100 text-amber-700"
        : "bg-stone-200 text-stone-700";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {value}
    </span>
  );
}

function mapTemplateRowToDraft(template: ReceiptTemplateRow): CreateReceiptTemplateRequest {
  return {
    receiptTemplateCode: template.receiptTemplateCode,
    name: template.name,
    description: template.description ?? "",
    templateHtml: template.templateHtml,
    paperWidthMm: template.paperWidthMm >= 200 ? 210 : 80,
    isDefault: template.isDefault,
    status: template.status
  };
}

function getPaperKind(paperWidthMm: number | null | undefined) {
  return paperWidthMm && paperWidthMm >= 200 ? "A4" : "THERMAL";
}

export function EnterpriseReceiptTemplatePanel({
  templates
}: {
  templates: ReceiptTemplateRow[];
}) {
  const router = useRouter();
  const [editingReceiptTemplateCode, setEditingReceiptTemplateCode] = useState<string | null>(
    templates[0]?.receiptTemplateCode ?? null
  );
  const [draft, setDraft] = useState<CreateReceiptTemplateRequest>(
    templates[0] ? mapTemplateRowToDraft(templates[0]) : emptyReceiptTemplateDraft()
  );
  const [saveState, setSaveState] = useState<MutationState>({
    status: "idle",
    message: ""
  });

  useEffect(() => {
    if (editingReceiptTemplateCode) {
      const matchingTemplate = templates.find(
        (template) => template.receiptTemplateCode === editingReceiptTemplateCode
      );

      if (matchingTemplate) {
        setDraft(mapTemplateRowToDraft(matchingTemplate));
        return;
      }
      if (templates[0]) {
        setEditingReceiptTemplateCode(templates[0].receiptTemplateCode);
      }
      return;
    }

    if (templates.length === 0) {
      setDraft(emptyReceiptTemplateDraft());
    }
  }, [editingReceiptTemplateCode, templates]);

  const paperKind = getPaperKind(draft.paperWidthMm);
  const previewTitle = paperKind === "A4" ? "A4 document" : "80mm thermal slip";
  const defaultTemplateForPaper =
    paperKind === "A4" ? defaultGoodsReceiptTemplateHtml : defaultThermalReceiptTemplateHtml;
  const previewHtml = useMemo(
    () => renderThermalReceiptTemplatePreview(draft.templateHtml || defaultTemplateForPaper),
    [defaultTemplateForPaper, draft.templateHtml]
  );

  function startCreateTemplate() {
    setEditingReceiptTemplateCode(null);
    setDraft(emptyReceiptTemplateDraft());
    setSaveState({ status: "idle", message: "" });
  }

  function duplicateCurrentTemplate() {
    setEditingReceiptTemplateCode(null);
    setDraft((current) => ({
      ...current,
      receiptTemplateCode: "",
      name: current.name ? `${current.name} Copy` : "Receipt Template Copy",
      isDefault: false
    }));
    setSaveState({ status: "idle", message: "" });
  }

  function changePaperKind(nextKind: "THERMAL" | "A4") {
    setDraft((current) => {
      const nextPaperWidthMm = nextKind === "A4" ? 210 : 80;
      const currentHtml = current.templateHtml.trim();
      const shouldSwapStarter =
        !currentHtml ||
        currentHtml === defaultThermalReceiptTemplateHtml ||
        currentHtml === defaultGoodsReceiptTemplateHtml;

      return {
        ...current,
        paperWidthMm: nextPaperWidthMm,
        templateHtml: shouldSwapStarter
          ? nextKind === "A4"
            ? defaultGoodsReceiptTemplateHtml
            : defaultThermalReceiptTemplateHtml
          : current.templateHtml
      };
    });
  }

  async function saveTemplate() {
    setSaveState({
      status: "submitting",
      message: "Flash ERP is saving the receipt template library."
    });

    try {
      const response = await fetch(
        editingReceiptTemplateCode
          ? `/api/setup/receipt-templates/${encodeURIComponent(editingReceiptTemplateCode)}`
          : "/api/setup/receipt-templates",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(draft)
        }
      );
      const payload = (await response.json()) as Partial<ReceiptTemplateMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save that receipt template.");
      }

      setSaveState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the receipt template."
      });
      if (payload.receiptTemplateCode) {
        setEditingReceiptTemplateCode(payload.receiptTemplateCode);
      }

      startTransition(() => {
        window.setTimeout(() => {
          router.refresh();
        }, 500);
      });
    } catch (error) {
      setSaveState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save that receipt template."
      });
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(18rem,23rem)_minmax(0,1fr)]">
      <article className="glass-panel rounded-[1.35rem] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Template library
            </p>
            <h3 className="mt-1 text-lg font-semibold text-stone-950">Print template designs</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Thermal receipts and account payments stay narrow; purchasing and goods documents can use A4.
            </p>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] text-white shadow-[0_14px_30px_rgba(29,78,216,0.28)]">
            <ReceiptText className="h-5 w-5" />
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="inline-flex items-center justify-center rounded-full border border-[color:var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-4 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[color:var(--brand)]"
            onClick={startCreateTemplate}
            type="button"
          >
            New template
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
            onClick={duplicateCurrentTemplate}
            type="button"
          >
            <Copy className="h-4 w-4" />
            Duplicate
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {templates.map((template) => {
            const isSelected = editingReceiptTemplateCode === template.receiptTemplateCode;

            return (
              <button
                className={`w-full rounded-[1.2rem] border px-4 py-4 text-left transition ${
                  isSelected
                    ? "border-[var(--brand)] bg-[color:rgba(37,99,235,0.08)] shadow-[0_16px_30px_rgba(29,78,216,0.12)]"
                    : "border-stone-200 bg-white hover:border-stone-300"
                }`}
                key={template.receiptTemplateCode}
                onClick={() => {
                  setEditingReceiptTemplateCode(template.receiptTemplateCode);
                  setSaveState({ status: "idle", message: "" });
                }}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-stone-900">{template.name}</p>
                    <p className="mt-1 truncate text-xs uppercase tracking-[0.14em] text-stone-500">
                      {template.receiptTemplateCode}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {template.isDefault ? (
                      <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
                        Default
                      </span>
                    ) : null}
                    <StatusBadge value={template.status} />
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-stone-600">
                  {template.description ?? "No template description has been added yet."}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-medium text-stone-500">
                  <span>{template.paperWidthMm >= 200 ? "A4 document" : `${template.paperWidthMm}mm thermal`}</span>
                  <span>{template.linkedStoreCount} linked store(s)</span>
                  <span>Updated {template.updatedAtLabel}</span>
                </div>
              </button>
            );
          })}

          {templates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white/85 px-4 py-6 text-sm leading-6 text-stone-600">
              No receipt templates exist yet. Start with the SMS-style starter and publish your
              first print design from this page.
            </div>
          ) : null}
        </div>
      </article>

      <div className="space-y-4">
        <article className="glass-panel rounded-[1.35rem] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Receipt designer
              </p>
              <h3 className="mt-1 text-lg font-semibold text-stone-950">
                {editingReceiptTemplateCode ? `Edit ${previewTitle}` : `Create ${previewTitle}`}
              </h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Pick the paper type first, then edit the matching starter layout and token blocks.
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
              Stores link these templates from the Stores workspace.
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-stone-700">
              <span className="block font-semibold text-stone-900">Template code</span>
              <input
                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)] disabled:bg-stone-50 disabled:text-stone-500"
                disabled={Boolean(editingReceiptTemplateCode)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    receiptTemplateCode: event.target.value
                  }))
                }
                placeholder="thermal-sales-starter"
                value={draft.receiptTemplateCode}
              />
            </label>
            <label className="space-y-2 text-sm text-stone-700">
              <span className="block font-semibold text-stone-900">Template name</span>
              <input
                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }
                placeholder="Flash ERP Thermal Starter"
                value={draft.name}
              />
            </label>
            <label className="space-y-2 text-sm text-stone-700 md:col-span-2">
              <span className="block font-semibold text-stone-900">Description</span>
              <textarea
                className="min-h-24 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value
                  }))
                }
                value={draft.description ?? ""}
              />
            </label>
            <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
              <input
                checked={draft.isDefault ?? false}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    isDefault: event.target.checked
                  }))
                }
                type="checkbox"
              />
              Make this the enterprise default template for new stores
            </label>
            <label className="space-y-2 text-sm text-stone-700">
              <span className="block font-semibold text-stone-900">Preview / paper type</span>
              <select
                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                onChange={(event) => changePaperKind(event.target.value === "A4" ? "A4" : "THERMAL")}
                value={paperKind}
              >
                <option value="THERMAL">80mm thermal</option>
                <option value="A4">A4 document</option>
              </select>
            </label>
            <label className="space-y-2 text-sm text-stone-700">
              <span className="block font-semibold text-stone-900">Status</span>
              <select
                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value
                  }))
                }
                value={draft.status ?? "ACTIVE"}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5">
            <RichTextTemplateField
              defaultTemplate={defaultTemplateForPaper}
              description={
                paperKind === "A4"
                  ? "Customize the A4 document template with document metadata, totals, item tables, notes, and controlled header/footer blocks."
                  : "Customize the 80mm thermal slip with receipt metadata, totals, item/payment tables, and store-controlled header/footer blocks."
              }
              label={paperKind === "A4" ? "A4 document template" : "Thermal receipt template"}
              minHeight={560}
              name="thermalReceiptTemplateHtml"
              onValueChange={(templateHtml) =>
                setDraft((current) => ({
                  ...current,
                  templateHtml
                }))
              }
              tokens={thermalReceiptTemplateTokens}
              value={draft.templateHtml || defaultTemplateForPaper}
            />
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              onClick={startCreateTemplate}
              type="button"
            >
              Reset draft
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={
                saveState.status === "submitting" ||
                !draft.receiptTemplateCode.trim() ||
                !draft.name.trim() ||
                !draft.templateHtml.trim()
              }
              onClick={() => void saveTemplate()}
              type="button"
            >
              {saveState.status === "submitting" ? "Saving..." : "Save template"}
            </button>
          </div>

          {saveState.message ? (
            <div
              className={`mt-4 rounded-2xl border px-4 py-3 text-sm leading-6 ${
                saveState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {saveState.message}
            </div>
          ) : null}
        </article>

        <article className="glass-panel rounded-[1.35rem] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Live preview
              </p>
              <h3 className="mt-1 text-lg font-semibold text-stone-950">{previewTitle}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Flash ERP renders the template below against sample receipt data so you can validate
                spacing and structure before linking it to a store.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-stone-600">
              <Eye className="h-3.5 w-3.5" />
              Preview
            </div>
          </div>

          <div className={`mt-5 grid gap-4 ${paperKind === "A4" ? "xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.45fr)]" : "lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"}`}>
            <div className="rounded-[1.45rem] border border-stone-200 bg-[linear-gradient(180deg,#f8fafc,#edf2f7)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
              <div className={`mx-auto w-full border border-stone-300 bg-white shadow-[0_28px_60px_rgba(28,25,23,0.14)] ${paperKind === "A4" ? "max-w-[48rem] min-h-[38rem] rounded-lg px-[2rem] py-[2rem]" : "max-w-[24rem] rounded-[1.35rem] px-[1.6rem] py-[1.1rem]"}`}>
                <div
                  className="document-template-html document-template-html--receipt text-[13px] leading-6 text-stone-900"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
                {paperKind === "A4"
                  ? "A4 is the correct preview for purchase order, goods receipt, and other document-style templates."
                  : "Thermal is the correct preview for sales receipt and account payment receipt templates."}
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                Link these templates to stores from the Stores workspace. Store-level header and
                footer text still flow in separately, so one enterprise template can serve many
                branches cleanly.
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                <div className="flex items-center gap-2 font-semibold text-stone-900">
                  <Store className="h-4 w-4" />
                  Link workflow
                </div>
                <p className="mt-2">
                  1. Design or update the template here.
                  <br />
                  2. Open a store profile in Stores.
                  <br />
                  3. Select the template to link that store to this print design.
                </p>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
