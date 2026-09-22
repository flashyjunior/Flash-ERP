import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { updateEnterpriseReceiptTemplate } from "@/server/repositories/enterprise-setup.repository";

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      receiptTemplateCode: string;
    }>;
  }
) {
  try {
    await assertEnterprisePermission(["settings.receipt-template.manage"]);
    const params = await context.params;
    const body = (await request.json()) as {
      name?: string;
      description?: string | null;
      templateHtml?: string;
      paperWidthMm?: number | null;
      isDefault?: boolean;
      status?: string;
    };

    const response = await updateEnterpriseReceiptTemplate(params.receiptTemplateCode, {
      receiptTemplateCode: params.receiptTemplateCode,
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
            : "Flash ERP could not update that receipt template."
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400
      }
    );
  }
}
