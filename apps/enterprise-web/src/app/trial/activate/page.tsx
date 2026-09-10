"use client";

import Link from "next/link";
import { Check, CheckCircle2, Copy, KeyRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function LoginIdField({ loginId }: { loginId: string }) {
  const [copied, setCopied] = useState(false);

  const copyLoginId = async () => {
    try {
      await navigator.clipboard.writeText(loginId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="block text-xs font-semibold uppercase text-slate-500">Login ID</span>
      <div className="mt-2 flex min-w-0 items-center gap-2">
        <input
          aria-label="Trial account login ID"
          autoComplete="username"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-950 outline-none"
          readOnly
          value={loginId}
        />
        <button
          aria-label={copied ? "Login ID copied" : "Copy login ID"}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"
          onClick={copyLoginId}
          title={copied ? "Copied" : "Copy login ID"}
          type="button"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function ActivationForm() {
  const token = useSearchParams().get("token") ?? "";
  const [accountLabel, setAccountLabel] = useState("Trial account");
  const [landingPath, setLandingPath] = useState("/");
  const [loginId, setLoginId] = useState("");
  const [contextStatus, setContextStatus] = useState<"loading" | "ready" | "error">("loading");
  const [contextMessage, setContextMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    if (!token) {
      setContextStatus("error");
      setContextMessage("This activation link is missing or invalid.");
      return () => controller.abort();
    }

    setContextStatus("loading");
    setContextMessage(null);
    fetch(`/api/trials/activate?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          accountLabel?: string;
          landingPath?: string;
          loginId?: string;
          message?: string;
        };
        if (!response.ok || !payload.loginId) {
          throw new Error(payload.message ?? "Flash ERP could not verify this activation link.");
        }
        setAccountLabel(payload.accountLabel ?? "Trial account");
        setLandingPath(payload.landingPath === "/online-store" ? "/online-store" : "/");
        setLoginId(payload.loginId);
        setContextStatus("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setContextStatus("error");
        setContextMessage(
          error instanceof Error ? error.message : "Flash ERP could not verify this activation link."
        );
      });

    return () => controller.abort();
  }, [token]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      setStatus("error");
      setMessage("This activation link is missing or invalid.");
      return;
    }
    if (password !== confirmation) {
      setStatus("error");
      setMessage("Enter the same password in both fields.");
      return;
    }

    setStatus("submitting");
    setMessage(null);
    try {
      const response = await fetch("/api/trials/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password })
      });
      const payload = (await response.json()) as {
        accountLabel?: string;
        landingPath?: string;
        loginId?: string;
        message?: string;
      };
      if (!response.ok) throw new Error(payload.message ?? "Flash ERP could not activate this account.");
      if (payload.accountLabel) setAccountLabel(payload.accountLabel);
      setLandingPath(payload.landingPath === "/online-store" ? "/online-store" : "/");
      if (payload.loginId) setLoginId(payload.loginId);
      setStatus("success");
      setMessage(payload.message ?? "Your trial account is active.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Flash ERP could not activate this account.");
    }
  };

  if (status === "success") {
    return (
      <div className="mt-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <p className="mt-3 text-xs font-semibold uppercase text-violet-700">{accountLabel}</p>
        <p className="mt-4 text-sm leading-6 text-emerald-800">{message}</p>
        {loginId ? (
          <div className="mt-5 text-left">
            <LoginIdField loginId={loginId} />
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Sign in with this login ID and the password you just created.
            </p>
          </div>
        ) : null}
        <Link
          className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700"
          href={
            loginId
              ? `/sign-in?loginId=${encodeURIComponent(loginId)}&next=${encodeURIComponent(landingPath)}`
              : "/sign-in"
          }
        >
          Continue to {landingPath === "/online-store" ? "Online Store" : "Enterprise"} sign in
        </Link>
      </div>
    );
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={submit}>
      {contextStatus === "loading" ? (
        <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
      ) : null}
      {contextStatus === "ready" && loginId ? (
        <>
          <p className="text-xs font-semibold uppercase text-violet-700">{accountLabel}</p>
          <LoginIdField loginId={loginId} />
          <p className="text-xs leading-5 text-slate-500">
            This is your username. Use it with the password you create below when signing in.
          </p>
        </>
      ) : null}
      {contextStatus === "error" && contextMessage ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {contextMessage}
        </div>
      ) : null}
      <label className="block text-sm font-semibold text-slate-900">
        Password
        <input
          autoComplete="new-password"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-violet-600 focus:ring-4 focus:ring-violet-100"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </label>
      <label className="block text-sm font-semibold text-slate-900">
        Confirm password
        <input
          autoComplete="new-password"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-violet-600 focus:ring-4 focus:ring-violet-100"
          onChange={(event) => setConfirmation(event.target.value)}
          type="password"
          value={confirmation}
        />
      </label>
      <p className="text-xs leading-5 text-slate-500">
        Use at least eight characters with uppercase, lowercase, and a number.
      </p>
      {message ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {message}
        </div>
      ) : null}
      <button
        className="inline-flex w-full items-center justify-center rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
        disabled={status === "submitting" || contextStatus !== "ready"}
        type="submit"
      >
        {status === "submitting" ? "Activating..." : `Activate ${accountLabel}`}
      </button>
    </form>
  );
}

export default function TrialActivationPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-16 text-slate-950">
      <section className="mx-auto w-full max-w-lg rounded-lg border border-slate-200 bg-white p-7 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
            <KeyRound className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase text-violet-700">Flash ERP trial</p>
            <h1 className="mt-1 text-2xl font-semibold">Create your account password</h1>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Confirm your login ID, then create the password you will use for your isolated 14-day
          workspace.
        </p>
        <Suspense fallback={<div className="mt-8 h-44 animate-pulse rounded-lg bg-slate-100" />}>
          <ActivationForm />
        </Suspense>
      </section>
    </main>
  );
}
