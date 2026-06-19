import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { updateEnterprisePromotion } from "@/server/repositories/enterprise-promotions.repository";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      promotionCode: string;
    }>;
  }
) {
  try {
    await assertEnterprisePermission(["master.promotion.manage"]);
    const { promotionCode } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      description?: string | null;
      discountType?: string;
      targetScope?: string;
      discountValue?: number;
      minimumBasketAmount?: number | null;
      targetDepartmentCode?: string | null;
      targetCategoryCode?: string | null;
      targetProductCode?: string | null;
      allowWithLoyalty?: boolean;
      applyOncePerBasket?: boolean;
      priority?: number | null;
      startAt?: string | null;
      endAt?: string | null;
      status?: string;
    };

    const response = await updateEnterprisePromotion(promotionCode, {
      promotionCode,
      name: body.name ?? "",
      description: body.description ?? null,
      discountType: body.discountType ?? "PERCENT",
      targetScope: body.targetScope ?? "ALL_ITEMS",
      discountValue: typeof body.discountValue === "number" ? body.discountValue : 0,
      minimumBasketAmount:
        typeof body.minimumBasketAmount === "number" ? body.minimumBasketAmount : null,
      targetDepartmentCode: body.targetDepartmentCode ?? null,
      targetCategoryCode: body.targetCategoryCode ?? null,
      targetProductCode: body.targetProductCode ?? null,
      allowWithLoyalty: body.allowWithLoyalty ?? true,
      applyOncePerBasket: body.applyOncePerBasket ?? false,
      priority: typeof body.priority === "number" ? body.priority : 0,
      startAt: body.startAt ?? null,
      endAt: body.endAt ?? null,
      status: body.status ?? "ACTIVE"
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not update that promotion."
      },
      {
        status: 400
      }
    );
  }
}
