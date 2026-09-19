# Mobile app startup crash – root cause and fix (2026-09-19)

Symptom on the installed Android build: the app opens (splash) and closes again
immediately. No error is shown and the first screen (dashboard / server
configuration) never appears. This happened before and after the 1.0.1
"crash hardening" build.

Release builds have no red box, so anything that throws while the JavaScript
bundle is being evaluated, or any native module that cannot initialise, ends the
process silently. Three independent defects were found; each one alone is enough
to produce the symptom. All three are fixed on this branch and covered by a new
gate (`npm run acceptance:mobile-startup`).

## 1. `import { ErrorUtils } from "react-native"` (introduced by the 1.0.1 hardening)

`react-native` exports `ErrorUtils` **only as a TypeScript type** (`types/index.d.ts`
re-exports the interface from `Libraries/vendor/core/ErrorUtils.d.ts`). The runtime
object exists only as a **global** (`global.ErrorUtils`, installed by RN's
error-guard polyfill); it is not in `react-native/index.js`.

- `tsc --noEmit` passed because, in value position, TypeScript silently fell back
  to the global `const ErrorUtils` declared in RN's `globals.d.ts`.
- Metro/Babel kept the import as a value: the production bundle contained
  `_reactNative.ErrorUtils.getGlobalHandler()` → `TypeError: Cannot read
  property 'getGlobalHandler' of undefined`.
- It ran at module top level of `app/_layout.tsx` (`installCrashGuards()`), i.e.
  while expo-router was loading the root layout — *before* the error boundary in
  that same file could exist. Result: fatal JS error → process killed on launch.

Fix: `app/_layout.tsx` reads `globalThis.ErrorUtils`, checks it exists, and wraps
the whole bootstrap in `try/catch`. The error card's `process.exit(0)` button
(also undefined in React Native) was replaced with a "Try Again" reset.

## 2. Expo SDK 57 native modules installed into an Expo SDK 54 app

`apps/mobile/package.json` declared `expo@~54.0.33` but
`expo-camera@^57`, `expo-haptics@^57`, `expo-secure-store@^57`, `expo-sqlite@^57`
(the npm `latest` tags = Expo SDK 57). Their Kotlin sources import classes that do
not exist in `expo-modules-core@3.0.29` (SDK 54) – e.g.
`expo.modules.kotlin.types.OptimizedRecord`,
`expo.modules.kotlin.jni.NativeArrayBuffer` – so the native side can neither build
nor initialise against SDK 54. `npx expo install --check` reported all four.

Fix: pinned to the versions bundled with SDK 54 (`expo-camera ~17.0.10`,
`expo-haptics ~15.0.8`, `expo-secure-store ~15.0.8`, `expo-sqlite ~16.0.10`);
`expo-modules-autolinking resolve -p android` now lists a consistent SDK 54 set.

## 3. Two copies of React in one bundle (npm-workspaces hoisting)

The monorepo root hoists `react@19.2.x` (Next.js / Electron apps), while React
Native 0.81 requires exactly `react@19.1.0`, which npm nests under
`apps/mobile/node_modules`. Metro resolved the ROOT React for `react-native`,
`expo-router`, `@react-navigation/*` … and the NESTED React for the app's own
screens: the exported bundle contained both `exports.version = "19.2.5"` and
`exports.version = "19.1.0"`. The app's hooks then run against a React instance
the renderer never initialised → first-render crash. `npx expo-doctor` reports
this as "Found duplicates for react".

Fix: `apps/mobile/metro.config.js` forces singleton packages (react, react-native,
expo, expo-modules-core, expo-router, safe-area-context, screens, navigation, …)
to resolve *from the app directory* regardless of importer. The Android and iOS
bundles now contain exactly one React (19.1.0).

## Also corrected while here

- `expo.android.usesCleartextTraffic` in `app.json` is not an Expo config key and
  was ignored, so the generated manifest had **no** `android:usesCleartextTraffic`
  and Android 9+ would block the plain-`http://` HQ endpoint. It is now set through
  the real `expo-build-properties` plugin (verified in the introspected manifest).
- `HeaderStatusBar` now pads by the safe-area top inset (SDK 54 Android is always
  edge-to-edge; `StatusBar backgroundColor` is unsupported there and was removed).
- App version 1.0.1 → **1.0.2**, `android.versionCode` 3.

## Verification performed in the sandbox

- `npm --workspace @flash-erp/mobile run typecheck` – 0 errors.
- `npx expo install --check` (offline) – "Dependencies are up to date".
- `npx expo export --platform android|ios --source-maps` – builds; source maps show
  a single `react`, `react-native`, `expo`, `expo-modules-core`, `expo-router`.
- `npx expo prebuild --platform android` – all config plugins apply;
  manifest carries `android:usesCleartextTraffic="true"` and the permissions.
- `npm run acceptance:mobile-startup` – PASSED (the same gate reports 12 failures
  against the previous tree, including the two React copies and the `ErrorUtils`
  dereference).

## Build and install procedure (user machine)

```bash
cd apps/mobile
npx eas-cli build -p android --profile preview
```

Then **uninstall** the old Flash ERP APK from the device (signature / version
history) and install the new 1.0.2 build. If it should ever fail again, the app
now shows an on-screen error card for JS errors, and
`adb logcat -s ReactNativeJS AndroidRuntime` carries the `[flash-erp:mobile]`
trace (or the native stack) needed to pin the module.
