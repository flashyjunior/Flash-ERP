import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { requireOnlineStoreStaff } from "@/server/ecommerce/ecommerce.repository";

export const runtime = "nodejs";

const maxUploadBytes = 8 * 1024 * 1024;
const supportedMimeTypes = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/avif", ".avif"]
]);

function resolveEnterpriseWebRoot() {
  const candidates = [process.cwd(), path.join(process.cwd(), "apps", "enterprise-web")];
  return candidates.find((candidate) => existsSync(path.join(candidate, "next.config.ts"))) ?? candidates[0];
}

export async function POST(request: Request) {
  try {
    await requireOnlineStoreStaff();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      throw new Error("Choose a storefront image to upload.");
    }
    if (file.size > maxUploadBytes) {
      throw new Error("Storefront images must be 8 MB or smaller.");
    }
    const extension = supportedMimeTypes.get(file.type);
    if (!extension) {
      throw new Error("Use a JPG, PNG, WEBP, or AVIF image.");
    }

    const uploadDir = path.join(resolveEnterpriseWebRoot(), "public", "uploads", "ecommerce");
    const fileName = `${Date.now()}-${randomUUID()}${extension}`;
    mkdirSync(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));

    return NextResponse.json({
      url: `/uploads/ecommerce/${fileName}`,
      message: "Storefront image uploaded."
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "The image could not be uploaded." },
      { status: 400 }
    );
  }
}
