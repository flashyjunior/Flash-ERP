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
const mimeTypeByExtension = new Map<string, string>([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".avif", "image/avif"]
]);
const supportedExtensions = new Set<string>([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

function resolveExtension(file: File) {
  const supportedExtension = supportedMimeTypes.get(file.type);

  if (supportedExtension) {
    return supportedExtension;
  }

  const extension = path.extname(file.name).toLowerCase();
  return supportedExtensions.has(extension) ? extension : null;
}

function resolveMimeType(file: File, extension: string) {
  return supportedMimeTypes.has(file.type)
    ? file.type
    : (mimeTypeByExtension.get(extension) ?? "application/octet-stream");
}

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["settings.company.manage"]);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Error("Flash ERP needs an image file before it can upload the company logo.");
    }

    if (file.size <= 0) {
      throw new Error("Flash ERP received an empty file. Choose a valid company logo.");
    }

    if (file.size > maxUploadBytes) {
      throw new Error("Flash ERP only accepts company logos up to 5 MB.");
    }

    const extension = resolveExtension(file);

    if (!extension) {
      throw new Error("Flash ERP supports PNG, JPG, WEBP, GIF, and AVIF logo uploads only.");
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const mimeType = resolveMimeType(file, extension);

    return NextResponse.json({
      url: `data:${mimeType};base64,${fileBuffer.toString("base64")}`,
      message: `${file.name} uploaded successfully. Flash ERP attached it to the company profile.`
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not upload the company logo."
      },
      {
        status: 400
      }
    );
  }
}
