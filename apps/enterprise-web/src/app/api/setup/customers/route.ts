import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { createEnterpriseCustomer } from "@/server/repositories/enterprise-customers.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["master.customer.manage"]);
    const body = (await request.json()) as {
      customerNo?: string;
      fullName?: string;
      customerType?: string;
      phone?: string | null;
      email?: string | null;
      addressLine1?: string | null;
      city?: string | null;
      countryCode?: string | null;
      homeStoreCode?: string | null;
      loyaltyEnrolled?: boolean;
      loyaltyTier?: string | null;
      loyaltyPointsBalance?: number | null;
      allowCreditSales?: boolean;
      paymentTermsCode?: string | null;
      creditLimitAmount?: number | null;
      receivableBalanceAmount?: number | null;
      note?: string | null;
      status?: string;
      sourceReferenceCaptureId?: string | null;
    };

    const response = await createEnterpriseCustomer({
      customerNo: body.customerNo ?? "",
      fullName: body.fullName ?? "",
      customerType: body.customerType ?? "INDIVIDUAL",
      phone: body.phone ?? null,
      email: body.email ?? null,
      addressLine1: body.addressLine1 ?? null,
      city: body.city ?? null,
      countryCode: body.countryCode ?? null,
      homeStoreCode: body.homeStoreCode ?? null,
      loyaltyEnrolled: body.loyaltyEnrolled ?? false,
      loyaltyTier: body.loyaltyTier ?? null,
      loyaltyPointsBalance:
        typeof body.loyaltyPointsBalance === "number" ? body.loyaltyPointsBalance : 0,
      allowCreditSales: body.allowCreditSales ?? false,
      paymentTermsCode: body.paymentTermsCode ?? null,
      creditLimitAmount:
        typeof body.creditLimitAmount === "number" ? body.creditLimitAmount : null,
      receivableBalanceAmount:
        typeof body.receivableBalanceAmount === "number" ? body.receivableBalanceAmount : 0,
      note: body.note ?? null,
      status: body.status ?? "ACTIVE",
      sourceReferenceCaptureId: body.sourceReferenceCaptureId ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not create that customer."
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400
      }
    );
  }
}
