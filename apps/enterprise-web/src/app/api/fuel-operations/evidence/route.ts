import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { assertEnterpriseOrOnlineStorePermission } from "@/server/auth/enterprise-session";

export const runtime = "nodejs";

const maxUploadBytes = 8 * 1024 * 1024;
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

function normalizeEvidenceKind(value: FormDataEntryValue | null) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "fuel";
}

export async function POST(request: Request) {
  try {
    await assertEnterpriseOrOnlineStorePermission(
      ["settings.company.manage"],
      ["fuel.dip.capture", "fuel.meter-reading.capture"],
      { any: true }
    );
    const formData = await request.formData();
    const file = formData.get("file");
    const evidenceKind = normalizeEvidenceKind(formData.get("evidenceKind"));

    if (!(file instanceof File)) {
      throw new Error("Flash ERP needs a photo before it can upload fuel evidence.");
    }

    if (file.size <= 0) {
      throw new Error("Flash ERP received an empty photo. Capture or choose a valid image.");
    }

    if (file.size > maxUploadBytes) {
      throw new Error("Flash ERP only accepts fuel evidence photos up to 8 MB.");
    }

    const extension = resolveExtension(file);

    if (!extension) {
      throw new Error("Flash ERP supports PNG, JPG, WEBP, GIF, and AVIF fuel evidence photos only.");
    }

    const enterpriseWebRoot = resolveEnterpriseWebRoot();
    const uploadDir = path.join(enterpriseWebRoot, "public", "uploads", "fuel-evidence");
    const fileName = `${Date.now()}-${evidenceKind}-${randomUUID()}${extension}`;
    const outputPath = path.join(uploadDir, fileName);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const capturedAt = file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString();

    mkdirSync(uploadDir, { recursive: true });
    await writeFile(outputPath, fileBuffer);

    return NextResponse.json({
      url: `/uploads/fuel-evidence/${fileName}`,
      fileName,
      capturedAt,
      uploadedAt: new Date().toISOString(),
      message: `${file.name} uploaded as Fuel Operations evidence.`
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not upload the fuel evidence photo."
      },
      {
        status: 400
      }
    );
  }
}
