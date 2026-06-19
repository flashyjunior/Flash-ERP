import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { createEnterpriseReceiptTemplate } from "@/server/repositories/enterprise-setup.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["settings.receipt-template.manage"]);
    const body = (await request.json()) as {
      receiptTemplateCode?: string;
      name?: string;
      description?: string | null;
      templateHtml?: string;
      paperWidthMm?: number | null;
      isDefault?: boolean;
      status?: string;
    };

    const response = await createEnterpriseReceiptTemplate({
      receiptTemplateCode: body.receiptTemplateCode ?? "",
      name: body.name ?? "",
      description: body.description ?? null,
      templateHtml: body.templateHtml ?? "",
      paperWidthMm: body.paperWidthMm ?? 80,
      isDefault: body.isDefault ?? false,
      status: body.status ?? "ACTIVE"
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not create that receipt template."
      },
      {
        status: 400
      }
    );
  }
}
