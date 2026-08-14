export type PosSellingUnit = {
    unitOfMeasureCode: string;
    unitOfMeasureName: string;
    conversionFactor: number;
    unitPrice: number;
    barcode?: string | null;
    isDefault?: boolean;
    allowFractionalSale?: boolean;
    decimalPrecision?: number;
};
export type PosSellingUomResolution = {
    sellingUnitOfMeasure: string;
    sellingUnitOfMeasureName: string;
    sellingQuantity: number;
    baseUnitOfMeasure: string;
    uomConversionFactor: number;
    baseQuantity: number;
    unitPrice: number;
    barcode: string | null;
};
export type ResolvePosSellingUomInput = {
    baseUnitOfMeasure: string;
    baseUnitPrice: number;
    quantity: number;
    selectedUnitOfMeasure?: string | null;
    scannedBarcode?: string | null;
    sellingUnits?: PosSellingUnit[] | null;
    serialized?: boolean;
};
export type NormalizePosSellingUnitsInput = {
    baseUnitOfMeasure: string;
    sellingUnits?: PosSellingUnit[] | null;
    serialized?: boolean;
};
export declare function calculatePosBaseQuantity(sellingQuantity: number, conversionFactor: number): number;
export declare function normalizePosSellingUnits(input: NormalizePosSellingUnitsInput): PosSellingUnit[];
export declare function resolvePosSellingUom(input: ResolvePosSellingUomInput): PosSellingUomResolution;
