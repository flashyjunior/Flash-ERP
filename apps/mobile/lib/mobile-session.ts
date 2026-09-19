export interface MobileUserSession {
  // The public /api/auth/session snapshot intentionally omits internal IDs.
  sessionId?: string;
  userId?: string;
  loginId: string;
  displayName: string;
  accountStatus: string;
  homeStoreCode: string | null;
  homeStoreName: string | null;
  roleCodes: string[];
  permissionCodes: string[];
  isOnlineStoreUser?: boolean;
  expiresAt: string;
}

/** Accept the public snapshot, as well as servers that wrap it in `session`. */
export function readMobileSession(data: unknown): MobileUserSession | null {
  if (!data || typeof data !== "object") return null;
  const candidate = "session" in data ? data.session : data;
  if (!candidate || typeof candidate !== "object") return null;
  const session = candidate as Partial<MobileUserSession>;
  if (
    typeof session.loginId !== "string" || !session.loginId.trim() ||
    typeof session.displayName !== "string" ||
    typeof session.accountStatus !== "string" ||
    typeof session.expiresAt !== "string" || !Number.isFinite(Date.parse(session.expiresAt)) ||
    !(session.homeStoreCode === null || typeof session.homeStoreCode === "string") ||
    !(session.homeStoreName === null || typeof session.homeStoreName === "string") ||
    !Array.isArray(session.roleCodes) || !session.roleCodes.every((code) => typeof code === "string") ||
    !Array.isArray(session.permissionCodes) || !session.permissionCodes.every((code) => typeof code === "string")
  ) return null;
  return session as MobileUserSession;
}
