import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { updateEnterpriseProductCategory } from "@/server/repositories/enterprise-setup.repository";

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      categoryCode: string;
    }>;
  }
) {
  try {
    await assertEnterprisePermission(["master.category.manage"]);
    const params = await context.params;
    const body = (await request.json()) as {
      departmentCode?: string;
      name?: string;
      description?: string | null;
      sortOrder?: number | null;
      status?: string;
    };

    const response = await updateEnterpriseProductCategory(params.categoryCode, {
      categoryCode: params.categoryCode,
      departmentCode: body.departmentCode ?? "",
      name: body.name ?? "",
      description: body.description ?? null,
      sortOrder: body.sortOrder ?? 0,
      status: body.status ?? "ACTIVE"
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not update that category."
      },
      {
        status: 400
      }
    );
  }
}
