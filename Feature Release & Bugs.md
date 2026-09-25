**Yes, I understand Flash ERP.**

In short, I have the full mental model of the system:

* **What it is:** An enterprise retail and ERP platform combining retail/POS, multi-entity accounting/GL posting, supply chain/inventory, HR/payroll, fuel operations, and ecommerce.
* **The two operational halves:**
  1. **Enterprise Web** (Next.js 16 / React 19 / SQL Server via Prisma) serving as HQ, multi-company accounting, and central control.
  2. **Store Desktop** (Electron / React with SQLite, Postgres, or SQL Server backends) built to work offline and sync bidirectionally with HQ via outbox events, checkpoints, and deterministic conflict resolution.
* **Where the friction points and active bugs are:**
  * The **alternate-UOM desktop runtime gate** is failing due to an unsupplied `sourceLocationCode` on transfer issues.
  * The **Render deployment configuration** (`render.yaml`) provisions PostgreSQL, but the enterprise runtime strictly enforces SQL Server.
  * Several core repositories and store service implementations are massive and maintain three parallel database schemas/providers.

I'm ready to dig in. What would you like to work on first? Some immediate places we could start:

1. **Fix the failing Alternate-UOM acceptance test / dispatch-location contract mismatch.**
2. **Align the deployment configs** (`render.yaml` / Docker Compose) with the enterprise SQL Server requirement.
3. **Work on a specific feature, bug, or module** in Enterprise Web, Store Desktop, Sync, or Finance.
4. **Triage dependency advisories or build pipeline issues.**





**Yes, absolutely.** In fact, the repository **already has a cross-platform mobile app foundation scaffolded in `apps/mobile`** using **Expo (React Native 0.81 / React 19 / TypeScript)**, ready to build for iOS and Android.

Because Flash ERP is built around a decoupled API and an allowlisted store-service protocol, a mobile app does not need to reproduce the entire 380,000-line desktop or web suite. Instead, the mobile app should serve as a **high-signal operational companion** focused on mobility, camera/barcode scanning, rapid approvals, and store-floor workflows.

---

### How the Mobile App Connects (Two Operating Modes)

Flash ERP's architecture uniquely enables two connection models for mobile:

```
                      ┌─────────────────────────────────────────┐
                      │    Enterprise Web (Cloud / HQ Server)   │
                      │       Next.js 16 REST APIs (/api/*)     │
                      └────────────────────▲────────────────────┘
                                           │
                        HTTPS WAN / 4G / 5G (Internet)
                                           │
   ┌───────────────────────────────────────┴───────────────────────────────────────┐
   │                                                                               │
┌──┴──────────────────────────────────────┐     ┌──────────────────────────────────┴──┐
│        Mode 1: Cloud Companion         │     │         Mode 2: Store LAN           │
│  (Managers, HR, Field Ops, Execs)       │     │    (Floor Clerks, Stock Counters)   │
│                                         │     │                                     │
│ • Direct HTTPS to Enterprise Web        │     │ • Connects over store Wi-Fi to a    │
│ • Session / JWT auth                    │     │   Store Desktop running             │
│ • Works anywhere on cellular/Wi-Fi      │     │   `store-server` on port 4747       │
│ • Real-time HQ queries & approvals      │     │ • Works even if store internet dies │
└─────────────────────────────────────────┘     └──────────────────▲──────────────────┘
                                                                   │
                                                Local HTTP RPC     │
                                                                   │
                                                ┌──────────────────┴──────────────────┐
                                                │      Store Desktop (Local Server)   │
                                                │   POST /api/store/:method (85 RPCs) │
                                                │   Local SQLite / Postgres / MSSQL   │
                                                └─────────────────────────────────────┘
```

1. **Cloud Companion (via Enterprise Web REST API):**
   - Connects directly to `apps/enterprise-web/src/app/api/...` over HTTPS.
   - Ideal for managers, field supervisors, executive summaries, and HR self-service anywhere in the world.
2. **Store Floor LAN Companion (via Store Server Bridge):**
   - When a Store Desktop machine is started in `store-server` mode, it exposes an HTTP RPC listener on port `4747` (with `FLASH_ERP_STORE_SERVER_TOKEN` authentication).
   - The mobile app connects over the store's local Wi-Fi to execute warehouse, stock, and receiving methods—**working even when the store’s internet connection is completely down**.

---

### What Features Should Be Extended to Mobile?

Extending an ERP to mobile is most effective when focused on workflows where a keyboard and desktop monitor are inconvenient:

#### 1. Warehouse & Store Floor Operations (Highest Operational Value)
* **Camera & Barcode Stock Lookup:** Scan product UPC/EAN barcodes to immediately inspect:
  * On-hand inventory across store shelves, backroom, and sister branches.
  * Retail prices, alternate UOMs (e.g., individual item vs. box/crate vs. pallet).
  * Batch numbers and expiry dates (FEFO/FIFO).
* **Physical Stock Taking & Cycle Counts:**
  * Eliminate paper sheets. Clerks walk the aisles scanning barcodes, tapping in counted quantities, and submitting count sheets directly into the ERP.
* **Goods Receiving & PO Verification:**
  * When delivery trucks arrive at the bay, the receiver checks off quantities against Purchase Orders on their phone, flags damages, takes photos of broken cartons, and logs discrepancies.
* **Inter-Store Transfer Picking & Dispatch:**
  * Pick transfer requests from warehouse bins, verify scanned items, and mark dispatch with source location confirmation.

#### 2. Queue Busting & Assisted Selling (Retail Floor)
* **Floor Quotes & Assisted Selling:**
  * Sales associates walk the floor with customers, check stock availability, view product specs/images, and create a **Held Sale** or draft **Sales Order**.
* **Line Busting / Mobile Checkout:**
  * Take payments on the floor (Cash, Mobile Money like M-Pesa / MTN MoMo, or via a paired Bluetooth mPOS card terminal).
  * Print to a belt-mounted Bluetooth thermal receipt printer or send digital receipts via SMS/Email.
* **Layaway & Customer Account Lookup:**
  * Check customer credit limits, outstanding balances, and active layaway deposit schedules right on the sales floor.

#### 3. Fuel Station Operations (Already Designed for Mobile)
* *The Flash ERP codebase already includes specific mobile camera hints and endpoints for fuel operations (`/api/fuel-operations/...`):*
  * **Tank Dip Readings:** Record physical dipstick measurements directly beside the underground tanks.
  * **Pump Meter Readings:** Log opening and closing pump nozzle totalizers at shift handovers.
  * **Delivery Verification with Evidence Capture:** Capture required before-discharge and after-discharge camera photos and upload timestamped delivery logs.

#### 4. Manager Approvals & Executive Dashboards (Mobility for Decision-Makers)
* **Instant Push Approvals:**
  * Purchase order authorization.
  * Price override or credit limit exception requests from cashiers.
  * Stock write-off / adjustment sign-offs.
  * Employee leave requests and expense claim approvals.
* **Real-Time Performance Dashboard:**
  * Live revenue snapshots across stores, cash vs. card vs. mobile money settlement splits, gross margins, and immediate low-stock or expiring-stock alerts.

#### 5. Employee Self-Service & HR
* **Mobile Attendance:** Clock in / clock out with GPS geofencing verification.
* **Expense Reimbursement:** Snap photos of paper receipts on business trips and submit instant expense claims (`/api/human-resources/expense-claims`).
* **Payslips & Leave:** Request annual leave and view historical payslips directly on the phone.

---

### What to Avoid Putting on Mobile

To keep the mobile app lean, responsive, and stable, avoid bringing complex, high-data-entry desktop workflows to the phone:
* **Complex Multi-Leg Accounting:** General Ledger journals, trial balance reconciliation, chart of accounts setup, and recurring journal configuration belong on the desktop/browser.
* **Mass Master Data Entry:** Bulk CSV uploads, complex tax schedule matrices, and multi-tier UOM conversions setup.
* **System Administration:** LDAP/SMTP settings, license provisioning, and database connection pooling.

---

### Recommended Implementation Roadmap

1. **Phase 1: Inventory & Scanner Companion (Fastest Win)**
   * Add barcode scanning (`expo-camera` or `expo-barcode-scanner`) to `apps/mobile`.
   * Implement **Stock Lookup** and **Cycle Count Entry** calling either the Enterprise Web API or the local Store Server.
2. **Phase 2: Manager Approvals & Flash Dashboard**
   * Implement authentication against `/api/auth/sign-in` (or API tokens).
   * Build the approval center (PO approvals, leave requests, expense claims) and live store KPI cards.
3. **Phase 3: Fuel Operations & Field Receiving**
   * Build the tank dip, pump reading, and delivery photo-evidence upload screens.
4. **Phase 4: Assisted Selling / Mobile POS (Optional)**
   * Connect Bluetooth thermal receipt printing and Mobile Money tender handling.

Since `apps/mobile` is already integrated into the monorepo, we can start by setting up the API client and building the first operational workflow (like barcode stock lookup or manager approvals). Would you like to start planning or scaffolding a specific workflow for the mobile app?



Yes, I understand completely, and I just verified this across `apps/enterprise-web/src/app/api/online-store/` and `apps/enterprise-web/src/server/repositories/online-store.repository.ts`.

### Why This is the Right Architecture

In Flash ERP, **`online-store` is a full first-class store engine living directly inside Enterprise Web**:

1. **Direct Database Persistence:** It executes directly against the central SQL Server database. Every operation (sale, refund, count, transfer, receipt) immediately passes through the shared transactional posting engine, updates the General Ledger, adjusts stock, and logs to the Cashbook.
2. **Zero Sync Overhead on Mobile:** The mobile app does not need a local SQLite database, an outbox queue, background sync workers, or dead-letter recovery logic.
3. **Single Host / Single Port:** The mobile app only ever connects to **one host** (`http://84.247.188.30:3000` or your VPS domain over HTTPS). No LAN discovery, no secondary ports, and no local network firewall issues.
4. **Instant Multi-Branch Visibility:** When a user scans a barcode, they instantly see live on-hand quantities across the store, the warehouse, and all other branches in real time.

---

### Updated Mobile Architecture: 100% HQ Enterprise API

All mobile features will communicate directly with the **Enterprise API (`:3000`)** powered directly by the **HQ Database (SQL Server)**:

| Mobile Workflow | Backend Endpoint (Enterprise Web) | Underlying DB | Mode & Benefit |
| :--- | :--- | :--- | :--- |
| **Auth & Store Profile** | `POST /api/auth/sign-in`<br>`GET  /api/auth/session` | SQL Server | Role-based permissions & assigned store context. |
| **Live Barcode Stock Lookup** | `POST /api/online-store/inventory-lookup`<br>`GET  /api/catalog/products` | SQL Server | Real-time stock levels, alternate UOMs, and retail prices across all stores. |
| **Cycle Counts & Shelf Taking** | `POST /api/online-store/stock-counts`<br>`POST /api/online-store/stock-counts/:id/commit` | SQL Server | Post counts directly to the enterprise inventory ledger. |
| **Goods Receiving & PO Check** | `GET  /api/inventory/purchase-orders`<br>`POST /api/online-store/goods-receipts` | SQL Server | Verify incoming goods against open POs and receive stock immediately. |
| **Inter-Store Transfers** | `POST /api/online-store/transfers`<br>`POST /api/online-store/transfers/:id/issue`<br>`POST /api/online-store/transfers/:id/receive` | SQL Server | Create requests, confirm picking, dispatch, and receive. |
| **Mobile POS & Floor Sales** | `POST /api/online-store/sales`<br>`POST /api/online-store/held-sales`<br>`POST /api/online-store/sales-orders` | SQL Server | Process sales, park quotes, manage layaway deposits directly. |
| **Returns & Corrections** | `POST /api/online-store/corrections` | SQL Server | Process receipt-linked returns and supervisor approvals. |
| **Manager Approvals & HR** | `GET/POST /api/human-resources/leave`<br>`GET/POST /api/human-resources/expense-claims`<br>`POST     /api/human-resources/attendance` | SQL Server | Instant mobile leave approvals, expense receipt uploads, clock-in/out. |
| **Fuel Station Operations** | `POST /api/fuel-operations/dips`<br>`POST /api/fuel-operations/meter-readings`<br>`POST /api/fuel-operations/evidence` | SQL Server | Tank dips, pump meters, before/after delivery photos. |

---

### Next Step: How We Build the Mobile App

Now that the architecture is locked in:

1. **Add `apps/enterprise-web/src/app/api/route.ts`:**
   So `GET http://84.247.188.30:3000/api` returns a clean index of endpoints rather than a 404.
2. **Build the Mobile API Client in `apps/mobile`:**
   Configure a typed client (pointing by default to `http://84.247.188.30:3000/api` with an in-app server URL switcher for flexibility), handling session authentication and token persistence.
3. **Implement the First Workflow Screen:**
   We can start with **Barcode Stock Lookup & Inventory** or **Sign-in & Dashboard**.

Which workflow screen would you like to build first in the mobile app?
