import { NextResponse } from "next/server";

import {
  assertEnterprisePermission,
  EnterpriseAuthError,
} from "@/server/auth/enterprise-session";
import { updateEnterpriseStoreTerminal } from "@/server/repositories/enterprise-stores.repository";

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      storeCode: string;
      terminalCode: string;
    }>;
  },
) {
  try {
    await assertEnterprisePermission(["master.store.manage"]);
    const { storeCode, terminalCode } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      terminalCode?: string | null;
      terminalName?: string | null;
      status?: string | null;
    };
    const response = await updateEnterpriseStoreTerminal(
      decodeURIComponent(storeCode),
      decodeURIComponent(terminalCode),
      {
        terminalCode: body.terminalCode ?? "",
        terminalName: body.terminalName ?? "",
        status: body.status ?? "ACTIVE",
      },
    );

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update that terminal.",
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400,
      },
    );
  }
}
