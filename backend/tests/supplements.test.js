// The supplement tick sheet, against a real Postgres so the upsert and the
// "usual stack" query are exercised as written.
const test = require('node:test');
const assert = require('node:assert');

const TEST_DB_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://ironlog:ironlog@127.0.0.1:5432/ironlog_test';
process.env.DATABASE_URL = TEST_DB_URL;

const db = require('../db');

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
  if (available === null) available = await bootstrap().then(() => true, () => false);
  return available;
}

const USERNAME = `supps_${process.pid}`;
let userId;

async function freshUser() {
  await db.query('DELETE FROM users WHERE username = $1', [USERNAME]);
  const u = await db.query(
    `INSERT INTO users (username, password_hash) VALUES ($1, 'x') RETURNING id`,
    [USERNAME]
  );
  userId = u.rows[0].id;
  return userId;
}

const take = (date, name, dose, unit) => db.query(
  `INSERT INTO supplement_logs (user_id, logged_date, name, dose, unit)
   VALUES ($1, $2, $3, $4, $5)
   ON CONFLICT (user_id, logged_date, name)
   DO UPDATE SET dose = EXCLUDED.dose, unit = EXCLUDED.unit
   RETURNING id, name, dose, unit`,
  [userId, date, name, dose, unit]
);

const onDate = (date) => db.query(
  'SELECT name, dose, unit FROM supplement_logs WHERE user_id = $1 AND logged_date = $2 ORDER BY created_at',
  [userId, date]
).then(r => r.rows);

test('a supplement is logged once a day, with its dose', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await take('2026-08-20', 'Creatine', 5, 'g');
  const rows = await onDate('2026-08-20');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].name, 'Creatine');
  assert.strictEqual(Number(rows[0].dose), 5);
  assert.strictEqual(rows[0].unit, 'g');
});

// Taking it again is a correction, not a second entry.
test('logging the same supplement twice in a day updates the dose', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await take('2026-08-20', 'Creatine', 5, 'g');
  await take('2026-08-20', 'Creatine', 10, 'g');

  const rows = await onDate('2026-08-20');
  assert.strictEqual(rows.length, 1, 'still one row');
  assert.strictEqual(Number(rows[0].dose), 10, 'with the corrected dose');
});

test('each day is tracked separately', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await take('2026-08-19', 'Creatine', 5, 'g');
  await take('2026-08-20', 'Creatine', 5, 'g');

  assert.strictEqual((await onDate('2026-08-19')).length, 1);
  assert.strictEqual((await onDate('2026-08-20')).length, 1);
  assert.strictEqual((await onDate('2026-08-18')).length, 0, 'a day it was skipped');
});

test('a dose is optional, for things you just tick off', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await take('2026-08-20', 'Multivitamin', null, null);
  const rows = await onDate('2026-08-20');
  assert.strictEqual(rows[0].dose, null);
  assert.strictEqual(rows[0].unit, null);
});

// The diary offers one-tap chips from what you actually take.
test('the usual stack lists each supplement once, most recent first', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await take('2026-08-01', 'Creatine', 5, 'g');
  await take('2026-08-02', 'Creatine', 7, 'g');      // dose changed since
  await take('2026-08-10', 'Whey Protein', 30, 'g');
  await take('2026-08-05', 'Vitamin D', 1000, 'iu');

  const stack = await db.query(
    `SELECT name, dose, unit, last_taken FROM (
       SELECT DISTINCT ON (name) name, dose, unit, logged_date AS last_taken
       FROM supplement_logs WHERE user_id = $1
       ORDER BY name, logged_date DESC, id DESC
     ) s ORDER BY last_taken DESC, name LIMIT 12`,
    [userId]
  ).then(r => r.rows);

  assert.deepStrictEqual(stack.map(s => s.name), ['Whey Protein', 'Vitamin D', 'Creatine']);
  const creatine = stack.find(s => s.name === 'Creatine');
  assert.strictEqual(Number(creatine.dose), 7, 'offers the dose last taken, not the first');
});

test('one user cannot see or delete another user\'s supplements', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();
  await take('2026-08-20', 'Creatine', 5, 'g');

  const other = await db.query(
    `INSERT INTO users (username, password_hash) VALUES ($1, 'x') RETURNING id`,
    [`${USERNAME}_other`]
  );
  const otherId = other.rows[0].id;

  const theirs = await db.query(
    'SELECT id FROM supplement_logs WHERE user_id = $1 AND logged_date = $2',
    [otherId, '2026-08-20']
  );
  assert.strictEqual(theirs.rows.length, 0);

  // The delete is scoped by user_id, so it removes nothing.
  const mine = await db.query('SELECT id FROM supplement_logs WHERE user_id = $1', [userId]);
  const attempt = await db.query(
    'DELETE FROM supplement_logs WHERE id = $1 AND user_id = $2 RETURNING id',
    [mine.rows[0].id, otherId]
  );
  assert.strictEqual(attempt.rows.length, 0, 'nothing deleted');

  await db.query('DELETE FROM users WHERE id = $1', [otherId]);
});

// Supplements must not inflate the nutrition tracking that pays out XP.
test('supplements are not counted as a day of tracked eating', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();
  await take('2026-08-20', 'Creatine', 5, 'g');

  const points = require('../services/points');
  assert.strictEqual(await points.lifetimeXp(userId), 0, 'ticking creatine earns nothing');
});

test.after(async () => {
  if (await dbReady()) {
    await db.query('DELETE FROM users WHERE username LIKE $1', [`${USERNAME}%`]);
  }
  await db.end().catch(() => {});
});
