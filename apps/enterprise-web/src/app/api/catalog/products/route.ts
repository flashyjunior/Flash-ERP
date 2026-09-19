import { NextResponse } from "next/server";

import { assertEnterprisePermission, getEnterpriseSession, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { prisma } from "@/lib/db/prisma";
import { createEnterpriseProduct } from "@/server/repositories/enterprise-catalog.repository";


export async function GET(request: Request) {
  try {
    const session = await getEnterpriseSession();
    if (!session) throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
    if (!session.homeStoreCode) throw new EnterpriseAuthError("Assign a home shop before downloading an offline catalog.", 403);
    if (!session.permissionCodes.includes("inventory.view")) {
      throw new EnterpriseAuthError("Flash ERP requires inventory visibility privileges.", 403);
    }
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") ?? 100);
    const page = Math.max(1, Math.trunc(Number(url.searchParams.get("page") ?? 1)) || 1);
    const limit = Math.min(200, Math.max(1, Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 100));
    const query = url.searchParams.get("query")?.trim() ?? "";
    const productWhere = {
      retailOrgId: session.retailOrgId,
      status: "ACTIVE" as const,
      deletedAt: null,
      ...(query ? { OR: [
        { code: { contains: query } }, { sku: { contains: query } },
        { name: { contains: query } }, { barcodes: { some: { code: query } } }
      ] } : {})
    };
    const [products, total] = await Promise.all([prisma.product.findMany({
      where: productWhere,
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, code: true, name: true, unitOfMeasure: true, baseUnitPrice: true,
        taxProfile: { select: { ratePercent: true, isTaxInclusive: true } },
        storeProductPrices: { where: { store: { code: session.homeStoreCode }, status: "ACTIVE", productVariantId: null }, select: { unitPrice: true }, take: 1 },
        storeProductSellingUnits: { where: { store: { code: session.homeStoreCode }, status: "ACTIVE", productVariantId: null }, orderBy: [{ isDefault: "desc" }, { unitOfMeasureNameSnapshot: "asc" }], select: { unitOfMeasureCodeSnapshot: true, unitOfMeasureNameSnapshot: true, conversionFactor: true, unitPrice: true, barcode: true, isDefault: true } },
        matrixVariants: { where: { status: "ACTIVE" }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, displayName: true, barcode: true, unitPrice: true, quantityOnHand: true, values: { select: { attribute: { select: { name: true } }, valueLabelSnapshot: true } } } },
        barcodes: { select: { code: true }, take: 1 } }
    }), prisma.product.count({ where: productWhere })]);
    const locations = await prisma.inventoryLocation.findMany({
      where: { retailOrgId: session.retailOrgId, store: { code: session.homeStoreCode }, status: "ACTIVE" },
      select: { id: true }
    });
    const balances = locations.length && products.length ? await prisma.inventoryLedgerEntry.groupBy({
      by: ["productId"],
      where: { retailOrgId: session.retailOrgId, productId: { in: products.map((p) => p.id) }, inventoryLocationId: { in: locations.map((l) => l.id) } },
      _sum: { quantity: true }
    }) : [];
    const quantityByProduct = new Map(balances.map((row) => [row.productId, Number(row._sum.quantity ?? 0)]));
    return NextResponse.json({ data: products.map((product) => ({
      id: product.id, productCode: product.code, productName: product.name,
      barcode: product.barcodes[0]?.code ?? "", unitPrice: Number(product.storeProductPrices[0]?.unitPrice ?? product.baseUnitPrice),
      taxRatePercent: Number(product.taxProfile?.ratePercent ?? 0),
      isTaxInclusive: product.taxProfile?.isTaxInclusive ?? false,
      sellingUnits: product.storeProductSellingUnits.map((unit) => ({ unitOfMeasureCode: unit.unitOfMeasureCodeSnapshot, unitOfMeasureName: unit.unitOfMeasureNameSnapshot, conversionFactor: Number(unit.conversionFactor), unitPrice: Number(unit.unitPrice), barcode: unit.barcode ?? "", isDefault: unit.isDefault })),
      variants: product.matrixVariants.map((variant) => ({ id: variant.id, code: variant.code, name: variant.displayName ?? variant.code, barcode: variant.barcode, unitPrice: Number(variant.unitPrice), quantityOnHand: Number(variant.quantityOnHand), attributes: variant.values.map((entry) => ({ name: entry.attribute.name, value: entry.valueLabelSnapshot })) })),
      unitOfMeasure: product.unitOfMeasure, quantityOnHand: quantityByProduct.get(product.id) ?? 0,
      storeCode: session.homeStoreCode
    })), page, pageSize: limit, total, hasMore: page * limit < total });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Flash ERP could not download the catalog." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 });
  }
}

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
