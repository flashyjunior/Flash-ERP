import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const supportedNextVersion = "16.1.7";
const deployFallback = `    if (process.env.FLASH_ERP_DEPLOY_BUILD === "1") {
        return Promise.resolve(underlyingSearchParams);
    }
`;
const paramsDeployFallback = `    if (process.env.FLASH_ERP_DEPLOY_BUILD === "1") {
        return Promise.resolve(underlyingParams);
    }
`;

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function patchFile(filePath, originalMarker, patchedMarker) {
  const source = readFileSync(filePath, "utf8");

  if (source.includes(patchedMarker)) {
    return { changed: false, hash: sha256(source) };
  }

  if (!source.includes(originalMarker)) {
    throw new Error(
      `[deploy-build] Refusing to patch unexpected Next.js runtime file ${filePath}.`,
    );
  }

  const patched = source.replace(originalMarker, patchedMarker);
  writeFileSync(filePath, patched, "utf8");
  return { changed: true, hash: sha256(patched) };
}

export function applyNextDeployContextPatch() {
  const nextPackagePath = require.resolve("next/package.json");
  const nextPackage = JSON.parse(readFileSync(nextPackagePath, "utf8"));

  if (nextPackage.version !== supportedNextVersion) {
    throw new Error(
      `[deploy-build] Next.js ${nextPackage.version} is not approved for the deploy-context compatibility patch; expected ${supportedNextVersion}.`,
    );
  }

  const nextRoot = path.dirname(nextPackagePath);
  const throwStatement =
    "    (0, _workunitasyncstorageexternal.throwInvariantForMissingStore)();\n";
  const searchParamsPath = path.join(
    nextRoot,
    "dist/server/request/search-params.js",
  );
  const paramsPath = path.join(nextRoot, "dist/server/request/params.js");
  const searchResult = patchFile(
    searchParamsPath,
    `${throwStatement}}\nfunction createPrerenderSearchParamsForClientPage`,
    `${deployFallback}${throwStatement}}\nfunction createPrerenderSearchParamsForClientPage`,
  );
  const paramsResult = patchFile(
    paramsPath,
    `${throwStatement}}\nfunction createPrerenderParamsForClientSegment`,
    `${paramsDeployFallback}${throwStatement}}\nfunction createPrerenderParamsForClientSegment`,
  );

  console.log(
    `[deploy-build] Next.js ${supportedNextVersion} deploy-context patch ${
      searchResult.changed || paramsResult.changed ? "applied" : "already present"
    } (${searchResult.hash.slice(0, 12)}, ${paramsResult.hash.slice(0, 12)}).`,
  );
}

const currentFilePath = fileURLToPath(import.meta.url);

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(currentFilePath)
) {
  applyNextDeployContextPatch();
}
