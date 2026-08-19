// Test harness: swaps ../db, ../config and web-push for stubs before a route
// module is loaded, then serves that router on an ephemeral port.
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-secret';

function stubModule(request, exports, from = path.join(__dirname, '..', 'routes', 'x.js')) {
  const resolved = require.resolve(request, { paths: [path.dirname(from)] });
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
  return resolved;
}

function uncache(...resolved) {
  for (const id of resolved) delete require.cache[id];
}

// Queue of canned db responses, plus a log of every query issued.
function fakeDb(responses = []) {
  const queue = [...responses];
  const calls = [];
  return {
    calls,
    query: async (text, params) => {
      calls.push({ text, params });
      return queue.length > 0 ? queue.shift() : { rows: [] };
    },
  };
}

function fakeWebPush() {
  const sent = [];
  return {
    sent,
    setVapidDetails: () => {},
    sendNotification: async (sub, payload) => { sent.push({ sub, payload }); },
  };
}

// Forget every already-loaded app module, so services pick up this call's
// stubs instead of holding the db that some earlier test stubbed in.
function purgeAppModules() {
  const appDir = path.join(__dirname, '..');
  for (const id of Object.keys(require.cache)) {
    if (id.startsWith(appDir) && !id.includes('node_modules') && !id.startsWith(__dirname)) {
      delete require.cache[id];
    }
  }
}

// Loads a route module against the given stubs and serves it at /.
async function serveRoute(routePath, { db, webpush, config = {}, stubs = {} }) {
  const routeFile = path.join(__dirname, '..', routePath);
  purgeAppModules();

  const ids = [
    stubModule('../db', db, routeFile),
    stubModule('../config', { JWT_SECRET, ...config }, routeFile),
  ];
  if (webpush) ids.push(stubModule('web-push', webpush, routeFile));
  for (const [request, exports] of Object.entries(stubs)) {
    ids.push(stubModule(request, exports, routeFile));
  }

  const app = express();
  app.use(express.json());
  app.use('/', require(routeFile));

  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({ id: 1, username: 'tester' }, JWT_SECRET);

  return {
    base,
    async request(method, url, body) {
      const res = await fetch(base + url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    async close() {
      await new Promise(resolve => server.close(resolve));
      uncache(...ids, require.resolve(routeFile));
    },
  };
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = { serveRoute, fakeDb, fakeWebPush, wait };
