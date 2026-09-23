// Goal storage and achievement detection against a real Postgres, since the
// "have I hit it" question is a SQL question. Skipped when no database is up.
const test = require('node:test');
const assert = require('node:assert');

const TEST_DB_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://ironlog:ironlog@127.0.0.1:5432/ironlog_test';
process.env.DATABASE_URL = TEST_DB_URL;

const db = require('../db');
const goals = require('../routes/goals');

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

const USERNAME = `goals_${process.pid}`;
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

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// One completed session of one exercise: sets is [[reps, weight], ...]
async function logSession(exercise, sets, when = new Date()) {
  const session = await db.query(
    `INSERT INTO workout_sessions (user_id, template_name, started_at, completed_at)
     VALUES ($1, 'Test', $2, $2) RETURNING id`,
    [userId, when]
  );
  const se = await db.query(
    `INSERT INTO session_exercises (session_id, exercise_name, exercise_type, sets_planned, reps_planned)
     VALUES ($1, $2, 'strength', $3, 0) RETURNING id`,
    [session.rows[0].id, exercise, sets.length]
  );
  let n = 1;
  for (const [reps, weight] of sets) {
    await db.query(
      `INSERT INTO session_sets (session_exercise_id, set_number, reps_completed, weight_kg, completed_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [se.rows[0].id, n++, reps, weight, when]
    );
  }
}

async function setGoal(exercise, weight, reps) {
  const r = await db.query(
    `INSERT INTO exercise_goals (user_id, exercise_name, target_weight_kg, target_reps)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, exercise_name)
     DO UPDATE SET target_weight_kg = EXCLUDED.target_weight_kg,
                   target_reps = EXCLUDED.target_reps, achieved_at = NULL
     RETURNING *`,
    [userId, exercise, weight, reps]
  );
  return r.rows[0];
}

test('a goal reports how close the current best is', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Bench Press', [[5, 80], [5, 85]], daysAgo(3));
  const goal = await setGoal('Barbell Bench Press', 100, 5);
  const view = await goals.describe(userId, goal);

  assert.strictEqual(view.target_weight_kg, 100);
  assert.strictEqual(view.target_reps, 5);
  assert.strictEqual(view.current_best_weight_kg, 85);
  // 85 x 5 is an e1RM of 99.2 against a target of 116.7
  assert.strictEqual(view.current_e1rm, 99.2);
  assert.strictEqual(view.target_e1rm, 116.7);
  assert.strictEqual(view.percent, 85);
  assert.strictEqual(view.achieved_at, null);
});

// The goal is the actual set, not an equivalent one.
test('an equivalent lift does not tick off the goal', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  // 110 x 2 is a higher e1RM than 100 x 5, but it is not 100 x 5.
  await logSession('Barbell Bench Press', [[2, 110]], daysAgo(2));
  const view = await goals.describe(userId, await setGoal('Barbell Bench Press', 100, 5));

  assert.strictEqual(view.achieved_at, null, 'not achieved on an equivalent');
  assert.ok(view.current_e1rm > view.target_e1rm, 'even though the strength is there');
  assert.strictEqual(view.percent, 100, 'and the bar shows full');
});

test('a set meeting both numbers ticks the goal off', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Bench Press', [[5, 100]], daysAgo(1));
  const view = await goals.describe(userId, await setGoal('Barbell Bench Press', 100, 5));

  assert.ok(view.achieved_at, 'achieved');
  assert.strictEqual(view.forecast.status, 'achieved', 'and no longer forecast');
});

test('exceeding the target also counts', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Bench Press', [[8, 105]], daysAgo(1));
  const view = await goals.describe(userId, await setGoal('Barbell Bench Press', 100, 5));
  assert.ok(view.achieved_at);
});

// A goal set today about a lift you already made should read as done.
test('a goal added after the fact is stamped from the session that met it', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Bench Press', [[5, 100]], daysAgo(40));
  await logSession('Barbell Bench Press', [[5, 102.5]], daysAgo(10));

  const view = await goals.describe(userId, await setGoal('Barbell Bench Press', 100, 5));
  assert.ok(view.achieved_at, 'achieved');
  const stampedDaysAgo = (Date.now() - new Date(view.achieved_at)) / (24 * 60 * 60 * 1000);
  assert.ok(stampedDaysAgo > 35, `stamped from the first qualifying session, not the latest (${stampedDaysAgo} days ago)`);

  // And it stays stamped on the row, not just in the response.
  const stored = await db.query('SELECT achieved_at FROM exercise_goals WHERE id = $1', [view.id]);
  assert.ok(stored.rows[0].achieved_at);
});

test('raising the target un-achieves the goal', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Bench Press', [[5, 100]], daysAgo(5));
  const done = await goals.describe(userId, await setGoal('Barbell Bench Press', 100, 5));
  assert.ok(done.achieved_at);

  const raised = await goals.describe(userId, await setGoal('Barbell Bench Press', 110, 5));
  assert.strictEqual(raised.achieved_at, null, 'the new target has not been met');
});

test('only sets of that exercise count towards its goal', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Back Squat', [[5, 140]], daysAgo(2));
  const view = await goals.describe(userId, await setGoal('Barbell Bench Press', 100, 5));

  assert.strictEqual(view.current_best_weight_kg, 0);
  assert.strictEqual(view.achieved_at, null);
  assert.strictEqual(view.forecast.status, 'not_enough_data');
});

test('an unfinished workout does not count towards a goal', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  const session = await db.query(
    `INSERT INTO workout_sessions (user_id, template_name, started_at) VALUES ($1, 'Open', NOW()) RETURNING id`,
    [userId]
  );
  const se = await db.query(
    `INSERT INTO session_exercises (session_id, exercise_name, exercise_type, sets_planned, reps_planned)
     VALUES ($1, 'Barbell Bench Press', 'strength', 1, 5) RETURNING id`,
    [session.rows[0].id]
  );
  await db.query(
    `INSERT INTO session_sets (session_exercise_id, set_number, reps_completed, weight_kg)
     VALUES ($1, 1, 5, 120)`,
    [se.rows[0].id]
  );

  const view = await goals.describe(userId, await setGoal('Barbell Bench Press', 100, 5));
  assert.strictEqual(view.achieved_at, null, 'a session still in progress proves nothing');
  assert.strictEqual(view.current_best_weight_kg, 0);
});

test('a real history produces a forecast with a date', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  // Twelve weeks of steady progress, 1 kg a week.
  for (let week = 12; week >= 0; week--) {
    await logSession('Barbell Bench Press', [[5, 80 + (12 - week)]], daysAgo(week * 7));
  }

  const view = await goals.describe(userId, await setGoal('Barbell Bench Press', 100, 5));
  assert.strictEqual(view.forecast.status, 'ready');
  assert.ok(view.forecast.ratePerWeek > 0.8 && view.forecast.ratePerWeek < 1.3,
    `rate was ${view.forecast.ratePerWeek} kg/week`);
  assert.ok(view.forecast.projectedDate, 'a date is given');
  assert.ok(new Date(view.forecast.projectedDate) > new Date(), 'in the future');
});

test('one user cannot see another user\'s goals', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();
  await setGoal('Barbell Bench Press', 100, 5);

  const other = await db.query(
    `INSERT INTO users (username, password_hash) VALUES ($1, 'x') RETURNING id`,
    [`${USERNAME}_other`]
  );
  const theirs = await db.query('SELECT id FROM exercise_goals WHERE user_id = $1', [other.rows[0].id]);
  assert.strictEqual(theirs.rows.length, 0);

  await db.query('DELETE FROM users WHERE id = $1', [other.rows[0].id]);
});

test.after(async () => {
  if (await dbReady()) await db.query('DELETE FROM users WHERE username LIKE $1', [`${USERNAME}%`]);
  await db.end().catch(() => {});
});
