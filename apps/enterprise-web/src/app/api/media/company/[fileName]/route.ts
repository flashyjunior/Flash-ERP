import { NextResponse } from "next/server";

import { readCompanyMediaFile } from "@/server/files/company-media-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CompanyMediaRouteProps = {
  params: Promise<{
    fileName: string;
  }>;
};

export async function GET(_request: Request, { params }: CompanyMediaRouteProps) {
  const { fileName } = await params;
  const media = await readCompanyMediaFile(fileName);

  if (!media) {
    return NextResponse.json(
      { message: "Flash ERP could not find this company media file." },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(media.buffer), {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Type": media.contentType,
      "Last-Modified": media.lastModified.toUTCString(),
      "X-Content-Type-Options": "nosniff"
    }
  });
}
