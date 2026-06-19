import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { provisionEnterpriseStoreTopology } from "@/server/repositories/enterprise-stores.repository";

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      storeCode: string;
    }>;
  }
) {
  try {
    await assertEnterprisePermission(["master.store.manage"]);
    const params = await context.params;
    const body = (await request.json()) as {
      primaryWarehouseCode?: string;
      primaryWarehouseName?: string;
      primaryTerminalCode?: string;
      primaryTerminalName?: string;
      primaryNodeCode?: string;
      primaryNodeName?: string;
      primaryLocationCode?: string;
      primaryLocationName?: string;
      primaryLocationType?: string | null;
    };

    const response = await provisionEnterpriseStoreTopology(params.storeCode, {
      primaryWarehouseCode: body.primaryWarehouseCode ?? "",
      primaryWarehouseName: body.primaryWarehouseName ?? "",
      primaryTerminalCode: body.primaryTerminalCode ?? "",
      primaryTerminalName: body.primaryTerminalName ?? "",
      primaryNodeCode: body.primaryNodeCode ?? "",
      primaryNodeName: body.primaryNodeName ?? "",
      primaryLocationCode: body.primaryLocationCode ?? "",
      primaryLocationName: body.primaryLocationName ?? "",
      primaryLocationType: body.primaryLocationType ?? "STORE_FLOOR"
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not provision that store topology."
      },
      {
        status: 400
      }
    );
  }
}
