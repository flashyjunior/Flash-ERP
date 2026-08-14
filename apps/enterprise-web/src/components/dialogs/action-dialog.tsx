"use client";

import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils/cn";

type ActionDialogProps = {
  title: string;
  description?: string;
  triggerLabel: string;
  triggerIcon?: LucideIcon;
  children: ReactNode;
  widthClassName?: string;
  triggerClassName?: string;
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ActionDialog({
  title,
  description,
  triggerLabel,
  triggerIcon: TriggerIcon,
  children,
  widthClassName,
  triggerClassName,
  hideTrigger = false,
  open,
  onOpenChange
}: ActionDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  function setOpen(nextValue: boolean) {
    if (!isControlled) {
      setInternalOpen(nextValue);
    }

    onOpenChange?.(nextValue);
  }

  return (
    <>
      {!hideTrigger && triggerLabel ? (
        <button
          className={cn(
            "inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-[var(--brand)] hover:text-stone-950",
            triggerClassName
          )}
          onClick={() => setOpen(true)}
          type="button"
        >
          {TriggerIcon ? <TriggerIcon className="h-4 w-4" /> : null}
          {triggerLabel}
        </button>
      ) : null}

      {mounted && isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[90] bg-slate-950/45 px-4 py-6 backdrop-blur-[2px] sm:px-6"
              onMouseDown={() => setOpen(false)}
            >
              <div
                aria-describedby={description ? descriptionId : undefined}
                aria-labelledby={titleId}
                aria-modal="true"
                className={cn(
                  "mx-auto flex max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden rounded-[1.75rem] border border-stone-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,236,226,0.95))] shadow-[0_28px_80px_rgba(15,23,42,0.24)]",
                  widthClassName ?? "max-w-4xl"
                )}
                onMouseDown={(event) => event.stopPropagation()}
                role="dialog"
              >
                <div className="flex items-start justify-between gap-4 border-b border-stone-200/80 px-5 py-4 sm:px-6">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">
                      Enterprise action
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-stone-950" id={titleId}>{title}</h2>
                    {description ? (
                      <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-stone-500" id={descriptionId}>
                        {description}
                      </p>
                    ) : null}
                  </div>

                  <button
                    aria-label="Close dialog"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-600 transition hover:border-stone-400 hover:text-stone-950"
                    onClick={() => setOpen(false)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
