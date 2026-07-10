import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const supportedConfigNames = ["next.config.mjs", "next.config.js", "next.config.ts"];
const contentTypes = new Map<string, string>([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

export function resolveEnterpriseWebRoot() {
  const candidates = [process.cwd(), path.join(process.cwd(), "apps", "enterprise-web")];

  return (
    candidates.find((candidate) =>
      supportedConfigNames.some((configName) => existsSync(path.join(candidate, configName)))
    ) ?? candidates[0]
  );
}

export function resolveFuelEvidenceUploadDir() {
  return path.join(resolveEnterpriseWebRoot(), "public", "uploads", "fuel-evidence");
}

export function normalizeFuelEvidenceFileName(fileName: string) {
  return path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "");
}

export function getFuelEvidenceContentType(fileName: string) {
  return contentTypes.get(path.extname(fileName).toLowerCase()) ?? "application/octet-stream";
}

export async function readFuelEvidenceFile(fileName: string) {
  const normalizedFileName = normalizeFuelEvidenceFileName(fileName);

  if (!normalizedFileName) {
    return null;
  }

  try {
    const file = await readFile(path.join(resolveFuelEvidenceUploadDir(), normalizedFileName));

    return {
      file,
      fileName: normalizedFileName,
      contentType: getFuelEvidenceContentType(normalizedFileName)
    };
  } catch {
    return null;
  }
}
