import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { upsertEnterpriseStoreInventoryLocation } from "@/server/repositories/enterprise-stores.repository";
import { publishStoreInventoryLocations } from "@/server/repositories/store-sync.repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ storeCode: string }> },
) {
  try {
    await assertEnterprisePermission(["master.store.manage"]);
    const { storeCode } = await params;
    const body = await request.json().catch(() => ({}));
    const response = await upsertEnterpriseStoreInventoryLocation(
      decodeURIComponent(storeCode),
      {
        locationCode: body?.locationCode ?? null,
        originalLocationCode: body?.originalLocationCode ?? null,
        locationName: body?.locationName ?? null,
        locationType: body?.locationType ?? null,
        warehouseCode: body?.warehouseCode ?? null,
        status: body?.status ?? null,
        useForSalesDefault: body?.useForSalesDefault === true,
        useForSalesOrderDefault: body?.useForSalesOrderDefault === true,
        useForReceivingDefault: body?.useForReceivingDefault === true,
      },
    );
    const publishResult = await publishStoreInventoryLocations(
      decodeURIComponent(storeCode),
      {
        operatorName:
          typeof body?.operatorName === "string" ? body.operatorName : null,
        note:
          typeof body?.note === "string"
            ? body.note
            : `Inventory location ${response.locationCode} was saved from the store workspace.`,
      },
    ).catch((error) => ({
      message:
        error instanceof Error
          ? `Saved, but location publish is waiting: ${error.message}`
          : "Saved, but location publish is waiting.",
    }));

    return NextResponse.json({
      ...response,
      publishMessage: publishResult.message,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save that inventory location.",
      },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 },
    );
  }
}
