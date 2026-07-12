import { NextResponse } from "next/server";

import {
  assertEnterpriseOrOnlineStorePermission,
  EnterpriseAuthError
} from "@/server/auth/enterprise-session";
import { readStoreExpenseFile } from "@/server/files/store-expense-storage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    fileName: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    await assertEnterpriseOrOnlineStorePermission(
      [
        "operations.dashboard.view",
        "finance.cashbook.manage",
        "finance.journal.post",
        "finance.reports.view",
        "settings.company.manage"
      ],
      ["inventory.transfer.request"],
      { any: true }
    );

    const { fileName } = await context.params;
    const attachment = await readStoreExpenseFile(fileName);

    if (!attachment) {
      return NextResponse.json({ message: "Store expense attachment was not found." }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(attachment.file), {
      headers: {
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${attachment.fileName}"`,
        "Content-Type": attachment.contentType
      }
    });
  } catch (error) {
    const status = error instanceof EnterpriseAuthError ? error.status : 500;

    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not open the store expense attachment."
      },
      { status }
    );
  }
}
