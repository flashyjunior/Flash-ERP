import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import {
  updateEnterprisePromotion,
  type CreateEnterprisePromotionRequest
} from "@/server/repositories/enterprise-promotions.repository";

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
    const body = (await request.json()) as CreateEnterprisePromotionRequest;
    const response = await updateEnterprisePromotion(promotionCode, {
      ...body,
      promotionCode
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not update that promotion."
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400
      }
    );
  }
}
