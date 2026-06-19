import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { createEnterpriseStore } from "@/server/repositories/enterprise-stores.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["master.store.manage"]);
    const body = (await request.json()) as {
      storeCode?: string;
      storeName?: string;
      shortName?: string | null;
      timezone?: string;
      currencyCode?: string;
      salesEnabled?: boolean | null;
      warehouseEnabled?: boolean | null;
      storeMode?: string | null;
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
      salesReceiptTemplateHtml?: string | null;
      openedOn?: string | null;
    };

    const response = await createEnterpriseStore({
      storeCode: body.storeCode ?? "",
      storeName: body.storeName ?? "",
      shortName: body.shortName ?? null,
      timezone: body.timezone ?? "",
      currencyCode: body.currencyCode ?? "",
      salesEnabled: body.salesEnabled ?? true,
      warehouseEnabled: body.warehouseEnabled ?? true,
      storeMode: body.storeMode ?? "OFFLINE_FIRST",
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
      licenseStatus: body.licenseStatus ?? "UNLICENSED",
      licenseKey: body.licenseKey ?? null,
      licensedUntil: body.licensedUntil ?? null,
      touchModeEnabled: body.touchModeEnabled ?? true,
      countryCode: body.countryCode ?? null,
      postalCode: body.postalCode ?? null,
      taxRegistrationNo: body.taxRegistrationNo ?? null,
      receiptHeader: body.receiptHeader ?? null,
      receiptFooter: body.receiptFooter ?? null,
      salesReceiptTemplateCode: body.salesReceiptTemplateCode ?? null,
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
            : "Flash ERP could not create that store.",
      },
      {
        status: 400,
      },
    );
  }
}
