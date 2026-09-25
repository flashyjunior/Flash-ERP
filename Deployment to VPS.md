Here is the comprehensive, unified **Flash ERP Full-Stack Deployment Runbook** covering both the **Backend VPS** and the **Cross-Platform Mobile App**.

---

# 📘 Flash ERP Master Deployment Runbook

```
                                ┌──────────────────────────────────────────────────┐
                                │               Git Commit Pushed                  │
                                └─────────────────────────┬────────────────────────┘
                                                          │
                         ┌────────────────────────────────┴────────────────────────────────┐
                         ▼                                                                 ▼
           [PART 1: BACKEND DEPLOYMENT]                                      [PART 2: MOBILE APP PACKAGING]
                         │                                                                 │
    1. npm run build:deploy                                           1. Cloud APK: eas build -p android --profile preview
    2. package-flash-erp-vps-release.ps1                                 - OR -
    3. Copy ZIP to VPS & Run .cmd                                     2. Local APK: npx expo prebuild & gradlew assembleRelease
                         │                                                                 │
                         ▼                                                                 ▼
         Windows VPS (84.247.188.30:3000)                                   Store Handhelds & Tablets (Android APK)
        SQL Server + Next.js + REST APIs                                      Offline SQLite + Barcode Scanner + Floor POS
```

---

## PART 1: Deploying the Backend to Windows VPS (`84.247.188.30`)

### Step 1.1: On Your Development Machine (Build & Package)

Open PowerShell in the root of your `Flash-ERP` repository:

```powershell
# 1. Pull the latest commits from your branch
git pull origin arena/01a01aad-flash-erp

# 2. Build domain, sync contracts, and the memory-optimized Next.js bundle
npm run build:domain
npm run build:sync
npm run build:deploy

# 3. Package the self-contained VPS release
# (Tip: Use a unique ReleaseId every time, e.g. YYYY.MM.DD.01)
powershell -ExecutionPolicy Bypass -File .\scripts\package-flash-erp-vps-release.ps1 `
  -ReleaseId "2026.09.18.01" `
  -StoreCode "accra-shop" `
  -PublicBaseUrl "http://84.247.188.30:3000"
```

#### Where the Deployment Package is Created:
The output is written to:
📂 **`.\artifacts\releases\`**  *(Type `explorer .\artifacts\releases` to open)*
File: **`FlashERP-HQ-2026.09.18.01-VPS-Deploy-Resolved.zip`**

---

### Step 1.2: Transfer Package to Your Windows VPS
Copy **`FlashERP-HQ-2026.09.18.01-VPS-Deploy-Resolved.zip`** to your VPS (via Remote Desktop or shared network drive) and extract it (e.g. to `C:\Deployments\`).

---

### Step 1.3: On Your Windows VPS (Execute Deployment)

Inside the extracted folder on your VPS:

* **Quickest Method:** Right-click **`Deploy Flash ERP 2026.09.18.01.cmd`** and select **"Run as administrator"**.
* **PowerShell Method:** Open an elevated PowerShell prompt in that directory and run:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\deploy-flash-erp-2026.09.18.01.ps1
  ```

#### What the Script Handles Automatically:
1. Verifies payload SHA-256 integrity.
2. Preserves database connection and secrets (`C:\FlashRMS\shared\.env`).
3. Preserves product images (`C:\FlashRMS\shared\uploads`).
4. Executes SQL Server migrations via Prisma (`migrate deploy`).
5. Switches Windows Scheduled Task `FlashRMSHQ` to the new release folder.
6. Runs a 60-second health and stability soak before completing (auto-rolls back if an issue occurs).

---

### Step 1.4: Verify the Backend is Live

Open in a browser or curl from terminal:

| Check | URL | Expected Response |
| :--- | :--- | :--- |
| **API Root Directory** | `http://84.247.188.30:3000/api` | JSON directory of all 263 endpoints |
| **Live Health** | `http://84.247.188.30:3000/api/system/live` | `{"ok": true, "service": "flash-erp-enterprise-web"}` |
| **Database Readiness** | `http://84.247.188.30:3000/api/system/database-readiness` | `{"ready": true}` |
| **Interactive Docs** | `http://84.247.188.30:3000/api/docs` | Swagger UI Interface |

---

## PART 2: Building & Distributing the Mobile App (`apps/mobile`)

The mobile app runs on **Expo SDK 54 / React Native 0.81** with local SQLite outbox and camera barcode scanning.

### Option A: Cloud APK Build (Recommended — No Android Studio Required)

Uses Expo Application Services (EAS) cloud infrastructure to generate a standalone Android `.apk`.

```powershell
# 1. Install eas-cli globally (one-time setup)
npm install -g eas-cli

# 2. Log in with your Expo account (create one free at https://expo.dev if needed)
eas login

# 3. Navigate to the mobile app directory
cd apps/mobile

# 4. Generate the standalone Android APK
eas build -p android --profile preview
```
*When completed, the CLI prints a direct download link and QR code. Download the `.apk` and install it on store handhelds, rugged scanners, or Android phones.*

---

### Option B: Local APK Build on Your PC (Without Cloud Account)

If you have Android Studio / Android SDK installed locally on your Windows PC:

```powershell
cd apps/mobile

# 1. Prebuild the native Android project
npx expo prebuild -p android

# 2. Build the release APK with Gradle
cd android
.\gradlew assembleRelease
```
*Your installable APK will be at:*
📂 `apps\mobile\android\app\build\outputs\apk\release\app-release.apk`

---

### Option C: Instant Local Testing via Expo Go (Development Mode)

To test the mobile app immediately on your personal iPhone or Android device without compiling an APK:

```powershell
# In root of repository
npm run dev:mobile
```
1. Install **Expo Go** from the App Store (iOS) or Google Play Store (Android).
2. Scan the terminal QR code with your phone camera (iOS) or the Expo Go app (Android).
3. The app loads instantly over your local Wi-Fi.

---

## PART 3: Mobile First-Time Setup & Operations

### 3.1: Connecting Mobile to Your VPS
1. Open the mobile app.
2. In the **Server Config** field (or at Login), enter:
   `http://84.247.188.30:3000`
3. Tap **"Test"** to confirm connection and view server latency in milliseconds.
4. Sign in with your operator credentials (e.g., `hq.admin` or store cashier login).

### 3.2: Downloading Catalog for Offline Use
1. Tap the status pill in the top header (`🟢 HQ ONLINE`).
2. Tap **"Download Catalog for Offline Use"**.
3. All products, alternate UOMs, and retail prices will be downloaded into the phone's local SQLite database.

### 3.3: Working in Offline Mode
1. Tap the top status pill and switch mode to **`OFFLINE`**.
2. Scan barcodes, perform cycle counts, or park sales.
3. Every operation is saved into the phone's **ACID Outbox Queue**.
4. The header badge updates to show pending actions (e.g., `🟠 4 Outbox`).

### 3.4: Draining / Syncing the Outbox
1. Reconnect to Wi-Fi/4G or switch the mode back to **`ONLINE`** / **`AUTO`**.
2. Tap the header status pill -> Tap **"Sync Outbox Now"**.
3. All queued mutations are committed directly into your central SQL Server database and General Ledger.