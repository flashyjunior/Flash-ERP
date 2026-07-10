"use client";

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils/cn";

type ConfirmationTone = "default" | "danger" | "success" | "warning";

type ConfirmationDialogProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  description?: ReactNode;
  initialNote?: string;
  isSubmitting?: boolean;
  noteLabel?: string;
  notePlaceholder?: string;
  noteRequired?: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
  open: boolean;
  title: string;
  tone?: ConfirmationTone;
};

const toneStyles: Record<ConfirmationTone, { icon: typeof Info; iconClassName: string; buttonClassName: string }> = {
  default: {
    icon: Info,
    iconClassName: "bg-sky-50 text-sky-700",
    buttonClassName: "bg-[var(--brand)] text-white hover:bg-blue-700"
  },
  danger: {
    icon: AlertTriangle,
    iconClassName: "bg-rose-50 text-rose-700",
    buttonClassName: "bg-rose-600 text-white hover:bg-rose-700"
  },
  success: {
    icon: CheckCircle2,
    iconClassName: "bg-emerald-50 text-emerald-700",
    buttonClassName: "bg-emerald-600 text-white hover:bg-emerald-700"
  },
  warning: {
    icon: AlertTriangle,
    iconClassName: "bg-amber-50 text-amber-700",
    buttonClassName: "bg-amber-600 text-white hover:bg-amber-700"
  }
};

export function ConfirmationDialog({
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  description,
  initialNote = "",
  isSubmitting = false,
  noteLabel,
  notePlaceholder,
  noteRequired = false,
  onCancel,
  onConfirm,
  open,
  title,
  tone = "default"
}: ConfirmationDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [note, setNote] = useState(initialNote);
  const styles = toneStyles[tone];
  const Icon = styles.icon;
  const noteMissing = Boolean(noteLabel && noteRequired && !note.trim());

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    setNote(initialNote);
    const previousOverflow = document.body.style.overflow;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        onCancel();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [initialNote, isSubmitting, onCancel, open]);

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[95] grid place-items-center bg-slate-950/45 px-4 py-6 backdrop-blur-[2px]">
      <section className="w-full max-w-lg overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.24)]">
        <div className="flex items-start gap-4 border-b border-slate-200 px-5 py-4">
          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", styles.iconClassName)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Confirmation
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{title}</h2>
            {description ? (
              <div className="mt-2 text-sm leading-6 text-slate-600">{description}</div>
            ) : null}
          </div>
          <button
            aria-label="Close confirmation"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-950"
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {noteLabel ? (
          <div className="px-5 py-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-900">{noteLabel}</span>
              <textarea
                className="min-h-[7rem] w-full resize-y rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--brand)]"
                onChange={(event) => setNote(event.target.value)}
                placeholder={notePlaceholder}
                value={note}
              />
            </label>
            {noteMissing ? (
              <p className="mt-2 text-xs font-semibold text-rose-700">A note is required before continuing.</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
              styles.buttonClassName
            )}
            disabled={isSubmitting || noteMissing}
            onClick={() => onConfirm(note)}
            type="button"
          >
            {isSubmitting ? "Working..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
