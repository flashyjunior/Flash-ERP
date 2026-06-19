"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

export function EnterpriseProfileIdentityPanel({
  initialDisplayName,
  initialEmail
}: {
  initialDisplayName: string;
  initialEmail: string | null;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [email, setEmail] = useState(initialEmail ?? "");
  const [state, setState] = useState<MutationState>({ status: "idle", message: "" });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!displayName.trim()) {
      setState({ status: "error", message: "Enter your display name." });
      return;
    }

    setState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          displayName,
          email: email.trim() || null
        })
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not update your profile.");
      }

      setState({
        status: "success",
        message: payload.message ?? "Flash ERP saved your profile details."
      });

      window.dispatchEvent(new Event("flash-erp:session-refresh"));

      startTransition(() => {
        window.setTimeout(() => router.refresh(), 700);
      });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update your profile right now."
      });
    }
  }

  return (
    <article className="rounded-[1.15rem] border border-stone-200 bg-white/90 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-stone-950">Profile details</p>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Update the name and email shown for your signed-in enterprise account.
          </p>
        </div>
      </div>

      <form className="mt-4 space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <label className="space-y-2 text-sm text-stone-700">
          <span className="block font-semibold text-stone-900">Display name</span>
          <input
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
            onChange={(event) => setDisplayName(event.target.value)}
            value={displayName}
          />
        </label>

        <label className="space-y-2 text-sm text-stone-700">
          <span className="block font-semibold text-stone-900">Email address</span>
          <input
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </label>

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
          {state.status === "submitting" ? "Saving profile..." : "Save profile"}
        </button>
      </form>
    </article>
  );
}
