const db = require('../db');
const levels = require('./levels');
const badges = require('./badges');
const points = require('./points');
const lifts = require('./liftPatterns');
const { STRENGTH_EXERCISES } = require('../data/exercises');

// Exercise catalogue groups are finer than the muscle groups "Full Coverage"
// asks for — arms and legs each count once, so the badge rewards a balanced
// week rather than one particular split.
const GROUP_TO_COVERAGE = {
  Chest: 'Chest',
  Back: 'Back',
  Traps: 'Back',
  Shoulders: 'Shoulders',
  Quads: 'Legs',
  'Hamstrings & Glutes': 'Legs',
  Calves: 'Legs',
  Biceps: 'Arms',
  Triceps: 'Arms',
  Core: 'Core',
};

const COVERAGE_BY_EXERCISE = new Map(
  STRENGTH_EXERCISES
    .map(ex => [ex.name, GROUP_TO_COVERAGE[ex.group]])
    .filter(([, coverage]) => coverage)
);

// Numbers arrive from pg as strings; everything missing counts as zero.
const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Postgres will not cast a free-text metric like "5:30" or "" to numeric, so
// only well-formed numbers are summed.
const NUMERIC = (expr) => `CASE WHEN ${expr} ~ '^[0-9]+(\\.[0-9]+)?$' THEN (${expr})::numeric ELSE 0 END`;

async function collectStats(userId) {
  const [
    sessions, tonnage, relative, prs, cardio, variety, coverage, social, nutrition,
  ] = await Promise.all([
    db.query(
      `SELECT
         COUNT(*) AS workouts_total,
         COUNT(DISTINCT DATE_TRUNC('week', completed_at)) AS weeks_trained,
         COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM completed_at) < 6) AS early_workouts,
         COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM completed_at) >= 22) AS late_workouts
       FROM workout_sessions WHERE user_id = $1 AND completed_at IS NOT NULL`,
      [userId]
    ),
    db.query(
      `SELECT COALESCE(SUM(ss.weight_kg * ss.reps_completed), 0) AS tonnage_kg
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ws.user_id = $1 AND ws.completed_at IS NOT NULL AND ss.weight_kg > 0`,
      [userId]
    ),
    // Heaviest competition lift of each kind, plus the most recent bodyweight.
    // The patterns exclude dumbbell, machine and accessory variants — a 60 kg
    // dumbbell bench is 60 kg a hand, and a hack squat is not a squat.
    db.query(
      `WITH bw AS (
         SELECT weight_kg FROM user_bodyweights
         WHERE user_id = $1 AND weight_kg > 0
         ORDER BY logged_at DESC LIMIT 1
       ),
       best AS (
         SELECT
           MAX(ss.weight_kg) FILTER (WHERE ${lifts.BENCH('se.exercise_name')}) AS bench,
           MAX(ss.weight_kg) FILTER (WHERE ${lifts.SQUAT('se.exercise_name')}) AS squat,
           MAX(ss.weight_kg) FILTER (WHERE ${lifts.DEADLIFT('se.exercise_name')}) AS deadlift
         FROM session_sets ss
         JOIN session_exercises se ON se.id = ss.session_exercise_id
         JOIN workout_sessions ws ON ws.id = se.session_id
         WHERE ws.user_id = $1 AND ws.completed_at IS NOT NULL AND ss.weight_kg > 0
       )
       SELECT
         (SELECT weight_kg FROM bw) AS bodyweight,
         best.bench, best.squat, best.deadlift
       FROM best`,
      [userId]
    ),
    // A PR is a set heavier than everything logged for that exercise before it.
    db.query(
      `WITH ordered AS (
         SELECT se.exercise_name, ss.weight_kg,
           MAX(ss.weight_kg) OVER (
             PARTITION BY se.exercise_name
             ORDER BY ws.completed_at, ss.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ) AS previous_best
         FROM session_sets ss
         JOIN session_exercises se ON se.id = ss.session_exercise_id
         JOIN workout_sessions ws ON ws.id = se.session_id
         WHERE ws.user_id = $1 AND ws.completed_at IS NOT NULL AND ss.weight_kg > 0
       )
       SELECT COUNT(*) AS pr_count FROM ordered
       WHERE previous_best IS NULL OR weight_kg > previous_best`,
      [userId]
    ),
    db.query(
      `SELECT
         COALESCE(SUM(${NUMERIC("se.cardio_metrics->>'distance_km'")}), 0)
           + COALESCE(SUM(${NUMERIC("se.cardio_metrics->>'distance_m'")}), 0) / 1000 AS distance_km,
         COALESCE(MAX(${NUMERIC("se.cardio_metrics->>'distance_km'")}), 0) AS best_km,
         COALESCE(MAX(se.actual_duration_minutes), 0) AS best_minutes
       FROM session_exercises se
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ws.user_id = $1 AND ws.completed_at IS NOT NULL AND se.exercise_type = 'cardio'`,
      [userId]
    ),
    db.query(
      `SELECT COUNT(DISTINCT se.exercise_name) AS distinct_exercises
       FROM session_exercises se
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ws.user_id = $1 AND ws.completed_at IS NOT NULL`,
      [userId]
    ),
    // Which exercises appeared in which week — grouped into muscle groups below,
    // since the catalogue lives in JS.
    db.query(
      `SELECT DISTINCT DATE_TRUNC('week', ws.completed_at) AS wk, se.exercise_name
       FROM session_exercises se
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ws.user_id = $1 AND ws.completed_at IS NOT NULL AND se.exercise_type = 'strength'`,
      [userId]
    ),
    db.query('SELECT COUNT(*) AS followers FROM followers WHERE following_id = $1', [userId]),
    // The same definitions XP pays out on, so a badge counts the days that
    // actually earned something.
    db.query(
      `SELECT ${points.NUTRITION_DAYS('$1')} AS nutrition_days,
              ${points.WEIGH_IN_DAYS('$1')} AS weigh_in_days`,
      [userId]
    ),
  ]);

  const goldMedals = await points.getGoldMedals(userId);

  const weeks = new Map();
  for (const row of coverage.rows) {
    const group = COVERAGE_BY_EXERCISE.get(row.exercise_name);
    if (!group) continue;
    const key = String(row.wk);
    if (!weeks.has(key)) weeks.set(key, new Set());
    weeks.get(key).add(group);
  }
  const fullCoverageWeeks = [...weeks.values()]
    .filter(groups => badges.COVERAGE_GROUPS.every(g => groups.has(g)))
    .length;

  const bodyweight = num(relative.rows[0]?.bodyweight);
  const ratio = (lift) => (bodyweight > 0 ? num(lift) / bodyweight : 0);
  const bench = num(relative.rows[0]?.bench);
  const squat = num(relative.rows[0]?.squat);
  const deadlift = num(relative.rows[0]?.deadlift);

  return {
    workouts_total: num(sessions.rows[0].workouts_total),
    weeks_trained: num(sessions.rows[0].weeks_trained),
    weeks_with_two_plus: await weeksWithTwoPlus(userId),
    early_workouts: num(sessions.rows[0].early_workouts),
    late_workouts: num(sessions.rows[0].late_workouts),
    tonnage_kg: num(tonnage.rows[0].tonnage_kg),
    bodyweight,
    bench_kg: bench,
    squat_kg: squat,
    deadlift_kg: deadlift,
    // The powerlifting total only means anything once all three are on record.
    powerlifting_total_kg: (bench > 0 && squat > 0 && deadlift > 0) ? bench + squat + deadlift : 0,
    bench_ratio: ratio(relative.rows[0]?.bench),
    squat_ratio: ratio(relative.rows[0]?.squat),
    deadlift_ratio: ratio(relative.rows[0]?.deadlift),
    pr_count: num(prs.rows[0].pr_count),
    cardio_distance_km: num(cardio.rows[0].distance_km),
    cardio_best_session_km: num(cardio.rows[0].best_km),
    cardio_best_session_minutes: num(cardio.rows[0].best_minutes),
    distinct_exercises: num(variety.rows[0].distinct_exercises),
    full_coverage_weeks: fullCoverageWeeks,
    gold_medals: goldMedals,
    followers: num(social.rows[0].followers),
    nutrition_days: num(nutrition.rows[0].nutrition_days),
    weigh_in_days: num(nutrition.rows[0].weigh_in_days),
  };
}

async function weeksWithTwoPlus(userId) {
  const result = await db.query(
    `SELECT COUNT(*) AS weeks FROM (
       SELECT DATE_TRUNC('week', completed_at)
       FROM workout_sessions
       WHERE user_id = $1 AND completed_at IS NOT NULL
       GROUP BY DATE_TRUNC('week', completed_at)
       HAVING COUNT(*) >= 2
     ) w`,
    [userId]
  );
  return num(result.rows[0].weeks);
}

// The title a user is displaying, with its rarity — null unless they still
// hold the badge that granted it.
async function equippedTitle(userId) {
  const row = await db.query('SELECT equipped_title FROM users WHERE id = $1', [userId]);
  const title = row.rows[0]?.equipped_title;
  if (!title) return null;

  const badge = badges.BADGES.find(b => b.title === title);
  if (!badge) return null;

  const held = await db.query(
    'SELECT 1 FROM user_awards WHERE user_id = $1 AND badge_id = $2',
    [userId, badge.id]
  );
  return held.rows.length > 0 ? { title, rarity: badges.rarityOf(title) } : null;
}

async function earnedIds(userId) {
  const result = await db.query('SELECT badge_id FROM user_awards WHERE user_id = $1', [userId]);
  return result.rows.map(r => r.badge_id);
}

// Stamps anything newly qualified for and returns just those, so a caller can
// celebrate them. Idempotent, which is what makes existing users backfill on
// their first read rather than needing a migration script.
async function syncAwards(userId, stats) {
  const qualifying = badges.qualifyingIds(stats);
  if (qualifying.length === 0) return [];

  const result = await db.query(
    `INSERT INTO user_awards (user_id, badge_id)
     SELECT $1, UNNEST($2::text[])
     ON CONFLICT (user_id, badge_id) DO NOTHING
     RETURNING badge_id`,
    [userId, qualifying]
  );
  return result.rows.map(r => badges.BADGES_BY_ID.get(r.badge_id)).filter(Boolean);
}

// Everything the profile and achievements screens need.
async function getProfile(userId) {
  const [xp, stats, breakdown] = await Promise.all([
    points.lifetimeXp(userId), collectStats(userId), points.xpBreakdown(userId),
  ]);
  const newlyEarned = await syncAwards(userId, stats);
  const earned = await earnedIds(userId);

  const user = await db.query('SELECT equipped_title FROM users WHERE id = $1', [userId]);
  const availableTitles = badges.titlesFor(earned);
  const equipped = user.rows[0]?.equipped_title;
  const evaluated = badges.evaluate(stats, earned);

  // Every title, not only the ones already held, so the page can show what is
  // still out there and what earns it. Earned first, then closest.
  const titles = evaluated
    .filter(b => b.title)
    .map(b => ({
      title: b.title,
      rarity: badges.rarityOf(b.title),
      earned: b.earned,
      requirement: b.description,
      percent: b.percent,
      value: b.value,
      threshold: b.threshold,
      unit: b.unit || null,
    }))
    .sort((a, b) => (b.earned - a.earned)
      || (a.earned
        ? badges.RARITY_ORDER.indexOf(a.rarity) - badges.RARITY_ORDER.indexOf(b.rarity)
        : b.percent - a.percent));

  return {
    ...levels.levelProgress(xp),
    breakdown,
    badges: evaluated,
    earnedCount: earned.length,
    totalBadges: badges.BADGES.length,
    newlyEarned,
    stats,
    availableTitles,
    titles,
    earnedTitleCount: titles.filter(t => t.earned).length,
    totalTitles: titles.length,
    // A title stays displayed only while its badge is still held.
    equippedTitle: availableTitles.includes(equipped) ? equipped : null,
    equippedRarity: availableTitles.includes(equipped) ? badges.rarityOf(equipped) : null,
  };
}

// Called when a workout is saved: what changed, for the summary screen.
async function recordWorkout(userId, xpBefore) {
  const [xp, stats] = await Promise.all([points.lifetimeXp(userId), collectStats(userId)]);
  const newBadges = await syncAwards(userId, stats);
  const before = levels.levelProgress(xpBefore);
  const after = levels.levelProgress(xp);

  return {
    ...after,
    xpGained: xp - before.xp,
    leveledUp: after.level > before.level,
    previousLevel: before.level,
    newBadges: newBadges.map(b => ({ id: b.id, name: b.name, description: b.description, tier: b.tier })),
  };
}

module.exports = { collectStats, syncAwards, getProfile, recordWorkout, earnedIds, equippedTitle, COVERAGE_BY_EXERCISE };
