"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

export function EnterpriseProfilePasswordPanel() {
  const router = useRouter();
  const [showPasswords, setShowPasswords] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [state, setState] = useState<MutationState>({ status: "idle", message: "" });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentPassword) {
      setState({ status: "error", message: "Enter your current password." });
      return;
    }

    if (!nextPassword) {
      setState({ status: "error", message: "Enter a new password." });
      return;
    }

    if (nextPassword !== confirmPassword) {
      setState({ status: "error", message: "Confirm the new password so both entries match." });
      return;
    }

    setState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          currentPassword,
          nextPassword
        })
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not update your password.");
      }

      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      setState({
        status: "success",
        message: payload.message ?? "Flash ERP updated your password."
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
            : "Flash ERP could not update your password right now."
      });
    }
  }

  const passwordType = showPasswords ? "text" : "password";

  return (
    <article className="glass-panel rounded-[1.35rem] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            Change password
          </p>
          <h2 className="mt-1 text-lg font-semibold text-stone-950">Update your credentials</h2>
        </div>
        <button
          className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
          onClick={() => setShowPasswords((current) => !current)}
          type="button"
        >
          {showPasswords ? "Hide" : "Show"} passwords
        </button>
      </div>

      <form className="mt-5 space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <label className="space-y-2 text-sm text-stone-700">
          <span className="block font-semibold text-stone-900">Current password</span>
          <input
            autoComplete="current-password"
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
            onChange={(event) => setCurrentPassword(event.target.value)}
            type={passwordType}
            value={currentPassword}
          />
        </label>

        <label className="space-y-2 text-sm text-stone-700">
          <span className="block font-semibold text-stone-900">New password</span>
          <input
            autoComplete="new-password"
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
            onChange={(event) => setNextPassword(event.target.value)}
            type={passwordType}
            value={nextPassword}
          />
        </label>

        <label className="space-y-2 text-sm text-stone-700">
          <span className="block font-semibold text-stone-900">Confirm new password</span>
          <input
            autoComplete="new-password"
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
            onChange={(event) => setConfirmPassword(event.target.value)}
            type={passwordType}
            value={confirmPassword}
          />
        </label>

        <div className="rounded-[1.15rem] border border-stone-200 bg-white/90 px-4 py-3 text-sm leading-6 text-stone-600">
          Changing your password keeps this session active and signs out your other active sessions.
        </div>

        {state.message ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
              state.status === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {state.message}
          </div>
        ) : null}

        <button
          className="inline-flex w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
          disabled={state.status === "submitting"}
          type="submit"
        >
          {state.status === "submitting" ? "Updating password..." : "Change password"}
        </button>
      </form>
    </article>
  );
}
