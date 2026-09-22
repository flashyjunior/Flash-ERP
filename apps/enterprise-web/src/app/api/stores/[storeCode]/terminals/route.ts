import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { createEnterpriseStoreTerminal } from "@/server/repositories/enterprise-stores.repository";

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      storeCode: string;
    }>;
  },
) {
  try {
    await assertEnterprisePermission(["master.store.manage"]);
    const { storeCode } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      terminalCode?: string | null;
      terminalName?: string | null;
      status?: string | null;
      nodeCode?: string | null;
      nodeName?: string | null;
    };
    const response = await createEnterpriseStoreTerminal(
      decodeURIComponent(storeCode),
      {
        terminalCode: body.terminalCode ?? "",
        terminalName: body.terminalName ?? "",
        status: body.status ?? "ACTIVE",
        nodeCode: body.nodeCode ?? null,
        nodeName: body.nodeName ?? null,
      },
    );

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not register that terminal.",
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400,
      },
    );
  }
}
