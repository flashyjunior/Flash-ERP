import { NextResponse } from "next/server";

import {
  createOnlineStoreSalesOrder,
  getOnlineStorePendingSalesOrders
} from "@/server/repositories/online-store.repository";

export async function GET() {
  try {
    return NextResponse.json({ salesOrders: await getOnlineStorePendingSalesOrders() });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not refresh pending Online POS sales orders."
      },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await createOnlineStoreSalesOrder({
      customerId: body?.customerId ?? "",
      lines: Array.isArray(body?.lines) ? body.lines : [],
      orderType: body?.orderType ?? null,
      payments: Array.isArray(body?.payments) ? body.payments : null,
      depositAmount: body?.depositAmount ?? null,
      depositTenderMethodCode: body?.depositTenderMethodCode ?? null,
      depositReference: body?.depositReference ?? null,
      serviceType: body?.serviceType ?? null,
      note: body?.note ?? null,
      layawayExpiresAt: body?.layawayExpiresAt ?? null,
      policyOverrideApproved: body?.policyOverrideApproved === true,
      managerOverride: body?.managerOverride ?? null,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save that Online POS sales order."
      },
      { status: 400 }
    );
  }
}
