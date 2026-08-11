function dateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error("Enter a valid inventory expiry date.");
    }
    return date.toISOString().slice(0, 10);
}
export function normalizeInventoryBatchNo(value) {
    return value?.trim().toUpperCase() ?? "";
}
export function isInventoryBatchExpired(expiryDate, at = new Date()) {
    return dateKey(expiryDate) < dateKey(at);
}
export function inventoryBatchDaysUntilExpiry(expiryDate, at = new Date()) {
    const expiry = new Date(`${dateKey(expiryDate)}T00:00:00.000Z`).getTime();
    const current = new Date(`${dateKey(at)}T00:00:00.000Z`).getTime();
    return Math.round((expiry - current) / 86_400_000);
}
export function deriveInventoryBatchStatus(input) {
    const explicitStatus = input.status?.trim().toUpperCase();
    if (explicitStatus === "QUARANTINED" || explicitStatus === "RECALLED") {
        return explicitStatus;
    }
    if (isInventoryBatchExpired(input.expiryDate, input.at)) {
        return "EXPIRED";
    }
    return input.quantityOnHand > 0 ? "ACTIVE" : "DEPLETED";
}
export function validateInventoryBatchReceipt(input) {
    if (!input.trackExpiry) {
        return {
            batchNo: null,
            manufacturedAt: null,
            expiryDate: null,
        };
    }
    const batchNo = normalizeInventoryBatchNo(input.batchNo);
    const expiryDate = input.expiryDate?.trim() ?? "";
    const manufacturedAt = input.manufacturedAt?.trim() || null;
    const receivedAt = input.receivedAt ?? new Date();
    if (!batchNo) {
        throw new Error(`${input.productName} is expiry-controlled. Enter the supplier batch or lot number.`);
    }
    if (!expiryDate) {
        throw new Error(`${input.productName} is expiry-controlled. Enter the batch expiry date.`);
    }
    if (isInventoryBatchExpired(expiryDate, receivedAt)) {
        throw new Error(`${input.productName} batch ${batchNo} expired on ${dateKey(expiryDate)} and cannot be received as saleable stock.`);
    }
    if (manufacturedAt && dateKey(manufacturedAt) > dateKey(expiryDate)) {
        throw new Error(`${input.productName} batch ${batchNo} has a manufacture date after its expiry date.`);
    }
    return {
        batchNo,
        manufacturedAt,
        expiryDate: dateKey(expiryDate),
    };
}
export function allocateInventoryBatchesFefo(input) {
    const requestedQuantity = Number(input.quantity.toFixed(3));
    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
        throw new Error(`Enter a quantity greater than zero for ${input.productName}.`);
    }
    const availableBatches = input.batches
        .map((batch) => ({
        ...batch,
        batchNo: normalizeInventoryBatchNo(batch.batchNo),
        quantityOnHand: Number(Number(batch.quantityOnHand).toFixed(3)),
    }))
        .filter((batch) => batch.batchNo &&
        batch.quantityOnHand > 0 &&
        deriveInventoryBatchStatus({
            expiryDate: batch.expiryDate,
            quantityOnHand: batch.quantityOnHand,
            status: batch.status,
            at: input.at,
        }) === "ACTIVE")
        .sort((left, right) => left.expiryDate.localeCompare(right.expiryDate) ||
        (left.manufacturedAt ?? "").localeCompare(right.manufacturedAt ?? "") ||
        left.batchNo.localeCompare(right.batchNo));
    const allocations = [];
    let outstandingQuantity = requestedQuantity;
    for (const batch of availableBatches) {
        if (outstandingQuantity <= 0.0001) {
            break;
        }
        const quantity = Number(Math.min(batch.quantityOnHand, outstandingQuantity).toFixed(3));
        allocations.push({
            batchId: batch.batchId,
            batchNo: batch.batchNo,
            expiryDate: dateKey(batch.expiryDate),
            quantity,
        });
        outstandingQuantity = Number((outstandingQuantity - quantity).toFixed(3));
    }
    if (outstandingQuantity > 0.0001) {
        const availableQuantity = Number(allocations.reduce((sum, allocation) => sum + allocation.quantity, 0).toFixed(3));
        throw new Error(`Only ${availableQuantity.toFixed(3)} non-expired unit(s) of ${input.productName} are available. Receive a valid batch before continuing.`);
    }
    return allocations;
}
export function inventoryBatchAllocationQuantity(allocations) {
    return Number((allocations ?? [])
        .reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0)
        .toFixed(3));
}
