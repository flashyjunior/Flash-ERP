import crypto from "node:crypto";

/**
 * Deterministic derivation of the Flash support account password.
 *
 * The password is an HMAC of the trial provisioner secret over a stable
 * purpose string containing the trial request id, rendered as four
 * capitalized dictionary words plus two digits. That keeps the credential
 * human-typable, satisfies the trial password policy (minimum length,
 * uppercase, lowercase, digit), and stays fully recoverable by anyone who
 * holds the provisioner secret and the request id.
 *
 * Only Node scripts run this module (provisioner worker and staff CLI); it
 * intentionally lives outside the shared domain package.
 */

const SUPPORT_PASSWORD_WORDS = [
  "amber", "anchor", "anvil", "arbor", "arrow", "aspen", "atlas", "aurora",
  "barn", "basalt", "beacon", "birch", "bison", "blade", "bloom", "brook",
  "cactus", "canyon", "cedar", "channel", "charter", "chisel", "cliff", "cloud",
  "cobalt", "compass", "copper", "coral", "cove", "crane", "crest", "current",
  "daisy", "delta", "dune", "eagle", "ember", "fable", "falcon", "ferry",
  "flint", "forge", "garden", "geyser", "granite", "grove", "harbor", "haven",
  "heron", "horizon", "hudson", "indigo", "iris", "jade", "jungle", "kayak",
  "lagoon", "lantern", "larch", "ledger", "linden", "lotus", "lumen", "maple",
  "meadow", "meridian", "mistral", "moss", "nectar", "noble", "orbit", "opal",
  "orchard", "otter", "ozone", "pearl", "pebble", "prairie", "quartz", "quill",
  "quiver", "radar", "raven", "reed", "ridge", "ripple", "rocket", "sable",
  "saddle", "salmon", "sapphire", "sedge", "signal", "sonar", "summit", "temple",
  "thicket", "tidal", "timber", "titan", "topaz", "tundra", "umbra", "velvet",
  "vertex", "voyage", "willow", "windrow", "winter", "wren", "zephyr", "zinc"
];

export function deriveTrialSupportPassword(
  provisionerSecret: string,
  requestId: string
): string {
  const trimmedSecret = provisionerSecret.trim();
  const trimmedRequestId = requestId.trim();
  if (!trimmedSecret) {
    throw new Error(
      "FLASH_ERP_TRIAL_PROVISIONER_SECRET is required to derive support credentials."
    );
  }
  if (!trimmedRequestId) {
    throw new Error("A trial request id is required to derive support credentials.");
  }

  const digest = crypto
    .createHmac("sha256", trimmedSecret)
    .update(`trial-support:${trimmedRequestId}`)
    .digest();

  const words: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    const word = SUPPORT_PASSWORD_WORDS[digest[index] % SUPPORT_PASSWORD_WORDS.length];
    words.push(word.charAt(0).toUpperCase() + word.slice(1));
  }
  const digits = String(10 + (digest[4] % 90));
  const candidate = `${words.join("")}${digits}`;

  // The word rendering is constructed to satisfy the trial password policy
  // (8+ chars, uppercase, lowercase, digit). Fall back to an opaque value
  // rather than ever returning an unusable credential.
  if (!/[A-Z]/.test(candidate) || !/[a-z]/.test(candidate) || !/[0-9]/.test(candidate)) {
    return digest.subarray(0, 24).toString("base64url").replace(/[-_]/g, "A");
  }
  return candidate;
}
