import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const domainCatalogSource = path.join(
  repositoryRoot,
  "packages",
  "domain",
  "src",
  "security-permissions.ts"
);
const securityRepositorySource = path.join(
  repositoryRoot,
  "apps",
  "enterprise-web",
  "src",
  "server",
  "repositories",
  "enterprise-security.repository.ts"
);

/**
 * Permission codes that must stay reachable in the enterprise security UI and in
 * `ensureEnterprisePermissionCatalog()`, which writes the rows that role grants
 * are resolved against. A code in this list that cannot be reached at runtime
 * leaves the matching workspace (for example /security/data-purge) ungrantable.
 */
const requiredRuntimeCodes = ["security.data-purge.execute"];

function readSource(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Expected source file is missing: ${filePath}`);
  }

  return fs.readFileSync(filePath, "utf8");
}

function extractCodes(source) {
  return [...source.matchAll(/^\s*code:\s*"([a-z0-9._-]+)",\s*$/gm)].map((match) => match[1]);
}

/**
 * Returns the codes declared inside `explicitSecurityPermissionFallbacks`, which
 * is the app-local safety net for permission codes the domain catalog does not
 * expose yet.
 */
function extractFallbackCodes(source) {
  const start = source.indexOf("const explicitSecurityPermissionFallbacks");

  if (start < 0) {
    throw new Error(
      "enterprise-security.repository.ts no longer declares explicitSecurityPermissionFallbacks."
    );
  }

  const end = source.indexOf("\n];", start);

  if (end < 0) {
    throw new Error("Could not find the end of explicitSecurityPermissionFallbacks.");
  }

  return extractCodes(source.slice(start, end));
}

/**
 * Resolves `@flash-erp/domain` the way the running Next.js server does, i.e.
 * through node_modules and the package `main`/`exports` fields, so this audit
 * sees the compiled bundle rather than the `src` that TypeScript `paths` map to.
 */
async function loadRuntimeDomainCatalog() {
  const require = createRequire(path.join(repositoryRoot, "noop.cjs"));
  let entryPoint = null;

  try {
    entryPoint = require.resolve("@flash-erp/domain");
  } catch (error) {
    return {
      entryPoint,
      codes: null,
      failure: `@flash-erp/domain cannot be resolved from the repository root (${error.code ?? error.message}).`
    };
  }

  if (!fs.existsSync(entryPoint)) {
    return {
      entryPoint,
      codes: null,
      failure: `The compiled domain bundle is missing at ${path.relative(repositoryRoot, entryPoint)}. Run \`npm run build:domain\`.`
    };
  }

  let module = null;

  try {
    module = await import(`file://${entryPoint}`);
  } catch (error) {
    return {
      entryPoint,
      codes: null,
      failure: `The compiled domain bundle at ${path.relative(repositoryRoot, entryPoint)} failed to load: ${error.message}`
    };
  }

  const catalog = module?.securityPermissionCatalog;

  if (!Array.isArray(catalog)) {
    return {
      entryPoint,
      codes: null,
      failure: `The compiled domain bundle at ${path.relative(repositoryRoot, entryPoint)} does not export securityPermissionCatalog. It is stale; run \`npm run build:domain\`.`
    };
  }

  return {
    entryPoint,
    codes: catalog.map((permission) => permission.code).filter(Boolean),
    failure: null
  };
}

const catalogSource = readSource(domainCatalogSource);
const repositorySource = readSource(securityRepositorySource);
const sourceCodes = [...new Set(extractCodes(catalogSource))];
const fallbackCodes = [...new Set(extractFallbackCodes(repositorySource))];
const runtime = await loadRuntimeDomainCatalog();
const findings = [];

if (sourceCodes.length === 0) {
  findings.push("No permission codes were parsed out of the domain catalog source.");
}

if (runtime.failure) {
  findings.push(runtime.failure);
}

const runtimeCodes = runtime.codes ? new Set(runtime.codes) : null;
const unreachableCodes = runtimeCodes
  ? sourceCodes.filter(
      (code) => !runtimeCodes.has(code) && !fallbackCodes.includes(code)
    )
  : [];

for (const code of unreachableCodes) {
  findings.push(
    `Security catalog drift: "${code}" exists in packages/domain/src/security-permissions.ts but not in the compiled bundle ${path.relative(
      repositoryRoot,
      runtime.entryPoint ?? "packages/domain/dist/index.js"
    )}. Rebuild the domain workspace (\`npm run build:domain\`) and restart any running enterprise-web server.`
  );
}

for (const code of requiredRuntimeCodes) {
  const reachableInSource = sourceCodes.includes(code);
  const reachableAtRuntime =
    (runtimeCodes?.has(code) ?? false) || fallbackCodes.includes(code);

  if (!reachableInSource) {
    findings.push(
      `Required permission code "${code}" is missing from packages/domain/src/security-permissions.ts.`
    );
  }

  if (!reachableAtRuntime) {
    findings.push(
      `Required permission code "${code}" is not reachable at runtime: it is absent from the compiled domain bundle and from explicitSecurityPermissionFallbacks, so the privilege checklist will not show it and no role can be granted it.`
    );
  }
}

const summary = `Domain security catalog audit: ${sourceCodes.length} catalog code(s), ${fallbackCodes.length} app fallback(s), ${
  runtimeCodes ? `${runtimeCodes.size} runtime code(s)` : "runtime bundle unavailable"
  }.`;

if (findings.length === 0) {
  process.stdout.write(`${summary}\nDomain security catalog audit passed.\n`);
} else {
  process.stdout.write(`${summary}\n`);
  for (const finding of findings) {
    process.stdout.write(`FAIL ${finding}\n`);
  }
  process.exitCode = 1;
}
