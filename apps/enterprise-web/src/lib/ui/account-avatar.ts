export type AccountAvatarTheme = {
  avatarClassName: string;
  surfaceClassName: string;
  badgeClassName: string;
};

const accountAvatarThemes: AccountAvatarTheme[] = [
  {
    avatarClassName:
      "bg-[linear-gradient(135deg,#2563eb,#0891b2)] text-white shadow-[0_14px_30px_rgba(37,99,235,0.24)]",
    surfaceClassName: "bg-[linear-gradient(135deg,#eff6ff,#ecfeff)]",
    badgeClassName: "bg-sky-100 text-sky-700"
  },
  {
    avatarClassName:
      "bg-[linear-gradient(135deg,#059669,#0f766e)] text-white shadow-[0_14px_30px_rgba(5,150,105,0.24)]",
    surfaceClassName: "bg-[linear-gradient(135deg,#ecfdf5,#f0fdfa)]",
    badgeClassName: "bg-emerald-100 text-emerald-700"
  },
  {
    avatarClassName:
      "bg-[linear-gradient(135deg,#d97706,#ea580c)] text-white shadow-[0_14px_30px_rgba(217,119,6,0.24)]",
    surfaceClassName: "bg-[linear-gradient(135deg,#fff7ed,#fffbeb)]",
    badgeClassName: "bg-amber-100 text-amber-700"
  },
  {
    avatarClassName:
      "bg-[linear-gradient(135deg,#db2777,#e11d48)] text-white shadow-[0_14px_30px_rgba(219,39,119,0.24)]",
    surfaceClassName: "bg-[linear-gradient(135deg,#fff1f2,#fdf2f8)]",
    badgeClassName: "bg-rose-100 text-rose-700"
  },
  {
    avatarClassName:
      "bg-[linear-gradient(135deg,#7c3aed,#4f46e5)] text-white shadow-[0_14px_30px_rgba(99,102,241,0.24)]",
    surfaceClassName: "bg-[linear-gradient(135deg,#eef2ff,#f5f3ff)]",
    badgeClassName: "bg-indigo-100 text-indigo-700"
  }
];

function hashString(value: string) {
  let hash = 0;

  for (const character of value) {
    hash = (hash << 5) - hash + character.charCodeAt(0);
    hash |= 0;
  }

  return Math.abs(hash);
}

export function buildAccountInitials(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "FR";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function resolveAccountAvatarTheme(seed: string) {
  return accountAvatarThemes[hashString(seed || "flash-erp") % accountAvatarThemes.length];
}

export function formatRelativeTimeLabel(value: string | Date | null) {
  if (!value) {
    return "Not available";
  }

  const date = value instanceof Date ? value : new Date(value);
  const diffMs = Date.now() - date.getTime();

  if (diffMs < 60_000) {
    return "Just now";
  }

  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
