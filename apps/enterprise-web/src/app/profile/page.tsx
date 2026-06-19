import { KeyRound, ShieldCheck, Store, UserCircle2 } from "lucide-react";
import { notFound } from "next/navigation";

import { EnterpriseProfileIdentityPanel } from "@/components/enterprise/enterprise-profile-identity-panel";
import { EnterpriseProfilePasswordPanel } from "@/components/enterprise/enterprise-profile-password-panel";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import {
  buildAccountInitials,
  formatRelativeTimeLabel,
  resolveAccountAvatarTheme
} from "@/lib/ui/account-avatar";
import { getEnterpriseProfileWorkspace } from "@/server/auth/enterprise-session";

export const dynamic = "force-dynamic";

function DetailCard({
  label,
  value,
  icon: Icon
}: {
  label: string;
  value: string;
  icon: typeof Store;
}) {
  return (
    <article className="glass-panel rounded-[1.3rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            {label}
          </p>
          <p className="mt-2 text-[1.3rem] font-semibold text-stone-950">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] text-white shadow-[0_14px_30px_rgba(29,78,216,0.28)]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </article>
  );
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not available";
}

export default async function ProfilePage() {
  const profile = await getEnterpriseProfileWorkspace();

  if (!profile) {
    notFound();
  }

  const avatarTheme = resolveAccountAvatarTheme(profile.loginId || profile.displayName);
  const initials = buildAccountInitials(profile.displayName);

  return (
    <EnterpriseShell
      activeSection="profile"
      description="Review identity, session, and privilege details for the signed-in Flash ERP enterprise operator."
      eyebrow="Flash ERP account"
      heading="My Profile"
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DetailCard icon={UserCircle2} label="Account status" value={profile.accountStatus} />
        <DetailCard icon={ShieldCheck} label="Roles" value={String(profile.roleCodes.length)} />
        <DetailCard
          icon={KeyRound}
          label="Privileges"
          value={String(profile.permissionCodes.length)}
        />
        <DetailCard
          icon={Store}
          label="Session expires"
          value={new Date(profile.sessionExpiresAt).toLocaleString()}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <article className="glass-panel rounded-[1.35rem] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            Identity
          </p>
          <div className={`mt-4 rounded-[1.25rem] p-5 ${avatarTheme.surfaceClassName}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div
                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.35rem] text-lg font-semibold ${avatarTheme.avatarClassName}`}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold text-stone-950">
                  {profile.displayName}
                </h2>
                <p className="truncate text-sm text-stone-600">{profile.loginId}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${avatarTheme.badgeClassName}`}
                  >
                    {profile.accountStatus}
                  </span>
                  <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-700">
                    Last active {formatRelativeTimeLabel(profile.lastActiveAt)}
                  </span>
                  <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-700">
                    {profile.roleCodes.length} role{profile.roleCodes.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[
              ["Display name", profile.displayName],
              ["Login ID", profile.loginId],
              ["Email", profile.email ?? "Not set"],
              [
                "Home store",
                profile.homeStoreName
                  ? `${profile.homeStoreName}${profile.homeStoreCode ? ` (${profile.homeStoreCode})` : ""}`
                  : "Unassigned"
              ],
              ["Last active", `${formatRelativeTimeLabel(profile.lastActiveAt)} (${formatDateTime(profile.lastActiveAt)})`],
              ["Last login", formatDateTime(profile.lastLoginAt)],
              ["Password updated", formatDateTime(profile.passwordUpdatedAt)],
              ["Account created", formatDateTime(profile.createdAt)],
              ["Session expiry", formatDateTime(profile.sessionExpiresAt)]
            ].map(([label, value]) => (
              <div
                className="rounded-[1.15rem] border border-stone-200 bg-white/90 px-4 py-3"
                key={label}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  {label}
                </p>
                <p className="mt-2 text-sm font-medium text-stone-900">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <EnterpriseProfileIdentityPanel
              initialDisplayName={profile.displayName}
              initialEmail={profile.email}
            />
          </div>
        </article>

        <div className="space-y-4">
          <article className="glass-panel rounded-[1.35rem] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Access posture
            </p>
            <div className="mt-4 space-y-4">
              <div className="rounded-[1.15rem] border border-stone-200 bg-white/90 px-4 py-4">
                <p className="text-sm font-semibold text-stone-950">Assigned roles</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {profile.roleNames.length > 0 ? (
                    profile.roleNames.map((roleName, index) => (
                      <span
                        className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700"
                        key={`${profile.roleCodes[index] ?? roleName}:${roleName}`}
                      >
                        {roleName}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-stone-500">No roles assigned.</span>
                  )}
                </div>
              </div>

              <div className="rounded-[1.15rem] border border-stone-200 bg-white/90 px-4 py-4">
                <p className="text-sm font-semibold text-stone-950">Privilege codes</p>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  These are the effective privilege codes currently active for this signed-in session.
                </p>
                <div className="mt-3 flex max-h-72 flex-wrap gap-2 overflow-y-auto">
                  {profile.permissionCodes.map((permissionCode) => (
                    <span
                      className="inline-flex rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700"
                      key={permissionCode}
                    >
                      {permissionCode}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </article>

          <EnterpriseProfilePasswordPanel />
        </div>
      </section>

      <section className="glass-panel rounded-[1.4rem] p-5">
        <p className="text-sm leading-6 text-stone-600">
          This profile reflects the current signed-in enterprise operator, the effective session
          expiry, and the privileges being enforced right now across the Flash ERP control plane.
        </p>
      </section>
    </EnterpriseShell>
  );
}
