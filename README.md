# Bidline Bidding

Private, single-user PWA that replaces BidPro Plus! for monthly schedule bidding. See `BRIEFING.md` for the requirements.

| Folder | What | Runs where |
|---|---|---|
| `tools/ingest/` | Python tool: parses the bid package PDFs (Bidlines, Trips, OpSpecs) into one JSON bundle | your PC |
| `app/` | The PWA (React + Vite). Loads the bundle, ranks lines, exports the bid | GitHub Pages, then offline on the iPad |
| `worker/` | Optional Cloudflare Worker: sync of your settings, later the IPA Snapshot fetch | Cloudflare free plan |
| `.github/workflows/deploy.yml` | Builds and publishes `app/` to GitHub Pages | GitHub Actions |

Not in the repository (see `.gitignore`): `data/` (generated bundles) and `docs/` (company PDFs). Nothing sensitive is published: your
employee ID will only ever exist as a Cloudflare secret.

## Typical flow

1. New package published: run the ingest tool to make `data/<bid>.json` (`tools/ingest/README.md`).
2. Copy that file to the iPad (AirDrop is not available, so use the company-approved route you prefer, e.g. a download link or email).
3. Open the app on the iPad, **Choose package file**. It is stored on the device and works offline.

## Hosting steps (once)

1. Push this folder to a GitHub repository. In **Settings > Pages**, set Source to **GitHub Actions**. Pages for a *private* repository
   needs a paid GitHub plan; on the free plan the repository must be public (the app code has no secrets, and `data/` and `docs/` are ignored).
2. The workflow publishes to `https://<user>.github.io/<repo>/`. Open it in Safari on the iPad and **Add to Home Screen**.
3. Optional sync: follow `worker/README.md`.
