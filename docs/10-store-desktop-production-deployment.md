# Flash ERP Store Desktop Production Deployment

## Windows Code Signing Prerequisite

Production installers must be Authenticode-signed by Flash Code Solutions using a publicly trusted code-signing certificate or Microsoft Artifact Signing. The certificate and password must never be committed to this repository.

For a PFX certificate, configure the build machine or CI secret store before packaging:

```powershell
$env:WIN_CSC_LINK="D:\secure\FlashCodeSolutions-CodeSigning.pfx"
$env:WIN_CSC_KEY_PASSWORD="<certificate-password>"
```

`electron-builder` signs the packaged application and NSIS installer automatically when these variables contain a valid certificate. The build also verifies that both files have a valid timestamped Authenticode signature.

Unsigned Windows packaging is blocked by default. For local packaging tests only, use the explicit unsigned command:

```powershell
npm --workspace @flash-erp/store-desktop run dist:win:unsigned
```

This command intentionally skips signature verification. Never publish artifacts produced by it. Verify a production release manually with:

```powershell
npm --workspace @flash-erp/store-desktop run verify:win-signature
```

## Release Build

The store desktop app is packaged with `electron-builder`. The Windows installer is an NSIS installer that includes the renderer, Electron main process, app icon, and update feed metadata.

Build the installer from the repo root:

```powershell
npm --workspace @flash-erp/store-desktop run dist:win
```

The update feed is configured per installed desktop in:

```text
%APPDATA%\@flash-erp\store-desktop\store-runtime-config.json
```

```json
{
  "FLASH_ERP_DESKTOP_UPDATE_URL": "https://updates.flashcodesolutions.com/flash-erp/store-desktop/"
}
```

Use the desktop Setup dialog's `Update feed URL` field to save this value. The production URL embedded in the installer is used only as the first-run fallback.

The output is written to:

```text
apps/store-desktop/release/
```

Publish these files to the update feed folder or bucket:

```text
Flash ERP Store Desktop-<version>-x64.exe
latest.yml
*.blockmap
```

## First Install On A Shop Machine

1. Install the generated `.exe` on the shop desktop machine.
2. Open the app and configure the desktop connection settings from the Sync workspace if the machine needs store-server, terminal-client, PostgreSQL, or custom sync URLs.
3. For terminal-client mode, set the store server URL and token before using the till.
4. Open desktop Setup, confirm `Update feed URL`, save, and restart. This writes the value to `store-runtime-config.json`.

The Windows installer is configured as a per-machine NSIS installer, so the default installation path is under `Program Files` and Windows will ask for administrator elevation. The app still writes operator settings, local runtime config, and support logs under the signed-in Windows user's app data folder because normal users cannot write support data into `Program Files`.

## Support Logs

The desktop app writes main-process exceptions, unhandled promise rejections, renderer crashes, failed loads, and updater failures to:

```text
%APPDATA%\@flash-erp\store-desktop\logs\main.log
```

Ask the shop user to send this file when a desktop machine shows a JavaScript error dialog or closes unexpectedly. The log path is also printed to the desktop process console at startup.

## Updates

Packaged builds check for updates one minute after startup and then every six hours. The Sync workspace also has a manual `Check updates` action.

When an update is available, the shop user sees a prompt to download it. When the download finishes, the app prompts the user to install and restart. The installer metadata comes from `latest.yml`, so uploading a new installer and matching metadata to the update feed is what makes shop machines detect the release.

## Creating A New Desktop Update

Every desktop update must use a new semantic version. Do not rebuild and publish the same version number after a broken release, because installed shop machines compare their current app version against the version in `latest.yml`.

From the repo root, choose one of these version bumps:

```powershell
npm --workspace @flash-erp/store-desktop version patch --no-git-tag-version
npm --workspace @flash-erp/store-desktop version minor --no-git-tag-version
npm --workspace @flash-erp/store-desktop version major --no-git-tag-version
```

Use `patch` for fixes, `minor` for normal feature releases, and `major` for breaking deployment changes. This updates `apps/store-desktop/package.json` and `package-lock.json`.

Build the new installer:

```powershell
npm --workspace @flash-erp/store-desktop run dist:win
```

After a successful build, `apps/store-desktop/release/` contains files like:

```text
Flash ERP Store Desktop-0.1.2-x64.exe
Flash ERP Store Desktop-0.1.2-x64.exe.blockmap
latest.yml
```

Upload the new `.exe`, its `.blockmap`, and the regenerated `latest.yml` to the update feed URL. `latest.yml` must sit at the root of the feed, for example:

```text
https://updates.flashcodesolutions.com/flash-erp/store-desktop/latest.yml
https://updates.flashcodesolutions.com/flash-erp/store-desktop/Flash ERP Store Desktop-0.1.2-x64.exe
https://updates.flashcodesolutions.com/flash-erp/store-desktop/Flash ERP Store Desktop-0.1.2-x64.exe.blockmap
```

The older installer files can remain on the feed, but `latest.yml` must always point to the newest production version.

## How Shop Machines Detect Updates

The installed desktop app contains an `app-update.yml` first-run fallback generated by `electron-builder`. At runtime, the updater prefers `FLASH_ERP_DESKTOP_UPDATE_URL` from `store-runtime-config.json`. By default it points to:

```text
https://updates.flashcodesolutions.com/flash-erp/store-desktop/
```

At runtime, the desktop app:

1. Waits one minute after startup.
2. Downloads and reads `latest.yml` from the update feed.
3. Compares `latest.yml` `version` against the installed desktop app version.
4. Shows an update prompt when the feed version is newer.
5. Downloads the installer when the user chooses `Download now`.
6. Shows an install/restart prompt after the download completes.
7. Installs the update when the user chooses `Install and restart`.

The same check can be triggered manually from the desktop app in Sync > Runtime with `Check updates`.

If a shop machine does not detect an update, confirm these first:

- The installed app version is lower than the `version` in `latest.yml`.
- `latest.yml` is reachable from the shop machine browser or PowerShell.
- The `.exe` file named in `latest.yml` exists at the same update feed URL.
- The machine was installed from a packaged build, not a development preview.
- The feed URL used during packaging matches the production update URL.

Development builds keep updater checks disabled by default. To test the flow locally against a different feed, save it in the desktop Setup dialog, restart, then run the packaged app or enable development update checks:

```powershell
$env:FLASH_ERP_DESKTOP_ENABLE_DEV_UPDATES = "1"
```

## Release Checklist

- Confirm `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` are supplied by the secure build environment.
- Bump `apps/store-desktop/package.json` version before every production release.
- Confirm the desktop Setup page shows the correct update feed URL and save it to `store-runtime-config.json`.
- Build with `npm --workspace @flash-erp/store-desktop run dist:win`.
- Confirm `npm --workspace @flash-erp/store-desktop run verify:win-signature` reports a valid signer for the installer and packaged application.
- Smoke test the installer on a clean Windows user profile.
- Receipt printer, barcode scanner, cash drawer, and any payment-terminal hardware must pass the certification matrix in `docs/13-desktop-hardware-certification-matrix.md`.
- Upload the installer, `latest.yml`, and blockmap files to the update URL.
- Start an installed shop desktop app and use Sync > Runtime > Check updates to confirm the feed is reachable.
