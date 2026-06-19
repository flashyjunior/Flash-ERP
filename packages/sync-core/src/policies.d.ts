import { type RetailEntityKey } from "@flash-erp/domain";
export declare const DEFAULT_SYNC_BATCH_SIZE = 250;
export declare const MAX_SYNC_RETRY_ATTEMPTS = 12;
export declare const DEFAULT_RETRY_DELAYS_MS: number[];
export declare function createIdempotencyKey(nodeCode: string, aggregateType: RetailEntityKey, aggregateId: string, recordVersion: number): string;
export declare function getConflictPolicy(aggregateType: RetailEntityKey): import("@flash-erp/domain").ConflictPolicy;
export declare function getRetryDelayMs(attemptCount: number): number;
export declare function shouldMoveToDeadLetter(attemptCount: number): boolean;
