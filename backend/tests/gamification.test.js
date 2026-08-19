// Stats collection and award persistence against a real Postgres, since these
// are almost entirely SQL. Skipped when no database is reachable.
const test = require('node:test');
const assert = require('node:assert');

const TEST_DB_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://ironlog:ironlog@127.0.0.1:5432/ironlog_test';
process.env.DATABASE_URL = TEST_DB_URL;

const db = require('../db');
const gamification = require('../services/gamification');
const points = require('../services/points');
const badges = require('../services/badges');

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

const USERNAME = `gamify_${process.pid}`;
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

// Builds a completed session: exercises is [{ name, type, sets:[{reps,weight}], minutes, metrics }]
async function logWorkout({ completedAt = new Date(), exercises = [] }) {
  const session = await db.query(
    `INSERT INTO workout_sessions (user_id, template_name, started_at, completed_at)
     VALUES ($1, 'Test', $2, $2) RETURNING id`,
    [userId, completedAt]
  );
  const sessionId = session.rows[0].id;

  for (const ex of exercises) {
    const se = await db.query(
      `INSERT INTO session_exercises
         (session_id, exercise_name, exercise_type, sets_planned, reps_planned, actual_duration_minutes, cardio_metrics)
       VALUES ($1, $2, $3, $4, 0, $5, $6) RETURNING id`,
      [sessionId, ex.name, ex.type || 'strength', ex.sets?.length || 0,
       ex.minutes || null, ex.metrics ? JSON.stringify(ex.metrics) : null]
    );
    let n = 1;
    for (const set of ex.sets || []) {
      await db.query(
        `INSERT INTO session_sets (session_exercise_id, set_number, reps_completed, weight_kg, completed_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [se.rows[0].id, n++, set.reps, set.weight ?? null, completedAt]
      );
    }
  }
  return sessionId;
}

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

test('XP is reps plus double cardio minutes, matching the leaderboard', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logWorkout({ exercises: [
    { name: 'Barbell Bench Press', sets: [{ reps: 10, weight: 60 }, { reps: 8, weight: 60 }] },
    { name: 'Outdoor Running', type: 'cardio', minutes: 30 },
  ] });

  // 18 reps + 30 minutes * 2
  assert.strictEqual(await points.lifetimeXp(userId), 78);
});

test('weighing in and tracking food earn XP per day, not per entry', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  // Three weigh-ins on three days: 3 * 10.
  await db.query(
    `INSERT INTO user_bodyweights (user_id, weight_kg, logged_at)
     VALUES ($1, 82, CURRENT_DATE), ($1, 82.4, CURRENT_DATE - 1), ($1, 81.8, CURRENT_DATE - 2)`,
    [userId]
  );
  assert.strictEqual(await points.lifetimeXp(userId), 30);

  // One day of real eating: 25, regardless of how many entries make it up.
  for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
    await db.query(
      `INSERT INTO food_logs (user_id, logged_date, meal_type, food_name, calories)
       VALUES ($1, CURRENT_DATE, $2, 'Food', 400)`,
      [userId, meal]
    );
  }
  assert.strictEqual(await points.lifetimeXp(userId), 55, 'four entries on one day is one tracked day');

  const stats = await gamification.collectStats(userId);
  assert.strictEqual(stats.weigh_in_days, 3);
  assert.strictEqual(stats.nutrition_days, 1);
});

test('a token food entry does not count as a tracked day', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  // A single small entry: neither two entries nor 500 calories.
  await db.query(
    `INSERT INTO food_logs (user_id, logged_date, meal_type, food_name, calories)
     VALUES ($1, CURRENT_DATE, 'snack', 'Apple', 90)`,
    [userId]
  );
  assert.strictEqual(await points.lifetimeXp(userId), 0);
  assert.strictEqual((await gamification.collectStats(userId)).nutrition_days, 0);

  // A second entry the same day makes it a real day.
  await db.query(
    `INSERT INTO food_logs (user_id, logged_date, meal_type, food_name, calories)
     VALUES ($1, CURRENT_DATE, 'lunch', 'Chicken and rice', 620)`,
    [userId]
  );
  assert.strictEqual(await points.lifetimeXp(userId), 25);

  // One substantial entry alone also counts.
  await db.query(
    `INSERT INTO food_logs (user_id, logged_date, meal_type, food_name, calories)
     VALUES ($1, CURRENT_DATE - 1, 'dinner', 'Big dinner', 900)`,
    [userId]
  );
  assert.strictEqual(await points.lifetimeXp(userId), 50);
});

test('tracking XP adds to training XP rather than replacing it', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logWorkout({ exercises: [
    { name: 'Barbell Bench Press', sets: [{ reps: 10, weight: 60 }] },
    { name: 'Outdoor Running', type: 'cardio', minutes: 30 },
  ] });
  await db.query('INSERT INTO user_bodyweights (user_id, weight_kg, logged_at) VALUES ($1, 82, CURRENT_DATE)', [userId]);

  // 10 reps + 60 cardio + 10 weigh-in
  assert.strictEqual(await points.lifetimeXp(userId), 80);
});

test('tracking badges are earned from the days that earned XP', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  for (let day = 0; day < 30; day++) {
    await db.query(
      'INSERT INTO user_bodyweights (user_id, weight_kg, logged_at) VALUES ($1, 82, CURRENT_DATE - $2::int)',
      [userId, day]
    );
  }

  const stats = await gamification.collectStats(userId);
  assert.strictEqual(stats.weigh_in_days, 30);
  assert.ok(badges.qualifyingIds(stats).includes('weigh_ins_30'));
  assert.strictEqual(await points.lifetimeXp(userId), 300);
});

test('an unfinished workout counts for nothing', async (t) => {
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
     VALUES ($1, 1, 10, 100)`,
    [se.rows[0].id]
  );

  assert.strictEqual(await points.lifetimeXp(userId), 0);
  const stats = await gamification.collectStats(userId);
  assert.strictEqual(stats.workouts_total, 0);
  assert.strictEqual(stats.tonnage_kg, 0);
});

test('tonnage, PRs and variety are counted from logged sets', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logWorkout({ completedAt: daysAgo(14), exercises: [
    { name: 'Barbell Bench Press', sets: [{ reps: 5, weight: 100 }] },
  ] });
  await logWorkout({ completedAt: daysAgo(7), exercises: [
    { name: 'Barbell Bench Press', sets: [{ reps: 5, weight: 90 }, { reps: 5, weight: 110 }] },
    { name: 'Barbell Deadlift', sets: [{ reps: 5, weight: 150 }] },
  ] });

  const stats = await gamification.collectStats(userId);
  // 500 + 450 + 550 + 750
  assert.strictEqual(stats.tonnage_kg, 2250);
  assert.strictEqual(stats.distinct_exercises, 2);
  // Bench 100 (first), bench 110 (beats 100), deadlift 150 (first). The 90 is not a PR.
  assert.strictEqual(stats.pr_count, 3);
  assert.strictEqual(stats.workouts_total, 2);
  assert.strictEqual(stats.weeks_trained, 2);
});

test('relative strength is measured against the latest bodyweight', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await db.query(
    `INSERT INTO user_bodyweights (user_id, weight_kg, logged_at) VALUES ($1, 100, $2), ($1, 80, $3)`,
    [userId, daysAgo(30), daysAgo(1)]
  );
  await logWorkout({ exercises: [
    { name: 'Barbell Bench Press', sets: [{ reps: 3, weight: 80 }] },
    { name: 'Barbell Back Squat', sets: [{ reps: 3, weight: 160 }] },
    { name: 'Barbell Deadlift', sets: [{ reps: 1, weight: 200 }] },
  ] });

  const stats = await gamification.collectStats(userId);
  assert.strictEqual(stats.bodyweight, 80, 'uses the most recent weigh-in, not the first');
  assert.strictEqual(stats.bench_ratio, 1);
  assert.strictEqual(stats.squat_ratio, 2);
  assert.strictEqual(stats.deadlift_ratio, 2.5);

  const earned = badges.qualifyingIds(stats);
  assert.ok(earned.includes('bw_bench'));
  assert.ok(earned.includes('double_bw_squat'));
  assert.ok(earned.includes('deadlift_two_half'));
});

// The clubs are the badges people will argue about, so what counts as a bench,
// a squat and a deadlift has to be exact.
test('accessory and dumbbell variants do not count towards the clubs', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logWorkout({ exercises: [
    // 60kg a hand is not a 120kg bench.
    { name: 'Dumbbell Bench Press', sets: [{ reps: 5, weight: 120 }] },
    { name: 'Incline Barbell Bench Press', sets: [{ reps: 5, weight: 110 }] },
    { name: 'Close-Grip Bench Press', sets: [{ reps: 5, weight: 105 }] },
    // A hack squat machine is not a squat, nor is a split squat.
    { name: 'Hack Squat', sets: [{ reps: 5, weight: 200 }] },
    { name: 'Bulgarian Split Squat', sets: [{ reps: 5, weight: 190 }] },
    { name: 'Front Squat', sets: [{ reps: 5, weight: 150 }] },
    // Romanian and stiff-leg deadlifts are a different lift.
    { name: 'Romanian Deadlift', sets: [{ reps: 5, weight: 220 }] },
    { name: 'Stiff-Leg Deadlift', sets: [{ reps: 5, weight: 210 }] },
    { name: 'Trap Bar Deadlift', sets: [{ reps: 5, weight: 230 }] },
  ] });

  const stats = await gamification.collectStats(userId);
  assert.strictEqual(stats.bench_kg, 0, 'no competition bench logged');
  assert.strictEqual(stats.squat_kg, 0, 'no competition squat logged');
  assert.strictEqual(stats.deadlift_kg, 0, 'no competition deadlift logged');
  assert.strictEqual(stats.powerlifting_total_kg, 0);

  const earned = badges.qualifyingIds(stats);
  assert.ok(!earned.some(id => id.startsWith('bench_')), 'no bench club');
  assert.ok(!earned.some(id => id.startsWith('squat_')), 'no squat club');
  assert.ok(!earned.some(id => id.startsWith('deadlift_')), 'no deadlift club');
  assert.ok(!earned.some(id => id.startsWith('total_')), 'no total club');
});

test('the real lifts earn the plate clubs and the pound total', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logWorkout({ exercises: [
    { name: 'Barbell Bench Press', sets: [{ reps: 5, weight: 90 }, { reps: 1, weight: 100 }] },
    { name: 'Barbell Back Squat', sets: [{ reps: 1, weight: 180 }] },
    { name: 'Sumo Deadlift', sets: [{ reps: 1, weight: 200 }] },
  ] });

  const stats = await gamification.collectStats(userId);
  assert.strictEqual(stats.bench_kg, 100, 'heaviest bench, not the last one');
  assert.strictEqual(stats.squat_kg, 180);
  assert.strictEqual(stats.deadlift_kg, 200, 'sumo counts');
  assert.strictEqual(stats.powerlifting_total_kg, 480);

  const earned = badges.qualifyingIds(stats);
  assert.ok(earned.includes('bench_2_plate'), 'two plate club');
  assert.ok(!earned.includes('bench_3_plate'));
  assert.ok(earned.includes('squat_4_plate'), 'four plate squat');
  assert.ok(earned.includes('deadlift_4_plate'));
  assert.ok(!earned.includes('deadlift_5_plate'));
  assert.ok(earned.includes('total_1000'), '480kg clears the 1000lb total');
  assert.ok(!earned.includes('total_1200'));
});

test('a total needs all three lifts on record', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  // A huge squat and deadlift, but no bench logged at all.
  await logWorkout({ exercises: [
    { name: 'Barbell Back Squat', sets: [{ reps: 1, weight: 250 }] },
    { name: 'Barbell Deadlift', sets: [{ reps: 1, weight: 300 }] },
  ] });

  const stats = await gamification.collectStats(userId);
  assert.strictEqual(stats.powerlifting_total_kg, 0, 'not a total until all three exist');
  assert.ok(!badges.qualifyingIds(stats).includes('total_1000'));
});

test('no bodyweight logged means no relative strength badges, not a crash', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();
  await logWorkout({ exercises: [{ name: 'Barbell Bench Press', sets: [{ reps: 1, weight: 200 }] }] });

  const stats = await gamification.collectStats(userId);
  assert.strictEqual(stats.bodyweight, 0);
  assert.strictEqual(stats.bench_ratio, 0);
  assert.ok(!badges.qualifyingIds(stats).includes('bw_bench'));
});

test('cardio distance survives the free-text metrics people actually type', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  await logWorkout({ exercises: [
    { name: 'Outdoor Running', type: 'cardio', minutes: 65, metrics: { distance_km: '12.5', avg_pace: '5:30' } },
    { name: 'Rowing Machine', type: 'cardio', minutes: 20, metrics: { distance_m: '5000', split_500m: '2:00' } },
    { name: 'Cycling (Stationary Bike)', type: 'cardio', minutes: 15, metrics: { distance_km: '', avg_speed: 'fast' } },
  ] });

  const stats = await gamification.collectStats(userId);
  assert.strictEqual(stats.cardio_distance_km, 17.5, '12.5km + 5000m, ignoring the unparseable ones');
  assert.strictEqual(stats.cardio_best_session_km, 12.5);
  assert.strictEqual(stats.cardio_best_session_minutes, 65);
  assert.ok(badges.qualifyingIds(stats).includes('cardio_hour'));
  assert.ok(badges.qualifyingIds(stats).includes('cardio_10k'));
});

test('full coverage needs every major group inside one week', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  // Chest, Back, Shoulders, Legs, Arms — but no Core.
  await logWorkout({ completedAt: daysAgo(2), exercises: [
    { name: 'Barbell Bench Press', sets: [{ reps: 5, weight: 60 }] },
    { name: 'Barbell Bent-Over Row', sets: [{ reps: 5, weight: 60 }] },
    { name: 'Barbell Overhead Press', sets: [{ reps: 5, weight: 40 }] },
    { name: 'Barbell Back Squat', sets: [{ reps: 5, weight: 80 }] },
    { name: 'Barbell Curl', sets: [{ reps: 10, weight: 20 }] },
  ] });
  assert.strictEqual((await gamification.collectStats(userId)).full_coverage_weeks, 0);

  // Same week, now with core.
  await logWorkout({ completedAt: daysAgo(1), exercises: [
    { name: 'Plank', sets: [{ reps: 1, weight: null }] },
  ] });
  assert.strictEqual((await gamification.collectStats(userId)).full_coverage_weeks, 1);
});

test('training twice in a week is what counts towards the habit badge', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  // Two sessions in one week, one in another.
  await logWorkout({ completedAt: daysAgo(1), exercises: [] });
  await logWorkout({ completedAt: daysAgo(2), exercises: [] });
  await logWorkout({ completedAt: daysAgo(20), exercises: [] });

  const stats = await gamification.collectStats(userId);
  assert.strictEqual(stats.weeks_with_two_plus, 1);
  assert.strictEqual(stats.weeks_trained, 2);
});

// This is what saves us needing a backfill migration for existing users.
test('a lifter with history earns their badges on first read', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  for (let i = 1; i <= 12; i++) {
    await logWorkout({ completedAt: daysAgo(i * 3), exercises: [
      { name: 'Barbell Bench Press', sets: [{ reps: 10, weight: 80 }] },
    ] });
  }

  assert.deepStrictEqual(await gamification.earnedIds(userId), [], 'nothing awarded yet');

  const profile = await gamification.getProfile(userId);
  const earned = profile.badges.filter(b => b.earned).map(b => b.id);
  assert.ok(earned.includes('first_workout'));
  assert.ok(earned.includes('ten_workouts'));
  assert.strictEqual(profile.earnedCount, earned.length);

  // Stamped in the database, not just computed for the response.
  const stored = await gamification.earnedIds(userId);
  assert.ok(stored.includes('ten_workouts'));
});

test('syncing awards twice does not duplicate them', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();
  await logWorkout({ exercises: [{ name: 'Barbell Bench Press', sets: [{ reps: 5, weight: 60 }] }] });

  const stats = await gamification.collectStats(userId);
  const first = await gamification.syncAwards(userId, stats);
  const second = await gamification.syncAwards(userId, stats);

  assert.ok(first.length > 0, 'first sync awards something');
  assert.deepStrictEqual(second, [], 'second sync awards nothing new');

  const rows = await db.query('SELECT badge_id, COUNT(*) FROM user_awards WHERE user_id = $1 GROUP BY badge_id', [userId]);
  assert.ok(rows.rows.every(r => Number(r.count) === 1), 'one row per badge');
});

test('finishing a workout reports XP gained, a level up and new badges', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();

  const xpBefore = await points.lifetimeXp(userId);
  await logWorkout({ exercises: [
    { name: 'Barbell Bench Press', sets: [{ reps: 100, weight: 60 }, { reps: 100, weight: 60 }] },
    { name: 'Outdoor Running', type: 'cardio', minutes: 200 },
  ] });

  const result = await gamification.recordWorkout(userId, xpBefore);
  assert.strictEqual(result.xpGained, 600, '200 reps + 200 cardio minutes doubled');
  assert.strictEqual(result.leveledUp, true);
  assert.strictEqual(result.previousLevel, 1);
  assert.strictEqual(result.level, 2);
  assert.ok(result.newBadges.some(b => b.id === 'first_workout'));
});

test('a title can only be displayed while its badge is held', async (t) => {
  if (!await dbReady()) return t.skip('no database available');
  await freshUser();
  await logWorkout({ exercises: [{ name: 'Barbell Bench Press', sets: [{ reps: 5, weight: 60 }] }] });

  // Equip a title the user has not earned.
  await db.query('UPDATE users SET equipped_title = $1 WHERE id = $2', ['Century Club', userId]);
  const profile = await gamification.getProfile(userId);
  assert.strictEqual(profile.equippedTitle, null, 'an unearned title is not displayed');
});

test.after(async () => {
  if (await dbReady()) await db.query('DELETE FROM users WHERE username = $1', [USERNAME]);
  await db.end().catch(() => {});
});
