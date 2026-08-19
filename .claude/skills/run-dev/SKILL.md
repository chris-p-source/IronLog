---
name: run-dev
description: Launch a local IronLog dev instance (Postgres + backend + Vite) and drive the app in a browser with Playwright. Use when asked to run, start, or screenshot IronLog, to reproduce a bug in the real app, or to verify a change end-to-end rather than only with tests.
---

# Running IronLog locally

Three pieces: a Postgres cluster, the Express backend on `:3001`, and Vite on
`:5173`. The backend migrates the schema itself on boot, so an empty database
is fine.

## 1. Postgres

A cluster is usually installed but not started:

```bash
pg_ctlcluster 16 main start
pg_lsclusters                      # expect: online
```

Create the role and database once (idempotent):

```bash
su postgres -c "psql -c \"CREATE USER ironlog WITH PASSWORD 'ironlog' SUPERUSER\""
su postgres -c "createdb -O ironlog ironlog"
```

## 2. Backend

`backend/.env` is gitignored, so write it before the first run:

```
DATABASE_URL=postgresql://ironlog:ironlog@127.0.0.1:5432/ironlog
JWT_SECRET=dev-secret-for-local-verification
PORT=3001
NODE_ENV=development
REGISTER_ENABLED=true
```

```bash
cd backend && npm install && node server.js     # run in background
curl -s http://127.0.0.1:3001/api/health        # {"status":"ok",...}
```

Wait for `Database migrated successfully` before hitting the API.

**Stopping it:** `pkill -f "node server.js"` also matches the shell running
it and can kill the wrong thing. Find the pid with `pgrep -af "node server.js"`
and `kill <pid>`. A stale server holding `:3001` makes the replacement die with
`EADDRINUSE` while `/api/health` still answers — from the *old* process. Always
confirm the new one logged `IronLog server running` before trusting a result.

## 3. Frontend

```bash
cd frontend && npm install && npx vite --host 127.0.0.1 --port 5173
```

Vite proxies `/api` to `:3001` (see `vite.config.js`), so use the Vite origin
in the browser, not the backend's.

## 4. Seeding a user and template

Faster and less brittle than driving the registration and template-editor UI:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"tester","password":"testpass123"}' | jq -r .token)

curl -s -X POST http://127.0.0.1:3001/api/templates \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Timer Check","template_type":"strength","exercises":[
       {"name":"Bench Press","sets":4,"reps":5,"rest_seconds":120,"base_weight_kg":60}]}'
```

## 5. Driving the UI

Playwright is installed globally; import it by absolute path and use the
pre-installed Chromium (never run `playwright install`):

```js
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true });
```

Two things will block a naive script:

- **The welcome modal** covers the template list once per day. Wait for it and
  dismiss it — it renders in an effect *after* login, so an immediate
  `isVisible()` check races and returns false:
  ```js
  const welcome = page.locator('.welcome-modal');
  if (await welcome.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false)) {
    await welcome.locator('button').last().click();
    await welcome.waitFor({ state: 'hidden' });
  }
  ```
- **The rest overlay** (`.rest-timer-overlay`) covers the set buttons after
  every completed set, exactly as it does for a real user. To tick another set
  you must tap the overlay to minimise it first. Any script that clicks two
  sets in a row without minimising will time out.

Useful selectors: `.set-done-btn` (one per set, in order), `.rest-timer-value`,
`.rest-timer-skip-btn`, `.rest-banner-time`, `.rest-banner-skip`,
`.summary-content`.

To read what the server actually stored, call the API from inside the page so
the token comes along:

```js
await page.evaluate(async (id) => {
  const res = await fetch(`/api/workouts/${id}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  return res.json();
}, sessionId);
```

## 6. Exercising web-push

Push is skipped entirely unless `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` are set
(the route 503s and the client never subscribes). A headless browser will not
get a real push subscription, so to observe deliveries, stand up a local sink
and subscribe to it directly:

```bash
node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))"   # add to .env, restart
```

`web-push` always speaks TLS, so an `http://` sink fails with `EPROTO`. Give
the sink a self-signed cert and have the backend trust it — do not disable TLS
verification:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -keyout sink-key.pem -out sink-cert.pem \
  -days 1 -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1"
NODE_EXTRA_CA_CERTS=$PWD/sink-cert.pem node server.js
```

Then POST a subscription whose `endpoint` is `https://127.0.0.1:<port>/...`
with a `p256dh` from `crypto.createECDH('prime256v1')` and a 16-byte `auth`,
and count the requests the sink receives. Send failures are swallowed by the
route's catch, so zero deliveries means a broken harness, not a passing test —
verify the sink receives one notification in the happy path before drawing
conclusions from a zero.

## Tests

`npm test` at the repo root runs both suites: `node --test` for the backend
and vitest + jsdom for the frontend.

Route tests stub the database and serve the router on an ephemeral port.
`tests/rest-notifications.test.js` needs a real Postgres — it creates and
migrates `ironlog_test` on first run (override with `TEST_DATABASE_URL`) and
skips itself when no server is reachable. It deliberately uses a database of
its own: a dev server polling the same one claims due notifications out from
under the tests, which shows up as tests that pass alone and fail together.
