import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { updateEnterpriseStore } from "@/server/repositories/enterprise-stores.repository";

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
    const params = await context.params;
    const body = (await request.json()) as {
      storeName?: string;
      shortName?: string | null;
      timezone?: string;
      currencyCode?: string;
      salesEnabled?: boolean | null;
      warehouseEnabled?: boolean | null;
      storeMode?: string | null;
      status?: string;
      phone?: string | null;
      email?: string | null;
      managerName?: string | null;
      location?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      region?: string | null;
      storeGroupCode?: string | null;
      storeGroupName?: string | null;
      storeGroupType?: string | null;
      licenseStatus?: string | null;
      licenseKey?: string | null;
      licensedUntil?: string | null;
      touchModeEnabled?: boolean | null;
      countryCode?: string | null;
      postalCode?: string | null;
      taxRegistrationNo?: string | null;
      receiptHeader?: string | null;
      receiptFooter?: string | null;
      salesReceiptTemplateCode?: string | null;
      retainLegacyReceiptTemplate?: boolean | null;
      salesReceiptTemplateHtml?: string | null;
      openedOn?: string | null;
    };

    const response = await updateEnterpriseStore(params.storeCode, {
      storeName: body.storeName ?? "",
      shortName: body.shortName ?? null,
      timezone: body.timezone ?? "",
      currencyCode: body.currencyCode ?? "",
      salesEnabled: body.salesEnabled ?? true,
      warehouseEnabled: body.warehouseEnabled ?? true,
      storeMode: body.storeMode ?? "OFFLINE_FIRST",
      status: body.status ?? "ACTIVE",
      phone: body.phone ?? null,
      email: body.email ?? null,
      managerName: body.managerName ?? null,
      location: body.location ?? null,
      addressLine1: body.addressLine1 ?? null,
      addressLine2: body.addressLine2 ?? null,
      city: body.city ?? null,
      region: body.region ?? null,
      storeGroupCode: body.storeGroupCode ?? null,
      storeGroupName: body.storeGroupName ?? null,
      storeGroupType: body.storeGroupType ?? null,
      licenseStatus: "licenseStatus" in body ? body.licenseStatus : undefined,
      licenseKey: "licenseKey" in body ? body.licenseKey : undefined,
      licensedUntil: "licensedUntil" in body ? body.licensedUntil : undefined,
      touchModeEnabled: body.touchModeEnabled ?? true,
      countryCode: body.countryCode ?? null,
      postalCode: body.postalCode ?? null,
      taxRegistrationNo: body.taxRegistrationNo ?? null,
      receiptHeader: body.receiptHeader ?? null,
      receiptFooter: body.receiptFooter ?? null,
      salesReceiptTemplateCode: body.salesReceiptTemplateCode ?? null,
      retainLegacyReceiptTemplate: body.retainLegacyReceiptTemplate ?? false,
      salesReceiptTemplateHtml: body.salesReceiptTemplateHtml ?? null,
      openedOn: body.openedOn ?? null,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update that store.",
      },
      {
        status: 400,
      },
    );
  }
}
