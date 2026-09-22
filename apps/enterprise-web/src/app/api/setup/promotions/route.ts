import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import {
  createEnterprisePromotion,
  type CreateEnterprisePromotionRequest
} from "@/server/repositories/enterprise-promotions.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["master.promotion.manage"]);
    const body = (await request.json()) as CreateEnterprisePromotionRequest;
    const response = await createEnterprisePromotion(body);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not create that promotion."
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400
      }
    );
  }
}
