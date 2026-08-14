const INVENTORY_PRECISION = 3;
const CONVERSION_PRECISION = 6;
function round(value, precision) {
    return Number(value.toFixed(precision));
}
function normalizeCode(value) {
    return String(value ?? "").trim().toUpperCase();
}
function requirePositiveNumber(value, label) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${label} must be greater than zero.`);
    }
    return value;
}
function validateSellingPrecision(quantity, allowFractionalSale, decimalPrecision) {
    if (!allowFractionalSale && !Number.isInteger(quantity)) {
        throw new Error("The selected unit of measure does not permit fractional sales.");
    }
    const precision = Math.min(6, Math.max(0, Math.trunc(decimalPrecision)));
    if (Math.abs(quantity - round(quantity, precision)) > 0.0000001) {
        throw new Error(`The selling quantity supports no more than ${precision} decimal place(s).`);
    }
}
export function calculatePosBaseQuantity(sellingQuantity, conversionFactor) {
    const quantity = requirePositiveNumber(sellingQuantity, "Selling quantity");
    const factor = requirePositiveNumber(conversionFactor, "UOM conversion factor");
    const unrounded = quantity * factor;
    const baseQuantity = round(unrounded, INVENTORY_PRECISION);
    if (Math.abs(unrounded - baseQuantity) > 0.0000001) {
        throw new Error(`The selected quantity converts beyond the supported ${INVENTORY_PRECISION}-decimal inventory precision.`);
    }
    return baseQuantity;
}
export function normalizePosSellingUnits(input) {
    const baseUnitOfMeasure = normalizeCode(input.baseUnitOfMeasure) || "EA";
    const seenUnits = new Set();
    const seenBarcodes = new Set();
    let defaultCount = 0;
    return (input.sellingUnits ?? []).map((candidate) => {
        const unitOfMeasureCode = normalizeCode(candidate.unitOfMeasureCode);
        const unitOfMeasureName = candidate.unitOfMeasureName?.trim() || unitOfMeasureCode;
        const conversionFactor = round(requirePositiveNumber(Number(candidate.conversionFactor), `${unitOfMeasureCode || "Selling unit"} conversion factor`), CONVERSION_PRECISION);
        const unitPrice = round(requirePositiveNumber(Number(candidate.unitPrice), `${unitOfMeasureCode || "Selling unit"} price`), 2);
        const barcode = candidate.barcode?.trim() || null;
        const isDefault = candidate.isDefault === true;
        if (!unitOfMeasureCode) {
            throw new Error("Each selling unit needs a unit-of-measure code.");
        }
        if (seenUnits.has(unitOfMeasureCode)) {
            throw new Error(`${unitOfMeasureCode} is configured more than once.`);
        }
        seenUnits.add(unitOfMeasureCode);
        if (barcode) {
            const barcodeKey = normalizeCode(barcode);
            if (seenBarcodes.has(barcodeKey)) {
                throw new Error(`Selling-unit barcode ${barcode} is configured more than once.`);
            }
            seenBarcodes.add(barcodeKey);
        }
        if (isDefault) {
            defaultCount += 1;
            if (defaultCount > 1) {
                throw new Error("Only one selling unit can be the default.");
            }
        }
        if (input.serialized === true && !Number.isInteger(conversionFactor)) {
            throw new Error(`${unitOfMeasureCode} must convert to a whole number of ${baseUnitOfMeasure} units for a serialized product.`);
        }
        return {
            unitOfMeasureCode,
            unitOfMeasureName,
            conversionFactor,
            unitPrice,
            barcode,
            isDefault,
            allowFractionalSale: candidate.allowFractionalSale === true,
            decimalPrecision: Math.min(6, Math.max(0, Math.trunc(Number(candidate.decimalPrecision) || 0))),
        };
    });
}
export function resolvePosSellingUom(input) {
    const baseUnitOfMeasure = normalizeCode(input.baseUnitOfMeasure) || "EA";
    const selectedCode = normalizeCode(input.selectedUnitOfMeasure);
    const scannedBarcode = normalizeCode(input.scannedBarcode);
    const sellingUnits = (input.sellingUnits ?? []).filter((candidate) => normalizeCode(candidate.unitOfMeasureCode) && Number.isFinite(candidate.conversionFactor) && candidate.conversionFactor > 0);
    const selectedByCode = selectedCode
        ? sellingUnits.find((candidate) => normalizeCode(candidate.unitOfMeasureCode) === selectedCode)
        : undefined;
    if (selectedCode && selectedCode !== baseUnitOfMeasure && !selectedByCode) {
        throw new Error(`${selectedCode} is no longer configured as an active selling unit. Refresh the product and choose another unit.`);
    }
    const scannedUnit = scannedBarcode
        ? sellingUnits.find((candidate) => normalizeCode(candidate.barcode) === scannedBarcode)
        : undefined;
    const requestedUnconfiguredBaseUnit = selectedCode === baseUnitOfMeasure && !selectedByCode;
    const selected = scannedUnit ??
        selectedByCode ??
        (requestedUnconfiguredBaseUnit
            ? undefined
            : sellingUnits.find((candidate) => candidate.isDefault === true) ??
                sellingUnits.find((candidate) => normalizeCode(candidate.unitOfMeasureCode) === baseUnitOfMeasure));
    const sellingUnitOfMeasure = selected
        ? normalizeCode(selected.unitOfMeasureCode)
        : baseUnitOfMeasure;
    const sellingQuantity = requirePositiveNumber(input.quantity, "Selling quantity");
    const conversionFactor = round(selected?.conversionFactor ?? 1, CONVERSION_PRECISION);
    validateSellingPrecision(sellingQuantity, selected ? selected.allowFractionalSale === true : true, selected?.decimalPrecision ?? INVENTORY_PRECISION);
    const baseQuantity = calculatePosBaseQuantity(sellingQuantity, conversionFactor);
    if (input.serialized === true && !Number.isInteger(baseQuantity)) {
        throw new Error("Serialized products must convert to a whole number of base units.");
    }
    return {
        sellingUnitOfMeasure,
        sellingUnitOfMeasureName: selected?.unitOfMeasureName?.trim() || sellingUnitOfMeasure,
        sellingQuantity,
        baseUnitOfMeasure,
        uomConversionFactor: conversionFactor,
        baseQuantity,
        unitPrice: Number(selected?.unitPrice ?? input.baseUnitPrice),
        barcode: selected?.barcode?.trim() || null,
    };
}
