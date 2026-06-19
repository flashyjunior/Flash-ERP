import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { registerEnterpriseStoreNode } from "@/server/repositories/enterprise-dashboard.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["master.store.manage", "sync.admin.reseed"], {
      any: true
    });
    const body = (await request.json()) as {
      storeCode?: string;
      terminalCode?: string | null;
      nodeCode?: string;
      nodeType?: string | null;
      notes?: string | null;
    };

    const response = await registerEnterpriseStoreNode({
      storeCode: body.storeCode ?? "",
      terminalCode: body.terminalCode ?? null,
      nodeCode: body.nodeCode ?? "",
      nodeType: body.nodeType ?? "STORE_DESKTOP",
      notes: body.notes ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not register that store node."
      },
      {
        status: 400
      }
    );
  }
}
