import { NextResponse } from "next/server";

import { getEnterpriseDatabaseReadiness } from "@/server/readiness/enterprise-database-readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = await getEnterpriseDatabaseReadiness();

  return NextResponse.json(readiness, {
    status: readiness.ready ? 200 : 503
  });
}
