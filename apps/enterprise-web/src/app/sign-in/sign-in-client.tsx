"use client";

import Link from "next/link";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

type SignInClientProps = {
  brandName: string;
  companyLogoUrl: string | null;
  loginBackgroundImageUrl: string | null;
};

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedNext = searchParams.get("next") ?? "/";
  const next =
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//") &&
    requestedNext !== "/sign-in" &&
    !requestedNext.startsWith("/sign-in?")
      ? requestedNext
      : "/";
  const [loginId, setLoginId] = useState(() => searchParams.get("loginId")?.trim().slice(0, 254) ?? "");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [mfaDeliveryHint, setMfaDeliveryHint] = useState<string | null>(null);
  const [developmentMfaCode, setDevelopmentMfaCode] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "error">("info");
  const [showPassword, setShowPassword] = useState(false);

  const resolvePostSignInPath = async () => {
    let landingPath = "/";

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch("/api/auth/landing", {
        cache: "no-store",
        credentials: "same-origin"
      });

      if (response.status === 401) {
        if (attempt === 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 150));
          continue;
        }

        throw new Error(
          "Flash ERP signed you in, but the browser did not keep the session cookie. Open the same site URL shown in hosting, preferably HTTPS, then try again."
        );
      }

      if (!response.ok) {
        throw new Error("Flash ERP signed you in, but could not confirm the new session.");
      }

      const payload = (await response.json()) as {
        landingPath?: string;
      };
      const resolvedLandingPath = payload.landingPath ?? "";

      if (resolvedLandingPath.startsWith("/") && !resolvedLandingPath.startsWith("//")) {
        landingPath = resolvedLandingPath;
      }
      break;
    }

    if (next !== "/" && next !== "/unauthorized") {
      return next;
    }

    return landingPath;
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setMessage(null);
    setMessageTone("info");

    try {
      const isMfaStep = Boolean(mfaChallengeToken);
      const response = await fetch(isMfaStep ? "/api/auth/mfa/verify" : "/api/auth/sign-in", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          isMfaStep
            ? {
                challengeToken: mfaChallengeToken,
                code: mfaCode
              }
            : {
                loginId,
                password
              }
        )
      });

      const payload = (await response.json()) as {
        message?: string;
        requiresMfa?: boolean;
        challengeToken?: string;
        deliveryHint?: string;
        developmentCode?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not sign you in.");
      }

      if (payload.requiresMfa && payload.challengeToken) {
        setMfaChallengeToken(payload.challengeToken);
        setMfaDeliveryHint(payload.deliveryHint ?? "your configured MFA channel");
        setDevelopmentMfaCode(payload.developmentCode ?? null);
        setMessage(payload.message ?? "Enter your MFA code.");
        setMessageTone("info");
        setStatus("idle");
        return;
      }

      router.replace(await resolvePostSignInPath());
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Flash ERP could not sign you in right now."
      );
      setMessageTone("error");
      setStatus("idle");
    }
  };

  return (
    <form className="mt-6 space-y-3.5" onSubmit={onSubmit}>
      {!mfaChallengeToken ? (
        <>
      <label className="block text-sm text-slate-700">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Login ID
        </span>
        <span className="relative block">
          <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoComplete="username"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-10 text-sm outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]"
            onChange={(event) => setLoginId(event.target.value)}
            placeholder="Enter your username or email"
            value={loginId}
          />
        </span>
      </label>

      <label className="block text-sm text-slate-700">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Password
          </span>
          <Link
            className="text-xs font-semibold text-[color:var(--brand-deep)] transition hover:text-[color:var(--brand)]"
            href="/forgot-password"
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoComplete="current-password"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-10 pr-14 text-sm outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            type={showPassword ? "text" : "password"}
            value={password}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-slate-300 hover:bg-white"
            onClick={() => setShowPassword((current) => !current)}
            type="button"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </label>
        </>
      ) : (
        <label className="block text-sm text-slate-700">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            MFA code
          </span>
          <input
            autoComplete="one-time-code"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-lg font-semibold tracking-[0.28em] outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            value={mfaCode}
          />
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Code sent to {mfaDeliveryHint ?? "your configured MFA channel"}.
            {developmentMfaCode ? ` Development code: ${developmentMfaCode}.` : ""}
          </p>
        </label>
      )}

      {message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            messageTone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-sky-200 bg-sky-50 text-sky-700"
          }`}
        >
          {message}
        </div>
      ) : null}

      <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70"
        disabled={status === "submitting"}
        type="submit"
      >
        {status === "submitting"
          ? mfaChallengeToken
            ? "Verifying..."
            : "Signing in..."
          : mfaChallengeToken
            ? "Verify MFA"
            : "Sign in"}
        <ArrowRight className="h-4 w-4" />
      </button>
      {mfaChallengeToken ? (
        <button
          className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
          onClick={() => {
            setMfaChallengeToken(null);
            setMfaCode("");
            setMfaDeliveryHint(null);
            setDevelopmentMfaCode(null);
            setMessage(null);
            setMessageTone("info");
            setStatus("idle");
          }}
          type="button"
        >
          Use another account
        </button>
      ) : null}
    </form>
  );
}

function SignInFallback() {
  return (
    <div className="mt-8 space-y-4">
      <div className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
      <div className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
      <div className="h-12 animate-pulse rounded-2xl bg-slate-200" />
    </div>
  );
}

export function SignInClientPage({
  brandName,
  companyLogoUrl,
  loginBackgroundImageUrl
}: SignInClientProps) {
  const backgroundImageUrl = loginBackgroundImageUrl || "/images/retail-login-bg.jpg";

  return (
    <div className="min-h-screen overflow-hidden bg-white text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(24rem,32rem)]">
        <section className="relative min-h-[42vh] overflow-hidden bg-amber-400 lg:min-h-screen">
          <img
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            src={backgroundImageUrl}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,13,23,0.1),rgba(8,13,23,0)_58%,rgba(8,13,23,0.04))]" />
        </section>

        <section className="flex min-h-[58vh] items-center border-slate-200 bg-white px-6 py-8 sm:px-10 lg:min-h-screen lg:border-l lg:px-12">
          <div className="mx-auto w-full max-w-[23rem]">
            <div className="flex items-center justify-center">
              {companyLogoUrl ? (
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_34px_rgba(15,23,42,0.12)]">
                  <img
                    alt={`${brandName} logo`}
                    className="h-full w-full object-contain p-1.5"
                    src={companyLogoUrl}
                  />
                </div>
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] text-white shadow-[0_16px_32px_rgba(29,78,216,0.24)]">
                  <ShieldCheck className="h-6 w-6" />
                </div>
              )}
            </div>

            <div className="mt-5 text-center">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                {brandName}
              </p>
              <h1 className="mt-2 text-3xl font-semibold leading-tight text-amber-500">
                Welcome Back
              </h1>
              <p className="mt-2 text-xs text-slate-500">
                Enter your details to access Flash ERP.
              </p>
            </div>

            <Suspense fallback={<SignInFallback />}>
              <SignInForm />
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}
