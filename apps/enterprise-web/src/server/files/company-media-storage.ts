import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const companyMediaRoutePrefix = "/api/media/company";
const contentTypesByExtension = new Map<string, string>([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

function isEnterpriseWebRoot(candidate: string) {
  return ["next.config.mjs", "next.config.js", "next.config.ts"].some((fileName) =>
    existsSync(path.join(candidate, fileName))
  );
}

export function resolveEnterpriseWebRoot() {
  const workingDirectory = process.cwd();
  const candidates = [
    workingDirectory,
    path.join(workingDirectory, "apps", "enterprise-web"),
    path.resolve(workingDirectory, "..", ".."),
    path.resolve(workingDirectory, "..", "..", "apps", "enterprise-web")
  ];
  const webRoot = candidates.find((candidate) => isEnterpriseWebRoot(candidate));

  return webRoot ?? workingDirectory;
}

function resolveReleaseSharedMediaRoot(webRoot: string) {
  let current = path.resolve(webRoot);

  while (true) {
    const parent = path.dirname(current);

    if (path.basename(parent).toLowerCase() === "releases") {
      return path.join(path.dirname(parent), "shared", "public-media");
    }

    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

export function resolveCompanyMediaStorageRoot() {
  const configuredRoot = process.env.FLASH_ERP_PUBLIC_MEDIA_ROOT?.trim();

  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }

  const webRoot = resolveEnterpriseWebRoot();
  return (
    resolveReleaseSharedMediaRoot(webRoot) ??
    path.join(webRoot, "storage", "public-media")
  );
}

export function resolveCompanyMediaUploadDirectory() {
  return path.join(resolveCompanyMediaStorageRoot(), "company");
}

export function buildCompanyMediaUrl(fileName: string) {
  return `${companyMediaRoutePrefix}/${encodeURIComponent(fileName)}`;
}

export function normalizeCompanyMediaUrl(value: string) {
  const trimmed = value.trim();
  const legacyMatch = trimmed.match(
    /^\/uploads\/(?:company|login-backgrounds)\/([^/?#]+)([?#].*)?$/i
  );

  if (!legacyMatch) {
    return trimmed;
  }

  let fileName = legacyMatch[1];

  try {
    fileName = decodeURIComponent(fileName);
  } catch {
    return trimmed;
  }

  return `${buildCompanyMediaUrl(fileName)}${legacyMatch[2] ?? ""}`;
}

function safeCompanyMediaFileName(value: string) {
  const fileName = value.trim();
  const extension = path.extname(fileName).toLowerCase();

  if (
    !fileName ||
    fileName !== path.basename(fileName) ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    !contentTypesByExtension.has(extension)
  ) {
    return null;
  }

  return { fileName, extension };
}

function uniquePaths(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = path.resolve(value).toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export async function readCompanyMediaFile(requestedFileName: string) {
  const safeFile = safeCompanyMediaFileName(requestedFileName);

  if (!safeFile) {
    return null;
  }

  const webRoot = resolveEnterpriseWebRoot();
  const workingDirectory = process.cwd();
  const candidates = uniquePaths([
    path.join(resolveCompanyMediaUploadDirectory(), safeFile.fileName),
    path.join(webRoot, "public", "uploads", "company", safeFile.fileName),
    path.join(webRoot, "public", "uploads", "login-backgrounds", safeFile.fileName),
    path.join(workingDirectory, "public", "uploads", "company", safeFile.fileName),
    path.join(workingDirectory, "public", "uploads", "login-backgrounds", safeFile.fileName),
    path.join(
      workingDirectory,
      "apps",
      "enterprise-web",
      "public",
      "uploads",
      "company",
      safeFile.fileName
    ),
    path.join(
      workingDirectory,
      "apps",
      "enterprise-web",
      "public",
      "uploads",
      "login-backgrounds",
      safeFile.fileName
    )
  ]);

  for (const candidate of candidates) {
    try {
      const fileStat = await stat(candidate);

      if (!fileStat.isFile()) {
        continue;
      }

      return {
        buffer: await readFile(candidate),
        contentType: contentTypesByExtension.get(safeFile.extension)!,
        lastModified: fileStat.mtime
      };
    } catch {
      // Continue through durable and legacy locations until the media is found.
    }
  }

  return null;
}
