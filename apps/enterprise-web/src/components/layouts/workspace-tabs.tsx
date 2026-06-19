"use client";

import * as Tabs from "@radix-ui/react-tabs";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useState
} from "react";

import { cn } from "@/lib/utils/cn";

type WorkspaceTab = {
  value: string;
  label: string;
  badge?: string | null;
  badgeTone?: "default" | "success" | "warning";
};

type WorkspaceTabsProps = {
  ariaLabel: string;
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  chromeClassName?: string;
  headerClassName?: string;
  listClassName?: string;
  triggerClassName?: string;
  summaryClassName?: string;
  tabs: WorkspaceTab[];
  summaries?: Record<string, string>;
  children: ReactNode;
};

type WorkspaceTabsContentProps = {
  value: string;
  className?: string;
  forceMount?: boolean;
  children: ReactNode;
};

const WorkspaceTabsIdContext = createContext<{ baseId: string } | null>(null);

function toStableTabSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

export function WorkspaceTabs({
  ariaLabel,
  defaultValue,
  value,
  onValueChange,
  className,
  chromeClassName,
  headerClassName,
  listClassName,
  triggerClassName,
  summaryClassName,
  tabs,
  summaries,
  children
}: WorkspaceTabsProps) {
  const generatedId = useId();
  const baseId = `workspace-tabs-${generatedId.replace(/[^a-zA-Z0-9_-]+/g, "")}`;
  const [internalView, setInternalView] = useState(defaultValue);
  const view = value ?? internalView;
  const activeSummary = summaries?.[view] ?? null;

  useEffect(() => {
    if (value === undefined) {
      setInternalView(defaultValue);
    }
  }, [defaultValue, value]);

  function handleValueChange(nextValue: string) {
    if (value === undefined) {
      setInternalView(nextValue);
    }

    onValueChange?.(nextValue);
  }

  return (
    <Tabs.Root
      className={cn("workspace-tabs-root mt-5", className)}
      onValueChange={handleValueChange}
      value={view}
    >
      <div
        className={cn(
          "workspace-tabs-chrome rounded-[1.45rem] border border-stone-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(247,243,237,0.82))] p-3",
          chromeClassName
        )}
      >
        <div
          className={cn(
            "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between",
            headerClassName
          )}
        >
          <Tabs.List
            aria-label={ariaLabel}
            className={cn(
              "workspace-tabs-list flex flex-wrap gap-1 rounded-[1rem] border border-stone-200/80 bg-white/88 p-1 shadow-[0_8px_18px_rgba(62,42,29,0.04)]",
              listClassName
            )}
          >
            {tabs.map((tab) => {
              const tabSegment = toStableTabSegment(tab.value);
              const triggerId = `${baseId}-trigger-${tabSegment}`;
              const contentId = `${baseId}-content-${tabSegment}`;

              return (
                <Tabs.Trigger
                  aria-controls={contentId}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-stone-600 outline-none transition hover:text-stone-800 data-[state=active]:bg-[var(--brand)] data-[state=active]:text-white",
                    triggerClassName
                  )}
                  id={triggerId}
                  key={tab.value}
                  value={tab.value}
                >
                  <span>{tab.label}</span>
                  {tab.badge ? (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                        tab.badgeTone === "success"
                          ? "bg-emerald-100 text-emerald-700 data-[state=active]:bg-white/20 data-[state=active]:text-white"
                          : tab.badgeTone === "warning"
                            ? "bg-amber-100 text-amber-700 data-[state=active]:bg-white/20 data-[state=active]:text-white"
                            : "bg-stone-100 text-stone-600 data-[state=active]:bg-white/20 data-[state=active]:text-white"
                      )}
                    >
                      {tab.badge}
                    </span>
                  ) : null}
                </Tabs.Trigger>
              );
            })}
          </Tabs.List>

          {activeSummary ? (
            <div
              className={cn(
                "workspace-tabs-summary max-w-3xl rounded-full border border-stone-200/75 bg-stone-50/85 px-3 py-1 text-[11px] font-medium leading-4 text-stone-500 sm:text-xs",
                summaryClassName
              )}
            >
              {activeSummary}
            </div>
          ) : null}
        </div>
      </div>

      <WorkspaceTabsIdContext.Provider value={{ baseId }}>
        {children}
      </WorkspaceTabsIdContext.Provider>
    </Tabs.Root>
  );
}

export function WorkspaceTabsContent({
  value,
  className,
  forceMount = false,
  children
}: WorkspaceTabsContentProps) {
  const workspaceTabsId = useContext(WorkspaceTabsIdContext);
  const tabSegment = toStableTabSegment(value);
  const contentId = workspaceTabsId
    ? `${workspaceTabsId.baseId}-content-${tabSegment}`
    : undefined;
  const triggerId = workspaceTabsId
    ? `${workspaceTabsId.baseId}-trigger-${tabSegment}`
    : undefined;

  return (
    <Tabs.Content
      aria-labelledby={triggerId}
      className={cn("workspace-tabs-content mt-4 outline-none", className)}
      id={contentId}
      {...(forceMount ? { forceMount: true as const } : {})}
      value={value}
    >
      {children}
    </Tabs.Content>
  );
}
