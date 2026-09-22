# Majeed Trial Custom Domain

Target URL: `https://majeed.flashcodesolutions.com.gh`

The DNS A record already resolves to `84.247.188.30`. Flash ERP continues to
run privately on `127.0.0.1:3102`; Caddy terminates public HTTPS and renews the
Let's Encrypt certificate automatically.

## One-time TSplus prerequisite

The VPS currently exposes the TSplus Remote Access portal on ports 80 and 443.
Those ports cannot also be used by the Flash ERP HTTPS edge.

On the VPS, open **TSplus AdminTool > Web > Web Server** and change:

- HTTP: `80` to `8080`
- HTTPS: `443` to `8443`

Save and restart the TSplus Web Servers. Confirm the remote portal remains
available on the new ports before continuing. This is intentionally a manual,
visible change because the TSplus installation owns its own service lifecycle.
Direct RDP on port 3389 is unaffected. Do not expose 8080 or 8443 publicly
unless browser-based TSplus access is still required; if it is, add narrowly
scoped firewall rules and install a valid certificate for the relocated TSplus
HTTPS listener before relying on that portal.

## Configure HTTPS

From an elevated PowerShell window in the deployed Flash ERP release:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\configure-flash-erp-trial-domain.ps1 `
  -Domain 'majeed.flashcodesolutions.com.gh' `
  -AcmeEmail 'info@flashcodesolutions.com.gh' `
  -UpstreamPort 3102
```

The script refuses to make changes while another process owns ports 80 or 443.
It verifies DNS and the private trial health endpoint, installs Caddy as the
`FlashERPEdge` Windows service, forces the Let's Encrypt ACME endpoint, enables
automatic service recovery, and verifies the public certificate and live route.

## Make the workspace URL durable

Run this from the active release after HTTPS succeeds:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\set-trial-workspace-public-url.ps1 `
  -WorkspaceSlug 's-majeed-phones-6398dfce' `
  -BaseUrl 'https://majeed.flashcodesolutions.com.gh' `
  -ActorRef 'VPS deployment'
```

This updates the control-plane workspace, online-store, and storefront URLs,
rewrites the isolated workspace environment, restarts its governed scheduled
task, and records a `PUBLIC_URL_CHANGED` lifecycle event. Reconciliation then
retains the custom URL instead of restoring the old port-based address.

## Verification

```powershell
Invoke-RestMethod 'https://majeed.flashcodesolutions.com.gh/api/system/live'
Invoke-RestMethod 'https://majeed.flashcodesolutions.com.gh/api/system/database-readiness'
Get-Service FlashERPEdge
```

Also verify sign-in, password recovery, Online Store, and the public storefront
from an external browser. Keep port 3102 restricted to administrative access;
customers should use only the HTTPS domain.
