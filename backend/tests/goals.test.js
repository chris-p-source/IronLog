// Goal storage and achievement detection against a real Postgres, since the
// "have I hit it" question is a SQL question. Skipped when no database is up.
const test = require('node:test');
const assert = require('node:assert');

const TEST_DB_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://ironlog:ironlog@127.0.0.1:5432/ironlog_test';
process.env.DATABASE_URL = TEST_DB_URL;

const db = require('../db');
const goals = require('../services/goals');
const points = require('../services/points');
const badges = require('../services/badges');
const gamification = require('../services/gamification');

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

// Stamping happens in syncAchievements, which describeById runs first.
const describeGoal = (goal) => goals.describeById(userId, goal.id);

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

async function setGoal(exercise, weight, reps, createdAt = new Date()) {
  const r = await db.query(
    `INSERT INTO exercise_goals (user_id, exercise_name, target_weight_kg, target_reps, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, exercise_name)
     DO UPDATE SET target_weight_kg = EXCLUDED.target_weight_kg,
                   target_reps = EXCLUDED.target_reps,
                   achieved_at = NULL,
                   created_at = EXCLUDED.created_at
     RETURNING *`,
    [userId, exercise, weight, reps, createdAt]
  );
  return r.rows[0];
}

test('a goal reports how close the current best is', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Bench Press', [[5, 80], [5, 85]], daysAgo(3));
  const goal = await setGoal('Barbell Bench Press', 100, 5);
  const view = await describeGoal(goal);

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
  const view = await describeGoal(await setGoal('Barbell Bench Press', 100, 5));

  assert.strictEqual(view.achieved_at, null, 'not achieved on an equivalent');
  assert.ok(view.current_e1rm > view.target_e1rm, 'even though the strength is there');
  assert.strictEqual(view.percent, 100, 'and the bar shows full');
});

test('a set meeting both numbers ticks the goal off', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Bench Press', [[5, 100]], daysAgo(1));
  const view = await describeGoal(await setGoal('Barbell Bench Press', 100, 5));

  assert.ok(view.achieved_at, 'achieved');
  assert.strictEqual(view.forecast.status, 'achieved', 'and no longer forecast');
});

test('exceeding the target also counts', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Bench Press', [[8, 105]], daysAgo(1));
  const view = await describeGoal(await setGoal('Barbell Bench Press', 100, 5));
  assert.ok(view.achieved_at);
});

// A goal set today about a lift you already made should read as done.
test('a goal added after the fact is stamped from the session that met it', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Bench Press', [[5, 100]], daysAgo(40));
  await logSession('Barbell Bench Press', [[5, 102.5]], daysAgo(10));

  const view = await describeGoal(await setGoal('Barbell Bench Press', 100, 5));
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
  const done = await describeGoal(await setGoal('Barbell Bench Press', 100, 5));
  assert.ok(done.achieved_at);

  const raised = await describeGoal(await setGoal('Barbell Bench Press', 110, 5));
  assert.strictEqual(raised.achieved_at, null, 'the new target has not been met');
});

test('only sets of that exercise count towards its goal', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Back Squat', [[5, 140]], daysAgo(2));
  const view = await describeGoal(await setGoal('Barbell Bench Press', 100, 5));

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

  const view = await describeGoal(await setGoal('Barbell Bench Press', 100, 5));
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

  const view = await describeGoal(await setGoal('Barbell Bench Press', 100, 5));
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

// --- XP and badges for goals ---------------------------------------------

test('a goal you set and then earn pays XP', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Bench Press', [[5, 90]], daysAgo(20));
  const before = await points.lifetimeXp(userId);

  await setGoal('Barbell Bench Press', 100, 5, daysAgo(10));
  assert.strictEqual(await points.lifetimeXp(userId), before, 'setting a goal earns nothing by itself');

  // Now go and hit it.
  await logSession('Barbell Bench Press', [[5, 100]], new Date());
  const hit = await goals.syncAchievements(userId);
  assert.strictEqual(hit.length, 1);
  assert.strictEqual(hit[0].earned, true);

  const after = await points.lifetimeXp(userId);
  assert.strictEqual(after - before, 5 + goals.XP_PER_GOAL, 'the 5 reps plus the goal bonus');
});

// The anti-farm rule: declaring a target already in your history is fine, and
// shows as achieved, but pays nothing.
test('a goal set for a lift already in your history pays no XP', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Bench Press', [[5, 100]], daysAgo(10));
  const before = await points.lifetimeXp(userId);

  const view = await describeGoal(await setGoal('Barbell Bench Press', 100, 5));
  assert.ok(view.achieved_at, 'it still reads as achieved');
  assert.strictEqual(view.earned_xp, false);
  assert.strictEqual(view.xp_awarded, 0);
  assert.strictEqual(await points.lifetimeXp(userId), before, 'and no XP was minted');
});

test('goal XP shows as its own line in the breakdown', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Bench Press', [[5, 90]], daysAgo(20));
  await setGoal('Barbell Bench Press', 100, 5, daysAgo(10));
  await logSession('Barbell Bench Press', [[5, 100]], new Date());
  await goals.syncAchievements(userId);

  const breakdown = await points.xpBreakdown(userId);
  assert.strictEqual(breakdown.goals, goals.XP_PER_GOAL);
  assert.strictEqual(breakdown.training, 10);
  assert.strictEqual(breakdown.tracking, 0);
});

test('raising the target after hitting it re-arms the goal and its XP', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Bench Press', [[5, 90]], daysAgo(40));
  await setGoal('Barbell Bench Press', 100, 5, daysAgo(30));
  await logSession('Barbell Bench Press', [[5, 100]], daysAgo(10));
  await goals.syncAchievements(userId);
  const afterFirst = await points.lifetimeXp(userId);
  assert.strictEqual(await goals.earnedGoalCount(userId), 1);

  // Raising the target must not hand back the goal already won — otherwise
  // carrying on after a win costs you XP.
  await setGoal('Barbell Bench Press', 105, 5, daysAgo(5));
  assert.strictEqual(await goals.earnedGoalCount(userId), 1, 'the won goal is still won');
  assert.strictEqual(await points.lifetimeXp(userId), afterFirst, 'and its XP is untouched');

  await logSession('Barbell Bench Press', [[5, 105]], new Date());
  await goals.syncAchievements(userId);
  assert.strictEqual(await goals.earnedGoalCount(userId), 2, 'now two goals earned');
  assert.strictEqual(await points.lifetimeXp(userId), afterFirst + 5 + goals.XP_PER_GOAL,
    'paid for the second one too');
});

test('re-earning the very same target does not pay twice', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Bench Press', [[5, 90]], daysAgo(40));
  await setGoal('Barbell Bench Press', 100, 5, daysAgo(30));
  await logSession('Barbell Bench Press', [[5, 100]], daysAgo(20));
  await goals.syncAchievements(userId);
  const once = await points.lifetimeXp(userId);

  // Set the identical target again and hit it again.
  await setGoal('Barbell Bench Press', 100, 5, daysAgo(10));
  await logSession('Barbell Bench Press', [[5, 100]], new Date());
  await goals.syncAchievements(userId);

  assert.strictEqual(await goals.earnedGoalCount(userId), 1, 'still one earned goal');
  assert.strictEqual(await points.lifetimeXp(userId), once + 5, 'only the reps were new');
});

test('goals count towards the goal badges', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  const stats0 = await gamification.collectStats(userId);
  assert.strictEqual(stats0.goals_achieved, 0);
  assert.ok(!badges.qualifyingIds(stats0).includes('goal_first'));

  await logSession('Barbell Bench Press', [[5, 90]], daysAgo(20));
  await setGoal('Barbell Bench Press', 100, 5, daysAgo(10));
  await logSession('Barbell Bench Press', [[5, 100]], new Date());
  await goals.syncAchievements(userId);

  const stats = await gamification.collectStats(userId);
  assert.strictEqual(stats.goals_achieved, 1);
  const earned = badges.qualifyingIds(stats);
  assert.ok(earned.includes('goal_first'), 'first goal badge');
  assert.ok(!earned.includes('goal_5'));
  assert.deepStrictEqual(badges.titlesFor(['goal_first']), ['Goal Getter']);
});

test('finishing the workout that hits a goal reports it in the summary', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Bench Press', [[5, 90]], daysAgo(20));
  await setGoal('Barbell Bench Press', 100, 5, daysAgo(10));

  const xpBefore = await points.lifetimeXp(userId);
  await logSession('Barbell Bench Press', [[5, 100]], new Date());
  const result = await gamification.recordWorkout(userId, xpBefore);

  assert.strictEqual(result.goalsAchieved.length, 1);
  assert.strictEqual(result.goalsAchieved[0].exercise_name, 'Barbell Bench Press');
  assert.strictEqual(result.goalsAchieved[0].earned_xp, true);
  // The bonus lands in this workout's XP rather than appearing later.
  assert.strictEqual(result.xpGained, 5 + goals.XP_PER_GOAL);
  assert.ok(result.newBadges.some(b => b.id === 'goal_first'));
});

test('syncing achievements twice does not pay twice', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logSession('Barbell Bench Press', [[5, 90]], daysAgo(20));
  await setGoal('Barbell Bench Press', 100, 5, daysAgo(10));
  await logSession('Barbell Bench Press', [[5, 100]], new Date());

  assert.strictEqual((await goals.syncAchievements(userId)).length, 1);
  assert.strictEqual((await goals.syncAchievements(userId)).length, 0, 'nothing new the second time');
  assert.strictEqual(await goals.earnedGoalCount(userId), 1);
});

test.after(async () => {
  if (await dbReady()) await db.query('DELETE FROM users WHERE username LIKE $1', [`${USERNAME}%`]);
  await db.end().catch(() => {});
});
