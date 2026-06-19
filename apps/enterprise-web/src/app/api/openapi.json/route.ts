import { NextResponse } from "next/server";

import { buildFlashRmsOpenApiDocument } from "@/server/integrations/openapi";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildFlashRmsOpenApiDocument());
}
