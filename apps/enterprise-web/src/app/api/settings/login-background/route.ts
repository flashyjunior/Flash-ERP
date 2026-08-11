import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";

export const runtime = "nodejs";

const maxUploadBytes = 5 * 1024 * 1024;
const supportedMimeTypes = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/avif", ".avif"]
]);
const supportedExtensions = new Set<string>([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

function resolveEnterpriseWebRoot() {
  const candidates = [process.cwd(), path.join(process.cwd(), "apps", "enterprise-web")];

  return (
    candidates.find((candidate) => existsSync(path.join(candidate, "next.config.ts"))) ??
    candidates[0]
  );
}

function resolveExtension(file: File) {
  const supportedExtension = supportedMimeTypes.get(file.type);

  if (supportedExtension) {
    return supportedExtension;
  }

  const extension = path.extname(file.name).toLowerCase();
  return supportedExtensions.has(extension) ? extension : null;
}

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["settings.company.manage"]);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Error("Flash ERP needs an image file before it can upload the login background.");
    }

    if (file.size <= 0) {
      throw new Error("Flash ERP received an empty file. Choose a valid login background.");
    }

    if (file.size > maxUploadBytes) {
      throw new Error("Flash ERP only accepts login backgrounds up to 5 MB.");
    }

    const extension = resolveExtension(file);

    if (!extension) {
      throw new Error("Flash ERP supports PNG, JPG, WEBP, GIF, and AVIF background uploads only.");
    }

    const enterpriseWebRoot = resolveEnterpriseWebRoot();
    const uploadDir = path.join(enterpriseWebRoot, "public", "uploads", "company");
    const fileName = `${Date.now()}-${randomUUID()}-login-background${extension}`;
    const outputPath = path.join(uploadDir, fileName);
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    mkdirSync(uploadDir, { recursive: true });
    await writeFile(outputPath, fileBuffer);

    return NextResponse.json({
      url: `/uploads/company/${fileName}`,
      message: `${file.name} uploaded successfully. Flash ERP attached it to the login background.`
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not upload the login background."
      },
      {
        status: 400
      }
    );
  }
}
