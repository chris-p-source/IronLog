// Exercises the queue against a real Postgres, because the properties that
// matter — one notification per run of sets, surviving a restart, and two
// server processes not double-sending — are database behaviour, not JS.
// Skipped automatically when no database is reachable.
//
// Uses its own database: a dev server polling the same one would claim due
// notifications out from under the tests.
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const TEST_DB_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://ironlog:ironlog@127.0.0.1:5432/ironlog_test';
// Set before ../db loads. dotenv does not override an existing variable, so
// backend/.env cannot pull us back to the development database.
process.env.DATABASE_URL = TEST_DB_URL;

// Stub web-push before the service loads so nothing leaves the machine.
const sent = [];
const webpushPath = require.resolve('web-push', { paths: [path.join(__dirname, '..', 'services')] });
require.cache[webpushPath] = {
  id: webpushPath, filename: webpushPath, loaded: true,
  exports: {
    setVapidDetails: () => {},
    sendNotification: async (sub, payload) => { sent.push({ sub, payload }); },
  },
};

const db = require('../db');
const svc = require('../services/restNotifications');

const wait = ms => new Promise(r => setTimeout(r, ms));

// Create the test database if it isn't there yet, then bring the schema up.
async function bootstrap() {
  const name = TEST_DB_URL.slice(TEST_DB_URL.lastIndexOf('/') + 1);
  if (!/^[a-z0-9_]+$/i.test(name)) throw new Error(`unsafe test database name: ${name}`);

  const { Client } = require('pg');
  const admin = new Client({ connectionString: TEST_DB_URL.replace(/\/[^/]+$/, '/postgres') });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rows.length === 0) await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  await require('../migrate')();
}

let available = null;
async function dbReady() {
  if (available === null) {
    available = await bootstrap().then(() => true, () => false);
  }
  return available;
}

let userId;
async function reset() {
  if (!userId) {
    const u = await db.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, 'x')
       ON CONFLICT (username) DO UPDATE SET password_hash = 'x' RETURNING id`,
      [`resttest_${process.pid}`]
    );
    userId = u.rows[0].id;
  }
  sent.length = 0;
  await db.query('DELETE FROM pending_rest_notifications WHERE user_id = $1', [userId]);
  await db.query('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, subscription_json) VALUES ($1, $2, $3)`,
    [userId, 'https://push.example/device-1', JSON.stringify({ endpoint: 'https://push.example/device-1' })]
  );
  return userId;
}

const pendingRows = () => db.query('SELECT * FROM pending_rest_notifications WHERE user_id = $1', [userId])
  .then(r => r.rows);

test('a run of quickly ticked sets leaves one notification, for the last set', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  const uid = await reset();

  const t0 = Date.now();
  for (let i = 1; i <= 5; i++) {
    const ok = await svc.scheduleRest({
      userId: uid, durationSeconds: 60, exerciseName: `Set ${i}`, restStartedAt: t0 + i * 10,
    });
    assert.strictEqual(ok, true, `set ${i} should schedule`);
  }

  const rows = await pendingRows();
  assert.strictEqual(rows.length, 1, 'one queued notification, not five');
  assert.strictEqual(rows[0].exercise_name, 'Set 5');
  assert.strictEqual(Number(rows[0].rest_started_at), t0 + 50);
});

test('an out-of-order request cannot displace a newer rest', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  const uid = await reset();
  const now = Date.now();

  assert.strictEqual(await svc.scheduleRest({ userId: uid, durationSeconds: 60, exerciseName: 'Newer', restStartedAt: now }), true);
  assert.strictEqual(await svc.scheduleRest({ userId: uid, durationSeconds: 60, exerciseName: 'Older', restStartedAt: now - 500 }), false);

  const rows = await pendingRows();
  assert.strictEqual(rows[0].exercise_name, 'Newer');
});

test('cancelling removes the queued notification', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  const uid = await reset();

  await svc.scheduleRest({ userId: uid, durationSeconds: 60, exerciseName: 'Bench', restStartedAt: Date.now() });
  assert.strictEqual(await svc.cancelRest(uid), true);
  assert.deepStrictEqual(await pendingRows(), []);
  assert.strictEqual(await svc.cancelRest(uid), false, 'cancelling twice is a no-op');
});

test('nothing is delivered before the rest is over, then exactly one is', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  const uid = await reset();

  await svc.scheduleRest({ userId: uid, durationSeconds: 1, exerciseName: 'Bench', restStartedAt: Date.now() });
  assert.strictEqual(await svc.runOnce(), 0, 'not due yet');
  assert.strictEqual(sent.length, 0);

  await wait(1200);
  assert.strictEqual(await svc.runOnce(), 1);
  assert.strictEqual(sent.length, 1);
  assert.match(sent[0].payload, /Bench/);

  assert.strictEqual(await svc.runOnce(), 0, 'and it is not delivered twice');
  assert.strictEqual(sent.length, 1);
});

// The queue survives a process dying mid-rest: the row is still there, and
// whichever process is up when it comes due delivers it.
test('a notification queued before a restart is still delivered after it', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  const uid = await reset();

  await svc.scheduleRest({ userId: uid, durationSeconds: 1, exerciseName: 'Squat', restStartedAt: Date.now() });

  // Simulate the restart: drop the service from the require cache and reload it,
  // as a fresh process would. No in-memory timer carries over.
  const svcPath = require.resolve('../services/restNotifications');
  delete require.cache[svcPath];
  const restarted = require('../services/restNotifications');

  await wait(1200);
  assert.strictEqual(await restarted.runOnce(), 1, 'the restarted process picks it up');
  assert.strictEqual(sent.length, 1);
});

test('two workers racing deliver a due notification exactly once', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  const uid = await reset();

  await svc.scheduleRest({ userId: uid, durationSeconds: 1, exerciseName: 'Deadlift', restStartedAt: Date.now() });
  await wait(1200);

  // Both "processes" poll at the same moment.
  const claimed = await Promise.all([svc.runOnce(), svc.runOnce(), svc.runOnce()]);
  assert.strictEqual(claimed.reduce((a, b) => a + b, 0), 1, 'only one worker claims the row');
  assert.strictEqual(sent.length, 1, 'and only one notification goes out');
});

test('a notification long past due is dropped rather than fired late', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  const uid = await reset();

  await db.query(
    `INSERT INTO pending_rest_notifications (user_id, rest_started_at, fire_at, exercise_name)
     VALUES ($1, $2, NOW() - interval '1 hour', 'Stale')`,
    [uid, Date.now()]
  );

  assert.strictEqual(await svc.runOnce(), 1, 'the stale row is claimed');
  assert.strictEqual(sent.length, 0, 'but nothing is delivered');
  assert.deepStrictEqual(await pendingRows(), [], 'and it is cleared out');
});

test.after(async () => {
  if (await dbReady()) {
    await db.query('DELETE FROM users WHERE username = $1', [`resttest_${process.pid}`]);
  }
  await db.end().catch(() => {});
});
