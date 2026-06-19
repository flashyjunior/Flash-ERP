import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fff7ed,transparent_45%),linear-gradient(135deg,#fffaf5,#fdebd3)] px-4 py-10 text-slate-900">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="rounded-[1.6rem] border border-white/70 bg-white/90 p-6 shadow-[0_30px_80px_rgba(124,58,237,0.12)]">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-600">
            Flash ERP
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">Access denied</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            You do not have permission to view this enterprise workspace. Contact a security
            administrator to request access.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
              href="/"
            >
              Back to overview
            </Link>
            <form action="/api/auth/sign-out" method="post">
              <button
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
