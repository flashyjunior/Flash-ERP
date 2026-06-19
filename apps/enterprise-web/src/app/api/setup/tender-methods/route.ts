import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { createEnterpriseTenderMethod } from "@/server/repositories/enterprise-setup.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["master.tender.manage"]);
    const body = (await request.json()) as {
      tenderMethodCode?: string;
      name?: string;
      paymentMethod?: string;
      gatewayProvider?: string | null;
      gatewayMode?: string | null;
      gatewayMerchantId?: string | null;
      gatewayPublicKey?: string | null;
      gatewaySecretMask?: string | null;
      gatewayWebhookSecretMask?: string | null;
      gatewayCallbackUrl?: string | null;
      gatewayActive?: boolean;
      description?: string | null;
      requiresReference?: boolean;
      allowChange?: boolean;
      allowRefund?: boolean;
      allowOpenCashDrawer?: boolean;
      sortOrder?: number;
      status?: string;
    };

    const response = await createEnterpriseTenderMethod({
      tenderMethodCode: body.tenderMethodCode ?? "",
      name: body.name ?? "",
      paymentMethod: body.paymentMethod ?? "CASH",
      gatewayProvider: body.gatewayProvider ?? null,
      gatewayMode: body.gatewayMode ?? null,
      gatewayMerchantId: body.gatewayMerchantId ?? null,
      gatewayPublicKey: body.gatewayPublicKey ?? null,
      gatewaySecretMask: body.gatewaySecretMask ?? null,
      gatewayWebhookSecretMask: body.gatewayWebhookSecretMask ?? null,
      gatewayCallbackUrl: body.gatewayCallbackUrl ?? null,
      gatewayActive: body.gatewayActive ?? false,
      description: body.description ?? null,
      requiresReference: body.requiresReference ?? false,
      allowChange: body.allowChange ?? false,
      allowRefund: body.allowRefund ?? true,
      allowOpenCashDrawer: body.allowOpenCashDrawer ?? false,
      sortOrder: body.sortOrder ?? 0,
      status: body.status ?? "ACTIVE"
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not create that tender method."
      },
      {
        status: 400
      }
    );
  }
}
