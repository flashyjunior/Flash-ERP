import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { createEnterpriseProductCategory } from "@/server/repositories/enterprise-setup.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["master.category.manage"]);
    const body = (await request.json()) as {
      categoryCode?: string;
      departmentCode?: string;
      name?: string;
      description?: string | null;
      sortOrder?: number | null;
      status?: string;
    };

    const response = await createEnterpriseProductCategory({
      categoryCode: body.categoryCode ?? "",
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
          error instanceof Error ? error.message : "Flash ERP could not create that category."
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400
      }
    );
  }
}
