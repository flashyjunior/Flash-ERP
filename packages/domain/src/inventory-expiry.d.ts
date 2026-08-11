export type InventoryBatchAllocation = {
    batchId: string | null;
    batchNo: string;
    expiryDate: string;
    quantity: number;
};
export type InventoryBatchAvailability = {
    batchId: string | null;
    batchNo: string;
    manufacturedAt?: string | null;
    expiryDate: string;
    quantityOnHand: number;
    status?: string | null;
};
export declare function normalizeInventoryBatchNo(value: string | null | undefined): string;
export declare function isInventoryBatchExpired(expiryDate: string | Date, at?: string | Date): boolean;
export declare function inventoryBatchDaysUntilExpiry(expiryDate: string | Date, at?: string | Date): number;
export declare function deriveInventoryBatchStatus(input: {
    expiryDate: string | Date;
    quantityOnHand: number;
    at?: string | Date;
    status?: string | null;
}): "ACTIVE" | "QUARANTINED" | "RECALLED" | "EXPIRED" | "DEPLETED";
export declare function validateInventoryBatchReceipt(input: {
    productName: string;
    trackExpiry: boolean;
    batchNo?: string | null;
    manufacturedAt?: string | null;
    expiryDate?: string | null;
    receivedAt?: string | Date;
}): {
    batchNo: null;
    manufacturedAt: null;
    expiryDate: null;
} | {
    batchNo: string;
    manufacturedAt: string | null;
    expiryDate: string;
};
export declare function allocateInventoryBatchesFefo(input: {
    productName: string;
    quantity: number;
    batches: InventoryBatchAvailability[];
    at?: string | Date;
}): InventoryBatchAllocation[];
export declare function inventoryBatchAllocationQuantity(allocations: InventoryBatchAllocation[] | null | undefined): number;
