"use client";

import Link from "next/link";
import { ArrowLeft, KeyRound, Link2 } from "lucide-react";
import { useState } from "react";

type RecoveryResponse = {
  message?: string;
  resetLink?: string;
};

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setMessage(null);
    setResetLink(null);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          identifier
        })
      });

      const payload = (await response.json()) as RecoveryResponse;
      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not start password recovery.");
      }

      setStatus("success");
      setMessage(payload.message ?? "Flash ERP started password recovery.");
      setResetLink(payload.resetLink ?? null);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Flash ERP could not start password recovery right now."
      );
    }
  };

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
              <KeyRound className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">
                Account Recovery
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950">Forgot password</h1>
            </div>
          </div>

          <p className="mt-4 text-sm leading-6 text-slate-600">
            Enter your login ID or registered email address and Flash ERP will email a recovery
            link for your account. When several staff accounts share one email address, use the
            Login ID for the account you want to recover.
          </p>

          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            <label className="space-y-2 text-sm text-slate-700">
              <span className="block font-semibold text-slate-900">Login ID or email</span>
              <input
                autoComplete="username"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]"
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="ops.manager or you@company.com"
                value={identifier}
              />
            </label>

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
              {status === "submitting" ? "Preparing recovery..." : "Continue"}
            </button>
          </form>

          {resetLink ? (
            <div className="mt-6 rounded-[1.3rem] border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-800">
              <div className="flex items-center gap-2 font-semibold">
                <Link2 className="h-4 w-4" />
                Development recovery link
              </div>
              <p className="mt-2 leading-6">
                This environment exposes the password reset link directly so you can complete the
                flow without email delivery.
              </p>
              <Link
                className="mt-3 inline-flex break-all font-semibold text-sky-900 underline decoration-sky-400 underline-offset-4"
                href={resetLink}
              >
                Open reset form
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
