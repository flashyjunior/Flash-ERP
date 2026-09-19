/**
 * Flash ERP Mobile startup gate.
 *
 * Release APKs have no red box: a JavaScript error thrown while the bundle is being
 * evaluated, or a native module compiled against the wrong Expo SDK, simply closes the
 * app on launch without any message. `tsc --noEmit` cannot catch any of that, so this
 * gate checks the things that actually took the app down on device:
 *
 *   1. Every Expo / React Native package in apps/mobile/package.json is pinned to the
 *      version bundled with the installed Expo SDK (no SDK 57 native modules on SDK 54).
 *   2. Cleartext HTTP to the HQ endpoint is enabled through the real
 *      `expo-build-properties` plugin, not an ignored ad-hoc app.json key.
 *   3. No source file imports `ErrorUtils` from "react-native" — it is only a TypeScript
 *      type there; at runtime it is `undefined` and dereferencing it kills the root layout.
 *   4. (unless --static-only) A production Android bundle exports successfully and contains
 *      exactly ONE copy of React / React Native / Expo runtime packages. Two copies of
 *      React (root-hoisted 19.2.x for Next.js + nested 19.1.0 for RN) is a guaranteed
 *      first-render crash in this npm-workspaces monorepo.
 *
 * Run: npm run acceptance:mobile-startup            (full, exports a bundle, ~1 min)
 *      npm run acceptance:mobile-startup -- --static-only
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const mobileRoot = path.join(workspaceRoot, "apps", "mobile");
const staticOnly = process.argv.includes("--static-only");

const failures: string[] = [];
const passes: string[] = [];

function fail(message: string) {
  failures.push(message);
  console.error(`  ✖ ${message}`);
}

function pass(message: string) {
  passes.push(message);
  console.log(`  ✔ ${message}`);
}

function readJson<T>(absolutePath: string): T {
  return JSON.parse(readFileSync(absolutePath, "utf8")) as T;
}

/**
 * Build a readable failure report from a spawnSync result. When the child process
 * could not be spawned (or was killed before producing output) `stdout`/`stderr`
 * are `undefined`, not empty strings – the real cause is in `result.error` – so
 * every field must be treated as optional.
 */
function spawnFailureDetail(result: SpawnSyncReturns<string>): string {
  const parts: string[] = [];
  if (result.error) parts.push(`spawn error: ${result.error.message}`);
  if (result.signal) parts.push(`process terminated by ${result.signal}`);
  for (const stream of [result.stderr, result.stdout]) {
    if (typeof stream === "string" && stream.trim()) parts.push(stream.trim());
  }
  return parts.length > 0 ? parts.join("\n").slice(-4000) : "(no output captured)";
}

/**
 * Resolve the workspace-local expo CLI entry point (the `expo` bin is a plain
 * CommonJS script: node_modules/expo/bin/cli). We spawn it with the Node binary
 * that is already running this gate instead of shelling out to `npx`:
 * `npx.cmd` is a Windows batch file and spawning it via spawnSync can fail
 * (ENOENT, PATH or .cmd resolution issues) with no stdout/stderr captured,
 * which previously crashed this script with a TypeError instead of reporting
 * why `expo export` did not run.
 */
function resolveExpoCli(): string | null {
  const candidates = [
    path.join(mobileRoot, "node_modules", "expo", "bin", "cli"),
    path.join(workspaceRoot, "node_modules", "expo", "bin", "cli")
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function resolveFromMobile(request: string): string | null {
  const candidates = [
    path.join(mobileRoot, "node_modules", request),
    path.join(workspaceRoot, "node_modules", request)
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const absolute = path.join(dir, entry);
    if (statSync(absolute).isDirectory()) {
      listSourceFiles(absolute, out);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) {
      out.push(absolute);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// 1. Dependency versions must match the installed Expo SDK.
// ---------------------------------------------------------------------------------------
console.log("\n[1/4] Expo SDK dependency alignment");

const mobilePackage = readJson<{
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}>(path.join(mobileRoot, "package.json"));
const declared = { ...(mobilePackage.dependencies ?? {}), ...(mobilePackage.devDependencies ?? {}) };

const expoPackageJsonPath = resolveFromMobile(path.join("expo", "package.json"));
const bundledNativeModulesPath = resolveFromMobile(path.join("expo", "bundledNativeModules.json"));

if (!expoPackageJsonPath || !bundledNativeModulesPath) {
  fail("expo is not installed – run `npm install` at the workspace root first.");
} else {
  const expoVersion = readJson<{ version: string }>(expoPackageJsonPath).version;
  const bundled = readJson<Record<string, string>>(bundledNativeModulesPath);
  const parseMajor = (range: string) => Number.parseInt(range.replace(/^[^\d]*/, ""), 10);

  let mismatches = 0;
  for (const [name, range] of Object.entries(declared)) {
    const expected = bundled[name];
    if (!expected) continue;
    const installedPackageJson = resolveFromMobile(path.join(name, "package.json"));
    const installed = installedPackageJson
      ? readJson<{ version: string }>(installedPackageJson).version
      : null;

    const expectedMajor = parseMajor(expected);
    const declaredMajor = parseMajor(range);
    const installedMajor = installed ? parseMajor(installed) : declaredMajor;

    if (
      Number.isFinite(expectedMajor) &&
      (declaredMajor !== expectedMajor || installedMajor !== expectedMajor)
    ) {
      mismatches += 1;
      fail(
        `${name}: declared ${range}, installed ${installed ?? "missing"}, but Expo SDK ${expoVersion} bundles ${expected}. ` +
          `Run \`npx expo install ${name}\` inside apps/mobile.`
      );
    }
  }
  if (mismatches === 0) {
    pass(`All ${Object.keys(declared).filter((n) => bundled[n]).length} Expo-managed packages match Expo SDK ${expoVersion}.`);
  }
}

// ---------------------------------------------------------------------------------------
// 2. app.json: cleartext HTTP must be configured through expo-build-properties.
// ---------------------------------------------------------------------------------------
console.log("\n[2/4] Android cleartext (http://) HQ endpoint configuration");

const appConfig = readJson<{
  expo: {
    android?: Record<string, unknown>;
    plugins?: Array<string | [string, Record<string, unknown>?]>;
  };
}>(path.join(mobileRoot, "app.json"));

if (appConfig.expo.android && "usesCleartextTraffic" in appConfig.expo.android) {
  fail(
    "app.json sets expo.android.usesCleartextTraffic – Expo ignores this key. " +
      "Use the expo-build-properties plugin instead."
  );
}

const buildPropertiesPlugin = (appConfig.expo.plugins ?? []).find(
  (plugin) => Array.isArray(plugin) && plugin[0] === "expo-build-properties"
) as [string, { android?: { usesCleartextTraffic?: boolean } }] | undefined;

if (!buildPropertiesPlugin) {
  fail("expo-build-properties plugin is missing from app.json plugins.");
} else if (buildPropertiesPlugin[1]?.android?.usesCleartextTraffic !== true) {
  fail("expo-build-properties plugin does not set android.usesCleartextTraffic: true.");
} else if (!declared["expo-build-properties"]) {
  fail("expo-build-properties is configured in app.json but not declared in apps/mobile/package.json.");
} else {
  pass("Cleartext HTTP is enabled through expo-build-properties (android:usesCleartextTraffic=\"true\").");
}

// ---------------------------------------------------------------------------------------
// 3. Source scan for imports that type-check but are undefined at runtime.
// ---------------------------------------------------------------------------------------
console.log("\n[3/4] Runtime-undefined import scan");

const sourceFiles = listSourceFiles(mobileRoot);
const reactNativeImportPattern = /import\s*\{([^}]*)\}\s*from\s*["']react-native["']/g;
let badImports = 0;

for (const file of sourceFiles) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(reactNativeImportPattern)) {
    const names = match[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !part.startsWith("type "))
      .map((part) => part.split(/\s+as\s+/)[0].trim());
    if (names.includes("ErrorUtils")) {
      badImports += 1;
      fail(
        `${path.relative(workspaceRoot, file)} imports ErrorUtils from "react-native" – it is a type-only export; ` +
          "use the global `ErrorUtils` (globalThis.ErrorUtils) instead."
      );
    }
  }
  if (/\bprocess\.exit\s*\(/.test(source)) {
    badImports += 1;
    fail(`${path.relative(workspaceRoot, file)} calls process.exit(), which does not exist in React Native.`);
  }
}
if (badImports === 0) {
  pass(`No runtime-undefined react-native imports in ${sourceFiles.length} mobile source files.`);
}

// ---------------------------------------------------------------------------------------
// 4. Production bundle: must build and must contain exactly one React runtime.
// ---------------------------------------------------------------------------------------
console.log("\n[4/4] Production Android bundle singleton check" + (staticOnly ? " (skipped: --static-only)" : ""));

if (!staticOnly) {
  if (!existsSync(path.join(mobileRoot, "metro.config.js"))) {
    fail("apps/mobile/metro.config.js is missing – the monorepo singleton resolver is required.");
  }

  const outputDir = mkdtempSync(path.join(tmpdir(), "flash-erp-mobile-startup-gate-"));
  const expoCli = resolveExpoCli();
  if (!expoCli) {
    fail(
      "expo CLI not found (looked for apps/mobile/node_modules/expo/bin/cli and node_modules/expo/bin/cli) – " +
        "run `npm install` at the workspace root first."
    );
  } else {
    try {
      const exportResult = spawnSync(
        process.execPath,
        [
          expoCli,
          "export",
          "--platform",
          "android",
          "--output-dir",
          outputDir,
          "--no-bytecode",
          "--no-minify",
          "--source-maps"
        ],
        {
          cwd: mobileRoot,
          encoding: "utf8",
          env: { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1", EXPO_OFFLINE: "1" },
          maxBuffer: 64 * 1024 * 1024,
          timeout: 15 * 60 * 1000
        }
      );

      if (exportResult.status !== 0) {
        fail("`expo export --platform android` failed:\n" + spawnFailureDetail(exportResult));
      } else {
        pass("Production Android bundle exported.");
        const jsDir = path.join(outputDir, "_expo", "static", "js", "android");
        const mapFile = readdirSync(jsDir).find((name) => name.endsWith(".map"));
        const bundleFile = readdirSync(jsDir).find((name) => name.endsWith(".js"));
        if (!mapFile || !bundleFile) {
          fail("Exported bundle or source map not found.");
        } else {
          const sources = readJson<{ sources: string[] }>(path.join(jsDir, mapFile)).sources;
          const bundle = readFileSync(path.join(jsDir, bundleFile), "utf8");

          const singletons = [
            "react",
            "react-native",
            "expo",
            "expo-modules-core",
            "expo-router",
            "react-native-safe-area-context",
            "react-native-screens"
          ];
          let duplicates = 0;
          for (const name of singletons) {
            const dirs = new Set<string>();
            const pattern = new RegExp(`^(.*node_modules/${name.replace("/", "\\/")})/`);
            for (const source of sources) {
              const match = source.replace(/\\/g, "/").match(pattern);
              if (match) dirs.add(match[1]);
            }
            if (dirs.size > 1) {
              duplicates += 1;
              // Expo writes source-map paths relative to the monorepo (server) root, e.g.
              // "/node_modules/react" and "/apps/mobile/node_modules/react".
              fail(`${name} is bundled ${dirs.size} times: ${[...dirs].map((d) => d.replace(/^\/+/, "")).join(", ")}`);
            }
          }
          if (duplicates === 0) {
            pass("React, React Native and the Expo runtime are each bundled exactly once.");
          }

          const reactVersions = [...bundle.matchAll(/exports\.version = "(19\.[^"]+)"/g)].map((m) => m[1]);
          const uniqueReactVersions = [...new Set(reactVersions)];
          if (uniqueReactVersions.length !== 1) {
            fail(`Expected exactly one React version in the bundle, found: ${uniqueReactVersions.join(", ") || "none"}`);
          } else {
            pass(`Bundled React version: ${uniqueReactVersions[0]}.`);
          }

          if (/_reactNative\d*\.ErrorUtils\b/.test(bundle)) {
            fail("Bundle dereferences react-native's non-existent ErrorUtils export.");
          }
        }
      }
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }
}

// ---------------------------------------------------------------------------------------
console.log("");
if (failures.length > 0) {
  console.error(`Mobile startup gate FAILED with ${failures.length} problem(s); ${passes.length} check(s) passed.`);
  process.exit(1);
}
console.log(`Mobile startup gate PASSED (${passes.length} checks).`);
