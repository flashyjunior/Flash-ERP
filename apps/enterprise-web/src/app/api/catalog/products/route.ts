import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { createEnterpriseProduct } from "@/server/repositories/enterprise-catalog.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["master.product.manage"]);
    const body = (await request.json()) as {
      productCode?: string;
      name?: string;
      sku?: string | null;
      shortName?: string | null;
      description?: string | null;
      productType?: string | null;
      department?: string | null;
      category?: string | null;
      subcategory?: string | null;
      brand?: string | null;
      seasonCode?: string | null;
      unitOfMeasure?: string | null;
      uomScheduleCode?: string | null;
      packSize?: string | null;
      countryOfOrigin?: string | null;
      primaryImageUrl?: string | null;
      notes?: string | null;
      taxable?: boolean;
      taxProfileCode?: string | null;
      trackInventory?: boolean;
      trackExpiry?: boolean;
      isSerialized?: boolean;
      trackSize?: boolean;
      trackColor?: boolean;
      allowPriceOverride?: boolean;
      mustEnterPriceAtPos?: boolean;
      minStockLevel?: number | null;
      reorderPoint?: number | null;
      reorderQuantity?: number | null;
      safetyStockLevel?: number | null;
      shelfLifeDays?: number | null;
      weightKg?: number | null;
      volumeLitres?: number | null;
      baseUnitPrice?: number;
      baseCostPrice?: number | null;
      barcode?: string | null;
      barcodeType?: string | null;
    };
    const response = await createEnterpriseProduct({
      productCode: body.productCode ?? "",
      name: body.name ?? "",
      sku: body.sku ?? null,
      shortName: body.shortName ?? null,
      description: body.description ?? null,
      productType: body.productType ?? null,
      department: body.department ?? null,
      category: body.category ?? null,
      subcategory: body.subcategory ?? null,
      brand: body.brand ?? null,
      seasonCode: body.seasonCode ?? null,
      unitOfMeasure: body.unitOfMeasure ?? null,
      uomScheduleCode: body.uomScheduleCode ?? null,
      packSize: body.packSize ?? null,
      countryOfOrigin: body.countryOfOrigin ?? null,
      primaryImageUrl: body.primaryImageUrl ?? null,
      notes: body.notes ?? null,
      taxable: body.taxable ?? true,
      taxProfileCode: body.taxProfileCode ?? null,
      trackInventory: body.trackInventory ?? true,
      trackExpiry: body.trackExpiry ?? false,
      isSerialized: body.isSerialized ?? false,
      trackSize: body.trackSize ?? false,
      trackColor: body.trackColor ?? false,
      allowPriceOverride: body.allowPriceOverride ?? false,
      mustEnterPriceAtPos: body.mustEnterPriceAtPos ?? false,
      minStockLevel: body.minStockLevel ?? null,
      reorderPoint: body.reorderPoint ?? null,
      reorderQuantity: body.reorderQuantity ?? null,
      safetyStockLevel: body.safetyStockLevel ?? null,
      shelfLifeDays: body.shelfLifeDays ?? null,
      weightKg: body.weightKg ?? null,
      volumeLitres: body.volumeLitres ?? null,
      baseUnitPrice: body.baseUnitPrice ?? Number.NaN,
      baseCostPrice: body.baseCostPrice ?? null,
      barcode: body.barcode ?? null,
      barcodeType: body.barcodeType ?? null,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not create the enterprise product.",
      },
      {
        status: 400,
      },
    );
  }
}
