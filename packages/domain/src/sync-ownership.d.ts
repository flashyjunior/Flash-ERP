import type { RetailEntityKey } from "./retail.js";
export type OwnershipAuthority = "enterprise" | "store" | "shared";
export type ConflictPolicy = "reject-store-overwrite" | "accept-append-only" | "merge-by-version" | "manual-review";
export type EntityOwnershipRule = {
    authority: OwnershipAuthority;
    upstreamFlow: boolean;
    downstreamFlow: boolean;
    conflictPolicy: ConflictPolicy;
    notes: string;
};
export declare const entityOwnershipRules: Record<RetailEntityKey, EntityOwnershipRule>;
