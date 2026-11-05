# BidlineBidding API (Cloudflare Worker)

A tiny serverless backend on Cloudflare's free plan. Nothing runs on your own server. It does two jobs:

1. **Sync** of your small settings documents (worksheets/rankings, desired dates off, vacation) so they survive a cleared Safari
   and can be restored on another device. Bid packages and PDFs are never uploaded.
2. Fetching the IPA Snapshot page for the **Hold** column (which of your bid lines you can hold at your seniority). Your employee ID is a Worker secret and is never sent to the app.

The app works fully without it; sync is optional and best effort (the iPad always saves locally first).

## One-time setup

You need a free Cloudflare account and Node.js.

```bash
cd worker
npm install
npx wrangler login
npx wrangler kv namespace create BIDLINE      # prints an id; paste it into wrangler.toml (kv_namespaces.id)
```

Edit `wrangler.toml`: set `ALLOWED_ORIGIN` to the exact address of your app on GitHub Pages, e.g. `https://your-user.github.io`
(scheme and host only, no path, no trailing slash).

Create the two secrets (they are stored by Cloudflare, never in the repo):

```bash
npx wrangler secret put PASSPHRASE        # a long passphrase you will type once on the iPad
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # prints a random value
npx wrangler secret put TOKEN_SECRET      # paste the random value
```

For the Hold column add your employee ID as a third secret (it is only used to build the IPA Snapshot address):

```bash
npx wrangler secret put IPA_EMPLOYEE_ID
```

Deploy:

```bash
npx wrangler deploy                       # prints https://bidline-api.<your-subdomain>.workers.dev
```

Then in the app: **Preferences > Sync**, enter that address and your passphrase, tap **Sign in**.

## How it behaves

* `POST /api/login` checks the passphrase and returns a signed token valid for 30 days. After 10 wrong attempts from one address in
  15 minutes it answers 429. Everything else needs the token.
* `GET /api/kv` lists the stored documents; `PUT /api/kv/<key>` stores one. The newer `clientUpdated` timestamp wins, so an old
  device cannot overwrite newer data.
* CORS only allows `ALLOWED_ORIGIN`; a browser page from any other site is refused.
* **Packages:** `PUT /api/package/<bid>` stores a package you publish from your PC (validated: schema 1, matching bid id, up to 20 MB), `GET /api/packages` lists
  them and `GET /api/package/<bid>` returns one. The app's Preferences > Bid package downloads from here, so no file has to be moved to the iPad.
  A package is company bid data stored in your own Cloudflare account, readable only with your sign-in token. The PDFs and your employee ID are never uploaded.
* `GET /api/ipa` fetches `https://ipasnapshot.appspot.com/m?gems=<your id>`, parses it, and returns your bid lines with `available`, `unavailable` or `current`.
  The Worker never fetches more often than every 3 minutes (it serves its cached copy in between), keeps the last good copy if the site is down
  or says "no bid on file" (a transient state, never treated as "all unavailable"), and answers with an error if the page layout ever changes.
* Responses are `Cache-Control: no-store`, so Cloudflare cache rules cannot serve stale data.

## Local development and tests

```bash
npm test                                  # unit tests (login, tokens, lockout, last-write-wins, CORS)
printf 'PASSPHRASE=dev passphrase\nTOKEN_SECRET=dev-secret-0123456789abcdef\n' > .dev.vars   # git-ignored
npx wrangler dev --port 8787 --var ALLOWED_ORIGIN:http://localhost:5173
# without the real site: --var IPA_EMPLOYEE_ID:1234567 --var IPA_BASE_URL:http://127.0.0.1:8788  (a local server returning test/fixtures/ipa-mobile.html)
```

## Free-plan limits (as of writing; check Cloudflare's current numbers)

Workers: 100,000 requests per day. Workers KV: 1,000 writes per day, 100,000 reads per day. The app waits a couple of seconds after
a change before syncing, so normal use is a few dozen writes a day. A burst of dragging counts as one write per sync.
