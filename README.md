# BrandShield AI

A runnable digital-risk-protection prototype with a browser dashboard, a Node.js REST API, an explainable rules-based risk engine, and a persistent SQLite database.

## Requirements

- Node.js 22.13 or later. Node's built-in `node:sqlite` module is used; no npm packages need to be installed.

## Run locally

In PowerShell, from this folder:

```powershell
node server.js
```

Then open:

- Landing page: <http://localhost:8000/>
- Dashboard: <http://localhost:8000/dashboard.html>
- API status: <http://localhost:8000/api/health>

Stop the server with **Ctrl+C**. The prototype creates `data/brandshield.sqlite` on first run and seeds it with clearly labeled example data. The database and investigation statuses persist across restarts.

Set `PORT`, `HOST`, or `DATA_DIR` to configure the server. `BRANDSHIELD_DB` can be used to specify an explicit SQLite database path. On Render, the local filesystem is ephemeral unless a persistent disk is mounted; set `DATA_DIR` to the mounted path if database persistence across deployments is required.

## Live public sources

- **Bluesky:** on-demand public profile search; no API key required.
- **Apple App Store:** on-demand public iOS listing search; no API key required. Supported storefronts in the prototype: US, India, UK, Canada, and Australia.
- **Other social networks and Google Play:** demo examples or user-submitted information. They are not scraped.

Public API search results are leads for analyst review, not proof that an account or app is fraudulent. The API calls are on demand; there is no background monitoring or platform notification service.

## API

- `GET /api/health` — service and database status.
- `GET /api/state` / `PUT /api/state` — read or persist the brand, official-asset allowlist, and investigation records.
- `POST /api/analyze` — score a submitted public profile or app description using the server-side explainable rules engine.
- `POST /api/search/bluesky` — search the saved brand name on Bluesky's public API.
- `POST /api/search/app-store` — search the saved brand name in an allowed Apple App Store storefront (`{"country":"in"}`).

## Tests

```powershell
node --test
```
