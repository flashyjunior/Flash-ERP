import { NextResponse } from "next/server";

import {
  assertEnterprisePermission,
  EnterpriseAuthError
} from "@/server/auth/enterprise-session";
import { requestStoreDatabaseInstruction } from "@/server/repositories/store-sync.repository";

type RouteContext = {
  params: Promise<{
    nodeCode: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await assertEnterprisePermission(["sync.monitor"]);
    const { nodeCode } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      instructionType?: string | null;
      target?: string | null;
      priority?: string | null;
      operatorName?: string | null;
      note?: string | null;
    };
    const result = await requestStoreDatabaseInstruction(decodeURIComponent(nodeCode), {
      ...body,
      operatorName: session.displayName || session.loginId
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not queue that database instruction."
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400
      }
    );
  }
}
