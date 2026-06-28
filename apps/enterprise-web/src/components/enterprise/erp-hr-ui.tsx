"use client";

import type { LucideIcon } from "lucide-react";

export type HrMutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

export function formatHrEnum(value: string | null | undefined) {
  if (!value) return "Not set";
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function HrStatusBadge({ value }: { value: string }) {
  const className =
    value === "ACTIVE" || value === "APPROVED" || value === "PRESENT"
      ? "bg-emerald-100 text-emerald-800"
      : value === "SUBMITTED" || value === "LATE"
        ? "bg-amber-100 text-amber-800"
        : value === "REJECTED" || value === "TERMINATED" || value === "ABSENT"
          ? "bg-rose-100 text-rose-800"
          : "bg-stone-200 text-stone-700";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{formatHrEnum(value)}</span>;
}

export function HrMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number }) {
  return (
    <div className="flex min-h-20 items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3">
      <div>
        <p className="text-xs font-semibold uppercase text-stone-500">{label}</p>
        <p className="mt-1 text-xl font-semibold text-stone-950">{value}</p>
      </div>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 text-stone-700">
        <Icon className="h-5 w-5" />
      </div>
    </div>
  );
}

export function HrMutationNotice({ state }: { state: HrMutationState }) {
  if (state.status === "idle") return null;
  return (
    <div className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${state.status === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : state.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}>
      {state.message}
    </div>
  );
}

export function HrFieldInput({ disabled = false, label, onChange, placeholder, step, type = "text", value }: {
  disabled?: boolean;
  label: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  step?: string;
  type?: "date" | "datetime-local" | "email" | "number" | "tel" | "text" | "time";
  value: string | number | null | undefined;
}) {
  return (
    <label className="space-y-1.5 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <input className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500" disabled={disabled} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} step={step} type={type} value={value ?? ""} />
    </label>
  );
}

export function HrFieldSelect({ disabled = false, label, onChange, options, value }: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string | null | undefined;
}) {
  return (
    <label className="space-y-1.5 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <select className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-stone-100" disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value ?? ""}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function HrFieldTextArea({ disabled = false, label, onChange, value }: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string | null | undefined;
}) {
  return (
    <label className="space-y-1.5 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <textarea className="min-h-20 w-full resize-y rounded-xl border border-stone-300 bg-white px-3 py-2.5 outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-stone-100" disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value ?? ""} />
    </label>
  );
}

export function HrCheckbox({ checked, disabled = false, label, onChange }: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-stone-800">
      <input checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      {label}
    </label>
  );
}

export function HrDialogFooter({ isSubmitting, onCancel, onSave, saveLabel = "Save" }: {
  isSubmitting: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
      <button className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50" onClick={onCancel} type="button">Cancel</button>
      <button className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60" disabled={isSubmitting} onClick={onSave} type="button">{isSubmitting ? "Saving..." : saveLabel}</button>
    </div>
  );
}
