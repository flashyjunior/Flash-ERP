// Metro configuration for the Flash ERP mobile app inside the npm-workspaces monorepo.
//
// Why this file exists:
//   The monorepo root hoists a `react` that satisfies the web apps (Next.js / Electron
//   pin React 19.2.x), while Expo SDK 54 / React Native 0.81 require exactly
//   `react@19.1.0`, which npm therefore nests under `apps/mobile/node_modules`.
//   With Metro's default hierarchical resolution, code inside the hoisted
//   `react-native`, `expo-router`, `@react-navigation/*`, ... packages resolves the
//   ROOT copy of React while the app's own screens resolve the NESTED copy. Two React
//   instances end up in one bundle (`npx expo-doctor` flags this as a duplicate), the
//   app's hooks run against a React instance the renderer never initialised, and the
//   app dies on its first render — in a release APK that is a silent "opens and closes".
//
//   The resolver below forces every "singleton" package (packages that must exist
//   exactly once in a React Native bundle) to be resolved *as if it were imported from
//   this app directory*, regardless of which package is importing it. That yields the
//   app-local copy when npm nested one (e.g. react@19.1.0) and the hoisted copy
//   otherwise — i.e. exactly one copy, always the one declared in this package.json.
//
//   Expo's default config already detects the workspace root, sets `watchFolders`
//   for every workspace and `resolver.nodeModulesPaths` for both node_modules folders,
//   so nothing else needs to be overridden here.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

/** Packages that must never be bundled twice. */
const SINGLETON_PACKAGES = new Set([
  "react",
  "react-dom",
  "react-native",
  "react-native-web",
  "expo",
  "expo-modules-core",
  "expo-router",
  "expo-constants",
  "expo-linking",
  "expo-status-bar",
  "react-native-safe-area-context",
  "react-native-screens",
  "react-native-gesture-handler",
  "react-native-reanimated",
  "react-native-worklets",
  "@react-navigation/core",
  "@react-navigation/native",
  "@react-navigation/native-stack",
  "@react-navigation/elements",
  "@react-navigation/routers"
]);

function getPackageName(moduleName) {
  if (moduleName.startsWith("@")) {
    const [scope, name] = moduleName.split("/");
    return name ? `${scope}/${name}` : moduleName;
  }
  return moduleName.split("/")[0];
}

// Resolving "from" this path makes Metro's hierarchical node_modules lookup start at
// apps/mobile/node_modules and then fall back to the monorepo root node_modules.
const singletonOrigin = path.join(projectRoot, "package.json");
const configuredResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Metro passes its default resolver via context.resolveRequest (documented chaining).
  const upstream = configuredResolveRequest ?? context.resolveRequest;

  if (
    !moduleName.startsWith(".") &&
    !path.isAbsolute(moduleName) &&
    SINGLETON_PACKAGES.has(getPackageName(moduleName))
  ) {
    return upstream({ ...context, originModulePath: singletonOrigin }, moduleName, platform);
  }

  return upstream(context, moduleName, platform);
};

module.exports = config;
