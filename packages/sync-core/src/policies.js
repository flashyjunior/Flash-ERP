import { entityOwnershipRules } from "@flash-erp/domain";
export const DEFAULT_SYNC_BATCH_SIZE = 250;
export const MAX_SYNC_RETRY_ATTEMPTS = 12;
export const DEFAULT_RETRY_DELAYS_MS = [
    5_000,
    15_000,
    30_000,
    60_000,
    120_000,
    300_000
];
export function createIdempotencyKey(nodeCode, aggregateType, aggregateId, recordVersion) {
    return [nodeCode, aggregateType, aggregateId, recordVersion].join(":");
}
export function getConflictPolicy(aggregateType) {
    return entityOwnershipRules[aggregateType].conflictPolicy;
}
export function getRetryDelayMs(attemptCount) {
    const index = Math.max(0, Math.min(DEFAULT_RETRY_DELAYS_MS.length - 1, attemptCount));
    return DEFAULT_RETRY_DELAYS_MS[index];
}
export function shouldMoveToDeadLetter(attemptCount) {
    return attemptCount >= MAX_SYNC_RETRY_ATTEMPTS;
}
