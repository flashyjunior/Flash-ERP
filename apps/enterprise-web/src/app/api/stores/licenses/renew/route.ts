import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { renewEnterpriseLicenses } from "@/server/repositories/enterprise-stores.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["master.store.manage"]);
    const body = (await request.json()) as {
      storeCodes?: unknown;
      terminalCodes?: unknown;
      terminalIds?: unknown;
      includeAllTerminals?: boolean | null;
      licenseStatus?: string | null;
      licensedUntil?: string | null;
      licenseKey?: string | null;
      storeLicenseKeys?: unknown;
      terminalLicenseKeys?: unknown;
      operatorName?: string | null;
      note?: string | null;
    };

    const response = await renewEnterpriseLicenses({
      storeCodes: body.storeCodes ?? [],
      terminalCodes: body.terminalCodes ?? [],
      terminalIds: body.terminalIds ?? [],
      includeAllTerminals: body.includeAllTerminals ?? false,
      licenseStatus: body.licenseStatus ?? "LICENSED",
      licensedUntil: body.licensedUntil ?? null,
      licenseKey: body.licenseKey ?? null,
      storeLicenseKeys: body.storeLicenseKeys ?? {},
      terminalLicenseKeys: body.terminalLicenseKeys ?? {},
      operatorName: body.operatorName ?? null,
      note: body.note ?? null,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not renew those licenses.",
      },
      {
        status: 400,
      },
    );
  }
}
