"use client";

import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setStatus("error");
      setMessage("This password reset link is missing or invalid.");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("error");
      setMessage("Confirm your new password so both entries match.");
      return;
    }

    setStatus("submitting");
    setMessage(null);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token,
          password
        })
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not reset your password.");
      }

      setStatus("success");
      setMessage(payload.message ?? "Flash ERP updated your password.");
      window.setTimeout(() => {
        router.replace("/sign-in");
      }, 1400);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Flash ERP could not reset your password right now."
      );
    }
  };

  return (
    <form className="mt-8 space-y-4" onSubmit={onSubmit}>
      <label className="space-y-2 text-sm text-slate-700">
        <span className="block font-semibold text-slate-900">New password</span>
        <div className="relative">
          <input
            autoComplete="new-password"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-28 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter a new password"
            type={showPassword ? "text" : "password"}
            value={password}
          />
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white"
            onClick={() => setShowPassword((current) => !current)}
            type="button"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      <label className="space-y-2 text-sm text-slate-700">
        <span className="block font-semibold text-slate-900">Confirm password</span>
        <input
          autoComplete="new-password"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]"
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Re-enter the new password"
          type={showPassword ? "text" : "password"}
          value={confirmPassword}
        />
      </label>

      <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-xs leading-6 text-slate-500">
        Your new password must satisfy the active enterprise password policy. Existing sessions for
        this account will be revoked after the reset completes.
      </div>

      {message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
            status === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {message}
        </div>
      ) : null}

      <button
        className="inline-flex w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
        disabled={status === "submitting"}
        type="submit"
      >
        {status === "submitting" ? "Updating password..." : "Reset password"}
      </button>
    </form>
  );
}

function ResetPasswordFallback() {
  return (
    <div className="mt-8 space-y-4">
      <div className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
      <div className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
      <div className="h-12 animate-pulse rounded-2xl bg-slate-200" />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.3),transparent_28%),linear-gradient(160deg,#f8fafc,#e2e8f0)] px-4 pb-12 pt-20 text-slate-900 lg:pt-28">
      <div className="mx-auto w-full max-w-xl">
        <div className="rounded-[1.8rem] border border-white/75 bg-white/92 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur sm:p-7">
          <Link
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-950"
            href="/sign-in"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>

          <div className="mt-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] text-white shadow-[0_16px_32px_rgba(29,78,216,0.28)]">
              <LockKeyhole className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">
                Account Recovery
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950">Set a new password</h1>
            </div>
          </div>

          <p className="mt-4 text-sm leading-6 text-slate-600">
            Complete password recovery by choosing a new password for your enterprise sign-in.
          </p>

          <Suspense fallback={<ResetPasswordFallback />}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
