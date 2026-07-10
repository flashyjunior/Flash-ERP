import { NextResponse } from "next/server";

import { assertEnterpriseOrOnlineStorePermission } from "@/server/auth/enterprise-session";
import { readFuelEvidenceFile } from "@/server/files/fuel-evidence-storage";

export const runtime = "nodejs";

type FuelEvidenceFileRouteContext = {
  params: Promise<{ fileName: string }>;
};

export async function GET(_request: Request, context: FuelEvidenceFileRouteContext) {
  await assertEnterpriseOrOnlineStorePermission(
    ["settings.company.manage"],
    ["fuel.dip.capture", "fuel.meter-reading.capture", "fuel.reconciliation.manage"],
    { any: true }
  );

  const { fileName } = await context.params;
  const evidence = await readFuelEvidenceFile(fileName);

  if (!evidence) {
    return NextResponse.json({ message: "Fuel evidence photo was not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(evidence.file), {
    headers: {
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${evidence.fileName}"`,
      "Content-Type": evidence.contentType
    }
  });
}
