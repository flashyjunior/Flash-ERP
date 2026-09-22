import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { updateEnterpriseLoyaltyPolicy } from "@/server/repositories/enterprise-setup.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["master.loyalty.manage"]);
    const body = (await request.json()) as {
      loyaltyProgramEnabled?: boolean;
      loyaltyPointsPerCurrencyUnit?: number | null;
      loyaltyRedemptionEnabled?: boolean;
      loyaltyRedemptionPointsStep?: number | null;
      loyaltyRedemptionValueAmount?: number | null;
      loyaltyMinimumRedeemPoints?: number | null;
      loyaltyMaximumRedeemPercentOfSale?: number | null;
    };

    const response = await updateEnterpriseLoyaltyPolicy({
      loyaltyProgramEnabled: body.loyaltyProgramEnabled ?? true,
      loyaltyPointsPerCurrencyUnit:
        typeof body.loyaltyPointsPerCurrencyUnit === "number"
          ? body.loyaltyPointsPerCurrencyUnit
          : 1,
      loyaltyRedemptionEnabled: body.loyaltyRedemptionEnabled ?? false,
      loyaltyRedemptionPointsStep:
        typeof body.loyaltyRedemptionPointsStep === "number"
          ? body.loyaltyRedemptionPointsStep
          : 100,
      loyaltyRedemptionValueAmount:
        typeof body.loyaltyRedemptionValueAmount === "number"
          ? body.loyaltyRedemptionValueAmount
          : 1,
      loyaltyMinimumRedeemPoints:
        typeof body.loyaltyMinimumRedeemPoints === "number"
          ? body.loyaltyMinimumRedeemPoints
          : 100,
      loyaltyMaximumRedeemPercentOfSale:
        typeof body.loyaltyMaximumRedeemPercentOfSale === "number"
          ? body.loyaltyMaximumRedeemPercentOfSale
          : 100
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update the loyalty policy."
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400
      }
    );
  }
}
