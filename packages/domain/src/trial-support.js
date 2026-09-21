/**
 * Shared conventions for the per-trial Flash support account.
 *
 * Every provisioned trial workspace receives a dedicated support account
 * (loginId `support.{slug}`) so Flash ERP staff can sign in and assist the
 * customer with setup. The account's password is derived deterministically
 * from the trial provisioner secret (see scripts/trial-support-credentials-core.ts),
 * so staff can recompute credentials for any trial without storing plaintext
 * passwords, and a leaked password only exposes a single workspace.
 *
 * Keep this module dependency-free: it is re-exported through the domain
 * index, which client bundles may import.
 */
export const TRIAL_SUPPORT_ROLE_CODE = "FLASH_SUPPORT";
export const TRIAL_SUPPORT_ROLE_NAME = "Flash Onboarding";
export const TRIAL_SUPPORT_LOGIN_PREFIX = "support.";
export const DEFAULT_TRIAL_SUPPORT_EMAIL = "support@flashcodesolutions.com";
export function trialSupportLoginId(workspaceSlug) {
    return `${TRIAL_SUPPORT_LOGIN_PREFIX}${workspaceSlug.trim().toLowerCase()}`;
}
export function isTrialSupportLoginId(loginId) {
    if (!loginId)
        return false;
    return loginId.trim().toLowerCase().startsWith(TRIAL_SUPPORT_LOGIN_PREFIX);
}
export function isTrialSupportRoleCode(roleCode) {
    return roleCode?.trim().toUpperCase() === TRIAL_SUPPORT_ROLE_CODE;
}
